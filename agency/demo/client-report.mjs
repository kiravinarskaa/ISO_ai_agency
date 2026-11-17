/** Customer projection; the internal management report stays intact. */
const headings = new Map([
 ['Executive summary','Executive summary'], ['Scope and evidence basis','Scope of this review'],
 ['Established facts','Information provided by you'], ['Missing evidence','Information we still need'],
 ['Assumptions','Points to confirm'], ['Findings and business impact','Findings and business impact'],
 ['Recommendations','Recommended next steps'], ['Remediation roadmap','Prioritised action plan'],
 ['Metrics and limitations','Assessment limitations'],
]);
const sources = {'client-brief.json':'client intake summary','isms-readiness-plan.md':'readiness roadmap','evidence-register.md':'evidence checklist','technical-controls-assessment.md':'technical controls review','awareness-training-plan.md':'awareness plan','corrective-action-register.md':'corrective action register','readiness-dashboard.md':'readiness metrics','final-agency-report.md':'consolidated assessment'};
export function clientReportMarkdown(text) {
 const sections = [];
 for (const section of text.split(/(?=^##\s+)/m)) {
  const match = section.match(/^##\s+([^\r\n]+)\r?\n/);
  if (!match || !headings.has(match[1].trim())) continue;
  let body = section.slice(match[0].length).trim();
  for (const [file,label] of Object.entries(sources)) body = body.replaceAll('working/'+file,label);
  for (const paragraph of body.split(/\n\s*\n/)) {
   if (/(?:readiness|completeness|evidence coverage)[^\n]{0,100}\d+(?:\.\d+)?\s*%/i.test(paragraph) &&
       (!/\bsource\b/i.test(paragraph) || !/\d+\s*(?:\/|out of)\s*\d+/i.test(paragraph)))
     throw new Error('CLIENT_REPORT_UNSUPPORTED_METRIC');
  }
  if (/reused[-‑]validated|artifact validation|\bnot[-‑]run\b|\b(?:working|client-input|logs)\/|INTAKE-[a-f0-9]{8,}/i.test(body)) throw new Error('CLIENT_REPORT_INTERNAL_DETAILS');
  sections.push('## '+headings.get(match[1].trim())+'\n\n'+body);
 }
 if (!sections.some(s=>s.startsWith('## Executive summary')) || !sections.some(s=>s.startsWith('## Recommended next steps'))) throw new Error('CLIENT_REPORT_INCOMPLETE');
 return sections.join('\n\n')+'\n';
}
export const CLIENT_REPORT_INSTRUCTION = `The management report also supplies the customer document. Keep client-relevant sections free of workflow states, employee IDs, routine names, internal project IDs, file paths and diagnostics. Put these ONLY in Employee contributions and Execution status. In Scope and evidence basis use the company name, not internal project ID. Cite human-readable evidence titles, not filesystem paths. Present reported gaps, business impacts and prioritised actions. Missing evidence does not prove a control is absent or that no issues exist. In Remediation roadmap provide a compact table with priority, action, proposed owner, proposed timeframe and completion evidence. Do not invent readiness percentages, evidence completeness scores, risk scores or timeline feasibility claims. Numerical assessment metrics require a source, numerator, denominator and calculation; otherwise say not measured. Unconfirmed device ownership, legal applicability and evidence-delivery dates are questions to confirm, not working assumptions. Use one brief preliminary-readiness limitation, then practical, client-specific analysis. Assessment work is not implementation of customer controls.`;
