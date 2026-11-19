/* FYNX Terminal plugin: Quant Lab — Market panic detector (PANIC) and Portfolio risk simulator (MCVAR).
 * Both use real split/dividend-adjusted daily closes (Yahoo Finance via the FYNX market proxy, op=closes).
 *
 * PANIC: 50 large US stocks across sectors, 5 years. For every trading day: the 60-day correlation matrix of daily
 *   log returns, the average pairwise correlation and the top eigenvalue's share of total variance (λ1/N, the
 *   "absorption ratio" with one factor). The network places each stock by classical multidimensional scaling of the
 *   correlation distance d = √(2(1−ρ)) on a fixed scale, so calm markets spread out and crashes clump together.
 *   Lines: the minimum spanning tree (the backbone of strongest links) plus every pair above ρ = 0.6.
 * MCVAR: 10,000 Monte Carlo futures for a portfolio (multivariate normal, multivariate Student-t, or historical
 *   bootstrap of whole days), Value at Risk and Expected Shortfall, then a backtest: rolling 1-day VaR from the
 *   previous 250 days against what happened next, with the Kupiec proportion-of-failures test.
 * Everything is computed in the browser from the downloaded closes; nothing here is a forecast or advice. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {el, btn, svg, $, panel, setText, tabs, store, empty, finite, signed, report} = T;

  /* --- data ----------------------------------------------------------------------------------------- */
  const cache = new Map();
  async function loadCloses(symbols, range = '5y') {
    const key = range + '|' + [...symbols].sort().join(',');
    const hit = cache.get(key); if (hit && Date.now() - hit.at < 3600000) return hit.data;
    if (hit?.pending) return hit.pending;
    const chunks = []; for (let i = 0; i < symbols.length; i += 17) chunks.push(symbols.slice(i, i + 17));
    const pending = Promise.all(chunks.map(c => T.fnMarket({op: 'closes', symbols: c.join(','), range}, 45000).catch(e => ({error: e.message, failedAll: c})))).then(parts => {
      const map = new Map(), names = {}, failed = {};
      for (const p of parts) {
        if (p.failedAll) { p.failedAll.forEach(s => failed[s] = p.error || 'Unavailable'); continue; }
        Object.assign(names, p.names || {}); Object.assign(failed, p.failed || {});
        for (const [s, arr] of Object.entries(p.series || {})) { const m = new Map(); p.dates.forEach((d, i) => { if (finite(arr[i]) && arr[i] > 0) m.set(d, arr[i]); }); map.set(s, m); }
      }
      const data = {series: map, names, failed, at: Date.now()};
      cache.set(key, {at: Date.now(), data}); return data;
    });
    cache.set(key, {pending});
    try { return await pending; } catch (e) { cache.delete(key); throw e; }
  }
  // Daily log returns on dates every symbol traded (inner join); forward-fills single missing days for US holidays.
  function alignedReturns(series, symbols, fillGaps = true) {
    const ok = symbols.filter(s => series.get(s)?.size > 60);
    if (!ok.length) return null;
    let dates = [...new Set(ok.flatMap(s => [...series.get(s).keys()]))].sort();
    const px = ok.map(s => { const m = series.get(s); let last = null, gap = 0; return dates.map(d => { if (m.has(d)) { last = m.get(d); gap = 0; return last; } gap++; return fillGaps && gap <= 3 ? last : null; }); });
    const keep = dates.map((_, i) => px.every(a => finite(a[i])));
    const idx = keep.map((k, i) => k ? i : -1).filter(i => i >= 0);
    dates = idx.map(i => dates[i]);
    const prices = px.map(a => idx.map(i => a[i]));
    const rets = prices.map(a => { const r = new Float64Array(a.length - 1); for (let i = 1; i < a.length; i++) r[i - 1] = Math.log(a[i] / a[i - 1]); return r; });
    return {symbols: ok, dates: dates.slice(1), prices, rets};
  }

  /* --- linear algebra ---------------------------------------------------------------------------------- */
  function topEigen(M, n, iters = 60, deflate = null) {
    let v = new Float64Array(n).fill(1 / Math.sqrt(n)), lambda = 0;
    if (deflate) for (let i = 0; i < n; i++) v[i] = Math.sin(i + 1); // different start for the second vector
    for (let k = 0; k < iters; k++) {
      const w = new Float64Array(n);
      for (let i = 0; i < n; i++) { let s = 0; const row = i * n; for (let j = 0; j < n; j++) s += M[row + j] * v[j]; w[i] = s; }
      if (deflate) { let dot = 0; for (let i = 0; i < n; i++) dot += w[i] * deflate.v[i]; for (let i = 0; i < n; i++) w[i] -= dot * deflate.v[i]; }
      let norm = 0; for (let i = 0; i < n; i++) norm += w[i] * w[i]; norm = Math.sqrt(norm) || 1;
      lambda = 0; for (let i = 0; i < n; i++) { w[i] /= norm; }
      for (let i = 0; i < n; i++) { let s = 0; const row = i * n; for (let j = 0; j < n; j++) s += M[row + j] * w[j]; lambda += w[i] * s; }
      v = w;
    }
    return {v, lambda};
  }
  function cholesky(S, n) {
    const L = new Float64Array(n * n);
    for (let jitter = 0; jitter < 6; jitter++) {
      let ok = true; L.fill(0);
      const eps = jitter ? 1e-10 * 10 ** jitter : 0;
      for (let i = 0; i < n && ok; i++) for (let j = 0; j <= i; j++) {
        let s = S[i * n + j] + (i === j ? eps : 0);
        for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
        if (i === j) { if (s <= 0) { ok = false; break; } L[i * n + i] = Math.sqrt(s); } else L[i * n + j] = s / L[j * n + j];
      }
      if (ok) return L;
    }
    return null;
  }
  // Seeded RNG so a re-run with the same inputs gives the same answer.
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function gauss(u) { let spare = null; return () => { if (spare !== null) { const v = spare; spare = null; return v; } let a, b, r; do { a = 2 * u() - 1; b = 2 * u() - 1; r = a * a + b * b; } while (!r || r >= 1); const f = Math.sqrt(-2 * Math.log(r) / r); spare = b * f; return a * f; }; }
  const erfc = x => { const z = Math.abs(x), t = 1 / (1 + 0.5 * z), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; };
  const quantile = (sorted, q) => { if (!sorted.length) return NaN; const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo); };
  const money = v => (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString();
  const pct = (v, d = 2) => (v * 100).toFixed(d) + '%';

  /* --- styles --------------------------------------------------------------------------------------- */
  const st = el('style'); st.id = 'fx-quant-style';
  st.textContent = `
.fx-ql{display:flex;flex-direction:column;align-items:stretch;gap:8px;height:100%;min-height:0;padding:6px 8px;box-sizing:border-box}
.fx-ql>*{min-width:0}
.fx-ql input:not([type=range]),.fx-ql select,.fx-of-bar select{background:#0b0f0e!important;color:#e8ecea!important;border:1px solid #2a3330!important;border-radius:3px;padding:5px 8px;font:12px/1.3 var(--mono,ui-monospace,monospace);color-scheme:dark;min-height:28px;box-sizing:border-box}
.fx-ql input:focus,.fx-ql select:focus,.fx-of-bar select:focus{outline:1px solid #f5a524;border-color:#f5a524}
.fx-ql input.sym{text-transform:uppercase;width:120px}.fx-ql td input[type=number]{width:90px;text-align:right}
.fx-ql input[type=range]{accent-color:#f5a524}

.fx-ql-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.fx-ql-state{font:700 18px 'IBM Plex Mono',monospace;letter-spacing:.04em}
.fx-ql-sub{color:var(--mu);font-size:11.5px}
.fx-ql-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:4px}
.fx-ql-kpi{padding:6px 8px;background:var(--p2);border:1px solid var(--ln)}
.fx-ql-kpi small{display:block;color:var(--mu);font:600 9.5px 'IBM Plex Mono',monospace;letter-spacing:.08em}
.fx-ql-kpi b{display:block;margin-top:2px;font:700 15px 'IBM Plex Mono',monospace;color:var(--tx)}
.fx-ql-kpi em{font-style:normal;font-size:10.5px;color:var(--mu)}
.fx-ql-chart{position:relative;flex:1;min-height:110px}
.fx-ql-chart svg{display:block;width:100%;height:100%}
.fx-ql-note{margin:0;color:var(--mu);font-size:11px;line-height:1.5}
.fx-ql-gauge{position:relative;height:8px;border-radius:4px;background:linear-gradient(90deg,#3ecf8e 0%,#c9d36a 45%,#ffb000 75%,#ff3b30 100%)}
.fx-ql-gauge i{position:absolute;top:-4px;width:3px;height:16px;background:#fff;box-shadow:0 0 0 2px #05080a;border-radius:2px;transform:translateX(-1px)}
.fx-ql-tip{position:absolute;z-index:3;pointer-events:none;padding:6px 8px;background:rgba(8,11,10,.95);border:1px solid var(--ln2);font:500 11px/1.5 'IBM Plex Mono',monospace;color:var(--tx);white-space:nowrap}
.fx-ql-net{position:relative;flex:1;min-height:220px;background:radial-gradient(circle at 50% 45%,#0d1513 0%,#070a09 70%);border:1px solid var(--ln)}
.fx-ql-net svg{display:block;width:100%;height:100%}
.fx-ql-net .nd{transition:transform .55s cubic-bezier(.2,.7,.2,1)}
.fx-ql-net .nd circle{stroke:#05080a;stroke-width:1.2;cursor:pointer}
.fx-ql-net .nd text{font:600 9px 'IBM Plex Mono',monospace;fill:#d7dfda;paint-order:stroke;stroke:#05080a;stroke-width:2.5px;pointer-events:none}
.fx-ql-net line{transition:all .55s cubic-bezier(.2,.7,.2,1)}
.fx-ql-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font:600 10.5px 'IBM Plex Mono',monospace;color:var(--mu)}
.fx-ql-legend span{display:inline-flex;align-items:center;gap:5px}
.fx-ql-legend i{width:9px;height:9px;border-radius:50%}
.fx-ql-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.fx-ql-row label{display:flex;align-items:center;gap:6px;color:var(--mu);font-size:11.5px}
.fx-ql-row select,.fx-ql-row input{background:#0d1312;border:1px solid #26302c;color:var(--tx);font:12px 'IBM Plex Mono',monospace;padding:5px 6px;min-height:30px}
.fx-ql-row input[type=range]{padding:0;accent-color:#ffb000;min-width:220px;flex:1}
.fx-ql-btn{min-height:30px;padding:4px 10px;background:#121917;border:1px solid #2a3530;color:var(--tx);font:600 11.5px Inter,Arial,sans-serif;cursor:pointer}
.fx-ql-btn:hover,.fx-ql-btn.on{border-color:var(--am);color:var(--am)}
.fx-ql-btn.pri{background:var(--am);border-color:var(--am);color:#000}
.fx-ql-tbl{width:100%;border-collapse:collapse;font:500 12px 'IBM Plex Mono',monospace}
.fx-ql-tbl th,.fx-ql-tbl td{padding:6px 8px;border-top:1px solid var(--ln);text-align:right}
.fx-ql-tbl th{color:var(--mu);font-size:10.5px;font-weight:600;letter-spacing:.05em}
.fx-ql-tbl th:first-child,.fx-ql-tbl td:first-child{text-align:left}
.fx-ql-tbl input{width:84px;background:#0d1312;border:1px solid #26302c;color:var(--tx);font:12px 'IBM Plex Mono',monospace;padding:4px 6px;text-align:right}
.fx-ql-tbl input.sym{width:110px;text-align:left;text-transform:uppercase}
.fx-ql-split{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:14px}
.fx-ql-card{padding:10px 12px;background:var(--p2);border:1px solid var(--ln)}
.fx-ql-card h3{margin:0 0 8px;font:700 11px 'IBM Plex Mono',monospace;letter-spacing:.08em;color:var(--am)}
.fx-ql-verdict{padding:8px 10px;border-left:3px solid;font-size:12.5px;line-height:1.5;background:#0d1312}
.fx-ql-page .fx-ql-chart{min-height:260px}
.fx-ql-page .fx-ql-net{min-height:520px}
@media (max-width:900px){.fx-ql-split{grid-template-columns:1fr}.fx-ql-page .fx-ql-net{min-height:380px}}
@media (prefers-reduced-motion:reduce){.fx-ql-net .nd,.fx-ql-net line{transition:none}}`;
  document.head.append(st);

  /* ======================================================================================================
   * PANIC: market panic detector
   * ==================================================================================================== */
  const SECTORS = {
    Tech: ['#5b8def', ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'ADBE', 'CRM', 'AMD', 'CSCO', 'INTC', 'QCOM', 'TXN', 'IBM', 'ACN']],
    Comms: ['#c77dff', ['GOOGL', 'META', 'NFLX', 'DIS']],
    Discretionary: ['#ff8a65', ['AMZN', 'TSLA', 'HD', 'MCD', 'SBUX']],
    Staples: ['#a5d66b', ['PG', 'KO', 'PEP', 'WMT', 'COST']],
    Financials: ['#ffb000', ['JPM', 'BAC', 'WFC', 'GS', 'V', 'MA', 'BRK-B']],
    Health: ['#4dd0e1', ['UNH', 'LLY', 'JNJ', 'MRK', 'ABBV', 'TMO', 'ABT']],
    Energy: ['#d4a373', ['XOM', 'CVX']],
    Industrials: ['#b0bec5', ['CAT', 'GE', 'BA', 'HON']],
    Materials: ['#f48fb1', ['LIN']],
    Utilities: ['#80cbc4', ['NEE']]
  };
  const UNIVERSE = Object.values(SECTORS).flatMap(s => s[1]);
  const SECTOR_OF = Object.fromEntries(Object.entries(SECTORS).flatMap(([k, [c, l]]) => l.map(s => [s, {name: k, color: c}])));
  const WIN = 60;
  let P = null, panicLoading = null, panicErr = null;

  async function panicData() {
    if (P) return P;
    if (panicLoading) return panicLoading;
    panicLoading = (async () => {
      const d = await loadCloses([...UNIVERSE, 'SPY'], '5y');
      const A = alignedReturns(d.series, UNIVERSE);
      if (!A || A.symbols.length < 20 || A.dates.length < WIN + 40) throw new Error('Not enough price history loaded yet.');
      const n = A.symbols.length, T_ = A.dates.length, R = A.rets;
      const avg = new Float64Array(T_).fill(NaN), share = new Float64Array(T_).fill(NaN), corrs = new Map();
      const C = new Float64Array(n * n), Z = A.symbols.map(() => new Float64Array(WIN));
      for (let t = WIN - 1; t < T_; t++) {
        for (let i = 0; i < n; i++) {
          let m = 0; for (let k = 0; k < WIN; k++) m += R[i][t - WIN + 1 + k]; m /= WIN;
          let v = 0; for (let k = 0; k < WIN; k++) { const x = R[i][t - WIN + 1 + k] - m; Z[i][k] = x; v += x * x; }
          const sd = Math.sqrt(v / (WIN - 1)) || 1e-12; for (let k = 0; k < WIN; k++) Z[i][k] /= sd;
        }
        let sum = 0;
        for (let i = 0; i < n; i++) { C[i * n + i] = 1; for (let j = i + 1; j < n; j++) { let s = 0; const zi = Z[i], zj = Z[j]; for (let k = 0; k < WIN; k++) s += zi[k] * zj[k]; s /= WIN - 1; C[i * n + j] = C[j * n + i] = s; sum += s; } }
        avg[t] = sum / (n * (n - 1) / 2);
        share[t] = topEigen(C, n, 25).lambda / n;
        if (t >= T_ - 260 || t % 5 === 0) corrs.set(t, Float32Array.from(C));
        if (t % 120 === 0) await new Promise(r => setTimeout(r, 0)); // keep the page responsive
      }
      // SPY drawdown for context.
      const spy = d.series.get('SPY'), dd = new Float64Array(T_).fill(NaN); let peak = 0;
      A.dates.forEach((dt, i) => { const v = spy?.get(dt); if (finite(v)) { peak = Math.max(peak, v); dd[i] = v / peak - 1; } });
      const hist = [...avg].filter(finite).sort((a, b) => a - b);
      P = {A, n, avg, share, dd, corrs, hist, failed: d.failed, first: WIN - 1, last: T_ - 1, at: Date.now()};
      return P;
    })();
    try { return await panicLoading; } catch (e) { panicErr = e; throw e; } finally { panicLoading = null; }
  }
  const pctRank = (hist, v) => { let lo = 0, hi = hist.length; while (lo < hi) { const m = (lo + hi) >> 1; if (hist[m] < v) lo = m + 1; else hi = m; } return lo / hist.length; };
  function regime(p) { return p >= 0.95 ? ['PANIC', '#ff3b30', 'Correlations are in the top 5% of the past five years: stocks are moving as one.'] : p >= 0.8 ? ['STRESS', '#ff9f1c', 'Correlations are elevated: diversification inside stocks is weaker than usual.'] : p >= 0.4 ? ['NORMAL', '#c9d36a', 'Correlations are in their usual range.'] : ['CALM', '#3ecf8e', 'Stocks are moving on their own stories; diversification is working.']; }
  function nearestCorrIndex(t) { if (P.corrs.has(t)) return t; for (let k = 1; k < 6; k++) { if (P.corrs.has(t - k)) return t - k; if (P.corrs.has(t + k)) return t + k; } return P.last; }

  // Classical MDS on d = √(2(1−ρ)) — absolute scale, so a crash pulls every stock towards the centre.
  let prevXY = null;
  function layout(t) {
    const n = P.n, C = P.corrs.get(nearestCorrIndex(t)), D2 = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) D2[i] = 2 * (1 - C[i]);
    const rowM = new Float64Array(n); let all = 0;
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += D2[i * n + j]; rowM[i] = s / n; all += s; }
    all /= n * n;
    const B = new Float64Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) B[i * n + j] = -0.5 * (D2[i * n + j] - rowM[i] - rowM[j] + all);
    const e1 = topEigen(B, n, 80), e2 = topEigen(B, n, 80, e1);
    let xy = prevXY && prevXY.length === n ? prevXY.map(p => [...p]) : Array.from({length: n}, (_, i) => [e1.v[i] * Math.sqrt(Math.max(e1.lambda, 1e-9)) + 0.05 * Math.cos(i), e2.v[i] * Math.sqrt(Math.max(e2.lambda, 1e-9)) + 0.05 * Math.sin(i)]);
    // Stress majorization (SMACOF): place stocks so on-screen distances match d = √(2(1−ρ)) as closely as a plane allows.
    // The scale is absolute, so a market where everything is correlated (small d) really does shrink.
    const D = new Float64Array(n * n); for (let i = 0; i < n * n; i++) D[i] = Math.sqrt(Math.max(0, D2[i]));
    for (let it = 0; it < 70; it++) {
      const nx = xy.map(() => [0, 0]);
      for (let i = 0; i < n; i++) { let bx = 0, by = 0; for (let j = 0; j < n; j++) { if (i === j) continue; const dx = xy[i][0] - xy[j][0], dy = xy[i][1] - xy[j][1], dist = Math.hypot(dx, dy) || 1e-9, k = D[i * n + j] / dist; bx += k * dx + xy[j][0]; by += k * dy + xy[j][1]; } nx[i] = [bx / n, by / n]; }
      xy = nx;
    }
    let mx = 0, my = 0; for (const [x, y] of xy) { mx += x; my += y; } mx /= n; my /= n; xy = xy.map(([x, y]) => [x - mx, y - my]);
    prevXY = xy;
    // Minimum spanning tree (Prim) on the same distances.
    const inT = new Uint8Array(n), best = new Float64Array(n).fill(Infinity), par = new Int32Array(n).fill(-1), mst = []; best[0] = 0;
    for (let k = 0; k < n; k++) { let u = -1; for (let i = 0; i < n; i++) if (!inT[i] && (u < 0 || best[i] < best[u])) u = i; inT[u] = 1; if (par[u] >= 0) mst.push([par[u], u]); for (let v = 0; v < n; v++) if (!inT[v] && D2[u * n + v] < best[v]) { best[v] = D2[u * n + v]; par[v] = u; } }
    const strong = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (C[i * n + j] >= 0.6) strong.push([i, j, C[i * n + j]]);
    let deg = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) if (j !== i) s += Math.max(0, C[i * n + j]); deg[i] = s / (n - 1); }
    return {xy, mst: mst.map(([a, b]) => [a, b, C[a * n + b]]), strong, deg, C};
  }

  function networkSvg(host, t, {big = false} = {}) {
    const box = host.querySelector('.fx-ql-net') || host.appendChild(el('div', 'fx-ql-net'));
    const w = Math.max(260, box.clientWidth || 600), h = Math.max(200, box.clientHeight || 360), cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - (big ? 36 : 18);
    const L = layout(t), scale = R / 1.05; // fixed scale across dates: radius ≈ the largest typical distance
    let s = box.querySelector('svg');
    if (!s || s.dataset.w !== String(w) || s.dataset.h !== String(h)) {
      s = svg('svg', {viewBox: `0 0 ${w} ${h}`, role: 'img'}); s.dataset.w = w; s.dataset.h = h;
      s.append(svg('circle', {cx, cy, r: scale * 0.5, fill: 'none', stroke: '#1d2824', 'stroke-dasharray': '2 4'}), svg('circle', {cx, cy, r: scale, fill: 'none', stroke: '#16201c', 'stroke-dasharray': '2 4'}));
      s.append(svg('g', {class: 'edges'}), svg('g', {class: 'nodes'})); box.replaceChildren(s);
      const tip = el('div', 'fx-ql-tip'); tip.hidden = true; box.append(tip);
    }
    s.setAttribute('aria-label', `Correlation network on ${P.A.dates[t]}: average correlation ${P.avg[t].toFixed(2)}`);
    const pos = L.xy.map(([x, y]) => [cx + x * scale, cy + y * scale]);
    const eg = s.querySelector('.edges'), ng = s.querySelector('.nodes');
    const edges = [...L.strong.map(e => [...e, 'strong']), ...L.mst.map(e => [...e, 'mst'])];
    const lines = eg.children;
    while (lines.length < edges.length) eg.append(svg('line'));
    while (lines.length > edges.length) eg.lastChild.remove();
    edges.forEach(([a, b, rho, kind], i) => {
      const l = lines[i], col = kind === 'mst' ? '#7d8a83' : '#ff5a4f';
      l.setAttribute('x1', pos[a][0]); l.setAttribute('y1', pos[a][1]); l.setAttribute('x2', pos[b][0]); l.setAttribute('y2', pos[b][1]);
      l.setAttribute('stroke', col); l.setAttribute('stroke-opacity', kind === 'mst' ? 0.55 : Math.min(0.5, (rho - 0.55) * 1.6)); l.setAttribute('stroke-width', kind === 'mst' ? 1.2 : 0.8);
    });
    if (!ng.childElementCount) P.A.symbols.forEach((sym, i) => {
      const g = svg('g', {class: 'nd'}), sec = SECTOR_OF[sym];
      const c = svg('circle', {r: 5, fill: sec.color}); g.append(c);
      if (big) { const tx = svg('text', {x: 7, y: 3}); tx.textContent = sym; g.append(tx); }
      g.addEventListener('pointerenter', () => { const tip = box.querySelector('.fx-ql-tip'); const row = L_last.C; let top = []; for (let j = 0; j < P.n; j++) if (j !== i) top.push([P.A.symbols[j], row[i * P.n + j]]); top.sort((a, b) => b[1] - a[1]); tip.textContent = `${sym} · ${sec.name} · avg ρ ${L_last.deg[i].toFixed(2)} · closest ${top.slice(0, 3).map(x => x[0] + ' ' + x[1].toFixed(2)).join(', ')}`; tip.hidden = false; const r = g.getBoundingClientRect(), b = box.getBoundingClientRect(); tip.style.left = Math.min(b.width - 300, Math.max(0, r.left - b.left + 10)) + 'px'; tip.style.top = Math.max(0, r.top - b.top - 30) + 'px'; });
      g.addEventListener('pointerleave', () => { box.querySelector('.fx-ql-tip').hidden = true; });
      ng.append(g);
    });
    L_last = L;
    [...ng.children].forEach((g, i) => { g.style.transform = `translate(${pos[i][0].toFixed(1)}px,${pos[i][1].toFixed(1)}px)`; g.firstChild.setAttribute('r', (big ? 4 : 3) + L.deg[i] * (big ? 7 : 5)); });
  }
  let L_last = null;

  function timelineSvg(box, {sel, onPick, big = false, years = 5}) {
    const w = Math.max(260, box.clientWidth || 600), h = Math.max(100, box.clientHeight || 160);
    const padL = 34, padR = 8, padT = 8, padB = 18, ddH = big ? h * 0.24 : 0, ih = h - padT - padB - ddH - (big ? 8 : 0), iw = w - padL - padR;
    const from = Math.max(P.first, P.last - Math.round(years * 252)), N = P.last - from;
    const X = t => padL + (t - from) / N * iw, Y = v => padT + (1 - v) * ih;
    const s = svg('svg', {viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'Average correlation and top eigenvalue share over time'});
    // regime bands from history percentiles
    const q80 = quantile(P.hist, 0.8), q95 = quantile(P.hist, 0.95);
    s.append(svg('rect', {x: padL, y: Y(1), width: iw, height: Y(q95) - Y(1), fill: 'rgba(255,59,48,.07)'}), svg('rect', {x: padL, y: Y(q95), width: iw, height: Y(q80) - Y(q95), fill: 'rgba(255,159,28,.06)'}));
    for (const g of [0, 0.25, 0.5, 0.75, 1]) { s.append(svg('line', {x1: padL, x2: padL + iw, y1: Y(g), y2: Y(g), stroke: '#1a2420', 'stroke-dasharray': '2 3'})); const tx = svg('text', {x: padL - 4, y: Y(g) + 3, 'text-anchor': 'end', fill: '#6f7c75', 'font-size': 9.5, 'font-family': 'IBM Plex Mono, monospace'}); tx.textContent = g.toFixed(2); s.append(tx); }
    const line = (arr, col, wdt) => { let d = ''; for (let t = from; t <= P.last; t++) if (finite(arr[t])) d += (d ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(Math.max(0, Math.min(1, arr[t]))).toFixed(1); s.append(svg('path', {d, fill: 'none', stroke: col, 'stroke-width': wdt, 'stroke-linejoin': 'round'})); };
    line(P.share, '#5b8def', 1.2); line(P.avg, '#ffb000', 1.6);
    if (big) { // SPY drawdown
      const top = padT + ih + 8, Yd = v => top + (-v / 0.35) * ddH; let d = `M${X(from)} ${top}`;
      for (let t = from; t <= P.last; t++) if (finite(P.dd[t])) d += `L${X(t).toFixed(1)} ${Math.min(top + ddH, Yd(P.dd[t])).toFixed(1)}`;
      d += `L${X(P.last)} ${top}Z`; s.append(svg('path', {d, fill: 'rgba(255,90,79,.35)', stroke: '#ff5a4f', 'stroke-width': 0.8}));
      const lab = svg('text', {x: padL + 4, y: top + 11, fill: '#9aa79f', 'font-size': 9.5, 'font-family': 'IBM Plex Mono, monospace'}); lab.textContent = 'S&P 500 (SPY) drawdown'; s.append(lab);
    }
    // year ticks
    let lastY = ''; for (let t = from; t <= P.last; t++) { const y = P.A.dates[t].slice(0, 4); if (y !== lastY) { lastY = y; if (t > from) { const tx = svg('text', {x: X(t), y: h - 5, 'text-anchor': 'middle', fill: '#6f7c75', 'font-size': 9.5, 'font-family': 'IBM Plex Mono, monospace'}); tx.textContent = y; s.append(tx); s.append(svg('line', {x1: X(t), x2: X(t), y1: padT, y2: h - padB, stroke: '#141c19'})); } } }
    const cursor = svg('line', {x1: X(sel), x2: X(sel), y1: padT, y2: h - padB, stroke: '#fff', 'stroke-width': 1, 'stroke-dasharray': '3 2'}); s.append(cursor);
    const tip = el('div', 'fx-ql-tip'); tip.hidden = true;
    const at = e => { const r = s.getBoundingClientRect(); return Math.max(from, Math.min(P.last, Math.round(from + ((e.clientX - r.left) * (w / r.width) - padL) / iw * N))); };
    s.addEventListener('pointermove', e => { const t = at(e); tip.hidden = false; tip.textContent = `${P.A.dates[t]} · avg ρ ${P.avg[t].toFixed(2)} · λ1/N ${P.share[t].toFixed(2)}${finite(P.dd[t]) ? ' · SPY ' + pct(P.dd[t], 1) + ' from high' : ''}`; const r = s.getBoundingClientRect(); const x = (e.clientX - r.left); tip.style.left = Math.min(r.width - 330, Math.max(0, x + 10)) + 'px'; tip.style.top = '4px'; });
    s.addEventListener('pointerleave', () => { tip.hidden = true; });
    if (onPick) { s.style.cursor = 'crosshair'; s.addEventListener('click', e => onPick(at(e))); }
    box.replaceChildren(s, tip);
  }

  function kpis(host, list) { const g = el('div', 'fx-ql-kpis'); for (const [k, v, sub, color] of list) { const c = el('div', 'fx-ql-kpi'), b = el('b', '', v); if (color) b.style.color = color; c.append(el('small', '', k), b); if (sub) c.append(el('em', '', sub)); g.append(c); } host.append(g); return g; }
  function gauge(host, p) { const g = el('div', 'fx-ql-gauge'), i = el('i'); i.style.left = (p * 100).toFixed(1) + '%'; g.append(i); g.setAttribute('role', 'img'); g.setAttribute('aria-label', `Current correlation is higher than ${Math.round(p * 100)}% of the past five years`); host.append(g); }

  async function renderPanic() {
    const host = panel('panic');
    if (!P) { empty(host, panicErr ? 'Price history is unavailable right now. It retries automatically.' : 'Loading 5 years of prices for 50 stocks…'); try { await panicData(); } catch (e) { report('panic', e); setTimeout(() => { panicErr = null; T.R('panic'); }, 60000); return; } if (!$('tp-panic')) return; return renderPanic(); }
    host.replaceChildren();
    const t = P.last, p = pctRank(P.hist, P.avg[t]), [name, col, text] = regime(p);
    setText('n-panic', `${P.A.dates[t]}`);
    const wrap = el('div', 'fx-ql'); host.append(wrap);
    const head = el('div', 'fx-ql-head'), stt = el('span', 'fx-ql-state', name); stt.style.color = col; head.append(stt, el('span', 'fx-ql-sub', text)); wrap.append(head);
    gauge(wrap, p);
    kpis(wrap, [['AVG CORR', P.avg[t].toFixed(2), `${Math.round(p * 100)}th pct`], ['TOP EIGEN λ1/N', P.share[t].toFixed(2), 'one-factor share'], ['5Y HIGH', Math.max(...P.hist).toFixed(2), P.A.dates[P.avg.indexOf(Math.max(...[...P.avg].filter(finite)))] || '']]);
    const split = el('div'); split.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;flex:1;min-height:150px';
    const net = el('div', 'fx-ql-net'), tl = el('div', 'fx-ql-chart'); split.append(net, tl); wrap.append(split);
    requestAnimationFrame(() => { prevXY = null; networkSvg(split, t); timelineSvg(tl, {sel: t, years: 2, onPick: () => T.openPage('panic')}); });
  }

  async function renderPanicPage(host) {
    PG.setHead('PANIC', 'Market panic detector', '50 large US stocks · 60-day rolling correlations · 5 years of daily closes');
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap);
    if (!P) { wrap.append(el('p', 'fx-ql-note', 'Loading 5 years of daily prices for 50 stocks and computing about 1,200 correlation matrices…')); try { await panicData(); } catch (e) { wrap.replaceChildren(el('p', 'fx-ql-note', 'Price history is unavailable right now. Please try again in a minute.')); return; } wrap.replaceChildren(); }
    let sel = P.last;
    const calm = (() => { let b = P.last, v = Infinity; for (let t = P.first; t <= P.last; t++) if (P.avg[t] < v) { v = P.avg[t]; b = t; } return b; })();
    const worst = (() => { let b = P.last, v = -Infinity; for (let t = P.first; t <= P.last; t++) if (P.avg[t] > v) { v = P.avg[t]; b = t; } return b; })();
    const head = el('div', 'fx-ql-head'), kp = el('div'), gWrap = el('div');
    const ctrl = el('div', 'fx-ql-row'), slider = el('input'); slider.type = 'range'; slider.min = P.first; slider.max = P.last; slider.value = sel; slider.setAttribute('aria-label', 'Date');
    const dateLab = el('b'); dateLab.style.cssText = "font:700 13px 'IBM Plex Mono',monospace;min-width:96px";
    const jump = (label, t) => btn(label, 'fx-ql-btn', () => go(t));
    ctrl.append(jump('Now', P.last), jump('Calmest', calm), jump('Most stressed', worst), slider, dateLab);
    const play = btn('▶ Play 5 years', 'fx-ql-btn pri', () => animate()); ctrl.append(play);
    const split = el('div', 'fx-ql-split'), left = el('div', 'fx-ql-card'), right = el('div', 'fx-ql-card');
    left.append(el('h3', '', 'CORRELATION NETWORK')); const netHost = el('div'); netHost.style.cssText = 'display:flex;flex-direction:column;height:540px'; left.append(netHost);
    const lg = el('div', 'fx-ql-legend'); for (const [k, [c]] of Object.entries(SECTORS)) { const s = el('span'), i = el('i'); i.style.background = c; s.append(i, document.createTextNode(k)); lg.append(s); }
    const s2 = el('span'), i2 = el('i'); i2.style.cssText = 'background:#7d8a83;border-radius:0;height:2px;width:14px'; s2.append(i2, document.createTextNode('Spanning tree')); const s3 = el('span'), i3 = el('i'); i3.style.cssText = 'background:#ff5a4f;border-radius:0;height:2px;width:14px'; s3.append(i3, document.createTextNode('ρ ≥ 0.6')); lg.append(s2, s3); left.append(lg);
    right.append(el('h3', '', 'AVERAGE CORRELATION (AMBER) · TOP EIGENVALUE SHARE (BLUE)'));
    const tl = el('div', 'fx-ql-chart'); tl.style.height = '330px'; right.append(tl);
    right.append(el('p', 'fx-ql-note', 'Click the chart to see the network on that day. Bands: orange = top 20% of the five years, red = top 5%.'));
    const explain = el('div', 'fx-ql-card'); explain.append(el('h3', '', 'HOW TO READ IT'));
    for (const t of ['Each dot is a stock, coloured by sector. Stocks that moved together over the last 60 trading days sit close; the distance is √(2(1 − correlation)), on the same scale every day.', 'Calm markets spread out into sector clusters. In a sell-off almost everything moves together, so the whole network collapses towards the centre and red links (correlation 0.6 or more) appear everywhere.', 'Average correlation is the mean of all 1,225 pairwise correlations. λ1/N is the share of all stock variance explained by the single strongest common factor (the top eigenvalue of the correlation matrix divided by the number of stocks). Both rising together is the classic warning that diversification inside equities is failing.', 'Prices: Yahoo Finance daily adjusted closes via FYNX. Computed in your browser. History, not a forecast.']) explain.append(el('p', 'fx-ql-note', t));
    right.append(explain);
    split.append(left, right);
    wrap.append(head, gWrap, kp, ctrl, split);
    const failed = Object.keys(P.failed || {}).filter(s => UNIVERSE.includes(s)); if (failed.length) wrap.append(el('p', 'fx-ql-note', `Not loaded: ${failed.join(', ')}.`));
    function go(t, {fromSlider = false} = {}) {
      sel = Math.max(P.first, Math.min(P.last, t)); if (!fromSlider) slider.value = sel;
      const p = pctRank(P.hist, P.avg[sel]), [name, col, text] = regime(p);
      head.replaceChildren(); const stt = el('span', 'fx-ql-state', name); stt.style.color = col; head.append(stt, el('span', 'fx-ql-sub', `${P.A.dates[sel]} · ${text}`));
      gWrap.replaceChildren(); gauge(gWrap, p);
      kp.replaceChildren(); kpis(kp, [['AVG CORRELATION', P.avg[sel].toFixed(3), `higher than ${Math.round(p * 100)}% of days`, col], ['λ1 / N', P.share[sel].toFixed(3), 'top eigenvalue share'], ['LINKS ρ ≥ 0.6', String(layoutCount(sel)), `of 1,225 pairs`], ['SPY FROM HIGH', finite(P.dd[sel]) ? pct(P.dd[sel], 1) : '—', 'drawdown'], ['FIVE-YEAR RANGE', `${quantile(P.hist, 0).toFixed(2)}–${quantile(P.hist, 1).toFixed(2)}`, 'avg correlation']]);
      dateLab.textContent = P.A.dates[sel];
      networkSvg(netHost, sel, {big: true}); timelineSvg(tl, {sel, big: true, onPick: t2 => go(t2)});
    }
    const layoutCount = t => { const C = P.corrs.get(nearestCorrIndex(t)), n = P.n; let c = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (C[i * n + j] >= 0.6) c++; return c; };
    let raf = 0, sliderT = 0;
    slider.addEventListener('input', () => { cancelAnimationFrame(sliderT); sliderT = requestAnimationFrame(() => go(+slider.value, {fromSlider: true})); });
    function animate() {
      if (raf) { cancelAnimationFrame(raf); raf = 0; play.textContent = '▶ Play 5 years'; return; }
      play.textContent = '■ Stop'; let t = P.first, last = 0;
      const step = now => { if (!wrap.isConnected) return; if (now - last > 90) { last = now; t += 5; go(t); if (t >= P.last) { raf = 0; play.textContent = '▶ Play 5 years'; return; } } raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    }
    prevXY = null; requestAnimationFrame(() => go(sel));
  }

  /* ======================================================================================================
   * MCVAR: portfolio risk simulator
   * ==================================================================================================== */
  const PRESETS = [
    ['mine', 'My portfolio', null],
    ['6040', '60/40 stocks & bonds', [['SPY', 60], ['TLT', 40]]],
    ['tech', 'Tech heavy', [['QQQ', 40], ['NVDA', 20], ['MSFT', 20], ['AAPL', 20]]],
    ['allw', 'All-weather', [['SPY', 30], ['TLT', 40], ['IEF', 15], ['GLD', 7.5], ['DBC', 7.5]]],
    ['global', 'Global equity', [['SPY', 50], ['EFA', 30], ['EEM', 20]]],
    ['crypto', 'Crypto + stocks', [['BTC-USD', 30], ['ETH-USD', 20], ['SPY', 50]]]
  ];
  const V = (() => { let s = {}; try { s = JSON.parse(store.get('mcvar') || '{}') || {}; } catch (_) {} return {preset: s.preset || 'mine', rows: Array.isArray(s.rows) ? s.rows : null, value: finite(s.value) ? s.value : 100000, horizon: [1, 5, 10, 21].includes(s.horizon) ? s.horizon : 10, method: ['normal', 't', 'boot'].includes(s.method) ? s.method : 't', conf: s.conf === 0.99 ? 0.99 : 0.95, lookback: ['1y', '2y', '5y'].includes(s.lookback) ? s.lookback : '2y'}; })();
  const saveV = () => store.set('mcvar', JSON.stringify(V));
  function presetRows(key) {
    if (key === 'mine') {
      const h = T.portfolioHoldings?.() || [];
      if (h.length) return {rows: h.map(x => [x.symbol, x.qty]), units: true};
      return null;
    }
    const p = PRESETS.find(x => x[0] === key); return p?.[2] ? {rows: p[2].map(r => [...r]), units: false} : null;
  }
  function currentRows() {
    if (V.rows?.length) return {rows: V.rows, units: false};
    return presetRows(V.preset) || presetRows('6040');
  }
  const PATHS = 10000;
  async function simulate() {
    const pr = currentRows(), symbols = [...new Set(pr.rows.map(r => String(r[0]).toUpperCase()))];
    const d = await loadCloses([...symbols, 'SPY'], V.lookback === '5y' ? '5y' : V.lookback);
    const A = alignedReturns(d.series, symbols, true);
    if (!A || A.dates.length < 60) throw new Error('Not enough overlapping price history for these holdings.');
    const n = A.symbols.length, Tn = A.dates.length;
    const last = A.prices.map(p => p.at(-1));
    // weights: by value for unit holdings, else the % column
    let w = A.symbols.map(s => { const r = pr.rows.find(x => String(x[0]).toUpperCase() === s); return r ? +r[1] || 0 : 0; });
    if (pr.units) w = w.map((u, i) => u * last[i]);
    const tw = w.reduce((a, b) => a + Math.abs(b), 0) || 1; w = w.map(x => x / tw);
    const value = pr.units ? A.symbols.reduce((s, sym, i) => { const r = pr.rows.find(x => String(x[0]).toUpperCase() === sym); return s + (r ? r[1] * last[i] : 0); }, 0) : V.value;
    // moments
    const mu = new Float64Array(n), S = new Float64Array(n * n), R = A.rets;
    for (let i = 0; i < n; i++) { let m = 0; for (let t = 0; t < Tn; t++) m += R[i][t]; mu[i] = m / Tn; }
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { let c = 0; for (let t = 0; t < Tn; t++) c += (R[i][t] - mu[i]) * (R[j][t] - mu[j]); S[i * n + j] = S[j * n + i] = c / (Tn - 1); }
    const L = cholesky(S, n); if (!L) throw new Error('The covariance matrix could not be factorised.');
    const H = V.horizon, u = rng(20261119 + n * 7 + H * 13 + Tn), g = gauss(u), nu = 4;
    const chi2 = () => { let s = 0; for (let k = 0; k < nu; k++) { const z = g(); s += z * z; } return s; };
    const pl = new Float64Array(PATHS), byDay = Array.from({length: H}, () => new Float64Array(PATHS));
    const z = new Float64Array(n), cum = new Float64Array(n);
    for (let p = 0; p < PATHS; p++) {
      cum.fill(0);
      for (let dday = 0; dday < H; dday++) {
        if (V.method === 'boot') { const t = Math.floor(u() * Tn); for (let i = 0; i < n; i++) cum[i] += R[i][t]; }
        else {
          for (let i = 0; i < n; i++) z[i] = g();
          const k = V.method === 't' ? Math.sqrt((nu - 2) / chi2()) : 1;
          for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j <= i; j++) s += L[i * n + j] * z[j]; cum[i] += mu[i] + s * k; }
        }
        let port = 0; for (let i = 0; i < n; i++) port += w[i] * (Math.exp(cum[i]) - 1);
        byDay[dday][p] = port;
      }
      pl[p] = byDay[H - 1][p] * value;
    }
    const sorted = Float64Array.from(pl).sort(), a = 1 - V.conf;
    const VaR = -quantile(sorted, a), tailN = Math.max(1, Math.floor(PATHS * a)); let es = 0; for (let i = 0; i < tailN; i++) es += sorted[i]; es = -es / tailN;
    const fan = byDay.map(arr => { const s = Float64Array.from(arr).sort(); return [0.05, 0.25, 0.5, 0.75, 0.95].map(q => quantile(s, q)); });
    // backtest: rolling 1-day VaR from the previous 250 days, constant weights rebalanced daily
    const port = new Float64Array(Tn); for (let t = 0; t < Tn; t++) { let r = 0; for (let i = 0; i < n; i++) r += w[i] * (Math.exp(R[i][t]) - 1); port[t] = r; }
    const W_ = 250, bt = [];
    const zq = V.conf === 0.99 ? 2.3263 : 1.6449;
    for (let t = W_; t < Tn; t++) {
      const win = port.subarray(t - W_, t), s = Float64Array.from(win).sort();
      let m = 0; for (const x of win) m += x; m /= W_; let v = 0; for (const x of win) v += (x - m) ** 2; const sd = Math.sqrt(v / (W_ - 1));
      bt.push({date: A.dates[t], r: port[t], hs: -quantile(s, a), pn: -(m - zq * sd)});
    }
    const test = key => {
      const N = bt.length, x = bt.filter(b => b.r < -b[key]).length, p = a;
      if (!N) return null;
      const ph = x / N, ll0 = (N - x) * Math.log(1 - p) + x * Math.log(p), ll1 = (x > 0 && x < N) ? (N - x) * Math.log(1 - ph) + x * Math.log(ph) : 0;
      const LR = Math.max(0, -2 * (ll0 - ll1)), pv = erfc(Math.sqrt(LR / 2));
      let clusters = 0; for (let i = 1; i < N; i++) if (bt[i].r < -bt[i][key] && bt[i - 1].r < -bt[i - 1][key]) clusters++;
      return {N, x, expected: N * p, rate: ph, LR, p: pv, clusters};
    };
    // a 1-day VaR on the same model, for the panel headline
    return {A, n, w, value, sorted, pl, VaR, es, fan, bt, hs: test('hs'), pn: test('pn'), probLoss10: sorted.filter(v => v < -0.1 * value).length / PATHS, median: quantile(sorted, 0.5), best: quantile(sorted, 0.95), failed: d.failed, symbolsMissing: symbols.filter(s => !A.symbols.includes(s))};
  }
  let SIM = null, simKey = '', simPending = null;
  const key = () => JSON.stringify([currentRows(), V.value, V.horizon, V.method, V.conf, V.lookback]);
  async function sim() {
    const k = key(); if (SIM && simKey === k) return SIM; if (simPending && simPending.k === k) return simPending.p;
    const p = simulate().then(r => { SIM = r; simKey = k; return r; }); simPending = {k, p};
    try { return await p; } finally { if (simPending?.k === k) simPending = null; }
  }

  function histogram(box, r, {big = false} = {}) {
    const w = Math.max(240, box.clientWidth || 600), h = Math.max(90, box.clientHeight || 160), padL = big ? 44 : 6, padR = 8, padT = 8, padB = 18, iw = w - padL - padR, ih = h - padT - padB;
    const lo = quantile(r.sorted, 0.001), hi = quantile(r.sorted, 0.999), bins = big ? 70 : 44, bw = (hi - lo) / bins, cnt = new Array(bins).fill(0);
    for (const v of r.sorted) { const b = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / bw))); cnt[b]++; }
    const maxC = Math.max(...cnt), X = v => padL + (v - lo) / (hi - lo) * iw;
    const s = svg('svg', {viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': `Distribution of ${PATHS.toLocaleString()} simulated profit and loss outcomes; VaR ${money(r.VaR)}`});
    cnt.forEach((c, b) => { const x0 = lo + b * bw, bad = x0 + bw <= -r.VaR; s.append(svg('rect', {x: X(x0) + 0.5, y: padT + ih * (1 - c / maxC), width: Math.max(1, iw / bins - 1), height: ih * c / maxC, fill: bad ? '#ff3b30' : x0 < 0 ? '#7d8a83' : '#3ecf8e', 'fill-opacity': bad ? 0.95 : 0.6})); });
    const vx = X(-r.VaR); s.append(svg('line', {x1: vx, x2: vx, y1: padT, y2: padT + ih, stroke: '#ffb000', 'stroke-width': 1.6, 'stroke-dasharray': '4 3'}));
    const t = svg('text', {x: vx - 4, y: padT + 11, 'text-anchor': 'end', fill: '#ffb000', 'font-size': 10.5, 'font-weight': 700, 'font-family': 'IBM Plex Mono, monospace'}); t.textContent = `VaR ${Math.round(V.conf * 100)}% ${money(-r.VaR)}`; s.append(t);
    const ex = X(-r.es); s.append(svg('line', {x1: ex, x2: ex, y1: padT + 16, y2: padT + ih, stroke: '#ff3b30', 'stroke-width': 1, 'stroke-dasharray': '2 2'}));
    const z0 = X(0); if (z0 > padL && z0 < padL + iw) s.append(svg('line', {x1: z0, x2: z0, y1: padT, y2: padT + ih, stroke: '#56635c'}));
    for (const q of [lo, 0, hi]) { const tx = svg('text', {x: Math.max(padL, Math.min(w - padR, X(q))), y: h - 4, 'text-anchor': q === lo ? 'start' : q === hi ? 'end' : 'middle', fill: '#6f7c75', 'font-size': 9.5, 'font-family': 'IBM Plex Mono, monospace'}); tx.textContent = money(q); s.append(tx); }
    box.replaceChildren(s);
  }
  function fanChart(box, r) {
    const w = Math.max(240, box.clientWidth || 600), h = Math.max(140, box.clientHeight || 220), padL = 50, padR = 10, padT = 10, padB = 20, iw = w - padL - padR, ih = h - padT - padB, H = r.fan.length;
    const vals = r.fan.flat(); const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const X = d => padL + d / H * iw, Y = v => padT + (hi - v) / (hi - lo || 1) * ih;
    const s = svg('svg', {viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'Fan chart of simulated portfolio returns by day'});
    const band = (a, b, op) => { let d = `M${X(0)} ${Y(0)}`; r.fan.forEach((f, i) => d += `L${X(i + 1)} ${Y(f[b])}`); for (let i = H - 1; i >= 0; i--) d += `L${X(i + 1)} ${Y(r.fan[i][a])}`; d += `L${X(0)} ${Y(0)}Z`; s.append(svg('path', {d, fill: '#5b8def', 'fill-opacity': op})); };
    band(0, 4, 0.18); band(1, 3, 0.32);
    let d = `M${X(0)} ${Y(0)}`; r.fan.forEach((f, i) => d += `L${X(i + 1)} ${Y(f[2])}`); s.append(svg('path', {d, fill: 'none', stroke: '#e7ece9', 'stroke-width': 1.4}));
    s.append(svg('line', {x1: padL, x2: padL + iw, y1: Y(0), y2: Y(0), stroke: '#56635c'}));
    for (const v of [lo, 0, hi]) { const tx = svg('text', {x: padL - 4, y: Y(v) + 3, 'text-anchor': 'end', fill: '#6f7c75', 'font-size': 9.5, 'font-family': 'IBM Plex Mono, monospace'}); tx.textContent = (v * 100).toFixed(1) + '%'; s.append(tx); }
    const tx = svg('text', {x: padL + iw, y: h - 5, 'text-anchor': 'end', fill: '#6f7c75', 'font-size': 9.5, 'font-family': 'IBM Plex Mono, monospace'}); tx.textContent = `day ${H}`; s.append(tx);
    const l2 = svg('text', {x: padL + 4, y: padT + 10, fill: '#9aa79f', 'font-size': 9.5, 'font-family': 'IBM Plex Mono, monospace'}); l2.textContent = 'median · 25–75% · 5–95%'; s.append(l2);
    box.replaceChildren(s);
  }
  function backtestChart(box, r, key2) {
    const w = Math.max(240, box.clientWidth || 600), h = Math.max(140, box.clientHeight || 220), padL = 46, padR = 8, padT = 8, padB = 18, iw = w - padL - padR, ih = h - padT - padB, N = r.bt.length;
    const lo = Math.min(...r.bt.map(b => Math.min(b.r, -b[key2]))), hi = Math.max(...r.bt.map(b => b.r));
    const X = i => padL + i / (N - 1) * iw, Y = v => padT + (hi - v) / (hi - lo || 1) * ih;
    const s = svg('svg', {viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'Daily portfolio returns against the model VaR line; red marks show days worse than VaR'});
    const bw = Math.max(0.6, iw / N - 0.3);
    r.bt.forEach((b, i) => { const bad = b.r < -b[key2]; s.append(svg('rect', {x: X(i) - bw / 2, y: Math.min(Y(0), Y(b.r)), width: bw, height: Math.abs(Y(b.r) - Y(0)), fill: bad ? '#ff3b30' : b.r >= 0 ? '#3ecf8e' : '#7d8a83', 'fill-opacity': bad ? 1 : 0.55})); });
    let d = ''; r.bt.forEach((b, i) => d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(-b[key2]).toFixed(1)); s.append(svg('path', {d, fill: 'none', stroke: '#ffb000', 'stroke-width': 1.3}));
    for (const v of [lo, 0, hi]) { const tx = svg('text', {x: padL - 4, y: Y(v) + 3, 'text-anchor': 'end', fill: '#6f7c75', 'font-size': 9.5, 'font-family': 'IBM Plex Mono, monospace'}); tx.textContent = (v * 100).toFixed(1) + '%'; s.append(tx); }
    [0, Math.floor(N / 2), N - 1].forEach((i, k) => { const tx = svg('text', {x: X(i), y: h - 4, 'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle', fill: '#6f7c75', 'font-size': 9.5, 'font-family': 'IBM Plex Mono, monospace'}); tx.textContent = r.bt[i].date; s.append(tx); });
    box.replaceChildren(s);
  }
  function verdict(t, label) {
    if (!t) return el('p', 'fx-ql-note', 'Not enough history for a backtest.');
    const ok = t.p >= 0.05, many = t.x > t.expected, box = el('div', 'fx-ql-verdict');
    box.style.borderColor = ok ? '#3ecf8e' : '#ff3b30';
    box.textContent = `${label}: reality was worse than the model on ${t.x} of ${t.N} days (${pct(t.rate, 1)}), against ${t.expected.toFixed(1)} expected at ${Math.round(V.conf * 100)}%. Kupiec test p = ${t.p.toFixed(3)} → ${ok ? 'the model’s miss rate is consistent with its confidence level.' : many ? 'the model underestimates risk (too many misses).' : 'the model is too conservative (too few misses).'}${t.clusters ? ` ${t.clusters} misses came on back-to-back days (risk clusters).` : ''}`;
    return box;
  }

  async function renderMcvar() {
    const host = panel('mcvar'); tabs('mcvar-tabs', [['1', '1D'], ['10', '10D'], ['21', '1M']], String(V.horizon), v => { V.horizon = +v; saveV(); T.R('mcvar'); });
    if (!SIM || simKey !== key()) { empty(host, `Simulating ${PATHS.toLocaleString()} futures…`); try { await sim(); } catch (e) { report('mcvar', e); return empty(host, e.message || 'Price history is unavailable right now.'); } if (!$('tp-mcvar')) return; }
    const r = SIM; host.replaceChildren();
    setText('n-mcvar', `${r.A.symbols.length} assets · ${{normal: 'normal', t: 'fat tails', boot: 'bootstrap'}[V.method]}`);
    const wrap = el('div', 'fx-ql'); host.append(wrap);
    kpis(wrap, [[`VAR ${Math.round(V.conf * 100)}% · ${V.horizon}D`, money(-r.VaR), pct(r.VaR / r.value), '#ffb000'], ['EXPECTED SHORTFALL', money(-r.es), 'avg of worst ' + Math.round((1 - V.conf) * 100) + '%', '#ff5a4f'], ['BACKTEST', r.hs ? `${r.hs.x}/${r.hs.N}` : '—', r.hs ? `exp. ${r.hs.expected.toFixed(0)} · p ${r.hs.p.toFixed(2)}` : '', r.hs ? (r.hs.p >= 0.05 ? '#3ecf8e' : '#ff3b30') : null]]);
    const hb = el('div', 'fx-ql-chart'); wrap.append(hb);
    wrap.append(el('p', 'fx-ql-note', `${money(r.value)} portfolio · ${PATHS.toLocaleString()} simulated futures · backtest = 1-day historical VaR vs reality`));
    requestAnimationFrame(() => histogram(hb, r));
  }

  async function renderMcvarPage(host, arg, alive) {
    PG.setHead('MCVAR', 'Portfolio risk simulator', `${PATHS.toLocaleString()} Monte Carlo futures · Value at Risk · backtest against reality`);
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap);
    // ---- inputs
    const inCard = el('div', 'fx-ql-card'); inCard.append(el('h3', '', 'PORTFOLIO'));
    const presetRow = el('div', 'fx-ql-row');
    for (const [k, label] of PRESETS) { const b = btn(label, 'fx-ql-btn' + (!V.rows && V.preset === k ? ' on' : ''), () => { V.preset = k; V.rows = null; saveV(); rerun(); }); if (k === 'mine' && !(T.portfolioHoldings?.() || []).length) { b.disabled = true; b.title = 'Add holdings in the Portfolio page first'; } presetRow.append(b); }
    inCard.append(presetRow);
    const pr = currentRows(), editing = pr.rows.map(r => [String(r[0]).toUpperCase(), r[1]]);
    const tbl = el('table', 'fx-ql-tbl'), thr = el('tr'); thr.append(el('th', '', 'SYMBOL'), el('th', '', pr.units ? 'UNITS' : 'WEIGHT %'), el('th', '', '')); tbl.append(thr);
    const draw = () => { while (tbl.rows.length > 1) tbl.deleteRow(1); editing.forEach((r, i) => { const tr = el('tr'), a = el('input', 'sym'), b = el('input'), td1 = el('td'), td2 = el('td'), td3 = el('td'); a.value = r[0]; a.setAttribute('aria-label', 'Symbol'); b.type = 'number'; b.step = 'any'; b.min = '0'; b.value = r[1]; b.setAttribute('aria-label', pr.units ? 'Units' : 'Weight percent'); a.addEventListener('change', () => { r[0] = a.value.trim().toUpperCase(); }); b.addEventListener('change', () => { r[1] = +b.value; }); td1.append(a); td2.append(b); td3.append(btn('✕', 'fx-ql-btn', () => { editing.splice(i, 1); draw(); }, 'Remove')); tr.append(td1, td2, td3); tbl.append(tr); }); };
    draw(); inCard.append(tbl);
    const actions = el('div', 'fx-ql-row'); actions.style.marginTop = '8px';
    actions.append(btn('+ Add asset', 'fx-ql-btn', () => { if (editing.length < 20) { editing.push(['', pr.units ? 1 : 10]); draw(); } }), btn('Run simulation', 'fx-ql-btn pri', () => { const rows = editing.filter(r => /^[A-Z0-9.\-=^&]{1,24}$/.test(r[0]) && r[1] > 0); if (!rows.length) return T.say('Add at least one valid symbol.'); if (pr.units) { V.preset = 'mine'; V.rows = null; } else V.rows = rows; saveV(); rerun(); }));
    inCard.append(actions);
    const opts = el('div', 'fx-ql-row'); opts.style.marginTop = '10px';
    const sel = (label, val, list, on) => { const l = el('label', '', label), s = el('select'); for (const [v, t] of list) { const o = el('option', '', t); o.value = v; if (String(v) === String(val)) o.selected = true; s.append(o); } s.addEventListener('change', () => on(s.value)); l.append(s); return l; };
    if (!pr.units) { const l = el('label', '', 'Value $'), i = el('input'); i.type = 'number'; i.min = '100'; i.step = '1000'; i.value = V.value; i.addEventListener('change', () => { V.value = Math.max(100, +i.value || 100000); saveV(); rerun(); }); l.append(i); opts.append(l); }
    opts.append(sel('Horizon', V.horizon, [[1, '1 day'], [5, '1 week'], [10, '10 days'], [21, '1 month']], v => { V.horizon = +v; saveV(); rerun(); }),
      sel('Model', V.method, [['t', 'Fat tails (Student-t, 4 df)'], ['normal', 'Normal (covariance)'], ['boot', 'Historical days (bootstrap)']], v => { V.method = v; saveV(); rerun(); }),
      sel('Confidence', V.conf, [[0.95, '95%'], [0.99, '99%']], v => { V.conf = +v; saveV(); rerun(); }),
      sel('History', V.lookback, [['1y', '1 year'], ['2y', '2 years'], ['5y', '5 years']], v => { V.lookback = v; saveV(); rerun(); }));
    inCard.append(opts);
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px';
    wrap.append(inCard, out);
    async function rerun() { if (!wrap.isConnected) return; PG.rerender(); }
    out.append(el('p', 'fx-ql-note', `Downloading prices and simulating ${PATHS.toLocaleString()} futures…`));
    let r; try { r = await sim(); } catch (e) { out.replaceChildren(el('p', 'fx-ql-note', e.message || 'Price history is unavailable right now.')); return; }
    if (!out.isConnected) return; out.replaceChildren();
    if (r.symbolsMissing.length) out.append(el('p', 'fx-ql-note', `No price history for ${r.symbolsMissing.join(', ')}; simulated without them.`));
    kpis(out, [[`VALUE AT RISK ${Math.round(V.conf * 100)}%`, money(-r.VaR), `${pct(r.VaR / r.value)} over ${V.horizon} day${V.horizon > 1 ? 's' : ''}`, '#ffb000'], ['EXPECTED SHORTFALL', money(-r.es), 'average loss beyond VaR', '#ff5a4f'], ['MEDIAN OUTCOME', money(r.median), 'half of futures do better'], ['GOOD CASE (95TH)', money(r.best), '1 in 20 futures beat this'], ['P(LOSS > 10%)', pct(r.probLoss10, 1), `of ${PATHS.toLocaleString()} paths`]]);
    const split = el('div', 'fx-ql-split'), c1 = el('div', 'fx-ql-card'), c2 = el('div', 'fx-ql-card');
    c1.append(el('h3', '', `DISTRIBUTION OF ${PATHS.toLocaleString()} OUTCOMES`)); const hb = el('div', 'fx-ql-chart'); hb.style.height = '260px'; c1.append(hb);
    c1.append(el('p', 'fx-ql-note', `Red bars are the worst ${Math.round((1 - V.conf) * 100)}% of futures. The amber line is the VaR: the loss you should exceed only ${Math.round((1 - V.conf) * 100)} times in 100. The red dotted line is the Expected Shortfall, the average of those bad cases.`));
    c2.append(el('h3', '', 'PATH OF RETURNS')); const fb = el('div', 'fx-ql-chart'); fb.style.height = '260px'; c2.append(fb);
    const wt = el('table', 'fx-ql-tbl'), hr = el('tr'); hr.append(el('th', '', 'ASSET'), el('th', '', 'WEIGHT'), el('th', '', 'ANN. VOL')); wt.append(hr);
    r.A.symbols.forEach((s, i) => { let m = 0, v = 0; const a = r.A.rets[i]; for (const x of a) m += x; m /= a.length; for (const x of a) v += (x - m) ** 2; const tr = el('tr'); tr.append(el('td', '', s), el('td', '', pct(r.w[i], 1)), el('td', '', pct(Math.sqrt(v / (a.length - 1) * (s.endsWith('-USD') ? 365 : 252)), 1))); wt.append(tr); });
    c2.append(wt);
    split.append(c1, c2); out.append(split);
    const bc = el('div', 'fx-ql-card'); bc.append(el('h3', '', 'DID REALITY BEAT THE MODEL? (1-DAY VAR BACKTEST)'));
    const btTabs = el('div', 'fx-ql-row'); let which = 'hs';
    const bb = el('div', 'fx-ql-chart'); bb.style.height = '240px';
    const vbox = el('div');
    const show = k => { which = k; [...btTabs.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); backtestChart(bb, r, k); vbox.replaceChildren(verdict(k === 'hs' ? r.hs : r.pn, k === 'hs' ? 'Historical simulation' : 'Normal (parametric)')); };
    for (const [k, l] of [['hs', 'Historical simulation'], ['pn', 'Normal (parametric)']]) { const b = btn(l, 'fx-ql-btn', () => show(k)); b.dataset.k = k; btTabs.append(b); }
    bc.append(btTabs, bb, vbox, el('p', 'fx-ql-note', `Each day, the model's 1-day VaR is estimated from the previous 250 trading days only, then compared with that day's real return. Red bars are the days reality was worse. A good model misses about ${Math.round((1 - V.conf) * 100)}% of days; the Kupiec test checks whether the miss rate is statistically different from that.`));
    out.append(bc);
    const how = el('div', 'fx-ql-card'); how.append(el('h3', '', 'METHOD'));
    for (const t of [`Daily log returns from ${r.A.dates[0]} to ${r.A.dates.at(-1)} (${r.A.dates.length} common trading days, Yahoo Finance adjusted closes).`, 'Normal: correlated daily returns drawn from the mean and covariance (Cholesky factor). Fat tails: the same correlation with a multivariate Student-t (4 degrees of freedom), which gives more extreme days. Bootstrap: whole historical days drawn at random, keeping real cross-asset moves.', `Each of the ${PATHS.toLocaleString()} paths compounds ${V.horizon} day${V.horizon > 1 ? 's' : ''} and the portfolio is revalued at the end. Random numbers are seeded, so the same inputs give the same answer.`, 'A model, not a guarantee: VaR says nothing about how bad the worst days beyond it can be, and history may not repeat.']) how.append(el('p', 'fx-ql-note', t));
    out.append(how);
    requestAnimationFrame(() => { histogram(hb, r, {big: true}); fanChart(fb, r); show(which); });
  }

  /* --- register --------------------------------------------------------------------------------------- */
  T.PANELS.panic = ['PANIC', 'Market panic detector', 'panic'];
  T.PANELS.mcvar = ['MCVAR', 'Portfolio risk simulator', 'risksim'];
  T.PANEL_DESC.panic = '50 stocks: rolling correlations, eigenvalue and network';
  T.PANEL_DESC.mcvar = '10,000 Monte Carlo futures, VaR and a backtest';
  T.LINK_LABEL.panic = 'Full'; T.LINK_LABEL.risksim = 'Full';
  T.RENDER.panic = renderPanic; T.RENDER.mcvar = renderMcvar;
  T.TABBED.add('mcvar');
  T.EXTRA_GROUPS.push(['Quant lab', ['oflow', 'panic', 'mcvar']]);
  if (PG) { PG.add('panic', 'Market panic detector', renderPanicPage); PG.add('risksim', 'Portfolio risk simulator', renderMcvarPage); PG.add('mcvar', 'Portfolio risk simulator', renderMcvarPage); T.PAGE_NAMES.push('PANIC', 'RISKSIM', 'MCVAR'); }
  // QUANT desk: order flow, panic detector and risk simulator side by side, plus the risk and crypto boxes.
  if (T.DESK_DEFS && !T.DESK_DEFS.quant) {
    T.DESK_DEFS.quant = {...T.DESK_DEFS.all, label: 'QUANT', noun: 'Quant lab', who: 'quant traders', slots: ['oflow', 'panic', 'mcvar', 'vix', 'heat', 'intel', 'top'],
      grid: {cols: '1fr 1fr 1fr 1fr 1fr 1fr', areas: ['s1 s1 s1 s2 s2 s2', 's1 s1 s1 s2 s2 s2', 's3 s3 s4 s5 s6 s7']}};
    const wi = T.DESK_ORDER.indexOf('world'); T.DESK_ORDER.splice(wi >= 0 ? wi + 1 : 1, 0, 'quant');
  }
  T.QuantLab = {loadCloses, alignedReturns, quantile, erfc, cholesky, topEigen};
});
