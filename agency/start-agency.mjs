#!/usr/bin/env node
/**
 * Starts the safe, Phase 1 agency intake loop from one command.
 * Gmail intake and task execution stay in their existing, audited modules.
 */

// The file-system module reads the poller's public settings file.
// It never opens OAuth data.
import fs from "node:fs";
// The path module builds paths relative to this launcher, not PowerShell's
// current folder.
import path from "node:path";
import crypto from "node:crypto";
// The URL helpers locate this module and detect direct command-line execution.
import { fileURLToPath, pathToFileURL } from "node:url";
// The promises timer lets the polling delay wait without blocking Node's event loop.
import { setTimeout as wait } from "node:timers/promises";
// The existing poller safely reads Gmail, filters messages, and adds intake
// tasks to the queue.
import {
  CONFIG_PATH as GMAIL_CONFIG_PATH,
  parseIntakeConfig,
  pollOnce,
  normalizePublicIntakeBriefSources,
  reconcileCompletedIntakes,
} from "./integrations/gmail/intake-poller.mjs";
// These orchestrator functions validate settings, list queue tasks, and execute
// guarded work.
import {
  listTasks,
  loadConfiguration,
  runOne,
  validateBrief,
  sanitizeDiagnostic,
} from "./orchestrator/orchestrator.mjs";
import { runDemo, ROSTER as DEMO_ROSTER } from "./demo/run-demo.mjs";
import {
  prepareDemo as prepareReport,
  prepare as preparePublicReport,
  publishDemoAuthorized,
  prepareEmail,
  sendDemoConfirmationAuthorized,
  publishAutomaticWorkflowProgress,
  publishAutomaticWorkflowReport,
  sendAutomaticWorkflowReport,
  sendCustomerClarification,
  sendCustomerNotification,
} from "./integrations/reporting/reporting.mjs";
import { createDemoPolicy, loadDemoPolicy, reserveDemoAgentRun } from "./demo/demo-policy.mjs";
import { evaluatePublicPreliminary, loadAuthorizedPublicReview, reservePublicExecution, withPublicIntakeSlot } from "./integrations/gmail/public-intake-policy.mjs";

// This absolute path anchors configuration so the command works from any directory.
const LAUNCHER_PATH = fileURLToPath(import.meta.url);
const AGENCY_ROOT = path.dirname(LAUNCHER_PATH);
const WORKSPACE_ROOT = path.dirname(AGENCY_ROOT);

// Reading path for beginners:
// 1. Load configuration and select a Client Manager intake task.
// 2. Turn a staged email into a structured brief.
// 3. Check eligibility before running the eight specialist routines.
// 4. Save local progress; publish or send only when its policy allows it.

// Print only operational metadata; never print email addresses, message bodies,
// or credentials.
export function createTerminalFilter(historicalWaiting = []) {
  const last = new Map();
  const waiting = new Set(historicalWaiting);
  return message => {
    if (/^(Queue scan complete: no eligible|Monitoring resumed\.|Gmail monitoring: check complete; 0 new)/.test(message)) return false;
    if (message.startsWith("Client intake reconciled:")) return false;
    if (message.startsWith("Preliminary readiness decision:")) {
      const project = message.match(/(?:project[ ;]+)(INTAKE-[a-z0-9]+)/i)?.[1];
      if (project && waiting.has(project)) {
        if (message.includes("decision: onboarding_incomplete;")) return false;
        waiting.delete(project);
      }
      const key = project || message;
      if (last.get(key) === message) return false;
      if (last.size >= 1000 && !last.has(key)) last.delete(last.keys().next().value);
      last.set(key, message);
    }
    return true;
  };
}
const historicalWaiting = (() => {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(AGENCY_ROOT, "state", "automatic-workflows.json"), "utf8"));
    return Object.entries(saved.projects || {}).filter(([, row]) => row.status === "onboarding_incomplete").map(([id]) => id);
  } catch { return []; }
})();
const showTerminalMessage = createTerminalFilter(historicalWaiting);
function log(message) {
  if (!showTerminalMessage(message)) return;
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(new Date());
  process.stdout.write(`[${time}] ${message}\n`);
}

/**
 * Read the public Gmail settings and validate the agency configuration.
 * @param {object} options Optional read and configuration hooks for isolated tests.
 * @returns {object} Validated settings and Gmail polling options.
 */
export function loadLauncherConfiguration({
  readFile = fs.readFileSync,
  settingsLoader = loadConfiguration,
  configPath = GMAIL_CONFIG_PATH,
  workspaceRoot = WORKSPACE_ROOT,
} = {}) {
  const gmailConfigText = readFile(configPath, "utf8");
  const gmailConfig = parseIntakeConfig(gmailConfigText);
  const settings = settingsLoader(workspaceRoot);
  return { gmailConfig, settings };
}

/**
 * Keep queue selection limited to the Phase 1 Client Manager intake routine.
 * @param {object[]} tasks Tasks returned by the orchestrator's queue reader.
 * @returns {object[]} Pending Client Manager intake tasks.
 */
export function selectEligibleIntakeTasks(tasks) {
  return tasks.filter(
    (task) =>
      task.status === "pending" &&
      task.employeeId === "client-manager" &&
      task.routine === "client-intake",
  );
}

// INTAKE TO REPORT
// This is the main handoff from a completed intake brief to specialist work.
/** Run downstream employees once for a completed, non-staging client intake. */
export async function processCompletedIntakes(settings, {
  getTasks = listTasks,
  executeDemo = runDemo,
  prepare = prepareReport,
  publish = publishDemoAuthorized,
  preparePublic = (manifestPath) => preparePublicReport(manifestPath, undefined, { quiet: true }),
  publishProgress = publishAutomaticWorkflowProgress,
  publishPublicReport = publishAutomaticWorkflowReport,
  sendPublicReport = sendAutomaticWorkflowReport,
  requestCustomerInformation = sendCustomerClarification,
  notifyCustomer = sendCustomerNotification,
  prepareConfirmation = prepareEmail,
  sendConfirmation = sendDemoConfirmationAuthorized,
  isDemoProject = isAuthorizedDemoProject,
  reserveAgentRun = reserveDemoAgentRun,
  writeLog = log,
  demoPolicy = null,
  reconcileIntakes = () => [],
  reconciledProjectIds = new Set(),
} = {}) {
  const stateFile = path.join(path.dirname(settings.projectsRoot), "state", "automatic-workflows.json");
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  let state = { schemaVersion: 1, projects: {}, messages: {} };
  try { state = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!state.projects || typeof state.projects !== "object") state.projects = {};
  if (!state.messages || typeof state.messages !== "object") state.messages = {};
  // A successful local recovery is new evidence, not another failed agent retry.
  for (const [projectId, previous] of Object.entries(state.projects)) {
    if (previous.code !== "AGENT_VALIDATION_INCOMPLETE" ||
        !["retryable_failure", "needs_review"].includes(previous.status) ||
        ["sent", "attempting", "ambiguous"].includes(previous.deliveryStatus)) continue;
    if (!/^INTAKE-[a-z0-9]+$/i.test(projectId)) continue;
    const recovered = findLatestCompletedManifest(path.join(settings.projectsRoot, projectId), projectId);
    if (!recovered || recovered.manifestPath === previous.manifestPath ||
        String(recovered.manifest.finishedAt) <= String(previous.lastAttemptAt || "")) continue;
    previous.recoveryHistory = [...(previous.recoveryHistory || []), {
      at: new Date().toISOString(), priorStatus: previous.status,
      priorAttempts: previous.attempts, priorManifestPath: previous.manifestPath,
      priorPlanId: previous.planId || null, reason: "completed_recovery_manifest",
    }];
    Object.assign(previous, { status: "manifest_ready", manifestPath: recovered.manifestPath,
      runId: recovered.manifest.runId, attempts: 0, code: null, nextRetryAt: null,
      planId: null, dashboardStatus: "not_started", deliveryStatus: "not_started" });
    writeWorkflowState(stateFile, state);
    writeLog(`Completed recovery detected for project ${projectId}; resuming validated reporting.`);
  }
  // Reconcile completed Gmail classifications before evaluating their public lane.
  const reconciled = reconcileIntakes(settings, { demoPolicy });
  for (const row of reconciled || []) {
    if (row.projectId && row.category)
      writeLog(`Client intake reconciled: ${row.projectId}; classification ${row.category}; status ${row.preparationStatus || row.status || "recorded"}.`);
  }
  const completed = getTasks(settings, "completed").filter((task) => {
    if (task.employeeId !== "client-manager" || task.routine !== "client-intake") return false;
    const previous = state.projects[task.projectId];
    if (previous && ["completed", "needs_review"].includes(previous.status)) return false;
    if (previous?.taskId && previous.taskId !== task.id) return false;
    if (previous?.status === "awaiting_customer_information" && previous.customerContactStatus === "awaiting_response") return false;
    const automaticPolicyPath = path.join(path.dirname(settings.projectsRoot), "integrations", "reporting", "automatic-workflow-policy.json");
    if (previous?.status === "preliminary_report_ready" && previous.code === "WORKFLOW_POLICY_MISSING" && !fs.existsSync(automaticPolicyPath)) return false;
    const customerContactPolicyPath = path.join(path.dirname(settings.projectsRoot), "integrations", "reporting", "customer-contact-policy.json");
    const customerSendTokenPath = path.join(path.dirname(settings.projectsRoot), "integrations", "reporting", "private", "customer-send-tokens.json");
    if (previous?.status === "onboarding_incomplete" && previous.customerContactStatus === "authorization_required" &&
        (!fs.existsSync(customerContactPolicyPath) || (!fs.existsSync(customerSendTokenPath) &&
          !fs.existsSync(path.join(path.dirname(settings.projectsRoot), "integrations", "reporting", "private", "gmail-send-tokens.json"))))) return false;
    if (previous?.status === "awaiting_customer_information" && previous.customerContactStatus === "awaiting_response") return false;
    if (previous?.status === "retryable_failure" &&
        ((previous.attempts || 0) >= 3 || Date.parse(previous.nextRetryAt || "") > Date.now())) return false;
    if (previous?.status === "running" && Date.parse(previous.leaseUntil || "") > Date.now()) return false;
    if (previous?.status === "blocked" && previous.reason !== "validated public intake record unavailable") return false;
    if (previous?.status === "agent_rate_limited" && previous.limitedDay >= new Date().toISOString().slice(0, 10)) return false;
    return task.projectId.startsWith("INTAKE-") || isDemoProject(task.projectId, demoPolicy);
  });
  for (const task of completed) {
    const projectId = task.projectId;
    const preliminary = projectId.startsWith("INTAKE-");
    // Persist each phase so a restart resumes the same manifest and reporting plan.
    const projectRoot = path.join(settings.projectsRoot, projectId);
    const sourceIdentity = readProjectSourceIdentity(projectRoot);
    const workflow = state.projects[projectId] || { taskId: task.id, startedAt: new Date().toISOString() };
    workflow.projectId = projectId;
    workflow.gmailMessageId = sourceIdentity.messageId || workflow.gmailMessageId || null;
    workflow.senderPolicyId = sourceIdentity.policyId || workflow.senderPolicyId || null;
    workflow.attempts = (workflow.attempts || 0) + 1;
    workflow.lastAttemptAt = new Date().toISOString();
    workflow.leaseUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    workflow.status = "running";
    workflow.taskId = task.id;
    state.projects[projectId] = workflow;
    writeWorkflowState(stateFile, state);
    try {
      let briefCheck;
      try { briefCheck = validateBrief(projectRoot, projectId); }
      catch { briefCheck = { valid: false }; }
      const briefPath = path.join(projectRoot, "working", "client-brief.json");
      const rawBrief = briefCheck.valid ? JSON.parse(fs.readFileSync(briefPath, "utf8").replace(/^\uFEFF/, "")) : null;
      const brief = preliminary ? normalizePublicIntakeBriefSources(projectRoot, rawBrief) : rawBrief;
      // Require concrete scope context before asking specialists to draft a readiness assessment.
      const missing = [];
      if (!briefCheck.valid) missing.push("validated client brief");
      if (!preliminary && brief && !brief.known_facts?.length) missing.push("verified organization facts");
      if (!preliminary && brief && !hasSourceBackedFacts(projectRoot, brief)) missing.push("source paths for organization facts");
      if (brief && !brief.systems?.length) missing.push("systems in scope");
      if (brief && !brief.locations?.length) missing.push("operating locations");
      let publicEligibility = null;
      let publicRecord = null;
      if (preliminary) {
        const record = readPublicIntakeRecord(projectRoot);
        publicRecord = record;
        if (!record) {
          const status = "blocked";
          state.projects[projectId] = { status, readinessDecision: status, taskId: task.id, reason: "validated public intake record unavailable", missing: ["validated public intake record"] };
          writeLog(`Client intake reconciliation blocked: ${projectId}; validated public intake record unavailable or unsafe.`);
          writeLog(`Preliminary readiness decision: blocked; project ${projectId}; missing validated public intake record.`);
          writeWorkflowState(stateFile, state);
          continue;
        }
        const review = loadAuthorizedPublicReview(projectId, path.join(path.dirname(settings.projectsRoot), "state", "public-review-decisions.json"));
        const eligibility = evaluatePublicPreliminary({ record, brief, projectRoot, authorizedReview: review });
        if (eligibility.invalid) {
          state.projects[projectId] = { status: "blocked", readinessDecision: "blocked", taskId: task.id, reason: "public intake record failed validation", missing: eligibility.missing };
          writeLog(`Client intake reconciliation blocked: ${projectId}; public intake record failed validation.`);
          writeLog(`Preliminary readiness decision: blocked; project ${projectId}; reason public intake record failed validation.`);
          writeWorkflowState(stateFile, state);
          continue;
        }
        if (!reconciledProjectIds.has(projectId))
          writeLog(`Client intake reconciled: ${projectId}; validated public record status ${record.preparationStatus}.`);
        publicEligibility = eligibility;
        if (!eligibility.eligible) missing.push(...eligibility.missing);
      }
      if (publicEligibility?.securityBlocked) {
        state.projects[projectId] = { ...workflow, status: "blocked", readinessDecision: "blocked", reason: "PUBLIC_SECURITY_REVIEW_REQUIRED", taskId: task.id };
        writeWorkflowState(stateFile, state);
        writeLog(`Specialist dispatch blocked: project ${projectId}; reason PUBLIC_SECURITY_REVIEW_REQUIRED.`);
        continue;
      }
      if (preliminary && !workflow.customerAcknowledgment) {
        try { workflow.customerAcknowledgment = (await notifyCustomer({ projectId, kind: "acknowledgment" })).outcome; }
        catch (error) {
          workflow.customerAcknowledgment = /^[A-Z0-9_-]{1,64}$/.test(error.code || "") ? error.code : "CUSTOMER_NOTICE_FAILED";
          writeLog(`Customer acknowledgment unavailable for project ${projectId}; ${workflow.customerAcknowledgment}.`);
        }
      }
      if (missing.length) {
        const incomplete = { ...workflow, status: "onboarding_incomplete", ...(preliminary ? { readinessDecision: "onboarding_incomplete" } : {}), taskId: task.id, missing };
        if (preliminary && publicEligibility?.eligible && publicRecord?.preparationStatus === "onboarding_incomplete") {
          try {
            const followup = await requestCustomerInformation({ projectId, missingInformation: publicRecord.missingInformation });
            incomplete.customerContactStatus = followup.outcome === "sent" || followup.outcome === "awaiting_response"
              ? "awaiting_response" : followup.outcome;
            if (followup.outcome === "sent" || followup.outcome === "awaiting_response") incomplete.status = "awaiting_customer_information";
          } catch (error) {
            incomplete.customerContactStatus = error.code === "CUSTOMER_CONTACT_POLICY_MISSING" ? "authorization_required" : "failed";
            incomplete.customerContactFailureCode = /^[A-Z0-9_-]{1,48}$/i.test(String(error.code || "")) ? error.code : "CUSTOMER_CONTACT_FAILED";
            if (/^CUSTOMER_SEND_/.test(incomplete.customerContactFailureCode)) {
              incomplete.status = "needs_review";
              incomplete.deliveryStatus = "ambiguous";
            }
            if (["CUSTOMER_CLARIFICATION_SOURCE", "CUSTOMER_SENDER_MISMATCH", "CUSTOMER_CONTACT_POLICY_INVALID"].includes(incomplete.customerContactFailureCode))
              incomplete.status = "needs_review";
          }
        }
        state.projects[projectId] = incomplete;
        writeLog(preliminary
          ? `Preliminary readiness decision: ${incomplete.status}; project ${projectId}; reason INTAKE_DATA_INCOMPLETE (${missing.length} required items).`
          : `Client project ${projectId}: onboarding incomplete; reason INTAKE_DATA_INCOMPLETE (${missing.length} required items).`);
        writeWorkflowState(stateFile, state);
        continue;
      }
      if (preliminary) {
        // Re-read the security classification and external review ledger at the
        // dispatch boundary. Saved readiness state is deliberately not authority.
        const currentBrief = normalizePublicIntakeBriefSources(projectRoot, JSON.parse(fs.readFileSync(briefPath, "utf8").replace(/^\uFEFF/, "")));
        const currentRecord = readPublicIntakeRecord(projectRoot);
        const currentReview = loadAuthorizedPublicReview(projectId, path.join(path.dirname(settings.projectsRoot), "state", "public-review-decisions.json"));
        const dispatchEligibility = evaluatePublicPreliminary({ record: currentRecord, brief: currentBrief, projectRoot, authorizedReview: currentReview });
        if (!dispatchEligibility.eligible) {
          workflow.status = "blocked";
          workflow.reason = "PUBLIC_SECURITY_REVIEW_REQUIRED";
          workflow.readinessDecision = "blocked";
          workflow.missing = dispatchEligibility.missing;
          state.projects[projectId] = workflow;
          writeWorkflowState(stateFile, state);
          writeLog(`Specialist dispatch blocked: project ${projectId}; reason PUBLIC_SECURITY_REVIEW_REQUIRED.`);
          continue;
        }
        workflow.readinessDecision = "preliminary_ready";
        workflow.readinessDecidedAt = new Date().toISOString();
        writeWorkflowState(stateFile, state);
        writeLog(`Preliminary readiness decision: preliminary_ready; project ${projectId}; identity and client claims remain unverified.`);
      }
      let result = null;
      if (workflow.manifestPath && fs.existsSync(workflow.manifestPath)) {
        try { result = { manifestPath: workflow.manifestPath, manifest: JSON.parse(fs.readFileSync(workflow.manifestPath, "utf8")) }; }
        catch { result = null; }
      }
      if (!result) result = findLatestCompletedManifest(projectRoot, projectId);
      if (!result || result.manifest.finalStatus !== "completed") {
        writeLog(`Assessment starting: project ${projectId}.`);
        let validatedCount = 0;
        const reported = new Set();
        const stateRoot = path.join(path.dirname(settings.projectsRoot), "state");
        const slot = await withPublicIntakeSlot(path.join(stateRoot, `specialist-${projectId}.lock`), async () => {
          // Recheck the classification after taking a cross-process project lock.
          if (preliminary) {
            let currentBrief;
            try { currentBrief = normalizePublicIntakeBriefSources(projectRoot, JSON.parse(fs.readFileSync(briefPath, "utf8").replace(/^\uFEFF/, ""))); }
            catch { return { kind: "security-blocked" }; }
            const currentRecord = readPublicIntakeRecord(projectRoot);
            const currentReview = loadAuthorizedPublicReview(projectId, path.join(stateRoot, "public-review-decisions.json"));
            if (!evaluatePublicPreliminary({ record: currentRecord, brief: currentBrief, projectRoot, authorizedReview: currentReview }).eligible)
              return { kind: "security-blocked" };
          }
          // Another launcher may have finished while this one waited for the lock.
          const completedNow = findLatestCompletedManifest(projectRoot, projectId);
          if (completedNow) return { kind: "ready", result: completedNow };
          const capacity = preliminary
            ? reservePublicExecution(`${task.id}:preliminary-specialists`, path.join(stateRoot, "public-specialist-usage.json"))
            : reserveAgentRun(demoPolicy, projectId, path.join(stateRoot, "demo-agent-usage.json"));
          if (!capacity.allowed) return { kind: "rate-limited" };
          const executed = await executeDemo({ workspaceRoot: settings.workspaceRoot, projectId,
            onProgress: async ({ status, employeeId, runId, valid, reasonCode }) => {
            const terminal = ["completed", "reused-validated", "blocked", "failed"].includes(status);
            if (terminal && !reported.has(employeeId)) { reported.add(employeeId); if (valid) validatedCount += 1; }
            workflow.runId = runId || workflow.runId;
            workflow.agentStatuses ||= Object.fromEntries(DEMO_ROSTER.map((entry) => [entry.employeeId, "not_started"]));
            if (employeeId && Object.hasOwn(workflow.agentStatuses, employeeId))
              workflow.agentStatuses[employeeId] = status;
            workflow.agentProgress = {
              completed: Object.values(workflow.agentStatuses).filter((value) => ["completed", "reused-validated"].includes(value)).length,
              total: DEMO_ROSTER.length,
              updatedAt: new Date().toISOString(),
            };
            workflow.status = "agents_running";
            workflow.dashboardStatus = "local_progress_recorded";
            state.projects[projectId] = workflow;
            writeWorkflowState(stateFile, state);
            if (preliminary && runId) {
              try {
                const published = await publishProgress({ projectId, runId, agentStatuses: workflow.agentStatuses });
                workflow.dashboardStatus = published.dashboardStatus;
                delete workflow.dashboardFailureCode;
              } catch (error) {
                workflow.dashboardStatus = error.code === "WORKFLOW_POLICY_MISSING" ? "authorization_required" : "retryable_failure";
                workflow.dashboardFailureCode = /^[A-Z0-9_-]{1,48}$/i.test(String(error.code || "")) ? error.code : "DASHBOARD_UPDATE_FAILED";
              }
              state.projects[projectId] = workflow;
              writeWorkflowState(stateFile, state);
            }
            const display = status === "started" ? "STARTED" : status === "completed" ? "COMPLETED" : status === "reused-validated" ? "REUSED" : status === "blocked" ? "BLOCKED" : status === "failed" ? "FAILED" : String(status).toUpperCase();
            const safeCode = typeof reasonCode === "string" && /^[A-Z0-9_-]{1,48}$/i.test(reasonCode) ? reasonCode : null;
            writeLog(`Employee ${display}: ${employeeId}; progress ${validatedCount}/8 validated; project ${projectId}${safeCode ? `; reason ${safeCode}` : ""}.`);
            } });
          return { kind: "ready", result: executed };
        });
        if (!slot.acquired) {
          workflow.status = "specialist_slot_busy";
          state.projects[projectId] = workflow;
          writeWorkflowState(stateFile, state);
          writeLog(`Specialist dispatch deferred: project ${projectId}; reason PROJECT_EXECUTION_LOCKED.`);
          continue;
        }
        if (slot.value.kind === "security-blocked") {
          workflow.status = "blocked";
          workflow.reason = "PUBLIC_SECURITY_REVIEW_REQUIRED";
          workflow.readinessDecision = "blocked";
          state.projects[projectId] = workflow;
          writeWorkflowState(stateFile, state);
          writeLog(`Specialist dispatch blocked: project ${projectId}; reason PUBLIC_SECURITY_REVIEW_REQUIRED.`);
          continue;
        }
        if (slot.value.kind === "rate-limited") {
          workflow.status = "agent_rate_limited";
          workflow.limitedDay = new Date().toISOString().slice(0, 10);
          state.projects[projectId] = workflow;
          writeLog(`Specialist execution limit reached for ${projectId}; queued for the next UTC day.`);
          writeWorkflowState(stateFile, state);
          continue;
        }
        result = slot.value.result;
      }
      if (result.manifest.finalStatus !== "completed") {
        if (Array.isArray(result.manifest.agents) && result.manifest.agents.length)
          workflow.agentStatuses = Object.fromEntries(result.manifest.agents.map((agent) => [agent.employeeId, agent.status || "unknown"]));
        Object.assign(workflow, { status: "retryable_failure", taskId: task.id, manifestPath: result.manifestPath, code: "AGENT_VALIDATION_INCOMPLETE", nextRetryAt: retryAt(workflow.attempts) });
        state.projects[projectId] = workflow;
        writeLog(`Specialist workflow blocked: project ${projectId}; employee validation incomplete.`);
        writeWorkflowState(stateFile, state);
        continue;
      }
      workflow.manifestPath = result.manifestPath;
      workflow.runId = result.manifest.runId;
      if (Array.isArray(result.manifest.agents) && result.manifest.agents.length)
        workflow.agentStatuses = Object.fromEntries(result.manifest.agents.map((agent) => [agent.employeeId, agent.status]));
      workflow.status = "manifest_ready";
      writeWorkflowState(stateFile, state);
      if (preliminary) {
        workflow.status = "preliminary_report_ready";
        workflow.assessmentType = "PUBLIC_PRELIMINARY_UNVERIFIED";
        workflow.reportingAuthorization = "automatic-workflow-policy-required";
        writeWorkflowState(stateFile, state);
        const plan = workflow.planId ? { planId: workflow.planId } : preparePublic(result.manifestPath);
        workflow.planId = plan.planId;
        workflow.status = "reporting_prepared";
        state.projects[projectId] = workflow;
        writeWorkflowState(stateFile, state);
        try {
          await publishPublicReport(plan.planId);
          workflow.dashboardStatus = "published";
          workflow.reportingAuthorization = "automatic-workflow-policy";
          prepareConfirmation(plan.planId, { quiet: true });
          workflow.deliveryStatus = "prepared";
          workflow.status = "confirmation_prepared";
          state.projects[projectId] = workflow;
          writeWorkflowState(stateFile, state);
          await sendPublicReport(plan.planId);
          workflow.status = "completed";
          workflow.deliveryStatus = "sent";
          workflow.completedAt = new Date().toISOString();
          workflow.publishedManifestPath = result.manifestPath;
          try { workflow.customerCompletion = (await notifyCustomer({ projectId, kind: "completion", manifestPath: result.manifestPath })).outcome; }
          catch (error) {
            workflow.customerCompletion = /^[A-Z0-9_-]{1,64}$/.test(error.code || "") ? error.code : "CUSTOMER_NOTICE_FAILED";
            writeLog(`Customer completion notice unavailable for project ${projectId}; ${workflow.customerCompletion}.`);
          }
          writeLog(`Final report completed for project ${projectId}, manifest ${workflow.runId}; dashboard published and internal report delivered.`);
        } catch (error) {
          if (error.code === "WORKFLOW_POLICY_MISSING") {
            workflow.status = "preliminary_report_ready";
            workflow.dashboardStatus = "authorization_required";
            workflow.deliveryStatus = "authorization_required";
            workflow.code = error.code;
            writeLog(`Final report ready for project ${projectId}; automatic dashboard and delivery policy must be configured.`);
          } else throw error;
        }
        state.projects[projectId] = workflow;
        writeWorkflowState(stateFile, state);
        continue;
      }
      const plan = workflow.planId ? { planId: workflow.planId } : prepare(result.manifestPath);
      workflow.planId = plan.planId;
      workflow.status = "reporting_prepared";
      workflow.dashboardStatus = "prepared";
      writeWorkflowState(stateFile, state);
      writeLog(`Reporting prepared for project ${projectId}, manifest ${workflow.runId}.`);
      await publish(plan.planId);
      workflow.status = "reporting_published";
      workflow.dashboardStatus = "published";
      writeWorkflowState(stateFile, state);
      writeLog(`Reporting published for project ${projectId}, manifest ${workflow.runId}.`);
      prepareConfirmation(plan.planId, { quiet: true });
      workflow.status = "confirmation_prepared";
      workflow.deliveryStatus = "prepared";
      writeWorkflowState(stateFile, state);
      await sendConfirmation(plan.planId);
      workflow.status = "completed";
      workflow.deliveryStatus = "sent";
      workflow.completedAt = new Date().toISOString();
      workflow.publishedManifestPath = result.manifestPath;
      writeLog(`Agency confirmation sent for project ${projectId}, manifest ${workflow.runId}.`);
    } catch (error) {
      const code = /^[A-Z0-9_-]{1,64}$/i.test(String(error.code || "")) ? error.code : "WORKFLOW_ERROR";
      const ambiguousDelivery = /^SEND_|^EMAIL_STATE$/.test(code) || workflow.deliveryStatus === "attempting";
      const requiresReview = ambiguousDelivery || /^(DEMO_POLICY|DEMO_PROJECT_SCOPE|DEMO_MANIFEST_BINDING|APPROVAL_TARGET|ACL_)/.test(code);
      Object.assign(workflow, {
        status: requiresReview || workflow.attempts >= 3 ? "needs_review" : "retryable_failure",
        taskId: task.id,
        code,
        ...(requiresReview || workflow.attempts >= 3 ? {} : { nextRetryAt: retryAt(workflow.attempts) }),
        ...(ambiguousDelivery ? { deliveryStatus: "ambiguous" } : {}),
        ...(code.startsWith("SHEETS_") ? { dashboardStatus: "retryable_failure" } : {}),
      });
      state.projects[projectId] = workflow;
      writeLog(`Specialist workflow failed: project ${projectId}; reason ${error.code || "WORKFLOW_ERROR"}.`);
    }
    writeWorkflowState(stateFile, state);
  }
}

function retryAt(attempt) {
  const delaySeconds = Math.min(300, 15 * 2 ** Math.max(0, attempt - 1));
  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

function readProjectSourceIdentity(projectRoot) {
  try {
    const root = fs.realpathSync(projectRoot);
    const markerPath = path.join(root, "project.json");
    if (fs.lstatSync(markerPath).isSymbolicLink() || !fs.statSync(markerPath).isFile()) return {};
    const relative = path.relative(root, fs.realpathSync(markerPath));
    if (relative !== "project.json") return {};
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    if (marker.projectId !== path.basename(root) || marker.projectType !== "client") return {};
    return { messageId: marker.sourceMessageId || null, policyId: marker.demoPolicyId || null };
  } catch { return {}; }
}

function writeWorkflowState(file, state) {
  const now = new Date().toISOString();
  for (const [projectId, workflow] of Object.entries(state.projects || {})) {
    const messageId = workflow.gmailMessageId;
    if (!messageId) continue;
    const prior = state.messages[messageId] || { createdAt: now };
    state.messages[messageId] = {
      ...prior,
      gmailMessageId: messageId,
      projectId,
      runId: workflow.runId || null,
      status: workflow.status,
      dashboardStatus: workflow.dashboardStatus || "not_started",
      deliveryStatus: workflow.deliveryStatus || "not_started",
      agentStatuses: workflow.agentStatuses || {},
      attempts: workflow.attempts || 0,
      updatedAt: now,
    };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  fs.renameSync(temp, file);
  if (process.platform !== "win32") fs.chmodSync(file, 0o600);
}

/** Read a public decision only from a regular file inside the selected project. */
function readPublicIntakeRecord(projectRoot) {
  const working = path.join(projectRoot, "working");
  const recordPath = path.join(working, "public-intake-record.json");
  try {
    const realRoot = fs.realpathSync(projectRoot);
    const realWorking = fs.realpathSync(working);
    const realRecord = fs.realpathSync(recordPath);
    const relative = path.relative(realRoot, realRecord);
    if (fs.lstatSync(working).isSymbolicLink() || fs.lstatSync(recordPath).isSymbolicLink() ||
        !fs.statSync(recordPath).isFile() || realWorking !== path.join(realRoot, "working") ||
        relative !== path.join("working", "public-intake-record.json")) return null;
    return JSON.parse(fs.readFileSync(realRecord, "utf8").replace(/^\uFEFF/, ""));
  } catch { return null; }
}

/** Require each organization fact to cite an existing in-project source file. */
function hasSourceBackedFacts(projectRoot, brief) {
  if (!Array.isArray(brief.known_facts) || !brief.known_facts.length) return false;
  return brief.known_facts.every((fact) => {
    const source = typeof fact?.source === "string" ? fact.source : fact?.source_path;
    if (typeof source !== "string" || !source.trim() || !brief.sources?.includes(source) ||
        path.isAbsolute(source) || source.split(/[\\/]/).includes("..")) return false;
    const target = path.resolve(projectRoot, source);
    const relative = path.relative(projectRoot, target);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(target)) return false;
    try { return fs.statSync(target).isFile() && !fs.lstatSync(target).isSymbolicLink(); }
    catch { return false; }
  });
}

/** Recover the most recent completed run after a crash before workflow state was updated. */
function findLatestCompletedManifest(projectRoot, projectId) {
  const runsRoot = path.join(projectRoot, "logs", "demo-runs");
  if (!fs.existsSync(runsRoot)) return null;
  const candidates = [];
  for (const entry of fs.readdirSync(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(runsRoot, entry.name, "manifest.json");
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest.projectId === projectId && manifest.finalStatus === "completed" && manifest.dryRun === false)
        candidates.push({ manifestPath, manifest });
    } catch { /* Ignore incomplete run folders; runDemo owns their recovery. */ }
  }
  candidates.sort((a, b) => String(b.manifest.finishedAt).localeCompare(String(a.manifest.finishedAt)));
  return candidates[0] || null;
}

function isAuthorizedDemoProject(projectId, policy) {
  if (!policy) return false;
  const file = path.join(AGENCY_ROOT, "state", "demo-project-authorizations.json");
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data.schemaVersion === 1 && data.projects?.[projectId]?.policyId === policy.policyId;
  } catch { return false; }
}

/**
 * Dispatch eligible queue work through the existing orchestrator.
 * @param {object} settings Validated agency and queue settings.
 * @param {object} options Queue, execution, and logging hooks for tests.
 * @returns {Promise<object[]>} Outcomes returned by the orchestrator.
 */
export async function dispatchPendingTasks(settings, {
  getTasks = listTasks,
  executeTask = runOne,
  reserveExecution = reservePublicExecution,
  intakeSlot = withPublicIntakeSlot,
  writeLog = log,
} = {}) {
  const pendingTasks = selectEligibleIntakeTasks(getTasks(settings, "pending"));
  if (pendingTasks.length === 0) {
    writeLog("Queue scan complete: no eligible Client Manager intake tasks.");
    return [];
  }

  const outcomes = [];
  for (const task of pendingTasks) {
    const projectLabel = task.projectId.startsWith("INTAKE-") ? "staged intake" : `project ${task.projectId}`;
      writeLog(task.projectId.startsWith("INTAKE-")
        ? "Inquiry detected; Client Manager started on staged intake."
        : `Employee started: client-manager; project ${task.projectId}.`);
    try {
      // runOne owns task approval, guard, lease, retry, and output validation checks.
      // The LLM-powered Client Manager actually runs inside the Codex subprocess
      // started by runOne; selection and this launcher are deterministic JavaScript.
      let outcome;
      if (task.intakeStage) {
        const usage = reserveExecution(task.id,
          path.join(path.dirname(settings.projectsRoot), "state", "public-ai-usage.json"));
        if (!usage.allowed) {
          writeLog("Public inquiry AI usage limit reached; intake remains queued for the next UTC day.");
          continue;
        }
        const run = await intakeSlot(
          path.join(path.dirname(settings.projectsRoot), "state", "public-intake-concurrency.lock"),
          () => executeTask(settings, { taskId: task.id }),
        );
        if (!run.acquired) {
          writeLog("Public inquiry AI slot is occupied; intake remains queued.");
          continue;
        }
        outcome = run.value;
      } else {
        outcome = await executeTask(settings, { taskId: task.id });
      }
      outcomes.push(outcome);
      if (outcome.outcome === "completed") {
        writeLog(task.projectId.startsWith("INTAKE-")
          ? "Employee completed: client-manager intake classification."
          : `Employee completed: client-manager; ${projectLabel}.`);
      } else if (outcome.outcome === "blocked-approval") {
        writeLog(`Client Manager task for ${projectLabel} is blocked by the existing approval policy.`);
      } else if (outcome.outcome === "retry-scheduled") {
        writeLog(
          `Client Manager failed validation or execution for ${projectLabel}; ` +
            "the orchestrator scheduled a bounded retry.",
        );
      } else {
        writeLog(`Client Manager ended with outcome ${outcome.outcome} for ${projectLabel}.`);
      }
    } catch (error) {
      // A failed launcher call is reported once. The next poll cycle can retry;
      // task attempt limits and retry timing remain enforced by the orchestrator.
      outcomes.push({ outcome: "error", taskId: task.id, code: error.code });
      writeLog(`Client Manager could not run for ${projectLabel} (${error.code || "EXECUTION_ERROR"}).`);
    }
  }
  return outcomes;
}

/**
 * Scan existing work, poll Gmail, then dispatch newly queued work in sequence.
 * @param {object} options Validated settings, service hooks, and shutdown signal.
 * @returns {Promise<void>} Resolves after graceful shutdown.
 */
export async function runAgency({
  settings,
  gmailConfig,
  poll = pollOnce,
  scanAndDispatch,
  signal,
  writeLog = log,
  waitBetweenCycles = wait,
  demoPolicy = null,
  reconcileIntakes = reconcileCompletedIntakes,
} = {}) {
  if (!settings || !gmailConfig) {
    throw new Error("Validated settings and Gmail configuration are required.");
  }

  let stopping = signal?.aborted ?? false;
  let downstreamWork = null;
  const scanQueue = async () => {
    if (scanAndDispatch) return scanAndDispatch(settings);
    // Reconcile completed historical classifications on startup and every scan.
    const reconciledBeforeDispatch = reconcileIntakes(settings, { demoPolicy });
    logPublicIntakeUpdates(reconciledBeforeDispatch, writeLog);
    await dispatchPendingTasks(settings);
    // A classification may have completed in the dispatch just above; reconcile it before specialist eligibility is decided.
    const reconciledAfterDispatch = reconcileIntakes(settings, { demoPolicy });
    logPublicIntakeUpdates(reconciledAfterDispatch || [], writeLog);
    const reconciledProjectIds = new Set([...(reconciledBeforeDispatch || []), ...(reconciledAfterDispatch || [])].map((row) => row.projectId).filter(Boolean));
    // Run specialists in the background so the inbox poll cadence stays responsive.
    if (!downstreamWork) {
      downstreamWork = processCompletedIntakes(settings, { demoPolicy, reconciledProjectIds })
        .catch((error) => writeLog(`Downstream scan failed (${error.code || "WORKFLOW_ERROR"}).`))
        .finally(() => { downstreamWork = null; });
    }
  };
  const markStopping = () => {
    stopping = true;
  };
  signal?.addEventListener("abort", markStopping, { once: true });
  // gmailConfig stores the validated 15-to-3600-second polling interval.
  writeLog(`Gmail monitoring started; checks every ${gmailConfig.pollIntervalSeconds}s.`);

  // The first scan catches tasks that were queued before this process started.
  try {
    await scanQueue();
    while (!stopping) {
      try {
        // Gmail does not start this local Node program automatically. Polling asks
        // the existing connector for new mail on a timer, then the poller
        // enqueues tasks.
        const pollResult = await poll({ settings, config: gmailConfig, demoPolicy });
        const found = pollResult?.results?.filter(
          (result) => result.outcome === "staged_for_classification",
        ).length ?? 0;
        const reviewCount = pollResult?.results?.filter(
          (result) => result.outcome === "review_required",
        ).length ?? 0;
        logPublicIntakeUpdates(
          pollResult?.results?.filter((result) => result.outcome === "classification_reconciled") || [],
          writeLog,
        );
        writeLog(`Gmail monitoring: check complete; ${found} new inquiry task${found === 1 ? "" : "s"}.`);
        if (reviewCount > 0) {
          writeLog(
            `${reviewCount} message${reviewCount === 1 ? "" : "s"} ` +
              "require human review; no approval was applied.",
          );
        }
        await scanQueue();
        writeLog("Monitoring resumed.");
      } catch (error) {
        // A transient poll or scan error is logged safely, then the normal delay
        // prevents a tight retry loop. Persisted task retry policy remains separate.
        writeLog(
          `Cycle failed (${error.code || "CYCLE_ERROR"}); ` +
            "will retry after the configured interval.",
        );
      }

      if (!stopping) {
        try {
          // Await releases the event loop while waiting. AbortSignal interrupts
          // the delay on shutdown.
          await waitBetweenCycles(
            gmailConfig.pollIntervalSeconds * 1000,
            undefined,
            { signal },
          );
        } catch (error) {
          if (error.name !== "AbortError") throw error;
          stopping = true;
        }
      }
    }
  } finally {
    // Let an active guarded run persist its final manifest/state before exit.
    if (downstreamWork) await downstreamWork;
    signal?.removeEventListener("abort", markStopping);
    writeLog("Shutdown complete; no new polling or task dispatch will start.");
  }
}

/** Print safe intake outcomes without exposing sender addresses or email content. */
function logPublicIntakeUpdates(updates, writeLog) {
  for (const row of updates) {
    const project = row.projectId ? `; project ${row.projectId}` : "";
    if (row.projectId && row.category)
      writeLog(`Client intake reconciled: ${row.projectId}; classification ${row.category}; status ${row.preparationStatus || row.status || "recorded"}.`);
    // Completed new-client tasks get their single readiness decision from downstream processing.
    if (row.projectId && row.category === "new_client_request") continue;
    if (row.projectId && ["suspicious_or_requires_review", "irrelevant_or_automated", "general_inquiry", "spam"].includes(row.category)) {
      writeLog(`Preliminary readiness decision: awaiting_review${project}; classification ${row.category}; no specialist processing was authorized.`);
      continue;
    }
    if (row.preparationStatus === "preliminary_preparation_ready_pending_identity_verification")
      writeLog(`Preliminary readiness decision: preliminary_ready${project}; seven guarded specialists may assess client-provided facts as unverified. No identity or control claims are verified.`);
    else if (row.preparationStatus === "onboarding_incomplete")
      writeLog(`Preliminary readiness decision: onboarding_incomplete${project}; reason INTAKE_DATA_INCOMPLETE (${Array.isArray(row.missingInformation) ? row.missingInformation.length : 0} required items).`);
    else if (row.status === "awaiting_onboarding_decision")
      writeLog(`Preliminary readiness decision: awaiting_review${project}; no specialist processing or response was sent.`);
    else if (row.status === "general_inquiry_review")
      writeLog(`Preliminary readiness decision: awaiting_review${project}; public general inquiry is staged for human review; no response was sent.`);
  }
}

/** Start the launcher and connect Ctrl+C to its graceful shutdown signal. */
export async function main() {
  if (process.argv[2] === "setup-demo-sender") {
    const args = {};
    const senders = [];
    for (let i = 3; i < process.argv.length; i += 1) {
      const key = process.argv[i].replace(/^--/, "");
      if (!process.argv[i].startsWith("--") || !process.argv[i + 1])
        throw new Error("Use repeated --sender <email=marker>, --by, --attest-sender-controlled true, and optional daily limits.");
      const value = process.argv[++i];
      if (key === "sender") {
        const split = value.indexOf("=");
        if (split < 1 || split === value.length - 1) throw new Error("Each --sender must be email=unique-marker.");
        senders.push({ address: value.slice(0, split).trim().toLowerCase(), marker: value.slice(split + 1) });
      } else args[key] = value;
    }
    const policy = createDemoPolicy({ senders: senders.length ? senders : undefined, senderEmail: args.email, marker: args.marker, configuredBy: args.by,
      attestSenderControlled: args["attest-sender-controlled"] === "true",
      maxPerSenderPerDay: Number(args["per-sender-daily"] || 2), maxGlobalPerDay: Number(args["global-daily"] || 5) });
    process.stdout.write(`Synthetic demo sender policy ${policy.policyId} created.\n`);
    return;
  }
  const { settings, gmailConfig } = loadLauncherConfiguration();
  const shutdownController = new AbortController();
  const requestShutdown = () => {
    log("Ctrl+C received; finishing the current operation before stopping.");
    shutdownController.abort();
  };
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);
  try {
    await runAgency({ settings, gmailConfig, signal: shutdownController.signal, demoPolicy: loadDemoPolicy() });
  } finally {
    process.removeListener("SIGINT", requestShutdown);
    process.removeListener("SIGTERM", requestShutdown);
  }
}

/** Format one safe startup diagnostic without logging stacks or client content. */
export function formatStartupFailure(error) {
  const rawCode = String(error?.code || "STARTUP_ERROR");
  const code = /^[A-Z0-9_-]{1,48}$/i.test(rawCode) ? rawCode : "STARTUP_ERROR";
  let description = sanitizeDiagnostic(error?.message || "No error description was provided.")
    .replace(/\b(?:email|message)\s*(?:body|content|payload|snippet)\s*[:=].*$/i, "[client content omitted]")
    .replace(/\b(?:file|document)\s*content\s*[:=].*$/i, "[file content omitted]")
    .replace(/(?:[A-Z]:\\|\\\\)[^\s,;]+/g, "[path]")
    .replace(/(?:^|\s)\/(?:Users|home|tmp|var|private)\/[^\s,;]+/g, " [path]")
    .trim();
  if (!description) description = "Details suppressed.";
  return `[agency] Startup failed (${code}): ${description.slice(0, 220)}.\n`;
}

// Run main only for `node agency/start-agency.mjs`, not when tests import helpers.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // The formatter omits stacks and removes common secrets and private content.
    process.stderr.write(formatStartupFailure(error));
    process.exitCode = 1;
  });
}
