# Cloud customer and Boss email delivery

<<<<<<< HEAD
This is the Railway worker delivery path. It is separate from the older local
launcher notification policy. The operator requested customer receipt replies,
full Boss intake details and automatic validated report delivery with Boss CC.
It is disabled until explicitly configured. No model is used to compose these
emails or choose recipients.
=======
This is the optional Railway worker email-delivery path. It is separate from
the local launcher's customer-notification policy. When explicitly configured,
it sends customer receipts, full Boss intake details, and a validated report
with Boss copied. It is disabled until enabled and configured. No model is used
to compose these emails or choose recipients.
>>>>>>> 3e4218a (Update documentation)

## What happens

1. A newly staged Gmail inquiry queues a fixed receipt acknowledgment to its
   authenticated original sender. It runs before AI classification, on the next
   worker poll; it is not an instantaneous inbox push notification.
2. The Boss receives the sender, subject, received time, available request text,
   attachment metadata and an attached `original-request.eml`. That original
   message preserves the full body and original attachments even if intake text
   was truncated. Messages over the 10 MB original-email bound are held visibly
   instead of silently forwarding partial originals. Automated/bounce messages
   excluded by intake are not notified. Unauthenticated or suspicious customer
   recipients are held for review; the Boss can still receive the intake notice.
3. After all eight stages complete, the DOCX is generated and the report is saved
   to Run Outputs. The host checks the manifest, all eight artifact hashes and
   the DOCX hash before attaching `ISO27001-readiness-report.docx` to a customer
   reply with the Boss in `Cc`. The reply uses the original Gmail thread ID,
   References and In-Reply-To headers. Incomplete, altered or unsafe reports
   cannot be sent. Validation is structural, not a guarantee of factual accuracy.

The customer address is read from authenticated original-message provenance,
never an LLM response, signature, forwarded address or arbitrary Reply-To. The
Boss address is supplied explicitly by the operator. A scope-limited sending
grant is separate from the existing read-only intake grant. Intake continues
read-only. This does not implement the separate coursework daily summary email.

## Railway variables — agent-worker only

| Variable | Value |
| --- | --- |
| `EMAIL_DELIVERY_ENABLED` | `true` when ready to enable the requested delivery policy |
| `BOSS_EMAIL` | The operator-confirmed Boss recipient address |
| `GMAIL_SEND_OAUTH_CREDENTIALS_JSON` | Existing sending OAuth application's credentials JSON |
| `GMAIL_SEND_OAUTH_TOKENS_JSON` | Its matching refreshable OAuth token JSON with `gmail.send` (or an existing broader sending grant) |

Existing `GMAIL_OAUTH_CREDENTIALS_JSON` and `GMAIL_OAUTH_TOKENS_JSON` remain the
read-only intake grant for the same agency mailbox. The sender is taken from
that mailbox's verified profile; Gmail sends using its explicit mailbox userId,
so a mismatched sending account is rejected. `BOSS_EMAIL` is not guessed from
the agency sender or the spreadsheet account. The Boss may be a separate inbox
or the same agency mailbox, as explicitly selected by the operator.

The local reporting integration already supports sending credentials at
`agency/integrations/reporting/private/gmail-send-credentials.json` and
`gmail-send-tokens.json`. If using them, copy their contents privately into the
corresponding Railway variables, without posting them to chat or committing
them. The sending client and tokens must match. Do not reuse a readonly-only
token or expand the intake token's scope. If no usable sending grant exists,
perform the existing reporting send authorization flow for the agency mailbox.
No key, token or customer body is logged by this feature.

If Google rejects the sending refresh token, run on the local PC:

```powershell
node agency/integrations/reporting/reporting.mjs authorize-send-isolated
```

Open the printed consent URL and sign in to the agency mailbox. This reads the
existing `private/gmail-send-credentials.json` in place and saves the new token
in a fresh protected `state/send-authorization-*/gmail-send-tokens.json` path
printed on success. It does not move, overwrite, scan or change permissions of
existing private-directory files. Copy the new token into Railway's
`GMAIL_SEND_OAUTH_TOKENS_JSON` privately, retaining the matching sending client.
The state directory is ignored by Git. Existing local integrations continue to
use their existing files; this command does not switch them to the new token.
No email is sent by authorization.

To check configuration without sending, reading the mailbox or invoking AI:

```bash
node --input-type=module <<'NODE'
import { emailDeliveryConfig } from './agency/integrations/reporting/cloud-email-delivery.mjs';
try {
  const config = emailDeliveryConfig();
  console.log(config.enabled ? 'Email delivery configuration: PASS' : 'Email delivery: DISABLED');
} catch (error) {
  console.log('Email delivery configuration: FAIL', error.code || 'UNKNOWN');
}
NODE
```

This validates local configuration and declared token scopes, not live send
permission or inbox delivery. After deployment, check for `Cloud email delivery
enabled` in startup logs. Testing the full flow requires one new inquiry from a
mailbox you control. Verify receipt in both inboxes and the final DOCX plus Boss
CC separately; API acceptance alone does not establish inbox receipt.

## State, retries and recovery

Events live on the persistent Railway volume at
`/app/agency/projects/.worker-state/email-delivery`. They contain delivery kind,
source identity, a recipient-binding hash and delivery status, not message bodies
or credentials. Only newly staged messages create intake events. Existing inbox
history and previously completed assessments are not automatically emailed when
enabling this feature.

For requests that already have this feature's intake events, a subsequent worker
poll can recover a fully validated report after a crash between generation and
outbox creation. Recipient binding and all artifact hashes are checked again.
This recovery does not include completed requests from before the feature was
enabled. Report generation, Sheet publication and email delivery remain separate
states; a report can be recovered for delivery even if its Sheet update failed.

One receipt, one Boss notice and one final report are allowed per staged request.
Before submitting to Gmail, the event is durably marked `attempting`. Accepted
messages become `sent`; this means Gmail API acceptance, not inbox confirmation.
Explicit 400/401/403/404/429 rejections have up to three delayed attempts. An
uncertain send/timeout or missing Gmail confirmation becomes `ambiguous` and
never automatically resends. A crash with an `attempting` record or a leftover
lock requires operator reconciliation with Gmail Sent. Do not delete delivery
records or locks to force another send; first determine whether it was accepted.
Recipient/configuration changes and altered reports are held for review.

The separate **Email Delivery** Sheet tab records customer receipt, Boss notice
and customer-report statuses independently. Assessment statuses and original
blocker reasons are not overwritten by delivery failures. A failed status-sheet
update does not undo a completed assessment or replay a sent message.

## Tests

```bash
node --test agency/integrations/reporting/test/cloud-email-delivery.test.mjs
```

Tests use synthetic requests, a mock Gmail transport and temporary folders. They
make no real sends, read no private credentials and consume no LLM tokens. They
cover the three-message flow, full original-message attachment, DOCX/CC,
concurrent delivery, restarts, ambiguous outcomes, rejection limits, unsafe
headers, recipient changes and report mutations.
