# My Accounts calculation contract

Implementation: `lib/accounts/index.ts`. This is a pure TypeScript module, bundled for the private account worker. It performs no network calls, credential storage, order placement or provider authorization. Providers and the API must scope all records to the authenticated account owner before calling it.

## Entry points and units

- `parseStatement(text, options)` accepts supported MT4 closed-history HTML, MT5 Deals HTML, or mapped CSV. It returns normalized records, actual statement observations, validation issues, coverage, first 20 trades and first 20 deals. Invalid rows are reported; the API prevents committing an import with errors. The file size limit is 5 MiB.
- `normalizeSymbol`, `normalizeDeal`, `normalizeSnapshot`, `normalizePosition`, `parseTimestamp` normalize provider records without making unknown values zero.
- `groupDeals(deals, {accountMode})` returns `{trades, ungrouped, cashflows, issues}`. Stable external execution identifiers make repeated imports idempotent. Conflicting duplicates fail.
- `accountMetrics(input, {asOf, timezone})`, `evaluateRules(context)`, `planChecks(trade, facts)`, `coachInsights(trades)` and `buildDashboard(input, options)` calculate the displayed values. `RULES`, `PROP_FIRMS`, `getRule` and `ACCOUNTS_CONFIG` expose the shared registry.

Money is numeric **account settlement currency**, with a separate nullable `usd` object and attributed, time-valid `fx` conversion. USD uses the exact identity rate. USDT is USDT; exchange assets are never labeled USD without a real conversion. A selected-currency cash balance does not become total-account equity. Quantities carry `lots`, `units`, or `contracts`; these units are not interchangeable. Charges are negative cash effects; a positive rebate stays positive.

Timestamps are normalized to UTC ISO strings, preserving milliseconds. Local statement timestamps require an explicit broker IANA timezone. Ambiguous or nonexistent daylight-saving times are rejected unless the source supplies an explicit UTC offset. Prague midnight resets therefore correctly span 23-hour and 25-hour days.

## Imports and trade accounting

MT4 column definitions follow the [official account-history documentation](https://www.metatrader4.com/en/trading-platform/help/overview/terminal/terminal_account_history). MT5 parsing uses the documented [history-report structure](https://www.metatrader5.com/en/terminal/help/trading_advanced/history_report) and [deal/position semantics](https://www.metatrader5.com/en/terminal/help/trading/performing_deals). Native HTML is parsed with parse5; scripts, styles, templates and remote resources never execute or load. Unsupported/localized table layouts require explicit CSV mapping or a supported export, rather than guessed columns.

Position identifiers preserve separate hedges. Where an export omits position identifiers, symbol grouping requires the user's explicit netting selection. An unmatched close remains ungrouped; the engine does not fabricate its opening. Scale-ins use weighted execution prices. Partial closes accumulate realized P&L and costs once. A reversal splits the closing and residual opening legs: realized profit and accrued swap belong to the closing leg, execution commission/fees are allocated by quantity, and unknown residual opening risk remains null.

Each grouped trade has optional `realizedPnl: [{time, netPnl}]`. This preserves actual partial-close dates, with the observed opening cash costs allocated in proportion to the closed quantity. The calendar and best-day calculation use these dates. Summary-only imported trades have a single final-close realization; their source cannot establish earlier partial exits or original fee-posting times. Average closed-trade metrics still count complete round trips. Calendar counts can include multiple realized closes from one round trip.

R is net reported trade result divided by known original monetary risk. A statement's final SL, a current SL, or an inferred pip value does not establish original risk. A documented risk for every scale-in is required before summing that risk. Missing cost components stay unknown unless the source explicitly reports the net result. Imported `initial_risk` is labeled user-declared evidence.

A statement balance/equity becomes a snapshot only with an actual report timestamp (or an explicit user-supplied statement timestamp). Balance-only files never create equity, floating P&L, a midnight equity observation or a current balance. User-declared starting balance is labeled separately. Historical dashboard queries omit round-trip summaries that close after the requested time; they do not expose their future exit or pretend to reconstruct historical partial positions from final summaries.

## Coverage, P&L and daily safety

`Coverage` distinguishes complete closed history, complete classified cash flows, complete cash ledger, actual day-start balance/equity, position inventory, and sampled/continuous/no intraday observations. Completeness flags also require explicit `from`/`to` bounds for the calculation interval. A sample minimum is the lowest **recorded** equity, not a claim about unseen ticks.

Today P&L requires actual reset equity and current-day observed equity, less classified external cash flows between those observations. Total account P&L requires declared initial capital/date, observed equity and complete cash-flow coverage. Deposits, withdrawals and credits are external cash flows; unclassified adjustments withhold adjusted profit. Later cash movements are not applied to an earlier snapshot.

`DashboardInput.safetyDailyPct` enables standalone personal limits without a prop rule; zero disables it. `dashboard.safetyLossAmount` is that percentage of declared initial capital, or of actual day-start balance when no initial capital is supplied. `dashboard.safetyLossRoom` compares current-day observed equity against actual day-start balance minus that amount. Both Metrics disclose their basis. Missing actual reset balance or current-day equity keeps the room unavailable.

## Versioned prop rules

The FTMO configurations were checked on **2026-11-03** against the [official trading objectives](https://ftmo.com/en/trading-objectives/). Two-step uses 10%/5% targets, 5% daily loss, static 10% maximum loss, and four opening days in each evaluation phase. One-step uses a 10% target, 3% daily loss, and a 10% end-of-day trailing floor based on the highest prior Prague-midnight **balance**, with equity checked against that floor. A new account after a reward resets the one-step floor; an ordinary withdrawal record alone does not. Current one-step consistency uses best day divided by net closed profit. Orders created, or accounts merged, from 12 October 2026 use the current version; older directly initiated orders use the separate positive-days legacy version. The date is source-stated only for that version boundary; no historical effective date was invented for the two-step or older rules.

Selected-news execution restrictions are ±2 minutes on affected instruments for applicable standard funded accounts; evaluations and Swing are exempt. See the [official news rules](https://ftmo.com/en/faq/can-i-trade-news/). The [overnight/weekend rules](https://ftmo.com/en/faq/can-i-hold-positions-overnight-or-over-the-weekend/) restrict market breaks longer than two hours, with those same exceptions. The registry retains these restrictions, but loss/target evaluation does **not** certify restricted-event or weekend compliance without actual restricted-event membership and broker instrument sessions. The generic high-impact-event plan tag is separate from firm-specific prohibited execution.

`targetAmount`, `targetProfit`, `targetProgress`, `targetDistance` and `targetBalance` are Metrics. Profit uses actual reported balance minus initial capital minus classified external cash flows since phase start. Progress is clamped to 0..1; distance floors at zero. A reported flat position inventory is required for target eligibility. Trading days count actual position-opening dates within the selected phase in the firm's timezone. Consistency includes observed partial close dates; an unmatched closing execution or incomplete history withholds it. A failed soft consistency threshold is not a loss-rule breach.

Static floors need no invented history. End-of-day trailing floors require actual reset balances or a complete cash ledger sufficient to reconstruct them; a later snapshot cannot substitute for midnight. Intraday balance trailing includes intervening complete-ledger peaks. Intraday equity trailing requires continuous covered equity observations, or an actual provider high-water value. Missing high-water coverage keeps the floor unavailable. Lock-at-initial settings apply only when explicitly configured.

Other firms (FundedNext, The5ers, Funding Pips, Alpha Capital, E8 Markets, generic futures firms and Other) have `verified:false` with empty rules. Explicit user rules compute with `userDefined:true` and retain `verified:false`. Observed breaches are positive evidence; `no-observed-breach` and quantitative objectives met never certify unseen history or firm acceptance. Public rule documentation is not authorization for credential access or evidence of a provider partnership.

## Plan checks and coaching

Strategy matching requires a valid owner-scoped manual assignment or an explicit account-specific magic/symbol/timeframe binding. Symbol alone, or the EA's globally reused default magic, cannot identify a saved strategy. Multiple matching bindings are ambiguous.

Plan checks are three-state facts. Initial stop existence requires a recorded entry state. Stop widening requires actual changes; a clean result requires complete monitoring. Early-close classification requires a planned target and a known non-SL/TP exit reason. Event evidence must have been known at entry. Low fit uses a saved score available at entry. Sizing compares original money risk with entry equity and the saved risk percentage. Missing evidence never produces a fabricated `followed_plan` or `no_stop` allegation.

Coaching defaults to, and enforces a floor of, 20 relevant measured trades. Comparisons exclude unknown facts and state their sample sizes. Live-versus-backtest rows require 20 strategy-matched net results; average R additionally requires 20 known-risk observations. Frequency and early-exit comparisons describe observations, not causation or personal advice.

## Validation and bounded work

`tests/accounts/engine.test.cjs` bundles the source independently and tests native-format fixtures, mapped decimal CSV, duplicate imports, cost allocation, partials/reversals, original-risk R, missing equity/FX, IANA DST, target cash flows, static/EOD/intraday trailing rules, phase days, current/legacy consistency, historical cutoffs, personal stops, strategy matching and sample minimums.

Fixture files are explicitly synthetic, checked-in **test-only** documents. For browser import use `tests/accounts/fixtures/mt4-statement.html`, format MT4 HTML, currency USD, timezone Europe/Prague, unknown account mode. It contains three closed trades with net results $99, −$53 and $24: total $70, win rate 2/3, actual reported balance/equity $10,070 at 2026-11-03T15:00:00Z. R, floating P&L and today P&L remain unavailable. `mt5-deals.html` contains a $92 round trip and a reported $10,092 balance with unknown equity. `trades.csv` supplies initial risk for two trades (1.98R, −1.06R), leaves the third unknown, and supplies no account balance.

Budgets: 5 MiB file, 100,000 rows/deals/trades, 200 columns, 100,000 characters per CSV cell, 500,000 HTML nodes, HTML nesting 256, 1,000 validation issues, 200,000 snapshots, 1,000 positions, 500 strategies, 1,000 bindings, 250,000 aggregate entry-evidence points and 20 years per rule phase. Each trade's event/stop evidence is capped at 10,000 points. Provider and request budgets apply before these pure calculations. Recompute belongs in a worker; the request path reads cached owner-scoped results.
