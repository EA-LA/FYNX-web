# Website services: completed work and remaining decisions

Reviewed September 22, 2026. This is the updated status of the nine requested service items; it supersedes older checklist statements that described cloud learning and background reminders as missing.

| Requested item | Status | What works / what remains |
| --- | --- | --- |
| Two-factor authentication | Pending by owner choice | Existing authenticator UI and challenge handling remain intact. Identity Platform upgrade and enrollment stay disabled as requested in this session. Activation and a full cross-client MFA test remain. |
| Cloud learning progress | Already implemented; preserved | Authenticated lesson review flags, last quiz and up to 20 attempts are stored through `webLearning`. Topic pages and assessments load the shared cloud client. Previous production isolation/save/read checks are documented in `backend/README.md`; backend validation tests pass again. These are self-reported learning records, not certified scores. |
| Alerts while page is closed | Background email already implemented; preserved | `webReminders` and `webReminderDelivery` provide opt-in reminders to the verified account email. Scheduler confirmed ENABLED at one-minute intervals. Browser-local alerts remain separate. Web Push is not implemented; it is an additional delivery channel, not required for the existing background email reminder. |
| Outbound email delivery | Still needs an inbox test | Read Mailgun events for `fynx-web-reminder`: no recent matching events returned. No message was sent without a specified test recipient. Provider acceptance is now labeled separately from inbox delivery. Supply a recipient for one real test, then verify arrival and bounce behavior. |
| Exchange holiday coverage | Major gaps repaired; ongoing maintenance remains | Corrected US early/full closure conflicts, the Saturday-New-Year exception, missing pre-Independence early closes and the 2025 mourning closure. Published HKEX 2026–2027 and TSE 2026–2027 replace vague Asia windows. Published LSE dates cover August 31, 2026 through 2028. NYSE coverage extends through 2028. Coverage limits and official source links are visible. Nasdaq after 2026, Asia after 2027 and future one-off closures still require new official notices. |
| Real analytics ingestion | Implemented within explicit coverage | FX matrix computes Pearson correlations of 30/60/90 aligned daily returns from ECB rates via Frankfurter. Liquidity displays Coinbase BTC/USD or ETH/USD best bid/ask, spread and displayed size, refreshing every 15 seconds while visible. Weekly official CFTC COT remains unchanged apart from failure reporting. None of these is represented as universal real-time market coverage. |
| PRO meaning | Misleading public wording removed | Removed the residual “PRO” calculator heading. No consumer paid plan or entitlement gate was invented. A future paid plan needs a product/pricing decision and enforcement; existing developer API billing is separate and unchanged. |
| Partners and affiliate destinations | Technical check completed; agreements unverified | Six of eight destination URLs returned HTTP 200. XM and BabyPips returned 403 to automated checks; this does not prove they are broken. Existing destination URLs were preserved. Badges now say “Listed platform,” and the page does not assert a verified partnership. Owner confirmation of contracts, authorized affiliate URLs, geographic availability and commission terms remains necessary. |
| Operational monitoring and timestamps | Connected and deployed | Browser failures for auth, uploads, saves and feeds reach the existing operational endpoint with allowlisted codes only. No form values, identities, query strings or exception messages are sent. Local previews do not submit events. Existing enabled Cloud Monitoring policies are preserved. The scheduled probe now checks the real FYNX news endpoint, BIS/World Bank, COT and the new analytics endpoints. Source observation/publication, server retrieval and browser check times remain distinct; stale responses are labeled. |

## Remaining owner inputs / acceptance work

- [ ] Keep MFA pending until the owner separately requests Identity Platform activation; then test every shared sign-in client and recovery process.
- [ ] Provide the destination for one real reminder-delivery test and confirm inbox receipt. Delivery/bounce webhook integration is a possible later improvement; current provider acceptance is not an inbox guarantee.
- [ ] Confirm commercial agreements and approved affiliate URLs. Recheck the two automated 403 destinations manually in the intended visitor regions.
- [ ] Decide whether to offer a consumer paid plan. If yes, define prices, features, cancellation/refund behavior and server-side entitlements before restoring paid badges.
- [ ] If browser push is required in addition to email, define opt-in UX, supported browsers and notification preferences; implement service-worker delivery separately.
- [ ] Maintain official holiday notices. Add Nasdaq 2027–2028, HKEX/TSE 2028 when verified; obtain older LSE dates if historical completeness is needed. No calendar can anticipate future emergency closures.
- [ ] Improve category-specific news-provider coverage: the browser check showed three unavailable categories while eight other dated stories loaded. Monitoring and partial-feed status expose the failure; no fabricated fallback headlines are inserted.
- [ ] Expand analytics only when additional asset coverage is required and a suitable provider/license is available. Current FX data is daily reference data; Coinbase is one venue and level-one depth.

## Evidence and limits

- 31 backend tests pass, including numeric correlation cases, malformed/stale/auction order-book rejection, sanitization, learning caller validation and reminder consent/date validation.
- Browser checks of correlation, liquidity, calendar and directory pass at 390px and 1440px; dark-mode mobile checks include the news page. Live providers return dated observations.
- Calendar regression checks cover 2025-01-09, 2027 Christmas overlap, 2028 New Year and July 3, 2026 Japan September 22, HKEX event counts, and UK substitutes/early closes.
- Mocked password-reset, theme, routing, journal and search checks remain passing. No real account action or outbound test email was triggered by these checks.
- Monitoring policies for website auth, runtime, feed, upload and save failures were found enabled with existing notification channels. The reminder and feed scheduler jobs were read directly and found enabled.
- Read-only Mailgun event lookup returned no recent tagged reminder events. This does not establish successful or failed inbox delivery.
- Link-check output is in `docs/qa/platform-link-checks-2026-09-22.json`.

## Official sources used

- [NYSE holidays and early closes](https://www.nyse.com/trade/hours-calendars)
- [Nasdaq holiday schedule](https://www.nasdaq.com/market-activity/stock-market-holiday-schedule)
- [Nasdaq January 9, 2025 mourning closure](https://ir.nasdaq.com/news-releases/news-release-details/nasdaq-announces-closure-its-us-markets-honor-national-day-0)
- [LSE business days](https://www.londonstockexchange.com/equities-trading/business-days), browser-rendered table reviewed September 22, 2026
- [HKEX 2026 securities calendar, CT/075/25](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2025/ce_SEHK_CT_075_2025.pdf)
- [HKEX 2027 securities calendar, CT/077/26](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2026/ce_SEHK_CT_077_2026.pdf)
- [JPX market holidays](https://www.jpx.co.jp/english/corporate/about-jpx/calendar/)
- [Frankfurter API and ECB provider filtering](https://frankfurter.dev/)
- [Coinbase Exchange book semantics](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-book)
