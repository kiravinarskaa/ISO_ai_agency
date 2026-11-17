/** Employer-facing Project Manager report contract. No assessment facts are synthesized here. */
export const MANAGEMENT_SECTIONS = ['Executive summary','Scope and evidence basis','Findings and business impact','Work completed and remediation status','Recommendations','Remediation roadmap','Metrics and limitations','Employee contributions'];
export const FINDING_FIELDS = ['Evidence and confidence','Issue','Potential business impact','Recommended action','Rationale','Suggested owner','Suggested target','Remediation status','Closure evidence'];
/** Execution metadata is observed by the host, not inferred by the model. */
export function withExecutionSnapshot(text, workflow) {
 const cell = value => String(value ?? '').replace(/[\r\n|]/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
 const body = text.split(/(?=^##[ \t]+)/m)
  .filter(section => !/^##[ \t]+Execution status[ \t]*\r?$/im.test(section.split('\n')[0]))
  .join('').trimEnd();
 const table = ['## Execution status',
  'Host-recorded snapshot before Project Manager generation. These are workflow execution states, not customer control effectiveness or the final delivery status.',
  '| Employee ID | Observed status | Recorded blocker |', '| --- | --- | --- |',
  ...workflow.map(row => `| ${cell(row.employeeId)} | ${cell(row.status)} | ${cell(row.blocker || 'None recorded')} |`)];
 return body + '\n\n' + table.join('\n') + '\n';
}
export function validateManagementReport(text) {
 const errors=[];
 for(const title of MANAGEMENT_SECTIONS) if(!new RegExp('^## '+title+'\\s*$','im').test(text)) errors.push('missing management section: '+title);
 const findings=text.split(/^### Finding\s+[^\n]+/im).slice(1);
 if(!findings.length && !/no material issues can be established from the supplied evidence/i.test(text)) errors.push('provide numbered findings or an explicit evidence-based no-findings statement');
 const fields=FINDING_FIELDS;
 for(let i=0;i<findings.length;i++) {
 const block=findings[i].split(/^## /m)[0];
 for(const field of fields) {
   // Common Markdown puts the colon either inside or outside the bold label.
   // Check line-by-line so an empty label cannot borrow the next line's text.
   const pattern = new RegExp('^[ \\t]*(?:[-*][ \\t]+)?(?:\\*\\*'+field+':\\*\\*|\\*\\*'+field+'\\*\\*:|'+field+':)[ \\t]*(.*)$','i');
   const present = block.split(/\r?\n/).some(line => {
     const match = line.match(pattern);
     return match && match[1].replace(/\*|`|_/g,'').trim().length > 0;
   });
   if(!present) errors.push('finding '+(i+1)+' lacks '+field);
 }
 }
 return {valid:errors.length===0,errors};
}
export function managementOutputTemplate() {
 return [
  'Required report layout follows. Retain every heading exactly. Replace all <...> placeholders with source-grounded analysis; never copy placeholders into the finished report.',
  '# ISO/IEC 27001 readiness preparation report',
  ...['Executive summary','Scope and evidence basis','Established facts','Missing evidence','Assumptions'].flatMap(title => ['## '+title,'<Concise source-grounded content; state limitations where evidence is absent.>']),
  '## Findings and business impact',
  '### Finding 1 <Descriptive issue title>',
  ...FINDING_FIELDS.map(field => field+': <Nonempty source-grounded explanation; proposed owners/targets are recommendations.>'),
  '<Repeat the complete nine-field finding block for each additional supported issue. If no issue is supported, replace the finding blocks with the explicit no-findings statement from the task, with evidence limitations. Do not omit client-reported weaknesses.>',
  ...['Work completed and remediation status','Recommendations','Remediation roadmap','Metrics and limitations','Employee contributions','Execution status'].flatMap(title => ['## '+title,'<Source-grounded content required by the task. Execution status must cover every supplied employee ID and observed status.>']),
  'Self-check before returning: every required level-two heading exists; each finding includes all nine nonempty labeled lines; recommendations are not described as implemented changes; every supplied execution-status row is included.',
 ].join('\n\n');
}
export const MANAGEMENT_INSTRUCTION = `Use exactly these level-two headings in the final report: ${MANAGEMENT_SECTIONS.join('; ')}. Also retain Established facts, Missing evidence, Assumptions and Execution status. Under Findings and business impact, write each material issue as a level-three heading starting Finding followed by a number and descriptive title. Each finding must have non-empty labeled lines: Evidence and confidence:; Issue:; Potential business impact:; Recommended action:; Rationale:; Suggested owner:; Suggested target:; Remediation status:; Closure evidence:. Cite the source artifact for each issue. Owners and relative targets are proposals requiring management approval. If no issue can be supported, state No material issues can be established from the supplied evidence and explain what evidence is needed. Do not use this statement to omit issues explicitly reported in source evidence. Work completed means assessment activities actually evidenced; never describe recommendations as implemented fixes. Include all eight employee contributions with deliverables and decisions for management. No raw email, credentials or logs in the report. Use one clear evidence limitation up front and concise confidence labels throughout.`;
