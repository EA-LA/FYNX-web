> Latest legal/purchase update: [owner-confirmed pre-sales status and implemented consent controls](LEGAL-AND-PURCHASE-STATUS.md).

> Latest: [versioned rule alignment and agreement evidence gap](RULE-ALIGNMENT.md). The initial package was pushed after explicit owner approval, and its GitHub Actions run passed.

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
| 1 | Final trading rules | **COMPLETE.** Owner approved `fynx-funded-v1` for new accounts: static maximum loss; reset-balance daily loss; 40% consistency; 22:00 UTC year-round reset; touching a limit is allowed. Program daily/max limits: 4%/8%, 5%/10%, 5%/12%. Implemented and tested; no further rule decision is pending. Production deployment remains under #9. See [approved rules](RULE-ALIGNMENT.md). |
| 2 | Purchased rules and five differences | **COMPLETE for the declared pre-sales population and approved v1.** Owner confirms zero paid customers, so historical purchased-agreement reconciliation is N/A (not a live-record audit). All five differences have matching Funded client/server/API results and explicit expected-outcome tests. Future server purchase snapshots and webhook binding are implemented/tested. Legacy/test accounts remain unchanged. Deployment and customer-facing checkout acceptance remain separate launch gates (#9, #10, #17). |
| 3 | Pairs and broker specifications | **PARTIAL.** Selected OANDA practice for initial read-only intake; implemented/tested instrument capture and versioned catalog validation. Actual account access, broker source schedules, effective dates and commercial/Funded suitability remain unverified. No production pairs approved. See [broker catalog status](BROKER-CATALOG-STATUS.md). |
| 4 | Public rule inconsistencies | **COMPLETE: published and verified live** at www.fynxfunded.com, commit `f04239d`; Funded GitHub checks passed. Funded builder, pricing, rules, FAQ and two-phase example now distinguish approved rules from unavailable broker trading. USD-only account selection/checkout; no live Forex, 1:100 leverage or universal Swing/weekend promise; crypto unavailable. Shared rule notice includes reset/equality/consistency. Generic legal terms unchanged pending legal review. See [public-page corrections](PUBLIC-RULE-CORRECTIONS.md). |
| 5 | Funded history validation | **PARTIAL: source checks implemented/tested.** Added broker-account/phase binding, reviewed coverage metadata, pagination/equity attestations, event-count/source-gap checks, explicit net-cost basis and exact broker balance/equity reconciliation. Reset-boundary/floating-loss tests pass. Actual broker adapter verification and real coverage evidence remain blocked on broker access (#3). Evaluator safeguards deployed under #6; real adapter remains pending. See [history validation status](HISTORY-VALIDATION-STATUS.md). |
| 6 | Automatic progression safeguards | **COMPLETE: deployed and verified** in `fynx-c7a28` / `us-central1`. Both progression functions ACTIVE with updated source hashes; live unauthorized enablement returns 403. All 28 Funded tests pass. Automatic progression remains blocked pending approved complete-event integration. See [deployment evidence](progression-deployment-evidence.json). |
| 7 | Real trading history | **BLOCKED: no real history available.** Production read-only inventory found 0 broker accounts, 0 trades and 0 rule events (5 challenge records). No project broker export found; OANDA access is unconfigured. Supply an authorized broker account/history export with independent balance/equity/cost evidence, then map costs and run reconciliation. No synthetic replay was counted. See [inventory evidence](real-history-inventory.json). |
| 8 | Seven-day parallel testing | **PREPARED / BLOCKED, not started.** Added tested evidence checker and daily collection plan; no qualifying real events available. After #3/#5/#7, collect seven elapsed days, five complete accounts and 100 distinct accepted events with zero unexplained differences. Replays/historical timestamps cannot satisfy duration or inflate counts. See [parallel test plan](PARALLEL-TEST-PLAN.md). |
| 9 | Production Funded integration | Human-review and rollback runbook prepared in FUNDED-PRODUCTION-RUNBOOK.md. Still need verified broker adapter, transactional phase transitions, named operators and production integration approval. |
| 10 | Stripe complete journey | Hosted checkout completion, time-advanced renewal success/failure/recovery and portal cancellation in test/staging. Earlier 14 Stripe API checks are narrower. |
| 11 | Dedicated live credentials | **COMPLETE: verified live secret version 1** bound to ACTIVE developerBilling, developerWorkspace and developerGateway (Node.js 22). Secret value was not logged. See operations-current-evidence.json. The newer billing deployment differs from this branch; paid-launch approval is a separate unresolved gate. |
| 12 | Billing policies | Merchant confirms taxes, refunds, recurring consent, cancellation, invoice identity and permitted markets. |
| 13 | Authorized live payment | Owner-authorized payment amount/customer and cancellation test after staging passes. No live payment was made. |
| 14 | Complete legal drafts | Seller FYNX LLC, Boise, Idaho, USA and privacy/support contact confirmed. Private address will not be published. Reviewer must finalize public contact requirements, provider/region disclosures and remaining policy details. |
| 15 | Legal review | Qualified reviewer approves terms, privacy disclosures and applicable DPA. |
| 16 | Retention/export/deletion | Export verified against disposable Firestore records; nested traversal, private-counter/key-digest exclusion and cleanup passed. Lifecycle/incident runbook prepared. Still approve primary retention/legal holds, implement/test customer deletion and restored-data suppression, and verify secure real-request delivery. No customer data was deleted. |
| 17 | Publish legal/version acceptance | Immutable server acceptance, recurring consent and reviewed-publication controls implemented/tested. Actual legal review, publication and integration with the newer production billing implementation remain pending; drafts remain unpublished. |
| 18 | External beta | Recruit 3–5 testers; retain evidence of at least three independent docs-only integrations. Internal checks do not qualify. |
| 19 | Desktop/mobile complete journey | Responsive unauthenticated entry checks done. Still run actual signup, real email verification, key creation, successful request and usage verification on both sizes after deployment. |
| 20 | Commit/push/remote CI | **COMPLETE for delivered changes.** API release CI passed for `ba967ac`; Funded publication CI passed for `f04239d`. Latest follow-up delivery and CI evidence is recorded below. |
| 21 | Operational readiness | Fresh verification: PITR enabled, seven READY backups, 28-day daily/84-day weekly retention, healthy scheduled backup check, health endpoint HTTP 200 and enabled monitoring policies. Progression functions upgraded to Node.js 22. Alert recipient differs from owner-confirmed support email; confirm recipient/delivery and operational owners. Isolated recovery-drill evidence tracked separately. |
| 22 | Final launch review | Owner sign-off still required. A newer separate billing deployment supports live checkout despite unfinished legal/testing gates. Owner decision to preserve it or restore a hold is pending; this session has not changed that billing deployment. |

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

Local verification: 18 Funded tests, 43 backend tests, calculator/pilot proofs, seven API page checks, journal checks, Funded TypeScript build and static site build. Implementation commit: `53bb7f1` on `codex/fynx-first-proof`. Owner explicitly approved the full push; it succeeded. GitHub Actions run 36371896915 passed for commit 1dba084. Later rule-alignment changes require their own CI result. The Funded patch was applied to the pinned baseline in a temporary directory and reproduced the tested source exactly.

Current operations recheck: existing Firebase CLI authorization enabled fresh backup/monitoring metadata checks and targeted deployments. Backup/PITR health is verified; email delivery is not. See operations-current-evidence.json and operations-probes.json. Earlier no-ADC notes describe historical attempts.

## September 28 completion pass

Public rules deployed as Funded `f04239d`, verified in Vercel and on the live rules page; all 21 Funded tests, lint and build passed. Both progression safeguards redeployed on Node.js 22 and verified ACTIVE. API dedicated live-key bindings verified without logging values. Export production proof used only disposable synthetic records and cleaned them up. Local release verification: 28 Funded tests, 77 backend tests, calculator/pilot and API page/consent proofs passed. Production billing has newer independent changes; those were preserved pending owner direction.
