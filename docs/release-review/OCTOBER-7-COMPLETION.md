# October 7 API rescan and completion pass

This supersedes the September 22 status summary. It distinguishes the current live service, the reviewed integration branch and local work from other tasks. It does not approve the full commercial or Funded broker launch.

## Completed and verified

- Approved `fynx-funded-v1` rules, zero-paid-customer declaration and five-difference alignment were already recorded in the later September work. No new owner decision is needed on the numerical v1 schedule. Existing legacy/test accounts were not migrated.
- Live Funded rules show USD, program limits 4%/8%, 5%/10%, 5%/12%, fixed 22:00 UTC, allowed equality and 40% consistency. Broker availability limitations and Funded purchase hold are visible.
- Public API audit: eight route URLs (seven distinct pages, counting `/api/` and `/api/index.html` as aliases) and 18 same-origin linked resources return 200. Cloudflare's client-decoded email placeholder is excluded from bare-URL checks. [HTTP evidence](api-live-audit-20261007.json).
- Browser checks: overview, Risk, Prop Firm Rules, pricing, documentation and workspace at 390px and 1440px have no page overflow; mobile menu opens; workspace sign-in renders. These do not claim real email-inbox verification or authenticated browser purchase completion.
- Fixed stale Funded regression adapters for the newer MFA import; production MFA was not bypassed or changed. Local aggregate passes: 28 Funded test groups, 111 backend tests (including other-task local OANDA tests), calculator/pilot proofs and API/consent UI checks.
- Deployed authenticated API smoke passed using disposable QA users: sign-in, keys, external request, histories, usage/quota enforcement, environment/account isolation, idempotency, chained audit and client-write rejection. Billing summary succeeded without opening checkout. QA records/users were removed. Email verification was set by the QA harness; this is not an inbox test.
- Stripe TEST clocks passed initial payment, a successful monthly renewal, failed renewal, recovery with a valid payment method, active service until period end and scheduled cancellation. Test resources were cleaned up. [Stripe evidence](stripe-renewal-20261007.json). Hosted checkout/portal UI and deployed webhook behavior remain separate verification.
- Added bounded, reviewed operator deletion and isolated-restore suppression tools with nine tests. They require disabled shared identity, write quiescence, an exact inventory approval and resolved retention/billing holds. They preserve other tenants, shared Auth and Funded records. See [lifecycle procedure](DATA-LIFECYCLE-RUNBOOK.md).
- Fresh operations check: all four API functions ACTIVE on Node.js 22; three billing-related functions bind the dedicated live secret; PITR enabled; 18 READY backups, newest October 7; three API alert policies enabled with notification channels. [Operations evidence](operations-20261007.json). Email alert receipt is not verified by metadata.

## Live billing discrepancy — important release boundary

The live pricing page explicitly advertises API Pro at $49/month. Current `origin/main` billing includes a separate live-customer field, paid-invoice validation and newer checkout locking. The reviewed integration branch includes additional legal acceptance/publication controls absent from that live implementation. Do not overwrite the newer billing module with an older branch, and do not report that API payments are disabled. This pass did not change paid access, create live checkout or make a live charge.

The review branch's tests and new operator tools can be committed/pushed independently. Integrating legal controls with current main and deploying final legal pages depends on approved documents and a reviewed integration release. No reviewed legal document was published in this pass.

## Small remaining checklist

- [ ] Obtain OANDA's written approval/scope and production account specifications; finish the dated production instrument catalog. Practice export and owner-reported acceptance are not that approval.
- [ ] Finish production broker ingestion, cost/reset/equity coverage, phase transitions and reconciliation; approve named human-review and rollback operators. The existing practice samples do not qualify the production integration.
- [ ] Complete seven elapsed days with five complete accounts and 100 distinct accepted events, with no unexplained differences.
- [ ] Finish hosted checkout/portal and deployed webhook tests; confirm taxes/refunds/invoice identity, then perform the owner-authorized live payment/cancellation test.
- [ ] Obtain qualified legal review, settle public business contact/retention/transfer disclosures, integrate consent into the current live billing implementation and publish the approved documents.
- [ ] Approve retention/holds and shared-identity deletion handling, secure export delivery, incident/support/rollback ownership; verify alert receipt and apply deletion markers in the next recovery drill.
- [ ] Recruit 3–5 external beta testers, obtain three independent docs-only integrations and verify the real signup/email/mobile journey.
- [ ] Merge/deploy the reviewed integration changes when the dependent approvals are ready, then record final launch sign-off. Branch CI is not a production deployment.

## Reproduction

- `npm run test:release`
- `node scripts/audit-api-live.cjs /private/path/new-report.json`
- `GOOGLE_APPLICATION_CREDENTIALS=... node backend/scripts/developer-release-smoke.cjs --run-production` (disposable QA only; no checkout)
- `GOOGLE_APPLICATION_CREDENTIALS=... node backend/scripts/stripe-renewal-test.cjs --run-test-mode --secret STRIPE_SECRET_KEY --output /private/path/new-report.json` (refuses live credentials; reads the explicitly named existing test secret)

Stripe mechanics follow its [billing testing guide](https://docs.stripe.com/billing/testing) and [test-clock API](https://docs.stripe.com/api/test_clocks/advance). This is engineering evidence, not legal review.
