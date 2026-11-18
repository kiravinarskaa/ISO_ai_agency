# Client Manager

The Client Manager receives and classifies supplied readiness information and produces the structured client brief consumed by the other roles. It does not decide certification, verify sender identity, or publish reports.

## Place in the agency workflow

This workspace is the first role in the active roster declared by [`agency/demo/run-demo.mjs`](../agency/demo/run-demo.mjs). The local launcher or Railway worker handles intake and dispatch; the shared runner controls sequencing, project access, validation, and status records. Its routine is `client-intake`; its owned output is `working/client-brief.json` in the selected project. Input files depend on whether the project came from a local project folder or staged Gmail intake.

Customer contact is owned by the local reporting integration or the separately configured Railway email outbox. The Client Manager may identify missing information and classify an inquiry; it does not send the reply itself. Claims in messages remain unverified evidence.

## Project layout

Projects are stored beneath `agency/projects/<project-id>`:

- `client-input`: source files and supplied information.
- `working`: the structured brief and downstream role outputs.
- `logs/demo-runs/<run-id>/`: role records and the workflow manifest.

The shared runner executes this role before the Planner, Evidence, Technical Controls, Awareness, Corrective Actions, Metrics, and Project Manager roles. Read [`ROLE.md`](ROLE.md), [`CONTRACT.md`](CONTRACT.md), [`AGENTS.md`](AGENTS.md), and [`routines/client-intake/SKILL.md`](routines/client-intake/SKILL.md) for this role's instructions. The full local and Railway paths are in the [repository architecture](../ARCHITECTURE.md).
