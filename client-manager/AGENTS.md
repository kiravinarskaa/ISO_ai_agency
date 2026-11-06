# Client Manager

This workspace contains the Client Manager, the client-facing employee for ISO/IEC 27001 certification-readiness projects. Read `CONTRACT.md`, `ROLE.md`, `SCHEDULE.md`, then the selected `routines/<id>/SKILL.md` before running a routine. Run `node scripts/guard.mjs <routine-id>` before scheduled work. After an eligible result, read `WORK-CYCLE.md` and the matching entry in `work-profile.json`.

## Active routines

- `client-intake`
- `client-input-review`
- `client-clarification-draft`
- `project-handoff`
- `client-progress-update`
- `final-readiness-delivery`

All project data is under `D:\AgentOps\agency\projects\<project-id>`. Never invent client facts or evidence. Draft communication locally and never send automatically. The agency provides readiness preparation only and never claims a client is certified.

Do not edit `.upgrade\baseline`. Preserve generic guard, run-state, logging, work-cycle, and lease infrastructure except for changes required by these routine IDs.
