# Optional consumer plans — sandbox release

The website, dashboard, news, calendar, learning, standard calculators and basic Journal remain free. Guests can browse the dashboard, Journal and Profile. Authentication is required only for account-specific saves/settings and optional paid tools.

| Monthly USD plan | Included tools | Cloud workspace limit |
| --- | --- | --- |
| Essential — $5.99 | Journal intelligence, position risk planner, scenario comparison, trading process review, CSV Journal export, research watchlists | 25 |
| Plus — $10.99 | Essential plus portfolio stress testing | 100 |
| Professional — $30.99 | Plus plus 500-path drawdown simulation | 500 |

The risk and portfolio tools use the customer's manual assumptions. Simulation is hypothetical, not a prediction. Analytics/export use up to 1,000 dated cloud Journal records, with no synthetic performance substituted. Watchlists contain research links and notes, not a proprietary live-price feed.

## Checkout and access

This release accepts **Stripe test keys only** and clearly labels checkout as test mode. No live payment is enabled. Consumer billing is separate from FYNX API and Funded products.

`backend/consumer-workspace.cjs` exports the `consumerWorkspace` Firebase callable. Deploy this export from the existing initialized-admin function entry point, alongside `consumer-core.cjs`, with the existing `STRIPE_SECRET_KEY` secret. The function rejects live keys. Target only `functions:consumerWorkspace`.

Every premium request verifies the current Stripe subscription server-side: account owner, test mode, active status, tier, exact USD monthly amount and quantity. Client plan flags confer no access. Cloud work is stored under server-only `fynxConsumerTest/{uid}/saved`. Transactional counters enforce saved limits. Subscription cancellation is available in the billing portal; a period-end cancellation retains access until that period ends. Immediate cancellation or inactive status revokes access on the next request. No webhook is required for this on-demand entitlement check.

Checkout reuses an open session for the same tier and expires other consumer sessions. A per-account transaction lock prevents concurrent checkout creation. Existing subscriptions must be managed before another is started; automatic tier switching/proration is not part of this test release.

## Validation

- Backend unit suite: 43 passing checks, including eight new consumer calculation/tier cases.
- Deployed sandbox integration: all three prices and six/seven/eight tool access, higher-tier denial, save/list/delete, billing portal, cancellation revocation.
- Anonymous callable requests and direct Firestore entitlement forgery rejected.
- Hosted Stripe Checkout completed with the public 4242 test card; Essential activated and a browser calculation/save/reload succeeded.
- Browser: guest Home/Journal/Profile remain open; optional email sign-in returns to Pro; plans fit 390px viewport without horizontal overflow.

Live activation remains pending by request. Before a separate live launch: create approved live Stripe prices, finalize consumer billing/refund/tax terms, add production lifecycle/reconciliation monitoring, test renewal failures and tier transitions, and replace the deliberately test-only entitlement/storage separation with a reviewed live configuration. Do not simply replace the secret with a live key.
