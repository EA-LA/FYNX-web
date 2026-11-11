# FYNX API plans: Stripe setup (owner, one time)

The code for the Developer and Business plans is deployed but **not sold** until these Stripe objects exist and their IDs are added to `backend/developer-plans.cjs`. Until then, the website's Billing page offers only what is purchasable (the legacy $49 API Pro), and nobody can be charged for extra calls.

Do this in the **live** Stripe account that owns the existing `FYNX_API_STRIPE_SECRET_KEY`. IDs (`mtr_…`, `price_…`) are not secret; send them in chat or a pull request. Never send a secret key.

## 1. Billing meter (extra calls)

Stripe Dashboard → **Billing → Meters → Create meter**

| Field | Value |
|---|---|
| Display name | FYNX API extra call blocks |
| Event name | `fynx_api_overage_blocks` (exactly) |
| Aggregation | **Sum** |
| Value key | `value` (default) |
| Customer mapping key | `stripe_customer_id` (default) |

Each event means one started block of 1,000 extra calls.

## 2. Developer plan

**Product catalog → Add product**: name `FYNX API Developer`.

- **Price A (base):** Recurring · Monthly · **$19.00** · Flat rate / standard (licensed, quantity 1). USD.
- **Price B (extra calls):** Add another price on the same product: Recurring · Monthly · **Usage-based** · choose the meter from step 1 · Per unit · **$0.50** per unit. USD.

## 3. Business plan

Product `FYNX API Business`:

- **Price A (base):** Recurring · Monthly · **$99.00** · licensed. USD.
- **Price B (extra calls):** Usage-based on the same meter · Per unit · **$0.30**. USD.

## 4. Send the IDs

Send these five values:

```
meter event name: fynx_api_overage_blocks
developer base price:  price_...
developer extra price: price_...
business base price:   price_...
business extra price:  price_...
```

They go into `STRIPE` in `backend/developer-plans.cjs`. The code checks every price at checkout (amount, currency, interval, licensed vs metered, live mode). If anything differs, checkout is refused and no payment is taken.

## 5. Webhook events

The existing API billing webhook already receives `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed` and `customer.subscription.*`. No change needed.

## How billing behaves

- Included calls: Free 1,000 · Developer 25,000 · Business 250,000 per UTC calendar month (live environment; test is never billed).
- Paid plans **stop at their included calls** unless the customer raises their monthly request cap in Settings (max 10× the plan). The cap is a hard limit.
- When a call starts a new block of 1,000 extra calls, the gateway queues that block atomically with the usage counter and sends one meter event with identifier `fynx-<uid>-<YYYY-MM>-<block>`. Stripe rejects duplicate identifiers, so retries never bill twice. If Stripe is unreachable, the API call still succeeds and the block is retried on the next block or Billing refresh. Blocks older than Stripe's 35-day window are flagged `needs_review` instead of sent.
- Legacy API Pro ($49, 50,000 calls, 30/sec) subscriptions are unchanged and never metered. API Pro is no longer sold once a new plan is purchasable.
