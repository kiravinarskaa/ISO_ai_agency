# Historical implementation review

This is an earlier inspection snapshot from 6 November 2026, not current integration status. Later work confirmed an eight-output recovery, Word generation, live reporting and a customer acknowledgment. See the root README, SECURITY.md and CUSTOMER-RESPONSES.md for current behavior and limitations. Do not infer a present credential failure solely from the historical observations below.

# Implementation review — 6 November 2026

The upstream markfulton/ai-employees template uses employee folders, routine instructions, Node.js guards and file-backed run logs. This project already adapts that structure to eight ISO readiness employees. Preserve those workspaces and credential references; no language migration is required.

The active eight-role contract is `agency/demo/run-demo.mjs` ROSTER, not the Phase 1 intake-only employee registry. Each employee also has CONTRACT.md, ROLE.md, routine instructions and guards. Execute sequentially: Client Manager > ISMS Readiness Planner > Requirements & Evidence Specialist > Technical Controls Analyst > Security Awareness Specialist > Corrective Action Specialist > Readiness Metrics Analyst > Project Manager. Each consumes the preceding validated project artifacts. The Project Manager consolidates observed statuses; completion requires validated outputs, not just successful process exit.

Required: Node.js, existing Codex CLI login, local project storage, existing Gmail read grant, existing Sheets and Gmail send grants for publication/delivery. Optional: n8n integration; it is not necessary for the launcher. Employees may write only their own workspace and selected project through the existing restricted runner. They must not read integration private directories or perform external publication themselves. The reporting bridge owns those actions and publishes only its eight-column schema.

## Run and verification

From D:\AgentOps:

```powershell
node agency/integrations/gmail/gmail.mjs check-config
node agency/integrations/gmail/gmail.mjs verify
node agency/integrations/reporting/reporting.mjs check-config
node agency/demo/run-demo.mjs --project ISO27001-001 --dry-run
node agency/start-agency.mjs
```

Use an existing operator-controlled synthetic sender policy; configure it only after the mailbox owner supplies the sender and ownership attestation. See `node agency/start-agency.mjs setup-demo-sender` arguments in the launcher. Do not invent ownership attestations. Send a fictional-company request from that mailbox after the initial inbox baseline. Label every supplied evidence document **synthetic test evidence**. Include scope, organization profile, systems, training practices and requested timescale. Existing demo and reporting policies must bind the exact configured sender, spreadsheet and internal completion recipient. Preserve the public preliminary lane's security holds.

Verify the run manifest has all eight validated outputs, Sheets confirms exactly eight upserted rows, and Gmail returns a send acceptance ID. Replaying intake must reuse the existing message/project record and publication keys. Ambiguous email sends require reconciliation, never blind retry. The existing reporting README documents prepare/publish/send/verify commands for operator-driven recovery.

## Observed blockers

Gmail check-config reported CREDENTIALS_MISSING at its existing configured reference; the private directory is inaccessible in this session, so absence versus access denial has not been independently established. Reporting check-config reported ACL_READ. No credential was changed, recreated or rotated. An authorized host operator must restore access to existing private configuration and rerun the commands above. No live end-to-end success is claimed. No new service is required.

Completion email composition now excludes dashboard links and report contents and explicitly labels the prototype test result. Existing stored prepared emails need fresh preparation before delivery; do not send historical prepared messages containing links.
