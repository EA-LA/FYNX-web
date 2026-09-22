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
