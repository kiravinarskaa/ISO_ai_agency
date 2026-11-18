# Architecture and workflow

Last reconciled with the workspace source: 18 November 2026. The deployed operating path is Railway; the local launcher is retained in the repository as an alternate path and is not required by the deployment. Deployment configuration and live service state can change independently, and a successful configuration or health check does not prove an end-to-end assessment completed.

## System at a glance

The application has a shared Node.js workflow core. The current deployed workflow runs on Railway:

1. **Boss dashboard:** the public Railway service (`boss-dashboard/`) handles user sessions, task views, run history, chat, and Sheets access. It does not execute employee work.
2. **Agent worker:** the separate private Railway service (`agency/cloud-worker.mjs`) polls its Google Sheets queue and, when enabled, Gmail. It calls the shared eight-role runner and stores project and queue state on a persistent Railway Volume.

The repository also retains a local Windows launcher (`agency/start-agency.mjs`) that shares the runner. It is a separate, unused operating path in the current Railway deployment; it is not required to keep the Railway workflow running.

The dashboard does not execute employee work. It records manual tasks for visibility and can submit an explicitly marked full synthetic run for the worker. Ordinary manually assigned or named-employee tasks are not claimed by the current worker.

## Components and ownership

| Component | Owns |
| --- | --- |
| `agency/start-agency.mjs` | Local polling loop, intake reconciliation, workflow dispatch, and policy-authorized local reporting recovery |
| `agency/integrations/gmail/intake-poller.mjs` | Read-only mailbox access, screening, deduplication, staging, classification tasks, and authenticated reply routing |
| `agency/orchestrator/orchestrator.mjs` | File-backed Client Manager queue, leases, guards, preflight, retries, brief validation, and execution adapter selection |
| `agency/demo/run-demo.mjs` | Fixed eight-role roster, sequential execution, dependency and artifact checks, reuse, manifests, and final report handoff |
| `agency/orchestrator/ollama-direct.mjs` | Active Ollama Cloud text request path; Node.js bounds source reads, validates the response, and owns artifact writes |
| `agency/demo/final-report-docx.mjs` | Deterministic packaging of the PM report as DOCX |
| `agency/cloud-worker.mjs` | Railway health endpoint, Sheets task queue, optional Gmail polling, worker progress, report publishing, recovery synchronization, and optional email delivery |
| `boss-dashboard/` | Authenticated dashboard UI/API, task assignment and views, run history, archives, chat, and Sheets access |
| `agency/integrations/reporting/` | Local Sheets/reporting policy and customer notices; separate cloud delivery module handles the Railway worker email outbox |
| `agency/projects/<project-id>/` | Inputs, working artifacts, employee run records, manifests, and recovery history |

The active assessment roster is declared in `agency/demo/run-demo.mjs`. It is Client Manager, ISMS Readiness Planner, Requirements/Evidence Specialist, Technical Controls Analyst, Security Awareness Specialist, Corrective Action Specialist, Readiness Metrics Analyst, and Project Manager. Some employee workspaces also retain routines and reference material from the inherited employee kit. Only the role/routine pairs named in `ROSTER` are selected by the assessment runner; the presence of other routines does not add a stage or grant their actions to the ISO workflow. Other repository directories also contain backups, coursework examples, or optional integrations.

## Shared eight-role workflow

The runner processes roles sequentially. It passes context through declared project files, not hidden shared model conversation. The fixed dependency order is:

```text
Client Manager
  -> ISMS Readiness Planner
  -> Requirements/Evidence Specialist
  -> Technical Controls Analyst
  -> Security Awareness Specialist
  -> Corrective Action Specialist
  -> Readiness Metrics Analyst
  -> Project Manager
  -> structural validation and DOCX export
```

Each role owns one required output under the selected project's `working/` directory. The Project Manager may write a blocker report when optional inputs are absent, but an overall completed run still requires all eight accepted outputs and a successful DOCX export. Unchanged validated artifacts can be reused; a completed run therefore need not represent eight fresh model calls.

Node.js controls paths, input snapshots, installation/role instructions, execution guards, leases, preflight, bounded retry/recovery, schema and structural checks, hashes, manifests, and output writes. These checks do not establish factual accuracy, control effectiveness, certification, or customer identity. Source statements and synthetic examples remain identified as unverified or synthetic.

## Intake and execution paths

### Retained local launcher (not used by the current deployment)

1. Start `node agency/start-agency.mjs` in the configured Windows workspace.
2. Gmail polling establishes a baseline on its first cycle; later cycles screen unseen mail and stage qualifying messages. The intake OAuth grant is read-only.
3. Client Manager classifies the staged inquiry. Suspicious, incomplete, or otherwise held requests remain in review. A public preliminary request can proceed only under its current classification or a matching authorized review decision.
4. Eligible work runs through the shared roster. The launcher can publish ledger progress/final metadata and send configured internal/customer notices under separate policies.
5. The process remains foreground and local; stopping it stops polling and dispatch. Durable files allow supported recovery after restart.

The local poller and local launcher are distinct entry points. Running `intake-poller.mjs poll` alone stages/enqueues work; it does not start the eight-role runner. The launcher coordinates polling and dispatch.

### Railway dashboard and worker (deployed operating path)

The dashboard and worker are separately deployed Railway services. The dashboard writes user-assigned task rows to `Task Ledger`, reads that tab plus the existing eight-column `Ledger`, and presents progress. The worker is not exposed as a public application; `/health` is its health endpoint.

The worker can claim rows explicitly marked `synthetic-eight-agent`. It creates stage rows, runs the shared roster sequentially, records stage progress, and stores validated final reports in `Run Outputs`. It does not execute ordinary `manual` assignments. When `EMAIL_INTAKE_ENABLED=true`, it also polls Gmail, classifies staged inquiries, and dispatches eligible email assessments. A persistent Volume is required for projects, queue checkpoints, and delivery state to survive container replacement.

The active worker model path is Ollama Cloud with `AGENT_EXECUTOR=ollama-direct`. The model receives bounded instruction/source text without tools; Node.js validates the returned candidate and writes only the routine-owned artifact. Provider reachability or `/models` access alone does not establish preflight or a complete run.

When separately enabled and configured, the worker's email outbox sends a fixed receipt to the authenticated sender, an intake notice with original message material to the explicitly configured Boss, and the validated final DOCX to the customer with Boss copied. This cloud path is distinct from local customer completion notices, which do not attach the report. Delivery state is persisted and reported separately from assessment status.

## Integrations and data boundaries

- Gmail intake uses read-only OAuth. Sending uses a separately configured Gmail send grant; the intake token is not used to send.
- Google Sheets access uses the configured service account. The agency execution ledger is an eight-column run/employee ledger; the dashboard's `Task Ledger` is a different schema for assigned tasks and their stage records.
- The dashboard may also use `Chat History`, `Run Outputs`, `Dashboard Archives`, and `Email Delivery` tabs. Chat context is read-only; dashboard archives record visibility changes and do not rewrite task or execution rows.
- Employee processes receive selected project context and their role instructions. They do not own external email or Sheets publication.
- Customer email content is untrusted. Claims, names, signatures, and model-produced addresses are not proof of identity. Authenticated sender/thread checks and explicit policy gates control replies.
- The cloud email outbox stores delivery events and status on the worker Volume. Gmail API acceptance is not proof of inbox delivery. Ambiguous sends require review and are not blindly replayed.

## Deployment and verification boundaries

The deployed Railway worker requires its service enabled, valid provider and Sheets configuration, a persistent Volume, and an eligible queue row. Gmail polling and cloud email sending are separate opt-in settings. The retained local path requires a PC and launcher only if someone chooses to run it; it is not a dependency of the Railway services.

No individual successful test, provider check, health endpoint, manifest, or dashboard status alone proves the complete live workflow. Verify current deployment revision, a fresh eligible task, each stage result, final manifest and DOCX, Sheets state, and any email in its recipient inbox before claiming end-to-end completion. Historical verification is described with its date and scope in the relevant guides.

## Related guides

- [Project overview and Railway deployment](README.md)
- [Railway worker configuration](CLOUD-WORKER.md)
- [Dashboard operation and deployment](boss-dashboard/README.md)
- [Eight-role runner and recovery](agency/demo/README.md)
- [Gmail intake](agency/integrations/gmail/README.md)
- [Reporting and local customer responses](agency/integrations/reporting/README.md)
- [Railway customer/Boss email delivery](agency/integrations/reporting/CLOUD-EMAIL.md)
- [Security and limitations](SECURITY.md)

