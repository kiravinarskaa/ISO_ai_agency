import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createCloudEmailDelivery, emailDeliveryConfig, composeDelivery } from "../cloud-email-delivery.mjs";
import { buildFinalDocx } from "../../../demo/final-report-docx.mjs";

const hash = data => crypto.createHash("sha256").update(data).digest("hex");
const outputs = [
  ["client-manager", "client-intake", "client-brief.json"],
  ["isms-readiness-planner", "prepare-readiness-roadmap", "isms-readiness-plan.md"],
  ["requirements-evidence-specialist", "build-evidence-register", "evidence-register.md"],
  ["technical-controls-analyst", "review-technical-controls", "technical-controls-assessment.md"],
  ["security-awareness-specialist", "prepare-awareness-plan", "awareness-training-plan.md"],
  ["corrective-action-specialist", "build-corrective-action-register", "corrective-action-register.md"],
  ["readiness-metrics-analyst", "summarize-readiness-metrics", "readiness-dashboard.md"],
  ["project-manager", "coordinate-readiness-project", "final-agency-report.md"],
];

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-mail-test-"));
  const projectsRoot = path.join(root, "projects"), projectId = "INTAKE-test", projectRoot = path.join(projectsRoot, projectId);
  const stateRoot = path.join(root, "email-state");
  for (const dir of ["client-input", "working", "logs/demo-runs/run-test"])
    fs.mkdirSync(path.join(projectRoot, dir), { recursive: true });
  const sourcePath = path.join(projectRoot, "client-input/gmail-intake.json");
  const source = { messageId: "msg-test", threadId: "thread-test", senderEmail: "customer@example.com", sender: "Fictional Client <customer@example.com>",
    senderAuthenticationVerified: true, rfcMessageId: "<original@example.com>", subject: "ISO readiness request", receivedAt: "2026-11-17T08:00:00Z",
    deterministicClassification: { category: "new_client_request" }, bodyText: "FULL CUSTOMER REQUEST - with all supplied details.",
    attachments: [{ filename: "evidence.pdf", size: 123 }] };
  fs.writeFileSync(sourcePath, JSON.stringify(source));
  fs.writeFileSync(path.join(projectRoot, "project.json"), JSON.stringify({ projectId, projectType: "intake-staging", messageId: source.messageId }));
  const manifest = { schemaVersion: 1, projectId, runId: "run-test", dryRun: false, finalStatus: "completed", startedAt: "2026-11-17T08:00:00Z", finishedAt: "2026-11-17T08:10:00Z",
    order: outputs.map(([id]) => id), agents: [] };
  for (const [employeeId, routine, filename] of outputs) {
    const outputPath = path.join(projectRoot, "working", filename);
    const text = filename.endsWith(".json") ? '{"project_id":"INTAKE-test"}' : "# Synthetic report\n\n## Established facts\nClient-reported fictional data.\n## Missing evidence\nNot verified.\n## Assumptions\nNone.\n## Recommendations\nCollect evidence.\n";
    fs.writeFileSync(outputPath, text);
    manifest.agents.push({ employeeId, routine, status: "completed", finishedAt: manifest.finishedAt, validation: { valid: true }, outputExists: true, subprocessExitStatus: 0, outputPath, outputHash: hash(text) });
  }
  manifest.finalReportDocx = buildFinalDocx(projectRoot, manifest);
  const manifestPath = path.join(projectRoot, "logs/demo-runs/run-test/manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const sent = [], logs = [];
  const original = Buffer.from("From: customer@example.com\r\nSubject: Original full request\r\n\r\nFull body and original MIME attachments");
  let handler = async () => "accepted-" + (sent.length + 1), now = 100000;
  const options = { projectsRoot, stateRoot, config: { enabled: true, boss: "boss@example.com" }, clock: () => now,
    transportFactory: async () => ({ from: "agency@example.com", originalMessage: async id => { assert.equal(id, source.messageId); return original; },
      send: async message => { const id = await handler(message); sent.push(message); return id; } }), log: row => logs.push(row) };
  const delivery = createCloudEmailDelivery(options);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, projectsRoot, projectId, projectRoot, sourcePath, source, manifestPath, manifest, stateRoot, options, delivery, sent, logs, original,
    handler: value => { handler = value; }, advance: () => { now += 200000; } };
}

function decode(message) { return Buffer.from(message.raw, "base64url").toString("utf8"); }
function bodies(message) { return [...decode(message).matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)(?=\r\n--agency_)/g)].map(match => Buffer.from(match[1].replace(/\s/g, ""), "base64")); }

test("receipt and full Boss request notice send once and survive restart", async t => {
  const f = fixture(t);
  f.delivery.queueIntake(f.projectId);
  assert.equal(f.sent.length, 0);
  await f.delivery.flush();
  assert.equal(f.sent.length, 2);
  const boss = f.sent.find(message => decode(message).includes("To: boss@example.com"));
  const receipt = f.sent.find(message => decode(message).includes("To: customer@example.com"));
  assert.ok(boss && receipt);
  assert.match(bodies(boss)[0].toString(), /FULL CUSTOMER REQUEST/);
  assert.match(bodies(boss)[0].toString(), /evidence.pdf/);
  assert.deepEqual(bodies(boss)[1], f.original);
  assert.match(decode(boss), /original-request.eml/);
  assert.match(decode(receipt), /In-Reply-To: <original@example.com>/);
  assert.equal(receipt.threadId, "thread-test");
  assert.match(bodies(receipt)[0].toString(), /received your request/);
  assert.ok(!decode(receipt).includes("Cc:"));
  const restarted = createCloudEmailDelivery(f.options);
  restarted.queueIntake(f.projectId);
  await restarted.flush();
  assert.equal(f.sent.length, 2);
  assert.ok(!JSON.stringify(f.logs).includes("customer@example.com"));
  assert.ok(!JSON.stringify(f.logs).includes("FULL CUSTOMER"));
});

test("validated report is attached to customer reply with Boss CC, never just a completion notice", async t => {
  const f = fixture(t);
  f.delivery.queueReport(f.projectId, f.manifestPath);
  await f.delivery.flush();
  assert.equal(f.sent.length, 1);
  const mime = decode(f.sent[0]);
  assert.match(mime, /To: customer@example.com/);
  assert.match(mime, /Cc: boss@example.com/);
  assert.match(mime, /ISO27001-readiness-report.docx/);
  assert.deepEqual(bodies(f.sent[0])[1], fs.readFileSync(path.join(f.projectRoot, "working/final-agency-report.docx")));
  assert.equal(f.delivery.status(f.projectId).states["customer-report"], "sent");
  await createCloudEmailDelivery(f.options).flush();
  assert.equal(f.sent.length, 1);
});

test("incomplete or changed outputs cannot be emailed", async t => {
  const f = fixture(t);
  f.manifest.finalStatus = "incomplete";
  fs.writeFileSync(f.manifestPath, JSON.stringify(f.manifest));
  assert.throws(() => f.delivery.queueReport(f.projectId, f.manifestPath));
  f.manifest.finalStatus = "completed";
  fs.writeFileSync(f.manifestPath, JSON.stringify(f.manifest));
  f.delivery.queueReport(f.projectId, f.manifestPath);
  fs.appendFileSync(path.join(f.projectRoot, "working/final-agency-report.md"), "changed after validation");
  await f.delivery.flush();
  assert.equal(f.sent.length, 0);
  assert.equal(f.delivery.status(f.projectId).states["customer-report"], "held");
});

test("unauthenticated customer receives no auto-reply while Boss receives request details", async t => {
  const f = fixture(t);
  f.source.senderAuthenticationVerified = false;
  fs.writeFileSync(f.sourcePath, JSON.stringify(f.source));
  f.delivery.queueIntake(f.projectId);
  await f.delivery.flush();
  assert.equal(f.sent.length, 1);
  assert.match(decode(f.sent[0]), /To: boss@example.com/);
  assert.equal(f.delivery.status(f.projectId).states["customer-receipt"], "held");
});

test("recipient changes after queueing are held instead of redirected", async t => {
  const f = fixture(t);
  f.delivery.queueIntake(f.projectId);
  f.source.senderEmail = "different@example.com";
  fs.writeFileSync(f.sourcePath, JSON.stringify(f.source));
  await f.delivery.flush();
  assert.equal(f.sent.length, 0);
  assert.ok(f.logs.every(row => row.code === "EMAIL_RECIPIENT_CHANGED"));
});

test("ambiguous send outcomes never retry automatically", async t => {
  const f = fixture(t);
  let calls = 0;
  f.handler(async () => { calls++; throw Error("connection lost after submit"); });
  f.delivery.queueIntake(f.projectId);
  await f.delivery.flush();
  assert.equal(calls, 2);
  await createCloudEmailDelivery(f.options).flush();
  assert.equal(calls, 2);
  assert.equal(f.delivery.status(f.projectId).states["customer-receipt"], "ambiguous");
});

test("definite Gmail rejection has bounded delayed retries", async t => {
  const f = fixture(t);
  let calls = 0;
  f.handler(async () => { calls++; throw Object.assign(Error("rejected"), { code: 403 }); });
  f.delivery.queueIntake(f.projectId);
  await f.delivery.flush();
  await f.delivery.flush();
  assert.equal(calls, 2);
  f.advance(); await f.delivery.flush();
  f.advance(); await f.delivery.flush();
  f.advance(); await f.delivery.flush();
  assert.equal(calls, 6);
});

test("disabled sending does not create an outbox or touch a transport", async t => {
  const f = fixture(t);
  const root = path.join(f.root, "disabled-state");
  const delivery = createCloudEmailDelivery({ ...f.options, stateRoot: root, config: { enabled: false }, transportFactory: async () => assert.fail("must not connect") });
  delivery.queueIntake("not-even-a-project");
  delivery.queueReport("not-even-a-project", "missing");
  await delivery.flush();
  assert.equal(fs.existsSync(root), false);
});

test("configuration requires an explicit Boss address and a separate send-scoped grant", () => {
  assert.deepEqual(emailDeliveryConfig({}), { enabled: false });
  assert.throws(() => emailDeliveryConfig({ EMAIL_DELIVERY_ENABLED: "true" }), /EMAIL_ADDRESS_INVALID/);
  const credentials = JSON.stringify({ installed: { client_id: "test", client_secret: "mock" } });
  const env = { EMAIL_DELIVERY_ENABLED: "true", BOSS_EMAIL: "boss@example.com", GMAIL_SEND_OAUTH_CREDENTIALS_JSON: credentials,
    GMAIL_OAUTH_CREDENTIALS_JSON: credentials, GMAIL_OAUTH_TOKENS_JSON: JSON.stringify({ refresh_token: "mock" }),
    GMAIL_SEND_OAUTH_TOKENS_JSON: JSON.stringify({ refresh_token: "mock", scope: "https://www.googleapis.com/auth/gmail.readonly" }) };
  assert.throws(() => emailDeliveryConfig(env), /EMAIL_SEND_SCOPE_MISSING/);
  env.GMAIL_SEND_OAUTH_TOKENS_JSON = JSON.stringify({ refresh_token: "mock", scope: "https://www.googleapis.com/auth/gmail.send" });
  assert.equal(emailDeliveryConfig(env).enabled, true);
});

test("MIME headers reject injection and fold long Unicode subjects correctly", () => {
  const args = { from: "agency@example.com", to: "customer@example.com", cc: "boss@example.com", subject: "����� ".repeat(80), text: "test", reference: "<test@example.com>" };
  const mime = decode(composeDelivery(args));
  for (const line of mime.split("\r\n")) assert.ok(line.length <= 998);
  assert.throws(() => composeDelivery({ ...args, to: "customer@example.com\r\nBcc: attacker@example.com" }));
  assert.throws(() => composeDelivery({ ...args, subject: "test\r\nBcc: attacker@example.com" }));
  assert.throws(() => composeDelivery({ ...args, reference: "<test>\r\nBcc: injected" }));
});

test("full notification sequence sends receipt, Boss details and customer report with no replay", async t => {
  const f = fixture(t);
  f.delivery.queueIntake(f.projectId);
  await f.delivery.flush();
  assert.match(decode(f.sent[0]), /To: customer@example.com/);
  f.delivery.queueReport(f.projectId, f.manifestPath);
  await f.delivery.flush();
  assert.equal(f.sent.length, 3);
  assert.match(decode(f.sent[2]), /Cc: boss@example.com/);
  assert.deepEqual(f.delivery.status(f.projectId).states, {
    "customer-receipt": "sent", "boss-intake": "sent", "customer-report": "sent",
  });
  const restarted = createCloudEmailDelivery(f.options);
  restarted.queueIntake(f.projectId); restarted.queueReport(f.projectId, f.manifestPath);
  await restarted.flush();
  assert.equal(f.sent.length, 3);
});

test("concurrent flushes cannot submit the same notification twice", async t => {
  const f = fixture(t);
  f.delivery.queueIntake(f.projectId);
  const second = createCloudEmailDelivery(f.options);
  await Promise.all([f.delivery.flush(), second.flush()]);
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent.filter(message => decode(message).includes("To: customer@example.com")).length, 1);
});

test("crash after attempting was recorded does not automatically resend", async t => {
  const f = fixture(t);
  f.delivery.queueIntake(f.projectId);
  for (const name of fs.readdirSync(f.stateRoot)) {
    const file = path.join(f.stateRoot, name), event = JSON.parse(fs.readFileSync(file));
    event.status = "attempting"; fs.writeFileSync(file, JSON.stringify(event));
  }
  await createCloudEmailDelivery(f.options).flush();
  assert.equal(f.sent.length, 0);
});

test("report attachment mutation after queueing is blocked", async t => {
  const f = fixture(t);
  f.delivery.queueReport(f.projectId, f.manifestPath);
  fs.appendFileSync(path.join(f.projectRoot, "working/final-agency-report.docx"), "unexpected");
  await f.delivery.flush();
  assert.equal(f.sent.length, 0);
  assert.equal(f.delivery.status(f.projectId).states["customer-report"], "held");
});

test("restart recovers a completed report only for requests opted into this outbox", async t => {
  const f = fixture(t);
  f.delivery.recoverReports();
  await f.delivery.flush();
  assert.equal(f.sent.length, 0);
  f.delivery.queueIntake(f.projectId);
  await f.delivery.flush();
  const restarted = createCloudEmailDelivery(f.options);
  restarted.recoverReports();
  await restarted.flush();
  assert.equal(f.sent.length, 3);
  restarted.recoverReports(); await restarted.flush();
  assert.equal(f.sent.length, 3);
});
