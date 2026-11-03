# Quant Analyst implementation plan

Baseline: EA-LA/FYNX-web `73c343e`, isolated checkout, branch `feature/quant-analyst`. The managed-worktree tool rejected the nested source repository, so this checkout is an isolated local clone. Existing dirty checkouts are preserved.

## Repository audit

Finance World is a generated plain HTML/CSS/JavaScript site, not React/Next. `scripts/build-static.js` runs page generators, shared terminal presentation and asset versioning. `assets/js/terminal-header.js`, `fynx-nav.js` and `scripts/build-terminal-design.cjs` own the existing shell/navigation/ticker. Static `.html` routes are the established routing equivalent. Backend services are Node/CommonJS and Firebase Functions; research has its own local HTTP adapter. Existing Firebase identity/profile integration must be preserved.

## Files and phases

1. Add `quant-analyst.html`, scoped `assets/css/quant-analyst.css`, browser controller/worker bundles, framework-free TypeScript `lib/quant/` engine and meaningful tests. Extend shared navigation/build/discovery to link Quant Analyst between Research and Profile with NEW badge. Reuse the existing shell. The approved reference is being recovered from Claude; no embedded market data or golden results will be invented.
2. Add `backend/quant/` provider interfaces, compressed history store, API adapter, `scripts/quant-dev-server.cjs`, historical downloader/nightly cron, environment template and setup documentation. Dukascopy provides real historical ticks/bars; Twelve Data provides optional quotes; provider gaps remain explicit. No keys committed.
3. Extend engine for OHLC/tick execution and daily mark-to-market, server worker jobs/progress/rate limits/cache. Keep heavy work off the browser main thread.
4. Add real economic calendar via Trading Economics provider, persisted event history, release-time strategy/event studies and existing FYNX news links. Calendar requires a provider key/entitlement and must not synthesize dates.
5. Add authenticated per-user saved strategies/portfolios through verified Firebase identity, guest local persistence and JSON import/export. Profile entry opens the same workspace.
6. Generate downloadable MT5/MT4/cTrader source and setup guide. Heartbeat remains optional/disabled unless configured with authenticated scoped tokens; no broker credentials or order placement from this website.

Commit each phase separately. Add engine, API, parser/import, job and integration tests; run existing site build and focused navigation checks; preview desktop/mobile. Document measured performance and unavailable evidence separately.

## Provider and rule verification

Official docs: https://www.dukascopy-node.app/config/node ; https://twelvedata.com/docs ; https://docs.tradingeconomics.com/economic_calendar/snapshot/ ; https://ftmo.com/en/trading-objectives/ . FTMO's current 1-Step rule distinguishes current Consistency (50% of net profit) from legacy Best Day (50% of positive-day profits); expose versioned config rather than silently treating them as identical. Daily-data simulations retain an explicit intraday buffer and limitation.

## External/data gates

Production publication is a separate release. Ten-year XAU tick history is resumable and disk-budgeted (about 9.6 GB free initially); record actual coverage, never claim complete history prematurely. Exact reference parity requires the original HTML/data. API credentials and provider redistribution/history entitlements are needed for calendar/live quotes. Native EA compilation and device performance require their respective environments.
