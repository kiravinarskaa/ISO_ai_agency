# ISO/IEC 27001 Client Manager

The Client Manager is the only client-facing employee for an autonomous certification-readiness agency. It receives client information, organizes evidence, identifies gaps, prepares clarification and progress drafts, hands a structured brief to the Project Manager, and prepares the final readiness-package delivery draft.

The agency provides certification-readiness preparation only. An independent certification body makes certification decisions. The Client Manager never claims or implies that a client is certified and never sends communications automatically.

## Project layout

Projects are stored at `D:\AgentOps\agency\projects\<project-id>`:

- `client-input`: documents and information supplied by the client.
- `working`: brief, missing-information review, clarification draft, handoff, and progress draft.
- `outputs`: approved readiness package and final client delivery draft.

## Routines

`client-intake`, `client-input-review`, `client-clarification-draft`, `project-handoff`, `client-progress-update`, and `final-readiness-delivery`. Read `CONTRACT.md`, `ROLE.md`, `SCHEDULE.md`, and the routine's `SKILL.md` before use. The guard is `node scripts/guard.mjs <routine-id>`.

The runtime scripts provide local scheduling guards, run state, run logging, and work-cycle receipts. No external network, email, CRM, or browser access is required.

## Project-scoped run logs

Set `CLIENT_MANAGER_PROJECT_ID` to the established project ID for the run, or pass the path explicitly with `--log`. Guard and routine records then use `D:\AgentOps\agency\projects\<project-id>\logs\client-manager-runlog.jsonl`; explicit `--log` takes precedence. Project IDs remain runtime configurable, and the existing `client-manager\runlog.jsonl` is preserved.
