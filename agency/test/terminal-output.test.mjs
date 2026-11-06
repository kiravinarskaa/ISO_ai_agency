import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerminalFilter} from '../start-agency.mjs';
test('terminal suppresses idle polls and unchanged intake while retaining changes errors and progress',()=>{
const show=createTerminalFilter();
assert.equal(show('Monitoring resumed.'),false);
assert.equal(show('Gmail monitoring: check complete; 0 new inquiry tasks.'),false);
const row='Client intake reconciled: INTAKE-demo; status onboarding_incomplete.';
assert.equal(show(row),false);assert.equal(show(row),false);
assert.equal(show(row.replace('onboarding_incomplete','preliminary_ready')),false);
const decision='Preliminary readiness decision: onboarding_incomplete; project INTAKE-demo; reason INTAKE_DATA_INCOMPLETE.';
assert.equal(show(decision),true); assert.equal(show(decision),false);
assert.equal(show(decision.replace('onboarding_incomplete','preliminary_ready')),true);
for(const msg of ['Employee STARTED: planner','Employee FAILED: planner','Final report completed','Startup failed']) {assert.equal(show(msg),true);assert.equal(show(msg),true);}
});
test('historical incomplete requests stay quiet until their status changes',()=>{
const show=createTerminalFilter(['INTAKE-old']);
assert.equal(show('Preliminary readiness decision: onboarding_incomplete; project INTAKE-old; reason INTAKE_DATA_INCOMPLETE.'),false);
assert.equal(show('Preliminary readiness decision: onboarding_incomplete; project INTAKE-new; reason INTAKE_DATA_INCOMPLETE.'),true);
assert.equal(show('Preliminary readiness decision: preliminary_ready; project INTAKE-old;'),true);
});
