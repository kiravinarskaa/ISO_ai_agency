/** Plan Sheet updates only from a fully validated completed workflow manifest. */
export function recoveredDashboardUpdates(tasks, manifest, resultLink) {
  if (manifest.finalStatus !== 'completed' || manifest.dryRun !== false || !manifest.finishedAt) return [];
  const outcomes = new Map(manifest.agents.map(agent => [agent.employeeId, agent]));
  if (outcomes.size !== 8 || [...outcomes.values()].some(agent =>
    !['completed', 'reused-validated'].includes(agent.status) || agent.validation?.valid !== true)) return [];
  const parent = tasks.filter(task => task.projectId === manifest.projectId &&
    task.executionMode === 'email-intake-eight-agent' && task.parentTaskId === task.taskId)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
  if (!parent) return [];
  // Match this workflow's existing rows only; manual tasks and other runs stay intact.
  return tasks.filter(task => task.projectId === manifest.projectId &&
    task.parentTaskId === parent.taskId && outcomes.has(task.employeeId) &&
    (task.taskId === parent.taskId || task.executionMode === 'email-intake-eight-agent-stage'))
    .filter(task => task.status !== 'Completed' || task.blockerReason ||
      task.completionTime !== manifest.finishedAt || (task.employeeId === 'project-manager' && task.resultLink !== resultLink))
    .map(task => ({ ...task, status: 'Completed', blockerReason: '', completionTime: manifest.finishedAt,
      ...(task.employeeId === 'project-manager' ? { resultLink } : {}) }))
    .sort((a, b) => Number(a.taskId === parent.taskId) - Number(b.taskId === parent.taskId));
}
