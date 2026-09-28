> Current follow-up: [September 28 implementation and remaining work](REMAINING-LAUNCH-WORK.md). The September 22 results below are historical.

# Reproducing the review checks

Run from `fynx-api-public`. Requires Node.js 22, root/backend npm dependencies, and the Funded repository with its TypeScript dependency installed at sibling `../fynxfunded`. Override its location with `FYNX_FUNDED_REPO`. Funded source reviewed at `dc83d0b3b30a40790b84e18f7fda52ac0495f62c`; local server payment-hold edits are outside this review and untouched.

```sh
npm ci
npm ci --prefix backend
npm ci --prefix ../fynxfunded
npm run test:release
```

The aggregate runs 11 Funded server/cross-engine test groups, 36 backend tests, the calculator/pilot proofs and public API checks. It uses no production credentials. Funded tests compile the actual client/server source with an isolated in-memory Firestore adapter; billing tests execute the actual billing module with isolated SDK/auth/storage adapters. They do not claim to validate real account history or Firestore transaction infrastructure by themselves.

The new GitHub Actions workflow runs the aggregate on pushes/PRs and manual dispatch, with a pinned Funded source baseline. It is configured locally; no remote run is claimed until committed and pushed. Review the pin whenever Funded behavior changes. These tests intentionally pin five unresolved policy differences; a green run does not approve them for launch.

## Opt-in Stripe integration

```sh
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/authorized-adc.json \
  node backend/scripts/stripe-test-mode.cjs --run-test-mode
```

The script retrieves the existing `STRIPE_SECRET_KEY` in memory through Secret Manager and refuses anything other than `sk_test_`. It asserts `livemode: false` on Stripe objects. It does not alter secret configuration, Firestore plans, deployed application billing mode or the customer-facing waitlist.

Checkout/portal parameters are captured from the actual billing module via the isolated adapter and sent to Stripe's TEST API. A separate test subscription exercises successful payment, invoice history, period-end cancellation and immediate cancellation. Actual Stripe subscription responses are checked against the billing entitlement logic in memory. A simulated decline is also verified. Hosted checkout form completion and time-advanced renewal/retry behavior are not covered.

Latest run: **14 checks passed**, all final cleanup operations succeeded. Evidence: [stripe-test-evidence.json](stripe-test-evidence.json). The temporary customer was deleted, subscription canceled, checkout expired and test catalog/portal configuration deactivated. Stripe may retain test accounting records; this does not create a real charge.

An initial run was blocked by sandbox DNS. The first network-enabled attempt exposed a harness limitation: Checkout's inline price was not reusable/manageable as a normal catalog price. That attempt's checkout was expired and customer deleted. The harness was corrected to create a dedicated test product/price for subscription lifecycle checks; the subsequent complete run passed. No production billing code needed changing.

Stripe's [testing guide](https://docs.stripe.com/testing) documents simulated payment methods; the script uses test tokens/methods, never real card data.

## Deployed API smoke check

```sh
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/authorized-adc.json \
  node backend/scripts/developer-smoke.cjs --run-production
```

This separately checks the deployed API using disposable QA users and their records. It verifies the TEST billing summary, persistent Pro waitlist and denied billing portal, plus authentication, data isolation, keys, event replay/audit and quotas. It removes its own QA users and developer records. Run only against the authorized project; this is not part of automatic CI.
