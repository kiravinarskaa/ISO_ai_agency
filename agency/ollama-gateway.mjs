#!/usr/bin/env node
/**
 * Bearer-authenticated loopback gateway for forwarding a protected public
 * tunnel to a local Ollama server. Ollama itself does not authenticate API
 * requests, so only this gateway should be exposed through the tunnel.
 */
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

export function createOllamaGateway({
  token = process.env.OLLAMA_GATEWAY_TOKEN,
  upstream = process.env.OLLAMA_UPSTREAM_URL || "http://127.0.0.1:11434",
  host = "127.0.0.1",
  port = Number(process.env.OLLAMA_GATEWAY_PORT || 11435),
} = {}) {
  if (typeof token !== "string" || token.length < 32)
    throw new Error("OLLAMA_GATEWAY_TOKEN must contain at least 32 characters.");
  const upstreamUrl = new URL(upstream);
  if (upstreamUrl.protocol !== "http:" || upstreamUrl.hostname !== "127.0.0.1" || upstreamUrl.pathname !== "/")
    throw new Error("OLLAMA_UPSTREAM_URL must point to the local Ollama HTTP server at 127.0.0.1.");

  const expected = Buffer.from(token);
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://gateway.local");
    if (request.method === "GET" && requestUrl.pathname === "/healthz") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      response.end("ok");
      return;
    }
    if (!requestUrl.pathname.startsWith("/v1/") && requestUrl.pathname !== "/v1") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    if (request.method !== "GET" && request.method !== "POST") {
      response.writeHead(405, { allow: "GET, POST", "content-type": "text/plain; charset=utf-8" });
      response.end("Method not allowed");
      return;
    }
    const authorization = request.headers.authorization || "";
    const supplied = authorization.startsWith("Bearer ") ? Buffer.from(authorization.slice(7)) : Buffer.alloc(0);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.writeHead(401, { "www-authenticate": "Bearer", "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      response.end("Unauthorized");
      return;
    }

    const headers = { ...request.headers, host: `${upstreamUrl.hostname}:${upstreamUrl.port || 80}` };
    delete headers.authorization;
    delete headers.connection;
    delete headers["cf-connecting-ip"];
    delete headers["x-forwarded-for"];
    const upstreamRequest = http.request({
      hostname: upstreamUrl.hostname,
      port: Number(upstreamUrl.port || 80),
      method: request.method,
      path: `${requestUrl.pathname}${requestUrl.search}`,
      headers,
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstreamRequest.on("error", () => {
      if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      response.end("Local Ollama is unavailable");
    });
    request.on("aborted", () => upstreamRequest.destroy());
    response.on("close", () => {
      if (!response.writableEnded) upstreamRequest.destroy();
    });
    request.pipe(upstreamRequest);
  });
  server.requestTimeout = 0;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = createOllamaGateway();
    const port = Number(process.env.OLLAMA_GATEWAY_PORT || 11435);
    server.listen(port, "127.0.0.1", () => {
      console.log(`Authenticated Ollama gateway listening on 127.0.0.1:${port}`);
    });
    const shutdown = () => server.close(() => process.exit(0));
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
