#!/usr/bin/env node
/*
 * Module overview: deterministic local migration of employee installation
 * receipts, preserving the old identity, baseline, hashes and an audit record.
 * This is infrastructure maintenance, not an AI employee run. The CLI targets
 * the configured workspace; tests inject a disposable workspace instead.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { ROSTER } from "./run-demo.mjs";
import {
  CORE_FILES,
  MIGRATION_METHOD,
  digest,
  fileHash,
  identity,
  inspectInstallation,
  inspectMigrationLineage,
  kitHash,
  kitHashVariants,
} from "./receipts.mjs";

// Derive the workspace from this script's location so invocation directory does not matter.
const WORKSPACE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

// Reading path for beginners:
// 1. Inspect the existing employee receipt and preserve its identity.
// 2. Create a new receipt with current file hashes and recorded lineage.
// 3. Never run employee work as part of this maintenance command.
function fail(message) {
  // Throwing stops the migration before it can write incomplete provenance.
  throw new Error(message);
}
function readJson(file) {
  // Convert UTF-8 JSON on disk into a JavaScript object, tolerating a BOM at file start.
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}
/** Create an immutable file once; an identical existing copy is idempotent. */
function saveExclusive(file, data) {
  // Ensure parent folders exist, then create the evidence file only if it is absent.
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, data, { flag: "wx" });
  } catch (error) {
    // An existing file is acceptable only when its bytes exactly match this rerun.
    if (
      error.code !== "EEXIST" ||
      !fs.readFileSync(file).equals(Buffer.from(data))
    )
      throw error;
  }
}
/** Write a complete JSON replacement to a temp file, then rename it into place. */
function atomicJson(file, value) {
  // Use a unique temporary sibling so a partial JSON write never replaces the receipt.
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  try {
    // Rename publishes the complete temporary file as the new receipt in one operation.
    fs.renameSync(temp, file);
  } catch (error) {
    try {
      // Remove a leftover temporary file after a failed replacement.
      fs.rmSync(temp, { force: true });
    } catch {}
    throw error;
  }
}
function slash(value) {
  // Store portable forward-slash paths in JSON regardless of the host operating system.
  return value.split(path.sep).join("/");
}

/** Verify provenance, preserve backups/audit, then migrate receipts in the given workspace. */
export function migrateWorkspace(
  workspaceRoot = WORKSPACE,
  { now = new Date() } = {},
) {
  // Resolve once so all generated paths are rooted in the requested workspace.
  const workspace = path.resolve(workspaceRoot);
  const results = [];
  // Process each registered employee independently and record its migration outcome.
  for (const entry of ROSTER) {
    const employeeRoot = path.resolve(workspace, entry.workspaceRoot);
    const employeeFile = path.join(employeeRoot, "employee.json");
    const receiptFile = path.join(employeeRoot, ".installed.json");
    const employee = readJson(employeeFile);
    // Confirm the roster's routine is actually declared by this employee.
    if (!employee.routines?.some((row) => row.id === entry.routine))
      fail(`${entry.employeeId}: expected roster routine is not declared.`);
    // Reject absent, non-file, or symbolic-link routine files before trusting them.
    for (const row of employee.routines) {
      const skill = path.join(employeeRoot, "routines", row.id, "SKILL.md");
      if (
        !fs.existsSync(skill) ||
        !fs.statSync(skill).isFile() ||
        fs.lstatSync(skill).isSymbolicLink()
      )
        fail(
          `${entry.employeeId}: declared routine file is missing or unsafe: ${row.id}.`,
        );
    }
    // Without an existing receipt there is no evidence that this employee was installed.
    if (!fs.existsSync(receiptFile))
      fail(
        `${entry.employeeId}: original receipt is missing; refusing to manufacture an installation from no provenance.`,
      );
    // Keep original bytes because their hash and backup become part of the audit chain.
    const currentReceiptBytes = fs.readFileSync(receiptFile);
    const currentReceipt = JSON.parse(
      currentReceiptBytes.toString("utf8").replace(/^\uFEFF/, ""),
    );
    const currentCheck = inspectInstallation({
      workspaceRoot: workspace,
      employeeRoot,
      employee,
      entry,
    });
    // If current state already verifies, report it without changing any files.
    if (currentCheck.valid) {
      results.push({
        employeeId: entry.employeeId,
        status: "already-verified",
        kind: currentCheck.kind,
        reason: currentCheck.reason,
      });
      continue;
    }
    // Distinguish a known earlier migration from an unrecognized receipt origin.
    const isPriorMigration =
      currentReceipt.receipt_provenance === MIGRATION_METHOD;
    if (currentReceipt.receipt_provenance !== undefined && !isPriorMigration)
      fail(
        `${entry.employeeId}: unknown receipt provenance; refusing to replace it.`,
      );
    if (isPriorMigration) {
      const lineage = inspectMigrationLineage({
        workspaceRoot: workspace,
        employee,
        entry,
        receipt: currentReceipt,
      });
      if (!lineage.valid)
        fail(
          `${entry.employeeId}: prior migration evidence is invalid: ${lineage.reason}`,
        );
    } else if (currentReceipt.schema !== "ai-employee-receipt/1")
      fail(`${entry.employeeId}: unsupported original receipt schema.`);
    const originalReceiptRel = isPriorMigration
      ? currentReceipt.migration.original_receipt.path
      : null;
    const baselineRel = isPriorMigration
      ? currentReceipt.migration.baseline_identity.path
      : slash(
          path.join(
            entry.workspaceRoot,
            ".upgrade",
            "baseline",
            "employee.json",
          ),
        );
    // Preserve the identity baseline used to confirm the original installed identity.
    const baselineFile = path.resolve(workspace, baselineRel);
    if (!fs.existsSync(baselineFile))
      fail(
        `${entry.employeeId}: preserved .upgrade/baseline/employee.json is missing.`,
      );
    const baseline = readJson(baselineFile);
    const originalReceiptFile = isPriorMigration
      ? path.resolve(workspace, originalReceiptRel)
      : null;
    // For repeat migrations, recover the original source receipt rather than treating
    // the most recent migrated receipt as the original installation evidence.
    const sourceReceiptBytes = isPriorMigration
      ? fs.readFileSync(originalReceiptFile)
      : currentReceiptBytes;
    const sourceReceipt = JSON.parse(
      sourceReceiptBytes.toString("utf8").replace(/^\uFEFF/, ""),
    );
    // Verify that the baseline identity and original receipt agree before proceeding.
    if (
      !baseline.slug ||
      !baseline.name ||
      !baseline.role ||
      sourceReceipt.slug !== baseline.slug
    )
      fail(
        `${entry.employeeId}: original identity cannot be verified against its receipt and baseline.`,
      );
    if (
      !kitHashVariants(baselineFile).includes(
        sourceReceipt.files?.["employee.json"],
      )
    )
      fail(
        `${entry.employeeId}: original receipt employee.json checksum does not match the preserved baseline.`,
      );
    const migratedAt = now.toISOString();
    const currentIdentity = identity(employee);
    const sourceSha = digest(sourceReceiptBytes);
    const baselineSha = fileHash(baselineFile);
    // Record full hashes for audit verification and short hashes for receipt compatibility.
    const verifiedHashes = {};
    const relativeFiles = [
      ...CORE_FILES,
      ...employee.routines.map((row) => `routines/${row.id}/SKILL.md`),
    ];
    const receiptHashes = {};
    // Hash every core file and every declared routine's instruction file.
    for (const rel of relativeFiles) {
      const file = path.join(employeeRoot, rel);
      verifiedHashes[rel.replaceAll("\\", "/")] = fileHash(file);
      receiptHashes[rel.replaceAll("\\", "/")] = kitHash(file);
    }
    // Include the previous receipt hash in the migration key when updating a migration.
    const priorReceiptSha = isPriorMigration
      ? digest(currentReceiptBytes)
      : null;
    const key = digest(
      JSON.stringify({
        employeeId: entry.employeeId,
        sourceSha,
        baselineSha,
        currentIdentity,
        verifiedHashes,
        priorReceiptSha,
      }),
    ).slice(0, 24);
    const migrationId = `local-iso-identity-v1-${key}`;
    const auditDir = path.join(
      workspace,
      "agency",
      "demo",
      "receipt-migrations",
      entry.employeeId,
      migrationId,
    );
    const backupFile = isPriorMigration
      ? originalReceiptFile
      : path.join(auditDir, "original.installed.json");
    const auditFile = path.join(auditDir, "migration.json");
    const backupRel = slash(path.relative(workspace, backupFile));
    const auditRel = slash(path.relative(workspace, auditFile));
    saveExclusive(backupFile, sourceReceiptBytes);
    let supersedes = null;
    if (isPriorMigration) {
      const priorBackup = path.join(auditDir, "superseded.installed.json");
      const priorBackupRel = slash(path.relative(workspace, priorBackup));
      saveExclusive(priorBackup, currentReceiptBytes);
      const priorAuditFile = path.resolve(
        workspace,
        currentReceipt.migration.audit_record,
      );
      supersedes = {
        migration_id: currentReceipt.migration.migration_id,
        receipt: { path: priorBackupRel, sha256: priorReceiptSha },
        audit_record: {
          path: currentReceipt.migration.audit_record,
          sha256: fileHash(priorAuditFile),
        },
      };
    }
    const migration = {
      method: MIGRATION_METHOD,
      migration_id: migrationId,
      migrated_at: migratedAt,
      previous_identity: {
        slug: baseline.slug,
        name: baseline.name,
        role: baseline.role,
      },
      current_identity: currentIdentity,
      original_receipt: { path: backupRel, sha256: sourceSha },
      baseline_identity: { path: baselineRel, sha256: baselineSha },
      verification: {
        result: "verified",
        verified_at: migratedAt,
        algorithm: "SHA-256",
        sha256: verifiedHashes,
      },
      audit_record: auditRel,
      ...(supersedes ? { supersedes } : {}),
    };
    const auditBytes =
      JSON.stringify(
        {
          schema: "agency-employee-receipt-migration/1",
          employee_id: entry.employeeId,
          ...migration,
        },
        null,
        2,
      ) + "\n";
    saveExclusive(auditFile, auditBytes);
    migration.audit_record_sha256 = digest(Buffer.from(auditBytes, "utf8"));
    const migratedReceipt = {
      schema: "ai-employee-receipt/1",
      receipt_provenance: MIGRATION_METHOD,
      slug: employee.slug,
      version: employee.version,
      standard: employee.standard,
      installed_on: sourceReceipt.installed_on,
      files: receiptHashes,
      pending: [],
      migration,
    };
    atomicJson(receiptFile, migratedReceipt);
    const verified = inspectInstallation({
      workspaceRoot: workspace,
      employeeRoot,
      employee,
      entry,
    });
    if (!verified.valid)
      fail(
        `${entry.employeeId}: migrated receipt failed post-write verification: ${verified.reason}`,
      );
    results.push({
      employeeId: entry.employeeId,
      status: "migrated-verified",
      kind: verified.kind,
      migrationId,
      auditRecord: auditRel,
    });
  }
  return { method: MIGRATION_METHOD, employees: results };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = migrateWorkspace(WORKSPACE);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Receipt migration stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
