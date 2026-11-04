# FYNX Finance World — autopilot backlog

Maintained by the scheduled site-quality and autopilot tasks. Newest notes first within each section.

## How each run checks the site
- Serve the repo locally, open every HTML page with Playwright on iPhone SE (320px), iPhone 14 (390px), iPhone 15 Pro Max and desktop 1440x900.
- Check content cut off past the screen edge, form fields under 16px (iOS zoom), low-contrast text, JS errors, broken local links/images.
- Note: `/api/*` returns 404 locally because it runs on the server only. Live data feeds are checked on the live site.
- Known existing check failures (not caused by autopilot, owner decision needed): `npm test` → `test-adsense-verification.cjs` expects no `ads.txt` but the repo has one; `npm run test:proof` needs a sibling `fynxfunded` checkout.

## iPhone/mobile issues: found and fixed
- [x] 2026-11-04 (owner screenshot): header "More" topics menu opened off the left edge on iPhone. Now left-anchored and limited to the screen width (`assets/css/terminal-header.css`).
- [x] 2026-11-04 (owner screenshot): header "US edition" picker rendered as a white native iOS control. Appearance reset, dark background, drawn arrow.
- [x] 2026-11-04: closed homepage slide-out drawer was parked off-screen right (iOS sideways pan risk). Now hidden when closed, uses 100dvh plus a safe-area bottom.
- [x] 2026-11-04: bumped the shared release cache version (`scripts/build-release-assets.cjs`) and added styles.css, site-design.css and terminal-landing.css to it so phones pick up CSS fixes immediately.
- Check added: every run opens every <details> menu and every aria-expanded button on all pages at iPhone size and flags anything outside the screen.
- Known: the header edition picker is kept at 10px (iOS may zoom slightly when tapped); revisit with a larger header row.
- [x] 2026-11-04: Tapping any text box (search, calculators, journal, news search) zoomed the whole page on iPhone because field text was under 16px. Now 16px on touch phones, sitewide (`assets/site-design.css`, `assets/css/terminal-header.css`).
- [x] 2026-11-04: Symbol News: the quick symbol buttons (XAUUSD, EURUSD…) were squashed into unreadable slivers on iPhone. They now keep full width and scroll sideways.
- [x] 2026-11-04: Homepage FAQ: question text and the +/× icon touched and were clipped by the rounded card edges.
- [ ] tools/correlation.html: session clock cards run past the edge on the smallest iPhone (320px wide).
- [ ] Tap targets under 44px: audit header sub-nav links and calculator preset chips.

## Bugs found and fixed
- [x] 2026-11-04: Homepage "Your News →" button: dark text on dark green, unreadable. Now white.
- [x] 2026-11-04: Homepage footer copyright: nearly invisible (dark grey on black). Now legible.
- [x] 2026-11-04: Symbol News "Search" button: white text on a light button, invisible.
- [x] 2026-11-04: Header "US edition" picker turned into a light box on Calculator, Journal and other tool pages. It's now dark on every page like the homepage.
- [x] 2026-11-04: learn/risk-management, learn/trading-psychology, resources/quizzes, resources/market-analysis, resources/trading-glossary: links were pale grey and nearly invisible. They're now readable, and each page links to its full guide (the trading-psychology page previously pointed only to forex lessons).

## Page-by-page backlog
### Home (index.html)
- [ ] FAQ: only 3 questions; add accurate answers for common questions (data sources, is it free, iOS app, Pro).
- [ ] Hero buttons "Open Your Workspace" / "Explore Resources" have mismatched widths on iPhone.
### Tools
- [ ] tools/position-size.html: the card heading says "Calculator UI" with a developer-style description. Rename it in plain words.
- [ ] Verify every calculator's math against hand-worked examples (position size, pip, margin, risk/reward, break-even, compound, debt payoff, options, liquidation).
### Learn / Resources
- [ ] The short redirect-style pages (learn/risk-management, resources/*) are thin. Consider merging them into their full guides.
### News
- [ ] Check live news feeds load on the live site (not testable locally).

## Page coverage (last full audit)
- 2026-11-04: all 200 public HTML pages scanned automatically (overflow, field size, contrast, errors) on iPhone SE / iPhone 14 / desktop. Visually reviewed: index, calculator, tools/position-size, tools/symbol-news, tools/margin, journal, news, news/economics, learn, learn/risk-management, markets/patterns, pro.
