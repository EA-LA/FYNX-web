/* FYNX Terminal plugin: KRONOS. The open-source Kronos foundation model for candlesticks (Shi et al., MIT licence,
 * github.com/shiyu-coder/Kronos), running on the visitor's own device.
 *
 * The official weights (NeoQuasar/Kronos-mini or Kronos-small on Hugging Face) are downloaded once into the browser
 * cache and run in a Web Worker by assets/js/kronos/kronos-engine.js, a re-implementation of the published inference
 * code that is tested against the official PyTorch implementation. No GPU server is involved.
 *
 * Kronos samples many possible futures. The page shows them as a forecast range (10–90% and 25–75% bands with the
 * median path), the model's mean candles (what KronosPredictor returns), a comparison with a random-walk range built
 * from recent volatility, and an optional honest check that re-runs the model at past dates using only the data
 * available then. Nothing here is advice. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {el, btn, svg, $, panel, setText, store, finite, report} = T;
  const QL = T.QuantLab, QR = T.QuantResearch, SL = T.StrategyLab;
  if (!QL || !QR || !SL || !SL.candleChart || typeof Worker === 'undefined') return;
  const {quantile, kpis} = QL;
  const {loadBars, mean, sd} = QR;
  const {lineChart, card, chartBox, note, chips, symbolBox} = QR.ui;
  const SYM_RE = /^[A-Z0-9.\-=^&]{1,24}$/;
  const spct = (v, d = 1) => finite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + '%' : '—';
  const pct = (v, d = 0) => finite(v) ? (v * 100).toFixed(d) + '%' : '—';
  const px = v => !finite(v) ? '—' : Math.abs(v) >= 1000 ? v.toLocaleString('en-US', {maximumFractionDigits: 2}) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(4);
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const MB = b => (b / 1048576).toFixed(b > 104857600 ? 0 : 1) + ' MB';

  const MODELS = {
    mini: {name: 'Kronos-mini', params: '4.1M', ctx: 2048, repo: 'NeoQuasar/Kronos-mini', tok: 'NeoQuasar/Kronos-Tokenizer-2k', size: 'a few tens of MB', speed: 'fast'},
    small: {name: 'Kronos-small', params: '24.7M', ctx: 512, repo: 'NeoQuasar/Kronos-small', tok: 'NeoQuasar/Kronos-Tokenizer-base', size: 'about 115 MB', speed: 'slower, larger model'}
  };
  const KV = (() => { let s = {}; try { s = JSON.parse(store.get('kronos') || '{}') || {}; } catch (_) {} return {sym: SYM_RE.test(s.sym || '') ? s.sym : 'SPY', tf: s.tf === '1h' ? '1h' : '1d', H: [5, 10, 20, 30].includes(s.H) ? s.H : 20, L: [128, 256, 512, 1024].includes(s.L) ? s.L : 256, S: [8, 16, 32].includes(s.S) ? s.S : 16, model: s.model === 'small' ? 'small' : 'mini', checks: [6, 12].includes(s.checks) ? s.checks : 6}; })();
  const save = () => store.set('kronos', JSON.stringify(KV));
  const lookbackFor = o => Math.min(o.L, MODELS[o.model].ctx - o.H);
  const keyOf = o => ['kronos', o.sym, o.tf, o.H, lookbackFor(o), o.S, o.model].join('|');

  const st = el('style'); st.id = 'fx-kronos-style';
  st.textContent = `
.fx-kr-hero{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:14px;padding:14px 16px;border:1px solid #3a2e10;background:linear-gradient(135deg,#151005 0%,#0b0f0e 70%)}
.fx-kr-hero h2{margin:0 0 6px;font:800 19px Inter,Arial,sans-serif;color:#fff;letter-spacing:-.01em}.fx-kr-hero h2 em{font-style:normal;color:#ffb000}
.fx-kr-hero p{margin:0;color:#c9d2cd;font-size:12.5px;line-height:1.55}
.fx-kr-badges{display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start}
.fx-kr-badges span{padding:4px 8px;border:1px solid #2a3530;background:#0d1312;font:600 11px 'IBM Plex Mono',monospace;color:#d7dfda}.fx-kr-badges span b{color:#ffb000;margin-right:4px}
.fx-kr-run{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px}
.fx-kr-run .fx-ql-btn.pri{min-height:36px;padding:6px 16px;font-size:13px;font-weight:800}
.fx-kr-run .fx-ql-btn[disabled]{opacity:.55;cursor:progress}
.fx-kr-status{flex:1 1 260px;color:var(--mu);font-size:12px;line-height:1.45}
.fx-kr-bar{height:6px;flex:1 1 100%;background:#141b19;border:1px solid #222c28;overflow:hidden}.fx-kr-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#c98c14,#ffb000);transition:width .15s}
.fx-kr-bar[hidden]{display:none!important}
.fx-kr-table{width:100%;border-collapse:collapse;font:500 11.5px 'IBM Plex Mono',monospace}
.fx-kr-table th{position:sticky;top:0;background:var(--p2);text-align:right;color:var(--mu);font-weight:600;padding:4px 6px;border-bottom:1px solid var(--ln)}
.fx-kr-table th,.fx-kr-table td{white-space:nowrap}.fx-kr-table td{text-align:right;padding:3px 6px;border-bottom:1px solid #141b19;color:var(--tx)}.fx-kr-table th:first-child,.fx-kr-table td:first-child{text-align:left}
.fx-kr-scroll{max-height:300px;overflow:auto}
.fx-kr-err{padding:10px 12px;border-left:3px solid #ff5a4f;background:#1a0b0b;color:#ffb4ad;font-size:12.5px;line-height:1.5}
.fx-kr-err .fx-ql-btn{margin-top:8px}
@media (max-width:900px){.fx-kr-hero{grid-template-columns:1fr}}
@media (pointer:coarse){.fx-kr-run .fx-ql-btn.pri{min-height:44px}}`;
  document.head.append(st);

  /* ------------------------------------------- worker client ------------------------------------------- */
  let worker = null, seq = 0;
  const waiting = new Map();
  function W() {
    if (worker) return worker;
    worker = new Worker('/assets/js/kronos/kronos-worker.js?v=20261121-kronos-1');
    worker.onmessage = ev => {
      const m = ev.data || {};
      if (m.type === 'progress') { (m.id ? [waiting.get(m.id)] : [...waiting.values()]).forEach(w => w?.progress?.(m)); return; }
      const w = waiting.get(m.id); if (!w) return; waiting.delete(m.id);
      if (m.type === 'error') w.reject(new Error(m.message || 'Kronos failed.')); else w.resolve(m);
    };
    worker.onerror = e => { e.preventDefault?.(); for (const w of waiting.values()) w.reject(new Error('The Kronos worker stopped. Reload the page and try again.')); waiting.clear(); worker = null; };
    return worker;
  }
  const call = (msg, progress) => new Promise((resolve, reject) => { const id = ++seq; waiting.set(id, {resolve, reject, progress}); W().postMessage({...msg, id}); });
  const fileUrl = (repo, f) => `https://huggingface.co/${repo}/resolve/main/${f}`;
  async function isCached(model) {
    try { const c = await caches.open('fynx-kronos-v1'), m = MODELS[model]; return !!(await c.match(fileUrl(m.repo, 'model.safetensors'))) && !!(await c.match(fileUrl(m.tok, 'model.safetensors'))); } catch (_) { return false; }
  }

  /* --------------------------------------------- calendar --------------------------------------------- */
  // Kronos reads [minute, hour, weekday (Mon = 0), day, month]. Bars carry exchange-local fields; daily bars use 00:00.
  // The weekday comes from the bar's own local date, so it is right whatever time stamp the data source used.
  const dowOf = day => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const stampOf = (B, i, tf) => { const [, m, d] = B.day[i].split('-').map(Number), wd = (dowOf(B.day[i]) + 6) % 7; return tf === '1d' ? [0, 0, wd, d, m] : [B.tod[i] % 60, Math.floor(B.tod[i] / 60), wd, d, m]; };
  // Future bar times follow the market's own calendar: the weekdays it traded recently and, for hourly bars, its session hours.
  function futureBars(B, tf, H) {
    const N = B.c.length, days = new Set(B.day.slice(-400).map(dowOf)), tods = [...new Set(B.tod.slice(-300))].sort((a, b) => a - b);
    if (!days.size) for (let d = 0; d < 7; d++) days.add(d);
    const [y, m, d] = B.day[N - 1].split('-').map(Number); let date = Date.UTC(y, m - 1, d), tod = B.tod[N - 1];
    const nextDay = () => { let k = 0; do { date += 86400000; k++; } while (!days.has(new Date(date).getUTCDay()) && k < 8); };
    const stamps = [], labels = [];
    while (stamps.length < H) {
      if (tf === '1d') nextDay(); else { const nt = tods.find(t => t > tod); if (nt !== undefined) tod = nt; else { nextDay(); tod = tods[0]; } }
      const dt = new Date(date), wd = (dt.getUTCDay() + 6) % 7, dd = dt.getUTCDate(), mm = dt.getUTCMonth() + 1;
      stamps.push(tf === '1d' ? [0, 0, wd, dd, mm] : [tod % 60, Math.floor(tod / 60), wd, dd, mm]);
      labels.push(dt.toISOString().slice(0, 10) + (tf === '1h' ? ' ' + hhmm(tod) : ''));
    }
    return {stamps, labels};
  }
  const seedOf = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* --------------------------------------------- forecasting --------------------------------------------- */
  // Forecast the H bars after index e using only bars up to e.
  async function forecastFrom(B, e, o, samples, progress, fut) {
    const Lb = Math.min(lookbackFor(o), e + 1), from = e - Lb + 1, idx = Array.from({length: Lb}, (_, k) => from + k);
    const bars = {o: idx.map(i => B.o[i]), h: idx.map(i => B.h[i]), l: idx.map(i => B.l[i]), c: idx.map(i => B.c[i]), v: idx.map(i => B.v[i] || 0), t: idx.map(i => B.t[i]), stamps: idx.map(i => stampOf(B, i, o.tf))};
    const future = fut || Array.from({length: o.H}, (_, j) => stampOf(B, e + 1 + j, o.tf));
    const r = await call({type: 'predict', model: o.model, bars, future, opt: {samples, lookback: Lb, topP: 0.9, temperature: 1, seed: seedOf(keyOf(o) + '|' + B.day[e])}}, progress);
    return {...r.out, info: r.info};
  }
  function summarize(out, c0) {
    const S = out.paths.length, H = out.paths[0].length, col = j => out.paths.map(p => p[j][3]).filter(finite).sort((a, b) => a - b);
    const q = p => Array.from({length: H}, (_, j) => quantile(col(j), p)), last = out.paths.map(p => p[H - 1][3]);
    const mc = out.mean.map(r => { const [o, h, l, c, v] = r; return {o, h: Math.max(o, h, l, c), l: Math.min(o, h, l, c), c, v}; });
    const lr = last.filter(v => v > 0).map(v => Math.log(v / c0));
    return {S, H, q10: q(0.1), q25: q(0.25), q50: q(0.5), q75: q(0.75), q90: q(0.9), pUp: last.filter(v => v > c0).length / S, mean: mc, sdH: lr.length > 2 ? sd(lr) : NaN, closes: out.paths.map(p => p.map(r => r[3]))};
  }
  const results = new Map(), inflight = new Map();
  async function run(o, progress) {
    const B = await loadBars(o.sym, o.tf);
    if (!B?.o || B.c.length < 80) throw new Error(`Not enough ${o.tf === '1h' ? 'hourly' : 'daily'} candles for ${o.sym}.`);
    const N = B.c.length, fut = futureBars(B, o.tf, o.H), out = await forecastFrom(B, N - 1, o, o.S, progress, fut.stamps), c0 = B.c[N - 1], sm = summarize(out, c0);
    const lr = []; for (let i = Math.max(1, N - 60); i < N; i++) lr.push(Math.log(B.c[i] / B.c[i - 1]));
    const sig = sd(lr), z = 1.2815515655, rw = {lo: c0 * Math.exp(-z * sig * Math.sqrt(o.H)), hi: c0 * Math.exp(z * sig * Math.sqrt(o.H))};
    const vAvg = mean(B.v.slice(-20).map(v => v || 0)), vF = mean(sm.mean.map(r => r.v));
    const r = {o: {...o}, B, N, c0, sm, fut, info: out.info, lookback: out.lookback, rw, sig, vAvg, vF, at: Date.now(), check: null};
    results.set(keyOf(o), r); return r;
  }
  async function check(r, n, progress) {
    const {B, N, o} = r, H = o.H, tests = [];
    const es = []; for (let k = n; k >= 1; k--) { const e = N - 1 - H * k; if (e >= 80) es.push(e); }
    for (let j = 0; j < es.length; j++) {
      const e = es[j], out = await forecastFrom(B, e, o, 8, m => progress({...m, test: j, tests: es.length})), sm = summarize(out, B.c[e]);
      tests.push({e, c0: B.c[e], med: sm.q50[H - 1], lo: sm.q10[H - 1], hi: sm.q90[H - 1], pUp: sm.pUp, act: B.c[e + H], q50: sm.q50, q10: sm.q10, q90: sm.q90});
    }
    const m = tests.length, hits = tests.filter(x => (x.med > x.c0) === (x.act > x.c0)).length, cover = tests.filter(x => x.act >= x.lo && x.act <= x.hi).length;
    const ups = tests.filter(x => x.act > x.c0).length, maeK = mean(tests.map(x => Math.abs(x.med - x.act) / x.c0)), maeN = mean(tests.map(x => Math.abs(x.c0 - x.act) / x.c0));
    r.check = {tests, m, hits, cover, ups, maeK, maeN, n};
    return r.check;
  }

  /* ------------------------------------------------- UI ------------------------------------------------- */
  function progressText(m, o) {
    const M = MODELS[o.model].name;
    if (m.stage === 'download') return m.total ? `Downloading ${M} from Hugging Face (one time) · ${MB(m.done)} of ${MB(m.total)}` : `Downloading ${M} from Hugging Face (one time) · ${MB(m.done)}`;
    if (m.stage === 'build') return `Loading ${M} into memory…`;
    if (m.stage === 'tokenize') return 'Turning the candles into Kronos tokens…';
    if (m.stage === 'context') return 'Reading the history…';
    if (m.stage === 'sample') { const k = Math.min(o.S, Math.max(1, Math.ceil(m.done * o.S))); return `Sampling future ${k} of ${o.S}…`; }
    return 'Working…';
  }
  const fracOf = m => m.stage === 'download' ? (m.total ? 0.7 * m.done / m.total : 0.2) : m.stage === 'build' ? 0.72 : m.stage === 'tokenize' ? 0.74 : m.stage === 'context' ? 0.78 : m.stage === 'sample' ? 0.8 + 0.2 * m.done : 0.1;
  const lean = p => p >= 0.6 ? ['KRONOS LEANS UP', '#3ecf8e'] : p <= 0.4 ? ['KRONOS LEANS DOWN', '#ff5a4f'] : ['NO CLEAR LEAN', '#ffb000'];
  const unitOf = tf => tf === '1h' ? 'hours' : 'trading days';

  function renderResult(out, r) {
    const {o, sm, B, N, c0, fut} = r, H = o.H, unit = unitOf(o.tf), [state, color] = lean(sm.pUp), M = MODELS[o.model];
    const med = sm.q50[H - 1] / c0 - 1, lo = sm.q10[H - 1] / c0 - 1, hi = sm.q90[H - 1] / c0 - 1, meanRet = sm.mean[H - 1].c / c0 - 1;
    const hd = el('div', 'fx-ql-head'), s0 = el('span', 'fx-ql-state', state); s0.style.color = color;
    hd.append(s0, el('span', 'fx-ql-sub', `${B.name || o.sym}: ${Math.round(sm.pUp * sm.S)} of ${sm.S} futures sampled by ${M.name} end higher than today’s ${px(c0)} after ${H} ${unit}.`));
    out.append(hd);
    const rwW = r.rw.hi / r.rw.lo - 1, kW = sm.q90[H - 1] / sm.q10[H - 1] - 1;
    kpis(out, [
      ['P(HIGHER IN ' + H + ')', pct(sm.pUp), `${sm.S} sampled futures`, color],
      ['MEDIAN FORECAST', spct(med), `${px(sm.q50[H - 1])} · mean path ${spct(meanRet)}`],
      ['FORECAST RANGE (80%)', `${spct(lo)} … ${spct(hi)}`, `${px(sm.q10[H - 1])} to ${px(sm.q90[H - 1])}`],
      ['RANGE VS RANDOM WALK', kW && rwW ? (kW / rwW).toFixed(2) + '×' : '—', `random-walk 80% range ${spct(r.rw.lo / c0 - 1, 0)} … ${spct(r.rw.hi / c0 - 1, 0)}`, kW < rwW * 0.6 ? '#ffb000' : '#aeb9b3'],
      ['VOLUME OUTLOOK', r.vAvg > 0 && finite(r.vF) ? spct(r.vF / r.vAvg - 1, 0) : '—', r.vAvg > 0 ? 'forecast vs last 20 bars' : 'no volume for this market'],
      ['MODEL', M.name, `${r.info?.params ? (r.info.params / 1e6).toFixed(1) + 'M' : M.params} parameters · ${r.lookback} candles read`]
    ]);
    const v = el('div', 'fx-ql-verdict'); v.style.borderColor = color;
    v.textContent = `${sm.pUp >= 0.6 ? 'Most' : sm.pUp <= 0.4 ? 'Few' : 'About half'} of the sampled futures finish above today’s close. The middle 80% of outcomes spans ${spct(lo)} to ${spct(hi)} over ${H} ${unit}; ` +
      (kW < rwW * 0.6 ? `that is much narrower than a random walk with recent volatility (${spct(r.rw.lo / c0 - 1, 0)} … ${spct(r.rw.hi / c0 - 1, 0)}), so the model is more confident than history alone would justify. Treat the range as a lower bound on risk.` : kW > rwW * 1.6 ? `wider than a random walk with recent volatility, so the model expects a bumpier stretch than usual.` : `close to what a random walk with recent volatility gives, so the model’s main contribution is the tilt, not the width.`) +
      ' A foundation-model forecast is one opinion, not a promise. Run the past-data check below before trusting it.';
    out.append(v);
    // main chart: candles, forecast range, Kronos mean candles
    const cb = chartBox(380);
    out.append(card(`LAST 120 CANDLES + ${H}-CANDLE FORECAST RANGE (10–90% AND 25–75% OF ${sm.S} FUTURES) · HOLLOW = KRONOS MEAN CANDLES`, cb,
      note(`Amber line: median of the sampled futures. Hollow candles: the average of all sampled candles, which is what KronosPredictor returns. Future bar times follow the market’s calendar: ${fut.labels[0]} to ${fut.labels[H - 1]}.`)));
    // every sampled future
    const two = el('div', 'fx-sl-grid'), pc = chartBox(260);
    const tbl = el('table', 'fx-kr-table'), th = el('tr'); ['Bar', 'Median', '10%', '90%', 'P(up)', 'Mean candle (L–H)'].forEach(t => th.append(el('th', '', t))); tbl.append(th);
    for (let j = 0; j < H; j++) {
      const tr = el('tr'), up = sm.closes.filter(p => p[j] > c0).length / sm.S, m = sm.mean[j];
      [fut.labels[j], px(sm.q50[j]), px(sm.q10[j]), px(sm.q90[j]), pct(up), `${px(m.c)} (${px(m.l)}–${px(m.h)})`].forEach((t, k) => { const td = el('td', '', t); if (k === 4) td.style.color = up >= 0.6 ? '#3ecf8e' : up <= 0.4 ? '#ff5a4f' : ''; tr.append(td); });
      tbl.append(tr);
    }
    const sc = el('div', 'fx-kr-scroll'); sc.append(tbl);
    two.append(card(`EVERY SAMPLED FUTURE (${sm.S} PATHS)`, pc, note('Each thin line is one future Kronos generated, token by token. Where they bunch, the model is confident; where they fan out, it is not.')), card('FORECAST BY BAR', sc));
    out.append(two);
    // honest check
    const ck = el('div'), ckBody = el('div'); ckBody.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    const ckRow = el('div', 'fx-kr-run'), ckSel = el('select'); [[6, '6 past dates'], [12, '12 past dates']].forEach(([n, t]) => { const op = el('option', '', t); op.value = n; if (n === KV.checks) op.selected = true; ckSel.append(op); });
    ckSel.setAttribute('aria-label', 'Number of past dates'); ckSel.addEventListener('change', () => { KV.checks = +ckSel.value; save(); });
    const ckBtn = btn('Check Kronos on past data', 'fx-ql-btn'), ckStat = el('span', 'fx-kr-status', `Re-runs ${M.name} at earlier dates with only the candles known then, ${H} ${unit} apart, and compares each forecast with what happened.`), ckBar = el('div', 'fx-kr-bar'), ckI = el('i'); ckBar.append(ckI); ckBar.hidden = true;
    const lab = el('label', ''); lab.style.cssText = 'display:flex;gap:6px;align-items:center;color:var(--mu);font-size:11.5px'; lab.append(ckSel);
    ckRow.append(ckBtn, lab, ckStat, ckBar); ckBody.append(ckRow); ck.append(card('HONEST CHECK · HOW DID KRONOS DO ON THIS MARKET BEFORE?', ckBody)); out.append(ck);
    const showCheck = c => {
      ckBody.querySelectorAll('.fx-kr-chk').forEach(x => x.remove());
      const box = el('div', 'fx-kr-chk'); box.style.cssText = 'display:flex;flex-direction:column;gap:10px';
      const better = c.maeK < c.maeN;
      kpis(box, [['DIRECTION RIGHT', `${c.hits} / ${c.m}`, `market rose in ${c.ups} of ${c.m}`, c.hits / c.m > 0.5 ? '#3ecf8e' : '#ff5a4f'], ['INSIDE 80% RANGE', `${c.cover} / ${c.m}`, 'well calibrated ≈ 80%', Math.abs(c.cover / c.m - 0.8) <= 0.2 ? '#3ecf8e' : '#ffb000'], ['ERROR VS NO-CHANGE', finite(c.maeK) && c.maeN ? (c.maeK / c.maeN).toFixed(2) + '×' : '—', better ? 'median beat “no change”' : 'median did not beat “no change”', better ? '#3ecf8e' : '#ff5a4f']]);
      const v2 = el('div', 'fx-ql-verdict'); v2.style.borderColor = better && c.hits / c.m > 0.5 ? '#3ecf8e' : '#ffb000';
      v2.textContent = `${c.m} past forecasts: direction right ${c.hits} times, the actual price landed inside the 80% range ${c.cover} times, and the median’s average miss was ${(c.maeK * 100).toFixed(2)}% against ${(c.maeN * 100).toFixed(2)}% for simply assuming no change. ${c.m < 20 ? 'This is far too few tests to prove an edge either way; it shows whether the model behaves sensibly on this market, not that it will make money.' : ''}`;
      box.append(v2);
      const rows = el('table', 'fx-kr-table'), h2 = el('tr'); ['Forecast made', 'Price then', 'Median', '80% range', 'Actual', 'Direction'].forEach(t => h2.append(el('th', '', t))); rows.append(h2);
      for (const x of c.tests) { const tr = el('tr'), ok = (x.med > x.c0) === (x.act > x.c0); [B.day[x.e], px(x.c0), px(x.med), `${px(x.lo)} – ${px(x.hi)}`, px(x.act), ok ? 'right' : 'wrong'].forEach((t, k) => { const td = el('td', '', t); if (k === 5) td.style.color = ok ? '#3ecf8e' : '#ff5a4f'; if (k === 4 && (x.act < x.lo || x.act > x.hi)) td.style.color = '#ffb000'; tr.append(td); }); rows.append(tr); }
      const s2 = el('div', 'fx-kr-scroll'); s2.append(rows); box.append(s2);
      ckBody.append(box);
    };
    if (r.check) showCheck(r.check);
    ckBtn.addEventListener('click', async () => {
      ckBtn.disabled = true; ckBar.hidden = false; ckI.style.width = '0';
      try {
        const c = await check(r, KV.checks, m => { if (m.stage === 'sample') { ckI.style.width = Math.round(100 * ((m.test || 0) + m.done) / (m.tests || 1)) + '%'; ckStat.textContent = `Past date ${(m.test || 0) + 1} of ${m.tests}…`; } });
        if (!ckBody.isConnected) return; ckStat.textContent = `Done: ${c.m} past forecasts, ${H} ${unit} apart, each using only the candles available at the time.`; showCheck(c);
      } catch (e) { report('kronos', e); ckStat.textContent = e.message || 'The check could not run.'; }
      ckBtn.disabled = false; ckBar.hidden = true;
    });
    // how it works
    out.append(card('HOW KRONOS WORKS', ...[
      `Kronos is a foundation model for candlesticks, trained by its authors on data from more than 45 exchanges. A tokenizer turns each candle (open, high, low, close, volume and traded value, normalised over the window you give it) into two discrete tokens from vocabularies of ${(r.info?.vocab || 1024).toLocaleString('en-US')} codes each. A Transformer then writes the future one token at a time, like a language model writing a sentence, and the tokenizer turns the new tokens back into candles.`,
      `Because each step is sampled (temperature 1, nucleus top-p 0.9, the Kronos defaults), running it ${sm.S} times gives ${sm.S} different futures. Their spread is the forecast range; their average is the model’s point forecast.`,
      `This page runs the published ${M.name} weights (${M.repo}, ${M.params} parameters, context ${M.ctx.toLocaleString('en-US')} candles) on your own device in a background thread. FYNX re-implemented the inference code in JavaScript and tests it against the official PyTorch code. The weights are downloaded from Hugging Face once and kept in your browser cache.`,
      'Credit: Kronos by Yu Shi et al., MIT licence. Delayed Yahoo Finance candles. Not advice.'
    ].map(note)));
    requestAnimationFrame(() => {
      SL.candleChart(cb, B, Math.max(0, N - 120), N - 1, {fan: {q10: sm.q10, q25: sm.q25, q50: sm.q50, q75: sm.q75, q90: sm.q90}, ghost: sm.mean, aria: 'Recent candles with the Kronos forecast range'});
      const back = Math.min(60, N), xs = [...B.day.slice(N - back), ...fut.labels.map(s => s.slice(0, 10))], nan = n => Array(n).fill(NaN);
      const hist = [...B.c.slice(N - back), ...nan(H)], series = [{v: hist, color: '#e8ecea', width: 1.4, name: 'History'}];
      sm.closes.forEach(p => series.push({v: [...nan(back - 1), c0, ...p], color: 'rgba(255,176,0,.28)', width: 0.8}));
      series.push({v: [...nan(back - 1), c0, ...sm.q50], color: '#ffb000', width: 2.2, name: 'Median'});
      lineChart(pc, {series, xs, yfmt: v => Math.abs(v) >= 1000 ? v.toFixed(0) : px(v), aria: 'Every sampled Kronos future'});
    });
  }

  async function renderPage(host, arg) {
    if (arg && SYM_RE.test(String(arg).toUpperCase())) { KV.sym = String(arg).toUpperCase(); save(); }
    PG.setHead('KRONOS', 'Kronos AI forecast', 'The open-source Kronos foundation model for candlesticks, running on your device, with a forecast range from many sampled futures');
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap);
    const rerun = () => { if (wrap.isConnected) PG.rerender(); };
    const M = MODELS[KV.model];
    const hero = el('div', 'fx-kr-hero'), hl = el('div'), h2 = el('h2'); h2.append('The real ', el('em', '', 'Kronos'), ' model, on your device');
    hl.append(h2, el('p', '', 'Kronos is the first open-source foundation model for financial candlesticks. It reads the recent candles of any market as tokens and writes many possible futures, which FYNX turns into a forecast range with an honest check on past data. No GPU server, no install: it runs in your browser.'));
    const bd = el('div', 'fx-kr-badges'); [['REAL', 'published weights'], [M.params, 'parameters'], ['RANGE', 'from sampled futures'], ['CHECK', 'on past data'], ['PRIVATE', 'runs on your device']].forEach(([a, b]) => { const s = el('span'); s.append(el('b', '', a), b); bd.append(s); });
    hero.append(hl, bd); wrap.append(hero);
    const ic = el('div', 'fx-ql-card'); ic.append(el('h3', '', 'MARKET AND SETTINGS'));
    ic.append(symbolBox(KV.sym, s => { KV.sym = s; save(); rerun(); }, 'Any symbol: SPY, NVDA, BTC-USD, EURUSD=X, GC=F'));
    ic.append(chips([['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['NVDA', 'Nvidia'], ['AAPL', 'Apple'], ['BTC-USD', 'Bitcoin'], ['ETH-USD', 'Ether'], ['EURUSD=X', 'EUR/USD'], ['GC=F', 'Gold']], KV.sym, s => { KV.sym = s; save(); rerun(); }));
    const opts = el('div', 'fx-ql-row'); opts.style.marginTop = '8px';
    const sel = (lab, val, list, on) => { const l = el('label', '', lab), s = el('select'); for (const [v, t] of list) { const op = el('option', '', t); op.value = v; if (String(v) === String(val)) op.selected = true; s.append(op); } s.addEventListener('change', () => on(s.value)); l.append(s); return l; };
    opts.append(
      sel('Candles', KV.tf, [['1d', 'Daily'], ['1h', 'Hourly']], v => { KV.tf = v; save(); rerun(); }),
      sel('Forecast', KV.H, [[5, '5 candles'], [10, '10 candles'], [20, '20 candles'], [30, '30 candles']], v => { KV.H = +v; save(); rerun(); }),
      sel('History read', KV.L, [[128, '128 candles'], [256, '256 candles'], [512, '512 candles'], [1024, '1,024 candles (mini)']], v => { KV.L = +v; save(); rerun(); }),
      sel('Futures sampled', KV.S, [[8, '8 · quick'], [16, '16 · balanced'], [32, '32 · smoothest range']], v => { KV.S = +v; save(); rerun(); }),
      sel('Model', KV.model, [['mini', 'Kronos-mini · 4.1M · fast'], ['small', 'Kronos-small · 24.7M · larger']], v => { KV.model = v; save(); rerun(); }));
    ic.append(opts);
    const row = el('div', 'fx-kr-run'), go = btn('▶ Run Kronos forecast', 'fx-ql-btn pri'), status = el('span', 'fx-kr-status', 'Checking whether the model is already on this device…'), bar = el('div', 'fx-kr-bar'), bi = el('i'); bar.append(bi); bar.hidden = true;
    const cmp = btn('Compare with FCAST ▸', 'fx-ql-btn', () => T.openPage('fcast', KV.sym));
    row.append(go, cmp, status, bar); ic.append(row); wrap.append(ic);
    isCached(KV.model).then(c => { if (status.isConnected && !go.disabled) status.textContent = c ? `${M.name} is already on this device: a forecast takes a few seconds.` : `First run downloads ${M.name} (${M.size}) from Hugging Face once, then it stays in your browser cache.`; });
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(out);
    const o = {...KV}, hit = results.get(keyOf(o));
    if (hit) { setText('n-kronos', `${o.sym} · next ${o.H}`); renderResult(out, hit); }
    else out.append(note(`Pick a market and press Run. Kronos will read the last ${lookbackFor(o)} ${o.tf === '1h' ? 'hourly' : 'daily'} candles of ${o.sym} and sample ${o.S} possible futures for the next ${o.H} candles.`));
    // A run survives re-renders of the page: a new render re-attaches to the run that is still going.
    const attach = job => {
      go.disabled = true; bar.hidden = false; bi.style.width = Math.round(100 * (job.frac || 0.03)) + '%'; status.textContent = job.text || `Loading ${o.sym} candles…`;
      const onP = () => { if (!status.isConnected) return; status.textContent = job.text; bi.style.width = Math.round(100 * job.frac) + '%'; };
      job.listeners.add(onP);
      job.promise.then(r => {
        if (!out.isConnected) return; out.replaceChildren(); renderResult(out, r);
        status.textContent = `Done: ${o.S} futures from ${MODELS[o.model].name}, ${r.lookback} candles read.`; setText('n-kronos', `${o.sym} · next ${o.H}`);
      }, e => {
        if (!out.isConnected) return;
        const net = /fetch|network|Hugging Face/i.test(e.message || '');
        const box = el('div', 'fx-kr-err', net ? `Kronos could not be downloaded from Hugging Face (${e.message}). Check your connection, or a network filter that blocks huggingface.co, and try again. The FCAST pattern forecaster works without a download.` : (e.message || 'Kronos could not run.'));
        if (net) box.append(el('br'), btn('Open FCAST instead ▸', 'fx-ql-btn', () => T.openPage('fcast', o.sym)));
        out.replaceChildren(box); status.textContent = 'Stopped.';
      }).finally(() => { job.listeners.delete(onP); if (go.isConnected) { go.disabled = false; bar.hidden = true; } });
    };
    if (inflight.has(keyOf(o))) attach(inflight.get(keyOf(o)));
    go.addEventListener('click', async () => {
      const k = keyOf(o); if (inflight.has(k)) return attach(inflight.get(k));
      if (!(await T.gate('ai', k, out, 'Kronos AI forecast'))) return;
      const job = {listeners: new Set(), text: `Loading ${o.sym} candles…`, frac: 0.03};
      job.promise = run(o, m => { job.text = progressText(m, o); job.frac = fracOf(m); job.listeners.forEach(f => f()); })
        .then(r => { if (T.RENDER.kronos && $('tp-kronos')) renderPanel(); return r; }, e => { report('kronos', e); throw e; })
        .finally(() => inflight.delete(k));
      inflight.set(k, job); attach(job);
    });
  }

  function renderPanel() {
    const host = panel('kronos'); if (!host) return;
    host.replaceChildren(); const w = el('div', 'fx-ql'); host.append(w);
    const r = [...results.values()].sort((a, b) => b.at - a.at)[0];
    if (!r) {
      setText('n-kronos', 'AI forecast');
      w.append(el('span', 'fx-ql-sub', 'The open-source Kronos foundation model for candlesticks, running on your device. Forecast any market with a range built from many sampled futures.'));
      w.append(btn('Open Kronos ▸', 'fx-ql-btn pri', () => T.openPage('kronos', T.S?.sym?.symbol && SYM_RE.test(T.S.sym.symbol) ? T.S.sym.symbol : undefined)));
      return;
    }
    const {sm, c0, o} = r, H = o.H, [, color] = lean(sm.pUp);
    setText('n-kronos', `${o.sym} · next ${H}`);
    kpis(w, [['P(HIGHER IN ' + H + ')', pct(sm.pUp), `${sm.S} futures`, color], ['MEDIAN', spct(sm.q50[H - 1] / c0 - 1), MODELS[o.model].name], ['80% RANGE', `${spct(sm.q10[H - 1] / c0 - 1, 0)} … ${spct(sm.q90[H - 1] / c0 - 1, 0)}`, `${H} ${o.tf === '1h' ? 'hours' : 'days'}`]]);
    const cb = el('div', 'fx-ql-chart'); w.append(cb);
    requestAnimationFrame(() => SL.candleChart(cb, r.B, Math.max(0, r.N - 60), r.N - 1, {fan: {q10: sm.q10, q25: sm.q25, q50: sm.q50, q75: sm.q75, q90: sm.q90}, aria: 'Recent candles with the Kronos forecast range'}));
  }

  /* ---------------------------------------------- register ---------------------------------------------- */
  T.PANELS.kronos = ['KRONOS', 'Kronos AI forecast', 'kronos'];
  T.PANEL_DESC.kronos = 'Open-source Kronos foundation model, forecast range';
  T.LINK_LABEL.kronos = 'Full';
  T.RENDER.kronos = renderPanel;
  const grp = T.EXTRA_GROUPS.find(g => g[0] === 'Strategy lab'); if (grp) grp[1].push('kronos'); else T.EXTRA_GROUPS.push(['Strategy lab', ['kronos']]);
  if (PG) { PG.add('kronos', 'Kronos AI forecast', renderPage); T.PAGE_NAMES.push('KRONOS'); }
  T.Kronos = {futureBars, stampOf, summarize, MODELS};
});
