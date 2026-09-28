# Legal and purchased-agreement status — 2026-09-28

## Owner confirmations

The owner confirmed in this task that nobody has paid for a Funded challenge or an API subscription. Historical purchased-agreement reconciliation is therefore not applicable for this declared pre-sales population. This is an owner declaration, not an independent Stripe/Firestore audit. Do not manufacture retrospective acceptances or migrate unrelated legacy/test accounts.

Seller: **FYNX LLC**, Boise, Idaho, United States. Owner/contact: Elham Amini. Support and privacy: **fynxteam5@gmail.com**. The owner does not consent to publishing a private/home address. No address was supplied or published. A reviewer must determine an appropriate public business contact arrangement; do not substitute a guessed address. The owner confirmed that **no lawyer has reviewed the terms**.

## Implemented

- API legal release manifest records exact document hashes, seller and billing configuration. Drafts cannot enable checkout. Exact-content owner/legal review and verified publication are required before the release becomes available.
- Authenticated acceptance records the server user ID, time, document version/hash and explicit terms/privacy acknowledgement. Recurring consent is separate and unchecked by default. Later recurring consent does not rewrite the original terms acceptance.
- Paid checkout requires current consent before creating a Stripe customer/session; sessions from a different legal release cannot be reused. Stripe checkout requires terms consent, billing address and automatic tax. Portal cancellation remains accessible when new paid checkout is blocked.
- Reviewed immutable legal pages can be rendered with `node scripts/publish-api-legal.cjs --render`; `--verify-live` verifies exact served bytes before marking publication. Neither action was executed for these incomplete drafts. `--check` reports the outstanding fields.
- Future Funded checkout requires explicit numerical-rule acceptance and saves all phase snapshots with a digest. The paid webhook binds that purchase record and never resets an existing challenge on retry. Missing/tampered snapshots fail without writes. This is numerical-rule evidence, not acceptance of complete Funded legal terms.
- New API key creation/rotation requires accepted current terms once a reviewed release is available. Existing beta access is not silently shut down by an incomplete draft.

## Still required before paid activation

1. Qualified legal review of terms/privacy and any applicable DPA, including public contact requirements, customer markets, retention, processing disclosures and liability provisions. Keep private location unpublished.
2. Owner-approved API refund policy and actual tax registrations/settings verification. The $49 monthly amount, no overages and end-of-period cancellation reflect existing source behavior; they do not establish tax compliance.
3. Final effective documents, exact-content owner/reviewer approval, publication and deployment of the matching manifest. Do not put test-fixture approval values into the real release.
4. Staging hosted checkout, renewal/failure/recovery/cancellation and terms-consent verification, then the separately authorized live-payment exercise. Previous Stripe API test evidence predates these new checkout requirements.
5. Before reopening Funded purchases, connect the customer-facing purchase form to explicit numerical-rule acceptance and complete Funded legal acceptance. Its existing payment hold remains enabled; `FYNX_FUNDED_PURCHASES_APPROVED` alone does not remove that hold. No live checkout was enabled.

## Delivery

Deploy API `developer-legal.cjs` and `legal-release.json` alongside the updated developer billing/API/core modules, using the dedicated API Stripe credential. Leave paid access disabled until launch review passes. Stripe Dashboard's public terms URL must match the reviewed API terms. Verify Stripe Tax settings and supported markets before setting `tax_configuration_verified`.

Funded changes are packaged in `patches/funded-purchase-records.patch`, applied after `funded-progression-safety.patch`, and canonical generated modules come from `scripts/proof/sync-funded-policy.cjs`. CI applies both to the pinned baseline. The separate Funded production application has not been deployed.

Regression evidence includes immutable acceptance and spoofing rejection, stale-consent checkout denial, cancellation availability, terms/tax metadata, purchase snapshot tampering, webhook retry safety and DOM consent interaction. These are isolated tests, not real payments or customer acceptance.

Implementation references: [Stripe Checkout policies](https://docs.stripe.com/payments/checkout/custom-components.md?platform=web&payment-ui=stripe-hosted), [Stripe Tax with Checkout](https://docs.stripe.com/tax/checkout/page.md). These describe integration mechanics, not legal review of FYNX's business.
