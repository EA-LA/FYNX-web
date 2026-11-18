# Quant Analyst integration with the current site design

This local integration merges main revision `263d4b12c91804e9c31c3540c70a8d6c5b40328d` into the Quant feature at `8413b93`. It adds Quant Analyst to the current site without replacing the published landing, newsroom, reader, Your News, or shared terminal design.

## Isolation

The Codex managed-worktree tool rejected the nested repository because this chat's workspace root is its parent folder. Integration therefore used the separate local clone `fynx-quant-main-integration`, branch `codex/quant-current-design`. The active Accounts checkout and its branch references were not changed. The clone's origin is the local source repository; no push or deployment was performed.

## Merge decisions

- Retained main's complete `terminal-header.css`, including Your News styling, mobile input sizing, and the dark edition picker. Appended only the existing Quant badge rule.
- Retained main's complete `profile.html` and its current cache versions. Appended the Quant saved-strategy profile script.
- Used main's `directory.html` as the conflict baseline and regenerated the directory, resource index, calculator listing, Explore listing, and sitemap from the combined sources.
- Retained main's Your News header actions, duplicate-API-link removal, shared ticker behavior, and all existing header controls. The header-script difference from main is the additive Quant navigation insertion.
- Retained main's Your News build step, news-preferences foundation injection, and release-assets version `20261103-r1`. The final cache-version pass remains after every HTML generator.
- Quant remains between Research and Profile. Existing Profile links remain `/profile.html`; the later Accounts and Edge features are not part of this Quant integration.
- Main's landing, reader, newsroom, Your News, shared site CSS, and market-strip assets remain unchanged. The existing landing HTML differs only by the added Quant navigation link. Existing tool layouts remain intact while discovery gains the Quant entry.

## Local validation

- Dependency installation from the committed lockfile completed in the isolated clone.
- `npm run build` passed, including the existing Your News generator and final release-asset pass.
- `npm run test:quant`: 109 tests passed.
- Terminal UI, news intelligence, reader UI, reader links, newsroom data, Your News, and release-assets suites: 110 tests passed.
- `npm test` passed, including authentication, MFA, journal, account UI, session drafts, and advertising checks.
- `npm run test:discovery` passed: 167 searchable resources and 170 canonical public pages were verified.
- Static packaging passed. Sixteen existing shared design, landing, news, and release assets were compared byte-for-byte with current main; all matched, and main's complete header CSS remains intact.
- `git diff --check` passed and no unresolved index conflicts remain.

These are local build, automated DOM, data, and source checks. This integration does not claim new live provider acceptance, browser visual approval, native EA compilation, or production deployment.
