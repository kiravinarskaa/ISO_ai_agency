# ISO/IEC 27001 Readiness Assessment AI Agency

Documentation reconciled with the workspace source on 18 November 2026. The current operating deployment is on Railway; the local launcher is retained as an alternate code path but is not used by this deployment. See [Architecture and workflow](ARCHITECTURE.md) for the system map.

This educational prototype organizes supplied information and prepares readiness-planning materials. It does not conduct an accredited certification audit, certify an organization, or establish compliance. Customer statements and synthetic evidence remain unverified unless independently supported.

## Railway deployment

The application uses two separate Railway services:

- **Boss dashboard:** Public authenticated interface for task views, reports, history, chat, and Google Sheets access. It does not run employee work.
- **Agent worker:** Private service that polls the Sheets task queue, runs eligible work through the shared eight-role runner, and records progress. It can also poll Gmail and send email when those separate options are configured.

The worker claims only queued tasks marked `synthetic-eight-agent`, created with the dashboard's **Run the full eight-agent synthetic demo** option. It does not run ordinary manual or named-employee assignments. The worker uses Ollama Cloud direct execution and requires a persistent Railway Volume mounted at `/app/agency/projects`. See [Railway worker setup](CLOUD-WORKER.md).

The worker processes roles sequentially and passes context through project files. The active roster is Client Manager, ISMS Readiness Planner, Requirements/Evidence Specialist, Technical Controls Analyst, Security Awareness Specialist, Corrective Action Specialist, Readiness Metrics Analyst, and Project Manager. Each role owns an output under `agency/projects/<project-id>/working/`.

When enabled, Gmail intake uses a read-only grant and classifies staged messages before dispatch. Cloud customer and Boss email delivery is a separate opt-in path using a separate Gmail sending grant. See [Cloud email delivery](agency/integrations/reporting/CLOUD-EMAIL.md).

## Completion and evidence

A completed run requires all eight accepted role outputs and a successful `final-agency-report.docx` export. Validated unchanged artifacts may be reused, so completion does not necessarily mean eight new model calls. The worker also saves validated final report data to the dashboard's `Run Outputs` tab.

Structural validation checks format and required sections; it does not verify factual claims, control effectiveness, remediation, certification, or customer identity. Missing evidence is not proof that a control is absent. Review reports for factual accuracy and visual quality before external use.

The agency `Ledger` records role outcomes per run. The dashboard `Task Ledger` records assigned tasks and worker stages. `Run Outputs` and `Email Delivery` are separate records. A status row, health endpoint, provider response, or historical manifest alone does not prove a current end-to-end run or inbox receipt.

## Alternate local code path

The repository retains `agency/start-agency.mjs` for local Windows operation. It shares the eight-role runner but has separate queues and runtime state. It is not required for the Railway dashboard or worker, and the current deployment does not depend on a local PC or launcher.

## Documentation

- [Architecture and workflow](ARCHITECTURE.md) — components, data boundaries, and operating paths
- [Railway worker](CLOUD-WORKER.md) — worker configuration, eligible tasks, and execution
- [Boss dashboard](boss-dashboard/README.md) — dashboard features, Sheets tabs, chat, and deployment
- [Eight-role runner](agency/demo/README.md) — dependencies, artifacts, validation, and recovery
- [Gmail intake](agency/integrations/gmail/README.md) — screening, staging, classification, and routing
- [Reporting](agency/integrations/reporting/README.md) — Sheets reporting and local notifications
- [Cloud email delivery](agency/integrations/reporting/CLOUD-EMAIL.md) — Railway customer/Boss delivery and durable send state
- [Security](SECURITY.md) and [Code guide](CODE_GUIDE.md)

Role workspaces may contain inherited routines and reference material beyond the active assessment. Only the eight role/routine pairs in `agency/demo/run-demo.mjs` run in this workflow. Optional n8n files describe a separate scaffold and do not replace the Railway dashboard or worker.

## Verification

To confirm current end-to-end operation, check the deployed revision, a fresh eligible task, all eight stage results, the final manifest and DOCX, Sheets publication, and inbox receipt if email delivery is enabled. Review current run records; do not infer success from an old dashboard row or historical demo.

