/* FYNX Terminal plugin: AI LAB. Seven machine-learning tools on real Yahoo Finance data, computed in the browser, each
 * judged out of sample against a simple baseline, because most ML "edges" in markets disappear there.
 *
 * MLPRED   Predict tomorrow: logistic regression, a random forest and a small neural net on OHLCV, moving averages,
 *          RSI and MACD, walk-forward, against "always up" with an exact binomial test.
 * VOLML    Volatility forecast: GARCH(1,1), the HAR model and gradient-boosted trees against the naive 22-day volatility,
 *          walk-forward, with Diebold–Mariano tests.
 * REGIME   Market regimes from a Gaussian mixture on trend and volatility, with transitions and an out-of-sample check.
 * PCA      Hidden factors in 50 large US stocks: eigenvalues against the Marchenko–Pastur noise edge, loadings by sector.
 * PAIRS    Pairs trading: Engle–Granger on every pair with simulated p-values, the multiple-testing count (how many
 *          "cointegrated" pairs chance alone produces) and whether the survivors still work out of sample.
 * ANOMALY  Unusual days found by an isolation forest (returns, gaps, ranges, volume) and what followed them.
 * RLTRADE  Reinforcement learning: tabular Q-learning chooses long, short or cash; tested out of sample against buy and
 *          hold and against random policies.
 * The maths lives in mllab-core.js (tested in scripts/test-mllab-core.cjs). Nothing here is advice. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {el, btn, svg, $, panel, setText, store, empty, finite, report} = T;
  const QL = T.QuantLab, QR = T.QuantResearch, ML = window.FynxMLCore;
  if (!QL || !QR || !ML) return;
  const {loadCloses, alignedReturns, kpis, UNIVERSE, SECTOR_OF} = QL;
  const {loadBars, garch, ols} = QR;
  const {frame, label, lineChart, heatmap, card, chartBox, note, chips, symbolBox} = QR.ui;
  const {mean, sd} = ML;
  const SYM_RE = /^[A-Z0-9.\-=^&]{1,24}$/;
  const pct = (v, d = 1) => finite(v) ? (v * 100).toFixed(d) + '%' : '—';
  const spct = (v, d = 1) => finite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + '%' : '—';
  const num = (v, d = 2) => finite(v) ? (v < 0 ? '−' : '') + Math.abs(v).toFixed(d) : '—';
  const pv = p => !finite(p) ? '—' : p < 0.001 ? '< 0.001' : p.toFixed(3);
  const GREEN = '#3ecf8e', RED = '#ff5a4f', AMBER = '#ffb000', BLUE = '#5b8def', GREY = '#7d8a83';
  const tick = () => new Promise(r => setTimeout(r, 0));
  const MAJORS = [['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['IWM', 'Russell 2000'], ['NVDA', 'Nvidia'], ['AAPL', 'Apple'], ['BTC-USD', 'Bitcoin'], ['EURUSD=X', 'EUR/USD'], ['GC=F', 'Gold']];

  const st = el('style'); st.id = 'fx-mllab-style';
  st.textContent = `
.fx-ml-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
.fx-ml-tbl{width:100%;border-collapse:collapse;font:500 11.5px 'IBM Plex Mono',monospace}
.fx-ml-tbl th{text-align:right;color:var(--mu);font-weight:600;padding:4px 6px;border-bottom:1px solid var(--ln);white-space:nowrap}
.fx-ml-tbl td{text-align:right;padding:3px 6px;border-bottom:1px solid #141b19;white-space:nowrap}
.fx-ml-tbl th:first-child,.fx-ml-tbl td:first-child{text-align:left}
.fx-ml-scroll{max-height:320px;overflow:auto}
.fx-ml-sw{display:inline-block;width:9px;height:9px;margin-right:6px;border-radius:2px;vertical-align:-1px}
.fx-ml-legend{display:flex;flex-wrap:wrap;gap:10px;font:600 11px 'IBM Plex Mono',monospace;color:#c9d2cd}
.fx-ml-in{background:#0d1312;border:1px solid #26302c;color:var(--tx);font:12px 'IBM Plex Mono',monospace;padding:5px 8px;min-height:30px;width:100%;box-sizing:border-box}
@media (max-width:900px){.fx-ml-grid{grid-template-columns:1fr}}`;
  document.head.append(st);

  /* ------------------------------------------------ helpers ------------------------------------------------ */
  const loadState = (key, defaults, check) => { let s = {}; try { s = JSON.parse(store.get(key) || '{}') || {}; } catch (_) {} const out = {...defaults}; for (const k of Object.keys(defaults)) if (s[k] !== undefined && check(k, s[k])) out[k] = s[k]; return out; };
  const saver = (key, S) => () => store.set(key, JSON.stringify(S));
  const memo = new Map();
  const cached = (key, fn) => { if (!memo.has(key)) memo.set(key, fn().catch(e => { memo.delete(key); throw e; })); return memo.get(key); };
  function returns(c) { const r = new Float64Array(c.length); for (let i = 1; i < c.length; i++) r[i] = Math.log(c[i] / c[i - 1]); return r; }
  function smaA(a, n) { const o = new Float64Array(a.length).fill(NaN); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
  function emaA(a, n) { const o = new Float64Array(a.length), k = 2 / (n + 1); o[0] = a[0]; for (let i = 1; i < a.length; i++) o[i] = k * a[i] + (1 - k) * o[i - 1]; return o; }
  function rsiA(c, n = 14) { const o = new Float64Array(c.length).fill(50); let g = 0, l = 0; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up / n; l += dn / n; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; } if (i >= n) o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return o; }
  function rollSd(r, n) { const o = new Float64Array(r.length).fill(NaN); let s = 0, q = 0; for (let i = 0; i < r.length; i++) { s += r[i]; q += r[i] * r[i]; if (i >= n) { s -= r[i - n]; q -= r[i - n] * r[i - n]; } if (i >= n) o[i] = Math.sqrt(Math.max(0, q / n - (s / n) ** 2)); } return o; }
  function rollRms(r, n) { const o = new Float64Array(r.length).fill(NaN); let q = 0; for (let i = 0; i < r.length; i++) { q += r[i] * r[i]; if (i >= n) q -= r[i - n] * r[i - n]; if (i >= n) o[i] = Math.sqrt(Math.max(0, q / n)); } return o; }
  function bars(box, {labels, values, colors, fmt = v => v.toFixed(2), aria = 'Bar chart', hline = null, hlabel = ''}) {
    const {w, h, s} = frame(box, aria), padL = 44, padR = 8, padT = 10, padB = 30, iw = w - padL - padR, ih = h - padT - padB, n = values.length;
    let hi = Math.max(0, ...values.filter(finite), hline ?? -Infinity), lo = Math.min(0, ...values.filter(finite)); if (hi === lo) hi = lo + 1; const pad = (hi - lo) * 0.08; hi += pad; if (lo < 0) lo -= pad;
    const Y = v => padT + (hi - v) / (hi - lo) * ih, bw = iw / n;
    for (const v of [lo, (lo + hi) / 2, hi]) { s.append(svg('line', {x1: padL, x2: w - padR, y1: Y(v), y2: Y(v), stroke: '#1b2421'})); label(s, padL - 4, Y(v) + 3, fmt(v), {'text-anchor': 'end'}); }
    values.forEach((v, i) => { if (!finite(v)) return; const x = padL + i * bw; const r = svg('rect', {x: x + bw * 0.15, y: Math.min(Y(v), Y(0)), width: bw * 0.7, height: Math.max(1, Math.abs(Y(v) - Y(0))), fill: colors?.[i] || BLUE, 'fill-opacity': 0.85}); const t = svg('title'); t.textContent = `${labels[i]}: ${fmt(v)}`; r.append(t); s.append(r); if (bw > 26) label(s, x + bw / 2, h - 16, String(labels[i]).slice(0, Math.floor(bw / 6)), {'text-anchor': 'middle'}); });
    if (finite(hline)) { s.append(svg('line', {x1: padL, x2: w - padR, y1: Y(hline), y2: Y(hline), stroke: AMBER, 'stroke-dasharray': '4 3'})); if (hlabel) label(s, w - padR, Y(hline) - 4, hlabel, {'text-anchor': 'end', fill: AMBER}); }
    box.replaceChildren(s);
  }
  function table(head, rows, colorFn) { const t = el('table', 'fx-ml-tbl'), hr = el('tr'); head.forEach(x => hr.append(el('th', '', x))); t.append(hr); rows.forEach((r, i) => { const tr = el('tr'); r.forEach((x, j) => { const td = el('td', '', x); const c = colorFn?.(i, j); if (c) td.style.color = c; tr.append(td); }); t.append(tr); }); const w = el('div', 'fx-ml-scroll'); w.append(t); return w; }
  function verdict(text, good) { const v = el('div', 'fx-ql-verdict'); v.style.borderColor = good === true ? GREEN : good === false ? RED : AMBER; v.textContent = text; return v; }
  function headline(out, state, color, sub) { const hd = el('div', 'fx-ql-head'), s0 = el('span', 'fx-ql-state', state); s0.style.color = color; hd.append(s0, el('span', 'fx-ql-sub', sub)); out.append(hd); }
  function sel(lab, val, list, on) { const l = el('label', '', lab), s = el('select'); for (const [v, t] of list) { const o = el('option', '', t); o.value = v; if (String(v) === String(val)) o.selected = true; s.append(o); } s.addEventListener('change', () => on(s.value)); l.append(s); return l; }
  // Page scaffold: header, inputs card, output column. Returns {wrap, ic, out, rerun}.
  function shell(host, code, title, sub) {
    PG.setHead(code, title, sub);
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap);
    const ic = el('div', 'fx-ql-card'); ic.append(el('h3', '', 'INPUTS')); wrap.append(ic);
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(out);
    return {wrap, ic, out, rerun: () => { if (wrap.isConnected) PG.rerender(); }};
  }
  function symbolInputs(ic, S, save, rerun, extra = []) {
    ic.append(symbolBox(S.sym, s => { S.sym = s; save(); rerun(); }, 'Any symbol: SPY, NVDA, BTC-USD, EURUSD=X, GC=F'));
    ic.append(chips(MAJORS, S.sym, s => { S.sym = s; save(); rerun(); }));
    if (extra.length) { const row = el('div', 'fx-ql-row'); row.style.marginTop = '8px'; row.append(...extra); ic.append(row); }
  }
  async function dailyBars(sym, min = 900) { const B = await loadBars(sym, '1d'); if (!B?.c || B.c.length < min) throw new Error(`Not enough daily history for ${sym} (need about ${Math.ceil(min / 252)} years).`); return B; }
  const failBox = (out, e) => out.replaceChildren(el('div', 'fx-sl-err', e.message || 'Data unavailable right now.'));

  /* ========================================= MLPRED: predict tomorrow ========================================= */
  const PV = loadState('mlpred', {sym: 'SPY', step: 126}, (k, v) => k === 'sym' ? SYM_RE.test(v) : [63, 126, 252].includes(v));
  const saveP = saver('mlpred', PV);
  const FEAT_SHORT = ['1d ret', '5d ret', '20d ret', 'vs MA10', 'vs MA50', 'vs MA200', 'RSI', 'MACD', 'Vol 20d', 'Vol ratio', 'Range', 'Volume'];
  const FEAT = ['Return today', '5-day return', '20-day return', 'Price vs 10-day MA', 'Price vs 50-day MA', 'Price vs 200-day MA', 'RSI(14)', 'MACD histogram', '20-day volatility', 'Vol 5d / 20d', 'Day range', 'Volume surprise'];
  function dirFeatures(B) {
    const c = B.c, N = c.length, r = returns(c), s10 = smaA(c, 10), s50 = smaA(c, 50), s200 = smaA(c, 200), rsi = rsiA(c), e12 = emaA(c, 12), e26 = emaA(c, 26), macd = e12.map((v, i) => v - e26[i]), sig = emaA(macd, 9);
    const v20 = rollSd(r, 20), v5 = rollSd(r, 5), lv = B.v.map(v => Math.log(1 + (v || 0))), lv20 = smaA(lv, 20), hasVol = B.v.some(v => v > 0);
    const row = i => [r[i], Math.log(c[i] / c[i - 5]), Math.log(c[i] / c[i - 20]), Math.log(c[i] / s10[i]), Math.log(c[i] / s50[i]), Math.log(c[i] / s200[i]), (rsi[i] - 50) / 50, (macd[i] - sig[i]) / c[i] * 100, v20[i] * Math.sqrt(252), Math.log((v5[i] + 1e-6) / (v20[i] + 1e-6)), Math.log(B.h[i] / B.l[i]), hasVol ? lv[i] - lv20[i] : 0];
    const X = [], y = [], nxt = [], idx = [];
    for (let i = 201; i < N - 1; i++) { const f = row(i); if (!f.every(finite)) continue; X.push(f); y.push(r[i + 1] > 0 ? 1 : 0); nxt.push(r[i + 1]); idx.push(i); }
    return {X, y, nxt, idx, last: row(N - 1), r};
  }
  const MODELS = [
    ['Logistic regression', '#5b8def', (X, y) => ML.logisticFit(X, y, 5)],
    ['Random forest', '#3ecf8e', (X, y) => ML.forestFit(X, y, {trees: 40, depth: 4, minLeaf: 30, seed: 7})],
    ['Neural net', '#c084fc', (X, y) => ML.mlpFit(X, y, {hidden: 12, epochs: 25, lr: 0.005, l2: 3e-3, seed: 7})]
  ];
  async function mlpredRun(sym, step) {
    const B = await dailyBars(sym, 1300), F = dirFeatures(B), n = F.X.length, start = Math.max(750, Math.floor(n * 0.4));
    const probs = MODELS.map(() => new Float64Array(n).fill(NaN));
    for (let t0 = start; t0 < n; t0 += step) {
      const z = ML.standardizer(F.X.slice(0, t0)), Xtr = F.X.slice(0, t0).map(z), ytr = F.y.slice(0, t0);
      for (let m = 0; m < MODELS.length; m++) { const fit = MODELS[m][2](Xtr, ytr); for (let i = t0; i < Math.min(n, t0 + step); i++) probs[m][i] = fit.predict(z(F.X[i])); await tick(); }
    }
    const test = Array.from({length: n - start}, (_, k) => start + k), ups = test.filter(i => F.y[i]).length, base = ups / test.length;
    const costBp = 2;
    const evalModel = p => {
      const hits = test.filter(i => (p[i] > 0.5 ? 1 : 0) === F.y[i]).length, acc = hits / test.length;
      let prev = 0; const strat = test.map(i => { const pos = p[i] > 0.5 ? 1 : 0, rr = pos * F.nxt[i] - Math.abs(pos - prev) * costBp / 1e4; prev = pos; return rr; });
      const longShare = test.filter(i => p[i] > 0.5).length / test.length;
      return {hits, acc, p: ML.binomTail(hits, test.length, Math.max(base, 1 - base)), strat, sharpe: ML.sharpe(strat), longShare};
    };
    const res = MODELS.map((m, k) => ({name: m[0], color: m[1], ...evalModel(probs[k])}));
    const bh = test.map(i => F.nxt[i]);
    // tomorrow: refit on everything
    const z = ML.standardizer(F.X), Xall = F.X.map(z), now = MODELS.map(m => m[2](Xall, F.y).predict(z(F.last)));
    const forest = ML.forestFit(Xall, F.y, {trees: 60, depth: 4, minLeaf: 30, seed: 9});
    return {B, F, n, start, test, base, ups, res, bh, bhSharpe: ML.sharpe(bh), now, imp: forest.importance, step};
  }
  const mlpredGet = () => cached(['mlpred', PV.sym, PV.step].join('|'), () => mlpredRun(PV.sym, PV.step));
  async function renderMlpredPanel() {
    const host = panel('mlpred'); empty(host, `Training models on ${PV.sym}…`);
    let r; try { r = await mlpredGet(); } catch (e) { report('mlpred', e); return empty(host, e.message); }
    if (!$('tp-mlpred')) return; host.replaceChildren(); setText('n-mlpred', `${PV.sym} · tomorrow`);
    const w = el('div', 'fx-ql'); host.append(w); const best = [...r.res].sort((a, b) => b.acc - a.acc)[0], avg = mean(r.now);
    kpis(w, [['P(UP TOMORROW)', pct(avg, 0), '3-model average', avg > 0.55 ? GREEN : avg < 0.45 ? RED : AMBER], ['BEST OOS ACCURACY', pct(best.acc), best.name], ['ALWAYS-UP', pct(Math.max(r.base, 1 - r.base)), best.p < 0.05 ? 'beaten (p < 0.05)' : 'not beaten', best.p < 0.05 ? GREEN : GREY]]);
    const cb = el('div', 'fx-ql-chart'); w.append(cb);
    requestAnimationFrame(() => lineChart(cb, {series: [{v: cum(r.bh), color: GREY, width: 1.2, name: 'Buy & hold'}, ...r.res.map(m => ({v: cum(m.strat), color: m.color, width: 1.4, name: m.name.split(' ')[0]}))], xs: r.test.map(i => r.B.day[r.F.idx[i]]), log: true, yfmt: v => v.toFixed(2) + '×', aria: 'Out-of-sample growth of model strategies'}));
  }
  const cum = rs => { let e = 1; return rs.map(x => (e *= Math.exp(x))); };
  async function renderMlpred(host, arg) {
    if (arg && SYM_RE.test(String(arg).toUpperCase())) { PV.sym = String(arg).toUpperCase(); saveP(); }
    const {ic, out, rerun} = shell(host, 'MLPRED', 'Predict tomorrow with machine learning', 'Logistic regression, a random forest and a neural net, trained walk-forward and tested against always guessing “up”');
    symbolInputs(ic, PV, saveP, rerun, [sel('Retrain every', PV.step, [[63, '63 days'], [126, '126 days'], [252, '252 days']], v => { PV.step = +v; saveP(); rerun(); })]);
    out.append(note(`Building 12 features for every day of ${PV.sym} and training 3 models walk-forward…`));
    let r; try { r = await mlpredGet(); } catch (e) { report('mlpred', e); return failBox(out, e); }
    if (!out.isConnected) return; out.replaceChildren();
    const best = [...r.res].sort((a, b) => b.acc - a.acc)[0], edge = best.p < 0.05, avg = mean(r.now), aU = Math.max(r.base, 1 - r.base);
    headline(out, avg > 0.55 ? 'MODELS LEAN UP' : avg < 0.45 ? 'MODELS LEAN DOWN' : 'NO CLEAR CALL', avg > 0.55 ? GREEN : avg < 0.45 ? RED : AMBER, `${r.B.name || PV.sym}: the three models give ${r.now.map(v => pct(v, 0)).join(', ')} for an up day tomorrow. Out of sample, on ${r.test.length.toLocaleString('en-US')} days, ${edge ? `${best.name} beat always guessing ${r.base >= 0.5 ? 'up' : 'down'}` : `none beat always guessing ${r.base >= 0.5 ? 'up' : 'down'}, so read this lean as weak`}.`);
    kpis(out, [['P(UP TOMORROW)', pct(avg, 0), 'average of 3 models', avg > 0.55 ? GREEN : avg < 0.45 ? RED : AMBER], ...r.res.map(m => [m.name.toUpperCase(), pct(m.acc, 1), `${m.hits}/${r.test.length} · p ${pv(m.p)}`, m.p < 0.05 ? GREEN : GREY]), ['ALWAYS GUESS ' + (r.base >= 0.5 ? 'UP' : 'DOWN'), pct(aU, 1), 'the baseline to beat', BLUE]]);
    out.append(verdict(edge ? `${best.name} called the next day right ${pct(best.acc, 1)} of the time out of sample, more than always guessing ${r.base >= 0.5 ? 'up' : 'down'} (${pct(aU, 1)}), and an exact binomial test gives p = ${pv(best.p)}. With three models tried, treat anything near 0.05 as luck; even a real edge this small is easily eaten by costs.` : `Honest result: none of the models beat always guessing ${r.base >= 0.5 ? 'up' : 'down'} (${pct(aU, 1)} right) by a statistically meaningful margin; the best, ${best.name}, managed ${pct(best.acc, 1)} (p = ${pv(best.p)}). Daily direction is close to a coin flip with a slight upward tilt, which is exactly what this shows.`, edge));
    const two = el('div', 'fx-ml-grid'), eq = chartBox(280), imp = chartBox(280); out.append(two);
    two.append(card('OUT-OF-SAMPLE GROWTH OF $1 · LONG WHEN THE MODEL SAYS UP, ELSE CASH (2 BP PER SWITCH)', eq, note(`Buy & hold Sharpe ${num(r.bhSharpe)} · ${r.res.map(m => `${m.name.split(' ')[0]} ${num(m.sharpe)} (long ${pct(m.longShare, 0)} of days)`).join(' · ')}`)),
      card('WHAT THE RANDOM FOREST LISTENS TO (SHARE OF SPLITS)', imp, note('Features used most often in the forest’s splits. Useful for intuition, not proof of causality.')));
    const rows = r.res.map(m => [m.name, pct(m.acc, 1), `${m.hits} / ${r.test.length}`, pv(m.p), num(m.sharpe), pct(m.longShare, 0)]);
    rows.push([`Always ${r.base >= 0.5 ? 'up' : 'down'}`, pct(aU, 1), `${Math.round(aU * r.test.length)} / ${r.test.length}`, '—', num(r.bhSharpe), '100%']);
    out.append(card('SCORECARD (WALK-FORWARD, NEVER TRAINED ON THE DAYS IT PREDICTS)', table(['Model', 'Accuracy', 'Right', 'Binomial p', 'Sharpe', 'Long'], rows, (i, j) => j === 3 && i < 3 ? (r.res[i].p < 0.05 ? GREEN : GREY) : null)));
    out.append(card('HOW IT WORKS', ...[`Every trading day becomes 12 numbers: ${FEAT.join(', ').toLowerCase()}. The label is whether the next day closed higher.`, `Walk-forward: the models train on everything up to a date, predict the next ${r.step} days, then retrain with those days added. The first ${r.start.toLocaleString('en-US')} days are training only. Features are standardised with training statistics only.`, 'Logistic regression is linear; the random forest (40 trees, depth 4) and the neural net (12 tanh units, Adam) can find non-linear patterns, which also makes them easier to overfit.', 'The binomial test asks how likely this many right calls would be if the model were no better than always guessing the more common outcome. Delayed Yahoo Finance data. Not advice.'].map(note)));
    requestAnimationFrame(() => {
      lineChart(eq, {series: [{v: cum(r.bh), color: GREY, width: 1.2, name: 'Buy & hold'}, ...r.res.map(m => ({v: cum(m.strat), color: m.color, width: 1.5, name: m.name}))], xs: r.test.map(i => r.B.day[r.F.idx[i]]), log: true, yfmt: v => v.toFixed(2) + '×', aria: 'Out-of-sample growth'});
      const ord = r.imp.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
      bars(imp, {labels: ord.map(x => FEAT_SHORT[x[1]]), values: ord.map(x => x[0]), colors: ord.map(() => GREEN), fmt: v => pct(v, 0), aria: 'Random forest feature importance'});
    });
  }

  /* ======================================== VOLML: volatility forecast ======================================== */
  const VV = loadState('volml', {sym: 'SPY', H: 5}, (k, v) => k === 'sym' ? SYM_RE.test(v) : [5, 10, 22].includes(v));
  const saveV = saver('volml', VV);
  async function volmlRun(sym, H) {
    const B = await dailyBars(sym, 1300), r = returns(B.c), N = r.length, ann = Math.sqrt(252), eps = 1e-4;
    const rv = n => rollRms(r, n), rv5 = rv(5), rv22 = rv(22), rv66 = rv(66), park = B.h.map((h, i) => Math.log(h / B.l[i]) / (2 * Math.sqrt(Math.log(2)))), park5 = smaA(park, 5);
    const L = v => Math.log(v * ann + eps), X = [], Xh = [], y = [], naive = [], idx = [];
    for (let i = 70; i < N - H; i++) {
      let q = 0; for (let k = 1; k <= H; k++) q += r[i + k] ** 2; const target = Math.log(Math.sqrt(q / H) * ann + eps);
      const f = [L(park[i]), L(rv5[i]), L(rv22[i]), L(rv66[i]), L(park5[i]), Math.log(B.c[i] / B.c[i - 5]), Math.log(B.c[i] / B.c[i - 22])];
      if (!f.every(finite) || !finite(target)) continue; X.push(f); Xh.push(f.slice(0, 3)); y.push(target); naive.push(f[2]); idx.push(i);
    }
    const n = y.length, start = Math.max(750, Math.floor(n * 0.4)), step = 252, P = {naive: new Float64Array(n).fill(NaN), garch: new Float64Array(n).fill(NaN), har: new Float64Array(n).fill(NaN), gbm: new Float64Array(n).fill(NaN)};
    // A model of log volatility forecasts its median. Variance is what QLIKE and risk need, so shift each forecast by
    // the mean error plus the error variance measured on the training years (Jensen's inequality for a log-normal).
    const GBP = {rounds: 60, depth: 3, lr: 0.06, minLeaf: 50, seed: 3};
    const biasOf = (Y, Xs, f, upto) => { const e = []; for (let k = Math.max(0, upto - 750); k < upto; k++) e.push(Y[k] - f(Xs[k])); return e.length > 30 ? mean(e) + sd(e) ** 2 : 0; };
    const garchPath = (fit, upto) => { const x = Array.from(r, v => (v - fit.mean) * 100), w = fit.omega, a = fit.alpha, b = fit.beta, pers = a + b, s2 = w / (1 - pers), h = new Float64Array(upto + 2); h[1] = fit.s2; for (let t = 1; t <= upto; t++) h[t + 1] = w + a * x[t] ** 2 + b * h[t]; return {h, s2, pers}; };
    const garchFc = (G, i) => { let s = 0; for (let k = 1; k <= H; k++) s += G.s2 + Math.pow(G.pers, k - 1) * (G.h[i + 1] - G.s2); return Math.log(Math.sqrt(Math.max(1e-12, s / H)) / 100 * ann + eps); };
    let lastFit = null;
    for (let t0 = start; t0 < n; t0 += step) {
      const end = Math.min(n, t0 + step), iTrain = idx[t0 - 1] - H; // only returns known at the time
      const fit = garch(Array.from(r.slice(1, iTrain + 1))); lastFit = fit;
      const G = garchPath({...fit, mean: fit.mean}, N - 1);
      const har = ols(y.slice(0, t0 - H), [0, 1, 2].map(j => Xh.slice(0, t0 - H).map(row => row[j])), 0);
      const gb = ML.gbmFit(X.slice(0, t0 - H), y.slice(0, t0 - H), GBP);
      // boosting fits its training data closely, so its bias is measured on the last training year held out
      const hold = t0 - H - 252, gbv = ML.gbmFit(X.slice(0, hold), y.slice(0, hold), GBP), eV = []; for (let k = hold; k < t0 - H; k++) eV.push(y[k] - gbv.predict(X[k]));
      const harF = row => har.beta[0] + har.beta[1] * row[0] + har.beta[2] * row[1] + har.beta[3] * row[2];
      const bH = har ? biasOf(y, Xh, harF, t0 - H) : 0, bG = mean(eV) + sd(eV) ** 2, bN = biasOf(y, naive.map(v => [v]), row => row[0], t0 - H);
      for (let k = t0; k < end; k++) { P.garch[k] = garchFc(G, idx[k]); P.har[k] = har ? harF(Xh[k]) + bH : naive[k] + bN; P.gbm[k] = gb.predict(X[k]) + bG; P.naive[k] = naive[k] + bN; }
      await tick();
    }
    const test = Array.from({length: n - start}, (_, k) => start + k);
    const metrics = f => { const e = test.map(k => f(k) - y[k]), ql = test.map(k => { const ratio = Math.exp(2 * (y[k] - f(k))); return ratio - Math.log(ratio) - 1; }); return {rmse: Math.sqrt(mean(e.map(v => v * v))), qlike: mean(ql), sq: e.map(v => v * v)}; };
    const M = {naive: metrics(k => P.naive[k]), garch: metrics(k => P.garch[k]), har: metrics(k => P.har[k]), gbm: metrics(k => P.gbm[k])};
    const dm = (a, b) => { const d = M[a].sq.map((v, i) => v - M[b].sq[i]), o = ols(d, [], H); return o ? {t: o.t[0], p: 2 * (1 - ML.ncdf(Math.abs(o.t[0])))} : {t: NaN, p: NaN}; };
    // forecasts for the next H days, fitted on everything
    const fitAll = garch(Array.from(r.slice(1))), Gall = garchPath(fitAll, N - 1), lastRow = [L(park[N - 1]), L(rv5[N - 1]), L(rv22[N - 1]), L(rv66[N - 1]), L(park5[N - 1]), Math.log(B.c[N - 1] / B.c[N - 6]), Math.log(B.c[N - 1] / B.c[N - 23])];
    const harAll = ols(y, [0, 1, 2].map(j => Xh.map(row => row[j])), 0), gbAll = ML.gbmFit(X, y, GBP), gbHold = ML.gbmFit(X.slice(0, n - 252), y.slice(0, n - 252), GBP), eAll = y.slice(n - 252).map((v, k) => v - gbHold.predict(X[n - 252 + k])), harF = row => harAll.beta[0] + harAll.beta[1] * row[0] + harAll.beta[2] * row[1] + harAll.beta[3] * row[2];
    const now = {naive: Math.exp(lastRow[2] + biasOf(y, naive.map(v => [v]), row => row[0], n)), garch: Math.exp(garchFc(Gall, N - 1)), har: Math.exp(harAll ? harF(lastRow) + biasOf(y, Xh, harF, n) : lastRow[2]), gbm: Math.exp(gbAll.predict(lastRow) + mean(eAll) + sd(eAll) ** 2)};
    return {B, H, n, start, test, y, naive, P, M, dm: {gbmNaive: dm('gbm', 'naive'), gbmHar: dm('gbm', 'har'), garchNaive: dm('garch', 'naive')}, now, idx, garchFit: lastFit, longRun: Math.sqrt(fitAll.omega / (1 - fitAll.alpha - fitAll.beta)) / 100 * ann};
  }
  const volmlGet = () => cached(['volml', VV.sym, VV.H].join('|'), () => volmlRun(VV.sym, VV.H));
  const VNAMES = {naive: ['Naive (last 22 days)', GREY], garch: ['GARCH(1,1)', BLUE], har: ['HAR (1/5/22 days)', '#c084fc'], gbm: ['Gradient boosting', GREEN]};
  async function renderVolmlPanel() {
    const host = panel('volml'); empty(host, `Forecasting ${VV.sym} volatility…`);
    let r; try { r = await volmlGet(); } catch (e) { report('volml', e); return empty(host, e.message); }
    if (!$('tp-volml')) return; host.replaceChildren(); setText('n-volml', `${VV.sym} · next ${r.H} days`);
    const w = el('div', 'fx-ql'); host.append(w); const best = Object.keys(r.M).sort((a, b) => r.M[a].qlike - r.M[b].qlike)[0];
    kpis(w, [['NEXT ' + r.H + ' DAYS (ANN.)', pct(r.now[best], 1), `${VNAMES[best][0]} forecast`], ['RECENT 22 DAYS', pct(r.now.naive, 1), 'naive forecast'], ['BEST OUT OF SAMPLE', VNAMES[best][0].split(' (')[0], `QLIKE ${num(r.M[best].qlike, 3)}`, best === 'naive' ? GREY : GREEN]]);
    const cb = el('div', 'fx-ql-chart'), last = r.test.slice(-250); w.append(cb);
    requestAnimationFrame(() => lineChart(cb, {series: [{v: last.map(k => Math.exp(r.y[k])), color: '#e8ecea', width: 1, name: 'Realised'}, {v: last.map(k => Math.exp(r.P[best][k])), color: VNAMES[best][1], width: 1.6, name: VNAMES[best][0].split(' (')[0]}], xs: last.map(k => r.B.day[r.idx[k]]), yfmt: v => (v * 100).toFixed(0) + '%', aria: 'Realised volatility vs best forecast'}));
  }
  async function renderVolml(host, arg) {
    if (arg && SYM_RE.test(String(arg).toUpperCase())) { VV.sym = String(arg).toUpperCase(); saveV(); }
    const {ic, out, rerun} = shell(host, 'VOLML', 'Volatility forecast: GARCH vs machine learning', 'GARCH(1,1), the HAR model and gradient-boosted trees against the naive “recent volatility” forecast, walk-forward');
    symbolInputs(ic, VV, saveV, rerun, [sel('Forecast horizon', VV.H, [[5, '5 trading days'], [10, '10 trading days'], [22, '22 trading days']], v => { VV.H = +v; saveV(); rerun(); })]);
    out.append(note(`Fitting GARCH, HAR and gradient boosting walk-forward on ${VV.sym}…`));
    let r; try { r = await volmlGet(); } catch (e) { report('volml', e); return failBox(out, e); }
    if (!out.isConnected) return; out.replaceChildren();
    const order = Object.keys(r.M).sort((a, b) => r.M[a].qlike - r.M[b].qlike), best = order[0], gb = r.dm.gbmNaive, gbH = r.dm.gbmHar;
    const elevated = r.now.gbm > r.longRun * 1.25, calm = r.now.gbm < r.longRun * 0.8;
    headline(out, elevated ? 'VOLATILITY ELEVATED' : calm ? 'VOLATILITY BELOW NORMAL' : 'VOLATILITY NEAR NORMAL', elevated ? RED : calm ? GREEN : AMBER, `${r.B.name || VV.sym}: expected annualised volatility over the next ${r.H} trading days, by model. GARCH’s long-run level is ${pct(r.longRun, 1)}.`);
    kpis(out, [...['gbm', 'har', 'garch', 'naive'].map(k => [VNAMES[k][0].toUpperCase(), pct(r.now[k], 1), `QLIKE ${num(r.M[k].qlike, 3)} · RMSE ${num(r.M[k].rmse, 3)}`, k === best ? GREEN : null]), ['LONG-RUN (GARCH)', pct(r.longRun, 1), 'where volatility reverts']]);
    out.append(verdict(`Out of sample over ${r.test.length.toLocaleString('en-US')} days the most accurate forecast was ${VNAMES[best][0]} (lowest QLIKE, the standard loss for volatility). Gradient boosting vs naive: Diebold–Mariano t = ${num(gb.t)} (p ${pv(gb.p)}); vs HAR: t = ${num(gbH.t)} (p ${pv(gbH.p)}). ${gb.p < 0.05 && gb.t < 0 ? 'Machine learning beat the naive forecast significantly. ' : 'Machine learning did not significantly beat the naive forecast. '}${gbH.p < 0.05 && gbH.t < 0 ? 'It also beat HAR.' : 'The simple HAR regression remains a tough benchmark, as the research literature finds.'}`, order[0] === 'gbm' && gb.p < 0.05 && gb.t < 0));
    const cb = chartBox(300), bb = chartBox(240), two = el('div', 'fx-ml-grid');
    out.append(card(`LAST 500 TEST DAYS · REALISED ${r.H}-DAY VOLATILITY (WHITE) VS FORECASTS`, cb));
    two.append(card('OUT-OF-SAMPLE QLIKE BY MODEL (LOWER IS BETTER)', bb), card('SCORECARD', table(['Model', 'QLIKE', 'RMSE (log vol)', 'Forecast now'], order.map(k => [VNAMES[k][0], num(r.M[k].qlike, 3), num(r.M[k].rmse, 3), pct(r.now[k], 1)]), (i, j) => i === 0 && j === 1 ? GREEN : null), note('QLIKE punishes under-forecasting volatility more than over-forecasting, which matches how risk managers are hurt.')));
    out.append(two);
    out.append(card('HOW IT WORKS', ...[`Target: realised volatility over the next ${r.H} trading days (root mean square of daily returns, annualised), in logs.`, 'Naive: the last 22 days’ volatility. GARCH(1,1): fitted by maximum likelihood on data before each test year, then filtered forward. HAR: a regression on 1-, 5- and 22-day volatility (Corsi 2009). Gradient boosting: 60 depth-3 trees on 1/5/22/66-day volatility, the Parkinson high-low range and 5/22-day returns (the leverage effect).', 'Walk-forward: every model is refitted once a year using only data available then. Models of log volatility are shifted by their error variance (measured on held-out training data for boosting) so they forecast variance, not its median. Diebold–Mariano tests compare squared errors with overlap-robust (Newey–West) standard errors; a negative t means the first model was more accurate.', 'Delayed Yahoo Finance data. Not advice.'].map(note)));
    requestAnimationFrame(() => {
      const last = r.test.slice(-500), ex = v => Math.exp(v);
      lineChart(cb, {series: [{v: last.map(k => ex(r.y[k])), color: '#e8ecea', width: 1, name: 'Realised'}, ...['naive', 'garch', 'har', 'gbm'].map(m => ({v: last.map(k => ex(r.P[m][k])), color: VNAMES[m][1], width: 1.4, name: VNAMES[m][0].split(' (')[0]}))], xs: last.map(k => r.B.day[r.idx[k]]), yfmt: v => (v * 100).toFixed(0) + '%', aria: 'Realised volatility vs forecasts'});
      bars(bb, {labels: order.map(k => VNAMES[k][0].split(' (')[0]), values: order.map(k => r.M[k].qlike), colors: order.map(k => VNAMES[k][1]), fmt: v => v.toFixed(3), aria: 'QLIKE by model'});
    });
  }

  /* =========================================== REGIME: Gaussian mixture =========================================== */
  const RV = loadState('regime', {sym: 'SPY', K: 3}, (k, v) => k === 'sym' ? SYM_RE.test(v) : [2, 3, 4].includes(v));
  const saveR = saver('regime', RV);
  const RCOL = ['#3ecf8e', '#5b8def', '#ffb000', '#ff5a4f'];
  async function regimeRun(sym, K) {
    const B = await dailyBars(sym, 1000), c = B.c, r = returns(c), v20 = rollSd(r, 20), rows = [], idx = [];
    for (let i = 21; i < c.length; i++) { const f = [Math.log(c[i] / c[i - 20]), Math.log(v20[i] * Math.sqrt(252) + 1e-4)]; if (f.every(finite)) { rows.push(f); idx.push(i); } }
    const z = ML.standardizer(rows), Z = rows.map(z);
    const bic = [2, 3, 4].map(k => ML.gmmFit(Z, k, {seed: 5}).bic);
    const fit = ML.gmmFit(Z, K, {seed: 5});
    // order regimes by average volatility
    const raw = Array.from({length: K}, (_, k) => { let w = 0, a = 0, b = 0; Z.forEach((_, i) => { const p = fit.post[i][k]; w += p; a += p * rows[i][0]; b += p * rows[i][1]; }); return {k, trend: a / w, vol: Math.exp(b / w)}; }).sort((x, y) => x.vol - y.vol);
    const rank = new Map(raw.map((x, j) => [x.k, j])), state = Z.map((_, i) => rank.get(fit.post[i].indexOf(Math.max(...fit.post[i]))));
    const VOLW = {2: ['Calm', 'Stressed'], 3: ['Calm', 'Normal', 'Stressed'], 4: ['Calm', 'Normal', 'Turbulent', 'Crisis']}[K];
    const regimes = raw.map((x, j) => {
      const days = state.map((s, i) => s === j ? i : -1).filter(i => i >= 0), dr = days.map(i => r[idx[i]]), fwd = days.filter(i => idx[i] + 20 < c.length).map(i => Math.log(c[idx[i] + 20] / c[idx[i]]));
      let runs = 0; for (let i = 0; i < state.length; i++) if (state[i] === j && state[i - 1] !== j) runs++;
      return {name: `${VOLW[j]} ${x.trend > 0.01 ? 'uptrend' : x.trend < -0.01 ? 'downtrend' : 'sideways'}`, color: RCOL[j * (K === 2 ? 3 : K === 3 ? 1.5 : 1) | 0] || RCOL[j], share: days.length / state.length, ret: mean(dr) * 252, vol: sd(dr) * Math.sqrt(252), fwd: mean(fwd), dur: days.length / Math.max(1, runs), trend: x.trend, volc: x.vol};
    });
    const trans = Array.from({length: K}, () => new Float64Array(K)); for (let i = 1; i < state.length; i++) trans[state[i - 1]][state[i]]++;
    trans.forEach(row => { const s = row.reduce((a, b) => a + b, 0) || 1; for (let j = 0; j < K; j++) row[j] /= s; });
    const nowP = raw.map(x => fit.post[Z.length - 1][x.k]);
    // out-of-sample: fit on the first 70%, label the rest, check the regimes still sort by realised volatility
    const cut = Math.floor(Z.length * 0.7), f2 = ML.gmmFit(Z.slice(0, cut), K, {seed: 5});
    const raw2 = Array.from({length: K}, (_, k) => { let w = 0, b = 0; for (let i = 0; i < cut; i++) { w += f2.post[i][k]; b += f2.post[i][k] * rows[i][1]; } return {k, vol: b / w}; }).sort((x, y) => x.vol - y.vol), rank2 = new Map(raw2.map((x, j) => [x.k, j]));
    const oosState = Z.slice(cut).map(row => { const p = f2.predict(row); return rank2.get(p.indexOf(Math.max(...p))); });
    const oos = Array.from({length: K}, (_, j) => { const ii = oosState.map((s, q) => s === j ? cut + q : -1).filter(i => i >= 0), nx = ii.filter(i => idx[i] + 1 < c.length).map(i => r[idx[i] + 1]); return {n: ii.length, nextVol: nx.length > 5 ? sd(nx) * Math.sqrt(252) : NaN}; });
    const oosOrdered = oos.filter(x => finite(x.nextVol)).every((x, j, a) => !j || x.nextVol >= a[j - 1].nextVol * 0.9);
    return {B, K, idx, state, regimes, trans, nowP, now: state[state.length - 1], bic, oos, oosOrdered, cutDay: B.day[idx[cut]]};
  }
  const regimeGet = () => cached(['regime', RV.sym, RV.K].join('|'), () => regimeRun(RV.sym, RV.K));
  function regimeChart(box, r, from = 0) {
    const {w, h, s} = frame(box, 'Price with market regimes', 200), padL = 50, padR = 8, padT = 8, padB = 18, iw = w - padL - padR, ih = h - padT - padB;
    const ids = r.idx.slice(from), px = ids.map(i => r.B.c[i]), n = px.length, lo = Math.log(Math.min(...px)) * 0.999, hi = Math.log(Math.max(...px)) * 1.001, X = k => padL + k / (n - 1) * iw, Y = v => padT + (hi - Math.log(v)) / (hi - lo) * ih;
    let k0 = 0; for (let k = 1; k <= n; k++) if (k === n || r.state[from + k] !== r.state[from + k0]) { s.append(svg('rect', {x: X(k0), y: padT, width: Math.max(0.5, X(Math.min(k, n - 1)) - X(k0)), height: ih, fill: r.regimes[r.state[from + k0]].color, 'fill-opacity': 0.16})); k0 = k; }
    let d = ''; px.forEach((v, k) => d += (k ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(v).toFixed(1)); s.append(svg('path', {d, fill: 'none', stroke: '#e8ecea', 'stroke-width': 1.2}));
    for (const v of [Math.exp(lo), Math.exp((lo + hi) / 2), Math.exp(hi)]) label(s, padL - 4, Y(v) + 3, v >= 100 ? v.toFixed(0) : v.toPrecision(4), {'text-anchor': 'end'});
    [0, Math.floor((n - 1) / 2), n - 1].forEach((k, j) => label(s, X(k), h - 4, r.B.day[ids[k]], {'text-anchor': ['start', 'middle', 'end'][j]}));
    box.replaceChildren(s);
  }
  const legend = r => { const l = el('div', 'fx-ml-legend'); r.regimes.forEach(g => { const s = el('span'), sw = el('i', 'fx-ml-sw'); sw.style.background = g.color; s.append(sw, g.name); l.append(s); }); return l; };
  async function renderRegimePanel() {
    const host = panel('regime'); empty(host, `Finding ${RV.sym} regimes…`);
    let r; try { r = await regimeGet(); } catch (e) { report('regime', e); return empty(host, e.message); }
    if (!$('tp-regime')) return; host.replaceChildren(); const g = r.regimes[r.now]; setText('n-regime', `${RV.sym} · ${g.name}`);
    const w = el('div', 'fx-ql'); host.append(w);
    kpis(w, [['REGIME NOW', g.name, `probability ${pct(r.nowP[r.now], 0)}`, g.color], ['TYPICAL STAY', Math.round(g.dur) + ' days', `${pct(r.trans[r.now][r.now], 0)} chance it holds tomorrow`], ['VOLATILITY IN IT', pct(g.vol, 0), 'annualised']]);
    const cb = el('div', 'fx-ql-chart'); w.append(cb); requestAnimationFrame(() => regimeChart(cb, r, Math.max(0, r.idx.length - 500)));
  }
  async function renderRegime(host, arg) {
    if (arg && SYM_RE.test(String(arg).toUpperCase())) { RV.sym = String(arg).toUpperCase(); saveR(); }
    const {ic, out, rerun} = shell(host, 'REGIME', 'Market regimes (Gaussian mixture)', 'An unsupervised model sorts every day by trend and volatility into regimes, then checks they still mean something out of sample');
    symbolInputs(ic, RV, saveR, rerun, [sel('Regimes', RV.K, [[2, '2'], [3, '3'], [4, '4']], v => { RV.K = +v; saveR(); rerun(); })]);
    out.append(note(`Fitting a Gaussian mixture to ${RV.sym}…`));
    let r; try { r = await regimeGet(); } catch (e) { report('regime', e); return failBox(out, e); }
    if (!out.isConnected) return; out.replaceChildren();
    const g = r.regimes[r.now], bestK = [2, 3, 4][r.bic.indexOf(Math.min(...r.bic))];
    headline(out, g.name.toUpperCase(), g.color, `${r.B.name || RV.sym}: today looks like the “${g.name}” regime (probability ${pct(r.nowP[r.now], 0)}). Regimes like this lasted ${Math.round(g.dur)} trading days on average.`);
    kpis(out, r.regimes.map((x, j) => [x.name.toUpperCase(), pct(x.share, 0) + ' of days', `return ${spct(x.ret, 0)}/yr · vol ${pct(x.vol, 0)}`, x.color]));
    out.append(verdict(`${r.oosOrdered ? 'Out-of-sample check passed: ' : 'Out-of-sample check is mixed: '}a mixture fitted only on data before ${r.cutDay} labelled the later days, and the next-day volatility in each regime was ${r.oos.map((x, j) => `${r.regimes[j].name.split(' ')[0].toLowerCase()} ${finite(x.nextVol) ? pct(x.nextVol, 0) : 'not seen'}`).join(', ')}. ${r.oosOrdered ? 'The regimes kept their meaning, so they are useful for sizing risk. ' : 'The ordering did not fully hold, so treat the labels loosely. '}Average returns per regime are in-sample descriptions, not forecasts. BIC prefers ${bestK} regimes.`, r.oosOrdered));
    const cb = chartBox(320); out.append(card('PRICE (LOG SCALE) SHADED BY REGIME', cb, legend(r)));
    const two = el('div', 'fx-ml-grid');
    const tr = table(['From \\ to', ...r.regimes.map(x => x.name.split(' ')[0])], r.trans.map((row, i) => [r.regimes[i].name, ...Array.from(row, v => pct(v, 1))]), (i, j) => j && i === j - 1 ? AMBER : null);
    two.append(card('TRANSITIONS · CHANCE OF EACH REGIME TOMORROW', tr, note('The diagonal is how sticky each regime is. Sticky regimes are what make them useful.')),
      card('REGIME STATISTICS (IN SAMPLE)', table(['Regime', 'Days', 'Return / yr', 'Vol', 'Avg stay', 'Next 20d'], r.regimes.map(x => [x.name, pct(x.share, 0), spct(x.ret, 0), pct(x.vol, 0), Math.round(x.dur) + 'd', spct(x.fwd, 1)]))));
    out.append(two);
    out.append(card('HOW IT WORKS', ...['Each day is described by two numbers: the 20-day return (trend) and the log of 20-day volatility. A Gaussian mixture model fitted by expectation–maximisation finds groups (regimes) in that plane without being told what they are, and gives every day a probability of belonging to each.', 'Regimes are ordered by volatility and named by their volatility and average trend. BIC (lower is better) compares 2, 3 and 4 regimes: ' + r.bic.map((b, i) => `${i + 2}: ${b.toFixed(0)}`).join(', ') + '.', 'Delayed Yahoo Finance data. Not advice.'].map(note)));
    requestAnimationFrame(() => regimeChart(cb, r));
  }

  /* ============================================ PCA: hidden factors ============================================ */
  const CV = loadState('pca', {range: '2y'}, (k, v) => ['1y', '2y', '5y'].includes(v));
  const saveC = saver('pca', CV);
  async function pcaRun(range) {
    const d = await loadCloses(UNIVERSE, range), A = alignedReturns(d.series, UNIVERSE);
    if (!A || A.symbols.length < 20 || A.dates.length < 120) throw new Error('Not enough stock data right now.');
    const P = ML.pca(A.rets.map(x => Array.from(x)));
    const sectors = [...new Set(A.symbols.map(s => SECTOR_OF[s]?.name || 'Other'))];
    const bySector = [0, 1, 2, 3].map(k => sectors.map(sec => mean(A.symbols.map((s, i) => (SECTOR_OF[s]?.name || 'Other') === sec ? P.vectors[k][i] : NaN).filter(finite))));
    const top = k => { const o = A.symbols.map((s, i) => [s, P.vectors[k][i]]).sort((a, b) => b[1] - a[1]); return {pos: o.slice(0, 5), neg: o.slice(-5).reverse()}; };
    // rolling share of the first component (120-day windows)
    const roll = [], W = 120, T = A.dates.length;
    for (let e = W; e <= T; e += 10) { const p = ML.pca(A.rets.map(x => Array.from(x.slice(e - W, e)))); roll.push([A.dates[e - 1], p.share[0]]); }
    return {A, P, sectors, bySector, top, roll, names: d.names};
  }
  const pcaGet = () => cached('pca|' + CV.range, () => pcaRun(CV.range));
  const describe = (sectors, row) => { const o = sectors.map((s, i) => [s, row[i]]).filter(x => finite(x[1])).sort((a, b) => b[1] - a[1]); return `${o.slice(0, 2).map(x => x[0]).join(' & ')} vs ${o.slice(-2).reverse().map(x => x[0]).join(' & ')}`; };
  async function renderPcaPanel() {
    const host = panel('pca'); empty(host, 'Decomposing 50 stocks…');
    let r; try { r = await pcaGet(); } catch (e) { report('pca', e); return empty(host, e.message); }
    if (!$('tp-pca')) return; host.replaceChildren(); setText('n-pca', `${r.A.symbols.length} stocks · ${CV.range}`);
    const w = el('div', 'fx-ql'), last = r.roll[r.roll.length - 1][1]; host.append(w);
    kpis(w, [['MARKET FACTOR', pct(r.P.share[0], 0), 'of all variance (PC1)'], ['REAL FACTORS', String(r.P.signal), 'above the noise edge', AMBER], ['PC1 LAST 120 DAYS', pct(last, 0), last > r.P.share[0] * 1.2 ? 'stocks moving as one' : 'normal', last > r.P.share[0] * 1.2 ? RED : GREY]]);
    const cb = el('div', 'fx-ql-chart'); w.append(cb); requestAnimationFrame(() => lineChart(cb, {series: [{v: r.roll.map(x => x[1]), color: AMBER, width: 1.6}], xs: r.roll.map(x => x[0]), yfmt: v => pct(v, 0), aria: 'Rolling share of the market factor'}));
  }
  async function renderPca(host) {
    const {ic, out, rerun} = shell(host, 'PCA', 'Hidden factors (principal components)', 'What really drives 50 large US stocks: eigenvalues of their correlation matrix against pure noise');
    ic.append(chips([['1y', '1 year'], ['2y', '2 years'], ['5y', '5 years']], CV.range, v => { CV.range = v; saveC(); rerun(); }));
    out.append(note('Loading 50 stocks and computing every eigenvalue…'));
    let r; try { r = await pcaGet(); } catch (e) { report('pca', e); return failBox(out, e); }
    if (!out.isConnected) return; out.replaceChildren();
    const P = r.P, last = r.roll[r.roll.length - 1][1];
    headline(out, `${P.signal} REAL FACTOR${P.signal === 1 ? '' : 'S'}`, AMBER, `Of ${P.N} possible components, ${P.signal} stand above the Marchenko–Pastur edge (${P.edge.toFixed(2)}), the largest eigenvalue pure noise would produce with ${P.N} stocks and ${P.T} days. The rest is indistinguishable from randomness.`);
    kpis(out, [['PC1 · THE MARKET', pct(P.share[0], 1), 'of total variance'], ['PC2', pct(P.share[1], 1), describe(r.sectors, r.bySector[1])], ['PC3', pct(P.share[2], 1), describe(r.sectors, r.bySector[2])], ['PC1 LAST 120 DAYS', pct(last, 0), last > P.share[0] * 1.2 ? 'diversification is weak now' : 'diversification normal', last > P.share[0] * 1.2 ? RED : GREEN]]);
    out.append(verdict(`The first component loads on every stock with the same sign: it is the market. ${P.signal > 1 ? `Components 2${P.signal > 2 ? '–' + P.signal : ''} contrast sectors (for example ${describe(r.sectors, r.bySector[1])}), the hidden “style” bets inside any stock portfolio.` : 'Beyond it, nothing clears the noise edge, so apparent sector factors in this window may be noise.'} When the market factor’s share jumps, stocks move together and diversification fails, as in sell-offs.`, null));
    const two = el('div', 'fx-ml-grid'), sc = chartBox(260), rc = chartBox(260); out.append(two);
    two.append(card('EIGENVALUES (SCREE) VS THE NOISE EDGE', sc, note('Bars above the amber line carry real common structure; below it, the eigenvalues look like those of random data.')), card('MARKET FACTOR SHARE, ROLLING 120 DAYS', rc));
    const hc = chartBox(200); out.append(card('AVERAGE LOADING BY SECTOR · PC1–PC4', hc, note('Orange = positive loading, blue = negative. A component that is orange in one sector and blue in another is a long/short sector factor.')));
    const lt = el('div', 'fx-ml-grid'); out.append(lt);
    for (const k of [1, 2]) { const t = r.top(k); lt.append(card(`PC${k + 1} · MOST POSITIVE AND NEGATIVE STOCKS`, table(['Stock', 'Sector', 'Loading'], [...t.pos, ...t.neg].map(([s, v]) => [s, SECTOR_OF[s]?.name || '—', num(v, 3)]), (i, j) => j === 2 ? (i < 5 ? AMBER : BLUE) : null))); }
    const fc = chartBox(260); out.append(card('FACTOR RETURNS · GROWTH OF EACH COMPONENT PORTFOLIO', fc, note('Each line is a portfolio weighted by a component’s loadings (scaled). PC1 tracks the equal-weight market.')));
    out.append(card('HOW IT WORKS', ...[`Daily log returns of ${P.N} large US stocks over ${P.T} common trading days are standardised, and their correlation matrix is decomposed into eigenvalues (how much variance each hidden factor explains) and eigenvectors (how much each stock loads on it), using the Jacobi method.`, 'Random-matrix theory says pure noise produces eigenvalues up to (1 + √(N/T))². Only components above that edge are evidence of real shared drivers.', 'Delayed Yahoo Finance data. Not advice.'].map(note)));
    requestAnimationFrame(() => {
      const k = Math.min(15, P.N); bars(sc, {labels: Array.from({length: k}, (_, i) => 'PC' + (i + 1)), values: P.values.slice(0, k), colors: P.values.slice(0, k).map(v => v > P.edge ? AMBER : GREY), fmt: v => v.toFixed(1), hline: P.edge, hlabel: 'noise edge', aria: 'Scree plot'});
      lineChart(rc, {series: [{v: r.roll.map(x => x[1]), color: AMBER, width: 1.6, name: 'PC1 share'}], xs: r.roll.map(x => x[0]), yfmt: v => pct(v, 0), aria: 'Rolling PC1 share'});
      heatmap(hc, {rows: ['PC1', 'PC2', 'PC3', 'PC4'], cols: r.sectors.map(s => s.slice(0, 8)), cells: r.bySector, scale: v => { if (!finite(v)) return '#0b0f0e'; const t = Math.max(-1, Math.min(1, v / 0.3)); return t >= 0 ? `rgba(255,120,30,${0.1 + 0.8 * t})` : `rgba(91,141,239,${0.1 + 0.8 * -t})`; }, fmt: v => v.toFixed(2), aria: 'Sector loadings', title: (v, a, b) => `PC${a + 1} · ${r.sectors[b]}: ${v.toFixed(3)}`});
      const series = [0, 1, 2].map(j => { const f = P.factor(j), s2 = sd(f) || 1; let e = 1; return {v: Array.from(f, x => (e *= Math.exp(0.01 * x / s2))), color: [AMBER, BLUE, GREEN][j], width: 1.4, name: 'PC' + (j + 1)}; });
      lineChart(fc, {series, xs: r.A.dates, log: true, yfmt: v => v.toFixed(2) + '×', aria: 'Factor portfolio growth'});
    });
  }

  /* ============================================== PAIRS: cointegration ============================================== */
  const UNIS = {large: ['XOM', 'CVX', 'COP', 'EOG', 'JPM', 'BAC', 'C', 'WFC', 'KO', 'PEP', 'HD', 'LOW', 'V', 'MA'], etf: ['SPY', 'QQQ', 'IWM', 'DIA', 'XLB', 'XLE', 'XLF', 'XLI', 'XLK', 'XLP', 'XLU', 'XLV', 'XLY', 'GLD']};
  const AV = loadState('pairs', {uni: 'large', custom: ''}, (k, v) => k === 'uni' ? ['large', 'etf', 'custom'].includes(v) : typeof v === 'string' && v.length < 200);
  const saveA = saver('pairs', AV);
  const pairUniverse = () => AV.uni === 'custom' ? [...new Set(AV.custom.toUpperCase().split(/[\s,]+/).filter(s => SYM_RE.test(s)))].slice(0, 16) : UNIS[AV.uni];
  async function pairsRun(syms) {
    if (syms.length < 4) throw new Error('Enter at least 4 symbols.');
    const d = await loadCloses(syms, '5y'), A = alignedReturns(d.series, syms);
    if (!A || A.symbols.length < 4 || A.dates.length < 600) throw new Error('Not enough common price history for these symbols.');
    const S = A.symbols, T = A.prices[0].length, cut = Math.floor(T * 0.6), lp = A.prices.map(p => p.map(Math.log));
    const nul = ML.egNull(cut, 1000, 21), nulTest = ML.egNull(T - cut, 1000, 22), pairs = [];
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const eg = ML.engleGranger(lp[i].slice(0, cut), lp[j].slice(0, cut)), p = ML.pFromNull(eg.tau, nul);
      pairs.push({a: S[i], b: S[j], i, j, tau: eg.tau, p, beta: eg.b, alpha: eg.a, sdE: eg.sd, half: eg.halfLife});
    }
    const m = pairs.length, sig = pairs.filter(x => x.p < 0.05), bonf = pairs.filter(x => x.p < 0.05 / m), bhPass = ML.bh(pairs.map(x => x.p), 0.1);
    pairs.forEach((x, k) => { x.bh = bhPass[k]; });
    // out of sample: does the relationship hold, and does a simple z-score trade make money?
    for (const x of sig) {
      const egT = ML.engleGranger(lp[x.i].slice(cut), lp[x.j].slice(cut)); x.pTest = ML.pFromNull(egT.tau, nulTest);
      const z = t => (lp[x.i][t] - x.alpha - x.beta * lp[x.j][t]) / x.sdE; x.z = Array.from({length: T}, (_, t) => z(t));
      // 10 bp per leg each time the position opens or closes
      let pos = 0, prev = 0, held = 0, trades = 0; const pnl = [];
      for (let t = cut; t < T - 1; t++) {
        const zt = x.z[t]; if (pos === 0 && Math.abs(zt) > 2) { pos = zt > 0 ? -1 : 1; held = 0; trades++; } else if (pos !== 0 && (pos * zt >= 0 || held > 60 || Math.abs(zt) > 4)) pos = 0;
        const ra = Math.log(A.prices[x.i][t + 1] / A.prices[x.i][t]), rb = Math.log(A.prices[x.j][t + 1] / A.prices[x.j][t]);
        pnl.push(pos * (ra - x.beta * rb) / (1 + Math.abs(x.beta)) - Math.abs(pos - prev) * 0.002); prev = pos; if (pos) held++;
      }
      x.trades = trades; x.ret = pnl.reduce((s, v) => s + v, 0); x.pnl = pnl; x.sharpe = ML.sharpe(pnl);
    }
    sig.sort((a, b) => a.p - b.p);
    const expected = m * 0.05, pChance = ML.binomTail(sig.length, m, 0.05), held = sig.filter(x => x.pTest < 0.05).length;
    return {A, S, T, cut, pairs, m, sig, bonf, bhN: pairs.filter(x => x.bh).length, expected, pChance, held, cutDay: A.dates[cut - 1]};
  }
  const pairsGet = () => { const u = pairUniverse(); return cached('pairs|' + u.join(','), () => pairsRun(u)); };
  async function renderPairsPanel() {
    const host = panel('pairs'); empty(host, 'Testing every pair…');
    let r; try { r = await pairsGet(); } catch (e) { report('pairs', e); return empty(host, e.message); }
    if (!$('tp-pairs')) return; host.replaceChildren(); setText('n-pairs', `${r.m} pairs`);
    const w = el('div', 'fx-ql'); host.append(w);
    kpis(w, [['“COINTEGRATED” AT 5%', `${r.sig.length} / ${r.m}`, `chance alone: ${r.expected.toFixed(1)}`, r.sig.length > r.expected * 1.5 ? GREEN : AMBER], ['AFTER CORRECTION', String(r.bonf.length), 'Bonferroni survivors'], ['STILL HELD LATER', `${r.held} / ${r.sig.length}`, 'out of sample', r.held ? GREEN : RED]]);
    const cb = el('div', 'fx-ql-chart'), hist = pHist(r); w.append(cb);
    requestAnimationFrame(() => bars(cb, {labels: hist.map((_, i) => `p ${i / 10}`), values: hist, colors: hist.map((_, i) => i === 0 ? AMBER : GREY), fmt: v => v.toFixed(0), hline: r.m / 10, hlabel: 'chance', aria: 'Histogram of pair p-values'}));
  }
  const pHist = r => { const h = new Array(10).fill(0); r.pairs.forEach(x => h[Math.min(9, Math.floor(x.p * 10))]++); return h; };
  async function renderPairs(host) {
    const {ic, out, rerun} = shell(host, 'PAIRS', 'Pairs trading and the multiple-testing trap', 'Engle–Granger on every pair, how many “cointegrated” pairs chance alone produces, and whether the survivors still work later');
    ic.append(chips([['large', 'Large caps (14)'], ['etf', 'ETFs (14)'], ['custom', 'My symbols']], AV.uni, v => { AV.uni = v; saveA(); rerun(); }));
    if (AV.uni === 'custom') { const f = el('form', 'fx-ql-row'), i = el('input', 'fx-ml-in'); i.value = AV.custom; i.placeholder = 'Up to 16 symbols, e.g. KO PEP XOM CVX GLD SLV'; i.setAttribute('aria-label', 'Symbols'); f.style.marginTop = '8px'; f.append(i, btn('Test pairs', 'fx-ql-btn pri')); f.addEventListener('submit', e => { e.preventDefault(); AV.custom = i.value; saveA(); rerun(); }); ic.append(f); }
    out.append(note('Loading 5 years of prices and testing every pair…'));
    let r; try { r = await pairsGet(); } catch (e) { report('pairs', e); return failBox(out, e); }
    if (!out.isConnected) return; out.replaceChildren();
    const k = r.sig.length, luck = r.pChance > 0.05;
    headline(out, `${k} OF ${r.m} PAIRS “COINTEGRATED”`, luck ? AMBER : GREEN, `Tested on ${r.cut} days to ${r.cutDay}. With ${r.m} tests at the 5% level, chance alone produces about ${r.expected.toFixed(1)} false positives.`);
    kpis(out, [['SIGNIFICANT AT 5%', `${k} / ${r.m}`, `expected by chance ${r.expected.toFixed(1)}`, luck ? AMBER : GREEN], ['P(THIS MANY BY CHANCE)', pv(r.pChance), 'binomial, if pairs were independent'], ['BONFERRONI (p < ' + (0.05 / r.m).toPrecision(2) + ')', String(r.bonf.length), 'family-wise 5%'], ['BENJAMINI–HOCHBERG 10%', String(r.bhN), 'false-discovery control'], ['HELD OUT OF SAMPLE', `${r.held} / ${k}`, `re-tested after ${r.cutDay}`, r.held ? GREEN : RED]]);
    out.append(verdict(`${luck ? `Finding ${k} “cointegrated” pairs out of ${r.m} is about what luck produces (${r.expected.toFixed(1)} expected). ` : `${k} significant pairs is more than luck would produce (${r.expected.toFixed(1)} expected), so some relationships may be real. `}${r.bonf.length ? `${r.bonf.length} survive the strict Bonferroni correction. ` : 'None survive the strict Bonferroni correction. '}Out of sample, ${r.held} of ${k} still tested as cointegrated${k ? ', and the z-score trades below show what happened when the relationship ' + (r.held < k ? 'broke' : 'held') : ''}. This is why most pairs found by scanning fail live.`, !luck && r.held > 0));
    const two = el('div', 'fx-ml-grid'), hc = chartBox(240); out.append(two);
    const hist = pHist(r);
    two.append(card('P-VALUES OF ALL PAIRS · UNDER PURE CHANCE THE BARS ARE FLAT', hc, note(`If no pair were truly cointegrated, the ${r.m} p-values would spread evenly (dashed line). A tall first bar means real structure.`)),
      card('SIGNIFICANT PAIRS (5%) · FORMATION VS OUT OF SAMPLE', k ? table(['Pair', 'p (formation)', 'Half-life', 'p (later)', 'Trades', 'Return'], r.sig.map(x => [`${x.a}/${x.b}`, pv(x.p), finite(x.half) ? x.half.toFixed(0) + 'd' : '∞', pv(x.pTest), String(x.trades), spct(x.ret)]), (i, j) => j === 3 ? (r.sig[i].pTest < 0.05 ? GREEN : RED) : j === 5 ? (r.sig[i].ret >= 0 ? GREEN : RED) : null) : note('No pair passed at 5%.')));
    let zc = null;
    if (k) { zc = chartBox(280); const x = r.sig[0]; out.append(card(`BEST PAIR ${x.a}/${x.b} · SPREAD Z-SCORE, FORMATION | OUT OF SAMPLE`, zc, note(`Spread = log ${x.a} − ${x.beta.toFixed(2)} × log ${x.b}, scaled by its formation-period standard deviation. Trades: short the spread above +2, long below −2, exit at 0. If the line drifts away after the split, the relationship broke.`))); }
    out.append(card('HOW IT WORKS', ...['Engle–Granger: regress one log price on the other over the formation period (first 60% of 5 years), then test the residual for a unit root (ADF with one lag). A strongly negative statistic means the spread mean-reverts.', 'P-values come from 1,000 simulations of two independent random walks of the same length, so they are exact for this test rather than read from a table.', 'Multiple testing: run enough tests and some pass by luck. Bonferroni divides 5% by the number of tests; Benjamini–Hochberg controls the share of false discoveries. Pairs that pass are then re-tested and traded on the later 40% they never saw. Delayed Yahoo Finance data. Not advice.'].map(note)));
    requestAnimationFrame(() => {
      bars(hc, {labels: hist.map((_, i) => `${i / 10}–${(i + 1) / 10}`), values: hist, colors: hist.map((_, i) => i === 0 ? AMBER : GREY), fmt: v => v.toFixed(0), hline: r.m / 10, hlabel: 'chance', aria: 'Histogram of p-values'});
      if (zc) { const x = r.sig[0], zs = x.z.map(v => Math.max(-6, Math.min(6, v))); lineChart(zc, {series: [{v: zs.map((v, t) => t < r.cut ? v : NaN), color: BLUE, width: 1.2, name: 'Formation'}, {v: zs.map((v, t) => t >= r.cut - 1 ? v : NaN), color: AMBER, width: 1.2, name: 'Out of sample'}], xs: r.A.dates, hline: [{v: 2, color: '#4b5953'}, {v: -2, color: '#4b5953'}, {v: 0, color: '#2a3530'}], yfmt: v => v.toFixed(1), aria: 'Spread z-score'}); }
    });
  }

  /* ============================================ ANOMALY: isolation forest ============================================ */
  const NV = loadState('anomaly', {sym: 'SPY', share: 1}, (k, v) => k === 'sym' ? SYM_RE.test(v) : [0.5, 1, 2].includes(v));
  const saveN = saver('anomaly', NV);
  const AFEAT = ['Return', 'Overnight gap', 'Day range', 'Volume', '5-day move'];
  async function anomalyRun(sym, share) {
    const B = await dailyBars(sym, 600), c = B.c, N = c.length, r = returns(c), v60 = rollSd(r, 60), rng60 = smaA(B.h.map((h, i) => Math.log(h / B.l[i])), 60), lv = B.v.map(v => Math.log(1 + (v || 0))), lv60 = smaA(lv, 60), hasVol = B.v.some(v => v > 0);
    const X = [], idx = [];
    for (let i = 61; i < N; i++) { const s = v60[i - 1] || 1e-3, f = [r[i] / s, Math.log(B.o[i] / c[i - 1]) / s, Math.log(Math.log(B.h[i] / B.l[i]) / (rng60[i - 1] || 1e-4) + 1e-3), hasVol ? lv[i] - lv60[i - 1] : 0, Math.log(c[i] / c[i - 5]) / (s * Math.sqrt(5))]; if (f.every(finite)) { X.push(f); idx.push(i); } }
    const iso = ML.isolationForest(X, {trees: 150, sample: 256, seed: 7}), score = X.map(iso.score), sorted = [...score].sort((a, b) => b - a), thr = sorted[Math.max(0, Math.floor(score.length * share / 100) - 1)];
    const flag = score.map(s => s >= thr), list = idx.map((i, k) => ({i, k, s: score[k], f: X[k]})).filter((_, k) => flag[k]).sort((a, b) => b.s - a.s);
    const why = f => { const z = [Math.abs(f[0]) / 2.5, Math.abs(f[1]) / 2.5, f[2] / 0.7, hasVol ? f[3] / 0.8 : 0, Math.abs(f[4]) / 2.5], j = z.indexOf(Math.max(...z)); return [f[0] < 0 ? 'Big down day' : 'Big up day', f[1] < 0 ? 'Gap down' : 'Gap up', 'Very wide range', 'Volume spike', f[4] < 0 ? 'Fast 5-day drop' : 'Fast 5-day rise'][j]; };
    list.forEach(a => { a.why = why(a.f); a.next5 = a.i + 5 < N ? Math.log(c[a.i + 5] / c[a.i]) : NaN; a.vol5 = a.i + 5 < N ? sd(Array.from(r.slice(a.i + 1, a.i + 6))) : NaN; });
    const normalVol = sd(Array.from(r.slice(61))), after = list.filter(a => finite(a.vol5)), volAfter = mean(after.map(a => a.vol5)), normal5 = mean(idx.filter((i, k) => !flag[k] && i + 5 < N).map(i => Math.log(c[i + 5] / c[i])));
    const recent = list.filter(a => a.i >= N - 21).sort((a, b) => b.i - a.i);
    return {B, idx, score, flag, list, thr, normalVol, volAfter, next5: mean(after.map(a => a.next5)), normal5, recent, lastScore: score[score.length - 1], N};
  }
  const anomalyGet = () => cached(['anomaly', NV.sym, NV.share].join('|'), () => anomalyRun(NV.sym, NV.share));
  function anomalyChart(box, r, from) {
    const {w, h, s} = frame(box, 'Price with anomalies', 180), padL = 50, padR = 8, padT = 8, padB = 18, iw = w - padL - padR, ih = h - padT - padB, ids = r.idx.slice(from), px = ids.map(i => r.B.c[i]), n = px.length;
    const lo = Math.min(...px) * 0.98, hi = Math.max(...px) * 1.02, X = k => padL + k / (n - 1) * iw, Y = v => padT + (hi - v) / (hi - lo) * ih;
    let d = ''; px.forEach((v, k) => d += (k ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(v).toFixed(1)); s.append(svg('path', {d, fill: 'none', stroke: '#c9d2cd', 'stroke-width': 1.1}));
    ids.forEach((i, k) => { if (!r.flag[from + k]) return; const c = svg('circle', {cx: X(k), cy: Y(px[k]), r: 3.5, fill: r.B.c[i] >= r.B.c[i - 1] ? GREEN : RED, stroke: '#000', 'stroke-width': 0.6}); const t = svg('title'); t.textContent = `${r.B.day[i]} · score ${r.score[from + k].toFixed(2)}`; c.append(t); s.append(c); });
    for (const v of [lo, (lo + hi) / 2, hi]) label(s, padL - 4, Y(v) + 3, v >= 100 ? v.toFixed(0) : v.toPrecision(4), {'text-anchor': 'end'});
    [0, Math.floor((n - 1) / 2), n - 1].forEach((k, j) => label(s, X(k), h - 4, r.B.day[ids[k]], {'text-anchor': ['start', 'middle', 'end'][j]}));
    box.replaceChildren(s);
  }
  async function renderAnomalyPanel() {
    const host = panel('anomaly'); empty(host, `Scanning ${NV.sym} for unusual days…`);
    let r; try { r = await anomalyGet(); } catch (e) { report('anomaly', e); return empty(host, e.message); }
    if (!$('tp-anomaly')) return; host.replaceChildren(); setText('n-anomaly', `${NV.sym} · ${r.list.length} flagged`);
    const w = el('div', 'fx-ql'), last = r.recent[0]; host.append(w);
    kpis(w, [['LATEST ANOMALY', last ? r.B.day[last.i] : 'none in 1 month', last ? last.why : 'quiet', last ? RED : GREEN], ['TODAY’S SCORE', r.lastScore.toFixed(2), r.lastScore >= r.thr ? 'unusual' : 'normal', r.lastScore >= r.thr ? RED : GREY], ['VOL AFTER ANOMALIES', (r.volAfter / r.normalVol).toFixed(1) + '×', 'next 5 days vs normal']]);
    const cb = el('div', 'fx-ql-chart'); w.append(cb); requestAnimationFrame(() => anomalyChart(cb, r, Math.max(0, r.idx.length - 500)));
  }
  async function renderAnomaly(host, arg) {
    if (arg && SYM_RE.test(String(arg).toUpperCase())) { NV.sym = String(arg).toUpperCase(); saveN(); }
    const {ic, out, rerun} = shell(host, 'ANOMALY', 'Anomaly detection (isolation forest)', 'Finds the most unusual trading days from returns, gaps, ranges and volume, and shows what tended to follow');
    symbolInputs(ic, NV, saveN, rerun, [sel('Flag the most unusual', NV.share, [[0.5, '0.5% of days'], [1, '1% of days'], [2, '2% of days']], v => { NV.share = +v; saveN(); rerun(); })]);
    out.append(note(`Growing 150 isolation trees on ${NV.sym}…`));
    let r; try { r = await anomalyGet(); } catch (e) { report('anomaly', e); return failBox(out, e); }
    if (!out.isConnected) return; out.replaceChildren();
    const unusual = r.lastScore >= r.thr, last = r.recent[0];
    headline(out, unusual ? 'TODAY IS UNUSUAL' : last ? 'RECENT ANOMALY' : 'NOTHING UNUSUAL RECENTLY', unusual ? RED : last ? AMBER : GREEN, `${r.B.name || NV.sym}: ${r.list.length} of ${r.idx.length.toLocaleString('en-US')} days flagged (top ${NV.share}%). ${last ? `Most recent: ${r.B.day[last.i]} (${last.why.toLowerCase()}).` : 'None in the last month.'}`);
    kpis(out, [['TODAY’S SCORE', r.lastScore.toFixed(2), `flag threshold ${r.thr.toFixed(2)}`, unusual ? RED : GREY], ['DAYS FLAGGED', String(r.list.length), `top ${NV.share}%`], ['VOLATILITY NEXT 5 DAYS', (r.volAfter / r.normalVol).toFixed(1) + '× normal', 'after anomalies', r.volAfter > r.normalVol * 1.3 ? RED : GREY], ['AVG NEXT 5-DAY MOVE', spct(r.next5), `normal days ${spct(r.normal5)}`]]);
    out.append(verdict(`After the flagged days, volatility over the next week averaged ${(r.volAfter / r.normalVol).toFixed(1)} times its normal level: unusual days tend to come in clusters, which matters more for position size than for direction. The average next-week move after anomalies was ${spct(r.next5)} against ${spct(r.normal5)} on normal days, from only ${r.list.length} events, so do not read it as a signal.`, null));
    const cb = chartBox(320); out.append(card('PRICE WITH FLAGGED DAYS (GREEN = UP DAY, RED = DOWN DAY)', cb));
    out.append(card('MOST UNUSUAL DAYS', table(['Date', 'Why', 'Score', 'Return', 'Gap', 'Volume vs 60d', 'Next 5 days'], r.list.slice(0, 25).map(a => { const i = a.i, c = r.B.c; return [r.B.day[i], a.why, a.s.toFixed(2), spct(Math.log(c[i] / c[i - 1])), spct(Math.log(r.B.o[i] / c[i - 1])), r.B.v[i] ? (Math.exp(a.f[3])).toFixed(1) + '×' : '—', spct(a.next5)]; }), (i, j) => j === 3 || j === 6 ? (() => { const a = r.list[i], v = j === 3 ? Math.log(r.B.c[a.i] / r.B.c[a.i - 1]) : a.next5; return finite(v) ? (v >= 0 ? GREEN : RED) : null; })() : null)));
    out.append(card('HOW IT WORKS', ...[`Each day is described by its ${AFEAT.join(', ').toLowerCase()}, each scaled by the market’s own recent behaviour (60-day volatility, range and volume) so that a busy year and a quiet one are comparable.`, 'An isolation forest splits the data at random again and again. Unusual days get isolated in very few splits; the score (0 to 1) rises as the average number of splits falls. It needs no labels, which is why it is also used for fraud detection.', 'Delayed Yahoo Finance data. Not advice.'].map(note)));
    requestAnimationFrame(() => anomalyChart(cb, r, 0));
  }

  /* =========================================== RLTRADE: Q-learning =========================================== */
  const QV = loadState('rltrade', {sym: 'SPY', cost: 5}, (k, v) => k === 'sym' ? SYM_RE.test(v) : [0, 5, 10].includes(v));
  const saveQ = saver('rltrade', QV);
  const SNAMES = ['below 50-day MA', 'above 50-day MA'], MNAMES = ['falling 20d', 'rising 20d'], VN = ['calm', 'volatile'];
  async function rlRun(sym, costBp) {
    const B = await dailyBars(sym, 1300), c = B.c, N = c.length, r = returns(c), s50 = smaA(c, 50), v20 = rollSd(r, 20);
    const first = 60, cut = first + Math.floor((N - 1 - first) * 0.7), vMed = [...Array.from(v20.slice(first, cut))].sort((a, b) => a - b)[Math.floor((cut - first) / 2)];
    const states = new Int32Array(N), rets = new Float64Array(N);
    for (let t = first; t < N; t++) { states[t] = (c[t] > s50[t] ? 4 : 0) + (c[t] > c[t - 20] ? 2 : 0) + (v20[t] > vMed ? 1 : 0); rets[t] = t + 1 < N ? r[t + 1] : 0; }
    const cost = costBp / 1e4, runs = [];
    for (const seed of [5, 6, 7, 8, 9]) runs.push(ML.qLearn(states, rets, 8, {from: first, to: cut, epochs: 120, alpha: 0.05, gamma: 0.9, cost, seed}));
    await tick();
    // majority vote across 5 seeds for stability
    const act = s => { const v = [0, 0, 0]; runs.forEach(q => v[q.act(s)]++); return v.indexOf(Math.max(...v)); };
    const ins = ML.runPolicy(states, rets, act, first, cut, cost), oos = ML.runPolicy(states, rets, act, cut, N - 1, cost);
    const bhIn = Array.from(rets.slice(first, cut)), bhOut = Array.from(rets.slice(cut, N - 1));
    const rand = ML.rng(77), randomSharpes = [];
    for (let k = 0; k < 500; k++) { const tbl = Array.from({length: 24}, () => Math.floor(rand() * 3)); randomSharpes.push(ML.sharpe(ML.runPolicy(states, rets, s => tbl[s], cut, N - 1, cost))); }
    randomSharpes.sort((a, b) => a - b);
    const sOut = ML.sharpe(oos), pct_ = randomSharpes.filter(v => v < sOut).length / randomSharpes.length;
    const policy = Array.from({length: 8}, (_, s) => ({s, label: `${SNAMES[s >> 2]}, ${MNAMES[(s >> 1) & 1]}, ${VN[s & 1]}`, fromCash: act(s * 3 + 1), fromLong: act(s * 3 + 2), fromShort: act(s * 3 + 0), q: Array.from({length: 3}, (_, a) => mean(runs.map(q => q.Q[s * 3 + 1][a]))), days: Array.from(states.slice(first, N)).filter(v => v === s).length}));
    return {B, first, cut, N, ins, oos, bhIn, bhOut, sIn: ML.sharpe(ins), sOut, bhSIn: ML.sharpe(bhIn), bhSOut: ML.sharpe(bhOut), randomSharpes, pct: pct_, policy, now: states[N - 1], nowAct: act(states[N - 1] * 3 + 1), costBp};
  }
  const rlGet = () => cached(['rl', QV.sym, QV.cost].join('|'), () => rlRun(QV.sym, QV.cost));
  const ACT = ['SHORT', 'CASH', 'LONG'], ACOL = [RED, GREY, GREEN];
  async function renderRlPanel() {
    const host = panel('rltrade'); empty(host, `Training a Q-learning agent on ${QV.sym}…`);
    let r; try { r = await rlGet(); } catch (e) { report('rltrade', e); return empty(host, e.message); }
    if (!$('tp-rltrade')) return; host.replaceChildren(); setText('n-rltrade', `${QV.sym} · ${ACT[r.nowAct].toLowerCase()} today`);
    const w = el('div', 'fx-ql'); host.append(w);
    kpis(w, [['AGENT SAYS', ACT[r.nowAct], r.policy[r.now].label, ACOL[r.nowAct]], ['OOS SHARPE', num(r.sOut), `buy & hold ${num(r.bhSOut)}`, r.sOut > r.bhSOut ? GREEN : RED], ['VS RANDOM POLICIES', pct(r.pct, 0), 'percentile']]);
    const cb = el('div', 'fx-ql-chart'); w.append(cb); requestAnimationFrame(() => lineChart(cb, {series: [{v: cum(r.bhOut), color: GREY, width: 1.2, name: 'Buy & hold'}, {v: cum(r.oos), color: AMBER, width: 1.6, name: 'Agent'}], xs: r.B.day.slice(r.cut, r.N - 1), log: true, yfmt: v => v.toFixed(2) + '×', aria: 'Agent out of sample'}));
  }
  async function renderRl(host, arg) {
    if (arg && SYM_RE.test(String(arg).toUpperCase())) { QV.sym = String(arg).toUpperCase(); saveQ(); }
    const {ic, out, rerun} = shell(host, 'RLTRADE', 'Reinforcement learning: long, short or cash', 'A Q-learning agent learns when to be long, short or out from trend, momentum and volatility, then trades data it never saw');
    symbolInputs(ic, QV, saveQ, rerun, [sel('Trading cost', QV.cost, [[0, '0 bp'], [5, '5 bp per switch'], [10, '10 bp per switch']], v => { QV.cost = +v; saveQ(); rerun(); })]);
    out.append(note(`Training 5 Q-learning agents on ${QV.sym}…`));
    let r; try { r = await rlGet(); } catch (e) { report('rltrade', e); return failBox(out, e); }
    if (!out.isConnected) return; out.replaceChildren();
    const good = r.sOut > r.bhSOut && r.pct > 0.9, overfit = r.sIn - r.sOut;
    headline(out, `AGENT SAYS ${ACT[r.nowAct]}`, ACOL[r.nowAct], `${r.B.name || QV.sym} is ${r.policy[r.now].label} today. Out of sample (from ${r.B.day[r.cut]}) the agent’s Sharpe ratio was ${num(r.sOut)} against ${num(r.bhSOut)} for buy & hold.`);
    kpis(out, [['IN-SAMPLE SHARPE', num(r.sIn), `buy & hold ${num(r.bhSIn)}`], ['OUT-OF-SAMPLE SHARPE', num(r.sOut), `buy & hold ${num(r.bhSOut)}`, r.sOut > r.bhSOut ? GREEN : RED], ['VS 500 RANDOM POLICIES', pct(r.pct, 0), 'percentile out of sample', r.pct > 0.9 ? GREEN : GREY], ['DROP IN-SAMPLE → LATER', num(overfit), overfit > 0.5 ? 'signs of overfitting' : 'held up', overfit > 0.5 ? RED : GREEN]]);
    out.append(verdict(good ? `The agent beat buy & hold out of sample and did better than ${pct(r.pct, 0)} of random long/short/cash policies on the same states. With only 8 market states the rules are simple enough to inspect below; still, one test period is not proof.` : `Honest result: out of sample the agent ${r.sOut > r.bhSOut ? 'beat' : 'did not beat'} buy & hold on a risk-adjusted basis and did better than ${pct(r.pct, 0)} of random policies. ${overfit > 0.5 ? 'Its Sharpe fell sharply from training to testing, the classic sign of fitting noise. ' : ''}Reinforcement learning on daily prices mostly rediscovers “be long in uptrends”, which buy & hold already captures.`, good));
    const cb = chartBox(300); out.append(card(`OUT OF SAMPLE · GROWTH OF $1 (${r.costBp} BP PER SWITCH)`, cb));
    const two = el('div', 'fx-ml-grid'), dc = chartBox(240); out.append(two);
    two.append(card('THE LEARNED POLICY (WHAT IT DOES WHEN FLAT, LONG OR SHORT)', table(['Market state', 'Days', 'If flat', 'If long', 'If short'], r.policy.map(p => [p.label, String(p.days), ACT[p.fromCash], ACT[p.fromLong], ACT[p.fromShort]]), (i, j) => j >= 2 ? ACOL[[0, 0, r.policy[i].fromCash, r.policy[i].fromLong, r.policy[i].fromShort][j]] : i === r.now ? AMBER : null)),
      card('OUT-OF-SAMPLE SHARPE OF 500 RANDOM POLICIES (AMBER LINE = AGENT)', dc, note('Each random policy picks long, short or cash at random for each of the 24 state/position combinations. If the agent sits in the middle, it learned nothing useful.')));
    out.append(card('HOW IT WORKS', ...['State: price above or below its 50-day average, 20-day momentum up or down, volatility above or below its training median, and the current position (24 states). Actions: long, cash or short. Reward: the next day’s return on the position minus the switching cost.', `Q-learning (α 0.05, γ 0.9, ε-greedy exploration falling from 40% to 2%, 120 passes) is trained on the first 70% of history; five agents with different seeds vote. The last 30% is never seen in training.`, 'Delayed Yahoo Finance data. Not advice.'].map(note)));
    requestAnimationFrame(() => {
      lineChart(cb, {series: [{v: cum(r.bhOut), color: GREY, width: 1.2, name: 'Buy & hold'}, {v: cum(r.oos), color: AMBER, width: 1.8, name: 'Q-learning agent'}], xs: r.B.day.slice(r.cut, r.N - 1), log: true, yfmt: v => v.toFixed(2) + '×', aria: 'Out-of-sample growth'});
      const lo = r.randomSharpes[0], hi = r.randomSharpes[r.randomSharpes.length - 1], nb = 20, hist = new Array(nb).fill(0); r.randomSharpes.forEach(v => hist[Math.min(nb - 1, Math.floor((v - lo) / ((hi - lo) || 1) * nb))]++);
      const at = Math.min(nb - 1, Math.max(0, Math.floor((r.sOut - lo) / ((hi - lo) || 1) * nb)));
      bars(dc, {labels: hist.map((_, i) => (lo + (i + 0.5) * (hi - lo) / nb).toFixed(1)), values: hist, colors: hist.map((_, i) => i === at ? AMBER : GREY), fmt: v => v.toFixed(0), aria: 'Random policy Sharpe distribution'});
    });
  }

  /* --------------------------------------------- register --------------------------------------------- */
  const TOOLS = [
    ['mlpred', 'MLPRED', 'Predict tomorrow (ML)', 'Random forest, neural net, logistic vs always-up', renderMlpredPanel, renderMlpred, 'ai', ['mlpred'], ['predict']],
    ['volml', 'VOLML', 'Volatility forecast (ML)', 'GARCH, HAR and boosting vs naive, walk-forward', renderVolmlPanel, renderVolml, 'ai', ['volml'], ['volforecast']],
    ['regime', 'REGIME', 'Market regimes (GMM)', 'Gaussian mixture on trend and volatility', renderRegimePanel, renderRegime, 'ai', ['regime'], ['regimes']],
    ['pca', 'PCA', 'Hidden factors (PCA)', '50 stocks vs the random-matrix noise edge', renderPcaPanel, renderPca, 'analysis', ['pca'], ['factors']],
    ['pairs', 'PAIRS', 'Pairs trading test', 'Cointegration, multiple testing, out of sample', renderPairsPanel, renderPairs, 'analysis', ['pairs'], ['cointegration']],
    ['anomaly', 'ANOMALY', 'Anomaly detection', 'Isolation forest on returns, gaps, range, volume', renderAnomalyPanel, renderAnomaly, 'ai', ['anomaly'], ['anomalies']],
    ['rltrade', 'RLTRADE', 'Reinforcement learning trader', 'Q-learning long/short/cash vs buy & hold', renderRlPanel, renderRl, 'ai', ['rltrade'], ['rl']]
  ];
  for (const [k, code, title, desc, rp, page, cat, keys, aliases] of TOOLS) {
    T.PANELS[k] = [code, title, k]; T.PANEL_DESC[k] = desc; T.LINK_LABEL[k] = 'Full'; T.RENDER[k] = rp;
    if (PG) { for (const name of [k, ...aliases]) { T.premium?.(name, cat, title, keys); PG.add(name, title, page); } T.PAGE_NAMES.push(code, ...aliases.map(a => a.toUpperCase())); }
  }
  T.EXTRA_GROUPS.push(['AI lab', TOOLS.map(t => t[0])]);
  if (T.DESK_DEFS && !T.DESK_DEFS.ailab) {
    T.DESK_DEFS.ailab = {...T.DESK_DEFS.all, label: 'AI LAB', noun: 'AI lab', who: 'data-driven traders', slots: ['mlpred', 'regime', 'volml', 'anomaly', 'pairs', 'rltrade'],
      grid: {cols: '1fr 1fr 1fr', areas: ['s1 s2 s3', 's4 s5 s6']}};
    const si = T.DESK_ORDER.indexOf('strategy'), qi = T.DESK_ORDER.indexOf('quant'), at = si >= 0 ? si + 1 : qi >= 0 ? qi + 1 : 1; T.DESK_ORDER.splice(at, 0, 'ailab');
  }
  T.MLLab = {dirFeatures, mlpredRun, volmlRun, regimeRun, pcaRun, pairsRun, anomalyRun, rlRun};
});
