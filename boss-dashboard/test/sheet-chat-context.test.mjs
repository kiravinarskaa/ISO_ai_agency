import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_TABS, readChatWorkbook, workbookEvidence } from '../sheet-chat-context.mjs';
test('reads all six tabs in one batch, preserves headers and source row citations', async () => {
  let calls = 0;
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: CHAT_TABS.map(title => ({ properties: { title } })) } }),
    values: { batchGet: async ({ ranges }) => {
      calls++; assert.equal(ranges.length, 6);
      return { data: { valueRanges: CHAT_TABS.map(name => ({ values: [['Status'], [name === 'Email Delivery' ? 'sent' : 'completed']] })) } };
    } },
  } };
  const snapshot = await readChatWorkbook(sheets, 'fake-book');
  const evidence = workbookEvidence(snapshot, 'Was email sent?');
  assert.equal(calls, 1);
  assert.equal(evidence.tabs.length, 6);
  assert.deepEqual(evidence.tabs[5].records[0], { row: 2, cells: ['sent'] });
  assert.equal(evidence.tabs[5].truncated, false);
});
test('missing and oversized data are disclosed, matching rows survive ranking', () => {
  const evidence = workbookEvidence({ tabs: [
    { name: 'Run Outputs', available: false, headers: [], rows: [] },
    { name: 'Ledger', available: true, headers: ['Details'], rows: [['needle'], ...Array.from({ length: 100 }, () => ['x'.repeat(1000)])] },
  ] }, 'needle');
  assert.equal(evidence.tabs[0].available, false);
  assert.equal(evidence.tabs[1].truncated, true);
  assert.equal(evidence.tabs[1].records[0].cells[0], 'needle');
});
