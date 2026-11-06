> Sanitized archive of a fictional assessment. Synthetic test evidence only. No audit, certification or compliance claim.

# Readiness dashboard

**Assessment type:** Public preliminary (unverified). This dashboard summarizes only the supplied intake and working artifacts. Sender identity, organization identity, claims, controls, and evidence are not independently verified. All organization and system statements below are **unverified/client-reported** unless explicitly labeled as a missing-evidence observation or proposed work. This is preparation work only; it is not a certification, audit opinion, or compliance determination. No readiness or conformity score is assigned.

## Established facts

The established facts here describe what supplied materials say; they do not establish the underlying conditions.

- The sender requests an ISO/IEC 27001:2022 readiness review and management report. **Unverified/client-reported** (`working/client-brief.json`, sourced there to `client-input/synthetic-evidence.md`).
- The sender describes Atlas Bridge Services as a customer-support software provider with 55 employees, an office in Tashkent, and remote work within Uzbekistan. The identity and workforce are **unverified/client-reported** (`working/client-brief.json`).
- Proposed scope includes development, hosting, operation, and support of the platform; its cloud database; central identity and email; repositories and deployment pipeline; laptops; remote access; backups; and security logging. Customer-managed systems are proposed exclusions. Hosting region and supplier responsibilities remain unresolved. **Unverified/client-reported proposed scope** (`working/client-brief.json`; `working/isms-readiness-plan.md`).
- Reported figures and conditions, all **unverified/client-reported** (`working/client-brief.json`; consolidated in `working/evidence-register.md`, `working/technical-controls-assessment.md`, and `working/corrective-action-register.md`):
  - 64 enabled accounts against 55 employees; six accounts appear to belong to former staff; the remaining difference is unexplained. MFA is recorded for 42 accounts; administrator MFA coverage is unknown; two administrator accounts are reported shared, with no documented privileged access review.
  - Daily backups are reported. The latest restoration exercise reportedly failed because the encryption key could not be accessed; no later successful restoration or approved recovery objectives are documented in the supplied claims.
  - A scan summary reportedly lists two critical and nine high-severity findings, including four internet-facing findings more than 45 days old. Affected versions and technical validation are not supplied. Seven laptops reportedly have overdue updates. Revocation of an application secret committed to a private repository is unconfirmed; the secret is not requested or reproduced here.
  - Logs are reportedly retained for 14 days without a documented review schedule. Unusual administrator sign-ins reportedly lack an investigation record; a draft incident procedure reportedly has not been exercised. The intake says unauthorized access has not been established.
  - A security policy reportedly awaits management approval; an asset inventory lists 46 of 55 laptops; the risk register was reportedly not reviewed for a year. Training is reported for 33 of 55 employees. Four former-employee accounts reportedly were disabled and five laptops updated, without supporting records or independent closure checks.
- The sender reports that no approved risk treatment plan, Statement of Applicability, internal audit report, or management review minutes were supplied. This is a statement about the intake, **not proof** that such items do not exist (`working/client-brief.json`; `working/evidence-register.md`).
- The requested initial improvement plan is framed as within six weeks of an agreed kickoff; no kickoff date is confirmed. **Unverified/client-reported request** (`working/client-brief.json`).
- The supplied workflow manifest records the five upstream artifacts as `reused-validated` (`logs/demo-runs/demo-run/manifest.json`). However, `working/technical-controls-assessment.md` says the evidence-register routine failed precheck and did not produce its artifact, while `working/evidence-register.md` is present and the manifest marks it validated. This is an unresolved discrepancy in supplied artifact metadata; it does not independently validate the underlying claims.

**Measured readiness:** No verified readiness measurements or supported scoring method are present in the supplied materials. The figures above are client-reported counts only; no percentages, aggregate score, or conformity rating is calculated.

## Missing evidence

The following is **not evidenced in supplied materials**. This means supporting records were not provided here; it does not prove a control, record, or activity is absent.

- Confirmation of the claimed organization and sender authority; approved ISMS boundary; system and data flows; cloud hosting region; supplier responsibilities; and decision on customer-managed systems.
- Current personnel and account exports reconciled to each other; explanation of account differences; administrator inventory; MFA coverage including administrators; individual privileged access, approvals, access reviews, and records for reported account changes.
- Backup coverage, configuration and monitoring; protected evidence of key recovery arrangements (no key or credential); approved recovery objectives; restoration results and evidence of any successful follow-up exercise.
- Scan details, affected assets and versions, technical validation, exposure, remediation and closure records; patch evidence; and safe confirmation of secret revocation/rotation and repository remediation.
- Log-retention configuration, assigned review responsibilities and records, triage/investigation evidence for reported sign-ins, and approved and exercised incident-response records. No supplied material establishes unauthorized access.
- Reconciled asset inventory; approved policy and role records; current risk assessment and treatment; Statement of Applicability; internal audit and management review evidence; corrective-action records where applicable.
- Training roster, completion records, content and dates supporting the reported 33-of-55 figure; workforce roles; refreshers; administrator-specific training; and learning or exercise outcomes.
- Source records and independent closure checks for reported remediation, where available.
- Resolution of the evidence-register status discrepancy noted above.
- Agreed kickoff date, confirmation of the six-week timing, and management report delivery date.
- Evidence to support any claim of ISO/IEC 27001 conformity or certification; none is established by these materials.

## Assumptions

- Reported counts, findings, controls, incidents, and remediation are treated only as client-reported leads for validation. Overlapping specialist documents derive from the same supplied brief and are not independent corroboration.
- Listed systems are candidates for review because the intake proposes them; final scope, ownership, operation, and boundaries require confirmation.
- Records absent from the supplied materials may exist elsewhere. Their absence here is not proof of control absence or failure.
- The six-week period is a requested planning horizon from a kickoff that has not been confirmed; no delivery date, owners, or action dates are established.
- No score is assumed because there is no validated measurement baseline or scoring method in the supplied materials.

## Recommendations

1. Confirm organizational authority, scope, boundaries, hosting region, suppliers, dependencies, data flows, and proposed exclusions before treating the scope as settled.
2. Establish an evidence register that tracks each requested item as client-reported, received, reviewed, and verified, recording source and verification method. Reconcile the manifest and technical-assessment status discrepancy.
3. Ask authorized client owners to validate the reported identity/access, vulnerability, patch, secret-revocation, and sign-in concerns. Do not infer exploitation or unauthorized access; handle secret status only through a protected process and do not copy credentials into readiness artifacts.
4. Obtain backup and key-recovery evidence, agree recovery objectives, and document a restoration exercise. Confirm incident procedures and retain exercise and follow-up evidence.
5. Reconcile assets, workforce, accounts, and training; obtain policy, risk-treatment, supplier, access, audit, and management-review records as applicable after the scope is confirmed.
6. Confirm kickoff and delivery expectations, then agree action owners and dates with the client. Use the requested six-week horizon only after confirmation.

**Limitations:** This dashboard relies on `working/client-brief.json`, `working/isms-readiness-plan.md`, `working/evidence-register.md`, `working/technical-controls-assessment.md`, `working/awareness-training-plan.md`, and `working/corrective-action-register.md`, plus the supplied read-only workflow manifest for artifact status. The underlying intake, organizational identity, systems, configurations, logs, and records were not independently examined. No certification, audit opinion, or compliance determination is made.
