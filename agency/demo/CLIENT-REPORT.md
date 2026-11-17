# Customer report generation

If a complete PM draft fails the management output contract, the direct executor
may make one additional model request with the draft and exact validation errors.
The repaired draft must pass the same checks before atomic publication. Both
requests share one timeout budget and token usage is combined. Billing/provider,
timeout, truncated-response and non-PM failures do not trigger this repair.

The Project Manager creates an internal management assessment with execution
metadata for the boss and audit trail. The customer DOCX uses an allowlisted
projection containing only the executive summary, review scope, client-provided
information, evidence requests, points to confirm, findings, recommendations,
action plan and limitations. Internal workflow sections are not exported.

Source paths for known specialist documents become readable evidence titles.
Remaining internal paths, execution states and internal intake IDs in customer
sections fail validation rather than being silently removed from findings.
Readiness/completeness percentages require a source and numeric basis in the
same paragraph. This is a structural guard, not independent factual verification.
The prompt also requires source-grounded metrics, priorities, proposed owners,
timeframes and closure evidence, and warns against unsupported feasibility claims.

DOCX uses A4 pages, clear section headings, paragraph spacing, shaded repeating
table headers and rows that stay together across pages. Visual review in Word
or LibreOffice remains required for real generated reports.

Deploy feature/client-report-quality on agent-worker. The public dashboard can
stay on its current UI branch. Future completed runs produce the new customer
attachment. Existing delivered files are not changed or resent automatically.
Normal output hashing, manifest validation and delivery deduplication remain.

Tests use temporary synthetic fixtures and mocked providers; no live emails or
model calls are required. Run: node --test agency/demo/test/*.test.mjs
agency/orchestrator/test/ollama-direct.test.mjs
agency/integrations/reporting/test/cloud-email-delivery.test.mjs
