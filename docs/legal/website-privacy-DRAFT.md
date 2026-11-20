# FYNX Finance World — Website Privacy Policy (DRAFT)

> **DRAFT for owner and lawyer review. Not published.** Resolve every `[OWNER DECISION]` and `[LAWYER REVIEW]` before this
> text replaces `site.fynxfinanceworld.com/privacy.html`. Each statement below was checked against the website code on
> 2026-11-20 (see `README.md`). Practices not found in the code are left as decisions, not invented.

Last updated: `[DATE OF PUBLICATION]`

Controller: `[OWNER DECISION: legal entity, address]`. Privacy contact: `[OWNER DECISION: one address for privacy requests]`.

This policy covers the website **fynxfinanceworld.com**. The FYNX iPhone app has its own privacy policy and App Store
privacy label.

## 1. What we collect

| Data | When | Why | Where it is stored |
|---|---|---|---|
| Email address, name/photo from Google or Apple (if you use them), account ID | You create an account or sign in | To run your account and secure it | Firebase Authentication (Google) |
| Journal trades, notes, saved tools, workspace layout, preferences, notification settings | You save them while signed in | To sync your work across devices | Cloud Firestore (Google), under your account only |
| Session and security records (device type, sign-in times) | You sign in | To show your active sessions and protect your account | Cloud Firestore |
| Membership status, Stripe customer ID | You subscribe on the website | To unlock the plan you paid for | Firestore (status) and Stripe (billing) |
| Payment card and billing details | At checkout | To take payment | **Stripe only**. FYNX does not receive your full card number |
| Daily usage counts for plan limits | You use limited tools | To apply daily allowances | Your browser, and your account when signed in `[OWNER DECISION: confirm once server-side counting ships]` |
| Settings saved in your browser (theme, edition, layout, cached data, dismissed prompts) | You use the site | To remember your choices | Your browser (local storage). It stays on your device |

We do not ask for or store MT4/MT5 trading passwords. Account linking is not live ("Coming soon").

## 2. What we do not do

- We do not sell personal data.
- We found no analytics or tracking tags (such as Google Analytics) on the website.
  `[OWNER DECISION: confirm, and update this section if analytics are added]`

## 3. Advertising (Google AdSense)

Many content pages load **Google AdSense**. Google may use cookies or similar technologies to show ads and measure them,
including personalised ads where allowed. See Google's policy on how it uses data from partner sites.

`[OWNER DECISION + LAWYER REVIEW: consent for visitors in the EEA, UK and Switzerland (a certified consent management platform is required for personalised ads), and opt-out wording for US states]`

## 4. Third-party services we use

| Service | Purpose |
|---|---|
| Google Firebase (Authentication, Firestore, Cloud Functions, Storage) | Accounts, sync and server functions |
| Stripe | Payments, invoices, billing portal |
| Google AdSense | Advertising on content pages |
| Vercel | Website hosting and some server functions |
| Hugging Face | Downloads AI model files to your browser for in-browser forecasts. Your data is not sent to it |
| Market and news data sources (e.g. Yahoo Finance, Nasdaq, Cboe, SEC EDGAR, Coinbase, Kraken) | Public data shown on the site. Requests come from FYNX servers or your browser and carry no account details |

## 5. Where data is processed

Our providers may process data in the United States and other countries. `[LAWYER REVIEW: transfer mechanism, e.g. SCCs]`

## 6. How long we keep data

`[OWNER DECISION: retention for account data, journal data after deletion, billing records, server logs, security events]`

## 7. Your choices and rights

- **Access and export.** You can export your journal from the Journal page.
- **Deletion.** You can delete your account from your profile. This removes your saved personal work. Stripe billing
  records and records we must keep by law are retained.
- **Ads.** You can manage Google ad personalisation in your Google settings.
- **Requests.** Contact `[privacy address]`. `[LAWYER REVIEW: GDPR/UK GDPR rights, CCPA/CPRA rights, response times, complaint to a regulator]`

## 8. Security

Your data is protected by:
- Firebase Authentication,
- database rules that let only you read and write your own records, and
- encrypted connections (HTTPS).

Payments are handled by Stripe. No system is perfectly secure.

## 9. Children

The website is not intended for children under `[OWNER DECISION: 13/16/18]`.

## 10. Changes

We will post changes here and update the date above.
