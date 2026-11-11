# Edge Radar integration with the current site design

This local integration merges the validated Quant integration `0e2e4578949d9acb7bf50dec20433327f1ecbc09` into the original Edge branch at `99f1cc47f1828d301a63d3c3e7c837f07a4385d2`. It therefore includes main revision `263d4b12c91804e9c31c3540c70a8d6c5b40328d` and preserves its existing design while adding Edge Radar.

Integration used the same separate local clone described in `quant-current-design-integration.md`, on branch `codex/edge-current-design`. The active Accounts checkout and its branch references were untouched. No push, deployment, live account connection, or email send was performed.

## Merge decisions

- Resolved `directory.html` and `explore.html` from the validated Quant integration, then regenerated both from the combined source. Current Your News entries remain present alongside Quant and Edge.
- Retained the validated Profile page, its current main cache versions, and the Quant profile hook. Appended the existing Edge profile hook.
- Preserved main's complete header CSS, including Your News, touch-device input sizing, and edition-picker fixes. The only addition to that stylesheet remains the shared Quant/Edge badge rule.
- Kept current main's Your News header actions, API-link deduplication, shared ticker behavior, and news-preference integration. Edge adds its navigation link and page-scoped mobile centering/wordmark treatment; existing accessibility labels remain supported.
- Preserved main's Your News generator and final release-assets pass. Quant builds before Edge; discovery/search and terminal presentation run afterward. Generated assets retain release version `20261103-r1`.
- Existing Profile links remain `/profile.html`. Accounts routes, source, and API integration are absent from this branch.
- Sixteen shared design, landing, news, and release files match current main byte-for-byte. Main's full original header CSS remains intact.

## Local validation

- `npm run build` and static packaging passed, including the Edge overview and 17 market pages.
- `npm run test:edge`: 73 passed.
- `npm run test:quant`: 113 passed, including Edge deep links and mean-reversion optimizer rejection.
- Current-main terminal UI, news intelligence, reader UI, reader links, newsroom data, Your News, and release-assets suites: 110 passed.
- `npm run typecheck:edge` and `npm run lint:edge` passed.
- `npm test` passed.
- `npm run test:discovery` passed: 185 searchable resources and 188 canonical public pages.
- `git diff --check` passed; no unresolved index conflicts remain.

These are local build, source, automated DOM, calculation, and security checks. No new browser visual approval, live provider acceptance, native MQL compilation, or production deployment is claimed.
