# News Intelligence website release

Scope: EA-LA/FYNX-web, based on main de896be3c27e0fe9bc588d79df31b98706ef6556. The authoritative working branch is codex/news-intelligence-20261024. No native iOS files are modified.

## Placement and behavior

- Existing News > News Feed (`/news.html`) is now a native, responsive workspace. The existing `/news/news.html` direct route uses the same generated fragment. No top-level navigation item is added.
- Headlines have market filters, text search, publication and retrieval dates, explicit saved/partial states, pagination and source-saving actions.
- Watch & listen contains 13 official video/broadcast/podcast destinations from seven publishers. These are original publisher libraries, not licensed private feeds. Publisher access terms are separate from FYNX.
- Official sources combines six institution calendars, a regional source guide and dated Fed/BEA/ECB releases. The guide does not imply real-time event geography.
- Existing Macro, Markets, Analysis and Positioning tabs retain all 13 lazy module destinations. Heat Map, Sentiment, Challenges, research and calendar links remain available. Native Feed navigation now preserves browser history correctly.
- Contextual Pro prompts and intentional source-save actions use existing plans and the existing server-verified research watchlist. See NEWS-MEMBERSHIP-2026-10-25.md for account, draft and payment boundaries.
- Home's former unreliable X widget is replaced within the same panel by Finance voices: FinancialJuice, Unusual Whales and investingLive. All three X-profile links remain. Other Home sections are unchanged.
- The landing-page theme icon is explicitly centered within its existing control. Measured at 390px and 1440px viewports, its horizontal and vertical center offsets are zero.

## Loading and recovery

The publisher/institution catalogs render without a feed request or sign-in. Cached feeds render immediately. Only the selected headline category is requested, in parallel with official releases. Client requests have a 6.5-second deadline; upstream provider requests have a 4.2-second deadline. Slow or missing providers produce truthful saved/unavailable states and working original-source links. Public content never depends on membership checks.

A cold local browser visit using the deployed feed returned headlines in 1.954 seconds from controller startup; immediate catalog rendering took 1ms. These are observed results, not a guarantee for every network. Local-code upstream verification separately returned headlines in 2.746 seconds and all 77 official releases in 3.921 seconds.

## Verification

151 focused checks passed: 38 feed/data normalization and deadline tests; 71 consumer backend checks; 11 Pro interface checks; 14 membership dialog checks; 17 News controller/routing checks. Backend review used Node 22.23.4. Full npm test, npm run build and npm run test:discovery passed. Build-generated unrelated ads.txt removal was restored, preserving the existing publisher file.

Browser verification covered 390px phone and 1440px desktop widths, light/dark News, both existing News routes, source-save modal and guest pricing, media controls, official release rendering, Pro destination, Home source directory and theme alignment. A deliberately blocked data script still exposed three static publisher links and three institution links; the block was removed afterward.

## Release and boundaries

Static publication uses the existing GitHub Pages deployment from main, behind Cloudflare. The Vercel dist package is not the serving source. Firebase updates are isolated to webMarketFeed, consumerLiveWorkspace and consumerLiveWebhook, with unchanged product/price IDs and existing secret bindings. No other function, Firestore rule, account or subscription is changed by the release.

No live customer charge or new hosted checkout completion was performed. Synthetic/local tests cover checkout, provider entitlement, portal recovery, cancellation, signature validation, account switching and retry behavior. Existing App Store and web memberships are not automatically interchangeable. No private Bloomberg/CNBC subscription access or new AI provider service is claimed.

Local verification and deployment logs are stored under output/market-intelligence-data, output/payment-verification and output/playwright. The final website release report records deployed commit, public checks and screenshot evidence separately from these source checks.
