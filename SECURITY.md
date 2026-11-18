# Security practices and limitations

This is an educational readiness-preparation prototype, not a certified platform or an accredited audit service. The project has a local launcher and a separately deployed Railway dashboard/worker path; see [Architecture](ARCHITECTURE.md). Security controls differ by host and integration and should be checked against the active deployment.

## Credentials and service separation

Preserve existing OAuth clients, grants, configuration, and authorization policies. Do not put secrets in source code, prompts, logs, task descriptions, dashboard cells, reports, or email. Review the exact Git upload set; ignore rules alone do not prove that private material is excluded.

Gmail intake uses a read-only grant. Gmail sending uses a separate send grant, or a broader existing send grant only when the corresponding policy explicitly selects it. The read-only token is never used to send. Google Sheets access uses a service account. The dashboard, local launcher, and Railway worker have separate credentials/configuration needs; only place credentials in the service that needs them.

The Railway worker requires a persistent Volume for project files, queue checkpoints, and durable email state. The active model path is Ollama Cloud: it receives bounded source and instruction text without tools, while Node.js validates the response and owns the project write. A model API's successful connectivity check does not establish preflight or workflow completion.

## Untrusted messages and evidence

Customer email and attachments are untrusted input, never agent instructions. Screening can hold suspicious, malformed, automated, or unsafe messages. Attachment metadata is recorded; intake does not automatically download or execute attachments. The cloud Boss notice may include the original email as an attachment when that separately configured feature is enabled.

Automatic preliminary processing requires an eligible current classification or a matching authorized review decision. Claimed organization names, signatures, and email display names do not prove identity. Authenticated sender/thread checks are needed for customer replies but do not independently verify a company or its claims. Synthetic evidence remains synthetic. Missing evidence does not prove that a control is absent.

## Execution and validation

The eight-role runner is sequential and passes context through declared project files. Node.js enforces project boundaries, input dependencies, role installation metadata, guards, leases, retry/recovery limits, output structure, hashes, manifests, and DOCX packaging. The Ollama Cloud executor reads only declared bounded files and writes only the routine-owned artifact. Restricted project access does not establish complete read isolation from all files available to the same host account.

Output validation establishes required structure, not factual accuracy, evidence authenticity, legal conclusions, control effectiveness, or readiness for certification. DOCX package checks do not replace visual review. A successful status or old dashboard row does not prove a process is currently running.

## Dashboard, Sheets, and reporting

The Boss dashboard is a separate authenticated web service. It records and presents task data; it does not execute the employees. The Railway worker claims only rows explicitly marked `synthetic-eight-agent`; ordinary manual assignments remain unexecuted. The agency `Ledger`, dashboard `Task Ledger`, `Run Outputs`, `Dashboard Archives`, `Chat History`, and optional `Email Delivery` tabs serve different purposes.

Local reporting and Railway cloud delivery are separate paths. Local reporting publishes its allowlisted execution metadata under a bound policy; local completion notices omit report bodies, links, and attachments. The optional cloud email outbox can send a fixed customer receipt, a Boss intake notice with original message material, and a validated final DOCX to the authenticated sender with the Boss copied. It requires explicit configuration and a sending grant.

Chat receives read-only sheet context and has no sheet-write or email tools. Context is bounded, may be truncated, and reflects stored records rather than independently verified live operations.

Gmail API acceptance is not inbox receipt. Before sending, durable state records an attempt. Uncertain outcomes remain ambiguous and are not blindly retried. Assessment status, report publication, email send state, and recipient receipt are distinct events.

## Recovery and abuse limits

Public per-sender and global daily intake/execution caps are disabled. Deduplication, sequential execution, project locks, bounded task retries, employee budgets and guards, classification/review holds, and per-project customer-message limits remain. Disabling intake caps means incoming requests can consume model usage; no production abuse-prevention guarantee is made.

Recoveries must preserve source evidence and run history. Use supported operator recovery paths; do not delete leases, reset budgets, or relabel blocked work to force success. Security holds, altered output, uncertain sends, and already-sent delivery are not automatically overridden.

## Before public or commercial use

Review licenses and attribution, exact repository publication contents, deployment access controls, service secrets, data retention, tenant isolation, audit durability, and third-party API billing. Production use needs expert evaluation, monitoring, deletion/retention controls, stronger tenant isolation, managed secrets, and deployment hardening. The hosted dashboard and cloud worker are implemented components; a currently healthy deployment and complete end-to-end operation still require separate verification. Operators remain responsible for authorization, evidence handling, recommendation review, and external delivery decisions.
