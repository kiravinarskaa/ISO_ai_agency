import { groupRuns } from './public/run-model.js';

// Answers describe recorded evidence, never infer that a worker is alive.
export function taskAnswer(question, tasks, { label = 'The agency', now = new Date() } = {}) {
  const text = question.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
  const incomplete = /\b(incomplete|incompleted|unfinished|outstanding|remaining)\b|not (yet )?(completed|finished|done)/.test(text);
  const blockedIntent = /\b(block\w*|stuck|fail\w*|issues?|attention|problems?)\b/.test(text);
  const runningIntent = /\b(running|active|working)\b|in progress|being worked/.test(text);
  const queuedIntent = /\b(queued|waiting|pending|next)\b/.test(text);
  const reportIntent = /\b(reports?|results?|outputs?)\b/.test(text);
  const summaryIntent = /\b(status|summary|overview)\b|how many/.test(text);
  if (!incomplete && !blockedIntent && !runningIntent && !queuedIntent && !reportIntent && !summaryIntent) return null;
  const stale = task => {
    const updated = Date.parse(task.updatedAt || task.timestamp || '');
    return task.staleProgress || !Number.isFinite(updated) || now - updated > 2 * 60 * 60 * 1000;
  };
  const running = tasks.filter(t => t.status === 'In Progress' && !stale(t));
  const old = tasks.filter(t => t.status === 'In Progress' && stale(t));
  const blocked = tasks.filter(t => t.status === 'Blocked');
  const queued = tasks.filter(t => t.status === 'Queued' && !['not-run', 'not_started'].includes(t.executionStatus));
  const describe = task => `${task.projectId || 'Unassigned project'} — ${task.title || task.description || task.taskId}: ${task.status}` +
    (task.status === 'Blocked' ? `; reason: ${task.blockerReason || 'No reason recorded'}` : '') +
    `; last update: ${task.updatedAt || task.completionTime || task.timestamp || 'unknown'}`;
  const list = items => items.slice().sort((a, b) => String(b.updatedAt || b.timestamp || '').localeCompare(String(a.updatedAt || a.timestamp || '')))
    .slice(0, 5).map(describe).join('\n') + (items.length > 5 ? `\n${items.length - 5} more; open Projects & tasks for the full list.` : '');
  const heading = `${label} — selected dashboard scope.\n`;
  if (incomplete) {
    const runs = groupRuns(tasks).filter(run => run.tasks.some(t => t.status !== 'Completed'));
    return heading + `${runs.length} incomplete run(s). Tasks: ${running.length} recently updated In Progress, ${old.length} stale In Progress, ${blocked.length} blocked, ${queued.length} queued.\n` +
      (runs.slice(0, 5).map(run => `${run.projectId || run.label}: ${run.tasks.filter(t => t.status !== 'Completed').length} unfinished task(s)`).join('\n') || 'All recorded tasks in this scope are completed.') +
      (runs.length > 5 ? `\n${runs.length - 5} more runs; open Projects & tasks.` : '');
  }
  if (blockedIntent) return heading + (blocked.length ? `${blocked.length} blocked task(s).\n${list(blocked)}\nReview the recorded reason in Projects & tasks before retrying.` : 'No blocked tasks are recorded in this scope.');
  if (runningIntent) return heading + `${running.length} task(s) recently updated In Progress; ${old.length} stale In Progress.\n` +
    (running.length ? list(running) + '\n' : '') + (old.length ? `Stale records:\n${list(old)}\n` : '') +
    'Sheet records do not confirm a live worker. Stale tasks need review; they are not counted as recently active.';
  if (queuedIntent) return heading + (queued.length ? `${queued.length} queued task(s).\n${list(queued)}` : 'No queued tasks are recorded in this scope.');
  if (reportIntent) {
    const reports = tasks.filter(t => t.employeeId === 'project-manager' && t.status === 'Completed' && /^https?:\/\//i.test(t.resultLink || ''));
    return heading + (reports.length ? `${reports.length} completed report record(s).\n${list(reports)}\nOpen Reports to access their recorded locations. Email delivery is not confirmed by task completion.` : 'No completed Project Manager report with a web location is recorded in this scope. Task records alone cannot confirm email delivery.');
  }
  return heading + `${queued.length} queued; ${running.length} recently updated In Progress; ${old.length} stale In Progress; ${blocked.length} blocked; ${tasks.filter(t => t.status === 'Completed').length} completed. Counts describe tasks, not whole workflows.`;
}
