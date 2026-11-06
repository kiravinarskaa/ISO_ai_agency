---
name: summarize-readiness-metrics
description: Summarize measured readiness from actual available artifacts.
metadata:
  internal: true
---

# Readiness Metrics Analyst

## Invocation inputs
- `project_root`: explicit absolute path to one selected project directory beneath `agency/projects/`. Reject a missing or out-of-root path. Never default to the synthetic demo project.
- Read client brief at `{project_root}/working/client-brief.json`.
- Additional inputs: `working/client-brief.json`, `working/isms-readiness-plan.md`, `working/evidence-register.md`, `working/technical-controls-assessment.md`, `working/awareness-training-plan.md`, `working/corrective-action-register.md`. Read only files that exist; missing required upstream artifacts are blockers, not fabricated findings.

## Guarded execution
The demo runner performs a non-claiming guard inspection before launch. As the executing employee, make the single authorized claim by running `node scripts/guard.mjs summarize-readiness-metrics --json --project-root "<exact selected project root>"` before work. Do not repeat the guard claim. Honor its verdict and returned claim token. With this option, lease/state is stored at `<project root>/.employee-runtime/readiness-metrics-analyst`; the run log is `<project root>/logs/employee-runtime/readiness-metrics-analyst/runlog.jsonl`. Use `scripts/run-state.mjs finish --routine summarize-readiness-metrics --token <returned token> --status completed|partial --root "<project root>/.employee-runtime/readiness-metrics-analyst"` exactly once, then record the outcome with `scripts/runlog.mjs --root "<project root>/.employee-runtime/readiness-metrics-analyst" --log "<project root>/logs/employee-runtime/readiness-metrics-analyst/runlog.jsonl" ...`. Never write runtime state under the employee installation during project-scoped demo execution.

## Evidence rules
Use only provided project files. In the artifact distinguish: **Established fact** (cite file and specific content), **Unknown**, **Proposed work**, and **Missing evidence**. A client statement is attributed as reported, not independently verified. Identify assumptions explicitly. Do not invent controls, policies, records, tests, dates, owners, risk ratings, measurements, or scores. Use “not evidenced in supplied materials” where appropriate. ISO/IEC 27001 certification has not been achieved and must never be asserted.

## Work and output
Perform only this role's mission: Summarize measured readiness from actual available artifacts.

Write Markdown to `{project_root}/working/readiness-dashboard.md`. Create the `working` directory if absent. This is the only project artifact this employee may write. Cite input paths inline. If an input is missing, still produce a concise blocker artifact that names it and does not fill its contents by guess. State limitations and next evidence needed. No network, email, publishing, scheduling, spending, Gmail, or credential actions.
