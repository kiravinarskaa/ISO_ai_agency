> Sanitized archive of a fictional assessment. Synthetic test evidence only. No audit, certification or compliance claim.

# Technical Controls Assessment

**Assessment type:** Public preliminary, unverified. This preparation assessment uses only client-supplied intake content. Every organizational or system statement below is unverified/client-reported; sender identity, organization identity, claims, controls, and evidence have not been independently verified. This is not a certification, audit opinion, or compliance determination. No compliance score is assigned.

## Established facts

These describe what the intake reports, not verified conditions. The source is `working/client-brief.json`, which attributes the statements to `client-input/synthetic-evidence.md`.

- The sender proposes a scope including the customer support web application, cloud database, central identity and email, source repositories, deployment pipeline, employee laptops, remote access, cloud backups, and security logging. The platform is reported to store customer contact information, support conversations, and service records. **Unverified/client-reported proposed scope.**
- The sender reports 64 enabled accounts against 55 current employees, six accounts that appear to belong to former staff, an unexplained remaining difference, MFA recorded for 42 accounts, unknown administrator MFA coverage, two shared administrator accounts, and no documented privileged access review. **Unverified/client-reported.**
- The sender reports daily backups, a failed last restoration exercise because the team could not access the required encryption key, no subsequently documented successful restoration, and no approved recovery objectives. **Unverified/client-reported.**
- The sender reports a scan summary with two critical and nine high-severity findings, four internet-facing findings more than 45 days old, no supplied affected versions or technical validation records, seven laptops with overdue security updates, and an application secret committed to a private repository with revocation unconfirmed. **Unverified/client-reported.** The intake says not to request or reproduce the secret; this assessment does not include it.
- The sender reports 14-day log retention without a documented review schedule, unusual administrator sign-ins without an investigation record, and a draft incident response procedure that has not been exercised. The intake explicitly says unauthorized access has not been established. **Unverified/client-reported.**
- The sender reports a security policy awaiting management approval, an asset inventory listing 46 of 55 laptops, a risk register not reviewed for a year, and no supplied approved risk treatment plan, Statement of Applicability, internal audit report, or management review minutes. **Unverified/client-reported.**
- The sender reports training completion for 33 of 55 employees without a documented refresher schedule or administrator-specific training. Four former-employee accounts were reportedly disabled and five laptops updated; supporting records and independent closure checks are unavailable, so these are reported actions, not verified fixes. **Unverified/client-reported.**

The upstream `working/isms-readiness-plan.md` likewise labels the intake statements unverified and identifies evidence needs. It is a planning artifact, not independent corroboration.

## Missing evidence

“Not evidenced in supplied materials” means supporting evidence was not supplied in the two reviewed working files; it does not prove a control or activity is absent. The manifest also records that the evidence-register routine failed precheck and did not produce its artifact; this supplies no technical control evidence.

- **Identity and privileged access:** current account and personnel exports reconciled to the reported counts; explanation for the discrepancy; administrator account inventory; per-account MFA coverage including administrators; evidence of individual privileged access, approvals, reviews, and the reported account disablement.
- **Backup and recovery:** backup configuration, monitoring and coverage records; protected evidence of encryption-key recovery arrangements (no key or credential); approved recovery objectives; restoration test records and any successful follow-up restoration.
- **Vulnerability and endpoint security:** scan output or equivalent detail, affected products and versions, technical validation, exposure and remediation status for reported findings; patch compliance records and closure evidence for reported laptop updates.
- **Secret handling:** protected confirmation of revocation/rotation status and relevant repository remediation. Do not request, reproduce, or place the secret in this artifact.
- **Logging and incident response:** configuration supporting reported retention, assigned review responsibility and review records, triage/investigation records for the reported sign-ins, approved incident procedure, and exercise records. The supplied material does not establish unauthorized access.
- **Assets and governance:** reconciled asset inventory; approved security policy and roles; current risk assessment and treatment records; Statement of Applicability; internal audit and management review evidence; corrective-action records where applicable.
- **People and remediation:** training records, planned refresher arrangements, administrator-specific training evidence, and independent evidence/closure checks for reported remediation.
- **Scope dependencies:** confirmed hosting region, cloud supplier responsibilities, system and data flows, and a documented scope decision for customer-managed systems.

## Assumptions

- The systems listed in the intake are candidates for technical review because the sender proposed them; their existence, ownership, configuration, and inclusion in a final ISMS boundary remain unverified.
- Reported counts, findings, control operation, and remediation are treated only as client-reported leads for evidence collection. No technical test, configuration inspection, or record validation was performed.
- Evidence not supplied here may exist elsewhere. Its absence from the supplied materials is not proof that a control is absent or failed.

## Recommendations

1. Reconcile identity records to the current workforce; clarify unexplained accounts, inventory privileged accounts, establish individual accountability, confirm MFA coverage (including administrators), and retain access approval and review evidence. Verify reported account actions from records.
2. Validate backup coverage and monitoring, document a secure key recovery process without disclosing keys, agree recovery objectives, and conduct and record a restoration exercise. Capture any follow-up successful restoration evidence.
3. Have authorized technical owners validate reported vulnerabilities, affected versions, internet exposure, and endpoint patch status; document triage, remediation, and closure evidence. Handle the reported repository secret only through the organization’s protected secrets process and obtain safe status confirmation without reproducing it.
4. Define log review responsibilities and retain review records; investigate the reported sign-ins based on evidence. Approve and exercise the incident response procedure. Do not presume a breach or exploitation from the intake.
5. Reconcile the asset inventory and obtain the governance, risk-treatment, audit, management-review, and training records listed above. Distinguish records requested, received, and validated.
6. Confirm hosting region, supplier responsibility boundaries, system/data flows, and customer-managed-system scope decisions before treating the proposed scope as final.

**Limitations:** This analysis reviewed only `working/client-brief.json` and `working/isms-readiness-plan.md`. The underlying intake source, systems, configurations, logs, and supporting records were not independently examined. All claims remain unverified/client-reported. No certification, audit opinion, or compliance determination is made.
