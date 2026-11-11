/* FYNX Terminal plugin: chart workstation (compare + drawing tools), portfolio risk analytics and new listings.
 * Uses real daily price history only; every number is arithmetic on those prices. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  if (!PG) return;
  const {S, el, btn, svg, signed, tone, fmt, day, finite, rowButton, kv, store, shortOf, nameOf, quoteFor, digitsOf} = T;
  const read = (k, d) => { try { return JSON.parse(store.get(k) || 'null') ?? d; } catch { return d; } };
  const write = (k, v) => store.set(k, JSON.stringify(v));

  /* ===== CHART: candles, volume, compare, drawings ====================================== */
  const RANGES = [[21, '1M'], [63, '3M'], [126, '6M'], [252, '1Y'], [504, '2Y'], [1260, '5Y']];
  function priceChart(host, rows, sym, {drawKey, tool, onMeasure}) {
    const W = 1100, H = 440, VH = 70, L = 8, R = 70, T0 = 10, B = 24, dg = digitsOf(sym);
    const hasOHLC = rows.every(r => finite(r.open) && finite(r.high) && finite(r.low));
    const hi = Math.max(...rows.map(r => hasOHLC ? r.high : r.close)), lo = Math.min(...rows.map(r => hasOHLC ? r.low : r.close)), pad = (hi - lo) * 0.06 || hi * 0.01;
    const pH = H - VH - B - T0, n = rows.length, step = (W - L - R) / n;
    const x = i => L + (i + 0.5) * step, y = v => T0 + (hi + pad - v) / (hi - lo + 2 * pad) * pH, inv = py => hi + pad - (py - T0) / pH * (hi - lo + 2 * pad), ix = px => Math.max(0, Math.min(n - 1, Math.round((px - L) / step - 0.5)));
    const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart pg-pchart', role: 'img', 'aria-label': `${nameOf(sym)} ${n} daily bars from ${fmt(rows[0].close, dg)} to ${fmt(rows.at(-1).close, dg)}`});
    for (let k = 0; k <= 5; k++) { const v = lo - pad + (hi - lo + 2 * pad) * k / 5; c.append(svg('line', {x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'g'})); const t = svg('text', {x: W - R + 6, y: y(v) + 4, class: 'a'}); t.textContent = fmt(v, dg); c.append(t); }
    const maxV = Math.max(...rows.map(r => r.volume || 0));
    rows.forEach((r, i) => {
      const up = r.close >= (hasOHLC ? r.open : rows[i - 1]?.close ?? r.close), col = up ? '#3ecf8e' : '#ff6b5f';
      if (maxV > 0 && r.volume) { const vh = r.volume / maxV * (VH - 8); c.append(svg('rect', {x: x(i) - step * 0.35, width: Math.max(1, step * 0.7), y: H - B - vh, height: vh, fill: col, 'fill-opacity': 0.35})); }
      if (hasOHLC && step >= 2.2) { c.append(svg('line', {x1: x(i), x2: x(i), y1: y(r.high), y2: y(r.low), stroke: col, 'stroke-width': 1})); const top = y(Math.max(r.open, r.close)), h = Math.max(1, Math.abs(y(r.open) - y(r.close))); c.append(svg('rect', {x: x(i) - step * 0.33, width: Math.max(1, step * 0.66), y: top, height: h, fill: col})); }
    });
    if (!hasOHLC || step < 2.2) c.append(svg('polyline', {points: rows.map((r, i) => `${x(i).toFixed(1)},${y(r.close).toFixed(1)}`).join(' '), fill: 'none', stroke: '#e7ece9', 'stroke-width': 1.5}));
    [0, Math.floor(n / 3), Math.floor(2 * n / 3), n - 1].forEach((i, k) => { const t = svg('text', {x: x(i), y: H - 6, class: 'a', 'text-anchor': k === 0 ? 'start' : k === 3 ? 'end' : 'middle'}); t.textContent = day(rows[i].date.slice(0, 10)); c.append(t); });
    // drawings
    const layer = svg('g'); c.append(layer);
    const idxOf = date => { const d = date.slice(0, 10); let j = rows.findIndex(r => r.date.slice(0, 10) >= d); return j < 0 ? n - 1 : j; };
    const draw = () => {
      layer.replaceChildren();
      for (const [k, d] of read(drawKey, []).entries()) {
        if (d.type === 'h') { if (d.price < lo - pad || d.price > hi + pad) continue; layer.append(svg('line', {x1: L, x2: W - R, y1: y(d.price), y2: y(d.price), stroke: '#ffb000', 'stroke-width': 1.3, 'stroke-dasharray': '6 4'})); const t = svg('text', {x: W - R + 6, y: y(d.price) - 3, fill: '#ffb000', 'font-size': 10, 'font-family': 'IBM Plex Mono, monospace'}); t.textContent = fmt(d.price, dg); layer.append(t); }
        if (d.type === 'trend') { const i1 = idxOf(d.a.date), i2 = idxOf(d.b.date); if (i1 === i2) continue; const slope = (d.b.price - d.a.price) / (i2 - i1), ext = n - 1; layer.append(svg('line', {x1: x(i1), y1: y(d.a.price), x2: x(ext), y2: y(d.a.price + slope * (ext - i1)), stroke: '#5b8def', 'stroke-width': 1.6})); layer.append(svg('circle', {cx: x(i1), cy: y(d.a.price), r: 3, fill: '#5b8def'}), svg('circle', {cx: x(i2), cy: y(d.b.price), r: 3, fill: '#5b8def'})); }
        void k;
      }
    };
    draw();
    const cross = svg('line', {class: 'cx', y1: T0, y2: H - B, x1: -10, x2: -10}), hl = svg('line', {class: 'cx', x1: L, x2: W - R, y1: -10, y2: -10}), temp = svg('line', {stroke: '#c4a1ff', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', x1: -10, x2: -10, y1: -10, y2: -10});
    c.append(cross, hl, temp);
    const read0 = el('p', 'fx-readout', 'Hover for values · pick a tool above to draw');
    let start = null;
    const pt = e => { const b = c.getBoundingClientRect(); return {px: (e.clientX - b.left) / b.width * W, py: (e.clientY - b.top) / b.height * H}; };
    c.addEventListener('pointermove', e => {
      const {px, py} = pt(e), i = ix(px), r = rows[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); hl.setAttribute('y1', py); hl.setAttribute('y2', py);
      read0.textContent = `${r.date.slice(0, 10)} · ${hasOHLC ? `O ${fmt(r.open, dg)} H ${fmt(r.high, dg)} L ${fmt(r.low, dg)} ` : ''}C ${fmt(r.close, dg)}${r.volume ? ` · Vol ${r.volume.toLocaleString()}` : ''} · cursor ${fmt(inv(py), dg)}`;
      if (start) { temp.setAttribute('x2', px); temp.setAttribute('y2', py); if (tool() === 'measure') { const p0 = start.price, p1 = inv(py); onMeasure(`${fmt(p0, dg)} → ${fmt(p1, dg)}: ${signed((p1 / p0 - 1) * 100, 2, '%')} over ${Math.abs(i - start.i)} sessions`); } }
    });
    c.addEventListener('pointerdown', e => {
      const t = tool(); if (t === 'none') return; const {px, py} = pt(e), i = ix(px), price = inv(py);
      if (t === 'h') { const list = read(drawKey, []); list.push({type: 'h', price}); write(drawKey, list); draw(); return; }
      start = {i, price, date: rows[i].date}; temp.setAttribute('x1', x(i)); temp.setAttribute('y1', y(price)); temp.setAttribute('x2', x(i)); temp.setAttribute('y2', y(price)); c.setPointerCapture?.(e.pointerId);
    });
    c.addEventListener('pointerup', e => {
      if (!start) return; const {px, py} = pt(e), i = ix(px), price = inv(py), t = tool();
      if (t === 'trend' && i !== start.i) { const list = read(drawKey, []); list.push({type: 'trend', a: {date: start.date, price: start.price}, b: {date: rows[i].date, price}}); write(drawKey, list); draw(); }
      start = null; ['x1', 'x2', 'y1', 'y2'].forEach(a => temp.setAttribute(a, -10));
    });
    host.append(c, read0);
    return {redraw: draw};
  }
  PG.add('chart', 'Chart', async (host, sym, alive) => {
    sym = sym || S.sym?.symbol || S.focus;
    let range = 252, mode = 'price', tool = 'none';
    const cmpKey = 'cmp-list', drawKey = 'draw-' + sym;
    PG.setHead('GP', `${shortOf(sym)} · ${nameOf(sym)}`, 'Candles, volume, comparison and drawing tools · daily bars');
    const bar = el('div', 'pg-toolbar'), box = el('div', 'pg-chart'), info = el('p', 'pg-note'), msg = el('p', 'pg-measure', '');
    host.append(PG.chips([btn(`Load every box for ${shortOf(sym)} ▸`, 'fx-chip fx-chip-link pg-primary', () => T.setSymbol({symbol: sym})), PG.go('Security page', 'des', sym), btn('Change market ▸', 'fx-chip fx-chip-link', () => T.openFinder({title: 'Chart a market', onPick: m => { PG.closeAll(); T.openPage('chart', m.symbol); }}))]), bar, msg, box, info);
    const data = await T.symHistory(sym, '5y'); if (!alive()) return;
    if (!data?.rows?.length) { box.append(el('p', 'fx-empty', 'Daily history is not available for this market.')); return; }
    const cmpList = () => read(cmpKey, ['SPY']).filter(s => s !== sym).slice(0, 5);
    const drawBar = () => {
      bar.replaceChildren(PG.pageTabs(RANGES.filter(([k], i) => i === 0 || data.rows.length > RANGES[i - 1][0]), range, v => { range = v; drawBar(); render(); }), PG.pageTabs([['price', 'Price'], ['compare', 'Compare %']], mode, v => { mode = v; drawBar(); render(); }));
      if (mode === 'price') bar.append(PG.pageTabs([['none', 'Pointer'], ['trend', 'Trend line'], ['h', 'Level'], ['measure', 'Measure']], tool, v => { tool = v; drawBar(); }), btn('Clear drawings', 'fx-chip', () => { write(drawKey, []); render(); }));
      else { const c = el('div', 'fx-chips'); cmpList().forEach(s => c.append(btn(`${shortOf(s)} ✕`, 'fx-chip', () => { write(cmpKey, read(cmpKey, ['SPY']).filter(x => x !== s)); drawBar(); render(); }, `Remove ${s}`))); c.append(btn('+ Add market', 'fx-chip fx-chip-link', () => T.openFinder({title: 'Compare with…', onPick: m => { const l = read(cmpKey, ['SPY']); if (!l.includes(m.symbol)) l.push(m.symbol); write(cmpKey, l.slice(-5)); drawBar(); render(); }}))); bar.append(c); }
    };
    const render = async () => {
      box.replaceChildren(); msg.textContent = '';
      if (mode === 'price') {
        const rows = data.rows.slice(-range);
        priceChart(box, rows, sym, {drawKey, tool: () => tool, onMeasure: t => { msg.textContent = t; }});
        const first = rows[0].close, last = rows.at(-1).close, hi = Math.max(...rows.map(r => r.high ?? r.close)), lo = Math.min(...rows.map(r => r.low ?? r.close));
        info.textContent = `${data.source || 'Yahoo Finance'} · ${rows.length} sessions · change ${signed((last / first - 1) * 100, 2, '%')} · high ${fmt(hi, digitsOf(sym))} · low ${fmt(lo, digitsOf(sym))} · drawings are saved in this browser`;
      } else {
        const others = cmpList(), series = await Promise.all(others.map(s => T.symHistory(s, '5y'))); if (!alive()) return;
        box.append(T.compareChart([{label: shortOf(sym), rows: data.rows}, ...series.map((d, i) => ({label: shortOf(others[i]), rows: d?.rows || []}))], {W: 1100, H: 420, sessions: range}));
        info.textContent = 'Each line starts at 0% on the first common day of the range; price change only.';
      }
    };
    drawBar(); render();
  });

  /* ===== PORTFOLIO ANALYTICS ================================================================ */
  const PKEY = 'portfolio';
  const holdings = () => read(PKEY, []).filter(h => h && /^[A-Za-z0-9.\-=^&]{1,24}$/.test(h.symbol) && finite(h.qty) && h.qty > 0);
  async function analyze() {
    const list = holdings(); if (!list.length) return null;
    const hist = await Promise.all(list.map(h => T.symHistory(h.symbol, '2y'))), bench = await T.symHistory('SPY', '2y');
    const series = list.map((h, i) => ({...h, rows: hist[i]?.rows || [], currency: hist[i]?.currency || 'USD', name: hist[i]?.name || nameOf(h.symbol)})).filter(h => h.rows.length > 30);
    if (!series.length) return {empty: true};
    const dates = [...new Set(series.flatMap(h => h.rows.slice(-253).map(r => r.date.slice(0, 10))))].sort().slice(-253);
    const priceAt = series.map(h => { const m = new Map(h.rows.map(r => [r.date.slice(0, 10), r.close])); let last = null; return dates.map(d => (last = m.get(d) ?? last)); });
    const ok = dates.map((_, j) => priceAt.every(p => finite(p[j])));
    const idx = dates.map((d, j) => j).filter(j => ok[j]);
    const value = idx.map(j => series.reduce((s, h, i) => s + h.qty * priceAt[i][j], 0));
    const pr = [], hr = series.map(() => []);
    for (let k = 1; k < idx.length; k++) { pr.push(value[k] / value[k - 1] - 1); series.forEach((h, i) => hr[i].push(priceAt[i][idx[k]] / priceAt[i][idx[k - 1]] - 1)); }
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length, cov = (a, b) => { const ma = mean(a), mb = mean(b); return a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0) / (a.length - 1); };
    const vp = cov(pr, pr), sdp = Math.sqrt(vp);
    const last = series.map((h, i) => { const q = quoteFor(h.symbol); return finite(q?.price) ? q.price : priceAt[i][idx.at(-1)]; });
    const total = series.reduce((s, h, i) => s + h.qty * last[i], 0), weights = series.map((h, i) => h.qty * last[i] / total);
    const dayPL = series.reduce((s, h, i) => { const q = quoteFor(h.symbol); return s + (finite(q?.previousClose) ? h.qty * (last[i] - q.previousClose) : 0); }, 0);
    const bmap = new Map((bench?.rows || []).map(r => [r.date.slice(0, 10), r.close])), br = [];
    for (let k = 1; k < idx.length; k++) { const a = bmap.get(dates[idx[k - 1]]), b = bmap.get(dates[idx[k]]); br.push(finite(a) && finite(b) ? b / a - 1 : null); }
    const pairs = pr.map((v, k) => [v, br[k]]).filter(p => finite(p[1])), beta = pairs.length > 30 ? cov(pairs.map(p => p[0]), pairs.map(p => p[1])) / cov(pairs.map(p => p[1]), pairs.map(p => p[1])) : null;
    let peak = -Infinity, mdd = 0; value.forEach(v => { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); });
    const sorted = [...pr].sort((a, b) => a - b), var95 = -sorted[Math.floor(sorted.length * 0.05)];
    const vols = hr.map(r => Math.sqrt(cov(r, r))), divRatio = weights.reduce((s, w, i) => s + w * vols[i], 0) / sdp;
    const contrib = hr.map((r, i) => weights[i] * cov(r, pr) / vp * 100);
    const corr = hr.map(a => hr.map(b => cov(a, b) / Math.sqrt(cov(a, a) * cov(b, b))));
    const currencies = [...new Set(series.map(h => h.currency))];
    return {series, weights, last, total, dayPL, vol: sdp * Math.sqrt(252) * 100, beta, mdd: mdd * 100, var95: var95 * 100, varUsd: var95 * total, divRatio, effN: 1 / weights.reduce((s, w) => s + w * w, 0), contrib, corr, vols: vols.map(v => v * Math.sqrt(252) * 100),
      ret: (value.at(-1) / value[0] - 1) * 100, curve: idx.map((j, k) => ({date: dates[j], close: value[k]})), bench: bench?.rows || [], currencies, days: pr.length};
  }
  const portCards = a => [['VALUE', '$' + Math.round(a.total).toLocaleString()], ['TODAY', signed(a.dayPL, 0), tone(a.dayPL)], ['1Y RETURN', signed(a.ret, 1, '%'), tone(a.ret)], ['VOLATILITY', a.vol.toFixed(1) + '% / yr'], ['BETA vs SPY', finite(a.beta) ? a.beta.toFixed(2) : '—'], ['MAX DRAWDOWN', a.mdd.toFixed(1) + '%', 'fx-down'], ['1-DAY VaR 95%', `$${Math.round(a.varUsd).toLocaleString()} (${a.var95.toFixed(2)}%)`], ['DIVERSIFICATION', `${a.divRatio.toFixed(2)}× · ${a.effN.toFixed(1)} effective`]];
  T.PANELS.port = ['PORT', 'Portfolio risk', 'port'];
  T.PANEL_DESC.port = 'Your holdings: value, P/L, volatility, beta, VaR';
  T.RENDER.port = async () => {
    const host = T.panel('port'); if (!holdings().length) { host.append(el('p', 'fx-empty', 'Add your holdings to see value, risk and diversification from real prices.')); host.append(btn('Set up portfolio ▸', 'fx-chip fx-chip-link pg-primary', () => T.openPage('port'))); return; }
    host.append(el('p', 'fx-empty', 'Analyzing…'));
    const a = await analyze(); if (!host.isConnected) return; host.replaceChildren();
    if (!a || a.empty) return host.append(el('p', 'fx-empty', 'Price history is not available for these holdings.'));
    const out = el('div', 'fx-calcout'); portCards(a).slice(0, 6).forEach(([k, v, cls]) => { const d = el('div'); d.append(el('span', '', k), el('b', cls || '', v)); out.append(d); }); host.append(out);
    a.series.map((h, i) => ({h, w: a.weights[i], c: a.contrib[i]})).sort((x, y) => y.w - x.w).slice(0, 6).forEach(({h, w, c}) => { const r = el('div', 'fx-row fx-c3'); r.append(el('b', '', shortOf(h.symbol)), el('span', 'fx-num', (w * 100).toFixed(1) + '% wt'), el('span', 'fx-num fx-dim', c.toFixed(0) + '% risk')); host.append(r); });
    host.append(btn('Full analysis ▸', 'fx-chip fx-chip-link', () => T.openPage('port')));
  };
  T.EXTRA_GROUPS.push(['Portfolio & charts', ['port', 'cmp']]);
  PG.add('port', 'Portfolio', async (host, arg, alive) => {
    PG.setHead('PORT', 'Portfolio analytics', 'Your holdings, priced live, with risk measured from a year of real daily prices · saved in this browser');
    const ed = PG.section('Holdings'), tb = el('table', 'fx-table pg-table'), h = el('tr'); ['SYMBOL', 'NAME', 'QUANTITY', 'PRICE', 'VALUE', 'DAY', ''].forEach(x => h.append(el('th', '', x))); tb.append(h);
    for (const [i, x] of holdings().entries()) {
      const q = quoteFor(x.symbol), tr = el('tr'), qty = el('input'); qty.type = 'number'; qty.min = '0'; qty.step = 'any'; qty.value = x.qty; qty.className = 'pg-qty'; qty.setAttribute('aria-label', `Quantity of ${x.symbol}`);
      qty.addEventListener('change', () => { const l = read(PKEY, []); l[i].qty = Number(qty.value); write(PKEY, l); PG.rerender(); });
      const td = el('td'); td.append(qty);
      tr.append(el('th', '', x.symbol), el('td', 'pg-name', nameOf(x.symbol)), td, el('td', 'fx-num', q ? fmt(q.price, digitsOf(x.symbol)) : '…'), el('td', 'fx-num', q ? '$' + Math.round(q.price * x.qty).toLocaleString() : '…'), el('td', 'fx-num ' + tone(q?.changePercent), q ? signed(q.changePercent, 2, '%') : ''));
      const rm = el('td'); rm.append(btn('✕', 'fx-chip', () => { const l = read(PKEY, []); l.splice(i, 1); write(PKEY, l); PG.rerender(); }, `Remove ${x.symbol}`)); tr.append(rm); tb.append(tr);
    }
    const w = el('div', 'pg-scroll'); w.append(tb); ed.append(w);
    ed.append(PG.chips([btn('+ Add holding', 'fx-chip fx-chip-link pg-primary', () => T.openFinder({title: 'Add a holding', onPick: m => { const l = read(PKEY, []); if (!l.some(x => x.symbol === m.symbol)) l.push({symbol: m.symbol, qty: 10}); write(PKEY, l); T.openPage('port'); }})),
      btn('Import journal markets', 'fx-chip fx-chip-link', async () => { const tr = S.journal?.trades || []; const syms = [...new Set(tr.map(x => String(x.symbol || '').toUpperCase().replace('/', '')).filter(Boolean))].slice(0, 15); if (!syms.length) { T.say(S.journal?.status === 'ready' ? 'No journal markets found.' : 'Sign in to import your journal.'); return; } const l = read(PKEY, []); for (const s of syms) { const id = T.resolve(s) || s; const sym = T.EDGE_TO_FX?.[id] || id; if (l.some(x => x.symbol === sym)) continue; const d = await T.symHistory(sym, '1y'); const px = d?.rows?.at(-1)?.close; if (finite(px)) l.push({symbol: sym, qty: Math.max(0.0001, Math.round(10000 / px * 10000) / 10000)}); } write(PKEY, l); PG.rerender(); }),
      holdings().length ? btn('Clear all', 'fx-chip', () => { write(PKEY, []); PG.rerender(); }) : null]));
    ed.append(PG.sourceNote('Journal import adds each market you traded with about $10,000 of exposure; edit the quantities to match your account.'));
    host.append(ed);
    if (!holdings().length) return host.append(el('p', 'pg-lead', 'Add the stocks, funds, coins or currencies you hold. The terminal prices them live and measures volatility, beta, drawdown, Value at Risk and diversification from their real daily history.'));
    const res = el('div'); res.append(el('p', 'fx-empty', 'Loading a year of prices…')); host.append(res);
    const a = await analyze(); if (!alive()) return; res.replaceChildren();
    if (!a || a.empty) return res.append(el('p', 'fx-empty', 'Price history is not available for these holdings.'));
    res.append(PG.cards(portCards(a)));
    if (a.currencies.length > 1) res.append(PG.sourceNote(`Holdings trade in ${a.currencies.join(', ')}; values add them without currency conversion.`));
    const g = PG.grid('pg-g2'), c1 = PG.section('Portfolio vs S&P 500 (SPY) · 1 year'); c1.append(T.compareChart([{label: 'Portfolio', rows: a.curve}, {label: 'SPY', rows: a.bench}], {W: 620, H: 260})); g.append(c1);
    const c2 = PG.section('Where the risk comes from'), t2 = el('table', 'fx-table pg-table'), h2 = el('tr'); ['HOLDING', 'WEIGHT', 'VOL / YR', 'SHARE OF RISK'].forEach(x => h2.append(el('th', '', x))); t2.append(h2);
    a.series.map((h, i) => ({h, i})).sort((x, y) => a.contrib[y.i] - a.contrib[x.i]).forEach(({h, i}) => { const tr = el('tr', 'pg-click'); tr.addEventListener('click', () => T.setSymbol({symbol: h.symbol})); tr.append(el('th', '', shortOf(h.symbol)), el('td', 'fx-num', (a.weights[i] * 100).toFixed(1) + '%'), el('td', 'fx-num', a.vols[i].toFixed(1) + '%'), el('td', 'fx-num', a.contrib[i].toFixed(1) + '%')); t2.append(tr); });
    c2.append(t2, PG.sourceNote('Share of risk = each holding’s contribution to portfolio variance. It can exceed its weight when a holding is volatile or moves with the rest.')); g.append(c2); res.append(g);
    if (a.series.length >= 2 && a.series.length <= 14) {
      const c3 = PG.section('Correlation of daily returns · 1 year'), grid = el('div', 'fx-corr pg-corr'); grid.style.gridTemplateColumns = `64px repeat(${a.series.length}, minmax(0,1fr))`;
      grid.append(el('span')); a.series.forEach(h => grid.append(el('span', 'fx-ch', shortOf(h.symbol))));
      a.corr.forEach((row, i) => { grid.append(el('span', 'fx-ch', shortOf(a.series[i].symbol))); row.forEach((v, j) => { const b = el('span', 'fx-cc', i === j ? '' : v.toFixed(2)); b.style.background = i === j ? 'transparent' : v >= 0 ? `rgba(91,141,239,${Math.abs(v) * 0.85})` : `rgba(244,162,97,${Math.abs(v) * 0.85})`; grid.append(b); }); });
      c3.append(grid, PG.sourceNote('Blue: move together. Orange: move opposite. Lower numbers mean better diversification.')); res.append(c3);
    }
    const m = PG.section('How these are measured'); kv(m, [['Volatility', 'Standard deviation of daily portfolio returns × √252, with your current quantities held through the year.'], ['Beta', 'Sensitivity of daily portfolio returns to SPY.'], ['Max drawdown', 'Largest fall from a peak in portfolio value over the year.'], ['1-day VaR 95%', 'Historical: on 1 day in 20 the loss was at least this much.'], ['Diversification', 'Weighted average of holding volatilities divided by portfolio volatility (higher is more diversified); effective holdings = 1 / Σ weight².'], ['Data', `${a.days} daily returns from Yahoo Finance (delayed), adjusted for splits and dividends.`]]); res.append(m);
  });

  /* ===== NEW LISTINGS ======================================================================= */
  PG.add('listings', 'New listings', async (host, arg, alive) => {
    PG.setHead('NEW', 'New listings', 'Every US-listed stock and ETF is scanned daily; these first appeared in the last 30 days');
    host.append(el('p', 'fx-empty', 'Loading the directory…'));
    const d = await (async () => { try { return await T.getJSON(T.WDATA + 'symbols.json', {bust: true, timeout: 30000}); } catch { return null; } })(); if (!alive()) return;
    host.replaceChildren();
    if (!d?.newListings) return host.append(el('p', 'fx-empty', 'The listings directory is not available yet.'));
    S.symbols = d;
    host.append(PG.cards([['DIRECTORY', d.count.toLocaleString() + ' markets'], ['NEW IN 30 DAYS', String(d.newListings.length)], ['LAST SCAN', new Date(d.generatedAt).toLocaleString()]]));
    const tb = el('table', 'fx-table pg-table'), h = el('tr'); ['FIRST SEEN', 'SYMBOL', 'NAME', 'TYPE', 'EXCHANGE'].forEach(x => h.append(el('th', '', x))); tb.append(h);
    if (!d.newListings.length) host.append(el('p', 'pg-lead', 'No new listings yet: the daily scan compares each day with the last, so new names appear here from the day after the first scan.'));
    for (const r of d.newListings) { const tr = el('tr', 'pg-click'); tr.addEventListener('click', () => T.setSymbol({symbol: r.symbol, name: r.name, type: r.type, exchange: r.exchange})); tr.append(el('td', '', r.firstSeen), el('th', '', r.symbol), el('td', 'pg-name', r.name), el('td', '', r.type), el('td', 'fx-dim', r.exchange)); tb.append(tr); }
    const w = el('div', 'pg-scroll'); w.append(tb); host.append(w, PG.sourceNote(d.source + '. Exchanges outside the US are searchable with Find any market.'));
  });
  T.PAGE_NAMES.push('CHART', 'PORT', 'LISTINGS');
  void rowButton;
});
