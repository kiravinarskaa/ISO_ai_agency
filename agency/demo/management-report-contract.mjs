/** Employer-facing Project Manager report contract. No assessment facts are synthesized here. */
export const MANAGEMENT_SECTIONS = ['Executive summary','Scope and evidence basis','Findings and business impact','Work completed and remediation status','Recommendations','Remediation roadmap','Metrics and limitations','Employee contributions'];
export function validateManagementReport(text) {
 const errors=[];
 for(const title of MANAGEMENT_SECTIONS) if(!new RegExp('^## '+title+'\\s*$','im').test(text)) errors.push('missing management section: '+title);
 const findings=text.split(/^### Finding\s+[^\n]+/im).slice(1);
 if(!findings.length && !/no material issues can be established from the supplied evidence/i.test(text)) errors.push('provide numbered findings or an explicit evidence-based no-findings statement');
 const fields=['Evidence and confidence','Issue','Potential business impact','Recommended action','Rationale','Suggested owner','Suggested target','Remediation status','Closure evidence'];
 for(let i=0;i<findings.length;i++) {
 const block=findings[i].split(/^## /m)[0];
 for(const field of fields) if(!new RegExp('^\\*{0,2}'+field+'\\*{0,2}:\\s*\\S','im').test(block)) errors.push('finding '+(i+1)+' lacks '+field);
 }
 return {valid:errors.length===0,errors};
}
export const MANAGEMENT_INSTRUCTION = `Use exactly these level-two headings in the final report: ${MANAGEMENT_SECTIONS.join('; ')}. Also retain Established facts, Missing evidence, Assumptions and Execution status. Under Findings and business impact, write each material issue as a level-three heading starting Finding followed by a number and descriptive title. Each finding must have non-empty labeled lines: Evidence and confidence:; Issue:; Potential business impact:; Recommended action:; Rationale:; Suggested owner:; Suggested target:; Remediation status:; Closure evidence:. Cite the source artifact for each issue. Owners and relative targets are proposals requiring management approval. If no issue can be supported, state No material issues can be established from the supplied evidence and explain what evidence is needed. Do not use this statement to omit issues explicitly reported in source evidence. Work completed means assessment activities actually evidenced; never describe recommendations as implemented fixes. Include all eight employee contributions with deliverables and decisions for management. No raw email, credentials or logs in the report. Use one clear evidence limitation up front and concise confidence labels throughout.`;
