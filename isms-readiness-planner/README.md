# ISMS Readiness Planner

The Planner proposes an ISMS scope, records constraints and unknowns, and turns supplied information into a readiness roadmap. It does not declare compliance or certification.

## Place in the agency workflow

This workspace is the second role in the active roster declared by [`agency/demo/run-demo.mjs`](../agency/demo/run-demo.mjs). It runs after Client Manager and owns `working/isms-readiness-plan.md`. Its declared input is `working/client-brief.json`. The local launcher or Railway worker handles intake and dispatch; the shared runner controls sequencing, project access, validation, and status records.

The Planner works from the selected project files only. It labels client statements, unknowns, proposals, and missing evidence distinctly. It does not email, publish, browse, or change customer systems. Read [`ROLE.md`](ROLE.md), [`CONTRACT.md`](CONTRACT.md), [`AGENTS.md`](AGENTS.md), and [`routines/prepare-readiness-roadmap/SKILL.md`](routines/prepare-readiness-roadmap/SKILL.md) for the role instructions. See the [repository architecture](../ARCHITECTURE.md) for both execution paths.
