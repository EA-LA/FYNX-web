> Current follow-up: [September 28 implementation and remaining work](REMAINING-LAUNCH-WORK.md). The September 22 results below are historical.

# Technical launch checklist — 2026-09-22

This review package is complete for the requested draft/review/test work. Commercial launch and automatic Funded decision-making remain gated on evidence and approved terms.

## Completed in this review

- [x] Compare public policy, Funded client/server behavior and API semantics.
- [x] Reproduce and explicitly assert all five known policy differences.
- [x] Draft program thresholds, formulas, reset semantics, event requirements and broker specification template.
- [x] Add Funded server tests for phase targets, loss boundaries, missing data, write failures, audit writes and authorization.
- [x] Add billing tests for authentication, waitlist, pricing, duplicate prevention, entitlement statuses, cancellation configuration, throttling and SDK failure.
- [x] Run real Stripe TEST-only checkout/subscription/invoice/cancellation/decline checks; remove temporary test resources.
- [x] Draft API terms, privacy notice and processing-addendum review document.
- [x] Add a reproducible aggregate regression command and GitHub Actions configuration.

## Before approving Funded rule changes

- [ ] Obtain actual purchased terms for each affected account/program and confirm the decision-maker.
- [ ] Approve static/trailing max loss, daily basis, consistency, reset/timezone and breach equality.
- [ ] Reconcile generic public 5%/10% text with approved program-specific limits; remove unsupported instrument promises.
- [ ] Obtain broker-authoritative symbols, contracts, costs, sessions and margin specifications.
- [ ] Define and verify gross/net P&L mapping, closed-trade identity and open-position/boundary coverage.
- [ ] Resolve permissive history parsing, empty automatic re-evaluation, sticky breach behavior and mode-before-validation findings in POLICY-REVIEW.md.
- [ ] Replay real histories and resolve every unexplained status/balance/breach/trading-day difference.
- [ ] Collect at least seven days of representative shadow results with at least five complete accounts and 100 accepted events; no unresolved discrepancies.
- [ ] Approve versioned new-account/migration scope and manual-review/rollback plan before enabling automated decisions.

## Before paid activation

- [ ] Configure a dedicated API live Stripe secret in Secret Manager and explicitly bind it to every deployed runtime that reads it. Current billing function declares only the shared secret; naming a dedicated variable is not sufficient deployment configuration.
- [ ] Confirm merchant legal identity, supported markets, taxes, price, recurring consent, invoice identity and refund/cancellation terms.
- [ ] Verify hosted checkout form completion, renewal success/failure/recovery, duplicate attempts and portal cancellation end-to-end in a staging/test environment. Current automated Stripe checks exercise APIs, not that full browser/renewal journey.
- [ ] Verify live-mode behavior and entitlement removal with an authorized live payment/cancellation test before opening upgrades.
- [ ] Confirm $49 subscription dates versus UTC monthly usage resets, free/test quotas and no automatic overages are explained accurately.
- [ ] Preserve the current waitlist until those paid gates pass. Keep Funded challenge-payment hold separate from API billing activation.

## Before public commercial launch

- [ ] Complete operator/entity/address, governing law, customer market and privacy contact fields in the legal drafts.
- [ ] Obtain legal review of terms/privacy and a processing agreement where applicable; confirm providers, regions, transfers, refunds, liability and consumer rights.
- [ ] Approve and implement retention/export/deletion and incident-response procedures; test backup restoration handling of deleted records.
- [ ] Publish reviewed legal documents and implement/version acceptance records; do not publish these drafts as effective terms.
- [ ] Invite 3–5 external beta testers and collect at least three successful docs-only integrations, including signup and real email verification.
- [ ] Rerun desktop/mobile discovery → signup → email verification → key → request → usage journey after final production configuration changes.
- [ ] Run the new CI workflow remotely after pushing; local aggregate checks are not a completed GitHub run.
- [ ] Confirm monitoring recipients, alert delivery, backup health, support ownership and a recent recovery drill against the existing operations runbook.
- [ ] Record final release sign-off, known limitations and rollback owner; publish accurate availability/pricing/support.

Live rules, customer entitlements, paid activation and public legal documents were not changed by this review. Existing engineering and deployment evidence remains in ../LAUNCH-CHECKLIST.md and ../STEP-5-PROOF.md.
