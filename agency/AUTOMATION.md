# Automated customer intake and reporting

`start-agency.mjs` runs the workflow controller. It polls Gmail read-only, stages and classifies new requests, runs the Client Manager, and reconciles the result. Eligible new-client requests proceed through eight guarded routines. If required company details are missing, the workflow can send a fixed-form clarification in the original email thread, ingest an authenticated reply into the same project, and resume classification. After all outputs validate, it updates the existing Sheets ledger during execution, publishes the final report rows, and sends the full report to the configured internal recipient.

Customer-provided email text remains untrusted data. The system does not treat organization names or claims as verified. Ambiguous, suspicious, spam, automated, attachment-bearing, or unauthenticated replies stay in review. Clarification email is limited to approved missing-information labels, the same Gmail thread, and two requests per project. It does not send the report to the customer.

## Configure one-time reporting authorization

Review the existing targets in `integrations/reporting/reporting-config.json`. Confirm that the configured spreadsheet and `csagencyai@gmail.com` are agency-owned and intended for internal customer reporting. The dashboard reuses the configured worksheet and its fixed eight-column ledger; live updates upsert by `(run_id, employee_id)` and read back the rows before marking them confirmed.

Place the dedicated Google OAuth Desktop credentials in `integrations/reporting/private/` with these exact filenames, then authorize each grant:

```powershell
Set-Location 'D:\AgentOps\agency\integrations\reporting'
node .\reporting.mjs authorize-sheets
node .\reporting.mjs authorize-send
node .\reporting.mjs check-config
```

The grants are separate: Sheets edit, internal Gmail send, and customer Gmail send. Gmail intake remains on its existing read-only grant. For customer replies, put a separate Desktop OAuth credential file at `private/customer-send-credentials.json`; authorize it after creating the contact policy below. Do not copy credentials or tokens into tracked files.

Create the standing internal reporting authorization after confirming the exact spreadsheet ID and recipient:

```powershell
node .\reporting.mjs setup-automatic-workflow-policy --by 'Authorized Operator' --confirm-spreadsheet-id '<exact configured spreadsheet ID>' --confirm-to 'csagencyai@gmail.com' --attest-agency-owned true
```

This policy authorizes internal dashboard progress, final validated report publication, and delivery of the report to that fixed internal recipient. It does not authorize customer email.

## Configure automated clarification replies

Confirm the sender address of the existing Gmail intake mailbox. The workflow only replies to an original new-client request, in its original thread, after aligned Gmail SPF, DKIM, and DMARC checks on the customer's reply. It sends no attachments and caps clarification requests at two per project.

```powershell
node .\reporting.mjs setup-customer-contact-policy --by 'Authorized Operator' --confirm-from '<exact agency Gmail intake address>' --attest-customer-clarifications true
node .\reporting.mjs authorize-customer-send
```

The customer-send credential has only the Gmail send scope and is separate from the internal report sender. Gmail enforces that the configured `From` address is authorized for that sending account. Uncertain send outcomes are held for review and are never automatically resent.

## Start, stop, and monitor

After both policies and OAuth grants are in place, start the only workflow controller:

```powershell
Set-Location 'D:\AgentOps'
node .\agency\start-agency.mjs
```

The first poll establishes a historical baseline. New messages are processed on the configured interval. Stop with `Ctrl+C`; restart with the same command to resume durable checkpoints. The service is not registered with Task Scheduler automatically.

Workflow state is stored in `agency/state/automatic-workflows.json`, intake linkage in `agency/integrations/gmail/state/client-registry.json`, and clarification linkage in `agency/state/customer-followups.json`. Check for `authorization_required`, `retryable_failure`, `needs_review`, `blocked`, and `onboarding_incomplete` states. A Sheets failure retries boundedly; an uncertain email send requires review.

For Windows startup, use one Task Scheduler task under the dedicated account that owns the private OAuth files. Set the action to `node.exe D:\AgentOps\agency\start-agency.mjs`, working directory `D:\AgentOps`, restart after one minute up to three times, and prevent a second instance from starting.

## Local verification

Run the synthetic test suite from `D:\AgentOps\agency`:

```powershell
node --test .\test\start-agency.test.mjs .\orchestrator\test\orchestrator.test.mjs .\demo\test\*.test.mjs .\integrations\gmail\test\*.test.mjs .\integrations\reporting\test\*.test.mjs
```

The tests use temporary projects and fake Gmail, employee, and Sheets adapters. They do not contact Google, run Codex, send mail, or update the live dashboard.
