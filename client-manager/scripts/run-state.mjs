#!/usr/bin/env node
/*
 * Module overview: deterministic lease management for scheduled and
 * orchestrator-triggered Client Manager work. Exclusive claim files serialize
 * concurrent launches; tokens and spent-budget records support recovery. This
 * module coordinates an LLM routine but does not execute one.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inside } from "./work-cycle.mjs";

function leasePath(root, id) {
  // Resolve the one shared lease file after validating the routine ID.
  if (!/^[a-z][a-z0-9-]+$/.test(id)) throw new Error("Invalid routine id");
  return inside(root, `state/run-leases/${id}.json`);
}
function taskLeasePath(root, id, taskId) {
  // Build a task-specific lease path only when a valid stable task UUID is supplied.
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      taskId || "",
    )
  )
    throw new Error(
      "Explicit task identity is required for manual and event runs",
    );
  return inside(
    root,
    `state/run-leases/tasks/${id}/${taskId.toLowerCase()}.json`,
  );
}
function selectedLeasePath(root, id, taskId) {
  return taskId ? taskLeasePath(root, id, taskId) : leasePath(root, id);
}
function validateLease(lease, id) {
  // Reject incomplete or impossible ownership, time, status, and budget fields.
  if (
    lease.schema !== 1 ||
    lease.routine !== id ||
    typeof lease.period !== "string" ||
    typeof lease.token !== "string" ||
    !["in-progress", "completed", "partial"].includes(lease.status) ||
    ![lease.started, lease.deadline, lease.spent_ms, lease.budget_ms].every(
      Number.isFinite,
    ) ||
    lease.spent_ms < 0 ||
    lease.budget_ms <= 0 ||
    lease.deadline < lease.started
  )
    throw new Error("Invalid run claim; preserve it and investigate");
  return lease;
}
export function readLease(root, id, taskId = null) {
  // Read and validate the shared or task-specific lease, if one exists.
  const p = selectedLeasePath(root, id, taskId);
  if (!fs.existsSync(p)) return null;
  const lease = validateLease(JSON.parse(fs.readFileSync(p, "utf8")), id);
  if (
    (taskId && lease.taskId !== taskId.toLowerCase()) ||
    (!taskId && lease.taskId !== undefined)
  )
    throw new Error(
      "Run claim identity does not match its lease path; preserve it and investigate",
    );
  return lease;
}
/** Reconcile consumed time across task claims so one period stays within budget. */
function periodSpent(root, id, period, budget) {
  // Add time already consumed by shared and per-task leases for this schedule period.
  let spent = 0;
  const shared = readLease(root, id);
  if (shared?.period === period)
    spent +=
      shared.status === "in-progress" ? shared.budget_ms : shared.spent_ms;
  const taskDir = inside(root, `state/run-leases/tasks/${id}`);
  if (fs.existsSync(taskDir))
    for (const name of fs.readdirSync(taskDir)) {
      if (!/^[a-f0-9-]+\.json$/i.test(name)) continue;
      const lease = validateLease(
        JSON.parse(fs.readFileSync(path.join(taskDir, name), "utf8")),
        id,
      );
      if (
        !lease.taskId ||
        name.toLowerCase() !== `${lease.taskId.toLowerCase()}.json`
      )
        throw new Error(
          "Task lease identity does not match its filename; preserve it and investigate",
        );
      if (lease.period === period)
        spent +=
          lease.status === "in-progress" ? lease.budget_ms : lease.spent_ms;
    }
  return spent;
}
/** Decide whether a task may start or resume within its remaining period budget. */
export function inspectLease(
  root,
  id,
  period,
  budgetMinutes,
  now = Date.now(),
  taskId = null,
) {
  // Calculate remaining time and decide whether work may start or resume.
  const lease = readLease(root, id, taskId),
    budget = budgetMinutes * 60000;
  if (!Number.isFinite(budget) || budget <= 0)
    throw new Error("Invalid schedule budget");
  if (taskId) {
    const used = periodSpent(root, id, period, budget);
    const otherUsed = Math.max(
      0,
      used -
        (lease?.period === period && lease.status !== "in-progress"
          ? lease.spent_ms
          : 0),
    );
    const sharedRemaining = Math.max(0, budget - otherUsed);
    if (!lease)
      return sharedRemaining > 0
        ? { allowed: true, resume: false, remaining_ms: sharedRemaining }
        : { allowed: false, reason: "period budget exhausted", lease: null };
    if (lease.status === "in-progress" && now < lease.deadline)
      return {
        allowed: false,
        reason: "another claim for this task is active",
        lease,
      };
    if (lease.status === "completed")
      return { allowed: false, reason: "task already completed", lease };
    if (lease.period !== period)
      return sharedRemaining > 0
        ? { allowed: true, resume: false, remaining_ms: sharedRemaining }
        : { allowed: false, reason: "period budget exhausted", lease };
    const remaining = Math.min(
      Math.max(0, lease.budget_ms - lease.spent_ms),
      sharedRemaining,
    );
    return remaining > 0
      ? { allowed: true, resume: true, remaining_ms: remaining }
      : { allowed: false, reason: "period or task budget exhausted", lease };
  }
  const sharedRemaining = Math.max(
    0,
    budget - periodSpent(root, id, period, budget),
  );
  if (!lease)
    return sharedRemaining > 0
      ? { allowed: true, resume: false, remaining_ms: sharedRemaining }
      : { allowed: false, reason: "period budget exhausted", lease: null };
  if (lease.status === "in-progress" && now < lease.deadline)
    return { allowed: false, reason: "another claim is active", lease };
  if (lease.period !== period)
    return sharedRemaining > 0
      ? {
          allowed: true,
          resume: false,
          remaining_ms: sharedRemaining,
          previous_incomplete: lease.status !== "completed",
        }
      : { allowed: false, reason: "period budget exhausted", lease };
  if (lease.status === "completed")
    return { allowed: false, reason: "period completed", lease };
  const spent =
    lease.status === "in-progress"
      ? budget
      : periodSpent(root, id, period, budget);
  const remaining = Math.max(0, budget - spent);
  return remaining > 0
    ? { allowed: true, resume: true, remaining_ms: remaining }
    : {
        allowed: false,
        reason:
          "period budget exhausted; refresh unfinished work next eligible period",
        lease,
      };
}
/** Acquire an exclusive claim and atomically publish a fresh ownership token. */
export function claimRun(
  root,
  id,
  period,
  budgetMinutes,
  now = Date.now(),
  taskId = null,
) {
  // Acquire an exclusive lock before writing a new lease ownership token.
  const p = selectedLeasePath(root, id, taskId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const lock = leasePath(root, id) + ".claim";
  let fd;
  try {
    fd = fs.openSync(lock, "wx");
  } catch (e) {
    if (e.code === "EEXIST")
      return {
        allowed: false,
        reason:
          "claim transaction busy; inspect an orphaned claim before removing it",
      };
    throw e;
  }
  try {
    // Recheck under the lock so two callers cannot both claim the same remaining budget.
    const check = inspectLease(root, id, period, budgetMinutes, now, taskId);
    if (!check.allowed) return check;
    const previous = readLease(root, id, taskId);
    const periodHistory =
      previous && previous.period !== period
        ? [
            ...(previous.periodHistory || []),
            {
              period: previous.period,
              status: previous.status,
              spent_ms: previous.spent_ms,
              budget_ms: previous.budget_ms,
              finished: previous.finished || null,
            },
          ]
        : previous?.periodHistory || [];
    const lease = {
      schema: 1,
      routine: id,
      ...(taskId ? { taskId: taskId.toLowerCase(), periodHistory } : {}),
      period,
      token: crypto.randomUUID(),
      status: "in-progress",
      started: now,
      deadline: now + check.remaining_ms,
      spent_ms: previous?.period === period ? previous.spent_ms : 0,
      budget_ms:
        previous?.period === period ? previous.budget_ms : check.remaining_ms,
    };
    const tmp = p + "." + lease.token;
    fs.writeFileSync(tmp, JSON.stringify(lease) + "\n", { flag: "wx" });
    fs.renameSync(tmp, p);
    return { ...check, token: lease.token, deadline: lease.deadline };
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
/** Finish only the matching owner's claim and preserve time spent for recovery. */
export function finishRun(
  root,
  id,
  token,
  status,
  now = Date.now(),
  period = null,
  taskId = null,
) {
  // Finish only when the supplied token matches the currently active lease owner.
  if (!["completed", "partial"].includes(status))
    throw new Error("Finish status must be completed or partial");
  const p = selectedLeasePath(root, id, taskId),
    lock = leasePath(root, id) + ".claim";
  const fd = fs.openSync(lock, "wx");
  try {
    const lease = readLease(root, id, taskId);
    if (!lease || lease.token !== token || lease.status !== "in-progress")
      throw new Error("Only the current claim owner may finish");
    lease.spent_ms = Math.min(
      lease.budget_ms,
      lease.spent_ms + Math.max(0, now - lease.started),
    );
    lease.status = status;
    lease.finished = now;
    const tmp = p + "." + token;
    fs.writeFileSync(tmp, JSON.stringify(lease) + "\n", { flag: "wx" });
    fs.renameSync(tmp, p);
    return lease;
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
/** Exercise competing tasks, token checks and partial recovery in temporary storage. */
function selftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-state-"));
  try {
    const first = claimRun(root, "test-run", "p1", 10, 1000);
    assert.equal(first.allowed, true);
    assert.equal(claimRun(root, "test-run", "p1", 10, 1001).allowed, false);
    assert.throws(() =>
      finishRun(root, "test-run", "wrong", "completed", 2000),
    );
    finishRun(root, "test-run", first.token, "partial", 61000);
    const resumed = claimRun(root, "test-run", "p1", 10, 62000);
    assert.equal(resumed.resume, true);
    assert.equal(resumed.remaining_ms, 540000);
    finishRun(root, "test-run", resumed.token, "completed", 63000);
    assert.equal(claimRun(root, "test-run", "p1", 10, 64000).allowed, false);
    const next = claimRun(root, "test-run", "p2", 10, 65000);
    assert.equal(next.allowed, true);
    assert.equal(
      claimRun(root, "test-run", "p2", 10, next.deadline + 1).allowed,
      false,
    );
    assert.equal(
      claimRun(root, "test-run", "p3", 10, next.deadline + 2).allowed,
      true,
    );
    assert.throws(() => readLease(root, "../outside"));
    const eventA = "11111111-1111-4111-8111-111111111111";
    const eventB = "22222222-2222-4222-8222-222222222222";
    const a = claimRun(root, "test-run", "2026-03-04", 10, 1000000, eventA);
    const aDuplicate = claimRun(
      root,
      "test-run",
      "2026-03-04",
      10,
      1000001,
      eventA,
    );
    assert.equal(a.allowed, true);
    assert.equal(aDuplicate.allowed, false);
    finishRun(root, "test-run", a.token, "completed", 1005000, null, eventA);
    assert.equal(
      claimRun(root, "test-run", "2026-03-05", 10, 1005500, eventA).allowed,
      false,
    );
    const b = claimRun(root, "test-run", "2026-03-04", 10, 1006000, eventB);
    assert.equal(b.allowed, true);
    assert.equal(
      claimRun(root, "test-run", "2026-03-04", 10, 1006000, eventA).allowed,
      false,
    );
    finishRun(root, "test-run", b.token, "partial", 1010000, null, eventB);
    const bResume = claimRun(
      root,
      "test-run",
      "2026-03-04",
      10,
      1011000,
      eventB,
    );
    assert.equal(bResume.allowed, true);
    finishRun(
      root,
      "test-run",
      bResume.token,
      "completed",
      1012000,
      null,
      eventB,
    );
    assert.equal(
      claimRun(
        root,
        "test-run",
        "2026-03-04",
        0.08,
        1013000,
        "33333333-3333-4333-8333-333333333333",
      ).allowed,
      false,
    );
    assert.throws(() =>
      claimRun(root, "test-run", "2026-03-04", 10, 1014000, "not-a-task-id"),
    );
    const budgetEvent = "44444444-4444-4444-8444-444444444444";
    const budgetPeer = "55555555-5555-4555-8555-555555555555";
    const budgetClaim = claimRun(
      root,
      "budget-run",
      "2026-03-04",
      1,
      2000000,
      budgetEvent,
    );
    assert.equal(budgetClaim.allowed, true);
    assert.equal(budgetClaim.deadline, 2060000);
    assert.equal(
      claimRun(root, "budget-run", "2026-03-04", 1, 2000001, budgetPeer)
        .allowed,
      false,
    );
    finishRun(
      root,
      "budget-run",
      budgetClaim.token,
      "partial",
      2010000,
      null,
      budgetEvent,
    );
    assert.equal(
      claimRun(root, "budget-run", "2026-03-04", 1, 2011000, budgetPeer)
        .allowed,
      true,
    );
    console.log("run-state: selftest PASS");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2),
      value = (k) => args[args.indexOf(k) + 1];
    if (args.includes("--selftest")) selftest();
    else {
      if (args[0] !== "finish")
        throw new Error(
          "Usage: run-state.mjs finish --routine id --token token --status completed|partial [--task-id uuid] [--root folder]",
        );
      const root = path.resolve(
        args.includes("--root")
          ? value("--root")
          : path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
      );
      const taskId = value("--task-id") || null;
      console.log(
        JSON.stringify(
          finishRun(
            root,
            value("--routine"),
            value("--token"),
            value("--status"),
            Date.now(),
            null,
            taskId,
          ),
        ),
      );
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
