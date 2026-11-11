# Consumer memberships

The dashboard, news, calendar, learning, standard calculators and basic Journal remain free. Authentication is required for personal saves and memberships.

| Monthly USD plan | Included tools | Saved workspace limit | Live Stripe price |
| --- | --- | --- | --- |
| Essential — $5.99 | Journal intelligence, position risk planner, scenario comparison, trading process review, CSV Journal export, research watchlists | 25 | `price_1UKRLQKF1DV2t1wM2UGmB0Y6` |
| Plus — $10.99 | Essential plus portfolio stress testing | 100 | `price_1UKRMFKF1DV2t1wMgCkO7SlM` |
| Professional — $30.99 | Plus plus 500-path drawdown simulation | 500 | `price_1UKRN0KF1DV2t1wM1yPmZJ6L` |

The calculators use customer-entered assumptions. Simulation is hypothetical, not a prediction. Analytics and export use up to 1,000 dated cloud Journal records. Watchlists contain research links and notes, not a proprietary price feed.

## Live checkout and delivery

`consumerLiveWorkspace` uses the dedicated Secret Manager secret `FYNX_CONSUMER_STRIPE_SECRET_KEY` in Firebase project `fynx-c7a28`, region `us-central1`. It accepts live server keys only. Checkout uses the fixed, verified live monthly prices above, one item, quantity one, and card payments. Customer and subscription metadata bind purchases to the authenticated Firebase UID. Secrets are never sent to browsers.

Every premium request retrieves current Stripe subscription and expanded latest invoice state. Access requires the correct owner/customer, live mode, active subscription, exact tier/price/amount/currency/monthly interval/quantity, and a paid live invoice. Browser flags, success URLs and stored status summaries cannot grant access. Stripe failure denies the request. Saved work is isolated under server-only `fynxConsumerLive/{uid}/saved`; limits are enforced transactionally.

Checkout uses a per-user lock, reuses same-tier open sessions, expires other consumer sessions and persists idempotency keys across ambiguous creation failures. Existing unsettled subscriptions block duplicate purchases. The billing portal supports invoice access, payment method updates and period-end cancellation. It remains available to customers without active tool access. Automatic upgrades/downgrades are not offered; contact support for plan changes.

`consumerLiveWebhook` receives checkout completion, invoice paid/payment failed, and subscription create/update/delete events at `https://us-central1-fynx-c7a28.cloudfunctions.net/consumerLiveWebhook`. It validates signatures with the separate `FYNX_CONSUMER_STRIPE_WEBHOOK_SECRET`, checks the customer-to-user binding, and retrieves current Stripe state. Event records deduplicate retries; dependency failures return 500 for Stripe to retry. Observed billing state is advisory: current server checks remain authoritative even if notification delivery is delayed.

The existing `consumerWorkspace`, its `STRIPE_SECRET_KEY`, and `fynxConsumerTest` data remain separate. No test subscription grants live access. API and Funded products are unchanged.

## Deployment

Create a deployment directory with the four `consumer-*.cjs` runtime modules (consumer-core and the three consumer-live modules), backend package files, and an index initializing firebase-admin and exporting only `consumerLiveWorkspace` and `consumerLiveWebhook`. Target these names explicitly:

```
firebase deploy --only functions:consumerLiveWorkspace,functions:consumerLiveWebhook --project fynx-c7a28 --non-interactive
```

`ops/configure-consumer-live.cjs` provisions the product-specific live webhook and stores its signing secret without printing it. It preserves other products' credentials. Requires an authenticated Firebase CLI and backend dependencies. `ops/live-smoke.cjs` uses a disposable account to check actual live checkout creation, repeat-click reuse, all three prices, billing portal, Firestore write denial, and signed webhook processing/replay; it expires open sessions and removes its own test customer/account/records. It never enters card details or completes a charge.

## Verification on 2026-09-27

- Stripe account reports charges and payouts enabled; all three live recurring USD prices match.
- 94 backend tests pass, including calculation, entitlement, checkout and real SDK signature tests.
- Four membership UI tests pass; website build and existing Journal checks pass.
- Deployed smoke checks pass for all three live checkout prices, customer binding, session reuse, unpaid-access denial, portal, Firestore forgery denial and signed webhook probe/replay. All disposable records were removed.
- A full live card purchase, actual Stripe-originated subscription lifecycle delivery and bank payout have not been exercised. Do not describe these as verified. Monitor the first real purchase and its invoice, webhook delivery, membership access and payout separately.
