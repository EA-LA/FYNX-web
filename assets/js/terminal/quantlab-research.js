/* FYNX Terminal plugin: Quant Lab research tools, built on real Yahoo Finance prices via the FYNX market proxy.
 *
 * VCLUST  Volatility clustering detector. Autocorrelation of returns vs absolute returns (Mandelbrot; Cont 2001),
 *         Ljung–Box tests, power-law decay of |r| autocorrelation, GARCH(1,1) fitted by maximum likelihood
 *         (Bollerslev 1986), persistence, half-life, conditional volatility now vs long run and a forecast curve.
 * ISEAS   Intraday seasonality map (Andersen & Bollerslev 1997). Weekday × hour volatility and volume heatmaps from
 *         two years of hourly bars, the 5-minute time-of-day profile from 60 days of bars, and the periodicity
 *         filter: autocorrelation of 5-minute |r| before and after dividing out the time-of-day pattern.
 * FACTOR  Factor neutrality check (Fama & French 1993). Regresses a portfolio's daily returns on long–short ETF
 *         factor proxies (market, size, value, term, credit, plus momentum, quality and low volatility) with
 *         Newey–West t-stats, variance attribution, rolling betas, per-holding exposures and hedge trades.
 * RMOM    Regime-dependent momentum (Daniel & Moskowitz 2016). 12-1 month cross-sectional momentum, winners minus
 *         losers, split by bear/bull market and high/low volatility, the crash state, and vol-scaled and
 *         regime-aware versions of the strategy.
 * Everything is computed in the browser from downloaded prices; history and statistics, not forecasts or advice. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {el, btn, svg, $, panel, setText, store, empty, finite, report} = T;
  const QL = T.QuantLab;
  if (!QL) return;
  const {loadCloses, quantile, erfc, cholesky, kpis, UNIVERSE} = QL;
  // Browser network errors ('Failed to fetch', Safari 'Load failed', timeouts) are not useful to read; show the plain fallback instead.
  const why = (e, fb) => { const m = (e && e.message) || ''; return !m || /failed to fetch|load failed|networkerror|network request|aborted|timed? ?out/i.test(m) ? fb : m; };
  const SYM_RE = /^[A-Z0-9.\-=^&]{1,24}$/;
  const pct = (v, d = 1) => finite(v) ? (v * 100).toFixed(d) + '%' : '—';
  const spct = (v, d = 1) => finite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + '%' : '—';
  const num = (v, d = 2) => finite(v) ? (v < 0 ? '−' : '') + Math.abs(v).toFixed(d) : '—';
  const money = v => (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString();
  const annOf = s => /-USD$/.test(s) ? 365 : 252;
  const MONO = 'IBM Plex Mono, monospace';

  /* --- statistics ------------------------------------------------------------------------------------- */
  const mean = a => { let s = 0; for (const x of a) s += x; return s / a.length; };
  const sd = a => { const m = mean(a); let s = 0; for (const x of a) s += (x - m) ** 2; return Math.sqrt(s / Math.max(1, a.length - 1)); };
  function acf(x, maxLag) {
    const n = x.length, m = mean(x); let v = 0; for (const a of x) v += (a - m) ** 2;
    const out = new Float64Array(maxLag + 1); out[0] = 1;
    for (let k = 1; k <= maxLag; k++) { let s = 0; for (let t = k; t < n; t++) s += (x[t] - m) * (x[t - k] - m); out[k] = s / v; }
    return out;
  }
  // Regularized upper incomplete gamma Q(a, x) for chi-square p-values (Numerical Recipes series / continued fraction).
  function lgamma(z) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const q of c) s += q / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
  function gammaQ(a, x) {
    if (x <= 0) return 1;
    if (x < a + 1) { let sum = 1 / a, del = sum, ap = a; for (let i = 0; i < 300; i++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; } return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - lgamma(a))); }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 300; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break; }
    return Math.min(1, Math.exp(-x + a * Math.log(x) - lgamma(a)) * h);
  }
  const chi2p = (q, df) => gammaQ(df / 2, q / 2);
  function ljungBox(rho, n, m) { let q = 0; for (let k = 1; k <= m; k++) q += rho[k] ** 2 / (n - k); q *= n * (n + 2); return {q, p: chi2p(q, m)}; }
  const pFmt = p => !finite(p) ? '—' : p < 1e-4 ? '< 0.0001' : p.toFixed(4);
  function nelderMead(f, x0, {iters = 400, step = 0.5, tol = 1e-9} = {}) {
    const n = x0.length; let pts = [x0.slice()]; for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step; pts.push(p); }
    let vals = pts.map(f);
    for (let it = 0; it < iters; it++) {
      const ord = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]); pts = ord.map(i => pts[i]); vals = ord.map(i => vals[i]);
      if (Math.abs(vals[n] - vals[0]) < tol * (Math.abs(vals[0]) + tol)) break;
      const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
      const at = t => c.map((cj, j) => cj + t * (pts[n][j] - cj));
      const xr = at(-1), fr = f(xr);
      if (fr < vals[0]) { const xe = at(-2), fe = f(xe); if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; } }
      else if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; }
      else { const xc = at(fr < vals[n] ? -0.5 : 0.5), fc = f(xc); if (fc < Math.min(fr, vals[n])) { pts[n] = xc; vals[n] = fc; } else { for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j])); vals[i] = f(pts[i]); } } }
    }
    const b = vals.indexOf(Math.min(...vals)); return {x: pts[b], f: vals[b]};
  }
  // GARCH(1,1) with variance targeting, Gaussian quasi-likelihood. Input in percent units for numerical stability.
  function garch(r) {
    const m = mean(r), x = r.map(v => (v - m) * 100), n = x.length; let s2 = 0; for (const v of x) s2 += v * v; s2 /= n;
    const sig = z => 1 / (1 + Math.exp(-z));
    const unpack = ([a, b]) => { const p = 0.9995 * sig(a), sh = sig(b); return {alpha: p * sh, beta: p * (1 - sh), pers: p}; };
    const nll = th => { const {alpha, beta, pers} = unpack(th), w = s2 * (1 - pers); let h = s2, L = 0; for (let t = 0; t < n; t++) { L += Math.log(h) + x[t] * x[t] / h; h = w + alpha * x[t] * x[t] + beta * h; if (!(h > 0)) return 1e12; } return 0.5 * L; };
    const fit = nelderMead(nll, [Math.log(0.97 / 0.03), Math.log(0.09 / 0.91)], {iters: 300, step: 0.6});
    const {alpha, beta, pers} = unpack(fit.x), w = s2 * (1 - pers);
    const h = new Float64Array(n + 1); h[0] = s2; for (let t = 0; t < n; t++) h[t + 1] = w + alpha * x[t] * x[t] + beta * h[t];
    return {alpha, beta, pers, omega: w, s2, h, mean: m, ll: -fit.f};
  }
  // Ordinary least squares with an intercept and Newey–West (HAC) standard errors.
  function ols(y, X, nwLag = 5) {
    const T_ = y.length, k = X.length + 1, row = t => { const r = new Float64Array(k); r[0] = 1; for (let j = 1; j < k; j++) r[j] = X[j - 1][t]; return r; };
    const XtX = new Float64Array(k * k), Xty = new Float64Array(k), rows = [];
    for (let t = 0; t < T_; t++) { const r = row(t); rows.push(r); for (let i = 0; i < k; i++) { Xty[i] += r[i] * y[t]; for (let j = 0; j < k; j++) XtX[i * k + j] += r[i] * r[j]; } }
    const L = cholesky(XtX, k); if (!L) return null;
    const solve = b => { const z = new Float64Array(k); for (let i = 0; i < k; i++) { let s = b[i]; for (let j = 0; j < i; j++) s -= L[i * k + j] * z[j]; z[i] = s / L[i * k + i]; } const x = new Float64Array(k); for (let i = k - 1; i >= 0; i--) { let s = z[i]; for (let j = i + 1; j < k; j++) s -= L[j * k + i] * x[j]; x[i] = s / L[i * k + i]; } return x; };
    const beta = solve(Xty), e = new Float64Array(T_); let sse = 0, my = mean(y), sst = 0;
    for (let t = 0; t < T_; t++) { let f = 0; for (let j = 0; j < k; j++) f += rows[t][j] * beta[j]; e[t] = y[t] - f; sse += e[t] ** 2; sst += (y[t] - my) ** 2; }
    const inv = new Float64Array(k * k); for (let i = 0; i < k; i++) { const u = new Float64Array(k); u[i] = 1; const c = solve(u); for (let j = 0; j < k; j++) inv[j * k + i] = c[j]; }
    const S = new Float64Array(k * k);
    for (let t = 0; t < T_; t++) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) S[i * k + j] += e[t] * e[t] * rows[t][i] * rows[t][j];
    for (let l = 1; l <= nwLag; l++) { const w = 1 - l / (nwLag + 1); for (let t = l; t < T_; t++) { const ee = e[t] * e[t - l]; for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) S[i * k + j] += w * ee * (rows[t][i] * rows[t - l][j] + rows[t - l][i] * rows[t][j]); } }
    const tmp = new Float64Array(k * k), cov = new Float64Array(k * k);
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { let s = 0; for (let m = 0; m < k; m++) s += inv[i * k + m] * S[m * k + j]; tmp[i * k + j] = s; }
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { let s = 0; for (let m = 0; m < k; m++) s += tmp[i * k + m] * inv[m * k + j]; cov[i * k + j] = s; }
    const se = Array.from({length: k}, (_, i) => Math.sqrt(Math.max(0, cov[i * k + i])));
    return {beta: [...beta], se, t: beta.map((b, i) => b / (se[i] || 1e-12)), r2: sst ? 1 - sse / sst : 0, resid: e, residSd: Math.sqrt(sse / Math.max(1, T_ - k)), n: T_};
  }

  /* --- small SVG charts --------------------------------------------------------------------------------- */
  function frame(box, aria, minH = 140) { const w = Math.max(240, box.clientWidth || 600), h = Math.max(minH, box.clientHeight || 220); return {w, h, s: svg('svg', {viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': aria})}; }
  const label = (s, x, y, t, o = {}) => { const e = svg('text', {x, y, fill: '#6f7c75', 'font-size': 9.5, 'font-family': MONO, ...o}); e.textContent = t; s.append(e); return e; };
  // Multi-line chart over a shared x index. series: [{v, color, width, dash, name, fill}]; xs: labels per index.
  function lineChart(box, {series, xs, yfmt = v => v.toFixed(2), zero = false, aria = 'Chart', lo, hi, shade = [], log = false, hline = []}) {
    const {w, h, s} = frame(box, aria), padL = 50, padR = 10, padT = series.some(x => x.name) ? 18 : 8, padB = 18, iw = w - padL - padR, ih = h - padT - padB;
    const N = Math.max(...series.map(x => x.v.length)); if (N < 2) { box.replaceChildren(); return; }
    const tf = v => log ? Math.log(v) : v; let all = series.flatMap(x => [...x.v].filter(finite)).map(tf); hline.forEach(l => all.push(tf(l.v)));
    let yl = finite(lo) ? tf(lo) : Math.min(...all), yh = finite(hi) ? tf(hi) : Math.max(...all); if (zero) { yl = Math.min(yl, 0); yh = Math.max(yh, 0); } if (yh === yl) { yh += 1; yl -= 1; } const pad = (yh - yl) * 0.04; yl -= pad; yh += pad;
    const X = i => padL + i / (N - 1) * iw, Y = v => padT + (yh - tf(v)) / (yh - yl) * ih;
    for (const sh of shade) s.append(svg('rect', {x: X(sh.from), y: padT, width: Math.max(1, X(sh.to) - X(sh.from)), height: ih, fill: sh.color || 'rgba(255,59,48,.10)'}));
    for (let k = 0; k <= 3; k++) { const v = yl + (yh - yl) * k / 3, vy = padT + (yh - v) / (yh - yl) * ih; s.append(svg('line', {x1: padL, x2: w - padR, y1: vy, y2: vy, stroke: '#1b2421'})); label(s, padL - 4, vy + 3, yfmt(log ? Math.exp(v) : v), {'text-anchor': 'end'}); }
    if (zero && !log) s.append(svg('line', {x1: padL, x2: w - padR, y1: Y(0), y2: Y(0), stroke: '#3a4742'}));
    for (const l of hline) s.append(svg('line', {x1: padL, x2: w - padR, y1: Y(l.v), y2: Y(l.v), stroke: l.color || '#3a4742', 'stroke-dasharray': '4 3'}));
    series.forEach(sr => {
      let d = '', pen = false; sr.v.forEach((v, i) => { if (!finite(v) || (log && v <= 0)) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; });
      if (sr.fill) s.append(svg('path', {d: d + `L${X(sr.v.length - 1)} ${Y(log ? Math.exp(yl) : yl)}L${X(0)} ${Y(log ? Math.exp(yl) : yl)}Z`, fill: sr.fill, stroke: 'none'}));
      s.append(svg('path', {d, fill: 'none', stroke: sr.color, 'stroke-width': sr.width || 1.4, 'stroke-dasharray': sr.dash || '', 'stroke-linejoin': 'round'}));
    });
    let lx = padL; series.filter(x => x.name).forEach(sr => { s.append(svg('rect', {x: lx, y: 4, width: 10, height: 3, fill: sr.color})); const t = label(s, lx + 14, 9, sr.name, {fill: '#aeb9b3'}); lx += 22 + sr.name.length * 6; });
    if (xs) [0, Math.floor((N - 1) / 2), N - 1].forEach((i, k) => label(s, X(i), h - 4, String(xs[i] ?? ''), {'text-anchor': ['start', 'middle', 'end'][k]}));
    box.replaceChildren(s);
  }
  // Grouped bars per lag (two series) with a ± band.
  function acfChart(box, a, b, band, {aria, names = ['Returns', '|Returns|'], colors = ['#7d8a83', '#ffb000'], step = 1} = {}) {
    const {w, h, s} = frame(box, aria), padL = 40, padR = 8, padT = 18, padB = 18, iw = w - padL - padR, ih = h - padT - padB, L = a.length - 1;
    const vals = [...a.slice(1), ...(b ? b.slice(1) : [])], hi = Math.max(band * 1.5, ...vals) * 1.05, lo = Math.min(-band * 1.5, ...vals) * 1.05;
    const X = k => padL + (k - 0.5) / L * iw, Y = v => padT + (hi - v) / (hi - lo) * ih, bw = Math.max(0.6, iw / L / (b ? 2.2 : 1.3));
    s.append(svg('rect', {x: padL, y: Y(band), width: iw, height: Y(-band) - Y(band), fill: 'rgba(91,141,239,.10)'}));
    s.append(svg('line', {x1: padL, x2: w - padR, y1: Y(0), y2: Y(0), stroke: '#3a4742'}));
    for (const v of [hi / 1.05, 0, lo / 1.05]) label(s, padL - 4, Y(v) + 3, v.toFixed(2), {'text-anchor': 'end'});
    for (let k = 1; k <= L; k++) {
      s.append(svg('rect', {x: X(k) - (b ? bw : bw / 2), y: Math.min(Y(0), Y(a[k])), width: bw, height: Math.abs(Y(a[k]) - Y(0)) || 0.5, fill: colors[0]}));
      if (b) s.append(svg('rect', {x: X(k), y: Math.min(Y(0), Y(b[k])), width: bw, height: Math.abs(Y(b[k]) - Y(0)) || 0.5, fill: colors[1]}));
    }
    [1, Math.round(L / 2), L].forEach((k, i) => label(s, X(k), h - 4, String(Math.round(k * step)), {'text-anchor': ['start', 'middle', 'end'][i]}));
    let lx = padL; names.slice(0, b ? 2 : 1).forEach((n, i) => { s.append(svg('rect', {x: lx, y: 4, width: 10, height: 6, fill: colors[i]})); label(s, lx + 14, 10, n, {fill: '#aeb9b3'}); lx += 24 + n.length * 6; });
    label(s, lx + 6, 10, `shaded = 95% noise band (±${band.toFixed(3)})`);
    box.replaceChildren(s);
  }
  // Heatmap. cells[r][c] = value or null; colour on a ratio scale around 1.0 (the average).
  function heatColor(v, lo = 0.4, hi = 2.2) {
    if (!finite(v)) return '#0b0f0e';
    const t = Math.max(0, Math.min(1, v < 1 ? 0.5 * (v - lo) / (1 - lo) : 0.5 + 0.5 * (v - 1) / (hi - 1)));
    const stops = [[0, [17, 39, 66]], [0.35, [36, 92, 120]], [0.5, [40, 52, 48]], [0.7, [201, 140, 20]], [0.85, [255, 120, 30]], [1, [255, 59, 48]]];
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], f = (t - a) / (b - a || 1); return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * f)).join(',')})`; }
    return 'rgb(255,59,48)';
  }
  function heatmap(box, {rows, cols, cells, title = v => v, now, aria, fmt = v => v.toFixed(2) + '×', small = false, scale}) {
    const {w, h, s} = frame(box, aria, small ? 120 : 200), padL = 34, padT = 6, padB = 16, padR = 4, cw = (w - padL - padR) / cols.length, ch = (h - padT - padB) / rows.length;
    rows.forEach((rn, r) => {
      label(s, padL - 4, padT + (r + 0.5) * ch + 3, rn, {'text-anchor': 'end'});
      cols.forEach((cn, c) => {
        const v = cells[r][c], rect = svg('rect', {x: padL + c * cw + 0.5, y: padT + r * ch + 0.5, width: Math.max(0.5, cw - 1), height: Math.max(0.5, ch - 1), fill: scale ? scale(v) : heatColor(v), rx: 1.5});
        const tt = svg('title'); tt.textContent = finite(v) ? title(v, r, c) : `${rn} ${cn}: not enough data`; rect.append(tt); s.append(rect);
        if (!small && finite(v) && cw > 26 && ch > 14) label(s, padL + (c + 0.5) * cw, padT + (r + 0.5) * ch + 3, fmt(v), {'text-anchor': 'middle', fill: v > 1.35 || v < 0.6 ? '#fff' : '#d7dfda', 'font-size': Math.min(10, cw / 4.2)});
        if (now && now[0] === r && now[1] === c) s.append(svg('rect', {x: padL + c * cw + 0.5, y: padT + r * ch + 0.5, width: cw - 1, height: ch - 1, fill: 'none', stroke: '#fff', 'stroke-width': 2, rx: 2}));
      });
    });
    const every = Math.max(1, Math.ceil(cols.length / Math.floor((w - padL) / 34)));
    cols.forEach((cn, c) => { if (c % every === 0) label(s, padL + (c + 0.5) * cw, h - 4, cn, {'text-anchor': 'middle'}); });
    box.replaceChildren(s);
  }
  function legendScale(lo = '0.4× quiet', hi = '2.2× wild') { const d = el('div', 'fx-qr-scale'); d.append(el('span', '', lo), el('i'), el('span', '', hi)); return d; }
  const card = (title, ...kids) => { const c = el('div', 'fx-ql-card'); c.append(el('h3', '', title), ...kids); return c; };
  const chartBox = (h = 240) => { const b = el('div', 'fx-ql-chart'); b.style.height = h + 'px'; b.style.flex = 'none'; return b; };
  const note = t => el('p', 'fx-ql-note', t);
  function chips(list, current, on) { const r = el('div', 'fx-ql-row'); for (const [k, l] of list) { const b = btn(l, 'fx-ql-btn' + (k === current ? ' on' : ''), () => on(k)); r.append(b); } return r; }
  function symbolBox(current, on, placeholder = 'Any symbol, e.g. NVDA, ES=F, EURUSD=X') {
    const f = el('form', 'fx-ql-row'), i = el('input', 'sym'); i.value = current; i.placeholder = placeholder; i.setAttribute('aria-label', 'Symbol'); i.style.width = '220px';
    f.append(i, btn('Analyze', 'fx-ql-btn pri')); f.addEventListener('submit', e => { e.preventDefault(); const v = i.value.trim().toUpperCase(); if (!SYM_RE.test(v)) return T.say('Enter a valid symbol.'); on(v); });
    return f;
  }
  const st = el('style'); st.id = 'fx-quant-research-style';
  st.textContent = `
.fx-qr-scale{display:flex;align-items:center;gap:8px;font:600 10px 'IBM Plex Mono',monospace;color:var(--mu)}
.fx-qr-scale i{flex:0 0 160px;height:8px;border-radius:4px;background:linear-gradient(90deg,rgb(17,39,66),rgb(36,92,120),rgb(40,52,48),rgb(201,140,20),rgb(255,120,30),rgb(255,59,48))}
.fx-qr-mini{width:100%;border-collapse:collapse;font:500 11.5px 'IBM Plex Mono',monospace}
.fx-qr-mini td,.fx-qr-mini th{padding:4px 6px;border-top:1px solid var(--ln);text-align:right;white-space:nowrap}
.fx-qr-mini th{color:var(--mu);font-size:9.5px;font-weight:600;letter-spacing:.06em}
.fx-qr-mini td:first-child,.fx-qr-mini th:first-child{text-align:left}
.fx-qr-mini tr.go{cursor:pointer}.fx-qr-mini tr.go:hover td{background:#101715}
.fx-qr-bar{position:relative;display:inline-block;width:70px;height:8px;background:#141c19;vertical-align:middle;border-radius:2px;overflow:hidden}
.fx-qr-bar i{position:absolute;top:0;bottom:0;border-radius:2px}
.fx-qr-bar b{position:absolute;top:-2px;bottom:-2px;left:50%;width:1px;background:#4b5953}
.fx-qr-pill{display:inline-block;padding:1px 6px;border-radius:2px;font:700 10px 'IBM Plex Mono',monospace;letter-spacing:.05em}
.fx-qr-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
.fx-qr-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.fx-qr-list{margin:0;padding-left:16px;color:var(--tx);font-size:12px;line-height:1.6}
@media (max-width:900px){.fx-qr-two,.fx-qr-three{grid-template-columns:1fr}}`;
  document.head.append(st);
  const pill = (text, color) => { const p = el('span', 'fx-qr-pill', text); p.style.background = color + '22'; p.style.color = color; p.style.border = '1px solid ' + color + '66'; return p; };
  function betaBar(v, scale = 1.5, cols = ['#3ecf8e', '#ff5a4f']) { const b = el('span', 'fx-qr-bar'), i = el('i'), z = el('b'); const f = Math.max(-1, Math.min(1, v / scale)) * 50; i.style.left = (f < 0 ? 50 + f : 50) + '%'; i.style.width = Math.abs(f) + '%'; i.style.background = v >= 0 ? cols[0] : cols[1]; b.append(i, z); return b; }
  function series1(d, sym) { const m = d.series.get(sym); if (!m || m.size < 120) return null; const dates = [...m.keys()].sort(), px = dates.map(k => m.get(k)); const r = new Float64Array(px.length - 1); for (let i = 1; i < px.length; i++) r[i - 1] = Math.log(px[i] / px[i - 1]); return {dates: dates.slice(1), px: px.slice(1), r}; }

  /* ================================= VCLUST: volatility clustering =================================== */
  const VSCAN = [['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['IWM', 'Russell 2000'], ['TLT', '20Y Treasuries'], ['GLD', 'Gold'], ['CL=F', 'Crude oil'], ['EURUSD=X', 'EUR/USD'], ['USDJPY=X', 'USD/JPY'], ['BTC-USD', 'Bitcoin'], ['ETH-USD', 'Ether'], ['NVDA', 'Nvidia']];
  let vSym = (() => { const v = store.get('vclust-sym'); return v && SYM_RE.test(v) ? v : 'SPY'; })();
  const vCache = new Map();
  function vAnalyze(s, sym) {
    const r = [...s.r], n = r.length, A = annOf(sym), L = Math.min(100, Math.floor(n / 5));
    const ar = r.map(Math.abs), r2 = r.map(v => v * v);
    const rho = acf(r, L), rhoAbs = acf(ar, L), rhoSq = acf(r2, L), band = 1.96 / Math.sqrt(n);
    const lbR = ljungBox(rho, n, 20), lbA = ljungBox(rhoAbs, n, 20);
    let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0; for (let k = 1; k <= L; k++) if (rhoAbs[k] > 0) { const x = Math.log(k), y = Math.log(rhoAbs[k]); sx += x; sy += y; sxx += x * x; sxy += x * y; m++; }
    const decay = m > 5 ? -(m * sxy - sx * sy) / (m * sxx - sx * sx) : NaN, decayC = m > 5 ? Math.exp((sy + decay * sx) / m) : NaN;
    const sigLag = (rhoAbs.slice(1).findIndex(v => v < band) + 1) || L;
    const g = garch(r), vNow = Math.sqrt(g.h[n] * A) / 100, vLong = Math.sqrt(g.s2 * A) / 100, ratio = vNow / vLong;
    const halfLife = g.pers < 1 ? Math.log(0.5) / Math.log(g.pers) : Infinity;
    const fc = Array.from({length: 63}, (_, k) => Math.sqrt((g.s2 + g.pers ** k * (g.h[n] - g.s2)) * A) / 100);
    const sorted = ar.slice().sort((a, b) => a - b), q90 = quantile(sorted, 0.9); let big = 0, bigBig = 0, small = 0, smallBig = 0;
    for (let t = 0; t < n - 1; t++) { if (ar[t] >= q90) { big++; if (ar[t + 1] >= q90) bigBig++; } else { small++; if (ar[t + 1] >= q90) smallBig++; } }
    const condVol = Array.from(g.h.slice(0, n), v => Math.sqrt(v) / 100); // conditional sd of each day's return, known the day before
    const state = ratio >= 1.3 ? ['HIGH-VOL CLUSTER', '#ff5a4f'] : ratio <= 0.8 ? ['CALM CLUSTER', '#3ecf8e'] : ['NORMAL', '#ffb000'];
    return {sym, n, A, L, rho, rhoAbs, rhoSq, band, lbR, lbA, decay, decayC, sigLag, g, vNow, vLong, ratio, halfLife, fc, pBig: big ? bigBig / big : NaN, pSmall: small ? smallBig / small : NaN, condVol, r, dates: s.dates, state};
  }
  async function vLoad(sym, range = '10y') {
    const k = sym + range; if (vCache.has(k)) return vCache.get(k);
    const d = await loadCloses([sym], range); const s = series1(d, sym);
    if (!s) throw new Error(d.failed?.[sym] === 'No data for this symbol.' ? `No price history for ${sym}.` : `Not enough price history for ${sym}.`);
    const out = vAnalyze(s, sym); vCache.set(k, out); return out;
  }
  let vScan = null, vScanP = null;
  async function vScanAll() {
    if (vScan) return vScan; if (vScanP) return vScanP;
    vScanP = loadCloses(VSCAN.map(x => x[0]), '5y').then(d => { const out = []; for (const [s, name] of VSCAN) { const x = series1(d, s); if (!x) continue; try { out.push({...vAnalyze(x, s), name}); } catch (_) {} } vScan = out; return out; }).finally(() => { vScanP = null; });
    return vScanP;
  }
  function vScanTable(list, {compact = false} = {}) {
    const t = el('table', 'fx-qr-mini'), hr = el('tr'); for (const h of compact ? ['MARKET', 'VOL NOW', 'VS NORMAL', 'α+β', 'HALF-LIFE'] : ['MARKET', 'VOL NOW (GARCH)', 'LONG-RUN VOL', 'NOW VS NORMAL', 'PERSISTENCE α+β', 'HALF-LIFE', 'P(BIG→BIG)', 'STATE']) hr.append(el('th', '', h)); t.append(hr);
    for (const a of list.slice().sort((x, y) => y.ratio - x.ratio)) {
      const tr = el('tr', 'go'), bar = betaBar(a.ratio - 1, 1, ['#ff5a4f', '#5b8def']); tr.title = `Open ${a.sym} in the volatility clustering detector`;
      tr.addEventListener('click', () => { vSym = a.sym; store.set('vclust-sym', vSym); T.openPage('vclust', a.sym); });
      const ratioCell = el('td'); ratioCell.append(bar, el('span', '', ' ' + a.ratio.toFixed(2) + '×'));
      const cells = compact ? [el('td', '', a.name || a.sym), el('td', '', pct(a.vNow)), ratioCell, el('td', '', a.g.pers.toFixed(3)), el('td', '', a.halfLife < 999 ? Math.round(a.halfLife) + 'd' : '∞')]
        : [el('td', '', `${a.name || a.sym} · ${a.sym}`), el('td', '', pct(a.vNow)), el('td', '', pct(a.vLong)), ratioCell, el('td', '', a.g.pers.toFixed(3)), el('td', '', a.halfLife < 999 ? Math.round(a.halfLife) + ' days' : '∞'), el('td', '', pct(a.pBig, 0)), (() => { const c = el('td'); c.append(pill(a.state[0], a.state[1])); return c; })()];
      cells[0].style.color = a.state[1]; tr.append(...cells); t.append(tr);
    }
    return t;
  }
  async function renderVclust() {
    const host = panel('vclust'); empty(host, 'Fitting GARCH to 11 markets…');
    let list; try { list = await vScanAll(); } catch (e) { report('vclust', e); return empty(host, 'Price history is unavailable right now.'); }
    if (!$('tp-vclust')) return; host.replaceChildren();
    if (!list.length) return empty(host, 'Price history is unavailable right now.');
    const hot = list.filter(a => a.ratio >= 1.3).length, calm = list.filter(a => a.ratio <= 0.8).length;
    setText('n-vclust', `${hot} hot · ${calm} calm`);
    const w = el('div', 'fx-ql'); host.append(w);
    const hd = el('div', 'fx-ql-head'); hd.append(el('span', 'fx-ql-state', hot ? `${hot} IN HIGH-VOL CLUSTERS` : 'NO HOT CLUSTERS'), el('span', 'fx-ql-sub', 'GARCH(1,1) volatility now vs each market’s long-run level'));
    hd.firstChild.style.color = hot ? '#ff5a4f' : '#3ecf8e'; hd.firstChild.style.fontSize = '14px';
    w.append(hd, vScanTable(list, {compact: true}), note('Large moves follow large moves: when α+β is near 1 a volatility shock fades slowly. Click a market for the full test.'));
  }
  async function renderVclustPage(host, arg) {
    if (arg && SYM_RE.test(String(arg).toUpperCase())) { vSym = String(arg).toUpperCase(); store.set('vclust-sym', vSym); }
    PG.setHead('VCLUST', 'Volatility clustering detector', `${vSym} · do big moves follow big moves? Autocorrelation, Ljung–Box and GARCH(1,1) on 10 years of daily returns`);
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap);
    const go = s => { vSym = s; store.set('vclust-sym', s); PG.rerender(); };
    wrap.append(symbolBox(vSym, go), chips(VSCAN, vSym, go));
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(out);
    out.append(note(`Downloading 10 years of ${vSym} and fitting the model…`));
    let a; try { a = await vLoad(vSym); } catch (e) { out.replaceChildren(note(why(e, 'Price history is unavailable right now.'))); return; }
    if (!out.isConnected) return; out.replaceChildren();
    const hd = el('div', 'fx-ql-head'), sp = el('span', 'fx-ql-state', a.state[0]); sp.style.color = a.state[1];
    hd.append(sp, el('span', 'fx-ql-sub', `${a.sym} volatility is ${a.ratio.toFixed(2)}× its long-run level. ${a.ratio >= 1.3 ? 'A shock is still echoing; expect bigger daily swings than usual for a while.' : a.ratio <= 0.8 ? 'A quiet spell; quiet tends to persist, but calm clusters end abruptly.' : 'Volatility is near its normal level.'}`));
    out.append(hd);
    kpis(out, [['VOL NOW (GARCH)', pct(a.vNow), 'annualized, tomorrow', a.state[1]], ['LONG-RUN VOL', pct(a.vLong), `${a.dates[0].slice(0, 4)}–${a.dates.at(-1).slice(0, 4)}`],
      ['PERSISTENCE α+β', a.g.pers.toFixed(4), `α ${a.g.alpha.toFixed(3)} · β ${a.g.beta.toFixed(3)}`, a.g.pers > 0.97 ? '#ffb000' : null], ['SHOCK HALF-LIFE', a.halfLife < 999 ? Math.round(a.halfLife) + ' days' : '∞', 'time for half a vol shock to fade'],
      ['P(BIG → BIG)', pct(a.pBig, 0), `vs ${pct(a.pSmall, 0)} after a normal day · base 10%`, a.pBig > 0.2 ? '#ff5a4f' : null], ['LJUNG–BOX |r|', a.lbA.q.toFixed(0), `p ${pFmt(a.lbA.p)} · returns p ${pFmt(a.lbR.p)}`, a.lbA.p < 0.01 ? '#ff5a4f' : '#3ecf8e']]);
    const verdict = el('div', 'fx-ql-verdict'), clustered = a.lbA.p < 0.01 && a.rhoAbs[1] > a.band;
    verdict.style.borderColor = clustered ? '#ff5a4f' : '#3ecf8e';
    verdict.textContent = clustered
      ? `Volatility clustering detected. Daily returns themselves are ${a.lbR.p < 0.01 ? 'only weakly' : 'not'} predictable (lag-1 autocorrelation ${num(a.rho[1], 3)}), but their size is: the autocorrelation of |returns| is ${num(a.rhoAbs[1], 3)} at lag 1 and stays above the noise band for ${a.sigLag >= a.L ? `all ${a.L}` : a.sigLag} trading days, decaying like a power law (exponent ${num(a.decay, 2)}${a.decay < 1 ? ', slow enough to count as long memory' : ''}). After a top-10% day, the next day was also a top-10% day ${pct(a.pBig, 0)} of the time, against 10% by chance.`
      : `No significant clustering in this sample: the autocorrelation of |returns| is ${num(a.rhoAbs[1], 3)} at lag 1 with Ljung–Box p = ${pFmt(a.lbA.p)}.`;
    out.append(verdict);
    const c1 = chartBox(260); out.append(card('DAILY RETURNS AND THE GARCH ±2σ ENVELOPE (LAST 3 YEARS)', c1, note('Grey bars are daily returns. The amber band is ±2 conditional standard deviations from the fitted GARCH(1,1): it widens after big moves and narrows in calm spells, which is what clustering looks like.')));
    const two = el('div', 'fx-qr-two'), c2 = chartBox(240), c3 = chartBox(240);
    two.append(card('AUTOCORRELATION: RETURNS VS |RETURNS|', c2, note(`Lag in trading days. Returns (grey) sit inside the noise band, so direction is hard to predict. |Returns| (amber) stay positive for months: size is predictable.`)),
      card('VOLATILITY FORECAST (NEXT 63 DAYS)', c3, note(`From today’s ${pct(a.vNow)} toward the long-run ${pct(a.vLong)} at the speed set by α+β = ${a.g.pers.toFixed(3)}.`)));
    out.append(two);
    const two2 = el('div', 'fx-qr-two'), c4 = chartBox(220), c5 = chartBox(220);
    two2.append(card('CONDITIONAL VOLATILITY (ANNUALIZED, 10 YEARS)', c4), card('POWER-LAW DECAY OF |r| AUTOCORRELATION (LOG–LOG)', c5, note(`If the dots fall on a straight line, correlation decays like lag^−${num(a.decay, 2)} instead of exponentially: the long-range dependence described by Cont.`)));
    out.append(two2);
    const scanCard = card('CROSS-MARKET SCAN (5 YEARS)', note('Fitting 11 markets…')); out.append(scanCard);
    out.append(card('METHOD', ...[`${a.n.toLocaleString()} daily log returns of ${a.sym} from ${a.dates[0]} to ${a.dates.at(-1)} (Yahoo Finance adjusted closes).`, 'Autocorrelation ρ(k) of returns, absolute returns and squared returns for lags 1–' + a.L + '. The 95% noise band is ±1.96/√N. Ljung–Box Q(20) tests whether the first 20 autocorrelations are jointly zero (χ² with 20 degrees of freedom).', 'GARCH(1,1): σ²(t+1) = ω + α·r²(t) + β·σ²(t), fitted by Gaussian quasi-maximum likelihood with variance targeting (ω = long-run variance × (1 − α − β)). Half-life = ln ½ / ln(α+β).', 'Stylized facts: Mandelbrot (1963); Cont, “Empirical properties of asset returns” (2001) and “Long range dependence in financial markets” (2005); Bollerslev (1986).'].map(note)));
    requestAnimationFrame(() => {
      const k0 = Math.max(0, a.n - 756), xs = a.dates.slice(k0), ret = Array.from(a.r.slice(k0)), up = a.condVol.slice(k0).map((v, i) => a.g.mean + 2 * v), dn = a.condVol.slice(k0).map(v => a.g.mean - 2 * v);
      const {w, h, s} = frame(c1, 'Daily returns with GARCH plus or minus two sigma envelope'), padL = 50, padR = 10, padT = 8, padB = 18, iw = w - padL - padR, ih = h - padT - padB, N = ret.length;
      const hi = Math.max(...up, ...ret), lo = Math.min(...dn, ...ret), X = i => padL + i / (N - 1) * iw, Y = v => padT + (hi - v) / (hi - lo) * ih;
      let d = ''; up.forEach((v, i) => d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)); for (let i = N - 1; i >= 0; i--) d += 'L' + X(i).toFixed(1) + ' ' + Y(dn[i]).toFixed(1);
      s.append(svg('path', {d: d + 'Z', fill: 'rgba(255,176,0,.12)', stroke: 'rgba(255,176,0,.55)', 'stroke-width': 0.8}));
      const bw = Math.max(0.5, iw / N - 0.2); ret.forEach((v, i) => { const out2 = v > up[i] || v < dn[i]; s.append(svg('rect', {x: X(i) - bw / 2, y: Math.min(Y(0), Y(v)), width: bw, height: Math.abs(Y(v) - Y(0)) || 0.4, fill: out2 ? '#ff5a4f' : '#8a9891', 'fill-opacity': out2 ? 1 : 0.7})); });
      for (const v of [lo, 0, hi]) label(s, padL - 4, Y(v) + 3, (v * 100).toFixed(1) + '%', {'text-anchor': 'end'});
      [0, Math.floor(N / 2), N - 1].forEach((i, k) => label(s, X(i), h - 4, xs[i], {'text-anchor': ['start', 'middle', 'end'][k]}));
      c1.replaceChildren(s);
      acfChart(c2, a.rho, a.rhoAbs, a.band, {aria: 'Autocorrelation of returns and absolute returns by lag'});
      lineChart(c3, {series: [{v: a.fc, color: '#ffb000', width: 2, name: 'Forecast vol'}, {v: a.fc.map(() => a.vLong), color: '#5b8def', dash: '4 3', name: 'Long-run'}], xs: a.fc.map((_, k) => 'day ' + (k + 1)), yfmt: v => (v * 100).toFixed(0) + '%', aria: 'GARCH volatility forecast'});
      lineChart(c4, {series: [{v: a.condVol.map(v => v * Math.sqrt(a.A)), color: '#ffb000', width: 1.2, fill: 'rgba(255,176,0,.08)'}], xs: a.dates, yfmt: v => (v * 100).toFixed(0) + '%', aria: 'Conditional volatility over ten years', hline: [{v: a.vLong, color: '#5b8def'}]});
      { const {w, h, s} = frame(c5, 'Log-log plot of absolute return autocorrelation against lag'), padL = 46, padR = 10, padT = 8, padB = 18, iw = w - padL - padR, ih = h - padT - padB;
        const pts = []; for (let k = 1; k <= a.L; k++) if (a.rhoAbs[k] > 0) pts.push([Math.log(k), Math.log(a.rhoAbs[k])]);
        if (pts.length > 3) { const xl = 0, xh = Math.log(a.L), yl = Math.min(...pts.map(p => p[1]), Math.log(a.band)) - 0.2, yh = Math.max(...pts.map(p => p[1])) + 0.2, X = v => padL + (v - xl) / (xh - xl) * iw, Y = v => padT + (yh - v) / (yh - yl) * ih;
          s.append(svg('line', {x1: padL, x2: w - padR, y1: Y(Math.log(a.band)), y2: Y(Math.log(a.band)), stroke: '#5b8def', 'stroke-dasharray': '4 3'}));
          pts.forEach(([x, y]) => s.append(svg('circle', {cx: X(x), cy: Y(y), r: 2.4, fill: '#ffb000', 'fill-opacity': 0.85})));
          if (finite(a.decay)) s.append(svg('line', {x1: X(0), y1: Y(Math.log(a.decayC)), x2: X(xh), y2: Y(Math.log(a.decayC) - a.decay * xh), stroke: '#fff', 'stroke-width': 1.2}));
          for (const k of [1, 10, 100]) if (Math.log(k) <= xh) label(s, X(Math.log(k)), h - 4, 'lag ' + k, {'text-anchor': 'middle'});
          for (const v of [yh, (yl + yh) / 2, yl]) label(s, padL - 4, Y(v) + 3, Math.exp(v).toFixed(3), {'text-anchor': 'end'});
          label(s, w - padR, padT + 10, `slope −${num(a.decay, 2)} · blue = noise band`, {'text-anchor': 'end', fill: '#aeb9b3'}); }
        c5.replaceChildren(s); }
    });
    vScanAll().then(list => { if (!scanCard.isConnected) return; scanCard.replaceChildren(el('h3', '', 'CROSS-MARKET SCAN (5 YEARS)'), vScanTable(list), note('Sorted by how far volatility now sits above each market’s own long-run level. Click a row to analyze it.')); }).catch(() => scanCard.replaceChildren(el('h3', '', 'CROSS-MARKET SCAN'), note('Unavailable right now.')));
  }

  /* ================================ ISEAS: intraday seasonality map ==================================== */
  const ISYMS = [['SPY', 'S&P 500 ETF'], ['ES=F', 'S&P futures'], ['NQ=F', 'Nasdaq futures'], ['EURUSD=X', 'EUR/USD'], ['GC=F', 'Gold'], ['CL=F', 'Crude'], ['BTC-USD', 'Bitcoin'], ['AAPL', 'Apple']];
  let iSym = (() => { const v = store.get('iseas-sym'); return v && SYM_RE.test(v) ? v : 'SPY'; })();
  const barCache = new Map();
  async function loadBars(symbol, interval) {
    const k = symbol + '|' + interval, hit = barCache.get(k); if (hit && Date.now() - hit.at < 1800000) return hit.data;
    const data = await T.fnMarket({op: 'bars', symbol, interval}, 30000); barCache.set(k, {at: Date.now(), data}); return data;
  }
  // Returns between consecutive bars only (no overnight or weekend gaps), tagged with the bar's local time.
  function intradayReturns(b, sec) {
    const out = []; for (let i = 1; i < b.c.length; i++) { if (b.t[i] - b.t[i - 1] > sec * 1.5) continue; const r = Math.log(b.c[i] / b.c[i - 1]); if (!finite(r)) continue; out.push({r, a: Math.abs(r), v: b.v[i] || 0, tod: b.tod[i], dow: b.dow[i], day: b.day[i], t: b.t[i]}); }
    return out;
  }
  const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  function localNow(tz) { try { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit'}).formatToParts(new Date()).map(x => [x.type, x.value])); return {dow: DOWS.indexOf(p.weekday), tod: (+p.hour % 24) * 60 + +p.minute, label: `${p.weekday} ${p.hour}:${p.minute}`}; } catch (_) { return null; } }
  const tzCity = tz => (tz || 'UTC').split('/').pop().replace(/_/g, ' ');
  function iAnalyzeHourly(b) {
    const R = intradayReturns(b, 3600); if (R.length < 200) return null;
    const avgA = mean(R.map(x => x.a)), avgV = mean(R.map(x => x.v)), hasVol = avgV > 0;
    const hours = [...new Set(R.map(x => Math.floor(x.tod / 60)))].sort((x, y) => x - y), days = [1, 2, 3, 4, 5, 6, 0].filter(d => R.some(x => x.dow === d));
    const cell = (d, h, f) => { const xs = R.filter(x => x.dow === d && Math.floor(x.tod / 60) === h); return xs.length >= 8 ? {v: f(xs), n: xs.length} : null; };
    const grid = f => days.map(d => hours.map(h => cell(d, h, f)));
    const vol = grid(xs => mean(xs.map(x => x.a)) / avgA), volu = hasVol ? grid(xs => mean(xs.map(x => x.v)) / avgV) : null;
    const byDow = days.map(d => { const xs = R.filter(x => x.dow === d); return mean(xs.map(x => x.a)) / avgA; });
    const flat = []; vol.forEach((row, r) => row.forEach((c, k) => { if (c) flat.push({r, k, v: c.v}); }));
    flat.sort((x, y) => y.v - x.v);
    return {R, avgA, hours, days, vol, volu, byDow, top: flat.slice(0, 3), bottom: flat.slice(-3).reverse(), first: b.day[0], last: b.day.at(-1)};
  }
  function iAnalyze5m(b) {
    const R = intradayReturns(b, 300); if (R.length < 300) return null;
    const avgA = mean(R.map(x => x.a)), avgV = mean(R.map(x => x.v)), hasVol = avgV > 0;
    const buckets = [...new Set(R.map(x => x.tod))].sort((x, y) => x - y), idx = new Map(buckets.map((m, i) => [m, i]));
    const sumA = new Float64Array(buckets.length), sumV = new Float64Array(buckets.length), cnt = new Float64Array(buckets.length), lists = buckets.map(() => []);
    for (const x of R) { const i = idx.get(x.tod); sumA[i] += x.a; sumV[i] += x.v; cnt[i]++; lists[i].push(x.a); }
    const keep = buckets.map((_, i) => cnt[i] >= 10);
    const prof = buckets.map((_, i) => keep[i] ? sumA[i] / cnt[i] / avgA : null), profV = hasVol ? buckets.map((_, i) => keep[i] ? sumV[i] / cnt[i] / avgV : null) : null;
    const p25 = lists.map((l, i) => keep[i] ? quantile(l.slice().sort((a, b) => a - b), 0.25) / avgA : null), p75 = lists.map((l, i) => keep[i] ? quantile(l.slice().sort((a, b) => a - b), 0.75) / avgA : null);
    // Andersen–Bollerslev periodicity filter: divide each |r| by its time-of-day factor.
    const seq = [], filt = []; for (let i = 1; i < b.c.length; i++) { if (b.t[i] - b.t[i - 1] > 450) continue; const r = Math.log(b.c[i] / b.c[i - 1]); if (!finite(r)) continue; const k = idx.get(b.tod[i]); const f = k !== undefined && prof[k] ? prof[k] : 1; seq.push(Math.abs(r)); filt.push(Math.abs(r) / f); }
    const perDay = Math.max(1, Math.round(R.length / new Set(R.map(x => x.day)).size)), L = Math.min(perDay * 3, Math.floor(seq.length / 4));
    return {buckets, prof, profV, p25, p75, perDay, acfRaw: acf(seq, L), acfFilt: acf(filt, L), band: 1.96 / Math.sqrt(seq.length), n: R.length, first: b.day[0], last: b.day.at(-1)};
  }
  async function iLoad(sym) { const [h, m] = await Promise.allSettled([loadBars(sym, '1h'), loadBars(sym, '5m')]); const H = h.status === 'fulfilled' ? h.value : null, M = m.status === 'fulfilled' ? m.value : null; if (!H && !M) throw (h.reason || m.reason || new Error('Intraday data is unavailable.')); return {H, M, h: H ? iAnalyzeHourly(H) : null, m: M ? iAnalyze5m(M) : null, tz: (H || M).timezone, name: (H || M).name}; }
  function nowCell(a, tz) { const n = localNow(tz); if (!n || !a) return {n}; const r = a.days.indexOf(n.dow), c = a.hours.indexOf(Math.floor(n.tod / 60)); const v = r >= 0 && c >= 0 ? a.vol[r][c] : null; return {n, rc: r >= 0 && c >= 0 ? [r, c] : null, v: v?.v}; }
  async function renderIseas() {
    const host = panel('iseas'); empty(host, `Loading ${iSym} intraday bars…`);
    let d; try { d = await iLoad(iSym); } catch (e) { report('iseas', e); return empty(host, why(e, 'Intraday data is unavailable right now.')); }
    if (!$('tp-iseas')) return; host.replaceChildren(); setText('n-iseas', iSym + ' · ' + tzCity(d.tz) + ' time');
    const w = el('div', 'fx-ql'); host.append(w);
    const sel = el('select'); sel.setAttribute('aria-label', 'Market'); for (const [k, l] of ISYMS) { const o = el('option', '', `${k} · ${l}`); o.value = k; if (k === iSym) o.selected = true; sel.append(o); } if (!ISYMS.some(x => x[0] === iSym)) { const o = el('option', '', iSym); o.value = iSym; o.selected = true; sel.prepend(o); }
    sel.addEventListener('change', () => { iSym = sel.value; store.set('iseas-sym', iSym); T.R('iseas'); });
    if (!d.h) { w.append(sel, note('Not enough hourly history for this market.')); return; }
    const nc = nowCell(d.h, d.tz), head = el('div', 'fx-ql-row'); head.append(sel, el('span', 'fx-ql-sub', nc.v ? `Now (${nc.n.label}): ${nc.v.toFixed(2)}× normal hourly vol` : `Now (${nc.n?.label || '—'}): market closed in this hour`));
    const hb = el('div', 'fx-ql-chart'); hb.style.minHeight = '120px';
    w.append(head, hb, legendScale());
    requestAnimationFrame(() => heatmap(hb, {rows: d.h.days.map(x => DOWS[x]), cols: d.h.hours.map(h => String(h).padStart(2, '0')), cells: d.h.vol.map(r => r.map(c => c?.v)), now: nc.rc, small: true, aria: `${iSym} volatility by weekday and hour`, title: (v, r, c) => `${DOWS[d.h.days[r]]} ${String(d.h.hours[c]).padStart(2, '0')}:00 ${tzCity(d.tz)} · ${v.toFixed(2)}× average |return|`}));
  }
  async function renderIseasPage(host, arg) {
    if (arg && SYM_RE.test(String(arg).toUpperCase())) { iSym = String(arg).toUpperCase(); store.set('iseas-sym', iSym); }
    PG.setHead('ISEAS', 'Intraday seasonality map', `${iSym} · when in the day and week does this market move? Andersen–Bollerslev intraday periodicity`);
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap);
    const go = s => { iSym = s; store.set('iseas-sym', s); PG.rerender(); };
    wrap.append(symbolBox(iSym, go), chips(ISYMS, iSym, go));
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(out); out.append(note(`Downloading ${iSym} hourly bars (2 years) and 5-minute bars (60 days)…`));
    let d; try { d = await iLoad(iSym); } catch (e) { out.replaceChildren(note(why(e, 'Intraday data is unavailable right now.'))); return; }
    if (!out.isConnected) return; out.replaceChildren();
    const H = d.h, M = d.m, city = tzCity(d.tz), nc = nowCell(H, d.tz);
    if (H) {
      const hd = el('div', 'fx-ql-head'), stt = el('span', 'fx-ql-state', nc.v ? (nc.v >= 1.3 ? 'HOT HOUR' : nc.v <= 0.7 ? 'QUIET HOUR' : 'TYPICAL HOUR') : 'CLOSED NOW'); stt.style.color = nc.v >= 1.3 ? '#ff5a4f' : nc.v <= 0.7 ? '#5b8def' : nc.v ? '#ffb000' : '#7d8a83';
      hd.append(stt, el('span', 'fx-ql-sub', `${d.name} · it is ${nc.n?.label || '—'} in ${city}. ${nc.v ? `Historically this hour moves ${nc.v.toFixed(2)}× the average hour.` : 'No regular trading recorded in this hour.'}`)); out.append(hd);
      const t = H.top[0], q = H.bottom[0];
      kpis(out, [['WILDEST HOUR', t ? `${DOWS[H.days[t.r]]} ${String(H.hours[t.k]).padStart(2, '0')}:00` : '—', t ? `${t.v.toFixed(2)}× average · ${city}` : '', '#ff5a4f'], ['QUIETEST HOUR', q ? `${DOWS[H.days[q.r]]} ${String(H.hours[q.k]).padStart(2, '0')}:00` : '—', q ? `${q.v.toFixed(2)}× average` : '', '#5b8def'],
        ['WILDEST / QUIETEST', t && q ? (t.v / q.v).toFixed(1) + '×' : '—', 'range of the intraday pattern'], ['BEST WEEKDAY', DOWS[H.days[H.byDow.indexOf(Math.max(...H.byDow))]], `${Math.max(...H.byDow).toFixed(2)}× average vol`],
        ['SAMPLE', H.R.length.toLocaleString(), `hourly returns · ${H.first} → ${H.last}`]]);
      const hb = chartBox(Math.max(220, 34 * H.days.length + 24)), vb = H.volu ? chartBox(Math.max(200, 30 * H.days.length + 24)) : null;
      out.append(card(`VOLATILITY HEATMAP · AVERAGE |RETURN| BY WEEKDAY AND HOUR (${city.toUpperCase()} TIME)`, hb, legendScale(), note('Each cell is the average absolute hourly return in that weekday-hour divided by the average over all hours: 1.00× is a normal hour, 2.00× twice as volatile. The white box is now. Hover a cell for details.')));
      if (vb) out.append(card('VOLUME HEATMAP · AVERAGE VOLUME BY WEEKDAY AND HOUR', vb, note('Same layout for traded volume. Volatility and volume move together through the day, as Andersen and Bollerslev found.')));
      requestAnimationFrame(() => {
        heatmap(hb, {rows: H.days.map(x => DOWS[x]), cols: H.hours.map(h => String(h).padStart(2, '0') + 'h'), cells: H.vol.map(r => r.map(c => c?.v)), now: nc.rc, aria: `${iSym} volatility by weekday and hour`, title: (v, r, c) => `${DOWS[H.days[r]]} ${String(H.hours[c]).padStart(2, '0')}:00 ${city} · ${v.toFixed(2)}× average |return| · ${H.vol[r][c].n} hours`});
        if (vb) heatmap(vb, {rows: H.days.map(x => DOWS[x]), cols: H.hours.map(h => String(h).padStart(2, '0') + 'h'), cells: H.volu.map(r => r.map(c => c?.v)), now: nc.rc, aria: `${iSym} volume by weekday and hour`, title: (v, r, c) => `${DOWS[H.days[r]]} ${String(H.hours[c]).padStart(2, '0')}:00 · ${v.toFixed(2)}× average volume`});
      });
    } else out.append(note('Hourly history is unavailable for this market.'));
    if (M) {
      const two = el('div', 'fx-qr-two'), pb = chartBox(260), ab = chartBox(260);
      two.append(card(`TIME-OF-DAY PROFILE · 5-MINUTE BARS, ${M.first} → ${M.last}`, pb, note(`Average |5-minute return| at each time of day (${city} time) relative to the day’s average; the shaded band is the 25th–75th percentile. Stock markets show the classic U: busy open, quiet lunch, busy close.`)),
        card('THE PERIODICITY FILTER (ANDERSEN–BOLLERSLEV)', ab, note(`Autocorrelation of 5-minute |returns| over ${Math.round((M.acfRaw.length - 1) / M.perDay)} trading days. Raw (grey) swings with the daily cycle every ${M.perDay} bars, hiding the real persistence. Divided by the time-of-day factor (amber), the cycle disappears and the slow decay of volatility shows through.`)));
      out.append(two);
      requestAnimationFrame(() => {
        lineChart(pb, {series: [{v: M.p75, color: 'rgba(255,176,0,.35)', width: 0.8}, {v: M.p25, color: 'rgba(255,176,0,.35)', width: 0.8}, {v: M.prof, color: '#ffb000', width: 2, name: '|return| vs average'}, ...(M.profV ? [{v: M.profV, color: '#5b8def', width: 1.2, name: 'volume vs average'}] : [])], xs: M.buckets.map(hhmm), yfmt: v => v.toFixed(1) + '×', aria: 'Intraday volatility profile', hline: [{v: 1, color: '#4b5953'}]});
        acfChart(ab, M.acfRaw, M.acfFilt, M.band, {aria: 'Autocorrelation of raw and filtered intraday absolute returns', names: ['Raw |r|', 'Filtered |r|'], step: 1});
      });
    } else out.append(note('5-minute bars are unavailable for this market.'));
    out.append(card('METHOD', ...[`Delayed bars from Yahoo Finance. Hourly bars cover about two years and 5-minute bars the last 60 days. Times are the exchange’s local time (${d.tz}), adjusted for daylight saving. Returns are taken only between back-to-back bars, so overnight and weekend gaps are excluded.`, 'Cells or time slots with fewer than 8–10 observations are left blank. Each bar is labeled by its start time.', 'Reference: Andersen & Bollerslev, “Intraday periodicity and volatility persistence in financial markets”, Journal of Empirical Finance (1997).'].map(note)));
  }

  /* ================================= FACTOR: factor neutrality check ================================= */
  const FACTORS = [
    ['MKT', 'Market', ['SPY', 'BIL'], 'S&P 500 minus T-bills', ['SPY', null]],
    ['SMB', 'Size', ['IWM', 'IWB'], 'Russell 2000 minus Russell 1000', ['IWM', 'IWB']],
    ['HML', 'Value', ['IWD', 'IWF'], 'Russell 1000 Value minus Growth', ['IWD', 'IWF']],
    ['TERM', 'Term (duration)', ['TLT', 'SHY'], '20Y+ Treasuries minus 1–3Y', ['TLT', 'SHY']],
    ['DEF', 'Credit (default)', ['LQD', 'IEF'], 'IG corporates minus 7–10Y Treasuries', ['LQD', 'IEF']],
    ['MOM', 'Momentum', ['MTUM', 'SPY'], 'MSCI USA Momentum minus S&P 500', ['MTUM', 'SPY']],
    ['QUAL', 'Quality', ['QUAL', 'SPY'], 'MSCI USA Quality minus S&P 500', ['QUAL', 'SPY']],
    ['LVOL', 'Low volatility', ['USMV', 'SPY'], 'MSCI USA Min Vol minus S&P 500', ['USMV', 'SPY']]
  ];
  const FSETS = [['ff3', 'Fama–French 3', ['MKT', 'SMB', 'HML']], ['ff93', 'FF 1993 five (stocks + bonds)', ['MKT', 'SMB', 'HML', 'TERM', 'DEF']], ['all', 'Extended eight', FACTORS.map(f => f[0])]];
  const FPRESETS = [
    ['mine', 'My portfolio', null],
    ['tech', 'Tech heavy', [['QQQ', 40], ['NVDA', 20], ['MSFT', 20], ['AAPL', 20]]],
    ['mn', 'Long stocks / short SPY', [['AAPL', 34], ['MSFT', 33], ['GOOGL', 33], ['SPY', -100]]],
    ['pair', 'Chip pair (long NVDA AMD, short SMH)', [['NVDA', 50], ['AMD', 50], ['SMH', -100]]],
    ['value', 'Value stocks', [['BRK-B', 25], ['JPM', 25], ['XOM', 25], ['JNJ', 25]]],
    ['small', 'Small caps', [['IWM', 100]]],
    ['6040', '60/40', [['SPY', 60], ['TLT', 40]]]
  ];
  const FV = (() => { let s = {}; try { s = JSON.parse(store.get('factor') || '{}') || {}; } catch (_) {} return {preset: s.preset || 'tech', rows: Array.isArray(s.rows) ? s.rows : null, set: FSETS.some(x => x[0] === s.set) ? s.set : 'ff93', look: [126, 252, 504, 1000].includes(s.look) ? s.look : 252, value: finite(s.value) ? s.value : 100000}; })();
  const saveF = () => store.set('factor', JSON.stringify(FV));
  function fRows() {
    if (FV.rows?.length) return {rows: FV.rows, units: false, label: 'Custom'};
    if (FV.preset === 'mine') { const h = T.portfolioHoldings?.() || []; if (h.length) return {rows: h.map(x => [x.symbol, x.qty]), units: true, label: 'My portfolio'}; }
    const p = FPRESETS.find(x => x[0] === FV.preset && x[2]) || FPRESETS[1]; return {rows: p[2].map(r => [...r]), units: false, label: p[1]};
  }
  // Prices on SPY's trading days, carrying forward the last close for markets that were shut (crypto weekends roll into Monday).
  function onDates(series, base, syms) {
    const dates = [...(series.get(base)?.keys() || [])].sort(), px = {};
    for (const s of syms) { const m = series.get(s); if (!m || m.size < 60) continue; const keys = [...m.keys()].sort(); let j = 0, last = null; px[s] = dates.map(d => { while (j < keys.length && keys[j] <= d) last = m.get(keys[j++]); return last; }); }
    return {dates, px};
  }
  let FR = null, fKey = '', fP = null;
  const fk = () => JSON.stringify([fRows().rows, FV.set, FV.look]);
  async function fCompute() {
    if (FR && fKey === fk()) return FR; if (fP) return fP;
    fP = (async () => {
      const pr = fRows(), syms = [...new Set(pr.rows.map(r => String(r[0]).toUpperCase()))], fset = FSETS.find(x => x[0] === FV.set)[2], fdefs = FACTORS.filter(f => fset.includes(f[0]));
      const etfs = [...new Set(fdefs.flatMap(f => f[2]))];
      const d = await loadCloses([...new Set([...syms, ...etfs, 'SPY'])], FV.look > 504 ? '5y' : '2y');
      const {dates, px} = onDates(d.series, 'SPY', [...new Set([...syms, ...etfs])]);
      const have = syms.filter(s => px[s]), missing = syms.filter(s => !px[s]);
      if (!have.length) throw new Error('No price history for these holdings.');
      const lack = fdefs.filter(f => f[2].some(s => !px[s])); if (lack.length) throw new Error('Factor data unavailable right now (' + lack.map(f => f[0]).join(', ') + ').');
      let start = 1; for (const s of [...have, ...etfs]) { const i = px[s].findIndex(finite); start = Math.max(start, i + 1); }
      start = Math.max(start, dates.length - FV.look);
      const T_ = dates.length - start; if (T_ < 60) throw new Error('Not enough overlapping history (need 60 days).');
      const ret = s => { const a = new Float64Array(T_); for (let t = 0; t < T_; t++) a[t] = px[s][start + t] / px[s][start + t - 1] - 1; return a; };
      const R = Object.fromEntries([...have, ...etfs].map(s => [s, ret(s)]));
      const F = fdefs.map(f => { const a = R[f[2][0]], b = R[f[2][1]]; return Float64Array.from(a, (v, t) => v - b[t]); });
      // weights: units × last price for holdings; % column otherwise (shorts allowed)
      const amt = s => pr.rows.filter(r => String(r[0]).toUpperCase() === s).reduce((a, r) => a + +r[1], 0);
      let w; if (pr.units) { const val = have.map(s => amt(s) * px[s].at(-1)), tot = val.reduce((a, b) => a + Math.abs(b), 0) || 1; w = val.map(v => v / tot); }
      else w = have.map(s => amt(s) / 100);
      const y = new Float64Array(T_); have.forEach((s, i) => { const a = R[s]; for (let t = 0; t < T_; t++) y[t] += w[i] * a[t]; });
      const fit = ols(y, F); if (!fit) throw new Error('The regression could not be solved (factors too similar).');
      const k = F.length, cov = Array.from({length: k}, (_, i) => Array.from({length: k}, (_, j) => { const mi = mean(F[i]), mj = mean(F[j]); let s = 0; for (let t = 0; t < T_; t++) s += (F[i][t] - mi) * (F[j][t] - mj); return s / (T_ - 1); }));
      const b = fit.beta.slice(1), vy = sd(y) ** 2, contrib = b.map((bi, i) => bi * cov[i].reduce((s, c, j) => s + c * b[j], 0) / vy);
      const thr = f => f === 'MKT' ? 0.1 : 0.15, flags = fdefs.map((f, i) => Math.abs(fit.t[i + 1]) > 2 && Math.abs(b[i]) > thr(f[0]));
      // rolling 63-day betas, every 3 days
      const roll = [], W = 63; for (let e = W; e <= T_; e += 3) { const ys = y.slice(e - W, e), fs = F.map(f => f.slice(e - W, e)), r = ols(ys, fs, 0); if (r) roll.push({date: dates[start + e - 1], b: r.beta.slice(1)}); }
      const per = have.map(s => { const r = ols(R[s], F, 5); return {s, b: r ? r.beta.slice(1) : null, t: r ? r.t.slice(1) : null, r2: r?.r2}; });
      const gross = w.reduce((a, x) => a + Math.abs(x), 0), net = w.reduce((a, x) => a + x, 0);
      return {pr, have, missing, w, fdefs, fit, b, contrib, flags, roll, per, T_, from: dates[start], to: dates.at(-1), A: 252, gross, net, y};
    })();
    try { FR = await fP; fKey = fk(); return FR; } finally { fP = null; }
  }
  function hedgeText(f, beta, value) {
    const amt = money(Math.abs(beta) * value), [a, b] = f[4], sellFirst = beta > 0;
    if (!b) return `${sellFirst ? 'Sell' : 'Buy'} ${amt} of ${a}`;
    return sellFirst ? `Sell ${amt} ${a} / buy ${amt} ${b}` : `Buy ${amt} ${a} / sell ${amt} ${b}`;
  }
  function fVerdict(r) {
    const flagged = r.fdefs.map((f, i) => [f, r.b[i], r.fit.t[i + 1]]).filter((_, i) => r.flags[i]), box = el('div', 'fx-ql-verdict');
    box.style.borderColor = flagged.length ? '#ff5a4f' : '#3ecf8e';
    box.textContent = flagged.length
      ? `Not factor-neutral. Significant exposure to ${flagged.map(([f, b, t]) => `${f[1].toLowerCase()} (β ${num(b)}, t ${num(t, 1)})`).join(', ')}. Factors explain ${pct(r.fit.r2, 0)} of the daily variance; the remaining ${pct(1 - r.fit.r2, 0)} is stock-specific.`
      : `Factor-neutral within the noise: no factor has both |t| > 2 and a material beta. Factors explain only ${pct(r.fit.r2, 0)} of the daily variance, so returns are mostly idiosyncratic.`;
    return box;
  }
  async function renderFactor() {
    const host = panel('factor'); empty(host, 'Running the factor regression…');
    let r; try { r = await fCompute(); } catch (e) { report('factor', e); return empty(host, why(e, 'Price history is unavailable right now.')); }
    if (!$('tp-factor')) return; host.replaceChildren(); setText('n-factor', r.pr.label + ' · ' + Math.round(r.T_ / 21) + 'm');
    const w = el('div', 'fx-ql'); host.append(w);
    const n = r.flags.filter(Boolean).length, hd = el('div', 'fx-ql-head'), sp = el('span', 'fx-ql-state', n ? `${n} FACTOR BET${n > 1 ? 'S' : ''}` : 'NEUTRAL'); sp.style.color = n ? '#ff5a4f' : '#3ecf8e'; sp.style.fontSize = '14px';
    hd.append(sp, el('span', 'fx-ql-sub', `R² ${pct(r.fit.r2, 0)} · alpha ${spct(r.fit.beta[0] * 252)}/yr (t ${num(r.fit.t[0], 1)})`)); w.append(hd);
    const t = el('table', 'fx-qr-mini'), hr = el('tr'); ['FACTOR', 'BETA', '', 't'].forEach(h => hr.append(el('th', '', h))); t.append(hr);
    r.fdefs.forEach((f, i) => { const tr = el('tr'), c = el('td'); c.append(betaBar(r.b[i])); const name = el('td', '', f[0]); if (r.flags[i]) name.style.color = '#ff5a4f'; tr.append(name, el('td', '', num(r.b[i])), c, el('td', '', num(r.fit.t[i + 1], 1))); t.append(tr); });
    w.append(t);
  }
  async function renderFactorPage(host) {
    PG.setHead('FACTOR', 'Factor neutrality check', 'Is this portfolio secretly a market, size, value, rates or credit bet? Fama–French style regression on real daily returns');
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap);
    const rerun = () => { if (wrap.isConnected) PG.rerender(); };
    const inCard = el('div', 'fx-ql-card'); inCard.append(el('h3', '', 'PORTFOLIO (NEGATIVE WEIGHT = SHORT)'));
    const pRow = el('div', 'fx-ql-row'); for (const [k, l] of FPRESETS) { const b = btn(l, 'fx-ql-btn' + (!FV.rows && FV.preset === k ? ' on' : ''), () => { FV.preset = k; FV.rows = null; saveF(); rerun(); }); if (k === 'mine' && !(T.portfolioHoldings?.() || []).length) { b.disabled = true; b.title = 'Add holdings in the Portfolio page first'; } pRow.append(b); }
    inCard.append(pRow);
    const pr = fRows(), editing = pr.rows.map(r => [String(r[0]).toUpperCase(), r[1]]);
    const tbl = el('table', 'fx-ql-tbl'), th = el('tr'); th.append(el('th', '', 'SYMBOL'), el('th', '', pr.units ? 'UNITS' : 'WEIGHT %'), el('th', '', '')); tbl.append(th);
    const draw = () => { while (tbl.rows.length > 1) tbl.deleteRow(1); editing.forEach((r, i) => { const tr = el('tr'), a = el('input', 'sym'), b = el('input'), d1 = el('td'), d2 = el('td'), d3 = el('td'); a.value = r[0]; a.setAttribute('aria-label', 'Symbol'); b.type = 'number'; b.step = 'any'; b.value = r[1]; b.setAttribute('aria-label', 'Weight'); a.addEventListener('change', () => { r[0] = a.value.trim().toUpperCase(); }); b.addEventListener('change', () => { r[1] = +b.value; }); d1.append(a); d2.append(b); d3.append(btn('✕', 'fx-ql-btn', () => { editing.splice(i, 1); draw(); }, 'Remove')); tr.append(d1, d2, d3); tbl.append(tr); }); };
    draw(); inCard.append(tbl);
    const act = el('div', 'fx-ql-row'); act.style.marginTop = '8px';
    act.append(btn('+ Add asset', 'fx-ql-btn', () => { if (editing.length < 25) { editing.push(['', 10]); draw(); } }), btn('Run regression', 'fx-ql-btn pri', () => { const rows = editing.filter(r => SYM_RE.test(r[0]) && finite(r[1]) && r[1] !== 0); if (!rows.length) return T.say('Add at least one valid symbol.'); if (pr.units) { FV.preset = 'mine'; FV.rows = null; } else FV.rows = rows; saveF(); rerun(); }));
    inCard.append(act);
    const opts = el('div', 'fx-ql-row'); opts.style.marginTop = '10px';
    const sel = (lab, val, list, on) => { const l = el('label', '', lab), s = el('select'); for (const [v, t] of list) { const o = el('option', '', t); o.value = v; if (String(v) === String(val)) o.selected = true; s.append(o); } s.addEventListener('change', () => on(s.value)); l.append(s); return l; };
    const vl = el('label', '', 'Value $'), vi = el('input'); vi.type = 'number'; vi.min = '100'; vi.step = '1000'; vi.value = FV.value; vi.addEventListener('change', () => { FV.value = Math.max(100, +vi.value || 100000); saveF(); rerun(); }); vl.append(vi);
    opts.append(sel('Factors', FV.set, FSETS.map(x => [x[0], x[1]]), v => { FV.set = v; saveF(); rerun(); }), sel('Window', FV.look, [[126, '6 months'], [252, '1 year'], [504, '2 years'], [1000, '4 years']], v => { FV.look = +v; saveF(); rerun(); }), vl);
    inCard.append(opts); wrap.append(inCard);
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(out); out.append(note('Downloading prices and running the regression…'));
    let r; try { r = await fCompute(); } catch (e) { out.replaceChildren(note(why(e, 'Price history is unavailable right now.'))); return; }
    if (!out.isConnected) return; out.replaceChildren();
    if (r.missing.length) out.append(note(`No price history for ${r.missing.join(', ')}; left out.`));
    const n = r.flags.filter(Boolean).length, hd = el('div', 'fx-ql-head'), sp = el('span', 'fx-ql-state', n ? 'NOT NEUTRAL' : 'FACTOR-NEUTRAL'); sp.style.color = n ? '#ff5a4f' : '#3ecf8e';
    hd.append(sp, el('span', 'fx-ql-sub', `${r.pr.label} · ${r.T_} trading days, ${r.from} → ${r.to} · gross ${pct(r.gross, 0)}, net ${pct(r.net, 0)}`)); out.append(hd);
    const mk = r.fdefs.findIndex(f => f[0] === 'MKT');
    kpis(out, [['MARKET BETA', mk >= 0 ? num(r.b[mk]) : '—', mk >= 0 ? `t ${num(r.fit.t[mk + 1], 1)}` : '', mk >= 0 && r.flags[mk] ? '#ff5a4f' : '#3ecf8e'], ['R² (FACTORS)', pct(r.fit.r2, 0), 'variance explained by factors'],
      ['ALPHA (ANNUAL)', spct(r.fit.beta[0] * 252), `t ${num(r.fit.t[0], 1)} · ${Math.abs(r.fit.t[0]) > 2 ? 'significant' : 'not significant'}`], ['STOCK-SPECIFIC VOL', pct(r.fit.residSd * Math.sqrt(252)), 'annualized residual'], ['TOTAL VOL', pct(sd(r.y) * Math.sqrt(252)), 'annualized'], ['FACTOR BETS', String(n), `of ${r.fdefs.length} tested`, n ? '#ff5a4f' : '#3ecf8e']]);
    out.append(fVerdict(r));
    const two = el('div', 'fx-qr-two'), t = el('table', 'fx-ql-tbl'), h2 = el('tr'); ['FACTOR', 'PROXY', 'BETA', '', 't (NW)', 'SHARE OF VARIANCE', 'NEUTRALIZE WITH'].forEach(x => h2.append(el('th', '', x))); t.append(h2);
    r.fdefs.forEach((f, i) => { const tr = el('tr'), bc = el('td'); bc.append(betaBar(r.b[i])); const nm = el('td', '', `${f[0]} · ${f[1]}`); if (r.flags[i]) nm.style.color = '#ff5a4f'; const hedge = el('td', '', r.flags[i] ? hedgeText(f, r.b[i], FV.value) : '—'); hedge.style.whiteSpace = 'normal'; tr.append(nm, el('td', '', f[3]), el('td', '', num(r.b[i])), bc, el('td', '', num(r.fit.t[i + 1], 1)), el('td', '', pct(r.contrib[i], 0)), hedge); t.append(tr); });
    const tc = card('FACTOR EXPOSURES', t, note(`Beta = how much the portfolio moves for a 1% move in the factor. Red = |t| above 2 and a material size. Hedge amounts are for a ${money(FV.value)} portfolio and assume the betas stay where they are.`)); tc.style.overflowX = 'auto';
    out.append(tc);
    const rb = chartBox(260), hb = chartBox(Math.max(140, 30 * r.per.length + 30));
    two.append(card('ROLLING 63-DAY BETAS', rb, note('How the exposures drifted. A strategy that is neutral on average can still swing between bets.')), card('EXPOSURE OF EACH HOLDING', hb, note('Betas of each holding on the same factors. Green = positive, red = negative. Hover for values.')));
    out.append(two);
    out.append(card('METHOD', ...['Daily simple returns on S&P 500 trading days (Yahoo Finance adjusted closes). The portfolio return is the weighted sum of holdings, rebalanced daily. Shorts use negative weights.', 'Factors are long–short ETF proxies for the academic factors: ' + r.fdefs.map(f => `${f[0]} = ${f[2][0]} − ${f[2][1]}`).join(', ') + '. They track, but are not identical to, the Fama–French data library series.', 'Regression: r(p) = α + Σ β·factor + ε, ordinary least squares with Newey–West standard errors (5 lags) to allow for autocorrelation and changing volatility. Share of variance = β·Cov(factors)·β / Var(portfolio) for each factor.', 'Reference: Fama & French, “Common risk factors in the returns on stocks and bonds”, Journal of Financial Economics (1993).'].map(note)));
    requestAnimationFrame(() => {
      const order = r.fdefs.map((f, i) => i).sort((a, b) => Math.abs(r.b[b]) - Math.abs(r.b[a])).slice(0, 4), colors = ['#ffb000', '#5b8def', '#3ecf8e', '#c77dff'];
      lineChart(rb, {series: order.map((i, k) => ({v: r.roll.map(x => x.b[i]), color: colors[k], width: 1.6, name: r.fdefs[i][0]})), xs: r.roll.map(x => x.date), zero: true, yfmt: v => v.toFixed(2), aria: 'Rolling factor betas'});
      const div = v => { if (!finite(v)) return '#0b0f0e'; const t = Math.max(-1, Math.min(1, v / 1.5)); return t >= 0 ? `rgba(62,207,142,${0.12 + 0.75 * t})` : `rgba(255,90,79,${0.12 + 0.75 * -t})`; };
      heatmap(hb, {rows: r.per.map(p => p.s), cols: r.fdefs.map(f => f[0]), cells: r.per.map(p => r.fdefs.map((_, i) => p.b ? p.b[i] : null)), scale: div, fmt: v => v.toFixed(2), aria: 'Factor betas of each holding', title: (v, i, j) => `${r.per[i].s} · ${r.fdefs[j][1]} beta ${v.toFixed(2)} (t ${num(r.per[i].t[j], 1)})`});
    });
  }

  /* =============================== RMOM: regime-dependent momentum ================================== */
  const RM_ASSETS = ['XLK', 'XLF', 'XLE', 'XLV', 'XLY', 'XLP', 'XLI', 'XLB', 'XLU', 'IYR', 'EFA', 'EEM', 'EWJ', 'TLT', 'IEF', 'LQD', 'HYG', 'GLD', 'SLV', 'DBC'];
  const RV = (() => { let s = {}; try { s = JSON.parse(store.get('rmom') || '{}') || {}; } catch (_) {} return {uni: s.uni === 'assets' ? 'assets' : 'stocks', bear: s.bear === 24 ? 24 : 12}; })();
  const saveR = () => store.set('rmom', JSON.stringify(RV));
  const RMC = new Map(), RMP = new Map();
  function stats(daily, ann = 252) {
    if (!daily.length) return null; const m = mean(daily), s = sd(daily); let eq = 1, peak = 1, mdd = 0; for (const r of daily) { eq *= 1 + r; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1); }
    return {cagr: eq ** (ann / daily.length) - 1, vol: s * Math.sqrt(ann), sharpe: s ? m / s * Math.sqrt(ann) : 0, mdd, total: eq - 1};
  }
  async function rmCompute() {
    const key = RV.uni + RV.bear; if (RMC.has(key)) return RMC.get(key); if (RMP.has(key)) return RMP.get(key);
    const p = (async () => {
      const uni = RV.uni === 'assets' ? RM_ASSETS : UNIVERSE, d = await loadCloses([...uni, 'SPY'], '10y');
      const {dates, px} = onDates(d.series, 'SPY', [...uni, 'SPY']); const syms = uni.filter(s => px[s]);
      if (syms.length < 10 || dates.length < 400) throw new Error('Not enough price history for the momentum universe.');
      const N = dates.length, ret = s => { const a = new Float64Array(N); for (let t = 1; t < N; t++) { const x = px[s][t], y = px[s][t - 1]; a[t] = finite(x) && finite(y) && y > 0 ? x / y - 1 : NaN; } return a; };
      const R = Object.fromEntries(syms.map(s => [s, ret(s)])), M = ret('SPY');
      const me = []; for (let t = 0; t < N - 1; t++) if (dates[t].slice(0, 7) !== dates[t + 1].slice(0, 7)) me.push(t); me.push(N - 1);
      const k = RV.uni === 'assets' ? 4 : 10, bearM = RV.bear;
      // realized market vol (126d) and its expanding median, known at each date
      const mvol = new Float64Array(N).fill(NaN); for (let t = 126; t < N; t++) { let s = 0, q = 0; for (let i = t - 125; i <= t; i++) { s += M[i]; q += M[i] * M[i]; } mvol[t] = Math.sqrt(Math.max(0, q / 126 - (s / 126) ** 2) * 252); }
      const months = [], daily = [], dailyDates = [], dailyM = [], wVol = [], wReg = [];
      let hist = [];
      for (let j = 12; j < me.length - 1; j++) {
        const t = me[j], t1 = me[j - 1], t12 = me[j - 12];
        const score = syms.map(s => { const a = px[s][t1], b = px[s][t12]; return finite(a) && finite(b) && b > 0 && finite(px[s][t]) ? [s, a / b - 1] : null; }).filter(Boolean).sort((a, b) => b[1] - a[1]);
        if (score.length < 2 * k) continue;
        const W = score.slice(0, k), L = score.slice(-k), mb = Math.max(0, j - bearM), mkt = px.SPY[t] / px.SPY[me[mb]] - 1, bear = j >= bearM && mkt < 0;
        const vols = [...mvol.slice(0, t + 1)].filter(finite).sort((a, b) => a - b), hiVol = finite(mvol[t]) && vols.length > 250 && mvol[t] > quantile(vols, 0.5);
        // vol-scaled weight from the previous 126 days of WML
        const past = hist.slice(-126), wv = past.length >= 60 ? Math.min(2, 0.12 / (sd(past) * Math.sqrt(252) || 1)) : 1, wr = bear && hiVol ? 0 : wv;
        let mRet = 1, mktRet = 1; const t2 = me[j + 1];
        for (let i = t + 1; i <= t2; i++) {
          const lw = W.map(([s]) => R[s][i]).filter(finite), ll = L.map(([s]) => R[s][i]).filter(finite); if (!lw.length || !ll.length) continue;
          const x = mean(lw) - mean(ll); daily.push(x); dailyDates.push(dates[i]); dailyM.push(M[i]); wVol.push(wv); wReg.push(wr); hist.push(x); mRet *= 1 + x; mktRet *= 1 + M[i];
        }
        months.push({date: dates[t2].slice(0, 7), formed: dates[t], wml: mRet - 1, mkt: mktRet - 1, bear, hiVol, rebound: bear && mktRet > 1, winners: W, losers: L, wv, wr});
      }
      // Current signal, formed as of today with the same 12-1 rule; regime as of today.
      const t = N - 1, jn = me.length - 1, tm = me[jn - 1], t12n = me[Math.max(0, jn - 12)];
      const curScore = syms.map(s => { const a = px[s][tm], b = px[s][t12n]; return finite(a) && finite(b) && b > 0 ? [s, a / b - 1] : null; }).filter(Boolean).sort((a, b) => b[1] - a[1]);
      const mktNow = px.SPY[t] / px.SPY[me[Math.max(0, jn - bearM)]] - 1, vols = [...mvol].filter(finite).sort((a, b) => a - b), hiNow = mvol[t] > quantile(vols, 0.5);
      const bearNow = mktNow < 0, risk = bearNow && hiNow ? ['HIGH', '#ff5a4f'] : bearNow || mvol[t] > quantile(vols, 0.8) ? ['ELEVATED', '#ffb000'] : ['LOW', '#3ecf8e'];
      const by = f => { const xs = months.filter(f).map(m => m.wml), betaOf = () => { const ms = months.filter(f); if (ms.length < 4) return NaN; const a = ms.map(m => m.wml), b = ms.map(m => m.mkt), ma = mean(a), mb2 = mean(b); let c = 0, v = 0; for (let i = 0; i < a.length; i++) { c += (a[i] - ma) * (b[i] - mb2); v += (b[i] - mb2) ** 2; } return v ? c / v : NaN; }; return xs.length ? {n: xs.length, mean: mean(xs), sd: xs.length > 1 ? sd(xs) : NaN, hit: xs.filter(x => x > 0).length / xs.length, worst: Math.min(...xs), best: Math.max(...xs), beta: betaOf()} : {n: 0}; };
      const states = [['All months', () => true], ['Bull market', m => !m.bear], [`Bear market (${bearM}m)`, m => m.bear], ['Bear + market rebound', m => m.rebound], ['High volatility', m => m.hiVol], ['Low volatility', m => !m.hiVol]].map(([n, f]) => [n, by(f)]);
      const plain = stats(daily), vs = stats(daily.map((x, i) => x * wVol[i])), rg = stats(daily.map((x, i) => x * wReg[i])), mk = stats(dailyM);
      const eq = arr => { let e = 1; return arr.map(x => (e *= 1 + x)); };
      const out = {syms, k, months, states, plain, vs, rg, mk, eqPlain: eq(daily), eqVs: eq(daily.map((x, i) => x * wVol[i])), eqReg: eq(daily.map((x, i) => x * wReg[i])), eqMkt: eq(dailyM), dailyDates, wReg,
        now: {winners: curScore.slice(0, k), losers: curScore.slice(-k), bear: bearNow, mkt: mktNow, vol: mvol[t], hiVol: hiNow, risk, formed: dates[tm]}, names: d.names, from: dailyDates[0], to: dailyDates.at(-1)};
      RMC.set(key, out); return out;
    })();
    RMP.set(key, p); try { return await p; } finally { RMP.delete(key); }
  }
  async function renderRmom() {
    const host = panel('rmom'); empty(host, 'Backtesting 10 years of momentum…');
    let r; try { r = await rmCompute(); } catch (e) { report('rmom', e); return empty(host, why(e, 'Price history is unavailable right now.')); }
    if (!$('tp-rmom')) return; host.replaceChildren(); setText('n-rmom', (RV.uni === 'assets' ? 'Cross-asset' : '50 US stocks') + ' · 12-1');
    const w = el('div', 'fx-ql'); host.append(w);
    const hd = el('div', 'fx-ql-head'), sp = el('span', 'fx-ql-state', 'CRASH RISK ' + r.now.risk[0]); sp.style.color = r.now.risk[1]; sp.style.fontSize = '14px';
    hd.append(sp, el('span', 'fx-ql-sub', `${r.now.bear ? 'Bear' : 'Bull'} market (SPY ${spct(r.now.mkt, 0)} over ${RV.bear}m) · vol ${pct(r.now.vol, 0)} ${r.now.hiVol ? '(high)' : '(normal)'}`)); w.append(hd);
    const bull = r.states[1][1], bear = r.states[2][1];
    kpis(w, [['WML / MO · BULL', spct(bull.mean, 2), `${bull.n} months`, bull.mean >= 0 ? '#3ecf8e' : '#ff5a4f'], ['WML / MO · BEAR', bear.n ? spct(bear.mean, 2) : '—', `${bear.n || 0} months`, bear.n ? (bear.mean >= 0 ? '#3ecf8e' : '#ff5a4f') : null], ['SHARPE PLAIN → AWARE', `${num(r.plain.sharpe)} → ${num(r.rg.sharpe)}`, 'regime-aware, vol-scaled']]);
    const cb = el('div', 'fx-ql-chart'); w.append(cb);
    w.append(note('Long ' + r.now.winners.slice(0, 3).map(x => x[0]).join(' ') + ' · short ' + r.now.losers.slice(-3).map(x => x[0]).join(' ')));
    requestAnimationFrame(() => lineChart(cb, {series: [{v: r.eqPlain, color: '#7d8a83', width: 1.2, name: 'Plain'}, {v: r.eqReg, color: '#ffb000', width: 1.8, name: 'Regime-aware'}], log: true, yfmt: v => v.toFixed(2) + '×', aria: 'Momentum strategy growth', xs: r.dailyDates}));
  }
  async function renderRmomPage(host) {
    PG.setHead('RMOM', 'Regime-dependent momentum', 'Winners minus losers, split by market regime: when does momentum pay, and when does it crash? (Daniel & Moskowitz)');
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap);
    const rerun = () => { if (wrap.isConnected) PG.rerender(); };
    const opts = el('div', 'fx-ql-row');
    opts.append(chips([['stocks', '50 US large caps'], ['assets', '20 sectors & asset classes']], RV.uni, v => { RV.uni = v; saveR(); rerun(); }));
    const bl = el('label', '', 'Bear market ='), bs = el('select'); for (const [v, t] of [[12, 'SPY down over 12 months'], [24, 'SPY down over 24 months (D&M)']]) { const o = el('option', '', t); o.value = v; if (v === RV.bear) o.selected = true; bs.append(o); } bs.addEventListener('change', () => { RV.bear = +bs.value; saveR(); rerun(); }); bl.append(bs); opts.append(bl);
    wrap.append(opts);
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(out); out.append(note('Downloading 10 years of prices and backtesting…'));
    let r; try { r = await rmCompute(); } catch (e) { out.replaceChildren(note(why(e, 'Price history is unavailable right now.'))); return; }
    if (!out.isConnected) return; out.replaceChildren();
    const hd = el('div', 'fx-ql-head'), sp = el('span', 'fx-ql-state', 'MOMENTUM CRASH RISK: ' + r.now.risk[0]); sp.style.color = r.now.risk[1];
    hd.append(sp, el('span', 'fx-ql-sub', `${r.now.bear ? 'Bear' : 'Bull'} market: SPY ${spct(r.now.mkt)} over ${RV.bear} months. Market volatility ${pct(r.now.vol, 0)} (${r.now.hiVol ? 'above' : 'below'} its median). ${r.now.risk[0] === 'HIGH' ? 'This is the state where momentum crashes happened: losers rebound hardest when the market turns.' : r.now.risk[0] === 'ELEVATED' ? 'One of the two crash conditions is present.' : 'Neither crash condition is present.'}`)); out.append(hd);
    kpis(out, [['PLAIN WML', spct(r.plain.cagr), `Sharpe ${num(r.plain.sharpe)} · max DD ${pct(r.plain.mdd, 0)}`], ['VOL-SCALED', spct(r.vs.cagr), `Sharpe ${num(r.vs.sharpe)} · max DD ${pct(r.vs.mdd, 0)}`], ['REGIME-AWARE', spct(r.rg.cagr), `Sharpe ${num(r.rg.sharpe)} · max DD ${pct(r.rg.mdd, 0)}`, '#ffb000'], ['S&P 500', spct(r.mk.cagr), `Sharpe ${num(r.mk.sharpe)} · max DD ${pct(r.mk.mdd, 0)}`, '#5b8def'], ['MONTHS', String(r.months.length), `${r.from} → ${r.to}`]]);
    const cb = chartBox(300); out.append(card('GROWTH OF $1 (LOG SCALE) · RED = BEAR-MARKET MONTHS', cb, note('Plain = equal-weight top minus bottom ' + (RV.uni === 'assets' ? 'quintile' : 'fifth (10 names each side)') + ' by 12-1 month return, rebalanced monthly. Vol-scaled = sized to 12% annual volatility from the last 6 months. Regime-aware = vol-scaled, and steps aside when the market is in a bear state with high volatility.')));
    const tbl = el('table', 'fx-ql-tbl'), th = el('tr'); ['STATE', 'MONTHS', 'AVG WML / MONTH', 'MONTHLY VOL', 'HIT RATE', 'WORST MONTH', 'BEST MONTH', 'WML BETA TO MARKET'].forEach(x => th.append(el('th', '', x))); tbl.append(th);
    for (const [n, s] of r.states) { const tr = el('tr'); if (!s.n) { tr.append(el('td', '', n), el('td', '', '0'), ...Array.from({length: 6}, () => el('td', '', '—'))); tbl.append(tr); continue; } const m = el('td', '', spct(s.mean, 2)); m.style.color = s.mean >= 0 ? '#3ecf8e' : '#ff5a4f'; const bt = el('td', '', num(s.beta)); if (s.beta < -0.3) bt.style.color = '#ff5a4f'; tr.append(el('td', '', n), el('td', '', String(s.n)), m, el('td', '', pct(s.sd, 1)), el('td', '', pct(s.hit, 0)), el('td', '', spct(s.worst)), el('td', '', spct(s.best)), bt); tbl.append(tr); }
    const tc = card('MOMENTUM BY REGIME', tbl, note('The Daniel–Moskowitz pattern: in bear markets the loser portfolio is full of beaten-down, high-beta names, so winners-minus-losers carries a negative market beta. When the market rebounds, losers jump and momentum crashes. Look at the beta and the “bear + rebound” row.')); tc.style.overflowX = 'auto'; out.append(tc);
    const two = el('div', 'fx-qr-two'), mb = chartBox(240);
    const legs = el('div', 'fx-qr-two'), lw = el('table', 'fx-qr-mini'), ll = el('table', 'fx-qr-mini');
    for (const [t, list, color] of [[lw, r.now.winners, '#3ecf8e'], [ll, r.now.losers.slice().reverse(), '#ff5a4f']]) { const h = el('tr'); h.append(el('th', '', t === lw ? 'LONG · WINNERS' : 'SHORT · LOSERS'), el('th', '', '12-1 RET')); t.append(h); for (const [s, v] of list) { const tr = el('tr'), c = el('td', '', spct(v, 0)); c.style.color = color; tr.append(el('td', '', s), c); t.append(tr); } }
    legs.append(lw, ll);
    two.append(card('MONTHLY WML VS MARKET (EACH DOT = ONE MONTH)', mb, note(`Red dots are bear-market months. If the red cloud slopes down (here the bear-market beta is ${num(r.states[2][1].beta)}), momentum loses when the market rallies out of a bear market: the crash risk.`)), card(`TODAY’S PORTFOLIO (FORMED ${r.now.formed})`, legs));
    out.append(two);
    out.append(card('METHOD AND CAVEATS', ...[`Universe: ${RV.uni === 'assets' ? '20 sector, international, bond and commodity ETFs' : 'the same 50 large US stocks as the panic detector'}, daily adjusted closes from Yahoo Finance, ${r.from} → ${r.to}.`, 'Signal: return from 12 months ago to 1 month ago (skipping the latest month, the usual short-term reversal). Each month-end, buy the top names and short the bottom names, equal weight, held for the next month.', `Regimes known at formation: bear = SPY below its level ${RV.bear} months earlier; high volatility = 6-month SPY volatility above its median to date. “Rebound” uses the holding month’s market return and is descriptive only.`, 'Survivorship bias: the stock universe is today’s large caps, which flatters past returns, especially for the loser leg. Ten years contains few bear-market months, so regime averages are noisy. No costs or borrow fees.', 'Reference: Daniel & Moskowitz, “Momentum crashes”, Journal of Financial Economics (2016); Barroso & Santa-Clara (2015) for volatility scaling.'].map(note)));
    requestAnimationFrame(() => {
      const shade = []; let s0 = null; r.wReg.forEach((wt, i) => { const b = r.months.find(m => r.dailyDates[i].slice(0, 7) === m.date)?.bear; if (b && s0 === null) s0 = i; if (!b && s0 !== null) { shade.push({from: s0, to: i}); s0 = null; } }); if (s0 !== null) shade.push({from: s0, to: r.wReg.length - 1});
      lineChart(cb, {series: [{v: r.eqMkt, color: '#5b8def', width: 1.2, name: 'S&P 500'}, {v: r.eqPlain, color: '#9aa7a0', width: 1.3, name: 'Plain WML'}, {v: r.eqVs, color: '#3ecf8e', width: 1.3, name: 'Vol-scaled'}, {v: r.eqReg, color: '#ffb000', width: 2, name: 'Regime-aware'}], xs: r.dailyDates, log: true, yfmt: v => v.toFixed(2) + '×', shade, aria: 'Growth of one dollar in momentum strategies'});
      const {w, h, s} = frame(mb, 'Scatter of monthly momentum return against market return'), padL = 46, padR = 10, padT = 8, padB = 18, iw = w - padL - padR, ih = h - padT - padB;
      const xs = r.months.map(m => m.mkt), ys = r.months.map(m => m.wml), xl = Math.min(...xs), xh = Math.max(...xs), yl = Math.min(...ys), yh = Math.max(...ys), X = v => padL + (v - xl) / (xh - xl || 1) * iw, Y = v => padT + (yh - v) / (yh - yl || 1) * ih;
      s.append(svg('line', {x1: padL, x2: w - padR, y1: Y(0), y2: Y(0), stroke: '#3a4742'}), svg('line', {x1: X(0), x2: X(0), y1: padT, y2: h - padB, stroke: '#3a4742'}));
      r.months.forEach(m => { const c = svg('circle', {cx: X(m.mkt), cy: Y(m.wml), r: m.bear ? 3.6 : 2.8, fill: m.bear ? '#ff5a4f' : '#ffb000', 'fill-opacity': m.bear ? 0.95 : 0.55}); const t = svg('title'); t.textContent = `${m.date}: WML ${spct(m.wml)}, market ${spct(m.mkt)}${m.bear ? ' · bear' : ''}`; c.append(t); s.append(c); });
      label(s, w - padR, h - 4, 'market month →', {'text-anchor': 'end'}); label(s, padL + 4, padT + 10, '↑ WML month', {});
      for (const v of [yl, 0, yh]) label(s, padL - 4, Y(v) + 3, (v * 100).toFixed(0) + '%', {'text-anchor': 'end'});
      mb.replaceChildren(s);
    });
  }

  /* --- register ------------------------------------------------------------------------------------------ */
  Object.assign(T.PANELS, {vclust: ['VCLUST', 'Volatility clustering', 'vclust'], iseas: ['ISEAS', 'Intraday seasonality', 'iseas'], factor: ['FACTOR', 'Factor neutrality', 'factor'], rmom: ['RMOM', 'Regime momentum', 'rmom']});
  Object.assign(T.PANEL_DESC, {vclust: 'GARCH, autocorrelation and vol clusters across 11 markets', iseas: 'Volatility by weekday and hour, any market', factor: 'Is your portfolio a hidden market, size or value bet?', rmom: 'Momentum by bull/bear and volatility regime'});
  for (const k of ['vclust', 'iseas', 'factor', 'rmom']) T.LINK_LABEL[k] = 'Full';
  Object.assign(T.RENDER, {vclust: renderVclust, iseas: renderIseas, factor: renderFactor, rmom: renderRmom});
  const grp = T.EXTRA_GROUPS.find(g => g[0] === 'Quant lab'); if (grp) grp[1].push('vclust', 'iseas', 'factor', 'rmom'); else T.EXTRA_GROUPS.push(['Quant lab', ['vclust', 'iseas', 'factor', 'rmom']]);
  if (PG) {
    PG.add('vclust', 'Volatility clustering detector', renderVclustPage); PG.add('garch', 'Volatility clustering detector', renderVclustPage);
    PG.add('iseas', 'Intraday seasonality map', renderIseasPage); PG.add('seasonality', 'Intraday seasonality map', renderIseasPage);
    PG.add('factor', 'Factor neutrality check', renderFactorPage); PG.add('rmom', 'Regime-dependent momentum', renderRmomPage); PG.add('momentum', 'Regime-dependent momentum', renderRmomPage);
    T.PAGE_NAMES.push('VCLUST', 'GARCH', 'ISEAS', 'SEASONALITY', 'FACTOR', 'RMOM', 'MOMENTUM');
  }
  if (T.DESK_DEFS?.quant) Object.assign(T.DESK_DEFS.quant, {slots: ['oflow', 'panic', 'mcvar', 'vclust', 'iseas', 'factor', 'rmom'], grid: {cols: '1fr 1fr 1fr 1fr 1fr 1fr', areas: ['s1 s1 s1 s2 s2 s2', 's1 s1 s1 s2 s2 s2', 's3 s3 s4 s4 s5 s5', 's6 s6 s6 s7 s7 s7']}});
  T.QuantResearch = {acf, garch, ols, ljungBox, chi2p, intradayReturns, loadBars, mean, sd, ui: {frame, label, lineChart, heatmap, heatColor, legendScale, card, chartBox, note, chips, symbolBox, pill, betaBar}};
});
