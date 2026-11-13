import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

export const GROQ_RESPONSES_UNSUPPORTED_FIELDS = Object.freeze([
  "include",
  "previous_response_id",
  "store",
  "prompt",
  "prompt_cache_key",
  "safety_identifier",
  "truncation",
]);

/** Remove request fields Groq documents as unsupported by its Responses API. */
export function adaptGroqResponsesBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new TypeError("Codex Responses request must be a JSON object.");
  const adapted = { ...body };
  for (const field of GROQ_RESPONSES_UNSUPPORTED_FIELDS) delete adapted[field];
  return adapted;
}

/**
 * Create a short-lived, loopback-only bridge for Codex's Responses API calls.
 * The Groq credential stays in this process; Codex receives only a random,
 * per-process token accepted by this local bridge.
 */
export async function startGroqResponsesProxy({
  apiKey,
  fetchImpl = fetch,
  maxRequestBytes = 32 * 1024 * 1024,
} = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim())
    throw new Error("GROQ_API_KEY is required to start the Groq Responses bridge.");
  const token = randomBytes(32).toString("hex");
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/openai/v1/responses") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end('{"error":{"message":"Not found","type":"not_found"}}');
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end('{"error":{"message":"Unauthorized","type":"authentication_error"}}');
      return;
    }

    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > maxRequestBytes) {
          response.writeHead(413, { "content-type": "application/json" });
          response.end('{"error":{"message":"Request too large","type":"invalid_request_error"}}');
          return;
        }
        chunks.push(chunk);
      }
      let payload;
      try {
        payload = adaptGroqResponsesBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        response.writeHead(400, { "content-type": "application/json" });
        response.end('{"error":{"message":"Invalid Codex JSON request","type":"invalid_request_error"}}');
        return;
      }

      const upstream = await fetchImpl("https://api.groq.com/openai/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...(request.headers.accept ? { accept: request.headers.accept } : {}),
          ...(request.headers["groq-beta"] ? { "groq-beta": request.headers["groq-beta"] } : {}),
        },
        body: JSON.stringify(payload),
      });
      const responseHeaders = {};
      for (const name of ["content-type", "cache-control", "retry-after", "x-request-id"])
        if (upstream.headers.has(name)) responseHeaders[name] = upstream.headers.get(name);
      response.writeHead(upstream.status, responseHeaders);
      if (upstream.body) {
        for await (const chunk of upstream.body) {
          if (!response.write(chunk)) await new Promise((resolve) => response.once("drain", resolve));
        }
      }
      response.end();
    } catch {
      if (!response.headersSent) {
        response.writeHead(502, { "content-type": "application/json" });
        response.end('{"error":{"message":"Groq request failed","type":"upstream_error"}}');
      } else response.destroy();
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}/openai/v1`,
    token,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
