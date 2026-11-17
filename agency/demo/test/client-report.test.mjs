import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clientReportMarkdown } from '../client-report.mjs';
import { buildFinalDocx } from '../final-report-docx.mjs';
const report = `# Internal report
## Executive summary
Northvale needs a documented access review. Source: working/technical-controls-assessment.md.
## Recommendations
Assign a proposed review owner; collect approval records.
## Remediation roadmap
| Priority | Action | Proposed owner | Proposed timeframe | Closure evidence |
| --- | --- | --- | --- | --- |
| High | Access review | IT lead | Two weeks | Approved access list |
## Employee contributions
client-manager reused-validated working/client-brief.json
## Execution status
project-manager not-run
`;
test('client projection preserves useful analysis and removes internal sections', () => {
 const client = clientReportMarkdown(report);
 assert.match(client, /documented access review/);
 assert.match(client, /technical controls review/);
 assert.match(client, /Prioritised action plan/);
 assert.doesNotMatch(client, /working\/|not-run|reused-validated|Execution status|Employee contributions/);
 assert.match(report, /project-manager not-run/);
 assert.throws(()=>clientReportMarkdown(report.replace('documented access review','artifact validation passed')), /INTERNAL_DETAILS/);
 assert.throws(()=>clientReportMarkdown(report.replace('documented access review','evidence completeness 30%')), /UNSUPPORTED_METRIC/);
});
test('DOCX contains customer sections and formatting without diagnostics', () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(),'client-docx-'));
 try {
  fs.mkdirSync(path.join(root,'working'));
  for (const file of ['client-brief.json','isms-readiness-plan.md','evidence-register.md','technical-controls-assessment.md','awareness-training-plan.md','corrective-action-register.md','readiness-dashboard.md']) fs.writeFileSync(path.join(root,'working',file), file.endsWith('.json') ? '{}' : 'Specialist evidence');
  fs.writeFileSync(path.join(root,'working/final-agency-report.md'),report);
  const result = buildFinalDocx(root,{ projectId:'INTERNAL-ID',runId:'INTERNAL-RUN',finishedAt:'2026-11-17T15:00:00Z',agents:[{employeeId:'project-manager',status:'completed'}] });
  const xml = fs.readFileSync(result.path).toString('utf8');
  assert.match(xml,/Northvale needs a documented access review/);
  assert.match(xml,/<w:tblHeader\/>/);
  assert.match(xml,/<w:cantSplit\/>/);
  assert.doesNotMatch(xml,/INTERNAL-ID|INTERNAL-RUN|Workflow results|Employee contributions|working\/|not-run/);
 } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
