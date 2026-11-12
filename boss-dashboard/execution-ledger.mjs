// Convert the existing eight-employee execution ledger into dashboard tasks.
// The source rows are written by the agency runner; this view is read-only.
export const EXECUTION_LEDGER_HEADERS = [
  "run_id",
  "project_id",
  "employee_id",
  "routine",
  "execution_status",
  "artifact_basename",
  "validation_status",
  "timestamp",
];

const EMPLOYEE_IDS = new Set([
  "client-manager",
  "isms-readiness-planner",
  "requirements-evidence-specialist",
  "technical-controls-analyst",
  "security-awareness-specialist",
  "corrective-action-specialist",
  "readiness-metrics-analyst",
  "project-manager",
]);

const DASHBOARD_STATUS = Object.freeze({
  running: "In Progress",
  completed: "Completed",
  "reused-validated": "Completed",
  blocked: "Blocked",
  failed: "Blocked",
  not_started: "Queued",
  "not-run": "Queued",
});

/** Map one validated execution-ledger row to the dashboard's task schema. */
export function executionRowToTask(row) {
  if (!Array.isArray(row) || row.length < EXECUTION_LEDGER_HEADERS.length) return null;

  const [runId, projectId, employeeId, routine, executionStatus, artifact, , timestamp] = row;
  const status = DASHBOARD_STATUS[executionStatus];
  if (!runId || !projectId || !EMPLOYEE_IDS.has(employeeId) || !routine || !status) return null;

  const finished = status === "Completed" || status === "Blocked";
  return {
    taskId: `workflow:${runId}:${employeeId}`,
    timestamp: timestamp || "",
    assignedBy: "Email intake workflow",
    employeeId,
    description: `Automatic workflow stage: ${routine}. Output: ${artifact || "pending"}.`,
    priority: "Normal",
    status,
    resultLink: "",
    completionTime: finished ? timestamp || "" : "",
    title: routine,
    deadline: "",
    blockerReason: executionStatus === "blocked"
      ? "Workflow reported a block. See the execution ledger for details."
      : executionStatus === "failed"
        ? "Stage validation failed. See the execution ledger for details."
        : "",
    updatedAt: timestamp || "",
    executionMode: "automatic-email",
    parentTaskId: "",
    projectId,
  };
}

/** Validate the source sheet before interpreting rows as employee progress. */
export function executionLedgerToTasks(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2 || !Array.isArray(matrix[0])) return [];
  const header = matrix[0].slice(0, EXECUTION_LEDGER_HEADERS.length);
  if (JSON.stringify(header) !== JSON.stringify(EXECUTION_LEDGER_HEADERS)) return [];
  return matrix.slice(1).map(executionRowToTask).filter(Boolean);
}

