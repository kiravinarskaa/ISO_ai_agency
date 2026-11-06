/** Opt-in policy helpers for a synthetic university demonstration sender. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const DEFAULT_POLICY_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "config",
  "demo-automation-policy.json",
);

// Reading path for beginners:
// 1. Validate an operator-created list of synthetic test senders.
// 2. Check incoming email for the required sender and test marker.
// 3. Reserve daily capacity before the demo runner spends AI usage.

function policyError(message, code = "DEMO_POLICY") {
  return Object.assign(new Error(message), { code });
}

/** Validate a policy loaded from the operator-owned public configuration file. */
export function validateDemoPolicy(policy) {
  if (
    !policy ||
    policy.schemaVersion !== 1 ||
    policy.enabled !== true ||
    typeof policy.policyId !== "string" ||
    !policy.policyId ||
    typeof policy.configuredBy !== "string" ||
    !policy.configuredBy.trim() ||
      policy.addressOwnershipAttested !== true ||
    !Array.isArray(policy.senders) ||
    !policy.senders.length ||
    !Number.isInteger(policy.maxPerSenderPerDay) ||
    policy.maxPerSenderPerDay < 1 ||
    policy.maxPerSenderPerDay > 3 ||
    !Number.isInteger(policy.maxGlobalPerDay) ||
    policy.maxGlobalPerDay < 1 ||
    policy.maxGlobalPerDay > 5 ||
    policy.maxPerSenderPerDay > policy.maxGlobalPerDay ||
    !Number.isInteger(policy.maxAgentExecutionsPerDay) ||
    policy.maxAgentExecutionsPerDay < 8 ||
    policy.maxAgentExecutionsPerDay > 40 ||
    policy.maxAgentExecutionsPerDay !== policy.maxGlobalPerDay * 8
  )
    throw policyError("Synthetic sender policy is missing or invalid.");
  const seen = new Set();
  for (const sender of policy.senders) {
    if (
      !sender ||
      typeof sender.address !== "string" ||
      !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender.address) ||
      sender.address !== sender.address.toLowerCase() ||
      typeof sender.marker !== "string" ||
      sender.marker.length < 12 ||
      sender.marker.length > 120
    )
      throw policyError("Synthetic sender entry is invalid.");
    if (seen.has(sender.address)) throw policyError("Duplicate sender in policy.");
    seen.add(sender.address);
  }
  return policy;
}

/** Load only the explicit demo policy; a missing file means the feature is disabled. */
export function loadDemoPolicy(filePath = DEFAULT_POLICY_PATH) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return validateDemoPolicy(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error.code === "DEMO_POLICY") throw error;
    throw policyError("Synthetic sender policy cannot be read.");
  }
}

/** Create an explicit, operator-attributed policy; never overwrite an existing policy. */
export function createDemoPolicy({
  senderEmail,
  marker,
  senders,
  configuredBy,
  attestSenderControlled,
  maxPerSenderPerDay = 2,
  maxGlobalPerDay = 5,
  filePath = DEFAULT_POLICY_PATH,
} = {}) {
  if (
    typeof configuredBy !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/.test(configuredBy.trim())
  )
    throw policyError("Setup requires a valid operator name.");
  if (attestSenderControlled !== true)
    throw policyError(
      "Setup requires an explicit operator attestation that this exact mailbox is controlled for the synthetic demo.",
    );
  const policy = validateDemoPolicy({
    schemaVersion: 1,
    enabled: true,
    policyId: crypto.randomUUID(),
    configuredBy: configuredBy.trim(),
    configuredAt: new Date().toISOString(),
    addressOwnershipAttested: true,
    senders: senders || [
      { address: String(senderEmail || "").trim().toLowerCase(), marker },
    ],
    maxPerSenderPerDay,
    maxGlobalPerDay,
    maxAgentExecutionsPerDay: maxGlobalPerDay * 8,
  });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fs.writeFileSync(filePath, JSON.stringify(policy, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error.code === "EEXIST")
      throw policyError(
        "A synthetic sender policy already exists; refusing to replace it.",
        "DEMO_POLICY_EXISTS",
      );
    throw error;
  }
  return policy;
}

/** Require trusted Gmail authentication metadata plus the exact test sender and marker. */
export function verifySyntheticSender(parsed, policy) {
  if (!policy) return { eligible: false, reason: "policy_disabled" };
  const sender = policy.senders.find((row) => row.address === parsed.senderEmail);
  if (!sender) return { eligible: false, reason: "sender_not_allowlisted" };
  const fromHeaders = (parsed.headers || []).filter(
    (row) => row.name.toLowerCase() === "from",
  );
  if (fromHeaders.length !== 1)
    return { eligible: false, reason: "from_header_ambiguous" };
  if (!(parsed.bodyText || "").includes(sender.marker))
    return { eligible: false, reason: "synthetic_marker_missing" };
  if (parsed.attachments?.length)
    return { eligible: false, reason: "demo_attachments_not_permitted" };

  // Gmail exposes Authentication-Results in the fetched message headers; require one
  // and only one Google-authserv result so a forged duplicate cannot mask a failure.
  const trusted = (parsed.headers || []).filter((row) =>
    row.name.toLowerCase() === "authentication-results" &&
    /^\s*mx\.google\.com\s*;/i.test(row.value));
  if (trusted.length !== 1)
    return {
      eligible: false,
      reason: "trusted_authentication_result_missing_or_ambiguous",
    };
  const auth = trusted[0].value.toLowerCase();
  const domain = parsed.senderEmail.split("@")[1];
  const dkimPass =
    /\bdkim=pass\b/.test(auth) &&
    new RegExp(`\\bheader\\.d=${escapeRegex(domain)}(?:[;\\s]|$)`).test(auth);
  const spfPass =
    /\bspf=pass\b/.test(auth) &&
    new RegExp(
      `\\bsmtp\\.mailfrom=${escapeRegex(parsed.senderEmail)}(?:[;\\s]|$)`,
    ).test(auth);
  const dmarcPass =
    /\bdmarc=pass\b/.test(auth) &&
    new RegExp(`\\bheader\\.from=${escapeRegex(domain)}(?:[;\\s]|$)`).test(auth);
  if (!dkimPass || !spfPass || !dmarcPass)
    return { eligible: false, reason: "sender_authentication_failed_or_unaligned" };
  return {
    eligible: true,
    policyId: policy.policyId,
    senderEmail: sender.address,
    marker: sender.marker,
    verification: "gmail-authentication-results-dkim-spf-dmarc-aligned",
  };
}

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** Reserve daily workflow capacity durably before creating an automatic handoff. */
export function reserveDemoCapacity(policy, senderEmail, messageId, filePath, now = new Date()) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  let lockFd;
  try { lockFd = fs.openSync(lockPath, "wx", 0o600); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      try { process.kill(lock.pid, 0); throw policyError("Demo rate state is busy; retry next poll.", "DEMO_RATE_LOCKED"); }
      catch (probe) {
        if (probe.code !== "ESRCH") throw probe;
      }
      fs.rmSync(lockPath);
      lockFd = fs.openSync(lockPath, "wx", 0o600);
    } catch (probe) {
      if (probe.code === "DEMO_RATE_LOCKED") throw probe;
      throw policyError("Demo rate lock cannot be safely recovered.", "DEMO_RATE_LOCKED");
    }
  }
  try {
  fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  const day = now.toISOString().slice(0, 10);
  let state = { schemaVersion: 1, day, total: 0, senders: {}, messages: [] };
  try { state = JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw policyError("Demo rate state is unreadable."); }
  if (state.schemaVersion !== 1 || !Array.isArray(state.messages) || typeof state.total !== "number")
    throw policyError("Demo rate state is malformed.");
  if (state.day !== day) state = { schemaVersion: 1, day, total: 0, senders: {}, messages: [] };
  if (state.messages.includes(messageId)) return { allowed: true, duplicate: true, state };
  const used = state.senders[senderEmail] || 0;
  if (used >= policy.maxPerSenderPerDay || state.total >= policy.maxGlobalPerDay)
    return { allowed: false, duplicate: false, state };
  state.total += 1;
  state.senders[senderEmail] = used + 1;
  state.messages.push(messageId);
  const temp = `${filePath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  fs.renameSync(temp, filePath);
  return { allowed: true, duplicate: false, state };
  } finally {
    fs.closeSync(lockFd);
    fs.rmSync(lockPath, { force: true });
  }
}

/** Bound full eight-employee workflows per UTC day, including old queued work. */
export function reserveDemoAgentRun(policy, projectId, filePath, now = new Date()) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  let lockFd;
  try { lockFd = fs.openSync(lockPath, "wx", 0o600); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      if (!Number.isInteger(lock.pid) || lock.pid < 1) throw new Error();
      try { process.kill(lock.pid, 0); throw policyError("Demo agent capacity is busy; retry next poll.", "DEMO_RATE_LOCKED"); }
      catch (probe) { if (probe.code !== "ESRCH") throw probe; }
      fs.rmSync(lockPath);
      lockFd = fs.openSync(lockPath, "wx", 0o600);
    } catch (probe) {
      if (probe.code === "DEMO_RATE_LOCKED") throw probe;
      throw policyError("Demo agent capacity lock cannot be safely recovered.", "DEMO_RATE_LOCKED");
    }
  }
  try {
    fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    const day = now.toISOString().slice(0, 10);
    let state = { schemaVersion: 1, day, projects: [] };
    try { state = JSON.parse(fs.readFileSync(filePath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw policyError("Demo agent usage state is unreadable."); }
    if (state.schemaVersion !== 1 || !Array.isArray(state.projects))
      throw policyError("Demo agent usage state is malformed.");
    if (state.day !== day) state = { schemaVersion: 1, day, projects: [] };
    if (state.projects.includes(projectId)) return { allowed: true, duplicate: true, state };
    if (state.projects.length >= policy.maxGlobalPerDay) return { allowed: false, duplicate: false, state };
    state.projects.push(projectId);
    const temp = `${filePath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    fs.renameSync(temp, filePath);
    return { allowed: true, duplicate: false, state };
  } finally {
    fs.closeSync(lockFd);
    fs.rmSync(lockPath, { force: true });
  }
}
