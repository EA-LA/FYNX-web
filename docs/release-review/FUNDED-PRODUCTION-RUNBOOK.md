# Funded production integration and rollback

Current state: the two progression safeguards are deployed; automatic progression is blocked. Approved numerical rules and public availability disclosures are published. An approved production broker adapter and phase-transition workflow are not yet complete.

## Before integration approval

- Identify the authorized broker account/server and reviewed, versioned instrument catalog.
- Validate the exact purchased policy binding, account/phase identity, net-cost mapping, complete source history, equity observations and reset boundaries.
- Reconcile real records and complete the seven-day parallel evidence gate. Do not approve an adapter based only on matching synthetic fixtures.
- Name the production reviewer, incident lead and rollback operator. Keep payments gated on the separate legal/billing release requirements.

## Human phase review

A versioned `eligible` evaluation is a candidate for review, not permission to provision a funded account or pay a trader. The reviewer checks the purchased terms, event coverage, source evidence, balance/equity reconciliation, minimum days, consistency, breach history and open positions. Preserve reviewer identity, time, source/evaluation references and rationale in the audit record.

A recorded breach must not be erased after profit recovery. Any disputed input needs a separately documented correction and review. Existing manual admin actions are not a fully implemented versioned phase transition. Build the transition as an idempotent, transactional workflow with an immutable old-phase audit and explicit new-phase starting balance, rule snapshot, start time and broker mapping. Do not reuse an old phase's source coverage or reset the old ledger.

## Pause and rollback

Keep automatic progression disabled if coverage is missing, a discrepancy is unresolved, a broker adapter changes, or the runtime fails. The deployed safety functions are `adminChallengeProgression` and `evaluateAutomaticProgressionOnTrade` in `fynx-c7a28`, `us-central1`; both run Node.js 22. Preserve current safe source hashes and deployment evidence.

Rollback must retain fail-closed history validation and persistent breaches. Do not restore the former permissive evaluator merely because it is the previous deployment. Deploy a reviewed forward fix or last verified safe version of these two functions only. Do not overwrite customer phase state as a rollback technique. Website rollback can use Vercel's previously verified deployment while preserving the payment hold, but must not restore false market/rule claims.

Production integration sign-off is pending the broker/data gates, implemented phase transitions and named operational responsibility. This runbook is preparation, not approval on behalf of the owner or legal reviewer.
