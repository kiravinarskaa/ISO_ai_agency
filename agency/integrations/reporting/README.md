# Reporting and customer email bridge

Updated 6 November 2026. Run examples from `D:\AgentOps\agency\integrations\reporting`, or prefix the module path when running from the workspace root.

## What is published

The ledger has exactly these columns: `run_id`, `project_id`, `employee_id`, `routine`, `execution_status`, `artifact_basename`, `validation_status`, `timestamp`. Progress and final publication upsert the same eight employee rows for a run. Different run IDs retain separate attempts. Values use RAW input with formula-leading text protection; writes are reread for confirmation. The bridge publishes metadata, not customer email bodies or report contents.

Automatic reporting requires an operator-created workflow policy bound to the configured spreadsheet, tab and internal recipient. Public preliminary local completion alone is not publication permission. The launcher prepares quietly; manual preparation displays rows for review. The existing eight-column execution ledger does not meet every task-ledger field in the course assignment.

Internal completion mail includes employee statuses but no dashboard link, full report or attachment. The current template explicitly labels the message fictional/test and must be reviewed before real-customer operation. Customer notices use separate composition and recipient checks.

## Reuse credentials and configuration

Keep existing OAuth client files, tokens, configuration and authorization policies. Do not recreate or rotate them to resolve an access error. Sheets, Gmail send and read-only intake have distinct scope requirements. Customer mail can explicitly reuse the existing Gmail send grant; it never sends through the read-only intake grant.

```powershell
node reporting.mjs check-config
```

The checker verifies configuration, private-directory ACLs and its credential inventory. Expected explicit private-directory access is the current Windows account, SYSTEM and Administrators. Inspect ACL errors in the operator account; never print file contents. A missing optional customer-send client/token pair is not a runtime requirement when the customer policy explicitly selects the existing `send` grant and that grant remains usable.

For a grant genuinely never authorized, the supported interactive commands are `authorize-sheets`, `authorize-send` and `authorize-customer-send`. They require existing suitable client configuration and refuse to overwrite tokens. Do not authorize again merely because an existing grant is inaccessible. No new paid service, account or expanded scope is assumed.

## Standing policies

After verifying agency ownership of the configured targets, an operator can create policies using the supported setup commands. These refuse to overwrite existing policy files. Preserve existing policies and review changes rather than deleting them to force setup.

```powershell
node reporting.mjs setup-automatic-workflow-policy --by "Operator Name" --confirm-spreadsheet-id "<configured-id>" --confirm-to "<configured-internal-recipient>" --attest-agency-owned true
node reporting.mjs setup-customer-contact-policy --by "Operator Name" --confirm-from "<agency-mailbox>" --attest-customer-clarifications true --include-notifications true --sending-grant send
```

The first binds progress, final reporting and internal completion delivery. The second permits fixed clarification replies plus acknowledgment and completion notices, explicitly reusing `gmail-send-credentials.json` and `gmail-send-tokens.json`. Omit `--sending-grant send` only when intentionally using the separately configured customer-send grant. No token is copied and no fallback occurs silently.

## Customer responses

- Acknowledgment follows successful Client Manager classification and the security gate.
- Clarification asks readable questions from approved missing-information labels; at most two messages per project are allowed.
- Completion requires a validated completed manifest and is attempted after internal reporting delivery. It arranges review/delivery; the report is not attached.

Bodies omit internal project references, links, raw reports, secrets and sensitive personal data. Messages remain in the original authenticated thread. Valid message/thread IDs, sender provenance and aligned authentication are required. The DKIM parser supports `header.i` as well as `header.d`; failed or ambiguous authentication is not overridden. Claimed identity remains unverified even when message authentication passes.

Each acknowledgment and completion notice uses a separate persistent dedupe ledger. Clarification replies are routed back only after their sender/thread/authentication checks. Attempting or ambiguous sends are not blindly retried. A Gmail send ID establishes API acceptance, not recipient receipt. Customer failures are recorded separately from successful internal reporting. Existing completed workflows are not retroactively notified; use a fresh request to verify newly enabled settings.

## Manual recovery commands

The direct runner does not call reporting. Normally restart the launcher after successful local recovery: it can reconcile a newer completed manifest after exhausted `AGENT_VALIDATION_INCOMPLETE` attempts. Independent final validation and policies remain required. Ambiguous or sent delivery is not automatically replayed.

For a deliberate operator-driven workflow:

```powershell
node reporting.mjs prepare "<absolute-project-manifest-path>"
node reporting.mjs status --plan <plan-id>
node reporting.mjs publish --plan <plan-id> --approve --by "Operator Name" --confirm-spreadsheet-id "<configured-id>"
node reporting.mjs prepare-email --plan <plan-id>
node reporting.mjs approve-send --plan <plan-id> --approve --by "Operator Name" --confirm-to "<configured-internal-recipient>"
node reporting.mjs verify --plan <plan-id> --by "Operator Name"
```

Review the prepared content and exact configured targets. `verify` checks internal receipt through the read-only integration; its recipient logic is limited to the configured agency workflow, not a universal customer receipt verifier. Reconcile uncertain sends before any resend.

## Storage and known limitations

Private OAuth material, plans, send state, receipts and audit logs remain local. Current ignore patterns are not proof that all authorization policy files are excluded from Git; review the exact publication set. Locks are local to one machine, and logs are not tamper-resistant. Native report visual review, tenant isolation, retention and deployment hardening remain separate concerns.

Live Sheets publication, internal completion receipt and customer acknowledgment were demonstrated in the session. A complete clarification exchange and customer completion receipt are not both confirmed. Current tests cover selected code paths and do not establish production readiness.
