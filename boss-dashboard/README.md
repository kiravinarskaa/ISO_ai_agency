# ISO 27001 AI Agency Boss Dashboard

This app is the Boss Command Center for the eight-employee agency. It is a small
Node.js web app with plain HTML, CSS, and browser JavaScript so the page stays
easy to read and change.

## What it does

- Lets the Boss sign in with one password.
- Adds tasks to a Google Sheet task ledger.
- Shows task status, priority, employee, deadline, blocker reason, and result link.
- Filters tasks by employee, status, priority, and date.
- Shows eight employee cards and daily/weekly totals based on recorded tasks.
- Exports the visible task list as CSV.
- Saves Project Manager and employee chat history in another Sheet tab.
- Answers task questions from the ledger itself. If a reason or result is absent
  from the Sheet, the answer says so instead of guessing.

The app checks the Sheet every 15 seconds. "Active" means that an employee has
an In Progress task recorded. The dashboard does not itself run Codex. A separate
Codex worker still needs to claim queued tasks and update their status.

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

The first row of each new tab contains its column names. Do not rename or reorder
those headings after the app has connected.

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
