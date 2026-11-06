# Synthetic demonstration evidence

Fictional organization. This is a sanitized summary of a demonstration scenario, not an original customer email or verified evidence.

The email requests an ISO/IEC 27001:2022 readiness review and a final Word report for management.

The sender describes the organization as providing customer support software to business clients, with 55 employees working from one office in Tashkent and remotely within Uzbekistan.

The described platform stores customer contact information, support conversations, and service records.

The requested scope covers development, hosting, operation, and support of the platform and the systems listed in scope.

The sender reports 64 enabled accounts against 55 current employees, including six accounts that appear to belong to former staff; the remaining difference is unexplained. MFA is recorded for 42 accounts, administrator coverage is unknown, two administrator accounts are shared, and no privileged access review is documented.

The sender reports daily backups, a failed last restoration exercise because the team could not access the required encryption key, no subsequently documented successful restoration, and no approved recovery objectives.

The sender reports a scan summary with two critical and nine high-severity findings, four internet-facing findings more than 45 days old, no supplied affected versions or technical validation records, seven laptops with overdue security updates, and an application secret committed to a private repository whose revocation is unconfirmed. The sender asks that the secret not be requested or reproduced.

The sender reports 14-day log retention without a documented review schedule, unusual administrator sign-ins without an investigation record, and a draft incident response procedure that has not been exercised; the sender states unauthorized access has not been established.

The sender reports that the security policy awaits management approval, the asset inventory lists 46 of 55 laptops, the risk register has not been reviewed for a year, and no approved risk treatment plan, Statement of Applicability, internal audit report, or management review minutes were supplied.

The sender reports training completion for 33 of 55 employees, with no documented refresher schedule or administrator-specific training.

The sender reports that IT disabled four former-employee accounts and updated five laptops; supporting records and independent closure checks are not available, so these remain reported remediation rather than verified fixes.

The sender requests that missing evidence be distinguished from proof that a control is absent, that exploitation not be assumed, and that no compliance score be assigned without a supported method.

## Systems
- Customer support web application and platform storing customer contact information, support conversations, and service records
- Cloud database
- Central identity service
- Business email service
- Source repositories
- Deployment pipeline
- 55 employee laptops
- Remote access
- Cloud backups
- Security logging

## Locations
- One office in Tashkent
- Remote working within Uzbekistan
