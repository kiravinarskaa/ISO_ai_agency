import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveredDashboardUpdates } from '../recovered-dashboard.mjs';
const ids=['client-manager','isms-readiness-planner','requirements-evidence-specialist','technical-controls-analyst','security-awareness-specialist','corrective-action-specialist','readiness-metrics-analyst','project-manager'];
function fixture() {
 const manifest={projectId:'INTAKE-example',finalStatus:'completed',dryRun:false,finishedAt:'2026-11-17T11:38:00Z',
  agents:ids.map(employeeId=>({employeeId,status:employeeId==='project-manager'?'completed':'reused-validated',validation:{valid:true}}))};
 const tasks=ids.map((employeeId,i)=>({taskId:i?'stage-'+i:'parent',parentTaskId:'parent',projectId:manifest.projectId,employeeId,
  executionMode:'email-intake-eight-agent'+(i?'-stage':''),timestamp:'2026-11-17T10:55:00Z',status:i===7?'Blocked':'Completed',blockerReason:i===7?'Old PM failure':'',completionTime:'2026-11-17T10:56:00Z'}));
 return {manifest,tasks};
}
test('recovery updates existing eight rows and closes parent last without changing other work',()=>{
 const {manifest,tasks}=fixture();
 tasks.push({...tasks[7],taskId:'manual',executionMode:'manual'});
 tasks.push({...tasks[7],taskId:'other-run',parentTaskId:'other'});
 const original=JSON.stringify(tasks);
 const updates=recoveredDashboardUpdates(tasks,manifest,'https://example.com/report');
 assert.equal(updates.length,8);
 assert.equal(updates.at(-1).taskId,'parent');
 assert.ok(updates.every(row=>row.status==='Completed'&&!row.blockerReason&&row.completionTime===manifest.finishedAt));
 assert.equal(updates.find(row=>row.employeeId==='project-manager').resultLink,'https://example.com/report');
 assert.equal(JSON.stringify(tasks),original);
 assert.deepEqual(recoveredDashboardUpdates(updates,manifest,'https://example.com/report'),[]);
});
test('incomplete dry or invalid outcomes cannot mark dashboard tasks complete',()=>{
 for(const mutate of [m=>m.finalStatus='incomplete',m=>m.dryRun=true,m=>m.agents.pop(),m=>m.agents[7].status='failed',m=>m.agents[0].validation.valid=false]) {
  const {manifest,tasks}=fixture();mutate(manifest);
  assert.deepEqual(recoveredDashboardUpdates(tasks,manifest,'link'),[]);
 }
});
