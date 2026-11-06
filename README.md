# ISO IEC 27001 2022 Readiness Assessment AI Agency

Documentation updated 6 November 2026.

This educational prototype coordinates eight AI employees to organize a customer request, review supplied information and evidence, recommend improvements, and prepare a management report. It supports readiness preparation; it does not conduct an accredited certification audit, certify an organization, or establish compliance.

## Purpose and current implementation

AI employees use Codex CLI to interpret project files and write deliverables. Node.js ES modules control intake, sequencing, dependencies, guards, validation, recovery, Google Sheets publication and email delivery. The agency runtime remains Node.js. The local Windows PC and foreground launcher must stay running and connected; automatic startup and cloud execution are not established features.

## Eight employees

| Employee | Output in the project working folder |
|---|---|
| Client Manager | `client-brief.json` |
| ISMS Readiness Planner | `isms-readiness-plan.md` |
| Evidence Specialist | `evidence-register.md` |
| Technical Controls Specialist | `technical-controls-assessment.md` |
| Security Awareness Specialist | `awareness-training-plan.md` |
| Corrective Actions Specialist | `corrective-action-register.md` |
| Metrics Specialist | `readiness-dashboard.md` |
| Project Manager | `final-agency-report.md`, packaged as `final-agency-report.docx` |

The existing directory names remain `requirements-evidence-specialist`, `technical-controls-analyst`, `corrective-action-specialist` and `readiness-metrics-analyst`. The authoritative eight-role roster is in `agency/demo/run-demo.mjs`. The separate orchestrator registry enables Client Manager intake only; its disabled specialist entries do not disable the eight-role runner.

## Workflow

Customer email -> Gmail screening and deduplication -> staged `INTAKE-*` project -> Client Manager classification and sufficiency checks -> Planner -> Evidence -> Technical Controls -> Awareness -> Corrective Actions -> Metrics -> Project Manager -> output validation and local Word export -> policy-authorized Sheets reporting and email.

Specialists currently execute sequentially. Files are explicit handoffs, not shared hidden model conversations. Technical Controls and Awareness use the brief and plan; Corrective Actions and Metrics require wider specialist inputs. Project Manager may write a blocker report when optional inputs are absent, but a complete run still requires all eight employee outputs to validate and the DOCX export to succeed.

Anyone can submit an inquiry without a sender allowlist. Suspicious classifications remain held for review. Adequate information does not override a security hold or verify customer identity. Missing information stops dependent work. Intake recovery can populate omitted arrays from explicit source statements; requests to supply information are not themselves evidence. Attachments are recorded as metadata, not automatically downloaded or executed. Authorized operators supply additional project evidence under `client-input`.

Daily public intake and public execution caps are currently disabled at the operator's request. Message deduplication, one-at-a-time execution, project locks, employee budgets and guards, bounded retries, and customer-message limits remain active. The former temporary demo allowance has been removed. Previously held messages do not automatically re-enter the queue.

## Run locally

Use the existing Node.js and Codex CLI installation and authorized accounts. Preserve existing credentials, configuration and installation receipts.

```powershell
cd D:\AgentOps
node agency/integrations/gmail/gmail.mjs check-config
node agency/integrations/gmail/gmail.mjs verify
node agency/integrations/reporting/reporting.mjs check-config
node agency/start-agency.mjs
```

Keep one launcher open. Initial mailbox polling baselines existing inbox IDs; send a fresh request after monitoring starts. Ctrl+C requests graceful shutdown. The terminal hides idle polling, repeated unchanged intake messages and historical incomplete-request notices, while showing new activity, progress and failures. Console times use Asia/Tashkent; persisted timestamps generally use UTC.

To inspect or execute an existing local project without directly sending email or publishing:

```powershell
node agency/demo/run-demo.mjs --project <project-id> --dry-run
node agency/demo/run-demo.mjs --project <project-id>
```

Replace placeholders with an existing project ID. A dry run does not execute employees or establish live completion. A real run can reuse unchanged validated artifacts. See [runner documentation](agency/demo/README.md).

## Reports and integrations

The Project Manager writes an employer-facing synthesis: executive summary, findings, evidence and confidence, potential business impact, recommended action and rationale, proposed owner and target, remediation status, closure criteria, roadmap, metrics limitations and employee contributions. Proposed fixes are not described as implemented. Automated structural validation does not establish factual accuracy, control effectiveness or visual layout approval. Review the Word report before external delivery.

The Sheets ledger publishes exactly eight allowlisted columns: `run_id`, `project_id`, `employee_id`, `routine`, `execution_status`, `artifact_basename`, `validation_status`, `timestamp`. Rows are upserted by run and employee. Different run IDs preserve different attempts; they are not necessarily duplicate processing. This execution ledger is not the full course Boss Command Center.

Automatic progress, final publication and internal completion email require an operator-created policy bound to the configured spreadsheet and recipient. Internal completion messages contain statuses, no report body and no dashboard link. The current internal template labels delivery as a fictional test; it is not a production customer-report template.

Customer acknowledgment, clarification and completion notices require a customer-contact policy and authenticated original-message/thread provenance. Customer sending can explicitly reuse the existing Gmail send grant with `--sending-grant send`; read-only intake remains separate. Customer bodies contain no internal project reference, links, raw report or attachment. Completion notices arrange report review and delivery rather than delivering the DOCX itself. See [customer responses](agency/CUSTOMER-RESPONSES.md) and [reporting](agency/integrations/reporting/README.md).

## State and recovery

Projects retain source inputs, working artifacts, employee runtime state and per-run manifests. Hash checks enable safe reuse. Preflight checks verify restricted workspace write/readback and record safe process diagnostics on failure.

A newer completed local recovery manifest can resume automatic reporting after exhausted agent-validation retries. The launcher preserves recovery history and reporting authorization, and does not blindly replay uncertain or sent delivery. Operator revision recovery is separate from normal retries and preserves spent employee budgets. See the runner documentation before using it; do not delete leases or reset state to force a success.

## Verification and limitations

During the 6 November 2026 session, a recovered assessment completed with all eight outputs validated and a local DOCX generated. Sheets publication, internal completion-email receipt and a customer acknowledgment were demonstrated. A complete customer clarification exchange and customer completion notice are not both confirmed by the available evidence. Fresh runs can still fail preflight, validation or guard checks. Individual test suites passed at their implementation stages; no single aggregate current test count is asserted here.

Synthetic evidence must remain identified as synthetic. Missing evidence is not proof a control is absent. No verified readiness score should be assigned without a supported measurement basis.

The course additionally requires a publicly hosted authenticated Boss dashboard, task assignment, task filters, employee cards, saved data-grounded chat, the prescribed task-ledger schema, daily/weekly reports and export, daily email evidence on three different days, and submission artifacts. These requirements are not established as completed by this local pipeline. Lecturer approval status must be confirmed separately.

## Documentation and publication

- [Architecture](ARCHITECTURE.md)
- [Security](SECURITY.md)
- [Code guide](CODE_GUIDE.md)
- [Word report contract](agency/PROJECT-MANAGER-DOCX.md)

The implementation adapts the [ai-employees template](https://github.com/markfulton/ai-employees). Preserve upstream license notices and confirm license/attribution files before redistribution. This workspace was not initialized as a Git repository at the documentation review. Existing ignore rules are not a publication security audit: review policies, generated reports, configuration and the exact upload set before publishing. Do not commit credentials, authorization tokens, customer inputs or local authorization records.
