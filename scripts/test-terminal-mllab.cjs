/* AI LAB pages end to end on synthetic markets with known structure (no network). */
const fs = require('fs'), path = require('path');
global.window = {FynxTerminalPlugins: [], FynxMLCore: require('../assets/js/terminal/mllab-core.js')};
global.document = {head: {append() {}}};
const M = window.FynxMLCore, rand = M.rng(2024), g = () => M.gauss(rand);
const days = []; for (let d = new Date(Date.UTC(2015, 0, 1)); days.length < 2600; d = new Date(+d + 86400000)) if (d.getUTCDay() % 6) days.push(d.toISOString().slice(0, 10));
// GARCH(1,1) returns with two drift regimes; a crash on day 2400
function market(seed, {crash = false} = {}) {
  const r0 = M.rng(seed), B = {o: [], h: [], l: [], c: [], v: [], t: [], tod: [], dow: [], day: [], name: 'Synthetic'}; let p = 100, h = 1e-4;
  for (let i = 0; i < days.length; i++) {
    const regime = Math.floor(i / 400) % 2, z = M.gauss(r0); let ret = (regime ? -0.0004 : 0.0007) + Math.sqrt(h) * z;
    if (crash && i === 2400) ret = -0.09; h = (regime ? 1.2e-5 : 2e-6) + 0.08 * Math.min(ret * ret, 4e-3) + 0.9 * h;
    const o = p * Math.exp(0.001 * M.gauss(r0)); p *= Math.exp(ret);
    B.o.push(o); B.c.push(p); B.h.push(Math.max(o, p) * (1 + Math.abs(ret) * 0.5 + 0.002)); B.l.push(Math.min(o, p) * (1 - Math.abs(ret) * 0.5 - 0.002)); B.v.push((1e6 * (1 + 30 * Math.abs(ret))) * (crash && i === 2400 ? 6 : 1)); B.t.push(i); B.tod.push(570); B.dow.push(1); B.day.push(days[i]);
  }
  return B;
}
const closes = {}; const walk = s => { const r0 = M.rng(s); let p = 50; return days.map(() => (p *= Math.exp(0.012 * M.gauss(r0)))); };
const base = walk(999); const coA = base, coB = base.map((v, i) => v * Math.exp(0.02 * Math.sin(i / 9) + 0.01 * g()));
const T = {el: () => ({style: {}, append() {}}), btn: () => ({}), svg: () => ({}), $: () => null, panel: () => null, setText() {}, store: {get: () => null, set() {}}, empty() {}, finite: v => typeof v === 'number' && Number.isFinite(v), report() {},
  PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {}, RENDER: {}, EXTRA_GROUPS: [], PAGE_NAMES: [], TABBED: new Set(), DESK_ORDER: ['all', 'world', 'quant', 'strategy'], DESK_DEFS: {all: {}},
  fnMarket: async q => {
    if (q.op === 'bars' && q.symbol === 'SPARSE') { const B = market(1); B.h[780] = 0; return B; }
    if (q.op === 'bars') return q.symbol === 'CRASH' ? market(5, {crash: true}) : market(q.symbol === 'SPY' ? 1 : 3);
    const syms = q.symbols.split(','), last = q.range === '2y' ? 504 : 1260, ds = days.slice(-last);
    return {dates: ds, names: {}, failed: {}, series: Object.fromEntries(syms.map((s, k) => [s, (s === 'KO' ? coA : s === 'PEP' ? coB : (closes[s] ||= walk([...s].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0))).slice(-last)]))};
  }};
const pages = {}, premium = {}; T.premium = (n, c) => { premium[n] = c; };
const PG = {add: (n, l, r) => { pages[n] = r; }, setHead() {}, rerender() {}};
for (const f of ['quantlab.js', 'quantlab-research.js', 'quantlab-strategy.js', 'mllab.js']) eval(fs.readFileSync(path.join(__dirname, '..', 'assets/js/terminal', f), 'utf8'));
for (const f of window.FynxTerminalPlugins) f(T, PG);
let fail = 0; const ok = (c, m) => { if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  const L = T.MLLab;
  ok(['mlpred', 'volml', 'regime', 'pca', 'pairs', 'anomaly', 'rltrade'].every(k => T.RENDER[k] && pages[k] && premium[k]) && T.DESK_DEFS.ailab && T.DESK_ORDER.includes('ailab'), 'seven tools registered as premium pages, panels and the AI LAB desk');
  const p = await L.mlpredRun('SPY', 252);
  ok(p.res.length === 3 && p.res.every(m => m.acc > 0.4 && m.acc < 0.62 && m.p >= 0 && m.p <= 1) && p.now.every(v => v > 0 && v < 1), 'MLPRED: walk-forward accuracies ' + p.res.map(m => m.acc.toFixed(3)).join(', ') + ' vs always-up ' + Math.max(p.base, 1 - p.base).toFixed(3));
  ok(p.test.length > 1000 && p.test[0] >= 750 && Math.abs(p.imp.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'MLPRED: ' + p.test.length + ' test days, never trained on them');
  const bins = L.probabilityCalibration([0, .2, .399, .4, .6, .8, 1, NaN, -1, .5], [0, 1, 0, 1, 0, 0, 1, 1, 1, 2], [0,1,2,3,4,5,6,7,8,9]);
  ok(bins.map(b => b.n).join(',') === '1,2,1,1,2' && bins[1].observed === .5 && bins[4].observed === .5 &&
    Math.abs(bins[4].forecast - .9) < 1e-12, 'MLPRED: reliability bins handle boundaries and skip invalid forecasts/outcomes');
  ok(L.probabilityCalibration([.5], [1], [])[2].observed === null, 'MLPRED: empty holdouts do not fabricate a zero outcome');
  ok(p.res.every(m => m.calibration.reduce((n, b) => n + b.n, 0) === p.test.length &&
    Math.abs(m.calibration.reduce((n, b) => n + b.n * (b.observed || 0), 0) - p.ups) < 1e-8), 'MLPRED: real run calibration reconciles with holdout days and up days');
  const fitGBM = M.gbmFit;
  let v;
  for (const H of [5, 10, 22]) {
    const fits = [];
    M.gbmFit = (X, y, options) => { fits.push({size: X.length, labels: y.length}); return fitGBM(X, y, options); };
    let result;
    try { result = await L.volmlRun('SPY', H); }
    finally { M.gbmFit = fitGBM; }
    if (H === 5) v = result;
    const ends = [];
    for (let t0 = result.start; t0 < result.n; t0 += 252) ends.push(t0 - H);
    ends.push(result.n);
    ok(fits.length === ends.length * 2, `VOLML H=${H}: walk-forward years and latest forecast each run one inner fit`);
    for (const [i, end] of ends.entries()) {
      const outer = fits[2 * i], inner = fits[2 * i + 1], hold = end - 252, origin = result.idx[hold];
      ok(outer?.size === end && outer.labels === end, `VOLML H=${H} fold ${i}: outer model fit is unchanged`);
      ok(inner?.labels === inner?.size && result.idx[inner?.size - 1] + H <= origin
        && (inner.size === hold || result.idx[inner.size] + H > origin), `VOLML H=${H} fold ${i}: helper uses every available label and no future return`);
    }
    if (process.env.VOLML_MEASURE) console.log(`VOLML H=${H}: synthetic GBM QLIKE=${result.M.gbm.qlike.toFixed(6)}, now=${(result.now.gbm * 100).toFixed(6)}%; folds=${ends.length}`);
  }
  // Dropped feature rows are not elapsed time. A label ending at the first
  // calibration origin is valid, even when it is fewer than H rows back.
  const ids = Array.from({length: 450}, (_, i) => 20 + 2 * i + Math.floor(i / 7));
  const inputs = ids.map(i => [i]), labels = ids.map(() => 1), params = {minLeaf: 50};
  const sparseFits = [], sparsePredictions = [];
  M.gbmFit = (X, y) => { sparseFits.push({X, y}); return {predict: row => { sparsePredictions.push(row[0]); return 0; }}; };
  try {
    for (const H of [5, 10, 22]) {
      const k = ids.length - 252, expected = ids.slice(0, k).filter(i => i + H <= ids[k]);
      const bias = L.gbmHeldoutBias?.(inputs, labels, ids, H, ids.length, params);
      const fit = sparseFits.shift();
      ok(bias === 1 && fit?.X.map(row => row[0]).join(',') === expected.join(',') && fit.y.length === expected.length
        && sparsePredictions.splice(0).join(',') === ids.slice(k).join(','), `VOLML H=${H}: gapped origins preserve the full held-out sample and use actual return endpoints`);
    }
    ok(L.gbmHeldoutBias?.(inputs, labels, ids, 22, 310, params) === 0 && sparseFits.length === 0,
      'VOLML: no calibration fit or correction is reported when the separate training sample is too small');
  } finally { M.gbmFit = fitGBM; }
  let sparseRejected = false;
  try { await L.volmlRun('SPARSE', 22); }
  catch (error) { sparseRejected = /not enough complete observations/i.test(error.message); }
  ok(sparseRejected, 'VOLML: too few complete feature rows cannot produce a backtest winner');
  ok(v.M.garch.qlike < v.M.naive.qlike && v.M.har.qlike < v.M.naive.qlike, `VOLML on GARCH data: QLIKE garch ${v.M.garch.qlike.toFixed(3)}, har ${v.M.har.qlike.toFixed(3)}, gbm ${v.M.gbm.qlike.toFixed(3)} < naive ${v.M.naive.qlike.toFixed(3)}`);
  ok(Object.values(v.now).every(x => x > 0.03 && x < 2) && Number.isFinite(v.dm.gbmNaive.t), 'VOLML: forecasts and Diebold–Mariano finite');
  const rg = await L.regimeRun('SPY', 2);
  const bear = rg.regimes[1], bull = rg.regimes[0];
  const agree = rg.state.filter((st, i) => st === Math.floor(rg.idx[i] / 400) % 2).length / rg.state.length;
  ok(bear.vol > bull.vol * 1.3 && agree > 0.75, `REGIME: stressed vol ${(bear.vol * 100).toFixed(0)}% > calm ${(bull.vol * 100).toFixed(0)}%; matches the planted regimes on ${(agree * 100).toFixed(0)}% of days`);
  ok(rg.trans.every((row, i) => row[i] > 0.85) && Math.abs(rg.nowP.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'REGIME: sticky transitions, probabilities sum to 1');
  ok(rg.oos.reduce((n, row) => n + row.days, 0) === rg.idx.length - Math.floor(rg.idx.length * .7) &&
    rg.oos.reduce((n, row) => n + row.n, 0) === rg.oos.reduce((n, row) => n + row.days, 0) - 1,
    'REGIME: held-out counts reconcile; last labeled day is not counted as having a future return');
  const sparse = L.regimeForwardStats([0, 1, 1], [.03, NaN, undefined], 2);
  ok(sparse[0].n === 1 && sparse[1].days === 2 && sparse[1].n === 0 && sparse.every(x => !Number.isFinite(x.nextVol)),
    'REGIME: sparse or missing returns never look like zero volatility');
  const holdRows = Array.from({length: 80}, (_, i) => [Math.sin(i), i < 40 ? -1 + .02 * Math.cos(i) : 1 + .02 * Math.cos(i)]);
  const holdIdx = holdRows.map((_, i) => i), holdReturns = holdIdx.map(i => Math.sin(i) / 100);
  const originalStandardizer = M.standardizer, originalGmm = M.gmmFit;
  let scaled, fitted;
  M.standardizer = rows => { scaled = rows; return originalStandardizer(rows); };
  M.gmmFit = (rows, ...args) => { fitted = rows; return originalGmm(rows, ...args); };
  let holdout;
  try { holdout = L.regimeHoldout(holdRows, holdIdx, holdReturns, 2); }
  finally { M.standardizer = originalStandardizer; M.gmmFit = originalGmm; }
  ok(holdout.cut === 56 && scaled.length === 56 && scaled.every((row, i) => row === holdRows[i]) && fitted.length === 56,
    'REGIME: neither standardization nor mixture fitting sees held-out observations');
  const pc = await L.pcaRun('2y');
  ok(pc.P.N === 50 && pc.P.signal <= 2 && pc.roll.length > 30, `PCA: independent walks give ${pc.P.signal} factor(s) above the noise edge`);
  const pr = await L.pairsRun(['KO', 'PEP', 'XOM', 'CVX', 'JPM', 'BAC', 'HD', 'LOW', 'V', 'MA']);
  ok(pr.m === 45 && pr.sig.some(x => (x.a === 'KO' && x.b === 'PEP') || (x.a === 'PEP' && x.b === 'KO')), `PAIRS: planted KO/PEP pair found among ${pr.sig.length} significant of ${pr.m} (chance ${pr.expected.toFixed(2)})`);
  const spread = L.pairSpreadSeries({z: [5, 7, -.5, -9, Infinity]}, 3);
  ok(spread.formation[0] === 6 && spread.formation[1] === -.5 && Number.isNaN(spread.formation[2]) &&
    Number.isNaN(spread.later[0]) && spread.later[1] === -.5 && spread.later[2] === -6 && Number.isNaN(spread.later[3]),
    'PAIRS: chart aligns close-indexed spreads with the shorter date series and clips finite display values');
  ok(pr.cutDay === pr.A.dates[pr.cut - 2] && pr.sig.every(pair => L.pairSpreadSeries(pair, pr.cut).later.length === pr.A.dates.length),
    'PAIRS: formation end date and every selectable spread align with the chart axis');
  const kp = pr.sig.find(x => x.a === 'KO' || x.b === 'KO'); ok(kp && kp.pTest < 0.05 && kp.half < 30, 'PAIRS: planted pair still cointegrated out of sample, half-life ' + kp?.half.toFixed(1));
  const an = await L.anomalyRun('CRASH', 1);
  ok(an.list[0] && Math.abs(an.list.findIndex(a => an.B.day[a.i] === days[2400])) < 3, 'ANOMALY: injected crash is among the top 3 (' + an.list.slice(0, 3).map(a => an.B.day[a.i] + ' ' + a.why).join('; ') + ')');
  const rl = await L.rlRun('SPY', 5);
  ok(rl.policy.length === 8 && rl.randomSharpes.length === 500 && Number.isFinite(rl.sOut) && rl.pct >= 0 && rl.pct <= 1, `RLTRADE: OOS Sharpe ${rl.sOut.toFixed(2)} vs B&H ${rl.bhSOut.toFixed(2)}, percentile ${(rl.pct * 100).toFixed(0)}`);
  console.log(fail ? `${fail} AI lab check(s) failed` : 'AI lab pages: predictor, volatility, regimes, PCA, pairs, anomaly and RL pipelines passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
