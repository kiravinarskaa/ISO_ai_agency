<<<<<<< HEAD
# ISO IEC 27001 2022 Readiness Assessment AI Agency

Documentation updated 6 November 2026.

Worker update, 16 November 2026: remote Ollama now defaults to a direct,
text-only API executor. Node.js supplies bounded source contents, validates
responses and saves each owned artifact; it does not launch Codex or require
Linux namespaces for this mode. All eight roles share the existing sequencing
and output checks. See [Ollama Cloud setup](CLOUD-WORKER.md#ollama-cloud-direct-execution).
The older CLI descriptions below apply to the retained Codex execution mode.

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
=======
# ISO/IEC 27001 Readiness Assessment AI Agency

Documentation reconciled with the workspace source on 18 November 2026. Start with [Architecture and workflow](ARCHITECTURE.md) for the full system map.

This educational prototype organizes supplied information and prepares readiness-planning materials. It does not conduct an accredited certification audit, certify an organization, or establish compliance. Customer statements and synthetic evidence remain unverified unless independently supported.

## Current architecture

The repository has a shared Node.js eight-role runner with two operating paths:

- **Local:** a foreground Windows launcher polls Gmail, stages and classifies eligible messages, runs guarded workflow stages, and coordinates policy-authorized reporting. Local projects and workflow state are stored in files.
- **Railway:** a public Boss dashboard and a separate worker service use Google Sheets for dashboard tasks and progress. The worker can run explicitly marked synthetic tasks and, when enabled, Gmail intake. It uses the same eight-role runner and stores persistent state on a Railway Volume.

The dashboard does not run employee work. Ordinary manual or named-employee assignments are recorded for visibility but are not claimed by the current worker. The worker's full-run path requires the task's execution mode to be `synthetic-eight-agent`.

The active roster is Client Manager, ISMS Readiness Planner, Requirements/Evidence Specialist, Technical Controls Analyst, Security Awareness Specialist, Corrective Action Specialist, Readiness Metrics Analyst, and Project Manager. Stages run sequentially and exchange context through owned project files. Node.js handles orchestration, security and validation checks, recovery, manifests, and DOCX packaging. The active model path is Ollama Cloud; Node.js sends bounded project context and validates and writes each role's output.

## Local quick start

Use the existing Node.js installation, configured project workspace, and authorized accounts. Run from the repository root:

```powershell
node agency/integrations/gmail/gmail.mjs check-config
node agency/integrations/gmail/gmail.mjs verify
node agency/integrations/reporting/reporting.mjs check-config
node agency/start-agency.mjs
```

Keep one launcher running. Its first Gmail poll establishes a baseline and skips existing Inbox messages; use a fresh test request after the baseline. Stop with Ctrl+C. The launcher is foreground software and is not automatically registered with Windows startup.

To run an existing project directly:

```powershell
node agency/demo/run-demo.mjs --project <project-id> --dry-run
node agency/demo/run-demo.mjs --project <project-id>
```

Use an existing ID beneath `agency/projects`. Dry run inspects eligibility and dependencies but does not run models or prove completion. The direct runner does not publish Sheets data or send email; those are coordinated by the launcher or separately authorized tools. See [runner and recovery guide](agency/demo/README.md).

## Railway workflow

Deploy the dashboard and worker as separate services. The dashboard serves the authenticated Boss Command Center. The worker needs `AGENT_WORKER_ENABLED=true`, valid Sheets and model configuration, and a persistent Volume mounted at `/app/agency/projects`. `EMAIL_INTAKE_ENABLED=true` enables its separate Gmail polling path. The worker claims only full-run task rows marked `synthetic-eight-agent`; manual assignments are not executed.

The Railway worker uses Ollama Cloud with `CODEX_PROVIDER=ollama`, HTTPS `OLLAMA_BASE_URL=https://ollama.com/v1`, `OLLAMA_API_KEY`, `CODEX_MODEL`, and `AGENT_EXECUTOR=ollama-direct` (the default for remote Ollama). Node.js sends bounded source and instruction text without model tools, validates the candidate, and saves the owned artifact. See [cloud worker setup](CLOUD-WORKER.md).

The optional cloud email-delivery path is controlled separately by `EMAIL_DELIVERY_ENABLED` and its Boss recipient and Gmail send credentials. It can send a fixed customer receipt, a Boss intake notice with original message material, and a validated final DOCX to the authenticated customer with Boss copied. See [Cloud email delivery](agency/integrations/reporting/CLOUD-EMAIL.md). Local customer completion notices follow a different policy and do not attach the report.

## Outputs and evidence boundaries

Each role owns a file beneath `agency/projects/<project-id>/working/`. A run manifest and per-role records are saved under `logs/demo-runs/<run-id>/`. A completed run requires all eight accepted outputs and a successful `final-agency-report.docx` export. Validated unchanged outputs may be reused, so “completed” does not necessarily mean eight new model calls.

Structural validation checks format and required sections; it does not independently verify claims, control effectiveness, or remediation. Missing evidence is not proof that a control is absent. Reports need human factual and visual review before external use. Read [Project Manager DOCX contract](agency/PROJECT-MANAGER-DOCX.md) and [Security](SECURITY.md).

The Sheets execution ledger and dashboard task ledger are different records. The agency ledger records eight role outcomes per run. The dashboard's `Task Ledger` records assigned work and worker stages; other dashboard tabs store chat, report outputs, archive events, and optional email statuses. A task status alone does not prove a live process or email delivery.

## Documentation map

- [Architecture and workflow](ARCHITECTURE.md) — source-of-truth system map and end-to-end paths.
- [Railway worker](CLOUD-WORKER.md) — service setup, provider modes, queue eligibility, and Gmail intake.
- [Boss dashboard](boss-dashboard/README.md) — features, Sheets tabs, chat, history, local run, and deployment.
- [Eight-role runner](agency/demo/README.md) — dependencies, execution, artifacts, validation, and recovery.
- [Gmail intake](agency/integrations/gmail/README.md) — mailbox screening, staging, classification, and routing.
- [Reporting](agency/integrations/reporting/README.md) — local Sheets and notification policies.
- [Cloud email delivery](agency/integrations/reporting/CLOUD-EMAIL.md) — Railway customer/Boss delivery and durable send state.
- [Security](SECURITY.md) and [Code guide](CODE_GUIDE.md).

Role workspaces may also contain inherited routines and reference material outside the active readiness workflow. Only the eight role/routine pairs in `agency/demo/run-demo.mjs` are invoked by the assessment runner. Other files may be historical kit material, example evidence, or optional integrations; their presence does not add a workflow stage. The optional n8n files describe a separate scaffold and do not replace the local launcher or Railway worker.

## Verification status

Code tests and local/provider checks verify only the paths they exercise. A current end-to-end claim requires checking the deployed revision, an eligible fresh job, all eight stage results, the final manifest and DOCX, Sheets publication, and inbox receipt where email delivery is enabled. Review the relevant run records; do not infer success from an old dashboard row, health endpoint, model-list response, or historical demo.
>>>>>>> 3e4218a (Update documentation)
