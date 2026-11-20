/* FYNX Terminal plugin: membership allowances. Loaded before every other plugin so it can wrap the premium pages as
 * they register. Desk panels stay free (they are previews); opening a premium tool's full page with a new set of
 * inputs uses one of the day's allowances for that category. Same tool + same inputs on the same day is free again.
 * Plan comes from FYNXPlan (server-verified membership). If FYNXPlan is unavailable, nothing is blocked. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const P = window.FYNXPlan;
  if (!P || !PG) return;
  const {el, btn, store} = T;
  // page name -> [category, human name, store keys that hold the tool's inputs]
  const PREMIUM = {
    panic: ['analysis', 'Market panic detector', []], risksim: ['analysis', 'Portfolio risk simulator', ['mcvar']], mcvar: ['analysis', 'Portfolio risk simulator', ['mcvar']],
    orderflow: ['analysis', 'Live order flow', ['oflow-pair']], oflow: ['analysis', 'Live order flow', ['oflow-pair']],
    vclust: ['analysis', 'Volatility clustering detector', ['vclust-sym']], garch: ['analysis', 'Volatility clustering detector', ['vclust-sym']],
    iseas: ['analysis', 'Intraday seasonality map', ['iseas-sym']], seasonality: ['analysis', 'Intraday seasonality map', ['iseas-sym']],
    factor: ['analysis', 'Factor neutrality check', ['factor']], rmom: ['analysis', 'Regime-dependent momentum', ['rmom']], momentum: ['analysis', 'Regime-dependent momentum', ['rmom']],
    optim: ['analysis', 'Portfolio optimizer', ['optim']], optimize: ['analysis', 'Portfolio optimizer', ['optim']],
    btest: ['backtest', 'Strategy backtester', ['btest']], backtest: ['backtest', 'Strategy backtester', ['btest']],
    fcast: ['ai', 'K-line forecaster', ['fcast']], forecast: ['ai', 'K-line forecaster', ['fcast']]
  };
  T.PREMIUM_PAGES = PREMIUM;
  const keyFor = (name, arg, keys) => [PREMIUM[name][1], typeof arg === 'string' ? arg : '', ...keys.map(k => { try { return store.get(k) || ''; } catch (_) { return ''; } })].join('|');
  // Plugins may add premium pages later with T.premium(name, category, label, storeKeys).
  T.premium = (name, cat, label, keys = []) => { PREMIUM[name] = [cat, label, keys]; };
  // T.gate lets a tool charge a specific run itself (e.g. a Run button) instead of on page open.
  T.gate = async (cat, key, host, feature) => {
    const ok = await P.charge(cat, key, {silent: true, feature});
    if (!ok && host) { host.replaceChildren(P.lockedCard({cat, feature})); P.paywall({cat, feature}); }
    return ok;
  };
  const add = PG.add;
  PG.add = (name, label, render) => add(name, label, async (host, arg, alive) => {
    const spec = PREMIUM[name];
    if (!spec) return render(host, arg, alive);
    const [cat, feature, keys] = spec;
    const ok = await P.charge(cat, keyFor(name, arg, keys), {silent: true, feature});
    if (!ok) {
      PG.setHead?.(name.toUpperCase(), feature, `Daily ${P.name} allowance used · upgrade to keep going`);
      host.replaceChildren(P.lockedCard({cat, feature}));
      P.paywall({cat, feature});
      return;
    }
    const out = await render(host, arg, alive);
    nudge(host, cat, feature);
    return out;
  });
  // A slim, dismissible banner when the free allowance is nearly gone: the moment the value is most obvious.
  function nudge(host, cat, feature) {
    const m = P.meter(cat);
    if (!Number.isFinite(m.limit) || m.left > 1 || !['guest', 'free', 'starter'].includes(m.tier) || !host.isConnected) return;
    const bar = el('div', 'fx-plan-nudge');
    bar.append(el('b', '', m.left ? 'Last free analysis today.' : 'That was today\'s last free analysis.'), el('span', '', ` Plus keeps ${feature} and every other lab open with ${P.limitOf(cat, 'plus')} a day.`));
    const go = btn('Unlock Plus', 'fx-plan-nudge-go', () => P.paywall({cat, feature, reason: 'upsell'}));
    const x = btn('×', 'fx-plan-nudge-x', () => bar.remove()); x.setAttribute('aria-label', 'Dismiss');
    bar.append(go, x); host.prepend(bar);
  }

  /* header: plan badge + today's allowance */
  const header = document.getElementById('fx-build')?.parentElement;
  if (header && !document.getElementById('fx-plan')) {
    const b = btn('', 'fx-editbtn fx-planbtn', () => P.paywall({cat: 'analysis', reason: 'upsell'}));
    b.id = 'fx-plan'; b.title = 'Your FYNX plan and today\'s allowance';
    const paint = () => {
      const m = P.meter('analysis');
      b.replaceChildren(el('b', '', P.name.toUpperCase()), el('span', '', Number.isFinite(m.limit) ? ` ${m.left}/${m.limit}` : ' ∞'));
      b.classList.toggle('low', Number.isFinite(m.limit) && m.left <= 1);
      b.setAttribute('aria-label', `${P.name} plan. ${Number.isFinite(m.limit) ? m.left + ' of ' + m.limit + ' advanced analyses left today' : 'Unlimited analyses'}. Open plans.`);
    };
    paint(); P.onChange(paint); P.ready().then(paint);
    header.insertBefore(b, document.getElementById('fx-build'));
    const st = document.createElement('style');
    st.textContent = `.fx-planbtn{display:inline-flex;align-items:center;gap:4px;border-color:#5a4410!important}.fx-planbtn b{color:#ffb000;font-weight:800;letter-spacing:.06em}.fx-planbtn span{color:var(--mu,#8e9b94);font-variant-numeric:tabular-nums}.fx-planbtn.low span{color:#ff5a4f}.fx-plan-nudge{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px;padding:8px 12px;border:1px solid #5a4410;border-left:3px solid #ffb000;background:#151005;color:#e8ecea;font-size:12.5px}.fx-plan-nudge b{color:#ffb000}.fx-plan-nudge span{flex:1 1 260px;color:#c9d2cd}.fx-plan-nudge-go{background:#ffb000!important;color:#000!important;border:0!important;font-weight:800!important;padding:4px 10px!important}.fx-plan-nudge-x{background:none!important;border:0!important;color:#8e9b94!important;font-size:16px!important}
@media (pointer:coarse){.fx-plan-nudge-x{min-width:44px;min-height:44px}.fx-plan-nudge-go{min-height:44px}}`;
    document.head.append(st);
  }
  P.ready();
});
