/**
 * Test overview: exercises OAuth configuration parsing, readonly scope,
 * metadata whitelisting, safe errors and token-refresh persistence. Fixtures
 * are synthetic; tests do not read production credentials or contact Google.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ConnectorError,
  GMAIL_READONLY_SCOPE,
  SCOPES,
  createOAuthClient,
  parseDesktopCredentials,
  parseMessageMetadata,
  readCredentials,
} from "../gmail.mjs";

const fakeDesktopCredentials = {
  installed: {
    client_id: "fake-client-id.apps.googleusercontent.com",
    client_secret: "fake-client-secret",
    redirect_uris: ["http://localhost"],
  },
};

// Test goal: OAuth config accepts Desktop installed credentials and keeps the scope read-only. Assertions below define the exact expected result.
test("OAuth config accepts Desktop installed credentials and keeps the scope read-only", () => {
  const parsed = parseDesktopCredentials(fakeDesktopCredentials);
  assert.equal(parsed.clientId, "fake-client-id.apps.googleusercontent.com");
  assert.equal(parsed.redirectUri, "http://localhost");
  assert.deepEqual([...SCOPES], [GMAIL_READONLY_SCOPE]);
});

// Test goal: OAuth config rejects web credentials and malformed JSON. Assertions below define the exact expected result.
test("OAuth config rejects web credentials and malformed JSON", () => {
  assert.throws(
    () => parseDesktopCredentials({ web: fakeDesktopCredentials.installed }),
    { code: "INVALID_CREDENTIALS" },
  );
  assert.throws(() => parseDesktopCredentials("{"), {
    code: "INVALID_CREDENTIALS",
  });
});

// Test goal: package configuration declares Google API and local OAuth libraries. Assertions below define the exact expected result.
test("package configuration declares Google API and local OAuth libraries", async () => {
  const packageJson = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.ok(packageJson.dependencies.googleapis);
  assert.ok(packageJson.dependencies["google-auth-library"]);
});

// Test goal: synthetic metadata parser returns only the five allowed display fields. Assertions below define the exact expected result.
test("synthetic metadata parser returns only the five allowed display fields", () => {
  const parsed = parseMessageMetadata({
    id: "message-1",
    threadId: "thread-1",
    internalDate: "1760000000000",
    payload: {
      headers: [
        { name: "From", value: "Northstar <client@example.test>" },
        { name: "Subject", value: "Readiness request\u001b[31m" },
      ],
    },
    snippet: "must not be returned",
    body: { data: "must not be returned" },
  });
  assert.deepEqual(Object.keys(parsed), [
    "sender",
    "subject",
    "receivedAt",
    "messageId",
    "threadId",
  ]);
  assert.equal(parsed.sender, "Northstar <client@example.test>");
  assert.equal(parsed.subject, "Readiness request [31m");
  assert.equal(parsed.receivedAt, new Date(1760000000000).toISOString());
  assert.equal(parsed.messageId, "message-1");
  assert.equal(parsed.threadId, "thread-1");
});

// Test goal: missing credentials produces a safe actionable error. Assertions below define the exact expected result.
test("missing credentials produces a safe actionable error", async () => {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "gmail-missing-credentials-"),
  );
  try {
    await assert.rejects(
      readCredentials(path.join(temp, "credentials.json")),
      (error) => {
        assert.ok(error instanceof ConnectorError);
        assert.equal(error.code, "CREDENTIALS_MISSING");
        assert.match(error.message, /credentials\.json/);
        assert.doesNotMatch(error.message, /client_secret|fake-client-secret/);
        return true;
      },
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

// Test goal: OAuth client merges refreshed tokens and preserves an existing refresh token. Assertions below define the exact expected result.
test("OAuth client merges refreshed tokens and preserves an existing refresh token", async (t) => {
  const saved = [];
  let oauth;
  try {
    oauth = await createOAuthClient(
      parseDesktopCredentials(fakeDesktopCredentials),
      {
        access_token: "old-access",
        refresh_token: "stable-refresh",
        expiry_date: 1,
      },
      async (tokens) => saved.push(tokens),
    );
  } catch (error) {
    if (error.code === "DEPENDENCY_MISSING") {
      t.skip("Google library install is unavailable in this environment");
      return;
    }
    throw error;
  }
  oauth.client.emit("tokens", {
    access_token: "new-access",
    expiry_date: 9999999999999,
  });
  await oauth.flushTokenWrites();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].access_token, "new-access");
  assert.equal(saved[0].refresh_token, "stable-refresh");
});
