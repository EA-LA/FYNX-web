# FYNX website checklist — September 22, 2026

This replaces the earlier checklist. Completed means implemented with the evidence below; pending acceptance tests are not automatically defects.

## Completed

- [x] Cloud learning progress and assessment history service implemented and previously tested for save/read and account isolation.
- [x] Server-side email reminder pipeline works when the page is closed. Browser push is a separate optional feature.
- [x] Actual outbound email delivered: the owner confirmed receipt of “Reminder: FYNX email delivery test.”
- [x] Correlation, COT and crypto liquidity use real provider data with observation timestamps and availability states.
- [x] Misleading PRO badges removed. No consumer subscription is represented as active.
- [x] Operational failure reporting and scheduled feed checks installed.
- [x] Website Firestore rules repaired and deployed with explicit owner approval. Own Journal save/reload and profile save succeeded; other-user reads/writes and anonymous reads were denied in production.
- [x] Website profile image rules deployed: owner only, supported images under 5 MB. Production owner upload and deletion succeeded; another user’s upload was denied.
- [x] Active Firebase Storage bucket confirmed as `fynx-c7a28.firebasestorage.app`; legacy web configuration corrected.
- [x] Position-size calculator’s unauthenticated exchangerate.host request replaced with daily Frankfurter/ECB reference rates. Manual prices remain available; daily observations are labelled accordingly.
- [x] News request concurrency reduced and overly restrictive queries repaired. All seven categories returned HTTP 200 with articles in the post-deploy check.
- [x] Daily official holiday-source change detection installed in the existing scheduled monitor. Changes remain flagged for review, including after a temporary source failure. Source failures also trigger operational reporting.
- [x] Public waitlist gating already removed; the earlier private-beta access statement is obsolete.

## Remaining from the supplied checklist

- [ ] **MFA:** Identity Platform upgrade and enrollment/recovery tests remain pending at the owner’s request.
- [ ] **Holiday coverage:** future unpublished dates, emergency closures, early-close changes and additional exchange years require official publication and review. Existing coverage is explicitly partial. Six official sources were readable; LSE required browser/manual review. Monitoring detects changes; it does not certify dates or automatically publish closures.
- [ ] **Partner agreements:** owner must confirm contracts and approved affiliate destinations. HTTP reachability does not establish an agreement.
- [ ] **Production sign-in acceptance:** complete Google/Apple interactive sign-in, verification-link and password-reset-link tests on the production domain. Disposable email/password authentication worked through Firebase’s production API; that does not establish every browser provider flow.
- [ ] **Journal end-to-end acceptance:** signed-in browser save → reload → Profile statistics → second physical device. Production Journal storage and isolation passed; the complete UI/device chain is still unverified. Historical synthetic entries still require owner review.
- [ ] **Shared legacy Storage security:** existing mobile `chat_media` and `user_avatars` rules still allow broad authenticated access. Only the website `users/{uid}/profile` namespace was tightened in this approved release. Mobile-compatible owner/membership rules require a separate review before changing those shared paths.
- [ ] **Required-index acceptance:** no index failure appeared in the route scan, but all authenticated Journal query/filter combinations were not exercised against production.
- [ ] **Provider availability:** news, TradingView and official X embeds still depend on third parties. Latest news probes passed; sustained uptime cannot be guaranteed. Continue monitoring failures and freshness.
- [ ] **Optional only:** browser push notifications and a consumer paid plan are not implemented. Email reminders already work; neither feature is necessary to claim the current free website works.

## Evidence and limits

- 114 local HTML pages: no missing local link targets.
- Desktop 1440px and mobile 390px browser sweep: no horizontal overflow or uncaught page exceptions. Signed-out Profile redirects to login as expected. Native iPhone/Safari and every signed-in workflow were not covered.
- 34 Firebase test-only rule cases passed before deployment; 10 production account/storage checks passed afterward, and disposable users, documents and image were removed.
- Build, Journal calculation checks, backend tests, search metadata (97 public pages), routing, theme, holiday coverage and monitoring checks passed.
- External feeds were checked at a point in time, not certified for uninterrupted service.
