# Customer response workflow

Updated 6 November 2026.

## Responses and timing

The launcher attempts a fixed acknowledgment after successful Client Manager classification and the security gate. Missing required information can trigger a readable clarification request. After a validated assessment and internal report delivery, a customer completion notice arranges report review and an agreed delivery method. Acknowledgment is not instant inbox receipt; it depends on intake processing.

Customer bodies have no internal project reference, dashboard link, report contents or attachment. Questions are drawn from approved missing-information fields. Notices do not claim certification, control effectiveness or verified remediation. Reports remain local until a separate authorized delivery process is agreed.

## Existing sending grant

The active policy can explicitly select `--sending-grant send` to use the existing `gmail-send-credentials.json` and `gmail-send-tokens.json` references. No credentials are copied, rotated or reauthorized. The read-only intake grant is never used to send. Omitted selection retains the separately configured customer-send grant; there is no silent fallback.

```powershell
cd D:\AgentOps
node agency/integrations/reporting/reporting.mjs check-config
```

The general credential inventory still lists absent separate customer-send files. Those two optional files are not required when the customer policy explicitly selects a usable existing send grant. Diagnose ACL or access failures in the operator account without printing credential contents. Preserve existing grants.

After confirming agency ownership of the existing sender mailbox, policy creation can use:

```powershell
node agency/integrations/reporting/reporting.mjs setup-customer-contact-policy --by "Operator Name" --confirm-from "<agency-mailbox>" --attest-customer-clarifications true --include-notifications true --sending-grant send
```

Setup refuses to overwrite an existing policy. Existing clarification-only policies do not silently gain notification permissions. Do not delete a policy or recreate credentials to force setup. If a genuinely new grant is needed, review that need separately; this feature does not require a new account or paid service.

## Authentication and delivery state

Customer sending requires a valid original message ID, thread ID, RFC message ID and authenticated original sender. Message authentication is not verification of organizational identity. The parser supports aligned DKIM `header.i` and `header.d` and checks SPF/DMARC; unsupported or ambiguous cases fail closed. Never edit saved authentication flags to bypass a failure.

One acknowledgment and one completion notice per project use separate persisted dedupe ledgers. Clarification is capped at two per project and supports authenticated same-thread replies. Attempting or ambiguous sends are not blindly retried. A returned Gmail ID confirms API acceptance, not inbox receipt.

Customer delivery failures are recorded separately from internal completion. Existing completed workflows are not retroactively notified, and saved acknowledgment failures are not automatically replayed merely because a policy or grant later becomes usable. Use a fresh inquiry for verification after configuration changes.

## Live verification

Restart the launcher after code/configuration changes. Send a new request from a different mailbox you control, after the initial polling baseline. Confirm acknowledgment receipt; exercise genuinely missing information, its clarification reply and resulting reclassification; then confirm report completion and customer completion notice. Observe polling/restart behavior to verify notices are not duplicated. Keep the test evidence labeled synthetic.

A customer acknowledgment was confirmed received during the 6 November session. A complete clarification exchange and final customer completion receipt are not both confirmed by available evidence. Do not infer them from an internal confirmation email.

```powershell
node --test agency/integrations/reporting/test/customer-notices.test.mjs agency/integrations/reporting/test/reporting.test.mjs agency/test/start-agency.test.mjs
```

The PC must remain awake and the launcher running. Customer email support does not provide cloud hosting, a Boss dashboard or automatic startup.
