# Quant data service

The production website is static. On the canonical Finance World hosts, the browser maps `/api/quant/*` to the FYNX Firebase `webTradingResearch` HTTPS function. The local Node adapter is `scripts/quant-dev-server.cjs`. Building HTML does not deploy that function.

Daily backtests can load the published research archive independently of the API. The browser checks the maintained `research-data` branch on production and otherwise uses the site’s bundled `/assets/data/research/` snapshot. Each requested market must match its archive, report completed daily OHLC bars with positive, ordered prices, and carry real provenance. Selection uses the specified UTC dates; partial coverage, stale refresh dates and actual first/last observations stay visible. The manifest’s historical close is shown only as a dated daily close. A weekly scheduled calendar can fill the upcoming-release panel, but never serves as historic recorded release evidence. Account credentials and private strategies are not sent to the archive. The reference/test dataset is never a production fallback.

## Local setup

Install dependencies with `npm ci`, run `npm run build:quant`, then `node scripts/quant-dev-server.cjs` and open `http://127.0.0.1:4174/quant-analyst`. Optional credentials are listed in `.env.example` / `.env.quant.example`; with an ignored `.env`, launch `node --env-file=.env scripts/quant-dev-server.cjs`. The service binds loopback by default. The dev static server blocks backend, scripts, source, hidden files, credentials and filesystem traversal. It is a local-preview adapter; deploy the API behind a configured production reverse proxy and serve the existing static-site build separately.

Dukascopy historical data requires no key. Live quotes require `QUANT_QUOTES_API_KEY` for Twelve Data. The historical economic calendar requires `QUANT_CALENDAR_API_KEY` for Trading Economics with suitable date-range and redistribution entitlement. The adapters never log credentials or include provider request URLs in client errors. Empty data and provider failures remain explicit. Quote responses distinguish provider timestamp, fetch timestamp and previous-session percentage; one-year change must be computed from genuine historical bars, not substituted with the daily quote change.

The one authoritative symbol registry is `lib/quant/config.ts`. Each entry maps a FYNX id to a Dukascopy instrument, a Twelve Data symbol, a pip size and currencies. US30/NAS100/SPX500 Dukascopy series are broker CFD histories; they are not exchange cash-index prices. Provider entitlements may not cover every configured quote symbol. Update the symbol mappings before enabling unsupported indices.

## Historical storage and ten-year gold import

Market history is gzip-compressed JSON in private partition files, with atomic manifest updates and receipts. This is the documented simple file-store option; no Timescale or ClickHouse service is required. Configure `QUANT_DATA_DIR` on a persistent volume outside the static document root. Each tick partition covers one UTC hour, each M1/M5 partition covers one UTC day, and coarser imports use 30-day partitions. Completed partitions are reused after restart. Empty provider partitions are recorded as such; no artificial candles are inserted. Provider failures stop the import with a truthful receipt. Disk reserve defaults to 3 GiB and is checked before each partition; a maximum per-run compressed-byte budget further limits ingestion.

Example for the requested decade:

```sh
node scripts/quant-history.cjs --symbol XAUUSD --tf tick --from 2016-11-03 --to 2026-11-03 --max-gb 2
```

Rerun the identical command after a budget-limited stop to resume. `--max-chunks 24` bounds a first validation run. The receipt includes requested dates, downloaded/reused chunks, records, compressed bytes, last covered time and complete/stopped state. A successful tiny import does not establish ten-year coverage. Importer locks prevent overlapping writers for one series. If a process is killed, inspect its PID in the private lock file and remove that lock only after confirming the process stopped.

M1 imports automatically build M5/H1/H4/D1 bid OHLC partitions. Ticks remain preserved with both bid and ask. The API converts tick requests into M1 signal bars with embedded ticks and discloses this signal granularity; the engine checks fills against those ticks. It does not silently downgrade a tick request into a daily backtest.

```sh
node scripts/quant-history.cjs --symbol EURUSD --tf D1 --from 2016-11-03 --to 2026-11-03
node scripts/quant-history.cjs --symbol XAUUSD --tf M1 --from 2026-10-01 --to 2026-11-03
node --env-file=.env scripts/quant-history.cjs --calendar --from 2016-11-03 --to 2026-11-03
```

Calendar imports use monthly date ranges and persist the actual/forecast/previous fields, release time and source. Ten years of calendar coverage is available only after an entitled download completes. Estimated release times remain marked and must be excluded from release-time strategy inputs.

## Nightly job

The repository supplies the job; installing a machine scheduler is an operator action. Example cron on the service host (set its timezone explicitly to UTC):

```cron
CRON_TZ=UTC
30 2 * * * cd /absolute/path/to/FYNX-web && /absolute/path/to/node --env-file=.env scripts/quant-nightly.cjs >> /private/logs/fynx-quant-nightly.log 2>&1
```

`QUANT_NIGHTLY_SYMBOLS` defaults to EURUSD,XAUUSD; `QUANT_NIGHTLY_TIMEFRAMES` defaults to D1,M1. Configure all supported markets or only the ingested instruments. The job fetches completed days since the last partition and recent/upcoming actual calendar records when configured. Date gaps and budget exits are reported; no scheduler is installed by the development task. API data pills use actual data coverage and update time, not the cron schedule.

## API and computation limits

- `GET /api/quant/symbols`, `/bars?symbol=EURUSD&tf=D1&from=2024-01-01&to=2025-01-01`, `/quotes?symbols=EURUSD,XAUUSD`.
- `GET /api/quant/news/calendar?from=2026-11-01&to=2026-11-15&symbol=EURUSD` and `/news/headlines?symbol=EURUSD`. Headlines reuse FYNX's existing symbol-news service and keep its source attribution.
- `POST /api/quant/backtest` or `/optimize`: `{bars,params,options}`; alternatively `{symbol,tf,from,to,params,options}` loads real bars before queueing.
- `POST /api/quant/portfolio`: `{sleeves,options}`; `/montecarlo` and `/ftmo`: `{returns,options}`; `/eventstudy`: `{bars,events,options}`.
- `GET /api/quant/history?symbol=XAUUSD&tf=tick&from&to` validates stored coverage without loading raw ticks into the browser. Missing partitions return 409.
- Calculations return 202 `{jobId,status,progress}`; poll `GET /api/quant/jobs/{jobId}` for completion and result. The opaque 192-bit job id is a temporary capability: do not publish it for private imported returns. Jobs/results expire 15 minutes after completion, are memory-only, bounded to 80 entries and 128 MB total cached results (64 MB per result), and run at most 2 workers, with 12 queued tasks, 256 MB worker heaps and 120-second regular-job timeouts. Stored tick jobs default to a one-hour timeout, configurable with `QUANT_HISTORY_JOB_TIMEOUT_MS`. Cancel queued/running work with `DELETE /api/quant/jobs/{jobId}`.
- Result cache keys hash the entire operation/input/config, including bars and returns, so different date ranges or costs cannot accidentally reuse results. Worker progress reflects calculation callbacks.
- Online requests allow D1 up to 10 years, H4 up to 366 days, H1 up to 93 days, M5 up to 14 days, M1 up to 7 days and tick up to 1 day. Larger ranges must already be ingested; API reads are capped at 500,000 raw records. For a large already-ingested tick range, POST `{symbol,tf:'tick',from,to,params,options}` directly to `/backtest` or `/optimize`; the worker streams gzip partitions into completed M1 bars with actual ticks and never loads the full archive into browser memory. Backtests keep rolling ATR/range, position and day state across partitions. Streaming optimization counts actual bars, trains each grid cell sequentially on the first 70%, then evaluates the selected cell on the remaining 30% with warmup preserved. It may take substantially longer than the daily-data target on decade-scale tick archives; results include coverage and pass-count provenance. The configured timeout and response-size cap remain enforceable and cancellation terminates the worker.
- Default per-process rate limit: 90 requests per minute per direct peer. Configure the trusted reverse proxy for its own client rate limits; do not blindly trust arbitrary X-Forwarded-For headers. The data adapter coalesces identical requests and allows at most 4 pending provider requests. Quote fetches are cached for 1 minute. `QUANT_QUOTES_PER_MINUTE` sets a conservative per-process rolling 60-second provider-request budget (default 8; tune to the actual subscription). Fresh cache hits consume no request budget, simultaneous requests for the same symbol coalesce, and failures still count conservatively. Excess markets return `QUOTE_BUDGET` and a retry delay immediately; the HTTP request never sleeps for the next minute. If a previous real quote exists, it is returned as `status: stale` with its original `asOf` and `fetchedAt` plus the reason. Missing keys return `configured: false` without provider requests. Multiple service instances require a shared/distributed credit budget before scaling; the local process budget alone does not aggregate their provider usage.

## Private strategies and portfolios

The site already has Firebase sign-in. `GET/POST /api/quant/strategies` and `/portfolios`, and `DELETE /api/quant/{collection}/{id}`, require `Authorization: Bearer <Firebase ID token>`. The server verifies the token, project and revocation using Firebase Admin. Set `QUANT_FIREBASE_PROJECT_ID` and use application-default credentials or workload identity; do not put service-account JSON in public assets. Private files are namespaced by a SHA256 hash of the verified uid, never a caller-provided uid. Each collection allows 100 items and each item up to 1 MB. This initial durable store assumes a single service instance; use a shared transactional database before horizontally scaling writes. Guest strategies remain browser-local. Missing server credentials yield an explicit profile-sync error rather than implying a remote save.

`POST /api/quant/ea` generates text from current settings and returns filename, MIME type, source and notes. The website stores no broker passwords and sends no trading orders. The optional heartbeat is disabled/unimplemented in this build; enabling an environment variable alone does not create a trading-account connection.

## Sources verified during implementation

- [Dukascopy Node API](https://www.dukascopy-node.app/config/node), [tick download and sizing guidance](https://www.dukascopy-node.app/downloading-tick-data).
- [Trading Economics calendar by country/date](https://docs.tradingeconomics.com/economic_calendar/country/), [schema and timing precision](https://docs.tradingeconomics.com/economic_calendar/schema/).
- [Twelve Data quote documentation](https://twelvedata.com/docs).

A real provider smoke read EURUSD D1 for 1–8 January 2024, returning 6 bid candles in about 2 seconds. It proves that small history request succeeded, not all-market coverage, current quote entitlement, ten-year imports or production deployment.

Additional live verification: the requested 2016-11-03 through 2026-11-03 daily range was stored for EURUSD (3,127 candles) and XAUUSD (3,109 candles), with actual last candle 2026-11-02. Two hours of real XAUUSD bid/ask ticks on 2016-11-03 produced 12,910 records in two gzip partitions (104,166 compressed bytes). A server streaming execution completed on that small range; full decade tick coverage remains a distinct ingestion/storage requirement. Backend streaming tests compare both trades and held-out optimization output against the same in-memory engine across partition boundaries.
