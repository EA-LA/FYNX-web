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
  const v = await L.volmlRun('SPY', 5);
  ok(v.M.garch.qlike < v.M.naive.qlike && v.M.har.qlike < v.M.naive.qlike, `VOLML on GARCH data: QLIKE garch ${v.M.garch.qlike.toFixed(3)}, har ${v.M.har.qlike.toFixed(3)}, gbm ${v.M.gbm.qlike.toFixed(3)} < naive ${v.M.naive.qlike.toFixed(3)}`);
  ok(Object.values(v.now).every(x => x > 0.03 && x < 2) && Number.isFinite(v.dm.gbmNaive.t), 'VOLML: forecasts and Diebold–Mariano finite');
  const rg = await L.regimeRun('SPY', 2);
  const bear = rg.regimes[1], bull = rg.regimes[0];
  const agree = rg.state.filter((st, i) => st === Math.floor(rg.idx[i] / 400) % 2).length / rg.state.length;
  ok(bear.vol > bull.vol * 1.3 && agree > 0.75, `REGIME: stressed vol ${(bear.vol * 100).toFixed(0)}% > calm ${(bull.vol * 100).toFixed(0)}%; matches the planted regimes on ${(agree * 100).toFixed(0)}% of days`);
  ok(rg.trans.every((row, i) => row[i] > 0.85) && Math.abs(rg.nowP.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'REGIME: sticky transitions, probabilities sum to 1');
  const pc = await L.pcaRun('2y');
  ok(pc.P.N === 50 && pc.P.signal <= 2 && pc.roll.length > 30, `PCA: independent walks give ${pc.P.signal} factor(s) above the noise edge`);
  const pr = await L.pairsRun(['KO', 'PEP', 'XOM', 'CVX', 'JPM', 'BAC', 'HD', 'LOW', 'V', 'MA']);
  ok(pr.m === 45 && pr.sig.some(x => (x.a === 'KO' && x.b === 'PEP') || (x.a === 'PEP' && x.b === 'KO')), `PAIRS: planted KO/PEP pair found among ${pr.sig.length} significant of ${pr.m} (chance ${pr.expected.toFixed(2)})`);
  const kp = pr.sig.find(x => x.a === 'KO' || x.b === 'KO'); ok(kp && kp.pTest < 0.05 && kp.half < 30, 'PAIRS: planted pair still cointegrated out of sample, half-life ' + kp?.half.toFixed(1));
  const an = await L.anomalyRun('CRASH', 1);
  ok(an.list[0] && Math.abs(an.list.findIndex(a => an.B.day[a.i] === days[2400])) < 3, 'ANOMALY: injected crash is among the top 3 (' + an.list.slice(0, 3).map(a => an.B.day[a.i] + ' ' + a.why).join('; ') + ')');
  const rl = await L.rlRun('SPY', 5);
  ok(rl.policy.length === 8 && rl.randomSharpes.length === 500 && Number.isFinite(rl.sOut) && rl.pct >= 0 && rl.pct <= 1, `RLTRADE: OOS Sharpe ${rl.sOut.toFixed(2)} vs B&H ${rl.bhSOut.toFixed(2)}, percentile ${(rl.pct * 100).toFixed(0)}`);
  console.log(fail ? `${fail} AI lab check(s) failed` : 'AI lab pages: predictor, volatility, regimes, PCA, pairs, anomaly and RL pipelines passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
