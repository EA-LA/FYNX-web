# Search discovery and public access release

The Finance World repository contained 116 HTML pages at the start of this change, not 200 separate public pages. This release contains 164 HTML pages, of which 137 are canonical public search entry points. The resource library lists 134 resources; the homepage, library and connection-help page account for the other three sitemap entries. Account screens, redirects, the generic learning template and duplicate resource wrappers are deliberately excluded.

## What changed

- `/explore.html` is a searchable, filterable directory with real initial-HTML links, query-preserving URLs, saved resources and useful empty states.
- The 45 existing lesson outlines now link to substantive articles under `/learn/lessons/{topic}/{slug}.html`. Each has topic-specific explanation, an illustrative example, a practice exercise, further reading and links through its learning path.
- The previously truncated Fibonacci page now has a complete calculator with both trend directions, result tables, validation and reset.
- Existing tool URLs are preserved. Calculators and research tools have usage notes, model assumptions, examples, related resources and navigation back to the library.
- The public sitemap and browser search index come from one inventory. Titles, descriptions, canonicals, social metadata and breadcrumb data identify individual pages. Duplicate wrappers point to their substantive canonical destination.
- The homepage has resource search and a grouped tools menu. The dashboard has search, quick access, saved resources and recent pages. Saves contain only canonical resource paths, stay in the current browser and do not include account or trade data.
- The lightweight directory at `/directory.html` needs no scripts, authentication or remote assets. Full lesson text is usable without JavaScript. Local calculations work without signing in.
- Font Awesome and the QR renderer are hosted locally with their licenses. Public pages no longer load the legacy authentication module solely to call its empty route guard. Theme preference failures do not stop public calculations.
- Connection help explains unavailable embedded providers and links to official economic calendars. None of these changes bypass a managed network's access policy or change its security settings.

## Sources and generation

Edit `content/lesson-details.cjs` for article explanations and examples. Titles and descriptions match `content/lesson-outlines.json` and the established learning template. Topic background sources are in `content/learning-sources.json`. Tool explanations live in `content/tool-guides.cjs`.

Run `npm run build`. The existing learning builder runs first, then `scripts/build-discovery.cjs` generates articles, enhances public pages, rebuilds the resource library and writes `sitemap.xml` and `assets/resource-index.json`. Generated HTML is also committed for direct static hosting and review. The existing website publishes from the repository’s main branch. `npm run vercel-build` additionally creates a static-only `dist` directory.

Use `node scripts/verify-search.cjs` for sitemap/metadata/learning-runtime checks and `node scripts/audit-structure.cjs` for local links, JavaScript syntax and duplicate IDs across tracked and new pages. The browser check is `scripts/test-discovery-browser.cjs`, with `PLAYWRIGHT_MODULE` pointing to an installed Playwright module and a local server configured through `FYNX_TEST_URL`. It blocks external requests and checks search, saves, calculator arithmetic, navigation and no-JavaScript content. `scripts/audit-routes.cjs` supports `FYNX_BLOCK_EXTERNAL=1` for a read-only route sweep at desktop and mobile widths.

## Search engines and managed networks

The public sitemap is `https://www.fynxfinanceworld.com/sitemap.xml`. Submission in a verified Google Search Console property and URL inspection are not claimed by this release. Google decides whether and when to crawl, index and rank each page. This change does not promise a ranking for broad terms such as “margin.” See [Google's JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

The apex and `www` domain resolved to both IPv4 and IPv6 addresses during the audit. HTTPS page and robots requests returned 200 through the available curl connection; the apex resolved to the canonical `www` address after redirects. One different HTTP client received 403, so these checks do not establish universal reachability or identify the user's school filter. No test was performed from the user's school network. Its exact error remains needed to distinguish category filtering, certificate inspection, DNS failure and a blocked service. An intentional organization block requires review by that organization's administrator.

Advertising remains in its existing disabled configuration. This release changes organic discovery, product navigation and sharing assets; it does not purchase ads or invent publisher approval.

## Verification

- 164 HTML pages checked for JavaScript syntax, duplicate IDs and missing local links: no errors. The remaining fragment observations are intentional API workspace hash routes, covered by its route tests.
- All 162 browser routes (excluding the two intentional app-launch redirects) passed at desktop and mobile widths with external services blocked: no page errors, missing local assets or horizontal page overflow.
- Ten browser workflows passed: search, category/URL state, saved persistence, empty states, dashboard shortcuts, lessons, homepage menu, margin arithmetic, repaired Fibonacci arithmetic/reset/validation, and legacy market-hours navigation. No-JavaScript reading and disabled-storage calculations also passed.
- Search checks passed for 137 canonical URLs, 134 linked resources, 45 lesson articles and 26 tool guides.
- Existing journal, authentication, password recovery, MFA, account UI, draft privacy, advertising and API-page checks passed. Fibonacci arithmetic has separate uptrend/downtrend, fractional-price and invalid-input checks.

These are local checks under simulated unavailable external services, not a test from a school network and not a claim that third-party live feeds are universally reachable.
