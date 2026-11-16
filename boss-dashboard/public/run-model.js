// Shared with the server: archive visibility never changes execution status.
export function runKeyFor(task) {
  return task.runId ? `ledger:${task.runId}` : `task:${task.parentTaskId || task.taskId}`;
}

export function pendingWork(task) {
  // Ledger not-run rows describe unstarted stages, not independently queued jobs.
  return task.status === "In Progress" || (task.status === "Queued" &&
    !["not-run", "not_started"].includes(task.executionStatus));
}

export function groupRuns(tasks, archiveEvents = []) {
  const archive = new Map();
  for (const event of archiveEvents) {
    if (event?.runKey && ["archive", "restore"].includes(event.action)) archive.set(event.runKey, event.action === "archive");
  }
  const groups = new Map();
  for (const task of tasks) {
    const key = runKeyFor(task);
    if (!groups.has(key)) groups.set(key, { key, projectId: task.projectId || "", tasks: [], updatedAt: "", label: "" });
    const run = groups.get(key);
    run.tasks.push(task);
    const date = task.updatedAt || task.completionTime || task.timestamp || "";
    if (date > run.updatedAt) run.updatedAt = date;
    if (!run.label || task.taskId === task.parentTaskId || !task.parentTaskId)
      run.label = task.title || task.projectId || "Assigned task";
  }
  const runs = [...groups.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key));
  const latestProject = new Set();
  for (const run of runs) {
    const project = run.projectId || run.key;
    const latest = !latestProject.has(project);
    latestProject.add(project);
    run.pending = run.tasks.some(pendingWork);
    // Never hide active work, even if a worker changes status after archiving.
    run.archived = archive.get(run.key) === true && !run.pending;
    run.historical = !run.pending && (run.archived || !latest);
    run.canArchive = !run.pending && !run.archived;
    run.taskCount = run.tasks.length;
    run.blockedCount = run.tasks.filter(task => task.status === "Blocked").length;
    run.completedCount = run.tasks.filter(task => task.status === "Completed").length;
  }
  return runs;
}

export function decorateRuns(tasks, events = []) {
  const runs = groupRuns(tasks, events);
  const byTask = new Map(runs.flatMap(run => run.tasks.map(task => [task.taskId, run])));
  return {
    tasks: tasks.map(task => {
      const run = byTask.get(task.taskId);
      return { ...task, runKey: run.key, archived: run.archived, historical: run.historical };
    }),
    runs: runs.map(({ tasks: ignored, ...run }) => run),
  };
}

export function scopedTasks(tasks, view = "current", runKey = "") {
  return tasks.filter(task => (view === "history" ? task.historical : !task.historical) && (!runKey || task.runKey === runKey));
}

export function employeeWork(tasks, employeeId) {
  const own = tasks.filter(task => task.employeeId === employeeId);
  const latest = rows => rows.sort((a, b) => String(b.updatedAt || b.timestamp).localeCompare(String(a.updatedAt || a.timestamp)))[0];
  return {
    active: latest(own.filter(task => task.status === "In Progress" && !task.staleProgress)),
    stale: latest(own.filter(task => task.status === "In Progress" && task.staleProgress)),
    next: latest(own.filter(task => task.status === "Queued")),
    blocked: latest(own.filter(task => task.status === "Blocked")),
  };
}
