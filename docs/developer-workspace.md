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

Free: 1,000 successful calls per UTC calendar month per environment, 10 requests/second. Pro: $49/month, 50,000 live calls per UTC calendar month, 30 requests/second; test remains free-tier usage. No automatic overage purchases. Requests stop at the lower of the customer's saved cap and plan allowance. Caps are independent counters in test/live with one workspace-level chosen ceiling. Subscriptions renew on the purchase anniversary; call allowances reset on calendar-month boundaries. Existing customer caps are preserved after an upgrade and may need raising in Settings.

## Blocking live billing detail

The existing `STRIPE_SECRET_KEY` was verified to be a **test** secret. QA successfully created Stripe test checkout and portal sessions, then expired those sessions and removed QA Stripe customers. No payment was made.

The backend must NOT grant live Pro limits from a Stripe test subscription. The browser explicitly shows test billing status. To enable real subscriptions, the owner must supply `FYNX_API_STRIPE_SECRET_KEY` as a new Secret Manager secret in project `fynx-c7a28`; do not overwrite the existing secret used by other products. Replace runtime secret bindings in developer-api.cjs and developer-billing.cjs with the new secret, then deploy only the three named developer functions. The code reads the dedicated secret preferentially. The owner explicitly chose to defer live billing and use a Pro waitlist until a real key is supplied. Step 3 therefore ships free developer operations, saved Pro waitlist interest, and a tested billing integration kept in test mode. Live paid activation is a separately deferred launch task. Customer upgrade clicks save waitlist interest instead of opening test checkout.

Stripe subscription state is retrieved server-side when stale (60 seconds), and every API operation checks current entitlement. If Stripe cannot be reached after expiry, operations fail closed rather than granting stale Pro access. No success redirect grants a plan. Only an active subscription from the live configuration enables Pro. Signed webhooks and scheduled reconciliation are future resilience improvements; they are not falsely claimed as implemented.

## Model boundaries

The calculator is a caller-supplied contract model, not a broker instrument catalog. It does not guarantee realized execution loss. Forex sizing, pip value, margin and break-even require contract_size, quote_to_account_rate, symbol, instrument_type and account_currency. Sizing also requires lot_step and minimum_lot. Prices/amounts are decimal strings with explicit precision bounds. Margin is simple notional/leverage.

Prop beta accepts USD, boundary-balance daily loss and a fixed UTC reset hour. Missing overnight boundary data blocks further account events for review; this release has no historical reconciliation editor. Data coverage is explicitly submitted-events-only. Status is active, eligible or breached; eligibility is not automatic funding/payout approval. Deposits, withdrawals and fee-only adjustment workflows are not supported. Caps: 100 rule sets and 100 accounts per environment, 366 trading days per account. Support must handle unsupported reconciliation before resuming affected accounts.

Request histories retain successful operations and authenticated validation failures. Invalid/revoked key requests cannot be attached to a customer history. Throttling/service errors return directly; there is no fabricated success row. Failed operations and duplicate event replays do not consume monthly call allowance.

## Deployment

Version-controlled sources are `backend/developer-api.cjs`, `backend/developer-engine.cjs`, and `backend/developer-billing.cjs`. The existing backend deployment source is `/Users/h/Desktop/fynx-functions/functions/`. Its index exports developerWorkspace, developerGateway and developerBilling; decimal.js and stripe are added dependencies. Deploy only these functions, preserving existing jobs.

Gateway base: `https://us-central1-fynx-c7a28.cloudfunctions.net/developerGateway`.

## Verification

- Backend golden/edge tests: flooring, decimal validation, risk/reward, margin, break-even, P&L replacement, sticky breach, consistency, boundary rejection, locked trailing floor.
- Production smoke tests using temporary QA users: real auth, persisted workspace, live/test isolation, key creation/rotation/revocation, real external HTTP calculation, foreign-key rejection, prop account events, duplicate replay, conflicting replay, settings and request history.
- Direct Firestore client entitlement write rejected with HTTP 403.
- Stripe test Checkout and portal created; no charge. Test customers, sessions and QA account records cleaned up.
- Browser signup verified with temporary account. Browser functional and mobile checks recorded during delivery.

Real money movement and invoice payment have not been tested. No real paid plan is advertised as active while Stripe uses test credentials.
