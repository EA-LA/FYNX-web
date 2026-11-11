# Website project audit — 28 September 2026 UTC

Scope: `fynx-consumer-live` / EA-LA/FYNX-web. Repository-wide structural checks, desktop/mobile route smoke tests, backend tests and targeted review of account, journal, notification and session code. This is not a guarantee that every integration or every line is defect-free, nor an audit of the separate mobile and Funded applications.

## Fixed

- Shared navigation and greetings now use the authenticated user's live profile, with account-switch and sign-out cleanup. Removed a competing legacy avatar popover that displayed browser-local profile data and invented membership dates.
- Home journal statistics clear when the account changes or signs out.
- Notification titles, sources and IDs render as text; only HTTP(S) destinations can open. Journal replay and calendar escape saved content before inserting HTML.
- Notification read/listener failures display recoverable feedback. A bootstrap failure no longer destroys the dropdown structure or causes a later sign-out crash. Account changes clear old alerts.
- Drafts are scoped to the authenticated UID, initialized after authentication resolves, and cannot be saved under the previous owner after an account switch. Password and one-time-code fields are excluded even when passwords are visible.
- Authentication and session-notification monitoring use backend-supported operation identifiers.
- Password-reset tests now exercise the shared form implementation. Added account isolation, safe content, notification recovery and draft privacy regressions to `npm test`.
- Updated cache versions for changed account assets.

## Verification

- Initial inventory: 307 tracked files, 115 HTML pages and 227 JavaScript files/inline blocks checked. No missing relative resources, duplicate IDs or JavaScript syntax errors. New audit and test files were checked again before release.
- Read-only browser sweep: 113 routes at widths 1440 and 390. Native-app launch bridge pages are excluded. Checks cover uncaught page exceptions, missing local resources and horizontal overflow; they do not exercise every signed-in control.
- `npm test`, `npm run build`, API page tests, holiday coverage, monitoring, routing, session document IDs, theme policy, consumer/API billing UI regressions and search metadata checks passed. Search verification covers 97 public pages; shared design build covers 79 inventory pages.
- Backend: 113 tests passed, including payment signature/entitlement validation, calculations, data parsing and reminder validation. No purchase or outbound email was made.
- Calculator parity and validation proof checks passed. The full cross-repository proof command is currently blocked by the separate Funded checkout introducing `./funded-policy`, which its fixture loader does not support. Do not interpret those legacy comparisons as migration approval.
- Twelve public data endpoints were checked: eleven returned HTTP 200; commodities news returned HTTP 503. Snapshot details are in local `output/audit/live-services.json`.
- The preceding account-fix pass also verified disposable real Firebase email signup/signin, journal persistence and duplicate-save prevention, profile/preferences persistence and invalid-password handling. This audit adds mocked account-switch/failure coverage and a full signed-out route sweep.

## Outstanding work

1. **Legacy Storage access policy (priority):** `backend/rules/storage.rules` allows any authenticated user to read/write paths outside `/users`. This is a repository finding, not confirmation of the deployed rules. Inventory the mobile app's legacy upload paths, migrate legitimate access and replace the catch-all with explicit owner rules. Tightening blindly could break the shared mobile application.
2. **Commodities news availability:** the public `webMarketFeed?category=commodities` endpoint returned 503 during the audit. Other news categories worked. Review publisher coverage and upstream failures; the UI correctly shows temporary unavailability rather than invented stories.
3. **Generic notification delivery:** the notification engine records email/push attempted flags but has no actual delivery adapter for these channels. Wire and verify delivery before presenting those options as functional. This is separate from calendar reminders, which have a real Mailgun implementation and passing backend tests.
4. **Cross-repository proof fixture maintenance:** update the Funded comparison loader in coordination with that project's evolving policy modules and rerun the complete proof suite.
5. **Unverified integration flows:** Google/Apple authorization, Safari-specific behavior, native-app handoff, receipt of reset emails, MFA enrollment and real paid checkout were not exercised in this audit. Browser testing used Chrome. Payment validation was tested locally without charging a card.

## Repeatable checks

Run `npm test`, `npm run build`, `npm run test:api`, and `npm test` inside `backend`. Run `node scripts/audit-structure.cjs` for tracked-resource and syntax checks. Run `node scripts/audit-routes.cjs` with Playwright installed (or `PLAYWRIGHT_MODULE` pointing to its module); it starts its own local server and uses installed Chrome. Reports are written under `output/audit` and are not shipped with the website.
