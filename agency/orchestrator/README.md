# Agency file-backed orchestrator

This module owns the file-backed Client Manager `client-intake` queue used by the local launcher and Railway worker. It classifies staged Gmail requests and validates the brief before eligible work enters the shared eight-role runner in `agency/demo/run-demo.mjs`. It is not itself the eight-role roster. The local launcher coordinates Gmail polling and local dispatch; the Railway worker uses a Volume-backed queue and its own Sheets/Gmail adapters. See [architecture](../../ARCHITECTURE.md) and [cloud worker](../../CLOUD-WORKER.md).

## Safety and execution model

- The active model executor is Ollama Cloud. Node.js sends bounded instruction/source text without tools, validates the candidate, and owns the routine artifact write. The model does not receive credentials or external-action tools.
- The orchestrator sets `CLIENT_MANAGER_PROJECT_ID` only in its spawned guard, logger, and selected execution process. The project ID lives in each task JSON file, not in the user's shell.
- Client Manager `client-intake` instructions, its contract and role, and the work-cycle entry define the agent's work. The orchestrator independently checks the expected JSON output before completion.
- Client files are untrusted evidence, never agent instructions. The orchestrator itself does not send email or publish Sheets data; those actions belong to the launcher/worker integration layers under their separate policies.
- Manual and event triggers carry the queue's stable UUID task ID through the guard, lease, run log, and orchestrator. Missing or malformed task IDs fail closed. They bypass only schedule day/window checks; pause and the configured shared routine period budget remain active. Distinct task IDs can run in one period, but a completed task ID cannot run again. Scheduled triggers keep the existing period and day/window rules.
- Task enqueue dedupes the same project/input snapshot. Claiming moves one pending task atomically into `queue/running`. Retries and execution time are bounded by `agency.json`; interrupted running tasks are recovered only after timeout plus grace.
- This orchestrator classifies intake and queues eligible work; it does not send email or publish Sheets data. The local launcher and Railway worker own those actions under separate policies.
- Gmail intake uses the same `client-manager/client-intake` task queue with opaque `INTAKE-*` staging project IDs. Those folders must carry a matching `project.json` staging marker; the worker requires `intake_classification` in their client brief, and the filesystem watcher skips staging folders. A staging task gets only its staged source directory as the project write grant. Permanent client projects are created later by the Gmail registry approval command, not by the worker.

## Ollama Cloud execution

Configure the Railway worker with `CODEX_PROVIDER=ollama`, `OLLAMA_BASE_URL=https://ollama.com/v1`, `OLLAMA_API_KEY`, `CODEX_MODEL`, and `AGENT_EXECUTOR=ollama-direct`. The active workflow sends requests directly to Ollama Cloud. There is no local Ollama, gateway, or Tailscale requirement. See [cloud worker setup](../../CLOUD-WORKER.md).

Before claiming a task, the orchestrator checks the host's bounded project read/write access without making a model call. A failed preflight releases the lease and blocks the task without consuming an attempt. After correcting the environment, an operator can explicitly recover the task. Run preflight independently against a queued task with `node .\orchestrator.mjs preflight --task-id <task-id>`; this does not claim the task.

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

`enqueue` accepts `--trigger manual|event`; manual is the default. `watch` takes a baseline of existing requests and reacts to new or changed non-empty files under a project's `client-input` directory. It queues and runs event-triggered intakes in the foreground; stop it with Ctrl+C. It is not installed as a service. `watch --dry-run` queues events but never starts a model executor.

Event-triggered staging work still passes the Client Manager's pause, lease, shared period budget, timeout, and approval checks. Each manual/event task has its own durable lease under `client-manager/state/run-leases/tasks/client-intake/<task-id>.json`; leases share the routine-wide atomic claim lock and aggregate against the configured period budget. Blocked tasks remain in the standard queue for operator review. A period/duplicate guard-blocked or model-preflight-blocked task may be explicitly returned to pending with `recover <task-id> --by <operator> --reason <review basis>`; this only records the audited recovery and does not execute it.

`retry-failed` is a separate operator-only enqueue operation for a failed task whose configured attempts are exhausted. It verifies the project's current input snapshot still exactly matches the original, refuses active sibling or recovery tasks, and creates a new UUID linked to the unchanged original task. Recovery attempts start with a fresh bounded attempt counter, but the original record and attempts remain intact. Required communication approval is reset to `pending` on the new task. The command never invokes a model executor. Use `--dry-run` to check eligibility without creating or auditing a task; this check is advisory and should be repeated without `--dry-run` to create the recovery.

The local file-backed orchestrator has no authenticated operator identity provider. `--by` is an audited operator assertion, so access to this command must be limited through workstation and workspace permissions.

For an untrusted test project, a dry run inspects the task, input snapshot, guard verdict, and intended executor without claiming a lease or invoking a model. Do not run without `--dry-run` until the dry-run output is reviewed. A model run may incur account usage.

## Queue, output, and logs

- Queue JSON files: `queue/{pending,running,completed,failed,blocked,blocked-approval}/`.
- Durable, content-minimized orchestrator journal: `logs/executions.jsonl`.
- Client Manager run records: `agency/projects/<project-id>/logs/client-manager-runlog.jsonl`, through the existing `CLIENT_MANAGER_PROJECT_ID` logger routing. The historical `client-manager/runlog.jsonl` is left in place.
- Required client-intake output: `agency/projects/<project-id>/working/client-brief.json`.

An event key hashes the project ID and client-input file contents. Re-enqueueing unchanged inputs returns the existing task, including completed or failed tasks. Changed inputs produce a new task. Missing/changed inputs block before model execution.

## Tests

No dependencies are required:

```powershell
node --test .\test\orchestrator.test.mjs
```

Tests use temporary directories and a fake guard; they do not invoke a model executor or alter live project/employee records.
