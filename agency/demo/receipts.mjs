/**
 * Module overview: deterministic verification of employee installation
 * receipts. It checks identity, declared routine files and hashes; migrated
 * receipts also require intact lineage and audit evidence. It does not run
 * employees or invoke an LLM.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// This value identifies receipts created by the local migration tool, so the verifier
// can apply stricter lineage checks than it uses for receipts created during install.
const MIGRATION_METHOD = "local-deterministic-identity-migration-v1";
// These employee files define the installed employee's identity and declared behavior.
const CORE_FILES = [
  "employee.json",
  "AGENTS.md",
  "CONTRACT.md",
  "ROLE.md",
  "SCHEDULE.md",
  "work-profile.json",
];

// Reading path for beginners:
// 1. Check that an employee has the expected identity and routine files.
// 2. Hash those files and compare them with the saved installation receipt.
// 3. For migrated receipts, also verify their source and audit trail.

/** Return whether a resolved target remains within its declared root. */
function inside(root, target) {
  // A relative path beginning with .. (or an absolute relative result) escapes root.
  const rel = path.relative(root, target);
  return (
    rel === "" ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
}
function digest(bytes) {
  // SHA-256 produces a stable hexadecimal fingerprint for the supplied file bytes.
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function readJson(file) {
  // Read UTF-8 JSON, remove an optional byte-order mark, then parse it into an object.
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}
function fileHash(file) {
  // Hash the exact bytes on disk so even a small file change is detectable.
  return digest(fs.readFileSync(file));
}
function kitHash(file) {
  // Installation receipts store a shorter display fingerprint for each file.
  return fileHash(file).slice(0, 16);
}
function idOf(employee) {
  // Keep only routine IDs because display names and other routine fields may change.
  return (employee.routines || []).map((row) => row.id);
}
function identity(employee) {
  // Select the fields that together describe the employee's configured identity.
  return {
    slug: employee.slug,
    name: employee.name,
    role: employee.role,
    routines: idOf(employee),
  };
}
function equal(a, b) {
  // Compare JSON-shaped values by their serialized contents, not object references.
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Verify a migrated receipt against its original receipt, baseline and audit chain. */
export function inspectMigrationLineage({
  workspaceRoot,
  employee,
  entry,
  receipt,
}) {
  // Resolve every stored audit reference relative to the workspace before reading it.
  const root = path.resolve(workspaceRoot);
  const migration = receipt?.migration;
  if (
    receipt?.receipt_provenance !== MIGRATION_METHOD ||
    receipt?.schema !== "ai-employee-receipt/1"
  )
    // Reject receipts that do not use the expected migration format and schema.
    return {
      valid: false,
      reason: "Receipt is not a recognized local migration.",
    };
  if (
    receipt.slug !== employee.slug ||
    receipt.version !== employee.version ||
    receipt.standard !== employee.standard ||
    !equal(migration?.current_identity, identity(employee))
  )
    // The receipt must describe the employee currently present in employee.json.
    return {
      valid: false,
      reason:
        "Migrated receipt identity/version differs from current employee.json.",
    };
  if (
    migration?.method !== MIGRATION_METHOD ||
    !Number.isFinite(Date.parse(migration?.migrated_at))
  )
    // A parseable timestamp and known method identify a well-formed migration event.
    return {
      valid: false,
      reason: "Migration method or timestamp is invalid.",
    };
  const backupRel = migration?.original_receipt?.path;
  const baselineRel = migration?.baseline_identity?.path;
  const auditRel = migration?.audit_record;
  if (
    ![backupRel, baselineRel, auditRel].every(
      (value) => typeof value === "string",
    )
  )
    // All three audit links must be strings before they can safely become paths.
    return { valid: false, reason: "Migration audit references are missing." };
  const backup = path.resolve(root, backupRel);
  const baseline = path.resolve(root, baselineRel);
  const auditFile = path.resolve(root, auditRel);
  if (
    ![backup, baseline, auditFile].every(
      (file) => inside(root, file) && fs.existsSync(file),
    )
  )
    // Refuse paths outside the workspace and files that no longer exist.
    return {
      valid: false,
      reason:
        "Original receipt, identity baseline or migration audit record is missing/outside workspace.",
    };
  if (
    fileHash(backup) !== migration.original_receipt.sha256 ||
    fileHash(baseline) !== migration.baseline_identity.sha256 ||
    fileHash(auditFile) !== migration.audit_record_sha256
  )
    // Compare exact file hashes to detect replacement or editing of preserved evidence.
    return {
      valid: false,
      reason: "Original receipt/baseline/audit checksum mismatch.",
    };
  let oldReceipt, oldIdentity, audit;
  try {
    // Parse preserved evidence; an unreadable record cannot prove the old identity.
    oldReceipt = readJson(backup);
    oldIdentity = readJson(baseline);
    audit = readJson(auditFile);
  } catch {
    return {
      valid: false,
      reason:
        "Original receipt, baseline identity or migration audit is unreadable.",
    };
  }
  const previous = migration.previous_identity;
  if (
    oldReceipt.schema !== "ai-employee-receipt/1" ||
    oldReceipt.slug !== previous?.slug ||
    oldIdentity.slug !== previous?.slug ||
    oldIdentity.name !== previous?.name ||
    oldIdentity.role !== previous?.role
  )
    // Cross-check the old slug/name/role against both receipt and saved baseline.
    return {
      valid: false,
      reason:
        "Previous identity is not corroborated by the preserved receipt and baseline.",
    };
  if (
    audit.schema !== "agency-employee-receipt-migration/1" ||
    audit.employee_id !== entry.employeeId ||
    audit.migration_id !== migration.migration_id ||
    audit.method !== MIGRATION_METHOD ||
    audit.migrated_at !== migration.migrated_at ||
    !equal(audit.previous_identity, migration.previous_identity) ||
    !equal(audit.current_identity, migration.current_identity) ||
    !equal(audit.verification?.sha256, migration.verification?.sha256) ||
    !equal(audit.supersedes || null, migration.supersedes || null)
  )
    // The audit record must independently repeat the important receipt fields.
    return {
      valid: false,
      reason:
        "Migration audit record does not corroborate the installed receipt.",
    };
  if (migration.supersedes) {
    // A re-migration links the replaced migration, allowing the chain to be reviewed.
    const prior = migration.supersedes;
    if (
      typeof prior.receipt?.path !== "string" ||
      typeof prior.audit_record?.path !== "string" ||
      typeof prior.migration_id !== "string"
    )
      return {
        valid: false,
        reason: "Superseded migration references are malformed.",
      };
    const priorReceiptPath = path.resolve(root, prior.receipt?.path || "");
    const priorAuditPath = path.resolve(root, prior.audit_record?.path || "");
    if (
      !inside(root, priorReceiptPath) ||
      !inside(root, priorAuditPath) ||
      !fs.existsSync(priorReceiptPath) ||
      !fs.existsSync(priorAuditPath) ||
      fileHash(priorReceiptPath) !== prior.receipt.sha256 ||
      fileHash(priorAuditPath) !== prior.audit_record.sha256
    )
      return {
        valid: false,
        reason: "Superseded local receipt/audit is missing or has changed.",
      };
    let priorReceipt, priorAudit;
    try {
      priorReceipt = readJson(priorReceiptPath);
      priorAudit = readJson(priorAuditPath);
    } catch {
      return {
        valid: false,
        reason: "Superseded local receipt/audit is unreadable.",
      };
    }
    const pm = priorReceipt.migration;
    if (
      priorReceipt.receipt_provenance !== MIGRATION_METHOD ||
      pm?.migration_id !== prior.migration_id ||
      priorAudit.migration_id !== prior.migration_id ||
      priorAudit.method !== MIGRATION_METHOD ||
      pm.audit_record !== prior.audit_record.path ||
      pm.audit_record_sha256 !== prior.audit_record.sha256 ||
      !equal(pm?.current_identity, migration.current_identity) ||
      !equal(pm?.original_receipt, migration.original_receipt) ||
      !equal(pm?.baseline_identity, migration.baseline_identity)
    )
      return {
        valid: false,
        reason:
          "Superseded local receipt does not match the current migration chain.",
      };
  }
  return { valid: true, previousIdentity: previous, migration };
}

/** Validate the installed marker, expected identity and hashes of critical files. */
export function inspectInstallation({
  workspaceRoot,
  employeeRoot,
  employee,
  entry,
}) {
  // The marker lives in the employee folder and records what installation was verified.
  const markerPath = path.join(employeeRoot, ".installed.json");
  if (!fs.existsSync(markerPath))
    return { valid: false, kind: null, reason: "Missing .installed.json." };
  let receipt;
  try {
    // Invalid JSON is treated as a failed verification, not as a trusted receipt.
    receipt = readJson(markerPath);
  } catch {
    return {
      valid: false,
      kind: null,
      reason: ".installed.json is not valid JSON.",
    };
  }
  if (receipt.schema !== "ai-employee-receipt/1")
    return { valid: false, kind: null, reason: "Unsupported receipt schema." };
  if (
    !employee ||
    typeof employee.slug !== "string" ||
    typeof employee.name !== "string" ||
    typeof employee.role !== "string" ||
    !Array.isArray(employee.routines)
  )
    return {
      valid: false,
      kind: null,
      reason: "Invalid employee identity/configuration.",
    };
  if (!(employee.routines || []).some((row) => row.id === entry.routine))
    return {
      valid: false,
      kind: null,
      reason: `Roster routine ${entry.routine} is not declared by employee.json.`,
    };
  const expectedIdentity = identity(employee);
  // Build the complete file list that the receipt must cover.
  const root = path.resolve(workspaceRoot);
  const criticalPaths = [
    ...CORE_FILES,
    ...employee.routines.map((row) => `routines/${row.id}/SKILL.md`),
  ];
  const expectedHashes = {};
  // Check each required file and calculate both compact and full hashes from disk.
  for (const rel of criticalPaths) {
    const file = path.resolve(employeeRoot, rel);
    if (
      !inside(employeeRoot, file) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile() ||
      fs.lstatSync(file).isSymbolicLink()
    )
      return {
        valid: false,
        kind: null,
        reason: `Required installed file is missing or unsafe: ${rel}.`,
      };
    expectedHashes[rel.replaceAll("\\", "/")] = {
      short: kitHash(file),
      full: fileHash(file),
    };
  }
  const verifyHashes = (map) =>
    // Every expected path must have the matching short hash in the receipt map.
    Object.entries(expectedHashes).every(
      ([rel, hashes]) => map?.[rel] === hashes.short,
    );
  if (receipt.receipt_provenance === MIGRATION_METHOD) {
    // Migrated receipts need valid lineage plus hashes tied to the current files.
    const migration = receipt.migration;
    const lineage = inspectMigrationLineage({
      workspaceRoot: root,
      employee,
      entry,
      receipt,
    });
    if (!lineage.valid)
      return { valid: false, kind: "local-migration", reason: lineage.reason };
    if (!verifyHashes(receipt.files))
      return {
        valid: false,
        kind: "local-migration",
        reason:
          "Migrated receipt file checksums do not match the current employee configuration/routines.",
      };
    const verified = migration?.verification?.sha256;
    if (
      !verified ||
      Object.entries(expectedHashes).some(
        ([rel, hash]) => verified[rel] !== hash.full,
      )
    )
      return {
        valid: false,
        kind: "local-migration",
        reason: "Migration verification checksums do not match current files.",
      };
    return {
      valid: true,
      kind: "local-migration",
      reason:
        "Auditable local migration verified against receipt, baseline identity and current file checksums.",
      receipt,
      identity: expectedIdentity,
    };
  }
  if (receipt.receipt_provenance !== undefined)
    // Unknown provenance is not silently treated as a normal install receipt.
    return {
      valid: false,
      kind: "unknown",
      reason: "Unrecognized receipt provenance.",
    };
  if (
    receipt.slug !== employee.slug ||
    receipt.version !== employee.version ||
    receipt.standard !== employee.standard
  )
    return {
      valid: false,
      kind: "native",
      reason: "Native receipt identity/version differs from employee.json.",
    };
  if (!verifyHashes(receipt.files))
    return {
      valid: false,
      kind: "native",
      reason:
        "Native receipt does not contain matching checksums for current configuration and declared routines.",
    };
  return {
    valid: true,
    kind: "native",
    reason: "Native installation receipt checksums and identity match.",
    receipt,
    identity: expectedIdentity,
  };
}

export { MIGRATION_METHOD, CORE_FILES, digest, fileHash, kitHash, identity };
