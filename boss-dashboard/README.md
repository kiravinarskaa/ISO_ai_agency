# Boss Command Center

The Boss dashboard is deployed as a public Railway service. It is a Node.js web app with a plain HTML/CSS/JavaScript interface for tasks and reporting; it does not run the eight employee workflow. A separate private Railway worker claims only explicitly marked full synthetic runs. The deployed workflow does not depend on a locally running dashboard or launcher. See [worker setup](../CLOUD-WORKER.md).

## Current application areas

- **Overview:** current run and task status, agency team summaries, and time-based counts from recorded rows.
- **Client requests:** staged or classified email inquiries visible through their task records.
- **Projects & tasks:** assigned task records, project/run scope, filters, status and blockers.
- **Team:** the eight active roles and their recorded work.
- **Reports:** validated PM outputs available from recorded `Run Outputs` data.
- **History:** superseded or archived run visibility. Archiving changes dashboard visibility; it does not delete, cancel, or rewrite task, execution-ledger, report, or worker-queue records.
- **Ask the team:** model-backed answers from the selected task scope, with role-specific scope. The Project Manager may see the full selected run. The model receives read-only context and has no action tools.

Dashboard status is a reflection of stored records. It does not by itself prove that a model is currently running, that a report was delivered, or that a recipient received email. Chat answers use available sheet evidence and should identify missing or truncated context.

## Google Sheets data

The application reads the existing eight-column `Ledger` as a read-only view of agency role executions. Manual dashboard assignments and worker stage rows use `Task Ledger`; ordinary manual rows remain unexecuted by the worker. The worker creates or updates these other tabs as needed:

- `Chat History` — saved dashboard chat messages.
- `Run Outputs` — final report data from completed worker runs.
- `Dashboard Archives` — run visibility archive/unarchive events.
- `Email Delivery` — separate cloud delivery statuses when email delivery is configured.

Do not rename/reorder existing tab headers after the application connects. `Task Ledger`, agency `Ledger`, and `Run Outputs` represent different records and should not be treated as interchangeable.

## Railway deployment

The dashboard service uses this directory as its Railway Root Directory (`/boss-dashboard`) and runs `npm start`. Configure the private variables `BOSS_PASSWORD`, `SESSION_SECRET` (at least 32 characters), `GOOGLE_SPREADSHEET_ID`, and `GOOGLE_SERVICE_ACCOUNT_JSON`. Its health-check path is `/api/health`. The worker is a separate service with its own model configuration, optional Gmail intake, and persistent project Volume; see [CLOUD-WORKER.md](../CLOUD-WORKER.md).

Never commit passwords, service-account JSON, OAuth tokens, or private keys. Share the service-account email on the intended spreadsheet with Editor access.

## Local development (optional)

This section is for development or troubleshooting only. It does not start or control the Railway deployment. From this directory, configure a local environment and start a development instance:

```powershell
npm install
$env:BOSS_PASSWORD = "choose-a-long-private-password"
$env:SESSION_SECRET = "replace-with-at-least-32-random-characters"
$env:GOOGLE_SPREADSHEET_ID = "your-spreadsheet-id"
$env:GOOGLE_SERVICE_ACCOUNT_JSON = Get-Content "service-account.json" -Raw
npm start
```

Open `http://localhost:3000`. Keep the service-account file outside the repository. The service account needs the Sheets API enabled and Editor access to the spreadsheet.

## Chat and refresh behavior

Task summaries refresh while the page is visible. The current task snapshot is cached briefly across browsers; archive history and full-sheet chat context use separate caches. The UI may not show short-lived stages that begin and finish between polls.

**Ask the team** uses the configured Ollama endpoint for a natural-language response grounded in the selected dashboard task scope and recent chat messages. It makes a model request only when the user submits a question. No write or email tools are given to the model. Provider and configuration failures are surfaced as errors.

The workbook chat context can include `Ledger`, `Task Ledger`, `Chat History`, `Run Outputs`, `Dashboard Archives`, and `Email Delivery`. It reads existing tabs without creating missing ones. All rows are read, while evidence sent to the model is bounded per tab; row counts, unavailable tabs, and truncation are disclosed. Answers are prompted to cite tab names and source row numbers. Sheet content can be stale and cannot independently verify email delivery.

For dashboard AI chat, configure `OLLAMA_BASE_URL`, `OLLAMA_API_KEY`, and `DASHBOARD_CHAT_MODEL` on the public dashboard service. This uses Ollama Cloud directly. Reuse Railway variable references where possible; never put keys in source files.

## Run history

Current shows the newest recorded run for each project plus all queued/running work. History contains superseded and manually archived runs. The run selector scopes metrics, cards, reports, tasks, CSV export, and new chat questions. Existing saved chats retain their original contents.

Use **Manage run history** to preview, archive, or restore eligible runs. Queued/running work is rejected by the server. Archive events are appended to `Dashboard Archives`; underlying task and execution rows remain intact. A run with a blocked stage remains blocked even if other stages completed. Archive/restore changes visibility only.

## Verification and limitations

The project includes automated tests for API behavior and page interaction. A DOM-model interaction test is not a substitute for visual browser, accessibility, mobile, or live Railway verification. Verify the active deployment and use a separate test Sheet before testing archive mutations or worker flows. A dashboard health response confirms service availability, not Google Sheets connectivity or successful AI work.

