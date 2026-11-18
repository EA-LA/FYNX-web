# PRO membership decision and verification

- [x] Decide whether PRO badges represent a real plan, including billing, subscription and entitlement enforcement.

Decision: preserve the already implemented, live consumer memberships. “Pro tools” names the optional paid workspace; Essential, Plus and Professional are its actual tiers. A tool's tier label indicates the minimum required membership, not proof that the current user has paid. Standard calculators and the public workspace remain free. Developer API Pro and Funded are separate products.

| Consumer tier | Existing live price | Tools | Saved workspaces |
| --- | --- | --- | --- |
| Essential | USD 5.99/month | Journal intelligence, risk planner, scenario comparison, process review, export, watchlists | 25 |
| Plus | USD 10.99/month | Essential plus portfolio stress test | 100 |
| Professional | USD 30.99/month | Plus plus drawdown simulator | 500 |

No new prices, commercial terms or refund promises were introduced. Existing checkout and cancellation behavior remain: monthly renewal, cancellation through the Stripe portal at period end, and already-paid access through the active period.

The server checks Stripe subscription state before protected operations. Access requires an active live subscription tied to the exact customer, Firebase UID, product, tier price, currency, monthly recurrence and quantity, plus a paid live latest invoice. Paused, unpaid, past-due, canceled, wrong-owner and test subscriptions fail closed. Tool availability and saved-workspace quotas are checked on the server; a browser label, supplied tier or checkout return URL cannot grant access. Signed billing events reconcile current Stripe state, so an old paid event cannot restore a canceled subscription.

## Verification on September 28, 2026

- Read-only Stripe checks confirmed all three exact live prices are active and match the advertised amounts/recurrence.
- The live consumer webhook is enabled for checkout completion, invoice paid/failed and subscription created/updated/deleted events.
- The deployed endpoint denied anonymous paid-tool access.
- A disposable authenticated unpaid account had no tier and could neither run nor save a paid tool, even with a forged `tier: pro` payload. Account and rate-limit record were removed.
- 51 backend billing-policy/webhook/workspace tests and four consumer UI tests passed. Coverage includes signatures, replay, revoked subscriptions, wrong identities/prices, outages, higher-tier denial, owner scoping and quotas. Static build passed.

No charge, refund, subscription change or Stripe customer was created in this verification. A real card purchase and bank payout were not tested in this task. The verified result is existing live billing configuration plus enforced access, not proof of a completed customer payment.

Relevant source: `backend/consumer-live-policy.cjs`, `backend/consumer-live-workspace.cjs`, `backend/consumer-live-events.cjs`, `backend/consumer-core.cjs`, and `assets/js/pro-workspace.js`. Public explanation: `pro.html`. Earlier audit documents claiming consumer subscriptions were unimplemented have been corrected.
