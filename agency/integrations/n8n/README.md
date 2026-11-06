# n8n + local agents

This adds n8n as the Gmail/Google Sheets/internal email coordinator while keeping Codex agents on this Windows PC. The local worker only binds to loopback, validates a bearer token, and uses the existing Gmail intake staging and orchestrator queue. Customer text stays untrusted; unknown senders stay unverified. It does not create permanent client accounts.

## Current boundary

- Gmail Trigger and Gmail Get run in n8n. Do not run `node agency/start-agency.mjs` or the Gmail poller at the same time; that would create a second intake source.
- The Windows worker receives one normalized message, stages it with the existing deterministic intake checks, and starts the existing Client Manager and downstream workflow.
- Agent progress and validated report outputs are posted to an n8n webhook. n8n must finish its Sheets update and internal email nodes before returning HTTP 2xx; this acknowledgement is what lets the worker record delivery as complete. For missing information, n8n replies to the original authenticated Gmail message. Replies are routed back only when they match the waiting sender, Gmail thread, and aligned SPF/DKIM/DMARC checks.
- Existing public-intake classification, rate limits, task leases, agent validation, and review holds remain active. A suspicious or unsupported request is held for review.
- n8n owns Google credentials. No Google OAuth token is copied to the worker.

## Option A: install directly on Windows

This avoids Docker and keeps n8n and the agent worker on the same PC. n8n's current documentation still describes npm installation for local use, but marks npm installs deprecated starting with n8n 3.0. It requires Node.js 20.19 through 24.x. See [n8n's npm installation guide](https://docs.n8n.io/hosting/installation/npm/).

In PowerShell, install and start n8n:

```powershell
npm.cmd install --global n8n
n8n.cmd start
```

Before starting n8n, set its environment variables in that same PowerShell window:

```powershell
$env:N8N_BLOCK_ENV_ACCESS_IN_NODE = 'false'
$env:AGENCY_WORKER_URL = 'http://127.0.0.1:8787'
$env:AGENCY_WORKER_TOKEN = '<long random secret>'
$env:N8N_EVENT_TOKEN = '<different long random secret>'
$env:AGENCY_REPORT_RECIPIENT = 'internal-team@example.com'
n8n.cmd start
```

Open `http://localhost:5678` and create the n8n owner account. Import both workflow JSON files and connect Gmail and Google Sheets credentials. Keep the two secrets private and enter the event token in the n8n event workflow's Header Auth credential as `Bearer <N8N_EVENT_TOKEN>`.

In a second PowerShell window, start the worker:

```powershell
Set-Location 'D:\AgentOps'
$env:AGENCY_WORKER_TOKEN = '<same random token set in n8n>'
$env:N8N_EVENT_WEBHOOK_URL = 'http://localhost:5678/webhook/agentops-events'
$env:N8N_EVENT_TOKEN = '<same value in n8n event header-auth credential>'
node .\agency\integrations\n8n\local-worker.mjs
```

Activate the event workflow before starting the worker so its production webhook URL is available. Set `N8N_EVENT_WEBHOOK_URL` to the actual Production URL shown by n8n. The worker defaults to `127.0.0.1`, so no Docker routing or inbound firewall rule is needed.

For a temporary trial without a global install, run `npx.cmd n8n` in the first window instead of `n8n start`.

## Option B: run n8n with Docker Desktop

1. Install Docker Desktop and open this folder in PowerShell.
2. Copy `.env.example` to `.env`; create separate random secrets for each value. Keep `.env` private.
3. Start n8n with `docker compose up -d`; open `http://localhost:5678` and create the n8n owner account.
4. In n8n, create Gmail and Google Sheets credentials. Configure a Google Sheet with these columns: `projectId`, `runId`, `status`, `updatedAt`, `agentStatuses`, `report`.
5. Import `workflow-intake.json` and `workflow-events.json`. Select your Gmail credential and spreadsheet in the nodes. Set the report workflow's recipient from `.env` in the Gmail Send node.
6. Activate the event workflow first. Copy its production webhook URL to `N8N_EVENT_WEBHOOK_URL` in the worker's process environment. Create a header-auth credential with header name `Authorization` and value `Bearer <N8N_EVENT_TOKEN>`. Configure the event workflow to reply 2xx only after all Sheets/email work succeeds.
7. Start the worker from PowerShell (commands below), then activate the intake workflow. In the Gmail Trigger, select the intended mailbox and test with a new message.

## Start the Windows worker

Open PowerShell in `D:\AgentOps` and set these values for that shell session:

```powershell
$env:AGENCY_WORKER_TOKEN = '<same random token as n8n AGENCY_WORKER_TOKEN>'
$env:N8N_EVENT_WEBHOOK_URL = '<active n8n event production URL>'
$env:N8N_EVENT_TOKEN = '<same event webhook token>'
node .\agency\integrations\n8n\local-worker.mjs
```

For Docker mode, also set `$env:AGENCY_WORKER_HOST = '0.0.0.0'` before starting the worker so Docker Desktop can reach the Windows host as `host.docker.internal`. Check it with `Invoke-RestMethod http://127.0.0.1:8787/health`. The worker must remain running while n8n receives work. Windows Firewall should allow port 8787 only from Docker Desktop's private network; do not expose this port to the public internet.

## Import workflow configuration

`workflow-intake.json` is a starting point for Gmail Trigger → Gmail Get → HTTP Request to the local worker. Inspect the Gmail Trigger's test output and adjust the field expressions if your n8n/Gmail node version uses different names. The HTTP Request node uses `AGENCY_WORKER_URL` and `AGENCY_WORKER_TOKEN` from n8n's environment.

`workflow-events.json` receives the worker's authenticated progress/report callbacks and sends clarification replies and final internal reports. It is deliberately not activated by this repository: set up credentials, choose a destination spreadsheet and internal recipient, and verify the event response waits for successful downstream actions before activation.

## Live progress in terminal

The worker prints its listening address. The existing queue and workflow state remain on disk under `agency/orchestrator/queue` and `agency/state/automatic-workflows.json`; n8n's execution history and the configured Sheet show remote progress. The worker never logs email bodies or secrets.

## Important limitation

This is a local integration scaffold, not an already-connected production service. Gmail, Sheets, and email credentials, the target Sheet, recipient, n8n production webhook URL, Docker Desktop, and firewall routing must be configured on the PC. The current public reporting policy may still require operator setup in the original reporting module if that module is used outside this n8n route. Test with synthetic messages before activating a real customer mailbox.
