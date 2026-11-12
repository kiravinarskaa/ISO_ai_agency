# Cloud agent worker

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
   - `GOOGLE_SPREADSHEET_ID` — same Sheet ID used by the dashboard.
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — same complete service-account JSON key.
   - `CODEX_COMMAND` — `codex`.
   - `CODEX_MODEL` — the exact model name configured for your existing Codex
     workflow. The worker refuses to run if this is missing.
   - `OPENAI_API_KEY` — API authentication for the cloud Codex CLI. This may
     incur separate API charges.
   - `AGENT_WORKER_ENABLED` — begin with `false`.
   - `EMAIL_INTAKE_ENABLED` — begin with `false`; set to `true` only after the
     read-only Gmail OAuth variables are configured.
   - `GMAIL_OAUTH_CREDENTIALS_JSON` — complete Google Desktop OAuth credentials
     JSON from the Gmail connector's `private/credentials.json`.
   - `GMAIL_OAUTH_TOKENS_JSON` — complete authorized token JSON from
     `private/tokens.json`; grant only Gmail read-only access.
   - `GMAIL_POLL_MS` — optional; defaults to 60000 (one minute).
   - `GMAIL_PRIVATE_DIR` — set to `/app/agency/projects/.worker-state/gmail/private`.
   - `WORKER_POLL_MS` — optional; defaults to 15000 (15 seconds).
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
