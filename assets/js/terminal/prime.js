/* FYNX Terminal plugin: institutional tools.
 *  COT     — CFTC hedge fund / asset manager / managed money positioning, 3 years weekly, vs price
 *  WIRP    — rate curves: Fed path implied by fed funds futures, G10 + EM policy-rate history (BIS),
 *            2-year yield minus policy rate as a market-pricing gauge
 *  VSTAT   — volatility stats: return distribution with bell curve and current move, tails, average
 *            daily range by period, weekday and month
 *  BOOK    — broker order and position books (OANDA aggregated client data)
 *  MOOD    — cross-asset risk sentiment from live quotes
 * Every figure is computed from the published data; nothing is estimated or filled in. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  if (!PG) return;
  const {S, el, btn, svg, signed, tone, fmt, finite, store} = T;
  const TD = T.TDATA;
  const big = n => !finite(n) ? '—' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
  const sgnBig = n => !finite(n) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + big(Math.abs(n));
  const dateS = d => new Date(String(d).length <= 10 ? d + 'T12:00:00Z' : d).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC'});
  const read = (k, d) => { try { return JSON.parse(store.get(k) || 'null') ?? d; } catch { return d; } };
  const P = {cot: null, policy: null, loading: {}};
  // Phones: a 900-unit chart squeezed into a ~300px column shrinks its 10-unit labels to ~3px. Under 700px,
  // draw the chart at (almost) the column's own width so labels stay ~11px; desktop keeps the wide layout.
  const fit = (box, H, o = {}) => { const w = box?.clientWidth || 0; return w > 0 && w < 700 ? {...o, W: Math.round(w / 1.1), H, narrow: true} : o; };
  // Pages can open before the desk snapshot and quotes arrive (deep links); wait briefly for them.
  const until = async (test, ms = 25000) => { const t0 = Date.now(); while (!test() && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 250)); return test(); };
  async function load(name) {
    if (P[name]) return P[name];
    if (!P.loading[name]) P.loading[name] = T.getJSON(TD + name + '.json', {bust: true, timeout: 20000}).then(d => (P[name] = d)).catch(e => { T.report(name, e); P.loading[name] = null; return null; });
    return P.loading[name];
  }

  /* ========== COT: hedge fund positioning ============================================ */
  const GROUP = {leveraged: 'Leveraged funds (hedge funds)', assetManagers: 'Asset managers', dealers: 'Dealers', managedMoney: 'Managed money (hedge funds)', producers: 'Producers & merchants', swapDealers: 'Swap dealers', nonCommercial: 'Non-commercial (speculators)', commercial: 'Commercial (hedgers)'};
  function cotStats(m, group = m.spec) {
    const h = m.history.filter(r => r[group]), net = h.map(r => r[group][0] - r[group][1]), last = h.at(-1);
    const lo = Math.min(...net), hi = Math.max(...net), n = net.at(-1);
    return {date: last.date, net: n, change: n - (net.at(-2) ?? n), change4: n - (net.at(-5) ?? n), long: last[group][0], short: last[group][1], oi: last.oi, pctOI: n / last.oi * 100,
      index: hi > lo ? (n - lo) / (hi - lo) * 100 : 50, weeks: h.length, nets: net, dates: h.map(r => r.date), max: hi, min: lo};
  }
  const extreme = ix => ix >= 90 ? 'Extreme long' : ix <= 10 ? 'Extreme short' : ix >= 75 ? 'Stretched long' : ix <= 25 ? 'Stretched short' : 'Neutral';
  T.PANELS.cot = ['COT', 'Hedge fund positioning', 'cot'];
  T.PANEL_DESC.cot = 'CFTC Commitments of Traders: hedge fund net positions, weekly change and 3-year extremes';
  T.LINK_LABEL.cot = 'All markets';
  T.RENDER.cot = async () => {
    const host = T.panel('cot'); host.append(el('p', 'fx-empty', 'Loading CFTC positioning…'));
    const d = await load('cot'); if (!host.isConnected) return; host.replaceChildren();
    if (!d?.markets) return host.append(el('p', 'fx-empty', 'CFTC positioning is being published; check back after the next data refresh.'));
    const head = el('div', 'fx-row fx-c5 fx-head'); ['MARKET', 'NET', 'WK CHG', '3Y INDEX', ''].forEach(x => head.append(el('span', x === 'MARKET' ? '' : 'fx-num', x))); host.append(head);
    const rows = Object.values(d.markets).map(m => ({m, s: cotStats(m)})).sort((a, b) => Math.abs(b.s.index - 50) - Math.abs(a.s.index - 50));
    for (const {m, s} of rows.slice(0, 12)) {
      const r = T.rowButton('fx-c5', () => T.openPage('cot', m.key), `${m.label} positioning`);
      const bar = el('span', 'pm-ix'), fill = el('i'); fill.style.width = s.index.toFixed(0) + '%'; fill.className = s.index >= 75 ? 'hi' : s.index <= 25 ? 'lo' : ''; bar.append(fill);
      r.append(el('b', '', m.key + ' ' + m.label.replace(/\s*\(.*\)/, '')), el('span', 'fx-num ' + tone(s.net), sgnBig(s.net)), el('span', 'fx-num ' + tone(s.change), sgnBig(s.change)), el('span', 'fx-num', s.index.toFixed(0)), bar);
      host.append(r);
    }
    T.setText('n-cot', 'CFTC ' + dateS(d.latest));
  };

  function dualChart(rows, price, {W = 900, H = 300, label = '', narrow = false} = {}) {
    // Bars: speculative net contracts by week. Line: price on the report dates (right axis).
    const L = 54, R = 66, T0 = 12, B = 24, n = rows.length, bw = (W - L - R) / n;
    const nets = rows.map(r => r.net), lo = Math.min(0, ...nets), hi = Math.max(0, ...nets), y = v => T0 + (hi - v) / (hi - lo || 1) * (H - T0 - B);
    const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart pm-chart', role: 'img', 'aria-label': label});
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; c.append(svg('line', {x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'g'})); const t = svg('text', {x: L - 6, y: y(v) + 4, class: 'a', 'text-anchor': 'end'}); t.textContent = sgnBig(v); c.append(t); }
    rows.forEach((r, i) => c.append(svg('rect', {x: L + i * bw + bw * 0.12, width: Math.max(1, bw * 0.76), y: Math.min(y(r.net), y(0)), height: Math.max(1, Math.abs(y(r.net) - y(0))), fill: r.net >= 0 ? '#3ecf8e' : '#ff6b5f', 'fill-opacity': 0.75})));
    const pts = rows.map((r, i) => [i, price(r.date)]).filter(p => finite(p[1]));
    if (pts.length > 2) {
      const pl = Math.min(...pts.map(p => p[1])), ph = Math.max(...pts.map(p => p[1])), py = v => T0 + (ph - v) / (ph - pl || 1) * (H - T0 - B);
      c.append(svg('polyline', {points: pts.map(([i, v]) => `${(L + (i + 0.5) * bw).toFixed(1)},${py(v).toFixed(1)}`).join(' '), fill: 'none', stroke: '#ffb000', 'stroke-width': 1.8}));
      [pl, (pl + ph) / 2, ph].forEach(v => { const t = svg('text', {x: W - R + 6, y: py(v) + 4, class: 'a'}); t.style.fill = '#ffb000'; t.textContent = v >= 100 ? v.toFixed(0) : v.toPrecision(5); c.append(t); });
    }
    (narrow ? [0, n - 1] : [0, Math.floor(n / 2), n - 1]).forEach((i, k, a) => { k = k === a.length - 1 ? 2 : k; const t = svg('text', {x: L + (i + 0.5) * bw, y: H - 6, class: 'a', 'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}); t.textContent = dateS(rows[i].date); c.append(t); });
    return c;
  }
  PG.add('cot', 'COT positioning', async (host, key, alive) => {
    key = key && String(key).toUpperCase();
    PG.setHead('COT', 'Hedge fund positioning', 'CFTC Commitments of Traders · positions as of Tuesday, published Friday');
    host.append(el('p', 'fx-empty', 'Loading CFTC positioning…'));
    const d = await load('cot'); if (!alive()) return; host.replaceChildren();
    if (!d?.markets) return host.append(el('p', 'fx-empty', 'CFTC positioning is being published; check back after the next data refresh.'));
    const list = Object.values(d.markets), m = d.markets[key] || d.markets[read('cot-last', 'EUR')] || list[0];
    store.set('cot-last', JSON.stringify(m.key));
    const pick = el('div', 'fx-chips pm-picks'); for (const x of list) { const b = btn(x.key, 'fx-chip' + (x.key === m.key ? ' on' : ''), () => PG.open('cot', x.key), x.label); b.setAttribute('aria-pressed', String(x.key === m.key)); pick.append(b); } host.append(pick);
    const s = cotStats(m);
    const SHORT = {leveraged: 'HEDGE FUNDS NET', managedMoney: 'MANAGED MONEY NET', nonCommercial: 'SPECULATORS NET'};
    host.append(PG.cards([[SHORT[m.spec] || 'NET', sgnBig(s.net), tone(s.net), `contracts · ${big(s.long)} long / ${big(s.short)} short`],
      ['WEEKLY CHANGE', sgnBig(s.change), tone(s.change), `4 weeks ${sgnBig(s.change4)}`], ['NET % OF OPEN INTEREST', signed(s.pctOI, 1, '%'), tone(s.pctOI), `Open interest ${s.oi.toLocaleString()}`],
      ['COT INDEX · 3Y', s.index.toFixed(0) + ' / 100', s.index >= 75 ? 'up' : s.index <= 25 ? 'dn' : '', extreme(s.index)], ['REPORT DATE', dateS(s.date), '', `${s.weeks} weekly reports`]]));
    const sec = PG.section(`${m.label} · ${GROUP[m.spec]} net vs price · 3 years`); host.append(sec);
    const chartHost = el('div'); chartHost.append(el('p', 'fx-empty', 'Loading price history…')); sec.append(chartHost);
    const rows = s.dates.map((date, i) => ({date, net: s.nets[i]}));
    T.symHistory(m.price, '5y').then(hist => {
      if (!alive()) return; chartHost.replaceChildren();
      const pr = (hist?.rows || []).map(r => [String(r.date).slice(0, 10), r.close]).filter(r => finite(r[1]));
      const at = date => { let v = null; for (const [d0, c] of pr) { if (d0 > date) break; v = c; } return v; };
      chartHost.append(dualChart(rows, pr.length ? at : () => null, fit(chartHost, 200, {label: `${m.label} speculative net positions and price`})));
      chartHost.append(PG.sourceNote(`Bars: ${GROUP[m.spec].toLowerCase()} net contracts (green long, red short). Orange line: ${T.nameOf(m.price)} (${m.price})${m.inverse ? ' — quoted as USD per unit, so it moves opposite to the currency future' : ''}, weekly on report dates.`));
    });
    const g = PG.grid('pg-g2');
    const t1 = PG.section('All trader groups · latest week'), tb = el('table', 'fx-table pg-table'), h = el('tr'); ['GROUP', 'LONG', 'SHORT', 'NET', 'WK CHG', '3Y INDEX'].forEach(x => h.append(el('th', '', x))); tb.append(h);
    for (const gname of m.groups) { const x = cotStats(m, gname), tr = el('tr'); tr.append(el('th', '', GROUP[gname]), el('td', 'fx-num', x.long.toLocaleString()), el('td', 'fx-num', x.short.toLocaleString()), el('td', 'fx-num ' + tone(x.net), sgnBig(x.net)), el('td', 'fx-num ' + tone(x.change), sgnBig(x.change)), el('td', 'fx-num', x.index.toFixed(0))); tb.append(tr); }
    const w1 = el('div', 'pg-scroll'); w1.append(tb); t1.append(w1, PG.sourceNote(`${m.reportName} report · CFTC contract ${m.code}. COT index = where this week's net sits between its 3-year low (0) and high (100).`)); g.append(t1);
    const t2 = PG.section('Last 12 weeks'), tb2 = el('table', 'fx-table pg-table'), h2 = el('tr'); ['WEEK', 'NET', 'CHANGE', '% OI'].forEach(x => h2.append(el('th', '', x))); tb2.append(h2);
    m.history.slice(-12).reverse().forEach((r, i, a) => { const n = r[m.spec][0] - r[m.spec][1], p = a[i + 1], pn = p ? p[m.spec][0] - p[m.spec][1] : null, tr = el('tr'); tr.append(el('th', '', dateS(r.date)), el('td', 'fx-num ' + tone(n), sgnBig(n)), el('td', 'fx-num ' + tone(n - pn), pn == null ? '—' : sgnBig(n - pn)), el('td', 'fx-num', (n / r.oi * 100).toFixed(1) + '%')); tb2.append(tr); });
    const w2 = el('div', 'pg-scroll'); w2.append(tb2); t2.append(w2); g.append(t2); host.append(g);
    const all = PG.section('Positioning across markets · ' + GROUP.leveraged.split(' (')[0] + ' / managed money / speculators'), tb3 = el('table', 'fx-table pg-table'), h3 = el('tr'); ['MARKET', 'NET', 'WK CHG', '% OI', '3Y INDEX', 'READING'].forEach(x => h3.append(el('th', '', x))); tb3.append(h3);
    list.map(x => ({x, s: cotStats(x)})).sort((a, b) => b.s.index - a.s.index).forEach(({x, s: q}) => { const tr = el('tr', 'pg-click' + (x.key === m.key ? ' on' : '')); tr.addEventListener('click', () => PG.open('cot', x.key)); tr.append(el('th', '', `${x.key} · ${x.label}`), el('td', 'fx-num ' + tone(q.net), sgnBig(q.net)), el('td', 'fx-num ' + tone(q.change), sgnBig(q.change)), el('td', 'fx-num', q.pctOI.toFixed(1) + '%'), el('td', 'fx-num', q.index.toFixed(0)), el('td', '', extreme(q.index))); tb3.append(tr); });
    const w3 = el('div', 'pg-scroll'); w3.append(tb3); all.append(w3, PG.sourceNote(`${d.source}. Updated ${dateS(d.latest)}. Extremes are measured against each market's own 3-year range; they describe crowding, not a forecast.`)); host.append(all);
  });

  /* ========== WIRP: rate curves =========================================================== */
  const CB = [['US', 'FED', '#ff8a3d'], ['XM', 'ECB', '#5b8def'], ['GB', 'BOE', '#c4a1ff'], ['JP', 'BOJ', '#9aa5b1'], ['CA', 'BOC', '#e5484d'], ['AU', 'RBA', '#3ecf8e'], ['NZ', 'RBNZ', '#ff5fa2'], ['CH', 'SNB', '#ffd166']];
  const EM = [['CN', 'PBOC'], ['IN', 'RBI'], ['BR', 'BCB'], ['MX', 'BANXICO'], ['ZA', 'SARB'], ['TR', 'CBRT'], ['KR', 'BOK'], ['SE', 'RIKSBANK'], ['NO', 'NORGES']];
  function lastChange(hist) { const v = hist.at(-1)[1]; for (let i = hist.length - 2; i >= 0; i--) if (hist[i][1] !== v) return {from: hist[i][1], at: hist[i + 1][0], bp: Math.round((v - hist[i][1]) * 100)}; return null; }
  function fedPath() {
    const f = S.desk?.fed;
    if (Array.isArray(f?.path) && f.path.length >= 3 && f.effr) return {effr: f.effr, points: f.path.filter(p => finite(p.rate)), meeting: f.odds?.meeting, source: f.source};
    const cs = (f?.odds?.contracts || []).filter(c => finite(c.price)).map(c => ({...c, month: monthOf(c.symbol)})).filter(c => c.month).sort((a, b) => a.month.localeCompare(b.month));
    return cs.length ? {effr: f.effr, points: cs.map(c => ({month: c.month, rate: 100 - c.price, symbol: c.symbol, asOf: c.asOf})), meeting: f.odds.meeting, source: f.source} : null;
  }
  const MCODE = {F: '01', G: '02', H: '03', J: '04', K: '05', M: '06', N: '07', Q: '08', U: '09', V: '10', X: '11', Z: '12'};
  const monthOf = sym => { const m = /^ZQ([FGHJKMNQUVXZ])(\d\d)\./.exec(sym || ''); return m ? `20${m[2]}-${MCODE[m[1]]}` : null; };
  function multiLine(series, {W = 900, H = 300, from, zero = true} = {}) {
    const L = 8, R = 58, T0 = 10, B = 22, all = series.flatMap(s => s.points.filter(p => !from || p[0] >= from));
    if (!all.length) return el('p', 'fx-empty', 'No data in this range.');
    const xs = [...new Set(all.map(p => p[0]))].sort(), lo0 = Math.min(...all.map(p => p[1])), hi0 = Math.max(...all.map(p => p[1])), lo = zero ? Math.min(0, lo0) : lo0 - Math.max(0.1, (hi0 - lo0) * 0.25), hi = zero ? hi0 * 1.06 : hi0 + Math.max(0.1, (hi0 - lo0) * 0.25), xi = d => L + xs.indexOf(d) / Math.max(1, xs.length - 1) * (W - L - R), y = v => T0 + (hi - v) / (hi - lo || 1) * (H - T0 - B);
    const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart pm-chart', role: 'img', 'aria-label': 'Policy rates over time'});
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; c.append(svg('line', {x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'g'})); const t = svg('text', {x: W - R + 6, y: y(v) + 4, class: 'a'}); t.textContent = v.toFixed(2) + '%'; c.append(t); }
    for (const s of series) { const pts = s.points.filter(p => !from || p[0] >= from); if (pts.length < 2) continue; c.append(svg('polyline', {points: pts.map(p => `${xi(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' '), fill: 'none', stroke: s.color, 'stroke-width': s.width || 1.8, 'stroke-dasharray': s.dash || ''})); }
    [0, Math.floor(xs.length / 2), xs.length - 1].forEach((i, k) => { const t = svg('text', {x: xi(xs[i]), y: H - 6, class: 'a', 'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}); t.textContent = xs[i]; c.append(t); });
    return c;
  }
  const legend = series => { const l = el('div', 'pm-legend'); series.forEach(s => { const i = el('span'); const sw = el('i'); sw.style.background = s.color; i.append(sw, document.createTextNode(s.label)); l.append(i); }); return l; };
  T.PANELS.wirp = ['WIRP', 'Rate curves', 'wirp'];
  T.PANEL_DESC.wirp = 'Fed path implied by fed funds futures and G10 central bank policy rates';
  T.LINK_LABEL.wirp = 'Rate curves';
  T.RENDER.wirp = async () => {
    const host = T.panel('wirp'); const d = await load('policy'); if (!host.isConnected) return; host.replaceChildren();
    const fp = fedPath();
    if (fp) { const end = fp.points.at(-1); host.append(el('p', 'pm-lead', `Fed funds futures price ${signed((end.rate - fp.effr.value) * 100, 0, ' bp')} by ${end.month} (EFFR ${fp.effr.value}%).`)); }
    if (!d?.areas) return host.append(el('p', 'fx-empty', 'Policy-rate history is being published.'));
    for (const [a, code, color] of CB) {
      const x = d.areas[a]; if (!x) continue; const ch = lastChange(x.history), r = T.rowButton('pm-c4', () => T.openPage('wirp'), `${code} policy rate`);
      const sw = el('i', 'pm-sw'); sw.style.background = color;
      const nm = el('b'); nm.append(sw, document.createTextNode(code));
      r.append(nm, el('span', 'fx-num', x.history.at(-1)[1].toFixed(2) + '%'), el('span', 'fx-num ' + tone(ch?.bp), ch ? signed(ch.bp, 0, ' bp') : '—'), el('span', 'fx-num fx-dim', ch ? ch.at : '')); host.append(r);
    }
  };
  PG.add('wirp', 'Rate curves', async (host, arg, alive) => {
    PG.setHead('WIRP', 'Rate curves', 'Market-implied Fed path, central bank policy rates and what 2-year yields are pricing');
    const d = await load('policy'); await until(() => S.desk); if (!alive()) return;
    const fp = fedPath();
    if (fp) {
      const s = PG.section('Fed path implied by 30-day fed funds futures'), now = new Date().toISOString().slice(0, 7);
      const series = [{label: 'Implied average fed funds rate', color: '#ff8a3d', width: 2.4, points: fp.points.map(p => [p.month, p.rate])}, {label: `Effective rate today (${fp.effr.value}%)`, color: '#9aa5b1', dash: '5 4', points: fp.points.map(p => [p.month, fp.effr.value])}];
      s.append(legend(series), multiLine(series, fit(host, 170, {H: 240, zero: false})));
      const tb = el('table', 'fx-table pg-table'), h = el('tr'); ['MONTH', 'CONTRACT', 'IMPLIED RATE', 'VS TODAY'].forEach(x => h.append(el('th', '', x))); tb.append(h);
      fp.points.forEach(p => { const tr = el('tr' + ''); tr.append(el('th', '', p.month + (p.month === now ? ' (now)' : '')), el('td', '', p.symbol), el('td', 'fx-num', p.rate.toFixed(3) + '%'), el('td', 'fx-num ' + tone(p.rate - fp.effr.value), signed((p.rate - fp.effr.value) * 100, 1, ' bp'))); tb.append(tr); });
      const w = el('div', 'pg-scroll'); w.append(tb); s.append(w, PG.sourceNote(`Implied rate = 100 − futures price for each contract month. Next FOMC decision ${fp.meeting}. ${fp.source}.`)); host.append(s);
    }
    if (d?.areas) {
      const ranges = [['2018-01', 'Since 2018'], ['2022-01', 'Since 2022'], ['2015-01', 'Since 2015']], from = read('wirp-from', '2022-01');
      const s = PG.section('G10 policy rates'), box = el('div');
      const draw = f => { box.replaceChildren(); const series = CB.filter(([a]) => d.areas[a]).map(([a, code, color]) => ({label: code, color, points: d.areas[a].history})); box.append(legend(series), multiLine(series, fit(host, 200, {from: f}))); };
      s.append(PG.pageTabs(ranges, from, v => { store.set('wirp-from', JSON.stringify(v)); PG.rerender(); }), box); draw(from); host.append(s);
      const t = PG.section('Policy rates, last move and market pricing'), tb = el('table', 'fx-table pg-table'), h = el('tr'); ['BANK', 'RATE', 'LAST MOVE', 'SINCE', '1Y CHANGE', '2Y YIELD', '2Y − POLICY'].forEach(x => h.append(el('th', '', x))); tb.append(h);
      const CURVE = {US: 'US', XM: 'EA', GB: 'GB', JP: 'JP'};
      for (const [a, code] of [...CB, ...EM]) {
        const x = d.areas[a]; if (!x) continue; const v = x.history.at(-1)[1], ch = lastChange(x.history), yr = x.history.at(-13)?.[1], cv = S.desk?.curves?.[CURVE[a]]?.history?.at(-1)?.values?.['2Y'];
        const tr = el('tr'); tr.append(el('th', '', `${code} · ${x.bank}`), el('td', 'fx-num', v.toFixed(2) + '%'), el('td', 'fx-num ' + tone(ch?.bp), ch ? signed(ch.bp, 0, ' bp') : '—'), el('td', 'fx-num fx-dim', ch?.at || '—'), el('td', 'fx-num ' + tone(finite(yr) ? v - yr : null), finite(yr) ? signed((v - yr) * 100, 0, ' bp') : '—'), el('td', 'fx-num', finite(cv) ? cv.toFixed(2) + '%' : '—'), el('td', 'fx-num ' + tone(finite(cv) ? cv - v : null), finite(cv) ? signed((cv - v) * 100, 0, ' bp') : '—')); tb.append(tr);
      }
      const w = el('div', 'pg-scroll'); w.append(tb); t.append(w, PG.sourceNote(`${d.source}, latest observations ${Object.values(d.areas).map(x => x.history.at(-1)[0]).sort().at(-1)}. 2Y − policy: positive means the 2-year government yield sits above the policy rate (markets price higher rates on average over two years); negative means cuts. Government yields from the U.S. Treasury, ECB, Bank of England and Japan's Ministry of Finance.`)); host.append(t);
    }
  });

  /* ========== VSTAT: volatility statistics ================================================= */
  function stats(rows) {
    const c = rows.map(r => r.close), ret = []; for (let i = 1; i < c.length; i++) if (c[i - 1] > 0) ret.push((c[i] / c[i - 1] - 1) * 100);
    if (ret.length < 40) return null;
    const n = ret.length, mean = ret.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(ret.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
    const skew = ret.reduce((a, b) => a + ((b - mean) / sd) ** 3, 0) / n, kurt = ret.reduce((a, b) => a + ((b - mean) / sd) ** 4, 0) / n - 3;
    const beyond2 = ret.filter(r => Math.abs(r - mean) > 2 * sd).length / n * 100, sorted = [...ret].sort((a, b) => a - b);
    const hasHL = rows.every(r => finite(r.high) && finite(r.low) && r.close > 0) && rows.filter(r => r.high > r.low).length > rows.length * 0.8;
    const range = hasHL ? rows.map(r => ({date: r.date, v: (r.high - r.low) / r.close * 100})) : rows.slice(1).map((r, i) => ({date: r.date, v: Math.abs(ret[i])}));
    const avg = k => { const xs = range.slice(-k).map(x => x.v); return xs.reduce((a, b) => a + b, 0) / xs.length; };
    const byDow = [1, 2, 3, 4, 5].map(d => { const xs = range.filter(x => new Date(String(x.date).slice(0, 10) + 'T12:00:00Z').getUTCDay() === d).map(x => x.v); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; });
    const byMonth = Array.from({length: 12}, (_, m) => { const xs = range.filter(x => Number(String(x.date).slice(5, 7)) === m + 1).map(x => x.v); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; });
    let maxUp = 0, maxDn = 0; ret.forEach((r, i) => { if (r > ret[maxUp]) maxUp = i; if (r < ret[maxDn]) maxDn = i; });
    return {ret, n, mean, sd, ann: sd * Math.sqrt(252), skew, kurt, beyond2, p5: sorted[Math.floor(n * 0.05)], p95: sorted[Math.floor(n * 0.95)], current: ret.at(-1), pct: sorted.filter(x => x <= ret.at(-1)).length / n * 100,
      hasHL, avg: {w: avg(5), m: avg(21), q: avg(63), y: avg(252)}, byDow, byMonth, up: {v: ret[maxUp], date: rows[maxUp + 1].date}, dn: {v: ret[maxDn], date: rows[maxDn + 1].date}, from: rows[0].date, to: rows.at(-1).date};
  }
  function distChart(st, {W = 900, H = 280, compact = false, narrow = false} = {}) {
    const L = 34, R = 10, T0 = 12, B = 24, bins = compact ? 24 : 40, lo = Math.max(st.mean - 5 * st.sd, Math.min(...st.ret)), hi = Math.min(st.mean + 5 * st.sd, Math.max(...st.ret)), bw = (hi - lo) / bins;
    const counts = Array(bins).fill(0); st.ret.forEach(r => { const k = Math.min(bins - 1, Math.max(0, Math.floor((r - lo) / bw))); counts[k]++; });
    const pdf = x => st.n * bw / (st.sd * Math.sqrt(2 * Math.PI)) * Math.exp(-((x - st.mean) ** 2) / (2 * st.sd ** 2)), top = Math.max(...counts, pdf(st.mean)) * 1.08;
    const x = v => L + (v - lo) / (hi - lo) * (W - L - R), y = v => T0 + (top - v) / top * (H - T0 - B);
    const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart pm-chart', role: 'img', 'aria-label': `Distribution of ${st.n} daily returns; today ${st.current.toFixed(2)}% at the ${st.pct.toFixed(0)}th percentile`});
    for (let k = 0; k <= 3; k++) { const v = top * k / 3; c.append(svg('line', {x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'g'})); const t = svg('text', {x: L - 4, y: y(v) + 4, class: 'a', 'text-anchor': 'end'}); t.textContent = Math.round(v); c.append(t); }
    counts.forEach((n, i) => c.append(svg('rect', {x: x(lo + i * bw) + 0.6, width: Math.max(1, x(lo + (i + 1) * bw) - x(lo + i * bw) - 1.2), y: y(n), height: Math.max(0, y(0) - y(n)), class: 'bar'})));
    const pts = []; for (let i = 0; i <= 120; i++) { const v = lo + (hi - lo) * i / 120; pts.push(`${x(v).toFixed(1)},${y(pdf(v)).toFixed(1)}`); }
    c.append(svg('polyline', {points: pts.join(' '), fill: 'none', stroke: '#ff8a3d', 'stroke-width': 2}));
    const cx = x(Math.max(lo, Math.min(hi, st.current))); c.append(svg('line', {x1: cx, x2: cx, y1: T0, y2: H - B, stroke: '#ffb000', 'stroke-width': 1.6, 'stroke-dasharray': '5 4'}));
    const flip = cx > W - R - 90, ct = svg('text', {x: flip ? cx - 4 : cx + 4, y: T0 + 12, class: 'a', 'text-anchor': flip ? 'end' : 'start'}); ct.style.fill = '#ffb000'; ct.textContent = `today ${signed(st.current, 2, '%')}`; c.append(ct);
    const ticks = compact || narrow ? 4 : 8; for (let k = 0; k <= ticks; k++) { const v = lo + (hi - lo) * k / ticks, t = svg('text', {x: x(v), y: H - 6, class: 'a', 'text-anchor': k === 0 ? 'start' : k === ticks ? 'end' : 'middle'}); t.textContent = v.toFixed(1) + '%'; c.append(t); }
    return c;
  }
  const legendDist = () => { const l = el('div', 'pm-legend'); [['Histogram', '#5a5f5c'], ['Bell curve (normal fit)', '#ff8a3d'], ['Current', '#ffb000']].forEach(([t, col]) => { const i = el('span'), sw = el('i'); sw.style.background = col; i.append(sw, document.createTextNode(t)); l.append(i); }); return l; };
  function barRow(labels, values, unit) { const max = Math.max(...values.filter(finite)); const box = el('div', 'pm-bars'); labels.forEach((lab, i) => { const v = values[i], col = el('div'), b = el('i'); b.style.height = finite(v) ? (v / max * 100).toFixed(0) + '%' : '0'; col.append(el('span', 'fx-num', finite(v) ? v.toFixed(2) + unit : '—'), b, el('b', '', lab)); box.append(col); }); return box; }
  T.PANELS.vstat = ['VSTAT', 'Volatility stats', 'vstat'];
  T.PANEL_DESC.vstat = 'Return distribution with bell curve, today’s move and average daily range';
  T.LINK_LABEL.vstat = 'Full stats';
  T.RENDER.vstat = async () => {
    const host = T.panel('vstat'), sym = S.sym?.symbol || S.focus || 'EURUSD=X'; host.append(el('p', 'fx-empty', 'Loading two years of prices…'));
    const h = await T.symHistory(sym, '2y'); if (!host.isConnected) return; host.replaceChildren();
    const st = h?.rows?.length ? stats(h.rows) : null; if (!st) return host.append(el('p', 'fx-empty', 'Not enough price history for ' + T.nameOf(sym) + '.'));
    host.append(el('p', 'pm-lead', `${T.nameOf(sym)} · today ${signed(st.current, 2, '%')} (${Math.round(st.pct)} pct) · σ ${st.sd.toFixed(2)}%/day · ${st.ann.toFixed(1)}%/yr`), distChart(st, {W: 460, H: 150, compact: true}));
  };
  PG.add('vstat', 'Volatility stats', async (host, arg, alive) => {
    const sym = (arg && (T.resolve(arg) || arg)) || S.sym?.symbol || S.focus || 'EURUSD=X', range = read('vstat-range', '2y');
    PG.setHead('VSTAT', `Volatility stats · ${T.nameOf(sym)}`, 'Distribution of daily returns, tails and average daily range from real price history');
    host.append(PG.chips([btn('Change market', 'fx-chip fx-chip-link pg-primary', () => T.openFinder({title: 'Volatility stats for…', onPick: m => PG.open('vstat', m.symbol)})), ...['EURUSD=X', 'GBPUSD=X', 'JPY=X', 'GC=F', 'CL=F', '^GSPC', 'BTC-USD'].map(s => btn(T.shortOf(s), 'fx-chip' + (s === sym ? ' on' : ''), () => PG.open('vstat', s)))]));
    host.append(PG.pageTabs([['1y', '1 year'], ['2y', '2 years'], ['5y', '5 years (weekly)']], range, v => { store.set('vstat-range', JSON.stringify(v)); PG.rerender(); }));
    const box = el('div'); box.append(el('p', 'fx-empty', 'Loading price history…')); host.append(box);
    const h = await T.symHistory(sym, range); if (!alive()) return; box.replaceChildren();
    const st = h?.rows?.length ? stats(h.rows) : null; if (!st) return box.append(el('p', 'fx-empty', 'Not enough price history for this market.'));
    const per = range === '5y' ? 'week' : 'day', ann = range === '5y' ? st.sd * Math.sqrt(52) : st.ann;
    box.append(PG.cards([[`TODAY'S MOVE`, signed(st.current, 2, '%'), tone(st.current), `${st.pct < 1 ? 'lowest' : st.pct >= 99.5 ? 'highest' : T.M?.ordinal ? T.M.ordinal(Math.round(st.pct)) + ' percentile' : st.pct.toFixed(0) + 'th percentile'} of ${st.n} ${per}s`], [`TYPICAL ${per.toUpperCase()} (σ)`, st.sd.toFixed(2) + '%', '', `${ann.toFixed(1)}% annualised`],
      ['90% OF ' + per.toUpperCase() + 'S', `${st.p5.toFixed(2)} / ${signed(st.p95, 2, '%')}`, '', '5th to 95th percentile'], ['FAT TAILS', st.beyond2.toFixed(1) + '% beyond 2σ', st.beyond2 > 4.6 ? 'dn' : '', `normal curve: 4.6% · excess kurtosis ${st.kurt.toFixed(1)}`],
      ['SKEW', st.skew.toFixed(2), tone(st.skew), st.skew < -0.2 ? 'larger falls than rises' : st.skew > 0.2 ? 'larger rises than falls' : 'roughly symmetric']]));
    const s1 = PG.section(`Distribution chart · ${T.nameOf(sym)} · ${per === 'day' ? 'daily' : 'weekly'} returns ${String(st.from).slice(0, 10)} → ${String(st.to).slice(0, 10)}`); s1.append(legendDist(), distChart(st, fit(host, 190))); s1.append(PG.sourceNote(`Bars count ${per}s by return. The orange curve is a normal distribution with the same mean and σ — where bars sit above it in the tails, big moves happen more often than a bell curve predicts. Largest rise ${signed(st.up.v, 2, '%')} (${String(st.up.date).slice(0, 10)}), largest fall ${signed(st.dn.v, 2, '%')} (${String(st.dn.date).slice(0, 10)}).`)); box.append(s1);
    const g = PG.grid('pg-g2'), s2 = PG.section(`Average ${st.hasHL ? 'high–low range' : 'absolute move'} by period`), tb = el('table', 'fx-table pg-table'), hh = el('tr'); ['PERIOD', 'AVERAGE', 'VS 1 YEAR'].forEach(x => hh.append(el('th', '', x))); tb.append(hh);
    if (range !== '5y') [['1 week', st.avg.w], ['1 month', st.avg.m], ['3 months', st.avg.q], ['1 year', st.avg.y]].forEach(([k, v]) => { const tr = el('tr'); tr.append(el('th', '', k), el('td', 'fx-num', v.toFixed(2) + '%'), el('td', 'fx-num ' + tone(v - st.avg.y), signed((v / st.avg.y - 1) * 100, 0, '%'))); tb.append(tr); });
    const last = h.rows.at(-1), dg = T.digitsOf(sym); if (finite(last.high) && finite(last.low) && range !== '5y') { const tr = el('tr'); tr.append(el('th', '', `Latest bar ${String(last.date).slice(0, 10)}`), el('td', 'fx-num', `${fmt(last.low, dg)} – ${fmt(last.high, dg)}`), el('td', 'fx-num', ((last.high - last.low) / last.close * 100).toFixed(2) + '%')); tb.append(tr); }
    const w = el('div', 'pg-scroll'); w.append(tb); s2.append(w, PG.sourceNote(st.hasHL ? 'Range = (high − low) ÷ close for each bar.' : 'This market has no high/low history here, so the absolute close-to-close move is used.')); g.append(s2);
    if (range !== '5y') { const s3 = PG.section('Average daily range by weekday'); s3.append(barRow(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], st.byDow, '%')); g.append(s3); }
    box.append(g);
    const s4 = PG.section('Average range by month of year'); s4.append(barRow(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], st.byMonth, '%'), PG.sourceNote(`${h.source || 'Yahoo Finance (delayed)'} · ${st.n + 1} bars. Months with fewer observations are noisier.`)); box.append(s4);
  });

  /* ========== BOOK: order and position books =============================================== */
  const BOOK_SYMS = {EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'JPY=X', AUDUSD: 'AUDUSD=X', USDCAD: 'CAD=X', USDCHF: 'CHF=X', NZDUSD: 'NZDUSD=X', EURJPY: 'EURJPY=X', GBPJPY: 'GBPJPY=X', EURGBP: 'EURGBP=X', XAUUSD: 'GC=F', XAGUSD: 'SI=F'};
  function bookChart(book, kind, digits, {W = 900, narrow = false} = {}) {
    const rowH = 16, H = book.buckets.length * rowH + 30, mid = W / 2, max = Math.max(...book.buckets.flatMap(b => [b.long, b.short])) || 1;
    const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart pm-chart', role: 'img', 'aria-label': `${kind} around ${book.price}`});
    const head = (x, t, a) => { const e = svg('text', {x, y: 14, class: 'a', 'text-anchor': a}); e.textContent = t; c.append(e); };
    const gap = narrow ? 40 : 60, lab = narrow ? (kind === 'orderBook' ? ['◀ buy', 'sell ▶'] : ['◀ long', 'short ▶']) : (kind === 'orderBook' ? ['◀ buy orders', 'sell orders ▶'] : ['◀ long positions', 'short positions ▶']);
    head(mid - gap - 10, lab[0], 'end'); head(mid + gap + 10, lab[1], 'start');
    book.buckets.forEach((b, i) => {
      const y = 24 + i * rowH, near = Math.abs(b.price - book.price) < book.bucketWidth;
      const lw = b.long / max * (mid - gap - 20), sw = b.short / max * (mid - gap - 20);
      c.append(svg('rect', {x: mid - gap - lw, y, width: lw, height: rowH - 3, fill: '#3ecf8e', 'fill-opacity': 0.8}), svg('rect', {x: mid + gap, y, width: sw, height: rowH - 3, fill: '#ff6b5f', 'fill-opacity': 0.8}));
      const t = svg('text', {x: mid, y: y + rowH - 5, class: 'a', 'text-anchor': 'middle'}); t.textContent = fmt(b.price, digits); if (near) t.style.fill = '#ffb000'; c.append(t);
    });
    return c;
  }
  T.PANELS.obook = ['BOOK', 'Order & position book', 'obook'];
  T.PANEL_DESC.obook = 'Where retail clients hold orders and positions around the price (OANDA)';
  T.LINK_LABEL.obook = 'Books';
  const books = () => S.desk?.books?.markets || null;
  T.RENDER.obook = () => {
    const host = T.panel('obook'), b = books();
    if (!b) { host.append(el('p', 'fx-empty', 'Order and position books appear here once the OANDA connection is switched on for FYNX.')); return; }
    for (const [sym, x] of Object.entries(b).slice(0, 8)) { const pb = x.positionBook; if (!pb) continue; const L = pb.longTotal, Sh = pb.shortTotal, pct = L / (L + Sh) * 100, r = T.rowButton('pm-c4', () => T.openPage('obook', sym), `${sym} books`); const bar = el('span', 'pm-ix'), f = el('i'); f.style.width = pct.toFixed(0) + '%'; bar.append(f); r.append(el('b', '', sym), el('span', 'fx-num up', pct.toFixed(0) + '% long'), el('span', 'fx-num dn', (100 - pct).toFixed(0) + '% short'), bar); host.append(r); }
  };
  const renderBook = async (host, arg, alive) => {
    PG.setHead('BOOK', 'Order book & positioning', 'Aggregated OANDA client orders and open positions near the current price');
    await until(() => S.desk); if (!alive()) return;
    const b = books();
    if (!b) { host.append(el('p', 'pg-lead', 'This view shows where traders have placed buy and sell orders and where they hold long and short positions, bucketed by price. It uses OANDA’s aggregated order and position books, which FYNX publishes every 20 minutes once its OANDA connection is switched on. Until then, positioning is available from CFTC data:'), PG.chips([PG.go('Hedge fund positioning', 'cot')])); return; }
    const sym = b[arg] ? arg : Object.keys(b)[0], x = b[sym], dg = /JPY/.test(sym) ? 3 : /XA[UG]/.test(sym) ? 2 : 5;
    host.append(PG.chips(Object.keys(b).map(k => btn(k, 'fx-chip' + (k === sym ? ' on' : ''), () => PG.open('obook', k)))));
    const g = PG.grid('pg-g2');
    for (const kind of ['orderBook', 'positionBook']) { const bk = x[kind]; if (!bk) continue; const s = PG.section(`${kind === 'orderBook' ? 'Orderbook' : 'Position book'} · ${sym} · price ${fmt(bk.price, dg)}`); s.append(PG.cards([['LONG %', bk.longTotal.toFixed(1) + '%', 'up'], ['SHORT %', bk.shortTotal.toFixed(1) + '%', 'dn'], ['SNAPSHOT', new Date(bk.time).toUTCString().slice(5, 22)]]), bookChart(bk, kind, dg, fit(host, 0))); g.append(s); }
    host.append(g, PG.sourceNote(`${S.desk.books.source}. Percentages are shares of OANDA clients' orders or positions in each price bucket; they show crowding, not institutional flow.`), PG.chips([btn('Chart ' + sym + ' ▸', 'fx-chip fx-chip-link', () => T.setSymbol({symbol: BOOK_SYMS[sym] || sym}))]));
  };
  PG.add('obook', 'Order & position book', renderBook);

  /* ========== MOOD: cross-asset risk sentiment =============================================== */
  // Each input is the day's move divided by its own typical daily move (20-day σ), signed so + = risk-on.
  const MOOD = [['^GSPC', 1, 'S&P 500'], ['^IXIC', 1, 'Nasdaq'], ['^VIX', -1, 'VIX (inverted)'], ['HYG', 1, 'High-yield credit'], ['AUDJPY=X', 1, 'AUD/JPY'], ['JPY=X', 1, 'USD/JPY (yen weakness)'], ['GC=F', -1, 'Gold (inverted)'], ['BTC-USD', 1, 'Bitcoin'], ['HG=F', 1, 'Copper']];
  function mood() {
    const parts = [];
    for (const [sym, dir, label] of MOOD) { const q = T.quoteFor(sym), sig = q?.vol20 ?? S.mk?.quotes?.[sym]?.vol20; if (!q || !finite(q.changePercent) || !finite(sig) || sig <= 0) continue; parts.push({sym, label, move: q.changePercent, z: Math.max(-3, Math.min(3, dir * q.changePercent / sig))}); }
    if (parts.length < 4) return null;
    const score = parts.reduce((a, p) => a + p.z, 0) / parts.length;
    const label = score >= 0.9 ? 'STRONG RISK ON' : score >= 0.3 ? 'RISK ON' : score <= -0.9 ? 'STRONG RISK OFF' : score <= -0.3 ? 'RISK OFF' : 'NEUTRAL';
    return {score, label, parts};
  }
  function badge() {
    const top = document.querySelector('.fx-top'); if (!top) return;
    let b = document.getElementById('fx-mood');
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.id = 'fx-mood'; b.className = 'pm-mood'; b.addEventListener('click', () => T.openPage('mood')); const live = document.getElementById('fx-live'); (live?.parentNode || top).insertBefore(b, live || null); }
    const m = mood(); if (!m) { b.hidden = true; return; }
    b.hidden = false; b.dataset.state = m.score >= 0.3 ? 'on' : m.score <= -0.3 ? 'off' : 'flat'; b.textContent = (m.score >= 0.3 ? '↗︎ ' : m.score <= -0.3 ? '↘ ' : '— ') + m.label; b.title = `Cross-asset risk score ${m.score.toFixed(2)} from ${m.parts.length} markets`;
  }
  // Check every 3 s until quotes arrive, then every 15 s.
  (function tick() { badge(); setTimeout(tick, document.getElementById('fx-mood')?.hidden === false ? 15000 : 3000); })();
  T.PANELS.mood = ['MOOD', 'Risk sentiment', 'mood']; T.PANEL_DESC.mood = 'Risk on / risk off score from equities, VIX, credit, yen, gold, bitcoin and copper'; T.LINK_LABEL.mood = 'How it works';
  const moodRows = (host, m) => { for (const p of m.parts) { const r = T.rowButton('pm-c4', () => T.setSymbol({symbol: p.sym}), p.label); const bar = el('span', 'pm-zb'), f = el('i'); f.style.width = Math.abs(p.z) / 3 * 50 + '%'; f.style[p.z >= 0 ? 'left' : 'right'] = '50%'; f.className = p.z >= 0 ? 'up' : 'dn'; bar.append(f); r.append(el('b', '', p.label), el('span', 'fx-num ' + tone(p.move), signed(p.move, 2, '%')), el('span', 'fx-num ' + tone(p.z), signed(p.z, 1, 'σ')), bar); host.append(r); } };
  T.RENDER.mood = () => { const host = T.panel('mood'), m = mood(); if (!m) return host.append(el('p', 'fx-empty', 'Waiting for live quotes…')); host.append(el('p', 'pm-lead pm-' + (m.score >= 0.3 ? 'on' : m.score <= -0.3 ? 'off' : 'flat'), `${m.label} · score ${signed(m.score, 2)}`)); moodRows(host, m); badge(); };
  PG.add('mood', 'Risk sentiment', async (host, arg, alive) => {
    PG.setHead('MOOD', 'Risk sentiment', 'Cross-asset risk-on / risk-off reading from live quotes');
    await until(() => mood()); if (!alive()) return;
    const m = mood(); if (!m) return host.append(el('p', 'fx-empty', 'Waiting for live quotes…'));
    host.append(PG.cards([['READING', m.label, m.score >= 0.3 ? 'up' : m.score <= -0.3 ? 'dn' : ''], ['SCORE', signed(m.score, 2), tone(m.score), '−3 (panic) to +3 (euphoria)'], ['INPUTS', String(m.parts.length), '', 'live markets used']]));
    const s = PG.section('What is driving it'); moodRows(s, m); host.append(s);
    host.append(PG.sourceNote('Each market’s move today is divided by its typical daily move (20-day standard deviation) and signed so that a positive number means risk appetite: stocks, credit, AUD/JPY, USD/JPY, bitcoin and copper up; VIX and gold down. The score is their average, capped at ±3σ each. ≥ +0.3 risk on, ≥ +0.9 strong; ≤ −0.3 risk off, ≤ −0.9 strong. Quotes are delayed.'));
  });

  T.EXTRA_GROUPS.push(['Institutional tools', ['cot', 'wirp', 'vstat', 'obook', 'mood']]);
  // Command line: COT EUR · WIRP · VSTAT GBPUSD · BOOK EURUSD · MOOD
  T.PAGE_NAMES.push('COT', 'WIRP', 'VSTAT', 'BOOK', 'MOOD');
  PG.add('book', 'Order & position book', (host, arg, alive) => renderBook(host, arg && String(arg).toUpperCase(), alive));
  // Nothing on the existing desks is replaced: these tools are added through Edit → + Add panel, and open as full pages.
});
