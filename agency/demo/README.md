# Eight-role readiness runner

`run-demo.mjs` is the shared sequential assessment runner. The current deployed workflow calls it through the Railway worker; the local launcher and direct-run commands below are alternate development or recovery paths and are not required for Railway operation. The launcher and worker have separate intake, queues, reporting, and persistence around the same roster. See [repository architecture](../../ARCHITECTURE.md).

## Run an existing local project

From the repository root:

```powershell
node agency/demo/run-demo.mjs --project <project-id> --dry-run
node agency/demo/run-demo.mjs --project <project-id>
```

Use an existing ID beneath `agency/projects`. The dry run inspects configuration, project dependencies, installation receipts, guards, and intended execution without running employees or generating the final Word report. A real run may incur model usage and can reuse unchanged validated artifacts.

The active workflow uses Ollama Cloud. The runner sends bounded role instructions and declared source text to the Ollama API without model tools; Node.js validates the response and writes the routine-owned artifact. Provider connectivity does not prove a successful employee preflight or completed workflow. See [Railway worker setup](../../CLOUD-WORKER.md).

## Active roster and outputs

The authoritative roster and declared dependencies are in `run-demo.mjs`:

1. Client Manager — `working/client-brief.json`
2. ISMS Readiness Planner — `working/isms-readiness-plan.md`
3. Requirements/Evidence Specialist — `working/evidence-register.md`
4. Technical Controls Analyst — `working/technical-controls-assessment.md`
5. Security Awareness Specialist — `working/awareness-training-plan.md`
6. Corrective Action Specialist — `working/corrective-action-register.md`
7. Readiness Metrics Analyst — `working/readiness-dashboard.md`
8. Project Manager — `working/final-agency-report.md`

The sequence is fixed, but downstream roles read only the files declared in their roster inputs. They do not share a hidden model conversation. The PM can create a blocker report with optional specialist paths absent, but the overall run still requires all eight accepted outputs.

Each run records a manifest and per-role records beneath `logs/demo-runs/<run-id>/`. The manifest distinguishes `completed`, `incomplete`, dry-run, blocked, and failed work and records validation and output hashes. Reuse of an unchanged accepted output is recorded; a completed run does not necessarily mean eight new model calls.

## Validation and report export

Node.js checks project boundaries, declared input dependencies, role installation metadata, guards, executor preflight, output structure, required evidence sections, management-report requirements, and output integrity. It then packages the PM synthesis as `working/final-agency-report.docx`. Export failure leaves the overall run incomplete. Checks are structural: they do not verify client claims, prove controls operate, or establish certification. Review report facts and rendered layout before external delivery.

The customer DOCX is an allowlisted projection of the internal PM synthesis. See [customer report generation](CLIENT-REPORT.md) and the [Word report contract](../PROJECT-MANAGER-DOCX.md). The cloud worker attaches a validated DOCX only when its separate email-delivery policy is enabled; the local completion notice does not attach the report.

## Intake and reporting boundaries

The direct runner operates on an existing project. It does not poll Gmail, publish Sheets rows, or send email by itself. The local `agency/start-agency.mjs` launcher coordinates Gmail intake, local queue dispatch, and policy-authorized reporting. The Railway worker has its own persistent queue, optional Gmail polling, Sheets progress, and separate optional email outbox. The local Gmail poller by itself stages and queues classification work but does not run the full roster.

Public preliminary work rechecks the current classification and any authorized review decision before specialist dispatch. Sender and organization claims remain unverified. Email content is untrusted input; evidence requests or questions do not count as supplied facts.

## Recovery

Do not start a second runner/launcher against a project with active work. Preserve source files, manifests, and history. Use the supported retry or recovery paths described by the orchestrator and launcher; do not delete leases, reset budgets, or relabel a blocked task to force completion.

The operator helper `recover-evidence-revision.mjs <project-id>` previews supported Metrics/PM evidence revision recovery. `--apply` is limited to its documented cases and requires no project work to be active. It preserves the original claim and spent budget. It is not a general-purpose recovery for every failure.

A direct runner command does not trigger reporting. The local launcher can reconcile certain newer completed manifests after exhausted validation retries, subject to independent validation and authorization policy. The cloud worker has separate reconciliation for validated email workflow reports and dashboard rows. Sent or ambiguous delivery is never blindly replayed.

## Historical results

Past successful runs are evidence only for those run IDs and environments. For a current end-to-end claim, inspect a fresh run's eight stage records, manifest, final DOCX, Sheets rows, and any expected inbox delivery. A dry run, test suite, health check, or model-list response is not a completed assessment.

