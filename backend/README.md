# FYNX website cloud services

Production project: `fynx-c7a28`, region `us-central1`.

## Deployed features

- `webLearning`: authenticated outline review status, most recent quiz and last 20 quiz attempts. Ownership comes exclusively from the verified Firebase token. Scores are self-reported study history, not certified assessments.
- `webReminders`: authenticated create/list/cancel. Requires a verified email and explicit per-reminder email consent. Maximum 50 pending reminders; mutation/read throttling is 60 requests per minute per user. Dates must be in the future and within one year.
- `webReminderDelivery`: Cloud Scheduler checks every minute. Uses the existing `MAILGUN_API_KEY` Secret Manager secret and `notifications@mail.fynxfunded.com`. Sends only to the account's current verified address; callers cannot choose another recipient.

A reminder is claimed transactionally before submission. Ambiguous provider errors and interrupted sends become `delivery_unconfirmed` rather than automatically resending and risking duplicates. `sent` means Mailgun accepted the message, not proof of inbox delivery. Actual arrival depends on the provider and recipient mail system. Pending reminders can be cancelled from Calendar Alerts. Existing browser-local alerts remain separate and require an open page.

Private data is under `fynxWebUsers/{uid}/learning/{topic}` and `fynxWebReminders/{id}`. Existing production rules do not give ordinary clients direct access to these paths. The authenticated functions perform ownership checks; this release did not replace shared Firestore rules or alter funded-product collections.

## Reproducible checks

```
npm ci --prefix backend
npm test --prefix backend
npm run build
npm test
```

Backend deployment currently uses the existing `/Users/h/Desktop/fynx-functions` Firebase project. `backend/web-services.js` is the version-controlled source; copy it to that project's `functions/web-services.js`. Its existing initialized Admin app and index explicitly export the three `web*` functions. Deploy only these named functions; preserve unrelated scheduled news jobs:

```
firebase deploy --only functions:webLearning,functions:webReminders,functions:webReminderDelivery --project fynx-c7a28
```

No Mailgun key belongs in this repository or browser assets. Secret binding is declared only on the scheduled delivery function.

## Two-factor authentication: activation pending

The owner explicitly chose to leave the Identity Platform upgrade pending on September 15, 2026. Firebase rejected enabling TOTP on the current `FIREBASE_AUTH` project; MFA remains `DISABLED`.

The website includes authenticator enrollment/removal and second-factor challenge handling for email, Google and Apple login. Enrollment is intentionally disabled by `enrollmentActivated=false` in `assets/js/mfa.js`. Security displays the pending activation status. No factor was enrolled for any user and the project was not upgraded.

After a separately authorized upgrade, enable optional TOTP in Firebase (one adjacent time interval), turn on enrollment, and verify enrollment, invalid-code rejection, sign-in, reauthentication and removal with a test account. Review other clients sharing this Firebase project for MFA compatibility before encouraging users to enroll. Recovery uses a backed-up authenticator or an administrator identity-verification process; this release does not invent unverified backup codes.

Provider documentation: https://firebase.google.com/docs/auth/web/totp-mfa

## Verification performed

- Unit tests: authenticated-caller requirement, path identifier validation, dates/consent, Mailgun recipient and text encoding.
- Production callable checks with temporary QA accounts: unauthenticated rejection; lesson save/read; another user's isolation; quiz history; unverified-email rejection; reminder creation/cancellation; denial of another user's cancellation.
- All temporary QA accounts and documents removed. Test reminders were scheduled a day ahead and cancelled, so no delivery occurred.
- Mailgun accepted a test-mode message with delivery disabled. This verifies provider credentials/request format, not inbox delivery.
- Cloud Scheduler is enabled at one-minute intervals.
- Mobile checks at 390px: no overflow or page errors on the new reminder, learning and security controls.

Remaining: owner activation decision for MFA; then real MFA round-trip tests. Real inbox delivery and optional Mailgun delivery/bounce webhooks remain to be checked. Browser push while the page is closed is not included; background reminders here are email.
