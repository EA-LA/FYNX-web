# FinanceWorld Research Desk

Route: `/tools/research-desk.html`. The public desk is linked from the entrance Tools menus, workspace navigation and quick access, calculator directory, Explore, lightweight directory and sitemap.

## Seven tools

1. Company financials: SEC directory search and up to ten annual US-GAAP periods, eleven metrics, matched-period net margin, filing dates, original SEC links and JSON export.
2. Selected-company screener: up to thirty saved companies; revenue, margin, profitable-income and positive-operating-cash filters. Failed reports are counted separately from non-matches. Fiscal dates and older reports remain visible.
3. Market heatmap: forty supported stocks, ETFs, crypto instruments and FX pairs; equal-size tiles, gain/decline sorting, saved watchlist, source names and per-quote timestamps. Stocks/ETFs/FX compare with the previous session; crypto compares with the rolling 24-hour open.
4. Research assistant: a deterministic brief from the loaded SEC facts, linked source filings and explanatory concepts on all browsers. Optional browser `LanguageModel` support uses a user-initiated local model download and grounded context. No paid AI API. Unsupported devices retain the sourced brief. Model capability and output are not represented as universally available or infallible.
5. Strategy Lab: two-year adjusted USD daily history or strict CSV import, long-only dual-SMA strategy, next-open execution, costs on both sides, liquidation at the final close, comparable buy-and-hold, equity chart, daily-closing drawdown, trade ledger and JSON export.
6. Manual USD portfolio: position CRUD, cash, quote marks, cost and unrealized P&L. Missing, wrong-currency or older-than-four-day marks suppress the complete total. No brokerage link or execution.
7. Crossing alerts: price and percentage thresholds, first-quote baseline, strictly newer observations, one-time firing, pause/rearm and local history. Freshness is capped at fifteen minutes. Notifications require user permission. Checks run while the research page is visible, approximately once per minute; no closed-tab/background guarantee. Web Locks coordinate automatic checks between tabs, and state is persisted before notification.

## Data and storage

- `backend/research-core.cjs` is the shared calculation and validation source. The build copies it to `assets/js/research/core.js`.
- `backend/research-data.cjs` fetches only fixed SEC, Yahoo Finance and Coinbase endpoints. SEC access is identified and paced; caches and concurrent requests are bounded. Symbol/action validation prevents arbitrary proxy URLs. No API keys or paid provider subscriptions are needed.
- `backend/research-api.js` exports the public `webResearchData` Firebase function, deployed to the existing `fynx-c7a28` project. GET/OPTIONS only. Unavailable sources return explicit errors; no example prices replace real data.
- Local records use separate guest and SHA-256 UID storage keys. Async writes check their expected scope; cross-tab changes reload state. Corrupt saved data becomes read-only and is retained for recovery export. Validated JSON import explicitly confirms replacement. No holdings or alert records are uploaded.
- Existing Pro tools, subscriptions, brokerage features, authentication and billing were not changed.

## Verification

- `npm run test:research`: 26 tests for SEC identity/date/tag/restatement handling, margins and screening, CSV rejection, next-open fills, fee parity, missing marks, crossing semantics, storage validation, allowlisted requests, caching and adjusted-history parsing.
- Existing `npm test`, `npm run test:discovery`, `npm run test:tools` and the static build pass.
- Playwright browser flows exercise live company financials, six-company screening, real 501-row SPY history and backtesting, portfolio/cash persistence, market groups, sourced assistant, alert create/pause/rearm/persistence, mobile layout and theme persistence.
- Additional isolated browser checks inject test-only quotes to verify a crossing is saved once, corrupt storage is not overwritten, unavailable feeds show no invented prices, and invalid CSV is rejected before a valid whole-file import. Test fixtures are never shipped as production data.
- Live deployed endpoint verified: SEC directory (8,031 grouped issuers at verification), Apple annual facts, stock/ETF/crypto/FX quotes, and adjusted SPY history all returned HTTP 200.
- Local verification artifacts and screenshots live in ignored `output/`, with browser artifacts under `output/playwright/`.

## Operations

Frontend publication uses the repository’s existing Vercel integration. The static packaging step excludes Firebase source, scripts, tests and local output.

To prepare the independent backend release, place only `research-api.js`, `research-data.cjs` and `research-core.cjs` in an isolated Node 22 Firebase functions package. Export `require('./research-api.js').webResearchData` from its `index.js`, install `firebase-functions` and its `firebase-admin` peer dependency, then deploy only:

```
firebase deploy --only functions:webResearchData --project fynx-c7a28 --non-interactive
```

Do not replace the existing functions index or deploy unrelated functions. No secrets, paid data services, account upgrades or scheduled jobs are involved.

Source documentation: [SEC APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [SEC developer guidance](https://www.sec.gov/about/developer-resources), [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api).
