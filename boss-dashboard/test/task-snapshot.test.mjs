import test from 'node:test';
import assert from 'node:assert/strict';
import { readTaskSnapshot } from '../task-snapshot.mjs';
test('progress refresh batches both sources and preserves task row identity', async () => {
 let calls=0;
 const sheets={spreadsheets:{values:{batchGet:async ({ranges})=>{
  calls++;assert.equal(ranges.length,2);
  return {data:{valueRanges:[{values:[['id-1'],['id-2']]},{values:[['Run ID','Status'],['run-1','completed']]}]}};
 }}}};
 const data=await readTaskSnapshot(sheets,'book',true);
 assert.equal(calls,1);assert.equal(data.rows[1].rowNumber,3);
 assert.equal(data.rows[1].cells.length,16);assert.equal(data.executionRows[1][0],'run-1');
});
test('missing optional Ledger does not prevent task progress reads', async () => {
 const sheets={spreadsheets:{values:{batchGet:async ({ranges})=>{
  assert.deepEqual(ranges,["'Task Ledger'!A2:P"]);
  return {data:{valueRanges:[{values:[['running']]}]}};
 }}}};
 const result=await readTaskSnapshot(sheets,'book',false);
 assert.equal(result.rows[0].cells[0],'running');assert.deepEqual(result.executionRows,[]);
});
