import test from 'node:test';
import assert from 'node:assert/strict';
import { taskAnswer } from '../task-answers.mjs';
const now = new Date('2026-11-17T15:00:00Z');
const tasks = [
  { taskId: '1', parentTaskId: '1', projectId: 'A', title: 'Review', status: 'Blocked', blockerReason: 'Missing scope', updatedAt: '2026-11-17T14:00:00Z' },
  { taskId: '2', parentTaskId: '1', projectId: 'A', title: 'Evidence', status: 'In Progress', updatedAt: '2026-11-06T10:00:00Z' },
  { taskId: '3', projectId: 'B', title: 'Controls', status: 'In Progress', updatedAt: '2026-11-17T14:50:00Z' },
  { taskId: '4', projectId: 'C', status: 'Completed' },
];
test('unfinished synonyms count runs rather than stage rows', () => {
  for (const question of ['Do you have any incompleted runs?', 'What is unfinished?', 'Which runs are not completed?', 'remaining work']) {
    assert.match(taskAnswer(question, tasks, { now }), /2 incomplete run\(s\)/);
    assert.match(taskAnswer(question, tasks, { now }), /1 stale In Progress/);
  }
});
test('stale work is separated from recent progress, with evidence', () => {
  const answer = taskAnswer('what work is currently in progress?', tasks, { now });
  assert.match(answer, /1 task\(s\) recently updated/);
  assert.match(answer, /Stale records:[\s\S]*2026-11-06/);
  assert.match(answer, /do not confirm a live worker/);
});
test('blockers contain project and actual reason', () => {
  assert.match(taskAnswer('What needs attention?', tasks, { now }), /A — Review: Blocked; reason: Missing scope/);
});
test('unknown questions differ from empty supported queries', () => {
  assert.equal(taskAnswer('What is ISO 27001?', [], { now }), null);
  assert.match(taskAnswer('Any incomplete runs?', [], { now }), /0 incomplete/);
});
test('answers are bounded and never claim email delivery', () => {
  const records = Array.from({ length: 9 }, (_, i) => ({ ...tasks[0], taskId: String(i), parentTaskId: String(i) }));
  assert.match(taskAnswer('blocked tasks', records, { now }), /4 more/);
  assert.match(taskAnswer('reports available', [{ ...tasks[3], employeeId: 'project-manager', resultLink: 'https://example.com/report' }], { now }), /Email delivery is not confirmed/);
});
