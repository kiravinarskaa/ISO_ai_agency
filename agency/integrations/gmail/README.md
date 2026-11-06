# Gmail read-only connector and Client Manager intake

This local Node.js connector uses Google's `googleapis` client and `google-auth-library` OAuth client. It requests only `https://www.googleapis.com/auth/gmail.readonly`; it does not modify messages, send email, or contact clients.

Updated 6 November 2026. This connector is read-only; customer sending belongs to the separate reporting bridge described in [customer responses](../../CUSTOMER-RESPONSES.md).

## Authorization

```powershell
Set-Location 'D:\AgentOps\agency\integrations\gmail'
npm.cmd install --cache .\.npm-cache --no-audit --no-fund
node .\gmail.mjs check-config
node .\gmail.mjs authorize
node .\gmail.mjs verify
```

The OAuth token stays in `private/tokens.json`; credentials and tokens are Git-ignored. Never copy either file into logs or share them. Google's [Gmail Node.js quickstart](https://developers.google.com/workspace/gmail/api/quickstart/nodejs) covers API and OAuth setup.

## Intake routing and classification

The poller accepts external sender addresses without a sender allowlist. Its first real cycle baselines all current Inbox IDs and processes none of them; later cycles screen unseen messages. It excludes the connected agency mailbox, configured agency aliases, obvious automated/list/bounce messages, spam patterns, malformed content, and suspicious instruction or executable-attachment signals. The interval defaults to 60 seconds and can be set from 15 to 3600 seconds. Public daily per-sender and global intake/execution caps are now disabled; duplicate checks, single intake concurrency, task retries and employee guards remain. Old rate-held messages do not automatically requeue.

Non-suspicious, relevant messages are saved in an opaque `INTAKE-*` staging folder and queued as Client Manager `client-intake` tasks through the existing orchestrator. Staging folders are marked and skipped by the filesystem project watcher. The Client Manager task must add an `intake_classification` to its staged brief with one of `new_client_request`, `existing_client_message`, `general_inquiry`, `irrelevant_or_automated`, or `suspicious_or_requires_review`. Sender display names, signatures, and claimed company names are untrusted content and never prove identity.

The local registry is `state/client-registry.json`. It starts with existing project `ISO27001-001` and no authorized senders. Unknown addresses are never routed into it. After a staging task completes, `reconcile` routes an `existing_client_message` only if its sender is already an authorized registry contact. A new-client classification waits for an operator's onboarding decision. `approve-new` records the operator and review basis before creating a unique `CL-<UUID>` project, copies only the source email, keeps the email's organization name explicitly unverified, leaves authorized contacts empty, and enqueues the regular intake task. `link-contact` records a verifier and basis before linking an address or routing its message into an existing project.

Separately, the controlled automatic preliminary lane can run a sufficiently complete `new_client_request` directly from its `INTAKE-*` staging project without treating the sender or organization as verified. If the brief is incomplete and the customer-contact policy plus its explicitly selected send-only grant are configured, it may ask fixed-form questions in the original thread. Replies are linked back to that staging project only when sender address, thread, and aligned Gmail SPF/DKIM/DMARC results match; the response is stored as untrusted input and requeued for classification. This does not create a permanent client project or authorize delivery of the report contents or attachments. Customer notices may explicitly reuse the existing send grant under policy; read-only intake remains unchanged.

Suspicious and malformed messages are saved under `staging/review` without a Client Manager task. Irrelevant/automated messages are marked processed without project routing. Email bodies are untrusted client data and are omitted from poll logs. Attachments are never executed or fetched through the Gmail attachment endpoint; only filename, MIME type, size, and a review flag are stored. OAuth scopes are unchanged.

Public preliminary processing has a separate classification gate: only a currently classified `new_client_request` can proceed automatically. A sufficient brief or a prior `preliminary_ready` workflow state cannot override a held classification. To explicitly authorize a held staged inquiry for preliminary processing, an authorized operator must maintain `agency/state/public-review-decisions.json` outside project folders and record a matching decision, for example:

```json
{
  "schemaVersion": 1,
  "decisions": {
    "INTAKE-example": {
      "projectId": "INTAKE-example",
      "reviewedCategory": "suspicious_or_requires_review",
      "decision": "approved_for_preliminary_processing",
      "by": "Authorized reviewer",
      "reason": "Recorded review basis",
      "at": "2026-11-05T12:00:00.000Z"
    }
  }
}
```

The project ID and current classification must match the decision. The launcher and eight-agent runner both recheck this ledger at dispatch; changing classification invalidates the prior decision. Employee processes receive only the selected project folder, not this review ledger. This decision authorizes preliminary preparation only; it does not verify sender identity, client claims, certification, or compliance.

## PowerShell commands

```powershell
Set-Location 'D:\AgentOps\agency\integrations\gmail'
node .\intake-poller.mjs once --dry-run
# First real cycle establishes the historical baseline only.
node .\intake-poller.mjs once
# Later cycles stage qualifying messages and enqueue Client Manager tasks.
node .\intake-poller.mjs once
node .\intake-poller.mjs registry
node .\intake-poller.mjs reconcile
Set-Location 'D:\AgentOps\agency\orchestrator'
node .\orchestrator.mjs list --status pending
node .\orchestrator.mjs run-one --dry-run
# After reviewing dry-run output, an operator may execute an approved task:
# node .\orchestrator.mjs run-one
Set-Location 'D:\AgentOps\agency\integrations\gmail'
node .\intake-poller.mjs approve-new <message-id> --by <operator-name> --reason <review-basis>
node .\intake-poller.mjs link-contact <message-id> --project-id <project-id> --by <verifier-name> --reason <verification-basis>
node .\intake-poller.mjs poll
node .\intake-poller.mjs poll --interval-seconds 120
```

Polling only enqueues tasks: it does not run a model, create a permanent project automatically, or send messages. Project onboarding and contact links require operator decisions. Polling runs in the foreground; no background service or scheduled task is installed.

## Validation

```powershell
npm.cmd test
node .\gmail.mjs check-config
```

Tests use synthetic messages and temporary workspaces; they do not access Gmail or run a paid model.


## Current extraction and customer authentication behavior

The Client Manager extracts arrays of systems and locations from supplied prose, retaining uncertainty and synthetic labels. Reconciliation can recover explicit source statements omitted from those arrays and refresh previously saved public-intake records. Requests such as ?please confirm operating locations? are not supplied location evidence and generated entries based on such requests are removed. Genuine missing information remains unresolved.

Authenticated customer acknowledgments, clarification and completion notices are handled by the reporting bridge, not this read-only connector. Authentication result parsing accepts aligned passing DKIM `header.i` or `header.d`, requires matching SPF and DMARC results, and rejects unsupported or ambiguous evidence. Existing stored verification flags are not manually forced to true. Use a fresh authenticated message to verify parser changes.

The launcher's terminal hides unchanged historical intake summaries and idle polling. This does not delete projects, clear holds or reset processing history. Persisted source and state records remain authoritative; a quiet terminal is not evidence of successful report delivery.
