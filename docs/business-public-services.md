# Waitlist and optional shared identities

The money-management waitlist uses `webWaitlist` instead of direct browser Firestore access. The service validates explicit consent, saves one record per normalized email, returns the same response for retries, and limits requests transactionally. It does not send email. Public clients cannot read the list. Rate-limit records contain a daily hash of the request IP, not the raw address.

The iOS FYNX ID screen calls `webProfileSharing` with the signed-in Firebase identity. Publishing requires a verified email and explicit opt-in; disabling remains available without email verification. Only the display name and FYNX ID are returned by `webSharedProfile`. Journal records, private user documents, email addresses, and performance statistics are never returned. Existing accounts start private. The website displays unavailable/private profiles without redirecting users automatically.

Run `npm test` and `npm --prefix backend test` before deployment. Run `node scripts/package-business-public.cjs`, install with `npm ci` in `output/business-public/functions`, then run the exact deployment command printed by the packager from `output/business-public`. The explicit function list avoids changing other live functions or Firestore rules. Do not run an unrestricted functions deployment from this partial bundle.

Public profile links now use `/shared-profile.html?id=FYNX-XXXXXXXX` on the main FYNX website. Existing links on the expired `profiles.elhamamini.cc` domain still depend on restoring that domain's DNS; a source change cannot repair unavailable DNS.
