# Complete public tool coverage — 12 October 2026

The tool inventory now has 36 distinct public tool destinations: 27 free public utilities, one public guide to the free account-based Journal, and eight public guides to existing Pro products. There are 147 canonical public URLs across the site, up from 137, and 144 entries in the resource library. The repository contains 175 HTML files including private screens and compatibility routes.

## Newly public resources

- `/tools/journal-analytics.html` → Pro analytics
- `/tools/position-risk-planner.html` → Pro risk
- `/tools/scenario-comparison.html` → Pro scenarios
- `/tools/trading-process-review.html` → Pro review
- `/tools/journal-export.html` → Pro export
- `/tools/research-watchlists.html` → Pro watchlist
- `/tools/portfolio-stress-test.html` → Pro portfolio
- `/tools/drawdown-simulator.html` → Pro simulation
- `/tools/trading-journal.html` → existing free Journal workspace
- `/tools/basic-calculator.html` → standalone version of the dashboard arithmetic calculator

Each Pro page contains its own explanation, input requirements, worked example, output reference, model limitations, access requirement and related resources. Its launch link selects the correct existing tool using an allowlisted `tool` parameter. Sign-in preserves that selection. The public explanations do not expose account records or bypass membership enforcement.

The debt calculator now lives at `/tools/debt-payoff.html`. Its old `/tools/options-payoff.html` address redirects to the working calculator and identifies the new canonical. Existing saved debt shortcuts are normalized to the new address. The duplicate stock-risk address `/tools/profit-loss.html` remains compatible and canonicalizes to `/tools/stock.html`.

## Maintaining coverage

`assets/js/pro-catalog.js` is the shared catalog for the public builder and Pro workspace. It contains all eight existing backend product keys. Editorial explanations live in `content/product-guides.cjs`. `scripts/build-product-pages.cjs` renders the new public pages before the discovery inventory is assembled.

The calculator directory and Pro hub now contain real initial-HTML links. The calculator search list is generated from the same canonical inventory, preventing the older hardcoded directory from leaving tools out. Tool access requirements are shown in the directory and resource library. Symbol News also has a specific search title and description.

Basic arithmetic is shared between the standalone page and dashboard. The percentage key means divide the preceding value by 100; it no longer invokes JavaScript remainder syntax. The parser supports arithmetic precedence, parentheses, signs and decimal values without evaluating JavaScript. Division by zero and unsupported expressions produce explanatory errors.

Run `npm run build`, `npm run test:tools`, and `npm run test:discovery`. The coverage test verifies every HTML tool has either a canonical inventory entry or a compatible canonical destination, every Pro backend product has a page with the correct tier and launch link, and private account screens remain outside the public index. Browser coverage is in `scripts/test-tool-pages-browser.cjs`; configure `PLAYWRIGHT_MODULE` and `FYNX_TEST_URL` as for the existing discovery tests. Build output remains compatible with direct GitHub Pages hosting and the existing Vercel static packaging.

## Search scope

All current public tools are covered. Personal dashboards, account settings, authentication/recovery screens and individual account data are not public search pages. Duplicate addresses are consolidated instead of counted as extra tools. Search Console submission and Google indexing or rankings are not claimed.

Canonical URLs and crawlable internal links follow [Google’s canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) and [link guidance](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).

## Verification

The full browser route sweep completed 173 routes with no reported issues. Browser workflows passed for all eight Pro launch links, preserved sign-in destinations, the standalone and embedded arithmetic calculator, the renamed debt calculator and saved-shortcut migration. The directory and public explanations were also checked without JavaScript. Discovery regression checks passed on desktop and mobile, with external requests blocked and with browser storage unavailable.

The tool coverage and metadata checks, arithmetic tests, Pro routing and entitlement tests, existing account/Journal/advertising tests, and 21 consumer backend tests passed. No live paid account, checkout or transaction was exercised.
