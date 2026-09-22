# FYNX website audit and release checklist

Audit date: September 22, 2026. Scope: the 114 local HTML routes, navigation and search metadata, responsive layout, shared theme, selected interactions, calculator logic, and priority external links.

This audit distinguishes verified repairs from remaining defects and checks that require a real account or device. A page loading successfully does not prove every account action or external provider will always work.

For the latest status of cloud learning, reminders, monitoring, analytics and holiday fixes, see [the service backlog update](docs/SERVICE-BACKLOG-STATUS.md).

## Completed in this release

- [x] First-time visitors start in the white/light theme. A visitor’s saved dark preference is respected on later visits.
- [x] Theme selection remains available on the landing page and Profile; other pages inherit the shared preference.
- [x] Removed the trailing markdown characters at the bottom of the website.
- [x] Removed competing landing-page menu handlers; menus use a consistent click, outside-click, and Escape interaction.
- [x] News and Calendar selections now have shareable URLs and restore after reload and browser Back/Forward.
- [x] Login and signup preserve safe, same-origin return destinations; external redirect targets and authentication loops are rejected.
- [x] Fixed nested-page sign-in paths. Home, News, Calendar, Calculators, and Learn allow public browsing; private account pages retain protection.
- [x] Added a useful custom 404 recovery page.
- [x] Replaced placeholder footer destinations with real pages and repaired broken privacy/terms links.
- [x] Fixed missing back-to-top anchors and added accessible names to unlabeled form controls found in the static scan.
- [x] Recent Topics links now lead to relevant resources. Save buttons persist selections locally and clearly identify the content as curated research prompts.
- [x] Connected the password-reset form to Firebase instead of its old placeholder alert. Tested success and error states with mocks; no reset emails were sent during this audit.
- [x] Symbol News now offers a usable Google News search fallback when its upstream feed fails.
- [x] Replaced the old animated landing cards with restrained motion, consistent line icons, useful links, and an interactive Research/Plan/Review preview. Includes pause and reduced-motion support.
- [x] Verified unique search metadata for 97 public pages. Account/private pages retain appropriate indexing restrictions.

## Confirmed issues and maintenance work

Priority meanings: P1 = important functional dependency; P2 = product quality/maintenance; P3 = further polish.

| Priority | Area | Finding | Work needed | Status |
| --- | --- | --- | --- | --- |
| P1 | Symbol News | Its third-party RSS conversion request returned HTTP 422. The fallback opens publisher search, but the inline symbol feed is not dependable. | Implement a server-side symbol/search news endpoint with caching, timeout handling, and accurate freshness status. | Open; fallback repaired |
| P1 | Two-factor authentication | Enrollment is explicitly disabled in `assets/js/mfa.js` pending Identity Platform configuration. | Complete Firebase/Identity Platform setup, validate enrollment and recovery using a test account, then enable enrollment. | Requires project configuration |
| P2 | X Finance timeline | Official X embeds can be rate-limited or blocked; a 429 response was observed during earlier checks. | Keep official timelines and working source links as requested; monitor availability. An authorized X API is an optional later improvement for a custom dependable feed. | Provider limitation |
| P2 | Market holidays | Published Asia and LSE dates and US exceptions have now been repaired; NYSE/LSE extend into 2028. | Continue annual/exception maintenance and extend other exchanges only against official notices. | Partly completed; see service update |
| P2 | Journal maintenance | `journal.html` and `trader-journal.html` duplicate the journal implementation. | Consolidate to one implementation while preserving existing URLs and account data behavior. | Open |
| P2 | Legacy calculator URLs | `options-payoff.html` contains debt-payoff functionality; `profit-loss.html` serves a stock-risk tool. Visible titles are clearer than the historical filenames. | Introduce accurate canonical URLs with backward-compatible redirects; update all links and sitemap together. | Open |
| P2 | Demo consistency | Demo Profile statistics differ from the demo Home/Journal fixtures. | Use one demo dataset across pages so examples agree. | Open |
| P2 | Performance maintenance | Large inline styles and overlapping legacy/shared styles remain. No Core Web Vitals regression is established by this audit. | Remove unused assets, measure LCP/INP/CLS on production, and reduce unnecessary provider work based on measured results. | Measurement and cleanup needed |
| P3 | Accessibility depth | Form names and selected keyboard controls were checked; this is not a full WCAG audit. | Test screen-reader order, contrast, zoom, focus visibility, embedded tools, and keyboard-only completion of each major workflow. | Further audit needed |

## Account and backend acceptance checklist — not verified, not necessarily broken

These require a designated test account and, in some cases, provider configuration. No real emails, account deletions, billing changes, or trading actions were executed for this scan.

- [ ] Test new account creation, email verification delivery, and returning to the requested page.
- [ ] Test email/password sign-in and Google/Apple sign-in on the production domain, including cancelled and rejected sign-in.
- [ ] Verify an actual password-reset email arrives and its link completes a reset.
- [ ] Test expired sessions, sign-out on multiple tabs, and session invalidation.
- [ ] Test profile edits and avatar uploads against production storage rules.
- [ ] Test journal create/edit/delete, filtering, analytics, refresh persistence, and cross-device sync with a test account.
- [ ] Verify preferences persist at the intended browser/account scope.
- [ ] Verify notification preferences and actual notification delivery, including permissions denied.
- [ ] Finish and test two-factor enrollment, verification, recovery, and removal after project activation.
- [ ] Test account deletion and recovery policy only with a disposable account.
- [ ] Test API key creation/revocation, authorization, quotas, and rate limits in an isolated test environment.
- [ ] Verify paid-plan/billing flows in sandbox mode without real charges.

## Production, data, device, and search checklist

- [ ] Run sustained news/quote/calendar checks through provider outages; verify stale data never claims to be live.
- [ ] Confirm market-data delay labels and exchange coverage match provider entitlements.
- [ ] Verify the calendar around DST changes, market closures, and the next year boundary.
- [ ] Test actual macOS Safari and iPhone Safari, including touch menus, keyboard appearance, landscape, and installed-web-app behavior. Desktop Chromium at mobile dimensions is not an iPhone hardware test.
- [ ] Test slow/offline networking, blocked third-party embeds, disabled storage, and private browsing.
- [ ] Confirm Search Console ownership, sitemap processing, indexing/canonical reports, and search snippets. Metadata fixes do not guarantee rankings or immediate indexing.
- [ ] Verify monitoring alerts, error reporting, backup ownership, and a documented restore procedure. Their operational readiness was not established by this code scan.
- [ ] Review older educational and curated market commentary for accuracy and freshness; distinguish evergreen guides from current news.

## Verification evidence

- Static local asset/link scan: 114 HTML routes; no missing local file targets. Client-rendered API/partner fragment routes were reviewed separately.
- Browser layout sweep: 114 routes at 390px and 1440px; report stored in `scripts/qa/2026-09-22-launch-audit.json`. Checks cover page loading, titles, uncaught page errors, horizontal overflow, and visible theme-control policy. Protected pages used demo mode.
- Search metadata/runtime checks: 97 public pages passed.
- Build, routing, shared-theme, mocked password-reset, journal logic, API-page checks, 16 calculator parity cases, and invalid-input calculator checks passed.
- Priority external destinations checked: FYNX ecosystem, app-store and legal links; broken naked `/privacy` and `/terms` paths were replaced with the working legal-site URLs.
- The broader historical `test:proof` chain requires a sibling funded-project TypeScript dependency absent from this workspace; the relevant calculator checks were run directly. No funded-project changes are included.

Use the open checkboxes as the next implementation and acceptance backlog; do not treat them all as confirmed defects.
