import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

export const GROQ_RESPONSES_UNSUPPORTED_FIELDS = Object.freeze([
  "client_metadata",
  "include",
  "previous_response_id",
  "prompt_cache_options",
  "store",
  "stream_options",
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
  // Codex sends verbosity controls that Groq's Responses request schema omits.
  if (adapted.text && typeof adapted.text === "object" && !Array.isArray(adapted.text)) {
    adapted.text = { ...adapted.text };
    delete adapted.text.verbosity;
    if (!Object.keys(adapted.text).length) delete adapted.text;
  }
  if (adapted.reasoning && typeof adapted.reasoning === "object" && !Array.isArray(adapted.reasoning)) {
    adapted.reasoning = { ...adapted.reasoning };
    delete adapted.reasoning.summary;
    if (!Object.keys(adapted.reasoning).length) delete adapted.reasoning;
  }
  // Groq's Responses API accepts function tools only. Codex also sends
  // provider-native namespace and web_search tools that Groq rejects.
  if (Array.isArray(adapted.tools)) {
    adapted.tools = adapted.tools
      .filter((tool) => tool && tool.type === "function")
      .map((tool) => Object.fromEntries(
        ["type", "name", "description", "parameters", "strict"]
          .filter((field) => Object.hasOwn(tool, field))
          .map((field) => [field, tool[field]]),
      ));
    if (!adapted.tools.length) {
      delete adapted.tools;
      delete adapted.tool_choice;
      delete adapted.parallel_tool_calls;
    }
  }
  return adapted;
}

/** Describe a rejected payload without exposing prompt, argument, or tool content. */
export function groqRequestShape(body) {
  const inputItems = Array.isArray(body?.input) ? body.input : [];
  const tools = Array.isArray(body?.tools) ? body.tools : [];
  return {
    topLevelFields: Object.keys(body || {}).sort(),
    inputKind: Array.isArray(body?.input) ? "array" : typeof body?.input,
    inputItems: inputItems.slice(0, 40).map((item) => ({
      type: typeof item?.type === "string" ? item.type : null,
      fields: Object.keys(item || {}).sort(),
      contentKinds: Array.isArray(item?.content)
        ? item.content.slice(0, 20).map((content) => ({
            type: typeof content?.type === "string" ? content.type : null,
            fields: Object.keys(content || {}).sort(),
          }))
        : [],
    })),
    textFields: Object.keys(body?.text || {}).sort(),
    textFormatFields: Object.keys(body?.text?.format || {}).sort(),
    reasoningFields: Object.keys(body?.reasoning || {}).sort(),
    toolCount: tools.length,
    tools: tools.slice(0, 40).map((tool) => ({
      type: typeof tool?.type === "string" ? tool.type : null,
      fields: Object.keys(tool || {}).sort(),
      functionFields: Object.keys(tool?.function || {}).sort(),
    })),
  };
}

/**
 * Create a short-lived, loopback-only bridge for Codex's Responses API calls.
 * The Groq credential stays in this process; Codex receives only a random,
 * per-process token accepted by this local bridge.
 */
export async function startGroqResponsesProxy({
  apiKey,
  fetchImpl = fetch,
  loggerImpl = console,
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

      // This field-only trace makes provider compatibility diagnosable even when
      // an upstream error is delivered inside an HTTP 200 streaming response.
      loggerImpl.info("[groq responses proxy] request shape", JSON.stringify(groqRequestShape(payload)));

      const upstreamRequestStartedAt = Date.now();
      let upstream;
      try {
        upstream = await fetchImpl("https://api.groq.com/openai/v1/responses", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            ...(request.headers.accept ? { accept: request.headers.accept } : {}),
            ...(request.headers["groq-beta"] ? { "groq-beta": request.headers["groq-beta"] } : {}),
          },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        loggerImpl.warn("[groq responses proxy] upstream request failed", JSON.stringify({
          durationMs: Date.now() - upstreamRequestStartedAt,
          errorName: typeof error?.name === "string" ? error.name.slice(0, 80) : null,
          errorCode: typeof error?.code === "string" ? error.code.slice(0, 80) : null,
        }));
        throw error;
      }
      const streamStartedAt = Date.now();
      let streamedBytes = 0;
      let eventData = "";
      let eventLine = "";
      let eventBuffer = "";
      const eventDecoder = new TextDecoder();
      let doneMarker = false;
      const eventCounts = Object.create(null);
      const recordEvent = () => {
        if (!eventData && !eventLine) return;
        let type = eventLine || "message";
        let errorType = null;
        try {
          const parsed = JSON.parse(eventData);
          if (typeof parsed?.type === "string") type = parsed.type;
          if (typeof parsed?.error?.type === "string") errorType = parsed.error.type;
          if (eventData === "[DONE]") doneMarker = true;
        } catch {
          if (eventData === "[DONE]") doneMarker = true;
        }
        eventCounts[type] = (eventCounts[type] || 0) + 1;
        if (errorType) eventCounts[`error:${errorType}`] = (eventCounts[`error:${errorType}`] || 0) + 1;
        eventLine = "";
        eventData = "";
      };
      const inspectSseChunk = (chunk) => {
        eventBuffer += eventDecoder.decode(chunk, { stream: true });
        let newline;
        while ((newline = eventBuffer.indexOf("\n")) >= 0) {
          const line = eventBuffer.slice(0, newline).replace(/\r$/, "");
          eventBuffer = eventBuffer.slice(newline + 1);
          if (!line) recordEvent();
          else if (line.startsWith("event:")) eventLine = line.slice(6).trim().slice(0, 100);
          else if (line.startsWith("data:")) eventData += line.slice(5).trim();
        }
      };
      if (upstream.status >= 400) {
        loggerImpl.warn("[groq responses proxy] upstream rejected request", JSON.stringify({
          status: upstream.status,
          shape: groqRequestShape(payload),
        }));
      }
      const responseHeaders = {};
      for (const name of ["content-type", "cache-control", "retry-after", "x-request-id"])
        if (upstream.headers.has(name)) responseHeaders[name] = upstream.headers.get(name);
      response.writeHead(upstream.status, responseHeaders);
      if (upstream.body) {
        try {
          for await (const chunk of upstream.body) {
            streamedBytes += chunk.length;
            inspectSseChunk(chunk);
            if (!response.write(chunk)) await new Promise((resolve) => response.once("drain", resolve));
          }
        } catch (error) {
          loggerImpl.warn("[groq responses proxy] upstream stream interrupted", JSON.stringify({
            status: upstream.status,
            durationMs: Date.now() - streamStartedAt,
            streamedBytes,
            eventCounts,
            errorName: typeof error?.name === "string" ? error.name.slice(0, 80) : null,
            errorCode: typeof error?.code === "string" ? error.code.slice(0, 80) : null,
          }));
          throw error;
        }
      }
      eventBuffer += eventDecoder.decode();
      if (eventBuffer) {
        const line = eventBuffer.replace(/\r$/, "");
        if (line.startsWith("event:")) eventLine = line.slice(6).trim().slice(0, 100);
        else if (line.startsWith("data:")) eventData += line.slice(5).trim();
      }
      if (eventBuffer || eventData || eventLine) recordEvent();
      loggerImpl.info("[groq responses proxy] upstream stream ended", JSON.stringify({
        status: upstream.status,
        contentType: upstream.headers.get("content-type") || null,
        durationMs: Date.now() - streamStartedAt,
        streamedBytes,
        eventCounts,
        doneMarker,
      }));
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
