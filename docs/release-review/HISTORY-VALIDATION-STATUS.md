# Funded history validation — item 5

**Source safeguards strengthened and tested; verified broker adapter and real-history coverage remain pending.** No real broker feed was connected. Item 3 still requires account access and applicable broker specifications.

The shared versioned evaluator now requires:

- A coverage record identifying the broker account, exact purchased phase, source reference/hash, adapter version and reviewer/time.
- Explicit complete-pagination and complete-equity attestations, exact start/end timestamps, event count and contiguous normalized source watermarks.
- Every event bound to that broker account and phase. Duplicate identities, source-sequence gaps and mixed history fail closed.
- Closed-event P&L explicitly mapped as `net_after_all_costs`. Existing legacy signed-gross-cost parsing remains separate. Never label gross broker P&L as net without accounting for all applicable charges.
- Independent `broker_balance` and `broker_equity` decimal strings at every event, reconciled exactly with computed balance and floating equity. Decimal formatting differences are accepted; numeric discrepancies are not.
- Existing engine rules requiring exact reset-boundary snapshots for carried exposure. A boundary loss is checked before reset and remains recorded after recovery.

The actual Funded entry point also checks the coverage account against the challenge's connected broker account. New purchases still have `coverage: null`; no acceptance or payment creates a completeness attestation. Closed-trade-only/manual results still require human review. No phase progression or payouts are authorized.

## Adapter contract

The existing `rulePolicy.coverage` must contain `complete`, `pagination_complete`, `equity_complete`, `source_reference`, `source_sha256`, `adapter_version`, `reviewed_by`, `reviewed_at`, `account_id`, `phase_reference`, `from`, `through`, `event_count`, `source_sequence_start`, and `source_sequence_end`. `phase_reference` is the accepted agreement reference followed by `:phase:` and the phase number.

Each event retains the engine fields and adds `account_id`, `phase_reference`, `source_sequence`, `broker_balance`, `broker_equity`, and, for closed trades, `pnl_basis: "net_after_all_costs"`. Source sequence is a contiguous sequence in the adapter's preserved phase stream, not an assumption that unrelated broker transaction IDs are consecutive. The source digest identifies retained raw evidence; this evaluator does not independently retrieve or authenticate those bytes.

A reviewer must substantiate completeness against an authoritative export/feed. Boolean flags, hashes and matching sampled values do not establish continuous equity coverage by themselves. The checks catch inconsistent supplied evidence, not unseen market observations. Do not generate missing marks, estimate reset snapshots or set review flags merely to pass validation.

## Remaining evidence

Connect an authorized broker adapter, preserve all export pages/checkpoints, map broker costs and account/phase scope, and collect actual equity observations and exact reset snapshots. Reconcile the complete phase against broker balances/equity and inspect gaps before approving coverage. Isolated tests are not broker certification or item 7's real-history reconciliation.

## Verification and delivery

28 Funded tests and 73 backend tests passed, including new rejection cases for source gaps, mixed scopes, absent cost mapping and balance/equity discrepancies, plus overnight missing/wrong boundary marks and breach recovery. Calculator/pilot/API page proofs passed. Funded functions compile passed. CI generates the same client/server policy modules and applies `funded-history-coverage.patch` after the earlier Funded patches.

Deployment is pending; production accounts and histories have not been modified.
