/* FACTORLOOP: rank IC maths and the research loop on synthetic stocks with a planted momentum effect. */
const fs = require('fs'), path = require('path');
global.window = {FynxTerminalPlugins: []}; global.document = {head: {append() {}}};
const stubEl = () => ({style: {}, append() {}});
const M = require('../assets/js/terminal/mllab-core.js'), r0 = M.rng(31);
const T = {el: stubEl, btn: stubEl, svg: stubEl, $: () => null, panel: stubEl, setText() {}, store: {get: () => null, set() {}}, empty() {}, finite: v => typeof v === 'number' && Number.isFinite(v), report() {},
  PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {}, RENDER: {}, EXTRA_GROUPS: [['AI lab', []]], PAGE_NAMES: [], TABBED: new Set(), DESK_ORDER: ['all'], DESK_DEFS: {all: {}}, premium() {}};
const pages = {}; const PG = {add: (n, l, r) => { pages[n] = r; }, setHead() {}, rerender() {}};
for (const f of ['quantlab.js', 'quantlab-research.js', 'factorloop.js']) eval(fs.readFileSync(path.join(__dirname, '..', 'assets/js/terminal', f), 'utf8'));
for (const f of window.FynxTerminalPlugins) f(T, PG);
let fail = 0; const ok = (c, m) => { if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const F = T.FactorLoop;
ok(pages.factorloop && pages.rdagent && T.RENDER.factorloop && T.PAGE_NAMES.includes('FACTORLOOP'), 'FACTORLOOP page, aliases and panel registered');
ok(Math.abs(F.spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-12 && Math.abs(F.spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-12 && JSON.stringify(F.rank([3, 1, 3, 2])) === JSON.stringify([2.5, 0, 2.5, 1]), 'Spearman and tied ranks');
// 40 stocks: each has a slow-moving expected return (AR(1)), so past 126-day returns predict the next month
const N = 40, Tn = 1300, prices = [], dates = [];
for (let t = 0; t < Tn; t++) dates.push(new Date(Date.UTC(2021, 0, 1) + t * 86400000).toISOString().slice(0, 10));
for (let i = 0; i < N; i++) { let p = 100, mu = 0; const a = []; for (let t = 0; t < Tn; t++) { mu = 0.995 * mu + 0.00012 * M.gauss(r0); p *= Math.exp(mu + 0.015 * M.gauss(r0)); a.push(p); } prices.push(a); }
const D = F.prepare({symbols: Array.from({length: N}, (_, i) => 'S' + i), prices, dates});
const mom = F.evaluate(D, {parts: [{fam: 'mom', p: [126, 0]}]}, D.days), noise = F.evaluate(D, {parts: [{fam: 'skew', p: [63]}]}, D.days);
ok(mom.ic > 0.1 && mom.t > 3 && Math.abs(noise.ic) < 0.08, `planted momentum IC ${mom.ic.toFixed(3)} (t ${mom.t.toFixed(1)}), unrelated skew IC ${noise.ic.toFixed(3)}`);
const flipped = F.evaluate(D, {parts: [{fam: 'mom', p: [126, 0], s: -1}]}, D.days);
ok(Math.abs(flipped.ic + mom.ic) < 1e-9, 'a reversed part flips the IC exactly');
(async () => {
  const r = await F.loop(D, 7, 5);
  ok(r.tried >= 15 && r.log.every(l => l.say && l.key && l.origin), `loop ran ${r.tried} hypotheses with plain-English descriptions`);
  ok(['mom', 'high', 'steady'].includes(r.best.cand.parts[0].fam) && r.oos.ic > 0.05 && r.oos.t > 2, `loop found a trend factor (${r.best.key}); unseen IC ${r.oos.ic.toFixed(3)}, t ${r.oos.t.toFixed(1)}`);
  ok(r.all.every(a => new Set(a.cand.parts.map(p => p.fam + p.p.join(','))).size === a.cand.parts.length), 'no hypothesis repeats an ingredient');
  ok(r.bonf >= 0 && r.bonf <= 1 && Number.isFinite(r.corr), 'multiple-testing p and research→unseen correlation computed');
  ok(r.evidence.length === r.oos.n && r.evidence.every((w, i) => w.from === dates[D.oosDays[i]] && w.through === dates[D.oosDays[i] + 21] && w.n === N),
    'winner evidence shows the exact later-window close dates and counts');
  ok(Math.abs(r.evidence.reduce((n, w) => n + w.ic, 0) / r.oos.n - r.oos.ic) < 1e-12 &&
    r.evidence.every((w, i) => w.spread === r.oos.lsSeries[i]), 'window ICs and signed log spreads reconcile to summary');
  const skip = D.oosDays[0], fixtures = [], sparse = {...D, fwd: {...D.fwd, [skip]: Array(N).fill(NaN)}};
  F.evaluate(sparse, r.best.cand, D.oosDays.slice(0, 2), fixtures);
  ok(fixtures.length === 1 && fixtures[0].from === dates[D.oosDays[1]], 'skipped windows never look like zero-return observations');
  console.log(fail ? `${fail} factor loop check(s) failed` : 'Factor research loop: IC maths, planted factor discovery and out-of-sample checks passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
