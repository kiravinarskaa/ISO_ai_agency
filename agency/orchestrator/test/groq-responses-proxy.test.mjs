import assert from "node:assert/strict";
import test from "node:test";
import { request as httpRequest } from "node:http";
import {
  adaptGroqResponsesBody,
  groqRequestShape,
  startGroqResponsesProxy,
} from "../groq-responses-proxy.mjs";

function postLocal(url, { headers, body }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = httpRequest(
      target,
      { method: "POST", headers: { ...headers, "content-length": Buffer.byteLength(body) } },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({
          status: response.statusCode,
          headers: response.headers,
          text: Buffer.concat(chunks).toString("utf8"),
        }));
      },
    );
    request.once("error", reject);
    request.end(body);
  });
}

test("Groq request adaptation removes documented unsupported fields only", () => {
  const request = {
    model: "openai/gpt-oss-20b",
    input: "hello",
    reasoning: { effort: "low" },
    store: false,
    include: ["reasoning.encrypted_content"],
    stream_options: { include_obfuscation: true },
    client_metadata: { thread_id: "synthetic-thread" },
    prompt_cache_options: { ttl: "1h" },
    text: { verbosity: "low", format: { type: "text" } },
    reasoning: { effort: "low", summary: "auto" },
    tools: [
      { type: "function", name: "read_file", description: "Read files", parameters: { type: "object" }, strict: true },
      { type: "namespace", name: "local_tools", tools: [{ type: "function", name: "nested" }] },
      { type: "web_search", external_web_access: true },
    ],
    previous_response_id: "resp_test",
    prompt: { id: "reusable" },
    prompt_cache_key: "thread-test",
    safety_identifier: "user-test",
    truncation: "disabled",
    custom: "preserved",
  };
  const adapted = adaptGroqResponsesBody(request);
  assert.deepEqual(adapted, {
    model: "openai/gpt-oss-20b",
    input: "hello",
    reasoning: { effort: "low" },
    text: { format: { type: "text" } },
    tools: [
      { type: "function", name: "read_file", description: "Read files", parameters: { type: "object" }, strict: true },
    ],
    custom: "preserved",
  });
  assert.equal(request.prompt_cache_key, "thread-test");
});

test("Groq Responses bridge authenticates locally, strips fields, and streams upstream", async () => {
  let forwarded;
  const logs = [];
  const proxy = await startGroqResponsesProxy({
    apiKey: "gsk-proxy-test-key",
    loggerImpl: { info: (...args) => logs.push(args.join(" ")), warn: (...args) => logs.push(args.join(" ")) },
    fetchImpl: async (url, options) => {
      forwarded = { url, options, body: JSON.parse(options.body) };
      return new Response('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"private response"}\n\nevent: response.completed\ndata: {"type":"response.completed"}\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream", "x-request-id": "req-test" },
      });
    },
  });
  try {
    const rejected = await postLocal(`${proxy.baseUrl}/responses`, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-oss-20b", input: "hello" }),
    });
    assert.equal(rejected.status, 401);

    const response = await postLocal(`${proxy.baseUrl}/responses`, {
      headers: {
        authorization: `Bearer ${proxy.token}`,
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        input: "hello",
        store: false,
        stream_options: { include_obfuscation: true },
        client_metadata: { thread_id: "synthetic-thread" },
        prompt_cache_options: { ttl: "1h" },
        text: { verbosity: "low" },
        tools: [
          { type: "function", name: "read_file", description: "Read files", parameters: { type: "object" }, strict: true },
          { type: "namespace", name: "local_tools", tools: [{ type: "function", name: "nested" }] },
          { type: "web_search", external_web_access: true },
        ],
        prompt_cache_key: "thread-test",
        include: ["reasoning.encrypted_content"],
      }),
    });
    assert.equal(response.status, 200);
    assert.match(response.text, /response\.completed/);
    assert.equal(forwarded.url, "https://api.groq.com/openai/v1/responses");
    assert.equal(forwarded.options.headers.authorization, "Bearer gsk-proxy-test-key");
    const streamLog = logs.find((entry) => entry.includes("upstream stream ended"));
    assert.ok(streamLog);
    assert.match(streamLog, /response\.output_text\.delta/);
    assert.match(streamLog, /response\.completed/);
    assert.equal(streamLog.includes("private response"), false);
    assert.deepEqual(forwarded.body, {
      model: "openai/gpt-oss-20b",
      input: "hello",
      tools: [{ type: "function", name: "read_file", description: "Read files", parameters: { type: "object" }, strict: true }],
    });
  } finally {
    await proxy.close();
  }
});

test("rejected-request diagnostics expose request shape without prompt or tool content", () => {
  const shape = groqRequestShape({
    model: "openai/gpt-oss-20b",
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "private prompt" }] }],
    tools: [{ type: "function", name: "private tool", description: "private description", parameters: { secret: true } }],
  });
  assert.deepEqual(shape.topLevelFields, ["input", "model", "tools"]);
  assert.deepEqual(shape.inputItems, [{
    type: "message",
    fields: ["content", "role", "type"],
    contentKinds: [{ type: "input_text", fields: ["text", "type"] }],
  }]);
  assert.deepEqual(shape.tools, [{ type: "function", fields: ["description", "name", "parameters", "type"], functionFields: [] }]);
  assert.equal(JSON.stringify(shape).includes("private"), false);
});

test("interrupted Groq streams log safe transport metadata only", async () => {
  const logs = [];
  const proxy = await startGroqResponsesProxy({
    apiKey: "gsk-proxy-test-key",
    loggerImpl: { info: (...args) => logs.push(args.join(" ")), warn: (...args) => logs.push(args.join(" ")) },
    fetchImpl: async () => {
      let sent = false;
      return new Response(new ReadableStream({
      pull(controller) {
        if (sent) {
          controller.error(Object.assign(new Error("private upstream detail"), { code: "ECONNRESET" }));
          return;
        }
        sent = true;
        controller.enqueue(new TextEncoder().encode('event: response.created\ndata: {"type":"response.created"}\n\n'));
      },
      }), { status: 200, headers: { "content-type": "text/event-stream" } });
    },
  });
  try {
    await assert.rejects(() => postLocal(`${proxy.baseUrl}/responses`, {
      headers: { authorization: `Bearer ${proxy.token}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-oss-20b", input: "private prompt" }),
    }));
    const diagnostic = logs.find((entry) => entry.includes("upstream stream interrupted"));
    assert.ok(diagnostic);
    assert.match(diagnostic, /ECONNRESET/);
    assert.match(diagnostic, /response\.created/);
    assert.equal(diagnostic.includes("private upstream detail"), false);
    assert.equal(diagnostic.includes("private prompt"), false);
  } finally {
    await proxy.close();
  }
});
