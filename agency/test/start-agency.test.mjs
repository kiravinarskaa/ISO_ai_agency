import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchPendingTasks,
  formatStartupFailure,
  processCompletedIntakes,
  runAgency,
} from "../start-agency.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function fakeTask(id, overrides = {}) {
  return {
    id,
    projectId: "INTAKE-test",
    status: "pending",
    employeeId: "client-manager",
    routine: "client-intake",
    ...overrides,
  };
}

test("startup failure description is bounded and removes secrets, paths, and client content", () => {
  const error = Object.assign(
    new Error('Initial scan failed at D:\\private\\registry.json; access_token=topsecret; sender@example.test; email body: confidential inquiry text'),
    { code: "STARTUP_ERROR\nprivate detail" },
  );
  const line = formatStartupFailure(error);
  assert.match(line, /Startup failed \(STARTUP_ERROR\):/);
  assert.ok(line.length <= 280);
  for (const secret of ["topsecret", "sender@example.test", "confidential inquiry text", "D:\\private\\registry.json", "private detail"])
    assert.equal(line.includes(secret), false);
  assert.equal(line.slice(0, -1).includes("\n"), false);
});

test("initial scan failure runs startup shutdown and produces a safe diagnostic", async () => {
  const events = [];
  const error = Object.assign(new Error("synthetic queue initialization failed"), { code: "SYNTHETIC_SCAN" });
  await assert.rejects(runAgency({
    settings: {},
    gmailConfig: { pollIntervalSeconds: 15 },
    scanAndDispatch: async () => { throw error; },
    poll: async () => assert.fail("startup scan failure must happen before Gmail polling"),
    writeLog: (line) => events.push(line),
  }), error);
  assert.equal(events[0], "Gmail monitoring started; checks every 15s.");
  assert.equal(events.at(-1), "Shutdown complete; no new polling or task dispatch will start.");
  assert.match(formatStartupFailure(error), /SYNTHETIC_SCAN\): synthetic queue initialization failed/);
});

test("initial scan dispatches already queued eligible intake tasks", async () => {
  const dispatched = [];
  const messages = [];
  await dispatchPendingTasks({}, {
    getTasks: () => [fakeTask("existing-task")],
    executeTask: async (_settings, options) => {
      dispatched.push(options.taskId);
      return { outcome: "completed", taskId: options.taskId };
    },
    writeLog: (message) => messages.push(message),
  });
  assert.deepEqual(dispatched, ["existing-task"]);
  assert.ok(messages.some((message) => message.includes("Employee completed: client-manager")));
});

test("built-in initial queue scan reconciles through the existing intake hook", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agency-startup-scan-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = {
    workspaceRoot: root,
    projectsRoot: path.join(root, "agency", "projects"),
    queueRoot: path.join(root, "agency", "queue"),
    logRoot: path.join(root, "agency", "logs"),
  };
  fs.mkdirSync(settings.projectsRoot, { recursive: true });
  for (const status of ["pending", "completed", "blocked", "failed"])
    fs.mkdirSync(path.join(settings.queueRoot, status), { recursive: true });
  let reconcileCalls = 0;
  const controller = new AbortController();
  await runAgency({
    settings,
    gmailConfig: { pollIntervalSeconds: 15 },
    reconcileIntakes: () => { reconcileCalls += 1; return []; },
    poll: async () => { controller.abort(); return { results: [] }; },
    signal: controller.signal,
    writeLog: () => {},
  });
  assert.equal(reconcileCalls, 4); // two reconciliation passes in each of two successful scans
});

test("orchestrator approval requirements prevent task execution", async () => {
  const executed = [];
  const messages = [];
  await dispatchPendingTasks({}, {
    getTasks: () => [fakeTask("needs-approval")],
    executeTask: async (_settings, options) => {
      executed.push(options.taskId);
      return { outcome: "blocked-approval", taskId: options.taskId };
    },
    writeLog: (message) => messages.push(message),
  });
  assert.deepEqual(executed, ["needs-approval"]);
  assert.ok(messages.some((message) => message.includes("blocked by the existing approval policy")));
});

test("polling discovers new tasks and dispatches them in a later scan", async () => {
  const cycleEvents = [];
  let cycleNumber = 0;
  const controller = new AbortController();
  await runAgency({
    settings: {},
    gmailConfig: { pollIntervalSeconds: 15 },
    scanAndDispatch: async () => {
      cycleEvents.push(`scan-${cycleNumber}`);
    },
    poll: async () => {
      cycleNumber += 1;
      cycleEvents.push("poll");
      controller.abort();
      return {
        results: [{ outcome: "staged_for_classification", taskId: "new-task" }],
      };
    },
    signal: controller.signal,
    writeLog: () => {},
  });
  assert.deepEqual(cycleEvents, ["scan-0", "poll", "scan-1"]);
});

test(
  "poll failures wait for the next configured interval instead of tight retrying",
  async () => {
  let polls = 0;
  let waits = 0;
  const controller = new AbortController();
  await runAgency({
    settings: {},
    gmailConfig: { pollIntervalSeconds: 15 },
    scanAndDispatch: async () => {},
    poll: async () => {
      polls += 1;
      throw Object.assign(new Error("synthetic poll failure"), {
        code: "TEST_FAILURE",
      });
    },
    signal: controller.signal,
    writeLog: () => {},
    waitBetweenCycles: async (milliseconds) => {
      assert.equal(milliseconds, 15000);
      waits += 1;
      controller.abort();
    },
  });
  assert.equal(polls, 1);
  assert.equal(waits, 1);
  },
);

function workflowFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agency-auto-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectsRoot = path.join(root, "agency", "projects");
  fs.mkdirSync(projectsRoot, { recursive: true });
  return { root, settings: { workspaceRoot: root, projectsRoot } };
}

function syntheticWorkflowHooks() {
  return { demoPolicy: { policyId: "synthetic-policy", maxGlobalPerDay: 5 }, isDemoProject: () => true,
    publish: async () => ({}), prepareConfirmation: () => ({}), sendConfirmation: async () => ({}) };
}

test("completed intake is resumed and reporting plan is tied to its manifest", async (t) => {
  const f = workflowFixture(t);
  const projectId = "CL-SYNTHETIC";
  fs.mkdirSync(path.join(f.settings.projectsRoot, projectId, "working"), { recursive: true });
  fs.mkdirSync(path.join(f.settings.projectsRoot, projectId, "client-input"), { recursive: true });
  fs.writeFileSync(path.join(f.settings.projectsRoot, projectId, "project.json"), JSON.stringify({ projectId, projectType: "client", sourceMessageId: "gmail-synthetic-1", demoPolicyId: "synthetic-policy" }));
  fs.writeFileSync(path.join(f.settings.projectsRoot, projectId, "client-input", "synthetic.txt"), "Synthetic source.");
  fs.writeFileSync(path.join(f.settings.projectsRoot, projectId, "working", "client-brief.json"), JSON.stringify({ project_id: projectId, client_objective: "readiness", scope: "synthetic scope", deadline: "unknown", systems: ["app"], locations: ["site"], known_facts: [{ fact: "synthetic", source: "client-input/synthetic.txt" }], assumptions: [], missing_information: [], sources: ["client-input/synthetic.txt"] }));
  const task = fakeTask("task-done", { projectId, status: "completed" });
  let runs = 0;
  const stages = [];
  let preparedManifest;
  const hooks = { ...syntheticWorkflowHooks(), getTasks: () => [task], executeDemo: async () => { runs++; return { manifestPath: "specific/manifest.json", manifest: { finalStatus: "completed", runId: "run-1", agents: Array.from({ length: 8 }, (_, i) => ({ employeeId: `employee-${i}`, status: "completed" })) } }; }, prepare: (manifest) => { preparedManifest = manifest; stages.push("prepare"); return { planId: "plan-1" }; }, publish: async () => { stages.push("publish"); }, prepareConfirmation: () => { stages.push("prepare-email"); }, sendConfirmation: async () => { stages.push("send"); }, writeLog: () => {} };
  await processCompletedIntakes(f.settings, hooks);
  await processCompletedIntakes(f.settings, hooks);
  assert.equal(runs, 1);
  assert.equal(preparedManifest, "specific/manifest.json");
  assert.deepEqual(stages, ["prepare", "publish", "prepare-email", "send"]);
  const state = JSON.parse(fs.readFileSync(path.join(f.root, "agency", "state", "automatic-workflows.json"), "utf8"));
  assert.equal(state.projects[projectId].runId, "run-1");
  assert.equal(state.messages["gmail-synthetic-1"].projectId, projectId);
  assert.equal(state.messages["gmail-synthetic-1"].dashboardStatus, "published");
  assert.equal(state.messages["gmail-synthetic-1"].deliveryStatus, "sent");
  assert.equal(Object.keys(state.messages["gmail-synthetic-1"].agentStatuses).length, 8);
});

test("insufficient brief is recorded as onboarding incomplete without running specialists", async (t) => {
  const f = workflowFixture(t);
  let runs = 0;
  await processCompletedIntakes(f.settings, { ...syntheticWorkflowHooks(), getTasks: () => [fakeTask("done", { projectId: "CL-MISSING", status: "completed" })], executeDemo: async () => { runs++; }, prepare: () => assert.fail("reporting must not start"), writeLog: () => {} });
  const state = JSON.parse(fs.readFileSync(path.join(f.root, "agency", "state", "automatic-workflows.json"), "utf8"));
  assert.equal(runs, 0);
  assert.equal(state.projects["CL-MISSING"].status, "onboarding_incomplete");
});

test("invalid employee run blocks reporting", async (t) => {
  const f = workflowFixture(t);
  const projectId = "CL-INVALID";
  fs.mkdirSync(path.join(f.settings.projectsRoot, projectId, "working"), { recursive: true });
  fs.mkdirSync(path.join(f.settings.projectsRoot, projectId, "client-input"), { recursive: true });
  fs.writeFileSync(path.join(f.settings.projectsRoot, projectId, "client-input", "synthetic.txt"), "Synthetic source.");
  fs.writeFileSync(path.join(f.settings.projectsRoot, projectId, "working", "client-brief.json"), JSON.stringify({ project_id: projectId, client_objective: "readiness", scope: "synthetic scope", deadline: "unknown", systems: ["app"], locations: ["site"], known_facts: [{ fact: "synthetic", source: "client-input/synthetic.txt" }], assumptions: [], missing_information: [], sources: ["client-input/synthetic.txt"] }));
  await processCompletedIntakes(f.settings, { ...syntheticWorkflowHooks(), getTasks: () => [fakeTask("done", { projectId, status: "completed" })], executeDemo: async () => ({ manifestPath: "bad/manifest.json", manifest: { finalStatus: "incomplete" } }), prepare: () => assert.fail("incomplete runs cannot be reported"), writeLog: () => {} });
  const state = JSON.parse(fs.readFileSync(path.join(f.root, "agency", "state", "automatic-workflows.json"), "utf8"));
  assert.equal(state.projects[projectId].status, "retryable_failure");
});

test("guard or AI failure is bounded to one recorded project attempt", async (t) => {
  const f = workflowFixture(t);
  const projectId = "CL-FAIL";
  fs.mkdirSync(path.join(f.settings.projectsRoot, projectId, "working"), { recursive: true });
  fs.mkdirSync(path.join(f.settings.projectsRoot, projectId, "client-input"), { recursive: true });
  fs.writeFileSync(path.join(f.settings.projectsRoot, projectId, "client-input", "synthetic.txt"), "Synthetic source.");
  fs.writeFileSync(path.join(f.settings.projectsRoot, projectId, "working", "client-brief.json"), JSON.stringify({ project_id: projectId, client_objective: "readiness", scope: "synthetic scope", deadline: "unknown", systems: ["app"], locations: ["site"], known_facts: [{ fact: "synthetic", source: "client-input/synthetic.txt" }], assumptions: [], missing_information: [], sources: ["client-input/synthetic.txt"] }));
  let attempts = 0;
  const options = { ...syntheticWorkflowHooks(), getTasks: () => [fakeTask("done", { projectId, status: "completed" })], executeDemo: async () => { attempts++; throw Object.assign(new Error("synthetic"), { code: "GUARD_DENIED" }); }, writeLog: () => {} };
  await processCompletedIntakes(f.settings, options);
  await processCompletedIntakes(f.settings, options);
  assert.equal(attempts, 1);
  const state = JSON.parse(fs.readFileSync(path.join(f.root, "agency", "state", "automatic-workflows.json"), "utf8"));
  assert.equal(state.projects[projectId].status, "retryable_failure");
});

test("Sheets failure retries the same plan after backoff; uncertain delivery is held for review", async (t) => {
  const f = workflowFixture(t);
  const projectId = "CL-RETRY";
  const projectRoot = path.join(f.settings.projectsRoot, projectId);
  fs.mkdirSync(path.join(projectRoot, "working"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "client-input"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "client-input", "source.txt"), "Synthetic source.");
  fs.writeFileSync(path.join(projectRoot, "working", "client-brief.json"), JSON.stringify({ project_id: projectId, client_objective: "readiness", scope: "synthetic scope", deadline: "unknown", systems: ["app"], locations: ["site"], known_facts: [{ fact: "synthetic", source: "client-input/source.txt" }], assumptions: [], missing_information: [], sources: ["client-input/source.txt"] }));
  const task = fakeTask("retry-task", { projectId, status: "completed" });
  let publishCalls = 0;
  let prepareCalls = 0;
  const hooks = { ...syntheticWorkflowHooks(), getTasks: () => [task], executeDemo: async () => ({ manifestPath: "fake/manifest.json", manifest: { finalStatus: "completed", runId: "retry-run" } }), prepare: () => ({ planId: `plan-${++prepareCalls}` }), publish: async () => { if (++publishCalls === 1) throw Object.assign(new Error("temporary Sheets issue"), { code: "SHEETS_API" }); }, writeLog: () => {} };
  await processCompletedIntakes(f.settings, hooks);
  const stateFile = path.join(f.root, "agency", "state", "automatic-workflows.json");
  let state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(state.projects[projectId].status, "retryable_failure");
  state.projects[projectId].nextRetryAt = new Date(0).toISOString();
  fs.writeFileSync(stateFile, JSON.stringify(state));
  hooks.publish = async () => { publishCalls++; };
  await processCompletedIntakes(f.settings, hooks);
  state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(publishCalls, 2);
  assert.equal(prepareCalls, 1);
  assert.equal(state.projects[projectId].status, "completed");

  const reviewProject = "CL-AMBIGUOUS";
  fs.mkdirSync(path.join(f.settings.projectsRoot, reviewProject, "working"), { recursive: true });
  fs.mkdirSync(path.join(f.settings.projectsRoot, reviewProject, "client-input"), { recursive: true });
  fs.writeFileSync(path.join(f.settings.projectsRoot, reviewProject, "client-input", "source.txt"), "Synthetic source.");
  fs.writeFileSync(path.join(f.settings.projectsRoot, reviewProject, "working", "client-brief.json"), JSON.stringify({ project_id: reviewProject, client_objective: "readiness", scope: "synthetic scope", deadline: "unknown", systems: ["app"], locations: ["site"], known_facts: [{ fact: "synthetic", source: "client-input/source.txt" }], assumptions: [], missing_information: [], sources: ["client-input/source.txt"] }));
  await processCompletedIntakes(f.settings, { ...hooks, getTasks: () => [fakeTask("ambiguous-task", { projectId: reviewProject, status: "completed" })], publish: async () => {}, sendConfirmation: async () => { throw Object.assign(new Error("uncertain"), { code: "SEND_AMBIGUOUS" }); }, writeLog: () => {} });
  state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(state.projects[reviewProject].status, "needs_review");
  assert.equal(state.projects[reviewProject].deliveryStatus, "ambiguous");
});

test("eligible public intake checkpoints agent progress and waits for automatic reporting policy", async (t) => {
  const f = workflowFixture(t);
  const projectId = "INTAKE-synthetic";
  const projectRoot = path.join(f.settings.projectsRoot, projectId);
  fs.mkdirSync(path.join(projectRoot, "working"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "client-input"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "client-input", "gmail-intake.json"), "Synthetic facts only.");
  const sourcePath = path.join(projectRoot, "client-input", "gmail-intake.json");
  fs.writeFileSync(path.join(projectRoot, "working", "client-brief.json"), JSON.stringify({ project_id: projectId, client_objective: "Preliminary ISO readiness", scope: "One office; named systems only", deadline: "unknown", systems: ["mail"], locations: ["Tashkent"], known_facts: [{ fact: "Client reports 20 staff", source: sourcePath }], assumptions: [], missing_information: [], sources: [sourcePath], intake_classification: { category: "new_client_request", reason: "Synthetic eligible request", claimed_organization: null } }));
  const task = fakeTask("public-done", { projectId, status: "completed" });
  let handoffs = 0;
  const hookCalls = [];
  const hooks = {
    getTasks: () => [task],
    reconcileIntakes: () => {
      fs.writeFileSync(path.join(projectRoot, "working", "public-intake-record.json"), JSON.stringify({ schemaVersion: 1, intakeLane: "public-inquiry", preparationStatus: "preliminary_preparation_ready_pending_identity_verification", senderIdentityVerified: false, organizationIdentityVerified: false, clientClaimsVerified: false, missingInformation: [] }));
      return [{ projectId, category: "new_client_request", preparationStatus: "preliminary_preparation_ready_pending_identity_verification" }];
    },
    executeDemo: async (options) => { handoffs++; await options.onProgress({ status: "completed", employeeId: "technical-controls-analyst", projectId, runId: "synthetic-run", valid: true }); return { manifestPath: "synthetic/manifest.json", manifest: { finalStatus: "completed", runId: "synthetic-run" } }; },
    publishPublicReport: async () => { throw Object.assign(new Error("policy missing"), {code:"WORKFLOW_POLICY_MISSING"}); },
    notifyCustomer: async () => ({outcome:"sent"}),
    preparePublic: () => ({ planId: "synthetic-plan" }),
    reserveAgentRun: () => assert.fail("public lane must use its separate public budget"),
    prepare: () => assert.fail("public data must not enter demo reporting"),
    publish: () => assert.fail("public data must not be published"),
    sendConfirmation: () => assert.fail("public lane must not contact sender"),
    writeLog: (line) => hookCalls.push(line),
  };
  await processCompletedIntakes(f.settings, hooks);
  await processCompletedIntakes(f.settings, hooks);
  const state = JSON.parse(fs.readFileSync(path.join(f.root, "agency", "state", "automatic-workflows.json"), "utf8"));
  assert.equal(handoffs, 1);
  assert.equal(state.projects[projectId].status, "preliminary_report_ready");
  assert.equal(state.projects[projectId].assessmentType, "PUBLIC_PRELIMINARY_UNVERIFIED");
  assert.equal(state.projects[projectId].runId, "synthetic-run");
  assert.equal(state.projects[projectId].agentStatuses["technical-controls-analyst"], "completed");
  assert.equal(state.projects[projectId].agentProgress.total, 8);
  assert.ok(hookCalls.some((line) => line.includes("Employee COMPLETED: technical-controls-analyst")));
  assert.ok(hookCalls.some((line) => line.includes("Client intake reconciled")));
  assert.ok(hookCalls.some((line) => line.includes("Preliminary readiness decision: preliminary_ready")));
  assert.ok(hookCalls.some((line) => line.includes("Final report ready for project") && line.includes("automatic dashboard and delivery policy")));
});

test("completed public intake with insufficient data is visibly persisted without specialists", async (t) => {
  const f = workflowFixture(t);
  const projectId = "INTAKE-incomplete";
  const projectRoot = path.join(f.settings.projectsRoot, projectId);
  fs.mkdirSync(path.join(projectRoot, "working"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "working", "client-brief.json"), JSON.stringify({ project_id: projectId, client_objective: "Readiness", scope: "", systems: [], locations: [], deadline: null, known_facts: [], assumptions: [], missing_information: [], sources: [], intake_classification: { category: "new_client_request", reason: "Synthetic request", claimed_organization: null } }));
  fs.writeFileSync(path.join(projectRoot, "working", "public-intake-record.json"), JSON.stringify({ schemaVersion: 1, intakeLane: "public-inquiry", preparationStatus: "onboarding_incomplete", senderIdentityVerified: false, organizationIdentityVerified: false, clientClaimsVerified: false, missingInformation: ["proposed scope", "systems in scope", "operating locations", "source-backed client information"] }));
  const lines = [];
  await processCompletedIntakes(f.settings, { getTasks: () => [fakeTask("incomplete", { projectId, status: "completed" })], reconcileIntakes: () => [], executeDemo: async () => assert.fail("incomplete public intake cannot start specialists"), writeLog: (line) => lines.push(line) });
  const state = JSON.parse(fs.readFileSync(path.join(f.root, "agency", "state", "automatic-workflows.json"), "utf8"));
  assert.equal(state.projects[projectId].status, "onboarding_incomplete");
  assert.ok(lines.some((line) => line.includes("Preliminary readiness decision: onboarding_incomplete")));
  assert.ok(lines.some((line) => line.includes("INTAKE_DATA_INCOMPLETE")));
});

test("historical suspicious intake with stale ready workflow state is blocked before specialist dispatch", async (t) => {
  const f = workflowFixture(t);
  const projectId = "INTAKE-historical-held";
  const projectRoot = path.join(f.settings.projectsRoot, projectId);
  fs.mkdirSync(path.join(projectRoot, "working"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "client-input"), { recursive: true });
  const source = "client-input/gmail-intake.json";
  fs.writeFileSync(path.join(projectRoot, source), "Synthetic only.");
  fs.writeFileSync(path.join(projectRoot, "working", "client-brief.json"), JSON.stringify({ project_id: projectId, client_objective: "Readiness", scope: "One office", systems: ["mail"], locations: ["Tashkent"], known_facts: [{ fact: "Unverified claim", source }], sources: [source], assumptions: [], missing_information: [], intake_classification: { category: "suspicious_or_requires_review", reason: "Synthetic hold" } }));
  fs.writeFileSync(path.join(projectRoot, "working", "public-intake-record.json"), JSON.stringify({ schemaVersion: 1, intakeLane: "public-inquiry", preparationStatus: "preliminary_preparation_ready_pending_identity_verification", senderIdentityVerified: false, organizationIdentityVerified: false, clientClaimsVerified: false, missingInformation: [] }));
  let executions = 0;
  const task = fakeTask("historical-held", { projectId, status: "completed" });
  const hooks = { getTasks: () => [task], reconcileIntakes: () => [], executeDemo: async () => { executions++; throw new Error("must not run"); }, writeLog: () => {} };
  await processCompletedIntakes(f.settings, hooks);
  const state = JSON.parse(fs.readFileSync(path.join(f.root, "agency", "state", "automatic-workflows.json"), "utf8"));
  assert.equal(executions, 0);
  assert.equal(state.projects[projectId].status, "blocked");
  assert.equal(state.projects[projectId].readinessDecision, "blocked");
  assert.equal(state.projects[projectId].reason, "PUBLIC_SECURITY_REVIEW_REQUIRED");
  assert.equal(fs.readFileSync(path.join(projectRoot, "client-input", "gmail-intake.json"), "utf8"), "Synthetic only.");
});

test("completed public intake with no reconciled record is visibly blocked and can be retried", async (t) => {
  const f = workflowFixture(t);
  const projectId = "INTAKE-record-missing";
  const projectRoot = path.join(f.settings.projectsRoot, projectId);
  fs.mkdirSync(path.join(projectRoot, "working"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "client-input"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "client-input", "gmail-intake.json"), "Synthetic source.");
  fs.writeFileSync(path.join(projectRoot, "working", "client-brief.json"), JSON.stringify({ project_id: projectId, client_objective: "Readiness", scope: "One location", systems: ["mail"], locations: ["site"], deadline: null, known_facts: [{ fact: "Client asks for readiness help", source: "client-input/gmail-intake.json" }], assumptions: [], missing_information: [], sources: ["client-input/gmail-intake.json"], intake_classification: { category: "new_client_request", reason: "Synthetic request", claimed_organization: null } }));
  const task = fakeTask("missing-record", { projectId, status: "completed" });
  let runs = 0;
  const lines = [];
  const options = { getTasks: () => [task], reconcileIntakes: () => [], executeDemo: async () => { runs++; return { manifestPath: "synthetic/manifest.json", manifest: { finalStatus: "completed", runId: "recovered" } }; }, preparePublic: () => ({ planId: "synthetic-plan" }), writeLog: (line) => lines.push(line) };
  await processCompletedIntakes(f.settings, options);
  let state = JSON.parse(fs.readFileSync(path.join(f.root, "agency", "state", "automatic-workflows.json"), "utf8"));
  assert.equal(state.projects[projectId].status, "blocked");
  assert.equal(runs, 0);
  options.publishPublicReport = async () => { throw Object.assign(new Error("policy missing"), {code:"WORKFLOW_POLICY_MISSING"}); };
  options.notifyCustomer = async () => ({outcome:"sent"});
  options.reconcileIntakes = () => {
    fs.writeFileSync(path.join(projectRoot, "working", "public-intake-record.json"), JSON.stringify({ schemaVersion: 1, intakeLane: "public-inquiry", preparationStatus: "preliminary_preparation_ready_pending_identity_verification", senderIdentityVerified: false, organizationIdentityVerified: false, clientClaimsVerified: false, missingInformation: [] }));
    return [];
  };
  await processCompletedIntakes(f.settings, options);
  state = JSON.parse(fs.readFileSync(path.join(f.root, "agency", "state", "automatic-workflows.json"), "utf8"));
  assert.equal(runs, 1, JSON.stringify(lines));
  assert.equal(state.projects[projectId].status, "preliminary_report_ready", JSON.stringify({ state: state.projects[projectId], lines }));
});

test(
  "queue tasks execute sequentially and only Client Manager intake is eligible",
  async () => {
  let activeExecutions = 0;
  let highestConcurrency = 0;
  const dispatched = [];
  await dispatchPendingTasks({}, {
    getTasks: () => [
      fakeTask("first"),
      fakeTask("other-worker", { employeeId: "project-manager" }),
      fakeTask("other-routine", { routine: "send-email" }),
      fakeTask("second"),
    ],
    executeTask: async (_settings, { taskId }) => {
      activeExecutions += 1;
      highestConcurrency = Math.max(highestConcurrency, activeExecutions);
      await Promise.resolve();
      dispatched.push(taskId);
      activeExecutions -= 1;
      return { outcome: "completed" };
    },
    writeLog: () => {},
  });
  assert.deepEqual(dispatched, ["first", "second"]);
  assert.equal(highestConcurrency, 1);
  },
);

test("shutdown aborts the polling delay after the current cycle", async () => {
  const events = [];
  const controller = new AbortController();
  await runAgency({
    settings: {},
    gmailConfig: { pollIntervalSeconds: 15 },
    scanAndDispatch: async () => events.push("scan"),
    poll: async () => {
      events.push("poll");
      return { results: [] };
    },
    signal: controller.signal,
    writeLog: (message) => events.push(message),
    waitBetweenCycles: async () => controller.abort(),
  });
  assert.equal(events.filter((event) => event === "poll").length, 1);
  assert.ok(events.some((event) => String(event).includes("Shutdown complete")));
});

test(
  "launcher delegates only intake polling and orchestrator task execution",
  async () => {
  const invoked = [];
  const controller = new AbortController();
  await runAgency({
    settings: {},
    gmailConfig: { pollIntervalSeconds: 15 },
    scanAndDispatch: async () => invoked.push("orchestrator-queue"),
    poll: async () => {
      invoked.push("gmail-poller");
      controller.abort();
      return { results: [] };
    },
    signal: controller.signal,
    writeLog: () => {},
  });
  assert.deepEqual(invoked, [
    "orchestrator-queue",
    "gmail-poller",
    "orchestrator-queue",
  ]);
  assert.equal(invoked.includes("send-email"), false);
  assert.equal(invoked.includes("publish-sheets"), false);
  assert.equal(invoked.includes("approve-contact"), false);
  assert.equal(invoked.includes("downstream-specialist"), false);
  },
);

test('completed local recovery resumes reporting after exhausted agent retries without executing employees', async (t) => {
  const f = workflowFixture(t);
  const projectId = 'INTAKE-recovery';
  const root = path.join(f.settings.projectsRoot, projectId);
  fs.mkdirSync(path.join(root,'working'),{recursive:true});
  fs.mkdirSync(path.join(root,'client-input'),{recursive:true});
  fs.writeFileSync(path.join(root,'client-input/gmail-intake.json'),'Source facts');
  fs.writeFileSync(path.join(root,'working/client-brief.json'),JSON.stringify({project_id:projectId,client_objective:'Review readiness',scope:'Mail service',deadline:'unknown',systems:['mail'],locations:['office'],known_facts:[{fact:'Client reports mail service',source:'client-input/gmail-intake.json'}],assumptions:[],missing_information:[],sources:['client-input/gmail-intake.json'],intake_classification:{category:'new_client_request',reason:'Request',claimed_organization:null}}));
  fs.writeFileSync(path.join(root,'working/public-intake-record.json'),JSON.stringify({schemaVersion:1,intakeLane:'public-inquiry',preparationStatus:'preliminary_preparation_ready_pending_identity_verification',senderIdentityVerified:false,organizationIdentityVerified:false,clientClaimsVerified:false,missingInformation:[]}));
  const run=path.join(root,'logs/demo-runs/recovered');fs.mkdirSync(run,{recursive:true});
  fs.writeFileSync(path.join(run,'manifest.json'),JSON.stringify({projectId,runId:'recovered',finalStatus:'completed',dryRun:false,finishedAt:'2026-11-06T11:00:00Z',agents:[]}));
  const stateFile=path.join(f.root,'agency/state/automatic-workflows.json');fs.mkdirSync(path.dirname(stateFile),{recursive:true});
  fs.writeFileSync(stateFile,JSON.stringify({schemaVersion:1,projects:{[projectId]:{taskId:'recovery-task',status:'retryable_failure',attempts:3,code:'AGENT_VALIDATION_INCOMPLETE',lastAttemptAt:'2026-11-06T10:00:00Z',manifestPath:path.join(root,'logs/demo-runs/failed/manifest.json')}},messages:{}}));
  let publications=0;
  const options={getTasks:()=>[fakeTask('recovery-task',{projectId,status:'completed'})],executeDemo:async()=>assert.fail('must reuse recovered manifest'),preparePublic:()=>({planId:'recovery-plan'}),publishPublicReport:async()=>{publications++;},prepareConfirmation:()=>{},sendPublicReport:async()=>{},notifyCustomer:async()=>({outcome:'sent'}),writeLog:()=>{}};
  await processCompletedIntakes(f.settings,options);
  await processCompletedIntakes(f.settings,options);
  const saved=JSON.parse(fs.readFileSync(stateFile,'utf8')).projects[projectId];
  assert.equal(saved.status,'completed');assert.equal(publications,1);assert.equal(saved.recoveryHistory[0].priorAttempts,3);
});
