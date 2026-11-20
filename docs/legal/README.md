# FYNX website legal documents: drafts for owner and lawyer approval

**Status: DRAFT. Not published.** `docs/` is excluded from the deployed site (`scripts/public-site-files.cjs`).

## Why these drafts exist (audit item C1)

The website sells memberships through **Stripe**. The Terms and Privacy Policy it links to live at
`site.fynxfinanceworld.com/terms.html` and `/privacy.html` (repository `EA-LA/FYNX-Site`). Those documents describe
the **iOS app** and **Apple in-app purchases**. They do not mention:

- Stripe
- Firebase sign-in or cloud sync
- Google AdSense
- website renewals and cancellation
- refunds
- market-data sources
- MT4/MT5 linking

This contradicts the website checkout flow.

## What changed in the website (published)

- Every Terms and Privacy link that pointed at `ea-la.github.io/FYNX-Site/...` now uses the same documents on the
  official domain, `site.fynxfinanceworld.com`. This covers index, sign in, sign up, the Terminal gate, pricing, About and Founder.
- The pricing page states that iPhone-app subscriptions are billed and managed by Apple, separate from website billing.
- No new legal terms were published.

## Drafts in this folder

- `website-terms-DRAFT.md`: Website Terms of Service covering Stripe billing, renewal, cancellation at period end, Apple-billed app subscriptions, daily limits, market data and risk.
- `website-privacy-DRAFT.md`: Website Privacy Policy covering Firebase, Firestore sync, Stripe, AdSense, local storage, third parties and deletion.

To publish, resolve the markers, then replace `terms.html` and `privacy.html` in `EA-LA/FYNX-Site` (served at `site.fynxfinanceworld.com`). Keep the existing iPhone-app terms as a separate section or page.

## What the owner must decide before publishing

Each item below is marked `[OWNER DECISION]` or `[LAWYER REVIEW]` in the drafts.

1. **Refund policy.** The code has no refund flow. The Stripe portal allows invoice history, payment-method update
   and **cancel at period end** only. Decide whether refunds are offered at all, in which cases, how they are
   requested, and any consumer-law rights by region (for example EU/UK withdrawal rights).
2. **Plan changes.** The portal does not enable plan switching. The pricing page tells users to cancel renewal and
   re-subscribe, or to contact support. Confirm this is the intended policy.
3. **Legal entity, address, governing law and venue.**
4. **Support and privacy contact.** The site uses `support@fynxfinanceworld.com`, `support@fynxfunded.com` and a
   Gmail address. Pick one official address for privacy requests.
5. **Data retention periods** for account, journal, billing and server logs.
6. **AdSense consent.** Pages load Google AdSense (about 193 pages). Decide how consent is handled for EEA/UK visitors.
7. **MT4/MT5 linking.** The provider code is present but needs MetaApi credentials and a feature flag, so it is not live
   and is shown as "Coming soon". The privacy text for credential handling must be confirmed before launch.

## Verified behaviour the drafts are based on

| Area | What the code does | Where |
|---|---|---|
| Sign-in | Firebase Authentication: email + password, Google, Apple; password reset email | `auth/*.js` |
| Payments | Stripe Checkout, mode `subscription`, fixed monthly prices for three tiers | `backend/consumer-live-workspace.cjs`, `consumer-live-policy.cjs` |
| Webhooks | Signature-verified with `stripe.webhooks.constructEvent` | `backend/consumer-live-events.cjs` |
| Cancellation | Stripe Billing portal, `subscription_cancel: at_period_end`; paid access continues to period end | `consumer-live-workspace.cjs`, `consumer-live-policy.test.cjs` |
| Entitlement | Plan read from Stripe on the server before paid tools unlock | `consumer-live-workspace.cjs` |
| Cloud data | Journal and workspace sync to Firebase (Firestore) under the user's account | `backend/account-sync*.cjs`, `firestore.rules` |
| Account deletion | Server-side deletion flow with a receipt | `backend/account-sync-delete.cjs` |
| Ads | Google AdSense script on content pages | HTML pages (`adsbygoogle`) |
| Analytics | No Google Analytics tag found; usage counters for plan limits are kept per account | `assets/js/terminal/membership.js` |
| Market data | Third-party delayed/indicative sources such as Yahoo Finance, Nasdaq, SEC EDGAR, Cboe, Coinbase, Kraken, US Treasury, USGS, GDELT | data scripts and pages |
| AI models | Kronos forecasts run in the visitor's browser; model files are downloaded from Hugging Face | `assets/js/kronos/` |
