/** Public inquiry quotas and a single shared intake-execution slot. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Limit unknown senders without requiring them to appear on an allowlist.
export const PUBLIC_INTAKE_LIMITS = Object.freeze({
  perSenderPerUtcDay: null,
  globalPerUtcDay: null,
  maxConcurrentAiIntakes: 1,
});

/** Null daily caps mean intake and execution are uncapped; concurrency stays one. */
export function effectivePublicIntakeLimits() { return PUBLIC_INTAKE_LIMITS; }

// Reading path for beginners:
// 1. Confirm each source file is inside the staged project's input folder.
// 2. Check classification and whether the brief has source-backed facts.
// 3. Enforce daily limits and one-at-a-time processing for public requests.

/** Validate the fixed original source or a hashed same-thread reply file. */
export function isSafePublicIntakeSource(projectRoot, source) {
  // Reject paths that could point outside the project before touching the disk.
  if (
    typeof source !== "string" ||
    path.isAbsolute(source) ||
    source.split(/[\\/]/).includes("..")
  ) {
    return false;
  }

  // These are the only accepted customer-provided source files.
  const portable = source.split(path.sep).join("/").replace(/\\/g, "/");
  const isOriginalEmail = portable === "client-input/gmail-intake.json";
  const isReply =
    /^client-input\/customer-replies\/[a-f0-9]{64}\.json$/.test(portable);
  if (!isOriginalEmail && !isReply) return false;

  try {
    const root = fs.realpathSync(projectRoot);
    const inputFolder = path.join(root, "client-input");
    const target = path.resolve(root, ...portable.split("/"));
    const realTarget = fs.realpathSync(target);
    const relative = path.relative(root, realTarget);

    return (
      !relative.startsWith("..") &&
      !path.isAbsolute(relative) &&
      fs.realpathSync(inputFolder) === inputFolder &&
      fs.statSync(realTarget).isFile() &&
      !fs.lstatSync(target).isSymbolicLink() &&
      path.relative(inputFolder, realTarget).split(path.sep)[0] !== ".."
    );
  } catch {
    // Missing, unreadable, or unsafe paths are not valid intake sources.
    return false;
  }
}

/** Read the operator maintained review ledger outside the employee project. */
export function loadAuthorizedPublicReview(projectId, statePath) {
  try {
    if (
      fs.lstatSync(statePath).isSymbolicLink() ||
      !fs.statSync(statePath).isFile()
    ) {
      return null;
    }
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (
      state.schemaVersion !== 1 ||
      !state.decisions ||
      typeof state.decisions !== "object"
    ) {
      return null;
    }
    const row = state.decisions[projectId];
    if (!row || row.projectId !== projectId) return null;
    return row;
  } catch {
    return null;
  }
}

const VALID_INTAKE_LANES = new Set(["public-inquiry", "synthetic-demo"]);
const VALID_PREPARATION_STATES = new Set([
  "preliminary_preparation_ready_pending_identity_verification",
  "onboarding_incomplete",
]);
const VALID_CLASSIFICATIONS = new Set([
  "new_client_request",
  "suspicious_or_requires_review",
  "spam",
  "irrelevant_or_automated",
  "general_inquiry",
]);

// Check the fields that every generated intake record must contain.
function isValidIntakeRecord(record) {
  return Boolean(
    record &&
      record.schemaVersion === 1 &&
      VALID_INTAKE_LANES.has(record.intakeLane) &&
      typeof record.senderIdentityVerified === "boolean" &&
      record.organizationIdentityVerified === false &&
      record.clientClaimsVerified === false &&
      Array.isArray(record.missingInformation) &&
      VALID_PREPARATION_STATES.has(record.preparationStatus),
  );
}

// A held classification may proceed only when a reviewer recorded a matching decision.
function hasMatchingReview(review, category, projectId) {
  return Boolean(
    review &&
      review.projectId === projectId &&
      review.reviewedCategory === category &&
      review.decision === "approved_for_preliminary_processing" &&
      typeof review.by === "string" &&
      review.by.trim() &&
      typeof review.reason === "string" &&
      review.reason.trim() &&
      typeof review.at === "string" &&
      !Number.isNaN(Date.parse(review.at)),
  );
}

// Confirm a source fact really points to a regular input file inside the project.
function hasGroundedSourceFact(projectRoot, brief) {
  const facts = Array.isArray(brief?.known_facts) ? brief.known_facts : [];
  const sources = Array.isArray(brief?.sources) ? brief.sources : [];

  return facts.some((fact) => {
    const source = fact?.source || fact?.source_path;
    if (!isSafePublicIntakeSource(projectRoot, source) || !sources.includes(source))
      return false;

    const target = path.resolve(projectRoot, source);
    const relative = path.relative(projectRoot, target);

    try {
      const root = fs.realpathSync(projectRoot);
      const inputFolder = path.join(root, "client-input");
      const realTarget = fs.realpathSync(target);

      return (
        !relative.startsWith("..") &&
        !path.isAbsolute(relative) &&
        fs.realpathSync(path.dirname(target)) === inputFolder &&
        path.relative(root, realTarget).split(path.sep).join("/") === source &&
        fs.statSync(realTarget).isFile() &&
        !fs.lstatSync(target).isSymbolicLink()
      );
    } catch {
      return false;
    }
  });
}

// Collect required information in one place so the main decision reads like a checklist.
function findMissingIntakeInformation(record, brief, projectRoot) {
  const missing = [];

  if (record.intakeLane !== "public-inquiry")
    missing.push("public inquiry lane marker");

  if (
    record.preparationStatus !==
    "preliminary_preparation_ready_pending_identity_verification"
  ) {
    missing.push(
      ...(record.missingInformation.length
        ? record.missingInformation
        : ["sufficient preliminary intake record"]),
    );
  }

  // A useful preliminary brief needs an objective and a bounded scope.
  if (typeof brief?.client_objective !== "string" || !brief.client_objective.trim())
    missing.push("objective");
  if (typeof brief?.scope !== "string" || !brief.scope.trim())
    missing.push("bounded scope");

  // These arrays name the systems and places included in the proposed assessment.
  for (const field of ["systems", "locations"]) {
    const values = brief?.[field];
    if (!Array.isArray(values) || !values.some((value) => String(value).trim()))
      missing.push(field);
  }

  if (!hasGroundedSourceFact(projectRoot, brief))
    missing.push("client-provided source facts");

  return missing;
}

/** Decide whether an intake can enter the unverified preliminary workflow. */
export function evaluatePublicPreliminary({
  record,
  brief,
  projectRoot,
  authorizedReview = null,
}) {
  if (!isValidIntakeRecord(record)) {
    return {
      eligible: false,
      invalid: true,
      missing: ["validated public intake record"],
    };
  }

  const category = brief?.intake_classification?.category;

  // Classification is a security decision, separate from data completeness.
  if (
    category !== "new_client_request" &&
    !hasMatchingReview(authorizedReview, category, brief?.project_id)
  ) {
    return {
      eligible: false,
      securityBlocked: true,
      missing: ["authorized security review outcome"],
    };
  }

  if (!VALID_CLASSIFICATIONS.has(category)) {
    return {
      eligible: false,
      invalid: true,
      missing: ["valid security classification"],
    };
  }

  const missing = findMissingIntakeInformation(record, brief, projectRoot);
  return { eligible: missing.length === 0, missing };
}

function policyError(code, message) {
  return Object.assign(new Error(message), { code });
}

/** Reserve one bounded Client Manager intake slot and persist it across restarts. */
export function reservePublicIntake(senderEmail, messageId, statePath, now = new Date()) {
  return withExclusiveLock(statePath, () => {
    const day = now.toISOString().slice(0, 10);
    let state = { schemaVersion: 1, day, total: 0, senders: {}, messageIds: [] };
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT")
        throw policyError("PUBLIC_RATE_STATE", "Public intake rate state is unreadable.");
    }
    if (state.schemaVersion !== 1 || !Array.isArray(state.messageIds) ||
        typeof state.total !== "number" || !state.senders || typeof state.senders !== "object")
      throw policyError("PUBLIC_RATE_STATE", "Public intake rate state is malformed.");
    if (state.day !== day)
      state = { schemaVersion: 1, day, total: 0, senders: {}, messageIds: [] };
    if (state.messageIds.includes(messageId))
      return { allowed: true, duplicate: true, state };
    const senderCount = state.senders[senderEmail] || 0;

    // Count this message before queuing AI work so a restart cannot bypass the cap.
    state.total += 1;
    state.senders[senderEmail] = senderCount + 1;
    state.messageIds.push(messageId);
    atomicJson(statePath, state);
    return { allowed: true, duplicate: false, state };
  });
}

/** Bound actual public Client Manager task executions as well as inbound queueing. */
export function reservePublicExecution(workId, statePath, now = new Date()) {
  return withExclusiveLock(statePath, () => {
    const day = now.toISOString().slice(0, 10);
    let state = { schemaVersion: 1, day, total: 0, workIds: [] };
    try { state = JSON.parse(fs.readFileSync(statePath, "utf8")); }
    catch (error) {
      if (error.code !== "ENOENT")
        throw policyError("PUBLIC_USAGE_STATE", "Public AI usage state is unreadable.");
    }
    if (state.schemaVersion !== 1 || !Array.isArray(state.workIds) || typeof state.total !== "number")
      throw policyError("PUBLIC_USAGE_STATE", "Public AI usage state is malformed.");
    if (state.day !== day) state = { schemaVersion: 1, day, total: 0, workIds: [] };
    if (state.workIds.includes(workId)) return { allowed: true, duplicate: true, state };
    state.total += 1;
    state.workIds.push(workId);
    atomicJson(statePath, state);
    return { allowed: true, duplicate: false, state };
  });
}

/** Run at most one public Client Manager subprocess across concurrent launchers. */
export async function withPublicIntakeSlot(lockPath, operation) {
  const acquired = acquireLock(lockPath);
  if (!acquired) return { acquired: false };
  try {
    return { acquired: true, value: await operation() };
  } finally {
    releaseLock(lockPath, acquired);
  }
}

function withExclusiveLock(statePath, operation) {
  const lockPath = `${statePath}.lock`;
  const lock = acquireLock(lockPath);
  if (!lock)
    throw policyError("PUBLIC_RATE_LOCKED", "Public intake rate state is busy; retry next poll.");
  try {
    return operation();
  } finally {
    releaseLock(lockPath, lock);
  }
}

function acquireLock(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    const fd = fs.openSync(lockPath, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    return fd;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }

  // Recover a leftover lock only after confirming its process no longer exists.
  try {
    if (fs.lstatSync(lockPath).isSymbolicLink()) return null;
    const owner = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    if (!Number.isInteger(owner.pid) || owner.pid < 1) return null;
    try {
      process.kill(owner.pid, 0);
      return null;
    } catch (error) {
      if (error.code !== "ESRCH") return null;
    }
    fs.rmSync(lockPath);
    const fd = fs.openSync(lockPath, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    return fd;
  } catch {
    return null;
  }
}

function releaseLock(lockPath, fd) {
  fs.closeSync(fd);
  fs.rmSync(lockPath, { force: true });
}

function atomicJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  fs.renameSync(temp, filePath);
}
