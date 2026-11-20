/* EARNINGS: the event study places each release on the right session, measures returns against the S&P 500,
 * matches consensus surprises, and reads the next date and the options-implied move. */
const fs = require('fs'), path = require('path');
global.window = {FynxTerminalPlugins: []}; global.document = {head: {append() {}}}; global.location = {hostname: 'fynxfinance.com'};
const stubEl = () => ({style: {setProperty() {}}, append() {}});
const T = {el: stubEl, btn: stubEl, svg: stubEl, $: () => null, panel: stubEl, setText() {}, store: {get: () => null, set() {}}, empty() {}, finite: v => typeof v === 'number' && Number.isFinite(v), report() {},
  PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {}, RENDER: {}, EXTRA_GROUPS: [['AI lab', []]], PAGE_NAMES: [], TABBED: new Set(), DESK_ORDER: ['all'], DESK_DEFS: {all: {}}, premium() {}, S: {}};
const pages = {}; const PG = {add: (n, l, r) => { pages[n] = r; }, setHead() {}, rerender() {}};
for (const f of ['quantlab.js', 'quantlab-research.js', 'earnings.js']) eval(fs.readFileSync(path.join(__dirname, '..', 'assets/js/terminal', f), 'utf8'));
for (const f of window.FynxTerminalPlugins) f(T, PG);
let fail = 0; const ok = (c, m) => { if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const E = T.Earnings, near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
ok(pages.earnprev && pages.eventstudy && T.PANELS.earnprev && T.EXTRA_GROUPS[0][1].includes('earnprev'), 'EARNINGS page, aliases and AI-lab panel registered');

// 400 weekdays; the market drifts, the stock follows it plus planted jumps on known reaction days.
let rs = 9; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647 - 0.5;
const day = [], sc = [], mc = []; let t = Date.parse('2025-01-02T12:00:00Z'), m = 500, s = 100;
const jumps = {'2025-04-25': 0.06, '2025-07-25': -0.05, '2025-10-24': 0.08, '2026-01-26': 0.03, '2026-04-24': -0.04};
while (day.length < 400) { const d = new Date(t), w = d.getUTCDay(); t += 86400000; if (w === 0 || w === 6) continue; const iso = d.toISOString().slice(0, 10), mr = rnd() * 0.004; m *= Math.exp(mr); s *= Math.exp(mr + rnd() * 0.0004 + (jumps[iso] || 0)); day.push(iso); mc.push(m); sc.push(s); }
const B = {day, c: sc, v: day.map((d, i) => jumps[d] ? 3e6 : 1e6)}, SPY = {day, c: mc};
// Thursday after close → reaction Friday; Friday before open → same day.
const d = {releases: [
  {filed: '2025-04-24', session: 'after close', tone: {tone: 0.6, guidance: 'raised'}},
  {filed: '2025-07-25', session: 'before open', tone: {tone: -0.5, guidance: 'lowered'}},
  {filed: '2025-10-23', session: 'after close', tone: {tone: 0.7, guidance: 'raised'}},
  {filed: '2026-01-26', session: 'before open', tone: {tone: 0.3, guidance: 'maintained'}},
  {filed: '2026-04-23', session: 'after close', tone: {tone: -0.2, guidance: 'maintained'}}],
  surprises: [{date: '2025-10-23', eps: 1.2, consensus: 1.1, surprisePct: 9.1}, {date: '2025-07-25', eps: 0.9, consensus: 1, surprisePct: -10}, {date: '2026-01-27', eps: 1, consensus: 0.98, surprisePct: 2}]};
const st = E.study(d, B, SPY), byFiled = Object.fromEntries(st.rows.map(r => [r.filed, r]));
ok(st.rows.length === 5 && Object.values(byFiled).every(r => jumps[r.day] !== undefined), 'each release lands on its reaction session: ' + st.rows.map(r => r.filed + '→' + r.day).join(', '));
ok(st.rows.every(r => Math.abs(r.react - jumps[r.day]) < 0.002), 'reaction-day abnormal return recovers each planted jump (market move removed)');
ok(st.rows.every(r => Math.abs(r.car3 - jumps[r.day]) < 0.004 && Math.abs(r.drift) < 0.01), 'three-day CAR ≈ the jump; no drift afterwards');
ok(near(st.avgMove, (0.06 + 0.05 + 0.08 + 0.03 + 0.04) / 5, 0.006) && st.ups === 3, `average absolute move ±${(st.avgMove * 100).toFixed(2)}%, up after 3 of 5`);
ok(st.beats === 3 && st.beatN === 2 && byFiled['2026-01-26'].surprise?.surprisePct === 2 && near(st.beatReact, (0.08 + 0.03) / 2, 0.002) && near(st.missReact, -0.05, 0.002), 'surprises matched within four days; beat 2 of 3, reaction after beats vs misses');
ok(st.rows.every(r => near(r.volx, 3, 1e-9)), 'reaction-day volume vs the prior 20 days = 3×');
ok(Math.abs(st.avgPath[5] - mean5(st.rows.map(r => r.react))) < 0.004 && Math.abs(st.avgPath[4]) < 0.004, 'event-study path jumps at day 0, flat before');
function mean5(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
ok(st.rho > 0.8 && st.rhoN === 5, `tone ranks with reactions: rho ${st.rho.toFixed(2)}`);
ok(near(E.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1) && near(E.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1) && Number.isNaN(E.spearman([1, 2], [1, 2])), 'Spearman rank correlation edge cases');

// Next date: the calendar wins; otherwise estimated from the usual spacing, always in the future.
T.S.earn = {events: [{symbol: 'BRK.B', date: '2026-12-02', time: 'After close', epsForecast: 1.31, lastYearEPS: 1.1, estimates: 9, fiscalQuarter: 'Oct/2026'}]};
const n1 = E.upcoming('BRK-B', st.rows), n2 = E.upcoming('XYZ', st.rows);
ok(n1.confirmed && n1.date === '2026-12-02' && n1.eps === 1.31 && n1.ests === 9, 'calendar date and consensus used when listed (BRK-B ↔ BRK.B)');
ok(!n2.confirmed && Date.parse(n2.date) >= Date.now() - 86400000 && E.upcoming('XYZ', []) === null, `estimated date ${n2.date} from the reporting rhythm`);
// Ordinary variance is 2 (%²) per calendar day in every expiry; only the 2026-12-05 expiry also holds a 6% report move.
T.S.opts = {generatedAt: '2026-11-19', underlyings: {XYZ: {expiries: [{date: '2026-11-21', dte: 2, movePercent: 2}, {date: '2026-11-28', dte: 9, movePercent: Math.sqrt(18)}, {date: '2026-12-02', dte: 13, movePercent: Math.sqrt(26)}, {date: '2026-12-05', dte: 16, movePercent: Math.sqrt(32 + 36)}]}}};
const im = E.impliedMove('XYZ', {date: '2026-12-02', time: 'After close'}, 0.01);
ok(im.post.date === '2026-12-05' && im.post.pre === '2026-12-02' && im.post.method === 'pre' && near(im.post.move, 0.06, 1e-12), `after-close report: the same-day expiry has no event in it; event move ${(im.post.move * 100).toFixed(2)}% of a ${(im.post.raw * 100).toFixed(2)}% straddle`);
const im2 = E.impliedMove('XYZ', {date: '2026-12-03', time: 'Before open'}, 0.01);
ok(im2.post.date === '2026-12-05' && im2.post.pre === '2026-12-02' && near(im2.post.move, 0.06, 1e-12), 'before-open report: nearest expiry on each side, event move = √(straddle² − earlier straddle² × T₂/T₁)');
const im3 = E.impliedMove('XYZ', {date: '2026-11-29', time: 'Before open'}, 0.01);
ok(im3.post.date === '2026-12-02' && near(im3.post.move, 0, 1e-9) && im3.post.raw > 0.05, 'an expiry with no extra variance prices no report move');
const solo = {generatedAt: 'x', underlyings: {ONE: {expiries: [{date: '2026-12-05', dte: 15, movePercent: 7}]}}}; T.S.opts = solo;
const im5 = E.impliedMove('ONE', {date: '2026-12-01', time: 'After close'}, 0.015);
ok(im5.post.method === 'history' && near(im5.post.move, Math.sqrt(0.0049 - 0.64 * 0.015 ** 2 * (Math.round(15 * 252 / 365) - 1)), 1e-12), 'no earlier expiry: ordinary days from the stock’s non-earnings volatility');
const im6 = E.impliedMove('ONE', {date: '2027-01-28', time: 'After close'}, 0.015);
ok(im6.post === null && im6.beyond && im6.last === '2026-12-05' && E.impliedMove('NONE', {date: '2026-12-02'}) === null, 'report after the last listed expiry is reported as such, not as a move');
ok(st.normalVol > 0 && st.normalVol < 0.01, `non-earnings daily volatility ${(st.normalVol * 100).toFixed(3)}% excludes the planted jumps`);
console.log(fail ? `${fail} earnings check(s) failed` : 'Earnings event study: sessions, abnormal returns, surprises, next date and implied move checks passed');
process.exit(fail ? 1 : 0);
