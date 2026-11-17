import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManagementReport,MANAGEMENT_SECTIONS,FINDING_FIELDS,managementOutputTemplate,withExecutionSnapshot} from '../management-report-contract.mjs';
test('host snapshot preserves failed states and prose while replacing model status claims',()=>{
 const draft='# Report\n\n## Executive summary\nEvidence remains limited.\n\n## Execution status\nEveryone completed.\n\n## Recommendations\nCollect missing evidence.\n';
 const workflow=[{employeeId:'evidence-specialist',status:'failed',blocker:'Missing input | requires review'}, {employeeId:'project-manager',status:'not-run'}];
 const report=withExecutionSnapshot(draft,workflow);
 assert.ok(report.includes('Evidence remains limited.'));
 assert.ok(report.includes('Collect missing evidence.'));
 assert.ok(!report.includes('Everyone completed.'));
 assert.ok(report.includes('| evidence-specialist | failed | Missing input   requires review |'));
 assert.ok(report.includes('| project-manager | not-run |'));
 assert.equal(report.match(/^## Execution status$/gm).length,1);
 assert.equal(withExecutionSnapshot(report,workflow),report);
});
const sections=MANAGEMENT_SECTIONS.map(t=>'## '+t+'\nSource-supported summary.').join('\n');
test('generic agent logs cannot pass as a management report',()=>{
 assert.equal(validateManagementReport('## Established facts\nFiles exist.\n## Recommendations\nCollect evidence.').valid,false);
});
test('each finding must explain impact rationale status and closure evidence',()=>{
 const fields=['Evidence and confidence','Issue','Potential business impact','Recommended action','Rationale','Suggested owner','Suggested target','Remediation status','Closure evidence'];
 const finding='\n### Finding 1 Access review evidence unavailable\n'+fields.map(t=>t+': Source supported proposed work.').join('\n');
 assert.equal(validateManagementReport(sections+finding).valid,true);
 for(const field of fields) assert.equal(validateManagementReport(sections+finding.replace(field+': Source supported proposed work.','')).valid,false,field);
});
test('evidence limited no findings report must be explicit',()=>{
 assert.equal(validateManagementReport(sections).valid,false);
 assert.equal(validateManagementReport(sections+'\nNo material issues can be established from the supplied evidence.').valid,true);
});

for (const style of [field => field+': Content.', field => '**'+field+':** Content.', field => '**'+field+'**: Content.', field => '- **'+field+':** Content.'])
 test('complete findings accept equivalent Markdown labels: '+style('Issue'),()=>{
  const finding='\n### Finding 1 Reported access weakness\n'+FINDING_FIELDS.map(style).join('\n');
  assert.equal(validateManagementReport(sections+finding).valid,true);
 });

test('empty finding labels cannot borrow text from following lines',()=>{
 const finding='\n### Finding 1 Issue\n'+FINDING_FIELDS.map(field=>field==='Issue'?'**Issue:**\n':field+': Content.').join('\n');
 const result=validateManagementReport(sections+finding);
 assert.equal(result.valid,false);
 assert.ok(result.errors.includes('finding 1 lacks Issue'));
});

test('report prompt template contains all required headings and finding labels',()=>{
 const template=managementOutputTemplate();
 for(const title of MANAGEMENT_SECTIONS) assert.ok(template.includes('## '+title));
 for(const field of FINDING_FIELDS) assert.ok(template.includes(field+':'));
 assert.match(template,/Execution status/);
});
