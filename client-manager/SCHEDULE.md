# Client Manager schedule

This table is authoritative for routine eligibility. The guard reads the row values. Routine instructions contain no clock times or budget values. All local time windows and budget values below are retained from the shipped schedule and reassigned to the new routine purposes.

| routine | days | fire | window_start | window_end | key | budget | browser |
|---|---|---|---|---|---|---|---|
| `client-intake` | `mon-fri` | 06:45 | 06:30 | 09:45 | `YYYY-MM-DD` | 25 min | never |
| `client-input-review` | `mon-fri` | 07:30 | 07:15 | 11:30 | `YYYY-MM-DD` | 12 min | never |
| `client-clarification-draft` | `mon-fri` | 08:15 | 08:00 | 12:00 | `YYYY-MM-DD` | 30 min | never |
| `project-handoff` | `mon-fri` | 11:00 | 10:45 | 15:00 | `YYYY-MM-DD` | 45 min | never |
| `client-progress-update` | `mon-fri` | 13:30 | 13:15 | 17:00 | `YYYY-MM-DD` | 35 min | never |
| `final-readiness-delivery` | `fri` | 16:00 | 15:45 | 19:00 | `YYYY-Www` | 35 min | never |

Allowed day values are `mon-fri`, a named weekday, `first-weekday`, `last-weekday`, or `off`. Day keys use local dates, weekly keys use ISO weeks, and monthly keys use calendar months. Budgets, windows, and cadence changes are member-owned. Routine files must not restate these values.
