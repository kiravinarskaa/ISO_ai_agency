import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDemoPolicy, reserveDemoAgentRun, reserveDemoCapacity, verifySyntheticSender } from "../demo-policy.mjs";

const authHeaders = (address = "test@university.example") => [
  { name: "From", value: address },
  { name: "Authentication-Results", value: `mx.google.com; dkim=pass header.d=university.example; spf=pass smtp.mailfrom=${address}; dmarc=pass header.from=university.example` },
];
function parsed(overrides = {}) {
  return { senderEmail: "test@university.example", subject: "ISO 27001 readiness",
    bodyText: "ISO27001-UNIVERSITY-DEMO please help us with an ISO 27001 readiness assessment",
    headers: authHeaders(), ...overrides };
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "demo-policy-") );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, policyPath: path.join(root, "demo.json"), ratePath: path.join(root, "state", "rate.json") };
}

test("synthetic sender policy requires explicit operator setup and is never overwritten", (t) => {
  const f = fixture(t);
  const policy = createDemoPolicy({ senderEmail: "TEST@university.example", marker: "ISO27001-UNIVERSITY-DEMO", configuredBy: "Demo Operator", attestSenderControlled: true, filePath: f.policyPath });
  assert.equal(policy.senders[0].address, "test@university.example");
  assert.throws(() => createDemoPolicy({ senderEmail: "test@university.example", marker: "ISO27001-UNIVERSITY-DEMO", configuredBy: "Demo Operator", attestSenderControlled: true, filePath: f.policyPath }), { code: "DEMO_POLICY_EXISTS" });
});

test("operator setup supports a finite allowlist of separately marked test senders", (t) => {
  const f = fixture(t);
  const policy = createDemoPolicy({ senders: [
    { address: "one@university.example", marker: "TEST-CLIENT-ONE-MARKER" },
    { address: "two@university.example", marker: "TEST-CLIENT-TWO-MARKER" },
  ], configuredBy: "Demo Operator", attestSenderControlled: true, filePath: f.policyPath });
  assert.equal(policy.senders.length, 2);
  assert.equal(verifySyntheticSender(parsed(), policy).reason, "sender_not_allowlisted");
  assert.equal(verifySyntheticSender(parsed({ senderEmail: "two@university.example", bodyText: "TEST-CLIENT-TWO-MARKER please help with ISO 27001", headers: authHeaders("two@university.example") }), policy).eligible, true);
});

test("exact sender and marker require aligned Gmail SPF, DKIM, and DMARC evidence", () => {
  const policy = { schemaVersion: 1, enabled: true, policyId: "policy-1", configuredBy: "operator", addressOwnershipAttested: true,
    senders: [{ address: "test@university.example", marker: "ISO27001-UNIVERSITY-DEMO" }],
    maxPerSenderPerDay: 2, maxGlobalPerDay: 5 };
  assert.equal(verifySyntheticSender(parsed(), policy).eligible, true);
  assert.equal(verifySyntheticSender(parsed({ senderEmail: "spoof@university.example" }), policy).eligible, false);
  assert.equal(verifySyntheticSender(parsed({ bodyText: "ISO 27001 please help" }), policy).reason, "synthetic_marker_missing");
  const spoofed = parsed({ headers: [...authHeaders(), { name: "Authentication-Results", value: authHeaders()[1].value }] });
  assert.equal(verifySyntheticSender(spoofed, policy).reason, "trusted_authentication_result_missing_or_ambiguous");
  const failed = parsed({ headers: [{ name: "From", value: "test@university.example" },
    { name: "Authentication-Results", value: "mx.google.com; dkim=fail header.d=university.example; spf=pass smtp.mailfrom=test@university.example; dmarc=fail header.from=university.example" }] });
  assert.equal(verifySyntheticSender(failed, policy).eligible, false);
});

test("global and per-sender limits persist and duplicate message IDs consume capacity once", (t) => {
  const f = fixture(t);
  const policy = { maxPerSenderPerDay: 2, maxGlobalPerDay: 2 };
  const now = new Date("2026-11-05T12:00:00Z");
  assert.equal(reserveDemoCapacity(policy, "a@university.example", "m1", f.ratePath, now).allowed, true);
  assert.equal(reserveDemoCapacity(policy, "a@university.example", "m1", f.ratePath, now).duplicate, true);
  assert.equal(reserveDemoCapacity(policy, "a@university.example", "m2", f.ratePath, now).allowed, true);
  assert.equal(reserveDemoCapacity(policy, "b@university.example", "m3", f.ratePath, now).allowed, false);
  const state = JSON.parse(fs.readFileSync(f.ratePath, "utf8"));
  assert.equal(state.total, 2);
  assert.equal(state.senders["a@university.example"], 2);
});

test("malformed persistent rate state fails closed", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.ratePath), { recursive: true });
  fs.writeFileSync(f.ratePath, "{}");
  assert.throws(() => reserveDemoCapacity({ maxPerSenderPerDay: 2, maxGlobalPerDay: 5 }, "a@university.example", "m", f.ratePath), { code: "DEMO_POLICY" });
});

test("daily employee budget is capped at five projects and recovers on next UTC day", (t) => {
  const f = fixture(t);
  const policy = { maxGlobalPerDay: 2 };
  const day1 = new Date("2026-11-05T23:59:00Z");
  assert.equal(reserveDemoAgentRun(policy, "CL-1", f.ratePath, day1).allowed, true);
  assert.equal(reserveDemoAgentRun(policy, "CL-1", f.ratePath, day1).duplicate, true);
  assert.equal(reserveDemoAgentRun(policy, "CL-2", f.ratePath, day1).allowed, true);
  assert.equal(reserveDemoAgentRun(policy, "CL-3", f.ratePath, day1).allowed, false);
  assert.equal(reserveDemoAgentRun(policy, "CL-3", f.ratePath, new Date("2026-11-06T00:01:00Z")).allowed, true);
});
