import test from 'node:test';
import assert from 'node:assert/strict';
import { answerWithOllama } from '../ai-chat.mjs';
const env = { OLLAMA_BASE_URL: 'https://ollama.com/v1', OLLAMA_API_KEY: 'fake-key', DASHBOARD_CHAT_MODEL: 'example-model' };
test('older in-progress evidence survives detail truncation with full stale and run totals', async () => {
  const tasks = Array.from({ length: 180 }, (_, i) => ({ taskId: String(i), status: 'Completed', updatedAt: '2026-11-17T15:00:00Z' }));
  tasks.push({ taskId: 'old', projectId: 'OLD-PROJECT', status: 'In Progress', updatedAt: '2026-11-06T10:00:00Z' });
  await answerWithOllama({ question: 'What work is currently in progress?', tasks }, { env, fetchImpl: async (_url, options) => {
    const evidence = JSON.parse(JSON.parse(options.body).messages.at(-1).content).evidence;
    assert.equal(evidence.detailsTruncated, true);
    assert.equal(evidence.tasks[0].taskId, 'old');
    assert.equal(evidence.tasks[0].staleProgress, true);
    assert.deepEqual(evidence.progressCounts, { recentlyUpdated: 0, stale: 1 });
    assert.deepEqual(evidence.runCounts, { total: 181, completed: 180, incomplete: 1 });
    return Response.json({ choices: [{ message: { content: 'No recently active work; one stale record.' } }] });
  } });
});
test('normal wording reaches the model with scoped evidence and conversation', async () => {
  let body;
  const answer = await answerWithOllama({ question: 'Which runs are complete?', employeeId: 'client-manager', tasks: [
    { taskId: 'a', employeeId: 'client-manager', status: 'Completed', title: 'Intake', secret: 'never include' },
    { taskId: 'b', employeeId: 'project-manager', status: 'Blocked' },
  ], history: [{ speaker: 'Boss', message: 'What about yesterday?' }] }, { env, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://ollama.com/v1/chat/completions');
    body = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: 'The intake stage is completed.' } }] });
  } });
  assert.equal(answer, 'The intake stage is completed.');
  const evidence = JSON.parse(body.messages.at(-1).content).evidence;
  assert.equal(evidence.totalTasks, 1);
  assert.equal(JSON.stringify(body).includes('never include'), false);
  assert.equal(JSON.stringify(body).includes('fake-key'), false);
  assert.equal(body.messages[1].content, 'What about yesterday?');
});
test('configuration and provider failures are explicit, with no canned fallback', async () => {
  await assert.rejects(answerWithOllama({ tasks: [] }, { env: {} }), /AI chat needs/);
  await assert.rejects(answerWithOllama({ tasks: [] }, { env, fetchImpl: async () => new Response('private diagnostic', { status: 429 }) }), /HTTP 429/);
  await assert.rejects(answerWithOllama({ tasks: [] }, { env, fetchImpl: async () => Response.json({ choices: [] }) }), /invalid answer/);
});
