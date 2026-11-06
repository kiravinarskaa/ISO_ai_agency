# Agency architecture

Updated 6 November 2026. Active source code is authoritative where older notes describe a previous stage.

## Components

| Layer | Implementation | Responsibility |
|---|---|---|
| Entry point | `agency/start-agency.mjs` | Polling, intake reconciliation, dispatch, progress and reporting recovery |
| Gmail intake | `agency/integrations/gmail/intake-poller.mjs` | Screening, deduplication, source staging, sender checks and reply routing |
| Intake worker | `agency/orchestrator/orchestrator.mjs` | File-backed Client Manager tasks, bounded retries, restricted execution and brief validation |
| Eight-role runner | `agency/demo/run-demo.mjs` | Sequential specialist dispatch, dependency checks, artifact reuse and manifests |
| Employee workspaces | Eight role directories | Instructions, routines, guards, leases and logging infrastructure |
| Reporting bridge | `agency/integrations/reporting/reporting.mjs` | Allowlisted Sheets records and policy-authorized internal/customer mail |
| Management report | `agency/demo/management-report-contract.mjs`, `final-report-docx.mjs` | Required PM report content and local OOXML packaging |
| Project storage | `agency/projects/<project-id>/` | Source files, working artifacts, runtime state and history |

## End-to-end flow

1. The launcher polls the configured Gmail mailbox. Initial polling establishes a baseline. New messages pass screening and duplicate checks.
2. Relevant requests are isolated in staged `INTAKE-*` folders. The Client Manager extracts and classifies the request, preserving source attribution and uncertainty.
3. Reconciliation checks required context and the current security classification. Explicit supplied statements may repair omitted structured fields; clarification requests do not count as supplied facts. Public customer identity remains unverified.
4. Eligible work runs Client Manager -> Planner -> Evidence -> Technical Controls -> Awareness -> Corrective Actions -> Metrics -> Project Manager. Execution is sequential, but data dependencies follow the explicit roster input lists rather than every arrow in that sequence.
5. Node.js validates outputs and records statuses, hashes and dependency fingerprints. Successful unchanged artifacts can be reused. Each actual employee launch requires installation, guard and restricted-write preflight checks.
6. The PM authors a management report. Node.js packages the synthesis and compact source references into DOCX. Export failure keeps final completion incomplete; visual review is separately pending until actually performed.
7. Under configured standing authorization, progress and final records are upserted to Sheets and an internal completion email is sent. Customer notices additionally require a customer-contact policy and original sender/thread authentication.

AI interpretation happens through Codex CLI. Operational authorization, sequencing, validation and integration calls are deterministic JavaScript. A guard script is not an AI employee. Employees exchange local files, not one shared conversation.

## Storage and boundaries

`client-input` contains supplied sources. `working` holds the brief, specialist reports, Markdown synthesis and Word export. `logs/demo-runs/<run-id>/manifest.json` records each attempt. `.employee-runtime` holds project-scoped employee claims and budgets. Integration and workflow state reside outside employee-owned report artifacts.

The runner uses `codex exec --sandbox workspace-write`, an employee working directory and the selected project as an additional write directory. This constrains writes; it is not proof of complete read isolation from every other file accessible to the same OS account. Credentials must remain protected by host permissions and kept out of prompts.

Public daily intake/execution quotas are disabled. Sequential dispatch, locks, duplicate checks, retry limits, employee period/budget guards and customer-message caps remain. An optional synthetic sender lane exists separately; ordinary public intake does not require that allowlist.

## Recovery

Failed prerequisites can block downstream employees. Current Project Manager inputs include optional specialist paths, so it can produce a blocker report; this does not make an incomplete overall run successful. Reuse checks compare source and output hashes. A PM report may be reused across successful-status label changes when its sources are unchanged, retaining its historical execution context.

For a completed employee whose evidence changed, the operator revision recovery helper verifies changed upstream hashes and a prior unchanged validated output, archives the original claim, and preserves budget consumption before reopening partial work. It is bounded to the helper's supported roles and revision count. Never use it while project work is active.

The launcher recognizes a newer completed local recovery after an exhausted `AGENT_VALIDATION_INCOMPLETE` workflow and resumes reporting with preserved recovery history. It does not automatically override security holds, ambiguous sends or already-sent delivery. Final publication still passes the reporting bridge's independent checks.

## Reporting and communication

Sheets uses eight execution columns and `(run_id, employee_id)` keys. Different attempts retain separate rows. Publishing minimal metadata does not publish the underlying reports. Markdown filenames in a sheet are not evidence of accessible hosted download URLs.

Internal completion emails carry statuses without links or report bodies. Their current template is explicitly test-labeled. Customer replies are fixed plain text, omit internal references, and stay in the authenticated original thread. Acknowledgments follow intake classification, not instant message arrival. Clarification is bounded to two messages per project; acknowledgment and completion use separate dedupe ledgers. The customer policy may explicitly choose the existing Gmail send grant; there is no silent credential fallback.

## Deployment and demonstrated scope

The current runtime is local Windows Node.js with file-backed state, Codex CLI and Google APIs. The PC must be awake and the launcher running. It is not a deployed cloud service or a complete publicly hosted Boss dashboard. n8n is optional and not required by the launcher.

A recovered eight-output completion, Word generation, Sheets integration, internal completion receipt and customer acknowledgment were demonstrated. End-to-end customer clarification and final customer notice remain unconfirmed together. Tests validate selected behaviors, not ISO conformity or production readiness.

The course's online Boss login, task assignment, saved employee chat, task-ledger fields, daily/weekly reporting and report export remain separate implementation/submission requirements. See [README](README.md) and [security](SECURITY.md).
