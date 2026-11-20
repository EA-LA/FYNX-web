/* pro.html#plans helpers: current plan banner, plan picked from an upgrade prompt, and the post-checkout hand-off to
   the welcome tour. The welcome page is shown only after the membership service confirms a paid plan; a checkout
   return by itself never unlocks anything (pro-workspace.js keeps its own confirmation messaging). */
(function () {
  'use strict';
  const P = window.FYNXPlan;
  if (!P) return;
  const q = new URLSearchParams(location.search);
  const picked = q.get('plan');
  if (['starter', 'plus', 'pro'].includes(picked)) {
    const b = document.querySelector(`[data-plan="${picked}"]`), card = b && b.closest('.fxm-plan');
    if (card) { card.classList.add('picked'); setTimeout(() => card.scrollIntoView({block: 'center', behavior: 'smooth'}), 400); }
  }
  const now = document.getElementById('fxmNow');
  const show = s => {
    if (!now) return;
    if (!s.signedIn) { now.hidden = true; return; }
    now.hidden = false; now.replaceChildren();
    const b = document.createElement('b'); b.textContent = s.name + ' plan';
    const m = P.meter('analysis');
    now.append('Your account: ', b, Number.isFinite(m.limit) ? ` · ${m.left} of ${m.limit} advanced analyses left today` : ' · unlimited analyses');
  };
  P.onChange(show);
  P.ready().then(async s => {
    show(s);
    if (q.get('checkout') !== 'complete' || !s.signedIn) return;
    for (let i = 0; i < 8; i++) {
      const r = await P.refresh();
      if (['starter', 'plus', 'pro'].includes(r.tier)) { location.replace('/welcome.html?plan=' + r.tier); return; }
      await new Promise(res => setTimeout(res, 2500));
    }
  });
})();
