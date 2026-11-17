/** Durable, deterministic email delivery for the cloud worker; no LLM calls. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validateManifest } from "./reporting.mjs";

const ROLES = ["client-manager", "isms-readiness-planner", "requirements-evidence-specialist", "technical-controls-analyst", "security-awareness-specialist", "corrective-action-specialist", "readiness-metrics-analyst", "project-manager"];
const KINDS = ["customer-receipt", "boss-intake", "customer-report"];
const SEND_SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/gmail.modify", "https://mail.google.com/"];
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
function fail(code) { throw Object.assign(new Error(code), { code }); }
function address(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)) fail("EMAIL_ADDRESS_INVALID");
  return value.toLowerCase();
}
function safeFile(root, relative) {
  const base = path.resolve(root), target = path.resolve(base, relative);
  const rel = path.relative(base, target);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) fail("EMAIL_PATH_UNSAFE");
  let current = base;
  if (fs.lstatSync(current).isSymbolicLink()) fail("EMAIL_PATH_UNSAFE");
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) fail("EMAIL_PATH_UNSAFE");
  }
  return target;
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
function atomic(file, value) {
  const temp = file + "." + crypto.randomUUID() + ".tmp";
  const fd = fs.openSync(temp, "wx", 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  try { fs.renameSync(temp, file); } finally { fs.rmSync(temp, { force: true }); }
}

export function emailDeliveryConfig(env = process.env) {
  if (env.EMAIL_DELIVERY_ENABLED !== "true") return { enabled: false };
  const boss = address(env.BOSS_EMAIL);
  let credentials, tokens, intakeCredentials, intakeTokens;
  try {
    credentials = JSON.parse(env.GMAIL_SEND_OAUTH_CREDENTIALS_JSON || "");
    tokens = JSON.parse(env.GMAIL_SEND_OAUTH_TOKENS_JSON || "");
    intakeCredentials = JSON.parse(env.GMAIL_OAUTH_CREDENTIALS_JSON || "");
    intakeTokens = JSON.parse(env.GMAIL_OAUTH_TOKENS_JSON || "");
  } catch { fail("EMAIL_OAUTH_CONFIG_INVALID"); }
  for (const client of [credentials, intakeCredentials]) {
    const app = client.installed || client.web;
    if (!app?.client_id || !app.client_secret) fail("EMAIL_OAUTH_CONFIG_INVALID");
  }
  if (!tokens.refresh_token || !intakeTokens.refresh_token) fail("EMAIL_REFRESH_TOKEN_MISSING");
  if (!String(tokens.scope || "").split(/\s+/).some(scope => SEND_SCOPES.includes(scope))) fail("EMAIL_SEND_SCOPE_MISSING");
  return { enabled: true, boss, credentials, tokens, intakeCredentials, intakeTokens };
}

export async function createGmailEmailTransport(config) {
  const { google } = await import("googleapis");
  const makeAuth = (credentials, tokens) => {
    const app = credentials.installed || credentials.web;
    const auth = new google.auth.OAuth2(app.client_id, app.client_secret, app.redirect_uris?.[0]);
    auth.setCredentials(tokens);
    return auth;
  };
  const reader = google.gmail({ version: "v1", auth: makeAuth(config.intakeCredentials, config.intakeTokens) });
  const sender = google.gmail({ version: "v1", auth: makeAuth(config.credentials, config.tokens) });
  const profile = await reader.users.getProfile({ userId: "me" });
  const from = address(profile.data.emailAddress);
  return {
    from,
    async originalMessage(messageId) {
      const response = await reader.users.messages.get({ userId: from, id: messageId, format: "raw" });
      if (response.data.id !== messageId || typeof response.data.raw !== "string") fail("EMAIL_SOURCE_MISMATCH");
      const data = Buffer.from(response.data.raw, "base64url");
      if (!data.length || data.length > 10_000_000) fail("EMAIL_ORIGINAL_TOO_LARGE");
      return data;
    },
    async send(message) {
      // The explicit userId binds the send grant to the verified intake mailbox.
      const response = await sender.users.messages.send({ userId: from,
        requestBody: { raw: message.raw, ...(message.threadId ? { threadId: message.threadId } : {}) } },
        { retry: false, timeout: 60_000 });
      if (!response.data.id) fail("EMAIL_SEND_UNCONFIRMED");
      return response.data.id;
    },
  };
}

function sourceFor(projectsRoot, projectId) {
  if (!/^INTAKE-[A-Za-z0-9_-]{1,57}$/.test(projectId)) fail("EMAIL_PROJECT_INVALID");
  const projectRoot = safeFile(projectsRoot, projectId);
  const marker = readJson(safeFile(projectRoot, "project.json"));
  const source = readJson(safeFile(projectRoot, "client-input/gmail-intake.json"));
  const messageId = source.source?.messageId || source.messageId;
  const threadId = source.source?.threadId || source.threadId;
  if (marker.projectType !== "intake-staging" || marker.projectId !== projectId || marker.messageId !== messageId ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(messageId || "") || !/^[A-Za-z0-9_-]{1,200}$/.test(threadId || "")) fail("EMAIL_SOURCE_MISMATCH");
  if (typeof source.subject !== "string" || /[\r\n\x00]/.test(source.subject) || source.subject.length > 2000) fail("EMAIL_SUBJECT_INVALID");
  return { projectRoot, source, messageId, threadId, recipient: address(source.senderEmail) };
}

export function prepareValidatedReport(projectRoot, projectId, manifestRelative) {
  if (!/^logs\/demo-runs\/[A-Za-z0-9._-]+\/manifest\.json$/.test(manifestRelative || "")) fail("EMAIL_MANIFEST_PATH_INVALID");
  const manifestPath = safeFile(projectRoot, manifestRelative);
  const manifest = readJson(manifestPath);
  validateManifest(manifest, manifestPath, { projectId, employeeIds: ROLES }, { projectRoot });
  for (const agent of manifest.agents) {
    const data = fs.readFileSync(safeFile(projectRoot, "working/" + path.basename(agent.outputPath)));
    if (!agent.outputHash || digest(data) !== agent.outputHash) fail("EMAIL_ARTIFACT_CHANGED");
  }
  const file = safeFile(projectRoot, "working/final-agency-report.docx");
  const data = fs.readFileSync(file);
  if (path.resolve(manifest.finalReportDocx?.path || "") !== file || !data.length || data.length > 10_000_000 ||
      data[0] !== 0x50 || data[1] !== 0x4b || manifest.finalReportDocx?.sha256 !== digest(data)) fail("EMAIL_REPORT_INVALID");
  return { name: "ISO27001-readiness-report.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data };
}

function encodedHeader(value) {
  const chunks = []; let chunk = "";
  for (const char of value) {
    if (Buffer.byteLength(chunk + char) > 42) { chunks.push(chunk); chunk = ""; }
    chunk += char;
  }
  chunks.push(chunk);
  return chunks.map(part => "=?UTF-8?B?" + Buffer.from(part).toString("base64") + "?=").join("\r\n ");
}
function encodedBody(data) { return Buffer.from(data).toString("base64").match(/.{1,76}/g)?.join("\r\n") || ""; }
export function composeDelivery({ from, to, cc, subject, text, threadId, reference, attachment }) {
  from = address(from); to = address(to); if (cc) cc = address(cc);
  if (typeof subject !== "string" || /[\r\n\x00]/.test(subject)) fail("EMAIL_SUBJECT_INVALID");
  if (reference && !/^<[^<>\s\r\n]{1,250}>$/.test(reference)) fail("EMAIL_REFERENCE_INVALID");
  const boundary = "agency_" + crypto.randomUUID().replaceAll("-", "");
  const headers = [`From: ${from}`, `To: ${to}`, ...(cc && cc !== to ? [`Cc: ${cc}`] : []),
    `Subject: ${encodedHeader(subject)}`, "MIME-Version: 1.0", "Auto-Submitted: auto-generated",
    ...(reference ? [`In-Reply-To: ${reference}`, `References: ${reference}`] : []),
    `Content-Type: multipart/mixed; boundary="${boundary}"`];
  const parts = [headers.join("\r\n"), "", `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", encodedBody(text)];
  if (attachment) {
    if (!/^[A-Za-z0-9._-]+$/.test(attachment.name) || /[\r\n]/.test(attachment.type)) fail("EMAIL_ATTACHMENT_INVALID");
    parts.push(`--${boundary}`, `Content-Type: ${attachment.type}; name="${attachment.name}"`,
      `Content-Disposition: attachment; filename="${attachment.name}"`, "Content-Transfer-Encoding: base64", "", encodedBody(attachment.data));
  }
  parts.push(`--${boundary}--`, "");
  return { raw: Buffer.from(parts.join("\r\n")).toString("base64url"), ...(threadId ? { threadId } : {}) };
}

export function createCloudEmailDelivery({ projectsRoot, stateRoot, config, transportFactory = createGmailEmailTransport, log = () => {}, clock = () => Date.now() }) {
  const root = path.resolve(stateRoot);
  if (config.enabled) fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  let transport;
  const routing = ctx => digest(JSON.stringify([config.boss, ctx.recipient, ctx.messageId, ctx.threadId]));
  const eventPath = (ctx, projectId, kind) => path.join(root, digest(JSON.stringify([projectId, ctx.messageId, kind])) + ".json");
  const enqueue = (projectId, kind, manifestRelative) => {
    if (!config.enabled) return;
    const ctx = sourceFor(projectsRoot, projectId);
    const file = eventPath(ctx, projectId, kind);
    if (fs.existsSync(file)) return;
    const event = { schemaVersion: 1, projectId, kind, sourceMessageId: ctx.messageId, routingHash: routing(ctx),
      status: "pending", attempts: 0, createdAt: new Date(clock()).toISOString(), ...(manifestRelative ? { manifestRelative } : {}) };
    const fd = fs.openSync(file, "wx", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(event)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  };
  return {
    enabled: config.enabled,
    queueIntake(projectId) {
      // Called only for newly staged messages, not the historical inbox.
      enqueue(projectId, "boss-intake"); enqueue(projectId, "customer-receipt");
    },
    queueReport(projectId, manifestPath) {
      if (!config.enabled) return;
      const ctx = sourceFor(projectsRoot, projectId);
      const relative = path.relative(ctx.projectRoot, manifestPath).split(path.sep).join("/");
      prepareValidatedReport(ctx.projectRoot, projectId, relative);
      enqueue(projectId, "customer-report", relative);
    },
    recoverReports() {
      if (!config.enabled) return;
      const events = fs.readdirSync(root).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).map(name => readJson(safeFile(root, name)));
      for (const projectId of new Set(events.filter(event => event.kind === "customer-receipt").map(event => event.projectId))) {
        if (events.some(event => event.projectId === projectId && event.kind === "customer-report")) continue;
        try {
          const ctx = sourceFor(projectsRoot, projectId);
          const anchor = events.find(event => event.projectId === projectId && event.kind === "customer-receipt");
          if (routing(ctx) !== anchor.routingHash) continue;
          const runs = safeFile(ctx.projectRoot, "logs/demo-runs");
          const completed = [];
          for (const run of fs.readdirSync(runs)) {
            if (!/^[A-Za-z0-9._-]+$/.test(run)) continue;
            try {
              const file = safeFile(ctx.projectRoot, `logs/demo-runs/${run}/manifest.json`), manifest = readJson(file);
              if (manifest.projectId === projectId && manifest.finalStatus === "completed" && manifest.dryRun === false)
                completed.push({ file, manifest });
            } catch { /* A run being written is not ready for delivery. */ }
          }
          completed.sort((a, b) => String(b.manifest.finishedAt).localeCompare(String(a.manifest.finishedAt)));
          if (completed.length) this.queueReport(projectId, completed[0].file);
        } catch { /* Missing/invalid outputs never become deliverable. */ }
      }
    },
    async flush() {
      if (!config.enabled) return [];
      const results = [];
      const priority = { "customer-receipt": 0, "boss-intake": 1, "customer-report": 2 };
      const queued = fs.readdirSync(root).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).map(name => {
        const file = safeFile(root, name); return { file, event: readJson(file) };
      }).sort((a, b) => (priority[a.event.kind] ?? 9) - (priority[b.event.kind] ?? 9) || String(a.event.createdAt).localeCompare(String(b.event.createdAt)));
      for (const { file, event } of queued) {
        if (!["pending", "rejected"].includes(event.status) || event.attempts >= 3 || (event.retryAt || 0) > clock()) continue;
        if (event.schemaVersion !== 1 || !KINDS.includes(event.kind)) fail("EMAIL_STATE_INVALID");
        const lock = file + ".lock";
        let fd;
        try { fd = fs.openSync(lock, "wx", 0o600); } catch (error) { if (error.code === "EEXIST") continue; throw error; }
        try {
          // A racing process may already have completed the event while we waited.
          const fresh = readJson(file);
          if (!["pending", "rejected"].includes(fresh.status) || fresh.attempts !== event.attempts) continue;
          const ctx = sourceFor(projectsRoot, event.projectId);
          if (ctx.messageId !== event.sourceMessageId || routing(ctx) !== event.routingHash) fail("EMAIL_RECIPIENT_CHANGED");
          if (event.kind !== "boss-intake" && (ctx.source.senderAuthenticationVerified !== true ||
              ctx.source.deterministicClassification?.category === "suspicious_or_requires_review")) fail("EMAIL_CUSTOMER_REQUIRES_REVIEW");
          if (event.kind !== "boss-intake" && !/^<[^<>\s\r\n]{1,250}>$/.test(ctx.source.rfcMessageId || "")) fail("EMAIL_REFERENCE_INVALID");
          transport ||= await transportFactory(config);
          const from = address(transport.from);
          if (ctx.recipient === from) fail("EMAIL_SELF_REPLY_BLOCKED");
          let message;
          if (event.kind === "boss-intake") {
            const original = await transport.originalMessage(ctx.messageId);
            if (!Buffer.isBuffer(original) || !original.length || original.length > 10_000_000) fail("EMAIL_ORIGINAL_TOO_LARGE");
            const attachments = (ctx.source.attachments || []).map(item => `${item.filename || item.name || "Unnamed file"} (${item.size ?? "unknown"} bytes)`).join("\n") || "None recorded";
            message = composeDelivery({ from, to: config.boss, subject: `New customer request: ${ctx.source.subject}`,
              text: `Client Manager received a new customer request.\n\nFrom: ${ctx.source.sender || ctx.recipient}\nSender address: ${ctx.recipient}\nReceived: ${ctx.source.receivedAt || "Not recorded"}\nSubject: ${ctx.source.subject}\nSender authentication: ${ctx.source.senderAuthenticationVerified === true ? "passed" : "not verified; review required"}\n\nCustomer request (untrusted client content):\n${ctx.source.bodyText || "No plain text available; see attached original."}\n\nAttachments:\n${attachments}\n\nThe attached original-request.eml preserves the full original message and its attachments, including content omitted by intake text limits. Client content has not been independently verified.`,
              attachment: { name: "original-request.eml", type: "application/octet-stream", data: original } });
          } else {
            const attachment = event.kind === "customer-report" ? prepareValidatedReport(ctx.projectRoot, event.projectId, event.manifestRelative) : null;
            const text = attachment
              ? "Dear Customer,\n\nYour ISO/IEC 27001 readiness preparation assessment is complete. Please find the report attached. Our Project Manager has copied the agency owner on this message.\n\nThe report is based on supplied information and identifies evidence limitations and proposed actions. It is not a certification or an accredited audit opinion, and recommended changes have not been implemented or independently verified by this agency.\n\nKind regards,\nProject Manager\nISO Readiness Agency"
              : "Dear Customer,\n\nThank you for your message. We have received your request and passed it to our Client Manager for review. We will contact you if additional information is needed. This acknowledgment confirms receipt, not completion of an assessment.\n\nKind regards,\nClient Manager\nISO Readiness Agency";
            message = composeDelivery({ from, to: ctx.recipient, ...(attachment ? { cc: config.boss } : {}),
              subject: /^re:/i.test(ctx.source.subject) ? ctx.source.subject : `Re: ${ctx.source.subject}`,
              text, attachment, threadId: ctx.threadId, reference: ctx.source.rfcMessageId });
          }
          event.status = "attempting"; event.attempts++; event.attemptedAt = new Date(clock()).toISOString();
          atomic(file, event); // Durable before the external side effect.
          try {
            event.gmailMessageId = await transport.send(message);
            if (typeof event.gmailMessageId !== "string" || !event.gmailMessageId) fail("EMAIL_SEND_UNCONFIRMED");
            event.status = "sent"; event.sentAt = new Date(clock()).toISOString();
            atomic(file, event);
          } catch (error) {
            const status = Number(error.response?.status || error.code);
            event.status = [400, 401, 403, 404, 429].includes(status) ? "rejected" : "ambiguous";
            event.failureCode = [400, 401, 403, 404, 429].includes(status) ? `GMAIL_HTTP_${status}` : "EMAIL_SEND_AMBIGUOUS";
            event.retryAt = clock() + 60_000 * event.attempts;
            atomic(file, event);
          }
        } catch (error) {
          // Pre-send validation problems remain visible and are not retried blindly.
          event.status = "held";
          event.failureCode = /^[A-Z_]{3,60}$/.test(error.code || "") ? error.code : "EMAIL_PREPARE_FAILED";
          atomic(file, event);
        } finally {
          fs.closeSync(fd); fs.rmSync(lock, { force: true });
        }
        const summary = { projectId: event.projectId, kind: event.kind, status: event.status, code: event.failureCode || null };
        log(summary); results.push(summary);
      }
      return results;
    },
    status(projectId) {
      if (!config.enabled) return { enabled: false, states: {} };
      const states = {};
      for (const name of fs.readdirSync(root).filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
        const event = readJson(safeFile(root, name));
        if (event.projectId === projectId) states[event.kind] = event.status;
      }
      return { enabled: true, states };
    },
  };
}
