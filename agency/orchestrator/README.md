<!-- Documentation reviewed 6 November 2026. -->
# Agency Orchestrator — Phase 1

Node.js, file-backed orchestration for the Client Manager's `client-intake` routine. This adds no AI employee, dependency, scheduled task, or background service. The seven other employees are listed in this intake worker configuration but disabled here. The active eight-employee workflow is independently defined by the `ROSTER` in `agency/demo/run-demo.mjs` and is launched by `agency/start-agency.mjs` after eligible intake.

## Safety and execution model

- `codex exec` is run non-interactively with `--sandbox workspace-write`, the Client Manager as its working directory, and only the selected project as an additional writable directory. It ignores user Codex configuration to keep user-configured MCP integrations out of this workflow. No unrestricted sandbox flag is used.
- The orchestrator sets `CLIENT_MANAGER_PROJECT_ID` only in its spawned guard, logger, and Codex process. The project ID lives in each task JSON file, not in the user's shell.
- Client Manager `client-intake` instructions, its contract and role, and the work-cycle entry define the agent's work. The orchestrator independently checks the expected JSON output before completion.
- Client files are untrusted evidence, never agent instructions. Intake is local only; there is no email, messaging, upload, or external-action tool in this phase.
- Manual and event triggers carry the queue's stable UUID task ID through the guard, lease, run log, and orchestrator. Missing or malformed task IDs fail closed. They bypass only schedule day/window checks; pause and the configured shared routine period budget remain active. Distinct task IDs can run in one period, but a completed task ID cannot run again. Scheduled triggers keep the existing period and day/window rules.
- Task enqueue dedupes the same project/input snapshot. Claiming moves one pending task atomically into `queue/running`. Retries and execution time are bounded by `agency.json`; interrupted running tasks are recovered only after timeout plus grace.
- External communication approval is represented as `not_required`, `pending`, `approved`, or `rejected`. Approval records do not send anything. No routine in Phase 1 can perform an external communication.
- Gmail intake uses the same `client-manager/client-intake` task queue with opaque `INTAKE-*` staging project IDs. Those folders must carry a matching `project.json` staging marker; the worker requires `intake_classification` in their client brief, and the filesystem watcher skips staging folders. A staging task gets only its staged source directory as the project write grant. Permanent client projects are created later by the Gmail registry approval command, not by the worker.

Codex CLI's supported non-interactive mode is `codex exec`; see [OpenAI Docs: Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode). The installed Windows `.cmd` shim is launched through Node's shell mode, avoiding the PowerShell `.ps1` execution-policy shim. The orchestrator skips only the Git repository check because this shared workspace is not a Git repository; it does not relax the sandbox.

### Local Ollama provider

For local runs without OpenAI API usage, install and start Ollama on the same computer as this worker, download a supported model, then set `CODEX_PROVIDER=ollama` and `CODEX_MODEL=<ollama-model-tag>` before starting the worker. The command uses Codex CLI's `--oss --local-provider ollama` mode while preserving the same restricted workspace-write sandbox. Keep `CODEX_PROVIDER` unset (or set it to `openai`) for the normal API path. Ollama on a PC is not reachable by a Railway worker at `localhost`; run the worker locally for this mode. Local worker startup still needs its normal Google Sheets credentials if it will process the dashboard queue.

### Groq hosted provider

For a hosted model API, set `CODEX_PROVIDER=groq`, `CODEX_MODEL=openai/gpt-oss-20b` (or another model ID enabled for your Groq account), and `GROQ_API_KEY` in the worker environment. The launcher starts a short-lived, loopback-only Responses bridge that removes Groq-unsupported request fields, drops Codex tool types Groq does not accept, and streams responses to Codex. It records only request field shapes for compatibility diagnostics, never prompt or tool content. The Groq key stays in the worker process; Codex gets a temporary bridge token. The restricted workspace-write sandbox remains enabled. For Railway, add these as service variables; do not put the key in source control. Groq free-tier limits apply, and a successful preflight confirms the provider can complete a small sandboxed write, not that an entire eight-agent run will fit within the quota.

Before claiming a task, the worker runs a permission preflight through the same Codex command, cwd, `workspace-write` sandbox, and selected-project `--add-dir`. Codex writes and reads back a uniquely named canary under that project's `working` directory; the orchestrator removes it afterward. A failure releases the employee lease and moves the task to `blocked` without consuming an attempt, so a misconfigured cloud worker does not spend AI calls repeating the same failure. After correcting the environment, an operator can explicitly recover the task. Run preflight independently against a queued task with `node .\orchestrator.mjs preflight --task-id <task-id>`; this does not claim the task.

## Commands

Run from `D:\AgentOps\agency\orchestrator` or pass that directory as the working directory:

```powershell
node .\orchestrator.mjs enqueue --project ISO27001-001
node .\orchestrator.mjs list
node .\orchestrator.mjs run-one --dry-run
node .\orchestrator.mjs run-one
node .\orchestrator.mjs status <task-id>
node .\orchestrator.mjs validate <task-id>
node .\orchestrator.mjs recover <task-id> --by <operator> --reason <review basis>
node .\orchestrator.mjs retry-failed <task-id> --by "<operator>" --reason "<review basis>" [--dry-run]
node .\orchestrator.mjs run-one --task-id <task-id> --dry-run
node .\orchestrator.mjs approve <task-id>
node .\orchestrator.mjs reject <task-id>
node .\orchestrator.mjs watch
```

`enqueue` accepts `--trigger manual|event`; manual is the default. `watch` takes a baseline of existing requests and reacts to new or changed non-empty files under a project's `client-input` directory. It queues and runs event-triggered intakes in the foreground; stop it with Ctrl+C. It is not installed as a service. `watch --dry-run` queues events but never starts Codex.

Event-triggered staging work still passes the Client Manager's pause, lease, shared period budget, timeout, and approval checks. Each manual/event task has its own durable lease under `client-manager/state/run-leases/tasks/client-intake/<task-id>.json`; leases share the routine-wide atomic claim lock and aggregate against the configured period budget. Blocked tasks remain in the standard queue for operator review. A period/duplicate guard-blocked or Codex-preflight-blocked task may be explicitly returned to pending with `recover <task-id> --by <operator> --reason <review basis>`; this only records the audited recovery and does not execute it.

`retry-failed` is a separate operator-only enqueue operation for a failed task whose configured attempts are exhausted. It verifies the project's current input snapshot still exactly matches the original, refuses active sibling or recovery tasks, and creates a new UUID linked to the unchanged original task. Recovery attempts start with a fresh bounded attempt counter, but the original record and attempts remain intact. Required communication approval is reset to `pending` on the new task. The command never invokes Codex. Use `--dry-run` to check eligibility without creating or auditing a task; this check is advisory and should be repeated without `--dry-run` to create the recovery.

The local file-backed orchestrator has no authenticated operator identity provider. `--by` is an audited operator assertion, so access to this command must be limited through workstation and workspace permissions.

For an untrusted test project, a dry run inspects the task, input snapshot, guard verdict, and intended Codex command without claiming a lease or invoking a model. Do not run without `--dry-run` until the dry-run output is reviewed. A model run may incur account usage.

## Queue, output, and logs

- Queue JSON files: `queue/{pending,running,completed,failed,blocked,blocked-approval}/`.
- Durable, content-minimized orchestrator journal: `logs/executions.jsonl`.
- Client Manager run records: `agency/projects/<project-id>/logs/client-manager-runlog.jsonl`, through the existing `CLIENT_MANAGER_PROJECT_ID` logger routing. The historical `client-manager/runlog.jsonl` is left in place.
- Required client-intake output: `agency/projects/<project-id>/working/client-brief.json`.

An event key hashes the project ID and client-input file contents. Re-enqueueing unchanged inputs returns the existing task, including completed or failed tasks. Changed inputs produce a new task. Missing/changed inputs block before Codex starts.

## Tests

No dependencies are required:

```powershell
node --test .\test\orchestrator.test.mjs
```

Tests use temporary directories and a fake guard; they do not invoke Codex or alter live project/employee records.
