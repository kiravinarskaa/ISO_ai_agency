# Security practices and limitations

Updated 6 November 2026. This is an educational readiness-preparation prototype, not a certified platform or an accredited audit service.

## Credentials and Google access

Preserve existing OAuth clients, grants and local configuration. Do not recreate, rotate, copy tokens between integration purposes, or place secrets in source code, prompts, logs, dashboard cells, reports or email.

Gmail intake uses its existing read-only authorization. Reporting uses Sheets access and a Gmail send grant. Customer communication can use a dedicated customer-send grant or explicitly select the existing sending grant through the operator-created customer-contact policy. The selection does not expand OAuth scopes or use the read-only token to send. Internal and customer recipient checks remain separate application controls even when the send grant is shared.

Private directories are checked for explicit FullControl for the current account, SYSTEM and Administrators only. Desktop sandbox access has caused extra account entries and resulting ACL failures during this session. Inspect actual permissions before correcting them; do not disable verification. An ACL failure is not a reason to replace credentials. The same OS account's ability to access secrets remains a limitation of local process isolation.

## Untrusted messages and evidence

Customer email bodies and files are evidence, never agent instructions. Screening holds suspicious instruction-like language, unsafe content and executable or macro-enabled attachment signals. Attachment metadata is recorded; attachments are not downloaded or executed automatically. A classification hold is not cleared by a sufficiently detailed brief.

Automatic preliminary processing requires an eligible classification. Held classifications require a matching operator review decision outside project evidence. Claimed organization names and signatures do not prove identity. Synthetic evidence remains synthetic; reported controls and counts remain unverified unless appropriate supporting evidence is reviewed.

Customer replies require original source-message/thread provenance and sender authentication. The parser requires one Google authentication-results record with passing aligned DKIM, SPF and DMARC evidence. It supports the DKIM `header.i` identity as well as `header.d`, checks each method's result separately, and fails closed on unsupported/missing evidence. This application parser is not a general email identity-verification service or a substitute for expert review.

## Execution and validation

Employees run through Codex CLI with restricted workspace writes and a selected-project grant. Installation receipts, path/symlink checks, employee guards, period budgets, leases and file-backed locks gate execution. Restricted writes do not establish complete read isolation across a shared Windows account.

Preflight writes and reads a unique canary before launch. The runner accepts the expected UTF-8 marker with surrounding whitespace/BOM handling and logs safe startup/exit/timeout/readback diagnostics on failure. It does not retain raw model output in those diagnostics.

Required source files and artifact structures are checked independently of process exit. Hashes and fingerprints constrain reuse. The management report contract requires findings to explain evidence/confidence, issue, business impact, recommended action, rationale, suggested ownership/target, remediation status and closure evidence. These checks establish structure, not factual accuracy, evidence authenticity, legal conclusions or control effectiveness. DOCX package checks are separate from visual review.

## Publication and mail

Standing authorization binds automatic reporting to the configured agency spreadsheet and internal recipient. Manual commands retain explicit approval checks. Model-written text cannot authorize arbitrary external calls. Public preliminary local readiness by itself is not permission to publish; the reporting policy must be valid.

Only the eight allowlisted execution fields are published. Values are written using Sheets RAW mode with formula-leading text handling. Email bodies, customer source documents and secrets are not dashboard data. Writes are confirmed by rereading target rows. Row identity is run plus employee, so recovery attempts can remain as separate history.

Customer acknowledgment, clarification and completion messages require a contact policy and authenticated thread. Bodies contain no internal project reference, links, report contents or attachments. Internal completion bodies contain statuses without dashboard links or report text; the current internal template labels results as fictional tests and requires review before real-customer operation.

Before Gmail send, persisted state records an attempt. Ambiguous outcomes are not blindly retried. API acceptance is distinct from recipient receipt; successful receipt has to be independently demonstrated. Customer notice failure does not establish that a customer was informed merely because internal reporting completed.

## Limits and recovery

Public per-sender and global daily intake/execution caps are disabled at the operator's request. The former dated demo allowance is removed. Sequential execution, deduplication, locks, bounded task retries, employee budgets and period guards, and per-project customer-message caps still apply. Without intake caps, incoming requests can consume more AI usage; no production abuse-prevention guarantee is made.

Recoveries must retain source evidence and run history. The explicit evidence-revision helper verifies changed inputs and prior validated output, archives the lease and preserves original budget use. It does not authorize clearing guards indiscriminately. Completed local recovery can resume reporting automatically after exhausted agent-validation retries; security holds and ambiguous/sent delivery are not automatically overridden.

## Before publication or commercial use

Review the exact Git upload set for credentials, local authorization policies, customer inputs, reports, machine paths, configuration and inherited files. Current ignore rules are not a secret-scan result or a guarantee that every sensitive local file is excluded. Preserve upstream license notices and attribution.

Production use needs stronger tenant isolation, retention/deletion rules, managed secrets, monitoring, tamper-resistant audit records, expert evaluation, deployment hardening and an assessed access-control model. The publicly hosted authenticated Boss dashboard and saved employee chat required by the course are not established features of this local pipeline. The operator remains responsible for authorizations, evidence handling, recommendation review and external delivery decisions.
