# Requirements and Evidence Specialist

This role maps documented requirements and client-provided records to available, missing, or unverified evidence. It prepares an evidence register; it does not certify controls or infer that missing evidence proves a control is absent.

## Place in the agency workflow

This workspace is the third role in the active roster declared by [`agency/demo/run-demo.mjs`](../agency/demo/run-demo.mjs). It runs after Client Manager and ISMS Readiness Planner and owns `working/evidence-register.md`. Its declared inputs are `working/client-brief.json` and `working/isms-readiness-plan.md`. The local launcher or Railway worker handles intake and dispatch; the shared runner controls sequencing, project access, validation, and status records.

The role uses only declared project files and writes its single owned artifact. It does not perform SEO/AEO publishing or external communication as part of this ISO workflow. Read [`ROLE.md`](ROLE.md), [`CONTRACT.md`](CONTRACT.md), [`AGENTS.md`](AGENTS.md), and [`routines/build-evidence-register/SKILL.md`](routines/build-evidence-register/SKILL.md). See the [repository architecture](../ARCHITECTURE.md) for the full system map.
