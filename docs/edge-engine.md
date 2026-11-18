# Edge calculation contract

`lib/edge/index.ts` exports framework-free typed calculations. `buildSnapshot` (`computeSnapshot` alias) composes the snapshot; `computeMarket` calculates one market; `runStrategyBacktest` executes a strategy through the existing Quant engine. The backend supplies recorded prices, calendar observations, CFTC row versions, FRED observations, saved strategy parameters and optional authenticated broker metadata. Tests use explicitly synthetic inputs only; none are production data.

## Information available at a snapshot

Daily candle timestamps are openings. A daily bar becomes eligible at opening plus 24 hours. Regime tags at a trade entry use the latest candle whose completion time is at or before entry. Only trades exited by the snapshot enter score samples; forced `last` exits are excluded because a dataset boundary does not establish an actual strategy exit. Quant's close-mode reference labels are converted to actual completed-close timestamps in Edge backtest results, preserving the numerical Quant results.

Saved intraday strategies require their exact stored timeframe. Return-only imported strategies cannot be re-executed or assigned invented trade-entry tags. Current quotes, CFTC versions, VIX observations and event announcements dated after a historical snapshot are excluded. Unknown historical event/crowding flags are `null`, with disclosed relaxation, never fabricated `false` values. New users with no saved strategies receive no scores; omitted `strategies` selects the three guest defaults.

Daily data older than four days carries an explicit warning; fresh broker quotes cannot validate executable plans derived from stale candles. Mood requires comparable recent risk-asset sessions. CFTC observations older than 21 days do not supply a current positioning value. All unavailable values retain a reason.

## Regime and volatility

Thresholds and weights are centralized in `lib/edge/config.ts`.

- Efficiency ratio is absolute 20-close displacement divided by the sum of the 20 intervening absolute close changes. Its signed version uses displacement direction. Flat paths return zero.
- ADX uses Wilder-smoothed true range and directional movement with period 14. The first ADX averages 14 DX observations, appearing at zero-based bar 27. Missing OHLC cannot generate an ADX.
- ATR is Wilder true range with period 14. The volatility rank compares ATR/close against 252 valid observations, including the current completed bar. Lower empirical rank is `100 × count(value < current) / 251`; ties share their lower rank. A full window is required. Low is `<33`, high is `>66`, and the endpoints are mid.
- Strong trend: ER at least .45 and ADX at least 30. Trend: ER at least .30 and ADX at least 22. Otherwise ER at least .20 is weak trend. Lower ER is range below the 50th volatility percentile and choppy at or above it.
- The 20-day high/low use real OHLC extrema. Close-only history does not manufacture intraday extrema.

## Positioning and calendar

COT net ratio is `(long − short) / (long + short)`. FX/index inputs are TFF leveraged funds; gold/silver use Disaggregated managed money. Currency futures represent currency/USD, so USD-base spot pairs invert the futures direction. Crosses average signed currency-leg ratios; the output explicitly describes this as relative positioning, not a direct cross futures contract.

Every input row has a recorded `availableAt`. The provider's current row version is not assumed available on its Tuesday observation date or on a guessed Friday. The latest version available by the snapshot is selected separately for each observation. Crowding means absolute current net exceeds the 85th percentile of absolute net observations in the trailing three years, with a minimum 104 published observations. Missing historical row versions can make historical crowding unavailable without disabling available price history.

Next-24-hour flags require an announcement known at the snapshot or an actual calendar snapshot already available then. Absence is meaningful only with known coverage. High and medium releases are shown for relevant currencies. Historical move tables use completed closes exactly at the release and release plus 60 minutes when both exist. Hourly candles cannot turn a half-hour release into a falsely precise 60-minute move: missing endpoints fall back to explicitly labeled daily close-to-close absolute moves. The engine does not interpolate prices or guess release calendars.

`averageAbsoluteMove` and `typicalMove.value` are fractional returns (0.01 means 1%). `dayChangePct.value` is percentage points (1 means 1%). Event risk converts fractional movement to price distance using the completed daily close before comparing it to the strategy stop distance.

## Strategies and score

Guest definitions are shared with Quant as `EDGE_DEFAULT_STRATEGIES`:

- `builtin-atr-breakout`: preceding 20 closes, .25 ATR trigger, 14-period ATR, 2 ATR stop, 4 ATR target, 20-bar hold, next-open OHLC execution.
- `builtin-mean-reversion`: fade a completed close more than 1.5 sample standard deviations from the preceding 20 closes, 14-period ATR, 2 ATR stop and target, 10-bar hold, next-open OHLC execution. The signal close is excluded from its own mean and variance. Flat zero-variance baselines produce no signal. Array and streaming tick backtests share this behavior.
- `builtin-news-drift`: actual high-impact release-day close-to-close direction beyond .25 close ATR, 2 ATR stop, 4 ATR target and 5-day hold. This default is explicitly a daily proxy, not a release-plus-60-minute fill, and requires real historical release records.

All default risks are .5% and configured cost is 1.5 pips; users can save their own tested settings. Actual provider coverage determines the sample; a ten-year request does not imply ten years exist.

Similar trades first match regime, volatility bucket, event-in-24h and crowding. Below 30 matches, event and positioning are relaxed together, then volatility; regime remains required. Fewer than 15 matching exited trades displays `Not enough history`. The record estimate is `(n × similar average R + 30 × all-trade average R) / (n + 30)`.

- Regime: 0–40, today's regime average R divided by the best positive eligible regime average R, clipped 0–1. Eligible buckets require 10 exited trades.
- Volatility: 0–25 using the same comparison across volatility buckets.
- Record: 0–20, linearly mapping the shrunk average from −.25R to +.50R and clipping outside that range. These mapping endpoints are explicit configuration choices because the brief did not prescribe them.
- Positioning: up to +15 times aligned net strength when not crowded; up to −10 times opposing net strength when crowded. A required unknown input leaves this part null.
- Events: −20 times typical absolute event price distance divided by the configured strategy ATR stop, capped at −20. No known upcoming event receives zero; unknown coverage remains null. Saved ATR periods, execution modes and exact timeframes determine this stop distance.

Parts round to integers. The score is their sum clipped 0–100; at a clipping boundary displayed contributions are adjusted toward zero to preserve exact addition, while `rawPoints` preserves the original contribution and the reason discloses the adjustment. Any unavailable required part makes the total unavailable. Scores at least 70 are fit, 45–69 maybe, and lower scores avoid. These are estimates of historical conditional behavior, not trade instructions.

## Mood, double risk and plans

Mood averages ATR-normalized JPY/CHF/gold strength, AUD/index weakness, and a VIX-level component `(VIX − 20)/10`, each clipped −1 to +1. At least four comparable recent risk-asset inputs and a recent as-of FRED VIX observation are required. Above .25 is risk-off, below −.25 risk-on, otherwise mixed. Missing inputs are visible in the parts.

Double-risk warnings use Pearson correlation across 20 shared completed daily sessions, multiplied by both trade directions. A coefficient above .8 warns. Combined monetary risk is shown only when both exposures have finite reported stop risk; candidate-only exposure does not invent a lot size or monetary risk.

Executable plans require fresh authenticated bid/ask and contract metadata, account equity, actual tick size/value in the account currency, volume min/max/step, digits and broker stop-level points. They use the strategy's configured ATR mode/period: arithmetic absolute close changes for close mode, Wilder true range for OHLC/tick. Stops and targets snap outward to the tick grid, volume rounds down after the maximum-volume cap, and invalid minimum distances/minimum volumes block the plan. No conversion is guessed. `brokerDigits` supports accurate display. A missing trigger, future news direction, stale metadata or unsupported exact timeframe leaves execution values unavailable while showing meaningful trigger levels where possible. Native live execution can differ from a daily close proxy; the model distinction remains visible.

The deterministic daily brief names available top measured fits, weak fits and the next known high-impact event. All language templates live in the configuration file.

## Verification

`node --test tests/edge/engine.test.cjs` exercises hand-calculated ER/ADX/regime thresholds, COT direction/publication/revisions, exact score decomposition and clipping, shrinkage/relaxation, event endpoints, signed correlation, metadata sizing, missing data and future mutations. Quant's pre-existing reference golden remains unchanged. The backend's fixed-date morning-job fixture tests the composed persisted snapshot separately.
