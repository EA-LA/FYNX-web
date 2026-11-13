# Shared FYNX account contract, version 1

`fynxAccountSync` is an authenticated callable in `us-central1`. Both clients use the same Firebase UID. Every request includes `expectedUid`; a captured account mismatch is rejected before private reads/writes. Anonymous callers are rejected. Backend ownership comes from verified Firebase Auth, never a payload UID.

## Requests and responses

Read a complete bounded domain snapshot:

```json
{"expectedUid":"current-firebase-uid","action":"read","domains":["profile","journalTrades","readingRecords"]}
```

```json
{"schemaVersion":1,"records":[{"domain":"profile","id":"default","revision":1,"updatedAt":1800000000000,"deleted":false,"data":{"displayName":"Example"}}],"serverTime":1800000000000}
```

Mutate records with retry-safe change identifiers:

```json
{"expectedUid":"current-firebase-uid","action":"mutate","mutations":[{"domain":"readingRecords","id":"stable-article-id","expectedRevision":0,"mutationId":"550e8400-e29b-41d4-a716-446655440000","data":{"saved":true,"url":"https://publisher.example/story"}}]}
```

Success contains `schemaVersion`, the resulting `records`, `applied` mutation IDs, and `serverTime`. Mutation `data` recursively merges objects, replaces arrays, and retains literal null. Unknown platform-specific fields such as `nativeData` survive another client's patch. To delete, omit `data` and send `deleted:true` with the current revision. Deleted records persist as tombstones with `data:null`; clients never import over a tombstone or infer deletion from a missing partial response.

**Revision is an opaque safe integer used only for equality. It is not a timestamp, sortable version, or increment counter.** Unobserved legacy canonical-document changes produce a deterministic 52-bit token. Server mutations derive the next token from the observed version. Compare equality only. New absent records use revision zero; existing legacy records get a nonzero token. Old-client edits, including two edits between syncs and old-client deletion, invalidate captured revisions.

One batch is atomic. A conflicting item returns callable code `aborted` with `details.conflicts`, each containing `{domain,id,current}`; none of that batch's data mutations or receipts are written. Rate-limit bookkeeping can still update. Reusing a mutation ID with the identical payload returns the current record without applying it again. Reusing it for different data is `already-exists`. Clients retain a UID-scoped outbox and stable mutation IDs across network failures, preserve local conflicts for review, and never change the expected revision just to force an overwrite.

## Domains and existing compatibility

| Domain | Record identity / canonical source |
| --- | --- |
| `profile` | Singleton `default`; `users/{uid}/account/profile` |
| `preferences` | Singleton `default`; `users/{uid}/account/preferences` |
| `notificationPreferences` | Singleton `default`; `users/{uid}/account/notificationPreferences` |
| `journalTrades` | Stable trade ID; `users/{uid}/trades/{id}` |
| `journalArchive` | Stable archived trade ID; rich alternate journal representation |
| `readingRecords` | Stable canonical article identity; saved/history state |
| `newsInterests` | Shared interest profile, normally `default` |
| `newsWatchlists` | Stable named-watchlist ID |
| `portfolios` | Stable manual portfolio ID |
| `researchNotes` | Stable note ID |
| `researchChats` | Stable private conversation ID |
| `notificationState` | Canonical notification ID |
| `progress` | Lesson or progress item ID |
| `challenges` | Stable personal challenge ID |
| `calculatorPresets` | Stable calculator preset ID |
| `checklists` | Stable checklist ID |
| `toolWorkspaces` | Existing `fynxConsumerLive/{uid}/saved/{id}` server-calculated results |

Sync metadata, nonlegacy payloads, and mutation receipts live under server-owned `fynxAccountSyncUsers/{uid}`. Canonical profile/journal/preferences listeners continue to observe their existing paths. Legacy records are registered on first observation so later direct deletion returns a tombstone. The service never imports a different UID's records. Device/browser legacy data migration is a deliberate client action after showing the current signed-in account; a guest snapshot is not silently assigned to the next user.

Successful profile mutations also mirror only `username`, `displayName`, and `photoURL` into the legacy `users/{uid}` document for existing native identity cards. The transaction preserves every other root field, including privacy choices, private email, rank and entitlements. Profile deletion clears these three display fields without deleting unrelated root data. This mirror does not publish a profile or modify the separate public-sharing contract; old direct root writes are not an authority for the shared profile.

Profile patches accept editable fields only: `displayName`, `username`, `photoURL`, `bio`, `country`, `timezone`, `experienceLevel`, `preferredMarkets`, `riskProfile`, `nativeData`. They cannot write paid-access or billing fields. Profile photos require HTTPS. Journal records require string `symbol` and numeric `pl`; `dateTs` accepts epoch milliseconds or ISO input and is stored as Firestore Timestamp for existing web ordering/listeners. Its wire representation is epoch milliseconds. The backend retains rich native fields without truncating them.

`toolWorkspaces` exposes the owner's previously saved tool results as personal history, including after subscription expiry. Sync permits only conditional rename (`data:{name}`) and deletion; deletion updates the existing saved quota counter exactly once. Sync cannot create a calculated result or alter `product`, `input`, `result`, or provider evidence. New calculations/saves continue through `consumerLiveWorkspace`, which enforces the existing verified entitlement and recomputes output server-side. Native intelligence report history uses its existing `fynxIntelligence` research-history API so its retention and entitlement policy are preserved.

## Bounds and offline behavior

- Maximum 50 distinct record mutations per atomic request, 512 KiB request, 128 KiB resulting record.
- Maximum 2,000 records including tombstones per domain; complete response maximum 8 MiB. Exceeding a bound returns an explicit error, never a silently partial snapshot.
- Maximum 120 requests/minute and 10,000 submitted mutations/day per UID. Clients back off and retain drafts/outbox.
- All current domains may be requested, but clients should request only relevant domains when responses grow.
- Server reads process domains sequentially in pages of at most 32 documents, with a shared 8 MiB budget checked while collecting each page. An oversized account fails clearly before later domains are loaded; no partial snapshot is returned. Mutation quota checks project document IDs only. Canonical legacy registration reads at most 16 records per transaction.
- No tombstone pruning is performed in v1. Mutation receipts remain available for idempotency. A future retention policy must account for offline clients before deleting either.
- Local-only operating-system permission states, biometric credentials, push tokens and device locks do not become generic synced preferences. Device tokens use the existing dedicated registration API.

## Membership

`{expectedUid, action:"membership"}` returns `{schemaVersion:1,membership,serverTime}`. Membership is independent from saving free account data. The object includes `status` (`verified` or `partial`), `source:"account-membership-server-v1"`, `verifiedAt`, `expiresAt`, `bridgeEnabled`, `webTier`, `nativeTier`, `capabilities`, provider states and provider-specific management destinations.

The resolver uses verified Apple server entitlement evidence and a live Stripe lookup with the existing exact customer/product/UID/price/paid-invoice policy. User/profile tier fields and client booleans never grant access. A provider outage cannot add paid capabilities. Results expire within five minutes, never later than accepted Apple proof/expiry. Native intelligence reads this bounded server capability when calculating quotas and research access. Web paid tools retain their Stripe policy and can additionally accept fresh verified Apple evidence.

Cross-provider equivalence is disabled unless the server environment explicitly sets `FYNX_ACCOUNT_MEMBERSHIP_BRIDGE=pro-equivalent`. This optional mapping makes Apple Pro and website Professional equivalent; Essential and Plus retain their existing product scope. Configure only after the product owner approves the mapping. Provider billing management stays with Apple or Stripe; no purchase, transfer, cancellation or refund occurs through account sync.

## Account deletion

`fynxAccountDelete({expectedUid})` requires authentication within five minutes. It blocks new sync, deletes the authenticated Firebase user, and returns `{deleted:true,dataCleanup:"scheduled"}`. An idempotent retry-enabled Auth deletion trigger removes the user's sync records, `users/{uid}` tree, learning records, web reminders, paid saved work, membership cache, and owned profile storage. Stripe customer and purchase-ownership references remain for billing/refund integrity. Existing intelligence and Quant cleanup triggers retain responsibility for their own namespaces. If deletion fails, the request block is rolled back only after Auth independently confirms that the same user still exists and the marker belongs to this attempt, with no cleanup observed. Uncertain or completed deletion keeps its block; retry and cleanup remain idempotent.

## Deployment and verification

`node scripts/package-account-sync.cjs /absolute/output` prepares only the new isolated Firebase codebase `fynx-account-sync`; it does not deploy or replace shared Firestore rules. Bind the existing live Stripe verification secret to the callable. Package output must not include legacy `.runtimeconfig.json` or unrelated functions. Deploy the three named functions, plus narrowly reviewed consumer/intelligence compatibility changes when approved. Active rules already deny ordinary direct writes to the new server namespaces; verify deployed rules before release rather than installing an old rules snapshot.

Focused checks: `node --test backend/account-sync.test.cjs backend/consumer-live-workspace.test.cjs backend/consumer-live-policy.test.cjs`. Native backend also adds `test/account-membership.test.js`. Release verification must additionally use two authenticated clients with the same test UID for writes, edits, deletes, restart, offline retry, conflicts, account switching, isolation, membership expiry and deletion. Unit tests alone do not establish production or device behavior.
