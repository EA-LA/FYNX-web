/* Welcome / thank-you page. Shows the celebration and tour only after the membership service confirms a paid plan.
   A plan query parameter never decides what is unlocked. Membership status does not confirm a new payment. */
(function () {
  'use strict';
  const P = window.FYNXPlan;
  const $ = id => document.getElementById(id);
  const show = id => { for (const s of ['wlChecking', 'wlPending', 'wlGuest', 'wlWelcome']) $(s).hidden = s !== id; };
  if (!P) { show('wlPending'); return; }
  const TOURS = {
    starter: [
      ['Your Pro workspace', 'Journal intelligence, the position risk planner, scenario comparison, trading process review, CSV export and research watchlists are now open in Pro tools. Save up to 25 workspaces.', 'Open Pro tools', '/pro.html?tool=analytics#workbench', 'PRO TOOLS'],
      ['More room in the Terminal', 'You now get 15 advanced analyses, 12 strategy backtests and 5 AI forecasts a day across the Quant and Strategy labs.', 'Open the QUANT desk', '/terminal.html?desk=quant', 'TERMINAL'],
      ['Plan every trade', 'Size positions from your stop and account risk before you enter, then compare scenarios side by side.', 'Open position risk', '/pro.html?tool=risk#workbench', 'RISK'],
      ['Review your process', 'Your Journal now feeds analytics and process reviews. Record trades, then let the review show what is working.', 'Open the Journal', '/journal.html', 'JOURNAL']
    ],
    plus: [
      ['The QUANT desk', 'Live order flow from the Kraken order book, the 50-stock panic detector, Monte Carlo VaR, volatility clustering, intraday seasonality, factor neutrality and regime momentum, side by side.', 'Open the QUANT desk', '/terminal.html?desk=quant', 'QUANT LAB'],
      ['Write a strategy in plain English', 'Type “buy when RSI(2) is below 10 and close is above the 200-day average”, then test it bar by bar with costs and an out-of-sample check.', 'Open the backtester', '/terminal.html#btest', 'BACKTEST'],
      ['Build a better portfolio', 'Minimum variance, maximum Sharpe, risk parity and hierarchical risk parity, compared walk-forward after costs.', 'Open the optimizer', '/terminal.html#optim', 'STRATEGY LAB'],
      ['Run the Kronos AI model', 'The open-source Kronos foundation model for candlesticks runs on your device and samples many possible futures for any market: a forecast range, checked on past data.', 'Open Kronos', '/terminal.html#kronos', 'AI'],
      ['Stress test your portfolio', 'Your seventh Pro tool shows how separate positions affect the whole account under price shocks.', 'Open stress testing', '/pro.html?tool=portfolio#workbench', 'PRO TOOLS']
    ],
    pro: [
      ['No more limits', 'Every analysis, backtest and AI forecast in the Terminal is unlimited. Run as many ideas as you can think of.', 'Open the STRATEGY desk', '/terminal.html?desk=strategy', 'UNLIMITED'],
      ['The QUANT desk', 'Live order flow, the panic detector, Monte Carlo VaR, volatility, seasonality, factor and momentum labs on one screen.', 'Open the QUANT desk', '/terminal.html?desk=quant', 'QUANT LAB'],
      ['Drawdown simulation', 'Your eighth Pro tool runs 500 simulated paths to show the drawdowns your rules could produce before you commit risk.', 'Open drawdown simulation', '/pro.html?tool=simulation#workbench', 'PRO TOOLS'],
      ['Unlimited Kronos AI forecasts', 'Run the open-source Kronos foundation model on any market as often as you like, including the larger Kronos-small and 32-path forecast ranges.', 'Open Kronos', '/terminal.html#kronos', 'AI'],
      ['Strategy research loop', 'Backtest in plain English, optimise portfolios and check forecasts out of sample, as often as you like.', 'Open the backtester', '/terminal.html#btest', 'BACKTEST'],
      ['Keep everything', 'Save up to 500 workspaces and come back to any analysis from any device you sign in on.', 'Open Pro tools', '/pro.html?tool=analytics#workbench', 'WORKSPACES']
    ]
  };
  const LEADS = {
    starter: 'Your Essential plan is active. Your Pro workspace and a bigger daily allowance in the Terminal are ready right now.',
    plus: 'Your Plus plan is active. Every Terminal lab is open with room to work: 60 analyses, 50 backtests and 25 AI forecasts a day.',
    pro: 'Your Professional plan is active. Everything in FYNX is open, with no daily limits anywhere.'
  };
  let step = 0, steps = [];
  function renderStep() {
    const host = $('wlSteps'); host.replaceChildren();
    const [title, text, cta, href, tag] = steps[step];
    const d = document.createElement('div'); d.className = 'wl-step';
    const num = document.createElement('div'); num.className = 'num'; const nb = document.createElement('b'); nb.textContent = String(step + 1).padStart(2, '0'); num.append(nb, '/' + String(steps.length).padStart(2, '0'));
    const body = document.createElement('div');
    const t = document.createElement('span'); t.className = 'tag'; t.textContent = tag;
    const h = document.createElement('h3'); h.textContent = title;
    const p = document.createElement('p'); p.textContent = text;
    const a = document.createElement('a'); a.className = 'wl-btn'; a.href = href; a.textContent = cta + ' →';
    body.append(t, h, p, a); d.append(num, body); host.append(d);
    $('wlDots').querySelectorAll('button').forEach((b, i) => { b.classList.toggle('on', i === step); b.setAttribute('aria-selected', String(i === step)); b.tabIndex = i === step ? 0 : -1; });
    $('wlPrev').disabled = step === 0;
    $('wlNext').textContent = step === steps.length - 1 ? 'Open your Terminal →' : 'Next →';
  }
  function welcome(tier) {
    show('wlWelcome');
    const name = P.NAMES[tier], m = P.meter('analysis');
    document.title = `Welcome to FYNX ${name}`;
    $('wlKick').textContent = `${name.toUpperCase()} MEMBERSHIP ACTIVE`;
    $('wlTitle').textContent = `Thank you. Welcome to FYNX ${name}.`;
    $('wlLead').textContent = LEADS[tier];
    $('wlPlan').textContent = name; $('wlPrice').textContent = P.PRICES[tier] + ' / month';
    $('wlToday').textContent = Number.isFinite(m.limit) ? `${m.left} of ${m.limit} analyses left` : 'Unlimited';
    const perks = $('wlPerks'); perks.replaceChildren();
    P.PERKS[tier].forEach((x, i) => { const li = document.createElement('li'); li.textContent = x; li.style.animationDelay = (i * 90) + 'ms'; perks.append(li); });
    $('wlStart').href = tier === 'starter' ? '/pro.html?tool=analytics#workbench' : tier === 'pro' ? '/terminal.html?desk=strategy' : '/terminal.html?desk=quant';
    steps = TOURS[tier]; step = 0;
    const dots = $('wlDots'); dots.replaceChildren();
    steps.forEach((_, i) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-label', 'Tour step ' + (i + 1)); b.addEventListener('click', () => { step = i; renderStep(); }); dots.append(b); });
    renderStep();
    try { localStorage.setItem('fynx.welcome.seen', tier); } catch (_) {}
  }
  // Tour step tabs: Left/Right/Home/End move between steps (standard tab-list keys).
  $('wlDots').addEventListener('keydown', e => {
    if (!steps.length) return;
    const to = {ArrowLeft: step - 1, ArrowRight: step + 1, Home: 0, End: steps.length - 1}[e.key];
    if (to === undefined) return;
    e.preventDefault(); step = (to + steps.length) % steps.length; renderStep();
    $('wlDots').querySelectorAll('button')[step].focus();
  });
  $('wlPrev').addEventListener('click', () => { if (step > 0) { step--; renderStep(); } });
  $('wlNext').addEventListener('click', () => { if (step < steps.length - 1) { step++; renderStep(); } else location.href = $('wlStart').href; });
  $('wlTourBtn').addEventListener('click', () => $('wlTour').scrollIntoView({behavior: 'smooth', block: 'start'}));
  async function check() {
    show('wlChecking');
    const s = await P.ready();
    if (!s.signedIn) { show('wlGuest'); return; }
    for (let i = 0; i < 6; i++) {
      const r = await P.refresh();
      if (!r.signedIn) { show('wlGuest'); return; }
      if (r.verified === true && ['starter', 'plus', 'pro'].includes(r.tier)) { welcome(r.tier); return; }
      await new Promise(res => setTimeout(res, 2500));
    }
    show('wlPending');
  }
  $('wlRetry').addEventListener('click', check);
  check();
})();
