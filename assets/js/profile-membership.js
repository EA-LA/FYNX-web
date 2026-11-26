/* Profile: the member's verified FYNX membership. The status comes from the server (FYNXPlan → consumerLiveWorkspace),
 * so the owner's "FYNX Owner — Lifetime Unlimited Access" line appears only for the account the server verified. */
(function () {
  'use strict';
  const doc = document;
  function paint(p) {
    const slot = doc.getElementById('statMembership'), badge = doc.getElementById('profileMembership');
    if (!slot && !badge) return;
    const P = window.FYNXPlan;
    let text = '—', note = '';
    // Read the plan module's current, server-verified state (the callback argument may be an earlier snapshot).
    if (P) p = {...(p || {}), owner: P.owner === true, tier: P.tier, signedIn: P.tier !== 'guest'};
    if (P && p) {
      if (p.owner) { text = P.OWNER_LABEL; note = 'Complimentary lifetime access to every FYNX product and future premium feature. No subscription or payment.'; }
      else if (p.signedIn) { text = (P.NAMES[p.tier] || 'Free') + (p.tier === 'free' ? ' plan' : ' membership'); note = p.verified ? '' : 'Membership verification is pending.'; }
    }
    if (slot) slot.textContent = p?.owner ? 'FYNX Owner' : text;
    if (badge) { badge.hidden = !p?.signedIn; badge.replaceChildren(); const b = doc.createElement('b'); b.textContent = text; badge.append(b); if (note) { const s = doc.createElement('span'); s.textContent = ' · ' + note; badge.append(s); } badge.classList.toggle('owner', !!p?.owner); }
  }
  function start() {
    const P = window.FYNXPlan; if (!P) return;
    P.onChange(paint); P.ready().then(paint).catch(() => {});
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
