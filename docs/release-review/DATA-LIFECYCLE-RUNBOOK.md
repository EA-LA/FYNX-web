# API data lifecycle and incident procedure

Status: operating procedure prepared; policy approval and end-to-end deletion implementation remain pending. No automatic primary-data retention period is approved by this document.

## Export

Verify the requester's authenticated identity and workspace ownership. Scope the export to the requested Firebase UID, pause writes if a consistent snapshot is required, and use `backend/scripts/export-developer-data.cjs` with authorized server credentials. Store the result privately, validate its scope, and deliver it only through an approved authenticated channel. Never put API-key digests, raw keys or internal rate counters in the export. Stripe and shared Firebase identity records require separate handling.

The actual exporter was exercised against disposable Firestore records using a REST adapter: nested records under a missing parent exported correctly, private counters and key digests were omitted, and test records were removed. See `export-production-proof.json`. This does not establish a real customer delivery or complete deletion workflow.

## Deletion request and retention review

1. Verify identity, workspace scope and any shared-product account implications. Record the request/reference and the applicable response deadline determined by counsel.
2. Identify active subscriptions, invoice/accounting retention requirements, legal holds and disputes. Confirm what must be retained, why, and for how long. Cancellation is not equivalent to deletion; deleting a Firebase user does not cancel Stripe billing.
3. Prepare a concrete document/key/storage inventory and export if requested. Revoke API access and pause workspace writes using an approved process before deletion so data cannot be recreated mid-operation.
4. Review the deletion manifest. Delete only the approved workspace records and key mappings; shared Authentication identity and other FYNX products need separate authorization and handling. Retain a minimal, access-controlled deletion ledger only under an approved retention basis.
5. Verify primary-data removal and access denial. Record any required retained billing/legal records and their expiry criteria. Do not tell a customer all copies are gone while backups still contain data.
6. Apply the deletion ledger to any restored database before production access resumes. Revoke restored API keys and suppress deleted workspaces. Test this workflow before publishing a deletion commitment.

Steps 3–6 require a dedicated tested operator implementation; a runbook alone does not complete them. No customer data was deleted during this task.

## Backups

Fresh metadata confirms PITR enabled, daily backups retained for 28 days and weekly backups for 84 days. These backup schedules do not define primary-data retention or override legal holds. Existing export-bucket retention must be inventoried separately before making comprehensive deletion promises. Backup expiration and restored-data suppression must be reflected in the reviewed privacy notice.

## Incident response

- Triage the alert, establish incident severity and name an incident lead. Preserve timestamps, source versions and relevant access/audit logs.
- Contain the affected service: block new paid checkout if billing integrity is uncertain, revoke compromised credentials, and keep Funded progression paused. Preserve existing customer cancellation access where possible.
- Identify affected accounts/data and whether confidentiality, integrity or availability was impacted. Do not publish unsupported impact claims.
- Restore into an isolated database first; compare counts, ledger/event sequences, balances, breach state, deduplication and audit records. Apply deletion holds and revoke restored keys before any production recovery.
- Obtain approval for the concrete production recovery change, run service checks and monitor recovery. Legal counsel determines applicable notification obligations and deadlines; this document does not invent a universal reporting period.
- Record cause, timeline, corrective action, customer communications and a follow-up owner.

Remaining owner decisions: retention periods by data category; legal-hold authority; privacy-request and incident lead; support/rollback responsibility; secure export delivery channel; incident notification procedure and qualified legal review.
