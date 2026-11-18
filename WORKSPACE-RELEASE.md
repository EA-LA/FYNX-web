# Workspace release — 2026-09-22

- Removed public waitlist routing and owner-only login restriction; existing account authentication and backend authorization remain.
- Standardized desktop/mobile navigation and typography; removed sidebar collapse control.
- Replaced hard-coded home performance and quote cards with journal-backed metrics and actual TradingView prices. Corrected local FX session hours and weekend handling.
- Added server-side news fetching with bounded publisher fallbacks and freshness validation. X uses its official timeline and direct profile links; X rate limiting was observed in QA.
- News and calendar modules show one full-width tool at a time, with named controls and a full-page link. Same-origin module documents expand to their content height.
- Learning now has topic cards linking directly to study, quiz and glossary pages.
- Journal date ranges filter actual records; discipline metrics and daily realized P/L replace unfinished placeholders.
- Calculator cards, mobile input targets and profile navigation use the shared design.

Validation: static build and inline JavaScript parsing; journal record tests; RSS freshness/deduplication tests; calculator parity/invalid-input checks; API page checks and pilot access/controller checks. Browser checks covered seven main pages at 1440px and 390px, all 24 calculator routes and four account settings pages at 390px. Calculator arithmetic/search, journal filtering/daily results, news tool switching, live headline retrieval and visible ticker prices were exercised. No authenticated write to a real user's account was performed. One unrelated funded-scenarios test could not run in the isolated checkout because it expects a sibling funded repository; no funded product files changed.

The public feed endpoint is deployed independently in Firebase. Website assets publish through the existing main-branch hosting pipeline. Existing API changes were retained using a three-way merge from the latest published branch.

## Theme, navigation and page audit — September 22 follow-up

- Theme controls are available only on the entrance page and Profile settings. Removed automatic insertion and the workspace header control; legacy control IDs are hidden before first paint so existing widget scripts remain compatible. All 113 HTML routes load the shared preference, including API pages. Profile/entrance choices persist across navigation and tabs; the separate Preferences selector cannot overwrite them.
- Restored the Tools menu trigger, wrapped desktop menu rows, measured nested menu offsets, and corrected mobile market links and dedicated learning-topic URLs. Added missing journal titles and corrected misleading calculator labels.
- Reused the shared Firebase instance on sign-up/app-return to prevent duplicate-app errors; corrected the missing-ticket login destination.
- Replaced static COT positioning with the official weekly CFTC Legacy Futures Only feed and contract search; replaced fictional sentiment scores with the dated Alternative.me Bitcoin index and seven observations; replaced sample FX conversions with dated ECB rates via Frankfurter. Historical chart controls now change the TradingView symbol/range. Providers have explicit unavailable states and source links.
- Browser route sweep: all 113 routes visited at 390px and 1440px (226 visits). No HTTP errors or horizontal document overflow. Initial duplicate-Firebase errors were repaired and retested. The App Store handoff intentionally leaves FYNX. Authenticated account mutations were not performed.
- Additional interaction checks: four landing menus, all nine learning-topic buttons, entrance/Profile theme switching, saved theme on API, historical BTC/one-year chart parameters, COT contract search, sentiment request failure and recovery. Real browser feed results: 371 CFTC contracts dated 2026-09-15; seven sentiment observations; ECB conversion dated 2026-09-22.
- Static verification: zero missing local link/script/style targets across 113 HTML files; all pages have titles; all 97 public sitemap routes have unique titles, descriptions and exact canonicals; 109 inline scripts compile. Shared-theme regression, build, API checks, journal tests, calculator parity and invalid-input checks pass.
- Provider limitations remain: X can rate-limit official timeline embeds; external market widgets may be delayed or unavailable. Daily/weekly observations are explicitly labeled and are not represented as intraday quotes. Search metadata does not guarantee indexing or ranking.

Publication status: frontend changes remain on the local release branch. Automatic approval review rejected the earlier direct production main-branch push; explicit approval to publish the complete reviewed release is still required.
