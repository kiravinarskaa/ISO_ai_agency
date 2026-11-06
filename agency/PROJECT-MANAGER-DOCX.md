# Project Manager Word report architecture

Updated 6 November 2026.

Updated 6 November 2026.

The Project Manager authors the consolidated conclusions and recommendations in `working/final-agency-report.md`. The deterministic Node.js completion stage in `agency/demo/final-report-docx.mjs` packages that synthesis, current execution statuses, and compact source references as `working/final-agency-report.docx`. This is part of the Project Manager delivery stage; no second model or external service is used.

The exporter reads only the eight fixed working artifacts. Client intake inclusion is restricted to assessment fields and excludes raw email and contact metadata. Source material remains unverified; fictional and synthetic labels are preserved. The DOCX uses a macro-free OOXML package with no external relationships. Existing dashboard columns and link-free completion email are unchanged; the Word report remains local and is not attached or published automatically.

After all employee outputs validate, the runner always regenerates the Word report, including on artifact-reuse runs. It records its path, SHA256, byte count and input hashes under `manifest.finalReportDocx`. Export failure sets the run incomplete, preventing final completion publication. Dry runs do not generate a Word report. Existing completed runs require a runner invocation to obtain the new deliverable; the launcher may skip already-completed workflows.

Validation has two distinct levels: source and package checks are automatic; visual layout review is pending until a Word-compatible renderer is available. A successful workflow does not claim visual approval or ISO conformity. The model-owned Markdown remains the canonical synthesis. The Word report body uses the Project Manager synthesis, not a concatenation of raw employee documents. Historical source inconsistencies still require human review.

Run from D:\AgentOps:

```powershell
node agency/demo/run-demo.mjs --project <project-id>
```

No credentials, grants, accounts or paid services are added. Review the local DOCX in Word before external delivery. No outgoing email attachment or dashboard schema changes are authorized by this feature.


## Management report contract

New Project Manager executions must produce an executive summary, scope and evidence basis, findings and business impact, work completed and remediation status, recommendations, remediation roadmap, metrics and limitations, and all eight employee contributions. Each numbered finding requires evidence and confidence, issue, business impact, recommended action, rationale, suggested owner and target, remediation status and closure evidence. Suggested assignments and relative deadlines require management approval. The runner rejects missing sections and incomplete findings before marking the Project Manager complete. Contract: `agency/demo/management-report-contract.mjs`.

The Word export now presents the Project Manager synthesis as the report body, followed by compact source references. It does not append all raw employee documents or raw client JSON. Markdown tables become native Word tables with visible borders and repeating header rows. The current manifest provides the delivery status separately from historical execution snapshots in the synthesis. All source hashes remain recorded in the export metadata.

Existing validated reports remain historical deliverables and can still be reused for recovery. They are not silently rewritten or represented as passing the new management-writing contract. New assessment executions receive the updated contract automatically. Visual layout review remains required before external delivery; the local renderer is unavailable on this host.
