#!/usr/bin/env node
/*
 * Module overview: deterministic leases for one routine and period. Exclusive
 * claims serialize duplicate launches, while tokens and elapsed-budget records
 * let interrupted plan drafting resume safely. This module does not run an LLM.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inside } from "./work-cycle.mjs";

/** Build a confined lease path after validating the routine id. */
function leasePath(root, id) {
  // Resolve the routine's shared lease file after validating its identifier.
  if (!/^[a-z][a-z0-9-]+$/.test(id)) throw new Error("Invalid routine id");
  return inside(root, `state/run-leases/${id}.json`);
}
/** Read and validate claim ownership and budget fields before trusting state. */
export function readLease(root, id) {
  // Read the saved lease and validate its routine, status, time, and budget fields.
  const p = leasePath(root, id);
  if (!fs.existsSync(p)) return null;
  const lease = JSON.parse(fs.readFileSync(p, "utf8"));
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
/** Decide whether a period is eligible to start/resume and report remaining budget. */
export function inspectLease(
  root,
  id,
  period,
  budgetMinutes,
  now = Date.now(),
) {
  // Calculate remaining period budget and decide whether work may start or resume.
  const lease = readLease(root, id),
    budget = budgetMinutes * 60000;
  if (!Number.isFinite(budget) || budget <= 0)
    throw new Error("Invalid schedule budget");
  if (!lease) return { allowed: true, resume: false, remaining_ms: budget };
  if (lease.status === "in-progress" && now < lease.deadline)
    return { allowed: false, reason: "another claim is active", lease };
  if (lease.period !== period)
    return {
      allowed: true,
      resume: false,
      remaining_ms: budget,
      previous_incomplete: lease.status !== "completed",
    };
  if (lease.status === "completed")
    return { allowed: false, reason: "period completed", lease };
  const spent = lease.status === "in-progress" ? budget : lease.spent_ms;
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
/** Acquire an exclusive lock and atomically publish the new claim. */
export function claimRun(root, id, period, budgetMinutes, now = Date.now()) {
  // Acquire an exclusive lock before replacing the lease with a new ownership token.
  const p = leasePath(root, id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const lock = p + ".claim";
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
    const check = inspectLease(root, id, period, budgetMinutes, now);
    if (!check.allowed) return check;
    const lease = {
      schema: 1,
      routine: id,
      period,
      token: crypto.randomUUID(),
      status: "in-progress",
      started: now,
      deadline: now + check.remaining_ms,
      spent_ms: budgetMinutes * 60000 - check.remaining_ms,
      budget_ms: budgetMinutes * 60000,
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
/** Finish only the current token owner and retain consumed time for resumption. */
export function finishRun(root, id, token, status, now = Date.now()) {
  // Finish only when the supplied token matches the currently active lease owner.
  if (!["completed", "partial"].includes(status))
    throw new Error("Finish status must be completed or partial");
  const p = leasePath(root, id),
    lock = p + ".claim";
  const fd = fs.openSync(lock, "wx");
  try {
    const lease = readLease(root, id);
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
/** Test overlap, token validation and partial recovery under a temporary root. */
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
          "Usage: run-state.mjs finish --routine id --token token --status completed|partial [--root folder]",
        );
      const root = path.resolve(
        args.includes("--root")
          ? value("--root")
          : path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
      );
      console.log(
        JSON.stringify(
          finishRun(
            root,
            value("--routine"),
            value("--token"),
            value("--status"),
          ),
        ),
      );
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
