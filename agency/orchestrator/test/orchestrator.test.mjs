/**
 * Test overview: verifies deterministic task validation, deduplication,
 * atomic claims, sandbox preflight, output validation and operator recovery.
 * Model/process behavior is injected or simulated. One roster/configuration
 * check reads the checked-out workspace; project workspaces are disposable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  codexInvocation,
  enqueueTask,
  findTask,
  listTasks,
  loadConfiguration,
  runOne,
  spawnCodex,
  preflightCodex,
  retryFailedTask,
  recoverBlockedTask,
  setCommunicationApproval,
  snapshotClientInputs,
  validateBrief,
  validateTask,
} from "../orchestrator.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIVE_WORKSPACE = path.resolve(HERE, "..", "..", "..");
const EMPLOYEE_IDS = [
  "client-manager",
  "project-manager",
  "isms-readiness-planner",
  "requirements-evidence-specialist",
  "technical-controls-analyst",
  "security-awareness-specialist",
  "readiness-metrics-analyst",
  "corrective-action-specialist",
];

// Create a disposable test setup and return the paths and sample records used by the cases.
function fixture() {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "agency-orchestrator-test-"),
  );
  fs.mkdirSync(path.join(workspace, "agency", "config"), { recursive: true });
  for (const id of EMPLOYEE_IDS) {
    const root = path.join(workspace, id);
    fs.mkdirSync(root, { recursive: true });
    if (id === "client-manager") {
      fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "scripts", "guard.mjs"),
        [
          'const trigger = process.argv[process.argv.indexOf("--trigger") + 1];',
          'const noRecord = process.argv.includes("--no-record");',
          'const verdict = {routine:"client-intake",trigger,verdict:"run",period:"2026-11-04",now:"2026-11-04T12:00:00+05:00",budget:25};',
          'if (!noRecord) verdict.claim = {allowed:true,token:"fake-lease-token"};',
          "console.log(JSON.stringify(verdict));",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(root, "scripts", "runlog.mjs"),
        'console.log("fake runlog accepted");\n',
      );
      fs.writeFileSync(
        path.join(root, "scripts", "run-state.mjs"),
        'console.log("fake lease finished");\n',
      );
    }
  }
  fs.mkdirSync(
    path.join(workspace, "agency", "projects", "TEST-001", "client-input"),
    { recursive: true },
  );
  fs.mkdirSync(
    path.join(workspace, "agency", "projects", "TEST-001", "working"),
    { recursive: true },
  );
  fs.mkdirSync(
    path.join(workspace, "agency", "projects", "TEST-001", "outputs"),
    { recursive: true },
  );
  fs.writeFileSync(
    path.join(
      workspace,
      "agency",
      "projects",
      "TEST-001",
      "client-input",
      "company-profile.md",
    ),
    "A test company request.",
  );
  const agency = {
    schemaVersion: 1,
    workspaceRoot: workspace,
    agencyRoot: "agency",
    projectsRoot: "agency/projects",
    orchestratorRoot: "agency/orchestrator",
    configRoot: "agency/config",
    queueRoot: "agency/orchestrator/queue",
    logRoot: "agency/orchestrator/logs",
    codex: {
      command: "codex.cmd",
      sandbox: "workspace-write",
      timeoutSeconds: 30,
      maxAttempts: 2,
      retryDelaySeconds: 0,
    },
    inputLimits: {
      maxFiles: 1000,
      maxFileBytes: 26214400,
      maxTotalBytes: 104857600,
    },
    eventWatcher: { debounceMs: 100, stableCheckMs: 100, recursive: true },
  };
  const employees = {
    schemaVersion: 1,
    employees: EMPLOYEE_IDS.map((id) => ({
      id,
      root: id,
      enabled: id === "client-manager",
      routines: id === "client-manager" ? ["client-intake"] : [],
    })),
  };
  fs.writeFileSync(
    path.join(workspace, "agency", "config", "agency.json"),
    JSON.stringify(agency),
  );
  fs.writeFileSync(
    path.join(workspace, "agency", "config", "employees.json"),
    JSON.stringify(employees),
  );
  return {
    workspace,
    settings: loadConfiguration(workspace),
    cleanup: () => fs.rmSync(workspace, { recursive: true, force: true }),
  };
}

// Move a fixture task to the requested test state and apply extra fields.
function setTaskState(f, task, status, extra = {}) {
  const source = path.join(
    f.settings.queueRoot,
    task.status,
    `${task.id}.json`,
  );
  const targetTask = {
    ...task,
    ...extra,
    status,
    updatedAt: new Date().toISOString(),
  };
  if (status === "running")
    targetTask.startedAt = targetTask.startedAt || targetTask.updatedAt;
  if (["completed", "failed"].includes(status))
    targetTask.finishedAt = targetTask.finishedAt || targetTask.updatedAt;
  fs.mkdirSync(path.join(f.settings.queueRoot, status), { recursive: true });
  fs.rmSync(source, { force: true });
  fs.writeFileSync(
    path.join(f.settings.queueRoot, status, `${task.id}.json`),
    JSON.stringify(targetTask, null, 2),
  );
  return targetTask;
}

// Create a fixture task with its allowed attempts already used.
function exhaustedTask(f, projectId = "TEST-001", options = {}) {
  const { task } = enqueueTask(f.settings, {
    projectId,
    trigger: options.trigger || "manual",
    requiresCommunicationApproval:
      options.requiresCommunicationApproval || false,
  });
  return setTaskState(f, task, "failed", {
    attempts: task.maxAttempts,
    failure: { code: "OUTPUT_INVALID", message: "historical failure" },
  });
}

// Test goal: configuration parses the live eight-employee roster without enabling the seven future employees. Assertions below define the exact expected result.
test("configuration parses the live eight-employee roster without enabling the seven future employees", () => {
  const settings = loadConfiguration(LIVE_WORKSPACE);
  assert.equal(settings.employees.size, 8);
  assert.equal(settings.employees.get("client-manager").enabled, true);
  for (const employee of settings.employees.values())
    if (employee.id !== "client-manager") assert.equal(employee.enabled, false);
});

// Test goal: configuration rejects an extra employee. Assertions below define the exact expected result.
test("configuration rejects an extra employee", () => {
  const f = fixture();
  try {
    const p = path.join(f.workspace, "agency", "config", "employees.json");
    const config = JSON.parse(fs.readFileSync(p, "utf8"));
    config.employees.push({
      id: "ninth-employee",
      root: "client-manager",
      enabled: false,
      routines: [],
    });
    fs.writeFileSync(p, JSON.stringify(config));
    assert.throws(() => loadConfiguration(f.workspace), {
      code: "CONFIG_ROSTER",
    });
  } finally {
    f.cleanup();
  }
});

// Test goal: configuration refuses queue or project roots outside the approved agency layout. Assertions below define the exact expected result.
test("configuration refuses queue or project roots outside the approved agency layout", () => {
  const f = fixture();
  try {
    const p = path.join(f.workspace, "agency", "config", "agency.json");
    const config = JSON.parse(fs.readFileSync(p, "utf8"));
    config.projectsRoot = "client-manager";
    fs.writeFileSync(p, JSON.stringify(config));
    assert.throws(() => loadConfiguration(f.workspace), {
      code: "CONFIG_PATH",
    });
  } finally {
    f.cleanup();
  }
});

// Test goal: task schema accepts a valid intake task and rejects a missing project ID. Assertions below define the exact expected result.
test("task schema accepts a valid intake task and rejects a missing project ID", () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    assert.equal(validateTask(task), task);
    assert.throws(() => validateTask({ ...task, projectId: undefined }), {
      code: "TASK_SCHEMA",
    });
  } finally {
    f.cleanup();
  }
});

// Test goal: identical project inputs dedupe to one task. Assertions below define the exact expected result.
test("identical project inputs dedupe to one task", () => {
  const f = fixture();
  try {
    const first = enqueueTask(f.settings, { projectId: "TEST-001" });
    const second = enqueueTask(f.settings, {
      projectId: "TEST-001",
      trigger: "event",
    });
    assert.equal(second.duplicate, true);
    assert.equal(first.task.id, second.task.id);
    assert.equal(listTasks(f.settings).length, 1);
  } finally {
    f.cleanup();
  }
});

// Test goal: dry-run checks the explicit manual guard path but invokes no executor and leaves task pending. Assertions below define the exact expected result.
test("dry-run checks the explicit manual guard path but invokes no executor and leaves task pending", async () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, {
      projectId: "TEST-001",
      trigger: "manual",
    });
    let called = false;
    const result = await runOne(f.settings, {
      dryRun: true,
      executor: async () => {
        called = true;
        throw new Error("model must not start");
      },
    });
    assert.equal(result.outcome, "dry-run");
    assert.equal(result.modelInvoked, false);
    assert.equal(called, false);
    assert.equal(findTask(f.settings, task.id).task.status, "pending");
    assert.equal(result.codex.args.includes("--sandbox"), true);
    assert.equal(result.codex.args.includes("workspace-write"), true);
    assert.equal(result.codex.args.includes("danger-full-access"), false);
  } finally {
    f.cleanup();
  }
});

// Test goal: missing input after enqueue blocks before executor invocation. Assertions below define the exact expected result.
test("missing input after enqueue blocks before executor invocation", async () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    fs.rmSync(
      path.join(
        f.workspace,
        "agency",
        "projects",
        "TEST-001",
        "client-input",
        "company-profile.md",
      ),
    );
    let called = false;
    const result = await runOne(f.settings, {
      executor: async () => {
        called = true;
        return { ok: true };
      },
    });
    assert.equal(result.outcome, "blocked");
    assert.match(result.reason, /no non-empty client-input files/);
    assert.equal(called, false);
    assert.equal(findTask(f.settings, task.id).task.status, "blocked");
  } finally {
    f.cleanup();
  }
});

// Test goal: read-only sandbox preflight blocks before claiming a task or consuming an attempt. Assertions below define the exact expected result.
test("read-only sandbox preflight blocks the task without consuming an attempt", async () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    const result = await runOne(f.settings, {
      preflight: async () => {
        const error = new Error("canary write denied");
        error.code = "PREFLIGHT_FAILED";
        throw error;
      },
      executor: async () => {
        throw new Error("customer executor must not run");
      },
    });
    assert.equal(result.outcome, "preflight-blocked");
    assert.equal(findTask(f.settings, task.id).task.status, "blocked");
    assert.equal(findTask(f.settings, task.id).task.attempts, 0);
  } finally {
    f.cleanup();
  }
});

// Test goal: workspace-write preflight verifies readback inside the selected project. Assertions below define the exact expected result.
test("workspace-write preflight verifies readback inside the selected project", async () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    let canaryPath;
    const result = await preflightCodex(f.settings, task, {
      executor: async (_settings, _task, { invocation }) => {
        assert.equal(
          invocation.args[invocation.args.indexOf("--sandbox") + 1],
          "workspace-write",
        );
        assert.equal(
          invocation.args[invocation.args.indexOf("--add-dir") + 1],
          path.join(f.workspace, "agency", "projects", "TEST-001"),
        );
        canaryPath = invocation.prompt.match(
          /Write exactly PREFLIGHT_OK to (.+), read it back/,
        )[1];
        fs.writeFileSync(canaryPath, "PREFLIGHT_OK");
        assert.equal(fs.readFileSync(canaryPath, "utf8"), "PREFLIGHT_OK");
        return { ok: true };
      },
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(fs.existsSync(canaryPath), false);
  } finally {
    f.cleanup();
  }
});

test("preflight preserves safe stderr summaries for Codex exit failures", async () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    await assert.rejects(
      preflightCodex(f.settings, task, {
        executor: async () => ({
          ok: false,
          code: "CODEX_EXIT",
          exitCode: 1,
          stderrBytes: 2432,
          stderrSummary: "failed to load configured profile [PATH]",
          stderr: "private raw stderr content",
        }),
      }),
      (error) => {
        assert.match(error.message, /failed to load configured profile \[PATH\]/);
        assert.doesNotMatch(error.message, /private raw stderr content/);
        assert.doesNotMatch(error.message, /unclassified error/);
        return true;
      },
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: atomic queue claiming permits at most one executor for a task. Assertions below define the exact expected result.
test("atomic queue claiming permits at most one executor for a task", async () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    let calls = 0;
    const executor = async (settings) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      const root = path.join(f.workspace, "agency", "projects", "TEST-001");
      const brief = {
        project_id: "TEST-001",
        client_objective: "Prepare for readiness.",
        scope: null,
        systems: [],
        locations: [],
        deadline: null,
        known_facts: [],
        assumptions: [],
        missing_information: [],
        sources: [],
      };
      fs.writeFileSync(
        path.join(root, "working", "client-brief.json"),
        JSON.stringify(brief),
      );
      return { ok: true, exitCode: 0 };
    };
    const results = await Promise.all([
      runOne(f.settings, { executor }),
      runOne(f.settings, { executor }),
    ]);
    assert.equal(calls, 1);
    assert.equal(
      results.filter((result) => result.outcome === "completed").length,
      1,
    );
    assert.equal(findTask(f.settings, task.id).task.status, "completed");
  } finally {
    f.cleanup();
  }
});

// Test goal: a successful process with invalid output is never marked completed. Assertions below define the exact expected result.
test("a successful process with invalid output is never marked completed", async () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    let calls = 0;
    const executor = async () => {
      calls += 1;
      return { ok: true, exitCode: 0 };
    };
    const first = await runOne(f.settings, { executor });
    assert.equal(first.outcome, "retry-scheduled");
    assert.equal(findTask(f.settings, task.id).task.status, "pending");
    assert.notEqual(findTask(f.settings, task.id).task.status, "completed");
    const second = await runOne(f.settings, { executor });
    assert.equal(second.outcome, "failed");
    assert.equal(calls, 2);
    assert.equal(findTask(f.settings, task.id).task.status, "failed");
  } finally {
    f.cleanup();
  }
});

// Test goal: prompt names the absolute Gmail staging root, required output, and every validated input. Assertions below define the exact expected result.
test("prompt names the absolute Gmail staging root, required output, and every validated input", () => {
  const f = fixture();
  try {
    const root = path.join(f.workspace, "agency", "projects", "INTAKE-test");
    fs.mkdirSync(path.join(root, "client-input"), { recursive: true });
    fs.mkdirSync(path.join(root, "working"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "project.json"),
      JSON.stringify({
        projectType: "intake-staging",
        projectId: "INTAKE-test",
      }),
    );
    fs.writeFileSync(
      path.join(root, "client-input", "gmail-intake.json"),
      '{"bodyText":"fixture only"}',
    );
    fs.writeFileSync(
      path.join(root, "client-input", "attachment.txt"),
      "another fixture input",
    );
    const { task } = enqueueTask(f.settings, { projectId: "INTAKE-test" });
    const prompt = codexInvocation(f.settings, task).prompt;
    assert.ok(prompt.includes(`absolute project root is ${root}`));
    for (const input of task.inputFiles)
      assert.ok(prompt.includes(path.resolve(root, input.path)));
    assert.ok(
      prompt.includes(path.join(root, "client-input", "gmail-intake.json")),
    );
    assert.ok(prompt.includes(path.join(root, "working", "client-brief.json")));
    assert.match(prompt, /category.*reason.*claimed_organization/s);
  } finally {
    f.cleanup();
  }
});

// Test goal: successful Codex exit with missing output records its exact validation category. Assertions below define the exact expected result.
test("successful Codex exit with missing output records its exact validation category", async () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    const result = await runOne(f.settings, {
      executor: async () => ({
        ok: true,
        spawnSucceeded: true,
        exitCode: 0,
        signal: null,
        timedOut: false,
        durationMs: 12,
      }),
    });
    assert.equal(result.error.code, "OUTPUT_MISSING");
    const journal = fs.readFileSync(
      path.join(f.settings.logRoot, "executions.jsonl"),
      "utf8",
    );
    assert.match(journal, /"validatorFailureCategory":"OUTPUT_MISSING"/);
    assert.equal(
      findTask(f.settings, task.id).task.lastFailure.code,
      "OUTPUT_MISSING",
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: successful Codex exit with invalid JSON records OUTPUT_INVALID_JSON. Assertions below define the exact expected result.
test("successful Codex exit with invalid JSON records OUTPUT_INVALID_JSON", async () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    fs.writeFileSync(
      path.join(
        f.workspace,
        "agency",
        "projects",
        "TEST-001",
        "working",
        "client-brief.json",
      ),
      "{ invalid",
    );
    const result = await runOne(f.settings, {
      executor: async () => ({
        ok: true,
        spawnSucceeded: true,
        exitCode: 0,
        timedOut: false,
        durationMs: 8,
      }),
    });
    assert.equal(result.error.code, "OUTPUT_INVALID_JSON");
    assert.equal(
      findTask(f.settings, task.id).task.lastFailure.code,
      "OUTPUT_INVALID_JSON",
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: successful execution with valid output is completed and diagnostics record process metadata. Assertions below define the exact expected result.
test("successful execution with valid output is completed and diagnostics record process metadata", async () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    const executor = async () => {
      const brief = {
        project_id: "TEST-001",
        client_objective: "Prepare for readiness.",
        scope: null,
        systems: [],
        locations: [],
        deadline: null,
        known_facts: [],
        assumptions: [],
        missing_information: [],
        sources: [],
      };
      fs.writeFileSync(
        path.join(
          f.workspace,
          "agency",
          "projects",
          "TEST-001",
          "working",
          "client-brief.json",
        ),
        JSON.stringify(brief),
      );
      return {
        ok: true,
        spawnSucceeded: true,
        exitCode: 0,
        signal: null,
        timedOut: false,
        durationMs: 17,
      };
    };
    assert.equal((await runOne(f.settings, { executor })).outcome, "completed");
    const entry = fs
      .readFileSync(path.join(f.settings.logRoot, "executions.jsonl"), "utf8")
      .split("\n")
      .map((line) => line && JSON.parse(line))
      .find((item) => item?.event === "codex_process_finished");
    assert.deepEqual(
      {
        spawnSucceeded: entry.spawnSucceeded,
        exitCode: entry.exitCode,
        signal: entry.signal,
        timedOut: entry.timedOut,
        durationMs: entry.durationMs,
        validatorFailureCategory: entry.validatorFailureCategory,
      },
      {
        spawnSucceeded: true,
        exitCode: 0,
        signal: null,
        timedOut: false,
        durationMs: 17,
        validatorFailureCategory: null,
      },
    );
    assert.equal(findTask(f.settings, task.id).task.status, "completed");
  } finally {
    f.cleanup();
  }
});

// Test goal: Codex subprocess diagnostics distinguish startup failure, nonzero exit, and timeout without logging output secrets. Assertions below define the exact expected result.
test("Codex exec receives the configured OpenAI key as CODEX_API_KEY", async () => {
  const f = fixture();
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalCodexKey = process.env.CODEX_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-worker-key";
  delete process.env.CODEX_API_KEY;
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    let childEnv;
    const result = await spawnCodex(f.settings, task, {
      invocation: { command: "codex", args: [], cwd: f.workspace, env: {} },
      spawnImpl: (_command, _args, options) => {
        childEnv = options.env;
        const child = new EventEmitter();
        child.pid = 1;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = { end() {} };
        process.nextTick(() => child.emit("close", 0, null));
        return child;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(childEnv.OPENAI_API_KEY, "sk-test-worker-key");
    assert.equal(childEnv.CODEX_API_KEY, "sk-test-worker-key");
  } finally {
    if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAIKey;
    if (originalCodexKey === undefined) delete process.env.CODEX_API_KEY;
    else process.env.CODEX_API_KEY = originalCodexKey;
    f.cleanup();
  }
});

test("Codex subprocess receives only a loopback Groq bridge token", async () => {
  const f = fixture();
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalProvider = process.env.CODEX_PROVIDER;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalCodexKey = process.env.CODEX_API_KEY;
  process.env.GROQ_API_KEY = "gsk-test-worker-key";
  process.env.CODEX_PROVIDER = "groq";
  delete process.env.OPENAI_API_KEY;
  delete process.env.CODEX_API_KEY;
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    let childEnv;
    let childArgs;
    await spawnCodex(f.settings, task, {
      invocation: codexInvocation(f.settings, task),
      groqProxyFactory: async () => ({
        baseUrl: "http://127.0.0.1:45678/openai/v1",
        token: "ephemeral-local-test-token",
        close: async () => {},
      }),
      spawnImpl: (_command, args, options) => {
        childEnv = options.env;
        childArgs = args;
        const child = new EventEmitter();
        child.pid = 1;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = { end() {} };
        process.nextTick(() => child.emit("close", 0, null));
        return child;
      },
    });
    assert.equal(childEnv.GROQ_API_KEY, undefined);
    assert.equal(childEnv.CODEX_GROQ_PROXY_TOKEN, "ephemeral-local-test-token");
    assert.equal(childEnv.CODEX_API_KEY, undefined);
    assert.ok(childArgs.includes('model_providers.groq.base_url="http://127.0.0.1:45678/openai/v1"'));
    assert.ok(childArgs.includes('model_providers.groq.env_key="CODEX_GROQ_PROXY_TOKEN"'));
  } finally {
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
    if (originalProvider === undefined) delete process.env.CODEX_PROVIDER;
    else process.env.CODEX_PROVIDER = originalProvider;
    if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAIKey;
    if (originalCodexKey === undefined) delete process.env.CODEX_API_KEY;
    else process.env.CODEX_API_KEY = originalCodexKey;
    f.cleanup();
  }
});

test("Codex subprocess diagnostics distinguish startup failure, nonzero exit, and timeout without logging output secrets", async () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    const invoke = (command, args, timeoutSeconds = 2) => {
      f.settings.codex.timeoutSeconds = timeoutSeconds;
      return spawnCodex(f.settings, task, {
        invocation: { command, args, cwd: f.workspace, env: {} },
        spawnImpl: (exe, argv, options) =>
          spawn(exe, argv, { ...options, shell: false }),
      });
    };
    const startup = await spawnCodex(f.settings, task, {
      invocation: { command: "missing", args: [], cwd: f.workspace, env: {} },
      spawnImpl: () => {
        const child = new EventEmitter();
        child.pid = undefined;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = { end() {} };
        process.nextTick(() =>
          child.emit("error", new Error("executable not found")),
        );
        return child;
      },
    });
    assert.equal(startup.spawnSucceeded, false);
    assert.equal(startup.code, "CODEX_SPAWN");
    const nonzeroScript = path.join(f.workspace, "codex-nonzero.mjs");
    fs.writeFileSync(
      nonzeroScript,
      "process.stderr.write('access_token=topsecret'); process.exit(7);\n",
    );
    const nonzero = await invoke(process.execPath, [nonzeroScript]);
    assert.equal(nonzero.spawnSucceeded, true);
    assert.equal(nonzero.exitCode, 7);
    assert.equal(nonzero.timedOut, false);
    assert.equal(nonzero.code, "CODEX_EXIT");
    assert.ok(nonzero.durationMs >= 0);
    assert.ok(nonzero.stderrBytes > 0);
    assert.ok(!JSON.stringify(nonzero).includes("topsecret"));
    const timeoutScript = path.join(f.workspace, "codex-timeout.mjs");
    fs.writeFileSync(timeoutScript, "setTimeout(() => {}, 1500);\n");
    const timeout = await invoke(process.execPath, [timeoutScript], 0.05);
    assert.equal(timeout.spawnSucceeded, true);
    assert.equal(timeout.timedOut, true);
    assert.equal(timeout.code, "CODEX_TIMEOUT");
    assert.ok(Number.isFinite(timeout.durationMs));
  } finally {
    f.cleanup();
  }
});

// Test goal: diagnostic journal excludes secret stdout, stderr, and model transcript content. Assertions below define the exact expected result.
test("diagnostic journal excludes secret stdout, stderr, and model transcript content", async () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    await runOne(f.settings, {
      executor: async () => ({
        ok: false,
        spawnSucceeded: true,
        exitCode: 9,
        signal: null,
        timedOut: false,
        durationMs: 20,
        stdout: "entire private model transcript",
        stderr: "OAuth token=ultrasecret",
        error: "Codex exited (diagnostic content omitted)",
      }),
    });
    const journal = fs.readFileSync(
      path.join(f.settings.logRoot, "executions.jsonl"),
      "utf8",
    );
    const taskJson = JSON.stringify(findTask(f.settings, task.id).task);
    for (const secret of ["entire private model transcript", "ultrasecret"]) {
      assert.ok(!journal.includes(secret));
      assert.ok(!taskJson.includes(secret));
    }
    const processEvent = journal
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse)
      .find((entry) => entry.event === "codex_process_finished");
    assert.equal(processEvent.spawnSucceeded, true);
    assert.equal(processEvent.exitCode, 9);
    assert.equal(processEvent.timedOut, false);
    assert.equal(processEvent.durationMs, 20);
  } finally {
    f.cleanup();
  }
});

// Test goal: missing inputs cannot be enqueued. Assertions below define the exact expected result.
test("missing inputs cannot be enqueued", () => {
  const f = fixture();
  try {
    fs.rmSync(
      path.join(
        f.workspace,
        "agency",
        "projects",
        "TEST-001",
        "client-input",
        "company-profile.md",
      ),
    );
    assert.equal(
      snapshotClientInputs(
        path.join(f.workspace, "agency", "projects", "TEST-001"),
      ).valid,
      false,
    );
    assert.throws(() => enqueueTask(f.settings, { projectId: "TEST-001" }), {
      code: "MISSING_INPUT",
    });
  } finally {
    f.cleanup();
  }
});

// Test goal: brief validation enforces the Client Intake output contract and matching project ID. Assertions below define the exact expected result.
test("brief validation enforces the Client Intake output contract and matching project ID", () => {
  const f = fixture();
  try {
    const root = path.join(f.workspace, "agency", "projects", "TEST-001");
    const brief = {
      project_id: "TEST-001",
      client_objective: "Prepare for readiness.",
      scope: null,
      systems: [],
      locations: [],
      deadline: null,
      known_facts: [],
      assumptions: [],
      missing_information: [],
      sources: [],
    };
    const target = path.join(root, "working", "client-brief.json");
    fs.writeFileSync(target, JSON.stringify(brief));
    assert.equal(validateBrief(root, "TEST-001").valid, true);
    assert.equal(validateBrief(root, "OTHER").valid, false);
    fs.writeFileSync(target, "{");
    assert.equal(validateBrief(root, "TEST-001").valid, false);
  } finally {
    f.cleanup();
  }
});

// Test goal: communication approval is a manual state transition and never sends. Assertions below define the exact expected result.
test("communication approval is a manual state transition and never sends", () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, {
      projectId: "TEST-001",
      requiresCommunicationApproval: true,
    });
    const approved = setCommunicationApproval(f.settings, task.id, "approved");
    assert.equal(approved.communicationApproval.status, "approved");
    assert.equal(findTask(f.settings, task.id).task.status, "pending");
  } finally {
    f.cleanup();
  }
});

// Test goal: manual/event guard triggers skip only calendar windows while pause still blocks. Assertions below define the exact expected result.
test("manual/event guard triggers skip only calendar windows while pause still blocks", () => {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "client-manager-guard-test-"),
  );
  const guard = path.join(
    LIVE_WORKSPACE,
    "client-manager",
    "scripts",
    "guard.mjs",
  );
  try {
    fs.mkdirSync(path.join(temp, "state"), { recursive: true });
    fs.writeFileSync(
      path.join(temp, "SCHEDULE.md"),
      [
        "| routine | days | fire | window_start | window_end | key | budget | browser |",
        "|---|---|---|---|---|---|---|---|",
        "| `client-intake` | `mon-fri` | 06:45 | 06:30 | 09:45 | `YYYY-MM-DD` | 25 min | never |",
      ].join("\n"),
    );
    const run = (trigger) =>
      spawnSync(
        process.execPath,
        [
          guard,
          "client-intake",
          "--root",
          temp,
          "--now",
          "2026-11-04T12:00",
          "--trigger",
          trigger,
          ...(trigger === "scheduled"
            ? []
            : ["--task-id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]),
          "--json",
          "--no-record",
        ],
        { encoding: "utf8", windowsHide: true },
      );
    assert.equal(
      JSON.parse(run("scheduled").stdout).verdict,
      "skipped-out-of-window",
    );
    const event = JSON.parse(
      spawnSync(
        process.execPath,
        [
          guard,
          "client-intake",
          "--root",
          temp,
          "--now",
          "2026-11-04T12:00",
          "--trigger",
          "event",
          "--task-id",
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "--json",
          "--no-record",
        ],
        { encoding: "utf8", windowsHide: true },
      ).stdout,
    );
    assert.equal(event.verdict, "run");
    assert.equal(event.trigger, "event");
    assert.match(
      event.notes.join(" "),
      /calendar day and window checks skipped/,
    );
    fs.writeFileSync(path.join(temp, "PAUSED"), "client-intake\n");
    assert.equal(JSON.parse(run("manual").stdout).verdict, "skipped-paused");
    fs.rmSync(path.join(temp, "PAUSED"));
    fs.writeFileSync(
      path.join(temp, "state", "client-intake.json"),
      JSON.stringify({ last_period: "2026-11-04" }),
    );
    assert.equal(JSON.parse(run("event").stdout).verdict, "run");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

// Test goal: event guard requires task identity, permits distinct same-day task leases, rejects concurrent repeats, and preserves scheduled period rules. Assertions below define the exact expected result.
test("event guard requires task identity, permits distinct same-day task leases, rejects concurrent repeats, and preserves scheduled period rules", async () => {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "client-manager-event-guard-"),
  );
  const guard = path.join(
    LIVE_WORKSPACE,
    "client-manager",
    "scripts",
    "guard.mjs",
  );
  const runState = path.join(
    LIVE_WORKSPACE,
    "client-manager",
    "scripts",
    "run-state.mjs",
  );
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const call = (trigger, taskId, inspectOnly = false) =>
    spawnSync(
      process.execPath,
      [
        guard,
        "client-intake",
        "--root",
        temp,
        ...(inspectOnly
          ? ["--now", new Date().toISOString().slice(0, 16), "--no-record"]
          : []),
        "--trigger",
        trigger,
        ...(taskId ? ["--task-id", taskId] : []),
        "--json",
      ],
      { encoding: "utf8", windowsHide: true },
    );
  const callAsync = (trigger, taskId) =>
    new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          guard,
          "client-intake",
          "--root",
          temp,
          "--trigger",
          trigger,
          ...(taskId ? ["--task-id", taskId] : []),
          "--json",
        ],
        { windowsHide: true },
      );
      let stdout = "";
      child.stdout.setEncoding("utf8").on("data", (chunk) => {
        stdout += chunk;
      });
      child.on("close", () => resolve(JSON.parse(stdout)));
    });
  const finish = (taskId, token) =>
    spawnSync(
      process.execPath,
      [
        runState,
        "finish",
        "--root",
        temp,
        "--routine",
        "client-intake",
        "--task-id",
        taskId,
        "--token",
        token,
        "--status",
        "completed",
      ],
      { encoding: "utf8", windowsHide: true },
    );
  try {
    fs.mkdirSync(path.join(temp, "state"), { recursive: true });
    fs.writeFileSync(
      path.join(temp, "SCHEDULE.md"),
      [
        "| routine | days | fire | window_start | window_end | key | budget | browser |",
        "|---|---|---|---|---|---|---|---|",
        "| `client-intake` | `mon-fri` | 06:45 | 06:30 | 09:45 | `YYYY-MM-DD` | 25 min | never |",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(temp, "state", "client-intake.json"),
      JSON.stringify({ last_period: "2026-11-04" }),
    );
    const missing = call("event");
    assert.equal(JSON.parse(missing.stdout).verdict, "failed");
    assert.equal(
      JSON.parse(call("event", "not-a-uuid").stdout).verdict,
      "failed",
    );
    const simultaneous = await Promise.all([
      callAsync("event", a),
      callAsync("event", a),
    ]);
    assert.equal(
      simultaneous.filter((verdict) => verdict.verdict === "run").length,
      1,
    );
    assert.equal(
      simultaneous.filter(
        (verdict) => verdict.verdict === "skipped-already-ran",
      ).length,
      1,
    );
    const first = simultaneous.find((verdict) => verdict.verdict === "run");
    assert.equal(first.verdict, "run");
    assert.equal(first.taskId, a);
    assert.equal(finish(a, first.claim.token).status, 0);
    const repeat = JSON.parse(call("event", a).stdout);
    assert.equal(repeat.verdict, "skipped-already-ran");
    const second = JSON.parse(call("event", b).stdout);
    assert.equal(second.verdict, "run");
    assert.equal(finish(b, second.claim.token).status, 0);
    const scheduledResult = spawnSync(
      process.execPath,
      [
        guard,
        "client-intake",
        "--root",
        temp,
        "--now",
        "2026-11-04T08:00",
        "--trigger",
        "scheduled",
        "--json",
        "--no-record",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    const scheduled = JSON.parse(scheduledResult.stdout);
    assert.equal(scheduled.verdict, "skipped-already-ran");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

// Test goal: explicit task recovery requires operator basis, preserves attempt bounds and does not execute. Assertions below define the exact expected result.
test("explicit task recovery requires operator basis, preserves attempt bounds and does not execute", () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, {
      projectId: "TEST-001",
      trigger: "event",
    });
    const blocked = path.join(
      f.settings.queueRoot,
      "blocked",
      `${task.id}.json`,
    );
    fs.rmSync(path.join(f.settings.queueRoot, "pending", `${task.id}.json`));
    fs.mkdirSync(path.dirname(blocked), { recursive: true });
    const record = {
      ...task,
      status: "blocked",
      attempts: 1,
      failure: {
        code: "GUARD_SKIPPED_ALREADY_RAN",
        message: "old period guard",
      },
    };
    fs.writeFileSync(blocked, JSON.stringify(record));
    const moved = recoverBlockedTask(f.settings, task.id, {
      by: "operator",
      reason: "guard identity fix reviewed",
    });
    assert.equal(moved.status, "pending");
    assert.equal(moved.attempts, 1);
    assert.equal(moved.recoveryHistory.length, 1);
    assert.equal(moved.failure.code, "GUARD_SKIPPED_ALREADY_RAN");
    assert.throws(
      () =>
        recoverBlockedTask(f.settings, task.id, {
          by: "operator",
          reason: "again",
        }),
      { code: "RECOVERY_STATE" },
    );
    const exhausted = {
      ...moved,
      status: "blocked",
      attempts: moved.maxAttempts,
      failure: { code: "GUARD_SKIPPED_ALREADY_RAN" },
    };
    fs.rmSync(path.join(f.settings.queueRoot, "pending", `${task.id}.json`));
    fs.writeFileSync(
      path.join(f.settings.queueRoot, "blocked", `${task.id}.json`),
      JSON.stringify(exhausted),
    );
    assert.throws(
      () =>
        recoverBlockedTask(f.settings, task.id, {
          by: "operator",
          reason: "bounded",
        }),
      { code: "RECOVERY_EXHAUSTED" },
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: exhausted failed-task recovery creates a linked new task and preserves the original plus append-only audit. Assertions below define the exact expected result.
test("exhausted failed-task recovery creates a linked new task and preserves the original plus append-only audit", () => {
  const f = fixture();
  try {
    const original = exhaustedTask(f);
    const originalBefore = JSON.stringify(
      findTask(f.settings, original.id).task,
    );
    const dryRun = retryFailedTask(f.settings, original.id, {
      by: "Ops Reviewer",
      reason: "Corrected prompt handoff",
      dryRun: true,
    });
    assert.equal(dryRun.outcome, "dry-run");
    assert.equal(dryRun.taskCreated, false);
    assert.equal(listTasks(f.settings).length, 1);
    const result = retryFailedTask(f.settings, original.id, {
      by: "Ops Reviewer",
      reason: "Corrected prompt handoff",
    });
    assert.equal(result.outcome, "enqueued");
    assert.notEqual(result.task.id, original.id);
    assert.equal(result.task.retryOf, original.id);
    assert.equal(result.task.recoveryGeneration, 1);
    assert.equal(result.task.recoveryReason, "Corrected prompt handoff");
    assert.deepEqual(result.task.recoveryOperator.name, "Ops Reviewer");
    assert.equal(result.task.status, "pending");
    assert.equal(result.task.attempts, 0);
    assert.equal(result.task.maxAttempts, original.maxAttempts);
    assert.equal(
      JSON.stringify(findTask(f.settings, original.id).task),
      originalBefore,
    );
    const journal = fs
      .readFileSync(path.join(f.settings.logRoot, "executions.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse);
    const audit = journal.find(
      (entry) => entry.event === "task_failed_recovery_created",
    );
    assert.deepEqual(
      {
        originalTaskId: audit.originalTaskId,
        newTaskId: audit.newTaskId,
        operator: audit.operator,
        reason: audit.reason,
        recoveryGeneration: audit.recoveryGeneration,
      },
      {
        originalTaskId: original.id,
        newTaskId: result.task.id,
        operator: "Ops Reviewer",
        reason: "Corrected prompt handoff",
        recoveryGeneration: 1,
      },
    );
    assert.ok(audit.at);
  } finally {
    f.cleanup();
  }
});

// Test goal: failed-task recovery rejects pending, running, and completed originals. Assertions below define the exact expected result.
test("failed-task recovery rejects pending, running, and completed originals", () => {
  for (const status of ["pending", "running", "completed"]) {
    const f = fixture();
    try {
      const task = exhaustedTask(f);
      setTaskState(f, task, status);
      assert.throws(
        () =>
          retryFailedTask(f.settings, task.id, {
            by: "operator",
            reason: "reviewed correction",
          }),
        { code: "RECOVERY_STATE" },
      );
    } finally {
      f.cleanup();
    }
  }
});

// Test goal: failed-task recovery rejects changed or missing source inputs. Assertions below define the exact expected result.
test("failed-task recovery rejects changed or missing source inputs", () => {
  const f = fixture();
  try {
    const original = exhaustedTask(f);
    fs.writeFileSync(
      path.join(
        f.workspace,
        "agency",
        "projects",
        "TEST-001",
        "client-input",
        "company-profile.md",
      ),
      "Changed after original task.",
    );
    assert.throws(
      () =>
        retryFailedTask(f.settings, original.id, {
          by: "operator",
          reason: "reviewed correction",
        }),
      { code: "RECOVERY_INPUT_CHANGED" },
    );
    fs.rmSync(
      path.join(
        f.workspace,
        "agency",
        "projects",
        "TEST-001",
        "client-input",
        "company-profile.md",
      ),
    );
    assert.throws(
      () =>
        retryFailedTask(f.settings, original.id, {
          by: "operator",
          reason: "reviewed correction",
        }),
      { code: "RECOVERY_INPUT_INVALID" },
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: failed-task recovery rejects duplicate active recovery and increments later generations. Assertions below define the exact expected result.
test("failed-task recovery rejects duplicate active recovery and increments later generations", () => {
  const f = fixture();
  try {
    const original = exhaustedTask(f);
    const first = retryFailedTask(f.settings, original.id, {
      by: "operator",
      reason: "first reviewed fix",
    }).task;
    assert.throws(
      () =>
        retryFailedTask(f.settings, original.id, {
          by: "operator",
          reason: "duplicate",
        }),
      { code: "RECOVERY_ACTIVE_TASK" },
    );
    const failedRecovery = setTaskState(f, first, "failed", {
      attempts: first.maxAttempts,
      failure: {
        code: "OUTPUT_INVALID",
        message: "recovery attempt exhausted",
      },
    });
    assert.equal(
      retryFailedTask(f.settings, original.id, {
        by: "operator",
        reason: "second reviewed fix",
      }).task.recoveryGeneration,
      2,
    );
    assert.equal(findTask(f.settings, failedRecovery.id).task.status, "failed");
  } finally {
    f.cleanup();
  }
});

// Test goal: a completed recovery cannot be retried again through its unchanged original task. Assertions below define the exact expected result.
test("a completed recovery cannot be retried again through its unchanged original task", () => {
  const f = fixture();
  try {
    const original = exhaustedTask(f);
    const recovery = retryFailedTask(f.settings, original.id, {
      by: "operator",
      reason: "reviewed correction",
    }).task;
    setTaskState(f, recovery, "completed", {
      attempts: 1,
      output: recovery.requiredOutput,
    });
    assert.throws(
      () =>
        retryFailedTask(f.settings, original.id, {
          by: "operator",
          reason: "repeat",
        }),
      { code: "RECOVERY_ALREADY_COMPLETED" },
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: concurrent failed-task recovery calls create exactly one recovery task. Assertions below define the exact expected result.
test("concurrent failed-task recovery calls create exactly one recovery task", async () => {
  const f = fixture();
  try {
    const original = exhaustedTask(f);
    const moduleUrl = pathToFileURL(
      path.resolve(HERE, "..", "orchestrator.mjs"),
    ).href;
    const childScript = path.join(f.workspace, "retry-worker.mjs");
    fs.writeFileSync(
      childScript,
      `import { loadConfiguration, retryFailedTask } from ${JSON.stringify(moduleUrl)};\nconst s=loadConfiguration(process.argv[2]);\ntry { const r=retryFailedTask(s, process.argv[3], {by:'parallel operator',reason:'parallel recovery test'}); process.stdout.write(JSON.stringify({outcome:r.outcome,id:r.task.id})); } catch(e) { process.stdout.write(JSON.stringify({error:e.code})); }\n`,
    );
    const run = () =>
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [childScript, f.workspace, original.id],
          { windowsHide: true },
        );
        let stdout = "",
          stderr = "";
        child.stdout.setEncoding("utf8").on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.setEncoding("utf8").on("data", (chunk) => {
          stderr += chunk;
        });
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0
            ? resolve(JSON.parse(stdout))
            : reject(new Error(stderr || `child exit ${code}`)),
        );
      });
    const outcomes = await Promise.all([run(), run()]);
    assert.equal(
      outcomes.filter((entry) => entry.outcome === "enqueued").length,
      1,
    );
    assert.equal(
      outcomes.filter((entry) =>
        ["RECOVERY_BUSY", "RECOVERY_ACTIVE"].includes(entry.error),
      ).length,
      1,
    );
    assert.equal(
      listTasks(f.settings).filter((task) => task.retryOf === original.id)
        .length,
      1,
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: failed-task recovery validates operator basis and inherits staging, event, approval, and sandbox restrictions. Assertions below define the exact expected result.
test("failed-task recovery validates operator basis and inherits staging, event, approval, and sandbox restrictions", () => {
  const f = fixture();
  try {
    const projectRoot = path.join(
      f.workspace,
      "agency",
      "projects",
      "INTAKE-safe",
    );
    fs.mkdirSync(path.join(projectRoot, "client-input"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "working"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "project.json"),
      JSON.stringify({
        projectType: "intake-staging",
        projectId: "INTAKE-safe",
      }),
    );
    fs.writeFileSync(
      path.join(projectRoot, "client-input", "gmail-intake.json"),
      '{"fixture":true}',
    );
    const { task: queued } = enqueueTask(f.settings, {
      projectId: "INTAKE-safe",
      trigger: "event",
      requiresCommunicationApproval: true,
    });
    const original = setTaskState(f, queued, "failed", {
      attempts: queued.maxAttempts,
      failure: { code: "OUTPUT_INVALID", message: "historical failure" },
    });
    assert.throws(
      () =>
        retryFailedTask(f.settings, original.id, { by: " ", reason: "reason" }),
      { code: "RECOVERY_BASIS" },
    );
    assert.throws(
      () =>
        retryFailedTask(f.settings, original.id, {
          by: "operator",
          reason: " ",
        }),
      { code: "RECOVERY_BASIS" },
    );
    assert.throws(
      () =>
        retryFailedTask(f.settings, original.id, {
          by: "x".repeat(121),
          reason: "reason",
        }),
      { code: "RECOVERY_BASIS" },
    );
    assert.throws(
      () =>
        retryFailedTask(f.settings, original.id, {
          by: "operator",
          reason: "x".repeat(401),
        }),
      { code: "RECOVERY_BASIS" },
    );
    const recovered = retryFailedTask(f.settings, original.id, {
      by: "operator",
      reason: "reviewed staged request",
    }).task;
    assert.equal(recovered.projectId, "INTAKE-safe");
    assert.equal(recovered.intakeStage, true);
    assert.equal(recovered.trigger, "event");
    assert.equal(recovered.status, "blocked-approval");
    assert.deepEqual(recovered.communicationApproval, {
      required: true,
      status: "pending",
    });
    const invocation = codexInvocation(f.settings, recovered);
    assert.equal(
      invocation.args[invocation.args.indexOf("--sandbox") + 1],
      "workspace-write",
    );
    assert.equal(
      invocation.args[invocation.args.indexOf("--cd") + 1],
      path.join(f.workspace, "client-manager"),
    );
    assert.equal(
      invocation.args[invocation.args.indexOf("--add-dir") + 1],
      projectRoot,
    );
    assert.equal(invocation.env.CLIENT_MANAGER_PROJECT_ID, "INTAKE-safe");
  } finally {
    f.cleanup();
  }
});

// Test goal: Codex invocation is limited to the Client Manager and selected project roots. Assertions below define the exact expected result.
test("Codex invocation is limited to the Client Manager and selected project roots", () => {
  const f = fixture();
  try {
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    const invocation = codexInvocation(f.settings, task);
    assert.equal(invocation.args.includes("--sandbox"), true);
    assert.equal(
      invocation.args[invocation.args.indexOf("--sandbox") + 1],
      "workspace-write",
    );
    assert.equal(invocation.args.includes("--add-dir"), true);
    assert.equal(
      invocation.args[invocation.args.indexOf("--add-dir") + 1],
      path.join(f.workspace, "agency", "projects", "TEST-001"),
    );
    assert.equal(invocation.env.CLIENT_MANAGER_PROJECT_ID, "TEST-001");
  } finally {
    f.cleanup();
  }
});

test("Codex invocation selects the local Ollama provider when configured", () => {
  const f = fixture();
  const originalProvider = process.env.CODEX_PROVIDER;
  const originalModel = process.env.CODEX_MODEL;
  try {
    process.env.CODEX_PROVIDER = "ollama";
    process.env.CODEX_MODEL = "gpt-oss:20b";
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    const invocation = codexInvocation(f.settings, task);
    assert.deepEqual(invocation.args.slice(0, 6), [
      "exec", "--oss", "--local-provider", "ollama", "--model", "gpt-oss:20b",
    ]);
    assert.equal(invocation.args.includes("--sandbox"), true);
    assert.equal(invocation.args[invocation.args.indexOf("--sandbox") + 1], "workspace-write");
  } finally {
    if (originalProvider === undefined) delete process.env.CODEX_PROVIDER;
    else process.env.CODEX_PROVIDER = originalProvider;
    if (originalModel === undefined) delete process.env.CODEX_MODEL;
    else process.env.CODEX_MODEL = originalModel;
    f.cleanup();
  }
});

test("Codex invocation configures Groq Responses API and keeps workspace sandbox", () => {
  const f = fixture();
  const originalProvider = process.env.CODEX_PROVIDER;
  const originalModel = process.env.CODEX_MODEL;
  const originalGroqKey = process.env.GROQ_API_KEY;
  try {
    process.env.CODEX_PROVIDER = "groq";
    process.env.CODEX_MODEL = "openai/gpt-oss-20b";
    process.env.GROQ_API_KEY = "gsk-test-worker-key";
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    const invocation = codexInvocation(f.settings, task);
    assert.deepEqual(invocation.args.slice(0, 13), [
      "exec",
      "-c", 'model_provider="groq"',
      "-c", 'model_reasoning_effort="low"',
      "-c", 'model_providers.groq.name="Groq"',
      "-c", 'model_providers.groq.base_url="https://api.groq.com/openai/v1"',
      "-c", 'model_providers.groq.env_key="GROQ_API_KEY"',
      "-c", 'model_providers.groq.wire_api="responses"',
    ]);
    assert.equal(invocation.args.includes("--model"), true);
    assert.equal(invocation.args[invocation.args.indexOf("--model") + 1], "openai/gpt-oss-20b");
    assert.equal(invocation.args[invocation.args.indexOf("--sandbox") + 1], "workspace-write");
  } finally {
    if (originalProvider === undefined) delete process.env.CODEX_PROVIDER;
    else process.env.CODEX_PROVIDER = originalProvider;
    if (originalModel === undefined) delete process.env.CODEX_MODEL;
    else process.env.CODEX_MODEL = originalModel;
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
    f.cleanup();
  }
});

test("Codex invocation rejects unknown model providers", () => {
  const f = fixture();
  const originalProvider = process.env.CODEX_PROVIDER;
  try {
    process.env.CODEX_PROVIDER = "unknown-provider";
    const { task } = enqueueTask(f.settings, { projectId: "TEST-001" });
    assert.throws(() => codexInvocation(f.settings, task), { code: "MODEL_PROVIDER" });
  } finally {
    if (originalProvider === undefined) delete process.env.CODEX_PROVIDER;
    else process.env.CODEX_PROVIDER = originalProvider;
    f.cleanup();
  }
});
