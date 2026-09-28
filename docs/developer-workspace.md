# Developer workspace — implementation and operations

Entry: `/api/workspace.html`. Firebase project: `fynx-c7a28`.

## Implemented

- Email/password signup and sign-in using the existing Firebase identity system. Existing MFA challenge helper is supported. Email verification required for API key operations and billing. Password resets use Firebase.
- A workspace owned by the authenticated user, isolated test/live subcollections, and per-environment usage counters. This first release is a single-owner workspace; team seats are not included.
- Cryptographically random keys: raw token is shown once; only SHA-256 digest is stored. Rotation atomically revokes the previous key. Maximum ten active keys per environment. Ownership never comes from caller-supplied tenant IDs.
- Deployed API gateway, six Forex/price calculations with required caller-supplied metadata, and a real authenticated request playground.
- Rule-set creation, phase-account creation, event updates, account status and cursor-paginated histories. Immutable rules, strict event sequencing and duplicate/conflicting retry handling.
- Persisted account name and request cap. Saved support tickets under the user's workspace; operator access is through the Firebase admin console. No support response SLA is promised.
- Stripe Checkout, invoice retrieval and customer portal (payment method management and cancellation at period end). Customer records are dedicated to this API product, independent of funded-account purchases.

## Pricing selected by delegated owner decision

Free: 1,000 successful calls per UTC calendar month per environment, 10 requests/second. Pro: $49/month, 50,000 live calls per UTC calendar month, 30 requests/second; test remains free-tier usage. No automatic overage purchases. Requests stop at the lower of the customer's saved cap and plan allowance. Caps are independent counters in test/live with one workspace-level chosen ceiling. Subscriptions renew on the purchase anniversary; call allowances reset on calendar-month boundaries. Explicit customer caps are preserved after an upgrade and may need raising in Settings.

## Live billing — 2026-09-27

API Pro uses live monthly USD $49 price `price_1UKSHKKF1DV2t1wM2GFMJvnp`. Dedicated secrets `FYNX_API_STRIPE_SECRET_KEY` and `FYNX_API_STRIPE_WEBHOOK_SECRET` leave other products' credentials untouched. Live customers use `stripeLiveCustomer`; legacy test customers never grant access.

Only an active, unpaused subscription with the exact price, customer and developer identity and a paid live latest invoice grants Pro. Signed `developerBillingWebhook` events reconcile current Stripe state on checkout, invoices and subscription changes; duplicates are safe. Server checks refresh after at most 60 seconds and fail closed on Stripe errors. Redirects never grant access. Checkout reuse and idempotency prevent duplicate sessions; existing unsettled subscriptions direct customers to billing management.

An untouched historical default cap of 1,000 is removed on upgrade so the customer receives 50,000 live calls. Explicitly saved lower caps remain in effect. Existing API keys continue working. After checkout, the workspace selects Live and confirms access from the server. Customers can create a live key under API keys and manage cancellation/payment methods through the billing portal.

## Model boundaries

The calculator is a caller-supplied contract model, not a broker instrument catalog. It does not guarantee realized execution loss. Forex sizing, pip value, margin and break-even require contract_size, quote_to_account_rate, symbol, instrument_type and account_currency. Sizing also requires lot_step and minimum_lot. Prices/amounts are decimal strings with explicit precision bounds. Margin is simple notional/leverage.

Prop beta accepts USD, boundary-balance daily loss and a fixed UTC reset hour. Missing overnight boundary data blocks later events until an exact ordered boundary_snapshot is submitted. Each reset must be covered; the previous daily floor is checked before rollover. This release has no historical correction editor. Data coverage is explicitly submitted-events-only. Status is active, eligible or breached; eligibility is not automatic funding/payout approval. Deposits, withdrawals and fee-only adjustment workflows are not supported. Caps: 100 rule sets and 100 accounts per environment, 366 trading days per account. Unsupported corrections remain an operator recovery task.

Request histories retain successful operations and authenticated validation failures. Invalid/revoked key requests cannot be attached to a customer history. Authenticated throttling/service errors are also recorded; unauthenticated errors return directly. Failed operations and duplicate event replays do not consume monthly call allowance.

## Deployment

Version-controlled sources are `backend/developer-{api,core,engine,billing,billing-policy,billing-events}.cjs`. Export `developerWorkspace`, `developerGateway`, `developerBilling`, and `developerBillingWebhook` from their modules, initializing Firebase Admin once. Deploy only these four functions for billing changes, preserving unrelated jobs. Dependencies are locked in `backend/package-lock.json`; runtime is Node.js 22. See developer-operations.md.

Gateway base: `https://us-central1-fynx-c7a28.cloudfunctions.net/developerGateway`.

## Verification

- Backend golden/edge tests: flooring, decimal validation, risk/reward, margin, break-even, P&L replacement, sticky breach, consistency, boundary rejection, locked trailing floor.
- Production smoke tests using temporary QA users: real auth, persisted workspace, live/test isolation, key creation/rotation/revocation, real external HTTP calculation, foreign-key rejection, prop account events, duplicate replay, conflicting replay, settings and request history.
- Direct Firestore client entitlement write rejected with HTTP 403.
- Stripe test Checkout and portal created; no charge. Test customers, sessions and QA account records cleaned up.
- Browser signup verified with temporary account. Browser functional and mobile checks recorded during delivery.

Live checkout and portal are covered by `ops/api-live-smoke.cjs`; payment entitlement, cancellation and failures are covered by backend tests. Real card payment and bank payout still require a first actual purchase; no charge is made by the smoke script.

Step 4 operations and recovery evidence: [developer-operations.md](developer-operations.md).
