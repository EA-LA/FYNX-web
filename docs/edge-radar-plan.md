# Edge Radar implementation plan

Base: Quant Analyst commit `8413b933c90952fbb67d15a0aac8d7b511a9eb43` in the existing clean isolated checkout, new branch `feature/edge-radar`. Quant Analyst PR #68 remains a separate draft; Edge Radar will be reviewed as a stacked branch. Existing production remains a separately authorized release.

## Audit and integration

Finance World is generated static HTML/CSS/JavaScript. `scripts/build-static.js`, `scripts/build-terminal-design.cjs`, `fynx-nav.js` and `assets/js/terminal-header.js` own the shared build/shell. Quant supplies the framework-free TypeScript backtester, provider adapters, private compressed store, job queue and Firebase ID-token verification. Existing mail integration is Mailgun. Reuse those paths and preserve existing routes/accounts.

## Files and phases

1. Recover the approved Main/Market/Phone Claude references as design inputs only; do not publish their sample data or template runtime. Add Edge page fragments, scoped CSS, browser controller and static detail routes for configured symbols. Extend shared navigation after Quant Analyst and discovery/build packaging. Include loading, empty, delayed and unavailable states.
2. Add `lib/edge/` typed pure modules for ER, Wilder ADX/ATR, volatility ranks, regimes, event moves, mood, COT mapping, correlations, strategy fit, daily brief and trade-plan inputs. Reuse the Quant execution engine; document any new guest strategy formula. Tests prove no future-data leakage and exact score decomposition.
3. Add `backend/edge/providers.cjs` and import scripts for official CFTC TFF leveraged funds / Disaggregated managed money and FRED VIX. Preserve report observation and publication availability dates, provenance and stale states.
4. Cache actual ten-year backtests by strategy, market, data and parameters; attach entry-time states using only completed prior data. Unknown event/positioning or broker contract inputs remain explicit, not neutral invented values. Display sample relaxation and insufficient-history reasons.
5. Add durable per-user snapshots and market details, fast read APIs, timezone-grouped 05:30 morning processing, weekly event studies and Friday COT retries. Serve through the Quant Node adapter and a documented production service. Page fetches snapshots, then updates available quotes/countdowns.
6. Add hashed, revocable, one-time-displayed per-user heartbeat tokens; validate EA reports, retain 30 days, enforce freshness and account boundaries. Extend MT5 exports with opt-in HTTPS heartbeat support and Profile controls. Derive guard values from the existing FTMO rule config and real heartbeat values.
7. Add watchlists, guest defaults, threshold alerts, durable in-app notifications and opt-in 06:00 Mailgun digests with unsubscribe. No actual email is sent as part of implementation/testing. Provider delivery requires explicit configured recipient opt-in.
8. Run engine, security/API, historical-snapshot integration and UI tests; exercise actual providers, main/detail/filters/sort/errors and 360/390/430 px layouts; measure snapshot latency and browser performance/accessibility where tooling permits. Document all configuration and remaining provider/deployment/platform gates with screenshots.

## Storage and job schedule

Use a durable private Edge store outside the public document root. Logical tables/collections: `edge_snapshots`, `market_state_daily`, `cot_weekly`, `event_moves`, `strategy_trade_tags`, `alerts`, `ea_tokens`, `ea_heartbeats`, plus `user_preferences`, `notifications` and delivery claims. Writes are atomic; per-user IDs come from verified identity. Expire heartbeat records after 30 days. Scheduled runner uses persisted claims and timezone/local-date keys to avoid duplicate DST runs or duplicate email attempts.

The runner checks due work each minute: 05:30 local morning snapshots, 06:00 local opted-in digests, Friday evening CFTC refresh with hourly retry until a new report appears, weekly event-move refresh, and existing Quant nightly history refresh. Installation on a production host is distinct from implementing and testing these jobs.

## Sources and evidence contract

Dukascopy history and configured Twelve Data quotes reuse Quant. Calendar uses the existing provider interface extended to medium/high impact when supported. CFTC public Socrata datasets provide positions; FRED VIX retains observation/retrieval dates. Existing FYNX headlines open internal reader routes; any tone tag uses a disclosed deterministic rule and does not imply full-article analysis. No credentials, broker passwords, fabricated scores, sample prices, or source design values ship in browser assets. API keys go only in environment templates. Exact native EA parity requires actual broker tick size/value, lot limits and account currency; unavailable contract metadata blocks a claimed executable lot size.
