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
- [x] 2026-11-04: tools/correlation.html: clock cards were 326px wide on a 320px iPhone SE (min-width 290px). Now fit (284px).
- [x] 2026-11-04 (run 3): header topic links, "More" menu items and tool-page Back/Home/Calculate/Clear buttons now 44px on touch phones; "Politics & Policy" no longer overlaps "Industries" in the header grid (`terminal-header.css`, `site-design.css`).
- [x] 2026-11-05: "Save resource" and ATR Stop Buy/Sell/ATR-multiplier buttons now 44px on touch phones.
- [x] 2026-11-05 run 7: Back/Home links, Fibonacci theme toggle, discovery header links (Drawdown Simulator etc.) and ATR Stop text fields now 44px on touch phones.
- [x] 2026-11-05 run 8: tool-page breadcrumb links, `<summary>` disclosures, "Developer sign in", Position Size "Use manual price"/Save buttons now 44px on touch phones (verified Correlation, Position Size, Pip: zero targets under 44px).
- [x] 2026-11-05 run 9: market ticker items and ‹ › arrows, Explore search/filter buttons and card save buttons now 44px on touch phones.
- [x] 2026-11-05 run 10: header search field/button, bell icon button, Sign in, edition picker, Explore card title links and journal Quick Add now 44px on touch phones (verified journal/explore: header targets all >=44px).
- [x] 2026-11-05 run 11: News page jump links, search box, publisher/topic selects, Pro button, source links and homepage tabs, chips, search and footer links now 44px tall on touch phones.
- [x] 2026-11-05 run 12: homepage hero buttons, Your News/All reporting/All calculators links, theme button, and resource-page header + glossary A–Z links now 44px on touch phones.
- [x] 2026-11-05 run 13: Learn hub card links (Start learning, Quiz, Glossary, Open quizzes) now 44px on touch phones.
- [x] 2026-11-05 run 14: Trader Journal header links (API, Pro tools & plans, Sign in, Account settings) now 44px on touch phones.
- [ ] Tap targets still under 44px (remaining after run 12: inline text links in paragraphs, photo-credit links, ticker tab 'Markets' width; earlier list after run 11: a few inline text links in news paragraphs, homepage hero buttons at 42px, Refresh/world-clock buttons 36-40px wide, theme button 32px; originally): inline text links on news (Heat Map/Sentiment/Challenges, source links), news select/search (40px), Explore footer links, homepage chips/theme button (32px).

## Bugs found and fixed
- [x] 2026-11-04 (run 4): tools/position-size.html: floating-point rounding dropped a full 0.01 lot on exact answers (USD/JPY @150, $100 risk, 25 pips gave 0.59, exact is 0.60). Fixed with a tiny tolerance before rounding down. Hand-checked EUR/USD (0.40), USD/JPY (0.60), GBP/JPY with manual rate (0.59), XAU/USD (0.40 lots/40 oz).
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
- [x] 2026-11-04: tools/position-size.html: heading renamed "Position size calculator" with a plain description.
- [x] 2026-11-04 run 5: hand-verified math, all correct: position size, pip ($10/lot), margin ($3,666.67 / 120% level), risk/reward (3.00), break-even (1.10017 / 1.09983, $17 cost), compound ($49,308.12 after 10y).
- [x] 2026-11-05 run 6: debt payoff ($10k, 10%, $300: 40 months, interest $1,764.16, total $11,764.16) and liquidation guard (long, 100 entry, 10x, 0.5% maint: liq 90.5, 9.50%) match hand math. 
- [x] 2026-11-05 run 7: pivot (PP 105, R1 110, S1 100, R3 120, S3 90), options (long call 100 strike, 3 premium, 110: $700, BE 103), profit-loss (10k, 1%, 100→98: 50 shares) and ATR stop (100, ATR 2, 1.5x: 97) hand-checked, all correct.
### Learn / Resources
- [ ] The short redirect-style pages (learn/risk-management, resources/*) are thin. Consider merging them into their full guides.
### News
- [ ] Check live news feeds load on the live site (not testable locally).

## Page coverage (last full audit)
- 2026-11-05 run 14: main pages deploy green at 652e8e4. Chromium (WebKit unavailable) iPhone SE/15 Pro Max on all learn/*.html, topic, symbol-news, trader-journal, journal, pip, calculator: no overflow, no JS errors. Fixed trader-journal header targets. `npm test` passes. Next: header edition select (10px, iOS zoom), photo-credit links on homepage, inline links.
- 2026-11-05 run 13: main green at d77eb27 (pages deploy success). Chromium (WebKit unavailable) iPhone SE/15 Pro Max on learn, learn/risk-management, margin, risk-reward, breakeven, compound, trading-quizzes, risk-management: no overflow; fixed Learn hub targets. `npm test` passes. Next: learn/*-howto pages, ticker 'Markets' tab, header edition select (10px).
- 2026-11-05 run 12: main pages deploy green at e409b00. Chromium (WebKit unavailable) iPhone SE/14/15 Pro Max on index, calendar, trading-glossary: no overflow, no JS errors. Fixed hero/glossary targets; `npm test` passes after `npm ci`. Next: ticker tabs, photo-credit links, learn pages batch.
- 2026-11-05 run 11: main pages deploy green at a4321e2. Chromium (WebKit unavailable) iPhone SE/15 Pro Max + desktop on news, index: no overflow, no JS errors. Fixed news/home targets. `npm test` passes. Next: hero buttons, news inline links, world-clock buttons.
- 2026-11-05 run 10: main pages deploy green at f500bfe. Chromium (WebKit unavailable) iPhone SE/15 Pro Max + desktop on journal, explore, news: no overflow, no JS errors. Fixed shared header targets. `npm test` passes after `npm ci`. Next: news inline links/selects, homepage chips.
- 2026-11-05 run 9: main green (pages deploy success at 535ec27). Chromium (WebKit unavailable) iPhone SE/14/15 Pro Max + desktop on explore, journal, news: no overflow, no JS errors. Fixed ticker/explore targets. `npm test` result below in commit. Next: header search/Sign in, Explore card links, news links.
- 2026-11-05 run 8: main pages deploy green at a24dffa. Chromium (WebKit unavailable) iPhone SE/14/15 Pro Max + desktop on journal, explore, learn, news, correlation, position-size, pip: no overflow, no JS errors. Fixed tool-page small targets; the Correlation clock and Position Size heading backlog items re-checked and fine. `npm test` passes. Next: ticker items, carousel arrows, explore controls.
- 2026-11-05 run 7: main deploy green at 333455f. Chromium (WebKit unavailable) iPhone SE/14/15 Pro Max + desktop on options, atr-stop, profit-loss, pivot, breakeven, fibonacci, drawdown-simulator, compound: no overflow, no JS errors, inputs >=16px. Fixed 38-42px targets. `npm test` passes.
- 2026-11-05 run 6: main CI/pages deploy green at 5742d53. Chromium (WebKit unavailable) iPhone SE/14/15 Pro Max + desktop on debt-payoff, liquidation-guard, options, atr-stop, profit-loss, pivot: no overflow, no JS errors. Fixed remaining 33-38px buttons. `npm test` passes.
- 2026-11-04 run 5: main CI/pages deploy green at 8db97f8. Calculator math batch verified (no defects). No UI changes this run; iPhone tap-target backlog above still open.
- 2026-11-04 run 4: Chromium (WebKit unavailable) iPhone SE/14/15 Pro Max + desktop on 12 key pages: no overflow, no JS errors. Only sub-16px field is the header edition select (10px, still open). Position Size math verified; pip, margin, risk-reward, break-even, compound math still pending. Main CI/pages deploy green at fc6859e.
- 2026-11-04 run 3: Chromium (WebKit unavailable) iPhone SE/14/15 Pro Max + desktop on index, calculator, position-size, correlation, margin, pip, risk-reward, journal, news, learn, explore: no horizontal overflow, no JS errors, Correlation clocks fit. Main CI green at 831b40a. `npm test` passes after `npm ci` (adsense test now passes). Calculator math verification still pending.
- 2026-11-04: all 200 public HTML pages scanned automatically (overflow, field size, contrast, errors) on iPhone SE / iPhone 14 / desktop. Visually reviewed: index, calculator, tools/position-size, tools/symbol-news, tools/margin, journal, news, news/economics, learn, learn/risk-management, markets/patterns, pro.
