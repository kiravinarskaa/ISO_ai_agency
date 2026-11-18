# ISO/IEC 27001 Readiness Assessment AI Agency

Documentation reconciled with the workspace source on 18 November 2026. See [Architecture and workflow](ARCHITECTURE.md) for the full system map.

This educational prototype organizes supplied information and prepares readiness-planning materials. It does not conduct an accredited certification audit, certify an organization, or establish compliance. Customer statements and synthetic evidence remain unverified unless independently supported.

## Architecture

The repository has a shared Node.js runner for eight sequential roles, with two operating paths:

- **Local:** A foreground Windows launcher polls Gmail, stages and classifies eligible messages, runs the workflow, and coordinates authorized reporting. Projects and workflow state are stored in files.
- **Railway:** A public Boss dashboard and a separate worker use Google Sheets for tasks and progress. The worker can run explicitly marked synthetic tasks and, when enabled, Gmail intake. Persistent state is stored on a Railway Volume.

The dashboard does not execute employee work. Manual or named-employee assignments are recorded for visibility; the worker executes only full-run tasks marked `synthetic-eight-agent`.

The roles are Client Manager, ISMS Readiness Planner, Requirements/Evidence Specialist, Technical Controls Analyst, Security Awareness Specialist, Corrective Action Specialist, Readiness Metrics Analyst, and Project Manager. They exchange context through project files. Node.js handles orchestration, security and validation checks, recovery, manifests, and DOCX packaging. The active model path is Ollama Cloud; Node.js sends bounded project context, validates each role’s output, and saves its artifact.

## Local quick start

Use the existing Node.js installation, configured workspace, and authorized accounts. Run these commands from the repository root:

```powershell
node agency/integrations/gmail/gmail.mjs check-config
node agency/integrations/gmail/gmail.mjs verify
node agency/integrations/reporting/reporting.mjs check-config
node agency/start-agency.mjs
```

Keep the launcher running. Its first Gmail poll establishes a baseline and skips existing Inbox messages, so use a fresh test request afterward. Stop it with Ctrl+C. The launcher runs in the foreground and is not registered for automatic Windows startup.

To inspect or run an existing project directly:

```powershell
node agency/demo/run-demo.mjs --project <project-id> --dry-run
node agency/demo/run-demo.mjs --project <project-id>
```

Replace `<project-id>` with an existing ID beneath `agency/projects`. A dry run checks eligibility and dependencies but does not run models or prove completion. The direct runner does not publish to Sheets or send email; those actions are coordinated by the launcher or separately authorized tools. See the [runner and recovery guide](agency/demo/README.md).

## Railway setup

Deploy the dashboard and worker as separate services. The dashboard serves the authenticated Boss Command Center. The worker requires `AGENT_WORKER_ENABLED=true`, valid Sheets and model configuration, and a persistent Volume mounted at `/app/agency/projects`. Set `EMAIL_INTAKE_ENABLED=true` to enable its separate Gmail polling path.

For remote Ollama, configure `CODEX_PROVIDER=ollama`, `OLLAMA_BASE_URL=https://ollama.com/v1`, `OLLAMA_API_KEY`, `CODEX_MODEL`, and `AGENT_EXECUTOR=ollama-direct`. The direct executor sends bounded source and instruction text without model tools, then validates and saves the role’s output. See [cloud worker setup](CLOUD-WORKER.md).

The optional cloud email-delivery path is controlled by `EMAIL_DELIVERY_ENABLED` and its Boss recipient and Gmail send credentials. It can send a customer receipt, a Boss intake notice with original message material, and a validated final DOCX to the authenticated customer with Boss copied. Local customer completion notices use a separate policy and do not attach the report. See [Cloud email delivery](agency/integrations/reporting/CLOUD-EMAIL.md).

## Outputs and evidence

Each role owns a file beneath `agency/projects/<project-id>/working/`. Run manifests and per-role records are saved under `logs/demo-runs/<run-id>/`. A completed run requires all eight accepted outputs and a successful `final-agency-report.docx` export. Unchanged, validated outputs may be reused, so completion does not necessarily mean eight new model calls.

Structural validation checks formatting and required sections; it does not verify factual claims, control effectiveness, or remediation. Missing evidence does not prove a control is absent. A human should review reports for factual accuracy and visual quality before external use. See the [Project Manager DOCX contract](agency/PROJECT-MANAGER-DOCX.md) and [Security](SECURITY.md).

The Sheets execution ledger and dashboard task ledger serve different purposes. The execution ledger records role outcomes per run. The dashboard’s `Task Ledger` records assigned work and worker stages; other tabs store chat, reports, archives, and optional email statuses. A task status alone does not prove that a process ran or an email was delivered.

## Documentation

- [Architecture and workflow](ARCHITECTURE.md) — system map and end-to-end paths
- [Railway worker](CLOUD-WORKER.md) — setup, provider modes, task eligibility, and Gmail intake
- [Boss dashboard](boss-dashboard/README.md) — features, Sheets tabs, chat, history, and deployment
- [Eight-role runner](agency/demo/README.md) — dependencies, execution, artifacts, validation, and recovery
- [Gmail intake](agency/integrations/gmail/README.md) — screening, staging, classification, and routing
- [Reporting](agency/integrations/reporting/README.md) — local Sheets and notification policies
- [Cloud email delivery](agency/integrations/reporting/CLOUD-EMAIL.md) — Railway delivery and send state
- [Security](SECURITY.md) and [Code guide](CODE_GUIDE.md)

Role workspaces may contain inherited routines and reference material outside the active workflow. Only the eight role/routine pairs in `agency/demo/run-demo.mjs` run as part of the readiness assessment. Other files may be historical material, sample evidence, or optional integrations; their presence does not add workflow stages. Optional n8n files describe a separate scaffold and do not replace the local launcher or Railway worker.

## Verification status

Tests and provider checks verify only the paths they exercise. To confirm a current end-to-end run, check the deployed revision, a fresh eligible job, all eight stage results, the final manifest and DOCX, Sheets publication, and inbox receipt if email delivery is enabled. Do not infer success from an old dashboard row, health endpoint, model-list response, or historical demo.
