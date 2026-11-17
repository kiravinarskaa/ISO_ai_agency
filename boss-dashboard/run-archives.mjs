import { groupRuns } from "./public/run-model.js";

export const ARCHIVE_TAB = "Dashboard Archives";
export const ARCHIVE_HEADERS = ["Run Key", "Action", "Timestamp"];

export function archiveEventsFromRows(rows) {
  return rows.map(row => ({ runKey: row.cells[0], action: row.cells[1], timestamp: row.cells[2] }))
    .filter(event => event.runKey && ["archive", "restore"].includes(event.action));
}

export function planArchiveChange(tasks, events, keys, action) {
  const bad = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  if (!["archive", "restore"].includes(action)) bad("Choose archive or restore.");
  if (!Array.isArray(keys) || !keys.length || keys.length > 100 || keys.some(key => typeof key !== "string" || !key || key.length > 300))
    bad("Select between 1 and 100 valid runs.");
  const runs = new Map(groupRuns(tasks, events).map(run => [run.key, run]));
  const selected = [...new Set(keys)].map(key => {
    const run = runs.get(key);
    if (!run) bad("A selected run no longer exists. Refresh and try again.", 409);
    if (action === "archive" && run.pending) bad("Queued or running work cannot be archived. Refresh and review your selection.", 409);
    return run;
  });
  return selected.filter(run => action === "archive" ? !run.archived : run.archived).map(run => run.key);
}

// Append-only metadata; worker Task Ledger and Ledger are never modified here.
export async function changeRunArchives({ loadTasks, loadEvents, appendEvents }, keys, action, now = new Date().toISOString()) {
  const [tasks, events] = await Promise.all([loadTasks(), loadEvents()]);
  const changes = planArchiveChange(tasks, events, keys, action);
  if (changes.length) await appendEvents(changes.map(runKey => [runKey, action, now]));
  return { changed: changes.length, action };
}
