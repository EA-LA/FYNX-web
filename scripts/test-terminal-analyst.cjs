/* Analyst desk: DCF, reverse DCF, buyout maths, filings profile and the committee's rules. */
const fs = require('fs'), path = require('path');
global.window = {FynxTerminalPlugins: []}; global.document = {head: {append() {}}};
const stubEl = () => ({style: {setProperty() {}}, append() {}, set textContent(v) {}});
const T = {el: stubEl, btn: stubEl, svg: stubEl, $: () => null, panel: stubEl, setText() {}, store: {get: () => null, set() {}}, empty() {}, finite: v => typeof v === 'number' && Number.isFinite(v), report() {},
  PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {}, RENDER: {}, EXTRA_GROUPS: [['AI lab', []]], PAGE_NAMES: [], TABBED: new Set(), DESK_ORDER: ['all'], DESK_DEFS: {all: {}}, premium() {}};
const pages = {}; const PG = {add: (n, l, r) => { pages[n] = r; }, setHead() {}, rerender() {}};
for (const f of ['quantlab.js', 'quantlab-research.js', 'analyst.js']) eval(fs.readFileSync(path.join(__dirname, '..', 'assets/js/terminal', f), 'utf8'));
for (const f of window.FynxTerminalPlugins) f(T, PG);
let fail = 0; const ok = (c, m) => { if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const A = T.Analyst;
ok(pages.value && pages.dcf && pages.committee && pages.memo && T.RENDER.committee && T.PAGE_NAMES.includes('COMMITTEE'), 'VALUE and COMMITTEE pages registered');
// DCF with zero growth everywhere and terminal growth 0 = a perpetuity: value = FCF / WACC
const flat = A.dcf({rev0: 1000, g0: 0, margin: 0.1, wacc: 0.1, tg: 0, netDebt: 0, shares: 10});
ok(Math.abs(flat.ev - 1000) < 1e-6 && Math.abs(flat.perShare - 100) < 1e-9, 'no-growth DCF equals the perpetuity FCF / WACC: ' + flat.ev.toFixed(4));
// constant growth g with tg = g = Gordon growth on next year's cash flow
const gg = A.dcf({rev0: 1000, g0: 0.03, margin: 0.1, wacc: 0.09, tg: 0.03, netDebt: 200, shares: 10});
ok(Math.abs(gg.ev - 103 / 0.06) < 1e-6 && Math.abs(gg.perShare - (103 / 0.06 - 200) / 10) < 1e-9, 'constant growth DCF equals Gordon growth: ' + gg.ev.toFixed(2));
ok(Number.isNaN(A.dcf({rev0: 1, g0: 0, margin: 0.1, wacc: 0.03, tg: 0.03, netDebt: 0, shares: 1})), 'WACC ≤ terminal growth is rejected');
// reverse DCF recovers the growth used to make a price
const base = {rev0: 5e9, g0: 0.12, margin: 0.2, wacc: 0.085, tg: 0.025, netDebt: 1e9, shares: 1e8}, price = A.dcf(base).perShare;
ok(Math.abs(A.impliedGrowth(base, price) - 0.12) < 1e-6, 'reverse DCF recovers 12% growth');
// buyout: no growth, cash flow pays down debt; equity multiple > 1
const bo = A.lbo({mcap: 1000, netDebt: 0, fcf0: 100, fcfPath: [100, 100, 100, 100, 100], premium: 0.25, leverage: 5, rate: 0.08});
ok(bo && Math.abs(bo.entryEv - 1250) < 1e-9 && bo.debt0 === 500 && bo.debt1 < 500 && bo.moic > 1 && bo.irr > 0.05 && bo.irr < 0.2, `buyout: debt ${bo.debt0} → ${bo.debt1.toFixed(0)}, IRR ${(bo.irr * 100).toFixed(1)}%`);
// filings profile from an SEC-shaped object
const fin = {name: 'Test Corp', periods: ['2025-12-31', '2024-12-31', '2023-12-31', '2022-12-31'], annual: {}};
[[1331, 200, 2.0, 300, 60], [1210, 180, 1.8, 270, 55], [1100, 150, 1.5, 240, 50], [1000, 120, 1.2, 210, 45]].forEach(([rev, inc, eps, ocf, cap], i) => { fin.annual[fin.periods[i]] = {revenue: {value: rev * 1e6}, income: {value: inc * 1e6}, eps: {value: eps}, operatingCash: {value: ocf * 1e6}, capex: {value: cap * 1e6}, cash: {value: 300e6}, longTermDebt: {value: 500e6}}; });
const pf = A.profile(fin);
ok(Math.abs(pf.shares - 100e6) < 1 && Math.abs(pf.cagr - 0.1) < 1e-3 && Math.abs(pf.netDebt - 200e6) < 1 && Math.abs(pf.fcf[0] - 240e6) < 1, `profile: shares ${pf.shares / 1e6}M, 3y CAGR ${(pf.cagr * 100).toFixed(1)}%, net debt ${pf.netDebt / 1e6}M`);
const sc = A.scenarios(pf, 50, 1.1);
ok(sc.cases.bear.perShare < sc.cases.base.perShare && sc.cases.base.perShare < sc.cases.bull.perShare && sc.wacc > 0.07 && sc.wacc < 0.11, `scenarios ordered: ${sc.cases.bear.perShare.toFixed(1)} < ${sc.cases.base.perShare.toFixed(1)} < ${sc.cases.bull.perShare.toFixed(1)}, WACC ${(sc.wacc * 100).toFixed(2)}%`);
ok(A.profile({periods: ['2025-12-31'], annual: {'2025-12-31': {revenue: {value: 1}}}}) === null, 'profile refuses one year of data');
// headline tone and committee rules
ok(A.headlineTone('Apple beats estimates, raises dividend') > 0 && A.headlineTone('Tesla shares plunge after recall and probe') < 0 && A.headlineTone('Company did not miss targets') > 0, 'headline tone with negation');
const mk = drift => { const B = {o: [], h: [], l: [], c: [], v: []}; let p = 100; for (let i = 0; i < 400; i++) { const o = p; p *= Math.exp(drift + 0.01 * Math.sin(i * 1.7)); B.o.push(o); B.c.push(p); B.h.push(Math.max(o, p) * 1.005); B.l.push(Math.min(o, p) * 0.995); B.v.push(1e6); } return B; };
const up = A.committee('UP', null, mk(0.002), mk(0.0005), [{title: 'Stock surges to record on strong growth'}]), dn = A.committee('DN', null, mk(-0.002), mk(-0.001), [{title: 'Shares plunge after downgrade and weak guidance'}]);
ok(up.score > 0.2 && dn.score < -0.2 && ['BUY', 'ACCUMULATE'].includes(up.decision) && ['SELL', 'REDUCE'].includes(dn.decision), `committee: uptrend ${up.decision} (${up.score.toFixed(2)}), downtrend ${dn.decision} (${dn.score.toFixed(2)})`);
ok(up.sizes.every(s => s.size > 0 && s.size <= 0.1 && s.stop < up.t.last) && up.sizes[0].size >= up.sizes[2].size, 'risk team: sizes capped, stops below price, aggressive ≥ conservative');
const memo = A.memoText('UP', 'Up Inc', up, null, [{title: 'Stock surges', publisher: 'Wire'}]);
ok(/DECISION: (BUY|ACCUMULATE)/.test(memo) && /BULL CASE/.test(memo) && /RISK TEAM/.test(memo) && /Not investment advice/.test(memo), 'memo has decision, bull case, risk team and disclaimer');
console.log(fail ? `${fail} analyst check(s) failed` : 'Analyst desk: DCF, reverse DCF, buyout, filings profile, committee and memo checks passed');
process.exit(fail ? 1 : 0);
