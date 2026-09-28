> Current follow-up: [September 28 implementation and remaining work](REMAINING-LAUNCH-WORK.md). The September 22 results below are historical.

# Funded policy comparison and consistency review

Reviewed 2026-09-22 against local source. Completed review; policy adoption and historical proof remain pending. [Proposed specification](PROPOSED-RULES.md) supplies a concrete decision draft.

## Five reproduced differences

Synthetic tests run the actual Funded client and server source and the API engine. Passing the tests means the recorded behavior has not changed; it does **not** mean the policies agree.

| Topic | Existing Funded behavior | Proposed API baseline | Reproduced result |
| --- | --- | --- | --- |
| Maximum loss | Peak drawdown divided by initial balance; client uses supplied equity, server reconstructs realized balance | Static initial-balance floor | $2,000 gain then $1,200 decline: Funded fails; API stays active |
| Consistency | No 40% eligibility condition in either engine | Best-day share <=40% | $700 + four $25 days: Funded passes; API stays active |
| Intraday loss recovery | Daily net closed P&L can hide an earlier daily breach | Every submitted equity event checked; breach persists | −$501 then +$701 same day, later gains: Funded passes; API breaches |
| Daily reference | Percentage of initial balance | Percentage of boundary balance | $12,000 prior balance then −$550: Funded fails; API eligible |
| Day reset | Server UTC calendar day; client slices input date without normalization | Fixed 22:00 UTC beta baseline | 21:30 and 22:30 closes: Funded counts one day; API counts two |

Four other synthetic cases agree: target plus days, incomplete phase, daily loss beyond limit and exact daily boundary. Machine-readable results, including source hashes: [funded-policy-evidence.json](funded-policy-evidence.json).

## Additional consistency findings

1. **Public limits disagree with configured programs.** `src/pages/Rules.tsx` says daily 5% and maximum 10%, but configuration/server use 4%/8% for 1-phase and 5%/12% for 3-phase. Replace public wording with the approved program table after purchased terms are reconciled.
2. **Reset language is ambiguous.** Public rules say “5 PM EST”; UTC midnight in Funded and fixed 22:00 UTC in API are not the same rule. Do not equate a fixed UTC offset with year-round New York local time.
3. **Floating losses are not covered consistently.** Public rules include floating P&L; server only reconstructs realized balance, client daily loss only nets closes. Client maximum drawdown uses an independent equity timeline. Broker marks and boundary coverage are needed.
4. **Costs are undefined.** Client accepts a separate commission field but sums only `pnl`. Server chooses `pnl`, `profit`, `netProfit` or `realizedPnl` without a documented gross/net convention. Require an explicit adapter contract before relying on those totals.
5. **Input and history quality need stricter production gates.** Server converts nonfinite P&L to zero, falls back to update/open timestamps, and discards invalid dates if other trades remain. Client does not validate/deduplicate inputs or sort equity. This can produce plausible decisions from incomplete data; it is not verified broker ingestion.
6. **Automatic progression needs further safeguards.** Server automatic trade reevaluation permits empty history (`requireData=false`), recalculates status from scratch, and is not a sticky-breach event ledger. Deleting/correcting history can change a prior failure. `set_automatic` persists the mode before history evaluation succeeds. Do not migrate to autonomous funding decisions without resolving these behaviors and authorization semantics.
7. **Eligibility is not a payout.** Existing Funded status can pass without open-position evidence; the API requires flat exposure but only knows submitted events. Neither the synthetic tests nor an API `eligible` result authorizes funding or a payout.
8. **Instrument/currency pages are broader than proven support.** Only Forex is enabled in market categories; crypto weekend wording conflicts with that. Funded displays many currency choices; the API rule ledger is USD. Exact broker pairs and contract data remain unverified.
9. **Public behavioral restrictions are not automated.** News review, copying, consistency of IP/device, prohibited strategies, weekend exceptions and account style require separate approved policy and evidence. The numerical engine does not detect them.

## Automated coverage added

`npm run test:funded` executes 11 test groups: nine cross-engine scenarios, all six phase targets, all program daily/maximum boundaries, empty/invalid history, invalid configuration, timestamp ordering, atomic audit/evaluation writes, persistence failure, owner-only admin access and manual-mode trigger suppression.

`npm test --prefix backend` now includes 11 billing test groups alongside the existing 25 backend tests. These exercise actual billing module code with isolated adapters; no production credentials are used by unit tests.

No Funded rule implementation, existing account policy, customer decision or payment-hold source was modified. The proposed policy is reviewable, but choosing it for existing accounts requires the actual agreements and histories.
