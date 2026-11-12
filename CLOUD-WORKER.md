# Cloud agent worker

The dashboard and Google Sheet are already connected. This worker is a separate
Railway service that watches only dashboard tasks marked **Run the full
eight-agent synthetic demo**. It runs the existing eight-agent Codex workflow
sequentially, then writes each employee's status to `Task Ledger` and the final
Markdown report to a `Run Outputs` tab.

## Important boundaries

- The worker is disabled unless `AGENT_WORKER_ENABLED=true`.
- Only synthetic coursework jobs are supported. The form text is sent to the
  configured Codex model; do not enter real client or personal information.
- Ordinary manually assigned tasks are never claimed by this worker.
- The project files live on a Railway Volume. Mount it at
  `/app/agency/projects` so outputs survive redeploys.
- The existing Google Sheet service account is used for Sheet access. The
  Codex API key is a separate credential and is not stored in Git.
- `OPENAI_API_KEY` usage is billed separately from a ChatGPT subscription.
  Keep the worker disabled until the model, API access, and budget are approved.

## Add the worker service in Railway

1. Add a **new service** from the same `ISO_ai_agency` GitHub repository. Keep
   the existing dashboard service separate.
2. Set the worker service's Root Directory to `/` so Railway sees the root
   `Dockerfile` and monorepo folders.
3. Add a Railway Volume mounted at `/app/agency/projects`.
4. Add these private variables to the worker service:
   - `GOOGLE_SPREADSHEET_ID` — same Sheet ID used by the dashboard.
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — same complete service-account JSON key.
   - `CODEX_COMMAND` — `codex`.
   - `CODEX_MODEL` — the exact model name configured for your existing Codex
     workflow. The worker refuses to run if this is missing.
   - `OPENAI_API_KEY` — API authentication for the cloud Codex CLI. This may
     incur separate API charges.
   - `AGENT_WORKER_ENABLED` — begin with `false`.
   - `WORKER_POLL_MS` — optional; defaults to 15000 (15 seconds).
5. Set `/health` as the worker health-check path. Do not generate a public
   domain for the worker; the dashboard remains the public service.
6. Deploy and confirm `/health` succeeds. Check the Railway usage page before
   enabling model calls.
7. Only after confirming the model and acceptable API budget, change
   `AGENT_WORKER_ENABLED` to `true`.

## Run a synthetic job

In the dashboard's **Assign a task** form, check **Run the full eight-agent
synthetic demo**. Enter fictional company details in the description and submit.
The worker creates a new `CLOUD-...` project, runs the roster in dependency
order, and records eight employee rows in `Task Ledger`. The final report is
saved in `Run Outputs`; the Project Manager task links back to the spreadsheet.

The worker processes one job at a time. If it stops mid-run, inspect the stage
rows before retrying. Do not reset a task to Queued until you understand the
existing project files and stage statuses.
