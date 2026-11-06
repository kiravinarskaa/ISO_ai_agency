# Controlled unattended university demo

The unattended lane is disabled until both local policies below are created. Ordinary senders remain in the existing intake and onboarding flow.

## One-time synthetic sender policy

Use one mailbox controlled by the demonstration team. The setup records the operator's explicit exact-address ownership attestation. The Gmail poller additionally requires exactly one trusted `mx.google.com` Authentication-Results header with SPF, DKIM, and DMARC passing and aligned to the From domain, an exact From address match, the configured marker in the plain-text body, and no attachments.

```powershell
node agency/start-agency.mjs setup-demo-sender --email <controlled-test-address> --marker ISO27001-UNIVERSITY-DEMO --by <operator-name> --attest-sender-controlled true --per-sender-daily 2 --global-daily 5
```

The fixed upper bounds are three messages per sender per UTC day and five demo projects globally per UTC day. Five projects bound specialist usage to at most 40 employee executions per UTC day. A duplicate Gmail message ID consumes capacity once.

## One-time reporting policy

After creating the sender policy, use its printed policy ID. Confirm the configured ledger and the fixed agency mailbox; the ownership flag is an operator attestation and must only be used after checking both destinations belong to the agency.

```powershell
node agency/integrations/reporting/reporting.mjs setup-demo-policy --by <operator-name> --sender-policy-id <printed-policy-id> --confirm-spreadsheet-id <configured-ledger-id> --confirm-to csagencyai@gmail.com --attest-agency-owned
```

This creates a no-overwrite policy file. It does not create credentials, change OAuth scopes, or change ACLs. Existing dedicated Sheets-write and Gmail-send grants must already be available and valid; otherwise external reporting fails closed.

## Normal operation

```powershell
node agency/start-agency.mjs
```

For unattended project creation, the test email must be a deterministic new-client ISO readiness request and include the exact marker in its plain-text body. The Client Manager must classify it as `new_client_request`. The report is published only from a completed, validated eight-agent manifest whose project is tied to that sender-policy authorization. Confirmation is sent only to `csagencyai@gmail.com`.

Policy setup and decisions are audited separately from human approvals. The ordinary `publish --approve` and `approve-send --approve` paths remain unchanged. An uncertain Gmail send remains ambiguous and is never retried automatically.
