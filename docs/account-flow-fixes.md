# Account and journal fixes — September 28, 2026

- Authentication uses inline, accessible messages for invalid credentials, offline/network failures, weak passwords, duplicate emails and popup failures. Buttons prevent repeat submissions; password visibility and return destinations are preserved.
- Signup/login share the same Firebase instance and persistence setup. Account creation and subsequent sign-in were checked against live Firebase using disposable accounts.
- Journal saves prevent duplicate submissions, preserve invalid entries, lock fields during writes and use a local calendar date. Chart-library failure no longer prevents journal initialization. Previous account listeners are removed on session changes.
- Profile initialization no longer depends on a notification query requiring an undeployed composite index. Notification checks use a single-field query, and notification failures cannot prevent account settings from loading.
- Account and preference forms wait for cloud data, recover from failed saves and prevent repeated submissions. Failed photo uploads no longer silently continue as successful saves.
- Removed duplicate owner controls from the public homepage. The existing sign-in link becomes a profile link for signed-in users.

## Verification

`npm run build`, `npm test`, inline-script syntax checks and browser checks on desktop (1440px) and mobile (390px).

The browser regression script is `scripts/verify-account-flows.cjs`. It requires Playwright and Chrome; set `PLAYWRIGHT_MODULE` when using an external Playwright installation. It creates a disposable Firebase QA account and tests wrong credentials, offline feedback, signup, journal validation, repeated save clicks, reload persistence, profile edits/statistics, preferences, password errors, notification initialization and sign-out/sign-in. Live tests should be run deliberately, not automatically on every build. Test account root documents require administrative cleanup because client rules prohibit root deletion.

Google/Apple account authorization and inbox delivery of password-reset email require separate end-to-end verification. Safari-specific behavior has not been tested. No claim of zero defects is made.
