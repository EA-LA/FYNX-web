# FYNX API engine — operations and recovery

Project: `fynx-c7a28`; region: `us-central1`; Firestore: `(default)` in `nam5`. Source lives in the existing FYNX-web repository. This document covers the caller-supplied Forex Risk API and submitted-event Prop Firm Rules API beta. Paid subscriptions remain deferred by the owner: test Stripe configuration saves Pro waitlist interest and never grants paid entitlement.

## Runtime and deployment

Functions: `developerWorkspace`, `developerGateway`, `developerBilling`, `developerHealth`, `developerBackupCheck`. The first three handle authenticated operations; health is a minimal public read of Firestore and a deterministic engine self-check. Backup inspection runs every six hours. Function instance limits bound concurrency; they are not a monthly cloud spending guarantee.

Versioned files: `backend/developer-{api,core,engine,billing,operations}.cjs`. Deployment directory: `/Users/h/Desktop/fynx-functions/functions/`. Copy these five source files there and preserve all existing exports. Its index exports the five named functions from their modules. Dependencies: firebase-admin, firebase-functions, decimal.js and stripe. Run backend tests, syntax checks and the public-page checks before deploying only these functions:

```sh
firebase deploy --only functions:developerWorkspace,functions:developerGateway,functions:developerBilling,functions:developerHealth,functions:developerBackupCheck --project fynx-c7a28 --non-interactive
```

Use the existing deploy directory for that command. Never deploy the other products as part of an API-only release. The website publishes from the existing repository's main branch.

## Calculation, event and quota guarantees

Decimal-string inputs are bounded; the engine uses 256 significant digits. Independent BigInt tests check the largest and smallest accepted sizing inputs. Forex calculations require explicit contract and conversion metadata. Live pricing, execution, deposit/withdrawal accounting and broker reconciliation are outside this release.

Every accepted account event atomically updates the ledger, immutable event, source-ID deduplication record, request history and successful-call counter. Sequence gaps, conflicting source IDs and conflicting retries fail. Version 2 uses sorted JSON fields for idempotency fingerprints, preserving support for version 1 stored retries. New audit records contain a payload fingerprint, previous event hash and current event hash. Hash chains detect accidental edits when checked against a trusted snapshot; they are not a claim of protection from a privileged administrator rewriting the entire database.

A boundary_snapshot must be at the very next reset, preserves position count, changes no realized balance, and supplies the real unrealized mark. Both the prior daily floor and new daily floor are checked. Missing boundary data is rejected; do not invent it. Hard breaches persist and cannot become eligible later. History is source-submitted coverage, not a complete broker record or payout authorization.

Successful calls consume the per-environment UTC monthly allowance. Failed calls and duplicate event retries do not. All authenticated engine attempts consume the per-second limit, including rejected calculations. Monthly cap and usage updates are atomic across keys. Gateway and workspace management throttles use separate buckets. Lower user request caps are reflected in response headers. Overages are disabled.

## Credentials and customer isolation

Firebase authenticates workspace callers. API key owners must remain enabled with verified email. UID/environment are resolved server-side, never trusted from submitted account IDs. Key rotation/revocation is atomic; token hashes are stored and raw tokens appear once to their owner. Private Stripe credentials are bound from Secret Manager. Public Firebase web configuration is not a private server credential.

Clients cannot write developer records, plan entitlements, audit records or global key mappings directly. Temporary-user tests verify denial with HTTP 403 and cross-user/cross-environment rejections. Never log Authorization headers, raw tokens, full bodies, support text or Stripe secrets. Operational logs contain service, action class, status, duration and request ID only.

## Monitoring

Cloud Monitoring uses the existing **FYNX website operations** notification channel. No new recipients were added.

- Five-minute regional uptime check: `fynx-api-engine-health-jyfWozt8Kmw`. It checks TLS, HTTP success and `"status":"ok"` on `developerHealth`.
- Alert `11641067733028156407`: at least two regions failing for five minutes.
- Log metric `fynx_api_server_failures`: structured server/health/billing/backup status >=500.
- Alert `11898988124529380578`: any such failure within a five-minute window.
- Alert `13742399645720738865`: no successful backup inspection for eight hours, including a stopped scheduler.
- `developerBackupCheck`: reads PITR configuration, daily schedule and latest READY backup every six hours; logs an error if the backup is older than 36 hours. A newly configured daily schedule has a 48-hour first-backup grace period.

Configurations are in `ops/developer/`. Read current IDs before applying changes; do not create duplicates. Logs Explorer filter: `jsonPayload.service="fynx_api"`. Use request IDs to trace a failure. Expected 4xx responses do not page the server-failure alert.

For an incident, check uptime and recent deployments first; then inspect structured logs and Firestore/Stripe service status. For quota issues, inspect the customer's environment and UTC usage month. For event issues, preserve the last accepted sequence and retry ID. Retry transient errors with backoff using the same event key. Do not remove a breach, reset usage or edit an accepted event to suppress an error.

## Backups and retention

Enabled on 2026-09-21:

- Firestore point-in-time recovery: seven-day rolling history, growing from enablement. It does not retroactively create seven days of history.
- Daily managed backup schedule `2e07c35e-359a-419c-96ff-76fb84599db1`: 28-day retention.
- Weekly Sunday schedule `0b1e3b94-2145-483c-a006-923e35fb66ed`: 84-day retention.
- Initial full managed export: `gs://fynx-c7a28-api-recovery/initial-20260921`, completed successfully with 485 documents.
- Recovery bucket: uniform IAM access, public access prevention enforced, encryption at rest provided by Cloud Storage, 30-day lifecycle deletion plus the bucket's seven-day soft-delete window.

Managed schedules protect the shared database, including the API's nested records. They incur cloud storage charges. The initial export bridges the time before the first scheduled backup. Cloud infrastructure backup completion times are provider-controlled.

Firestore backups do not include Firebase Authentication accounts, Stripe state, Secret Manager values or application code. Firebase identity and Stripe remain separate managed systems; code is in Git. Preserve UID mappings and never restore an old paid plan as proof of a current subscription. An identity-loss incident requires separate identity recovery and owner verification; this release does not promise cross-service point-in-time recovery.

## Recovery procedure

1. Identify the incident time and scope. Stop affected API writes if data corruption is ongoing. Preserve logs, source event IDs and the current database before attempting restoration.
2. Choose a READY managed backup or a valid PITR time before corruption. Confirm its scope and age in the Firestore console. Initial export is available until its retention expires.
3. Restore to a **new isolated database**, using Firestore's managed backup restore, PITR clone, or managed export/import. Never import over `(default)` as an exploratory step. Recovery IDs should start with `fynx-api-recovery-`.
4. Compare developer/account/rule counts and sampled document values. Check latest sequence, event hashes, source-ID deduplication, balances, breach states and monthly usage. Replay known source events into a separate test account if necessary. Do not copy private rate counters as durable business state.
5. Prepare a scoped recovery change with a before/after report. Recover only affected developer paths. Keep existing Firebase UIDs; refresh Stripe entitlements from Stripe. Revoke restored API keys and require replacement keys so a previously revoked key cannot become valid again. Merge events accepted after the selected backup by source ID and sequence; never discard them silently.
6. Obtain owner approval for the concrete production recovery change, apply it while writes remain paused, then run integration checks and resume writes. This approval is for a destructive incident recovery, not routine backup creation.
7. Remove the temporary recovery database after verification, preserve the incident report and review the root cause.

Target recovery point is up to a day for daily backups or an available minute within PITR retention. This is a design target, not a contractual SLA. A full production recovery-time objective has not been benchmarked.

Official procedures: [Firestore backups](https://firebase.google.com/docs/firestore/backups), [PITR](https://firebase.google.com/docs/firestore/use-pitr).

## Verification evidence — 2026-09-21

22 backend tests passed, including boundary rollover, conservative sizing, decimal extremes, breach persistence and canonical fingerprints. Production temporary-user checks passed for auth, isolation, rotation/revocation, HTTP gateway, event retries/conflicts, audit records, support persistence, test billing waitlist and concurrent quota enforcement. Direct client entitlement writes were rejected. The fixture users and records were removed. Browser signup, settings save and retrieval of the corresponding audit entry also passed. The deployed backup inspection ran successfully; the first scheduled backup is still within its initial grace period.

A synthetic recovery record was exported to `gs://fynx-c7a28-api-recovery/drill-20260921`, imported into `fynx-api-recovery-20260921`, and read back with balance `99850` and sequence `2`. The isolated database and original synthetic record were deleted afterward. This proves the storage/import route and permissions; it is not a full-customer disaster simulation.

Opt-in repeatable backend smoke test (requires administrator Application Default Credentials and test billing):

```sh
node backend/scripts/developer-smoke.cjs --run-production
```

It creates only its own temporary QA users, cleans them up in finally, and does not submit a payment. Do not put administrator credential files in the repository.
