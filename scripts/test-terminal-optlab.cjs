/* OPTLAB: Black-76 pricing, implied-volatility inversion, put–call parity forwards and the four pricing models on a
 * synthetic option chain with a known smile and term structure. */
const fs = require('fs'), path = require('path');
global.window = {FynxTerminalPlugins: [], FynxMLCore: require('../assets/js/terminal/mllab-core.js')}; global.document = {head: {append() {}}};
const stub = () => ({style: {}, append() {}});
const T = {el: stub, btn: stub, svg: stub, $: () => null, panel: stub, setText() {}, store: {get: () => null, set() {}}, empty() {}, finite: v => typeof v === 'number' && Number.isFinite(v), report() {}, S: {}, PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {}, RENDER: {}, EXTRA_GROUPS: [['AI lab', []]], PAGE_NAMES: [], DESK_DEFS: {all: {}}, DESK_ORDER: [], TABBED: new Set(), premium() {}};
const pages = {}; for (const f of ['quantlab.js', 'quantlab-research.js', 'optlab.js']) eval(fs.readFileSync(path.join(__dirname, '..', 'assets/js/terminal', f), 'utf8'));
for (const f of window.FynxTerminalPlugins) f(T, {add: (n, l, r) => { pages[n] = r; }, setHead() {}, rerender() {}});
let fail = 0; const ok = (c, m) => { if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const O = T.OptLab;
ok(pages.optlab && pages.ivsurf && T.RENDER.optlab && T.PAGE_NAMES.includes('OPTLAB'), 'OPTLAB page, aliases and panel registered');
// Black-76: put–call parity and a textbook value (F = K = 100, σ = 20%, T = 1, no discounting: 7.9656)
const c = O.black(100, 100, 1, 0.2, 1, true), p = O.black(100, 100, 1, 0.2, 1, false);
ok(Math.abs(c - 7.9656) < 1e-3 && Math.abs(c - p) < 1e-9, 'Black-76 at the money: ' + c.toFixed(4));
const D = Math.exp(-0.043 * 0.25), c2 = O.black(105, 100, 0.25, 0.3, D, true), p2 = O.black(105, 100, 0.25, 0.3, D, false);
ok(Math.abs((c2 - p2) - D * (105 - 100)) < 1e-9, 'put–call parity C − P = D(F − K)');
ok([0.08, 0.2, 0.55, 1.4].every(s => Math.abs(O.implied(O.black(100, 92, 0.1, s, D, false), 100, 92, 0.1, D, false) - s) < 1e-6), 'implied volatility inverts Black-76');
// synthetic chain: smile σ = atm(T) − 0.4k + 1.5k², spreads of ±2% of price (min 1 cent)
const spot = 500, r = 0.043, smileIV = (k, Tm) => 0.16 + 0.05 * Math.exp(-Tm * 20) - 0.4 * k + 1.5 * k * k;
const expiries = [3, 7, 10, 14, 21, 30, 45, 60].map((dte, j) => {
  const Tm = dte / 365, Dd = Math.exp(-r * Tm), F = spot * Math.exp((r - 0.013) * Tm), chain = [];
  for (let i = -10; i <= 10; i++) { const K = Math.round(spot * (1 + i * 0.01)), k = Math.log(K / F), s = smileIV(k, Tm), q = (call) => { const px = O.black(F, K, Tm, s, Dd, call), h = Math.max(0.01, px * 0.02); return {bid: +(px - h).toFixed(4), ask: +(px + h).toFixed(4), iv: s, delta: 0, volume: 10, oi: 100}; }; chain.push({strike: K, call: q(true), put: q(false)}); }
  return {date: `2026-12-${String(j + 1).padStart(2, '0')}`, dte, chain};
});
const a = O.analyse({symbol: 'TEST', price: spot, expiries});
ok(a.exps.length === 8 && Math.abs(a.exps[3].F - spot * Math.exp((0.043 - 0.013) * 14 / 365)) < 0.05, `forward from put–call parity: ${a.exps[3].F.toFixed(3)}`);
ok(a.quotes.every(q => q.call === (q.K >= q.F)) && a.train.length + a.test.length === a.quotes.length && a.test.length > 30, `${a.quotes.length} out-of-the-money quotes, ${a.test.length} held out`);
const S = a.sc;
ok(S.quad.inside > 0.9 && S.nn.inside > 0.6 && S.flat.inside < 0.3 && S.nn.ivRmse < S.term.ivRmse && S.term.ivRmse < S.flat.ivRmse, `in spread: flat ${(S.flat.inside * 100).toFixed(0)}%, term ${(S.term.inside * 100).toFixed(0)}%, quadratic ${(S.quad.inside * 100).toFixed(0)}%, neural net ${(S.nn.inside * 100).toFixed(0)}%`);
const evaluation = a.exps.map(e => [e.date, a.evaluation.get(e.date)]);
ok(evaluation.reduce((n, [, row]) => n + (row?.n || 0), 0) === a.test.length, 'expiry evaluation uses the evaluation subset only');
for (const model of Object.keys(S)) {
  const withQuotes = evaluation.map(([, row]) => row).filter(Boolean);
  const inSpread = withQuotes.reduce((n, row) => n + row.scores[model].insideCount, 0);
  const sse = withQuotes.reduce((n, row) => n + row.n * row.scores[model].rmse ** 2, 0);
  ok(inSpread === S[model].insideCount && Math.abs(Math.sqrt(sse / a.test.length) - S[model].rmse) < 1e-9, model + ' expiry counts and squared errors reconcile to global evaluation');
}
const shifted = [0, 1, 2, 3, 4, 5].map(j => ({...expiries[6], date: '2027-01-0' + (j + 1), chain: expiries[6].chain.slice(8, 13)}));
const sparse = O.analyse({symbol: 'SPARSE', price: spot, expiries: shifted});
ok(sparse.exps.some(e => !sparse.test.some(q => q.exp === e.date) && sparse.evaluation.get(e.date) === null), 'no evaluation quotes is unavailable, not zero model error');
console.log(fail ? `${fail} options lab check(s) failed` : 'Options lab: Black-76, implied volatility, parity forwards and model ranking checks passed');
process.exit(fail ? 1 : 0);
