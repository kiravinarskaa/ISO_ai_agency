# Client Manager contract

This contract applies to every routine in this kit. `ROLE.md` defines responsibility boundaries, `SCHEDULE.md` defines routine eligibility, and each routine's `SKILL.md` defines its procedure. The member's workspace rules take precedence where they are stricter.

## Six routines

The active routine IDs are exactly: `client-intake`, `client-input-review`, `client-clarification-draft`, `project-handoff`, `client-progress-update`, and `final-readiness-delivery`. Each ID must match its folder and the YAML `name` in its `SKILL.md`.

## Project paths and ownership

A project root is `D:\AgentOps\agency\projects\<project-id>`. Its standard folders are `client-input`, `working`, and `outputs`. Never guess a project ID or read outside the selected project root. If the root or required folder is unavailable, record a blocker and stop the dependent work.

Routines write only their named outputs:

| Routine | Owned output |
|---|---|
| `client-intake` | `working/client-brief.json` |
| `client-input-review` | `working/missing-information.md` |
| `client-clarification-draft` | `working/client-clarification-draft.md` |
| `project-handoff` | `working/project-handoff.json` |
| `client-progress-update` | `working/client-progress-update-draft.md` |
| `final-readiness-delivery` | `outputs/final-client-delivery-draft.md` |

Do not overwrite source documents or another routine's output. Preserve source files. Write drafts locally only; no routine sends or uploads anything.

## Evidence and communication

Do not invent facts or evidence. Keep known facts, assumptions, and missing information separate. Preserve source paths and client wording when useful. Do not represent an assumption as confirmed. Do not create technical-control conclusions; use approved specialist outputs for specialist findings. The agency provides certification-readiness preparation only and never certifies clients. No output may say or imply that the client is certified or guaranteed certification.

## Runtime and records

Use `scripts/guard.mjs` before a scheduled routine. After an eligible guard result, follow `WORK-CYCLE.md` and the routine entry in `work-profile.json`. Preserve generic run state, leases, logging, and work-cycle behavior. Run records contain paths and concise status only; do not copy personal or confidential client details into the shared run log.

For project-scoped records, set `CLIENT_MANAGER_PROJECT_ID` to the established project ID for the run, or pass the existing `--log` override explicitly. Both guard and routine records then use `D:\AgentOps\agency\projects\<project-id>\logs\client-manager-runlog.jsonl`. `--log` takes precedence. The project ID is validated and must name an existing project folder. Leave `client-manager\runlog.jsonl` intact.

A routine succeeds only when its owned artifact exists, is readable, meets its completion criteria, and its run is recorded. If required inputs are missing, access is denied, or evidence cannot support a claim, leave existing source material untouched, write any independent useful artifact allowed by the routine, and record a specific blocker. Never conceal a partial result as complete.
