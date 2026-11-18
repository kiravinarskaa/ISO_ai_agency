# Railway Cloud Agent Worker

The Railway dashboard and agent worker are separate services. The dashboard handles login and task views; the worker polls eligible tasks, runs the shared eight-role workflow, and records progress in Google Sheets. The local `agency/start-agency.mjs` launcher is a separate execution path with its own queue and runtime state.

See [Architecture and workflow](ARCHITECTURE.md) for the shared workflow and [Cloud email delivery](agency/integrations/reporting/CLOUD-EMAIL.md) for outbound email setup.

## Worker behavior

The worker processes one task at a time. It claims only queued tasks whose execution mode is `synthetic-eight-agent`, created by selecting **Run the full eight-agent synthetic demo** in the dashboard. It ignores ordinary manual tasks, including assignments to a named employee.

The worker runs the eight roles sequentially and records stage progress in the dashboard’s `Task Ledger`. Validated final reports are saved in `Run Outputs`. The workflow uses project files to pass information between roles.

When `EMAIL_INTAKE_ENABLED=true`, the worker also polls Gmail using a read-only grant. It stages new messages and runs them through Client Manager classification. Incomplete, suspicious, or otherwise held messages remain available for review. A sufficiently complete inquiry may proceed through the assessment, but classification and sender-authentication checks still apply.

## Model execution

For Ollama Cloud, configure these private variables on the worker service:

| Variable | Value |
|---|---|
| `CODEX_PROVIDER` | `ollama` |
| `OLLAMA_BASE_URL` | `https://ollama.com/v1` |
| `OLLAMA_API_KEY` | Ollama Cloud key, stored in Railway Variables |
| `CODEX_MODEL` | `gpt-oss:120b` |
| `AGENT_EXECUTOR` | `ollama-direct` |

With this mode, Node.js reads declared role instructions and bounded project inputs, sends a text-only request without model tools, validates a temporary result, and saves the role-owned artifact. Empty, truncated, invalid, or failed responses do not replace existing outputs. Preflight checks project read and write access without calling the model or requiring Linux namespaces.

Client Manager receives a JSON template and validation feedback. The provider does not enforce a structured-output schema in this path, so invalid results fail validation instead of being silently filled with invented values. Bounded worker retries are available, but successful connectivity or a `/models` response does not prove that preflight or a complete run will succeed.

No local Ollama installation, gateway, Tailscale tunnel, or personal computer is needed for Ollama Cloud. Keep the Railway worker and its persistent Volume available while work is running.

## Configure the Railway service

Create a separate Railway service from the same repository. Keep the dashboard service separate and public; do not expose the worker as the dashboard.

Configure the worker with:

- Root directory: `/`
- Persistent Volume mounted at `/app/agency/projects`
- Health-check path: `/health`
- Required private variables:
  - `AGENT_WORKER_ENABLED=true` when configuration is ready
  - `GOOGLE_SPREADSHEET_ID`
  - `GOOGLE_SERVICE_ACCOUNT_JSON`
  - The Ollama Cloud variables listed above
- Optional polling interval: `WORKER_POLL_MS` (defaults to 15 seconds)

The Volume stores project files, queue records, intake checkpoints, and durable email-delivery state. Do not remove it during routine redeploys.

To enable Gmail intake, also configure:

- `EMAIL_INTAKE_ENABLED=true`
- `GMAIL_OAUTH_CREDENTIALS_JSON`
- `GMAIL_OAUTH_TOKENS_JSON`
- `GMAIL_PRIVATE_DIR=/app/agency/projects/.worker-state/gmail/private`
- Optional `GMAIL_POLL_MS` (defaults to 60 seconds, with a 15-second minimum)

Use the existing Gmail read-only grant for intake. Do not use that token for sending.

Cloud customer and Boss email delivery is a separate optional feature. Follow [Cloud email delivery](agency/integrations/reporting/CLOUD-EMAIL.md) to configure its sending credentials and recipient. It remains disabled unless `EMAIL_DELIVERY_ENABLED=true` and the required delivery settings are supplied. Local customer completion notices use a different policy.

Store keys and tokens only in Railway’s private variables. Check Railway usage and model/API billing before enabling model calls. After deployment, confirm startup logs, `/health`, Sheet access, and provider preflight before submitting a fresh task.

## Run a synthetic job

In the dashboard’s task form, select **Run the full eight-agent synthetic demo** and enter fictional company information. The worker creates a project, runs the roles sequentially, records the stage results, and saves the final report to `Run Outputs`.

If a task remains queued, check its execution mode. If a run stops, review its stage rows, project files, manifest, and worker logs before changing its status. Do not reset it to `Queued` until you understand the existing state and whether any email send may be in progress.

## Limits and evidence

The worker’s structural checks validate output format and required content; they do not establish factual accuracy, control effectiveness, or compliance. A blocked stage or failed preflight is not a completed assessment.

The dashboard `Task Ledger`, agency execution ledger, `Run Outputs`, and `Email Delivery` records serve different purposes. A task status does not prove that a live process ran or an email was delivered. Gmail API acceptance does not prove arrival in the recipient’s inbox. Review ambiguous sends before retrying; deleting delivery state can cause duplicate messages.

Verify a fresh end-to-end run before describing current service behavior as successful. Historical manifests and dashboard rows document earlier runs only.
