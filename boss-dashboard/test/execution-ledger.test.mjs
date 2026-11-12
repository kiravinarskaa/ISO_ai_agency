import test from "node:test";
import assert from "node:assert/strict";
import { executionLedgerToTasks } from "../execution-ledger.mjs";

const headers = [
  "run_id", "project_id", "employee_id", "routine", "execution_status",
  "artifact_basename", "validation_status", "timestamp",
];

test("execution ledger rows become dashboard tasks without exposing local artifact paths", () => {
  const tasks = executionLedgerToTasks([
    headers,
    ["run-1", "INTAKE-synthetic", "client-manager", "client-intake", "running",
      "client-brief.json", "pending", "2026-11-12T10:00:00.000Z"],
    ["run-1", "INTAKE-synthetic", "project-manager", "coordinate-readiness-project",
      "reused-validated", "final-agency-report.md", "validated", "2026-11-12T10:05:00.000Z"],
  ]);

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].taskId, "workflow:run-1:client-manager");
  assert.equal(tasks[0].status, "In Progress");
  assert.equal(tasks[0].resultLink, "");
  assert.equal(tasks[0].executionMode, "automatic-email");
  assert.equal(tasks[1].status, "Completed");
});

test("invalid employee rows and unrecognized ledger schemas are ignored", () => {
  assert.deepEqual(executionLedgerToTasks([
    headers,
    ["run-1", "INTAKE-synthetic", "unknown-agent", "routine", "running", "out.md", "pending", "now"],
  ]), []);
  assert.deepEqual(executionLedgerToTasks([["wrong", ...headers.slice(1)], ["row"]]), []);
});

