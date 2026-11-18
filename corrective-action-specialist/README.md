# Corrective Action Specialist

This role consolidates the readiness project's gaps into a prioritized corrective-action register with proposed owners, targets, and closure evidence. It does not claim that remediation has been completed.

## Place in the agency workflow

This workspace is the sixth role in the active roster declared by [`agency/demo/run-demo.mjs`](../agency/demo/run-demo.mjs). It runs after the Planner, Evidence, Technical Controls, and Awareness outputs and owns `working/corrective-action-register.md`. Its declared inputs are the readiness plan, evidence register, technical assessment, and awareness plan. The local launcher or Railway worker handles intake and dispatch; the shared runner controls sequencing, project access, validation, and status records.

This is a readiness action-planning role, not a customer support desk. It does not send replies, change client systems, or close actions on the client's behalf. Read [`ROLE.md`](ROLE.md), [`CONTRACT.md`](CONTRACT.md), [`AGENTS.md`](AGENTS.md), and [`routines/build-corrective-action-register/SKILL.md`](routines/build-corrective-action-register/SKILL.md). See the [repository architecture](../ARCHITECTURE.md) for the full system map.
