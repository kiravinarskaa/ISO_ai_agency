# ISO 27001 AI Agency Boss Dashboard

This app is the Boss Command Center for the eight-employee agency. It is a small
Node.js web app with plain HTML, CSS, and browser JavaScript so the page stays
easy to read and change.

## Current work and reversible history

The default **Current** view shows the latest recorded run of each project and
all queued or running work, including older runs that still have pending work.
**History** shows superseded and manually archived runs. Standalone manual tasks
are separate runs. The project/run selector scopes metrics, employee cards,
reports, the task list, CSV export and new PM chat questions together. Existing
saved chat messages retain their original contents. History task records and
read-only execution-ledger rows have no edit controls.

Open **Manage run history**, select finished or abandoned runs, and choose
**Archive selected**. A confirmation previews the number of runs and tasks.
To undo, open History, select archived runs and choose **Unarchive selected**.
Unarchiving an older run does not make it the newest run of its project.
Each change is limited to 100 runs. Queued or running work is rechecked by the
server and cannot be archived. If work restarts after an archive, active work
overrides the archive flag so it is visible in Current.

Archive actions append only `Run Key`, `Action`, and `Timestamp` to a separate
**Dashboard Archives** Sheet tab. Neither Task Ledger nor Ledger rows are
deleted, cancelled, marked complete or rewritten by archiving. Reports and
worker queues remain intact. The existing Sheets grant is sufficient; no new
credential or OAuth scope is needed. An unavailable archive tab disables archive
controls and shows a warning instead of dropping task data.

## Test before deploying

Run `node --test boss-dashboard/test/*.test.mjs` from the repository root.
Tests cover visibility/grouping, authentication and origin checks, preview and
cancel, archive/restore, active-work rejection, source preservation, HTML
escaping, and archive-storage failures. The page interaction test uses a DOM
model, not a full browser rendering engine.

For a live check, deploy `feature/dashboard-run-history` as a **separate test
dashboard service** with `/boss-dashboard` as its root and a **copy of the
spreadsheet**. Do not point the test service at the production Sheet. Keep the
existing worker and dashboard services on their existing branches. Test Current,
History, run selection, refresh, archive preview/cancel, archive/restore, and
queued-work rejection; reload and restart the test service to verify persistence.
Also review desktop/mobile layout and keyboard access to the dialog. Merge only
after this live check. No production archive action is required for validation.

## Existing features

- Lets the Boss sign in with one password.
- Adds tasks to a Google Sheet task ledger.
- Shows task status, priority, employee, deadline, blocker reason, and result link.
- Filters tasks by employee, status, priority, and date.
- Shows eight employee cards and daily/weekly totals based on recorded tasks.
- Exports the visible task list as CSV.
- Saves Project Manager and employee chat history in another Sheet tab.
- Answers task questions from the ledger itself. If a reason or result is absent
  from the Sheet, the answer says so instead of guessing.

The app reads the Sheet on opening or signing in, immediately when you return
to its tab or browser window, and every 15 seconds while the page is visible.
It also refreshes after the browser reconnects to the internet.
"Active" means that an employee has
an In Progress task recorded. The dashboard does not itself run Codex. A separate
Railway worker can run the full eight-agent synthetic coursework workflow and
write each stage's progress back to the Sheet. See the repository's
[`CLOUD-WORKER.md`](../CLOUD-WORKER.md) for its separate Railway service setup.

Boss sign-in and the dashboard layout do not depend on Google Sheets or agent
availability. If the Sheet is empty, counts show zero and the task list is empty.
If the Sheet is disconnected, the dashboard still opens with an offline notice;
actions that write tasks or chat are disabled until the connection is restored.

## Google Sheet tabs

The existing Ledger tab remains untouched. It continues to hold the agency's
eight employee execution rows.

On first use, the app creates these tabs if they do not exist:

- Task Ledger for assigned tasks and their status history.
- Chat History for saved chat messages.
- Run Outputs for final reports created by the optional cloud worker.

The first row of each new tab contains its column names. Do not rename or reorder
those headings after the app has connected.

The dashboard also reads the existing eight-column `Ledger` tab, which the
agency workflow updates with each employee's run status. Those rows appear in
the same task list and employee cards as automatic workflow tasks. This is a
read-only view; manual assignments continue to be stored in `Task Ledger`.

## Run on your computer

From this directory, install dependencies and set the environment variables:

    npm install
    $env:BOSS_PASSWORD = "choose-a-long-private-password"
    $env:SESSION_SECRET = "replace-with-at-least-32-random-characters"
    $env:GOOGLE_SPREADSHEET_ID = "your-spreadsheet-id"
    $env:GOOGLE_SERVICE_ACCOUNT_JSON = Get-Content "service-account.json" -Raw
    npm start

Open http://localhost:3000. Keep service-account.json outside this repository.
The service account needs the Google Sheets API enabled and Editor access to the
spreadsheet.

## Deploy on Railway

1. Add a Railway service connected to this GitHub repository.
2. In the service Settings, set Root Directory to /boss-dashboard.
3. Set its start command to npm start (Railway can also read the package script).
4. Add these private variables in Railway's Variables panel:
   - BOSS_PASSWORD
   - SESSION_SECRET (at least 32 characters)
   - GOOGLE_SPREADSHEET_ID
   - GOOGLE_SERVICE_ACCOUNT_JSON (the complete service-account JSON)
5. Deploy. /api/health is the service health-check path.

Never put passwords, service-account JSON, OAuth tokens, or private keys in Git.
The service-account email must be shared on the spreadsheet with Editor access.

## Chat behavior

Chat history is saved in the Chat History tab. Current replies are deterministic
and based on Task Ledger; they do not call another model. The supported questions
cover task counts, running tasks, blocked tasks and reasons, and most completions
this week. Questions outside those records receive an explicit limitation.

## Railway cost note

Railway's Free plan includes a monthly usage credit, not unlimited compute. The
dashboard is request-driven; a separate continuously running Codex worker may use
more than the free credit. Review Railway usage before enabling a worker service.

