# Versioned Funded/API rule alignment

Status: **owner-approved for NEW accounts; implemented and tested. Existing purchased-agreement evidence remains pending. Not deployed or assigned to real accounts.**

Version: `fynx-funded-v1`. Owner requested rule approval/alignment on September 27, 2026; the owner explicitly selected “Adopt these rules for new accounts” for the precise interpretation below. This is owner policy approval for new accounts, not customer acceptance, existing-account migration approval or legal sign-off.

## Exact rule interpretation

| Decision | Versioned implementation |
|---|---|
| Maximum loss | Static floor from initial phase balance: 8% / 10% / 12% for 1/2/3-phase programs |
| Daily loss | 4% / 5% / 5% of balance at the reset boundary; evaluated against equity |
| Consistency | Best positive trading day / total net phase profit <=40%; otherwise not eligible |
| Breach recovery | Every supplied equity observation is checked; recorded breach remains after recovery |
| Reset | 22:00 UTC year-round, including DST changes |
| Equality | Touching the floor is allowed; strictly below breaches |
| Costs | Closed-event realized P&L is net of charges; remaining floating P&L supplied separately |
| Trading days | At least one accepted closed event in the reset period counts, even with zero net P&L |
| Eligibility | Target, minimum days, consistency, no recorded breach and zero open positions |
| Phase transitions | Human approval required; evaluation never funds or advances an account |

Program targets/minimum days remain 10%/3 days; 8% then 5%/5 days; and 6%, 5%, 4%/5 days. USD only; approved sizes 5K, 10K, 25K, 50K, 100K, 200K.

## Five differences resolved in the new version

All five named scenarios now produce identical complete results in the API module and generated Funded client/server modules. The old five-difference suite stays as historical/legacy compatibility coverage. It must not be relabeled as parity for legacy customer accounts.

There is one arithmetic implementation: `backend/developer-engine.cjs`. `backend/funded-policy.cjs` constructs the versioned Funded rule snapshot and validates the purchased-agreement binding. `scripts/proof/sync-funded-policy.cjs` generates Funded TypeScript modules from those sources; `--check` prevents drift. Decimal.js is pinned at 10.6.0 in both Funded packages.

The actual Funded server evaluator selects the new path only when `rulePolicyVersion` is explicitly stored, the associated policy matches the account/program/phase/currency, and reviewed agreement evidence is present. It reads phase-scoped `rule_events` and rejects absent/incomplete coverage. Evaluation, persistent breach and audit writes are transactional. Top-level challenge status is not advanced by this path. Automatic progression stays paused.

The Funded client exports `evaluateVersionedRules` using the same generated policy. Existing callers of the legacy evaluator are preserved until their account agreements are reviewed and explicitly migrated. This is deliberate compatibility, not a claim that all customer accounts now use the new policy.

## Purchased agreements: evidence gap

Inspected local purchase source:

- `functions/src/stripe/createCheckoutSession.ts`: order records have program/size/currency/style/payment identifiers but no accepted rule snapshot/version.
- `functions/src/stripe/webhook.ts`: derives challenge data from checkout metadata; no historical signed rule snapshot found.
- `src/services/types.ts`: existing Order/Challenge types contain no purchased rule snapshot.
- `src/pages/Terms.tsx`: a current general terms page is not proof of the version accepted on an earlier purchase date.

No accepted customer agreement files or authoritative purchase export were supplied. Live customer records were not verified. The previously documented deployment credential directory is absent here; do not infer that there were no purchases.

For each existing account, obtain the actual accepted document/order confirmation, acceptance timestamp, program/phase/size/currency and account/order reference. A reviewer must compare the five interpretations against that evidence. If they differ or are ambiguous, retain the original policy and resolve that account separately; do not assign v1 by default.

The binding requires an agreement reference, SHA-256 of the preserved agreement bytes, acceptance/review timestamps, reviewer identity, policy version and exact immutable rule snapshot. The code validates this binding's structure and consistency. It cannot prove that a person read/accepted a document or that an operator's `verified` assertion is truthful; the review and source evidence remain necessary.

## Reproduce and release

```sh
node scripts/proof/sync-funded-policy.cjs
npm run test:release
npm run build --prefix ../fynxfunded/functions
npm run build --prefix ../fynxfunded
```

CI applies the tracked Funded patch to its pinned baseline, generates identical modules, installs declared dependencies and runs regression/build checks. The API repository carries the change package; the local Funded tree also has the source changes. Funded production deployment and real-account policy assignment are separate pending steps. The pre-existing Funded checkout payment hold is untouched.

## Future checkout acceptance

The checkout UI and server remain on their existing payment hold. Before opening purchases, checkout must display the approved version, record affirmative customer acceptance and preserve the exact snapshot/hash on the order. The payment webhook must bind that server-recorded snapshot to the new challenge rather than guessing rules from metadata. This purchase capture is not yet implemented; the numerical evaluator therefore refuses versioned evaluation without the reviewed binding. No old acceptance or timestamp has been invented. The Funded rules page source now describes the approved new-account schedule and its existing-account scope explicitly.
