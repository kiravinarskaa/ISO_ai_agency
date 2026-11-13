#!/usr/bin/env node
/**
 * Runs a bounded, sequential demonstration of the eight ISO readiness employees.
 * This is the demo layer above the shared orchestrator: it coordinates fixed
 * inputs and outputs, validates artifacts, and records a run manifest. Employee
 * drafting is AI-driven through Codex CLI; path checks, guards, hashes, ordering,
 * and output validation are deterministic. The work prepares readiness material
 * and does not grant or assert ISO/IEC 27001 certification.
 */
import fs from "node:fs";
import { buildFinalDocx } from "./final-report-docx.mjs";
import { MANAGEMENT_INSTRUCTION, validateManagementReport } from "./management-report-contract.mjs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  loadConfiguration,
  spawnCodex,
  validateBrief,
} from "../orchestrator/orchestrator.mjs";
import { inspectInstallation } from "./receipts.mjs";
import { loadAuthorizedPublicReview } from "../integrations/gmail/public-intake-policy.mjs";

// Resolve paths from this module so the demo behaves the same from any shell folder.
const HERE = path.dirname(fileURLToPath(import.meta.url));
// The default workspace is two levels above agency/demo; tests can supply a temporary one.
const DEFAULT_WORKSPACE = path.resolve(HERE, "..", "..");
// These case-insensitive phrases are required in every employee's written result.
const SECTION_MARKERS = [
  "established fact",
  "missing evidence",
  "assumptions",
  "recommendations",
];

// Reading path for beginners:
// 1. Check the selected project and every employee installation.
// 2. Walk the fixed roster in order, checking inputs and dependencies.
// 3. Run or safely reuse each employee's output, then validate it.
// 4. Save a manifest describing what happened; the manifest is not a certificate.

/**
 * Demo workflow contract. Each specialized employee owns one output file and
 * declares the earlier artifacts it may use. The list order is the execution
 * order; later employees receive context by reading those saved files, not by
 * inheriting an LLM's hidden conversation history. This roster is deliberately
 * independent of the production Gmail intake roster.
 */
export const ROSTER = [
  {
    employeeId: "client-manager",
    workspaceRoot: "client-manager",
    routine: "client-intake",
    role: "Validate and reuse the existing client brief; run intake only if no valid brief exists.",
    inputs: ["client-input/company-profile.md"],
    output: "working/client-brief.json",
    kind: "client-manager",
  },
  {
    employeeId: "isms-readiness-planner",
    workspaceRoot: "isms-readiness-planner",
    routine: "prepare-readiness-roadmap",
    role: "Define proposed ISMS scope, constraints, and readiness roadmap.",
    inputs: ["working/client-brief.json"],
    output: "working/isms-readiness-plan.md",
  },
  {
    employeeId: "requirements-evidence-specialist",
    workspaceRoot: "requirements-evidence-specialist",
    routine: "build-evidence-register",
    role: "Map documented requirements, available evidence, and missing evidence.",
    inputs: ["working/client-brief.json", "working/isms-readiness-plan.md"],
    output: "working/evidence-register.md",
  },
  {
    employeeId: "technical-controls-analyst",
    workspaceRoot: "technical-controls-analyst",
    routine: "review-technical-controls",
    role: "Analyze documented technical security controls and evidence gaps.",
    inputs: ["working/client-brief.json", "working/isms-readiness-plan.md"],
    output: "working/technical-controls-assessment.md",
  },
  {
    employeeId: "security-awareness-specialist",
    workspaceRoot: "security-awareness-specialist",
    routine: "prepare-awareness-plan",
    role: "Create an organizational security-awareness training plan.",
    inputs: ["working/client-brief.json", "working/isms-readiness-plan.md"],
    output: "working/awareness-training-plan.md",
  },
  {
    employeeId: "corrective-action-specialist",
    workspaceRoot: "corrective-action-specialist",
    routine: "build-corrective-action-register",
    role: "Consolidate specialist findings into a corrective-action register.",
    inputs: [
      "working/isms-readiness-plan.md",
      "working/evidence-register.md",
      "working/technical-controls-assessment.md",
      "working/awareness-training-plan.md",
    ],
    output: "working/corrective-action-register.md",
  },
  {
    employeeId: "readiness-metrics-analyst",
    workspaceRoot: "readiness-metrics-analyst",
    routine: "summarize-readiness-metrics",
    role: "Summarize readiness from actual verified artifacts; do not invent scores.",
    inputs: [
      "working/client-brief.json",
      "working/isms-readiness-plan.md",
      "working/evidence-register.md",
      "working/technical-controls-assessment.md",
      "working/awareness-training-plan.md",
      "working/corrective-action-register.md",
    ],
    output: "working/readiness-dashboard.md",
  },
  {
    employeeId: "project-manager",
    workspaceRoot: "project-manager",
    routine: "coordinate-readiness-project",
    role: "Verify outputs and compile the final report from verified artifacts and observed outcomes.",
    inputs: [
      "working/isms-readiness-plan.md",
      "working/evidence-register.md",
      "working/technical-controls-assessment.md",
      "working/awareness-training-plan.md",
      "working/corrective-action-register.md",
      "working/readiness-dashboard.md",
    ],
    optionalInputs: true,
    output: "working/final-agency-report.md",
  },
];
// Fail during module loading if IDs or output paths are duplicated in the fixed workflow.
if (
  ROSTER.length !== 8 ||
  new Set(ROSTER.map((row) => row.employeeId)).size !== 8 ||
  new Set(ROSTER.map((row) => row.output)).size !== 8
) {
  throw new Error(
    "Demo roster must contain exactly eight employees with unique IDs and outputs.",
  );
}

/** Return whether target resolves lexically at or below parent. */
function inside(parent, target) {
  // A relative result outside the parent begins with .. or becomes an absolute path.
  const rel = path.relative(parent, target);
  return (
    rel === "" ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
}
function readJson(file) {
  // Read a UTF-8 JSON file and remove a possible byte-order mark before parsing.
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}
function hashFile(file) {
  // Hash exact output bytes to create a reproducible record of what was produced.
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}
/** Resolve an existing project after validating its ID and real path boundary. */
function safeProject(settings, projectId) {
  // Accept only simple IDs so separators and traversal cannot select another directory.
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(projectId))
    throw new Error("Invalid project ID.");
  // Resolve the configured projects directory and check the candidate stays beneath it.
  const projectsReal = fs.realpathSync(settings.projectsRoot);
  const candidate = path.resolve(projectsReal, projectId);
  if (
    !inside(projectsReal, candidate) ||
    !fs.existsSync(candidate) ||
    !fs.statSync(candidate).isDirectory()
  )
    throw new Error(
      `Project is missing or outside agency/projects: ${projectId}`,
    );
  // Resolve symlinks too: a directory can look safe lexically but point elsewhere.
  const projectRoot = fs.realpathSync(candidate);
  if (!inside(projectsReal, projectRoot))
    throw new Error("Selected project resolves outside agency/projects.");
  return projectRoot;
}
/** Resolve a project-relative path while rejecting traversal and escaping symlinks. */
function safeProjectFile(projectRoot, relative) {
  // Reject absolute names and explicit parent-directory segments before resolving.
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes(".."))
    throw new Error(`Unsafe project relative path: ${relative}`);
  const target = path.resolve(projectRoot, relative);
  if (!inside(projectRoot, target))
    throw new Error(`Project path escapes selected project: ${relative}`);
  // Walk upward to the nearest existing parent, then ensure symlinks do not escape.
  let ancestor = target;
  while (!fs.existsSync(ancestor) && ancestor !== projectRoot)
    ancestor = path.dirname(ancestor);
  const realAncestor = fs.realpathSync(ancestor);
  if (!inside(projectRoot, realAncestor))
    throw new Error(
      `Project input/output resolves outside selected project: ${relative}`,
    );
  if (fs.existsSync(target) && !inside(projectRoot, fs.realpathSync(target)))
    throw new Error(
      `Project input/output resolves outside selected project: ${relative}`,
    );
  return target;
}
/** Deterministically check the employee output contract and optional observed statuses. */
function validateMarkdown(file, workflow = null) {
  // Require a regular non-symlink output before opening it.
  if (
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile() ||
    fs.lstatSync(file).isSymbolicLink()
  )
    return {
      valid: false,
      category: "OUTPUT_MISSING_OR_UNSAFE",
      reason: "Expected output file is absent or unsafe.",
    };
  // Read the artifact and look for each required section without case sensitivity.
  const text = fs.readFileSync(file, "utf8");
  const missing = SECTION_MARKERS.filter(
    (marker) => !text.toLowerCase().includes(marker),
  );
  // Very short output or missing sections means the requested report is incomplete.
  if (text.trim().length < 120 || missing.length)
    return {
      valid: false,
      category: "OUTPUT_INVALID",
      reason: `Markdown output is empty/short or lacks required evidence sections: ${missing.join(", ") || "minimum content length"}.`,
    };
  if (workflow) {
    const management = validateManagementReport(text);
    if (!management.valid) return { valid: false, category: "MANAGEMENT_REPORT_INCOMPLETE", reason: management.errors.join("; ") };
    // The project manager report must mention each observed employee and status.
    const absent = workflow.filter(
      (row) =>
        !text.includes(row.employeeId) ||
        !text.toLowerCase().includes(row.status.toLowerCase()),
    );
    if (absent.length)
      return {
        valid: false,
        category: "REPORT_OUTCOMES_MISSING",
        reason: `Final report omits observed employee status rows: ${absent.map((row) => row.employeeId).join(", ")}.`,
      };
  }
  return {
    valid: true,
    category: null,
    reason: "Non-empty Markdown contains all required evidence sections.",
  };
}
function validateClientBrief(projectRoot, projectId) {
  // Validate the fixed JSON brief path using the shared orchestrator's contract checker.
  const file = safeProjectFile(projectRoot, "working/client-brief.json");
  const validator = validateBrief(projectRoot, projectId);
  return { ...validator, file };
}
function markerConflict(workspaceRoot, employeeRoot, employee, entry) {
  // Reuse receipt verification and return null only when installed files are trusted.
  const result = inspectInstallation({
    workspaceRoot,
    employeeRoot,
    employee,
    entry,
  });
  return result.valid ? null : result.reason;
}
/**
 * Ask the employee's deterministic guard whether this routine is eligible.
 * Returns a parsed allow/deny result; spawn or malformed-JSON problems become
 * a denial. This checks routine policy and does not execute the AI employee.
 */
export function runGuard(
  employeeRoot,
  entry,
  projectRoot,
  { dryRun },
  spawn = spawnSync,
) {
  // The guard is employee-owned deterministic policy code, not an AI model call.
  const guard = path.join(employeeRoot, "scripts", "guard.mjs");
  if (!fs.existsSync(guard))
    return { ok: false, reason: "Employee guard script is missing." };
  const args = [
    guard,
    entry.routine,
    "--json",
    "--no-record",
  ];
  if (entry.employeeId !== "client-manager")
    args.push("--project-root", projectRoot);
  if (entry.employeeId === "client-manager")
    args.push(
      "--trigger",
      "manual",
      "--task-id",
      "00000000-0000-4000-8000-000000000001",
    );
  const env = {
    ...process.env,
    CLIENT_MANAGER_PROJECT_ID: path.basename(projectRoot),
  };
  const result = spawn(process.execPath, args, {
    cwd: employeeRoot,
    env,
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });
  if (result.error)
    return {
      ok: false,
      reason: `Guard could not run: ${result.error.message}`,
    };
  let verdict;
  try {
    verdict = JSON.parse((result.stdout || "").trim());
  } catch {
    return {
      ok: false,
      reason: `Guard returned invalid JSON (exit ${result.status}).`,
    };
  }
  if (verdict.verdict !== "run")
    return {
      ok: false,
      reason: `Guard verdict: ${verdict.verdict}${verdict.notes?.length ? ` (${verdict.notes.join("; ")})` : ""}.`,
    };
  return { ok: true, verdict: verdict.verdict, inspectedOnly: true, dryRun };
}
/** Build the Codex CLI invocation with the employee and one project as its scope. */
function invocationFor(settings, employeeRoot, projectRoot, prompt) {
  if (settings.codex.sandbox !== "workspace-write")
    throw new Error(
      "Refusing to use a Codex sandbox broader than workspace-write.",
    );
  const provider = String(process.env.CODEX_PROVIDER || "openai").trim().toLowerCase();
  if (!["openai", "ollama", "groq"].includes(provider))
    throw Object.assign(new Error(`Unsupported CODEX_PROVIDER: ${provider}`), { code: "MODEL_PROVIDER" });
  if (provider === "groq" && !process.env.GROQ_API_KEY)
    throw Object.assign(new Error("GROQ_API_KEY is required when CODEX_PROVIDER=groq"), { code: "MODEL_PROVIDER" });
  const groqConfig = provider === "groq"
    ? [
        "-c", 'model_provider="groq"',
        "-c", 'model_providers.groq.name="Groq"',
        "-c", 'model_providers.groq.base_url="https://api.groq.com/openai/v1"',
        "-c", 'model_providers.groq.env_key="GROQ_API_KEY"',
        "-c", 'model_providers.groq.wire_api="responses"',
      ]
    : [];
  return {
    command: settings.codex.command,
    args: [
      "exec",
      ...(provider === "ollama" ? ["--oss", "--local-provider", "ollama"] : []),
      ...groqConfig,
      ...(process.env.CODEX_MODEL ? ["--model", process.env.CODEX_MODEL] : []),
      "--sandbox",
      "workspace-write",
      "--skip-git-repo-check",
      "--cd",
      employeeRoot,
      "--add-dir",
      projectRoot,
      "-",
    ],
    cwd: employeeRoot,
    prompt,
    env: provider === "groq" ? { GROQ_API_KEY: process.env.GROQ_API_KEY } : {},
  };
}
/**
 * Verify the configured workspace-write sandbox using a disposable, narrowly
 * scoped canary before launching work. A successful process alone is not enough:
 * the exact expected file content must also be readable afterward.
 */
export async function restrictedPreflight(
  settings,
  entry,
  employeeRoot,
  projectRoot,
  executor = spawnCodex,
) {
  const target = path.join(
    projectRoot,
    "working",
    `.demo-preflight-${crypto.randomUUID()}.txt`,
  );
  const invocation = invocationFor(
    settings,
    employeeRoot,
    projectRoot,
    `This is a restricted workspace permission preflight, not customer work. Write exactly PREFLIGHT_OK to ${target}, read it back, then stop. Do not read any other project files or write anywhere else.`,
  );
  const result = await executor(
    settings,
    { projectId: path.basename(projectRoot) },
    { invocation },
  );
  let readback = false;

  try {
    // The canary might not exist if Codex failed to create it.
    // Missing or unreadable files must fail the preflight safely.
    readback = fs.readFileSync(target, "utf8").replace(/^\uFEFF/, "").trim() === "PREFLIGHT_OK";
  } catch {
    readback = false;
  } finally {
    // Remove the temporary canary if it exists.
    try {
      fs.rmSync(target, { force: true });
    } catch {}
  }
  if (!result.ok || !readback) {
    const diagnostic = {
      spawnSucceeded: result.spawnSucceeded ?? null,
      exitCode: result.exitCode ?? null,
      timedOut: result.timedOut === true,
      readback,
      durationMs: Number.isFinite(result.durationMs) ? Math.round(result.durationMs) : null,
    };
    throw Object.assign(new Error(`Restricted workspace-write preflight failed; agent was not launched. Diagnostics: ${JSON.stringify(diagnostic)}`),
      { code: "PREFLIGHT_FAILED", diagnostic });
  }
  return { ok: true, readback: true };
}
/** Collect existence and SHA-256 fingerprints for the exact declared inputs. */
function inputState(projectRoot, paths, optional = false) {
  const items = [];
  const missing = [];
  for (const relative of paths) {
    const file = safeProjectFile(projectRoot, relative);
    if (
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile() ||
      fs.statSync(file).size === 0
    ) {
      items.push({ path: relative, exists: false, hash: null });
      if (!optional) missing.push(relative);
    } else items.push({ path: relative, exists: true, hash: hashFile(file) });
  }
  return {
    valid: missing.length === 0,
    items,
    missing,
    fingerprint: crypto
      .createHash("sha256")
      .update(JSON.stringify(items))
      .digest("hex"),
  };
}
/** Reuse a prior artifact only when dependencies, output hash, and validation match. */
function previousReusable(projectRoot, entry, dependencyFingerprint, currentInputs = null) {
  const runs = path.join(projectRoot, "logs", "demo-runs");
  if (!fs.existsSync(runs)) return null;
  for (const runId of fs.readdirSync(runs).sort().reverse()) {
    const statusFile = path.join(
      runs,
      runId,
      "agents",
      `${entry.employeeId}.json`,
    );
    if (!fs.existsSync(statusFile)) continue;
    try {
      const old = readJson(statusFile);
      if (!["completed", "reused-validated"].includes(old.status)) continue;
      const sourceInputs = rows => (rows || []).filter(row => !row.path.startsWith("logs/demo-runs/"));
      const unchangedReportSources = entry.employeeId === "project-manager" && currentInputs &&
        sourceInputs(old.inputFiles).length === entry.inputs.length + 1 &&
        sourceInputs(old.inputFiles).some(row => row.path === "working/client-brief.json" && row.exists && row.hash) &&
        JSON.stringify(sourceInputs(old.inputFiles)) === JSON.stringify(sourceInputs(currentInputs));
      if (old.dependencyFingerprint !== dependencyFingerprint && !unchangedReportSources) continue;
      const out = safeProjectFile(projectRoot, entry.output);
      if (!fs.existsSync(out) || hashFile(out) !== old.outputHash) continue;
      const validation =
        entry.kind === "client-manager"
          ? validateClientBrief(projectRoot, path.basename(projectRoot))
          : validateMarkdown(out);
      if (validation.valid) return { old, validation };
    } catch {
      /* Invalid history is never treated as a reusable result. */
    }
  }
  return null;
}
/**
 * Assemble the employee's role, routine instructions, task context, allowed
 * source files, output contract, prior observed outcomes, and safety boundaries.
 * Codex CLI receives this text as its task; the employee's role specialization
 * comes from its routine/role instructions, not from separate autonomous minds.
 */
function buildAgentPrompt(
  entry,
  employeeRoot,
  projectRoot,
  inputs,
  output,
  manifestPath,
  priorStatuses,
  preliminary = false,
) {
  // Give the model exact paths and known prior outcomes so its task has bounded context.
  const skill = path.join(employeeRoot, "routines", entry.routine, "SKILL.md");
  const inputNames = inputs.map(
    (item) =>
      `${item.path}${item.exists ? "" : " (not present; report as missing)"}`,
  );
  return [
    `You are the ${entry.role} employee executing routine ${entry.routine}.`,
    ...(preliminary ? [
      "ASSESSMENT TYPE: PUBLIC PRELIMINARY (UNVERIFIED). Use only facts directly supplied in the client intake; do not infer that sender identity, organization identity, claims, controls, or evidence are verified. Label every such statement unverified/client-reported. This is not a certification, audit opinion, or compliance determination.",
    ] : []),
    `Selected project root (use this exact root): ${projectRoot}`,
    `Read the routine instructions at ${skill}, the employee's AGENTS.md, CONTRACT.md, ROLE.md, SCHEDULE.md and matching work-profile entry. Execute the routine and produce the required file; do not merely describe what should be done.`,
    `Exact source filenames: ${inputNames.join("; ") || "(none)"}. Read only files marked present.`,
    `Required output filename: ${output}. It must be created as Markdown with sections titled Established facts, Missing evidence, Assumptions, and Recommendations.`,
    `Workflow status manifest (read-only): ${manifestPath}. Prior observed outcomes: ${JSON.stringify(priorStatuses)}.`,
    ...(entry.employeeId === "project-manager"
      ? [
          MANAGEMENT_INSTRUCTION,
          "Write an employer-facing cybersecurity management report, not concatenated employee logs. Lead with an executive summary, scope, material issues and decisions required. Include a numbered findings register. For each finding state the source evidence and confidence, issue, potential business impact, recommended action and why it helps, proposed owner and relative target (clearly recommendations, never approved assignments), current remediation status, and objective closure evidence. Distinguish reported weaknesses from missing evidence. Include a remediation roadmap, metrics limitations, and contributions from all eight roles. Summarize specialist work instead of repeating full documents. Explicitly state which customer controls were actually changed; if none were implemented or verified, say so. Retain Established facts, Missing evidence, Assumptions and Recommendations sections required by validation. Treat execution status as a historical snapshot; do not claim the current Project Manager remains not-run after delivery.",
          "The final report must contain an Execution status table with one row per employee shown in prior observed outcomes, using each exact employee ID and status. Identify every blocked, failed, or not-run employee and list the blocker when recorded.",
        ]
      : []),
    "Use only supplied evidence. Attribute client claims to their source. Never invent audit evidence, controls, measurements, dates, or scores. Separate established facts, missing evidence, assumptions, and recommendations.",
    "Do not claim ISO/IEC 27001 certification or audit conformity. This is preparation work only.",
    "Write only the one required output inside the selected project. Do not alter source inputs, other outputs, employee files, logs, installation markers, or configuration. No Gmail, Sheets, network, sending, publishing, scheduling, spending, or credential actions.",
  ].join("\n");
}
function writeJson(file, value) {
  // Create the parent folder if needed, then persist formatted JSON for review.
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}
function statusRecord(entry, fields = {}) {
  // Start every employee with an explicit not-run state; later steps replace fields.
  return {
    employeeId: entry.employeeId,
    routine: entry.routine,
    inputFiles: [],
    outputPath: null,
    status: "not-run",
    startedAt: null,
    finishedAt: null,
    subprocessExitStatus: null,
    outputExists: false,
    validation: { valid: false, result: "not-checked" },
    ...fields,
  };
}

/**
 * Run or statically inspect the roster and return the persisted manifest.
 * @param {object} options Demo workspace, project, dry-run policy, and injectable test hooks.
 * @param {string} options.projectId Existing project ID under the configured projects root.
 * @returns {Promise<object>} Execution manifest containing per-employee outcomes and validation.
 * @throws {Error} If configuration, project boundaries, dependencies, or required checks fail.
 * @description A central controller runs employees in dependency order. Deterministic
 * checks surround LLM drafting because an exit code only says the subprocess ended;
 * it does not prove that the requested artifact exists, follows its contract, or is safe.
 */
export async function runDemo({
  workspaceRoot = DEFAULT_WORKSPACE,
  projectId,
  dryRun = false,
  executor = null,
  preflight = null,
  guard = runGuard,
  onProgress = () => {},
} = {}) {
  // Require a project selection before loading configuration or touching run state.
  if (!projectId) throw new Error("Supply --project <project-id>.");
  // Load workspace settings and reject a project that is missing or outside its root.
  const settings = loadConfiguration(workspaceRoot);
  const projectRoot = safeProject(settings, projectId);
  const preliminary = fs.existsSync(path.join(projectRoot, "working", "public-intake-record.json"));
  if (preliminary) {
    // Enforce classification again inside the employee runner, including CLI
    // and restart paths that do not pass through start-agency.mjs.
    let category;
    try {
      const brief = readJson(path.join(projectRoot, "working", "client-brief.json"));
      category = brief?.intake_classification?.category;
    } catch {
      throw Object.assign(new Error("Public brief is unavailable for security classification."), { code: "PUBLIC_CLASSIFICATION_INVALID" });
    }
    const review = loadAuthorizedPublicReview(projectId, path.join(workspaceRoot, "agency", "state", "public-review-decisions.json"));
    const reviewValid = review?.projectId === projectId && review?.reviewedCategory === category &&
      review?.decision === "approved_for_preliminary_processing" &&
      typeof review.by === "string" && review.by.trim() &&
      typeof review.reason === "string" && review.reason.trim() &&
      typeof review.at === "string" && !Number.isNaN(Date.parse(review.at));
    if (!category || (category !== "new_client_request" && !reviewValid))
      throw Object.assign(new Error("Held public inquiry requires an authorized review decision."), { code: "PUBLIC_SECURITY_REVIEW_REQUIRED" });
    if (!validateClientBrief(projectRoot, projectId).valid)
      throw Object.assign(new Error("Public client brief failed validation; classification work must be repaired before specialist dispatch."), { code: "PUBLIC_BRIEF_INVALID" });
  }
  // Give this execution a unique folder for status records and its final manifest.
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}`;
  const runRoot = path.join(projectRoot, "logs", "demo-runs", runId);
  const agentsDir = path.join(runRoot, "agents");
  const manifestPath = path.join(runRoot, "manifest.json");
  const manifest = {
    schemaVersion: 1,
    runId,
    projectId,
    projectRoot,
    ...(preliminary ? { assessmentType: "PUBLIC_PRELIMINARY_UNVERIFIED", externalReporting: false } : {}),
    dryRun,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: ROSTER.map((entry) => entry.employeeId),
    agents: [],
  };
  const statuses = new Map();
  const persist = async (record) => {
    // Refresh whether the expected output is present before recording this status.
    if (typeof record.outputPath === "string")
      record.outputExists = fs.existsSync(record.outputPath);
    statuses.set(record.employeeId, record);
    // Write both a per-employee record and the ordered aggregate manifest.
    writeJson(path.join(agentsDir, `${record.employeeId}.json`), record);
    manifest.agents = ROSTER.map(
      (entry) => statuses.get(entry.employeeId) || statusRecord(entry),
    );
    manifest.updatedAt = new Date().toISOString();
    writeJson(manifestPath, manifest);
    await onProgress({ status: record.status, employeeId: record.employeeId, projectId, runId,
      valid: record.validation?.valid === true, blocker: record.blocker || null,
      failure: record.failure || null,
      reasonCode: record.validation?.category || (record.status === "blocked" ? "GUARD_BLOCKED" : record.status === "failed" ? "EMPLOYEE_EXECUTION_FAILED" : null) });
  };
  // Establish the immutable run record before any preflight or agent execution.
  manifest.agents = ROSTER.map((entry) => statusRecord(entry));
  for (const entry of ROSTER)
    writeJson(
      path.join(agentsDir, `${entry.employeeId}.json`),
      statusRecord(entry),
    );
  writeJson(manifestPath, manifest);
  const briefValidation = validateClientBrief(projectRoot, projectId);
  await onProgress({ status: "started", employeeId: ROSTER[0].employeeId, projectId, runId });
  let briefStatus = statusRecord(ROSTER[0], {
    inputFiles: ["client-input/company-profile.md"],
    outputPath: path.join(projectRoot, "working/client-brief.json"),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    outputExists: fs.existsSync(
      path.join(projectRoot, "working/client-brief.json"),
    ),
    validation: {
      valid: briefValidation.valid,
      category: briefValidation.category || null,
      errors: briefValidation.errors || [],
    },
  });
  // Record installation marker issues separately so a failed review is visible in the run.
  try {
    const cmEmployee = readJson(
      path.join(workspaceRoot, "client-manager", "employee.json"),
    );
    briefStatus.installationMarkerReview = markerConflict(
      workspaceRoot,
      path.resolve(workspaceRoot, "client-manager"),
      cmEmployee,
      ROSTER[0],
    );
  } catch (error) {
    briefStatus.installationMarkerReview = error.message;
  }
  // A valid pre-existing brief satisfies the first workflow stage without a subprocess.
  if (briefValidation.valid) briefStatus.status = "reused-validated";
  else {
    const entry = ROSTER[0];
    const employeeRoot = path.resolve(workspaceRoot, entry.workspaceRoot);
    try {
      // Confirm employee metadata, routine instructions, installation receipt, and guard.
      const employee = readJson(path.join(employeeRoot, "employee.json"));
      if (!employee.routines?.some((row) => row.id === entry.routine))
        throw new Error(
          "Client Manager intake is not declared in employee.json.",
        );
      if (
        !fs.existsSync(
          path.join(employeeRoot, "routines", entry.routine, "SKILL.md"),
        )
      )
        throw new Error("Client Manager intake SKILL.md is missing.");
      const conflict = markerConflict(
        workspaceRoot,
        employeeRoot,
        employee,
        entry,
      );
      if (conflict)
        throw Object.assign(new Error(conflict), {
          code: "INSTALL_MARKER_CONFLICT",
        });
      const guardResult = await runGuard(employeeRoot, entry, projectRoot, {
        dryRun,
      });
      if (!guardResult.ok) throw new Error(guardResult.reason);
      if (dryRun) {
        briefStatus.status = "not-run";
        briefStatus.blocker =
          "Client Manager intake would run, but static dry run never launches Codex.";
      } else {
        // Use an injected test hook when supplied; otherwise apply the restricted preflight.
        const effectivePreflight =
          preflight ||
          ((s, e, root, proj) => restrictedPreflight(s, e, root, proj));
        await effectivePreflight(settings, entry, employeeRoot, projectRoot);
        const skill = path.join(
          employeeRoot,
          "routines",
          entry.routine,
          "SKILL.md",
        );
        const inputFile = path.join(
          projectRoot,
          "client-input",
          "company-profile.md",
        );
        const outputFile = path.join(projectRoot, entry.output);
        // The prompt tells Codex what source to read and exactly one file to create.
        const prompt = [
          "Execute the existing Client Manager client-intake routine and create the required JSON file; do not merely describe it.",
          `Routine instructions: ${skill}`,
          `Exact project root: ${projectRoot}`,
          `Project ID: ${projectId}`,
          `Read only the supplied company source: ${inputFile}. Required output: ${outputFile}.`,
          "Use only provided facts. Separate known facts, assumptions, and missing information. Do not invent evidence or claim ISO certification.",
          "Write only working/client-brief.json; do not modify source inputs, logs, other outputs, or external systems. No sending, Gmail, publishing, or credentials.",
        ].join("\n");
        // This is the actual model boundary: executor or Codex CLI receives the bounded task.
        const invocation = invocationFor(
          settings,
          employeeRoot,
          projectRoot,
          prompt,
        );
        const result = await (
          executor || ((s, task, opts) => spawnCodex(s, task, opts))
        )(settings, { projectId }, { invocation });
        briefStatus.subprocessExitStatus = result.exitCode ?? null;
        briefStatus.outputExists = fs.existsSync(outputFile);
        // A successful process is not enough: check the output contract independently.
        const check = validateClientBrief(projectRoot, projectId);
        briefStatus.validation = {
          valid: check.valid,
          category: check.category || null,
          errors: check.errors || [],
        };
        briefStatus.process = {
          spawnSucceeded: result.spawnSucceeded ?? null,
          signal: result.signal ?? null,
          timedOut: result.timedOut ?? false,
          durationMs: result.durationMs ?? null,
        };
        briefStatus.status = result.ok && check.valid ? "completed" : "failed";
        if (briefStatus.status === "completed")
          briefStatus.outputHash = hashFile(outputFile);
        else
          briefStatus.failure = result.ok
            ? "Client brief validation failed."
            : result.error || `Codex exited ${result.exitCode}`;
      }
    } catch (error) {
      briefStatus.status =
        error.code === "INSTALL_MARKER_CONFLICT" ? "blocked" : "failed";
      briefStatus.blocker = error.message;
      briefStatus.validation = {
        valid: false,
        category: error.code || "PRECHECK_FAILED",
        result: error.message,
      };
    }
    briefStatus.finishedAt = new Date().toISOString();
  }
  await persist(briefStatus);

  // Run the remaining roster entries in order so each can depend on earlier artifacts.
  for (const entry of ROSTER.slice(1)) {
    await onProgress({ status: "started", employeeId: entry.employeeId, projectId, runId });
    const employeeRoot = path.resolve(workspaceRoot, entry.workspaceRoot);
    const record = statusRecord(entry, {
      inputFiles: [...entry.inputs],
      outputPath: path.join(projectRoot, entry.output),
      startedAt: new Date().toISOString(),
    });
    try {
      // Validate employee metadata and routine files against the explicit roster contract.
      if (!fs.statSync(employeeRoot).isDirectory())
        throw new Error("Employee workspace does not exist.");
      const employee = readJson(path.join(employeeRoot, "employee.json"));
      const profile = readJson(path.join(employeeRoot, "work-profile.json"));
      if (
        employee.routines?.length !== 1 ||
        employee.routines[0].id !== entry.routine ||
        !Object.hasOwn(profile.routines || {}, entry.routine)
      )
        throw new Error(
          "Active employee metadata does not match the demo roster.",
        );
      const skill = path.join(
        employeeRoot,
        "routines",
        entry.routine,
        "SKILL.md",
      );
      if (!fs.existsSync(skill))
        throw new Error("Routine SKILL.md is missing.");
      const conflict = markerConflict(
        workspaceRoot,
        employeeRoot,
        employee,
        entry,
      );
      record.installationMarkerReview = conflict;
      const output = safeProjectFile(projectRoot, entry.output);
      // Reject any output that still resolves outside the selected project root.
      if (!inside(projectRoot, output))
        throw new Error("Output path is outside the selected project.");
      const guardResult = await guard(employeeRoot, entry, projectRoot, {
        dryRun,
      });
      record.guardReview = guardResult;
      const required = entry.optionalInputs
        ? ["working/client-brief.json"]
        : entry.inputs;
      const inputCheck = inputState(projectRoot, required, false);
      const optionalCheck = entry.optionalInputs
        ? inputState(projectRoot, entry.inputs, true)
        : { items: [] };
      record.inputFiles = [
        ...inputCheck.items,
        ...optionalCheck.items.filter(
          (item) => !inputCheck.items.some((known) => known.path === item.path),
        ),
      ];
      // A missing required input blocks this employee before a model call is considered.
      if (!inputCheck.valid) {
        record.status = "blocked";
        record.blocker = `Required dependencies are missing or empty: ${inputCheck.missing.join(", ")}`;
        record.validation = {
          valid: false,
          category: "DEPENDENCY_MISSING",
          result: record.blocker,
        };
        record.finishedAt = new Date().toISOString();
        await persist(record);
        continue;
      }
      // A marker conflict means installed employee files no longer match trusted receipt data.
      if (conflict)
        throw Object.assign(new Error(conflict), {
          code: "INSTALL_MARKER_CONFLICT",
        });
      
      // Fingerprint current inputs so old output is reused only for the same evidence state.
      record.dependencyFingerprint = inputState(
        projectRoot,
        entry.inputs,
        Boolean(entry.optionalInputs),
      ).fingerprint;
      let workflow = null;
      if (entry.employeeId === "project-manager") {
        // The final report also depends on observed statuses from all earlier employees.
        workflow = ROSTER.slice(0, -1)
          .map((row) => statuses.get(row.employeeId))
          .filter(Boolean)
          .map((row) => ({
            employeeId: row.employeeId,
            routine: row.routine,
            status: row.status,
            validation: row.validation,
            blocker: row.blocker || row.failure || null,
          }));
        // Include status changes in the fingerprint so a prior report cannot go stale silently.
        record.dependencyFingerprint = crypto
          .createHash("sha256")
          .update(
            `${record.dependencyFingerprint}\0${JSON.stringify(workflow)}`,
          )
          .digest("hex");
        record.inputFiles.push({
          path: `logs/demo-runs/${runId}/manifest.json`,
          exists: true,
          hash: crypto
            .createHash("sha256")
            .update(JSON.stringify(workflow))
            .digest("hex"),
        });
      }
      // Reuse only when the previous output still validates against this dependency fingerprint.
      const reusable = previousReusable(
        projectRoot,
        entry,
        record.dependencyFingerprint,
        record.inputFiles,
      );
      if (reusable) {
        record.status = "reused-validated";
        record.finishedAt = new Date().toISOString();
        record.outputExists = true;
        record.outputHash = hashFile(output);
        record.validation = reusable.validation;
        record.subprocessExitStatus = null;
        await persist(record);
        continue;
      }
      // A previously validated artifact can be reused without a new AI execution.
      // A NEW execution must still pass the employee's guard.
      if (!guardResult.ok) {
        record.status = "blocked";
        record.blocker =
          guardResult.reason || "Existing employee guard blocked the routine.";
        record.validation = {
          valid: false,
          category: "GUARD_BLOCKED",
          result: record.blocker,
        };
        record.finishedAt = new Date().toISOString();
        await persist(record);
        continue;
      }
      if (dryRun) {
        // Static mode records that work was skipped and never starts the AI subprocess.
        record.status = "not-run";
        record.guard = guardResult;
        record.validation = {
          valid: false,
          result: "not-run (static dry run)",
        };
        record.finishedAt = new Date().toISOString();
        await persist(record);
        continue;
      }
      const effectivePreflight =
        preflight ||
        ((s, e, root, proj) => restrictedPreflight(s, e, root, proj));
      await effectivePreflight(settings, entry, employeeRoot, projectRoot);
      const promptWorkflow =
        workflow ||
        ROSTER.map((row) => statuses.get(row.employeeId))
          .filter(Boolean)
          .map((row) => ({
            employeeId: row.employeeId,
            routine: row.routine,
            status: row.status,
            validation: row.validation,
            blocker: row.blocker || row.failure || null,
          }));
      const prompt = buildAgentPrompt(
        entry,
        employeeRoot,
        projectRoot,
        record.inputFiles,
        output,
        manifestPath,
        promptWorkflow,
        preliminary,
      );
      const invocation = invocationFor(
        settings,
        employeeRoot,
        projectRoot,
        prompt,
      );
      const result = await (
        // This executor call is where Codex receives the task and may invoke an AI model.
        executor || ((s, task, opts) => spawnCodex(s, task, opts))
      )(settings, { projectId }, { invocation });
      record.subprocessExitStatus = result.exitCode ?? null;
      record.process = {
        spawnSucceeded: result.spawnSucceeded ?? null,
        signal: result.signal ?? null,
        timedOut: result.timedOut ?? false,
        durationMs: result.durationMs ?? null,
      };
      record.outputExists = fs.existsSync(output);
      // Validate the file on disk independently of the subprocess exit status.
      const validation = validateMarkdown(
        output,
        entry.employeeId === "project-manager" ? promptWorkflow : null,
      );
      record.validation = validation;
      if (result.ok && validation.valid) {
        record.status = "completed";
        record.outputHash = hashFile(output);
      } else {
        record.status = "failed";
        record.failure = !result.ok
          ? result.error || `Codex exited ${result.exitCode}`
          : validation.reason;
      }
      record.finishedAt = new Date().toISOString();
      await persist(record);
    } catch (error) {
      // Convert an exception into a visible employee status and continue the roster loop.
      record.status =
        error.code === "INSTALL_MARKER_CONFLICT" ? "blocked" : "failed";
      record.blocker = record.status === "blocked" ? error.message : undefined;
      record.failure = record.status === "failed" ? error.message : undefined;
      record.validation = {
        valid: false,
        category: error.code || "PRECHECK_FAILED",
        result: error.message,
      };
      record.finishedAt = new Date().toISOString();
      await persist(record);
    }
  }
  manifest.finishedAt = new Date().toISOString();
  manifest.updatedAt = manifest.finishedAt;
  manifest.finalStatus = manifest.agents.every((row) =>
    ["completed", "reused-validated"].includes(row.status),
  )
    ? "completed"
    : "incomplete";
  if (!dryRun && manifest.finalStatus === "completed") {
    try {
      manifest.finalReportDocx = buildFinalDocx(projectRoot, manifest);
    } catch {
      manifest.finalStatus = "incomplete";
      manifest.finalReportDocx = { validation: "failed", code: "DOCX_EXPORT_FAILED" };
    }
  }
  writeJson(manifestPath, manifest);
  return { manifestPath, manifest };
}

function parseArgs(argv) {
  // Begin with defaults; only supported flags are copied into the returned options object.
  const result = { projectId: null, dryRun: false };
  // Inspect each argument, consuming the following token when --project is present.
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--project" && argv[i + 1]) result.projectId = argv[++i];
    else if (argv[i] === "--dry-run") result.dryRun = true;
    else if (argv[i] === "--help" || argv[i] === "-h") result.help = true;
    else throw new Error(`Unknown or incomplete option: ${argv[i]}`);
  }
  return result;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  // This check prevents importing the module for tests from launching the command-line workflow.
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      // Help prints usage and exits successfully before loading a project.
      console.log(
        "Usage: node agency/demo/run-demo.mjs --project <project-id> [--dry-run]",
      );
      process.exit(0);
    }
    const result = await runDemo(args);
    // Print a compact summary for humans and shell automation.
    console.log(
      JSON.stringify(
        {
          manifestPath: result.manifestPath,
          finalStatus: result.manifest.finalStatus,
          agents: result.manifest.agents.map(
            ({ employeeId, routine, status, blocker, failure }) => ({
              employeeId,
              routine,
              status,
              blocker,
              failure,
            }),
          ),
        },
        null,
        2,
      ),
    );
    // Non-completed real runs use exit code 1; static dry runs are informational.
    if (result.manifest.finalStatus !== "completed" && !args.dryRun)
      process.exitCode = 1;
  } catch (error) {
    // Report the reason and let the shell detect failure through a nonzero exit code.
    console.error(`Demo blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
