/* FYNX Terminal plugin: STR — currency strength for USD, EUR, JPY, GBP, AUD, CHF, CAD and NZD.
 * Method: each currency is valued in US dollars from the seven USD majors (EUR/USD, GBP/USD, USD/JPY, AUD/USD,
 * USD/CAD, USD/CHF, NZD/USD). Its strength is its log return over the window minus the average log return of all
 * eight currencies, in percent. A positive line means the currency outperformed the basket; the eight values sum
 * to zero. Today (TD) uses the live day change; longer windows use the daily closes in the markets snapshot.
 * Data is only what the Terminal already loads. Text is inserted with textContent only. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {S, el, btn, svg, signed, finite, quoteFor, stat, panel, setText, tabs, store, empty, ago} = T;

  const CCY = [
    ['USD', 'US dollar', '#f08c2e'], ['EUR', 'Euro', '#e2483c'], ['JPY', 'Japanese yen', '#5fe3d0'], ['GBP', 'British pound', '#46b85f'],
    ['AUD', 'Australian dollar', '#3c6df0'], ['CHF', 'Swiss franc', '#f2c12e'], ['CAD', 'Canadian dollar', '#9a6cf2'], ['NZD', 'New Zealand dollar', '#e9579f']];
  const COLOR = Object.fromEntries(CCY.map(c => [c[0], c[2]]));
  const NAME = Object.fromEntries(CCY.map(c => [c[0], c[1]]));
  // Symbol of the USD major and whether the currency is the base (price = USD per unit) or the quote (invert).
  const LEG = {EUR: ['EURUSD=X', 1], GBP: ['GBPUSD=X', 1], AUD: ['AUDUSD=X', 1], NZD: ['NZDUSD=X', 1], JPY: ['JPY=X', -1], CAD: ['CAD=X', -1], CHF: ['CHF=X', -1]};
  const WINDOWS = [['td', 'TD'], [5, '1W'], [21, '1M'], [63, '3M'], [126, '6M']];
  const WIN_LABEL = {td: 'today', 5: 'the past week', 21: 'the past month', 63: 'the past 3 months', 126: 'the past 6 months'};
  let win = (() => { const v = store.get('str-win'); return v === 'td' ? 'td' : WINDOWS.some(w => String(w[0]) === v) ? Number(v) : 21; })();

  /* --- maths ------------------------------------------------------------------------------------- */
  function relative(logUsd) {
    // logUsd: {CCY: log return in USD terms}. USD is 0 by definition. Returns percent vs the 8-currency basket.
    const all = {USD: 0, ...logUsd}; if (CCY.some(([c]) => !finite(all[c]))) return null;
    const mean = CCY.reduce((a, [c]) => a + all[c], 0) / CCY.length;
    return Object.fromEntries(CCY.map(([c]) => [c, (all[c] - mean) * 100]));
  }
  function today() {
    const out = {}; let oldestAt = null, sourceTimesComplete = true;
    for (const [c, [sym, dir]] of Object.entries(LEG)) {
      const q = quoteFor(sym); if (!q || !finite(q.changePercent)) return null;
      out[c] = dir * Math.log(1 + q.changePercent / 100);
      // The basket uses all seven FX pairs. Its freshness is limited by the oldest source,
      // never by the newest pair or the time this panel was rendered.
      const at = typeof q.asOf === 'string' ? Date.parse(q.asOf) : NaN;
      if (!Number.isFinite(at) || at > Date.now() + 300000) sourceTimesComplete = false;
      else if (oldestAt === null || at < oldestAt) oldestAt = at;
    }
    const v = relative(out);
    return v ? {now: v, asOf: sourceTimesComplete && oldestAt !== null ? new Date(oldestAt).toISOString() : null} : null;
  }
  function series(sessions) {
    const hist = {};
    for (const [c, [sym]] of Object.entries(LEG)) { const h = stat(sym)?.history; if (!h || h.length < 3) return null; hist[c] = new Map(h); }
    const dates = [...hist.EUR.keys()].filter(d => Object.values(hist).every(m => finite(m.get(d)) && m.get(d) > 0)).sort();
    if (dates.length < 2) return null;
    const use = dates.slice(-Math.min(sessions + 1, dates.length)), base = use[0];
    const points = use.map(d => {
      const v = relative(Object.fromEntries(Object.entries(LEG).map(([c, [, dir]]) => [c, dir * Math.log(hist[c].get(d) / hist[c].get(base))])));
      return {date: d, v};
    });
    return {points, now: points.at(-1).v, from: base, to: use.at(-1), partial: use.length < sessions + 1};
  }
  const rank = v => CCY.map(([c]) => c).sort((a, b) => v[b] - v[a]);

  /* --- styles ------------------------------------------------------------------------------------ */
  if (!document.getElementById('fx-str-style')) {
    const st = el('style'); st.id = 'fx-str-style';
    st.textContent = `
.fx-str{display:flex;flex-direction:column;height:100%;min-height:0}
.fx-str{container-type:inline-size}
.fx-str-legend{display:flex;flex-wrap:wrap;gap:2px 10px;padding:5px 8px 3px;font:600 10.5px 'IBM Plex Mono',monospace}
@container (max-width:340px){.fx-str-legend{display:none}}
.fx-str-legend button{display:inline-flex;align-items:center;gap:5px;padding:2px 0;min-height:22px;background:none;border:0;color:var(--tx);font:inherit;cursor:pointer}
.fx-str-legend button i{width:12px;height:2px;border-radius:1px}
.fx-str-legend button[aria-pressed=false]{opacity:.35}
.fx-str-chart{position:relative;flex:1;min-height:150px}
.fx-str-chart svg{display:block;width:100%;height:100%}
.fx-str-tip{position:absolute;z-index:3;pointer-events:none;min-width:118px;padding:6px 8px;background:rgba(8,11,10,.94);border:1px solid var(--ln2);font:500 10.5px/1.5 'IBM Plex Mono',monospace;color:var(--tx);box-shadow:0 8px 24px rgba(0,0,0,.45)}
.fx-str-tip b{display:block;margin-bottom:2px;color:var(--mu);font-weight:600}
.fx-str-tip span{display:flex;justify-content:space-between;gap:12px}
.fx-str-tip em{font-style:normal}
.fx-str-rank{display:grid;grid-template-columns:repeat(auto-fit,minmax(48px,1fr));gap:2px;padding:4px 8px 6px}
.fx-str-rank button{display:flex;flex-direction:column;align-items:center;gap:1px;padding:3px 0;min-height:32px;background:var(--p2);border:0;border-top:2px solid;color:var(--tx);font:600 11px 'IBM Plex Mono',monospace;cursor:pointer}
.fx-str-rank button:hover{background:#1b2420}
.fx-str-rank small{font-size:10px;font-weight:500}
.fx-str-bars{padding:4px 8px}
.fx-str-bar{display:grid;grid-template-columns:44px 1fr 58px;align-items:center;gap:8px;min-height:24px;font:600 11.5px 'IBM Plex Mono',monospace}
.fx-str-bar .fx-bbar{height:9px}
.fx-str-bar .fx-num{text-align:right}
.fx-str-page .fx-str-chart{min-height:420px}
.fx-str-page .fx-str-legend{font-size:12px;padding:8px 0}
.fx-str-table{width:100%;border-collapse:collapse;margin-top:14px;font:500 12px 'IBM Plex Mono',monospace}
.fx-str-table th,.fx-str-table td{padding:7px 8px;border-top:1px solid var(--ln);text-align:right}
.fx-str-table th{color:var(--mu);font-size:10.5px;font-weight:600;letter-spacing:.06em}
.fx-str-table th:first-child,.fx-str-table td:first-child{text-align:left}
.fx-str-table td:first-child i{display:inline-block;width:10px;height:10px;margin-right:8px;border-radius:2px;vertical-align:-1px}
.fx-str-note{margin:14px 0 0;color:var(--mu);font-size:12px;line-height:1.6;max-width:780px}
@media (pointer:coarse){.fx-str-legend button{min-height:36px}}`;
    document.head.append(st);
  }

  /* --- drawing ----------------------------------------------------------------------------------- */
  const hidden = new Set((store.get('str-hide') || '').split(',').filter(c => COLOR[c]));
  function legend(host, redraw) {
    const row = el('div', 'fx-str-legend'); row.setAttribute('aria-label', 'Show or hide currencies');
    for (const [c, name, color] of CCY) {
      const b = btn('', '', () => { hidden.has(c) ? hidden.delete(c) : hidden.add(c); store.set('str-hide', [...hidden].join(',')); redraw(); }, `${name}: ${hidden.has(c) ? 'show' : 'hide'}`);
      b.setAttribute('aria-pressed', String(!hidden.has(c))); const sw = el('i'); sw.style.background = color; b.append(sw, document.createTextNode(c)); row.append(b);
    }
    host.append(row);
  }
  function lineChart(box, data) {
    const w = Math.max(240, Math.round(box.clientWidth || 600)), h = Math.max(140, Math.round(box.clientHeight || 220));
    const narrow = w < 420, padL = 6, padR = narrow ? 36 : 58, padT = 10, padB = 20, iw = w - padL - padR, ih = h - padT - padB;
    const pts = data.points, show = CCY.map(c => c[0]).filter(c => !hidden.has(c));
    let lo = 0, hi = 0; for (const p of pts) for (const c of show) { lo = Math.min(lo, p.v[c]); hi = Math.max(hi, p.v[c]); }
    const span = Math.max(hi - lo, 0.2); lo -= span * 0.08; hi += span * 0.08;
    const X = i => padL + (pts.length === 1 ? iw : i / (pts.length - 1) * iw), Y = v => padT + (hi - v) / (hi - lo) * ih;
    const s = svg('svg', {viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img', 'aria-label': `Currency strength over ${WIN_LABEL[win]}, strongest ${rank(data.now)[0]}, weakest ${rank(data.now).at(-1)}`});
    // grid + zero line
    const step = niceStep((hi - lo) / 4);
    for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) {
      const y = Y(g); s.append(svg('line', {x1: padL, x2: padL + iw, y1: y, y2: y, stroke: Math.abs(g) < 1e-9 ? '#56635c' : '#1a2420', 'stroke-width': 1, 'stroke-dasharray': Math.abs(g) < 1e-9 ? '' : '2 3'}));
      const t = svg('text', {x: w - 4, y: y + 3, 'text-anchor': 'end', fill: '#6f7c75', 'font-size': 9.5, 'font-family': 'IBM Plex Mono, monospace'}); t.textContent = (g > 0 ? '+' : '') + g.toFixed(step < 1 ? 1 : 0) + '%'; s.append(t);
    }
    // dates
    const ticks = Math.min(narrow ? 2 : w < 640 ? 3 : 5, pts.length);
    for (let k = 0; k < ticks; k++) {
      const i = Math.round(k * (pts.length - 1) / Math.max(1, ticks - 1)); const t = svg('text', {x: X(i), y: h - 5, 'text-anchor': k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle', fill: '#6f7c75', 'font-size': 9.5, 'font-family': 'IBM Plex Mono, monospace'});
      t.textContent = new Date(pts[i].date + 'T12:00:00Z').toLocaleDateString(undefined, {month: 'short', day: 'numeric'}); s.append(t);
    }
    // lines (weakest drawn first so the leaders sit on top)
    for (const c of [...show].sort((a, b) => data.now[a] - data.now[b])) {
      s.append(svg('path', {d: pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.v[c]).toFixed(1)).join(''), fill: 'none', stroke: COLOR[c], 'stroke-width': 1.7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'}));
    }
    // end labels, spread so they never overlap
    const tags = show.map(c => ({c, y: Y(data.now[c])})).sort((a, b) => a.y - b.y), gap = 13;
    for (let i = 1; i < tags.length; i++) tags[i].y = Math.max(tags[i].y, tags[i - 1].y + gap);
    const over = tags.length ? tags.at(-1).y - (padT + ih) : 0; if (over > 0) for (const t of tags) t.y -= over;
    for (const t of tags) {
      const x = padL + iw + 4, bw = narrow ? 29 : 50; s.append(svg('rect', {x, y: t.y - 6.5, width: bw, height: 13, rx: 2, fill: COLOR[t.c]}));
      const tx = svg('text', {x: x + bw / 2, y: t.y + 3.5, 'text-anchor': 'middle', fill: '#0a0d0c', 'font-size': 9.5, 'font-weight': 700, 'font-family': 'IBM Plex Mono, monospace'}); tx.textContent = narrow ? t.c : `${t.c} ${signed(data.now[t.c], 2)}`.replace('−', '-'); s.append(tx);
    }
    // crosshair + tooltip
    const cross = svg('line', {y1: padT, y2: padT + ih, stroke: '#8e9b94', 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden'}); s.append(cross);
    const dots = show.map(c => { const d = svg('circle', {r: 3, fill: COLOR[c], stroke: '#06080a', 'stroke-width': 1, visibility: 'hidden'}); s.append(d); return [c, d]; });
    const tip = el('div', 'fx-str-tip'); tip.hidden = true;
    const move = e => {
      const r = s.getBoundingClientRect(), x = (e.clientX - r.left) * (w / r.width);
      const i = Math.max(0, Math.min(pts.length - 1, Math.round((x - padL) / iw * (pts.length - 1)))), p = pts[i];
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
      for (const [c, d] of dots) { d.setAttribute('cx', X(i)); d.setAttribute('cy', Y(p.v[c])); d.setAttribute('visibility', 'visible'); }
      tip.replaceChildren(el('b', '', new Date(p.date + 'T12:00:00Z').toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'})));
      for (const c of rank(p.v).filter(c => !hidden.has(c))) { const row = el('span'); const k = el('em', '', c); k.style.color = COLOR[c]; row.append(k, el('em', '', signed(p.v[c], 2, '%'))); tip.append(row); }
      tip.hidden = false;
      const px = (X(i) / w) * r.width, left = px > r.width / 2 ? px - tip.offsetWidth - 12 : px + 12;
      tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
    };
    const leave = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); for (const [, d] of dots) d.setAttribute('visibility', 'hidden'); };
    s.addEventListener('pointermove', move); s.addEventListener('pointerleave', leave);
    box.replaceChildren(s, tip);
  }
  function niceStep(raw) { const p = 10 ** Math.floor(Math.log10(raw || 1)), n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function bars(host, now) {
    const box = el('div', 'fx-str-bars'), order = rank(now), max = Math.max(...order.map(c => Math.abs(now[c])), 0.05);
    for (const c of order) {
      const row = el('div', 'fx-str-bar'); row.setAttribute('role', 'listitem');
      const name = el('b', '', c); name.style.color = COLOR[c]; name.title = NAME[c];
      const bar = el('span', 'fx-bbar'), fill = el('i'), v = now[c], wPct = Math.abs(v) / max * 50;
      fill.style.cssText = `width:${wPct}%;left:${v >= 0 ? 50 : 50 - wPct}%;background:${COLOR[c]}`; bar.append(el('b'), fill);
      row.append(name, bar, el('span', 'fx-num ' + T.tone(v), signed(v, 2, '%'))); box.append(row);
    }
    box.setAttribute('role', 'list'); box.setAttribute('aria-label', 'Currencies from strongest to weakest'); host.append(box);
  }
  function rankStrip(host, now) {
    const row = el('div', 'fx-str-rank'); row.setAttribute('aria-label', 'Strongest to weakest');
    for (const c of rank(now)) {
      const b = btn('', '', () => T.openPage?.('strength'), `${NAME[c]} ${signed(now[c], 2, '%')}`); b.style.borderTopColor = COLOR[c];
      b.append(document.createTextNode(c), el('small', T.tone(now[c]), signed(now[c], 2, '%'))); row.append(b);
    }
    host.append(row);
  }
  function compute(w) { return w === 'td' ? today() : series(w); }

  /* --- panel ------------------------------------------------------------------------------------- */
  let ro = null;
  function renderPanel() {
    tabs('str-tabs', WINDOWS, win, v => { win = v; store.set('str-win', String(v)); renderPanel(); });
    const host = panel('str'), data = compute(win);
    if (!data) { setText('n-str', ''); return empty(host, win === 'td' ? 'Waiting for live FX quotes…' : 'Loading daily FX history…'); }
    const order = rank(data.now); setText('n-str', `${order[0]} ▲ ${order.at(-1)} ▼`);
    const wrap = el('div', 'fx-str'); host.append(wrap);
    if (win === 'td') { bars(wrap, data.now); wrap.append(el('p', 'fx-foot', `Day change vs the 8-currency basket · FX quotes · ${data.asOf ? 'oldest source quote ' + ago(data.asOf) : 'source time unavailable for one or more pairs'}. Pick 1W–6M for the trend lines.`)); return; }
    const redraw = () => renderPanel();
    legend(wrap, redraw);
    const box = el('div', 'fx-str-chart'); wrap.append(box); rankStrip(wrap, data.now);
    requestAnimationFrame(() => lineChart(box, data));
    ro?.disconnect(); let last = 0;
    ro = new ResizeObserver(() => { const k = Math.round(box.clientWidth) * 10000 + Math.round(box.clientHeight); if (k !== last && box.isConnected) { last = k; lineChart(box, data); } }); ro.observe(box);
  }

  /* --- full page --------------------------------------------------------------------------------- */
  let pageRO = null;
  async function renderPage(host) {
    PG.setHead('STR', 'Currency strength', 'USD, EUR, JPY, GBP, AUD, CHF, CAD and NZD against an equal-weight basket of all eight');
    host.append(PG.pageTabs(WINDOWS, win, v => { win = v; store.set('str-win', String(v)); PG.rerender(); T.R('str'); }));
    const page = el('div', 'fx-str fx-str-page'); host.append(page);
    const data = compute(win);
    if (!data) { page.append(el('p', 'fx-empty', 'FX data is still loading. This page fills in as soon as quotes arrive.')); return; }
    if (win === 'td') bars(page, data.now);
    else {
      legend(page, () => PG.rerender());
      const box = el('div', 'fx-str-chart'); page.append(box); requestAnimationFrame(() => lineChart(box, data));
      pageRO?.disconnect(); let last = 0; pageRO = new ResizeObserver(() => { const k = Math.round(box.clientWidth); if (k !== last && box.isConnected) { last = k; lineChart(box, data); } }); pageRO.observe(box);
    }
    // Every window side by side.
    const all = Object.fromEntries(WINDOWS.map(([k]) => [k, compute(k)?.now || null]));
    const table = el('table', 'fx-str-table'), head = el('tr');
    head.append(el('th', '', 'CURRENCY'), ...WINDOWS.map(([, l]) => el('th', '', l)), el('th', '', 'RANK ' + WINDOWS.find(w => w[0] === win)[1]));
    table.append(head);
    const order = rank(data.now);
    for (const c of order) {
      const tr = el('tr'), first = el('td'), sw = el('i'); sw.style.background = COLOR[c]; first.append(sw, document.createTextNode(`${c} · ${NAME[c]}`)); tr.append(first);
      for (const [k] of WINDOWS) tr.append(el('td', all[k] ? T.tone(all[k][c]) : '', all[k] ? signed(all[k][c], 2, '%') : '—'));
      tr.append(el('td', '', `${order.indexOf(c) + 1} of 8`)); table.append(tr);
    }
    page.append(table);
    page.append(el('p', 'fx-str-note', 'How it is calculated: each currency is valued in US dollars from the seven USD majors. Its strength is its return over the window minus the average return of all eight currencies, so the eight values always add up to zero. Above zero means the currency outperformed the basket. TD uses the live day change; other windows use daily closes from the markets snapshot (Yahoo Finance, may be delayed). Strength describes what already happened; it is not a forecast or a trade signal.'));
  }

  /* --- register ---------------------------------------------------------------------------------- */
  T.PANELS.str = ['STR', 'Currency strength', 'strength'];
  T.PANEL_DESC.str = 'USD, EUR, JPY, GBP, AUD, CHF, CAD, NZD vs the basket';
  T.LINK_LABEL.strength = 'Full';
  T.RENDER.str = renderPanel;
  T.TABBED.add('str');
  T.EXTRA_GROUPS.push(['Currencies', ['str']]);
  if (PG) { PG.add('strength', 'Currency strength', renderPage); PG.add('str', 'Currency strength', renderPage); T.PAGE_NAMES.push('STR', 'STRENGTH'); }
  // The FX desk shows it by default (in place of the yield curve, which stays one click away on the Macro desk).
  const fx = T.DESK_DEFS?.forex; if (fx && !fx.slots.includes('str')) fx.slots = fx.slots.map(s => s === 'curve' ? 'str' : s);
  // Live day change follows the quote refresh; daily windows follow the markets snapshot.
  let tick = 0;
  setInterval(() => { tick++; if (document.hidden || !document.getElementById('tp-str')) return; if (win === 'td' || tick % 10 === 0) T.R('str'); }, 30000);
});
