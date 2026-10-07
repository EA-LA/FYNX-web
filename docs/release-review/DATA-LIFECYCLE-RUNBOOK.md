# API data lifecycle and incident procedure

Status: operator export/deletion and isolated-restore suppression tools are implemented; retention-policy approval and operational adoption remain pending. No automatic primary-data retention period is approved by this document.

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

Operator implementation: `backend/developer-data-lifecycle.cjs` and `backend/scripts/manage-developer-deletion.cjs`. Nine tests cover nested/missing-parent records, global-key scope, tenant isolation, approval freshness, held/changed data, disabled identity, partial failure and isolated-restore suppression. No real customer data was deleted.

The tool refuses to disable shared Authentication itself. The shared identity must already be disabled under a reviewed request, with at least 90 seconds of write quiescence (longer than the API's 60-second request timeout). This affects other FYNX products and must be explicitly reviewed. Keep it disabled after deletion; re-enabling it can permit a new workspace to be created by the current deployed bootstrap. An API-only self-service deletion flow is not claimed.

Preview command (read-only):

```sh
GOOGLE_CLOUD_PROJECT=fynx-c7a28 node backend/scripts/manage-developer-deletion.cjs preview FIREBASE_UID /private/path/inventory.json
```

Create a private approval JSON with `uid`, `inventory_sha256` from that exact preview, `request_reference`, `reviewer`, `retention_decision`, `billing_review_reference`, `identity_verified: true`, `legal_holds_resolved: true`, `shared_identity_disable_approved: true`, `writes_quiesced_at` and `approved_at` (timezone-qualified timestamps). The reviewer must substantiate those statements; the tool cannot decide legal holds or inspect Stripe invoices itself. Approval must be less than 24 hours old. Review real customer requests separately before executing:

```sh
GOOGLE_CLOUD_PROJECT=fynx-c7a28 node backend/scripts/manage-developer-deletion.cjs apply FIREBASE_UID /private/path/approval.json --apply-reviewed-deletion
```

The tool records a minimal deletion marker, checks each chunk against the approved content hashes transactionally, deletes only workspace descendants and owned global API keys, and verifies absence. Shared Authentication, Funded records and Stripe are not deleted. Errors leave a pending marker and disabled identity; re-inventory and re-approve before retrying. Do not erase the marker to hide partial failure.

For an isolated recovered database, before connecting traffic:

```sh
GOOGLE_CLOUD_PROJECT=fynx-c7a28 node backend/scripts/manage-developer-deletion.cjs suppress-restore FIREBASE_UID /private/path/report.json --apply-reviewed-deletion ISOLATED_DATABASE_ID
```

This reads the authoritative deletion ledger from the current default database, never the restored backup, and refuses a default-database target. Preserve the current ledger independently during disaster recovery. Inventory all deletion markers before restoring service; this command handles one verified UID at a time. Backup copies expire according to the reviewed schedule; this tool does not purge backups or invent a primary retention period.

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
