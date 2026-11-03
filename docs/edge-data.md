# Edge Radar data service

Edge Radar extends the existing Quant Node service. The browser receives cached research snapshots; price loading and backtesting run on the server. Build and local provider validation are separate from deployment. No production service, cron schedule, email provider or credentials are installed by these source changes.

## Start and verify

Use Node 22 or newer and the repository dependency lockfile. Copy the required server settings from `.env.example` into an ignored environment file. Keep both private stores outside the public document root on a persistent volume in production.

```sh
npm ci
npm run build:quant
npm run build:edge
node --env-file=.env scripts/quant-dev-server.cjs
```

The same-origin Node adapter handles `/api/quant/*` and `/api/edge/*`; put it behind an HTTPS reverse proxy. The preview server whitelists public assets and never serves `.env`, backend source or either data store. Existing Firebase authentication supplies bearer ID tokens, which the server verifies with revocation checks. ADC/workload identity and `QUANT_FIREBASE_PROJECT_ID` must identify the existing project. There is no browser-supplied UID trust.

```sh
# Seed real daily histories for all 17 markets; serial source requests, resumable request cache.
node --env-file=.env scripts/edge-seed.cjs --all
# Fetch official CFTC position rows and inspect a safe coverage receipt.
node --env-file=.env scripts/edge-cot.cjs
# Compute the guest snapshot; refresh does not send email.
node --env-file=.env scripts/edge-refresh.cjs --timezone America/Los_Angeles
# Explicit historical observation, with unknown source availability preserved.
node --env-file=.env scripts/edge-refresh.cjs --as-of 2025-05-20T10:00:00Z --timezone UTC
```

`EDGE_DATA_DIR` defaults to `.edge-data`; `QUANT_DATA_DIR` holds reused prices and calendars. `EDGE_SNAPSHOT_WORKERS` defaults to 2 (allowed 1–4), with at most 12 waiting jobs and 100 retained job metadata records. Each calculation worker has a 512 MB heap and a default 180-second limit (`EDGE_SNAPSHOT_TIMEOUT_MS`, allowed 1–3600 seconds). Snapshot input is capped at 24 MB. API rate limits apply per remote peer, so configure the reverse proxy deliberately; forwarded IP headers are not blindly trusted. The provider quote limiter remains the shared conservative `QUANT_QUOTES_PER_MINUTE=8` per process. Horizontal scaling requires a shared quota coordinator and transactional store adapter.

## Sources, timing and coverage

Prices reuse the [Dukascopy historical source](https://www.dukascopy.com/swiss/english/marketwatch/historical/) and Quant provider interface. Daily candles are bid prices and use opening timestamps. A snapshot uses only candles whose complete period ends at or before its as-of time. Requests end at the last completed UTC daily boundary. No data is extended backward to manufacture ten years. Exact saved H1/H4/M1/M5/tick strategies require matching imported history; the daily engine is never silently substituted. Large tick strategies remain an explicit unavailable fit if their execution history exceeds the bounded snapshot input; Quant's separate streaming backtest supports those archives.

CFTC positions use official futures-only public-reporting datasets: [TFF](https://publicreporting.cftc.gov/resource/gpe5-46if.json) leveraged-money long/short positions and [Disaggregated](https://publicreporting.cftc.gov/resource/72hh-3qpy.json) managed-money long/short positions. Forex uses EUR, GBP, JPY, AUD, CAD, CHF and NZD contracts; metals use gold and silver; indices use the e-mini S&P 500, Nasdaq 100 and DJIA x $5 contracts. BTC and ETH use their own futures. Cross rates combine normalized legs, and USD-base pairs invert the foreign currency leg in the pure engine. The fetch imports approximately 13 years so a ten-year trade history can also have a three-year positioning window.

The report observation date is **not** treated as publication time. Each current row retains Socrata `:created_at` and `:updated_at`; `availableAt` is the later timestamp. Missing source metadata falls back conservatively to first observation. Revisions and older bulk loads therefore make some old positioning flags unknown. They are never backdated to a guessed Friday. The UI exposes relaxed historical filters and actual sample counts. Provider timestamps represent availability of the current row version, not a complete historical revision archive. See the [CFTC release schedule](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm). CFTC has [announced a future frequency change](https://www.cftc.gov/PressRoom/PressReleases/9316-26); review the Friday runner before that change takes effect.

VIX uses [FRED VIXCLS](https://fred.stlouisfed.org/series/VIXCLS) and requires `EDGE_FRED_API_KEY`. The [observations API](https://fred.stlouisfed.org/docs/api/fred/series_observations.html) is requested with a prior-UTC-day real-time vintage. A daily close is usable only after the following UTC boundary. This intentionally avoids using later same-day revisions. Missing values remain missing; absent key or entitlement means unavailable VIX and, where required by the formula, unavailable market mood.

The calendar reuses Trading Economics with `QUANT_CALENDAR_API_KEY` and the required historical entitlement. Quant's original high-impact path remains unchanged. Edge requests medium/high releases and stores them in a separate namespace so a high-only archive is not mistaken for complete medium/high coverage. Actual, forecast, previous and revised numeric zero are preserved. Estimated release times are excluded from release-time studies. First-observed schedule timestamps are persisted; old calendar rows without point-in-time schedule versions have unknown entry-time event flags.

```sh
# Resumable 30-day medium/high chunks; only run with entitled credentials.
node --env-file=.env scripts/edge-calendar.cjs --from 2016-11-03 --to 2026-11-03 --max-gb 0.25
# Exact H1 data for event studies/saved H1 strategies; Quant importer is bounded and resumable.
node --env-file=.env scripts/quant-history.cjs --symbol EURUSD --tf H1 --from 2016-11-03 --to 2026-11-03 --max-gb 1
```

Event moves prefer actual release-to-60-minute observations only when exact completed endpoints exist. Otherwise the result is explicitly a daily-close proxy. Moves are **fractional absolute returns**, so display percentage values by multiplying by 100. The formula converts that return to current price units when comparing it with a stop distance. Medium/high upcoming events and high-only news strategy inputs remain distinct.

Headlines reuse the deployed FYNX `webMarketFeed?kind=symbol` endpoint. Publisher, publication date and internal `readerUrl` are retained. Positive/negative/mixed/unclassified tags are disclosed word rules on the headline, not a full-article or investment assessment. A source failure produces an unavailable response.

## Storage, caching and private accounts

`EdgeStore` implements durable gzip logical tables with atomic writes, private filesystem permissions, hashed file keys and cross-process mutation locks: `edge_snapshots`, `market_state_daily`, `cot_weekly`, `event_moves`, `strategy_trade_tags`, `alerts`, `ea_tokens`, `ea_heartbeats`, `user_preferences`, `notifications`, `delivery_claims`, `provider_status`, `fred_vix` and `snapshot_jobs`. Snapshot job execution metadata is currently process-local and expires after 15 minutes; saved snapshots and schedule claims survive restart. A restart interrupts in-flight work, which the next read/scheduled claim can recompute. Retain persistent volumes and include them in the host backup policy. The filesystem adapter is intended for a single service host; a horizontally scaled installation needs a shared transactional adapter and distributed worker/quota coordination.

Actual backtests are cached by strategy kind/parameters, symbol, exact data/events, completed date cutoff and engine bundle hash. Entry tags and current fit are recomputed from the appropriate point-in-time state; a cached trade list does not bypass source-availability checks. No account telemetry is included in this public-price backtest cache. Daily snapshots use per-user/timezone keys, and saved strategy revisions invalidate the user's cached snapshot. Guest snapshots use the three explicit built-in strategies. Guest default watchlist: EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, XAUUSD, SPX500 and BTCUSD. Guest views outside that list compute a separate detail snapshot without changing the watchlist.

Heartbeat token hashes, account metadata and watchlists stay private. Snapshot account calculations use `guardFor` so revoked or stale telemetry is not revived by an old cached heartbeat. The guard is refreshed on cached snapshot reads. Broker lot sizes remain unavailable without fresh actual contract metadata and equity. Full token, telemetry, protection and digest setup is documented in [edge-ea.md](edge-ea.md).

## API contract

- `GET /api/edge/today?timezone=America/Los_Angeles`: direct `EdgeSnapshot` plus `generatedAt`, `localDate`, `guest`, `status`, `providerStatus`, `providerIssues`, `guard` and optional `refreshJob`. `status` is available, partial or delayed. Cold caches return HTTP 202 `{status:"building",message,job}`. Stale reads return the last actual snapshot and enqueue a refresh.
- `GET /api/edge/market/EURUSD`: `{market,asOf,generatedAt,userTimezone,status,providerStatus,providerIssues,guest,guard,refreshJob}`; a cold detail returns the same 202 job envelope.
- `GET /api/edge/strategy/:id` (optional `/fit` suffix): `{strategy,fits,asOf,generatedAt,status}` scoped to the current guest/account snapshot.
- `GET /api/edge/watchlist`: `{symbols,timeZone,guest}`. Authenticated `POST` accepts only `{symbols,timeZone}` (or `timezone`), 1–17 supported IDs. It preserves notification/email preferences and queues a new snapshot.
- `GET /api/edge/jobs/:jobId`: opaque owner-scoped metadata, progress, optional safe error and completed `snapshotAt`. It never exposes another user's job or raw strategy inputs.
- `GET /api/edge/headlines?symbol=EURUSD`: attributed existing feed records with disclosed headline tone metadata.
- Profile protection routes are delegated to the verified protection service before generic Firebase auth: tokens, heartbeat, guard, preferences, alerts, notifications and unsubscribe. They retain their own authentication rules.

## Scheduled installation

The runner is idempotent by persisted owner/timezone/local-date claims, grouped by IANA timezone. Install a minute-level host scheduler only after the service host and provider configuration are approved:

```cron
* * * * * cd /srv/fynx && /usr/bin/node --env-file=/run/secrets/fynx.env scripts/edge-runner.cjs >> /var/log/fynx-edge-jobs.log 2>&1
```

At or after 05:30 local it computes that day's snapshot; missed runs catch up. Daily-date claims prevent duplicate DST runs. At or after 06:00, digest sending additionally requires all of: `--send-opted-in-email`, `EDGE_EMAIL_SEND_ENABLED=true`, verified opted-in recipient, configured Mailgun and unsubscribe secret. The default command never sends email. CFTC checks start Friday 16:00 America/New_York and retry hourly until the expected Tuesday observation appears, including holiday delays. The expected date is only a retry target and never supplies data publication timestamps. Weekly event moves refresh Sunday after 03:00 UTC; missing entitled history stays unavailable. Heartbeats are pruned after 30 days. Keep the existing Quant nightly completed-price importer scheduled separately. Do not install overlapping unbounded seed/download jobs.

## Validation evidence from this implementation

On 2026-11-03 the official CFTC source returned 8,886 records across the configured contracts, latest report date 2026-10-27. All 17 daily histories were fetched or reused from actual Dukascopy caches through the completed 2026-11-02 candle. Fifteen FX/metals/index series begin 2016-11-03; BTC begins 2017-05-07 and ETH 2017-12-11. No earlier crypto history was invented. The local eight-market snapshot completed in about 2.6 seconds including provider cache reads and the worker. This is local evidence, not production load or delivery evidence.

FRED/calendar/quote credentials were not present during the live smoke, so those inputs and dependent complete scores were explicitly unavailable. Unit tests mock those sources solely inside `tests/edge/fixtures`; no fixture is a production fallback. The fixed `2025-05-20T10:00:00Z` golden summary exercises the real worker, engine, private persistence and cached read path. Backend tests also cover CFTC row-version timestamps, FRED vintages, separate calendar coverage, duplicate schedule claims/DST, owner-scoped APIs, revoked account telemetry through protection tests and provider-free cached reads. Production scheduler behavior, authenticated browser identity, broker-terminal delivery and email delivery need their own configured deployment validation.
