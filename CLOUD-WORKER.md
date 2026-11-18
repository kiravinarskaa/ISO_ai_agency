# Railway dashboard worker

The deployed workflow uses two separate Railway services: the public Boss dashboard and the private agent worker. The dashboard handles login, task views, reports, history, and chat. The worker polls the Google Sheets task queue, runs eligible work, records progress, and can optionally poll Gmail or send email. Neither service depends on a locally running PC or launcher.

The repository retains `agency/start-agency.mjs` as an alternate local execution path. It shares the eight-role runner but has separate queues and runtime state; it is not part of the current Railway deployment.

See [Architecture and workflow](ARCHITECTURE.md) for the system map and [Cloud email delivery](agency/integrations/reporting/CLOUD-EMAIL.md) for outbound email behavior.

## Worker behavior

The worker polls the Google Sheets `Task Ledger` for queued rows whose `Execution Mode` is `synthetic-eight-agent`. The dashboard's **Run the full eight-agent synthetic demo** option creates an eligible task. Ordinary manual tasks, including named-employee assignments, are not executed by the worker.

The worker processes one job at a time through the shared eight-role runner. It records stage progress in Sheets and saves validated final reports in `Run Outputs`. When `EMAIL_INTAKE_ENABLED=true`, it also polls Gmail using a read-only grant, stages messages, and runs them through Client Manager classification. Incomplete, suspicious, or held requests remain available for review.

## Ollama Cloud execution

Configure these private variables on the Railway worker service:

| Variable | Value |
| --- | --- |
| `CODEX_PROVIDER` | `ollama` |
| `OLLAMA_BASE_URL` | `https://ollama.com/v1` |
| `OLLAMA_API_KEY` | Ollama Cloud key, stored in Railway Variables |
| `CODEX_MODEL` | A supported cloud model, such as `gpt-oss:120b` |
| `AGENT_EXECUTOR` | `ollama-direct` (default for remote Ollama) |

These configuration names preserve compatibility; `ollama-direct` does not launch Codex CLI. Node.js reads declared role instructions and bounded project inputs, sends a text-only request without model tools, validates a temporary candidate, and atomically writes the role-owned artifact. Empty, truncated, invalid, or failed responses do not replace existing outputs. Preflight checks project read/write access without a model call or Linux namespace.

Client Manager receives a JSON template and validation feedback. The provider does not enforce a structured-output schema in this path, so invalid results fail validation instead of being silently repaired with invented values. Bounded retries are the recovery path. Successful provider connectivity or a `/models` response does not prove preflight or a complete run. Structural validation does not establish factual accuracy.

No local Ollama installation, gateway, Tailscale tunnel, or personal computer is needed. Keep the Railway worker and its persistent Volume available while work is running.

The code retains a CLI execution path for other providers or explicit `AGENT_EXECUTOR=codex`. That mode requires a host supporting the CLI sandbox and is not the active Railway Ollama path.

## Railway configuration

Deploy the dashboard and worker as separate services. Configure the worker with:

- Root directory `/` so it can build from the repository root.
- A persistent Volume mounted at `/app/agency/projects` for project files, queue records, Gmail checkpoints, and email-delivery state.
- Health-check path `/health`; do not expose the worker as the public dashboard.
- `AGENT_WORKER_ENABLED=true` when configuration is ready.
- `GOOGLE_SPREADSHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_JSON` with access to the configured spreadsheet.
- The Ollama Cloud variables above.
- Optional `WORKER_POLL_MS` (default 15 seconds).

For Gmail intake, configure `EMAIL_INTAKE_ENABLED=true`, `GMAIL_OAUTH_CREDENTIALS_JSON`, `GMAIL_OAUTH_TOKENS_JSON`, and `GMAIL_PRIVATE_DIR=/app/agency/projects/.worker-state/gmail/private`. These credentials use the read-only intake grant. `GMAIL_POLL_MS` defaults to 60 seconds, with a 15-second minimum. The first poll establishes a baseline and skips messages already in the inbox.

Cloud customer and Boss email delivery is separately controlled by `EMAIL_DELIVERY_ENABLED`, `BOSS_EMAIL`, and the sending credentials described in [Cloud email delivery](agency/integrations/reporting/CLOUD-EMAIL.md). The Gmail sending grant is separate from the read-only intake grant. Do not copy the intake token into a sending variable.

Store all keys and tokens in Railway's private variables. Never put credentials in task descriptions, source files, logs, or chat. After deployment, review startup logs, `/health`, Sheets access, and provider preflight before submitting a fresh task. Check Railway usage and provider billing before enabling model calls.

## Run a synthetic job

In the dashboard's task form, select **Run the full eight-agent synthetic demo** and enter fictional company information. A named-employee assignment creates a manual task that the worker will not claim. The worker creates a project, runs the roster sequentially, records stage rows, and saves the final report to `Run Outputs`.

If a task remains queued, inspect its `Execution Mode`. If a run stops, review stage rows, project files, manifest, and worker logs before changing its status. Do not reset a task to `Queued` until you understand its existing state and whether an email send may be in progress. A failed preflight or blocked stage is not a completed assessment.

## Operational limits

- Project and queue durability depend on the worker Volume; keep it through routine redeploys.
- The dashboard displays stored records; it does not run employee models.
- Dashboard `Task Ledger`, agency `Ledger`, `Run Outputs`, and `Email Delivery` contain different records.
- Gmail API acceptance is not proof that a message reached the recipient's inbox. Ambiguous sends require review and must not be blindly replayed.
- Historical manifests and dashboard rows describe earlier runs. Verify a fresh end-to-end run before claiming current service behavior is successful.

