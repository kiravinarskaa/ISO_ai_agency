> Sanitized archive of a fictional assessment. Synthetic test evidence only. No audit, certification or compliance claim.

# Evidence register

**Assessment type:** Public preliminary, unverified. This register uses only `working/client-brief.json` and `working/isms-readiness-plan.md`. It does not verify the sender, claimed organization, statements, controls, or evidence. Missing evidence is not proof that a control is absent. This is preparation work, not a certification, audit opinion, or compliance determination. No conformity score is assigned.

## Established facts

These are facts about what the supplied materials report; all underlying claims remain **unverified/client-reported**. The client brief attributes its statements to `client-input/synthetic-evidence.md`.

- The intake requests an ISO/IEC 27001:2022 readiness review and management report. (`working/client-brief.json`, `known_facts`; reiterated in `working/isms-readiness-plan.md`.)
- The sender describes a customer support software organization with 55 employees, an office in Tashkent, remote work within Uzbekistan, and a platform holding customer contact information, support conversations, and service records. The claimed name is Atlas Bridge Services; identity is not verified. (`working/client-brief.json`, `known_facts`.)
- Proposed scope includes platform development, hosting, operation and support, cloud database, identity and email, repositories, deployment pipeline, employee laptops, remote access, backups, and security logging. Customer-managed systems are proposed exclusions; hosting region and supplier responsibility boundaries remain unresolved. (`working/client-brief.json`, `scope`, `systems`, `missing_information`; `working/isms-readiness-plan.md`.)
- The sender reports 64 enabled accounts versus 55 employees, six apparently former-staff accounts, unexplained remaining difference, MFA recorded on 42 accounts, unknown administrator MFA coverage, two shared administrator accounts, and no documented privileged access review. (`working/client-brief.json`, `known_facts`.)
- The sender reports daily backups, a failed last restoration exercise due to inability to access an encryption key, no documented subsequent successful restoration, and no approved recovery objectives. (`working/client-brief.json`, `known_facts`.)
- The sender reports scan results of two critical and nine high findings, four internet-facing findings older than 45 days, no affected versions or technical validation records supplied, seven laptops with overdue updates, and a repository secret whose revocation is unconfirmed. The secret is not reproduced here. (`working/client-brief.json`, `known_facts`.)
- The sender reports 14-day log retention without a documented review schedule, unusual administrator sign-ins without investigation record, and a draft incident procedure not exercised; unauthorized access is not established. (`working/client-brief.json`, `known_facts`.)
- The sender reports policy awaiting management approval, inventory covering 46 of 55 laptops, a risk register not reviewed for a year, and no supplied approved risk treatment plan, Statement of Applicability, internal audit report, or management review minutes. Training is reported for 33 of 55 employees without refresher schedule or administrator-specific training. (`working/client-brief.json`, `known_facts`.)
- IT is reported to have disabled four former-employee accounts and updated five laptops, but supporting records and independent closure checks are unavailable. These are reported actions, not verified fixes. (`working/client-brief.json`, `known_facts`.)
- The sender requests that missing evidence not be treated as proof of absent controls, exploitation not be assumed, and unsupported scoring not be used. (`working/client-brief.json`, `known_facts`.)

## Missing evidence

The supplied materials are intake claims and a readiness plan, not underlying control records. The following are **not evidenced in supplied materials** as supporting records; this does not establish absence:

- Proof of claimed organization, sender authority, approved organizational boundary, and confirmed scope, including customer-managed exclusions, hosting region, suppliers, responsibilities, and dependencies.
- Reconciled personnel and account export; explanation for account discrepancy; administrator inventory and MFA coverage; individual privileged accounts, approvals, review records, and evidence of reported account changes.
- Backup configuration and monitoring, protected key recovery arrangements, approved recovery objectives, restoration test records, and successful restoration evidence if completed.
- Scan report details, affected versions, technical validation, exposure and remediation status; laptop patch evidence; safe confirmation of secret revocation (without requesting or reproducing the secret).
- Log retention configuration, review responsibilities and records, triage/investigation of reported sign-ins, and approved and exercised incident response records.
- Approved security policy, roles, current risk assessment and treatment records, Statement of Applicability, internal audit evidence, management review evidence, and corrective action records as applicable.
- Reconciled asset inventory, training records and refreshers, and supporting records plus independent closure checks for reported remediation.
- Confirmed kickoff date, six-week improvement-plan timing, and management report delivery date.
- Evidence supporting any claim of ISO/IEC 27001 conformity or certification; none is established by these materials.

## Assumptions

- No organization, sender, control, incident, or remediation claim is treated as verified. The brief’s own `assumptions` array is empty; the planning assumptions below are drawn from the plan and remain unconfirmed.
- The listed systems are candidates for scope because the intake proposes them; the boundary is not approved or verified.
- The reported 55 employees and locations are planning inputs only.
- Customer-managed systems may be excluded only after dependencies, interfaces, responsibilities, and risks are confirmed and the exclusion justified.
- The requested six-week horizon is measured from a kickoff that has not been confirmed; it is not an agreed deadline.

## Recommendations

1. Confirm organization and decision authority through the client process, then document scope, interfaces, locations, suppliers, responsibilities, and any justified exclusions.
2. Request and track the supporting records listed above. For each item record source, date, and verification method; distinguish client-reported, not supplied, and verified.
3. Have authorized owners validate reported access, vulnerability, patch, secret revocation, and sign-in concerns. Do not infer exploitation or unauthorized access; handle any credential only through a protected client process.
4. Obtain recovery arrangements and objectives and document a restoration exercise; confirm incident procedure approval and exercise evidence.
5. Once scope is confirmed, assemble governance, risk treatment, asset, access, supplier, training, and operational records. Determine applicable controls through the client’s risk and requirements process.
6. Confirm kickoff and timing before planning against the requested six-week period. No owners, dates, measurements, or closure status are established here.
