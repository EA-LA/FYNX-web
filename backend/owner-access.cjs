'use strict';
// FYNX owner entitlement: permanent, complimentary, unlimited access for the FYNX owner's own account.
//
// Server-side only. The decision uses the Firebase Authentication user record read with the Admin SDK
// (admin.auth().getUser), never a client claim, profile field, request body, URL flag or browser storage:
//  - the account's email must be verified by Firebase Authentication (a Google sign-in, or a confirmed email link),
//  - the verified email must be the owner's address below,
//  - the account must not be disabled,
//  - and when FYNX_OWNER_UIDS is configured (comma-separated Firebase UIDs), the UID must be one of them, which pins
//    the entitlement to the exact account(s) even if another provider ever presents the same address.
// Nobody can grant themselves this: there is no Firestore document, custom claim or API that sets it, and an
// email address that is not verified never qualifies. No Stripe customer, subscription or payment record is created.
// Every caller treats the owner as the highest paid tier, so any premium feature added later is included
// automatically. Infrastructure protections (per-minute and per-second rate limits) still apply to the owner.
const OWNER_EMAILS = Object.freeze(['ha6876122@gmail.com']);
const OWNER_LABEL = 'FYNX Owner — Lifetime Unlimited Access';
const CACHE_MS = 5 * 60 * 1000;

const pinnedUids = (env = process.env) => String(env?.FYNX_OWNER_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);

function isOwnerRecord(user, env = process.env) {
  if (!user || typeof user !== 'object' || user.disabled === true || user.emailVerified !== true) return false;
  if (typeof user.uid !== 'string' || !user.uid) return false;
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!OWNER_EMAILS.includes(email)) return false;
  const pins = pinnedUids(env);
  return !pins.length || pins.includes(user.uid);
}

// async uid => boolean, with a short cache. Lookup failures return false and are not cached (fail closed).
function createOwnerCheck({getUser, env = process.env, ttlMs = CACHE_MS, now = () => Date.now()} = {}) {
  const cache = new Map();
  async function check(uid) {
    if (typeof uid !== 'string' || !uid || typeof getUser !== 'function') return false;
    const hit = cache.get(uid);
    if (hit && hit.expires > now()) return hit.owner;
    let owner;
    try { owner = isOwnerRecord(await getUser(uid), env); } catch { return false; }
    cache.set(uid, {owner, expires: now() + ttlMs});
    if (cache.size > 5000) cache.delete(cache.keys().next().value);
    return owner;
  }
  check.forget = uid => cache.delete(uid);
  return check;
}

// What the membership status reports for the owner (no subscription, no renewal date, never expires).
const ownerMembership = () => ({tier: 'pro', accessProvider: 'owner', owner: true, lifetime: true, membershipLabel: OWNER_LABEL, subscription: null});

module.exports = {OWNER_EMAILS, OWNER_LABEL, isOwnerRecord, createOwnerCheck, ownerMembership, pinnedUids};
