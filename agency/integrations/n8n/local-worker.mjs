#!/usr/bin/env node
// Local companion service for the n8n workflow. n8n handles Google services;
// this process only stages messages and runs the existing local agent workflow.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ingestN8nMessage, loadClientRegistry, reconcileCompletedIntakes } from "../gmail/intake-poller.mjs";
import { loadConfiguration } from "../../orchestrator/orchestrator.mjs";
import { dispatchPendingTasks, processCompletedIntakes } from "../../start-agency.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PORT = Number(process.env.AGENCY_WORKER_PORT || 8787);
const HOST = process.env.AGENCY_WORKER_HOST || "127.0.0.1";
const TOKEN = process.env.AGENCY_WORKER_TOKEN || "";
const CALLBACK = process.env.N8N_EVENT_WEBHOOK_URL || "";
const CALLBACK_TOKEN = process.env.N8N_EVENT_TOKEN || "";
const FOLLOWUP_STATE = path.join(ROOT, "agency", "state", "customer-followups.json");
const settings = loadConfiguration(ROOT);
const queue = [];
let working = false;

function log(message) {
  process.stdout.write(`[${new Date().toISOString()}] [n8n-worker] ${message}\n`);
}

function equalSecret(value, expected) {
  const a = Buffer.from(String(value || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function reply(res, status, value) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  fs.renameSync(temporary, file);
}

async function sendEvent(event) {
  if (!CALLBACK || !CALLBACK_TOKEN) throw Object.assign(new Error("n8n callback is not configured"), { code: "N8N_EVENT_CONFIG" });
  const response = await fetch(CALLBACK, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${CALLBACK_TOKEN}` },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw Object.assign(new Error("n8n callback rejected the event"), { code: "N8N_CALLBACK_FAILED" });
}

// Send full report content only after all local agent outputs have passed their
// existing validation. n8n may then update Sheets and email its configured team.
function makeReport(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const projectRoot = path.resolve(manifest.projectRoot);
  const files = [];
  for (const agent of manifest.agents || []) {
    if (!agent.validation?.valid || !agent.outputPath) continue;
    const output = path.resolve(agent.outputPath);
    const relative = path.relative(projectRoot, output);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(output) ||
        fs.lstatSync(output).isSymbolicLink() || !fs.statSync(output).isFile() ||
        !fs.realpathSync(output).startsWith(fs.realpathSync(projectRoot) + path.sep)) continue;
    files.push({ employeeId: agent.employeeId, routine: agent.routine, fileName: path.basename(output), content: fs.readFileSync(output, "utf8").slice(0, 50000) });
  }
  return { manifest, files };
}

async function processQueue() {
  if (working || !queue.length) return;
  working = true;
  const entry = queue.shift();
  log(`Processing project ${entry.projectId || "unknown"}.`);
  try {
    await dispatchPendingTasks(settings);
    reconcileCompletedIntakes(settings);
    await processCompletedIntakes(settings, {
      publishProgress: async ({ projectId, runId, agentStatuses }) => {
        const completed = Object.values(agentStatuses || {}).filter((status) => ["completed", "reused-validated"].includes(status)).length;
        log(`Agent progress ${completed}/8 for ${projectId}; run ${runId}.`);
        await sendEvent({ type: "progress", projectId, runId, agentStatuses });
        return { dashboardStatus: "sent_to_n8n" };
      },
      preparePublic: (manifestPath) => ({ planId: manifestPath }),
      publishPublicReport: async (manifestPath) => {
        const report = makeReport(manifestPath);
        try {
          await sendEvent({ type: "report_ready", projectId: report.manifest.projectId, runId: report.manifest.runId,
            manifest: report.manifest, files: report.files });
        } catch {
          throw Object.assign(new Error("n8n report delivery outcome is uncertain"), { code: "SEND_N8N_AMBIGUOUS" });
        }
      },
      sendPublicReport: async () => ({ outcome: "sent_by_n8n" }),
      requestCustomerInformation: async ({ projectId, missingInformation }) => {
        const intake = loadClientRegistry().intakes.find((row) => row.stagingProjectId === projectId);
        if (!intake) throw Object.assign(new Error("Source intake record missing"), { code: "CUSTOMER_CLARIFICATION_SOURCE" });
        const sourcePath = path.join(settings.projectsRoot, projectId, "client-input", "gmail-intake.json");
        const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
        if (source.senderAuthenticationVerified !== true || !source.rfcMessageId || !intake.threadId || !source.senderEmail)
          throw Object.assign(new Error("Customer sender or reply thread is not authenticated"), { code: "CUSTOMER_CONTACT_POLICY_MISSING" });
        let state = { schemaVersion: 1, projects: {} };
        try { state = JSON.parse(fs.readFileSync(FOLLOWUP_STATE, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
        const prior = state.projects[projectId] || { projectId, sourceMessageId: intake.messageId, threadId: intake.threadId,
          recipient: source.senderEmail.toLowerCase(), sentCount: 0, responses: [] };
        if (prior.awaitingResponse) return { outcome: "awaiting_response" };
        if (["attempting", "ambiguous"].includes(prior.status))
          throw Object.assign(new Error("Prior customer send outcome is uncertain"), { code: "CUSTOMER_SEND_AMBIGUOUS" });
        if (prior.sentCount >= 2) throw Object.assign(new Error("Clarification limit reached"), { code: "CUSTOMER_CONTACT_POLICY_MISSING" });
        prior.status = "attempting";
        prior.awaitingResponse = false;
        state.projects[projectId] = prior;
        writeJsonAtomic(FOLLOWUP_STATE, state);
        try {
          await sendEvent({ type: "clarification_required", projectId, recipient: prior.recipient,
            originalMessageId: intake.messageId, missingInformation });
        } catch {
          prior.status = "ambiguous";
          writeJsonAtomic(FOLLOWUP_STATE, state);
          throw Object.assign(new Error("n8n customer reply outcome is uncertain"), { code: "CUSTOMER_SEND_AMBIGUOUS" });
        }
        prior.status = "sent";
        prior.awaitingResponse = true;
        prior.sentCount += 1;
        prior.sentAt = new Date().toISOString();
        writeJsonAtomic(FOLLOWUP_STATE, state);
        return { outcome: "awaiting_response" };
      },
    });
    log(`Processing step finished for ${entry.projectId || "unknown"}.`);
  } catch (error) {
    log(`Processing failed for ${entry.projectId || "unknown"} (${error.code || "WORKER_ERROR"}).`);
    await sendEvent({ type: "worker_error", projectId: entry.projectId, code: error.code || "WORKER_ERROR" }).catch(() => {});
  } finally {
    working = false;
    setImmediate(processQueue);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return reply(res, 200, { ok: true, queued: queue.length, working });
  if (req.method !== "POST" || req.url !== "/intake") return reply(res, 404, { error: "NOT_FOUND" });
  if (!TOKEN || !equalSecret(req.headers.authorization?.replace(/^Bearer\s+/i, ""), TOKEN))
    return reply(res, 401, { error: "UNAUTHORIZED" });
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 300000) throw Object.assign(new Error("Request too large"), { code: "BODY_TOO_LARGE" });
    }
    const result = ingestN8nMessage({ settings, message: JSON.parse(body) });
    if (result.outcome === "queued" || result.outcome === "customer_followup_received" ||
        (result.outcome === "duplicate" && result.projectId && result.taskId)) {
      queue.push({ projectId: result.projectId, taskId: result.taskId });
      log(`Queued project ${result.projectId}; outcome ${result.outcome}.`);
      setImmediate(processQueue);
    }
    return reply(res, result.outcome === "queued" || result.outcome === "duplicate" || result.outcome === "customer_followup_received" ? 202 : 200, result);
  } catch (error) {
    return reply(res, 400, { error: error.code || "INVALID_REQUEST" });
  }
});

if (!TOKEN) throw new Error("Set AGENCY_WORKER_TOKEN before starting the local worker.");
server.listen(PORT, HOST, () => process.stdout.write(`Local n8n worker listening on ${HOST}:${PORT}\n`));
