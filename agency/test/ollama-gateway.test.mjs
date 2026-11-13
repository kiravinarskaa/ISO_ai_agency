import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createOllamaGateway } from "../ollama-gateway.mjs";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("Ollama gateway requires bearer auth and streams authorized Responses through", async (t) => {
  const received = [];
  const upstream = http.createServer((request, response) => {
    received.push({ method: request.method, url: request.url, authorization: request.headers.authorization });
    request.resume();
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write("data: {\"type\":\"response.created\"}\n\n");
    response.end("data: [DONE]\n\n");
  });
  const upstreamPort = await listen(upstream);
  const gateway = createOllamaGateway({ token: "a-secure-test-token-with-more-than-32-chars", upstream: `http://127.0.0.1:${upstreamPort}` });
  const gatewayPort = await listen(gateway);
  t.after(async () => { await close(gateway); await close(upstream); });

  const unauthorized = await fetch(`http://127.0.0.1:${gatewayPort}/v1/responses`, { method: "POST", body: "{}" });
  assert.equal(unauthorized.status, 401);
  assert.equal(received.length, 0);

  const authorized = await fetch(`http://127.0.0.1:${gatewayPort}/v1/responses`, {
    method: "POST",
    headers: { authorization: "Bearer a-secure-test-token-with-more-than-32-chars", "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(authorized.status, 200);
  assert.match(authorized.headers.get("content-type") || "", /text\/event-stream/);
  assert.match(await authorized.text(), /response\.created[\s\S]*\[DONE\]/);
  assert.deepEqual(received, [{ method: "POST", url: "/v1/responses", authorization: undefined }]);
});

test("Ollama gateway rejects unsafe token and non-loopback upstream configuration", () => {
  assert.throws(() => createOllamaGateway({ token: "short" }), /at least 32 characters/);
  assert.throws(() => createOllamaGateway({ token: "a-secure-test-token-with-more-than-32-chars", upstream: "http://0.0.0.0:11434" }), /127\.0\.0\.1/);
});
