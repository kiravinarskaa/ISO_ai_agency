#!/usr/bin/env node
/**
 * Validates a completed local execution manifest and publishes an approved run
 * summary to Google Sheets, with an optional separately approved confirmation
 * email through Gmail. This is deterministic integration code, not an AI agent:
 * it does not reason over client evidence or run employee routines. OAuth grants
 * and protected token files are kept separate for Sheets editing, Gmail sending,
 * and read-only receipt verification. External writes require operator approval.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// Keep all reporting data paths anchored to this integration's source directory.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const AGENCY = path.resolve(HERE, "..", "..");
const CONFIG_PATH = path.join(HERE, "reporting-config.json");
const PRIVATE = path.join(HERE, "private");
const STATE = path.join(HERE, "state");
const JOURNAL = path.join(HERE, "logs", "reporting-audit.jsonl");
const DEMO_POLICY_PATH = path.join(HERE, "demo-reporting-policy.json");
const WORKFLOW_POLICY_PATH = path.join(HERE, "automatic-workflow-policy.json");
const CUSTOMER_CONTACT_POLICY_PATH = path.join(HERE, "customer-contact-policy.json");
const CUSTOMER_NOTICE_CAPABILITY = Symbol("validated-customer-notice");
const CUSTOMER_FOLLOWUP_STATE_PATH = path.resolve(AGENCY, "state", "customer-followups.json");
const DEMO_AUTH_STATE = path.join(STATE, "demo-reporting-state.json");
const DEMO_PROJECT_STATE = path.resolve(AGENCY, "state", "demo-project-authorizations.json");
// This capability token stays module-private: callers cannot manufacture policy authorization.
const DEMO_POLICY_CAPABILITY = Symbol("explicit-demo-reporting-policy");
const WORKFLOW_POLICY_CAPABILITY = Symbol("explicit-automatic-workflow-policy");
const GMAIL_PRIVATE = path.resolve(HERE, "..", "gmail", "private");
const GMAIL_NODE_MODULES = path.resolve(HERE, "..", "gmail", "node_modules");
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
// Keep publication, sending, and receipt verification in separate OAuth grants.
// A compromised send credential therefore cannot edit Sheets or read Gmail.
const HEADERS = [
  "run_id",
  "project_id",
  "employee_id",
  "routine",
  "execution_status",
  "artifact_basename",
  "validation_status",
  "timestamp",
];
const EXPECTED_EMPLOYEES = [
  "client-manager",
  "isms-readiness-planner",
  "requirements-evidence-specialist",
  "technical-controls-analyst",
  "security-awareness-specialist",
  "corrective-action-specialist",
  "readiness-metrics-analyst",
  "project-manager",
];
const OWNED_OUTPUTS = Object.freeze({
  "client-manager": ["client-intake", "client-brief.json"],
  "isms-readiness-planner": [
    "prepare-readiness-roadmap",
    "isms-readiness-plan.md",
  ],
  "requirements-evidence-specialist": [
    "build-evidence-register",
    "evidence-register.md",
  ],
  "technical-controls-analyst": [
    "review-technical-controls",
    "technical-controls-assessment.md",
  ],
  "security-awareness-specialist": [
    "prepare-awareness-plan",
    "awareness-training-plan.md",
  ],
  "corrective-action-specialist": [
    "build-corrective-action-register",
    "corrective-action-register.md",
  ],
  "readiness-metrics-analyst": [
    "summarize-readiness-metrics",
    "readiness-dashboard.md",
  ],
  "project-manager": ["coordinate-readiness-project", "final-agency-report.md"],
});

// Reading path for beginners:
// 1. Check the configured Sheet, recipient, and protected OAuth storage.
// 2. Convert validated run artifacts into fixed, sanitized rows.
// 3. Require operator-created policies for automatic publication and email.
// 4. Save each delivery step so uncertain sends are never blindly repeated.

const requireGoogle = createRequire(
  path.join(GMAIL_NODE_MODULES, "package.json"),
);
const googleapis = () => requireGoogle("googleapis").google;

export class ReportingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReportingError";
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new ReportingError(code, message);
};
const safeId = (v) =>
  typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v);
const validTime = (v) =>
  typeof v === "string" &&
  Number.isFinite(Date.parse(v)) &&
  /^\d{4}-\d\d-\d\dT/.test(v);

/** Neutralize spreadsheet formula prefixes and bound untrusted cell text. */
export function safeCell(value) {
  // Prefix formula-like text so spreadsheet software treats untrusted content as text.
  const s = String(value ?? "");
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

/**
 * Validate run identity, employee ownership, and on-disk artifact paths before
 * creating the exact rows eligible for external publication.
 */
/**
 * Validate the local run manifest against the fixed employee/output allowlist.
 * @param {object} manifest Parsed execution manifest from the selected project.
 * @param {string} manifestPath Local path used to verify project/run boundaries.
 * @param {object} config Validated project and expected employee configuration.
 * @returns {Array<object>} Exactly eight normalized rows suitable for the sheet contract.
 * @throws {ReportingError} If identity, completion, paths, timestamps, or outputs are invalid.
 * @description Reporting trusts only observed and validated execution metadata;
 * it does not ask an LLM to invent or summarize statuses.
 */
export function validateManifest(
  manifest,
  manifestPath,
  config,
  { projectRoot = path.resolve(AGENCY, "projects", config.projectId) } = {},
) {
  // Reject malformed manifests before translating any status into a publishable row.
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
    fail("MANIFEST_SCHEMA", "Manifest must be a JSON object.");
  if (
    manifest.schemaVersion !== 1 ||
    !safeId(manifest.runId) ||
    manifest.projectId !== config.projectId
  )
    fail(
      "MANIFEST_IDENTITY",
      "Manifest schema, run ID, or configured project ID is invalid.",
    );
  if (
    manifest.dryRun !== false ||
    manifest.finalStatus !== "completed" ||
    !validTime(manifest.startedAt) ||
    !validTime(manifest.finishedAt)
  )
    fail(
      "RUN_INCOMPLETE",
      "Only a completed, non-dry run with valid timestamps can be published.",
    );
  const runRoot = path.dirname(manifestPath);
  if (
    path.basename(runRoot) !== manifest.runId ||
    path.basename(manifestPath) !== "manifest.json"
  )
    fail("RUN_PATH", "Manifest location does not match its run identity.");
  // Require every expected employee once and in the configured run order.
  const expected = config.employeeIds;
  if (
    !Array.isArray(manifest.order) ||
    manifest.order.length !== 8 ||
    manifest.order.some((id, i) => id !== expected[i])
  )
    fail(
      "EMPLOYEE_ORDER",
      "Manifest must contain the configured eight employees in order.",
    );
  if (!Array.isArray(manifest.agents) || manifest.agents.length !== 8)
    fail(
      "EMPLOYEE_COUNT",
      "Manifest must contain exactly eight employee entries.",
    );
  const seen = new Set();
  // Convert each validated employee result into the fixed external sheet columns.
  const rows = manifest.agents.map((a) => {
    if (!a || !expected.includes(a.employeeId) || seen.has(a.employeeId))
      fail(
        "EMPLOYEE_ID",
        "Manifest contains an unknown or duplicate employee.",
      );
    seen.add(a.employeeId);
    if (
      !safeId(a.routine) ||
      !["completed", "reused-validated"].includes(a.status) ||
      !validTime(a.finishedAt) ||
      a.validation?.valid !== true ||
      a.outputExists !== true
    )
      fail(
        "ARTIFACT_INVALID",
        "Every employee must have a validated output and a permitted execution status.",
      );
    if (a.status === "completed" && a.subprocessExitStatus !== 0)
      fail(
        "EXECUTION_INVALID",
        "A completed output must have a successful subprocess result.",
      );
    // The employee can publish only its one configured output basename and routine.
    const [expectedRoutine, output] = OWNED_OUTPUTS[a.employeeId];
    if (
      a.routine !== expectedRoutine ||
      typeof a.outputPath !== "string" ||
      path.basename(a.outputPath) !== output ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(output)
    )
      fail(
        "ARTIFACT_PATH",
        "Artifact does not match the configured employee output owner.",
      );
    // Check both lexical paths and real filesystem paths to reject symlinks or escapes.
    const artifactPath = path.resolve(projectRoot, "working", output);
    if (path.resolve(a.outputPath) !== artifactPath)
      fail(
        "ARTIFACT_PATH",
        "Artifact path does not match the configured employee output location.",
      );
    assertNoSymlinks(projectRoot);
    assertNoSymlinks(artifactPath);
    if (
      !inside(fs.realpathSync(projectRoot), fs.realpathSync(artifactPath)) ||
      !fs.statSync(artifactPath).isFile()
    )
      fail(
        "ARTIFACT_PATH",
        "Artifact must be a regular file inside the configured project.",
      );
    const cellRow = [
      manifest.runId,
      config.projectId,
      a.employeeId,
      a.routine,
      a.status,
      output,
      "validated",
      a.finishedAt,
    ].map(safeCell);
    return Object.freeze(
      Object.fromEntries(HEADERS.map((h, i) => [h, cellRow[i]])),
    );
  });
  if (seen.size !== 8)
    fail("EMPLOYEE_COUNT", "Manifest is missing an expected employee.");
  return Object.freeze(rows);
}

// PRIVATE STORAGE AND DESTINATION CONFIG
// These checks run before reporting reads tokens or calls Google APIs.
function inside(root, candidate) {
  const rel = path.relative(root, candidate);
  return (
    rel !== "" &&
    !rel.startsWith(`..${path.sep}`) &&
    rel !== ".." &&
    !path.isAbsolute(rel)
  );
}

/** Reject missing path components and symlinks before trusting local inputs. */
function assertNoSymlinks(filePath) {
  const resolved = path.resolve(filePath);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const part of resolved
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    if (!fs.existsSync(current))
      fail(
        "PATH_MISSING",
        "A required manifest or artifact path does not exist.",
      );
    if (fs.lstatSync(current).isSymbolicLink())
      fail(
        "PATH_SYMLINK",
        "Symbolic links are not permitted in manifest or artifact paths.",
      );
  }
}

function currentSid() {
  const out = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const sid = out.match(/S-1-(?:\d+-){1,}\d+/)?.[0];
  if (!sid)
    fail(
      "ACL_IDENTITY",
      "Could not determine the current Windows account SID.",
    );
  return sid;
}

const CREDENTIAL_FILES = new Set([
  "credentials.json",
  "sheets-credentials.json",
  "gmail-send-credentials.json",
  "customer-send-credentials.json",
]);
const TOKEN_FILES = new Set([
  "tokens.json",
  "sheets-tokens.json",
  "gmail-send-tokens.json",
  "customer-send-tokens.json",
]);
/** Check that sensitive credential/token files and their directory have expected ACLs. */
export function verifyAclSnapshot(entries, dir, sid) {
  // Group ACL entries by absolute target path so each protected item is checked once.
  const byTarget = new Map();
  for (const entry of entries || []) {
    if (
      !entry ||
      typeof entry.Target !== "string" ||
      typeof entry.Sid !== "string" ||
      typeof entry.Rights !== "string"
    )
      fail("ACL_VERIFY", "ACL snapshot contains malformed entries.");
    const key = path.resolve(entry.Target).toLowerCase();
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key).push(entry);
  }
  const root = path.resolve(dir).toLowerCase();
  const directoryAces = byTarget.get(root);
  // Limit directory/token control to the current user, SYSTEM, and Administrators;
  // credential files themselves must be readable by the current user only.
  const trusted = new Set([sid, "S-1-5-18", "S-1-5-32-544"]);
  // This helper checks that a target has exactly the approved full-control principals.
  const fullControlSet = (group, { explicit = false } = {}) =>
    group?.length === 3 &&
    group.every(
      (e) =>
        trusted.has(e.Sid) &&
        e.Rights.includes("FullControl") &&
        (!explicit || !e.Inherited),
    );
  if (!fullControlSet(directoryAces, { explicit: true }))
    fail(
      "ACL_VERIFY",
      `Directory ACL verification failed at ${dir}. Expected explicit FullControl for the current account, SYSTEM, and Administrators only.`,
    );
  for (const [target, group] of byTarget) {
    if (target === root) continue;
    const basename = path.basename(target).toLowerCase();
    if (CREDENTIAL_FILES.has(basename)) {
      if (
        group.length !== 1 ||
        group[0].Sid !== sid ||
        group[0].Inherited ||
        !/\bRead\b/.test(group[0].Rights) ||
        /Write|Modify|FullControl|Full Control/.test(group[0].Rights)
      )
        fail(
          "ACL_VERIFY",
          `Credential ACL verification failed at ${target}. Expected explicit Read for the current account only.`,
        );
    } else if (TOKEN_FILES.has(basename)) {
      if (!fullControlSet(group))
        fail(
          "ACL_VERIFY",
          `Token ACL verification failed at ${target}. Expected FullControl for the current account, SYSTEM, and Administrators only.`,
        );
    } else {
      fail(
        "ACL_VERIFY",
        `Unexpected entry in OAuth private directory: ${target}.`,
      );
    }
  }
  return true;
}

/** Verify and, where requested by the existing policy, secure private token storage. */
export function securePrivateStorage(dir = PRIVATE, { apply = true } = {}) {
  // Optionally apply local access restrictions, then verify the resulting metadata.
  if (apply) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
    fail("ACL_PATH", `Private directory is missing or unsafe: ${dir}.`);
  if (process.platform !== "win32") {
    // On POSIX, private storage must deny all group and other access.
    if (apply) fs.chmodSync(dir, 0o700);
    if ((fs.statSync(dir).mode & 0o077) !== 0)
      fail(
        "ACL_VERIFY",
        `Private directory permissions are too broad: ${dir}.`,
      );
    return;
  }
  let sid;
  try {
    sid = currentSid();
  } catch (e) {
    if (e instanceof ReportingError) throw e;
    fail(
      "ACL_IDENTITY",
      "Could not determine the current account for ACL verification.",
    );
  }
  if (apply) {
    try {
      // On Windows, grant access only to the current user and required system accounts.
      execFileSync(
        "icacls.exe",
        [
          dir,
          "/inheritance:r",
          "/grant:r",
          `*${sid}:(OI)(CI)F`,
          "*S-1-5-18:(OI)(CI)F",
          "*S-1-5-32-544:(OI)(CI)F",
        ],
        { windowsHide: true, stdio: "ignore" },
      );
    } catch {
      fail(
        "ACL_APPLY",
        `Could not apply the reporting private directory ACL at ${dir}.`,
      );
    }
  }
  // Verification reads ACL metadata and checks every descendant; it does not
  // mutate ACLs here. This catches inherited or unexpected grants on secrets.
  try {
    const quotedDir = dir.replace(/'/g, "''");
    const ps = `$ErrorActionPreference='Stop'; $targets=@('${quotedDir}') + @(Get-ChildItem -LiteralPath '${quotedDir}' -Recurse -Force | ForEach-Object { $_.FullName }); $rows=foreach($target in $targets){$a=Get-Acl -LiteralPath $target; foreach($entry in $a.Access){[pscustomobject]@{Target=$target;Sid=$entry.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;Rights=[string]$entry.FileSystemRights;Inherited=$entry.IsInherited}}}; ConvertTo-Json -InputObject @($rows) -Compress`;
    const raw = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    verifyAclSnapshot(entries, dir, sid);
  } catch (e) {
    if (e instanceof ReportingError) throw e;
    fail(
      "ACL_READ",
      `Could not read ACL metadata beneath private directory ${dir}; no ACL change was attempted during verification.`,
    );
  }
}

/** Load reporting targets and verify the protected storage setup before use. */
export function loadConfig({ projectId } = {}) {
  // Parse local reporting targets, then reject unexpected destinations or employee lists.
  let c;
  try {
    c = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    fail("CONFIG", "Reporting configuration is missing or invalid JSON.");
  }
  if (
    c.schemaVersion !== 1 ||
    !safeId(c.projectId) ||
    typeof c.spreadsheetId !== "string" ||
    (c.spreadsheetId && !/^[A-Za-z0-9_-]{20,}$/.test(c.spreadsheetId)) ||
    !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
      c.confirmationTo,
    ) ||
    c.confirmationTo !== "csagencyai@gmail.com" ||
    !/^[A-Za-z0-9 _-]{1,80}$/.test(c.sheetName) ||
    JSON.stringify(c.employeeIds) !== JSON.stringify(EXPECTED_EMPLOYEES)
  )
    fail("CONFIG", "Reporting configuration has invalid or unsafe values.");
  if (projectId !== undefined) {
    if (!safeId(projectId)) fail("CONFIG", "Selected project ID is invalid.");
    c.projectId = projectId;
  }
  return c;
}

/** Load the operator-created, demo-only external-write policy. */
// REPORTING POLICIES
// A policy records an operator's approved destination and allowed unattended actions.
export function loadDemoReportingPolicy(filePath = DEMO_POLICY_PATH) {
  let policy;
  try { policy = JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { fail("DEMO_POLICY_MISSING", "Demo reporting policy is not configured."); }
  const config = loadConfig();
  return validateDemoReportingPolicy(policy, config);
}

/** Enforce exact configured agency destinations and the two permitted demo actions. */
export function validateDemoReportingPolicy(policy, config) {
  if (policy?.schemaVersion !== 1 || policy.enabled !== true || !safeId(policy.policyId) ||
      typeof policy.configuredBy !== "string" || !policy.configuredBy.trim() || !safeId(policy.senderPolicyId) ||
      policy.spreadsheetId !== config?.spreadsheetId || policy.sheetName !== config?.sheetName ||
      policy.confirmationTo !== "csagencyai@gmail.com" || policy.confirmationTo !== config?.confirmationTo ||
      policy.agencyOwnedAttested !== true || !Array.isArray(policy.allowedActions) ||
      JSON.stringify(policy.allowedActions) !== JSON.stringify(["publish-sheets", "send-confirmation"]))
    fail("DEMO_POLICY_INVALID", "Demo reporting policy does not match the fixed agency-owned destinations.");
  return policy;
}

/** One-time setup binds unattended demo writes to the current agency-owned targets. */
export function createDemoReportingPolicy({ by, confirmSpreadsheetId, confirmTo,
  senderPolicyId, attestAgencyOwned, filePath = DEMO_POLICY_PATH } = {}) {
  const config = loadConfig();
  if (!config.spreadsheetId || typeof by !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/.test(by.trim()) ||
      confirmSpreadsheetId !== config.spreadsheetId || confirmTo !== "csagencyai@gmail.com" ||
      confirmTo !== config.confirmationTo || attestAgencyOwned !== true || !safeId(senderPolicyId))
    fail("DEMO_SETUP_SCOPE", "Setup must identify the operator, confirm the configured agency ledger and mailbox, attest ownership, and name the sender-policy ID.");
  const senderPolicyPath = path.resolve(AGENCY, "config", "demo-automation-policy.json");
  let senderPolicy;
  try { senderPolicy = JSON.parse(fs.readFileSync(senderPolicyPath, "utf8")); }
  catch { fail("DEMO_SETUP_SCOPE", "Create the synthetic sender policy first."); }
  if (senderPolicy.policyId !== senderPolicyId || senderPolicy.enabled !== true || senderPolicy.addressOwnershipAttested !== true)
    fail("DEMO_SETUP_SCOPE", "Sender-policy ID does not match the enabled synthetic sender policy.");
  const policy = { schemaVersion: 1, enabled: true, policyId: crypto.randomUUID(),
    configuredBy: by.trim(), configuredAt: new Date().toISOString(),
    agencyOwnedAttested: true, senderPolicyId,
    spreadsheetId: config.spreadsheetId, sheetName: config.sheetName,
    confirmationTo: "csagencyai@gmail.com", allowedActions: ["publish-sheets", "send-confirmation"] };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try { fs.writeFileSync(filePath, JSON.stringify(policy, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code === "EEXIST") fail("DEMO_POLICY_EXISTS", "Demo reporting policy already exists; refusing to replace it."); throw error; }
  appendDemoAudit({ event: "demo_reporting_policy_created", policyId: policy.policyId,
    senderPolicyId, configuredBy: policy.configuredBy, spreadsheetId: "[configured agency ledger]",
    confirmationTo: policy.confirmationTo });
  return policy;
}

/** Load the one-time authorization for customer workflow dashboard updates. */
export function loadAutomaticWorkflowPolicy(filePath = WORKFLOW_POLICY_PATH) {
  let policy;
  try { policy = JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { fail("WORKFLOW_POLICY_MISSING", "Automatic workflow reporting policy is not configured."); }
  return validateAutomaticWorkflowPolicy(policy, loadConfig());
}

/** The policy is bound to the configured agency sheet and internal report recipient. */
export function validateAutomaticWorkflowPolicy(policy, config) {
  if (policy?.schemaVersion !== 1 || policy.enabled !== true || !safeId(policy.policyId) ||
      typeof policy.configuredBy !== "string" || !policy.configuredBy.trim() ||
      policy.spreadsheetId !== config?.spreadsheetId || policy.sheetName !== config?.sheetName ||
      policy.confirmationTo !== config?.confirmationTo || policy.agencyOwnedAttested !== true ||
      JSON.stringify(policy.allowedActions) !== JSON.stringify(["publish-progress", "publish-report", "send-internal-report"]))
    fail("WORKFLOW_POLICY_INVALID", "Automatic workflow policy does not match the configured agency destinations.");
  return policy;
}

/** Create durable operator authorization once; never overwrite an existing policy. */
export function createAutomaticWorkflowPolicy({ by, confirmSpreadsheetId, confirmTo,
  attestAgencyOwned, filePath = WORKFLOW_POLICY_PATH } = {}) {
  const config = loadConfig();
  if (typeof by !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/.test(by.trim()) ||
      confirmSpreadsheetId !== config.spreadsheetId || confirmTo !== config.confirmationTo || attestAgencyOwned !== true)
    fail("WORKFLOW_POLICY_SETUP", "Setup must identify the operator, confirm the configured spreadsheet and internal recipient, and attest that both are agency-owned.");
  const policy = { schemaVersion: 1, enabled: true, policyId: crypto.randomUUID(),
    configuredBy: by.trim(), configuredAt: new Date().toISOString(), agencyOwnedAttested: true,
    spreadsheetId: config.spreadsheetId, sheetName: config.sheetName, confirmationTo: config.confirmationTo,
    allowedActions: ["publish-progress", "publish-report", "send-internal-report"] };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try { fs.writeFileSync(filePath, JSON.stringify(policy, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code === "EEXIST") fail("WORKFLOW_POLICY_EXISTS", "Automatic workflow policy already exists; refusing to replace it."); throw error; }
  appendDemoAudit({ event: "automatic_workflow_policy_created", policyId: policy.policyId,
    configuredBy: policy.configuredBy, spreadsheetId: "[configured agency dashboard]", confirmationTo: "[configured internal recipient]" });
  return policy;
}

/** One-time authorization for bounded, same-thread clarification questions only. */
export function createCustomerContactPolicy({ by, confirmFrom, attestCustomerClarifications, includeNotifications = false, sendingGrant = "customer-send",
  filePath = CUSTOMER_CONTACT_POLICY_PATH } = {}) {
  if (typeof by !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/.test(by.trim()) ||
      typeof confirmFrom !== "string" || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(confirmFrom) ||
      attestCustomerClarifications !== true || !["customer-send", "send"].includes(sendingGrant))
    fail("CUSTOMER_CONTACT_SETUP", "Setup must identify the operator, confirm the agency sender address, and attest to automated clarification-only replies.");
  const policy = { schemaVersion: 1, enabled: true, policyId: crypto.randomUUID(), configuredBy: by.trim(),
    configuredAt: new Date().toISOString(), senderAddress: confirmFrom.toLowerCase(),
    maxClarificationsPerProject: 2, allowedAction: "reply-with-intake-clarifications", sendingGrant,
    ...(includeNotifications ? { notificationActions: ["acknowledgment", "completion"] } : {}) };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try { fs.writeFileSync(filePath, JSON.stringify(policy, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code === "EEXIST") fail("CUSTOMER_CONTACT_EXISTS", "Customer contact policy already exists; refusing to replace it."); throw error; }
  appendDemoAudit({ event: "customer_contact_policy_created", policyId: policy.policyId,
    configuredBy: policy.configuredBy, senderAddress: "[configured agency sender]", allowedAction: policy.allowedAction });
  return policy;
}

function loadCustomerContactPolicy(filePath = CUSTOMER_CONTACT_POLICY_PATH) {
  let policy;
  try { policy = JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { fail("CUSTOMER_CONTACT_POLICY_MISSING", "Customer clarification policy is not configured."); }
  return validateCustomerContactPolicy(policy);
}

export function validateCustomerContactPolicy(policy) {
  if (policy?.schemaVersion !== 1 || policy.enabled !== true || !safeId(policy.policyId) ||
      typeof policy.configuredBy !== "string" || !policy.configuredBy.trim() ||
      !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(policy.senderAddress || "") ||
      policy.maxClarificationsPerProject !== 2 || policy.allowedAction !== "reply-with-intake-clarifications")
    fail("CUSTOMER_CONTACT_POLICY_INVALID", "Customer clarification policy is invalid.");
  if (policy.sendingGrant !== undefined && !["customer-send", "send"].includes(policy.sendingGrant))
    fail("CUSTOMER_CONTACT_POLICY_INVALID", "Unsupported customer sending grant.");
  if (policy.notificationActions !== undefined && JSON.stringify(policy.notificationActions) !== JSON.stringify(["acknowledgment", "completion"]))
    fail("CUSTOMER_CONTACT_POLICY_INVALID", "Customer notification actions are invalid.");
  return policy;
}

export function composeCustomerNotice({ projectId, kind }) {
  if (!safeId(projectId) || !["acknowledgment", "completion"].includes(kind))
    fail("CUSTOMER_NOTICE", "Invalid customer notice.");
  return { subject: kind === "acknowledgment" ? "Readiness request received" : "Readiness report prepared",
    body: kind === "acknowledgment"
      ? "Hello,\n\nThank you for getting in touch about ISO 27001 readiness. We have received your request and will review the information you shared. If we need anything else to get started, we will reply here with a few questions.\n\nKind regards,\nThe Readiness Team"
      : "Hello,\n\nYour readiness report is ready. It brings together the issues identified, recommended improvements and suggested next steps. Please reply here so we can arrange delivery and discuss any questions.\n\nThe report supports preparation for ISO 27001; it does not constitute a certification or audit opinion.\n\nKind regards,\nThe Readiness Team" };

}

/** Customer notices share the existing authenticated same-thread sender, but separate dedupe ledgers. */
export async function sendCustomerNotification({ projectId, kind, manifestPath }, api = null, options = {}) {
  if (!["acknowledgment", "completion"].includes(kind)) fail("CUSTOMER_NOTICE", "Invalid notice kind.");
  if (kind === "completion") {
    const loaded = loadManifest(manifestPath, loadConfig({ projectId }));
    if (loaded.manifest.projectId !== projectId || loaded.manifest.finalStatus !== "completed")
      fail("CUSTOMER_NOTICE_MANIFEST", "Completion notice requires a validated completed project manifest.");
  }
  return sendCustomerClarification({ projectId, notificationKind: kind, noticeAuthorization: CUSTOMER_NOTICE_CAPABILITY }, api, {
    ...options, statePath: options.statePath || path.resolve(AGENCY, "state", `customer-${kind}.json`),
  });
}

const CLARIFICATION_LABELS = new Set([
  "client objective", "proposed scope", "systems in scope", "operating locations",
  "source-backed client information", "validated client brief", "objective", "bounded scope",
  "systems", "locations",
]);

/** Compose a fixed, plain-text request from allowed intake gaps; never use model-written email copy. */
export function composeCustomerClarification({ projectId, subject, missingInformation }) {
  if (!safeId(projectId) || typeof subject !== "string" || /[\r\n]/.test(subject) ||
      !Array.isArray(missingInformation) || !missingInformation.length || missingInformation.length > 8 ||
      missingInformation.some((item) => typeof item !== "string" || !CLARIFICATION_LABELS.has(item)))
    fail("CUSTOMER_CLARIFICATION", "Clarification request contains invalid or unapproved fields.");
  const questionText = {
    "client objective": "What would you like the review to help you achieve, and do you have a target date?",
    "objective": "What would you like the review to help you achieve, and do you have a target date?",
    "proposed scope": "Which services, teams and business activities should the review cover?",
    "bounded scope": "Which services, teams and business activities should the review cover?",
    "systems in scope": "Which applications, IT services and devices should we include? A short list is enough to get started.",
    "systems": "Which applications, IT services and devices should we include? A short list is enough to get started.",
    "operating locations": "Where does your team work? Please include offices, remote working and cloud hosting locations where known.",
    "locations": "Where does your team work? Please include offices, remote working and cloud hosting locations where known.",
    "source-backed client information": "Please share a short overview of your organization and any relevant documents you can provide.",
    "validated client brief": "Could you share your organization overview, the areas you want reviewed and your target timeline?",
  };
  const questions = [...new Set(missingInformation.map(item => questionText[item]))].map(item => `- ${item}`).join("\n");
  return {
    subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
    body: `Hello,\n\nThank you for your request. We need a little more information before we can begin the review:\n\n${questions}\n\nYou can reply directly to this email. Please leave out passwords, access keys and sensitive personal information.\n\nKind regards,\nThe Readiness Team`,
  };
}

/** Send at most two fixed-form clarification replies in the original customer thread. */
export async function sendCustomerClarification({ projectId, missingInformation, notificationKind = null, noticeAuthorization = null }, api = null,
  { policyPath = CUSTOMER_CONTACT_POLICY_PATH, statePath = CUSTOMER_FOLLOWUP_STATE_PATH } = {}) {
  const policy = loadCustomerContactPolicy(policyPath);
  if (notificationKind !== null && noticeAuthorization !== CUSTOMER_NOTICE_CAPABILITY)
    fail("CUSTOMER_NOTICE", "Use the validated customer notification entry point.");
  if (notificationKind !== null && (!['acknowledgment', 'completion'].includes(notificationKind) ||
      !policy.notificationActions?.includes(notificationKind)))
    fail("CUSTOMER_NOTICE_POLICY", "Customer notification policy is not enabled.");
  const { projectRoot, marker } = validateAutomaticProject(projectId, { allowIncomplete: true });
  if (marker.projectType !== "intake-staging") fail("CUSTOMER_CLARIFICATION_SCOPE", "Clarification mail is limited to staged new-customer intake.");
  const sourcePath = path.join(projectRoot, "client-input", "gmail-intake.json");
  let source;
  try { source = JSON.parse(fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, "")); }
  catch { fail("CUSTOMER_CLARIFICATION_SOURCE", "Original customer message is unavailable."); }
  const sourceMessageId = source.source?.messageId || source.messageId;
  const threadId = source.source?.threadId || source.threadId;
  const recipient = String(source.senderEmail || "").toLowerCase();
  const rfcMessageId = source.rfcMessageId;
  if (sourceMessageId !== marker.messageId || !threadId || source.senderAuthenticationVerified !== true ||
      !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(recipient) ||
      !/^<[^<>\s\r\n]{1,250}>$/.test(rfcMessageId || ""))
    fail("CUSTOMER_CLARIFICATION_SOURCE", "Original sender and reply-thread provenance did not validate.");
  const email = notificationKind ? composeCustomerNotice({ projectId, kind: notificationKind })
    : composeCustomerClarification({ projectId, subject: source.subject, missingInformation });
  if (notificationKind) {
    if (typeof source.subject !== "string" || /[\r\n]/.test(source.subject)) fail("CUSTOMER_NOTICE", "Unsafe reply subject.");
    email.subject = /^re:/i.test(source.subject) ? source.subject : `Re: ${source.subject}`;
  }
  return withLock(async () => {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const state = (() => { try { return JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (error) { if (error.code === "ENOENT") return { schemaVersion: 1, projects: {} }; throw error; } })();
  if (state.schemaVersion !== 1 || !state.projects || typeof state.projects !== "object")
    fail("CUSTOMER_FOLLOWUP_STATE", "Customer follow-up state is malformed.");
  const prior = state.projects[projectId] || { projectId, sourceMessageId, threadId, recipient, sentCount: 0, responses: [] };
  if (prior.sourceMessageId !== sourceMessageId || prior.threadId !== threadId || prior.recipient !== recipient)
    fail("CUSTOMER_FOLLOWUP_STATE", "Existing clarification record does not match the source message.");
  if (prior.status === "attempting" || prior.status === "ambiguous")
    fail("CUSTOMER_SEND_AMBIGUOUS", "Previous customer email outcome is uncertain; automatic resend is disabled.");
  if (notificationKind && prior.sentCount >= 1) return { outcome: "already_sent", sentCount: prior.sentCount };
  if (prior.awaitingResponse) return { outcome: "awaiting_response", sentCount: prior.sentCount };
  if (prior.sentCount >= policy.maxClarificationsPerProject) return { outcome: "limit_reached", sentCount: prior.sentCount };
  const gmail = api || googleapis().gmail({ version: "v1", auth: authenticate(policy.sendingGrant || "customer-send") });
  const profile = await googleapis().gmail({ version: "v1", auth: readOnlyVerifierAuth() }).users.getProfile({ userId: "me" });
  if (String(profile?.data?.emailAddress || "").toLowerCase() !== policy.senderAddress)
    fail("CUSTOMER_SENDER_MISMATCH", "Configured customer sender does not match the existing Gmail intake mailbox.");
  const safeHeader = (value) => String(value || "").replace(/[\r\n]/g, " ");
  const rawMessage = `From: ${policy.senderAddress}\r\nTo: ${recipient}\r\nSubject: ${safeHeader(email.subject)}\r\nIn-Reply-To: ${rfcMessageId}\r\nReferences: ${rfcMessageId}\r\nAuto-Submitted: auto-generated\r\nContent-Type: text/plain; charset=UTF-8\r\nMIME-Version: 1.0\r\n\r\n${email.body}`;
  const raw = Buffer.from(rawMessage, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const next = { ...prior, status: "attempting", awaitingResponse: true,
    lastAttemptAt: new Date().toISOString(), policyId: policy.policyId, notificationKind };
  state.projects[projectId] = next;
  atomicJson(statePath, state);
  try {
    const response = await gmail.users.messages.send({ userId: "me",
      requestBody: { threadId, raw } });
    if (!response?.data?.id) fail("CUSTOMER_SEND_UNCONFIRMED", "Gmail returned no confirmation for the customer clarification.");
    next.status = "sent";
    next.sentCount += 1;
    next.gmailMessageId = response.data.id;
    next.sentAt = new Date().toISOString();
    atomicJson(statePath, state);
    appendDemoAudit({ event: notificationKind ? `customer_${notificationKind}_sent` : "customer_clarification_sent", policyId: policy.policyId,
      projectId, sourceMessageId, gmailMessageId: response.data.id, sentCount: next.sentCount });
    return { outcome: "sent", sentCount: next.sentCount };
  } catch (error) {
    next.status = "ambiguous";
    next.awaitingResponse = false;
    next.failureCode = /^[A-Z0-9_-]{1,48}$/i.test(String(error.code || "")) ? error.code : "CUSTOMER_SEND_AMBIGUOUS";
    atomicJson(statePath, state);
    if (error instanceof ReportingError) throw error;
    fail("CUSTOMER_SEND_AMBIGUOUS", "Customer email outcome is uncertain; automatic resend is disabled.");
  }
  });
}

function validateAutomaticProject(projectId, { allowIncomplete = false } = {}) {
  if (!safeId(projectId)) fail("WORKFLOW_PROJECT", "Project ID is invalid.");
  const projectsRoot = fs.realpathSync(path.resolve(AGENCY, "projects"));
  const projectRoot = path.resolve(projectsRoot, projectId);
  if (!inside(projectsRoot, projectRoot) || !fs.existsSync(projectRoot) || fs.lstatSync(projectRoot).isSymbolicLink())
    fail("WORKFLOW_PROJECT", "Project is missing or outside the agency project root.");
  const realRoot = fs.realpathSync(projectRoot);
  if (!inside(projectsRoot, realRoot)) fail("WORKFLOW_PROJECT", "Project resolves outside the agency project root.");
  let marker;
  try { marker = JSON.parse(fs.readFileSync(path.join(realRoot, "project.json"), "utf8")); }
  catch { fail("WORKFLOW_PROJECT", "Project provenance marker is unavailable."); }
  const sourceMessageId = marker.messageId || marker.sourceMessageId;
  if (marker.projectId !== projectId || !["intake-staging", "client"].includes(marker.projectType) ||
      typeof sourceMessageId !== "string" || !sourceMessageId)
    fail("WORKFLOW_PROJECT", "Project is not bound to a valid Gmail intake message.");
  if (marker.projectType === "intake-staging") {
    let brief;
    try { brief = JSON.parse(fs.readFileSync(path.join(realRoot, "working", "client-brief.json"), "utf8").replace(/^\uFEFF/, "")); }
    catch { fail("WORKFLOW_PROJECT", "Staged project has no validated intake brief."); }
    if (brief.project_id !== projectId || brief.intake_classification?.category !== "new_client_request")
      fail("WORKFLOW_PROJECT", "Only classified new-client intake can use automatic dashboard reporting.");
    let record;
    try { record = JSON.parse(fs.readFileSync(path.join(realRoot, "working", "public-intake-record.json"), "utf8").replace(/^\uFEFF/, "")); }
    catch { fail("WORKFLOW_PROJECT", "Staged project has no reconciled public-intake record."); }
    const allowedPreparation = allowIncomplete
      ? ["preliminary_preparation_ready_pending_identity_verification", "onboarding_incomplete"]
      : ["preliminary_preparation_ready_pending_identity_verification"];
    if (record.schemaVersion !== 1 || record.intakeLane !== "public-inquiry" ||
        !allowedPreparation.includes(record.preparationStatus))
      fail("WORKFLOW_PROJECT", "Public intake is not eligible for automatic reporting.");
    return { projectRoot: realRoot, marker, record };
  }
  return { projectRoot: realRoot, marker, record: null };
}

/** Build fixed, content-minimized rows for the eight known routines. */
export function buildWorkflowProgressRows({ projectId, runId, agentStatuses, timestamp = new Date().toISOString() }) {
  if (!safeId(projectId) || typeof runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(runId) ||
      !agentStatuses || typeof agentStatuses !== "object" || Array.isArray(agentStatuses))
    fail("WORKFLOW_PROGRESS", "Workflow progress identity is invalid.");
  const permitted = new Set(["not_started", "started", "completed", "reused-validated", "blocked", "failed", "not-run"]);
  return EXPECTED_EMPLOYEES.map((employeeId) => {
    const status = agentStatuses[employeeId] || "not_started";
    if (!permitted.has(status)) fail("WORKFLOW_PROGRESS", "Workflow agent status is invalid.");
    const [routine, artifact] = OWNED_OUTPUTS[employeeId];
    return Object.freeze({ run_id: runId, project_id: projectId, employee_id: employeeId,
      routine, execution_status: status === "started" ? "running" : status,
      artifact_basename: artifact,
      validation_status: ["completed", "reused-validated"].includes(status) ? "validated" :
        ["failed", "blocked"].includes(status) ? "failed" : "pending",
      timestamp });
  });
}

/** Upsert live project progress under the separately configured agency policy. */
export async function publishAutomaticWorkflowProgress({ projectId, runId, agentStatuses }, api = null) {
  const policy = loadAutomaticWorkflowPolicy();
  if (!policy.allowedActions.includes("publish-progress")) fail("WORKFLOW_POLICY_SCOPE", "Live dashboard updates are not authorized by policy.");
  validateAutomaticProject(projectId);
  const rows = buildWorkflowProgressRows({ projectId, runId, agentStatuses });
  const config = loadConfig({ projectId });
  return withLock(async () => {
    const sheets = api || googleapis().sheets({ version: "v4", auth: authenticate("sheets") });
    const range = `'${config.sheetName.replace(/'/g, "''")}'!A:H`;
    const existing = await sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range });
    const data = buildUpserts(existing.data.values || [], rows, config.sheetName);
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: config.spreadsheetId,
      requestBody: { valueInputOption: "RAW", data } });
    const check = await sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range });
    const found = new Map((check.data.values || []).slice(1).map((row) => [`${row[0]}\0${row[2]}`, row.slice(0, 8)]));
    for (const row of rows) {
      const key = `${row.run_id}\0${row.employee_id}`;
      if (JSON.stringify(found.get(key)) !== JSON.stringify(HEADERS.map((header) => row[header])))
        fail("SHEETS_UNCONFIRMED", "Dashboard API response did not confirm all eight progress rows.");
    }
    appendDemoAudit({ event: "automatic_workflow_progress_published", policyId: policy.policyId,
      projectId, runId, rowCount: rows.length });
    return { projectId, runId, dashboardStatus: "confirmed", updatedAt: new Date().toISOString() };
  });
}

// REPORT PREPARATION AND LOCAL STATE
// Validate local artifacts before constructing rows or an email draft.
function appendDemoAudit(record) {
  const file = path.join(HERE, "logs", "demo-reporting-audit.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n", { mode: 0o600 });
}

function projectDemoAuthorization(projectId, policy) {
  let registry;
  try { registry = JSON.parse(fs.readFileSync(DEMO_PROJECT_STATE, "utf8")); }
  catch { fail("DEMO_PROJECT_SCOPE", "Project has no verified synthetic demo authorization record."); }
  const entry = registry?.projects?.[projectId];
  if (!entry || entry.projectId !== projectId || entry.policyId !== policy.senderPolicyId ||
      !policy) fail("DEMO_PROJECT_SCOPE", "Project is outside the configured synthetic demo sender policy.");
  let senderPolicy;
  try { senderPolicy = JSON.parse(fs.readFileSync(path.resolve(AGENCY, "config", "demo-automation-policy.json"), "utf8")); }
  catch { fail("DEMO_PROJECT_SCOPE", "Synthetic sender authorization policy is unavailable."); }
  if (senderPolicy.policyId !== entry.policyId || senderPolicy.enabled !== true ||
      senderPolicy.addressOwnershipAttested !== true ||
      !senderPolicy.senders?.some((sender) => sender.address === entry.senderEmail))
    fail("DEMO_PROJECT_SCOPE", "Project sender is outside the configured and attested sender allowlist.");
  const projectRoot = path.resolve(AGENCY, "projects", projectId);
  let marker;
  try { marker = JSON.parse(fs.readFileSync(path.join(projectRoot, "project.json"), "utf8")); }
  catch { fail("DEMO_PROJECT_SCOPE", "Synthetic project provenance marker is missing."); }
  if (marker.projectId !== projectId || marker.projectType !== "client" ||
      marker.sourceMessageId !== entry.messageId || marker.demoPolicyId !== entry.policyId)
    fail("DEMO_PROJECT_SCOPE", "Project marker does not match its synthetic sender authorization record.");
  return entry;
}
function atomicJson(file, value) {
  // Write complete formatted JSON to a unique temporary file before replacing state.
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  fs.renameSync(tmp, file);
  if (process.platform !== "win32") fs.chmodSync(file, 0o600);
}
function createJsonExclusive(file, value) {
  // Create a new secret file only once; exclusive mode prevents accidental overwrite.
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let fd;
  try {
    fd = fs.openSync(file, "wx", 0o600);
  } catch {
    fail(
      "TOKEN_EXISTS",
      "OAuth token file already exists; it was not overwritten.",
    );
  }
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
/** Append a small local audit event after enforcing private-directory security. */
/** Append a minimized local audit event; no message body or OAuth token is recorded. */
function journal(event, data = {}, storage = {}) {
  // Write minimal audit fields after verifying protected storage and creating the log folder.
  const privateDir = storage.privateDir ?? PRIVATE;
  const journalFile = storage.journalFile ?? JOURNAL;
  verifyPrivateStorage(privateDir, storage);
  fs.mkdirSync(path.dirname(journalFile), { recursive: true });
  const allowed = { at: new Date().toISOString(), event, ...data };
  fs.appendFileSync(journalFile, JSON.stringify(allowed) + "\n", {
    mode: 0o600,
  });
}
function statePath(id, storage = {}) {
  if (!safeId(id)) fail("PLAN_ID", "Invalid plan ID.");
  return path.join(storage.stateDir ?? STATE, `${id}.json`);
}
function readState(id, storage = {}) {
  // Secure the state area, parse the selected plan, and check its embedded identifier.
  verifyPrivateStorage(storage.privateDir ?? PRIVATE, storage);
  try {
    const v = JSON.parse(fs.readFileSync(statePath(id, storage), "utf8"));
    if (v.schemaVersion !== 1 || v.planId !== id)
      fail("STATE", "Local plan state is invalid.");
    return v;
  } catch (e) {
    if (e instanceof ReportingError) throw e;
    fail("STATE_MISSING", "Plan state is unavailable.");
  }
}
function writeState(s, storage = {}) {
  // Secure private storage before saving the plan's latest state.
  verifyPrivateStorage(storage.privateDir ?? PRIVATE, storage);
  atomicJson(statePath(s.planId, storage), s);
}
function verifyPrivateStorage(dir, storage = {}) {
  // Tests may inject a verifier for disposable fixtures; production always verifies without changing ACLs.
  if (typeof storage.verifyPrivateStorage === "function") return storage.verifyPrivateStorage(dir);
  return securePrivateStorage(dir, { apply: false });
}
/** Serialize state-changing reporting operations to prevent local races. */
async function withLock(task) {
  // An exclusive file lock prevents concurrent state-changing publication operations.
  const lock = path.join(STATE, "publication.lock");
  fs.mkdirSync(STATE, { recursive: true });
  let fd;
  try {
    fd = fs.openSync(lock, "wx", 0o600);
  } catch {
    try {
      // Inspect an existing lock and check whether the process recorded in it is still alive.
      if (fs.lstatSync(lock).isSymbolicLink() || !fs.statSync(lock).isFile())
        fail(
          "LOCKED",
          "Reporting lock is unsafe; operator review is required.",
        );
      const held = JSON.parse(fs.readFileSync(lock, "utf8"));
      if (!Number.isInteger(held.pid) || held.pid < 1)
        fail(
          "LOCKED",
          "Reporting lock is unreadable; operator review is required.",
        );
      try {
        // Sending signal zero tests whether a process exists without terminating it.
        process.kill(held.pid, 0);
        fail("LOCKED", "Another reporting publication holds the local lock.");
      } catch (e) {
        if (e instanceof ReportingError) throw e;
        if (e.code !== "ESRCH")
          fail(
            "LOCKED",
            "Could not establish whether the reporting lock is stale.",
          );
      }
      fs.rmSync(lock);
      fd = fs.openSync(lock, "wx", 0o600);
    } catch (e) {
      if (e instanceof ReportingError) throw e;
      fail("LOCKED", "Could not safely recover the reporting lock.");
    }
  }
  fs.writeFileSync(
    fd,
    JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
  );
  try {
    // Await the caller's operation and remove the lock in finally, even after failure.
    return await task();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lock, { force: true });
  }
}
function loadManifest(manifestPath, config) {
  // Resolve the run manifest and confirm it is inside this project's demo-run folder.
  const p = path.resolve(manifestPath);
  const projectRoot = path.resolve(AGENCY, "projects", config.projectId);
  assertNoSymlinks(p);
  const realProjectRoot = fs.realpathSync(projectRoot);
  const realManifest = fs.realpathSync(p);
  if (!inside(realProjectRoot, realManifest))
    fail("MANIFEST_PATH", "Manifest must be inside the configured project.");
  const expectedRoot = path.join(projectRoot, "logs", "demo-runs");
  if (!inside(fs.realpathSync(expectedRoot), realManifest) || path.basename(p) !== "manifest.json")
    fail("MANIFEST_PATH", "Manifest must be inside a demo run directory.");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    fail("MANIFEST_JSON", "Manifest is unreadable or invalid JSON.");
  }
  const rows = validateManifest(manifest, p, config);
  return { manifest, manifestPath: p, rows };
}

/** Select a project only from the canonical agency project manifest layout. */
export function projectIdFromManifestPath(manifestPath) {
  if (typeof manifestPath !== "string" || !manifestPath.trim())
    fail("MANIFEST_PATH", "Manifest path is invalid.");
  const p = path.resolve(manifestPath);
  const projectsRoot = path.resolve(AGENCY, "projects");
  const relative = path.relative(projectsRoot, p);
  const parts = relative.split(path.sep);
  if (
    path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`) ||
    parts.length !== 5 || !safeId(parts[0]) || parts[1] !== "logs" ||
    parts[2] !== "demo-runs" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(parts[3]) || parts[4] !== "manifest.json"
  ) fail("MANIFEST_PATH", "Manifest must be inside an agency project demo run.");
  return parts[0];
}
function printRows(rows) {
  process.stdout.write(
    `${JSON.stringify([HEADERS, ...rows.map((r) => HEADERS.map((h) => r[h]))], null, 2)}\n`,
  );
}

/** Build and save a local publication plan from a validated execution manifest. */
export function prepare(manifestPath, config, { quiet = false } = {}) {
  // Validate local execution output and save a publication plan without contacting an API.
  if (!manifestPath) fail("CLI", "prepare requires a manifest path.");
  const selectedProjectId = projectIdFromManifestPath(manifestPath);
  config = config || loadConfig({ projectId: selectedProjectId });
  if (config.projectId !== selectedProjectId)
    fail("MANIFEST_PATH", "Manifest must be inside the configured project.");
  const { manifest, rows } = loadManifest(manifestPath, config);
  const planId = crypto.randomUUID();
  const state = {
    schemaVersion: 1,
    planId,
    runId: manifest.runId,
    projectId: config.projectId,
    manifestPath: path.resolve(manifestPath),
    rows,
    sheetState: "prepared",
    emailState: "not_prepared",
    createdAt: new Date().toISOString(),
  };
  writeState(state);
  journal("plan_prepared", { planId, runId: manifest.runId, rowCount: 8 });
  if (!quiet) {
    printRows(rows);
    process.stdout.write(`Plan ${planId} prepared. No external API was called.\n`);
  }
  return state;
}

function readDemoState() {
  if (!fs.existsSync(DEMO_AUTH_STATE)) return { schemaVersion: 1, runs: {} };
  try {
    const state = JSON.parse(fs.readFileSync(DEMO_AUTH_STATE, "utf8"));
    if (state.schemaVersion !== 1 || !state.runs || typeof state.runs !== "object") throw new Error();
    return state;
  } catch { fail("DEMO_STATE", "Demo reporting state is unreadable; preserve it for review."); }
}
function writeDemoState(state) { atomicJson(DEMO_AUTH_STATE, state); }

/** Prepare one idempotent plan only for a project attested by the synthetic sender policy. */
export function prepareDemo(manifestPath) {
  const policy = loadDemoReportingPolicy();
  const resolved = path.resolve(manifestPath);
  assertNoSymlinks(resolved);
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(resolved, "utf8")); }
  catch { fail("MANIFEST_JSON", "Demo manifest is unreadable or invalid JSON."); }
  projectDemoAuthorization(manifest.projectId, policy);
  const config = loadConfig({ projectId: manifest.projectId });
  const { rows } = loadManifest(resolved, config);
  const demoState = readDemoState();
  const prior = existingDemoRunBinding(demoState, manifest);
  if (prior) {
    const plan = readState(prior.planId);
    if (plan.manifestPath !== resolved || plan.demoPolicyId !== policy.policyId)
      fail("DEMO_RUN_COLLISION", "Run ID is already bound to a different manifest or policy.");
    return plan;
  }
  const planId = crypto.randomUUID();
  const state = { schemaVersion: 1, planId, runId: manifest.runId, projectId: manifest.projectId,
    manifestPath: resolved, demoPolicyId: policy.policyId, rows,
    sheetState: "prepared", emailState: "not_prepared", createdAt: new Date().toISOString() };
  writeState(state);
  demoState.runs[manifest.runId] = { projectId: manifest.projectId, planId, manifestPath: resolved,
    policyId: policy.policyId, sheetState: "prepared", emailState: "not_prepared" };
  writeDemoState(demoState);
  appendDemoAudit({ event: "demo_reporting_plan_prepared", policyId: policy.policyId,
    projectId: manifest.projectId, runId: manifest.runId, planId });
  return state;
}

/** Return the durable prior run binding, rejecting a reused run ID across projects. */
export function existingDemoRunBinding(demoState, manifest) {
  const prior = demoState?.runs?.[manifest?.runId];
  if (prior && prior.projectId !== manifest.projectId)
    fail("DEMO_RUN_COLLISION", "Run ID is already bound to a different project.");
  return prior || null;
}

function appendQuery(spreadsheetId, range) {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit#gid=0`;
}
/** Create an OAuth client for one explicit grant using its own credential/token pair. */
// GOOGLE CONNECTIONS
// Keep Sheets, internal email, and customer replies on separate OAuth grants.
function makeGoogleClient(scopes, credentialFile, tokenFile) {
  // Build an OAuth client using the credential pair dedicated to this one permission.
  securePrivateStorage(PRIVATE, { apply: false });
  const credential = JSON.parse(fs.readFileSync(credentialFile, "utf8"));
  const installed = credential.installed;
  if (
    !installed?.client_id ||
    !installed?.client_secret ||
    !Array.isArray(installed.redirect_uris) ||
    !installed.redirect_uris.length
  )
    fail("CREDENTIALS", "OAuth client credentials are missing or invalid.");
  const tokens = JSON.parse(fs.readFileSync(tokenFile, "utf8"));
  if (
    !tokens.refresh_token ||
    typeof tokens.scope !== "string" ||
    !scopes.every((s) => tokens.scope.split(/\s+/).includes(s))
  )
    fail(
      "TOKEN_SCOPE",
      "OAuth token is missing a required scope. Reauthorize the dedicated reporting client.",
    );
  const { OAuth2 } = googleapis().auth;
  const client = new OAuth2(
    installed.client_id,
    installed.client_secret,
    installed.redirect_uris[0],
  );
  client.setCredentials(tokens);
  // Do not persist refreshed token values implicitly. Operator must explicitly reauthorize if refresh fails.
  client.on("tokens", () => {});
  return client;
}
function authPaths(kind) {
  // Map each operation to its own credential file, token file, and minimum required scope.
  if (kind === "sheets")
    return [
      path.join(PRIVATE, "sheets-credentials.json"),
      path.join(PRIVATE, "sheets-tokens.json"),
      [SHEETS_SCOPE],
    ];
  if (kind === "send")
    return [
      path.join(PRIVATE, "gmail-send-credentials.json"),
      path.join(PRIVATE, "gmail-send-tokens.json"),
      [SEND_SCOPE],
    ];
  if (kind === "customer-send")
    return [
      path.join(PRIVATE, "customer-send-credentials.json"),
      path.join(PRIVATE, "customer-send-tokens.json"),
      [SEND_SCOPE],
    ];
  fail("AUTH_KIND", "Unsupported authorization purpose.");
}
/** Select the least-privilege configured OAuth grant for the requested operation. */
export function authenticate(kind) {
  // Create the Google client for the selected OAuth grant.
  const [c, t, s] = authPaths(kind);
  return makeGoogleClient(s, c, t);
}

/** Run the local OAuth authorization flow for one reporting integration grant. */
export async function authorize(kind) {
  // Run local browser consent for one specific reporting permission set.
  const [credentialsPath, tokensPath, scopes] = authPaths(kind);
  securePrivateStorage(PRIVATE);
  if (fs.existsSync(tokensPath))
    fail(
      "TOKEN_EXISTS",
      `An existing ${kind} token file is present. Reconcile and explicitly remove or archive it before reauthorization; it was not overwritten.`,
    );
  let document;
  try {
    document = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  } catch {
    fail(
      "CREDENTIALS",
      `Place dedicated OAuth Desktop credentials at ${path.basename(credentialsPath)} first.`,
    );
  }
  const installed = document.installed;
  if (!installed?.client_id || !installed?.client_secret)
    fail("CREDENTIALS", "Dedicated OAuth Desktop credentials are invalid.");
  const { OAuth2 } = googleapis().auth;
  const server = http.createServer();
  let timer;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const redirectUri = `http://localhost:${address.port}`;
    const oauth = new OAuth2(
      installed.client_id,
      installed.client_secret,
      redirectUri,
    );
    const state = crypto.randomBytes(24).toString("hex");
    // OAuth state ties the callback to this request and helps prevent forged redirects.
    const url = oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: false,
      scope: scopes,
      state,
    });
    process.stdout.write(
      `Open this operator authorization URL for the ${kind} account and approve only the displayed scope:\n${url}\n`,
    );
    // Wait for a matching local callback, then validate scope before saving the new token.
    const code = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), 5 * 60 * 1000);
      server.on("request", (req, res) => {
        const callback = new URL(req.url, redirectUri);
        if (
          callback.pathname !== "/" ||
          callback.searchParams.get("state") !== state
        ) {
          res.writeHead(400).end("Invalid OAuth callback.");
          reject(new Error("state"));
          return;
        }
        if (callback.searchParams.has("error")) {
          res.writeHead(400).end("Authorization was denied.");
          reject(new Error("denied"));
          return;
        }
        const value = callback.searchParams.get("code");
        if (!value) {
          res.writeHead(400).end("Authorization code is missing.");
          reject(new Error("code"));
          return;
        }
        res
          .writeHead(200, { "content-type": "text/plain; charset=utf-8" })
          .end("Authorization received. Return to the terminal.");
        resolve(value);
      });
    });
    const result = await oauth.getToken(code);
    if (
      !result.tokens.refresh_token ||
      !scopes.every((scope) =>
        String(result.tokens.scope || "")
          .split(/\s+/)
          .includes(scope),
      )
    )
      fail(
        "TOKEN_SCOPE",
        "Google did not grant the exact required scope and reusable refresh token.",
      );
    createJsonExclusive(tokensPath, result.tokens);
    securePrivateStorage(PRIVATE);
    process.stdout.write(
      `Dedicated ${kind} authorization saved in the protected reporting directory.\n`,
    );
  } catch (e) {
    if (e instanceof ReportingError) throw e;
    fail(
      "OAUTH_FAILED",
      `Dedicated ${kind} OAuth authorization failed or timed out; token values were not displayed.`,
    );
  } finally {
    clearTimeout(timer);
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
}

/** Persist the operator and exact target confirmation required for an external action. */
function approve(state, kind, by, confirmation, storage = {}) {
  if (
    typeof by !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/.test(by.trim())
  )
    fail("APPROVAL", "A valid local operator name is required.");
  if (kind === "sheets" && confirmation !== loadConfig().spreadsheetId)
    fail(
      "APPROVAL_TARGET",
      "Approval must explicitly confirm the configured spreadsheet ID.",
    );
  if (kind === "email" && confirmation !== loadConfig().confirmationTo)
    fail(
      "APPROVAL_TARGET",
      "Approval must explicitly confirm the configured recipient.",
    );
  // Persist who approved the operation and the exact destination they confirmed.
  state.approvals ||= {};
  state.approvals[kind] = {
    by: by.trim(),
    at: new Date().toISOString(),
    targetConfirmed: confirmation,
  };
  journal(
    `${kind}_approved`,
    {
      planId: state.planId,
      runId: state.runId,
      by: by.trim(),
      target: kind === "sheets" ? "[configured spreadsheet]" : confirmation,
    },
    storage,
  );
}
function valuesFor(rows) {
  return [HEADERS, ...rows.map((r) => HEADERS.map((h) => r[h]))];
}
/**
 * Build one write per (run_id, employee_id), updating existing matches and
 * appending missing rows. Duplicate keys fail closed to preserve idempotency.
 */
/**
 * Produce deterministic insert/update operations keyed by run and employee.
 * The stable key makes a repeated publication update the same rows rather than
 * append duplicates; the caller still verifies the API response before success.
 */
export function buildUpserts(existing, rows, sheetName) {
  // Treat a missing sheet response as an empty table, then confirm any existing header.
  const matrix = existing || [];
  if (
    matrix.length &&
    JSON.stringify((matrix[0] || []).slice(0, 8)) !== JSON.stringify(HEADERS)
  )
    fail("SHEET_SCHEMA", "Configured sheet has an unexpected header row.");
  const index = new Map();
  // Index existing rows by run and employee so repeated publication updates instead of duplicates.
  for (let i = 1; i < matrix.length; i++)
    if (matrix[i][0] && matrix[i][2]) {
      const key = `${matrix[i][0]}\0${matrix[i][2]}`;
      if (index.has(key))
        fail(
          "SHEET_DUPLICATE",
          "Sheet contains duplicate idempotency keys; reconcile it before publication.",
        );
      index.set(key, i + 1);
    }
  let appendAt = Math.max(matrix.length + 1, 2);
  const data = [];
  // Add a header row only when this is an empty sheet.
  if (!matrix.length)
    data.push({
      range: `'${sheetName.replace(/'/g, "''")}'!A1:H1`,
      values: [HEADERS],
    });
  // Create one range update per expected employee, reusing a matching row when present.
  for (const row of rows) {
    const values = HEADERS.map((h) => row[h]);
    const key = `${row.run_id}\0${row.employee_id}`;
    const rowNumber = index.get(key) || appendAt++;
    data.push({
      range: `'${sheetName.replace(/'/g, "''")}'!A${rowNumber}:H${rowNumber}`,
      values: [values],
    });
  }
  return data;
}

/**
 * Publish the eight validated rows to Google Sheets after explicit approval.
 * @param {string} planId Previously prepared local publication plan.
 * @param {object} approval Operator approval metadata.
 * @param {string} confirmSpreadsheetId Exact configured spreadsheet confirmation.
 * @returns {Promise<object>} Persisted state after API confirmation.
 * @throws {ReportingError} For missing approval, invalid plan, OAuth/API failure, or unconfirmed rows.
 * @description The Sheets API is the external write. The bridge requires human
 * authorization, performs idempotent upserts, then reads rows back and confirms
 * each expected value before marking the publication confirmed.
 */
// SHEETS PUBLICATION
// Read existing rows, upsert by stable keys, then read back to confirm the write.
export async function publish(
  planId,
  approval,
  confirmSpreadsheetId,
  api = null,
) {
  // Load the saved plan and configuration, then require a separate approval for Sheets writes.
  const state = readState(planId);
  const policyAuthorization = approval?.[DEMO_POLICY_CAPABILITY] || null;
  const workflowAuthorization = approval?.[WORKFLOW_POLICY_CAPABILITY] || null;
  const automatic = Boolean(policyAuthorization || workflowAuthorization);
  const config = loadConfig(automatic ? { projectId: state.projectId } : undefined);
  if (policyAuthorization) validateDemoPlan(state, policyAuthorization, "publish-sheets");
  if (workflowAuthorization) validateAutomaticPlan(state, workflowAuthorization, "publish-report");
  if (state.sheetState === "confirmed") {
    process.stdout.write(policyAuthorization ? "Demo ledger already confirmed for this run.\n" : `${state.sheetUrl}\nSheets already confirmed for this plan.\n`);
    return state;
  }
  if (approval?.approved !== true && !automatic)
    fail("APPROVAL", "Explicit operator approval is required to publish.");
  if (!confirmSpreadsheetId || confirmSpreadsheetId !== config.spreadsheetId)
    fail(
      "APPROVAL_TARGET",
      "Explicit confirmation of the configured spreadsheet ID is required.",
    );
  if (policyAuthorization || workflowAuthorization) {
    const policy = policyAuthorization || workflowAuthorization;
    state.approvals ||= {};
    state.approvals.sheets = { authorizationType: workflowAuthorization ? "automatic-workflow-policy" : "demo-policy", policyId: policy.policyId,
      by: policy.configuredBy, at: new Date().toISOString(), targetConfirmed: "[configured agency ledger]" };
    appendDemoAudit({ event: workflowAuthorization ? "automatic_workflow_sheets_authorized" : "sheets_policy_authorized", policyId: policy.policyId,
      projectId: state.projectId, runId: state.runId, planId });
  } else if (!state.approvals?.sheets)
    approve(state, "sheets", approval.by, confirmSpreadsheetId);
  if (
    state.rows.length !== 8 ||
    new Set(state.rows.map((r) => `${r.run_id}\0${r.employee_id}`)).size !== 8
  )
    fail("ROWS", "Publication requires eight unique run and employee rows.");
  if (!config.spreadsheetId)
    fail(
      "CONFIG",
      "Set the operator-created spreadsheet ID in reporting-config.json.",
    );
  return withLock(async () => {
    // Persist the attempting state before the external request so interruptions are visible.
    state.sheetState = "attempting";
    state.sheetAttemptAt = new Date().toISOString();
    writeState(state);
    syncDemoRunState(state);
    journal("sheets_attempt", { planId, runId: state.runId, rowCount: 8 });
    try {
      const sheets =
        api ||
        googleapis().sheets({ version: "v4", auth: authenticate("sheets") });
      const range = `'${config.sheetName.replace(/'/g, "''")}'!A:H`;
      // Read existing rows to build idempotent inserts or updates.
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range,
      });
      const data = buildUpserts(
        existing.data.values || [],
        state.rows,
        config.sheetName,
      );
      // Google API client options (such as timeout/retry settings) belong in the
      // second argument to batchUpdate, not inside its API parameter object.
      // Keep spreadsheetId and requestBody here as the endpoint parameters only.
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        requestBody: { valueInputOption: "RAW", data },
      });
      // Read the sheet back and compare all expected cells before calling publication confirmed.
      const confirm = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range,
      });
      const rows = confirm.data.values || [];
      // Build a lookup from the returned rows and compare each unique run/employee key.
      const expected = new Map(
        state.rows.map((r) => [
          `${r.run_id}\0${r.employee_id}`,
          HEADERS.map((h) => r[h]),
        ]),
      );
      const found = new Map(
        rows.slice(1).map((r) => [`${r[0]}\0${r[2]}`, r.slice(0, 8)]),
      );
      for (const [key, value] of expected)
        if (JSON.stringify(found.get(key)) !== JSON.stringify(value))
          fail(
            "SHEETS_UNCONFIRMED",
            "Sheets API response did not confirm all eight rows.",
          );
      state.sheetState = "confirmed";
      state.sheetUrl = appendQuery(config.spreadsheetId);
      state.sheetConfirmedAt = new Date().toISOString();
      state.sheetRowCount = 8;
      writeState(state);
      syncDemoRunState(state);
      journal("sheets_confirmed", {
        planId,
        runId: state.runId,
        rowCount: 8,
        spreadsheetId: config.spreadsheetId,
        spreadsheetUrl: state.sheetUrl,
      });
      process.stdout.write(policyAuthorization ? "Demo ledger publication confirmed.\n" : `Sheets confirmed: ${state.sheetUrl}\n`);
      return state;
    } catch (e) {
      // Persist failure state; non-reporting API errors become a safe generic error.
      state.sheetState = "failed";
      state.sheetFailureCode = e.code || "SHEETS_API";
      writeState(state);
      syncDemoRunState(state);
      journal("sheets_failed", {
        planId,
        runId: state.runId,
        code: state.sheetFailureCode,
      });
      if (e instanceof ReportingError) throw e;
      fail(
        "SHEETS_API",
        "Sheets publication failed; inspect local status before retrying.",
      );
    }
  });
}

function validateDemoPlan(state, policy, action) {
  const configured = loadDemoReportingPolicy();
  const projectAuthorization = projectDemoAuthorization(state.projectId, configured);
  evaluateDemoReportingScope(policy, state, action, { configured, projectAuthorization });
  const config = loadConfig({ projectId: state.projectId });
  const loaded = loadManifest(state.manifestPath, config);
  if (loaded.manifest.runId !== state.runId || loaded.manifest.projectId !== state.projectId ||
      JSON.stringify(loaded.rows) !== JSON.stringify(state.rows))
    fail("DEMO_MANIFEST_BINDING", "Manifest identity or validated rows no longer match this plan.");
  return configured;
}

function validateAutomaticPlan(state, policy, action) {
  const configured = loadAutomaticWorkflowPolicy();
  if (!policy || policy.policyId !== configured.policyId || state.automaticPolicyId && state.automaticPolicyId !== configured.policyId ||
      state.demoPolicyId || !configured.allowedActions.includes(action))
    fail("WORKFLOW_POLICY_SCOPE", "Plan is outside the configured automatic workflow authorization.");
  validateAutomaticProject(state.projectId);
  const config = loadConfig({ projectId: state.projectId });
  const loaded = loadManifest(state.manifestPath, config);
  if (loaded.manifest.runId !== state.runId || loaded.manifest.projectId !== state.projectId ||
      JSON.stringify(loaded.rows) !== JSON.stringify(state.rows))
    fail("WORKFLOW_MANIFEST_BINDING", "Manifest identity or validated rows no longer match this plan.");
  return configured;
}

/** Pure scope check, exported so synthetic tests can exercise policy boundaries. */
export function evaluateDemoReportingScope(policy, state, action, { configured, projectAuthorization } = {}) {
  if (!policy || !configured || policy.policyId !== configured.policyId ||
      state.demoPolicyId !== configured.policyId || !configured.allowedActions.includes(action))
    fail("DEMO_POLICY_SCOPE", "Plan is outside the explicit demo reporting authorization.");
  if (!projectAuthorization || projectAuthorization.projectId !== state.projectId ||
      projectAuthorization.policyId !== configured.senderPolicyId ||
      !projectAuthorization.messageId || !projectAuthorization.senderEmail)
    fail("DEMO_PROJECT_SCOPE", "Project does not have a complete synthetic sender attestation.");
  if (projectAuthorization.runId && projectAuthorization.runId !== state.runId)
    fail("DEMO_RUN_BINDING", "Project authorization is bound to a different run.");
  return true;
}

function syncDemoRunState(state) {
  if (!state.demoPolicyId) return;
  const demoState = readDemoState();
  const entry = demoState.runs[state.runId];
  if (!entry || entry.projectId !== state.projectId || entry.planId !== state.planId)
    fail("DEMO_RUN_BINDING", "Persistent demo run binding is missing or inconsistent.");
  entry.sheetState = state.sheetState;
  entry.emailState = state.emailState;
  entry.updatedAt = new Date().toISOString();
  writeDemoState(demoState);
}

/** Publish with the explicit demo policy capability, never a fabricated operator approval. */
export async function publishDemoAuthorized(planId, api = null) {
  const policy = loadDemoReportingPolicy();
  const state = readState(planId);
  validateDemoPlan(state, policy, "publish-sheets");
  return publish(planId, { [DEMO_POLICY_CAPABILITY]: policy }, policy.spreadsheetId, api);
}

/** Publish a validated public or established client report under the standing workflow policy. */
export async function publishAutomaticWorkflowReport(planId, api = null) {
  const policy = loadAutomaticWorkflowPolicy();
  const state = readState(planId);
  validateAutomaticPlan(state, policy, "publish-report");
  return publish(planId, { [WORKFLOW_POLICY_CAPABILITY]: policy }, policy.spreadsheetId, api);
}

/** Build a plain-text status email only after the Sheets rows are confirmed. */
// EMAIL DELIVERY
// Build only the approved fixed-recipient message from a validated report.
export function composeEmail(state) {
  // Prepare a compact status email only after all eight spreadsheet rows are confirmed.
  if (
    state.sheetState !== "confirmed" ||
    !state.sheetUrl ||
    state.rows?.length !== 8
  )
    fail(
      "SHEETS_REQUIRED",
      "Email preparation requires eight API-confirmed Sheets rows.",
    );
  const statuses = state.rows
    .map(
      (r) => `${r.employee_id}: ${r.execution_status} (${r.validation_status})`,
    )
    .join("\n");
  return {
    to: "csagencyai@gmail.com",
    subject: `Project ${state.projectId} run confirmation ${state.runId}`,
    body: `FICTIONAL TEST ? readiness workflow completion.\nProject ${state.projectId}; run ${state.runId} is recorded.\n\nEmployee statuses:\n${statuses}\n\nTest results only. This is not an assessment, audit, certification, or compliance claim.`, 
  };
}
/** Save and display the proposed email without sending it. */
export function prepareEmail(planId, { quiet = false } = {}) {
  // Save and display a proposed message; this function does not send it.
  const state = readState(planId);
  if (state.emailState && state.emailState !== "not_prepared") {
    if (!state.email || state.email.to !== "csagencyai@gmail.com" ||
        !state.email.subject?.includes(state.runId) || !state.email.subject?.includes(state.projectId))
      fail("EMAIL_STATE", "Existing confirmation state is inconsistent; refusing to replace it.");
    if (!quiet) process.stdout.write(JSON.stringify(state.email, null, 2) + "\n");
    return state.email;
  }
  state.email = composeEmail(state);
  state.emailState = "prepared";
  state.emailPreparedAt = new Date().toISOString();
  writeState(state);
  syncDemoRunState(state);
  journal("email_prepared", { planId, runId: state.runId });
  if (!quiet) process.stdout.write(JSON.stringify(state.email, null, 2) + "\n");
  return state.email;
}

function mimeMessage(email) {
  // Build plain-text MIME headers and encode the message in Gmail's base64url format.
  const clean = (s) => String(s).replace(/[\r\n]/g, " ");
  const raw = `To: ${clean(email.to)}\r\nSubject: ${clean(email.subject)}\r\nX-Agency-Internal-Report: ISO27001-REPORTING-V1\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${email.body}`;
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
/**
 * Send the prepared message only after separate operator and recipient approval.
 * @param {string} planId Prepared reporting plan.
 * @param {object} approval Must identify an approving operator.
 * @param {string} confirmTo Exact configured recipient confirmed by the operator.
 * @returns {Promise<object>} Updated plan after Gmail confirms a message ID.
 * @throws {ReportingError} For missing approval or a failed/uncertain API outcome.
 * @description If the process stops while sending, delivery may already have
 * happened. That ambiguous state is never blindly retried because a duplicate
 * email could be sent; an operator must reconcile the inbox receipt first.
 */
async function approveSendUnsafe(
  planId,
  approval,
  confirmTo,
  api = null,
  storage = {},
) {
  // Require a prepared message, explicit operator approval, and the exact configured recipient.
  const state = readState(planId, storage);
  const policyAuthorization = approval?.[DEMO_POLICY_CAPABILITY] || null;
  const workflowAuthorization = approval?.[WORKFLOW_POLICY_CAPABILITY] || null;
  const automatic = Boolean(policyAuthorization || workflowAuthorization);
  const config = loadConfig(automatic ? { projectId: state.projectId } : undefined);
  if (policyAuthorization) validateDemoPlan(state, policyAuthorization, "send-confirmation");
  if (workflowAuthorization) validateAutomaticPlan(state, workflowAuthorization, "send-internal-report");
  if (state.emailState === "sent") {
    process.stdout.write(automatic ? "Agency confirmation already sent.\n" : "Email already confirmed as sent.\n");
    return state;
  }
  // A process interruption during a send leaves delivery unknown. Never retry
  // automatically, since the first request may already have delivered the mail.
  if (state.emailState === "attempting") {
    // The previous process may have sent the message before it stopped; never retry blindly.
    state.emailState = "ambiguous";
    state.emailFailureCode = "CRASH_DURING_SEND";
    writeState(state, storage);
    syncDemoRunState(state);
    journal(
      "gmail_send_ambiguous",
      { planId, runId: state.runId, code: state.emailFailureCode },
      storage,
    );
    fail(
      "SEND_AMBIGUOUS",
      "A previous process stopped during send. Reconcile inbox receipt before any resend.",
    );
  }
  if (state.emailState === "ambiguous")
    fail(
      "SEND_AMBIGUOUS",
      "A previous send outcome is ambiguous. Reconcile inbox receipt before any resend.",
    );
  if (state.sheetState !== "confirmed" || state.emailState !== "prepared")
    fail(
      "EMAIL_NOT_PREPARED",
      "Prepare the email after confirmed Sheets publication first.",
    );
  if (approval?.approved !== true && !automatic)
    fail("APPROVAL", "Explicit operator approval is required to send email.");
  if (confirmTo !== config.confirmationTo)
    fail(
      "APPROVAL_TARGET",
      "Explicit confirmation of the configured recipient is required.",
    );
  if (policyAuthorization || workflowAuthorization) {
    const policy = policyAuthorization || workflowAuthorization;
    state.approvals ||= {};
    state.approvals.email = { authorizationType: workflowAuthorization ? "automatic-workflow-policy" : "demo-policy", policyId: policy.policyId,
      by: policy.configuredBy, at: new Date().toISOString(), targetConfirmed: config.confirmationTo };
    appendDemoAudit({ event: workflowAuthorization ? "automatic_workflow_internal_email_authorized" : "gmail_send_policy_authorized", policyId: policy.policyId,
      projectId: state.projectId, runId: state.runId, planId, confirmationTo: config.confirmationTo });
  } else if (!state.approvals?.email)
    approve(state, "email", approval.by, confirmTo, storage);
  state.emailState = "attempting";
  state.emailAttemptAt = new Date().toISOString();
  writeState(state, storage);
  syncDemoRunState(state);
  journal(
    "gmail_send_attempt",
    { planId, runId: state.runId, to: confirmTo },
    storage,
  );
  try {
    // This API call sends the approved message; its returned ID is the provider's confirmation.
    const gmail =
      api || googleapis().gmail({ version: "v1", auth: authenticate("send") });
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: mimeMessage(state.email) },
    });
    if (!response?.data?.id)
      fail(
        "SEND_UNCONFIRMED",
        "Gmail returned no message ID; reconcile before resending.",
      );
    state.emailState = "sent";
    state.gmailMessageId = response.data.id;
    state.emailSentAt = new Date().toISOString();
    writeState(state, storage);
    syncDemoRunState(state);
    journal(
      "gmail_send_confirmed",
      { planId, runId: state.runId, gmailMessageId: state.gmailMessageId },
      storage,
    );
    process.stdout.write(automatic ? "Agency Gmail confirmation sent.\n" : `Gmail API confirmed message ID ${state.gmailMessageId}. Inbox receipt remains unverified.\n`);
    return state;
  } catch (e) {
    // Treat errors as ambiguous because the provider may have accepted the message already.
    state.emailState = "ambiguous";
    state.emailFailureCode = e.code || "SEND_OUTCOME_UNKNOWN";
    writeState(state, storage);
    syncDemoRunState(state);
    journal(
      "gmail_send_ambiguous",
      { planId, runId: state.runId, code: state.emailFailureCode },
      storage,
    );
    if (e instanceof ReportingError) throw e;
    fail(
      "SEND_AMBIGUOUS",
      "Gmail send outcome is uncertain. Do not retry; reconcile inbox receipt first.",
    );
  }
}

/** Manual operator path retains its distinct explicit approval requirements. */
export function approveSend(planId, approval, confirmTo, api = null, storage = {}) {
  return withLock(() => approveSendUnsafe(planId, approval, confirmTo, api, storage));
}

/** Send only under the configured synthetic demo policy and agency confirmation address. */
export function sendDemoConfirmationAuthorized(planId, api = null) {
  const policy = loadDemoReportingPolicy();
  const state = readState(planId);
  validateDemoPlan(state, policy, "send-confirmation");
  return withLock(() => approveSendUnsafe(planId,
    { [DEMO_POLICY_CAPABILITY]: policy }, policy.confirmationTo, api));
}

/** Send the final report notice only to the configured internal recipient. */
export function sendAutomaticWorkflowReport(planId, api = null) {
  const policy = loadAutomaticWorkflowPolicy();
  const state = readState(planId);
  validateAutomaticPlan(state, policy, "send-internal-report");
  prepareEmail(planId, { quiet: true });
  return withLock(() => approveSendUnsafe(planId,
    { [WORKFLOW_POLICY_CAPABILITY]: policy }, policy.confirmationTo, api));
}

/**
 * Reconcile a sent or ambiguous send using a separate read-only Gmail grant.
 * @returns {Promise<boolean>} True when a matching inbox receipt is found.
 * @throws {ReportingError} If the plan state or read-only authorization is invalid.
 */
// VERIFICATION AND COMMAND LINE
// Confirm recorded actions and expose explicit operator commands.
export async function verify(planId, verifier, api = null) {
  // Search the mailbox using the separate read-only grant to reconcile send outcomes.
  const state = readState(planId);
  if (!["sent", "ambiguous"].includes(state.emailState))
    fail("VERIFY_STATE", "Only sent or ambiguous messages can be reconciled.");
  const gmail =
    api || googleapis().gmail({ version: "v1", auth: readOnlyVerifierAuth() });
  const q = `in:inbox to:csagencyai@gmail.com subject:"${state.runId}"`;
  const listed = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: 20,
  });
  const ids = (listed.data.messages || []).map((x) => x.id).filter(Boolean);
  let found = null;
  // Fetch metadata for candidate messages and match both recipient and run-specific subject.
  for (const id of ids) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["To", "Subject"],
    });
    const h = msg.data.payload?.headers || [];
    const get = (n) =>
      h.find((x) => String(x.name).toLowerCase() === n.toLowerCase())?.value ||
      "";
    if (
      get("To").toLowerCase().includes("csagencyai@gmail.com") &&
      get("Subject").includes(state.runId)
    ) {
      found = id;
      break;
    }
  }
  if (!found) {
    journal("gmail_receipt_not_found", {
      planId,
      runId: state.runId,
      by: safeCell(verifier),
    });
    process.stdout.write("No matching inbox receipt found. State unchanged.\n");
    return false;
  }
  state.emailState = "sent";
  state.gmailMessageId = state.gmailMessageId || found;
  state.receiptVerifiedAt = new Date().toISOString();
  state.receiptVerifiedBy = String(verifier || "").slice(0, 80);
  writeState(state);
  journal("gmail_receipt_verified", {
    planId,
    runId: state.runId,
    gmailMessageId: found,
    by: state.receiptVerifiedBy,
  });
  process.stdout.write(`Inbox receipt verified for message ID ${found}.\n`);
  return true;
}
/** Load the preexisting read-only Gmail token without persisting refresh writes. */
function readOnlyVerifierAuth() {
  // Verify through the preexisting read-only integration, without persisting refreshed token writes.
  securePrivateStorage(GMAIL_PRIVATE, { apply: false });
  const cfile = path.join(GMAIL_PRIVATE, "credentials.json"),
    tfile = path.join(GMAIL_PRIVATE, "tokens.json");
  const c = JSON.parse(fs.readFileSync(cfile, "utf8")).installed;
  const t = JSON.parse(fs.readFileSync(tfile, "utf8"));
  if (
    !t.refresh_token ||
    !String(t.scope || "")
      .split(/\s+/)
      .includes(READ_SCOPE)
  )
    fail(
      "VERIFY_AUTH",
      "Preexisting read-only Gmail authorization is unavailable or lacks the read-only scope.",
    );
  const { OAuth2 } = googleapis().auth;
  const client = new OAuth2(c.client_id, c.client_secret, c.redirect_uris?.[0]);
  client.setCredentials(t);
  client.on("tokens", () => {});
  return client;
}

/** Print and return the minimal local status of a prepared reporting plan. */
export function status(planId) {
  // Return only the plan's concise local publication and delivery status.
  const s = readState(planId);
  const out = {
    planId: s.planId,
    runId: s.runId,
    sheetState: s.sheetState,
    sheetUrl: s.sheetUrl || null,
    emailState: s.emailState,
    gmailMessageId: s.gmailMessageId || null,
    rowCount: s.rows?.length,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return out;
}

function parseArgs(argv) {
  // Parse one reporting command and its flags or values.
  const [command, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) {
      const k = rest[i].slice(2);
      if (k === "approve") opts.approve = true;
      else {
        if (!rest[i + 1] || rest[i + 1].startsWith("--"))
          fail("CLI", `Missing value for --${k}.`);
        opts[k] = rest[++i];
      }
    } else if (!opts._) opts._ = [rest[i]];
    else opts._.push(rest[i]);
  }
  return { command, opts };
}
export async function main(argv = process.argv.slice(2)) {
  // Route the parsed command; API actions occur only in their explicit command branches.
  const { command, opts } = parseArgs(argv);
  if (command === "check-config") {
    const c = loadConfig();
    securePrivateStorage(PRIVATE);
    securePrivateStorage(GMAIL_PRIVATE, { apply: false });
    const missing = [
      "sheets-credentials.json",
      "sheets-tokens.json",
      "gmail-send-credentials.json",
      "gmail-send-tokens.json",
      "customer-send-credentials.json",
      "customer-send-tokens.json",
    ].filter((n) => !fs.existsSync(path.join(PRIVATE, n)));
    process.stdout.write(
      JSON.stringify(
        {
          configValid: true,
          spreadsheetConfigured: Boolean(c.spreadsheetId),
          privateAclVerified: true,
          reportingCredentialsPresent: missing.length === 0,
          missingCredentialFiles: missing,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }
  if (command === "authorize-sheets") return authorize("sheets");
  if (command === "authorize-send") return authorize("send");
  if (command === "authorize-customer-send") return authorize("customer-send");
  if (command === "setup-demo-policy") {
    if (opts["attest-agency-owned"] !== "true")
      fail("DEMO_SETUP_SCOPE", "Set --attest-agency-owned true after independently verifying the configured targets are agency-owned.");
    const policy = createDemoReportingPolicy({ by: opts.by,
      confirmSpreadsheetId: opts["confirm-spreadsheet-id"], confirmTo: opts["confirm-to"],
      senderPolicyId: opts["sender-policy-id"], attestAgencyOwned: true });
    process.stdout.write(`Demo reporting policy ${policy.policyId} created.\n`);
    return policy;
  }
  if (command === "setup-automatic-workflow-policy") {
    if (opts["attest-agency-owned"] !== "true")
      fail("WORKFLOW_POLICY_SETUP", "Set --attest-agency-owned true after independently verifying the configured dashboard and internal recipient are agency-owned.");
    const policy = createAutomaticWorkflowPolicy({ by: opts.by,
      confirmSpreadsheetId: opts["confirm-spreadsheet-id"], confirmTo: opts["confirm-to"], attestAgencyOwned: true });
    process.stdout.write(`Automatic workflow policy ${policy.policyId} created.\n`);
    return policy;
  }
  if (command === "setup-customer-contact-policy") {
    if (opts["attest-customer-clarifications"] !== "true")
      fail("CUSTOMER_CONTACT_SETUP", "Set --attest-customer-clarifications true after reviewing the clarification-only reply policy.");
    const policy = createCustomerContactPolicy({ by: opts.by, confirmFrom: opts["confirm-from"], attestCustomerClarifications: true, includeNotifications: opts["include-notifications"] === "true", sendingGrant: opts["sending-grant"] || "customer-send" });
    process.stdout.write(`Customer clarification policy ${policy.policyId} created.\n`);
    return policy;
  }
  if (command === "prepare") return prepare(opts._?.[0]);
  if (command === "prepare-demo") return prepareDemo(opts._?.[0]);
  if (command === "publish") {
    if (!opts.approve)
      fail("APPROVAL", "Use --approve with --by and --confirm-spreadsheet-id.");
    return publish(
      opts.plan,
      { approved: true, by: opts.by },
      opts["confirm-spreadsheet-id"],
    );
  }
  if (command === "publish-demo") return publishDemoAuthorized(opts.plan);
  if (command === "prepare-email") return prepareEmail(opts.plan);
  if (command === "send-demo") return sendDemoConfirmationAuthorized(opts.plan);
  if (command === "approve-send") {
    if (!opts.approve)
      fail("APPROVAL", "Use --approve with --by and --confirm-to.");
    return approveSend(
      opts.plan,
      { approved: true, by: opts.by },
      opts["confirm-to"],
    );
  }
  if (command === "verify") return verify(opts.plan, opts.by || "operator");
  if (command === "status") return status(opts.plan);
  fail(
    "CLI",
    "Commands: check-config, authorize-sheets, authorize-send, authorize-customer-send, setup-demo-policy, setup-automatic-workflow-policy, setup-customer-contact-policy, prepare, prepare-demo, publish, publish-demo, prepare-email, approve-send, send-demo, verify, status.",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    const err =
      e instanceof ReportingError
        ? e
        : new ReportingError(
            "REPORTING_ERROR",
            "Reporting operation failed; sensitive details were suppressed.",
          );
    process.stderr.write(`${err.code}: ${err.message}\n`);
    process.exitCode = 1;
  });
