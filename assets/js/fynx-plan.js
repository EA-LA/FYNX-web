/* FYNX membership plan and daily allowances, shared by the website and the Terminal.
 *
 * The plan comes from the live membership service (consumerLiveWorkspace → status), the same server check that guards
 * paid Pro tools. A URL flag, local storage or a checkout return can never raise the plan. Allowances are counted per
 * account per day in this browser and reset at local midnight. They shape the experience; they are not a security
 * boundary (all calculations run in the browser).
 *
 *   FYNXPlan.ready()                 → Promise<{tier, name, uid, signedIn}>
 *   FYNXPlan.charge(cat, key, opts)  → Promise<boolean>; same key twice on one day is charged once
 *   FYNXPlan.meter(cat)              → {used, limit, left, tier}
 *   FYNXPlan.paywall(opts)           → shows the upgrade dialog
 *   FYNXPlan.lockedCard(opts)        → element to place where a blocked result would be
 *   FYNXPlan.checkout(tier)          → secure Stripe checkout (sign-in first for guests)
 */
(function (root) {
  'use strict';
  if (root.FYNXPlan) return;
  const doc = root.document;
  const ORDER = ['guest', 'free', 'starter', 'plus', 'pro'];
  const NAMES = {guest: 'Guest', free: 'Free', starter: 'Essential', plus: 'Plus', pro: 'Professional'};
  const PRICES = {starter: '$5.99', plus: '$10.99', pro: '$30.99'};
  const LIMITS = {
    analysis: {guest: 2, free: 5, starter: 15, plus: 60, pro: Infinity},
    ai: {guest: 1, free: 2, starter: 5, plus: 25, pro: Infinity},
    backtest: {guest: 2, free: 4, starter: 12, plus: 50, pro: Infinity}
  };
  const WHAT = {analysis: 'advanced analyses', ai: 'AI forecasts and AI reports', backtest: 'strategy backtests'};
  const STORE = 'fynx.usage.v1', CACHE = 'fynx.plan.v1';
  let state = {tier: 'guest', uid: null, signedIn: false, verified: false};
  let readyPromise = null, services = null;
  const listeners = new Set();

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const who = () => state.uid || 'guest';
  function readUsage() {
    let u = null; try { u = JSON.parse(root.localStorage.getItem(STORE)); } catch (_) {}
    if (!u || u.day !== today() || u.who !== who()) u = {day: today(), who: who(), counts: {}, keys: {}};
    return u;
  }
  function writeUsage(u) { try { root.localStorage.setItem(STORE, JSON.stringify(u)); } catch (_) {} }
  const limitOf = (cat, tier = state.tier) => (LIMITS[cat] || LIMITS.analysis)[tier] ?? 0;
  function meter(cat = 'analysis') { const u = readUsage(), used = u.counts[cat] || 0, limit = limitOf(cat); return {used, limit, left: Math.max(0, limit - used), tier: state.tier, name: NAMES[state.tier]}; }
  function emit() { for (const fn of listeners) { try { fn({...state, name: NAMES[state.tier]}); } catch (_) {} } }

  async function loadServices() {
    if (services) return services;
    const [config, authSDK, functionsSDK] = await Promise.all([
      import('/auth/firebase.js'), import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'), import('https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js')
    ]);
    await config.authPersistenceReady;
    const callable = functionsSDK.httpsCallable(functionsSDK.getFunctions(config.app, 'us-central1'), 'consumerLiveWorkspace', {timeout: 9000});
    services = {config, authSDK, call: async data => (await callable(data)).data};
    return services;
  }
  async function verify(user) {
    if (!user) { state = {tier: 'guest', uid: null, signedIn: false, verified: true}; emit(); return; }
    let cached = null; try { cached = JSON.parse(root.sessionStorage.getItem(CACHE)); } catch (_) {}
    if (cached && cached.uid === user.uid && Date.now() - cached.at < 10 * 60 * 1000 && ORDER.includes(cached.tier)) { state = {tier: cached.tier, uid: user.uid, signedIn: true, verified: true}; emit(); return; }
    state = {tier: 'free', uid: user.uid, signedIn: true, verified: false};
    try {
      const s = await services.call({action: 'status'});
      const tier = s && s.mode === 'live' && !s.billingUnavailable && ['starter', 'plus', 'pro'].includes(s.tier) ? s.tier : 'free';
      state = {tier, uid: user.uid, signedIn: true, verified: true};
      try { root.sessionStorage.setItem(CACHE, JSON.stringify({uid: user.uid, tier, at: Date.now()})); } catch (_) {}
    } catch (_) { state = {tier: 'free', uid: user.uid, signedIn: true, verified: false}; }
    emit();
  }
  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      try {
        const svc = await loadServices();
        await new Promise(resolve => {
          let first = true;
          svc.authSDK.onAuthStateChanged(svc.config.auth, async user => {
            await verify(user);
            if (first) { first = false; resolve(); }
          });
        });
      } catch (_) { state = {tier: 'guest', uid: null, signedIn: false, verified: false}; }
      return {...state, name: NAMES[state.tier]};
    })();
    return readyPromise;
  }
  function refresh() { try { root.sessionStorage.removeItem(CACHE); } catch (_) {} const user = services?.config?.auth?.currentUser || null; return verify(user).then(() => ({...state, name: NAMES[state.tier]})); }

  async function charge(cat = 'analysis', key = '', opts = {}) {
    await Promise.race([ready(), new Promise(r => setTimeout(r, 6000))]);
    const u = readUsage(), k = String(key || '').slice(0, 300), keys = u.keys[cat] || (u.keys[cat] = []);
    if (k && keys.includes(k)) return true;
    const limit = limitOf(cat), used = u.counts[cat] || 0;
    if (used >= limit) { if (!opts.silent) paywall({cat, feature: opts.feature, reason: 'limit'}); return false; }
    u.counts[cat] = used + 1; if (k) { keys.push(k); if (keys.length > 400) keys.splice(0, keys.length - 400); }
    writeUsage(u); emit();
    return true;
  }

  async function checkout(tier) {
    if (!PRICES[tier]) tier = 'plus';
    await ready();
    const back = root.location.pathname + root.location.search + root.location.hash;
    try { root.sessionStorage.setItem('fynx.plan.return', JSON.stringify({path: back, at: Date.now()})); } catch (_) {}
    if (!state.signedIn) { root.location.href = '/auth/signup.html?returnTo=' + encodeURIComponent('/pro.html?plan=' + tier + '#plans'); return; }
    const d = await services.call({action: 'checkout', tier, tool: 'analytics'});
    const url = new URL(d.url);
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Invalid checkout destination.');
    root.location.href = url.href;
  }

  /* ----------------------------------------------- UI ----------------------------------------------- */
  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  function style() {
    if (doc.getElementById('fynx-plan-style')) return;
    const s = el('style'); s.id = 'fynx-plan-style';
    s.textContent = `
.fxp-dlg{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,4,5,.78);backdrop-filter:blur(6px);font-family:Inter,Arial,sans-serif;color:#e8ecea}
.fxp-box{position:relative;width:min(860px,100%);max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow:auto;background:linear-gradient(180deg,#0d1211,#070a0b);border:1px solid #2a3330;border-top:3px solid #ffb000;box-shadow:0 30px 80px rgba(0,0,0,.6);padding:26px 26px 20px}
.fxp-x{position:absolute;top:10px;right:12px;width:36px;height:36px;padding:0!important;background:none!important;border:0!important;color:#8e9b94!important;font:400 26px/1 Arial,sans-serif!important;cursor:pointer}
.fxp-kick{font:700 10.5px 'IBM Plex Mono',monospace!important;letter-spacing:.14em!important;color:#ffb000!important}
.fxp-box h2{margin:8px 0 8px!important;font:800 clamp(22px,3.2vw,30px)/1.15 Inter,Arial,sans-serif!important;color:#fff!important;letter-spacing:-.01em!important;text-transform:none!important}
.fxp-lead{margin:0 0 16px!important;color:#b8c3bd;font-size:14.5px;line-height:1.55;max-width:640px}
.fxp-meter{display:flex;align-items:center;gap:10px;margin:0 0 20px!important;font:600 11.5px 'IBM Plex Mono',monospace;color:#8e9b94}
.fxp-meter i{flex:0 0 180px;height:6px;background:#1b2421;border-radius:3px;overflow:hidden;position:relative}
.fxp-meter i b{position:absolute;inset:0 auto 0 0;background:#ff5a4f}
.fxp-plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.fxp-plan{position:relative;display:flex;flex-direction:column;gap:8px;padding:16px;border:1px solid #2a3330;background:#0b100f}
.fxp-plan.hot{border-color:#ffb000;background:linear-gradient(180deg,rgba(255,176,0,.10),#0b100f 60%)}
.fxp-tag{position:absolute;top:-10px;left:14px;padding:2px 8px;background:#ffb000;color:#000;font:800 9.5px 'IBM Plex Mono',monospace;letter-spacing:.08em}
.fxp-plan h3{margin:0!important;font:700 12px 'IBM Plex Mono',monospace!important;letter-spacing:.12em!important;color:#8e9b94!important;text-transform:none!important}
.fxp-price{font:800 28px Inter,Arial,sans-serif!important;color:#fff!important;letter-spacing:-.01em!important}.fxp-price small{font:500 12px Inter,Arial,sans-serif;color:#8e9b94;margin-left:4px}
.fxp-plan ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:#c9d2cd;line-height:1.4;flex:1}
.fxp-plan li::before{content:'✓ ';color:#3ecf8e;font-weight:700}
.fxp-cta{height:40px;border:1px solid #ffb000!important;background:#ffb000!important;color:#000!important;font:800 12.5px Inter,Arial,sans-serif!important;cursor:pointer;border-radius:2px}
.fxp-cta.alt{background:transparent!important;color:#ffb000!important}
.fxp-cta:disabled{opacity:.6;cursor:wait}
.fxp-fine{margin:14px 0 0!important;color:#7d8a83;font-size:11.5px;line-height:1.5}
.fxp-fine a{color:#ffb000}
.fxp-err{margin:10px 0 0;color:#ff8b80;font-size:12.5px}
.fxp-lock{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:22px;border:1px solid #2a3330;border-left:3px solid #ffb000;background:repeating-linear-gradient(135deg,#0b100f 0 12px,#0d1312 12px 24px);color:#e8ecea;font-family:Inter,Arial,sans-serif}
.fxp-lock h3{margin:0!important;font:800 19px/1.3 Inter,Arial,sans-serif!important;color:#fff!important;letter-spacing:0!important;text-transform:none!important}
.fxp-lock p{margin:0!important;color:#b8c3bd;font-size:13.5px;line-height:1.55;max-width:620px}
.fxp-lock .row{display:flex;gap:8px;flex-wrap:wrap}
.fxp-lock .fxp-cta{padding:0 16px}
.fxp-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border:1px solid #2a3330;font:600 10.5px 'IBM Plex Mono',monospace;color:#8e9b94;white-space:nowrap}
.fxp-chip b{color:#ffb000}.fxp-chip button{background:none!important;border:0!important;color:#ffb000!important;font:700 10.5px 'IBM Plex Mono',monospace!important;cursor:pointer;padding:0 0 0 4px!important}
@media (max-width:760px){.fxp-plans{grid-template-columns:1fr}.fxp-box{padding:22px 16px 16px}.fxp-meter i{flex-basis:110px}}
@media (pointer:coarse){.fxp-x{top:6px;right:6px;width:44px;height:44px}.fxp-cta{height:auto;min-height:44px}.fxp-box h2{padding-right:34px}}`;
    doc.head.append(s);
  }
  const PERKS = {
    starter: ['15 advanced analyses a day', '5 AI forecasts & reports a day', '12 strategy backtests a day', 'Six Pro tools · 25 saved workspaces'],
    plus: ['60 advanced analyses a day', '25 AI forecasts & reports a day', '50 strategy backtests a day', 'Every Terminal lab: Quant, Strategy, AI', 'Seven Pro tools · 100 saved workspaces'],
    pro: ['Unlimited analyses, backtests and AI', 'Every tool, every desk, no daily caps', 'Eight Pro tools incl. drawdown simulation', '500 saved workspaces', 'Priority for new tools as they ship']
  };
  function planCard(tier, onBuy, hot) {
    const c = el('div', 'fxp-plan' + (hot ? ' hot' : ''));
    if (hot) c.append(el('span', 'fxp-tag', 'MOST POPULAR'));
    if (tier === 'pro') c.append(el('span', 'fxp-tag', 'NO LIMITS'));
    c.append(el('h3', '', NAMES[tier].toUpperCase()));
    const p = el('div', 'fxp-price', PRICES[tier]); p.append(el('small', '', '/ month')); c.append(p);
    const ul = el('ul'); for (const x of PERKS[tier]) ul.append(el('li', '', x)); c.append(ul);
    const b = el('button', 'fxp-cta' + (hot ? '' : ' alt'), state.tier === tier ? 'Your current plan' : `Get ${NAMES[tier]}`); b.type = 'button';
    b.disabled = state.tier === tier || ORDER.indexOf(state.tier) > ORDER.indexOf(tier);
    if (ORDER.indexOf(state.tier) > ORDER.indexOf(tier)) b.textContent = 'Included in your plan';
    b.addEventListener('click', () => onBuy(tier, b));
    c.append(b); return c;
  }
  let open = null;
  function paywall({cat = 'analysis', feature = '', reason = 'limit', title, lead} = {}) {
    style(); if (open) open.remove();
    const back = doc.activeElement;
    const m = meter(cat), wrap = el('div', 'fxp-dlg'), box = el('div', 'fxp-box');
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'fxp-title');
    const x = el('button', 'fxp-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', () => close());
    const kick = el('div', 'fxp-kick', reason === 'limit' ? `DAILY LIMIT REACHED · ${NAMES[state.tier].toUpperCase()}` : 'FYNX MEMBERSHIP');
    const h = el('h2', '', title || (reason === 'limit' ? (state.tier === 'guest' ? `That's today's free preview${feature ? ' of ' + feature : ''}.` : `You've used all ${m.limit} ${WHAT[cat]} for today.`) : 'Unlock the full FYNX Terminal.')); h.id = 'fxp-title';
    const leadText = lead || (state.tier === 'guest'
      ? `Create a free account for ${limitOf(cat, 'free')} ${WHAT[cat]} a day, or go Plus for ${limitOf(cat, 'plus')} a day across every Quant, Strategy and AI tool. ${feature ? feature + ' is ready to run the moment you continue.' : ''}`
      : `${feature ? feature + ' is one click away. ' : ''}Plus opens every Terminal lab with ${limitOf(cat, 'plus')} ${WHAT[cat]} a day, and Professional removes every limit. Cancel anytime; the free plan stays free.`);
    box.append(x, kick, h, el('p', 'fxp-lead', leadText));
    if (reason === 'limit' && Number.isFinite(m.limit)) { const mt = el('div', 'fxp-meter'), bar = el('i'), fill = el('b'); fill.style.width = '100%'; bar.append(fill); mt.append(el('span', '', `${m.used} / ${m.limit} used today`), bar, el('span', '', 'resets at midnight')); box.append(mt); }
    const err = el('p', 'fxp-err'); err.hidden = true;
    const buy = async (tier, b) => { err.hidden = true; const t = b.textContent; b.disabled = true; b.textContent = 'Opening secure checkout…'; try { await checkout(tier); } catch (e) { err.textContent = (e && e.message) || 'Checkout could not open. Please try again.'; err.hidden = false; b.disabled = false; b.textContent = t; } };
    const plans = el('div', 'fxp-plans'); plans.append(planCard('starter', buy), planCard('plus', buy, true), planCard('pro', buy)); box.append(plans, err);
    const fine = el('p', 'fxp-fine');
    fine.append(document.createTextNode(state.signedIn ? 'Secure payment with Stripe. Monthly, cancel renewal anytime in Manage subscription. ' : 'You will create or sign in to your free FYNX account first, then choose a plan. '));
    const a = el('a', '', 'Compare every plan →'); a.href = '/pro.html#plans'; fine.append(a);
    if (state.tier === 'guest') { fine.append(document.createTextNode(' · ')); const s = el('a', '', 'Create a free account'); s.href = '/auth/signup.html?returnTo=' + encodeURIComponent(root.location.pathname + root.location.search + root.location.hash); fine.append(s); }
    box.append(fine); wrap.append(box);
    const close = () => { wrap.remove(); open = null; doc.removeEventListener('keydown', onKey); if (back && back.isConnected && typeof back.focus === 'function') back.focus({preventScroll: true}); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    doc.addEventListener('keydown', onKey);
    doc.body.append(wrap); open = wrap;
    // Focus without scrolling: on small phones scrolling to the Plus button hid the title, the reason and the close button.
    setTimeout(() => { plans.querySelector('.fxp-plan.hot .fxp-cta')?.focus({preventScroll: true}); box.scrollTop = 0; }, 30);
    return close;
  }
  function lockedCard({cat = 'analysis', feature = 'This analysis', what = ''} = {}) {
    style(); const m = meter(cat), c = el('div', 'fxp-lock');
    c.append(el('div', 'fxp-kick', `${NAMES[state.tier].toUpperCase()} · ${m.used}/${Number.isFinite(m.limit) ? m.limit : '∞'} ${WHAT[cat].toUpperCase()} USED TODAY`));
    c.append(el('h3', '', `${feature} is ready. Unlock it to see the result.`));
    c.append(el('p', '', what || `You have reached today's ${WHAT[cat]} on the ${NAMES[state.tier]} plan. Plus gives you ${limitOf(cat, 'plus')} a day across every Terminal tool for $10.99 a month; Professional is unlimited. Your allowance also resets at midnight.`));
    const row = el('div', 'row'), b1 = el('button', 'fxp-cta', 'Unlock with Plus · $10.99/mo'), b2 = el('button', 'fxp-cta alt', 'See all plans');
    b1.type = b2.type = 'button';
    b1.addEventListener('click', async () => { b1.disabled = true; try { await checkout('plus'); } catch (e) { b1.disabled = false; paywall({cat, feature}); } });
    b2.addEventListener('click', () => paywall({cat, feature}));
    row.append(b1, b2); c.append(row); return c;
  }
  function chip(cat = 'analysis') {
    style(); const c = el('span', 'fxp-chip');
    const paint = () => { const m = meter(cat); c.replaceChildren(); if (!Number.isFinite(m.limit)) { c.append(el('b', '', NAMES[m.tier]), document.createTextNode(' · unlimited')); return; } c.append(el('b', '', `${m.left}/${m.limit}`), document.createTextNode(` ${WHAT[cat]} left today`)); if (m.tier !== 'pro') { const u = el('button', '', m.tier === 'plus' ? 'Go unlimited' : 'Upgrade'); u.type = 'button'; u.addEventListener('click', () => paywall({cat, reason: 'upsell'})); c.append(u); } };
    paint(); listeners.add(paint); return c;
  }

  root.FYNXPlan = {ready, refresh, charge, meter, paywall, lockedCard, chip, checkout, onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    get tier() { return state.tier; }, get name() { return NAMES[state.tier]; }, LIMITS, NAMES, PRICES, PERKS, limitOf};
})(typeof window !== 'undefined' ? window : globalThis);
