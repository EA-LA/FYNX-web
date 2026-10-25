# News research saves and web memberships

Prepared from `EA-LA/FYNX-web` baseline `de896be3c27e0fe9bc588d79df31b98706ef6556`. This document records source and offline verification. It does not assert that a payment was taken or that this patch has been deployed.

## Customer experience

News, official releases, institution calendars and publisher videos/live pages/podcasts remain free to browse. An intentional **Save research** action opens a dismissible research-note dialog. The original source stays available from **Continue reading free**.

Essential ($5.99/month), Plus ($10.99/month) and Professional ($30.99/month) keep their existing web prices, included products and saved-workspace quotas. Research notes use the existing `watchlist` product. They contain the original title, source URL, source date when supplied, research labels or tickers and the customer's note. They do not promise a new price feed, AI report, publisher subscription or Apple/Stripe entitlement transfer.

Authentication and membership services load only after an intentional save, or an explicit return from sign-in/checkout. A slow account request stops waiting after 8.5 seconds and offers recovery. It never blocks public news rendering.

The pending note is stored only in this tab's session storage for up to two hours when the customer continues to sign-in/plans or begins a save. Signed-in drafts are bound to the Firebase UID. A guest draft can be claimed during its explicit sign-in flow; other accounts cannot resume an owned draft. The existing Pro workspace offers a **Return to your research note** link through checkout completion/cancellation. Account changes clear private note and label fields and invalidate pending responses.

## Frontend contract

Load `/assets/css/news-membership.css` and `/assets/js/news-membership.js`. The script exposes:

```js
window.FYNXNewsMembership.saveResearch({
  title, url, source, publishedAt, symbols // symbols optional
});
window.FYNXNewsMembership.openPlans();
window.FYNXNewsMembership.refreshStatus();
```

The dialog uses a native modal, heading/field labels, keyboard dismissal, focus return, polite status messages and a persistent free-source action. Entry links route to the existing `/pro.html?tool=watchlist&from=news#plans`; no new top-level navigation destination is introduced.

## Server contract and release order

The existing `consumerLiveWorkspace` verifies paid Stripe state on every premium request. Its status response now declares `features.researchNotesVersion: 1`. Without this marker, the new dialog remains locked and directs the customer to the existing workspace rather than assuming the server supports the new save guarantees.

Two optional, backwards-compatible request fields support research saves:

- `accountUid` must exactly match authenticated request ownership before account writes or provider calls.
- `requestId` is a UUID. The save transaction uses an account-scoped deterministic document ID and a canonical input fingerprint. An identical replay returns the existing record and original saved result without using another saved slot, including at the quota limit. A conflicting replay is rejected. Current paid entitlement is still required for every replay.

Relevant existing payment corrections were ported from the preserved October 21 health checkout: Stripe Basil `invoice.status === 'paid'` support; contradictory legacy `paid:false` denial; revoked-session validation; independent billing-portal recovery; fixed-origin allowlisted tool return paths; exact checkout idempotency payload retention; client account-switch invalidation and pending/canceled checkout messaging. Existing price IDs and products were not changed.

The prepared package is `output/consumer-news-deploy`. It exports only `consumerLiveWorkspace` and `consumerLiveWebhook`. Its source hash manifest is `output/payment-verification/consumer-deployment-manifest.json`. The release owner must verify deployed-source rollback and secret bindings, then deploy these reviewed functions before releasing the new server-capability-dependent save UI:

```sh
firebase deploy --only functions:consumerLiveWorkspace,functions:consumerLiveWebhook --project fynx-c7a28 --non-interactive
```

No key values, live charges, provider resource creation or deployment were used in this patch's verification. Do not include unrelated website/API/Wallet functions in this release.

## Verification

96 focused checks passed on Node 22.23.4:

- 71 consumer calculation, policy, handler and webhook checks, including actual local Stripe signature verification.
- 11 Pro workspace DOM checks, including checkout return, cancellation, recovery, draft return and cross-account isolation.
- 14 News membership DOM checks, including public startup without auth imports, guest/free access, forged checkout flags, authenticated saves, outages/timeouts, old-server capability denial, stale responses, draft recovery and safe retry.

Logs are under `output/payment-verification`. Backend tests use synthetic accounts/provider responses. Event tests loaded Stripe 18.5.0 from the already-installed API checkout; it matches the backend lockfile. No hosted checkout completion, production webhook delivery, real bank payout or App Store cross-entitlement was tested here. Parent-owned browser QA must check the integrated modal on mobile and desktop.
