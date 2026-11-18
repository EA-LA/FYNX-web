# Edge Radar

Edge Radar connects the existing Quant Analyst engine to a daily market-research workspace. The source branch is based on Quant Analyst (`8413b933c90952fbb67d15a0aac8d7b511a9eb43`); deploy the combined change only after that dependency is integrated. This implementation does not execute brokerage orders or create a live production service.

## Pages and behavior

- `/edge-radar/` shows the daily brief, four desktop summary tiles, filterable/sortable market table, strategy comparisons, regime map, attributed positioning, economic events and optional account guard.
- `/edge-radar/{symbol}/` provides the five score contributions, 52 weekly regimes, similar-trade R distribution, exact sample counts, strategy switcher, attributed headlines, positioning history and conditional broker-sized plans. All 17 symbols in `lib/quant/config.ts` have generated routes.
- Below 640 px the header becomes compact, navigation scrolls horizontally, the main page keeps two tiles and replaces the table with market cards. The account card appears before the list. Controls are keyboard accessible and charts have text equivalents.
- Guests use three shared built-in research rules. Signing in switches to that account's own saved strategies; a new account receives an empty strategy state rather than another user's work. Watchlists and alerts require verified server identity.
- `Profile → Edge Radar` manages timezone, email preferences, score alerts and one-time EA reporting tokens. Quant links accept registered symbols and saved/built-in strategy IDs; they do not trust arbitrary strategy JSON from a URL.

`Main.dc.html`, recovered from the user's Claude conversation, was used as a visual reference. The attached brief supplies the detail and phone requirements. The Claude template runtime, sample prices, scores and account values are not included in production assets. No test fixture is used as a provider fallback.

## Data and calculations

[edge-engine.md](edge-engine.md) specifies every formula, unit, threshold, clipping rule and timestamp convention. Thresholds and weights live in `lib/edge/config.ts`; the public symbol registry stays in `lib/quant/config.ts`.

The regime uses completed daily candles, ER(20), Wilder ADX(14) and the 252-observation percentile of ATR(14)/close. Historical trades are tagged with only the daily state available when the entry occurred. Future bars, future events, revised COT rows and unclosed trades cannot affect an earlier score.

Strategy fit contributes regime 0–40, volatility 0–25, historical record 0–20, positioning −10 to +15 and event risk −20 to 0. Displayed integer contributions reconcile to the clipped 0–100 score. Samples relax event/positioning first, then volatility, when fewer than 30 matches exist; fewer than 15 matches withholds the score. The average R estimate uses a 30-trade prior at the overall average. A missing current component withholds the total and explains why.

CFTC TFF leveraged-funds positions cover currency/index futures; Disaggregated managed money covers metals. Each row carries its actual current-version publication timestamp. USD-base pairs reverse the currency-futures direction. Historical versions are not assigned invented Friday publication dates. Event moves use exact release/+60-minute observations when available; the explicitly labeled daily-close fallback is a fractional absolute return displayed as a percentage.

The three guest strategies use the same definitions as Quant Analyst. Mean reversion is an explicit prior-window sample-standard-deviation rule, not an alias for breakout. Its backtest works, while the unrelated entry-ATR optimization grid rejects it clearly. News drift requires actual historical calendar coverage and discloses its daily execution proxy.

## Run locally

Use Node 22+ from this checkout:

```sh
npm ci
npm run build
npm run dev:edge
```

Open `http://127.0.0.1:4174/edge-radar/` or `http://127.0.0.1:4174/edge-radar/usdjpy/`. The first request queues a bounded worker if no snapshot exists. Existing caches can be refreshed explicitly:

```sh
node scripts/edge-seed.cjs --all
node scripts/edge-cot.cjs
node scripts/edge-refresh.cjs --timezone America/Los_Angeles
```

For configured providers, copy the required blank entries from `.env.example` into an ignored `.env`, then use `node --env-file=.env scripts/quant-dev-server.cjs`. Public CFTC and Dukascopy history do not require these credentials.

| Feature | Configuration |
| --- | --- |
| VIX mood input | `EDGE_FRED_API_KEY` |
| Current quotes | `QUANT_QUOTES_API_KEY` and entitlement-aware `QUANT_QUOTES_PER_MINUTE` |
| Confirmed economic events and history | `QUANT_CALENDAR_API_KEY` with historical calendar access |
| Private strategies, watchlists and reporting tokens | `QUANT_FIREBASE_PROJECT_ID` plus the existing Firebase project's server ADC/workload identity |
| Optional email | `MAILGUN_API_KEY`, `EDGE_MAILGUN_DOMAIN`, `EDGE_MAIL_FROM`, `EDGE_MAILGUN_REGION`, `EDGE_UNSUBSCRIBE_SECRET`, `EDGE_PUBLIC_ORIGIN`; explicit `EDGE_EMAIL_SEND_ENABLED=true` |
| Durable private data | `QUANT_DATA_DIR`, `EDGE_DATA_DIR`, outside the public root in production |

Provider plans, market coverage, redistribution permission and quotas must match the owner's existing entitlement. No new paid service or account was created. Email remains disabled until explicitly configured and enabled; the scheduled command also requires `--send-opted-in-email`.

## Scheduling and hosting

[edge-data.md](edge-data.md) documents the private tables, morning 05:30 timezone grouping, 06:00 opt-in digest, Friday CFTC retries, weekly event moves and nightly ingestion commands. `scripts/edge-runner.cjs` is a runnable scheduling entry point; a host scheduler is not installed by a source change. Durable claims prevent duplicate work and email submissions. Ambiguous email acceptance is not retried automatically or called delivered.

The current Vercel build packages static assets only. A production release also needs the persistent Node service behind same-origin `/api/edge/*` and `/api/quant/*` HTTPS routes, the scheduler, server identity and provider settings. Do not expose either data directory. The filesystem store and provider quota are intended for one service host; horizontal scaling requires shared transactional storage and a shared quota coordinator. Preserve the existing Finance World hosting, Firebase rules, authentication and product routes.

[edge-ea.md](edge-ea.md) explains optional MT5 heartbeat setup. Tokens are manually entered in MT5, shown once in Profile and stored hashed on the server. The EA reports every 60 seconds only after explicit opt-in; a report expires after three minutes. No broker password is accepted. The generated source is not evidence of native MT5 compilation or terminal execution.

## Validation and evidence

- [edge-validation.json](evidence/edge-validation.json) collects the final command results, data receipts, screenshots and remaining release gates.
- Engine tests include hand-calculated indicators, exact score decomposition, COT direction/publication, shrinkage, signed correlations, prior-state tagging and future-data mutation tests.
- A fixed historical snapshot golden exercises the real worker, engine, cache and persistent store using clearly labeled test-only source records.
- Frontend regression tests execute the actual bundled app in JSDOM with test-only transport/auth adapters. Browser checks separately exercise the rendered pages, filters, sorting, links, strategy selection, guest dialogs and responsive widths.
- [edge-data-validation.json](evidence/edge-data-validation.json) records real-provider history coverage, CFTC records, local worker timing and 50 cached HTTP response measurements.
- [edge-engine-performance.json](evidence/edge-engine-performance.json) records a reproducible synthetic computation workload. It is not a provider or browser benchmark.
- `docs/evidence/edge-browser-validation.json` records browser actions and responsive checks; `docs/evidence/edge-*-audit.json` records actual axe-core audits and observed performance.
- [edge-browser-audit.md](edge-browser-audit.md) describes the audit method. Axe findings and observed paint/layout metrics are not Lighthouse scores. The requested Lighthouse ≥90 performance / ≥95 accessibility thresholds remain a separate navigation-audit release gate until measured with Lighthouse.

Commands:

```sh
npm run test:edge
npm run test:quant
npm run lint:edge:setup
npm run lint:edge
npm run typecheck:edge
npm run test:discovery
npm run build
```

The isolated lint setup is needed once on a fresh checkout. Its pinned tools and the known developer-only dependency advisory are documented in [scripts/edge-lint/README.md](../scripts/edge-lint/README.md). They are excluded from the public package.

The legacy static build removes `ads.txt` when advertising is disabled; its verification test expects the generated build state. Preserve the pre-existing tracked file after build/test verification so this feature does not alter advertising policy.

Production deployment, real authenticated browser operation, actual email acceptance/delivery, native MT5 compilation and broker reporting are distinct release checks. None should be inferred from local unit tests or a static preview.
