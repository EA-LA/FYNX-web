/* Strategy Lab math: plain-English rule parser, event-driven backtest fills, optimizer and pattern forecaster. */
const fs = require('fs');
global.window = {FynxTerminalPlugins: []};
global.document = {head: {append() {}}};
const stubEl = () => ({style: {}, append() {}, set textContent(v) {}});
const T = {el: stubEl, btn: stubEl, svg: stubEl, $: () => null, panel: stubEl, setText() {}, store: {get: () => null, set() {}}, empty() {}, finite: v => typeof v === 'number' && Number.isFinite(v), report() {},
  PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {}, RENDER: {}, EXTRA_GROUPS: [], PAGE_NAMES: [], TABBED: new Set(), DESK_ORDER: ['all', 'world'], DESK_DEFS: {all: {}}};
for (const f of ['quantlab.js', 'quantlab-research.js', 'quantlab-strategy.js']) eval(fs.readFileSync(require('path').join(__dirname, '..', 'assets/js/terminal', f), 'utf8'));
for (const f of window.FynxTerminalPlugins) f(T, null);
const S = T.StrategyLab; let fail = 0; const ok = (c, m) => { if (!c || process.env.VERBOSE) console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
// ---- parser
const R1 = S.parseRules('Buy when the price crosses above the 200-day moving average and RSI 14 is below 70. Sell when the close is below the 50 day sma. Stop 2 ATR. Take profit 15%. Max hold 30 days.');
ok(R1.long.t === 'and' && R1.long.l.op === 'XA' && R1.long.l.b.name === 'sma' && R1.long.l.b.args[0] === 200 && R1.long.r.a.name === 'rsi' && R1.long.r.op === '<', 'english entry parsed');
ok(R1.exitLong.op === '<' && R1.exitLong.b.args[0] === 50 && R1.stop.atr === 2 && Math.abs(R1.target.pct - 0.15) < 1e-12 && R1.maxHold === 30, 'exit/stop/target/hold parsed');
const R2 = S.parseRules('Buy when close > highest(55). Sell when close < lowest(20).'); ok(R2.long.b.name === 'highest' && R2.exitLong.b.args[0] === 20, 'breakout parsed');
const R3 = S.parseRules('buy when close > upper bollinger band or roc(20) > 5%'); ok(R3.long.t === 'or' && R3.long.l.b.name === 'bbupper' && R3.long.r.b.pct, 'or + bollinger + percent');
let e1 = ''; try { S.parseRules('Buy when banana > 5'); } catch (e) { e1 = e.message; } ok(/Unknown indicator/.test(e1), 'unknown indicator message: ' + e1.slice(0, 50));
let e2 = ''; try { S.parseRules('Sell when rsi(14) > 70'); } catch (e) { e2 = e.message; } ok(/entry rule/.test(e2), 'missing entry message');
ok(S.parseRules('Buy when close > sma(200)').exitLongImplicit, 'implicit exit');
// ---- engine on synthetic bars
const N = 400, B = {o: [], h: [], l: [], c: [], v: [], t: [], day: []}; let p = 100;
for (let i = 0; i < N; i++) { const o = p * (1 + 0.001 * Math.sin(i)); p = o * (1 + 0.01 * Math.sin(i / 7) + 0.002); B.o.push(o); B.c.push(p); B.h.push(Math.max(o, p) * 1.003); B.l.push(Math.min(o, p) * 0.997); B.v.push(1000); B.t.push(i * 86400); B.day.push('2020-' + String(1 + Math.floor(i / 31) % 12).padStart(2, '0') + '-01'); }
const bt = S.backtest(B, S.parseRules('Buy when close > 0'), {feeBps: 0, slipBps: 0, sizing: 'full', allowShort: false, ann: 252});
const first = bt.trades.length ? bt.trades[0] : null;
ok(first && first.entryI === bt.start + 1 && Math.abs(first.entry - B.o[bt.start + 1]) < 1e-9, 'signal at close fills at next open');
ok(Math.abs(bt.eq[N - 1] - B.c[N - 1] / B.o[bt.start + 1]) < 1e-9, 'always-long equity = price path from first fill');
const btc = S.backtest(B, S.parseRules('Buy when close > 0'), {feeBps: 10, slipBps: 0, sizing: 'full', allowShort: false, ann: 252});
ok(Math.abs(btc.eq[N - 1] - bt.eq[N - 1] / 1.001) < 1e-9, 'entry cost charged once (10 bp)');
// gap through stop fills at the open
const G = JSON.parse(JSON.stringify(B)); const k = 100; G.o[k + 2] = G.c[k + 1] * 0.5; G.l[k + 2] = G.o[k + 2] * 0.99; G.h[k + 2] = G.o[k + 2] * 1.01; G.c[k + 2] = G.o[k + 2];
const RS = S.parseRules('Buy when close > 0. Stop 5%.'); const gb = S.backtest(G, RS, {feeBps: 0, slipBps: 0, sizing: 'full', allowShort: false, ann: 252});
const st = gb.trades.find(t => t.why === 'stop' && t.exitI === k + 2); ok(st && Math.abs(st.exit - G.o[st.exitI]) < 1e-9 && st.exit < st.entry * 0.95, 'gap below stop fills at open, not at the stop');
// long/short flip
const ls = S.backtest(B, S.parseRules('Buy when roc(10) > 0. Short when roc(10) < 0.'), {feeBps: 0, slipBps: 0, sizing: 'full', allowShort: true, ann: 252});
ok(ls.trades.some(t => t.side < 0) && ls.trades.some(t => t.side > 0), 'long and short trades both occur');
const perf = S.perf(bt.eq, bt.start, N - 1, 252); ok(perf && perf.psr > 0.9 && perf.mdd <= 0, 'perf + PSR computed: ' + perf.psr.toFixed(3));
// ---- optimizer
const w = S.projCapped([0.9, 0.5, -0.2, 0.1], 0.4); ok(Math.abs(w.reduce((a, b) => a + b) - 1) < 1e-6 && Math.max(...w) <= 0.4 + 1e-9 && Math.min(...w) >= 0, 'capped simplex projection ' + w.map(x => x.toFixed(3)));
const Sd = [[1, 0], [0, 4]]; const mvw = S.minVarLambda(Sd, [0, 0], 1, 0); ok(Math.abs(mvw[0] - 0.8) < 1e-4, 'min variance 0.8/0.2: ' + mvw.map(x => x.toFixed(4)));
const ew = S.erc([[1, 0, 0], [0, 4, 0], [0, 0, 9]]); ok(Math.abs(ew[0] - 6 / 11) < 1e-6 && Math.abs(ew[2] - 2 / 11) < 1e-6, 'ERC = inverse vol on diagonal ' + ew.map(x => x.toFixed(4)));
const blk = [[1, .9, .9, 0], [.9, 1, .9, 0], [.9, .9, 1, 0], [0, 0, 0, 1]]; const h = S.hrp(blk); ok(Math.abs(h.w.reduce((a, b) => a + b) - 1) < 1e-9 && h.w[3] > 0.45, 'HRP gives the lone uncorrelated asset ~half: ' + h.w.map(x => x.toFixed(3)));
let s = 9; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, gs = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const X = Array.from({length: 10}, () => Array.from({length: 60}, () => 0.01 * gs()));
const lw = S.covEstimate(X, 'lw'); ok(lw.delta > 0 && lw.delta <= 1, 'Ledoit-Wolf shrinkage in (0,1]: ' + lw.delta.toFixed(3));
// ---- forecaster: a periodic series is forecastable; check no look-ahead in candidate set
const P = {o: [], h: [], l: [], c: [], v: [], t: [], day: []}; let q = 100;
for (let i = 0; i < 1500; i++) { const o = q; q = o * Math.exp(0.01 * Math.sin(2 * Math.PI * i / 25)); P.o.push(o); P.c.push(q); P.h.push(Math.max(o, q) * 1.001); P.l.push(Math.min(o, q) * 0.999); P.v.push(100); P.t.push(i); P.day.push('d' + i); }
const FE = S.features(P, 20); const f = S.forecastAt(P, FE, 1499, 20, 10, 30);
ok(f && f.analogs.every(e => e <= 1499 - 10), 'analogs only use windows whose future is known');
let hits = 0, n = 0; for (let t = 600; t <= 1489; t += 10) { const g = S.forecastAt(P, FE, t, 20, 10, 30); if (!g) continue; n++; if ((g.q50[9] > 0) === (Math.log(P.c[t + 10] / P.c[t]) > 0)) hits++; }
ok(hits / n > 0.9, 'periodic pattern forecast hit rate ' + (hits / n).toFixed(2));
ok(T.DESK_DEFS.strategy?.slots.length === 4 && T.RENDER.btest && T.RENDER.optim && T.RENDER.fcast, 'registered');

if (!fail) console.log('Strategy Lab: rule parser, next-bar fills, gap stops, costs, optimizer and forecaster checks passed.');
process.exit(fail ? 1 : 0);
