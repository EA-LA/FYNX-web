# Quant Analyst

Quant Analyst is part of Finance World’s static website. Its canonical route is `/quant-analyst.html`; the local service also accepts `/quant-analyst`. The shared navigation places **Quant Analyst · NEW** between Research and Profile. The page reuses the existing header, news category navigation, ticker and session system. Daily research loads published Dukascopy candles and runs in the local calculation worker. The page requests service-backed features from the research API.

## Run locally

Use Node 22 or newer and install the locked dependencies from this checkout:

```sh
npm ci
npm run build
npm run dev:quant
```

Open `http://127.0.0.1:4174/quant-analyst`. The local server serves the public site and `/api/quant/*`; it does not expose source, credentials or the private data directory. `npm run build:quant` rebuilds the engine/worker bundles and base page only. Use the full `npm run build` when validating shared terminal styling, navigation, discovery or final static publication.

Dukascopy historical requests need no API key. For provider quotes, economic-calendar history and authenticated account sync, copy the needed entries from `.env.example` into an ignored `.env` and run:

```sh
node --env-file=.env scripts/quant-dev-server.cjs
```

Do not put provider keys or a service-account JSON file into browser assets. On the two canonical HTTPS Finance World hostnames, the page routes `/api/quant/*` to the FYNX Firebase `webTradingResearch` function. Other hosts retain relative API routes. The daily archive carries only public historical observations; private account requests are never sent to the archive. Standalone hosting can serve daily backtests, optimization, portfolios, simulations and source exports without an API process. Account synchronization, tick jobs and intraday requests require a working service and the corresponding data coverage.

## Main files

| Area | Source |
| --- | --- |
| Page content and presentation | `content/quant-analyst.fragment`, `assets/css/quant-analyst.css` |
| Page controller and Profile entry | `assets/js/quant/app.js`, `assets/js/quant/profile.js` |
| Shared navigation/build | `fynx-nav.js`, `assets/js/terminal-header.js`, `scripts/build-terminal-design.cjs`, `scripts/build-quant.cjs` |
| Framework-free engine | `lib/quant/` |
| Browser worker | `lib/quant/worker.ts` → generated `assets/js/quant/worker.js` |
| Data providers, compressed history and server jobs | `backend/quant/` |
| Local server and import jobs | `scripts/quant-dev-server.cjs`, `scripts/quant-history.cjs`, `scripts/quant-nightly.cjs` |
| Automated checks | `tests/quant/` |
| Provider/storage details | [quant-data.md](quant-data.md) |
| Commands, CSV/JSON and platform source | [quant-ea.md](quant-ea.md) |

`assets/js/quant/engine.js`, `assets/js/quant/worker.js` and `backend/quant/engine.cjs` are generated from the same TypeScript source. Edit the source modules, then rebuild them. Plotly is installed and bundled locally, rather than relying on a third-party chart CDN at runtime.

## Research workflow

The Ask box uses deterministic keyword rules. It recognizes configured symbol aliases, history years, ticks/M1/M5/H1/H4/daily data, requested simulation paths, workflow steps and the common typos in the brief. Steps execute in their defined order. The selected panel becomes visible before charts are rendered. The parser never replaces a requested gold market with EUR/USD. Unavailable history remains an error or an explicit partial-coverage state.

1. **Backtest:** close-range ATR breakout with configurable lookback, entry, stop, target, holding period, costs and equity risk. OHLC inputs use completed-bar signals, Wilder ATR, next-open entries and conservative stop-first ambiguity handling. Tick execution uses bid/ask observations for fills, with its signal-bar granularity disclosed. Outputs include an equity curve, daily returns, trade list, risk/performance statistics and fill assumptions. News strategy requires recorded high-impact release history; estimated release times are excluded from release-time testing.
2. **Optimize:** a configurable entry × stop grid, progress reporting, minimum-trade filtering and a first-70%/last-30% walk-forward split. The result includes training and held-out statistics, a plain-language verdict, a 3D surface and a mobile heatmap option. Applying the best cell changes K/S and clears the old backtest until recomputed.
3. **Portfolio:** market sleeves, recorded-news sleeves, saved settings and imported returns. Equal-risk, equal-weight and inverse-volatility methods use overlapping dates. The equity overlay and correlation matrix come from those series. The default market portfolio includes a news sleeve only after verified historical release coverage is returned, with an explicit omission notice otherwise. Saved news strategies reload releases for their own markets. Portfolios made entirely from imported returns can run while the market provider is unavailable.
4. **Monte Carlo:** reproducible stationary-block bootstrap of actual selected returns, configurable up to 10,000 paths within the computation budget. The seed is shown. Charts show percentile bands, sample paths and maximum-drawdown distributions; these are simulations, not price forecasts.
5. **FTMO:** versioned 2-Step and current/legacy 1-Step rule models, configurable account sizes, risk scale, horizon and daily-data buffer. Complete recorded tick paths are synchronized across sleeves to evaluate portfolio equity within Prague trading days. Path capture is bounded; incomplete paths, OHLC ambiguity and restored daily snapshots retain the configured intraday buffer. The output separates phase passes, daily/maximum-loss breaches and horizon exhaustion. The 120-day default is a simulation horizon, not a claimed FTMO deadline. Bootstrap transitions remain statistical approximations, and these results do not prove future challenge compliance.
6. **Deploy:** downloadable/copyable MT5, MT4 and cTrader source from completed candle-breakout test settings, including the selected challenge account capital and daily/maximum guards. Changing the account capital invalidates earlier generated source. The website itself neither connects to brokers nor places orders. News/tick-only settings are rejected by this candle EA generator instead of being silently converted into a different strategy.

Changing strategy/range, optimization settings, portfolio composition, simulation settings or export controls invalidates their affected results. Heavy browser calculations run in a Web Worker. Server jobs have bounded queues, progress, cancellation and expiry. The Cancel control remains available during work; a canceled run must not be represented as completed output.

Tick portfolio capture is opt-in through `captureIntraday`. Each run retains at most 50,000 changing equity/balance marks; the page distributes a total budget of 60,000 marks across selected sleeves. `captureAfterDays` skips the 60 observed days used to calibrate risk weights, so the capture budget serves the evaluated period. Synchronized paths require matching Prague-day coverage, complete source paths and reconciliation to daily returns. Quotes are combined at their actual timestamps using the last observed valuation of each sleeve; separate daily minima are never added together. Ambiguous ordering of multiple updates at the same timestamp, exhausted capture budgets, unequal coverage, and OHLC-only observations preserve the buffer. Saving a portfolio strips timestamp paths to keep portable snapshots small and explicitly restores daily-buffer behavior.

## Data and credentials

| Capability | Provider/configuration | Availability contract |
| --- | --- | --- |
| Historical bars and ticks | Dukascopy, no key | Actual returned/stored range and fetch time are shown. Provider outages do not trigger sample data. |
| Live/indicative quote adapter | Twelve Data, `QUANT_QUOTES_API_KEY` | Timestamp, source and provider status are retained. Coverage and redistribution depend on the provider account. |
| Economic calendar/history | Trading Economics, `QUANT_CALENDAR_API_KEY` | Requires the relevant historical and redistribution entitlement. No first-Friday approximation is used. |
| Recent headlines | Existing FYNX symbol-news service | Attribution and internal-reader links are retained; the News route remains available on outage. |
| Account strategies/portfolios | Firebase identity; `QUANT_FIREBASE_PROJECT_ID` and application-default credentials | The server verifies ID tokens and uses the verified UID as the storage boundary. Missing configuration is an explicit sync failure. |
| Private data volume | `QUANT_DATA_DIR` | Use a durable location outside the static document root. Initial file-store writes assume one service instance. |

The Market list shows provider quotes independently from one-year changes computed from actual historical endpoints. Quote daily-change fields are not used as substitutes. Each available quote retains its source, observation time and provider/stale status. The browser requests all registered markets in one bulk request at most every 65 seconds while visible and idle, prioritizing missing and oldest entries. The server shares a rolling provider credit budget across requests, defaults to eight credits per minute, and exposes `QUANT_QUOTES_PER_MINUTE` for the operator's plan. Budget-limited rows show queued/unavailable or an older real quote marked stale. A missing key stops repeated browser polling. This limit applies per service process; multiple instances need a shared budget at the provider gateway. Indices mapped through Dukascopy are broker CFD histories, not exchange cash-index datasets. The shared site ticker retains its existing source and delay disclosures.

## Ingest history and schedule updates

The downloader is resumable and budgeted. Tick partitions are compressed by UTC hour; manifests and receipts record actual coverage. The current receipt, not the requested command range, determines whether a decade has been downloaded.

```sh
node scripts/quant-history.cjs --symbol XAUUSD --tf tick --from 2016-11-03 --to 2026-11-03 --max-gb 2
```

Rerun the same range to reuse completed partitions after a budget-limited stop. Use `--max-chunks 24` for a bounded validation run. Dates are UTC and `--to` is exclusive. Do not remove the disk reserve or assume that ten years of tick history fits on a nearly full development disk. M1 ingestion also creates coarser bars. The service can use ingested history for longer research ranges; online provider requests remain bounded to avoid unbounded downloads in an interactive request.

For actual calendar history:

```sh
node --env-file=.env scripts/quant-history.cjs --calendar --from 2016-11-03 --to 2026-11-03
```

`npm run quant:nightly` supplies the updater. Install its cron/process schedule on the intended service host only after configuring the data volume, provider credentials and budgets. A runnable cron script is not evidence that a nightly scheduler is installed. [quant-data.md](quant-data.md) documents a cron example, environment variables, quotas, request limits and deployment considerations.

## Add markets or update challenge rules

Add market records only in `lib/quant/config.ts` (`SYMBOLS`). Supply the stable FYNX ID, display label, group, actual Dukascopy instrument ID, quote symbol, pip size, currencies and aliases. Verify that each provider supports that instrument and that the selected account can access it. Rebuild and test a small real history range; do not invent proxy values for unsupported markets.

`FTMO_RULES` and `FTMO_ACCOUNT_SIZES` live in the same config file. Rule percentages are fractions of initial capital; `riskPct` form/strategy inputs are percentages. Keep current and legacy 1-Step consistency bases separate. Check the official [FTMO trading objectives](https://ftmo.com/en/trading-objectives/), update the source/verification date, and extend the rule tests before changing targets, daily-loss rules, trailing-loss behavior, minimum trading days or consistency denominators. A configuration change must invalidate/recompute the displayed estimates.

## Saved research and imports

Guests save to a device-only workspace. Signed-in users use a separate device namespace and authenticated private API records. Signing in or out does not automatically merge guest and account research. Explicit workspace JSON import is the portable transfer mechanism. The Profile page links into the same Quant workspace.

CSV accepts `date,return_pct`, or `entry_date,exit_date,pnl` with the user's real starting equity. Trade-list P&L is realized on exit dates; entry dates mark trading days. It cannot reconstruct open-position mark-to-market or unseen intraday lows. That limitation is retained with the saved record. Workspace JSON includes both strategies and portfolio snapshots. Saved portfolio snapshots contain daily returns and use the daily-data buffer when restored.

## Tests and evidence

```sh
npm run build
npm run test:quant
node scripts/test-terminal-ui.cjs
node tests/quant/engine-performance.cjs
```

The recovered reference file supplied a real historical EUR/USD fixture under `tests/quant/fixtures/`. The close-data golden test checks the approved **162 trades, approximately −4.3% return, −0.11 Sharpe and 13.9% maximum drawdown**. That fixture is a test input, not a production fallback or live market feed.

Engine tests cover ATR, signal timing, future-data isolation, stop/target ambiguity, statistics, portfolio calculations, seeded resampling and challenge rules. API tests exercise provider errors, quotas, storage, identity, validation and job behavior. jsdom checks exercise the actual UI controller with test-only adapters, including CSV portability, account-switch races, saved-portfolio restoration, keyboard tabs, chart visibility/layout isolation, cancellation and input/result invalidation. These automated fixtures are not displayed as product market data.

`docs/evidence/quant-engine-performance.json` records local worker timing, CPU/runtime, fixture and engine hash. Its desktop measurements do not prove the requested phone Web Worker performance. Regenerate the evidence after engine changes. Native MT5/MT4/cTrader compilation, Strategy Tester results and demo execution require their corresponding platforms and are not established by TypeScript checks.

## Remaining external gates and optional extensions

- Production API deployments and scheduled archive refreshes are separate from the HTML build; verify the actual endpoints and refresh timestamps when assessing availability.
- Quote and historical-calendar credentials, entitlements and redistribution permissions must be supplied by the operator; missing ones remain visible as unavailable.
- Complete ten-year XAU tick and calendar coverage depends on successful, completed ingestion receipts. A small smoke fetch or partial partition archive does not satisfy that coverage claim.
- Native EA compilation/demo validation and physical-phone performance still require those environments.
- The optional LLM parser is an extension interface behind configuration, not an enabled model service. Keys remain server-only.
- The optional EA heartbeat is disabled/unimplemented. Setting `QUANT_HEARTBEAT_ENABLED` alone does not create an endpoint or account connection.

The page displays: **Educational research tool. Past and simulated performance do not guarantee future results. Not financial advice.** Challenge results additionally state that they are estimates from past returns and direct the user to confirm current FTMO rules.
