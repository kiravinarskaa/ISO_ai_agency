# Eight-employee readiness runner

Updated 6 November 2026. The existing `run-demo.mjs` is the fixed eight-role runner used by both direct local commands and the launcher's eligible public preliminary lane.

```powershell
cd D:\AgentOps
node agency/demo/run-demo.mjs --project <project-id> --dry-run
node agency/demo/run-demo.mjs --project <project-id>
```

Supply an existing project ID. Dry runs inspect setup, dependencies, receipts and guards without executing employees or generating the final Word report. Real runs execute sequentially and may reuse unchanged validated outputs; eight accepted outputs do not imply eight fresh AI calls.

The runner uses Codex CLI workspace-write mode with the employee directory as working directory and the selected project as an additional write grant. It preserves user Codex configuration. It validates required inputs, installation receipts, guard eligibility, restricted-write preflight and output structures. Safe preflight diagnostics distinguish process startup, timeout, exit and readback failures without dumping model output.

To run with a local Ollama model, start Ollama on this PC, pull a model supported by Codex CLI, and set `CODEX_PROVIDER=ollama` plus `CODEX_MODEL=<ollama-model-tag>` in the same terminal before running the demo. The runner selects Codex CLI's `--oss --local-provider ollama` mode and keeps the restricted workspace-write sandbox.

For Railway to use Ollama on your PC, run `node agency/ollama-gateway.mjs` with a generated `OLLAMA_GATEWAY_TOKEN`, then expose only that gateway using Tailscale Funnel: `tailscale funnel --https=443 http://127.0.0.1:11435`. Funnel provides a stable HTTPS tailnet URL and is available on all Tailscale plans; it requires HTTPS/MagicDNS and Funnel enabled for your tailnet. The local gateway checks a bearer token and forwards only `/v1` traffic to Ollama. Never expose Ollama's port 11434 directly. Set Railway `CODEX_PROVIDER=ollama`, `CODEX_MODEL=gpt-oss:20b`, `OLLAMA_BASE_URL=https://<machine>.<tailnet>.ts.net/v1`, and `OLLAMA_API_KEY` to the same random token used by `OLLAMA_GATEWAY_TOKEN`. The PC, Ollama, gateway, and Funnel must stay online while work runs. Test one preflight before adding tasks to the live queue.

To use Groq's hosted model API, set `CODEX_PROVIDER=groq`, `CODEX_MODEL=openai/gpt-oss-20b`, and `GROQ_API_KEY` before starting the worker or demo. A short-lived loopback bridge removes request fields Groq does not support, then streams the Responses API result back to Codex; the Groq key stays in the worker process and Codex receives only a temporary local token. The workspace-write sandbox remains enabled. Store `GROQ_API_KEY` as a Railway service variable, never in a committed file. Provider quotas can block or delay a run; test preflight before processing queued work.

Each attempt writes `logs/demo-runs/<run-id>/manifest.json` and per-employee records. `completed`, `reused-validated`, `blocked`, `failed` and dry-run results have distinct meanings. The current PM roster allows optional specialist paths to support blocker reports, but final overall completion still requires all eight accepted employee outputs.

## Word report

Project Manager writes `working/final-agency-report.md`. New PM executions receive the management report contract: executive summary, source basis, findings/impact, completed work/remediation status, recommendations, roadmap, metrics limitations and employee contributions. Every numbered finding needs evidence/confidence, issue, impact, action, rationale, suggested owner/target, remediation status and closure evidence.

On a real completed run, Node.js packages that synthesis into `working/final-agency-report.docx` with native Word tables and compact source references. It records source hashes, output hash, byte count and pending visual-review status in `manifest.finalReportDocx`. Export failure makes the run incomplete. Existing validated historical reports are not silently rewritten to the new writing contract. Visual inspection remains necessary before external delivery.

## Recovery and reporting

Do not run a second launcher or direct runner while project work is active. Preserve sources and history. A stale in-progress claim needs investigation and supported partial completion, not deletion. A completed daily claim with changed inputs requires a deliberate evidence revision rather than a routine reset.

The operator helper `recover-evidence-revision.mjs <project-id>` previews supported Metrics/PM recovery. `--apply` archives the original lease and reopens partial work only after confirming a prior unchanged validated output and changed source hashes, with original spent budget retained. Its revision allowance is bounded. Confirm no project work is active first. This helper does not recover every kind of failure.

A direct runner command itself does not publish Sheets or send email. With valid authorization, the launcher can detect a newer completed recovery manifest after exhausted agent-validation retries and resume reporting automatically. Already-sent or ambiguous delivery is not blindly replayed. Earlier run IDs remain historical attempts in Sheets; they are not overwritten as though they never happened.

No cloud service or automatic Windows startup is installed by these commands. See [customer responses](../CUSTOMER-RESPONSES.md), [reporting](../integrations/reporting/README.md) and [architecture](../../ARCHITECTURE.md).
