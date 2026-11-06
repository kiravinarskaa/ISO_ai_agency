> Sanitized archive of a fictional assessment. Synthetic test evidence only. No audit, certification or compliance claim.

# Proposed ISMS scope and readiness plan

**Assessment type:** Public preliminary, unverified. This preparation artifact is based only on client-reported statements in `working/client-brief.json`. Sender identity, organization identity, claims, controls, and evidence have not been independently verified. This is not a certification, audit opinion, or compliance determination. No ISO/IEC 27001 conformity score is assigned.

## Established facts

The following are facts about what the intake reports, not independently established facts about the organization or its systems. Source for each item: `working/client-brief.json`, whose `known_facts` attribute the statements to `client-input/synthetic-evidence.md`.

- The sender requests an ISO/IEC 27001:2022 readiness review and a consolidated management report. **Unverified/client-reported.**
- The sender describes an organization providing customer support software, with 55 employees, an office in Tashkent, and remote work within Uzbekistan. The claimed organization name is Atlas Bridge Services. **Unverified/client-reported; identity is not verified.**
- The sender proposes scope covering development, hosting, operation, and support of a customer support platform and related cloud database, central identity and business email, source repositories, deployment pipeline, employee laptops, remote access, cloud backups, and security logging. The platform is reported to store customer contact information, support conversations, and service records. **Unverified/client-reported proposed scope.**
- Customer-managed systems are proposed exclusions that still require review. Cloud hosting region and supplier responsibility boundaries are unresolved. **Unverified/client-reported.**
- The sender requests an initial improvement plan within six weeks of an agreed kickoff; the intake says no kickoff date has been confirmed. **Unverified/client-reported request.**
- The sender reports account and MFA discrepancies, shared administrator accounts, a failed restoration exercise, unverified vulnerability and patch findings, an application secret in a private repository with revocation unconfirmed, logging and incident response gaps, incomplete governance and asset records, training gaps, and limited reported remediation. **All unverified/client-reported; none are treated as verified control failures or verified fixes.**
- The intake explicitly requests that missing evidence not be treated as proof that a control is absent, exploitation not be assumed, and no unsupported compliance score be assigned. **Unverified/client-reported request.**

## Missing evidence

“Not supplied” below means not present as supporting evidence in the supplied intake; it does not establish that a control, record, or activity does not exist.

- **Organization and authority:** evidence to confirm the claimed organization, the sender's authority, and the appropriate organizational boundary.
- **Scope and context:** confirmed services, processes, locations, interfaces, interested parties, customer obligations, legal or contractual requirements, and a documented decision on customer-managed systems. The hosting region, cloud suppliers, service responsibilities, and dependencies also need confirmation.
- **Assets and information:** a reconciled asset inventory, information flows and classifications, system/service ownership, data locations, and relevant supplier and customer interfaces.
- **Identity and access:** account export reconciled to current personnel, explanation of the reported account difference, administrator inventory, MFA coverage including administrators, individual privileged accounts, access approvals and review records, and supporting evidence for reported account remediation.
- **Resilience:** backup configuration and monitoring evidence, encryption-key custody and recovery process without exposing secrets, approved recovery objectives, restoration test records, and evidence of a successful recovery where one has occurred.
- **Technical security:** scan details, affected versions, validation records, exposure and remediation status for reported findings, patch status, and evidence supporting any closure. Do not request, reproduce, or place any secret or credential in this plan; obtain safe revocation status through an appropriate protected process.
- **Monitoring and incident management:** retention configuration, documented log review responsibilities and records, triage of the reported unusual sign-ins, incident procedure approval and exercise records. The intake does not establish unauthorized access.
- **ISMS governance and assurance:** approved policies, defined roles and authority, current risk assessment and treatment records, Statement of Applicability, internal audit evidence, management review evidence, and corrective-action records, where applicable.
- **People and remediation:** training records and planned refreshers, asset reconciliation, evidence for reported training and remediation, and independent closure checks where available.
- **Timing and deliverables:** agreed kickoff date, confirmation of the requested six-week improvement-plan timing, and management report delivery date.

## Assumptions

These are planning assumptions only and require confirmation before they are used to set a formal ISMS boundary or commit to timing.

- The client's described platform and related listed services are candidates for the ISMS scope because that is what the intake proposes; inclusion is not yet approved or verified.
- The claimed 55 employees and Uzbekistan work locations are planning inputs only, not verified organizational facts.
- Customer-managed systems may be outside the eventual boundary only after dependencies, interfaces, contractual responsibilities, and risks are documented and the exclusion is justified.
- The requested six-week period is a client-requested planning horizon measured from an agreed kickoff, not a confirmed due date or assurance that work can be completed in that period.
- Reported findings, incidents, controls, and remediation remain unverified until appropriate records and, where needed, direct validation are reviewed.

## Recommendations

1. **Confirm the boundary and context.** Validate the organization and decision authority through the appropriate client process. Map services, locations, people, information, assets, suppliers, customer interfaces, and dependencies. Document the proposed inclusion of development, hosting, operation, and support; resolve cloud region and supplier responsibility boundaries; and justify any customer-managed exclusions.
2. **Establish an evidence baseline.** Request the records listed under Missing evidence, with an owner and status for each request. Preserve source, date, and verification method. Distinguish “not supplied,” “client reported,” and “verified” in working records; absence from this intake alone is not evidence of control absence.
3. **Triage reported time-sensitive exposure safely.** Have authorized technical and service owners validate reported account, administrator access, MFA, vulnerability, patch, secret-revocation, and sign-in concerns. Do not assume exploitation or unauthorized access. Handle any credential only through the client's protected incident or secrets process; never copy it into readiness artifacts.
4. **Review resilience and response readiness.** Confirm backup coverage and key recovery arrangements, agree recovery objectives, and plan a documented restoration exercise. Approve and exercise an incident response process, capturing outcomes and follow-up actions.
5. **Build the ISMS foundation.** Once the boundary and context are confirmed, organize risk assessment and treatment, policy and role approvals, asset and access records, supplier oversight, awareness, operational evidence, and applicable documented information. Determine the Statement of Applicability from the confirmed risk and requirements process rather than presuming control applicability.
6. **Plan assurance activities.** After the system is sufficiently defined and evidence is available, plan an internal audit and management review, track findings through corrective action, and verify closure with evidence. These are readiness activities and do not confer certification or establish audit conformity.
7. **Sequence work against an agreed kickoff.** Use the requested six-week horizon only after confirming the kickoff and capacity. A practical order is: boundary and evidence requests; validation and urgent triage; risk and treatment planning; governance and implementation evidence; internal audit and management review preparation; then a management improvement plan with open evidence gaps and owners. Set dates and owners with the client after kickoff; none are established by the supplied intake.

**Limitations:** This plan relies solely on `working/client-brief.json`. The intake references upstream client statements but no underlying source conversation, technical records, or control evidence were reviewed. All organizational and system claims remain unverified/client-reported. No certification, audit opinion, or compliance determination is made.
