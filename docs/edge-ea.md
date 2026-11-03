# Edge Radar EA connections and notifications

## Connect MT5

1. Sign in to Profile with a verified email. Creating an EA token requires a sign-in within the preceding hour; refreshing an old session token does not count as signing in again.
2. Open **Edge Radar · account protection**, give the connection a name, and create a token. The raw token is returned once and is never saved in browser storage. Copy it into MT5 immediately; the Profile field is cleared after five minutes, on account changes and when leaving the page. The server retains only its SHA-256 hash. An account can have five active tokens, with a maximum of ten creations per day.
3. Complete the intended candle-breakout backtest in Quant Analyst and export MT5 source. Compile it in MetaEditor, review the inputs, test the strategy, and validate it on a demo account. The selected initial account capital, safety guards and FTMO rule version are included. Native compilation and execution have not been established by the website's JavaScript tests.
4. In MT5, enable **Tools → Options → Expert Advisors → Allow WebRequest for listed URL** and add `https://fynxfinanceworld.com`. Set `InpEdgeEnabled=true`, paste the token into `InpEdgeToken`, and confirm `InpEdgeRule` and `InpEdgePhase`. Tokens belong only in the terminal input and the HTTPS Authorization header; never share an EA `.set` file containing one.
5. Supply the actual Prague-midnight balance through `InpEdgeDayStartBalance` when attaching during the day. The existing `InpFirstDayEquity` concerns the bot's own safety guard. For a trailing rule, supply the highest historical end-of-day balance through `InpEdgeHighWaterBalance`. Unknown values remain unavailable; attaching an EA does not reconstruct previous account history. While continuously running and connected, the EA records new Prague-day boundaries and persists known account baselines.

The heartbeat runs at most once every 60 seconds through the EA's timer, independently of new trade signals. It sends all account positions, including manual positions and other bots, plus their SL/TP and broker-calculated remaining loss to the stop. Broker server/account references are hashed before persistence. It does not send a password or receive trading commands. The endpoint is fixed HTTPS; token values, request bodies, headers and response bodies are not printed in the EA journal. A 1.5-second synchronous HTTP timeout bounds the delay, but WebRequest can briefly delay the EA thread. Test that operational tradeoff on the intended terminal.

MetaQuotes documents the required URL allowlist, synchronous behavior and absence of WebRequest in Strategy Tester in its [WebRequest reference](https://www.mql5.com/en/docs/network/webrequest). The payload uses UTF-8 without a trailing null byte, following [StringToCharArray](https://www.mql5.com/en/docs/convert/stringtochararray). Remaining position risk uses [OrderCalcProfit](https://www.mql5.com/en/docs/trading/ordercalcprofit), whose result is in account currency. It excludes unknown future commissions, gaps and slippage; a missing SL or failed broker calculation makes aggregate open risk unavailable.

## Guard semantics

The API marks the EA connected only when a report arrived less than three minutes ago. Offline values retain their observation time; broker metadata is withheld from executable trade planning when stale. Revoking the last reporting token marks its connection revoked immediately. Heartbeats with stale timestamps, unknown fields, nonfinite numbers, invalid contracts, duplicate positions, replayed timestamps or account changes against an already-bound token are rejected. Per-token reports are limited to one every 45 seconds as a tolerance around the EA's 60-second cadence; the API additionally applies an IP rate limit. Heartbeat records expire after 30 days through the scheduled pruning helper.

Guard calculations read `FTMO_RULES` from Quant Analyst. Daily loss room is current equity minus the verified Prague-midnight balance less the configured rule's fixed fraction of initial capital. The separate safety-stop room uses the EA safety-stop percentage. A trailing maximum uses the greater of initial capital and the verified highest end-of-day balance. Current equity includes open-position P&L and reflected account costs. Missing day-start balance or trailing high-water metadata produces an explicit reason and null result. Distance to the phase's profit target is a balance difference, not a declaration that minimum trading days or best-day consistency have been satisfied.

The service trusts reports from the user's token as account telemetry; it is not a broker statement audit or FTMO certification. Never expose heartbeat Authorization headers through proxy access logs. Production must terminate HTTPS at the same origin and keep `.edge-data` outside the static document root.

## Trade-plan parity

Heartbeat instrument metadata includes the actual broker symbol, account currency, bid/ask, tick size, loss tick value, minimum/maximum/step volume, decimal digits and stop level in broker points. Quote timestamps are preserved. Edge trade plans can display researched trigger levels without these fields, but must not present an executable entry/lot size from a generic midpoint or guessed contract size.

For MT5 breakout orders, stop and target prices are snapped outward to the broker tick grid. Position size is recalculated from the actual rounded stop distance, the same loss tick value and downward volume-step rounding; below-minimum risk sizes are skipped. Price movement, order execution, fees and later exchange-rate changes can still make realized results differ. News and mean-reversion models remain explicit unsupported EA export types; their research settings are not silently replaced with breakout logic. MT4/cTrader exports do not yet send Edge heartbeats.

## Alerts and the 06:00 digest

Signed-in users can create in-app score alerts with `{strategyId, symbol?, threshold, emailEnabled?}`. Alerts fire on a transition from at or below the threshold to strictly above it, using actual saved snapshot scores. No available score means no alert. In-app notices link to Profile's authenticated unsubscribe controls. A global score-email preference and the individual alert email opt-in are both required for score emails.

The scheduled runner evaluates morning snapshots and the 06:00 digest in each user's saved IANA time zone. A digest requires a current-local-date snapshot and a fresh lookup of the verified account email matching the saved recipient. Browser/API callers cannot provide an arbitrary recipient. Email is disabled unless all required settings exist and `EDGE_EMAIL_SEND_ENABLED=true`:

| Variable | Purpose |
| --- | --- |
| `QUANT_FIREBASE_PROJECT_ID` and application-default credentials | Verify sessions and current email ownership |
| `MAILGUN_API_KEY` | Existing server-side email provider credential |
| `EDGE_MAILGUN_DOMAIN` | Operator's verified Mailgun sending domain |
| `EDGE_MAIL_FROM` | Authorized sender address |
| `EDGE_MAILGUN_REGION` | Optional `EU`; otherwise US Mailgun API |
| `EDGE_UNSUBSCRIBE_SECRET` | Random signing secret of at least 32 characters |
| `EDGE_PUBLIC_ORIGIN` | HTTPS public origin, default `https://fynxfinanceworld.com` |
| `EDGE_EMAIL_SEND_ENABLED` | Explicit server delivery switch, default disabled |

Emails contain text and a signed, expiring unsubscribe link plus List-Unsubscribe headers. A durable per-user/local-day claim is written before submitting a digest. Alerts also have durable delivery claims. Provider acceptance is recorded as `accepted`, not inbox delivery. Uncertain provider/network outcomes are `delivery-unconfirmed`; they are not automatically retried, avoiding duplicate sends after an ambiguous response. Preference saves report `emailConfigured:false` when delivery is unavailable, rather than implying an email subscription is currently delivering.

Unit tests replace email and identity providers with test adapters. Implementation/testing does not send actual emails. Scheduling installation, HTTPS routing, provider configuration and a separately authorized delivery check remain operational steps.

## Quant links

`/quant-analyst.html?symbol=USDJPY&strategy=<id>` preloads a registered market plus a strategy from the resolved current user's saved workspace, or a shared built-in definition (`builtin-atr-breakout`, `builtin-mean-reversion`, `builtin-news-drift`). Parameters are never taken from arbitrary URL JSON. The page displays the selected model and execution assumptions and requires a fresh backtest. `#dep` opens step 06; missing or inaccessible strategy IDs produce an error instead of substituting another user's settings. Mean-reversion backtests and portfolios are available, but the existing entry-ATR optimization grid rejects that model explicitly: a mean-reversion grid would need to vary its Z-score threshold.
