/* FYNX Terminal plugin: OPTLAB. Options pricing on real delayed Cboe chains: Black–Scholes (Black-76 on the forward
 * implied by put–call parity) with one volatility, with a term structure, a per-expiry quadratic smile, and a neural
 * network that learns the whole implied-volatility surface. Every model is fitted on 70% of the quotes and priced on
 * an evaluation subset, scored against the market's own bid–ask spread. Includes a rotatable 3-D volatility surface,
 * the smile for any expiry and the term structure. Not advice. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {el, btn, svg, $, panel, setText, store, empty, finite, report} = T;
  const QL = T.QuantLab, QR = T.QuantResearch, ML = window.FynxMLCore;
  if (!QL || !QR || !ML?.mlpRegFit) return;
  const {kpis, erfc} = QL;
  const {frame, label, lineChart, card, chartBox, note, chips} = QR.ui;
  const GREEN = '#3ecf8e', RED = '#ff5a4f', AMBER = '#ffb000', BLUE = '#5b8def', GREY = '#7d8a83', VIOLET = '#c084fc';
  const pct = (v, d = 1) => finite(v) ? (v * 100).toFixed(d) + '%' : '—';
  const usd = v => finite(v) ? '$' + v.toFixed(v < 10 ? 3 : 2) : '—';
  const R = 0.043; // flat risk-free rate for discounting; the forward comes from put–call parity, so dividends need no estimate
  const N = x => 0.5 * erfc(-x / Math.SQRT2);

  /* -------------------------------------------- pricing maths -------------------------------------------- */
  function black(F, K, Tm, sig, D, call) {
    if (!(sig > 0) || !(Tm > 0)) return D * Math.max(0, call ? F - K : K - F);
    const v = sig * Math.sqrt(Tm), d1 = (Math.log(F / K) + v * v / 2) / v, d2 = d1 - v;
    return call ? D * (F * N(d1) - K * N(d2)) : D * (K * N(-d2) - F * N(-d1));
  }
  function implied(price, F, K, Tm, D, call) {
    const intrinsic = D * Math.max(0, call ? F - K : K - F); if (!(price > intrinsic + 1e-6)) return NaN;
    let lo = 1e-4, hi = 5; if (black(F, K, Tm, hi, D, call) < price) return NaN;
    for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (black(F, K, Tm, m, D, call) > price) hi = m; else lo = m; }
    return (lo + hi) / 2;
  }
  // Out-of-the-money quotes with a live two-sided market; forward per expiry from put–call parity near the money.
  function prepare(u) {
    const quotes = [], exps = [];
    for (const e of u.expiries || []) {
      if (!(e.dte >= 1) || !Array.isArray(e.chain)) continue;
      const Tm = e.dte / 365, D = Math.exp(-R * Tm), mid = o => o && o.bid > 0 && o.ask >= o.bid ? (o.bid + o.ask) / 2 : NaN;
      const par = e.chain.filter(r => finite(mid(r.call)) && finite(mid(r.put))).sort((a, b) => Math.abs(a.strike - u.price) - Math.abs(b.strike - u.price)).slice(0, 3).map(r => r.strike + (mid(r.call) - mid(r.put)) / D);
      const F = par.length ? par.reduce((a, b) => a + b, 0) / par.length : u.price * Math.exp(R * Tm);
      const rows = [];
      for (const r of e.chain) {
        const call = r.strike >= F, o = call ? r.call : r.put, m = mid(o); if (!finite(m) || m < 0.02) continue;
        const iv = implied(m, F, r.strike, Tm, D, call); if (!(iv > 0.01 && iv < 3)) continue;
        rows.push({exp: e.date, dte: e.dte, Tm, D, F, K: r.strike, call, bid: o.bid, ask: o.ask, mid: m, iv, cboeIV: o.iv, k: Math.log(r.strike / F), oi: o.oi || 0, vol: o.volume || 0});
      }
      if (rows.length >= 5) { quotes.push(...rows); const atm = rows.reduce((b, q) => Math.abs(q.k) < Math.abs(b.k) ? q : b); exps.push({date: e.date, dte: e.dte, Tm, F, D, atmIV: atm.iv, n: rows.length}); }
    }
    return {quotes, exps};
  }
  function fitModels(train, exps) {
    const atmOf = Tm => { const s = [...exps].sort((a, b) => a.Tm - b.Tm); if (Tm <= s[0].Tm) return s[0].atmIV; for (let i = 1; i < s.length; i++) if (Tm <= s[i].Tm) { const w = (Tm - s[i - 1].Tm) / (s[i].Tm - s[i - 1].Tm); return s[i - 1].atmIV * (1 - w) + s[i].atmIV * w; } return s[s.length - 1].atmIV; };
    const near = train.filter(q => Math.abs(q.k) < 0.03).map(q => q.iv).sort((a, b) => a - b), flat = near.length ? near[Math.floor(near.length / 2)] : exps[0].atmIV;
    // per-expiry quadratic smile by least squares on the training quotes
    const quad = new Map();
    for (const e of exps) {
      const pts = train.filter(q => q.exp === e.date); if (pts.length < 4) continue;
      let S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
      for (const q of pts) { const x = [1, q.k, q.k * q.k]; for (let i = 0; i < 3; i++) { b[i] += x[i] * q.iv; for (let j = 0; j < 3; j++) S[i][j] += x[i] * x[j]; } }
      const sol = ML.solve(Float64Array.from(S.flat().map((v, i) => v + (i % 4 === 0 ? 1e-9 : 0))), Float64Array.from(b), 3); if (sol) quad.set(e.date, Array.from(sol));
    }
    // The net learns the smile around each expiry's at-the-money level (inputs: moneyness / √time, moneyness, √time,
    // the level itself); predicting the level and the shape at once would make it underfit both.
    const fx = q => [q.k / Math.sqrt(q.Tm), q.k, Math.sqrt(q.Tm), atmOf(q.Tm)];
    const X = train.map(fx), z = ML.standardizer(X), ys = train.map(q => q.iv - atmOf(q.Tm)), ym = ys.reduce((a, b) => a + b, 0) / ys.length, ysd = Math.sqrt(ys.reduce((a, b) => a + (b - ym) ** 2, 0) / ys.length) || 0.01;
    const net = ML.mlpRegFit(X.map(z), ys.map(v => (v - ym) / ysd), {hidden: [24, 24], epochs: 500, lr: 0.008, batch: 16, seed: 7});
    return {
      flat: () => flat,
      term: q => atmOf(q.Tm),
      quad: q => { const c = quad.get(q.exp); return c ? Math.max(0.01, c[0] + c[1] * q.k + c[2] * q.k * q.k) : atmOf(q.Tm); },
      nn: q => Math.max(0.01, atmOf(q.Tm) + ym + ysd * net.predict(z(fx(q))))
    };
  }
  const MODELS = [['flat', 'Black–Scholes, one volatility', GREY], ['term', 'Black–Scholes + term structure', BLUE], ['quad', 'Quadratic smile per expiry', VIOLET], ['nn', 'Neural-net volatility surface', AMBER]];
  function score(models, test) {
    const out = {};
    for (const [k] of MODELS) {
      let se = 0, ive = 0, ape = 0, inside = 0;
      for (const q of test) { const s = models[k](q), p = black(q.F, q.K, q.Tm, s, q.D, q.call); se += (p - q.mid) ** 2; ive += (s - q.iv) ** 2; ape += Math.abs(p - q.mid) / q.mid; if (p >= q.bid - 1e-9 && p <= q.ask + 1e-9) inside++; }
      out[k] = {rmse: Math.sqrt(se / test.length), ivRmse: Math.sqrt(ive / test.length), mape: ape / test.length, inside: inside / test.length, insideCount: inside};
    }
    return out;
  }
  function analyse(u) {
    const {quotes, exps} = prepare(u);
    if (quotes.length < 30 || exps.length < 2) throw new Error(`Not enough two-sided quotes for ${u.symbol} right now.`);
    let s = 12345; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const train = [], test = []; quotes.forEach(q => (rnd() < 0.7 ? train : test).push(q));
    if (!train.length || !test.length) throw new Error('Not enough distinct quotes for a model evaluation.');
    const models = fitModels(train, exps), sc = score(models, test), full = fitModels(quotes, exps);
    const evaluation = new Map(exps.map(({date}) => {
      const selected = test.filter(q => q.exp === date);
      return [date, selected.length ? {n: selected.length, scores: score(models, selected)} : null];
    }));
    return {u, quotes, exps, train, test, sc, evaluation, full, best: MODELS.map(m => m[0]).sort((a, b) => sc[b].inside - sc[a].inside || sc[a].rmse - sc[b].rmse)[0]};
  }

  /* ------------------------------------------------ charts ------------------------------------------------ */
  const ivColor = t => { const c = [[59, 76, 192], [91, 141, 239], [62, 207, 142], [255, 176, 0], [255, 90, 79]], x = Math.max(0, Math.min(1, t)) * 4, i = Math.min(3, Math.floor(x)), f = x - i, m = (a, b) => Math.round(a + (b - a) * f); return `rgb(${m(c[i][0], c[i + 1][0])},${m(c[i][1], c[i + 1][1])},${m(c[i][2], c[i + 1][2])})`; };
  function surface3d(box, a, az) {
    const {w, h, s} = frame(box, 'Implied volatility surface (3-D)', 360), K = a.quotes.map(q => q.k), kmin = Math.max(-0.25, Math.min(...K)), kmax = Math.min(0.25, Math.max(...K)), tmin = a.exps[0].Tm, tmax = a.exps[a.exps.length - 1].Tm, GX = 18, GY = 12;
    const grid = []; let vmin = Infinity, vmax = -Infinity;
    for (let j = 0; j <= GY; j++) { const row = []; for (let i = 0; i <= GX; i++) { const k = kmin + (kmax - kmin) * i / GX, Tm = tmin + (tmax - tmin) * j / GY, v = a.full.nn({k, Tm}); row.push(v); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); } grid.push(row); }
    const th = az * Math.PI / 180, el = 0.55, sc = Math.min(w, h * 1.6) * 0.33, cx = w / 2, cy = h * 0.58, zr = (vmax - vmin) || 0.01;
    const P = (x, y, z) => { const X = x * Math.cos(th) - y * Math.sin(th), Y = x * Math.sin(th) + y * Math.cos(th); return [cx + sc * X, cy + sc * (Y * Math.sin(el) - z * 1.1 * Math.cos(el)), Y]; };
    const nx = i => -1 + 2 * i / GX, ny = j => -1 + 2 * j / GY, nz = v => (v - vmin) / zr;
    // floor and axes
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => P(x, y, 0));
    s.append(svg('polygon', {points: corners.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '), fill: '#0d1312', stroke: '#26302c'}));
    const quads = [];
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) { const pts = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a2, b2]) => P(nx(a2), ny(b2), nz(grid[b2][a2]))), avg = (grid[j][i] + grid[j][i + 1] + grid[j + 1][i + 1] + grid[j + 1][i]) / 4; quads.push({pts, depth: pts.reduce((t, p) => t + p[2], 0) / 4, v: avg}); }
    quads.sort((p, q) => q.depth - p.depth).forEach(q => s.append(svg('polygon', {points: q.pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '), fill: ivColor((q.v - vmin) / zr), 'fill-opacity': 0.92, stroke: '#0b0f0e', 'stroke-width': 0.4})));
    // market quotes as dots
    for (const q of a.quotes) { if (q.k < kmin || q.k > kmax) continue; const p = P(-1 + 2 * (q.k - kmin) / (kmax - kmin), -1 + 2 * (q.Tm - tmin) / ((tmax - tmin) || 1), nz(q.iv)); const c = svg('circle', {cx: p[0], cy: p[1], r: 2, fill: '#fff', 'fill-opacity': 0.75}); const t = svg('title'); t.textContent = `${q.call ? 'Call' : 'Put'} ${q.K} · ${q.exp} · IV ${(q.iv * 100).toFixed(1)}%`; c.append(t); s.append(c); }
    const ax = (x, y, txt) => { const p = P(x, y, 0); label(s, p[0], p[1] + 14, txt, {'text-anchor': 'middle'}); };
    ax(0, 1.25, 'moneyness ln(K/F)'); ax(1.3, 0, 'expiry'); ax(-1, 1.12, (kmin * 100).toFixed(0) + '%'); ax(1, 1.12, '+' + (kmax * 100).toFixed(0) + '%');
    label(s, 10, 16, `IV ${(vmin * 100).toFixed(0)}% → ${(vmax * 100).toFixed(0)}% · ${a.exps[0].dte}–${a.exps[a.exps.length - 1].dte} days · dots = market quotes`, {});
    box.replaceChildren(s);
  }
  function smile(box, a, date) {
    const pts = a.quotes.filter(q => q.exp === date), e = a.exps.find(x => x.date === date); if (!pts.length || !e) return;
    const {w, h, s} = frame(box, 'Volatility smile', 260), pl = 44, pr = 10, pt = 10, pb = 26, iw = w - pl - pr, ih = h - pt - pb;
    const ks = pts.map(q => q.K), x0 = Math.min(...ks), x1 = Math.max(...ks), grid = Array.from({length: 60}, (_, i) => x0 + (x1 - x0) * i / 59), curve = f => grid.map(K => ({K, v: f({k: Math.log(K / e.F), Tm: e.Tm, exp: date})}));
    const lines = [['flat', GREY], ['term', BLUE], ['quad', VIOLET], ['nn', AMBER]].map(([m, c]) => [curve(a.full[m]), c]);
    const all = [...pts.map(q => q.iv), ...lines.flatMap(l => l[0].map(p => p.v))], y0 = Math.min(...all) * 0.95, y1 = Math.max(...all) * 1.05, X = K => pl + (K - x0) / ((x1 - x0) || 1) * iw, Y = v => pt + (y1 - v) / ((y1 - y0) || 1) * ih;
    for (const v of [y0, (y0 + y1) / 2, y1]) { s.append(svg('line', {x1: pl, x2: w - pr, y1: Y(v), y2: Y(v), stroke: '#1b2421'})); label(s, pl - 4, Y(v) + 3, (v * 100).toFixed(0) + '%', {'text-anchor': 'end'}); }
    s.append(svg('line', {x1: X(e.F), x2: X(e.F), y1: pt, y2: pt + ih, stroke: '#4b5953', 'stroke-dasharray': '3 3'})); label(s, X(e.F), h - 4, 'forward ' + e.F.toFixed(2), {'text-anchor': 'middle'});
    for (const [l, c] of lines) { let d = ''; l.forEach((p, i) => d += (i ? 'L' : 'M') + X(p.K).toFixed(1) + ' ' + Y(p.v).toFixed(1)); s.append(svg('path', {d, fill: 'none', stroke: c, 'stroke-width': c === AMBER ? 2.2 : 1.3})); }
    pts.forEach(q => { const c = svg('circle', {cx: X(q.K), cy: Y(q.iv), r: 3.2, fill: q.call ? GREEN : RED, stroke: '#000', 'stroke-width': 0.5}); const t = svg('title'); t.textContent = `${q.call ? 'Call' : 'Put'} ${q.K}: market ${(q.iv * 100).toFixed(1)}% · bid ${q.bid} ask ${q.ask}`; c.append(t); s.append(c); });
    label(s, pl, h - 4, x0.toFixed(0), {}); label(s, w - pr, h - 4, x1.toFixed(0), {'text-anchor': 'end'});
    box.replaceChildren(s);
  }

  /* ------------------------------------------------- page ------------------------------------------------- */
  const OV = (() => { let s = {}; try { s = JSON.parse(store.get('optlab') || '{}') || {}; } catch (_) {} return {sym: typeof s.sym === 'string' ? s.sym.slice(0, 10) : 'SPY', az: Number.isFinite(s.az) ? s.az : 35, exp: typeof s.exp === 'string' ? s.exp : ''}; })();
  const save = () => store.set('optlab', JSON.stringify(OV));
  const memo = new Map();
  const getU = async () => { for (let k = 0; k < 40 && !T.S.opts; k++) await new Promise(r => setTimeout(r, 250)); const U = T.S.opts?.underlyings; if (!U) throw new Error('Option chains are still loading. Try again in a moment.'); return U; };
  const get = async sym => { const U = await getU(), u = U[sym] || U.SPY; const key = u.symbol + '|' + (T.S.opts.generatedAt || ''); if (!memo.has(key)) memo.set(key, analyse(u)); return memo.get(key); };
  async function renderPanel() {
    const host = panel('optlab'); empty(host, 'Fitting the volatility surface…');
    let a; try { a = await get(OV.sym); } catch (e) { report('optlab', e); return empty(host, e.message); }
    if (!$('tp-optlab')) return; host.replaceChildren(); setText('n-optlab', `${a.u.symbol} · ${a.quotes.length} quotes`);
    const w = el('div', 'fx-ql'), f = a.sc.flat, n = a.sc.nn; host.append(w);
    kpis(w, [['NEURAL NET IN SPREAD', pct(n.inside, 0), `RMSE ${usd(n.rmse)}`, AMBER], ['FLAT BLACK–SCHOLES', pct(f.inside, 0), `RMSE ${usd(f.rmse)}`], ['ATM IV', pct(a.exps[0].atmIV, 1), `${a.exps[0].dte}-day expiry`]]);
    const cb = el('div', 'fx-ql-chart'); w.append(cb); requestAnimationFrame(() => surface3d(cb, a, OV.az));
  }
  async function renderPage(host, arg) {
    if (arg && /^[A-Z]{1,6}$/.test(String(arg).toUpperCase())) { OV.sym = String(arg).toUpperCase(); save(); }
    PG.setHead('OPTLAB', 'Options pricing lab', 'Black–Scholes against a neural-network volatility surface on real Cboe chains, evaluated on quotes excluded from the fit, with a 3-D volatility surface');
    const wrap = el('div', 'fx-ql fx-ql-page'); host.append(wrap); const rerun = () => { if (wrap.isConnected) PG.rerender(); };
    const ic = el('div', 'fx-ql-card'); ic.append(el('h3', '', 'UNDERLYING'));
    const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:12px'; wrap.append(ic, out); out.append(note('Reading the delayed option chains and fitting four pricing models…'));
    let U; try { U = await getU(); } catch (e) { report('optlab', e); return out.replaceChildren(el('div', 'fx-sl-err', e.message)); }
    ic.append(chips(Object.keys(U).map(k => [k, k]), U[OV.sym] ? OV.sym : 'SPY', v => { OV.sym = v; OV.exp = ''; save(); rerun(); }));
    let a; try { a = await get(OV.sym); } catch (e) { report('optlab', e); return out.replaceChildren(el('div', 'fx-sl-err', e.message)); }
    if (!out.isConnected) return; out.replaceChildren();
    const S = a.sc, f = S.flat, n = S.nn, q = S.quad, best = MODELS.find(m => m[0] === a.best);
    const hd = el('div', 'fx-ql-head'), s0 = el('span', 'fx-ql-state', `${best[1].toUpperCase()} PRICES BEST`); s0.style.color = best[2];
    hd.append(s0, el('span', 'fx-ql-sub', `${a.u.symbol} at ${usd(a.u.price)}: ${a.quotes.length} out-of-the-money quotes across ${a.exps.length} expiries (${a.exps[0].dte} to ${a.exps[a.exps.length - 1].dte} days). Models fitted on ${a.train.length}, evaluated on ${a.test.length} quotes excluded from the fit. ${T.S.opts.source}, ${new Date(T.S.opts.generatedAt).toLocaleString()}.`)); out.append(hd);
    kpis(out, MODELS.map(([k, name, c]) => [name.toUpperCase(), pct(S[k].inside, 0) + ' in spread', `price RMSE ${usd(S[k].rmse)} · IV error ${(S[k].ivRmse * 100).toFixed(2)} pts`, c]));
    const v = el('div', 'fx-ql-verdict'); v.style.borderColor = AMBER;
    v.textContent = `On the evaluation quotes, a single Black–Scholes volatility lands inside the market’s bid–ask spread only ${pct(f.inside, 0)} of the time (average miss ${pct(f.mape, 0)} of the price): real options have a volatility smile and a term structure that one number cannot capture. Adding the term structure helps (${pct(S.term.inside, 0)}); a quadratic smile per expiry gets ${pct(q.inside, 0)}; the neural network, which learns the whole surface from moneyness and time, gets ${pct(n.inside, 0)} with an implied-volatility error of ${(n.ivRmse * 100).toFixed(2)} points. Pricing inside the spread is the bar a market maker cares about.`;
    out.append(v);
    const sc = chartBox(380), slider = el('input'); slider.type = 'range'; slider.min = 0; slider.max = 360; slider.value = OV.az; slider.setAttribute('aria-label', 'Rotate the surface'); slider.style.width = '220px';
    const rot = el('label', 'fx-ql-sub', 'Rotate '); rot.append(slider);
    slider.addEventListener('input', () => { OV.az = +slider.value; surface3d(sc, a, OV.az); }); slider.addEventListener('change', save);
    out.append(card('IMPLIED-VOLATILITY SURFACE (NEURAL NET, FITTED TO ALL QUOTES) · DRAG THE SLIDER TO ROTATE', sc, rot));
    const two = el('div', 'fx-ml-grid'); two.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px'; out.append(two);
    const exp = a.exps.find(x => x.date === OV.exp) ? OV.exp : a.exps[Math.min(2, a.exps.length - 1)].date, smc = chartBox(260), tc = chartBox(260);
    const es = el('select'); a.exps.forEach(x => { const o = el('option', '', `${x.date} · ${x.dte}d · ATM ${pct(x.atmIV, 1)}`); o.value = x.date; if (x.date === exp) o.selected = true; es.append(o); }); es.setAttribute('aria-label', 'Expiry');
    es.style.minHeight = '44px';
    es.addEventListener('change', () => { OV.exp = es.value; save(); smile(smc, a, OV.exp); fillTable(OV.exp); renderEvaluation(OV.exp); });
    const lg = el('div', 'fx-ql-sub', 'Dots: market (green calls, red puts) · lines: grey one volatility, blue term structure, violet quadratic, amber neural net');
    two.append(card('VOLATILITY SMILE', es, smc, lg), card('TERM STRUCTURE · AT-THE-MONEY IMPLIED VOLATILITY', tc, note('Upward-sloping is normal; an inverted curve (short-dated volatility above long-dated) means the market expects near-term turbulence.')));
    const evalSummary = note(''), evalTable = el('div');
    evalSummary.setAttribute('role', 'status');
    evalTable.style.overflowX = 'auto';
    function renderEvaluation(date) {
      const row = a.evaluation.get(date);
      evalSummary.textContent = row ? `${date} · ${row.n} evaluation quote${row.n === 1 ? '' : 's'}. Small samples can make model comparisons noisy.` :
        `${date} · No evaluation quotes for this expiry. Choose another expiry.`;
      evalTable.textContent = '';
      if (!row) return;
      const table = el('table', 'fx-ql-tbl'), thead = el('thead'), hr = el('tr'), tbody = el('tbody');
      table.setAttribute('aria-label', 'Evaluation scores for ' + date);
      for (const title of ['Model', 'Inside bid–ask', 'Price RMSE']) {
        const th = el('th', '', title); th.scope = 'col'; hr.append(th);
      }
      thead.append(hr); table.append(thead, tbody);
      for (const [key, label] of MODELS) {
        const m = row.scores[key], tr = el('tr'), th = el('th', '', label);
        th.scope = 'row'; th.style.whiteSpace = 'normal';
        tr.append(th, el('td', '', `${m.insideCount} / ${row.n} (${pct(m.inside, 0)})`), el('td', '', usd(m.rmse)));
        tbody.append(tr);
      }
      evalTable.append(table);
    }
    renderEvaluation(exp);
    out.append(card('MODEL EVALUATION BY EXPIRY', evalSummary, evalTable,
      note('Fitted on the training subset and scored only on the evaluation quotes. Both groups use the same chain-derived forward and at-the-money volatility. Price RMSE is the typical size of a model’s price error in dollars; lower is better.')));
    const tbWrap = el('div'); tbWrap.style.cssText = 'max-height:340px;overflow:auto';
    function fillTable(date) {
      const t = el('table', 'fx-ql-tbl'), hr = el('tr'); ['Strike', 'Type', 'Bid', 'Ask', 'Market IV', 'One-vol BS', 'Quadratic', 'Neural net', 'Set'].forEach(x => hr.append(el('th', '', x))); t.append(hr);
      for (const qq of a.quotes.filter(x => x.exp === date)) {
        const tr = el('tr'), price = m => black(qq.F, qq.K, qq.Tm, a.full[m](qq), qq.D, qq.call), cell = m => { const p = price(m), td = el('td', '', usd(p)); td.style.color = p >= qq.bid && p <= qq.ask ? GREEN : RED; return td; };
        tr.append(el('td', '', String(qq.K)), el('td', '', qq.call ? 'Call' : 'Put'), el('td', '', usd(qq.bid)), el('td', '', usd(qq.ask)), el('td', '', pct(qq.iv, 1)), cell('flat'), cell('quad'), cell('nn'), el('td', '', a.test.includes(qq) ? 'test' : 'train'));
        t.append(tr);
      }
      tbWrap.replaceChildren(t);
    }
    out.append(card('MODEL PRICES FOR THE SELECTED EXPIRY · REFIT ON ALL QUOTES · GREEN = INSIDE BID–ASK', tbWrap));
    out.append(card('HOW IT WORKS', ...[`Data: ${T.S.opts.source}, the 21 strikes around the money for the next ten expiries. Only out-of-the-money options with a live bid and ask are used (calls above the forward, puts below), the standard practice because they are the most liquid.`, `Pricing: Black-76 on the forward implied by put–call parity at the three strikes nearest the money, discounted at ${(R * 100).toFixed(1)}%. Implied volatilities are solved from each mid price with the same model, so every comparison is like for like.`, 'Models: one volatility (the median at-the-money implied volatility); a term structure (at-the-money volatility interpolated by expiry); a quadratic smile in log-moneyness fitted per expiry; and a neural network (two layers of 24 tanh units) that learns the smile around each expiry’s at-the-money level from moneyness, moneyness ÷ √time and √time, across all expiries at once. 70% of quotes train, 30% test.', 'The snapshot covers short-dated expiries only, so the surface describes the next few weeks. Not advice.'].map(note)));
    requestAnimationFrame(() => {
      surface3d(sc, a, OV.az); smile(smc, a, exp); fillTable(exp);
      lineChart(tc, {series: [{v: a.exps.map(x => x.atmIV), color: AMBER, width: 2, name: 'ATM IV'}], xs: a.exps.map(x => `${x.date.slice(5)} (${x.dte}d)`), yfmt: x => (x * 100).toFixed(1) + '%', aria: 'ATM implied volatility by expiry'});
    });
  }
  T.PANELS.optlab = ['OPTLAB', 'Options pricing lab', 'optlab']; T.PANEL_DESC.optlab = 'Black–Scholes vs neural-net volatility surface, 3-D'; T.LINK_LABEL.optlab = 'Full'; T.RENDER.optlab = renderPanel;
  if (PG) { for (const n of ['optlab', 'ivsurf', 'bsnn']) { T.premium?.(n, 'ai', 'Options pricing lab', ['optlab']); PG.add(n, 'Options pricing lab', renderPage); } T.PAGE_NAMES.push('OPTLAB', 'IVSURF', 'BSNN'); }
  const grp = T.EXTRA_GROUPS.find(g => g[0] === 'AI lab'); if (grp) grp[1].push('optlab'); else T.EXTRA_GROUPS.push(['AI lab', ['optlab']]);
  T.OptLab = {black, implied, prepare, fitModels, score, analyse};
});
