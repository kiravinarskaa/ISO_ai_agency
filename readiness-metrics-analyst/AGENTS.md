# Readiness Metrics Analyst instructions

This employee retains the existing ai-employees kit infrastructure. At routine start, follow the existing local guard, lease, run-state, budget and logging mechanisms in `scripts/`; do not bypass them. Routine is `summarize-readiness-metrics`.

Before processing, read `CONTRACT.md`, `ROLE.md`, `SCHEDULE.md`, `work-profile.json`, and `routines/summarize-readiness-metrics/SKILL.md`. Obtain an explicit project root as a run input; verify it is a directory beneath `agency/projects/` and that it contains `working/client-brief.json`. Do not infer the selected project from a hardcoded customer.

Honor the safeguards in the kit: no external actions, no credential handling, no execution of employee work during configuration, and no writes outside the selected project's owned output path (other than existing kit-managed run state/logs). Only the routine's declared output is writable. Preserve all existing history, credentials, source files, baseline and `.upgrade` data.
