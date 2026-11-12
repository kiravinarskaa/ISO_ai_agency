/**
 * Test overview: fixture-backed checks for receipt validation/migration and
 * sequential demo orchestration. Mock executors prove that dependency blocks,
 * output validation and reuse work without launching Codex or touching a real
 * customer project.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROSTER, runDemo, runGuard } from "../run-demo.mjs";
import { inspectInstallation, kitHash } from "../receipts.mjs";
import { migrateWorkspace } from "../migrate-receipts.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const VALID_MD = `# Demo artifact\n\n## Established facts\nOnly source-supported facts.\n\n## Missing evidence\nEvidence not supplied.\n\n## Assumptions\nNone.\n\n## Recommendations\nProposed next steps.\n`;
// Create a disposable test setup and return the paths and sample records used by the cases.
function fixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "iso-demo-test-"));
  fs.mkdirSync(path.join(workspace, "agency/config"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "agency/projects/TEST-001/working"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(workspace, "agency/projects/TEST-001/client-input"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(workspace, "agency/projects/TEST-001/logs"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(
      workspace,
      "agency/projects/TEST-001/client-input/company-profile.md",
    ),
    "Test facts.",
  );
  const brief = {
    project_id: "TEST-001",
    client_objective: "Prepare for readiness.",
    scope: { status: "unknown", details: null },
    systems: [],
    locations: [],
    deadline: null,
    known_facts: [
      { fact: "Test entity", source: "client-input/company-profile.md" },
    ],
    assumptions: [],
    missing_information: [],
    sources: ["client-input/company-profile.md"],
  };
  fs.writeFileSync(
    path.join(workspace, "agency/projects/TEST-001/working/client-brief.json"),
    JSON.stringify(brief),
  );
  for (const row of ROSTER) {
    const root = path.join(workspace, row.employeeId);
    fs.mkdirSync(path.join(root, "routines", row.routine), { recursive: true });
    const routines =
      row.employeeId === "client-manager"
        ? [{ id: "client-intake", days: "mon-sun" }]
        : [{ id: row.routine, days: "mon-sun" }];
    const employee = {
      slug: row.employeeId,
      name: row.employeeId,
      role: row.role,
      version: "2.0.0",
      standard: "1.5",
      routines,
    };
    fs.writeFileSync(
      path.join(root, "employee.json"),
      JSON.stringify(employee),
    );
    fs.writeFileSync(
      path.join(root, "work-profile.json"),
      JSON.stringify({ routines: { [row.routine]: {} } }),
    );
    fs.writeFileSync(
      path.join(root, "routines", row.routine, "SKILL.md"),
      `name: ${row.routine}\n`,
    );
    fs.writeFileSync(path.join(root, "AGENTS.md"), "Test instructions");
    fs.writeFileSync(path.join(root, "CONTRACT.md"), "Test contract");
    fs.writeFileSync(path.join(root, "ROLE.md"), "Test role");
    fs.writeFileSync(path.join(root, "SCHEDULE.md"), "Routine days: mon-sun\n");
    const files = {};
    for (const rel of [
      "employee.json",
      "AGENTS.md",
      "CONTRACT.md",
      "ROLE.md",
      "SCHEDULE.md",
      "work-profile.json",
      `routines/${row.routine}/SKILL.md`,
    ])
      files[rel] = kitHash(path.join(root, rel));
    fs.writeFileSync(
      path.join(root, ".installed.json"),
      JSON.stringify({
        schema: "ai-employee-receipt/1",
        slug: row.employeeId,
        version: employee.version,
        standard: employee.standard,
        installed_on: "2026-01-01",
        files,
        pending: [],
      }),
    );
  }
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
    inputLimits: { maxFiles: 10, maxFileBytes: 10000, maxTotalBytes: 100000 },
    eventWatcher: { debounceMs: 100, stableCheckMs: 100, recursive: true },
  };
  const employees = {
    schemaVersion: 1,
    employees: ROSTER.map((row) => ({
      id: row.employeeId,
      root: row.employeeId,
      enabled: row.employeeId === "client-manager",
      routines: row.employeeId === "client-manager" ? ["client-intake"] : [],
    })),
  };
  fs.writeFileSync(
    path.join(workspace, "agency/config/agency.json"),
    JSON.stringify(agency),
  );
  fs.writeFileSync(
    path.join(workspace, "agency/config/employees.json"),
    JSON.stringify(employees),
  );
  return {
    workspace,
    project: path.join(workspace, "agency/projects/TEST-001"),
    cleanup: () => fs.rmSync(workspace, { recursive: true, force: true }),
  };
}
// Create test-only receipt files representing the earlier receipt format.
function makeLegacyReceipts(f) {
  for (const row of ROSTER) {
    const root = path.join(f.workspace, row.workspaceRoot);
    const employee = JSON.parse(
      fs.readFileSync(path.join(root, "employee.json"), "utf8"),
    );
    const baseline = {
      ...employee,
      slug: `legacy-${row.employeeId}`,
      name: `Legacy ${row.employeeId}`,
      role: `Legacy role for ${row.employeeId}`,
    };
    const baselinePath = path.join(root, ".upgrade/baseline/employee.json");
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
    const marker = {
      schema: "ai-employee-receipt/1",
      slug: baseline.slug,
      version: "1.0.0",
      standard: "1.5",
      installed_on: "2026-01-01",
      files: { "employee.json": kitHash(baselinePath) },
      pending: [],
    };
    fs.writeFileSync(
      path.join(root, ".installed.json"),
      JSON.stringify(marker, null, 2) + "\n",
    );
  }
}
const guard = async () => ({ ok: true, verdict: "run" });
const preflight = async () => ({ ok: true });

// Test goal: guard arguments match each employee CLI and subprocess failures remain denials.
test("guard invocation uses supported employee arguments and preserves failures", () => {
  const employeeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "iso-guard-test-"));
  const projectRoot = path.join(employeeRoot, "project");
  fs.mkdirSync(path.join(employeeRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(employeeRoot, "scripts", "guard.mjs"), "");
  try {
    const clientManager = ROSTER[0];
    let captured;
    const successfulSpawn = (_command, args, options) => {
      captured = { args, options };
      return { status: 0, stdout: '{"verdict":"run"}', stderr: "" };
    };
    const allowed = runGuard(
      employeeRoot,
      clientManager,
      projectRoot,
      { dryRun: true },
      successfulSpawn,
    );
    assert.equal(allowed.ok, true);
    assert.equal(captured.args.includes("--project-root"), false);
    assert.ok(captured.args.includes("--json"));
    assert.ok(captured.args.includes("--no-record"));
    assert.deepEqual(captured.args.slice(-4), [
      "--trigger",
      "manual",
      "--task-id",
      "00000000-0000-4000-8000-000000000001",
    ]);

    const otherEmployee = ROSTER[1];
    const otherAllowed = runGuard(
      employeeRoot,
      otherEmployee,
      projectRoot,
      { dryRun: true },
      successfulSpawn,
    );
    const projectRootIndex = captured.args.indexOf("--project-root");
    assert.equal(otherAllowed.ok, true);
    assert.notEqual(projectRootIndex, -1);
    assert.equal(captured.args[projectRootIndex + 1], projectRoot);

    const failed = runGuard(
      employeeRoot,
      clientManager,
      projectRoot,
      { dryRun: true },
      () => ({
        status: 2,
        stdout: "",
        stderr: "guard: simulated bad usage",
      }),
    );
    assert.equal(failed.ok, false);
    assert.match(failed.reason, /invalid JSON \(exit 2\)/);

    const denied = runGuard(
      employeeRoot,
      clientManager,
      projectRoot,
      { dryRun: true },
      () => ({ status: 10, stdout: '{"verdict":"skipped-paused"}', stderr: "" }),
    );
    assert.equal(denied.ok, false);
    assert.match(denied.reason, /skipped-paused/);
  } finally {
    fs.rmSync(employeeRoot, { recursive: true, force: true });
  }
});

// Provide a mock executor that writes expected outputs and records invocation details.
function writingExecutor(
  f,
  { failAt = null, invalidAt = null, seen = [] } = {},
) {
  return async (_settings, _task, { invocation }) => {
    const employeeId = ROSTER.find((row) =>
      invocation.cwd.endsWith(row.employeeId),
    ).employeeId;
    seen.push({ employeeId, args: invocation.args, prompt: invocation.prompt });
    if (failAt === employeeId)
      return { ok: false, exitCode: 7, error: "mock failure" };
    const match =
      invocation.prompt.match(
        /Required output filename: ([^\n]+?)\. It must be created/,
      ) || invocation.prompt.match(/Required output: ([^\n]+)/);
    const relative = match?.[1];
    if (relative && !relative.endsWith(".json")) {
      const dest = path.isAbsolute(relative)
        ? relative
        : path.join(f.project, relative);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      let content = invalidAt === employeeId ? "# incomplete\n" : VALID_MD;
      if (employeeId === "project-manager") {
        content += "\n" + ['Executive summary','Scope and evidence basis','Findings and business impact','Work completed and remediation status','Remediation roadmap','Metrics and limitations','Employee contributions'].map(title => '## '+title+'\nTest source supported summary.').join('\n') + '\nNo material issues can be established from the supplied evidence.\n';
        const raw = invocation.prompt.match(
          /Prior observed outcomes: (\[[^\n]+\])/,
        );
        const rows = raw ? JSON.parse(raw[1]) : [];
        content +=
          "\n## Execution status\n" +
          rows
            .map((row) => `| ${row.employeeId} | ${row.status} |`)
            .join("\n") +
          "\n";
      }
      fs.writeFileSync(dest, content);
    }
    return {
      ok: true,
      exitCode: 0,
      spawnSucceeded: true,
      timedOut: false,
      durationMs: 1,
    };
  };
}

// Test goal: static dry run emits all eight records without invoking Codex. Assertions below define the exact expected result.
test("static dry run emits all eight records without invoking Codex", async () => {
  const f = fixture();
  try {
    let called = false;
    const result = await runDemo({
      workspaceRoot: f.workspace,
      projectId: "TEST-001",
      dryRun: true,
      executor: async () => {
        called = true;
        throw Error("must not launch");
      },
      guard,
    });
    assert.equal(called, false);
    assert.deepEqual(
      result.manifest.order,
      ROSTER.map((row) => row.employeeId),
    );
    assert.equal(result.manifest.agents.length, 8);
    assert.equal(result.manifest.agents[0].status, "reused-validated");
  } finally {
    f.cleanup();
  }
});

// Test goal: live mock executes in dependency order and passes project-only write grant. Assertions below define the exact expected result.
test("direct eight-agent runner denies a held public classification before creating a run", async (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  const briefPath = path.join(f.project, "working", "client-brief.json");
  const brief = JSON.parse(fs.readFileSync(briefPath, "utf8"));
  brief.intake_classification = { category: "suspicious_or_requires_review", reason: "Synthetic hold" };
  fs.writeFileSync(briefPath, JSON.stringify(brief));
  fs.writeFileSync(path.join(f.project, "working", "public-intake-record.json"), JSON.stringify({ schemaVersion: 1, intakeLane: "public-inquiry", preparationStatus: "preliminary_preparation_ready_pending_identity_verification", senderIdentityVerified: false, organizationIdentityVerified: false, clientClaimsVerified: false, missingInformation: [] }));
  await assert.rejects(runDemo({ workspaceRoot: f.workspace, projectId: "TEST-001", executor: async () => assert.fail("held intake must never dispatch") }), { code: "PUBLIC_SECURITY_REVIEW_REQUIRED" });
  assert.deepEqual(fs.readdirSync(path.join(f.project, "logs")), []);
});

test("live mock executes in dependency order and passes project-only write grant", async () => {
  const f = fixture();
  const seen = [];
  try {
    const result = await runDemo({
      workspaceRoot: f.workspace,
      projectId: "TEST-001",
      executor: writingExecutor(f, { seen }),
      preflight,
      guard,
    });
    assert.deepEqual(
      seen.map((row) => row.employeeId),
      ROSTER.slice(1).map((row) => row.employeeId),
    );
    assert.ok(
      seen.every(
        (row) =>
          row.args.includes("--add-dir") &&
          row.args[row.args.indexOf("--add-dir") + 1] === f.project,
      ),
    );
    assert.ok(seen.every((row) => !row.args.includes("--ignore-user-config")));
    assert.equal(result.manifest.finalStatus, "completed");
    assert.equal(
      result.manifest.agents.at(-1).outputPath,
      path.join(f.project, "working/final-agency-report.md"),
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: missing hard dependency blocks downstream specialist without invoking it. Assertions below define the exact expected result.
test("missing hard dependency blocks downstream specialist without invoking it", async () => {
  const f = fixture();
  const seen = [];
  try {
    const result = await runDemo({
      workspaceRoot: f.workspace,
      projectId: "TEST-001",
      executor: writingExecutor(f, { failAt: "isms-readiness-planner", seen }),
      preflight,
      guard,
    });
    const rows = new Map(
      result.manifest.agents.map((row) => [row.employeeId, row]),
    );
    assert.equal(rows.get("isms-readiness-planner").status, "failed");
    assert.equal(
      rows.get("requirements-evidence-specialist").status,
      "blocked",
    );
    assert.match(
      rows.get("requirements-evidence-specialist").blocker,
      /isms-readiness-plan\.md/,
    );
    assert.equal(
      seen.some((row) => row.employeeId === "requirements-evidence-specialist"),
      false,
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: successful subprocess without valid output is failed, never completed. Assertions below define the exact expected result.
test("successful subprocess without valid output is failed, never completed", async () => {
  const f = fixture();
  try {
    const result = await runDemo({
      workspaceRoot: f.workspace,
      projectId: "TEST-001",
      executor: writingExecutor(f, { invalidAt: "isms-readiness-planner" }),
      preflight,
      guard,
    });
    const row = result.manifest.agents.find(
      (item) => item.employeeId === "isms-readiness-planner",
    );
    assert.equal(row.subprocessExitStatus, 0);
    assert.equal(row.status, "failed");
    assert.equal(row.validation.valid, false);
  } finally {
    f.cleanup();
  }
});

// Test goal: project isolation rejects traversal and agent prompt names explicit project inputs and output. Assertions below define the exact expected result.
test("project isolation rejects traversal and agent prompt names explicit project inputs and output", async () => {
  const f = fixture();
  try {
    await assert.rejects(
      runDemo({
        workspaceRoot: f.workspace,
        projectId: "../outside",
        dryRun: true,
      }),
      /Invalid project ID/,
    );
    const seen = [];
    await runDemo({
      workspaceRoot: f.workspace,
      projectId: "TEST-001",
      executor: writingExecutor(f, { seen }),
      preflight,
      guard,
    });
    assert.ok(seen.every((row) => row.prompt.includes(f.project)));
    assert.ok(
      seen.every((row) =>
        row.prompt.includes(
          "Established facts, Missing evidence, Assumptions, and Recommendations",
        ),
      ),
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: stale installation marker blocks that routine. Assertions below define the exact expected result.
test("stale installation marker blocks that routine", async () => {
  const f = fixture();
  const seen = [];
  try {
    const marker = path.join(
      f.workspace,
      "isms-readiness-planner/.installed.json",
    );
    fs.writeFileSync(
      marker,
      JSON.stringify({
        schema: "ai-employee-receipt/1",
        slug: "old-gtm-slug",
        version: "2.0.0",
        standard: "1.5",
        files: {},
      }),
    );
    const result = await runDemo({
      workspaceRoot: f.workspace,
      projectId: "TEST-001",
      executor: writingExecutor(f, { seen }),
      preflight,
      guard,
    });
    assert.equal(
      seen.some((row) => row.employeeId === "isms-readiness-planner"),
      false,
    );
    const row = result.manifest.agents.find(
      (item) => item.employeeId === "isms-readiness-planner",
    );
    assert.equal(row.status, "blocked");
    assert.match(row.blocker, /receipt identity\/version differs/);
  } finally {
    f.cleanup();
  }
});

// Test goal: correct native receipt verifies and malformed employee identity is rejected. Assertions below define the exact expected result.
test("correct native receipt verifies and malformed employee identity is rejected", () => {
  const f = fixture();
  try {
    const row = ROSTER[1];
    const root = path.join(f.workspace, row.workspaceRoot);
    const employee = JSON.parse(
      fs.readFileSync(path.join(root, "employee.json"), "utf8"),
    );
    assert.equal(
      inspectInstallation({
        workspaceRoot: f.workspace,
        employeeRoot: root,
        employee,
        entry: row,
      }).valid,
      true,
    );
    employee.slug = "someone-else";
    assert.match(
      inspectInstallation({
        workspaceRoot: f.workspace,
        employeeRoot: root,
        employee,
        entry: row,
      }).reason,
      /identity\/version differs/,
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: missing active routine file invalidates an otherwise correct receipt. Assertions below define the exact expected result.
test("missing active routine file invalidates an otherwise correct receipt", () => {
  const f = fixture();
  try {
    const row = ROSTER[1];
    const root = path.join(f.workspace, row.workspaceRoot);
    const employee = JSON.parse(
      fs.readFileSync(path.join(root, "employee.json"), "utf8"),
    );
    fs.rmSync(path.join(root, "routines", row.routine, "SKILL.md"));
    assert.match(
      inspectInstallation({
        workspaceRoot: f.workspace,
        employeeRoot: root,
        employee,
        entry: row,
      }).reason,
      /missing or unsafe/,
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: local receipt migration preserves previous identities and is idempotent. Assertions below define the exact expected result.
test("local receipt migration preserves previous identities and is idempotent", () => {
  const f = fixture();
  try {
    makeLegacyReceipts(f);
    const first = migrateWorkspace(f.workspace, {
      now: new Date("2026-11-04T12:00:00.000Z"),
    });
    assert.ok(
      first.employees.every((row) => row.status === "migrated-verified"),
    );
    const receiptsBefore = ROSTER.map((row) =>
      fs.readFileSync(
        path.join(f.workspace, row.workspaceRoot, ".installed.json"),
      ),
    );
    const auditFiles = ROSTER.map(
      (row) =>
        first.employees.find((x) => x.employeeId === row.employeeId)
          .auditRecord,
    );
    const second = migrateWorkspace(f.workspace, {
      now: new Date("2026-11-05T12:00:00.000Z"),
    });
    assert.ok(
      second.employees.every((row) => row.status === "already-verified"),
    );
    ROSTER.forEach((row, index) =>
      assert.ok(
        fs
          .readFileSync(
            path.join(f.workspace, row.workspaceRoot, ".installed.json"),
          )
          .equals(receiptsBefore[index]),
      ),
    );
    for (const rel of auditFiles)
      assert.ok(fs.existsSync(path.join(f.workspace, rel)));
  } finally {
    f.cleanup();
  }
});

// Test goal: demo runner accepts verified migrated receipts without stale identity blockers. Assertions below define the exact expected result.
test("demo runner accepts verified migrated receipts without stale identity blockers", async () => {
  const f = fixture();
  try {
    makeLegacyReceipts(f);
    assert.ok(
      migrateWorkspace(f.workspace, {
        now: new Date("2026-11-04T12:00:00.000Z"),
      }).employees.every((row) => row.status === "migrated-verified"),
    );
    const { manifest } = await runDemo({
      workspaceRoot: f.workspace,
      projectId: "TEST-001",
      dryRun: true,
      guard,
    });
    assert.ok(
      manifest.agents.every(
        (row) =>
          row.installationMarkerReview === null ||
          row.installationMarkerReview === undefined,
      ),
    );
    assert.equal(manifest.agents[1].status, "not-run");
  } finally {
    f.cleanup();
  }
});

// Test goal: migrated receipts remain valid when Git checks out text files with different line endings.
test("migrated installation receipts tolerate Windows-to-Linux line ending conversion", async () => {
  const f = fixture();
  const rewriteLineEndings = (root, newline) => {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const target = path.join(root, entry.name);
      if (entry.isDirectory()) rewriteLineEndings(target, newline);
      else if (entry.isFile()) {
        const text = fs.readFileSync(target, "utf8");
        fs.writeFileSync(target, text.replace(/\r?\n/g, newline));
      }
    }
  };
  try {
    // Simulate migration on a Windows checkout before Git stores normalized LF files.
    for (const row of ROSTER)
      rewriteLineEndings(path.join(f.workspace, row.workspaceRoot), "\r\n");
    makeLegacyReceipts(f);
    assert.ok(
      migrateWorkspace(f.workspace, {
        now: new Date("2026-11-04T12:00:00.000Z"),
      }).employees.every((row) => row.status === "migrated-verified"),
    );
    rewriteLineEndings(f.workspace, "\n");
    const { manifest } = await runDemo({
      workspaceRoot: f.workspace,
      projectId: "TEST-001",
      dryRun: true,
      guard,
    });
    assert.ok(
      manifest.agents.every(
        (row) =>
          row.installationMarkerReview === null ||
          row.installationMarkerReview === undefined,
      ),
      JSON.stringify(manifest.agents.map((row) => ({
        employeeId: row.employeeId,
        installationMarkerReview: row.installationMarkerReview,
      }))),
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: configuration correction creates a linked local migration revision and preserves baseline. Assertions below define the exact expected result.
test("configuration correction creates a linked local migration revision and preserves baseline", () => {
  const f = fixture();
  try {
    makeLegacyReceipts(f);
    const first = migrateWorkspace(f.workspace, {
      now: new Date("2026-11-04T12:00:00.000Z"),
    });
    const row = ROSTER[1];
    const root = path.join(f.workspace, row.workspaceRoot);
    const oldResult = first.employees.find(
      (item) => item.employeeId === row.employeeId,
    );
    const oldReceipt = fs.readFileSync(path.join(root, ".installed.json"));
    const baseline = path.join(root, ".upgrade/baseline/employee.json");
    const baselineBefore = fs.readFileSync(baseline);
    const employeePath = path.join(root, "employee.json");
    const employee = JSON.parse(fs.readFileSync(employeePath, "utf8"));
    employee.routines[0].days = "mon-fri";
    fs.writeFileSync(employeePath, JSON.stringify(employee));
    fs.writeFileSync(path.join(root, "SCHEDULE.md"), "Routine days: mon-fri\n");
    const revised = migrateWorkspace(f.workspace, {
      now: new Date("2026-11-04T13:00:00.000Z"),
    });
    const revisedResult = revised.employees.find(
      (item) => item.employeeId === row.employeeId,
    );
    assert.equal(revisedResult.status, "migrated-verified");
    const currentReceipt = JSON.parse(
      fs.readFileSync(path.join(root, ".installed.json"), "utf8"),
    );
    assert.equal(
      currentReceipt.migration.supersedes.migration_id,
      oldResult.migrationId,
    );
    assert.ok(
      oldReceipt.equals(
        fs.readFileSync(
          path.join(
            f.workspace,
            currentReceipt.migration.supersedes.receipt.path,
          ),
        ),
      ),
    );
    assert.ok(fs.readFileSync(baseline).equals(baselineBefore));
    assert.equal(
      inspectInstallation({
        workspaceRoot: f.workspace,
        employeeRoot: root,
        employee,
        entry: row,
      }).valid,
      true,
    );
  } finally {
    f.cleanup();
  }
});

// Test goal: unchanged specialist artifacts are reused by dependency hash on a safe rerun. Assertions below define the exact expected result.
test("unchanged specialist artifacts are reused by dependency hash on a safe rerun", async () => {
  const f = fixture();
  const firstSeen = [];
  try {
    await runDemo({
      workspaceRoot: f.workspace,
      projectId: "TEST-001",
      executor: writingExecutor(f, { seen: firstSeen }),
      preflight,
      guard,
    });
    const secondSeen = [];
    const second = await runDemo({
      workspaceRoot: f.workspace,
      projectId: "TEST-001",
      executor: writingExecutor(f, { seen: secondSeen }),
      preflight,
      guard,
    });
    assert.equal(secondSeen.length, 0); // unchanged sources reuse the report without another guarded execution
    assert.equal(second.manifest.agents.at(-1).status, "reused-validated");
    assert.ok(second.manifest.finalReportDocx.bytes > 0);
    for (const row of second.manifest.agents.slice(1, -1))
      assert.equal(row.status, "reused-validated");
    const thirdSeen = [];
    const third = await runDemo({
      workspaceRoot: f.workspace,
      projectId: "TEST-001",
      executor: writingExecutor(f, { seen: thirdSeen }),
      preflight,
      guard,
    });
    assert.equal(thirdSeen.length, 0);
    assert.equal(third.manifest.agents.at(-1).status, "reused-validated");
  } finally {
    f.cleanup();
  }
});
