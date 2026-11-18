# Technical Controls Analyst

This role analyzes the technical controls and evidence described in the selected readiness project. It records reported conditions, uncertainties, gaps, and recommendations in a technical assessment; it does not probe or change client systems.

## Place in the agency workflow

This workspace is the fourth role in the active roster declared by [`agency/demo/run-demo.mjs`](../agency/demo/run-demo.mjs). It runs after Client Manager and ISMS Readiness Planner and owns `working/technical-controls-assessment.md`. Its declared inputs are `working/client-brief.json` and `working/isms-readiness-plan.md`. The local launcher or Railway worker handles intake and dispatch; the shared runner controls sequencing, project access, validation, and status records.

The role performs a file-based assessment, not website maintenance or production changes. It does not browse, scan, email, or publish. Read [`ROLE.md`](ROLE.md), [`CONTRACT.md`](CONTRACT.md), [`AGENTS.md`](AGENTS.md), and [`routines/review-technical-controls/SKILL.md`](routines/review-technical-controls/SKILL.md). See the [repository architecture](../ARCHITECTURE.md) for the full system map.
