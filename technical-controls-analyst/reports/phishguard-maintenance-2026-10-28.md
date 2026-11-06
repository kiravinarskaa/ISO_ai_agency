# PhishGuard maintenance and source review

**Review date:** 2026-10-29  
**Scope:** Read-only review of the GitHub source identified by the member as corresponding to the Render-hosted prototype, plus a public endpoint access attempt. The GitHub `main` branch is the source basis for this report; current commit observed: [`dbec625f2ccbd324d5473b3a3a7b3554e28388b9`](https://github.com/kiravinarskaa/phishguard-ai/commit/dbec625f2ccbd324d5473b3a3a7b3554e28388b9). The repository API reports it as public, with default branch `main`; latest commit date observed was 2026-10-15.

## Product context

The supplied `PHISHGUARD-CONTEXT.md` describes a university prototype for analyzing suspicious emails. The repository README describes a multi-agent phishing prevention system, with only Agent 1 currently implemented and URL/domain, sender verification, risk/prevention, and incident response agents planned. The deployed code reviewed here implements email triage through Gradio and a cloud LLM. Pricing, customers, testimonials, revenue, and product performance statistics remain undefined or unavailable in the supplied context.

## Verified source findings

- **Repository structure:** The default branch root contains `app.py`, `main.py`, `requirements.txt`, `agents/`, `tools/`, `tests/`, `samples/`, `.gradio/`, `.ven/`, and `.venv/`. The visible test file covers sender, subject, and URL extraction. The root listing did not contain a `.gitignore`, Render manifest, or `Procfile`; this observation does not establish how Render's service settings are configured.
- **Interface and input flow:** [`app.py`](https://github.com/kiravinarskaa/phishguard-ai/blob/main/app.py) exposes a Gradio textbox, rejects whitespace-only submissions, calls `analyze_email`, and renders its result as JSON text. It reads Render's `PORT` environment variable with a local fallback. No authentication, input-size limit, rate limit, or application-level exception handling is visible in this file.
- **LLM behavior:** [`agents/email_triage_agent.py`](https://github.com/kiravinarskaa/phishguard-ai/blob/main/agents/email_triage_agent.py) initializes a Groq client using the `GROQ_API_KEY` environment variable, embeds the submitted email directly in a prompt, requests JSON-object output from a named model, then calls `json.loads` on the returned content. The code does not validate the parsed object against a schema or handle missing credentials, provider errors, empty responses, or JSON parsing errors locally.
- **Email parsing:** [`tools/email_parser.py`](https://github.com/kiravinarskaa/phishguard-ai/blob/main/tools/email_parser.py) uses regular expressions to extract a `From` address, subject, and HTTP(S) URLs. The README explicitly says detailed URL/domain reputation analysis is not implemented in Agent 1. The parser is separate from the Gradio-to-agent path shown in `app.py`.
- **Dependencies and repository contents:** [`requirements.txt`](https://github.com/kiravinarskaa/phishguard-ai/blob/main/requirements.txt) lists unpinned `gradio`, `groq`, and `pytest`. The repository API's recursive tree includes committed virtual-environment content under `.venv/` and `.ven/`, including installed package files and bytecode. This can increase repository size and makes the deployment dependency set less reproducible; no claim is made that it currently breaks deployment.
- **Tests:** [`tests/test_email_parser.py`](https://github.com/kiravinarskaa/phishguard-ai/blob/main/tests/test_email_parser.py) contains three basic extraction tests. The repository includes tests, but they were not run for this review.

## Recommendations (not verified defects)

1. Add a `.gitignore` for virtual environments, bytecode, and local Gradio state, then remove generated environment artifacts from version control in a reviewed source change.
2. Pin and regularly review runtime dependencies; separate test-only packages from runtime requirements if the deployment workflow supports it.
3. Treat pasted email text as untrusted prompt content, define behavior for instruction-like content, and tell users before submission that email content is sent to the configured LLM provider. Confirm the provider's retention and privacy settings before using real business email.
4. Validate LLM output against a typed schema and handle missing configuration, provider failures, and malformed responses with safe user-facing errors. Avoid returning raw provider exception details.
5. Consider input-size, abuse/rate, and access controls appropriate to the prototype's intended audience. The source reviewed does not show these controls; verify Render or other outer-layer controls before concluding they are absent from the deployed service.
6. Expand automated tests to cover malformed or unusual email headers, absent API configuration, provider failures, malformed LLM JSON, schema violations, and prompt-injection-style email content.

## Live service, incidents, and uptime

- **Public endpoint:** The available web retrieval route could not access `https://phishguard-ai-oznk.onrender.com/`. This is an access limitation of this review route and does not establish service failure. The prior local connection attempt recorded on 2026-10-28 also failed from that environment. No successful response, status code, or latency measurement was obtained in this review.
- **Repository-to-service relationship:** The member states the GitHub repository is connected to the Render service. This review treats that repository as the source corresponding to the deployed application, as instructed; it did not independently inspect Render's service settings or confirm the deployed commit.
- **Incidents and uptime:** Unknown. No application logs, monitoring history, or successful availability measurements were available. No incident or uptime claim is made.

## Operating mode

Manual only. No scheduled jobs were registered. No repository source, Render configuration, or production infrastructure was changed; nothing was deployed, published, merged, pushed, or sent. This report is a local maintenance artifact.

## Evidence

- `PHISHGUARD-CONTEXT.md` in this employee kit.
- GitHub repository root and metadata: [kiravinarskaa/phishguard-ai](https://github.com/kiravinarskaa/phishguard-ai) and GitHub API responses for repository metadata, root contents, recursive tree, and `main` commit, read 2026-10-29.
- Source files linked individually in the verified findings above, all read from the repository default branch `main` on 2026-10-29.
- Public endpoint read attempt: `https://phishguard-ai-oznk.onrender.com/`, unavailable through the review's web retrieval route on 2026-10-29.
