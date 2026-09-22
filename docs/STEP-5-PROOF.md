# Step 5 — prove FYNX API with FYNX

**Status: partially complete. Real historical replay, longitudinal comparison and external beta verification are still blocked on data/participants.** This is not a claim that synthetic tests establish broker compatibility.

## Completed engineering work

- Executed the actual HTML calculator scripts in an isolated DOM, with external network calls disabled and explicit fixture inputs. Compared all six supported Risk API calculations with the deployed HTTP API using a temporary test key. All 16 cases pass at the displayed precision. Evidence: `proof/calculator-before.json`, `proof/calculator-after.json`, `proof/live-calculator-parity.json`.
- Fixed position sizing's upward rounding: a $100 risk budget and 15-pip stop produced 0.67 displayed lots (risk $100.50). The tool now floors to 0.66, computes matching units, and identifies its 0.01 display increment. This is not an assertion about broker lot specifications. Decimal.js 10.6.0 is vendored with its original license header.
- Aligned validation for wrong-side risk/reward prices, nonpositive ATR stops and negative break-even costs. Clarified that break-even commission is the round-trip amount for the whole position; the API's per-lot input is normalized in the comparison.
- Ran nine synthetic Funded regressions against the actual legacy client and server source, with their database writes mocked. Three scenarios come from existing tests; six exercise policy boundaries. Four match after mapping passed/failed to eligible/breached. Five expose the policy differences below. Source fingerprints and results: `proof/funded-scenarios.json`.
- Deployed `developerFundedShadow`, scheduled every six hours. It reads current challenges/trades and writes only to `fynxDeveloperShadow`. It never changes challenges, statuses, payouts, purchased terms, customer API quotas or broker accounts. First invocation found five challenges, each with zero events, and classified all as `awaiting_history`.
- Added the first-party Risk/Reward pilot: an explicit button sends a test-environment request via authenticated Firebase callable access. The user sees both results compared at displayed precision. No private API key is included in browser code. The existing owner gate remains; a narrow `apiPilot: true` Firebase claim permits only `/tools/risk-reward.html`, not owner/admin/other private routes. No real customer has been granted this claim. A disposable QA account verified R:R 3.00 through the browser and actual callable backend; that account was removed after testing.
- Added a kill switch at `api/first-party-pilot.json`: set `riskRewardEnabled` false to stop new verification requests without disabling local calculations. Funded automatic decisions are not enabled by this pilot.
- Prepared external invitations, onboarding checks and a downloadable Node quickstart. The quickstart was tested internally against the deployed API, including an expected validation error. No external invitations have been sent and no external integrations have been verified.

## Five migration blockers

| Area | Current Funded implementation | Selected API policy |
| --- | --- | --- |
| Maximum loss | Drawdown from peak equity | Static initial-balance floor |
| Daily reference | Initial account size | Previous closing balance |
| Daily reset | UTC calendar date | Explicit 22:00 UTC reset |
| Consistency | Not enforced in legacy progression | 40% eligibility condition |
| Intraday breach | Netted daily P&L can erase a breach | Accepted hard breach persists |

These are explained differences, not silently changed purchased-account terms. Do not replace the Funded decision engine until real source data and applicable account terms have been reconciled. An API eligibility result is not automatic funding approval.

Two additional old test fixtures contain unlinked equity/balance values without sufficient realized/open-position events. They are explicitly excluded from claims of historical parity, with reasons in the scenario report.

## Data inventory and replay requirements

The connected Firestore project is `fynx-c7a28`. The read-only inventory found five `challenges`, zero `trades`, zero `rule_evaluations`, and no records in the checked broker-account/equity-history collections. The legacy local TradingDataProvider also returns empty data. A real provider export or the actual data location is required.

For each account/phase, obtain: applicable rule version, currency, initial balance and start time; ordered source IDs and timestamps; net realized P&L including fees; remaining unrealized P&L and open-position count; exact marks at each reset; and any cash flows/corrections. Missing marks are not inferred as zero. Non-USD accounts, unsupported cash flows, incomplete coverage and ambiguous rules remain blocked.

The shadow adapter currently consumes explicitly normalized event fields from matching `trades` records: sequence, event_type, timestamp, source_event_id, realized_pnl for closes, unrealized_pnl_after, and open_position_count. It does not guess these from a bare pnl/closeTime pair. It caps each run at 50 challenges and 1,000 events per challenge, reporting coverage limits rather than claiming a complete comparison. An automatic rule evaluation with matching event count and an evaluation timestamp covering the latest event is required before comparing stored legacy status. Even matching candidate results keep `eligibleForMigration: false` until reviewed.

## Completion gates

1. Replay representative real FYNX histories with complete source coverage, including profits, breaches, overnight exposure and phase boundaries. Resolve every material difference under each account's actual terms.
2. Observe at least seven consecutive days of parallel results with at least five complete accounts and 100 accepted events, and no unexplained status, balance, breach or trading-day differences. These are initial release gates, not performance claims or an SLA; increase coverage if the observed data is not representative.
3. Keep the first-party pilot opt-in. Expand one calculator/product at a time after its comparison passes. Preserve the kill switch and existing Funded decisions until the migration gate is met.
4. Invite three to five real external developers once the owner supplies the recipients. At least three must finish the docs-only integration checklist in `API-BETA.md`; fix and retest blockers. Record only participant aliases in `proof/beta-results.csv`.

Requested from the owner and still outstanding: the location/export of real broker histories, plus beta recipients. No credentials should be pasted into the conversation.

## Repeat and operate

```sh
npm run test:proof
npm test --prefix backend
node backend/scripts/proof-gateway.cjs --run-production
```

The source comparison reads the sibling `fynxfunded` checkout; override `FYNX_FUNDED_REPO` if it lives elsewhere. It uses that checkout's TypeScript installation. The production proof command requires administrator Application Default Credentials and creates/removes only its own temporary test user. It does not execute trades or take payment.

Shadow source: `backend/developer-shadow.cjs`; deployment export: `developerFundedShadow`. Copy the module into the existing deployment source and deploy only that function for shadow-only changes. Check `fynxDeveloperShadow/latest` in the admin console and `jsonPayload.kind="funded_shadow"` in Cloud Logging. To stop the comparison, pause its Cloud Scheduler job `firebase-schedule-developerFundedShadow-us-central1`. Do not delete customer histories to reset proof results.
