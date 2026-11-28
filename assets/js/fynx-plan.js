/* FYNX membership plan and daily allowances, shared by the website and the Terminal.
 *
 * The plan comes from the live membership service (consumerLiveWorkspace → status), the same server check that guards
 * paid Pro tools. A URL flag, local storage or a checkout return can never raise the plan. Allowances are counted per
 * signed-in account per UTC day on the server (consumerLiveWorkspace → usage), so the device clock, clearing browser
 * storage or switching devices does not reset them; guests are counted in this browser. If the server cannot be reached
 * the local counter applies. All calculations run in the browser, so the allowance shapes use; it is not a paywall for
 * data that is public anyway. Paid tools on the server check the plan there.
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
  let state = {tier: 'guest', uid: null, signedIn: false, verified: false, owner: false};
  // Owner access is decided only by the server (consumerLiveWorkspace status → owner: true); never by email or storage here.
  const OWNER_NAME = 'FYNX Owner', OWNER_LABEL = 'FYNX Owner — Lifetime Unlimited Access';
  const nameOf = () => state.owner ? OWNER_NAME : NAMES[state.tier];
  let readyPromise = null, services = null, verificationRevision = 0;
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
  function meter(cat = 'analysis') { const u = readUsage(), used = u.counts[cat] || 0, limit = limitOf(cat); return {used, limit, left: Math.max(0, limit - used), tier: state.tier, name: nameOf(), owner: state.owner}; }
  function emit() { for (const fn of listeners) { try { fn({...state, name: nameOf()}); } catch (_) {} } }

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
    const revision = ++verificationRevision;
    if (!user) { state = {tier: 'guest', uid: null, signedIn: false, verified: true, owner: false}; emit(); return; }
    // The session cache only avoids a second round trip on the same tab; it can never raise the plan above what the
    // server verified, and the server re-checks the plan on every metered call regardless.
    let cached = null; try { cached = JSON.parse(root.sessionStorage.getItem(CACHE)); } catch (_) {}
    // Owner status is never taken from this cache: it is re-verified with the server on every page load.
    if (cached && cached.uid === user.uid && !cached.owner && Date.now() - cached.at < 10 * 60 * 1000 && ORDER.includes(cached.tier)) { state = {tier: cached.tier, uid: user.uid, signedIn: true, verified: true, owner: false}; emit(); return; }
    const accountChanged = state.uid !== user.uid;
    state = {tier: 'free', uid: user.uid, signedIn: true, verified: false, owner: false};
    // Hide the previous account's paid benefits while the new account is being verified.
    if (accountChanged) emit();
    try {
      const s = await services.call({action: 'status'});
      if (revision !== verificationRevision) return;
      const owner = !!(s && s.mode === 'live' && s.owner === true && s.tier === 'pro');
      const tier = owner ? 'pro' : s && s.mode === 'live' && !s.billingUnavailable && ['starter', 'plus', 'pro'].includes(s.tier) ? s.tier : 'free';
      state = {tier, uid: user.uid, signedIn: true, verified: true, owner};
      try { root.sessionStorage.setItem(CACHE, JSON.stringify({uid: user.uid, tier, owner, at: Date.now()})); } catch (_) {}
    } catch (_) {
      if (revision !== verificationRevision) return;
      state = {tier: 'free', uid: user.uid, signedIn: true, verified: false, owner: false};
    }
    emit(); syncUsage(revision, user.uid);
  }
  // Today's counts from the server, so the meter is right on every device (best effort, never blocks a tool).
  async function syncUsage(revision, uid) {
    if (revision !== verificationRevision || state.uid !== uid || !state.signedIn || !services) return;
    try {
      const r = await services.call({action: 'usage', op: 'read', cat: 'all'});
      // A response for an earlier account or verification must not update the active meter.
      if (revision !== verificationRevision || state.uid !== uid || !r || !r.counts) return;
      const v = readUsage(); for (const c of Object.keys(LIMITS)) v.counts[c] = Number(r.counts[c]) || 0;
      if (Number.isFinite(r.resetAt)) v.resetAt = r.resetAt; v.server = true; writeUsage(v); emit();
    } catch (_) {}
  }
  // When the allowance resets, in the visitor's own time: server-counted members reset at 00:00 UTC.
  function resetText() {
    const v = readUsage();
    if (v.server && Number.isFinite(v.resetAt)) return 'Resets at ' + new Date(v.resetAt).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) + ' your time (00:00 UTC).';
    return 'Resets at midnight on this device.';
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
      } catch (_) { state = {tier: 'guest', uid: null, signedIn: false, verified: false, owner: false}; }
      return {...state, name: nameOf()};
    })();
    return readyPromise;
  }
  function refresh() { try { root.sessionStorage.removeItem(CACHE); } catch (_) {} const user = services?.config?.auth?.currentUser || null; return verify(user).then(() => ({...state, name: nameOf()})); }

  async function charge(cat = 'analysis', key = '', opts = {}) {
    await Promise.race([ready(), new Promise(r => setTimeout(r, 6000))]);
    const u = readUsage(), k = String(key || '').slice(0, 300), keys = u.keys[cat] || (u.keys[cat] = []);
    if (k && keys.includes(k)) return true;
    // Signed-in members: the server keeps the count for the UTC day (device clock and browser storage cannot reset it).
    // If the server cannot be reached, the local counter below still applies so tools keep working.
    if (state.signedIn && state.uid && services) {
      try {
        const r = await services.call({action: 'usage', op: 'charge', cat, ...(k ? {key: k} : {})});
        if (r && typeof r.allowed === 'boolean') {
          const v = readUsage(); v.counts[cat] = Number(r.used) || 0; if (k && r.allowed && !(v.keys[cat] || (v.keys[cat] = [])).includes(k)) v.keys[cat].push(k);
          if (Number.isFinite(r.resetAt)) v.resetAt = r.resetAt; v.server = true; writeUsage(v); emit();
          if (!r.allowed) { if (!opts.silent) paywall({cat, feature: opts.feature, reason: 'limit'}); return false; }
          return true;
        }
      } catch (_) {}
    }
    const limit = limitOf(cat), used = u.counts[cat] || 0;
    if (used >= limit) { if (!opts.silent) paywall({cat, feature: opts.feature, reason: 'limit'}); return false; }
    u.counts[cat] = used + 1; if (k) { keys.push(k); if (keys.length > 400) keys.splice(0, keys.length - 400); }
    writeUsage(u); emit();
    return true;
  }

  // A membership-checked server request (e.g. Pro analytics computed on the server). Guests are asked to sign in.
  async function server(data) {
    await ready();
    if (!state.signedIn || !services) { const e = new Error('Sign in to continue.'); e.code = 'unauthenticated'; throw e; }
    try { return await services.call(data); } catch (e) { const code = String(e?.code || '').replace(/^functions\//, ''); const out = new Error(e?.message || 'Request failed.'); out.code = code; throw out; }
  }
  async function checkout(tier) {
    if (!PRICES[tier]) tier = 'plus';
    await ready();
    if (state.owner) throw new Error('Owner access is lifetime and complimentary. No checkout is needed.');
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
@media (pointer:coarse){.fxp-x{top:6px;right:6px;width:44px;height:44px}.fxp-cta{height:auto;min-height:44px}.fxp-box h2{padding-right:34px}.fxp-fine a{display:inline-flex;align-items:center;min-height:44px}}`;
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
  // Navigating to another page or desk closes an open paywall, so it never covers a page it does not belong to.
  let closeOpen = null;
  function closePaywall() { if (open && closeOpen) closeOpen(); open = null; closeOpen = null; }
  function paywall({cat = 'analysis', feature = '', reason = 'limit', title, lead} = {}) {
    style(); if (open) closePaywall();
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
    doc.body.append(wrap); open = wrap; closeOpen = close;
    // Focus without scrolling: on small phones scrolling to the Plus button hid the title, the reason and the close button.
    setTimeout(() => { plans.querySelector('.fxp-plan.hot .fxp-cta')?.focus({preventScroll: true}); box.scrollTop = 0; }, 30);
    return close;
  }
  function lockedCard({cat = 'analysis', feature = 'This analysis', what = ''} = {}) {
    style(); const m = meter(cat), c = el('div', 'fxp-lock');
    c.append(el('div', 'fxp-kick', `${NAMES[state.tier].toUpperCase()} · ${m.used}/${Number.isFinite(m.limit) ? m.limit : '∞'} ${WHAT[cat].toUpperCase()} USED TODAY`));
    c.append(el('h3', '', `${feature} is ready. Unlock it to see the result.`));
    c.append(el('p', '', what || `You have reached today's ${WHAT[cat]} on the ${NAMES[state.tier]} plan. Plus gives you ${limitOf(cat, 'plus')} a day across every Terminal tool for $10.99 a month; Professional is unlimited. Your allowance ${resetText().charAt(0).toLowerCase() + resetText().slice(1)}`));
    const row = el('div', 'row'), b1 = el('button', 'fxp-cta', 'Unlock with Plus · $10.99/mo'), b2 = el('button', 'fxp-cta alt', 'See all plans');
    b1.type = b2.type = 'button';
    b1.addEventListener('click', async () => { b1.disabled = true; try { await checkout('plus'); } catch (e) { b1.disabled = false; paywall({cat, feature}); } });
    b2.addEventListener('click', () => paywall({cat, feature}));
    row.append(b1, b2); c.append(row); return c;
  }
  function chip(cat = 'analysis') {
    style(); const c = el('span', 'fxp-chip');
    const paint = () => { const m = meter(cat); c.replaceChildren(); if (!Number.isFinite(m.limit)) { c.append(el('b', '', m.name), document.createTextNode(state.owner ? ' · lifetime unlimited' : ' · unlimited')); return; } c.append(el('b', '', `${m.left}/${m.limit}`), document.createTextNode(` ${WHAT[cat]} left today`)); c.title = resetText() + (state.signedIn ? ' Counted on your FYNX account.' : ' Guest previews are counted in this browser; a free account keeps the count on your account.'); if (m.tier !== 'pro') { const u = el('button', '', m.tier === 'plus' ? 'Go unlimited' : 'Upgrade'); u.type = 'button'; u.addEventListener('click', () => paywall({cat, reason: 'upsell'})); c.append(u); } };
    paint(); listeners.add(paint); return c;
  }

  root.FYNXPlan = {ready, refresh, charge, server, closePaywall, meter, paywall, lockedCard, chip, checkout, onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    resetText, get tier() { return state.tier; }, get name() { return nameOf(); }, get owner() { return state.owner; }, get label() { return state.owner ? OWNER_LABEL : NAMES[state.tier]; }, OWNER_LABEL, LIMITS, NAMES, PRICES, PERKS, limitOf};
  // Test hook (scripts/test-fynx-plan-usage.cjs only): inject a fake server and account.
  if (root.__FYNX_PLAN_TEST__) root.FYNXPlan._test = {set(svc, st) { services = svc; state = {...state, ...st}; readyPromise = Promise.resolve(state); }};
})(typeof window !== 'undefined' ? window : globalThis);
