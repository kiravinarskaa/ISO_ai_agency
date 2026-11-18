<<<<<<< HEAD
# Cloud agent worker

## Customer receipts, Boss intake notices and report delivery

The optional cloud delivery path sends a customer receipt before AI processing,
emails the Boss full intake details plus the original message, and sends the
validated final DOCX to the authenticated customer with Boss CC. It requires an
explicit Boss address and a separate Gmail sending grant; it does not change the
read-only intake scope. See [Cloud email setup](agency/integrations/reporting/CLOUD-EMAIL.md).
The older no-outbound descriptions below apply when delivery is disabled.

## Ollama Cloud direct execution

For the Railway worker, set:

| Variable | Value |
| --- | --- |
| `CODEX_PROVIDER` | `ollama` |
| `OLLAMA_BASE_URL` | `https://ollama.com/v1` |
| `OLLAMA_API_KEY` | Your Ollama Cloud key, stored only in Railway Variables |
| `CODEX_MODEL` | `gpt-oss:120b` (or another supported cloud model) |
| `AGENT_EXECUTOR` | `ollama-direct` (also the default for remote Ollama) |

These names retain compatibility with existing configuration; direct execution
does not launch Codex CLI. Startup logs identify the selected executor. The
Node.js host reads only the declared source files and employee instructions,
calls Ollama's `/v1/chat/completions` endpoint with no tools, validates a
temporary candidate, and atomically saves the routine-owned artifact. Invalid,
empty, truncated and failed responses preserve prior deliverables. The local
preflight verifies the host's actual write/read access without a model call or
Linux namespace. Existing guards, leases, intake classification, dependency
checks, reporting policy and final DOCX packaging remain in place.

No local Ollama installation, gateway, Tailscale tunnel or personal computer is
needed. The Railway worker and its persistent Volume must remain available.
Output validation is structural and does not establish factual accuracy.

Generation uses temperature zero to reduce sampling variation. Client Manager
receives an explicit JSON template with the exact project ID, required fields,
collection types, source paths and (for staged Gmail intake) classification
enum. This is a prompt contract, not provider-enforced structured output:
Ollama Cloud currently does not support that feature. Invalid results still
fail validation; no facts or classifications are silently filled in to pass.
Retry logs and dashboard blocker details include safe field-level validation
messages. These measures reduce avoidable failures, not guarantee success on
every first request. Existing bounded task retries remain the recovery path.

The code retains the previous CLI path for other providers and for an explicit
`AGENT_EXECUTOR=codex`. That path requires a host supporting the CLI sandbox;
it is not suitable for the Railway environment that denied user namespaces.
The older Codex setup notes below apply only to that CLI path.

The dashboard and Google Sheet are already connected. This worker is a separate
Railway service that watches dashboard tasks marked **Run the full eight-agent
synthetic demo** and, when configured, polls Gmail for new inquiries. It runs
the existing guarded Codex workflow sequentially and writes employee status to
`Task Ledger` and the final Markdown report to a `Run Outputs` tab.

The worker can also poll Gmail when `EMAIL_INTAKE_ENABLED=true`. It uses the
existing read-only Gmail intake rules, stages email content on the Railway
volume, and runs Client Manager classification first. A sufficiently complete
new-client inquiry may enter the unverified preliminary workflow; incomplete,
general, or suspicious messages are held for review. This worker never sends
customer email. Progress and the final report are written to the Google Sheet.

## Important boundaries

- The worker is disabled unless `AGENT_WORKER_ENABLED=true`.
- Only synthetic coursework jobs are supported. The form text is sent to the
  configured Codex model; do not enter real client or personal information.
- Ordinary manually assigned tasks are never claimed by this worker.
- The project files live on a Railway Volume. Mount it at
  `/app/agency/projects` so outputs survive redeploys.
- The existing Google Sheet service account is used for Sheet access. The
  Codex API key is a separate credential and is not stored in Git.
- Gmail uses the existing Desktop OAuth app credentials and refresh token,
  supplied as protected Railway variables. This grant is read-only.
- `OPENAI_API_KEY` usage is billed separately from a ChatGPT subscription.
  Keep the worker disabled until the model, API access, and budget are approved.

## Add the worker service in Railway

1. Add a **new service** from the same `ISO_ai_agency` GitHub repository. Keep
   the existing dashboard service separate.
2. Set the worker service's Root Directory to `/` so Railway sees the root
   `Dockerfile` and monorepo folders.
3. Add a Railway Volume mounted at `/app/agency/projects`.
4. Add these private variables to the worker service:
   - `GOOGLE_SPREADSHEET_ID` - same Sheet ID used by the dashboard.
   - `GOOGLE_SERVICE_ACCOUNT_JSON` - same complete service-account JSON key.
   - `CODEX_COMMAND` - `codex`.
   - `CODEX_MODEL` - the exact model name configured for your existing Codex
     workflow. The worker refuses to run if this is missing.
   - `OPENAI_API_KEY` - API authentication for the cloud Codex CLI. This may
     incur separate API charges.
   - `AGENT_WORKER_ENABLED` - begin with `false`.
   - `EMAIL_INTAKE_ENABLED` - begin with `false`; set to `true` only after the
     read-only Gmail OAuth variables are configured.
   - `GMAIL_OAUTH_CREDENTIALS_JSON` - complete Google Desktop OAuth credentials
     JSON from the Gmail connector's `private/credentials.json`.
   - `GMAIL_OAUTH_TOKENS_JSON` - complete authorized token JSON from
     `private/tokens.json`; grant only Gmail read-only access.
   - `GMAIL_POLL_MS` - optional; defaults to 60000 (one minute).
   - `GMAIL_PRIVATE_DIR` - set to `/app/agency/projects/.worker-state/gmail/private`.
   - `WORKER_POLL_MS` - optional; defaults to 15000 (15 seconds).
5. Set `/health` as the worker health-check path. Do not generate a public
   domain for the worker; the dashboard remains the public service.
6. Deploy and confirm `/health` succeeds. Check the Railway usage page before
   enabling model calls.
7. Set `CODEX_MODEL` to the same model used by the local Codex CLI. The current
   local setting is `gpt-6-luna`. The cloud CLI uses `OPENAI_API_KEY` for API
   authentication, which is billed separately from a ChatGPT subscription.
   This preserves the model choice, but it is not a free authentication path.
8. Only after confirming the API budget and private Gmail variables, set both
   `AGENT_WORKER_ENABLED=true` and `EMAIL_INTAKE_ENABLED=true`.

On the first worker start, Gmail polling establishes a baseline and skips mail
already in the inbox. Send a new test email after the Railway logs show
`Inbox baseline established`. The worker logs safe progress messages and does
not print sender addresses or message bodies. If the inquiry lacks required
scope information, the dashboard will show it held for review and no customer
email will be sent.

## Run a synthetic job

In the dashboard's **Assign a task** form, check **Run the full eight-agent
synthetic demo**. Enter fictional company details in the description and submit.
The worker creates a new `CLOUD-...` project, runs the roster in dependency
order, and records eight employee rows in `Task Ledger`. The final report is
saved in `Run Outputs`; the Project Manager task links back to the spreadsheet.

The worker processes one job at a time. If it stops mid-run, inspect the stage
rows before retrying. Do not reset a task to Queued until you understand the
existing project files and stage statuses.
=======
# Railway dashboard worker

This guide describes the current Railway path. The public Boss dashboard and the agent worker are separate Railway services. The dashboard owns login and user-facing task views; the worker owns queue polling, workflow execution, Sheets progress, and optional Gmail intake and email delivery. The worker is not the dashboard and does not run ordinary manual assignments.

See [Architecture and workflow](ARCHITECTURE.md) for the shared local/cloud workflow and [Cloud email delivery](agency/integrations/reporting/CLOUD-EMAIL.md) for outbound messages.

## Worker behavior

The worker polls the Google Sheets `Task Ledger` for rows whose `Execution Mode` is `synthetic-eight-agent` and status is `Queued`. It ignores normal `manual` tasks, including assignments to a named employee. The full-run checkbox in the dashboard creates the worker-eligible mode. The worker runs one job at a time through the shared eight-role runner and records stage progress in Sheets. Validated final reports are saved in `Run Outputs`.

When `EMAIL_INTAKE_ENABLED=true`, the worker also polls the configured Gmail inbox. New qualifying requests are staged and sent through Client Manager classification. Eligible new-client inquiries can proceed through the eight-role assessment. Suspicious, incomplete, or held classifications remain reviewable; sufficient-looking content does not bypass classification or sender-authentication rules. Gmail intake itself uses a read-only grant.

The local `agency/start-agency.mjs` launcher is a separate execution path. The worker and launcher share the eight-role runner but have separate queues and runtime state. See [local intake](agency/integrations/gmail/README.md).

## Model execution modes

## Ollama Cloud model path

Set these variables on the `agent-worker` service:

| Variable | Value |
| --- | --- |
| `CODEX_PROVIDER` | `ollama` |
| `OLLAMA_BASE_URL` | `https://ollama.com/v1` |
| `OLLAMA_API_KEY` | Ollama Cloud key, stored only in Railway variables |
| `CODEX_MODEL` | Supported cloud model, for example `gpt-oss:120b` |
| `AGENT_EXECUTOR` | `ollama-direct` (default when remote Ollama is configured) |

The Node.js host reads only declared role instructions and bounded project inputs, sends a text-only chat completion request without tools, validates a temporary candidate, then atomically writes the routine-owned artifact. Empty, truncated, invalid, or failed responses do not replace existing outputs. The host preflight checks its project write/read access without a model call or Linux namespace. Structural validation does not prove factual accuracy.

No local Ollama gateway, Tailscale tunnel, or personal computer is needed for Ollama Cloud. Keep the Railway worker and its persistent Volume available while work is running. A successful `/models` request verifies connectivity only; it does not prove task preflight or a complete eight-role run.

Client Manager receives a JSON template and validation feedback, but Ollama Cloud does not enforce a provider-side structured-output schema in this path. Invalid results fail validation rather than being silently repaired with invented values. Bounded worker retries remain the recovery path.

## Create or configure the service

1. Create a separate Railway service from this repository for the worker. Keep the public dashboard service configured to run from `/boss-dashboard` with `npm start`.
2. Set the worker Root Directory to `/` so Railway can build the root `Dockerfile` and access the monorepo.
3. Add a persistent Volume mounted at `/app/agency/projects`. Project files, queue records, intake checkpoints, and durable email delivery state live there.
4. Set required private variables:
   - `AGENT_WORKER_ENABLED=true` after configuration is ready.
   - `GOOGLE_SPREADSHEET_ID`.
   - `GOOGLE_SERVICE_ACCOUNT_JSON` with access to the configured Sheet.
   - The Ollama Cloud model variables listed above.
   - `WORKER_POLL_MS` is optional; default is 15 seconds.
5. Set the health-check path to `/health`. Do not expose the worker as the public dashboard.
6. For Gmail intake, add `EMAIL_INTAKE_ENABLED=true`, `GMAIL_OAUTH_CREDENTIALS_JSON`, `GMAIL_OAUTH_TOKENS_JSON`, and `GMAIL_PRIVATE_DIR=/app/agency/projects/.worker-state/gmail/private`. These JSON values use the existing Gmail read-only grant. `GMAIL_POLL_MS` is optional; default is 60 seconds (with a 15-second minimum).
7. For cloud customer/Boss email delivery, follow [Cloud email delivery](agency/integrations/reporting/CLOUD-EMAIL.md). It is independently disabled until `EMAIL_DELIVERY_ENABLED=true`, `BOSS_EMAIL`, and the separate Gmail sending credentials/token are configured.
8. Deploy and verify startup logs, `/health`, configured Sheet access, and provider preflight before submitting a fresh test task. Check Railway usage and model/API billing for the selected provider.

Use secret Railway variables for all tokens and keys. Never paste credentials into task descriptions, source files, logs, or chat. Do not copy the read-only Gmail token into a sending variable.

## Run a full synthetic job

In the dashboard's **Assign a task** form, select **Run the full eight-agent synthetic demo** and use fictional company information. A named-agent assignment creates a `manual` task and will not run through this worker. The worker creates a project, runs the roster sequentially, records stage rows, and saves the final report to `Run Outputs`.

If a task remains queued, inspect its `Execution Mode` before retrying. If a run stops, inspect stage rows, project files, manifest, and worker logs before changing its status. Do not reset a task to Queued until the existing state and any possible in-progress send are understood. A failed preflight or blocked stage is not a completed assessment.

## Operational limits

- Project and queue durability depends on the worker Volume. Do not remove it during routine redeploys.
- The worker processes jobs sequentially; the dashboard itself does not run models.
- Dashboard `Task Ledger` rows, agency `Ledger` execution rows, `Run Outputs`, and `Email Delivery` have different purposes.
- Cloud email acceptance from Gmail API is not proof that a recipient inbox received a message. Ambiguous sends need operator review; do not force a resend by deleting state.
- Historical manifests and dashboard rows describe earlier runs. Verify a fresh end-to-end run before describing current service behavior as successful.
>>>>>>> 3e4218a (Update documentation)
