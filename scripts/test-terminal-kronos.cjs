/* KRONOS Terminal page: market calendar for future bars, time features and forecast-range summaries. */
const fs = require('fs'), path = require('path');
global.window = {FynxTerminalPlugins: []};
global.document = {head: {append() {}}};
global.Worker = function () {};
const stubEl = () => ({style: {}, append() {}, set textContent(v) {}});
const T = {el: stubEl, btn: stubEl, svg: stubEl, $: () => null, panel: stubEl, setText() {}, store: {get: () => null, set() {}}, empty() {}, finite: v => typeof v === 'number' && Number.isFinite(v), report() {},
  PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {}, RENDER: {}, EXTRA_GROUPS: [], PAGE_NAMES: [], TABBED: new Set(), DESK_ORDER: ['all', 'world'], DESK_DEFS: {all: {}}};
const pages = {};
const PG = {add: (n, l, r) => { pages[n] = r; }, setHead() {}, rerender() {}};
for (const f of ['quantlab.js', 'quantlab-research.js', 'quantlab-strategy.js', 'kronos.js']) eval(fs.readFileSync(path.join(__dirname, '..', 'assets/js/terminal', f), 'utf8'));
for (const f of window.FynxTerminalPlugins) f(T, PG);
let fail = 0; const ok = (c, m) => { if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const K = T.Kronos;
ok(K && T.RENDER.kronos && pages.kronos && T.PAGE_NAMES.includes('KRONOS') && T.EXTRA_GROUPS.some(g => g[1].includes('kronos')), 'registered page, panel and command');
// daily US stock bars: last bar Friday 2026-11-20; next bars skip the weekend
const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const iso = d => d.toISOString().slice(0, 10);
function dailyBars(endY, endM, endD, n, weekends) {
  const B = {o: [], h: [], l: [], c: [], v: [], t: [], tod: [], dow: [], day: []}; let d = day(endY, endM, endD);
  const out = []; while (out.length < n) { if (weekends || (d.getUTCDay() % 6)) out.unshift(iso(d)); d = new Date(+d - 86400000); }
  out.forEach((s, i) => { B.day.push(s); B.dow.push(9); B.tod.push(570); B.t.push(i); B.o.push(100); B.h.push(101); B.l.push(99); B.c.push(100); B.v.push(1); });
  return B;
}
const f1 = K.futureBars(dailyBars(2026, 11, 20, 300, false), '1d', 6);
ok(f1.labels.join() === '2026-11-23,2026-11-24,2026-11-25,2026-11-26,2026-11-27,2026-11-30', 'stock daily calendar skips weekends: ' + f1.labels.join(' '));
ok(JSON.stringify(f1.stamps[0]) === JSON.stringify([0, 0, 0, 23, 11]) && f1.stamps[4][2] === 4, 'daily stamps: 00:00, Monday = 0, day 23, month 11');
const f2 = K.futureBars(dailyBars(2026, 11, 22, 300, true), '1d', 3);
ok(f2.labels.join() === '2026-11-23,2026-11-24,2026-11-25', 'crypto daily calendar includes every day');
const f3 = K.futureBars(dailyBars(2026, 12, 31, 300, false), '1d', 2);
ok(f3.labels[0] === '2027-01-01' && f3.stamps[0][4] === 1 && f3.stamps[0][3] === 1, 'month and year roll over');
// hourly US stock bars: 09:30 .. 15:30 sessions, last bar Friday 15:30 -> Monday 09:30, 10:30
const H = {o: [], h: [], l: [], c: [], v: [], t: [], tod: [], dow: [], day: []};
for (let k = 20; k >= 0; k--) { const d = day(2026, 11, 20 - k); if (!(d.getUTCDay() % 6)) continue; for (let m = 570; m <= 930; m += 60) { H.day.push(iso(d)); H.tod.push(m); H.dow.push(d.getUTCDay()); H.t.push(0); H.o.push(1); H.h.push(1); H.l.push(1); H.c.push(1); H.v.push(1); } }
const f4 = K.futureBars(H, '1h', 3);
ok(f4.labels.join() === '2026-11-23 09:30,2026-11-23 10:30,2026-11-23 11:30', 'hourly calendar follows session hours: ' + f4.labels.join(' | '));
ok(JSON.stringify(f4.stamps[0]) === JSON.stringify([30, 9, 0, 23, 11]), 'hourly stamp minute 30, hour 9');
ok(JSON.stringify(K.stampOf(H, H.day.length - 1, '1h')) === JSON.stringify([30, 15, 4, 20, 11]), 'history stamp for Friday 15:30');
// forecast range summary
const paths = Array.from({length: 10}, (_, s) => Array.from({length: 4}, (_, j) => { const c = 100 + (s - 4.5) * (j + 1); return [c, c + 1, c - 1, c, 10, 1000]; }));
const sm = K.summarize({paths, mean: Array.from({length: 4}, () => [100, 99, 101, 100, 10, 1000])}, 100);
ok(sm.S === 10 && sm.H === 4 && Math.abs(sm.q50[3] - 100) < 1e-9 && sm.q10[3] < sm.q25[3] && sm.q75[3] < sm.q90[3], 'quantile bands ordered around the median');
ok(sm.pUp === 0.5 && sm.mean[0].h === 101 && sm.mean[0].l === 99, 'P(up) and mean candle high/low repaired');
console.log(fail ? `${fail} Kronos page check(s) failed` : 'Kronos Terminal page checks passed');
process.exit(fail ? 1 : 0);
