# Launch work remaining — 2026-09-28

The launch is **not approved**. Changes below are local/source changes until deployed and verified. Older September 22 review documents remain historical evidence; this document records the current work.

## Implemented in this pass

- Funded history rejects invalid/missing P&L, invalid or timezone-free close timestamps, open-time fallbacks, duplicate trade IDs, non-closed records, invalid phases, mixed-challenge fallback histories and numeric overflow. Nonzero costs require explicit net values or signed gross-cost mapping; net costs are not deducted twice.
- Recorded failures persist through reevaluation. A Firestore transaction rechecks the latest failure/configuration and atomically writes the decision and audit records. Manual results carry `requiresHumanReview` because the closed-trade evaluator cannot establish floating-loss coverage.
- Automatic enablement and legacy automatic triggers fail closed pending a verified equity-event integration. Invalid/empty histories cannot enable automatic mode or replace decisions. This is a safeguard, **not completion of production automatic progression**.
- API billing, workspace and gateway declare the dedicated `FYNX_API_STRIPE_SECRET_KEY` binding; shared-key fallback removed. Checkout also requires `FYNX_API_PAID_ACCESS_ENABLED=true`. Disabling new checkout preserves existing subscription management/cancellation.
- Added offline broker-event reconciliation with per-event balance/equity/day/status/breach comparison, source identity checks and a reproducible input hash. It cannot manufacture real-history or seven-day evidence.
- Added an operator-only workspace JSON export with tenant scoping, nested-record traversal, private key digest exclusion, bounded traversal and private output file permissions. It has not been run on real customer data.
- Added regression tests and CI integration for the Funded patch and functions build.
- Browser checks: local landing page/mobile navigation/workspace sign-in entry/docs render; landing/workspace/docs have no horizontal page overflow at 390px, and workspace at 1440px. These are **not** completed signup/email/key/request/usage tests.

## Every original launch gate

| # | Checklist item | Remaining work |
|---|---|---|
| 1 | Final trading rules | Owner approves daily basis, static/trailing maximum, consistency, timezone/reset, breach equality and versioned scope. See PROPOSED-RULES.md. |
| 2 | Purchased rules and five differences | Supply actual sold agreements per account/program. All five differences remain deliberately visible; choosing the API proposal without those agreements would change customer rules. |
| 3 | Pairs and broker specifications | Broker-authoritative symbol/contract/lot/leverage/cost/session catalog and effective versions. |
| 4 | Public rule inconsistencies | Update Funded public rules/currencies/crypto/weekend claims after #1–3; generic public terms have not been silently rewritten. API beta pages already disclose USD ledger, caller-supplied Forex inputs and unverified broker catalog. |
| 5 | Funded history validation | Parsing/cost/duplicate safeguards implemented. Still need verified adapter, phase-scoped completeness, equity marks and boundary coverage; closed-trade-only results require human review. |
| 6 | Automatic progression safeguards | Local safeguards implemented/tested; deploy them. Automatic progression remains blocked until the approved complete-event integration replaces the legacy evaluator. |
| 7 | Real trading history | Supply authoritative history and expected results, map costs, run reconciliation tool, resolve differences. No synthetic test counts as real reconciliation. |
| 8 | Seven-day parallel testing | Collect at least seven actual days, five complete accounts, 100 accepted events, zero unexplained differences. Historical timestamps alone do not satisfy this. |
| 9 | Production Funded integration | Implement/approve the adapter and versioned phase transitions, human review, migration scope, rollback owner and production validation. |
| 10 | Stripe complete journey | Hosted checkout completion, time-advanced renewal success/failure/recovery and portal cancellation in test/staging. Earlier 14 Stripe API checks are narrower. |
| 11 | Dedicated live credentials | Create/confirm dedicated secret in Secret Manager and deploy all three bound services. Source binding is done; deployed binding/live key not verified. Keep paid-access flag off. |
| 12 | Billing policies | Merchant confirms taxes, refunds, recurring consent, cancellation, invoice identity and permitted markets. |
| 13 | Authorized live payment | Owner-authorized payment amount/customer and cancellation test after staging passes. No live payment was made. |
| 14 | Complete legal drafts | Legal entity, registered address, jurisdiction, privacy contact, regions/providers and policy details remain unconfirmed. |
| 15 | Legal review | Qualified reviewer approves terms, privacy disclosures and applicable DPA. |
| 16 | Retention/export/deletion | Export code/test is ready; operator verification and full real-data exercise remain. Approve retention schedules/legal holds; implement and test deletion, backup expiry/restoration suppression and incident handling. No deletion was executed. |
| 17 | Publish legal/version acceptance | Publish only reviewed effective documents; implement server-recorded immutable acceptance version/hash/time and require reacceptance where appropriate. Drafts remain unpublished. |
| 18 | External beta | Recruit 3–5 testers; retain evidence of at least three independent docs-only integrations. Internal checks do not qualify. |
| 19 | Desktop/mobile complete journey | Responsive unauthenticated entry checks done. Still run actual signup, real email verification, key creation, successful request and usage verification on both sizes after deployment. |
| 20 | Commit/push/remote CI | See delivery status below. Local checks alone do not establish remote success. |
| 21 | Operational readiness | Reverify current alert recipients/delivery, backup freshness and representative restoration; appoint support, incident and rollback owners. Existing September 21 recovery evidence is limited to a synthetic record. |
| 22 | Final launch review | Owner signs release evidence and accurate availability/pricing/support; only then enable approved paid access. |

## Running the new tools

From the API repository:

```sh
node backend/scripts/reconcile-history.cjs /secure/path/broker-history.json > /secure/path/reconciliation.json
GOOGLE_CLOUD_PROJECT=AUTHORIZED_PROJECT node backend/scripts/export-developer-data.cjs FIREBASE_UID /secure/path/customer-export.json
```

The reconciliation JSON contains `accounts`, each with `id`, `source: {kind: "broker_export", reference, complete: true}`, `rules_approval_reference`, `start_timestamp`, the explicit API `rules` object, and ordered `events`. Every event requires its normal API event fields, a unique `source_event_id`, and `expected: {balance, equity, trading_days, status, breach}` derived independently from approved rules/broker evidence. Balances/equity are decimal strings; no tolerance or invented data hides differences. Exit code 1 means incomplete/blocked/discrepant evidence. Protect reports as customer data.

Export requires authorized Google Application Default Credentials and an explicitly selected project. Verify requester identity and workspace UID first. Output creation refuses overwriting and uses mode 0600. Pause workspace writes for a consistent point-in-time export. It exports API workspace records only; shared Firebase identity and Stripe records are separate. Do not send the file until recipient authority is verified.

## Deployment and rollback

The Funded source fix is also saved as `patches/funded-progression-safety.patch` in this API repository so CI can apply it to the reviewed baseline. It is already applied locally in `../fynxfunded`; do not apply it there twice. An unrelated pre-existing Funded checkout edit remains untouched. Deploying Funded is a separate release from deploying the API.

Before API deployment, provision the dedicated secret and bind it to developerBilling/developerWorkspace/developerGateway. Deploy the updated billing and API modules together. Leave the paid-access flag absent/false until all paid gates pass. Test-mode integration now reads the dedicated secret as well.

For rollback, retain previous source and runtime/secret-version configuration. Disable new paid checkout while preserving portal cancellation. Keep automatic progression paused; reverting to permissive legacy history evaluation is not a safe recovery. Preserve audit/event data, investigate differences, and use a reviewed forward correction. Never overwrite customer state merely to make a test pass.

## Delivery status

Local verification: 18 Funded tests, 43 backend tests, calculator/pilot proofs, seven API page checks, journal checks, Funded TypeScript build and static site build. Implementation commit: `53bb7f1` on `codex/fynx-first-proof`. Automatic approval review rejected the full push (source, tests, CI and launch/legal documents) pending explicit approval for that payload to `EA-LA/FYNX-web`. Nothing was pushed; remote CI remains unverified. The Funded patch was applied to the pinned baseline in a temporary directory and reproduced the tested source exactly.

Current operations recheck: this session has no Google Application Default Credentials, so current backup health and alert delivery could not be verified. Prior operations evidence is retained, not presented as a fresh pass.
