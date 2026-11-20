/* FYNX Terminal plugin: guided tour.
 * Walks a member through every part of the Terminal — the header controls, desks, strips and then each panel on
 * the current layout — one spotlight at a time, with Previous / Next and Skip on every step.
 * It opens by itself once for a new account (created in the last 30 days) the first time they enter the Terminal,
 * and anyone can replay it with the Tour button, the TOUR command, or ?tour=1 in the address. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T) => {
  'use strict';
  const {el, $, PANEL_DESC} = T;
  const NEW_ACCOUNT_DAYS = 30;
  const seenKey = uid => 'fx-term-tour-done:' + uid;

  /* --- what each panel is for ---------------------------------------------------------------------- */
  const DETAIL = {
    mkts: 'Your watchlist with live prices. The tabs switch asset classes; click any row to chart it in the Chart panel.',
    focus: 'A daily chart of the market you are looking at. Click any market anywhere in the Terminal and it appears here; the range tabs change the period.',
    squote: 'Quote, day and 52-week ranges and performance for the market you loaded.',
    story: 'Today in plain words: what moved, why it matters and what is coming up, written from the figures on screen.',
    intel: 'FYNX Intelligence ranks what matters right now — big moves, scheduled events and headlines — so you know where to look first.',
    top: 'The latest headlines from the FYNX newsroom. Click one to read the full story without leaving the Terminal.',
    desks: 'News sorted by desk — FX, macro, stocks, crypto and more. Use the tabs to change desk.',
    snews: 'Headlines about the market you loaded.',
    official: 'Releases straight from central banks and statistics agencies.',
    cb: 'Central bank policy rates, the next decision dates and what markets price for them.',
    curve: 'Government yield curves. Switch between the US, euro area, UK and Japan with the tabs.',
    gov: 'Key government bond yields side by side.',
    rates: 'Policy rates around the world in one list.',
    eco: 'The economic calendar: upcoming releases with their impact, forecast and previous value. Use High to see only market-moving events.',
    earn: 'Upcoming company earnings dates.',
    bias: 'Smart Bias scores each FX pair from −100 to +100 using trend, yield momentum, rate gap and positioning. It summarises public data; it is not a trade signal.',
    edge: 'Edge Radar regimes: whether each market is trending, ranging or volatile right now, with the evidence behind it.',
    pos: 'CFTC futures positioning — how speculators are leaning, and when that crowd is stretched.',
    range: 'How today’s range compares with a normal day for this market.',
    corr: 'How closely FX pairs move together over 30, 60 or 90 days. Use it to avoid doubling the same risk.',
    str: 'Currency strength: USD, EUR, JPY, GBP, AUD, CHF, CAD and NZD measured against each other. Lines above zero are outperforming the basket; switch between today, 1 week and up to 6 months.',
    sess: 'Which trading sessions are open now, and when the next one starts.',
    heat: 'A day-change heat map. Green is up, red is down; brighter means a bigger move.',
    perf: 'Performance bars from one week to one year, so you can compare markets at a glance.',
    movers: 'The biggest gainers and losers in this desk today.',
    xa: 'Cross-asset prices — the dollar, yields, gold, oil and equities that drive everything else.',
    idx: 'Index and sector funds for a quick read on the broad market.',
    vix: 'Risk mood: the VIX, market sentiment and the crypto order book.',
    term: 'The volatility term structure — calm or stressed markets in one chart.',
    fin: 'Company financial statements from SEC filings.',
    opt: 'An options summary for the selected underlying.',
    optlist: 'An options monitor across the most-watched underlyings.',
    chain: 'The full option chain with strikes and expiries.',
    active: 'The most actively traded option contracts.',
    books: 'Live Coinbase top of book for the major coins.',
    tools: 'Your desk: position-size and pip calculators, your journal and session times — everything to plan a trade before you place it.',
    srisk: 'Risk for the market you loaded: volatility, beta, drawdown and value at risk.',
    cmp: 'Compare the market you loaded against benchmarks.',
    aimap: 'AI and big-tech stocks as bubbles: size is market value, colour is today’s move.',
    sectmap: 'US stocks grouped by sector and sized by market value.',
    futmap: 'Every futures complex coloured by its move.',
    newsmap: 'Which market topics dominate the headlines, and which are heating up.',
    cfx: 'Top coins and FX majors, crosses and emerging currencies in one map.',
    scan: 'Screen thousands of markets by your own filters.',
    oflow: 'Live order flow from Kraken\u2019s public crypto order book: a liquidity heatmap of resting orders, trades as buy/sell bubbles, the depth ladder, order book imbalance and volume delta. The full page tests live whether the imbalance predicts the next move.',
    panic: 'Market panic detector: 60-day correlations across 50 large US stocks. When everything starts moving together (high average correlation and a dominant top eigenvalue), diversification is failing. Open it to watch the network clump in sell-offs.',
    mcvar: 'Portfolio risk simulator: 10,000 Monte Carlo futures for a portfolio, Value at Risk and Expected Shortfall, plus a backtest showing how often reality was worse than the model said.',
    vclust: 'Volatility clustering detector: big moves tend to follow big moves. GARCH(1,1) volatility now vs normal across 11 markets; open it for autocorrelation, Ljung\u2013Box tests and a volatility forecast for any symbol.',
    iseas: 'Intraday seasonality map: how volatile each weekday and hour is for a market, from two years of hourly bars. The full page adds the 5-minute U-shape and the Andersen\u2013Bollerslev periodicity filter.',
    factor: 'Factor neutrality check: regresses a portfolio on market, size, value, rates and credit factors to show hidden bets, and suggests hedges to neutralize them.',
    rmom: 'Regime-dependent momentum: 12-1 month winners minus losers, split by bull/bear market and volatility, with today\u2019s momentum crash risk and vol-scaled and regime-aware versions.',
    btest: 'Strategy backtester: write rules in plain English (buy when RSI(2) is below 10 and close is above the 200-day average…) and test them bar by bar on real prices, with next-bar fills, stops, costs and an out-of-sample check.',
    optim: 'Portfolio optimizer: minimum variance, maximum Sharpe, risk parity, hierarchical risk parity and more, compared walk-forward out of sample with costs, plus the efficient frontier.',
    mlpred: 'Predict tomorrow: a random forest, a small neural net and logistic regression trained walk-forward on price, moving averages, RSI and MACD, scored against always guessing up with a binomial test.',
    volml: 'Volatility forecast: GARCH, the HAR model and gradient boosting against the naive recent-volatility forecast, tested walk-forward with Diebold\u2013Mariano tests.',
    regime: 'Market regimes: a Gaussian mixture sorts days by trend and volatility into calm, normal and stressed regimes, with how sticky each one is.',
    pca: 'Hidden factors: principal components of 50 large US stocks compared with the random-matrix noise edge, so you see which factors are real.',
    pairs: 'Pairs trading test: cointegration on every pair, how many chance alone would produce, and whether the survivors still work later.',
    anomaly: 'Anomaly detection: an isolation forest flags the most unusual trading days from returns, gaps, ranges and volume.',
    rltrade: 'Reinforcement learning: a Q-learning agent picks long, short or cash, then trades years it never saw, against buy and hold and random policies.',
    factorloop: 'Factor research loop: like RD-Agent, it proposes factor ideas, tests them, keeps and mutates the winners over several rounds, then tests the final pick once on years it never saw.',
    committee: 'AI investment committee: fundamentals, valuation, technical, news and market analysts score a stock with evidence, bull and bear researchers argue, and the risk team sizes the trade in a memo you can copy.',
    optlab: 'Options pricing lab: fits flat Black\u2013Scholes, the term structure, a smile curve and a neural net to a real option chain, scores each on quotes it never saw and draws the implied-volatility surface in 3-D.',
    earnprev: 'Earnings preview: the next report and consensus, the move options are pricing against the stock\u2019s real past moves, beats and misses, the tone of each press release and an event study of how the stock reacted.',
    kronos: 'Kronos AI forecast: the open-source Kronos foundation model for candlesticks runs on your device and samples many possible futures, shown as a forecast range with a check on past data.',
    fcast: 'K-line pattern forecaster: finds the past candle patterns most like today and shows what happened next as a forecast fan, with an honest out-of-sample track record.',
    globe: 'The live world. Drag to spin and scroll to zoom. The Intelligence layers panel switches on conflict events, protests, cyber threats, earthquakes, disaster alerts, bases, pipelines, ports and more, and its Events tab lists what matters now. Click any marker for its Event intelligence card.',
    cwatch: 'Every country ranked red, yellow or green, with the reason. Click one to fly the globe there.',
    ships: 'Live tankers and cargo ships from AIS, with counts at each chokepoint.',
    cnews: 'Headlines for the countries with events right now.',
    cdata: 'Economies at a glance: GDP, growth, inflation and jobs.'
  };
  const HEADER = [
    ['#fx-command', 'Command bar', 'Type any market (EURUSD, AAPL, gold), a desk (FOREX) or a command such as NEWS, CAL, STR or HELP, then press Enter. Press / from anywhere to jump here.'],
    ['#fx-clocks', 'Market sessions', 'The world’s trading sessions at a glance — which are open now and which open next.'],
    ['#fx-live', 'Live status', 'Shows whether live data is connected. Click it to see every data source and how fresh it is.'],
    ['#fx-deskbar-list', 'Desks: ready-made layouts', 'Each desk is a ready-made layout for a style of trading — ALL, STOCKS, FOREX, BONDS, CRYPTO and more. Pick one and every panel reloads for it.'],
    ['#fx-find-btn', 'Find any market', 'Search markets worldwide. Choose one and every panel reloads for that market.'],
    ['#fx-edit', 'Edit your layout', 'Make the Terminal yours: move, swap, remove or add panels. Your layout is saved for each desk, and Reset to default brings the original back.'],
    ['#fx-build', 'Build your own', 'Create a private tool of your own and add it to your Terminal as a panel.'],
    ['#fx-quotes', 'Quote strip', 'Key markets with live prices and day change. Click any quote to chart it.'],
    ['.fx-news', 'Live headlines', 'Breaking headlines scroll here. Pause stops the ticker; click a headline to read it.']
  ];
  const FOOTER = [
    ['#fx-keys', 'Function keys', 'Shortcuts to full pages: Help, News, Markets, Macro, Intel, Research, Journal, Calculators, Calendar and more.'],
    ['#fx-classic', 'Back to the website', 'Exit returns you to the FYNX website. Your Terminal layout is kept for next time.']
  ];

  function steps() {
    const list = [{title: 'Welcome to FYNX Terminal', body: 'Here is a quick tour of everything on your screen: the controls along the top, then each panel one by one. Use Next to continue, or Skip tour at any time. You can replay it later from the Tour button.'}];
    for (const [sel, title, body] of HEADER) if (visible(document.querySelector(sel))) list.push({sel, title, body});
    for (const sec of document.querySelectorAll('#fx-main > section.tp:not(.tp-empty)')) {
      const kind = sec.id.replace(/^tp-/, ''), code = sec.querySelector('h2 b')?.textContent || '', name = sec.querySelector('h2 span')?.textContent || code;
      const body = kind.startsWith('card-') ? `A market card for ${name}: price, change and a mini chart. Click it for the full page.` : DETAIL[kind] || PANEL_DESC?.[kind] || 'One of your Terminal panels.';
      const hasTabs = sec.querySelector('.tp-tabs button'), hasLink = sec.querySelector('.tp-link');
      list.push({sel: '#' + sec.id, title: `${code ? code + ' · ' : ''}${name}`, body: body + (hasTabs || hasLink ? ' ' + [hasTabs && 'The small tabs change the view', hasLink && '▸ in the corner opens the full page'].filter(Boolean).join('; ') + '.' : '')});
    }
    for (const [sel, title, body] of FOOTER) if (visible(document.querySelector(sel))) list.push({sel, title, body});
    list.push({title: 'You’re all set', body: 'That’s the whole Terminal. Start with a desk that matches how you trade, then press Edit to make it yours. Type HELP for every command, or press Tour to watch this again.'});
    return list;
  }
  function visible(n) { if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden'; }

  /* --- styles ---------------------------------------------------------------------------------------- */
  const st = el('style'); st.id = 'fx-tour-style';
  st.textContent = `
.fx-tour{position:fixed;inset:0;z-index:9000}
.fx-tour-block{position:fixed;inset:0;background:transparent}
.fx-tour-spot{position:fixed;border:2px solid var(--or,#f4a261);border-radius:4px;box-shadow:0 0 0 9999px rgba(2,4,3,.72),0 0 0 5px rgba(244,162,97,.22),0 0 28px rgba(244,162,97,.35);pointer-events:none;transition:left .28s ease,top .28s ease,width .28s ease,height .28s ease}
.fx-tour-spot.center{left:50%!important;top:50%!important;width:0!important;height:0!important;border:0}
.fx-tour-card{position:fixed;width:min(400px,calc(100vw - 24px));box-sizing:border-box;max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow-y:auto;overscroll-behavior:contain;background:#0f1412;color:var(--tx,#e7ece9);border:2px solid var(--or,#f4a261);border-radius:6px;box-shadow:0 24px 60px rgba(0,0,0,.6);font-family:Inter,Arial,sans-serif;transition:left .28s ease,top .28s ease;outline:none}
.fx-tour-head{display:grid;grid-template-columns:34px 1fr;gap:12px;align-items:center;padding:16px 18px 12px;border-bottom:1px solid #222b27}
.fx-tour-ic{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:rgba(244,162,97,.14)}
.fx-tour-ic svg{width:14px;height:14px;fill:none;stroke:var(--or,#f4a261);stroke-width:2;stroke-linejoin:round}
.fx-tour-n{display:block;color:var(--mu,#8e9b94);font-size:12.5px;font-weight:500}
.fx-tour-card h2{margin:2px 0 0;font-size:16px;font-weight:700;line-height:1.3;color:var(--tx,#e7ece9)}
.fx-tour-body{margin:0;padding:14px 18px 16px;font-size:14px;line-height:1.65;color:#d5ddd8}
.fx-tour-foot{display:flex;align-items:center;gap:8px;padding:12px 18px 14px;border-top:1px solid #222b27;position:sticky;bottom:0;background:#0f1412;z-index:1}
.fx-tour-bar{flex:1;min-width:50px;height:3px;border-radius:2px;background:#26302c;overflow:hidden;margin-right:6px}
.fx-tour-bar i{display:block;height:100%;background:var(--or,#f4a261);transition:width .25s ease}
.fx-tour-foot button{min-height:34px;padding:6px 12px;border-radius:4px;font:600 13px Inter,Arial,sans-serif;cursor:pointer;white-space:nowrap}
.fx-tour-skip{background:none;border:0;color:var(--mu,#8e9b94)}
.fx-tour-skip:hover{color:var(--tx,#e7ece9);text-decoration:underline}
.fx-tour-prev{background:none;border:1px solid transparent;color:var(--tx,#e7ece9)}
.fx-tour-prev:hover{border-color:#36423c}
.fx-tour-prev:disabled{opacity:.35;cursor:default;border-color:transparent}
.fx-tour-next{background:transparent;border:1px solid var(--or,#f4a261);color:var(--or,#f4a261)}
.fx-tour-next:hover{background:var(--or,#f4a261);color:#0a0d0c}
.fx-tour :focus-visible{outline:2px solid #ffb000;outline-offset:2px}
.fx-tour-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (prefers-reduced-motion:reduce){.fx-tour-spot,.fx-tour-card,.fx-tour-bar i{transition:none}}
@media (pointer:coarse){.fx-tour-foot button{min-height:44px}}
@media (max-width:480px){.fx-tour-skip{padding-inline:4px!important}.fx-tour-bar{display:none}}`;
  document.head.append(st);

  /* --- the tour --------------------------------------------------------------------------------------- */
  let root = null, list = [], at = 0, uid = null, raf = 0, prevFocus = null;
  const icon = () => { const s = T.svg('svg', {viewBox: '0 0 16 16', 'aria-hidden': 'true'}); s.append(T.svg('path', {d: 'M5 3.5v9l7-4.5z'})); return s; };

  function start() {
    if (root) return;
    if (T.PG?.isOpen?.()) T.PG.closeAll?.();
    list = steps(); at = 0; prevFocus = document.activeElement;
    root = el('div', 'fx-tour');
    const block = el('div', 'fx-tour-block'), spot = el('div', 'fx-tour-spot'), card = el('div', 'fx-tour-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'fx-tour-title'); card.setAttribute('aria-describedby', 'fx-tour-text'); card.tabIndex = -1;
    const head = el('div', 'fx-tour-head'), ic = el('span', 'fx-tour-ic'), txt = el('div'); ic.append(icon());
    const n = el('span', 'fx-tour-n'), h = el('h2'); h.id = 'fx-tour-title'; txt.append(n, h); head.append(ic, txt);
    const body = el('p', 'fx-tour-body'); body.id = 'fx-tour-text';
    const foot = el('div', 'fx-tour-foot'), bar = el('span', 'fx-tour-bar'), fill = el('i'); bar.append(fill);
    const skip = T.btn('Skip tour', 'fx-tour-skip', () => finish()), prev = T.btn('‹ Previous', 'fx-tour-prev', () => go(at - 1)), next = T.btn('Next ›', 'fx-tour-next', () => at === list.length - 1 ? finish() : go(at + 1));
    foot.append(bar, skip, prev, next);
    const live = el('p', 'fx-tour-sr'); live.setAttribute('aria-live', 'polite');
    card.append(head, body, foot, live); root.append(block, spot, card); document.body.append(root);
    root._ = {spot, card, n, h, body, fill, prev, next, live};
    root.addEventListener('keydown', key);
    addEventListener('resize', place); addEventListener('scroll', place, true);
    go(0);
  }
  function key(e) {
    if (e.key === 'Escape') { e.preventDefault(); finish(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); at === list.length - 1 ? finish() : go(at + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
    else if (e.key === 'Tab') {
      const f = [...root._.card.querySelectorAll('button:not(:disabled)')], i = f.indexOf(document.activeElement);
      e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
    }
  }
  function go(i) {
    if (!root || i < 0 || i >= list.length) return;
    at = i; const s = list[i], u = root._;
    u.n.textContent = `Step ${i + 1} of ${list.length}`; u.h.textContent = s.title; u.body.textContent = s.body;
    u.fill.style.width = ((i + 1) / list.length * 100) + '%';
    u.prev.disabled = i === 0; u.next.textContent = i === list.length - 1 ? 'Finish' : 'Next ›';
    u.live.textContent = `Step ${i + 1} of ${list.length}: ${s.title}`;
    const target = s.sel && document.querySelector(s.sel);
    if (target) target.scrollIntoView({block: target.offsetHeight > innerHeight * 0.6 ? 'start' : 'center', inline: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    place(); setTimeout(place, 350);
    u.next.focus({preventScroll: true});
  }
  function place() {
    if (!root) return; cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!root) return;
      const {spot, card} = root._, s = list[at], target = s.sel && document.querySelector(s.sel), vw = innerWidth, vh = innerHeight, m = 12;
      const cw = card.offsetWidth, ch = card.offsetHeight;
      if (!target || !visible(target)) {
        spot.classList.add('center');
        card.style.left = Math.round((vw - cw) / 2) + 'px'; card.style.top = Math.round(Math.max(m, (vh - ch) / 2)) + 'px'; return;
      }
      spot.classList.remove('center');
      const r = target.getBoundingClientRect(), pad = 4;
      const box = {l: Math.max(2, r.left - pad), t: Math.max(2, r.top - pad), r: Math.min(vw - 2, r.right + pad), b: Math.min(vh - 2, r.bottom + pad)};
      Object.assign(spot.style, {left: box.l + 'px', top: box.t + 'px', width: Math.max(0, box.r - box.l) + 'px', height: Math.max(0, box.b - box.t) + 'px'});
      // Below, above, right, left of the target; otherwise inside it near the top.
      const fits = {below: vh - box.b - m >= ch, above: box.t - m >= ch, right: vw - box.r - m >= cw, left: box.l - m >= cw};
      let x, y;
      if (fits.below) { y = box.b + m; x = box.l; }
      else if (fits.above) { y = box.t - m - ch; x = box.l; }
      else if (fits.right) { x = box.r + m; y = box.t; }
      else if (fits.left) { x = box.l - m - cw; y = box.t; }
      else { x = box.l + 16; y = box.t + 16; }
      card.style.left = Math.round(Math.max(m, Math.min(x, vw - cw - m))) + 'px';
      card.style.top = Math.round(Math.max(m, Math.min(y, vh - ch - m))) + 'px';
    });
  }
  function finish() {
    if (!root) return;
    if (uid) { try { localStorage.setItem(seenKey(uid), new Date().toISOString()); } catch (_) {} }
    removeEventListener('resize', place); removeEventListener('scroll', place, true);
    root.remove(); root = null;
    const back = prevFocus && document.contains(prevFocus) ? prevFocus : $('fx-command'); back?.focus?.({preventScroll: true});
  }

  /* --- entry points ------------------------------------------------------------------------------------ */
  // Tour button in the header, next to Edit.
  const edit = $('fx-edit');
  if (edit && !$('fx-tour-btn')) {
    const b = el('button', 'fx-editbtn', 'Tour'); b.type = 'button'; b.id = 'fx-tour-btn'; b.title = 'A guided tour of every part of the Terminal';
    b.addEventListener('click', () => start()); edit.parentNode.insertBefore(b, $('fx-build') || edit);
  }
  // TOUR in the command bar (handled before the Terminal's own command runner).
  document.addEventListener('submit', e => {
    const input = $('fx-command');
    if (e.target?.id === 'fx-cmd-form' && /^\s*tour\s*$/i.test(input?.value || '')) { e.preventDefault(); e.stopImmediatePropagation(); input.value = ''; start(); }
  }, true);
  T.PAGE_NAMES.push('TOUR');
  window.FynxTerminalTour = {start: () => start()};

  // First visit: open once per account, the first time it uses the Terminal in this browser (and for any
  // account created in the last 30 days). Waits for sign-in and the first full render.
  const VISITED = 'fx-term-visited';
  let firstVisit = false; try { firstVisit = !localStorage.getItem(VISITED); } catch (_) {}
  (async () => {
    try {
      const [{auth}, {onAuthStateChanged}] = await Promise.all([import('/auth/firebase.js'), import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')]);
      await auth.authStateReady?.();
      const user = auth.currentUser || await new Promise(resolve => { const off = onAuthStateChanged(auth, u => { if (u) { off?.(); resolve(u); } }); });
      uid = user.uid; try { localStorage.setItem(VISITED, new Date().toISOString()); } catch (_) {}
      const forced = new URLSearchParams(location.search).get('tour') === '1';
      let seen = false; try { seen = !!localStorage.getItem(seenKey(uid)); } catch (_) { seen = !!sessionStorage?.getItem?.(seenKey(uid)); }
      const created = Date.parse(user.metadata?.creationTime || '');
      const isNew = Number.isFinite(created) && Date.now() - created < NEW_ACCOUNT_DAYS * 864e5;
      if (!forced && (seen || !(isNew || firstVisit))) return;
      const ready = () => !document.documentElement.classList.contains('ftg-locked') && !document.documentElement.classList.contains('ftg-checking') && $('fx-main')?.getAttribute('aria-busy') === 'false';
      for (let i = 0; i < 360 && !ready(); i++) await new Promise(r => setTimeout(r, 500));
      if (!ready()) return;
      await new Promise(r => setTimeout(r, 900));
      if (!root && !document.querySelector('.fx-gg,.ftg-gate')) start();
    } catch (e) { T.report?.('tour', e); }
  })();
});
