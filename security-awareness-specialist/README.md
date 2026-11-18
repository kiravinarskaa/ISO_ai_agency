# Security Awareness Specialist

This role prepares a security-awareness training plan based on the selected project's supplied information, workforce context, and documented evidence gaps. Recommendations remain proposals until the organization approves and implements them.

## Place in the agency workflow

This workspace is the fifth role in the active roster declared by [`agency/demo/run-demo.mjs`](../agency/demo/run-demo.mjs). It runs after Client Manager and ISMS Readiness Planner and owns `working/awareness-training-plan.md`. Its declared inputs are `working/client-brief.json` and `working/isms-readiness-plan.md`. The local launcher or Railway worker handles intake and dispatch; the shared runner controls sequencing, project access, validation, and status records.

This is a project-file planning role, not a social-media publishing service. It does not email, publish, browse, or enroll employees. Read [`ROLE.md`](ROLE.md), [`CONTRACT.md`](CONTRACT.md), [`AGENTS.md`](AGENTS.md), and [`routines/prepare-awareness-plan/SKILL.md`](routines/prepare-awareness-plan/SKILL.md). See the [repository architecture](../ARCHITECTURE.md) for the full system map.
