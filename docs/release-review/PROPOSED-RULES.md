# Proposed trading rules and specification — review draft

Version: proposal-2026-09-22. Status: **proposed; not approved account terms and not deployed as Funded decision policy**.

This proposal uses the existing program targets and the API's explicit event model. It is a specification for review, not confirmation of the rules sold to any existing customer. Existing purchased terms must be obtained before migration. Accounts retain their agreed rules; any approved change requires a new immutable rule version and an explicit account migration decision.

## Program parameters

Source: Funded `src/lib/challengeConfig.ts` and `functions/src/challengeProgression.ts`.

| Program | Profit target by phase | Daily loss | Maximum loss | Minimum trading days per phase |
| --- | --- | --- | --- | --- |
| 1-phase | 10% | 4% | 8% | 3 |
| 2-phase | 8%, then 5% | 5% | 10% | 5 |
| 3-phase | 6%, then 5%, then 4% | 5% | 12% | 5 |

Configured account sizes: 5,000; 10,000; 25,000; 50,000; 100,000; 200,000. Proposal limits the API phase ledger to USD, matching its implementation. Currency options displayed by Funded do not establish multicurrency API support. Profit split, fee refund eligibility and payout schedules require a separate approved program schedule; this engine does not calculate payouts.

## Proposed interpretation

- Starting balance `I` is fixed at phase creation. Realized profit is current balance minus `I`, using net realized P&L after commission, swap and other trading charges. The adapter must document whether broker P&L is already net to prevent double deduction.
- Equity is balance plus current unrealized P&L. Each submitted mark replaces the prior unrealized amount. Closed trades update balance once; a replay with the same identity and payload must not change balance again.
- Daily start `D` is balance at the trading-day boundary. Daily floor is `D × (1 − daily loss percentage / 100)`. Submitted equity below that floor breaches the daily rule. Example: $12,000 boundary balance at 5% gives an $11,400 floor.
- Maximum floor is **static**, `I × (1 − maximum loss percentage / 100)`. Example: $10,000 at 10% gives $9,000 throughout the phase. Trailing modes exist in the API but are not selected in this proposed Funded mapping.
- Equality is allowed; a value strictly below a loss floor breaches. This follows existing strict comparisons. If purchased terms require breach on touch, select that explicitly in a different approved rule version.
- A recorded breach is permanent within that phase, including after a later recovery. Corrections require reviewed source correction/replay, not deletion of an unfavorable trade.
- Proposed consistency threshold: best positive trading-day net profit divided by total net phase profit must be at most 40%. If total profit is nonpositive, consistency is not met. Exceeding the share delays eligibility; it is not itself a hard loss breach.
- A trading day counts when at least one accepted closed-trade event occurs in that reset period, including a zero-net close. Multiple closes count as one day. Profit target and minimum days are inclusive thresholds.
- Proposed beta reset: **22:00 UTC year-round**. This is not a promise of 17:00 New York local time throughout daylight saving changes. Owner must choose fixed UTC or a timezone-aware New York reset before adopting customer terms; the current API supports fixed integer UTC hours only.
- Eligibility requires the target, minimum days, consistency, no recorded breach and no open positions. API `eligible` is a review signal, not an automatic funded account, payout or phase advancement.

## Event coverage and account state

Each event requires an account-scoped source event ID, idempotency key, next sequence, timezone-qualified timestamp, supported event type, current open-position count and current unrealized P&L. Closed trades also carry net realized P&L. Events must be ordered; conflicting replays are rejected. No deposits, withdrawals, payouts or arbitrary balance adjustments are modeled by the beta event schema.

Open exposure across a reset requires an exact boundary snapshot for each intervening reset. The closing daily floor must be tested before the boundary resets. A flat account must have zero unrealized P&L. Missing marks can hide intraday breaches: submitted-event results do not prove continuous broker compliance. Real integration must provide complete marks and reconcile balance, equity, costs and open exposure with broker history.

The current phase ledger supports up to 366 trading days. Rule sets and accounts are capped at 100 each per environment. Phase advancement requires a new approved phase account and reconciled baseline; automatic phase reset/advancement is outside this proposal's implementation.

## Instrument specification

Launch calculation scope is Forex using caller-supplied contract metadata. EURUSD in examples is illustrative; no pair is asserted to be broker-approved. Funded currently marks only Forex available; its generic crypto/weekend text must be reconciled before launch.

For **every** allowed symbol, obtain and version this record from the broker:

| Field | Required evidence |
| --- | --- |
| Provider, server, account program, effective dates | Broker source and applicable account terms |
| Exact symbol including suffix; base/quote currency | Broker symbol catalog |
| Contract units per lot; price precision; tick size/value | Contract specification export |
| Pip convention; lot step/minimum/maximum | Provider specification; no inferred JPY convention |
| Account conversion rate source and timestamp | Conversion policy and reproducible observation |
| Leverage/margin tiers and instrument restrictions | Program-specific margin schedule; displayed 1:100 is not evidence for every symbol |
| Trading sessions, holidays, timezone and DST | Provider calendar |
| Commission, swaps/financing, other costs | Cost schedule and net/gross P&L mapping |
| Stop/freeze distances; overnight/weekend/news restrictions | Approved execution and trading rules |

Release only explicitly verified symbols in any broker-backed integration. The general calculation API can continue accepting explicit caller data with that limitation disclosed.

## Approval record to complete

Owner: [name]. Applicable account agreement versions: [references]. Approved reset/timezone: [choice]. Static/trailing decision: [choice]. Daily basis: [choice]. Consistency: [choice]. Equality rule: [choice]. Net-cost mapping: [reference]. Broker specification version: [reference]. Effective date/new-account scope: [date]. Historical reconciliation evidence: [report].
