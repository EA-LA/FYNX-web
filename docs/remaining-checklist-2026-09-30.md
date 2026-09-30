# Remaining checklist review — September 30, 2026 UTC

Reviewed the four areas in the user's September 29 screenshot. Existing completed work was preserved.

| Item | Result |
| --- | --- |
| News-provider outages | Fixed the remaining commodities gap. After deployment, the live endpoint returned 11 recent CNBC articles, `stale:false`, source publication 2026-09-29T18:56:40Z. World news was already working: 10 articles; no world-specific change made. |
| Two-factor authentication | Not activated. Live Firebase config is `FIREBASE_AUTH`, MFA `DISABLED`; frontend enrollment stays gated. Fixed friendly code/password/network errors, cancellation cleanup and the disabled enrollment gate. Challenge/retry tests pass. Awaiting approval of the shared project's Identity Platform pricing upgrade; activation also requires testing shared-client compatibility and actual enrollment/sign-in/removal. |
| Partner agreements / approved affiliate URLs | Not certified. Seven existing links resolved successfully; BabyPips returned automated-access 403, which is not evidence of a broken destination. No approved agreements or affiliate IDs were provided. Directory already disclaims a commercial relationship; destinations and existing disclosure left unchanged. |
| Future holidays / exchange coverage | Existing verified schedules retained; all 213 date/status regression checks passed. No new verified schedule justified extending coverage. Future unpublished dates remain explicitly unverified. Existing source monitoring is active but does not automatically certify dates. LSE's automated source was unavailable and still needs browser/source maintenance; this limitation is not marked complete. |

## News fix and tests

Added CNBC's dedicated energy RSS to the existing commodity sources. Broad market feeds can be available yet have no commodity articles. Aggregation preserves surviving providers and publisher timestamps; whole-word filtering avoids treating Goldman Sachs stories as gold news. Four backend tests pass, including unavailable search providers plus unrelated general-market news. Only `webMarketFeed` was deployed, with the repository's dependency lockfile. Other production functions and notification permissions were not changed.

## Holiday review evidence

The [Nasdaq official calendar](https://www.nasdaq.com/market-activity/stock-market-holiday-schedule) still publishes its 2026 US schedule. The existing beyond-2027 coverage limits in `docs/holiday-coverage-audit-2026-09-28.md` remain applicable; missing years were not generated or copied from another exchange.

The pending [TMX September 30 notice](https://www.tsx.com/en/trading/toronto-stock-exchange/trading-notices?id=1187), notice 2026-039, was read directly. It states that September 30 is a banking/non-clearing/non-settlement holiday only and that TSX, TSXV and the Alpha markets remain open for trading. It does not justify adding a trading closure. Calendar data was not changed.

## MFA prerequisite

[Firebase requires Identity Platform for TOTP](https://firebase.google.com/docs/auth/web/totp-mfa). [Published pricing](https://cloud.google.com/identity-platform/pricing) includes 50,000 no-cost monthly active email/social users, then usage charges. Approval was requested for that shared-project pricing change. No upgrade, factor enrollment, factor removal, or user-account credential change was performed in this review.

Root authentication/account tests, MFA-specific regressions, holiday regressions and static build passed. These checks do not substitute for live MFA enrollment/sign-in/removal after activation or signed partnership evidence.
