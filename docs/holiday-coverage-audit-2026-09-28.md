# Exchange holiday audit — September 28, 2026

- [x] Audit generated holiday coverage against each represented exchange, including one-off closures, early closes and dates beyond 2027.

Scope: the seven cash-equity exchanges represented by the page, 2025 through the latest verified published date. Forex and crypto liquidity annotations are not exchange closure schedules. This is a dated schedule audit, not a live market-status service or an exhaustive incident/individual-security halt archive.

| Exchange | Verified coverage retained | Beyond 2027 |
| --- | --- | --- |
| NYSE | 2025–2028 | Full published 2028 schedule; no generated 2029 closures |
| Nasdaq US | 2025–2026 | Later US schedules not verified; NYSE dates are not silently copied |
| TSX / TSXV | 2025–2026 | 2027–2029 not verified from the published source |
| LSE | August 31, 2026–December 31, 2028 | Full 2028 plus January 1, 2029 only; 2029 is explicitly partial |
| HKEX securities | 2026–2027 | 2028–2029 not verified; derivatives calendars are not substituted |
| TSE cash equities | 2026–2027 | 2028–2029 not verified; derivatives holiday trading is separate |

## Findings and corrections

The existing published date sets matched the reviewed schedules. Added the published LSE January 1, 2029 closure. Added per-year coverage labels for every exchange, so missing entries cannot imply a verified open session. Bounded the US generator to its verified 2025–2028 range. Removed the timezone conversion of all-day exchange dates, which could show the previous calendar day to users in other zones. Early-close notes continue to state exchange-local time.

Specific exceptions checked:

- January 9, 2025: NYSE and Nasdaq Carter mourning closure remains included, separately from recurring holiday formulas.
- July 3, 2026: US full closure, not an early close. December 24, 2027 is also a full US closure.
- January 1, 2028 falls on Saturday: NYSE has no substitute New Year closure. July 3, 2028 closes early. No invented December 22 early close is added to NYSE.
- LSE has December 22 and 29 half-days in 2028; its closing process begins at 12:30 London time. These do not follow US rules.
- HKEX 2026 includes both April 6 and April 7 closures, plus its three published half-days. The 2027 circular also specifies three half-days.
- TSE includes September 22, 2026 and the March 22, 2027 substitute holiday. Weekend dates are excluded from the event list, not represented as open sessions.
- TSX/TSXV Christmas Eve closes at 13:00 Toronto time. US-only settlement holidays and Alpha's different closing time are not applied to TSX/TSXV trading.

Reviewed official holiday sources and targeted exchange-notice searches. No additional market-wide holiday closure was verified in that review. This is not proof that every historical operational outage or future emergency is covered. HKEX severe weather no longer automatically implies a market closure. New emergency notices must still be checked; the existing notice monitor does not automatically approve new calendar dates.

## Sources

- [NYSE 2026–2028 holidays and early closes](https://www.nyse.com/trade/hours-calendars), [2025–2027 published schedule](https://www.nyse.com/markets/hours-calendars?ecid=psgonsgcgaen1n), and [January 9 mourning notice](https://www.nyse.com/publicdocs/nyse/markets/american-options/rule-interpretations/2025/National_Day_of_Mourning_20250102.pdf).
- [Nasdaq 2026 schedule](https://www.nasdaq.com/market-activity/stock-market-holiday-schedule), [2025 calendar](https://www.nasdaqtrader.com/content/technicalsupport/2025tradingcalendar.pdf), and [mourning announcement](https://ir.nasdaq.com/news-releases/news-release-details/nasdaq-announces-closure-its-us-markets-honor-national-day-0).
- [LSE business days](https://www.londonstockexchange.com/trade/trading-access/business-days), read in Chrome because the static response omitted its calendar table.
- [TMX trading calendar](https://www.tsx.com/en/trading/calendars-and-trading-hours/calendar), read in Chrome because the automated web fetch returned 403.
- HKEX circulars [CT/075/25 for 2026](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2025/ce_SEHK_CT_075_2025.pdf) and [CT/077/26 for 2027](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2026/ce_SEHK_CT_077_2026.pdf); [severe-weather arrangements](https://www.hkex.com.hk/Services/Trading-hours-and-Severe-Weather-Arrangements/Severe-Weather-Arrangements/Overview?sc_lang=en).
- [JPX market holidays](https://www.jpx.co.jp/english/corporate/about-jpx/calendar/) and [separate derivatives holiday trading](https://www.jpx.co.jp/english/derivatives/rules/holidaytrading/).

## Verification

`node scripts/test-holiday-coverage.cjs` compares all 213 exchange/date/status entries with the reviewed snapshot in `docs/qa/holiday-calendar-baseline-2026-09-28.json`. It also rejects duplicate, weekend and contradictory full/early closures, unsupported US years, and accidental expansion of partial LSE 2029 coverage. The test passed in the default timezone, Tokyo and Honolulu.

Chrome checks at 1440px and 390px in Tokyo and Honolulu passed for date labels, all three views, coverage warnings and partial 2029. No horizontal overflow or page errors were found. Static build passed. Re-audit this snapshot when an exchange publishes a new year or exceptional closure; passing regression checks alone do not certify newly published schedules.
