#!/usr/bin/env node
/*
 * Module overview: deterministic Gmail read-only connector infrastructure.
 * It parses local OAuth configuration, manages private token persistence,
 * requests message metadata through Gmail's readonly API, and sanitizes output.
 * The LLM is invoked separately by the orchestrator; it does not receive
 * credentials or call this module's APIs directly.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// Derive local storage paths from this module so callers can run it from any folder.
const HERE = path.dirname(fileURLToPath(import.meta.url));
// The cloud worker keeps refreshable token files on its mounted private volume.
// Local use keeps the existing repository-relative private directory.
export const PRIVATE_DIR = process.env.GMAIL_PRIVATE_DIR
  ? path.resolve(process.env.GMAIL_PRIVATE_DIR)
  : path.join(HERE, "private");
export const CREDENTIALS_PATH = path.join(PRIVATE_DIR, "credentials.json");
export const TOKENS_PATH = path.join(PRIVATE_DIR, "tokens.json");
export const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";
export const SCOPES = Object.freeze([GMAIL_READONLY_SCOPE]);

// Reading path for beginners:
// 1. Validate the local Desktop OAuth credential and protected token folder.
// 2. Authorize only Gmail read access, then create an authenticated API client.
// 3. Give inbox metadata to the poller without exposing credentials to agents.

/** Error carrying a safe machine-readable category without leaking provider details. */
export class ConnectorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
  }
}

async function googleApi() {
  try {
    // Load the provider SDK only when a real Google API operation needs it.
    return (await import("googleapis")).google;
  } catch {
    throw new ConnectorError(
      "DEPENDENCY_MISSING",
      "Google API client is not installed. Run npm.cmd install in the Gmail connector directory.",
    );
  }
}

function safeDisplay(value, maxLength = 500) {
  // Flatten control characters and cap displayed text so headers cannot flood terminal output.
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Validate Google's Desktop OAuth JSON shape while keeping values out of errors. */
export function parseDesktopCredentials(input) {
  // Accept JSON text or an object, then normalize the expected Desktop OAuth structure.
  let document;
  try {
    document =
      typeof input === "string"
        ? JSON.parse(input.replace(/^\uFEFF/, ""))
        : input;
  } catch {
    throw new ConnectorError(
      "INVALID_CREDENTIALS",
      "Desktop OAuth credentials are not valid JSON. Replace private/credentials.json with the Google OAuth Desktop App JSON file.",
    );
  }
  const installed = document?.installed;
  // Check required fields without including credential values in thrown error messages.
  if (
    !installed ||
    typeof installed.client_id !== "string" ||
    !installed.client_id ||
    typeof installed.client_secret !== "string" ||
    !installed.client_secret ||
    !Array.isArray(installed.redirect_uris) ||
    !installed.redirect_uris.some((uri) => typeof uri === "string" && uri)
  ) {
    throw new ConnectorError(
      "INVALID_CREDENTIALS",
      'Credentials must have the Google Desktop OAuth "installed" structure with a client ID, secret, and redirect URI. Credential values were not displayed.',
    );
  }
  return {
    clientId: installed.client_id,
    clientSecret: installed.client_secret,
    redirectUri: installed.redirect_uris.find(
      (uri) => typeof uri === "string" && uri,
    ),
  };
}

/** Whitelist and sanitize the small header set permitted for display. */
export function parseMessageMetadata(message) {
  // Read only selected headers and IDs; this function does not expose the email body.
  const headers = Array.isArray(message?.payload?.headers)
    ? message.payload.headers
    : [];
  const header = (name) =>
    headers.find(
      (item) => String(item?.name ?? "").toLowerCase() === name.toLowerCase(),
    )?.value;
  const timestamp = Number(message?.internalDate);
  const receivedAt =
    Number.isFinite(timestamp) && timestamp > 0
      ? new Date(timestamp).toISOString()
      : "unknown";
  return {
    sender: safeDisplay(header("From") || "(unknown sender)", 400),
    subject: safeDisplay(header("Subject") || "(no subject)", 500),
    receivedAt,
    messageId: safeDisplay(message?.id || "", 200),
    threadId: safeDisplay(message?.threadId || "", 200),
  };
}

/** Read credentials only from the explicit private path and return parsed fields. */
export async function readCredentials(credentialsPath = CREDENTIALS_PATH) {
  // Railway can supply the Desktop OAuth JSON as a protected variable.
  if (credentialsPath === CREDENTIALS_PATH && process.env.GMAIL_OAUTH_CREDENTIALS_JSON) {
    return parseDesktopCredentials(process.env.GMAIL_OAUTH_CREDENTIALS_JSON);
  }
  // Read OAuth app configuration from the specified local private file; no API call occurs.
  if (
    !fs.existsSync(credentialsPath) ||
    !fs.statSync(credentialsPath).isFile()
  ) {
    throw new ConnectorError(
      "CREDENTIALS_MISSING",
      `Google OAuth Desktop App credentials are missing at ${credentialsPath}.`,
    );
  }
  let contents;
  try {
    contents = fs.readFileSync(credentialsPath, "utf8");
  } catch {
    throw new ConnectorError(
      "CREDENTIALS_UNREADABLE",
      `Cannot read Google OAuth credentials at ${credentialsPath}.`,
    );
  }
  return parseDesktopCredentials(contents);
}

function currentUserSid() {
  // Ask Windows for the current account SID to restrict access to the private folder.
  try {
    const output = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = output.match(/S-1-(?:\d+-){1,}\d+/);
    if (match) return match[0];
  } catch {
    /* a generic secure-storage error is returned below */
  }
  throw new ConnectorError(
    "PRIVATE_ACL",
    "Could not determine the current Windows account SID to secure private token storage.",
  );
}

/** Restrict the private directory to approved OS principals before token writes. */
export function securePrivateStorage(privateDir = PRIVATE_DIR) {
  // Create the private directory, then apply operating-system access restrictions.
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  try {
    if (process.platform === "win32") {
      const sid = currentUserSid();
      execFileSync(
        "icacls.exe",
        [
          privateDir,
          "/inheritance:r",
          "/grant:r",
          `*${sid}:(OI)(CI)F`,
          "*S-1-5-18:(OI)(CI)F",
          "*S-1-5-32-544:(OI)(CI)F",
          "/T",
        ],
        {
          encoding: "utf8",
          windowsHide: true,
          stdio: ["ignore", "ignore", "ignore"],
        },
      );
    } else {
      fs.chmodSync(privateDir, 0o700);
      for (const name of fs.readdirSync(privateDir))
        fs.chmodSync(path.join(privateDir, name), 0o600);
    }
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError(
      "PRIVATE_ACL",
      "Could not restrict access to the Gmail private directory. No OAuth tokens were saved.",
    );
  }
}

function selectTokenFields(tokens) {
  // Copy only fields understood by OAuth, preventing unrelated response data from persisting.
  const allowed = [
    "access_token",
    "refresh_token",
    "scope",
    "token_type",
    "expiry_date",
  ];
  const selected = Object.fromEntries(
    allowed
      .filter((key) => tokens?.[key] !== undefined)
      .map((key) => [key, tokens[key]]),
  );
  if (!selected.access_token && !selected.refresh_token)
    throw new ConnectorError(
      "INVALID_TOKEN",
      "Google returned no usable OAuth tokens.",
    );
  return selected;
}

/** Persist only allowlisted OAuth fields using a temp file and restrictive access. */
export function writeTokenFile(tokens, tokensPath = TOKENS_PATH) {
  // Secure the parent folder, write a unique temporary file, then atomically replace tokens.
  securePrivateStorage(path.dirname(tokensPath));
  const body = JSON.stringify(selectTokenFields(tokens), null, 2) + "\n";
  const tempPath = `${tokensPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, body, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(tempPath, tokensPath);
    if (process.platform !== "win32") fs.chmodSync(tokensPath, 0o600);
    else {
      const sid = currentUserSid();
      execFileSync(
        "icacls.exe",
        [
          tokensPath,
          "/inheritance:r",
          "/grant:r",
          `*${sid}:F`,
          "*S-1-5-18:F",
          "*S-1-5-32-544:F",
        ],
        {
          encoding: "utf8",
          windowsHide: true,
          stdio: ["ignore", "ignore", "ignore"],
        },
      );
    }
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      /* retain the primary error */
    }
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError(
      "TOKEN_WRITE",
      "Could not securely save Gmail OAuth tokens in the private directory. Token values were not displayed.",
    );
  }
}

function readTokenFile(tokensPath = TOKENS_PATH) {
  // Prefer a rotated token already written on the mounted volume.
  if (fs.existsSync(tokensPath) && fs.statSync(tokensPath).isFile()) {
    try {
      const tokens = JSON.parse(fs.readFileSync(tokensPath, "utf8").replace(/^\uFEFF/, ""));
      return selectTokenFields(tokens);
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError(
        "INVALID_TOKEN",
        "The persisted Gmail OAuth token file is invalid. Replace it with valid token JSON.",
      );
    }
  }
  // The initial refresh token is injected by Railway; refreshed values are saved
  // to TOKENS_PATH so the worker survives token rotation across restarts.
  if (tokensPath === TOKENS_PATH && process.env.GMAIL_OAUTH_TOKENS_JSON) {
    try {
      return selectTokenFields(JSON.parse(process.env.GMAIL_OAUTH_TOKENS_JSON));
    } catch {
      throw new ConnectorError(
        "INVALID_TOKEN",
        "Gmail OAuth token variable is unreadable or invalid. Replace it with the authorized token JSON.",
      );
    }
  }
  // Require an existing regular token file before parsing its saved JSON.
  if (!fs.existsSync(tokensPath) || !fs.statSync(tokensPath).isFile()) {
    throw new ConnectorError(
      "NOT_AUTHORIZED",
      "Gmail is not authorized yet. Run: node .\\gmail.mjs authorize",
    );
  }
  try {
    const tokens = JSON.parse(
      fs.readFileSync(tokensPath, "utf8").replace(/^\uFEFF/, ""),
    );
    return selectTokenFields(tokens);
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError(
      "INVALID_TOKEN",
      "The local Gmail token file is unreadable or invalid. Run the authorize command again.",
    );
  }
}

/** Build an OAuth client and serialize token refresh writes through the supplied persister. */
export async function createOAuthClient(
  details,
  tokens,
  persist = writeTokenFile,
) {
  // Configure an OAuth client and serialize refresh-token writes through one promise chain.
  const google = await googleApi();
  const client = new google.auth.OAuth2(
    details.clientId,
    details.clientSecret,
    details.redirectUri,
  );
  client.setCredentials(selectTokenFields(tokens));
  let writes = Promise.resolve();
  let failed = false;
  client.on("tokens", (newTokens) => {
    // Merge newly issued fields with current credentials, then queue a durable save.
    const merged = { ...client.credentials, ...newTokens };
    writes = writes
      .then(() => persist(merged))
      .catch(() => {
        failed = true;
      });
  });
  return {
    client,
    async flushTokenWrites() {
      // Wait until queued writes finish and report if a refreshed token could not be saved.
      await writes;
      if (failed)
        throw new ConnectorError(
          "TOKEN_WRITE",
          "Google refreshed the Gmail token, but the updated token could not be securely saved.",
        );
    },
  };
}

/** Assemble the read-only API client from locally stored OAuth material. */
async function authenticatedGmail() {
  // Assemble the local OAuth client and return a Gmail API client plus a save-completion hook.
  const details = await readCredentials();
  securePrivateStorage(PRIVATE_DIR);
  const tokens = readTokenFile();
  const [google, oauth] = await Promise.all([
    googleApi(),
    createOAuthClient(details, tokens),
  ]);
  return {
    gmail: google.gmail({ version: "v1", auth: oauth.client }),
    flushTokenWrites: oauth.flushTokenWrites,
  };
}

export async function connectReadOnlyGmail() {
  // Let the poller obtain read-only API access without duplicating credential setup.
  return authenticatedGmail();
}

/** Map provider failures to safe, stable codes without printing raw responses. */
function apiFailure(operation, error) {
  // Map provider status codes to safe errors without exposing raw response details.
  const status = Number(error?.response?.status ?? error?.code);
  if (status === 401)
    return new ConnectorError(
      "AUTH_EXPIRED",
      `${operation} was unauthorized. Run the Gmail authorize command again.`,
    );
  if (status === 403)
    return new ConnectorError(
      "API_FORBIDDEN",
      `${operation} was denied. Confirm the Gmail API is enabled and the account granted the read-only scope.`,
    );
  if (
    error?.code === "ENOTFOUND" ||
    error?.code === "ECONNREFUSED" ||
    error?.code === "ETIMEDOUT"
  )
    return new ConnectorError(
      "NETWORK",
      `${operation} could not reach Google. Check the network and retry.`,
    );
  return new ConnectorError(
    "GMAIL_API",
    `${operation} failed${Number.isFinite(status) ? ` (HTTP ${status})` : ""}. Details were suppressed to avoid exposing authorization data.`,
  );
}

/** Perform interactive local OAuth consent, save a refresh token, then verify access. */
export async function authorize() {
  // Run local browser consent, receive its callback, and exchange the code for OAuth tokens.
  const details = await readCredentials();
  securePrivateStorage(PRIVATE_DIR);
  let OAuth2Client;
  try {
    ({ OAuth2Client } = await import("google-auth-library"));
  } catch {
    throw new ConnectorError(
      "DEPENDENCY_MISSING",
      "Google OAuth client library is not installed. Run npm.cmd install in the Gmail connector directory.",
    );
  }
  const server = http.createServer();
  let oauth;
  let timer;
  try {
    // Bind a temporary callback server to loopback so the redirect stays on this computer.
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const redirectUri = `http://localhost:${address.port}`;
    oauth = new OAuth2Client(
      details.clientId,
      details.clientSecret,
      redirectUri,
    );
    const authUrl = oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [...SCOPES],
    });
    process.stdout.write(
      "Open this Google authorization URL in your browser to grant the Gmail read-only permission:\n",
    );
    process.stdout.write(`${authUrl}\n`);
    // Wait for Google's redirect, reject denial or a missing code, and time out after five minutes.
    const code = await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("OAuth callback timed out")),
        5 * 60 * 1000,
      );
      server.on("request", (request, response) => {
        const callback = new URL(request.url, redirectUri);
        if (callback.pathname !== "/") {
          response.writeHead(404).end("Not found");
          return;
        }
        if (callback.searchParams.has("error")) {
          response
            .writeHead(400, { "content-type": "text/plain; charset=utf-8" })
            .end("Google authorization was denied. You may close this page.");
          reject(new Error("OAuth authorization denied"));
          return;
        }
        const value = callback.searchParams.get("code");
        if (!value) {
          response
            .writeHead(400, { "content-type": "text/plain; charset=utf-8" })
            .end("Authorization code is missing. You may close this page.");
          reject(new Error("OAuth code missing"));
          return;
        }
        response
          .writeHead(200, { "content-type": "text/plain; charset=utf-8" })
          .end(
            "Authorization received. You may close this page and return to the terminal.",
          );
        resolve(value);
      });
    });
    // Exchange the one-time authorization code for tokens and attach them to this client.
    const result = await oauth.getToken(code);
    oauth.setCredentials(result.tokens);
  } catch {
    throw new ConnectorError(
      "OAUTH_FAILED",
      "Google local OAuth authorization failed, timed out, or was cancelled. No credential values were displayed.",
    );
  } finally {
    // Always stop the local callback server, including after denial or timeout.
    clearTimeout(timer);
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
  const tokens = oauth?.credentials;
  if (!tokens?.refresh_token) {
    throw new ConnectorError(
      "REFRESH_TOKEN_MISSING",
      "Google did not issue a refresh token, so reusable local authorization was not saved. Revoke this app in Google Account security, then run authorize again.",
    );
  }
  writeTokenFile(tokens);
  // Confirm via an authenticated Gmail API request before reporting a connected account.
  try {
    const google = await googleApi();
    const gmail = google.gmail({ version: "v1", auth: oauth });
    const profile = await gmail.users.getProfile({ userId: "me" });
    process.stdout.write(
      `Authorization succeeded for ${safeDisplay(profile.data.emailAddress, 254)}. Gmail read-only scope granted; tokens saved privately.\n`,
    );
  } catch (error) {
    throw apiFailure("Post-authorization Gmail verification", error);
  }
}

/** Verify the authorized account using the read-only profile endpoint. */
export async function verifyAccount() {
  // Call the profile endpoint to confirm the saved authorization can access Gmail.
  const { gmail, flushTokenWrites } = await authenticatedGmail();
  let profile;
  try {
    profile = await gmail.users.getProfile({ userId: "me" });
  } catch (error) {
    throw apiFailure("Gmail account verification", error);
  }
  await flushTokenWrites();
  process.stdout.write(
    `Connected Gmail account: ${safeDisplay(profile.data.emailAddress, 254)}\n`,
  );
}

/** Fetch at most five newest inbox messages as sanitized metadata, never bodies. */
export async function listNewestInboxMessages() {
  // List only a small number of inbox messages and request metadata instead of message bodies.
  const { gmail, flushTokenWrites } = await authenticatedGmail();
  let listed;
  try {
    listed = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      maxResults: 5,
    });
  } catch (error) {
    throw apiFailure("Inbox listing", error);
  }
  const ids = listed.data.messages || [];
  const rows = await Promise.all(
    // Fetch each message's allowed metadata concurrently and convert it to a safe display row.
    ids.map(async ({ id }) => {
      try {
        const result = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "Subject"],
          fields: "id,threadId,internalDate,payload(headers)",
        });
        return parseMessageMetadata(result.data);
      } catch (error) {
        throw apiFailure("Inbox message metadata request", error);
      }
    }),
  );
  await flushTokenWrites();
  if (!rows.length) {
    process.stdout.write("Inbox is empty.\n");
    return;
  }
  for (const row of rows) {
    process.stdout.write(
      `Sender: ${row.sender}\nSubject: ${row.subject}\nReceived: ${row.receivedAt}\nMessage ID: ${row.messageId}\nThread ID: ${row.threadId}\n---\n`,
    );
  }
}

/** Check credential structure without authorizing or displaying secret values. */
export async function checkConfiguration() {
  // Validate local config shape without authorizing or making a Google request.
  await readCredentials();
  process.stdout.write(
    "Credentials file exists and has a valid Google Desktop OAuth structure. Secret values are redacted.\n",
  );
  process.stdout.write(`Requested scope: ${GMAIL_READONLY_SCOPE}\n`);
}

/** Dispatch one supported local CLI command; reject multiple commands. */
export async function main(argv = process.argv.slice(2)) {
  // Dispatch one supported command and await it so failures reach the CLI error handler.
  const [command] = argv;
  if (argv.length > 1)
    throw new ConnectorError(
      "CLI_USAGE",
      "Use one command at a time. Run node .\\gmail.mjs help.",
    );
  if (command === "authorize") await authorize();
  else if (command === "verify") await verifyAccount();
  else if (command === "list") await listNewestInboxMessages();
  else if (command === "check-config") await checkConfiguration();
  else if (command === "help" || !command)
    process.stdout.write(
      "Commands: authorize | verify | list | check-config\n",
    );
  else
    throw new ConnectorError(
      "CLI_USAGE",
      "Unknown command. Use authorize, verify, list, or check-config.",
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const safe =
      error instanceof ConnectorError
        ? error
        : new ConnectorError(
            "UNEXPECTED",
            "The Gmail connector failed. Sensitive error details were suppressed.",
          );
    process.stderr.write(`${safe.code}: ${safe.message}\n`);
    process.exitCode = 1;
  });
}
