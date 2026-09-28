# Production account verification — 2026-09-28 UTC

## Verified with ordinary disposable users

- Production email signup, incorrect-credential feedback, offline feedback, mismatch validation, signout and subsequent sign-in.
- Journal invalid-entry recovery, double-submit deduplication, actual loss of -50 saved once, reload persistence.
- Profile display-name update and statistics: 1 trade, 0.0% wins. The same records appeared in a second isolated browser context after sign-in. This demonstrates server-backed session isolation, not a physical second-device test.
- Preferences save/reload and signed-in Security initialization.
- Desktop/mobile homepage and login had no horizontal overflow, duplicate owner navigation, uncaught JavaScript errors, or browser alert dialogs in the exercised flow.
- Real user-token Firestore own profile/trade writes/reads; cross-user reads/writes/deletes denied. Own account-document/trade deletion allowed; root-user deletion intentionally denied. Malformed nonnumeric trade P/L rejected.
- Actual Storage upload/read/delete in `fynx-c7a28.firebasestorage.app`, other-user reads/writes/deletes denied, invalid upload content type denied.
- Deployed index inventory: rooms memberIds/lastAt composite READY. Exercised website queries required no missing composite index.
- Public signup is open. The obsolete waitlist page says the workspace is open; retired waitlist writes are denied. No new public write permission was added.
- Temporary test accounts/data/files were removed. Historical customer records were not modified.

## Fixes discovered during testing

- Preferences initially rendered an enabled Save button and “Ready” before account data loaded. Initial HTML now shows Loading with Save disabled.
- Security password submit is disabled until authentication resolves and its handler is attached.
- Shared Firebase email callback was `https://fynxfunded.com/reset-password`, so even Finance World verification messages went to Funded's password-reset UI.
- Finance World now supplies explicit product continuation state for reset/verification emails and has a dedicated action handler. The existing Funded callback forwards Finance World requests to it; Funded resets retain their existing UI, while non-reset Funded actions use the Firebase-hosted handler.
- Firebase rejected a callback configuration update with `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`. No callback configuration change was applied. Routing was fixed in the existing callback instead.
- Action-code forwarding uses fixed owned destinations and an exact origin allowlist. The Finance handler removes the code from browser history, sets no-referrer, and loads no analytics.

## Rate policy

`exchangerate.host` is no longer used by the position-size tool. Frankfurter/ECB returned a valid daily EUR/USD reference, observation 2026-09-25. It is explicitly labeled daily reference, not a live broker quote. Manual broker-price and cross-pair conversion inputs remain available. No private API key was added to frontend code. Calculator parity/validation and Funded comparison regression suite passed (policy differences remain explicitly documented by those fixtures).

## Interactive completion still required

The approved QA address is `ha6876122+fynxqa@gmail.com`. Firebase delivered initial reset/verification messages; the user identified the wrong-product landing page. Corrected routing passed live checks for reset and verification error handling, and a real Firebase-generated disposable reset link opened the valid Finance World password form. User completion of password entry and verification remains pending. Google and Apple are enabled and both production domains are authorized, but successful provider round trips have not yet been confirmed. Configuration checks alone are not completion evidence.

## Reproduction

- `QA_BASE_URL=https://www.fynxfinanceworld.com PLAYWRIGHT_MODULE=<installed-playwright> node scripts/verify-account-flows.cjs`
- `node scripts/verify-production-rules.cjs` (requires existing Firebase CLI administrative login for cleanup/index inventory; authorization assertions use ordinary user tokens)
- `npm test`; `npm run build`; `npm run test:proof`
- Funded patch: commit `eb58029`, 28 tests, lint and build passed; Vercel reported successful deployment and the production route passed smoke checks.

Firebase references: [action handlers](https://firebase.google.com/docs/auth/custom-email-handler), [continuation state](https://firebase.google.com/docs/auth/web/passing-state-in-email-actions).
