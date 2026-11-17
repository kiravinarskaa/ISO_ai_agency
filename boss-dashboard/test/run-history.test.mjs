import test from "node:test";
import assert from "node:assert/strict";
import { decorateRuns, groupRuns, scopedTasks, employeeWork, runStatus, filterRuns, selectRunKeys } from "../public/run-model.js";
import { archiveEventsFromRows, planArchiveChange, changeRunArchives } from "../run-archives.mjs";

export const sampleTasks = () => [
  { taskId: "old-parent", parentTaskId: "old-parent", projectId: "DEMO-1", title: "Earlier test", employeeId: "client-manager", status: "Blocked", timestamp: "2026-11-12T08:00:00Z" },
  { taskId: "new-parent", parentTaskId: "new-parent", projectId: "DEMO-1", title: "Latest test", employeeId: "client-manager", status: "Completed", timestamp: "2026-11-16T08:00:00Z", completionTime: "2026-11-16T08:00:00Z" },
  { taskId: "new-pm", parentTaskId: "new-parent", projectId: "DEMO-1", title: "Final report", employeeId: "project-manager", status: "Completed", timestamp: "2026-11-16T08:01:00Z" },
  { taskId: "abandoned", projectId: "DEMO-2", title: "Abandoned test", employeeId: "project-manager", status: "Blocked", timestamp: "2026-11-13T08:00:00Z" },
  { taskId: "queued", title: "Waiting job", employeeId: "client-manager", status: "Queued", timestamp: "2026-11-16T08:02:00Z" },
  { taskId: "active", projectId: "DEMO-3", title: "Active job", employeeId: "technical-controls-analyst", status: "In Progress", timestamp: "2026-11-16T08:03:00Z" },
];
test('new completions replace stale card headlines while older unresolved work stays visible',()=>{
 const tasks=[{taskId:'old',employeeId:'project-manager',status:'Blocked',timestamp:'2026-11-12'},
  {taskId:'stale',employeeId:'project-manager',status:'In Progress',staleProgress:true,timestamp:'2026-11-13'},
  {taskId:'done',employeeId:'project-manager',status:'Completed',timestamp:'2026-11-17'}];
 const view=employeeWork(tasks,'project-manager');
 assert.equal(view.latestCompleted.taskId,'done');
 assert.equal(view.blocked,undefined);assert.equal(view.stale,undefined);
 assert.equal(view.olderBlockedCount,1);assert.equal(view.olderStaleCount,1);
 assert.equal(tasks[0].status,'Blocked');
 tasks.push({taskId:'new-block',employeeId:'project-manager',status:'Blocked',timestamp:'2026-11-18'});
 assert.equal(employeeWork(tasks,'project-manager').blocked.taskId,'new-block');
});

test("Current hides superseded project runs, retains latest result, and keeps all pending work", () => {
  const tasks = sampleTasks();
  const data = decorateRuns(tasks);
  assert.equal(data.runs.length, 5);
  assert.deepEqual(scopedTasks(data.tasks, "history").map(t => t.taskId), ["old-parent"]);
  assert.equal(scopedTasks(data.tasks).length, 5);
  assert.equal(scopedTasks(data.tasks, "current", "task:new-parent").length, 2);
  assert.equal(scopedTasks(data.tasks, "history", "task:new-parent").length, 0);
  assert.equal(tasks[0].historical, undefined);
});

test("archiving preserves all task statuses and reports and is reversible", () => {
  const tasks = sampleTasks();
  const original = JSON.stringify(tasks);
  const events = [{ runKey: "task:abandoned", action: "archive" }];
  const archived = decorateRuns(tasks, events);
  assert.ok(!scopedTasks(archived.tasks).some(t => t.taskId === "abandoned"));
  assert.equal(scopedTasks(archived.tasks, "history").length, 2);
  const restored = decorateRuns(tasks, [...events, { runKey: "task:abandoned", action: "restore" }]);
  assert.ok(scopedTasks(restored.tasks).some(t => t.taskId === "abandoned"));
  assert.equal(JSON.stringify(tasks), original);
});

test("active work overrides old archive flags and is never hidden", () => {
  const tasks = sampleTasks();
  const data = decorateRuns(tasks, [{ runKey: "task:active", action: "archive" }]);
  assert.equal(data.runs.find(r => r.key === "task:active").archived, false);
  assert.ok(scopedTasks(data.tasks).some(t => t.taskId === "active"));
  tasks[0].status = "Queued";
  assert.ok(scopedTasks(decorateRuns(tasks).tasks).some(t => t.taskId === "old-parent"));
});

test("read-only execution ledger uses run IDs and distinguishes not-run stages from queued jobs", () => {
  const data = groupRuns([
    { taskId: "workflow:r1:a", runId: "r1", projectId: "P", status: "Blocked", executionStatus: "failed" },
    { taskId: "workflow:r1:b", runId: "r1", projectId: "P", status: "Queued", executionStatus: "not-run" },
  ]);
  assert.equal(data.length, 1);
  assert.equal(data[0].key, "ledger:r1");
  assert.equal(data[0].canArchive, true);
});

test("employee cards ignore historical failures and choose most recent current work", () => {
  const tasks = scopedTasks(decorateRuns(sampleTasks(), [{ runKey: "task:abandoned", action: "archive" }]).tasks);
  assert.equal(employeeWork(tasks, "project-manager").blocked, undefined);
  assert.equal(employeeWork(tasks, "client-manager").blocked, undefined);
  assert.equal(employeeWork(tasks, "client-manager").next.taskId, "queued");
  assert.equal(employeeWork(tasks, "technical-controls-analyst").active.taskId, "active");
});

test("archive validation rejects active, queued, missing, malformed or excessive selections", () => {
  const tasks = sampleTasks();
  for (const keys of [["task:active"], ["task:queued"], ["missing"], [], "all", Array(101).fill("task:abandoned")])
    assert.throws(() => planArchiveChange(tasks, [], keys, "archive"));
  assert.throws(() => planArchiveChange(tasks, [], ["task:abandoned"], "delete"));
  assert.deepEqual(planArchiveChange(tasks, [], ["task:abandoned", "task:abandoned"], "archive"), ["task:abandoned"]);
});

test("archive service appends only visibility metadata and is idempotent", async () => {
  const tasks = sampleTasks();
  const events = [];
  const writes = [];
  const services = { loadTasks: async () => tasks, loadEvents: async () => events,
    appendEvents: async rows => { writes.push(...rows); events.push(...rows.map(([runKey, action, timestamp]) => ({ runKey, action, timestamp }))); } };
  assert.equal((await changeRunArchives(services, ["task:abandoned"], "archive", "now")).changed, 1);
  assert.equal((await changeRunArchives(services, ["task:abandoned"], "archive", "later")).changed, 0);
  assert.equal((await changeRunArchives(services, ["task:abandoned"], "restore", "later")).changed, 1);
  assert.deepEqual(writes, [["task:abandoned", "archive", "now"], ["task:abandoned", "restore", "later"]]);
  assert.deepEqual(archiveEventsFromRows(writes.map(cells => ({ cells }))), events);
});

test("fresh status checks reject runs that became active after preview, without partial changes", async () => {
  let writes = 0;
  const services = { loadTasks: async () => sampleTasks(), loadEvents: async () => [], appendEvents: async () => { writes++; } };
  await assert.rejects(changeRunArchives(services, ["task:abandoned", "task:active"], "archive"), { status: 409 });
  assert.equal(writes, 0);
});

test("storage failure is surfaced rather than reported as successful archive", async () => {
  await assert.rejects(changeRunArchives({ loadTasks: async () => sampleTasks(), loadEvents: async () => [],
    appendEvents: async () => { throw Error("offline"); } }, ["task:abandoned"], "archive"), /offline/);
});

test("blocked and fully completed selection never mix outcomes or include active work", () => {
  const runs = [
    { key: "mixed", pending: false, canArchive: true, taskCount: 8, completedCount: 7, blockedCount: 1 },
    { key: "done", pending: false, canArchive: true, taskCount: 8, completedCount: 8, blockedCount: 0 },
    { key: "active", pending: true, canArchive: false, taskCount: 8, completedCount: 5, blockedCount: 1 },
    { key: "archived", pending: false, canArchive: false, archived: true, taskCount: 8, completedCount: 8, blockedCount: 0 },
  ];
  assert.equal(runStatus(runs[0]), "blocked");
  assert.deepEqual(selectRunKeys(runs, "blocked"), ["mixed"]);
  assert.deepEqual(selectRunKeys(runs, "completed"), ["done"]);
  assert.deepEqual(selectRunKeys(runs, "archived"), ["archived"]);
  assert.deepEqual(selectRunKeys(runs, "all"), ["mixed", "done", "archived"]);
  assert.deepEqual(selectRunKeys(runs, "unknown"), []);
});

test("run status, project and search filters combine before selecting visible runs", () => {
  const runs = groupRuns(sampleTasks());
  const blocked = filterRuns(runs, { status: "blocked", search: "ABANDONED" });
  assert.deepEqual(selectRunKeys(blocked, "all"), ["task:abandoned"]);
  assert.equal(filterRuns(runs, { status: "completed", runKey: "task:abandoned" }).length, 0);
  assert.equal(filterRuns(runs, { status: "active" }).length, 2);
  assert.equal(filterRuns(runs, { search: "no matching run" }).length, 0);
  assert.equal(filterRuns(groupRuns(sampleTasks(), [{ runKey: "task:abandoned", action: "archive" }]), { status: "archived" }).length, 1);
  const many = Array.from({ length: 110 }, (_, i) => ({ key: String(i), pending: false, canArchive: true, taskCount: 1, completedCount: 1, blockedCount: 0 }));
  assert.equal(selectRunKeys(many, "completed").length, 100);
});
