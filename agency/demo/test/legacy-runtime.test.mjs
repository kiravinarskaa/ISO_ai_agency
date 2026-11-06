/**
 * Test overview: checks employee guard/run-state/runlog compatibility. These
 * cases create temporary project roots directly under the workspace's real
 * agency/projects directory, so do not execute them during a restricted review
 * that forbids touching that tree.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ROSTER } from "../run-demo.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const ACTIVE = ROSTER.filter((row) => row.employeeId !== "client-manager");
const PROJECTS = path.join(ROOT, "agency", "projects");
// Start Node with the requested arguments and return its exit status and output.
function runNode(args, cwd = ROOT) {
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

// Test goal: all seven ISO routine IDs pass their employee runlog validation. Assertions below define the exact expected result.
test("all seven ISO routine IDs pass their employee runlog validation", () => {
  for (const entry of ACTIVE) {
    const employee = path.join(ROOT, entry.employeeId);
    const result = runNode([
      path.join(employee, "scripts", "runlog.mjs"),
      "--routine",
      entry.routine,
      "--period",
      "2026-11-05",
      "--start",
      "2026-11-05T10:00:00+05:00",
      "--end",
      "2026-11-05T10:01:00+05:00",
      "--status",
      "ok",
      "--dry-run",
    ]);
    assert.equal(result.status, 0, `${entry.employeeId}: ${result.stderr}`);
    assert.match(result.stdout, new RegExp(entry.routine));
  }
});

// Test goal: each employee can claim, log, and finish in isolated project runtime state. Assertions below define the exact expected result.
test("each employee can claim, log, and finish in isolated project runtime state", () => {
  const project = fs.mkdtempSync(path.join(PROJECTS, ".runtime-compat-"));
  try {
    for (const entry of ACTIVE) {
      const employee = path.join(ROOT, entry.employeeId);
      const guard = path.join(employee, "scripts", "guard.mjs");
      const verdict = runNode([
        guard,
        entry.routine,
        "--json",
        "--project-root",
        project,
      ]);
      const result = JSON.parse(verdict.stdout.trim());
      assert.equal(
        result.verdict,
        "run",
        `${entry.employeeId}: ${verdict.stderr} ${verdict.stdout}`,
      );
      assert.equal(result.claim?.allowed, true, entry.employeeId);
      const runtime = path.join(project, ".employee-runtime", entry.employeeId);
      const finish = runNode([
        path.join(employee, "scripts", "run-state.mjs"),
        "finish",
        "--routine",
        entry.routine,
        "--token",
        result.claim.token,
        "--status",
        "completed",
        "--root",
        runtime,
      ]);
      assert.equal(finish.status, 0, `${entry.employeeId}: ${finish.stderr}`);
      const log = path.join(
        project,
        "logs",
        "employee-runtime",
        entry.employeeId,
        "runlog.jsonl",
      );
      const append = runNode([
        path.join(employee, "scripts", "runlog.mjs"),
        "--routine",
        entry.routine,
        "--period",
        result.period,
        "--start",
        result.now,
        "--end",
        result.now,
        "--status",
        "ok",
        "--root",
        runtime,
        "--log",
        log,
      ]);
      assert.equal(append.status, 0, `${entry.employeeId}: ${append.stderr}`);
      assert.equal(
        JSON.parse(fs.readFileSync(log, "utf8").trim()).routine,
        entry.routine,
      );
    }
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

// Test goal: project runtime path failure is a failed guard, not a successful claim. Assertions below define the exact expected result.
test("project runtime path failure is a failed guard, not a successful claim", () => {
  const project = fs.mkdtempSync(path.join(PROJECTS, ".runtime-denied-"));
  try {
    fs.writeFileSync(path.join(project, ".employee-runtime"), "blocking file");
    const entry = ACTIVE[0],
      employee = path.join(ROOT, entry.employeeId);
    const result = runNode([
      path.join(employee, "scripts", "guard.mjs"),
      entry.routine,
      "--json",
      "--project-root",
      project,
    ]);
    const verdict = JSON.parse(result.stdout.trim());
    assert.equal(verdict.verdict, "failed");
    assert.equal(verdict.claim?.allowed ?? false, false);
    assert.match(
      verdict.claim?.reason || verdict.blockers?.join(" ") || "",
      /ENOTDIR|not a directory/i,
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

// Test goal: EPERM while opening the lease claim is reported as failed without a false claim. Assertions below define the exact expected result.
test("EPERM while opening the lease claim is reported as failed without a false claim", () => {
  const project = fs.mkdtempSync(path.join(PROJECTS, ".runtime-eperm-"));
  try {
    const hook = path.join(project, "deny-lease.cjs");
    fs.writeFileSync(
      hook,
      `const fs = require('node:fs'); const open = fs.openSync; fs.openSync = function (file, ...args) { if (String(file).endsWith('.claim')) { const e = new Error('simulated lease permission denial'); e.code = 'EPERM'; throw e; } return open.call(this, file, ...args); };`,
    );
    const entry = ACTIVE[0],
      employee = path.join(ROOT, entry.employeeId);
    const result = runNode([
      "--require",
      hook,
      path.join(employee, "scripts", "guard.mjs"),
      entry.routine,
      "--json",
      "--project-root",
      project,
    ]);
    const verdict = JSON.parse(result.stdout.trim());
    assert.equal(verdict.verdict, "failed");
    assert.equal(verdict.claim?.allowed, false);
    assert.match(verdict.claim?.reason || "", /EPERM/);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});
