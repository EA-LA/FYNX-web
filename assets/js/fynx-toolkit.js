/* "From the FYNX Terminal": a page-aware strip of the Terminal's AI and quant tools that fit the page the reader is on,
 * with their plan allowance. Each page picks four tools (body[data-toolkit] overrides the choice). The plan line uses
 * window.FYNXPlan when it is loaded, so signed-in members see what their own plan includes. */
(() => {
  'use strict';
  if (window.__fynxToolkit) return; window.__fynxToolkit = true;
  const TOOLS = {
    kronos: ['KRONOS', 'Kronos AI forecast', 'The real open-source Kronos model forecasts any market with a range of sampled futures, checked on past data.', 'ai'],
    mlpred: ['MLPRED', 'Predict tomorrow with ML', 'A random forest and a neural net against “always up”, tested on days they never saw.', 'ai'],
    volml: ['VOLML', 'Volatility forecast', 'GARCH, HAR and gradient boosting forecast next week’s volatility, scored out of sample.', 'ai'],
    regime: ['REGIME', 'Market regimes', 'A Gaussian mixture shows whether a market is calm, normal or stressed right now, and how long that lasts.', 'ai'],
    pca: ['PCA', 'Hidden factors', 'What really drives 50 large US stocks, separated from random noise.', 'analysis'],
    pairs: ['PAIRS', 'Pairs trading test', 'Cointegration on every pair, with the multiple-testing trap made visible.', 'analysis'],
    anomaly: ['ANOMALY', 'Anomaly detection', 'An isolation forest flags the most unusual trading days and what tended to follow.', 'ai'],
    rltrade: ['RLTRADE', 'Reinforcement-learning trader', 'A Q-learning agent picks long, short or cash, then trades years it never saw.', 'ai'],
    value: ['VALUE', 'Valuation workbench', 'DCF bear/base/bull from SEC filings, the growth the price implies, peers and a buyout check.', 'analysis'],
    committee: ['COMMITTEE', 'AI investment committee', 'Five analysts, a bull/bear debate and a risk team turn any stock into a decision memo.', 'ai'],
    factorloop: ['FACTORLOOP', 'Factor research loop', 'Propose, test and refine factor ideas automatically, then check the winner on unseen years.', 'ai'],
    btest: ['BTEST', 'Plain-English backtester', 'Describe a strategy in words and get a backtest with costs and an honest verdict.', 'backtest'],
    mcvar: ['MCVAR', 'Portfolio risk simulator', 'Monte Carlo value-at-risk and drawdowns for a portfolio you enter.', 'analysis'],
    panic: ['PANIC', 'Market panic detector', 'Correlation, breadth and volatility signals that flag a market under stress.', 'analysis']
  };
  const PAGES = {
    home: ['Your briefing, with the Terminal’s models behind it', ['kronos', 'committee', 'regime', 'mlpred']],
    'macro-desk': ['Take the macro view further', ['regime', 'volml', 'kronos', 'panic']],
    'edge-radar': ['Test an edge before you trade it', ['mlpred', 'regime', 'btest', 'anomaly']],
    'quant-analyst': ['More quant research in the Terminal', ['factorloop', 'rltrade', 'mlpred', 'pairs']],
    'research-desk': ['From filings to a decision', ['value', 'committee', 'pca', 'factorloop']],
    explore: ['The newest tools in the FYNX Terminal', ['kronos', 'committee', 'value', 'factorloop']],
    learn: ['Learn it, then see it work on real data', ['pairs', 'mlpred', 'value', 'factorloop']],
    calendar: ['Before the event, size the risk', ['volml', 'committee', 'regime', 'anomaly']],
    news: ['Turn a headline into analysis', ['committee', 'anomaly', 'kronos', 'regime']],
    calculator: ['Calculators, then the full models', ['value', 'mcvar', 'volml', 'btest']],
    journal: ['Stress-test the way you trade', ['btest', 'mcvar', 'rltrade', 'mlpred']]
  };
  const CAT = {ai: 'AI tool', analysis: 'Analysis', backtest: 'Backtest'};
  const key = () => { const b = document.body?.dataset.toolkit; if (b && PAGES[b]) return b; const p = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, ''); const seg = p.split('/').filter(Boolean); if (!seg.length) return 'home'; if (seg[0] === 'edge-radar') return 'edge-radar'; if (seg[0] === 'tools' && seg[1] === 'research-desk') return 'research-desk'; return seg[0]; };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  function planLine(node) {
    const P = window.FYNXPlan; if (!P?.LIMITS) return;
    const L = P.LIMITS, fmt = v => v === Infinity ? 'unlimited' : String(v);
    const paint = () => {
      const t = P.tier || 'guest';
      if (t === 'pro') node.textContent = 'Included in your Professional plan: every tool, no daily limits.';
      else if (t === 'plus' || t === 'starter') node.textContent = `Included in your ${P.NAMES[t]} plan: ${fmt(L.ai[t])} AI runs and ${fmt(L.analysis[t])} analyses a day. Professional removes every limit.`;
      else node.textContent = `${t === 'guest' ? 'Free with an account' : 'Your free plan'}: ${fmt(L.ai.free)} AI runs and ${fmt(L.analysis.free)} analyses a day. Plus (${P.PRICES.plus}/month): ${fmt(L.ai.plus)} and ${fmt(L.analysis.plus)}. Professional: unlimited.`;
    };
    paint(); P.onChange?.(paint);
    if (typeof P.ready === 'function' && !P.__toolkitReady) { P.__toolkitReady = true; P.ready().then(paint, () => {}); }
  }
  function render() {
    const k = key(), page = PAGES[k]; if (!page || document.querySelector('.fxk')) return;
    const host = document.querySelector('main') || document.body;
    const sec = el('section', 'fxk'); sec.setAttribute('aria-labelledby', 'fxk-h');
    const head = el('div', 'fxk-head'), titles = el('div');
    titles.append(el('p', 'fxk-kicker', 'From the FYNX Terminal · AI and quant tools'), Object.assign(el('h2', '', page[0]), {id: 'fxk-h'}));
    const plans = el('a', 'fxk-plans', 'Compare plans →'); plans.href = '/pro.html#plans';
    head.append(titles, plans);
    const grid = el('div', 'fxk-grid');
    for (const id of page[1]) {
      const t = TOOLS[id]; if (!t) continue;
      const a = el('a', 'fxk-card'); a.href = '/terminal.html#' + id;
      a.append(el('span', 'fxk-code', t[0]), el('b', '', t[1]), el('p', '', t[2]), el('span', 'fxk-meta', `${CAT[t[3]]} · Open in Terminal ▸`));
      grid.append(a);
    }
    const plan = el('p', 'fxk-plan', 'Free with an account, with daily limits. Plus and Professional raise or remove them.');
    sec.append(head, grid, plan); host.append(sec);
    planLine(plan);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, {once: true}); else render();
  window.FynxToolkit = {TOOLS, PAGES, key};
})();
