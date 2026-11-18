# Real analytical data ingestion

- [x] Replace static correlation/COT/liquidity descriptions with real data ingestion within explicit product coverage.

All three market pages already had production data ingestion. This review verified their live endpoints and rendered output, corrected the remaining guide-only titles/descriptions in the build source, and strengthened refresh/failure behavior.

| Product | Actual data and calculation | Verified observations |
| --- | --- | --- |
| FX correlation | Six FX pairs; Pearson coefficients calculated from 30/60/90 aligned daily simple returns using ECB reference rates via Frankfurter. Cross rates derived from EUR quotes. | All three windows returned HTTP 200 and dated matrices ending September 25, 2026. This is daily historical data, not intraday correlation. |
| COT | Official CFTC Legacy Futures Only; commercial and non-commercial net positions equal long minus short contracts; includes reported open interest and searchable contract names. | 379 contracts for September 22, 2026 loaded in Chrome. Weekly reports are not live positions. |
| Liquidity | Coinbase Exchange level-one BTC/USD and ETH/USD books; best bid/ask, displayed quantities, spread and basis-point spread. | Both products returned current timestamped quotes; refresh every 15 seconds while visible. This is one venue's best prices, not full depth, global FX liquidity or a slippage estimate. |

Changes: COT now records retrieval time separately from position date, flags reports older than ten days, preserves dated prior observations after a failed/invalid refresh, prevents overlapping loads and paginates rather than silently truncating reports. Missing, negative, malformed or unsafe position values fail validation. COT reloads when returning to the page; liquidity/correlation polling resumes after browser Back/Forward restoration. Coinbase source links now follow the selected product. The separate manual correlation calculator explicitly says it uses user-entered data and links to the automatic FX matrix.

No synthetic replacement data, paid provider signup or universal live-market claim was introduced. Existing server caches, bounded stale fallback, unavailable states, and observation/retrieval timestamps remain in place. Correlation's six-hour server cache suits daily reference rates; Coinbase snapshots cache for ten seconds and reject books over a minute old. Publication interruptions can delay COT; an age flag does not assert that a newer report exists.

Verification: backend Pearson/alignment/order-book tests passed; COT browser-state tests passed for arithmetic, aged reports, invalid/failed refresh preservation and search. Real Chrome checks passed for all three sources at 390px and 1440px without page errors or horizontal overflow; ETH selection updated both the quote and source link. Build passed. Sanitized observed status text and row counts are in `docs/qa/analytics-live-2026-09-28.json`.

Sources: [Frankfurter API](https://frankfurter.dev/), [Coinbase Exchange book](https://api.exchange.coinbase.com/products/BTC-USD/book?level=1), [CFTC dataset](https://publicreporting.cftc.gov/resource/6dca-aqww.json), and [CFTC release schedule](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm). CFTC generally publishes Friday reports reflecting Tuesday positions; holiday or other publication delays remain possible.

Local regressions: `node --test backend/analytics-core.test.cjs` and `node scripts/test-cot-feed.cjs`. Live checks require access to the fixed provider endpoints above and `webMarketAnalytics` in Firebase project `fynx-c7a28`.
