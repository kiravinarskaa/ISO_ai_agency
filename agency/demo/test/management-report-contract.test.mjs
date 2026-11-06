import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManagementReport,MANAGEMENT_SECTIONS} from '../management-report-contract.mjs';
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
