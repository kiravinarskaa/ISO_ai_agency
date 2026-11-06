# Client Manager capabilities

Routine instructions name actions, not vendor-specific tools. This file describes the required capability classes; availability depends on the current harness and must not be guessed.

| Capability | Use |
|---|---|
| `files.read` | Read supplied project files and approved status or specialist outputs. |
| `files.write` | Create or replace only the routine's owned project artifact. |
| `filesystem.list` | Inspect `client-input`, `working`, and `outputs` within the selected project. |
| `clock.local` | Read local time and timezone for the guard and run record. |
| `shell.node` | Run the local guard, run-state, runlog, and work-cycle scripts. |
| `runlog.append` | Record routine outcome using the supplied run logger. |

No browser, mail, CRM, people-search, billing, or external network capability is required for these routines. If a required local capability is unavailable, record the blocker and do not claim the work completed.
