> Sanitized archive of a fictional assessment. Synthetic test evidence only. No audit, certification or compliance claim.

# Corrective-Action Register

**Assessment type:** Public preliminary (unverified). Preparation work only; this is not a certification, audit opinion, or compliance determination. The source brief labels its details fictional synthetic test evidence. Every client-derived statement below is **unverified/client-reported**. Sender identity, organization identity, claims, controls, and evidence have not been independently verified. No control effectiveness conclusion is made.

## Established facts

- The client brief requests ISO/IEC 27001:2022 readiness preparation and states an initial plan is desired within eight weeks of an agreed kickoff; no kickoff date is supplied. This is an unverified/client-reported objective, not a confirmed commitment. Source: `working/client-brief.json` (`client_objective`, `deadline`).
- The brief proposes scope covering analytics platform development, hosting, operation, and support, with devices, identity management, cloud infrastructure, and supporting processes; customer-managed networks are described as proposed exclusions requiring review. This is unverified/client-reported and not an approved boundary. Source: `working/client-brief.json` (`scope`).
- The brief lists an application and cloud database, identity and email service, source repositories and deployment pipeline, 24 employee laptops, backup storage, and centralized security logging. These are unverified/client-reported discovery prompts, not a validated inventory or evidence of implemented controls. Source: `working/client-brief.json` (`systems`).
- The brief reports an office in Tashkent, remote employees in Uzbekistan, and cloud-hosted production services; it says the provider and hosting region are not documented in that source. These statements are unverified/client-reported. Source: `working/client-brief.json` (`locations`, `known_facts[3]`).
- Specialist materials identify evidence to obtain and propose follow-up work; they do not provide underlying approved governance records, technical operating records, training records, test results, or independently verified evidence. Sources: `working/isms-readiness-plan.md` (“Missing evidence”); `working/evidence-register.md` (“Missing evidence”); `working/technical-controls-assessment.md` (“Missing evidence”); `working/awareness-training-plan.md` (“Missing evidence”).

## Missing evidence

- Verification of the client-reported identity, legal entity, contacts, workforce and system descriptions, and authority to approve scope.
- Agreed kickoff date, confirmed deliverables, and confirmation of the reported eight-week target.
- Client-approved ISMS boundaries, interfaces, dependencies, relevant obligations, and rationale for any exclusions, including customer-managed networks.
- Validated service, information, asset, identity, endpoint, repository, supplier and location inventory; architecture and data flows; cloud provider, hosting region, and responsibility boundaries.
- Approved governance and risk basis: applicable obligations, assigned responsibilities, policies and procedures, objectives, risk method and assessment, treatment decisions, and Statement of Applicability if developed.
- Dated records or appropriate samples supporting any claimed technical or organizational practice, including access, authentication, endpoint, vulnerability/patching, development/change, backup/restore, logging/monitoring, incident, supplier/cloud, and continuity areas where applicable.
- Validated training audience and role information, approved content and objectives, applicable training requirements, and records of delivery, attendance/completion, feedback, or learning outcomes if any.
- Evidence request/receipt history and source records that substantiate client-reported counts and claims. Absence from these supplied materials does not establish that records do not exist.

## Assumptions

- The source brief and specialist restatements are treated only as unverified/client-reported information. Synthetic descriptions and counts are not verified facts.
- The proposed scope and exclusions are starting points for client review, not approved boundaries.
- Action ordering below is a dependency-based work sequence for gathering and evaluating evidence, not a risk rating or statement of control deficiency severity.
- No owners, target dates, status measurements, risk scores, implementation status, or effectiveness results are assigned because none are established in the supplied materials.
- No certification or audit-conformity status is inferred.

## Recommendations

| Order | Corrective action / proposed work | Evidence needed to close or reassess | Basis and priority rationale |
|---|---|---|---|
| 1 | Confirm the mandate, authorized client contacts, intended deliverables, kickoff date, and planning target. | Client confirmation and supporting mandate/timing records. | Prerequisite for scheduling and assigning subsequent work; the brief reports an eight-week target but gives no kickoff date. `working/client-brief.json`; `working/isms-readiness-plan.md`. |
| 2 | Validate the organization and agree the ISMS scope, boundaries, interfaces, dependencies, obligations, and any exclusions. | Client-approved scope and exclusion rationale, with relevant context and obligation records. | Needed before deciding which systems and evidence are relevant; scope is currently a client-reported proposal. `working/client-brief.json`; `working/isms-readiness-plan.md`; `working/evidence-register.md`. |
| 3 | Build and validate the inventory and architecture for in-scope services, information, systems, devices, identities, repositories, suppliers, locations, and data flows; resolve cloud provider, region, and responsibility boundaries. | Validated inventory, architecture/data-flow materials, and cloud responsibility/source records. | Provides the basis for evidence requests and technical review; listed systems are not a validated inventory. `working/client-brief.json`; `working/technical-controls-assessment.md`. |
| 4 | Request and review the applicable governance, obligations, and risk-planning records. Record what exists, what is missing, and what remains unverified without presuming implementation. | Applicable obligation records; approved policies/procedures and responsibilities; risk method, assessment and treatment decisions; Statement of Applicability if developed. | The specialist plan identifies these as missing evidence and they are needed to ground subsequent readiness work. `working/isms-readiness-plan.md`; `working/evidence-register.md`. |
| 5 | For each in-scope technical practice the client describes, request dated source records and suitable samples; map each item to the approved scope and retain unsupported status as unknown/missing. | Relevant configurations and dated access, change, vulnerability, backup/restore, logging, incident, supplier/cloud or other operating records, where applicable. | No technical control evidence is established by the supplied intake. This is evidence collection and review, not a finding that a control is absent. `working/technical-controls-assessment.md`. |
| 6 | Validate workforce roles, audience, training requirements, approval responsibilities, and existing awareness activity; develop a client-reviewed training approach only after that validation. | Confirmed audience/role information, applicable requirements, approved content, and any existing delivery/completion/feedback records. | The awareness plan is proposed; the supplied sources do not establish that training has occurred. `working/awareness-training-plan.md`; `working/isms-readiness-plan.md`. |
| 7 | Maintain an evidence and action tracker recording requested/received items, source, date, scope relevance, unresolved gaps, and client-confirmed ownership or target dates. Reassess priorities after the client approves criteria and supplies context. | Evidence register updates and client-confirmed assignments/criteria, if provided. | Enables traceable follow-up while avoiding invented owners, dates, or risk scores. `working/evidence-register.md`; `working/isms-readiness-plan.md`. |

**Limitations:** This register consolidates only the supplied client brief and four specialist artifacts. It does not verify client statements or underlying evidence, and it does not determine compliance, audit conformity, or certification. Proposed actions should be confirmed with the client and updated only when supporting evidence is supplied.
