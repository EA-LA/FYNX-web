/* FYNX Terminal plugin: Strategy Lab. Three tools on real Yahoo Finance bars, computed in the browser.
 *
 * BTEST  Strategy backtester. Write rules in plain English ("buy when rsi(2) < 10 and close > sma(200)…") or pick a
 *        preset. A deterministic parser turns the text into rules (no AI guesses), and an event-driven engine runs
 *        them bar by bar: signals at the close, fills at the next open, stops and targets inside the bar with gap
 *        handling, commission and slippage. Reports in-sample vs out-of-sample results, the probabilistic Sharpe
 *        ratio, trades and monthly returns. Inspired by event-driven engines such as NautilusTrader and by
 *        natural-language research tools such as Vibe-Trading; FYNX does not place live orders.
 * OPTIM  Portfolio optimizer (in the spirit of skfolio). Equal weight, inverse volatility, minimum variance,
 *        maximum Sharpe, maximum diversification, equal risk contribution and hierarchical risk parity, with
 *        sample or Ledoit–Wolf covariance, weight caps, the efficient frontier and a walk-forward
 *        out-of-sample comparison with trading costs.
 * FCAST  K-line pattern forecaster. Finds the past candle windows most similar to the latest one (returns, ranges,
 *        bodies, wicks and volume, scaled by volatility) and shows what happened next as a forecast fan, then scores
 *        that method out of sample. A transparent analog model; the Kronos neural network has its own page (kronos.js).
 * Nothing here is advice; past patterns and backtests do not guarantee future results. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {el, btn, svg, $, panel, setText, store, empty, finite, report} = T;
  const QL = T.QuantLab, QR = T.QuantResearch;
  if (!QL || !QR) return;
  const {loadCloses, quantile, kpis, erfc} = QL;
  const {loadBars, mean, sd} = QR;
  const {frame, label, lineChart, heatmap, card, chartBox, note, chips, symbolBox, pill} = QR.ui;
  const SYM_RE = /^[A-Z0-9.\-=^&]{1,24}$/;
  const pct = (v, d = 1) => finite(v) ? (v * 100).toFixed(d) + '%' : '—';
  const spct = (v, d = 1) => finite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + '%' : '—';
  const num = (v, d = 2) => finite(v) ? (v < 0 ? '−' : '') + Math.abs(v).toFixed(d) : '—';
  const MONO = 'IBM Plex Mono, monospace';
  const ncdf = x => 0.5 * erfc(-x / Math.SQRT2);
  const isCrypto = s => /-USD$/.test(s);

  const st = el('style'); st.id = 'fx-strategy-style';
  st.textContent = `
.fx-ql textarea.fx-sl-rules{width:100%;min-height:96px;resize:vertical;box-sizing:border-box;padding:8px 10px;background:#0b0f0e!important;color:#e8ecea!important;-webkit-text-fill-color:#e8ecea!important;border:1px solid #2a3330!important;border-radius:3px;font:12.5px/1.55 'IBM Plex Mono',monospace!important;color-scheme:dark}
.fx-ql textarea.fx-sl-rules:focus{outline:1px solid #ffb000;border-color:#ffb000!important}
.fx-sl-chips{display:flex;flex-wrap:wrap;gap:4px}
.fx-sl-chip{padding:3px 7px;border:1px solid var(--ln2);background:#0d1312;font:500 11px 'IBM Plex Mono',monospace;color:var(--tx)}
.fx-sl-chip b{color:var(--am);font-weight:700;margin-right:4px}
.fx-sl-err{padding:8px 10px;border-left:3px solid #ff5a4f;background:#1a0b0b;color:#ffb4ad;font-size:12px;line-height:1.5}
.fx-sl-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:14px}
.fx-sl-wt td{font:500 11.5px 'IBM Plex Mono',monospace}
.fx-sl-cell{display:inline-block;min-width:44px;padding:1px 4px;text-align:right}
.fx-sl-help{margin:0;padding-left:16px;color:var(--mu);font-size:11.5px;line-height:1.6}
.fx-sl-help code{color:var(--am);font-family:'IBM Plex Mono',monospace}
@media (max-width:900px){.fx-sl-grid{grid-template-columns:1fr}}`;
  document.head.append(st);

  /* ============================================ indicators ============================================== */
  function smaArr(src, n) { const out = new Float64Array(src.length).fill(NaN); let s = 0, k = 0; for (let i = 0; i < src.length; i++) { const v = src[i]; if (!finite(v)) { s = 0; k = 0; continue; } s += v; k++; if (k > n) { s -= src[i - n]; k = n; } if (k === n) out[i] = s / n; } return out; }
  function emaArr(src, n) { const out = new Float64Array(src.length).fill(NaN), a = 2 / (n + 1); let e = NaN, seen = 0, s = 0; for (let i = 0; i < src.length; i++) { const v = src[i]; if (!finite(v)) continue; if (seen < n) { s += v; seen++; if (seen === n) { e = s / n; out[i] = e; } continue; } e = a * v + (1 - a) * e; out[i] = e; } return out; }
  function rsiArr(c, n) { const out = new Float64Array(c.length).fill(NaN); let g = 0, l = 0; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up / n; l += dn / n; if (i === n) out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); continue; } g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return out; }
  function atrArr(B, n) { const N = B.c.length, tr = new Float64Array(N), out = new Float64Array(N).fill(NaN); for (let i = 0; i < N; i++) tr[i] = i ? Math.max(B.h[i] - B.l[i], Math.abs(B.h[i] - B.c[i - 1]), Math.abs(B.l[i] - B.c[i - 1])) : B.h[i] - B.l[i]; let a = 0; for (let i = 0; i < N; i++) { if (i < n) { a += tr[i] / n; if (i === n - 1) out[i] = a; continue; } a = (a * (n - 1) + tr[i]) / n; out[i] = a; } return out; }
  // highest/lowest over the PREVIOUS n bars (excludes the current bar, so "close > highest(20)" is a real breakout)
  function rollMax(src, n) { const out = new Float64Array(src.length).fill(NaN); for (let i = n; i < src.length; i++) { let m = -Infinity; for (let j = i - n; j < i; j++) m = Math.max(m, src[j]); out[i] = m; } return out; }
  function rollMin(src, n) { const out = new Float64Array(src.length).fill(NaN); for (let i = n; i < src.length; i++) { let m = Infinity; for (let j = i - n; j < i; j++) m = Math.min(m, src[j]); out[i] = m; } return out; }
  function rollSd(src, n) { const out = new Float64Array(src.length).fill(NaN); for (let i = n - 1; i < src.length; i++) { let s = 0, q = 0; for (let j = i - n + 1; j <= i; j++) { s += src[j]; q += src[j] * src[j]; } out[i] = Math.sqrt(Math.max(0, q / n - (s / n) ** 2)); } return out; }

  /* ===================================== plain-English rule parser ====================================== */
  // Indicator catalogue: name -> [arg defaults, description, builder(B, args)]
  const IND = {
    close: [[], 'closing price', B => B.c], open: [[], 'opening price', B => B.o], high: [[], 'bar high', B => B.h], low: [[], 'bar low', B => B.l], volume: [[], 'volume', B => B.v],
    sma: [[20], 'simple moving average', (B, [n]) => smaArr(B.c, n)],
    ema: [[20], 'exponential moving average', (B, [n]) => emaArr(B.c, n)],
    rsi: [[14], 'relative strength index (0–100)', (B, [n]) => rsiArr(B.c, n)],
    atr: [[14], 'average true range', (B, [n]) => atrArr(B, n)],
    highest: [[20], 'highest high of the previous n bars', (B, [n]) => rollMax(B.h, n)],
    lowest: [[20], 'lowest low of the previous n bars', (B, [n]) => rollMin(B.l, n)],
    bbupper: [[20, 2], 'upper Bollinger band (n, k)', (B, [n, k]) => { const m = smaArr(B.c, n), s = rollSd(B.c, n); return m.map((v, i) => v + k * s[i]); }],
    bblower: [[20, 2], 'lower Bollinger band (n, k)', (B, [n, k]) => { const m = smaArr(B.c, n), s = rollSd(B.c, n); return m.map((v, i) => v - k * s[i]); }],
    roc: [[20], 'return over n bars, in %', (B, [n]) => B.c.map((v, i) => i >= n ? (v / B.c[i - n] - 1) * 100 : NaN)],
    zscore: [[20], 'distance from the n-bar mean in standard deviations', (B, [n]) => { const m = smaArr(B.c, n), s = rollSd(B.c, n); return B.c.map((v, i) => s[i] > 0 ? (v - m[i]) / s[i] : NaN); }],
    macd: [[12, 26], 'MACD line (fast, slow)', (B, [a, b]) => { const f = emaArr(B.c, a), s = emaArr(B.c, b); return f.map((v, i) => v - s[i]); }],
    macdsig: [[12, 26, 9], 'MACD signal line', (B, [a, b, c]) => { const f = emaArr(B.c, a), s = emaArr(B.c, b), m = f.map((v, i) => v - s[i]); const first = m.findIndex(finite); const sig = emaArr(Array.from(m, v => finite(v) ? v : NaN), c); return first < 0 ? sig : sig; }],
    avgvol: [[20], 'average volume over n bars', (B, [n]) => smaArr(B.v, n)]
  };
  function normalizeText(t) {
    let s = ' ' + String(t).toLowerCase().replace(/[“”"]/g, '').replace(/≥/g, '>=').replace(/≤/g, '<=') + ' ';
    const R = (re, to) => { s = s.replace(re, to); };
    R(/\b(\d+)\s*[- ]?\s*(?:day|bar|period|week)s?\s+(?:simple\s+)?moving\s+average\b/g, ' sma($1) ');
    R(/\b(\d+)\s*[- ]?\s*(?:day|bar|period)s?\s+(?:exponential\s+moving\s+average|ema)\b/g, ' ema($1) ');
    R(/\b(\d+)\s*[- ]?\s*(?:day|bar|period)s?\s+(sma|ema|rsi|atr)\b/g, ' $2($1) ');
    R(/\b(\d+)\s*[- ]?\s*(?:day|bar|period)s?\s+(?:high|highest\s+high|highs?)\b/g, ' highest($1) ');
    R(/\b(\d+)\s*[- ]?\s*(?:day|bar|period)s?\s+(?:low|lowest\s+low|lows?)\b/g, ' lowest($1) ');
    R(/\b(\d+)\s*[- ]?\s*(?:day|bar|period)s?\s+(?:return|change|momentum)\b/g, ' roc($1) ');
    R(/\breturn\s+over\s+(?:the\s+(?:last|past)\s+)?(\d+)\s+(?:days|bars|periods)\b/g, ' roc($1) ');
    R(/\bexponential\s+moving\s+average\b/g, ' ema ');
    R(/\b(?:simple\s+)?moving\s+average\b/g, ' sma ');
    R(/\bupper\s+bollinger(?:\s+band)?\b/g, ' bbupper '); R(/\blower\s+bollinger(?:\s+band)?\b/g, ' bblower ');
    R(/\bmacd\s+signal(?:\s+line)?\b/g, ' macdsig '); R(/\bsignal\s+line\b/g, ' macdsig ');
    R(/\baverage\s+volume\b/g, ' avgvol ');
    R(/\b(?:highest\s+high|recent\s+high)\b/g, ' highest '); R(/\b(?:lowest\s+low|recent\s+low)\b/g, ' lowest ');
    R(/\bz-score\b/g, ' zscore ');
    R(/\b(?:the\s+)?(?:closing\s+price|price|last\s+price)\b/g, ' close ');
    R(/\bma\s*\(/g, ' sma('); R(/\bma\s+(\d+)/g, ' sma($1)');
    R(/\b(sma|ema|rsi|atr|highest|lowest|bbupper|bblower|roc|zscore|macd|macdsig|avgvol)\s+(\d+(?:\.\d+)?)(?!\s*%)/g, ' $1($2) ');
    R(/\bcross(?:es|ed)?\s+(?:above|over)\b/g, ' XA '); R(/\bcross(?:es|ed)?\s+(?:below|under)\b/g, ' XB ');
    R(/\b(?:is\s+)?(?:greater\s+than\s+or\s+equal\s+to|at\s+least)\b/g, ' >= '); R(/\b(?:is\s+)?(?:less\s+than\s+or\s+equal\s+to|at\s+most)\b/g, ' <= ');
    R(/\b(?:is\s+)?(?:above|over|greater\s+than|higher\s+than|more\s+than)\b/g, ' > '); R(/\b(?:is\s+)?(?:below|under|less\s+than|lower\s+than)\b/g, ' < ');
    R(/\bthe\b/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }
  function tokenize(s) {
    const out = [], re = /\s*(?:(XA|XB)|(>=|<=|>|<)|(\band\b|\bor\b)|([a-z]+)\s*(?:\(\s*([\d.\s,]*)\))?|(-?\d+(?:\.\d+)?)\s*(%)?)/y;
    let i = 0;
    while (i < s.length) {
      re.lastIndex = i; const m = re.exec(s); if (!m || m[0] === '') throw new Error(`I don’t understand “${s.slice(i, i + 24).trim()}”.`);
      i = re.lastIndex;
      if (m[1]) out.push({t: 'cross', v: m[1]}); else if (m[2]) out.push({t: 'op', v: m[2]}); else if (m[3]) out.push({t: m[3]});
      else if (m[4]) { if (!IND[m[4]]) throw new Error(`Unknown indicator “${m[4]}”. Try close, sma(50), ema(20), rsi(14), atr(14), highest(20), lowest(20), bbupper(20,2), roc(20), macd, macdsig, zscore(20) or volume.`); const args = m[5] ? m[5].split(',').map(x => +x.trim()).filter(finite) : []; out.push({t: 'ind', name: m[4], args: IND[m[4]][0].map((d, k) => finite(args[k]) ? args[k] : d)}); }
      else if (m[6] !== undefined) out.push({t: 'num', v: +m[6], pct: !!m[7]});
    }
    return out;
  }
  function parseCond(text) {
    const tk = tokenize(normalizeText(text)); let p = 0;
    const expr = () => { const x = tk[p]; if (!x || (x.t !== 'ind' && x.t !== 'num')) throw new Error('Expected a value such as close, sma(50) or a number.'); p++; return x; };
    const term = () => { const a = expr(), o = tk[p]; if (!o || (o.t !== 'op' && o.t !== 'cross')) throw new Error(`After “${show(a)}” I expected a comparison such as >, <, crosses above or crosses below.`); p++; const b = expr(); return {t: 'cmp', a, op: o.v, b}; };
    const and = () => { let x = term(); while (tk[p]?.t === 'and') { p++; x = {t: 'and', l: x, r: term()}; } return x; };
    let x = and(); while (tk[p]?.t === 'or') { p++; x = {t: 'or', l: x, r: and()}; }
    if (p < tk.length) throw new Error('Could not read the end of “' + text.trim() + '”. Join conditions with and / or.');
    return x;
  }
  const show = e => e.t === 'num' ? e.v + (e.pct ? '%' : '') : e.name + (IND[e.name][0].length ? '(' + e.args.join(',') + ')' : '');
  const showCond = c => c.t === 'cmp' ? `${show(c.a)} ${c.op === 'XA' ? 'crosses above' : c.op === 'XB' ? 'crosses below' : c.op} ${show(c.b)}` : `(${showCond(c.l)} ${c.t} ${showCond(c.r)})`;
  function parseRules(text) {
    const R = {long: null, exitLong: null, short: null, cover: null, stop: null, target: null, maxHold: null, notes: []};
    const sentences = String(text).replace(/\r/g, '').split(/[.\n;]+(?=\s|$)/).map(x => x.trim()).filter(Boolean);
    if (!sentences.length) throw new Error('Write at least one rule, e.g. “Buy when close crosses above sma(50).”');
    for (const raw of sentences) {
      const s = raw.toLowerCase().trim();
      let m;
      if ((m = /^(?:buy|go long|enter long|long)\s+(?:when|if)\s+(.+)$/.exec(s))) R.long = parseCond(m[1]);
      else if ((m = /^(?:sell|exit|exit long|close long|sell all)\s+(?:when|if)\s+(.+)$/.exec(s))) R.exitLong = parseCond(m[1]);
      else if ((m = /^(?:short|sell short|go short|enter short)\s+(?:when|if)\s+(.+)$/.exec(s))) R.short = parseCond(m[1]);
      else if ((m = /^(?:cover|exit short|close short|buy to cover)\s+(?:when|if)\s+(.+)$/.exec(s))) R.cover = parseCond(m[1]);
      else if ((m = /^(?:use\s+a\s+|set\s+a\s+)?stop(?:[- ]loss)?\s+(?:at\s+|of\s+)?(\d+(?:\.\d+)?)\s*(%|x?\s*atr)/.exec(s))) R.stop = m[2] === '%' ? {pct: +m[1] / 100} : {atr: +m[1]};
      else if ((m = /^(?:take[- ]profit|target|profit\s+target)\s+(?:at\s+|of\s+)?(\d+(?:\.\d+)?)\s*(%|x?\s*atr)/.exec(s))) R.target = m[2] === '%' ? {pct: +m[1] / 100} : {atr: +m[1]};
      else if ((m = /(?:max(?:imum)?\s+hold|hold\s+(?:for\s+)?(?:at\s+most|max(?:imum)?|no\s+more\s+than|up\s+to))\s+(\d+)\s*(?:days?|bars?)?/.exec(s))) R.maxHold = +m[1];
      else throw new Error(`I couldn’t read: “${raw}”. Start a rule with Buy when, Sell when, Short when, Cover when, Stop, Take profit or Max hold.`);
    }
    if (!R.long && !R.short) throw new Error('Add an entry rule: “Buy when …” or “Short when …”.');
    if (R.long && !R.exitLong && !R.stop && !R.target && !R.maxHold) { R.exitLongImplicit = true; R.notes.push('No sell rule: the long position closes when the buy condition stops being true.'); }
    if (R.short && !R.cover && !R.stop && !R.target && !R.maxHold) { R.coverImplicit = true; R.notes.push('No cover rule: the short closes when the short condition stops being true.'); }
    return R;
  }
  function compile(R, B) {
    const cache = new Map();
    const series = e => { if (e.t === 'num') return null; const k = e.name + '|' + e.args.join(','); if (!cache.has(k)) cache.set(k, IND[e.name][2](B, e.args)); return cache.get(k); };
    const val = (e, i) => e.t === 'num' ? e.v : series(e)[i];
    const ev = (c, i) => {
      if (c.t === 'and') return ev(c.l, i) && ev(c.r, i);
      if (c.t === 'or') return ev(c.l, i) || ev(c.r, i);
      const a = val(c.a, i), b = val(c.b, i); if (!finite(a) || !finite(b)) return false;
      if (c.op === '>') return a > b; if (c.op === '<') return a < b; if (c.op === '>=') return a >= b; if (c.op === '<=') return a <= b;
      if (i < 1) return false; const a0 = val(c.a, i - 1), b0 = val(c.b, i - 1); if (!finite(a0) || !finite(b0)) return false;
      return c.op === 'XA' ? a > b && a0 <= b0 : a < b && a0 >= b0;
    };
    const warm = c => !c ? 0 : c.t === 'cmp' ? Math.max(...[c.a, c.b].map(e => e.t === 'num' ? 0 : Math.max(0, ...e.args) * (e.name === 'macdsig' ? 1.5 : 1))) : Math.max(warm(c.l), warm(c.r));
    return {ev, warmup: Math.ceil(Math.max(warm(R.long), warm(R.exitLong), warm(R.short), warm(R.cover), R.stop?.atr || R.target?.atr ? 15 : 0)) + 1, atr: atrArr(B, 14)};
  }

  /* ========================================= backtest engine =========================================== */
  // Event-driven: signals at the close of bar i, market orders fill at the open of bar i+1, protective stops and
  // targets trigger inside a bar (a gap through the level fills at the open; if both are hit, the stop is assumed).
  function backtest(B, R, opt) {
    const N = B.c.length, C = compile(R, B), costRate = (opt.feeBps + opt.slipBps) / 1e4;
    const eq = new Float64Array(N).fill(NaN), pos = new Int8Array(N), trades = [];
    let cash = 1, qty = 0, side = 0, entryPx = 0, entryI = -1, stopPx = NaN, tgtPx = NaN, entryEq = 1;
    const rv = smaArr(B.c.map((v, i) => i ? Math.log(v / B.c[i - 1]) ** 2 : NaN), 20);
    const start = Math.max(C.warmup, 21);
    const close = (i, px, why) => { const fill = px * (1 - side * costRate); cash += qty * fill; trades.push({side, entryI, exitI: i, entry: entryPx, exit: fill, ret: side * (fill / entryPx - 1), pnl: cash - entryEq, why, bars: i - entryI}); qty = 0; side = 0; stopPx = tgtPx = NaN; };
    const open = (i, dir) => {
      const px = B.o[i] * (1 + dir * costRate), equity = cash;
      let frac = 1; if (opt.sizing === 'vol') { const v = Math.sqrt((rv[i - 1] || 0) * opt.ann); frac = v > 0 ? Math.min(opt.maxLev, opt.volTarget / v) : 1; }
      qty = dir * frac * equity / px; cash -= qty * px; side = dir; entryPx = px; entryI = i; entryEq = equity;
      const a = C.atr[i - 1];
      if (R.stop) stopPx = R.stop.pct ? px * (1 - dir * R.stop.pct) : finite(a) ? px - dir * R.stop.atr * a : NaN;
      if (R.target) tgtPx = R.target.pct ? px * (1 + dir * R.target.pct) : finite(a) ? px + dir * R.target.atr * a : NaN;
    };
    // pending target position for the next open: null = no order, otherwise -1 / 0 / 1
    let target = null;
    for (let i = 0; i < N; i++) {
      if (i >= start) {
        // 1) orders decided at yesterday's close fill at today's open
        if (target !== null) { if (side && side !== target) close(i, B.o[i], 'signal'); if (target && !side) open(i, target); target = null; }
        // 2) protective exits inside the bar
        if (side) {
          const hitStop = finite(stopPx) && (side > 0 ? B.l[i] <= stopPx : B.h[i] >= stopPx), hitTgt = finite(tgtPx) && (side > 0 ? B.h[i] >= tgtPx : B.l[i] <= tgtPx);
          if (hitStop) close(i, side > 0 ? Math.min(B.o[i], stopPx) : Math.max(B.o[i], stopPx), 'stop');
          else if (hitTgt) close(i, side > 0 ? Math.max(B.o[i], tgtPx) : Math.min(B.o[i], tgtPx), 'target');
          else if (R.maxHold && i - entryI >= R.maxHold) close(i, B.c[i], 'time');
        }
        // 3) rules are read at the close
        if (i < N - 1) {
          let want = side;
          if (side > 0 && ((R.exitLong && C.ev(R.exitLong, i)) || (R.exitLongImplicit && !C.ev(R.long, i)))) want = 0;
          if (side < 0 && ((R.cover && C.ev(R.cover, i)) || (R.coverImplicit && !C.ev(R.short, i)))) want = 0;
          if (want === 0) {
            const L = !!(R.long && C.ev(R.long, i)), S = !!(R.short && opt.allowShort && C.ev(R.short, i));
            if (L && !S) want = 1; else if (S && !L) want = -1;
          }
          if (want !== side) target = want;
        }
      }
      eq[i] = cash + qty * B.c[i]; pos[i] = side;
    }
    if (side) { trades.push({side, entryI, exitI: N - 1, entry: entryPx, exit: B.c[N - 1], ret: side * (B.c[N - 1] / entryPx - 1), open: true, why: 'open', bars: N - 1 - entryI}); }
    return {eq, pos, trades, start};
  }
  function perf(eq, from, to, ann) {
    const r = []; for (let i = from + 1; i <= to; i++) if (finite(eq[i]) && finite(eq[i - 1]) && eq[i - 1] > 0) r.push(eq[i] / eq[i - 1] - 1);
    if (r.length < 5) return null;
    const m = mean(r), s = sd(r), down = Math.sqrt(mean(r.map(x => Math.min(0, x) ** 2))), yrs = r.length / ann;
    let peak = -Infinity, mdd = 0; for (let i = from; i <= to; i++) { peak = Math.max(peak, eq[i]); mdd = Math.min(mdd, eq[i] / peak - 1); }
    const total = eq[to] / eq[from] - 1, cagr = (eq[to] / eq[from]) ** (1 / Math.max(yrs, 1e-9)) - 1, sharpe = s ? m / s * Math.sqrt(ann) : 0;
    // Probabilistic Sharpe ratio vs 0 (Bailey & López de Prado): adjusts for sample length, skew and fat tails.
    const sr = s ? m / s : 0, n = r.length, sk = mean(r.map(x => ((x - m) / (s || 1)) ** 3)), ku = mean(r.map(x => ((x - m) / (s || 1)) ** 4));
    const psr = ncdf(sr * Math.sqrt(n - 1) / Math.sqrt(Math.max(1e-9, 1 - sk * sr + (ku - 1) / 4 * sr * sr)));
    return {total, cagr, vol: s * Math.sqrt(ann), sharpe, sortino: down ? m / down * Math.sqrt(ann) : 0, mdd, calmar: mdd < 0 ? cagr / -mdd : NaN, psr, n};
  }
  // FINSABER-style significance (Li et al., 2025: most timing strategies stop beating buy & hold once tested long and
  // properly). Block bootstrap of daily excess returns over buy & hold, a paired bootstrap of the Sharpe gap, and a
  // random-timing baseline that shifts the strategy's own position series in time (same exposure, same trade lengths).
  function significance(eq, bh, pos, from, to, ann, {sims = 2000, block = 20, seed = 7} = {}) {
    const rs = [], rb = [], P = [];
    for (let i = from + 1; i <= to; i++) if (finite(eq[i]) && finite(eq[i - 1]) && eq[i - 1] > 0 && finite(bh[i]) && finite(bh[i - 1]) && bh[i - 1] > 0) { rs.push(eq[i] / eq[i - 1] - 1); rb.push(bh[i] / bh[i - 1] - 1); P.push(pos[i - 1] || 0); }
    const n = rs.length; if (n < 60) return null;
    let s = (seed >>> 0) || 1; const rand = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const sr = r => { const m = mean(r), v = sd(r); return v > 0 ? m / v * Math.sqrt(ann) : 0; };
    const d = rs.map((v, i) => v - rb[i]), md = mean(d), gap = sr(rs) - sr(rb);
    let beatMean = 0, gapLE0 = 0; const gaps = new Float64Array(sims);
    for (let k = 0; k < sims; k++) {
      const a = [], b = [], e = [];
      while (a.length < n) { const st = Math.floor(rand() * n); for (let j = 0; j < block && a.length < n; j++) { const q = (st + j) % n; a.push(rs[q]); b.push(rb[q]); e.push(d[q] - md); } }
      if (mean(e) >= md) beatMean++;
      gaps[k] = sr(a) - sr(b); if (gaps[k] <= 0) gapLE0++;
    }
    gaps.sort();
    // random timing: same position path shifted to a random start (gross of costs, compared like for like)
    const gross = sh => { const r = new Array(n); for (let i = 0; i < n; i++) r[i] = P[(i + sh) % n] * rb[i]; return sr(r); };
    const own = gross(0), shifts = []; for (let k = 0; k < 500; k++) shifts.push(gross(1 + Math.floor(rand() * (n - 1))));
    const exposure = P.filter(v => v).length / n;
    return {n, years: n / ann, excess: md * ann, pExcess: (beatMean + 1) / (sims + 1), gap, gapLo: gaps[Math.floor(0.05 * sims)], gapHi: gaps[Math.floor(0.95 * sims)], pGap: (gapLE0 + 1) / (sims + 1), randPct: shifts.filter(v => v < own).length / shifts.length, ownGross: own, exposure};
  }
  const annFor = (B, sym) => { const yrs = (B.t.at(-1) - B.t[0]) / (365.25 * 86400); return Math.max(1, Math.round(B.t.length / Math.max(yrs, 0.05))) || (isCrypto(sym) ? 365 : 252); };

  /* ---------------------------------------------- BTEST UI ----------------------------------------------- */
  const PRESETS = [
    ['trend', 'Trend following', 'Buy when close crosses above sma(50) and close > sma(200).\nSell when close crosses below sma(50).'],
    ['rsi2', 'RSI(2) dip buying', 'Buy when rsi(2) < 10 and close > sma(200).\nSell when rsi(2) > 70.\nMax hold 10 days.'],
    ['turtle', 'Donchian breakout', 'Buy when close > highest(55).\nSell when close < lowest(20).\nStop 2 ATR.'],
    ['boll', 'Bollinger reversion', 'Buy when close < bblower(20,2).\nSell when close > sma(20).\nStop 6%.'],
    ['macd', 'MACD cross', 'Buy when macd crosses above macdsig and close > sma(200).\nSell when macd crosses below macdsig.'],
    ['tsmom', 'Momentum long/short', 'Buy when roc(126) > 0.\nShort when roc(126) < 0.']
  ];
  const BV = (() => { let s = {}; try { s = JSON.parse(store.get('btest') || '{}') || {}; } catch (_) {} return {sym: SYM_RE.test(s.sym || '') ? s.sym : 'SPY', tf: s.tf === '1h' ? '1h' : '1d', text: typeof s.text === 'string' && s.text.trim() ? s.text.slice(0, 2000) : PRESETS[0][2], preset: s.preset || 'trend', feeBps: finite(s.feeBps) ? s.feeBps : 1, slipBps: finite(s.slipBps) ? s.slipBps : 2, sizing: s.sizing === 'vol' ? 'vol' : 'full', allowShort: s.allowShort !== false, split: finite(s.split) ? s.split : 0.7}; })();
  const saveB = () => { const {draft, ...keep} = BV; store.set('btest', JSON.stringify(keep)); };
  async function runBtest() {
    const R = parseRules(BV.text);
    const B = await loadBars(BV.sym, BV.tf);
    if (!B?.c?.length || B.c.length < 260) throw new Error(`Not enough ${BV.tf === '1h' ? 'hourly' : 'daily'} history for ${BV.sym}.`);
    if (!B.o) throw new Error('This data source has no open/high/low prices yet. Try again after the update deploys.');
    const ann = annFor(B, BV.sym), res = backtest(B, R, {feeBps: BV.feeBps, slipBps: BV.slipBps, sizing: BV.sizing, volTarget: 0.15, maxLev: 1.5, ann, allowShort: BV.allowShort});
    const N = B.c.length, s0 = res.start, cut = Math.floor(s0 + (N - 1 - s0) * BV.split);
    const bh = Float64Array.from(B.c, (v, i) => i < s0 ? NaN : v / B.c[s0]);
    const closed = res.trades.filter(t => !t.open), wins = closed.filter(t => t.ret > 0), losses = closed.filter(t => t.ret <= 0);
    const gp = wins.reduce((a, t) => a + t.ret, 0), gl = -losses.reduce((a, t) => a + t.ret, 0);
    let inMkt = 0; for (let i = s0; i < N; i++) if (res.pos[i]) inMkt++;
    return {R, B, res, ann, N, s0, cut, bh, sig: significance(res.eq, bh, res.pos, s0, N - 1, ann), all: perf(res.eq, s0, N - 1, ann), is: perf(res.eq, s0, cut, ann), oos: perf(res.eq, cut, N - 1, ann), bhAll: perf(bh, s0, N - 1, ann), bhOos: perf(bh, cut, N - 1, ann),
      tstats: {n: closed.length, win: closed.length ? wins.length / closed.length : NaN, avgW: wins.length ? mean(wins.map(t => t.ret)) : NaN, avgL: losses.length ? mean(losses.map(t => t.ret)) : NaN, pf: gl > 0 ? gp / gl : NaN, exposure: inMkt / (N - s0), avgBars: closed.length ? mean(closed.map(t => t.bars)) : NaN}};
  }
  function ruleChips(R) {
    const box = el('div', 'fx-sl-chips'), add = (k, v) => { const c = el('span', 'fx-sl-chip'); c.append(el('b', '', k), document.createTextNode(v)); box.append(c); };
    if (R.long) add('BUY', showCond(R.long)); if (R.exitLong) add('SELL', showCond(R.exitLong)); if (R.short) add('SHORT', showCond(R.short)); if (R.cover) add('COVER', showCond(R.cover));
    if (R.stop) add('STOP', R.stop.pct ? pct(R.stop.pct, 1) : R.stop.atr + '× ATR(14)'); if (R.target) add('TARGET', R.target.pct ? pct(R.target.pct, 1) : R.target.atr + '× ATR(14)'); if (R.maxHold) add('MAX HOLD', R.maxHold + ' bars');
    return box;
  }
  function candleChart(box, B, from, to, {marks = [], fan = null, aria = 'Price chart', ghost = null} = {}) {
    const {w, h, s} = frame(box, aria, 160), padL = 52, padR = 10, padT = 8, padB = 18, iw = w - padL - padR, ih = h - padT - padB, n = to - from + 1, extra = fan ? fan.q50.length : 0, slots = n + extra;
    let lo = Infinity, hi = -Infinity; for (let i = from; i <= to; i++) { lo = Math.min(lo, B.l[i]); hi = Math.max(hi, B.h[i]); }
    if (fan) { lo = Math.min(lo, ...fan.q10); hi = Math.max(hi, ...fan.q90); }
    const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
    const X = k => padL + (k + 0.5) / slots * iw, Y = v => padT + (hi - v) / (hi - lo) * ih, bw = Math.max(1, iw / slots * 0.65);
    for (let k = 0; k <= 3; k++) { const v = lo + (hi - lo) * k / 3; s.append(svg('line', {x1: padL, x2: w - padR, y1: Y(v), y2: Y(v), stroke: '#1b2421'})); label(s, padL - 4, Y(v) + 3, v >= 100 ? v.toFixed(0) : v.toPrecision(4), {'text-anchor': 'end'}); }
    for (let i = from; i <= to; i++) { const k = i - from, up = B.c[i] >= B.o[i], col = up ? '#3ecf8e' : '#ff5a4f'; s.append(svg('line', {x1: X(k), x2: X(k), y1: Y(B.h[i]), y2: Y(B.l[i]), stroke: col, 'stroke-width': 1})); s.append(svg('rect', {x: X(k) - bw / 2, y: Y(Math.max(B.o[i], B.c[i])), width: bw, height: Math.max(1, Math.abs(Y(B.o[i]) - Y(B.c[i]))), fill: col, 'fill-opacity': up ? 0.85 : 0.9})); }
    if (ghost) ghost.forEach((g, j) => { const k = n + j, up = g.c >= g.o; s.append(svg('line', {x1: X(k), x2: X(k), y1: Y(g.h), y2: Y(g.l), stroke: '#8a9891', 'stroke-opacity': 0.6})); s.append(svg('rect', {x: X(k) - bw / 2, y: Y(Math.max(g.o, g.c)), width: bw, height: Math.max(1, Math.abs(Y(g.o) - Y(g.c))), fill: 'none', stroke: up ? '#3ecf8e' : '#ff5a4f', 'stroke-opacity': 0.7})); });
    if (fan) {
      const xs = fan.q50.map((_, j) => X(n + j)), x0 = X(n - 1), c0 = B.c[to];
      const band = (a, b2, fill) => { let d = `M${x0} ${Y(c0)}`; a.forEach((v, j) => d += `L${xs[j]} ${Y(v)}`); for (let j = b2.length - 1; j >= 0; j--) d += `L${xs[j]} ${Y(b2[j])}`; s.append(svg('path', {d: d + 'Z', fill, stroke: 'none'})); };
      band(fan.q90, fan.q10, 'rgba(255,176,0,.12)'); band(fan.q75, fan.q25, 'rgba(255,176,0,.22)');
      let d = `M${x0} ${Y(c0)}`; fan.q50.forEach((v, j) => d += `L${xs[j]} ${Y(v)}`); s.append(svg('path', {d, fill: 'none', stroke: '#ffb000', 'stroke-width': 2}));
      s.append(svg('line', {x1: x0, x2: x0, y1: padT, y2: h - padB, stroke: '#4b5953', 'stroke-dasharray': '3 3'})); label(s, x0 + 4, padT + 10, 'forecast →', {fill: '#ffb000'});
    }
    for (const m of marks) { if (m.i < from || m.i > to) continue; const k = m.i - from, y = m.up ? Y(B.l[m.i]) + 10 : Y(B.h[m.i]) - 10; s.append(svg('path', {d: m.up ? `M${X(k)} ${y - 6}l-4.5 7h9z` : `M${X(k)} ${y + 6}l-4.5 -7h9z`, fill: m.color})); }
    const lab = i => { const d = B.day?.[i] || ''; return d; };
    [0, Math.floor((n - 1) / 2), n - 1].forEach((k, j) => label(s, X(k), h - 4, lab(from + k), {'text-anchor': ['start', 'middle', 'end'][j]}));
    box.replaceChildren(s);
  }
  function monthlyHeat(box, B, eq, from) {
    const m = new Map(); let cur = null;
    for (let i = from; i < B.c.length; i++) { const k = (B.day?.[i] || '').slice(0, 7); if (!k) continue; if (k !== cur) { m.set(k, [i > from ? eq[i - 1] : eq[i], eq[i]]); cur = k; } else m.get(k)[1] = eq[i]; }
    const years = [...new Set([...m.keys()].map(k => k.slice(0, 4)))].sort(), months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const cells = years.map(y => months.map(mo => { const v = m.get(y + '-' + mo); return v && v[0] > 0 ? v[1] / v[0] - 1 : null; }));
    const div = v => { if (!finite(v)) return '#0b0f0e'; const t = Math.max(-1, Math.min(1, v / 0.08)); return t >= 0 ? `rgba(62,207,142,${0.12 + 0.75 * t})` : `rgba(255,90,79,${0.12 + 0.75 * -t})`; };
    heatmap(box, {rows: years, cols: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'], cells, scale: div, fmt: v => (v * 100).toFixed(1), aria: 'Monthly strategy returns', title: (v, r, c) => `${years[r]}-${months[c]}: ${spct(v)}`});
  }
  async function renderBtest() {
    const host = panel('btest'); empty(host, `Backtesting ${BV.sym}…`);
    let r; try { r = await runBtest(); } catch (e) { report('btest', e); return empty(host, e.message || 'Backtest unavailable right now.'); }
    if (!$('tp-btest')) return; host.replaceChildren(); setText('n-btest', `${BV.sym} · ${BV.tf === '1h' ? 'hourly' : 'daily'}`);
    const w = el('div', 'fx-ql'); host.append(w);
    const p = PRESETS.find(x => x[2] === BV.text); w.append(el('span', 'fx-ql-sub', (p ? p[1] : 'Your rules') + ' · signals at the close, fills next open'));
    kpis(w, [['STRATEGY CAGR', spct(r.all?.cagr), `Sharpe ${num(r.all?.sharpe)} · DD ${pct(r.all?.mdd, 0)}`, (r.all?.cagr || 0) >= (r.bhAll?.cagr || 0) ? '#3ecf8e' : '#ffb000'], ['BUY & HOLD', spct(r.bhAll?.cagr), `Sharpe ${num(r.bhAll?.sharpe)} · DD ${pct(r.bhAll?.mdd, 0)}`, '#5b8def'], ['OUT OF SAMPLE', num(r.oos?.sharpe), `Sharpe · last ${Math.round((1 - BV.split) * 100)}%`]]);
    const cb = el('div', 'fx-ql-chart'); w.append(cb);
    requestAnimationFrame(() => lineChart(cb, {series: [{v: Array.from(r.bh), color: '#5b8def', width: 1.2, name: 'Buy & hold'}, {v: Array.from(r.res.eq), color: '#ffb000', width: 1.8, name: 'Strategy'}], xs: r.B.day, log: true, yfmt: v => v.toFixed(2) + '×', aria: 'Strategy equity vs buy and hold'}));
  }
  async function renderBtestPage(host, arg) {
    if (arg && SYM_RE.test(String(arg).toUpperCase())) { BV.sym = String(arg).toUpperCase(); saveB(); }
    PG.setHead('BTEST', 'Strategy backtester', 'Write trading rules in plain English, then test them bar by bar on real prices: next-bar fills, stops, costs and out-of-sample results');
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap);
    const rerun = () => { if (wrap.isConnected) PG.rerender(); };
    const top = el('div', 'fx-ql-card'); top.append(el('h3', '', 'MARKET'));
    top.append(symbolBox(BV.sym, s => { BV.sym = s; saveB(); rerun(); }, 'Any symbol: SPY, AAPL, BTC-USD, EURUSD=X, GC=F'));
    top.append(chips([['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['AAPL', 'Apple'], ['BTC-USD', 'Bitcoin'], ['EURUSD=X', 'EUR/USD'], ['GC=F', 'Gold'], ['CL=F', 'Crude'], ['TLT', 'Treasuries']], BV.sym, s => { BV.sym = s; saveB(); rerun(); }));
    wrap.append(top);
    const rc = el('div', 'fx-ql-card'); rc.append(el('h3', '', 'RULES (PLAIN ENGLISH)'));
    rc.append(chips(PRESETS.map(p => [p[0], p[1]]), PRESETS.find(p => p[2] === BV.text)?.[0], k => { const p = PRESETS.find(x => x[0] === k); BV.text = p[2]; BV.preset = k; BV.draft = undefined; saveB(); rerun(); }));
    const ta = el('textarea', 'fx-sl-rules'); ta.value = typeof BV.draft === 'string' ? BV.draft : BV.text; ta.spellcheck = false; ta.setAttribute('aria-label', 'Strategy rules in plain English'); ta.style.marginTop = '8px';
    const parsed = el('div'); parsed.style.marginTop = '8px';
    const preview = () => { parsed.replaceChildren(); try { const R = parseRules(ta.value); parsed.append(ruleChips(R)); for (const n2 of R.notes) parsed.append(note(n2)); } catch (e) { parsed.append(el('div', 'fx-sl-err', e.message)); } };
    ta.addEventListener('input', () => { BV.draft = ta.value; preview(); }); // survives the terminal's one-time redraw
    ta.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); go(); } });
    const go = () => { try { parseRules(ta.value); } catch (e) { preview(); return; } BV.text = ta.value.slice(0, 2000); BV.draft = undefined; saveB(); rerun(); };
    const opts = el('div', 'fx-ql-row'); opts.style.marginTop = '8px';
    const sel = (lab, val, list, on) => { const l = el('label', '', lab), s = el('select'); for (const [v, t] of list) { const o = el('option', '', t); o.value = v; if (String(v) === String(val)) o.selected = true; s.append(o); } s.addEventListener('change', () => on(s.value)); l.append(s); return l; };
    opts.append(btn('Run backtest', 'fx-ql-btn pri', go),
      sel('Bars', BV.tf, [['1d', 'Daily · 10 years'], ['1h', 'Hourly · 2 years']], v => { BV.tf = v; saveB(); rerun(); }),
      sel('Costs', `${BV.feeBps}/${BV.slipBps}`, [['0/0', 'None'], ['1/2', '1 bp fee + 2 bp slippage'], ['5/5', '5 + 5 bp'], ['10/10', '10 + 10 bp']], v => { const [a, b] = v.split('/').map(Number); BV.feeBps = a; BV.slipBps = b; saveB(); rerun(); }),
      sel('Size', BV.sizing, [['full', '100% of equity'], ['vol', 'Volatility target 15%']], v => { BV.sizing = v; saveB(); rerun(); }),
      sel('Shorts', BV.allowShort ? 'y' : 'n', [['y', 'Allowed'], ['n', 'Long only']], v => { BV.allowShort = v === 'y'; saveB(); rerun(); }),
      sel('Out-of-sample', BV.split, [[0.7, 'Last 30%'], [0.5, 'Last 50%'], [0.8, 'Last 20%']], v => { BV.split = +v; saveB(); rerun(); }));
    const help = el('details'); const hs = el('summary', '', 'What can I write?'); hs.style.cssText = 'cursor:pointer;color:var(--am);font:600 11.5px Inter,Arial,sans-serif;margin-top:8px';
    const ul = el('ul', 'fx-sl-help');
    for (const t of ['Sentences start with <code>Buy when</code>, <code>Sell when</code>, <code>Short when</code>, <code>Cover when</code>, <code>Stop 5%</code> / <code>Stop 2 ATR</code>, <code>Take profit 10%</code> or <code>Max hold 15 days</code>.', 'Compare values with <code>&gt; &lt; &gt;= &lt;=</code>, <code>above</code>, <code>below</code>, <code>crosses above</code>, <code>crosses below</code>; join with <code>and</code> / <code>or</code>.', 'Values: <code>close open high low volume</code>, <code>sma(50)</code>, <code>ema(20)</code>, <code>rsi(14)</code>, <code>atr(14)</code>, <code>highest(20)</code> / <code>lowest(20)</code> (previous 20 bars), <code>bbupper(20,2)</code>, <code>bblower(20,2)</code>, <code>roc(126)</code> (% return), <code>zscore(20)</code>, <code>macd</code>, <code>macdsig</code>, <code>avgvol(20)</code>, or numbers.', 'Phrases work too: “the 200-day moving average”, “the 20-day high”, “RSI 14”, “upper Bollinger band”.']) { const li = el('li'); li.innerHTML = t; ul.append(li); }
    help.append(hs, ul);
    rc.append(ta, parsed, opts, help); wrap.append(rc); preview();
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(out); out.append(note('Downloading bars and running the backtest…'));
    let r; try { r = await runBtest(); } catch (e) { out.replaceChildren(el('div', 'fx-sl-err', e.message || 'Backtest unavailable right now.')); return; }
    if (!out.isConnected) return; out.replaceChildren();
    const beat = (r.oos?.sharpe ?? -9) > (r.bhOos?.sharpe ?? 9), hd = el('div', 'fx-ql-head'), stt = el('span', 'fx-ql-state', !r.tstats.n ? 'NO TRADES' : beat ? 'BETTER RISK-ADJUSTED THAN BUY & HOLD (OUT OF SAMPLE)' : 'NOT BETTER THAN BUY & HOLD (OUT OF SAMPLE)');
    stt.style.color = !r.tstats.n ? '#7d8a83' : beat ? '#3ecf8e' : '#ffb000'; stt.style.fontSize = '15px';
    hd.append(stt, el('span', 'fx-ql-sub', `${r.B.name || BV.sym} · ${r.B.day[r.s0]} → ${r.B.day.at(-1)} · ${r.N - r.s0} bars · out-of-sample from ${r.B.day[r.cut]}`)); out.append(hd);
    kpis(out, [['CAGR', spct(r.all?.cagr), `buy & hold ${spct(r.bhAll?.cagr)}`, (r.all?.cagr || 0) >= (r.bhAll?.cagr || 0) ? '#3ecf8e' : '#ffb000'], ['SHARPE', num(r.all?.sharpe), `buy & hold ${num(r.bhAll?.sharpe)}`], ['MAX DRAWDOWN', pct(r.all?.mdd, 1), `buy & hold ${pct(r.bhAll?.mdd, 1)}`, '#ff5a4f'],
      ['PROB. SHARPE > 0', pct(r.all?.psr, 0), 'adjusts for length, skew, tails', (r.all?.psr || 0) >= 0.95 ? '#3ecf8e' : null], ['TRADES', String(r.tstats.n), `win ${pct(r.tstats.win, 0)} · PF ${num(r.tstats.pf)}`], ['TIME IN MARKET', pct(r.tstats.exposure, 0), `avg hold ${num(r.tstats.avgBars, 1)} bars`]]);
    const v = el('div', 'fx-ql-verdict'); v.style.borderColor = beat ? '#3ecf8e' : '#ffb000';
    v.textContent = !r.tstats.n ? 'The rules never triggered in this history. Loosen a condition or try another market.' : `In-sample (first ${Math.round(BV.split * 100)}%): Sharpe ${num(r.is?.sharpe)} vs buy & hold ${num(perf(r.bh, r.s0, r.cut, r.ann)?.sharpe)}. Out-of-sample (the part you should trust more): Sharpe ${num(r.oos?.sharpe)} vs ${num(r.bhOos?.sharpe)}, CAGR ${spct(r.oos?.cagr)} vs ${spct(r.bhOos?.cagr)}${(r.oos?.cagr ?? 0) < (r.bhOos?.cagr ?? 0) && beat ? ' (smoother, but it made less money)' : ''}. ${r.all?.psr >= 0.95 ? 'The full-period Sharpe is statistically above zero (PSR ≥ 95%).' : 'The full-period Sharpe is not statistically distinguishable from zero (PSR below 95%).'} Costs: ${BV.feeBps} bp fee + ${BV.slipBps} bp slippage per side.`;
    out.append(v);
    if (r.sig && r.tstats.n) {
      const g = r.sig, sigBeat = g.pGap < 0.05 && g.pExcess < 0.05, luck = g.randPct < 0.9, sc = el('div'); sc.style.cssText = 'display:flex;flex-direction:column;gap:10px';
      kpis(sc, [['BEATS BUY & HOLD?', g.pExcess < 0.05 ? 'YES' : 'NOT PROVEN', `p ${g.pExcess < 0.001 ? '< 0.001' : g.pExcess.toFixed(3)} · excess ${spct(g.excess)}/yr`, g.pExcess < 0.05 ? '#3ecf8e' : '#ffb000'],
        ['SHARPE GAP (90% RANGE)', num(g.gap), `${num(g.gapLo)} to ${num(g.gapHi)} · p ${g.pGap.toFixed(3)}`, g.gapLo > 0 ? '#3ecf8e' : g.gapHi < 0 ? '#ff5a4f' : '#ffb000'],
        ['VS RANDOM TIMING', pct(g.randPct, 0), `percentile of 500 shifted copies · in market ${pct(g.exposure, 0)}`, g.randPct >= 0.95 ? '#3ecf8e' : '#ffb000']]);
      const sv = el('div', 'fx-ql-verdict'); sv.style.borderColor = sigBeat && !luck ? '#3ecf8e' : '#ffb000';
      sv.textContent = `Over ${g.years.toFixed(1)} years the strategy earned ${(Math.abs(g.excess) * 100).toFixed(1)}% a year ${g.excess >= 0 ? 'more' : 'less'} than buy & hold (after costs). ${g.excess >= 0 ? `A block bootstrap puts the chance of an edge that large arising by luck at ${g.pExcess < 0.001 ? 'under 0.1%' : (g.pExcess * 100).toFixed(1) + '%'}` : `So there is no return edge over holding (block bootstrap p ${g.pExcess.toFixed(2)})`}, and the Sharpe ratio gap has a 90% range of ${num(g.gapLo)} to ${num(g.gapHi)}. ${luck ? `The same trades placed at random times did as well ${pct(1 - g.randPct, 0)} of the time, so the timing itself is not clearly adding value.` : `Only ${pct(1 - g.randPct, 0)} of randomly timed copies with the same exposure did as well, so the timing looks informative.`} ${sigBeat && !luck ? 'This passes the test most published timing strategies fail.' : 'Like most timing strategies in long tests (the FINSABER finding), this does not convincingly beat simply holding.'}`;
      sc.append(sv); out.append(card('IS IT SIGNIFICANT? · FINSABER-STYLE CHECK AGAINST BUY & HOLD', sc, note('Block bootstrap (20-day blocks, 2,000 resamples) of daily returns over buy & hold; random timing shifts the strategy’s own position series to random start dates, keeping exposure and holding periods. Inspired by FINSABER (Li et al., 2025), which found that many celebrated timing strategies lose their edge against buy & hold once tested over long periods and many assets.')));
    }
    const eqc = chartBox(300); out.append(card('EQUITY (LOG SCALE) · SHADED = OUT OF SAMPLE', eqc));
    const grid = el('div', 'fx-sl-grid'), pc = chartBox(300), mc = chartBox(Math.max(160, 22 * 11 + 30));
    grid.append(card('LAST 160 BARS · ▲ ENTRY ▼ EXIT', pc), card('MONTHLY RETURNS (%)', mc)); out.append(grid);
    const tbl = el('table', 'fx-ql-tbl'), th = el('tr'); ['#', 'SIDE', 'ENTRY', 'EXIT', 'BARS', 'RETURN', 'EXIT REASON'].forEach(x => th.append(el('th', '', x))); tbl.append(th);
    r.res.trades.slice(-40).reverse().forEach((t, k) => { const tr = el('tr'), rc2 = el('td', '', spct(t.ret, 2)); rc2.style.color = t.ret >= 0 ? '#3ecf8e' : '#ff5a4f'; tr.append(el('td', '', String(r.res.trades.length - k)), el('td', '', t.side > 0 ? 'LONG' : 'SHORT'), el('td', '', `${r.B.day[t.entryI]} @ ${num(t.entry, t.entry < 10 ? 4 : 2)}`), el('td', '', t.open ? 'open' : `${r.B.day[t.exitI]} @ ${num(t.exit, t.exit < 10 ? 4 : 2)}`), el('td', '', String(t.bars)), rc2, el('td', '', t.why)); tbl.append(tr); });
    const tc = card(`TRADES (LAST ${Math.min(40, r.res.trades.length)} OF ${r.res.trades.length})`, tbl); tc.style.overflowX = 'auto'; out.append(tc);
    out.append(card('HOW THE ENGINE WORKS', ...['Event-driven and bar by bar: rules are checked at each bar’s close, market orders fill at the next bar’s open, so there is no look-ahead. Stops and targets trigger inside the bar; a gap through the level fills at the open; if both are touched in one bar the stop is assumed (conservative).', 'Prices are Yahoo Finance bars (daily bars adjusted for splits and dividends). Each fill pays the selected fee and slippage. Volatility sizing scales exposure to a 15% annual target (max 1.5×) using the last 20 bars.', 'Out-of-sample = the last part of history, shown separately because rules tuned on the full history usually look better than they will be. The probabilistic Sharpe ratio (Bailey & López de Prado) estimates the chance the true Sharpe is above zero.', 'Research only: FYNX does not send orders. For FX lots, prop-firm rules and MT5/cTrader code, use the full Quant Analyst.'].map(note)));
    const ql = el('a', 'fx-ql-btn', 'Open Quant Analyst ↗'); ql.href = `/quant-analyst.html?symbol=${encodeURIComponent(BV.sym)}`; ql.target = '_blank'; ql.rel = 'noopener'; ql.style.cssText = 'align-self:flex-start;display:inline-flex;align-items:center;text-decoration:none'; out.append(ql);
    requestAnimationFrame(() => {
      lineChart(eqc, {series: [{v: Array.from(r.bh), color: '#5b8def', width: 1.2, name: 'Buy & hold'}, {v: Array.from(r.res.eq), color: '#ffb000', width: 2, name: 'Strategy'}], xs: r.B.day, log: true, yfmt: v => v.toFixed(2) + '×', shade: [{from: r.cut, to: r.N - 1, color: 'rgba(91,141,239,.08)'}], aria: 'Strategy equity vs buy and hold'});
      const from = Math.max(r.s0, r.N - 160), marks = [];
      r.res.trades.forEach(t => { marks.push({i: t.entryI, up: t.side > 0, color: t.side > 0 ? '#3ecf8e' : '#ff5a4f'}); if (!t.open) marks.push({i: t.exitI, up: t.side < 0, color: '#ffb000'}); });
      candleChart(pc, r.B, from, r.N - 1, {marks, aria: 'Recent bars with trade markers'});
      monthlyHeat(mc, r.B, r.res.eq, r.s0);
    });
  }

  /* ========================================== OPTIM: portfolio ========================================== */
  const OPRESETS = [
    ['multi', 'Global multi-asset', ['SPY', 'EFA', 'EEM', 'TLT', 'IEF', 'LQD', 'GLD', 'DBC', 'VNQ']],
    ['sectors', 'US sectors', ['XLK', 'XLF', 'XLE', 'XLV', 'XLY', 'XLP', 'XLI', 'XLB', 'XLU', 'XLRE', 'XLC']],
    ['mega', 'Mega-cap tech', ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'AVGO', 'TSLA']],
    ['crypto', 'Crypto + macro', ['BTC-USD', 'ETH-USD', 'SPY', 'TLT', 'GLD']],
    ['mine', 'My portfolio', null]
  ];
  const METHODS = [['ew', 'Equal weight', '#9aa7a0'], ['ivol', 'Inverse volatility', '#4dd0e1'], ['minvar', 'Minimum variance', '#5b8def'], ['maxsharpe', 'Maximum Sharpe', '#ff8a65'], ['maxdiv', 'Max diversification', '#c77dff'], ['erc', 'Risk parity (ERC)', '#3ecf8e'], ['hrp', 'Hierarchical risk parity', '#ffb000']];
  const OV = (() => { let s = {}; try { s = JSON.parse(store.get('optim') || '{}') || {}; } catch (_) {} return {preset: s.preset || 'multi', syms: Array.isArray(s.syms) && s.syms.every(x => SYM_RE.test(x)) ? s.syms.slice(0, 30) : null, cov: s.cov === 'sample' ? 'sample' : 'lw', cap: finite(s.cap) ? s.cap : 0.35, look: [126, 252, 504].includes(s.look) ? s.look : 252, sel: METHODS.some(m => m[0] === s.sel) ? s.sel : 'hrp', costBps: finite(s.costBps) ? s.costBps : 5}; })();
  const saveO = () => store.set('optim', JSON.stringify(OV));
  function oSyms() { if (OV.syms?.length) return OV.syms; if (OV.preset === 'mine') { const h = (T.portfolioHoldings?.() || []).map(x => String(x.symbol).toUpperCase()).filter(x => SYM_RE.test(x)); if (h.length >= 2) return [...new Set(h)].slice(0, 30); } return (OPRESETS.find(p => p[0] === OV.preset && p[2]) || OPRESETS[0])[2]; }
  // Ledoit–Wolf (2004) shrinkage of the sample covariance toward a scaled identity.
  function covEstimate(X, kind) {
    const n = X.length, T_ = X[0].length, mu = X.map(mean), Z = X.map((r, i) => r.map(v => v - mu[i]));
    const S = Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => { let s = 0; for (let t = 0; t < T_; t++) s += Z[i][t] * Z[j][t]; return s / T_; }));
    if (kind !== 'lw') return {S, mu, delta: 0};
    let m = 0; for (let i = 0; i < n; i++) m += S[i][i]; m /= n;
    let d2 = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) d2 += (S[i][j] - (i === j ? m : 0)) ** 2; d2 /= n;
    let b2 = 0; for (let t = 0; t < T_; t++) { let s = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = Z[i][t] * Z[j][t] - S[i][j]; s += v * v; } b2 += s / n; } b2 /= T_ * T_; b2 = Math.min(b2, d2);
    const delta = d2 > 0 ? b2 / d2 : 0;
    return {S: S.map((row, i) => row.map((v, j) => (1 - delta) * v + (i === j ? delta * m : 0))), mu, delta};
  }
  const mv = (S, w) => S.map(row => row.reduce((a, v, j) => a + v * w[j], 0));
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  // Euclidean projection onto {w ≥ 0, Σw = 1, w ≤ cap}.
  function projCapped(y, cap) { const n = y.length; cap = Math.max(cap, 1 / n + 1e-9); let lo = Math.min(...y) - cap, hi = Math.max(...y); for (let it = 0; it < 50; it++) { const t = (lo + hi) / 2, s = y.reduce((a, v) => a + Math.min(cap, Math.max(0, v - t)), 0); if (s > 1) lo = t; else hi = t; } const t = (lo + hi) / 2; return y.map(v => Math.min(cap, Math.max(0, v - t))); }
  function minVarLambda(S, mu, cap, lambda, w0) { const n = S.length; let w = w0 ? w0.slice() : Array(n).fill(1 / n); let L = 0; for (let i = 0; i < n; i++) L = Math.max(L, S[i].reduce((a, v) => a + Math.abs(v), 0)); const step = 0.5 / (L || 1); for (let it = 0; it < 300; it++) { const g = mv(S, w).map((v, i) => 2 * v - lambda * mu[i]); const nw = projCapped(w.map((v, i) => v - step * g[i]), cap); let d = 0; for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(nw[i] - w[i])); w = nw; if (d < 1e-7) break; } return w; }
  function frontier(S, mu, cap) { const pts = []; let w = null; const scale = Math.max(1e-12, ...S.map((r, i) => r[i])) / Math.max(1e-12, ...mu.map(Math.abs)); for (const k of [0, 0.03, 0.08, 0.15, 0.3, 0.5, 0.8, 1.2, 2, 3.5, 6, 12, 30, 100]) { w = minVarLambda(S, mu, cap, k * scale, w); const v = dot(w, mv(S, w)), r = dot(w, mu); pts.push({w: w.slice(), vol: Math.sqrt(v), ret: r}); } return pts; }
  function erc(S) { const n = S.length; let w = S.map((r, i) => 1 / Math.sqrt(Math.max(r[i], 1e-12))); let s = w.reduce((a, b) => a + b, 0); w = w.map(v => v / s); for (let it = 0; it < 500; it++) { let ch = 0; for (let i = 0; i < n; i++) { const off = S[i].reduce((a, v, j) => j === i ? a : a + v * w[j], 0), a2 = S[i][i]; const nx = (-off + Math.sqrt(off * off + 4 * a2 / n)) / (2 * a2); ch = Math.max(ch, Math.abs(nx - w[i])); w[i] = nx; } if (ch < 1e-11) break; } s = w.reduce((a, b) => a + b, 0); return w.map(v => v / s); }
  function hrp(S) {
    const n = S.length, sdv = S.map((r, i) => Math.sqrt(Math.max(r[i], 1e-16))), C = S.map((r, i) => r.map((v, j) => v / (sdv[i] * sdv[j])));
    const D = C.map(r => r.map(v => Math.sqrt(Math.max(0, (1 - v) / 2))));
    // Single-linkage clustering; the merge tree gives the quasi-diagonal order and the splits for bisection.
    let clusters = Array.from({length: n}, (_, i) => ({items: [i]}));
    while (clusters.length > 1) { let best = [0, 1], bd = Infinity; for (let a = 0; a < clusters.length; a++) for (let b = a + 1; b < clusters.length; b++) { let d = Infinity; for (const i of clusters[a].items) for (const j of clusters[b].items) d = Math.min(d, D[i][j]); if (d < bd) { bd = d; best = [a, b]; } } const [a, b] = best, m = {items: [...clusters[a].items, ...clusters[b].items], left: clusters[a], right: clusters[b]}; clusters = clusters.filter((_, k) => k !== a && k !== b); clusters.push(m); }
    const root = clusters[0], order = root.items, w = Array(n).fill(1);
    const cvar = idx => { const iv = idx.map(i => 1 / S[i][i]), s = iv.reduce((a, b) => a + b, 0), ww = iv.map(v => v / s); let v = 0; idx.forEach((i, a) => idx.forEach((j, b) => { v += ww[a] * ww[b] * S[i][j]; })); return v; };
    // Recursive bisection along the tree: each node splits weight between its two child clusters by inverse cluster variance.
    const split = node => { if (!node.left) return; const L = node.left.items, R = node.right.items, vl = cvar(L), vr = cvar(R), a = 1 - vl / (vl + vr); L.forEach(i => w[i] *= a); R.forEach(i => w[i] *= 1 - a); split(node.left); split(node.right); };
    split(root); return {w, order};
  }
  function weightsFor(method, S, mu, cap, fr) {
    const n = S.length;
    if (method === 'ew') return Array(n).fill(1 / n);
    if (method === 'ivol') { const iv = S.map((r, i) => 1 / Math.sqrt(Math.max(r[i], 1e-16))), s = iv.reduce((a, b) => a + b, 0); return iv.map(v => v / s); }
    if (method === 'minvar') return minVarLambda(S, mu, cap, 0);
    if (method === 'maxsharpe') { const f = fr || frontier(S, mu, cap); return f.reduce((b, p) => (p.ret / p.vol > b.ret / b.vol ? p : b)).w; }
    if (method === 'maxdiv') { const sv = S.map((r, i) => Math.sqrt(Math.max(r[i], 1e-16))); const f = frontier(S, sv, cap); return f.reduce((b, p) => (p.ret / p.vol > b.ret / b.vol ? p : b)).w; }
    if (method === 'erc') return erc(S);
    if (method === 'hrp') return hrp(S).w;
    return Array(n).fill(1 / n);
  }
  async function oCompute() {
    const syms = oSyms(); if (syms.length < 2) throw new Error('Choose at least two assets.');
    const d = await loadCloses([...new Set(syms)], '10y'), A = QL.alignedReturns(d.series, syms, true);
    if (!A || A.symbols.length < 2) throw new Error('Not enough overlapping price history for these assets.');
    const n = A.symbols.length, T_ = A.dates.length, LOOK = OV.look;
    if (T_ < LOOK + 63) throw new Error(`Need at least ${LOOK + 63} common trading days; these assets share ${T_}.`);
    const R = A.rets.map(r => Array.from(r, x => Math.exp(x) - 1)), ann = syms.every(isCrypto) ? 365 : 252;
    const win = t => R.map(r => r.slice(t - LOOK, t));
    // current optimisation on the latest window
    const {S, mu, delta} = covEstimate(win(T_), OV.cov);
    const fr = frontier(S, mu, OV.cap);
    const now = Object.fromEntries(METHODS.map(([k]) => [k, weightsFor(k, S, mu, OV.cap, fr)]));
    const hr = hrp(S);
    // walk-forward: re-optimise every 21 days on the trailing window, pay costs on turnover, measure what happened next
    const curves = Object.fromEntries(METHODS.map(([k]) => [k, []])), turn = Object.fromEntries(METHODS.map(([k]) => [k, []])), w0 = Object.fromEntries(METHODS.map(([k]) => [k, null]));
    const eqv = Object.fromEntries(METHODS.map(([k]) => [k, 1]));
    for (let t = LOOK; t < T_; t++) {
      if ((t - LOOK) % 105 === 0) await new Promise(res => setTimeout(res, 0));
      if ((t - LOOK) % 21 === 0) { const e = covEstimate(win(t), OV.cov), f = frontier(e.S, e.mu, OV.cap); for (const [k] of METHODS) { const w = weightsFor(k, e.S, e.mu, OV.cap, f), prev = w0[k]; const to = prev ? w.reduce((a, v, i) => a + Math.abs(v - prev[i]), 0) : 1; turn[k].push(to); eqv[k] *= 1 - to * OV.costBps / 1e4; w0[k] = w; } }
      for (const [k] of METHODS) { const w = w0[k]; let r = 0; for (let i = 0; i < n; i++) r += w[i] * R[i][t]; eqv[k] *= 1 + r; curves[k].push(eqv[k]); const g = w.map((v, i) => v * (1 + R[i][t])), s = g.reduce((a, b) => a + b, 0); w0[k] = g.map(v => v / s); }
    }
    const stats = Object.fromEntries(METHODS.map(([k]) => { const c = [1, ...curves[k]]; const p = perf(Float64Array.from(c), 0, c.length - 1, ann); return [k, {...p, turnover: mean(turn[k]) * 12}]; }));
    const rc = w => { const m = mv(S, w), v = dot(w, m); return w.map((x, i) => v > 0 ? x * m[i] / v : 0); };
    const C = S.map((r, i) => r.map((v, j) => v / Math.sqrt(S[i][i] * S[j][j])));
    return {A, syms: A.symbols, n, S, mu, delta, fr, now, hr, curves, stats, rc, C, ann, oosDates: A.dates.slice(LOOK), missing: syms.filter(s => !A.symbols.includes(s)), names: d.names};
  }
  let OR = null, oKey = '', oP = null;
  async function oGet() { const k = JSON.stringify([oSyms(), OV.cov, OV.cap, OV.look, OV.costBps]); if (OR && oKey === k) return OR; if (oP && oKey === k) return oP; oKey = k; oP = oCompute(); try { OR = await oP; return OR; } catch (e) { oKey = ''; throw e; } finally { oP = null; } }
  function weightBars(box, syms, w, colors) {
    const t = el('table', 'fx-qr-mini fx-sl-wt'); syms.forEach((s, i) => { const tr = el('tr'), bar = el('td'), b = el('span', 'fx-qr-bar'), f = el('i'); b.style.width = '120px'; f.style.left = '0'; f.style.width = Math.min(100, w[i] * 100 / Math.max(...w, 0.0001)) + '%'; f.style.background = colors || '#ffb000'; b.append(f); bar.append(b); tr.append(el('td', '', s), bar, el('td', '', pct(w[i], 1))); t.append(tr); }); box.replaceChildren(t);
  }
  async function renderOptim() {
    const host = panel('optim'); empty(host, 'Optimising portfolios…');
    let r; try { r = await oGet(); } catch (e) { report('optim', e); return empty(host, e.message || 'Price history unavailable right now.'); }
    if (!$('tp-optim')) return; host.replaceChildren(); setText('n-optim', (OPRESETS.find(p => p[0] === OV.preset)?.[1] || 'Custom') + ' · walk-forward');
    const w = el('div', 'fx-ql'); host.append(w);
    const best = METHODS.map(m => [m, r.stats[m[0]]]).filter(x => x[1]).sort((a, b) => b[1].sharpe - a[1].sharpe)[0];
    const hd = el('div', 'fx-ql-head'); const s0 = el('span', 'fx-ql-state', 'BEST OUT OF SAMPLE: ' + best[0][1].toUpperCase()); s0.style.fontSize = '13px'; s0.style.color = best[0][2]; hd.append(s0); w.append(hd);
    const t = el('table', 'fx-qr-mini'), h = el('tr'); ['METHOD', 'SHARPE', 'CAGR', 'MAX DD'].forEach(x => h.append(el('th', '', x))); t.append(h);
    for (const [k, nm, col] of METHODS) { const s = r.stats[k]; if (!s) continue; const tr = el('tr'), c = el('td', '', nm); c.style.color = col; tr.append(c, el('td', '', num(s.sharpe)), el('td', '', spct(s.cagr)), el('td', '', pct(s.mdd, 0))); t.append(tr); }
    w.append(t, note(`${r.n} assets · ${OV.cov === 'lw' ? 'Ledoit–Wolf' : 'sample'} covariance · monthly rebalance · ${OV.costBps} bp costs`));
  }
  async function renderOptimPage(host) {
    PG.setHead('OPTIM', 'Portfolio optimizer', 'Seven ways to build a portfolio, tested walk-forward on real prices: what would each have done out of sample?');
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap);
    const rerun = () => { if (wrap.isConnected) PG.rerender(); };
    const ic = el('div', 'fx-ql-card'); ic.append(el('h3', '', 'UNIVERSE'));
    const pr = el('div', 'fx-ql-row'); for (const [k, l] of OPRESETS) { const b = btn(l, 'fx-ql-btn' + (!OV.syms && OV.preset === k ? ' on' : ''), () => { OV.preset = k; OV.syms = null; saveO(); rerun(); }); if (k === 'mine' && (T.portfolioHoldings?.() || []).length < 2) { b.disabled = true; b.title = 'Add at least two holdings in the Portfolio page'; } pr.append(b); }
    ic.append(pr);
    const f = el('form', 'fx-ql-row'), inp = el('input'); inp.value = oSyms().join(', '); inp.setAttribute('aria-label', 'Symbols, comma separated'); inp.style.cssText = 'flex:1;min-width:240px;text-transform:uppercase'; f.style.marginTop = '8px';
    f.append(inp, btn('Optimize', 'fx-ql-btn pri')); f.addEventListener('submit', e => { e.preventDefault(); const l = [...new Set(inp.value.toUpperCase().split(/[\s,;]+/).filter(Boolean))]; if (l.length < 2 || l.length > 30 || !l.every(x => SYM_RE.test(x))) return T.say('Enter 2 to 30 valid symbols.'); OV.syms = l; saveO(); rerun(); });
    ic.append(f);
    const opts = el('div', 'fx-ql-row'); opts.style.marginTop = '8px';
    const sel = (lab, val, list, on) => { const l = el('label', '', lab), s = el('select'); for (const [v, t] of list) { const o = el('option', '', t); o.value = v; if (String(v) === String(val)) o.selected = true; s.append(o); } s.addEventListener('change', () => on(s.value)); l.append(s); return l; };
    opts.append(sel('Covariance', OV.cov, [['lw', 'Ledoit–Wolf shrinkage'], ['sample', 'Sample']], v => { OV.cov = v; saveO(); rerun(); }), sel('Max weight', OV.cap, [[0.2, '20%'], [0.35, '35%'], [0.5, '50%'], [1, 'No cap']], v => { OV.cap = +v; saveO(); rerun(); }), sel('Window', OV.look, [[126, '6 months'], [252, '1 year'], [504, '2 years']], v => { OV.look = +v; saveO(); rerun(); }), sel('Costs', OV.costBps, [[0, 'None'], [5, '5 bp per trade'], [20, '20 bp']], v => { OV.costBps = +v; saveO(); rerun(); }));
    ic.append(opts); wrap.append(ic);
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(out); out.append(note('Downloading up to 10 years of prices and running the walk-forward test…'));
    let r; try { r = await oGet(); } catch (e) { out.replaceChildren(el('div', 'fx-sl-err', e.message || 'Price history unavailable right now.')); return; }
    if (!out.isConnected) return; out.replaceChildren();
    if (r.missing.length) out.append(note(`No usable history for ${r.missing.join(', ')}; left out.`));
    const ranked = METHODS.map(m => [m, r.stats[m[0]]]).filter(x => x[1]).sort((a, b) => b[1].sharpe - a[1].sharpe), best = ranked[0], ew = r.stats.ew;
    const hd = el('div', 'fx-ql-head'), s0 = el('span', 'fx-ql-state', 'BEST OUT OF SAMPLE: ' + best[0][1].toUpperCase()); s0.style.color = best[0][2]; s0.style.fontSize = '15px';
    hd.append(s0, el('span', 'fx-ql-sub', `${r.n} assets · out-of-sample ${r.oosDates[0]} → ${r.oosDates.at(-1)} · re-optimised every 21 trading days on the previous ${OV.look} days`)); out.append(hd);
    const v = el('div', 'fx-ql-verdict'); v.style.borderColor = best[0][2];
    v.textContent = `${best[0][1]} had the best out-of-sample Sharpe (${num(best[1].sharpe)}), against ${num(ew.sharpe)} for simple equal weighting. ${best[1].sharpe - ew.sharpe < 0.15 ? 'The edge over equal weight is small: estimation error eats most of the benefit of optimisation, a well-known result.' : 'The edge over equal weight is meaningful in this sample, but it can shrink in other periods.'} Every portfolio was built using only data available at the time and paid ${OV.costBps} bp on turnover.${OV.cov === 'lw' ? ` Ledoit–Wolf shrank the covariance ${pct(r.delta, 0)} toward a diagonal target.` : ''}`;
    out.append(v);
    const tbl = el('table', 'fx-ql-tbl'), th = el('tr'); ['METHOD', 'CAGR', 'VOLATILITY', 'SHARPE', 'MAX DRAWDOWN', 'TURNOVER / YR', ''].forEach(x => th.append(el('th', '', x))); tbl.append(th);
    for (const [[k, nm, col], s] of ranked) { const tr = el('tr'), c = el('td', '', nm); c.style.color = col; const b = btn(OV.sel === k ? 'Showing' : 'Show', 'fx-ql-btn' + (OV.sel === k ? ' on' : ''), () => { OV.sel = k; saveO(); rerun(); }); b.style.minHeight = '24px'; const bc = el('td'); bc.append(b); tr.append(c, el('td', '', spct(s.cagr)), el('td', '', pct(s.vol)), el('td', '', num(s.sharpe)), el('td', '', pct(s.mdd)), el('td', '', pct(s.turnover, 0)), bc); tbl.append(tr); }
    const tc = card('WALK-FORWARD RESULTS (OUT OF SAMPLE, AFTER COSTS)', tbl); tc.style.overflowX = 'auto'; out.append(tc);
    const ec = chartBox(300); out.append(card('GROWTH OF $1 · EACH METHOD OUT OF SAMPLE', ec));
    const grid = el('div', 'fx-sl-grid'), frc = chartBox(300), wc = el('div');
    const selM = METHODS.find(m => m[0] === OV.sel);
    grid.append(card('EFFICIENT FRONTIER (LATEST WINDOW, ANNUALISED)', frc, note('Grey dots are single assets; the line is the long-only frontier under the weight cap; coloured dots are each method today.')), card(`TODAY’S WEIGHTS · ${selM[1].toUpperCase()}`, wc));
    out.append(grid);
    const grid2 = el('div', 'fx-sl-grid'), hc = chartBox(Math.max(220, 26 * r.n + 30)), rcBox = el('div');
    grid2.append(card('CORRELATION, CLUSTERED (HRP ORDER)', hc, note('Assets are reordered by the hierarchical clustering used in HRP, so related assets sit together.')), card(`RISK CONTRIBUTION · ${selM[1].toUpperCase()}`, rcBox, note('Share of portfolio variance coming from each asset. Risk parity equalises these; equal weight usually does not.')));
    out.append(grid2);
    const wt = el('table', 'fx-ql-tbl'), wh = el('tr'); wh.append(el('th', '', 'ASSET')); METHODS.forEach(m => wh.append(el('th', '', m[0].toUpperCase()))); wt.append(wh);
    r.syms.forEach((s, i) => { const tr = el('tr'); tr.append(el('td', '', s)); METHODS.forEach(([k]) => { const v2 = r.now[k][i], c = el('td'), sp = el('span', 'fx-sl-cell', pct(v2, 0)); sp.style.background = `rgba(255,176,0,${Math.min(0.75, v2 * 1.6)})`; sp.style.color = v2 > 0.3 ? '#000' : 'var(--tx)'; c.append(sp); tr.append(c); }); wt.append(tr); });
    const wtc = card('ALL METHODS · TODAY’S WEIGHTS', wt); wtc.style.overflowX = 'auto'; out.append(wtc);
    out.append(card('METHODS', ...['Equal weight and inverse volatility need no optimiser. Minimum variance and maximum Sharpe solve the long-only mean–variance problem with a weight cap (projected gradient). Maximum diversification maximises weighted volatility over portfolio volatility. Risk parity (ERC) gives each asset the same risk contribution. HRP (López de Prado, 2016) clusters assets by correlation and splits weight top-down along the cluster tree by cluster variance, which avoids inverting the covariance matrix.', 'Ledoit–Wolf (2004) shrinks the sample covariance toward a scaled identity by the amount that minimises expected estimation error. Expected returns are the trailing sample means, which are noisy; this is why maximum Sharpe often disappoints out of sample.', 'Daily adjusted closes from Yahoo Finance. Walk-forward: every 21 trading days each method is re-optimised on the previous window only, weights drift with prices between rebalances, and turnover pays the cost you selected. Inspired by the open-source skfolio library.'].map(note)));
    requestAnimationFrame(() => {
      lineChart(ec, {series: METHODS.map(([k, nm, col]) => ({v: [1, ...r.curves[k]], color: col, width: k === OV.sel ? 2.4 : 1.2, name: nm})), xs: [r.oosDates[0], ...r.oosDates], log: true, yfmt: v => v.toFixed(2) + '×', aria: 'Out-of-sample growth of each method'});
      { const {w, h, s} = frame(frc, 'Efficient frontier'), padL = 50, padR = 10, padT = 10, padB = 22, iw = w - padL - padR, ih = h - padT - padB, A = r.ann;
        const assets = r.syms.map((sy, i) => ({sy, vol: Math.sqrt(r.S[i][i] * A), ret: r.mu[i] * A})), fp = r.fr.map(p => ({vol: p.vol * Math.sqrt(A), ret: p.ret * A})), mp = METHODS.map(([k, nm, col]) => { const ww = r.now[k], v2 = dot(ww, mv(r.S, ww)); return {k, nm, col, vol: Math.sqrt(v2 * A), ret: dot(ww, r.mu) * A}; });
        const all = [...assets, ...fp, ...mp], xl = 0, xh = Math.max(...all.map(p => p.vol)) * 1.08, yl = Math.min(0, ...all.map(p => p.ret)) * 1.1, yh = Math.max(...all.map(p => p.ret)) * 1.1 || 0.1, X = v => padL + (v - xl) / (xh - xl) * iw, Y = v => padT + (yh - v) / (yh - yl || 1) * ih;
        for (const v of [yl, 0, yh]) { s.append(svg('line', {x1: padL, x2: w - padR, y1: Y(v), y2: Y(v), stroke: '#1b2421'})); label(s, padL - 4, Y(v) + 3, (v * 100).toFixed(0) + '%', {'text-anchor': 'end'}); }
        [[xh / 2, 'middle'], [xh, 'end']].forEach(([v, a]) => label(s, X(v), h - 6, (v * 100).toFixed(0) + '% vol', {'text-anchor': a}));
        let d = ''; fp.forEach((p, i) => d += (i ? 'L' : 'M') + X(p.vol).toFixed(1) + ' ' + Y(p.ret).toFixed(1)); s.append(svg('path', {d, fill: 'none', stroke: '#d7dfda', 'stroke-width': 1.5}));
        assets.forEach(a => { s.append(svg('circle', {cx: X(a.vol), cy: Y(a.ret), r: 3, fill: '#7d8a83'})); label(s, X(a.vol) + 5, Y(a.ret) + 3, a.sy, {fill: '#aeb9b3', 'font-size': 9}); });
        mp.forEach(m => { const c = svg('circle', {cx: X(m.vol), cy: Y(m.ret), r: m.k === OV.sel ? 6 : 4.5, fill: m.col, stroke: '#05080a', 'stroke-width': 1.5}); const tt = svg('title'); tt.textContent = `${m.nm}: return ${pct(m.ret)}, vol ${pct(m.vol)}`; c.append(tt); s.append(c); });
        frc.replaceChildren(s); }
      weightBars(wc, r.syms, r.now[OV.sel], selM[2]);
      weightBars(rcBox, r.syms, r.rc(r.now[OV.sel]), '#ff8a65');
      const ord = r.hr.order, corr = ord.map(i => ord.map(j => r.C[i][j]));
      heatmap(hc, {rows: ord.map(i => r.syms[i]), cols: ord.map(i => r.syms[i].slice(0, 5)), cells: corr, scale: v => { const t = Math.max(-1, Math.min(1, v)); return t >= 0 ? `rgba(255,120,30,${0.08 + 0.8 * t})` : `rgba(91,141,239,${0.08 + 0.8 * -t})`; }, fmt: v => v.toFixed(2), aria: 'Clustered correlation matrix', title: (v, a, b) => `${r.syms[ord[a]]} / ${r.syms[ord[b]]}: ρ ${v.toFixed(2)}`});
    });
  }

  /* ======================================= FCAST: K-line forecaster ======================================= */
  const FV = (() => { let s = {}; try { s = JSON.parse(store.get('fcast') || '{}') || {}; } catch (_) {} return {sym: SYM_RE.test(s.sym || '') ? s.sym : 'SPY', tf: s.tf === '1h' ? '1h' : '1d', W: [10, 20, 40].includes(s.W) ? s.W : 20, H: [5, 10, 20].includes(s.H) ? s.H : 10, K: [15, 30, 60].includes(s.K) ? s.K : 30}; })();
  const saveF = () => store.set('fcast', JSON.stringify(FV));
  // Each candle becomes a small vector (return, range, body, upper wick, lower wick, volume surprise), scaled by the
  // window's own volatility so a quiet market and a wild one can still share a shape.
  function features(B, W) {
    const N = B.c.length, D = 6, r = new Float64Array(N); for (let i = 1; i < N; i++) r[i] = Math.log(B.c[i] / B.c[i - 1]);
    const lv = B.v.map(v => Math.log(1 + (v || 0))), hasVol = B.v.some(v => v > 0);
    const F = new Float32Array(N * W * D).fill(NaN), scale = new Float64Array(N).fill(NaN);
    const wts = Array.from({length: W}, (_, j) => 0.5 + j / (W - 1 || 1));
    for (let e = W; e < N; e++) {
      let s = 0; for (let j = e - W + 1; j <= e; j++) s += r[j] * r[j]; const sc = Math.sqrt(s / W) || 1e-6; scale[e] = sc;
      let mvol = 0; if (hasVol) { for (let j = e - W + 1; j <= e; j++) mvol += lv[j]; mvol /= W; }
      for (let j = 0; j < W; j++) { const i = e - W + 1 + j, c = B.c[i], pc = B.c[i - 1], base = (e * W + j) * D, k = wts[j];
        F[base] = k * r[i] / sc; F[base + 1] = k * Math.log(B.h[i] / B.l[i]) / sc * 0.5; F[base + 2] = k * Math.log(c / B.o[i]) / sc * 0.7;
        F[base + 3] = k * Math.log(B.h[i] / Math.max(B.o[i], c)) / sc * 0.5; F[base + 4] = k * Math.log(Math.min(B.o[i], c) / B.l[i]) / sc * 0.5; F[base + 5] = hasVol ? k * (lv[i] - mvol) * 0.6 : 0; void pc; }
    }
    return {F, scale, r, D};
  }
  function forecastAt(B, FE, t, W, H, K) {
    const {F, scale, r, D} = FE, L = W * D, q = t * L, cand = [];
    for (let e = W; e <= t - H; e++) { let d = 0; const b = e * L; for (let k = 0; k < L; k++) { const x = F[q + k] - F[b + k]; d += x * x; if (d > (cand.length >= K ? cand[cand.length - 1][0] : Infinity)) break; } if (cand.length < K || d < cand[cand.length - 1][0]) { cand.push([d, e]); cand.sort((a, b2) => a[0] - b2[0]); if (cand.length > K) cand.pop(); } }
    if (cand.length < Math.min(10, K)) return null;
    const paths = cand.map(([, e]) => { const k = scale[t] / scale[e]; let c = 0; return Array.from({length: H}, (_, j) => (c += r[e + 1 + j] * k)); });
    const qs = p => Array.from({length: H}, (_, j) => quantile(paths.map(x => x[j]).sort((a, b) => a - b), p));
    return {paths, analogs: cand.map(x => x[1]), q10: qs(0.1), q25: qs(0.25), q50: qs(0.5), q75: qs(0.75), q90: qs(0.9), pUp: paths.filter(x => x[H - 1] > 0).length / paths.length};
  }
  async function fCompute() {
    const B = await loadBars(FV.sym, FV.tf); if (!B?.o || B.c.length < 300) throw new Error(`Not enough ${FV.tf === '1h' ? 'hourly' : 'daily'} candles for ${FV.sym}.`);
    const W = FV.W, H = FV.H, K = FV.K, N = B.c.length, FE = features(B, W), now = forecastAt(B, FE, N - 1, W, H, K); if (!now) throw new Error('Not enough history to find similar patterns.');
    // Out-of-sample scoring: at each test point use only windows whose futures were already known, step H (no overlap).
    const tests = []; const firstT = Math.max(W + 250, N - 1 - H - Math.min(600, Math.floor(N * 0.4)));
    for (let t = firstT; t <= N - 1 - H; t += H) { const f = forecastAt(B, FE, t, W, H, K); if (!f) continue; const actual = Math.log(B.c[t + H] / B.c[t]); tests.push({t, pUp: f.pUp, med: f.q50[H - 1], lo: f.q10[H - 1], hi: f.q90[H - 1], actual}); }
    const n = tests.length, ups = tests.filter(x => x.actual > 0).length, base = n ? ups / n : NaN;
    const hits = tests.filter(x => (x.med > 0) === (x.actual > 0)).length, hit = n ? hits / n : NaN;
    const brier = n ? mean(tests.map(x => (x.pUp - (x.actual > 0 ? 1 : 0)) ** 2)) : NaN, brierBase = n ? mean(tests.map(x => (base - (x.actual > 0 ? 1 : 0)) ** 2)) : NaN;
    const cover = n ? tests.filter(x => x.actual >= x.lo && x.actual <= x.hi).length / n : NaN;
    const ic = n > 3 ? (() => { const a = tests.map(x => x.med), b = tests.map(x => x.actual), ma = mean(a), mb = mean(b); let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; } return va && vb ? c / Math.sqrt(va * vb) : 0; })() : NaN;
    const best = Math.max(base, 1 - base), z = n ? (hit - best) / Math.sqrt(best * (1 - best) / n) : NaN, p = finite(z) ? 1 - ncdf(z) : NaN;
    const c0 = B.c[N - 1], toPx = arr => arr.map(v => c0 * Math.exp(v));
    const g = now.analogs[0], gk = c0 / B.c[g];
    const ghost = Array.from({length: H}, (_, j) => { const i = g + 1 + j; return {o: B.o[i] * gk, h: B.h[i] * gk, l: B.l[i] * gk, c: B.c[i] * gk}; });
    return {B, N, W, H, K, now, fan: {q10: toPx(now.q10), q25: toPx(now.q25), q50: toPx(now.q50), q75: toPx(now.q75), q90: toPx(now.q90)}, ghost, tests, ev: {n, base, hit, brier, brierBase, cover, ic, p, best}, nearest: now.analogs.slice(0, 5).map(e => B.day[e])};
  }
  const fCache = new Map();
  async function fGet() { const k = [FV.sym, FV.tf, FV.W, FV.H, FV.K].join('|'); if (!fCache.has(k)) fCache.set(k, fCompute().catch(e => { fCache.delete(k); throw e; })); return fCache.get(k); }
  async function renderFcast() {
    const host = panel('fcast'); empty(host, `Matching ${FV.sym} candle patterns…`);
    let r; try { r = await fGet(); } catch (e) { report('fcast', e); return empty(host, e.message || 'Candles unavailable right now.'); }
    if (!$('tp-fcast')) return; host.replaceChildren(); setText('n-fcast', `${FV.sym} · next ${r.H} ${FV.tf === '1h' ? 'hours' : 'days'}`);
    const w = el('div', 'fx-ql'); host.append(w);
    const edge = r.ev.p < 0.05;
    kpis(w, [['P(UP IN ' + r.H + ')', pct(r.now.pUp, 0), `${r.K} closest patterns`, r.now.pUp >= 0.6 ? '#3ecf8e' : r.now.pUp <= 0.4 ? '#ff5a4f' : '#ffb000'], ['MEDIAN PATH', spct(Math.exp(r.now.q50[r.H - 1]) - 1), `80% range ${spct(Math.exp(r.now.q10[r.H - 1]) - 1, 0)} to ${spct(Math.exp(r.now.q90[r.H - 1]) - 1, 0)}`], ['PAST ACCURACY', pct(r.ev.hit, 0), edge ? 'beat the base rate' : `no edge vs ${pct(r.ev.best, 0)} base`, edge ? '#3ecf8e' : '#7d8a83']]);
    const cb = el('div', 'fx-ql-chart'); w.append(cb);
    requestAnimationFrame(() => candleChart(cb, r.B, r.N - 60, r.N - 1, {fan: r.fan, aria: 'Recent candles with pattern forecast'}));
  }
  async function renderFcastPage(host, arg) {
    if (arg && SYM_RE.test(String(arg).toUpperCase())) { FV.sym = String(arg).toUpperCase(); saveF(); }
    PG.setHead('FCAST', 'K-line pattern forecaster', 'Find the past candle patterns most like today, see what happened next, and check honestly whether that has ever worked');
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap);
    const rerun = () => { if (wrap.isConnected) PG.rerender(); };
    const ic = el('div', 'fx-ql-card'); ic.append(el('h3', '', 'MARKET'));
    ic.append(symbolBox(FV.sym, s => { FV.sym = s; saveF(); rerun(); }, 'Any symbol: SPY, NVDA, BTC-USD, EURUSD=X, GC=F'));
    ic.append(chips([['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['NVDA', 'Nvidia'], ['BTC-USD', 'Bitcoin'], ['ETH-USD', 'Ether'], ['EURUSD=X', 'EUR/USD'], ['GC=F', 'Gold'], ['CL=F', 'Crude']], FV.sym, s => { FV.sym = s; saveF(); rerun(); }));
    const opts = el('div', 'fx-ql-row'); opts.style.marginTop = '8px';
    const sel = (lab, val, list, on) => { const l = el('label', '', lab), s = el('select'); for (const [v, t] of list) { const o = el('option', '', t); o.value = v; if (String(v) === String(val)) o.selected = true; s.append(o); } s.addEventListener('change', () => on(s.value)); l.append(s); return l; };
    opts.append(sel('Candles', FV.tf, [['1d', 'Daily · 10 years'], ['1h', 'Hourly · 2 years']], v => { FV.tf = v; saveF(); rerun(); }), sel('Pattern length', FV.W, [[10, '10 candles'], [20, '20 candles'], [40, '40 candles']], v => { FV.W = +v; saveF(); rerun(); }), sel('Forecast', FV.H, [[5, '5 candles'], [10, '10 candles'], [20, '20 candles']], v => { FV.H = +v; saveF(); rerun(); }), sel('Matches', FV.K, [[15, '15'], [30, '30'], [60, '60']], v => { FV.K = +v; saveF(); rerun(); }));
    ic.append(opts);
    if (T.PANELS.kronos) { const kr = el('div', 'fx-ql-row'); kr.style.marginTop = '8px'; kr.append(btn('Try the Kronos AI model on ' + FV.sym + ' ▸', 'fx-ql-btn', () => T.openPage('kronos', FV.sym))); ic.append(kr); }
    wrap.append(ic);
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(out); out.append(note('Downloading candles, matching patterns and scoring the method out of sample…'));
    let r; try { r = await fGet(); } catch (e) { out.replaceChildren(el('div', 'fx-sl-err', e.message || 'Candles unavailable right now.')); return; }
    if (!out.isConnected) return; out.replaceChildren();
    const unit = FV.tf === '1h' ? 'hours' : 'trading days', edge = r.ev.p < 0.05 && r.ev.brier < r.ev.brierBase;
    const hd = el('div', 'fx-ql-head'), s0 = el('span', 'fx-ql-state', r.now.pUp >= 0.6 ? 'PATTERNS LEAN UP' : r.now.pUp <= 0.4 ? 'PATTERNS LEAN DOWN' : 'NO CLEAR LEAN'); s0.style.color = r.now.pUp >= 0.6 ? '#3ecf8e' : r.now.pUp <= 0.4 ? '#ff5a4f' : '#ffb000';
    hd.append(s0, el('span', 'fx-ql-sub', `${r.B.name || FV.sym}: of the ${r.K} past ${r.W}-candle patterns most similar to the latest one, ${Math.round(r.now.pUp * r.K)} were higher ${r.H} ${unit} later.`)); out.append(hd);
    kpis(out, [['P(HIGHER IN ' + r.H + ')', pct(r.now.pUp, 0), `${r.K} analogs`, s0.style.color], ['MEDIAN', spct(Math.exp(r.now.q50[r.H - 1]) - 1), 'of the analog paths'], ['80% RANGE', `${spct(Math.exp(r.now.q10[r.H - 1]) - 1, 1)} … ${spct(Math.exp(r.now.q90[r.H - 1]) - 1, 1)}`, 'scaled to today’s volatility'],
      ['OUT-OF-SAMPLE HIT RATE', pct(r.ev.hit, 1), `${r.ev.n} tests · base ${pct(r.ev.best, 0)} · p ${num(r.ev.p, 3)}`, edge ? '#3ecf8e' : '#7d8a83'], ['BRIER SCORE', num(r.ev.brier, 3), `base rate ${num(r.ev.brierBase, 3)} (lower is better)`, r.ev.brier < r.ev.brierBase ? '#3ecf8e' : '#ff5a4f'], ['80% BAND COVERAGE', pct(r.ev.cover, 0), 'well calibrated ≈ 80%']]);
    const v = el('div', 'fx-ql-verdict'); v.style.borderColor = edge ? '#3ecf8e' : '#ffb000';
    v.textContent = edge ? `Out of sample this method called the ${r.H}-${unit.replace(/s$/, '')} direction right ${pct(r.ev.hit, 1)} of the time, better than always guessing the more common outcome (${pct(r.ev.best, 0)}), with p = ${num(r.ev.p, 3)}, and its probabilities beat the base rate. Treat it as a weak signal: patterns change.` : `Honest result: out of sample this method was right ${pct(r.ev.hit, 1)} of the time against ${pct(r.ev.best, 0)} for always guessing the more common outcome (p = ${num(r.ev.p, 2)}). That is not a reliable edge, which is normal for price-pattern forecasts. Use the fan as a picture of what similar setups did, not as a prediction.`;
    out.append(v);
    const cb = chartBox(360); out.append(card(`LAST 120 CANDLES + ${r.H}-CANDLE FORECAST FAN (80% AND 50% BANDS) · HOLLOW = CLOSEST PAST MATCH`, cb, note(`Closest past matches: ${r.nearest.join(', ')}. The hollow candles replay what followed the single closest match, rescaled to today’s price.`)));
    const two = el('div', 'fx-sl-grid'), pc = chartBox(260), cc = chartBox(260);
    two.append(card(`OUT-OF-SAMPLE TEST · PREDICTED MEDIAN VS WHAT HAPPENED (${r.ev.n} NON-OVERLAPPING TESTS)`, pc, note(`Each dot is one test made with data available at the time. Dots in the top-right and bottom-left quadrants were right about direction. Correlation (IC) ${num(r.ev.ic, 2)}.`)), card('CALIBRATION · PREDICTED P(UP) VS ACTUAL SHARE UP', cc, note('If the probabilities are honest, the bars sit on the diagonal.')));
    out.append(two);
    out.append(card('HOW IT WORKS (AND HOW IT DIFFERS FROM KRONOS)', ...[`Each of the last ${r.W} candles is described by its return, range, body and wicks (and volume when available), divided by that window’s volatility so shapes are comparable across calm and wild periods; recent candles count more. The ${r.K} most similar past windows are found by distance, and their next ${r.H} candles, rescaled to today’s volatility, form the fan.`, 'Scoring: every ' + r.H + ' candles over the last part of history, the forecast is rebuilt using only windows whose outcomes were already known, then compared with what happened. Hit rate vs the base rate (binomial z-test), Brier score vs always predicting the base rate, and band coverage.', 'Kronos is a Transformer pre-trained on candlestick “tokens” from many markets. FYNX runs the real Kronos model too, on your device: open KRONOS to compare. This analog method is simpler and fully transparent, and its track record is shown rather than assumed.', 'Delayed Yahoo Finance candles. Not advice.'].map(note)));
    requestAnimationFrame(() => {
      candleChart(cb, r.B, r.N - 120, r.N - 1, {fan: r.fan, ghost: r.ghost, aria: 'Candles with forecast fan'});
      { const {w, h, s} = frame(pc, 'Predicted versus actual returns'), padL = 46, padR = 10, padT = 8, padB = 18, iw = w - padL - padR, ih = h - padT - padB, xs = r.tests.map(x => x.med), ys = r.tests.map(x => x.actual);
        if (xs.length) { const xm = Math.max(...xs.map(Math.abs)) * 1.1 || 0.01, ym = Math.max(...ys.map(Math.abs)) * 1.1 || 0.01, X = v => padL + (v + xm) / (2 * xm) * iw, Y = v => padT + (ym - v) / (2 * ym) * ih;
          s.append(svg('rect', {x: X(0), y: padT, width: X(xm) - X(0), height: Y(0) - padT, fill: 'rgba(62,207,142,.06)'}), svg('rect', {x: padL, y: Y(0), width: X(0) - padL, height: h - padB - Y(0), fill: 'rgba(62,207,142,.06)'}));
          s.append(svg('line', {x1: padL, x2: w - padR, y1: Y(0), y2: Y(0), stroke: '#3a4742'}), svg('line', {x1: X(0), x2: X(0), y1: padT, y2: h - padB, stroke: '#3a4742'}));
          r.tests.forEach(x => { const c = svg('circle', {cx: X(x.med), cy: Y(x.actual), r: 3, fill: (x.med > 0) === (x.actual > 0) ? '#3ecf8e' : '#ff5a4f', 'fill-opacity': 0.75}); const t2 = svg('title'); t2.textContent = `${r.B.day[x.t]}: predicted ${spct(Math.exp(x.med) - 1)}, actual ${spct(Math.exp(x.actual) - 1)}`; c.append(t2); s.append(c); });
          label(s, w - padR, h - 4, 'predicted →', {'text-anchor': 'end'}); label(s, padL + 4, padT + 10, '↑ actual');
          for (const v2 of [-ym / 1.1, 0, ym / 1.1]) label(s, padL - 4, Y(v2) + 3, (v2 * 100).toFixed(1) + '%', {'text-anchor': 'end'}); }
        pc.replaceChildren(s); }
      { const bins = [[0, 0.3], [0.3, 0.45], [0.45, 0.55], [0.55, 0.7], [0.7, 1.01]], rows = bins.map(([a, b]) => { const xs = r.tests.filter(x => x.pUp >= a && x.pUp < b); return {a, b, n: xs.length, pred: xs.length ? mean(xs.map(x => x.pUp)) : NaN, act: xs.length ? xs.filter(x => x.actual > 0).length / xs.length : NaN}; });
        const {w, h, s} = frame(cc, 'Calibration of predicted probabilities'), padL = 40, padR = 10, padT = 8, padB = 30, iw = w - padL - padR, ih = h - padT - padB, bw = iw / rows.length, Y = v => padT + (1 - v) * ih;
        for (const v2 of [0, 0.5, 1]) { s.append(svg('line', {x1: padL, x2: w - padR, y1: Y(v2), y2: Y(v2), stroke: '#1b2421'})); label(s, padL - 4, Y(v2) + 3, (v2 * 100) + '%', {'text-anchor': 'end'}); }
        rows.forEach((b, i) => { const x = padL + i * bw; if (finite(b.act)) s.append(svg('rect', {x: x + bw * 0.2, y: Y(b.act), width: bw * 0.6, height: Y(0) - Y(b.act), fill: '#5b8def', 'fill-opacity': 0.75})); if (finite(b.pred)) s.append(svg('line', {x1: x + bw * 0.12, x2: x + bw * 0.88, y1: Y(b.pred), y2: Y(b.pred), stroke: '#ffb000', 'stroke-width': 2})); label(s, x + bw / 2, h - 16, `${Math.round(b.a * 100)}–${Math.min(100, Math.round(b.b * 100))}%`, {'text-anchor': 'middle'}); label(s, x + bw / 2, h - 4, `n=${b.n}`, {'text-anchor': 'middle'}); });
        label(s, w - padR, padT + 10, 'amber = predicted · blue = actual', {'text-anchor': 'end', fill: '#aeb9b3'});
        cc.replaceChildren(s); }
    });
  }

  /* -------------------------------------------- register ---------------------------------------------- */
  Object.assign(T.PANELS, {btest: ['BTEST', 'Strategy backtester', 'btest'], optim: ['OPTIM', 'Portfolio optimizer', 'optim'], fcast: ['FCAST', 'K-line forecaster', 'fcast']});
  Object.assign(T.PANEL_DESC, {btest: 'Plain-English rules, event-driven backtest, out-of-sample', optim: 'Min variance, max Sharpe, risk parity, HRP, walk-forward', fcast: 'Similar past candle patterns and what came next'});
  for (const k of ['btest', 'optim', 'fcast']) T.LINK_LABEL[k] = 'Full';
  Object.assign(T.RENDER, {btest: renderBtest, optim: renderOptim, fcast: renderFcast});
  T.EXTRA_GROUPS.push(['Strategy lab', ['btest', 'optim', 'fcast']]);
  if (PG) {
    PG.add('btest', 'Strategy backtester', renderBtestPage); PG.add('backtest', 'Strategy backtester', renderBtestPage);
    PG.add('optim', 'Portfolio optimizer', renderOptimPage); PG.add('optimize', 'Portfolio optimizer', renderOptimPage);
    PG.add('fcast', 'K-line forecaster', renderFcastPage); PG.add('forecast', 'K-line forecaster', renderFcastPage);
    T.PAGE_NAMES.push('BTEST', 'BACKTEST', 'OPTIM', 'OPTIMIZE', 'FCAST', 'FORECAST');
  }
  if (T.DESK_DEFS && !T.DESK_DEFS.strategy) {
    T.DESK_DEFS.strategy = {...T.DESK_DEFS.all, label: 'STRATEGY', noun: 'Strategy lab', who: 'systematic traders', slots: ['btest', 'fcast', 'optim', 'mcvar'],
      grid: {cols: '1fr 1fr 1fr 1fr 1fr 1fr', areas: ['s1 s1 s1 s2 s2 s2', 's1 s1 s1 s2 s2 s2', 's3 s3 s3 s4 s4 s4']}};
    const qi = T.DESK_ORDER.indexOf('quant'); T.DESK_ORDER.splice(qi >= 0 ? qi + 1 : 1, 0, 'strategy');
  }
  T.StrategyLab = {significance, parseRules, normalizeText, backtest, perf, covEstimate, hrp, erc, minVarLambda, projCapped, weightsFor, features, forecastAt, smaArr, emaArr, rsiArr, atrArr, candleChart};
});
