import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repairStructuredIntake } from '../intake-poller.mjs';
test('recovers source statements once without claiming verification or inventing locations', () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-repair-'));
 try {
 fs.mkdirSync(path.join(root,'client-input'));
 fs.writeFileSync(path.join(root,'client-input/gmail-intake.json'),JSON.stringify({bodyText:'FICTIONAL synthetic test evidence\nScope: customer portal, staff devices, cloud infrastructure\nSize: 35 employees; one office; remote workers'}));
 const brief={sources:['client-input/gmail-intake.json'],systems:[],locations:[]};
 assert.equal(repairStructuredIntake(root,brief),true);
 assert.match(brief.systems[0],/Unverified client statement/);
 assert.match(brief.locations[0],/one office; remote workers/);
 assert.equal(repairStructuredIntake(root,brief),false);
 const empty={sources:[],systems:[],locations:[]};
 assert.equal(repairStructuredIntake(root,empty),false);
 fs.writeFileSync(path.join(root,'client-input/gmail-intake.json'),JSON.stringify({bodyText:'Please confirm the organization details, systems, operating locations,\nSystems in scope: unspecified'}));
 const requested={sources:['client-input/gmail-intake.json'],systems:[],locations:['Unverified client statement (client-input/gmail-intake.json): Please confirm the organization details, systems, operating locations,']};
 assert.equal(repairStructuredIntake(root,requested),true);
 assert.deepEqual(requested.locations,[]);
 assert.deepEqual(requested.systems,[]);
 assert.equal(repairStructuredIntake(root,requested),false);
 fs.writeFileSync(path.join(root,'client-input/gmail-intake.json'),JSON.stringify({bodyText:'Please prepare a readiness plan.'}));
 const absent={sources:['client-input/gmail-intake.json'],systems:[],locations:[]};
 assert.equal(repairStructuredIntake(root,absent),false);
 assert.deepEqual(absent.locations,[]);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
