import assert from "node:assert/strict";
import test from "node:test";
import { request as httpRequest } from "node:http";
import {
  adaptGroqResponsesBody,
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
    store: false,
    custom: "preserved",
  });
  assert.equal(request.prompt_cache_key, "thread-test");
});

test("Groq Responses bridge authenticates locally, strips fields, and streams upstream", async () => {
  let forwarded;
  const proxy = await startGroqResponsesProxy({
    apiKey: "gsk-proxy-test-key",
    fetchImpl: async (url, options) => {
      forwarded = { url, options, body: JSON.parse(options.body) };
      return new Response("data: {\"type\":\"response.completed\"}\n\n", {
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
        prompt_cache_key: "thread-test",
        include: ["reasoning.encrypted_content"],
      }),
    });
    assert.equal(response.status, 200);
    assert.match(response.text, /response\.completed/);
    assert.equal(forwarded.url, "https://api.groq.com/openai/v1/responses");
    assert.equal(forwarded.options.headers.authorization, "Bearer gsk-proxy-test-key");
    assert.deepEqual(forwarded.body, { model: "openai/gpt-oss-20b", input: "hello" });
  } finally {
    await proxy.close();
  }
});
