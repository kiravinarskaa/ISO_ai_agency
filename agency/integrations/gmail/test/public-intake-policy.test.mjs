import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PUBLIC_INTAKE_LIMITS,
  effectivePublicIntakeLimits,
  reservePublicExecution,
  reservePublicIntake,
  evaluatePublicPreliminary,
  withPublicIntakeSlot,
} from "../public-intake-policy.mjs";

test("preliminary lane admits grounded sufficient client facts and rejects insufficient intake", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, "client-input"), { recursive: true });
  const source = path.join(f.root, "client-input", "gmail-intake.json");
  fs.writeFileSync(source, "Only synthetic client supplied facts.");
  const brief = { project_id: "INTAKE-test", client_objective: "Readiness review", scope: "One office and named business systems", systems: ["mail"], locations: ["Tashkent"], known_facts: [{ fact: "Client reports 20 staff", source: "client-input/gmail-intake.json" }], sources: ["client-input/gmail-intake.json"], intake_classification: { category: "new_client_request" } };
  const record = { schemaVersion: 1, intakeLane: "public-inquiry", preparationStatus: "preliminary_preparation_ready_pending_identity_verification", senderIdentityVerified: false, organizationIdentityVerified: false, clientClaimsVerified: false, missingInformation: [] };
  assert.deepEqual(evaluatePublicPreliminary({ record, brief, projectRoot: f.root }), { eligible: true, missing: [] });
  assert.equal(evaluatePublicPreliminary({ record, brief: {}, projectRoot: f.root }).eligible, false);
  assert.equal(evaluatePublicPreliminary({ record, brief: { ...brief, known_facts: [{ fact: "self citation", source: "working/client-brief.json" }], sources: ["working/client-brief.json"] }, projectRoot: f.root }).eligible, false);
});

test("security classification overrides sufficient preliminary data until an external authorized review is recorded", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, "client-input"), { recursive: true });
  fs.writeFileSync(path.join(f.root, "client-input", "gmail-intake.json"), "Synthetic source.");
  const record = { schemaVersion: 1, intakeLane: "public-inquiry", preparationStatus: "preliminary_preparation_ready_pending_identity_verification", senderIdentityVerified: false, organizationIdentityVerified: false, clientClaimsVerified: false, missingInformation: [] };
  const brief = { project_id: "INTAKE-test", client_objective: "Readiness review", scope: "One office", systems: ["mail"], locations: ["Tashkent"], known_facts: [{ fact: "Claim", source: "client-input/gmail-intake.json" }], sources: ["client-input/gmail-intake.json"], intake_classification: { category: "suspicious_or_requires_review" } };
  const denied = evaluatePublicPreliminary({ record, brief, projectRoot: f.root });
  assert.equal(denied.eligible, false);
  assert.deepEqual(denied.missing, ["authorized security review outcome"]);
  const authorizedReview = { projectId: "INTAKE-test", reviewedCategory: "suspicious_or_requires_review", decision: "approved_for_preliminary_processing", by: "synthetic reviewer", reason: "Synthetic review basis", at: "2026-11-05T12:00:00Z" };
  assert.equal(evaluatePublicPreliminary({ record, brief, projectRoot: f.root, authorizedReview }).eligible, true);
  assert.equal(evaluatePublicPreliminary({ record, brief: { ...brief, intake_classification: { category: "irrelevant_or_automated" } }, projectRoot: f.root, authorizedReview }).eligible, false);
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "public-intake-policy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, ratePath: path.join(root, "state", "rate.json") };
}

test("unknown senders receive bounded, deduplicated intake without an allowlist", (t) => {
  const f = fixture(t);
  const today = new Date("2026-11-05T12:00:00Z");
  const senders = ["first@outside.example", "second@outside.example"];
  assert.equal(PUBLIC_INTAKE_LIMITS.perSenderPerUtcDay, null);
  assert.equal(reservePublicIntake(senders[0], "m1", f.ratePath, today).allowed, true);
  assert.equal(reservePublicIntake(senders[0], "m1", f.ratePath, today).duplicate, true);
  assert.equal(reservePublicIntake(senders[0], "m2", f.ratePath, today).allowed, true);
  assert.equal(reservePublicIntake(senders[0], "m3", f.ratePath, today).allowed, true);
  assert.equal(reservePublicIntake(senders[0], "m4", f.ratePath, today).allowed, true);
  assert.equal(reservePublicIntake(senders[1], "m5", f.ratePath, today).allowed, true);
  const restored = JSON.parse(fs.readFileSync(f.ratePath, "utf8"));
  assert.equal(restored.total, 5);
  assert.equal(restored.senders[senders[0]], 4);
});

test("public usage state resets by UTC day and malformed state fails closed", (t) => {
  const f = fixture(t);
  reservePublicIntake("a@outside.example", "m1", f.ratePath, new Date("2026-11-05T23:59:00Z"));
  const next = reservePublicIntake("a@outside.example", "m2", f.ratePath, new Date("2026-11-06T00:01:00Z"));
  assert.equal(next.state.day, "2026-11-06");
  fs.writeFileSync(f.ratePath, "{}");
  assert.throws(() => reservePublicIntake("a@outside.example", "m3", f.ratePath), { code: "PUBLIC_RATE_STATE" });
});

test("daily AI usage remains idempotent without a daily cap", (t) => {
  const f = fixture(t);
  const day = new Date("2026-11-05T12:00:00Z");
  for (let i = 0; i < 30; i++)
    assert.equal(reservePublicExecution(`task-${i}`, f.ratePath, day).allowed, true);
  assert.equal(reservePublicExecution("task-0", f.ratePath, day).duplicate, true);
  assert.equal(reservePublicExecution("task-over", f.ratePath, day).allowed, true);
});

test("only one public Client Manager intake can run at once across launchers", async (t) => {
  const f = fixture(t);
  const lockPath = path.join(f.root, "state", "public.lock");
  let release;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const hold = new Promise((resolve) => { release = resolve; });
  const first = withPublicIntakeSlot(lockPath, async () => { started(); await hold; return "one"; });
  await startedPromise;
  const second = await withPublicIntakeSlot(lockPath, async () => "two");
  assert.equal(second.acquired, false);
  release();
  assert.deepEqual(await first, { acquired: true, value: "one" });
});

test("an active concurrency lock is not stolen", async (t) => {
  const f = fixture(t);
  const lockPath = path.join(f.root, "state", "public.lock");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid }));
  assert.deepEqual(await withPublicIntakeSlot(lockPath, async () => assert.fail("active slot must not run")), { acquired: false });
});

test("daily caps remain disabled across dates while concurrency stays one", () => {
  for (const date of ['2026-11-06T12:00:00Z','2026-11-07T12:00:00Z']) {
    assert.equal(effectivePublicIntakeLimits(new Date(date)).perSenderPerUtcDay,null);
    assert.equal(effectivePublicIntakeLimits(new Date(date)).globalPerUtcDay,null);
    assert.equal(effectivePublicIntakeLimits(new Date(date)).maxConcurrentAiIntakes,1);
  }
});
