# Employee receipt migration

The employee kit describes `npx ai-employees hire` as the native installation path and `npx ai-employees upgrade <employee>` as a report/apply upgrade path. The checked-out workspace has no `ai-employees` installer executable or migration command. The upgrade procedure is not an identity migration, and applying it here could replace member-edited kit files. No package was fetched or installed.

`migrate-receipts.mjs` therefore uses the local method `local-deterministic-identity-migration-v1`. It does not claim that the changed ISO agency identities were installed by the kit. It requires the old receipt and `.upgrade/baseline/employee.json` to agree on the previous slug and requires the old receipt's employee metadata digest to match that baseline. It records the prior and current slug, name, role, and declared routine IDs; migration time; source receipt and baseline digests; and full SHA-256 digests for the current employee metadata, role/configuration files, and every declared routine file.

Before replacing `.installed.json`, it copies the original receipt byte-for-byte to `agency/demo/receipt-migrations/<employee-id>/<migration-id>/original.installed.json` and writes a separate migration audit record. The current receipt retains the kit receipt schema for shared kit readers but sets `receipt_provenance` to the local method. The demo runner accepts it only after checking the provenance, both prior identity sources, backup/audit digests, current identity, declared routines, short receipt digests, and full migration digests. Unknown or invalid provenance is rejected.

The migration ID is deterministic from the employee ID, original receipt digest, baseline digest, current identity, and current verified file digests. Re-running verifies an existing migration and leaves its receipt and audit record unchanged. `.upgrade/baseline`, employee routines, histories, project inputs, credentials, Gmail, and the production orchestrator are not modified by this procedure.

Run locally with:

```powershell
node agency/demo/migrate-receipts.mjs
```
