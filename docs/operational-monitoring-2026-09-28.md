# Website operational monitoring — verified September 28, 2026

- [x] Monitor failed feeds, auth errors, uploads and saves; preserve provider timestamps separately from browser checks.

Existing production monitoring is active. This update closes gaps in early startup reporting and long-running browser sessions; it does not create duplicate alert policies or change notification recipients.

## Coverage

| Area | Instrumentation / production alert |
| --- | --- |
| Authentication | Sign-in, signup, reset, SDK startup, persistence and session bootstrap. Enabled browser auth alert: more than 19 events per five-minute aggregation. |
| Uploads | Profile-photo Storage upload failures. Enabled upload alert on recorded browser failures. |
| Saves | Profile, preferences, security, notifications, journal and shared cloud saves. Enabled browser/server save alerts. |
| Feeds | News categories, COT, macro data and analytics browser failures; scheduled server probes every 15 minutes. Enabled browser feed alert above four events per five-minute aggregation and probe alert on failures. |
| Runtime | Unhandled browser errors/rejections with an enabled thresholded alert. |

All inspected website alert policies were enabled and attached to an existing notification channel. No test alert was deliberately sent to those recipients. `webFeedHealth` is ACTIVE; Cloud Scheduler execution logs show its `firebase-schedule-webFeedHealth-us-central1` job at 04:20 and 04:35 UTC on September 28. Cloud Logging contains corresponding per-provider outcomes.

The 04:35 probe recorded healthy macro rates, macro indicators, general news, forex, crypto, stocks, macro news, COT, correlation and liquidity. World and commodities news were reported unhealthy. These are real operational findings, not hidden or replaced with fabricated data. Monitoring completion does not mean every upstream provider is healthy.

## Fixes

- The synchronous theme initializer now provides a bounded early-event queue before the reporting script arrives. Only operation identifiers and error codes are retained; exception messages and form values are excluded.
- Browser rate limiting now resets each minute. Previously twelve events silenced monitoring for the rest of a long-lived page session. Repeated events remain throttled.
- Auth SDK load failures, persistence setup and session bootstrap failures now explicitly report through the auth category.

The backend receiver allowlists category/operation/code combinations, strips unknown codes, rejects query-bearing paths and discards extra payload fields. Browser reporting is production-host-only, omits credentials, never sends exception messages or account/form values, and does not expose reporting errors to the user. This is client telemetry, not a trusted security audit stream.

## Timestamp semantics

- News keeps each publisher's `pubDate` and the latest provider publication time. Server `fetchedAt` is retrieval time; browser “Checked” is labeled separately. A failed refresh cannot advance the publication date.
- Macro cards retain observation dates or observation years; retrieval remains separately labeled.
- Correlation uses the final aligned ECB observation date; liquidity uses Coinbase's book timestamp. Server retrieval is separate for both.
- COT retains its position report date and separately labels browser retrieval. Failure preserves the prior report/date and marks refresh failure; reports older than ten days are flagged.
- No browser refresh timestamp is substituted for source publication/observation time.

## Checks and operations

Browser privacy/throttling/early-queue/rate-reset regressions, backend event sanitization tests, auth regressions, root tests and static build passed. Recent production logs and policy configuration were read directly; no password, uploaded file, production account save or alert-recipient message was generated as a test.

In Cloud Logging, use `jsonPayload.monitor="fynx-web"` for failures and `jsonPayload.monitor="fynx-web-health"` for feed outcomes. Filter by category and operation to separate auth, uploads, saves and feeds. `origin` distinguishes browser reports, server failures and probes. For missing probes, inspect the named Cloud Scheduler job and `webFeedHealth` function execution logs. Existing holiday-source change checks require human review and do not automatically approve new dates.
