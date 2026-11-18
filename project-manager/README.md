# Project Manager

The Project Manager checks the specialist outputs, records limitations and blockers, and writes the consolidated management report. It does not replace human review or make certification decisions.

## Place in the agency workflow

This is the eighth and final role in the active roster declared by [`agency/demo/run-demo.mjs`](../agency/demo/run-demo.mjs). It owns `working/final-agency-report.md`; Node.js then validates and packages the synthesis as `working/final-agency-report.docx`. It reads the declared specialist artifacts. The local launcher or Railway worker handles intake and dispatch; the shared runner controls sequencing, project access, validation, manifests, and reporting handoff.

The report distinguishes supplied statements from established workflow facts, identifies missing evidence, and describes proposed work without claiming it was implemented. The local completion notice does not attach the DOCX. The separate Railway email outbox can send a validated customer DOCX with Boss copied when explicitly enabled. Read [`ROLE.md`](ROLE.md), [`CONTRACT.md`](CONTRACT.md), [`AGENTS.md`](AGENTS.md), and [`routines/coordinate-readiness-project/SKILL.md`](routines/coordinate-readiness-project/SKILL.md). See the [repository architecture](../ARCHITECTURE.md) for the full system map.
