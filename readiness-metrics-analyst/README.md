# Readiness Metrics Analyst

This role summarizes readiness only from supported, available project artifacts. It records source basis, coverage, limitations, and gaps; it does not invent a score or treat unverified client statements as measured facts.

## Place in the agency workflow

This workspace is the seventh role in the active roster declared by [`agency/demo/run-demo.mjs`](../agency/demo/run-demo.mjs). It runs after the Planner, Evidence, Technical Controls, Awareness, and Corrective Actions outputs and owns `working/readiness-dashboard.md`. Its declared inputs include the client brief and all preceding readiness artifacts. The local launcher or Railway worker handles intake and dispatch; the shared runner controls sequencing, project access, validation, and status records.

This is not a paid advertising role. It does not spend money or modify client accounts. Read [`ROLE.md`](ROLE.md), [`CONTRACT.md`](CONTRACT.md), [`AGENTS.md`](AGENTS.md), and [`routines/summarize-readiness-metrics/SKILL.md`](routines/summarize-readiness-metrics/SKILL.md). See the [repository architecture](../ARCHITECTURE.md) for the full system map.
