# Seven-day parallel test — item 8

**Prepared, not started and not complete.** Real-history inventory found zero broker accounts, trades and rule events. Item 7 is deferred until authorized real source data exists. No collection start or completion date has been fabricated.

## Start conditions

Connect the approved broker account adapter, verify phase/event/cost/equity/reset coverage and identify at least five complete accounts. Preserve independent broker results and compare the same events against the approved rule implementation. Keep production automatic progression disabled. Synthetic examples and records populated solely to satisfy a count are excluded.

## Collection procedure

1. Record the actual first collection timestamp server-side when the real parallel run begins. Preserve the raw evidence, source hash, adapter/rule versions, account references and reviewer references.
2. Capture a checkpoint at least daily; the proposed monitoring plan allows no gap longer than 24 hours. Preserve both systems' results and reconciliation reports, including failures. A minimum seven elapsed 24-hour periods is required; eight daily checkpoints span seven days.
3. Accumulate at least five complete reconciled accounts and 100 distinct accepted source events. Count account/event identity once across repeated cumulative checkpoints. `observed_at` is the actual collection/acceptance observation time, not a historical trade's execution timestamp.
4. Record every discrepancy and its resolution evidence. Do not discard failing checkpoints or rename events to inflate the sample. Final review requires zero unexplained differences.
5. Run the offline checker and manually verify its references against retained server/source records. Its output only qualifies the evidence for review; it never authorizes launch or automatic progression.

```sh
node backend/scripts/check-parallel-evidence.cjs /secure/path/live-runs.json
```

Input: `runs` array. Each run has `id`, server `captured_at`, `mode: "live_parallel"`, `synthetic: false`, `truncated: false`, `coverage_reviewed: true`, `source_reference`, `source_sha256`, `review_reference`, `unexplained_differences` array and `accounts`. Each account has `account_reference`, `complete: true`, `reconciled: true`, and `accepted_events` containing `source_event_id` and server `observed_at`. Timestamps are exact UTC ISO strings. References and review flags must reflect real reviewed evidence; the checker cannot authenticate self-reported values.

The checker rejects insufficient duration/accounts/events, duplicate identities within a checkpoint, missing review evidence, future timestamps, sparse checkpoints and unresolved differences. Cumulative replays do not increase event totals. Older source trade dates do not establish elapsed parallel-operation time.

Existing `developerFundedShadow` reports are not automatically qualifying: that monitor compares legacy state and explicitly marks coverage unverified. Convert nothing to a completed live run without independent source and observation evidence. This work adds an offline reviewer tool, not a newly deployed collector or a running seven-day campaign.

## Remaining

- Items 3, 5 and 7: authorized broker access, verified adapter and real coverage.
- Start actual paired collection and retain daily evidence for seven elapsed days.
- Achieve five complete accounts, 100 distinct accepted events and no unexplained differences.
- Final human sign-off of the source records and report.
