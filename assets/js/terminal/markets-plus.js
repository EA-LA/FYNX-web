/* FYNX Terminal plugin: Market sentiment (FYNX Fear & Greed), Market hours, News wire, SEC filings and the
 * company snapshot on the security page.
 *
 * SENTIMENT  FYNX Fear & Greed index (0–100) from seven market indicators, each with its own history: gauge, last
 *            30 sessions, history with zones, every indicator charted, University of Michigan consumer sentiment.
 *            Panel FNG on the desks. Data: sentiment.json (scripts/refresh-sentiment.cjs).
 * HOURS      Every major stock exchange, futures venue and FX session: live status, local time, session hours,
 *            countdown to the next open or close, lunch breaks, weekends and the holiday calendars FYNX has.
 * WIRE       Four live headline columns side by side (markets, stocks, crypto, forex by default; any category).
 * FILINGS    A company's SEC EDGAR filings: 10-K, 10-Q, 8-K (with item titles), proxies, insider and ownership
 *            forms, each linked to the document on sec.gov.
 * DES        Stocks get a company snapshot: sector, industry and index membership, performance against the S&P 500,
 *            and a financial overview from the latest 10-K against today's market value. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {S, el, btn, svg, signed, tone, fmt, finite, store, report} = T;
  const $ = id => document.getElementById(id);
  const tk = (n, key, v) => T.tk ? T.tk(n, key, v) : n;
  const usd = v => !finite(v) ? '—' : (v < 0 ? '−' : '') + '$' + (Math.abs(v) >= 1e12 ? (Math.abs(v) / 1e12).toFixed(2) + 'T' : Math.abs(v) >= 1e9 ? (Math.abs(v) / 1e9).toFixed(2) + 'B' : Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(1) + 'M' : Math.abs(v).toLocaleString('en-US', {maximumFractionDigits: 0}));
  const dshort = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'});

  /* ======================= FEAR & GREED ======================= */
  const ZONES = [[0, 25, 'Extreme fear', '#e5484d'], [25, 45, 'Fear', '#f5803e'], [45, 55, 'Neutral', '#8f9a95'], [55, 75, 'Greed', '#7ccf6e'], [75, 100.01, 'Extreme greed', '#2fb874']];
  const zone = s => ZONES.find(z => s >= z[0] && s < z[1]) || ZONES[2];
  const SENT = {data: null, at: 0};
  async function loadSent(force) {
    if (!force && SENT.data && Date.now() - SENT.at < 10 * 60000) return SENT.data;
    try { const d = await T.getJSON(T.TDATA + 'sentiment.json', {bust: true, timeout: 20000}); if (d?.version === 1 && finite(d.score)) { SENT.data = d; SENT.at = Date.now(); } }
    catch (e) { report('sentiment', e); }
    return SENT.data;
  }
  function scaleBar(score) {
    const bar = el('div', 'fg-scale'); bar.setAttribute('aria-hidden', 'true');
    for (const [a, b, , c] of ZONES) { const s = el('i'); s.style.cssText = `left:${a}%;width:${Math.min(100, b) - a}%;background:${c}`; bar.append(s); }
    const m = el('b'); m.style.left = Math.max(0, Math.min(100, score)) + '%'; bar.append(m);
    const ticks = el('div', 'fg-ticks'); for (const t of [0, 25, 45, 55, 75, 100]) { const x = el('span', '', String(t)); x.style.left = t + '%'; ticks.append(x); }
    const w = el('div', 'fg-scalew'); w.append(bar, ticks); return w;
  }
  function last30(d) {
    const rows = d.history.slice(-30), box = el('div', 'fg-30'), lo = Math.min(...rows.map(r => r[1])), hi = Math.max(...rows.map(r => r[1]));
    const head = el('div', 'fg-30h'); head.append(el('span', '', `LAST ${rows.length} SESSIONS`), el('span', '', `LOW ${lo.toFixed(1)} · HIGH ${hi.toFixed(1)} · AVG ${(rows.reduce((s, r) => s + r[1], 0) / rows.length).toFixed(1)}`));
    const strip = el('div', 'fg-30s');
    rows.forEach(([date, v], i) => { const c = el('span', i === rows.length - 1 ? 'now' : ''); c.style.background = zone(v)[3]; c.style.setProperty('--h', Math.max(12, v) + '%'); c.title = `${dshort(date)}: ${v.toFixed(1)} · ${zone(v)[2]}`; c.append(el('em', '', String(Math.round(v)))); strip.append(c); });
    const dates = el('div', 'fg-30d'); [0, 7, 14, 21, rows.length - 1].filter(i => rows[i]).forEach(i => { const s = el('span', '', dshort(rows[i][0]).toUpperCase()); s.style.left = (i / (rows.length - 1) * 100) + '%'; dates.append(s); });
    box.append(head, strip, dates); return box;
  }
  function gauge(d, {compact = false} = {}) {
    const z = zone(d.score), card = el('div', 'fg-gauge' + (compact ? ' compact' : ''));
    const top = el('div', 'fg-top'), num = el('b', 'fg-num', String(Math.round(d.score))); num.style.color = z[3];
    const lab = el('div', 'fg-lab'); const zl = el('strong', '', z[2].toUpperCase()); zl.style.color = z[3];
    const ch = d.prev ? d.score - d.prev.score : null;
    lab.append(zl, el('small', '', finite(ch) ? `${signed(ch, 1)} vs prev close` : ''), el('small', 'fx-dim', `as of ${dshort(d.asOf)}${d.stale ? ' · previous reading' : ''}`));
    tk(num, 'fng:score', null);
    top.append(num, lab); card.append(top, scaleBar(d.score));
    if (d.history?.length) card.append(last30(d));
    const back = el('div', 'fg-back');
    for (const [k, l] of [['prev', 'PREV CLOSE'], ['week', '1 WEEK AGO'], ['month', '1 MONTH AGO'], ['year', '1 YEAR AGO']]) { const x = d[k]; if (!x) continue; const c = el('div'); const v = el('b', '', x.score.toFixed(1)); v.style.color = zone(x.score)[3]; c.append(el('small', '', l), v, el('em', '', zone(x.score)[2].toUpperCase())); back.append(c); }
    card.append(back);
    return card;
  }
  // Line chart with optional zone bands, reference line and right axis; dates as ISO strings.
  function chart(series, {W = 640, H = 220, color = '#ffb000', bands = false, ref = null, fmtV = v => v.toFixed(1), unit = '', aria = '', fixed = null} = {}) {
    const L = 6, R = 58, Tp = 8, B = 20, c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart fg-chart', role: 'img', 'aria-label': aria});
    if (series.length < 2) return c;
    const vs = series.map(p => p[1]); let lo = fixed ? fixed[0] : Math.min(...vs, ...(finite(ref) ? [ref] : [])), hi = fixed ? fixed[1] : Math.max(...vs, ...(finite(ref) ? [ref] : []));
    if (!fixed) { const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad; }
    const x = i => L + i / (series.length - 1) * (W - L - R), y = v => Tp + (hi - v) / (hi - lo || 1) * (H - Tp - B);
    if (bands) { c.append(svg('rect', {x: L, y: y(100), width: W - L - R, height: y(75) - y(100), fill: 'rgba(47,184,116,.16)'}), svg('rect', {x: L, y: y(25), width: W - L - R, height: y(0) - y(25), fill: 'rgba(229,72,77,.16)'}));
      for (const [v, t] of [[88, 'EXTREME GREED'], [12, 'EXTREME FEAR']]) { const tx = svg('text', {x: L + 6, y: y(v) + 3, class: 'a', opacity: 0.8}); tx.textContent = t; c.append(tx); } }
    const ticks = fixed && bands ? [0, 25, 50, 75, 100] : [0, 1, 2, 3, 4].map(k => lo + (hi - lo) * k / 4);
    for (const v of ticks) { c.append(svg('line', {x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'g'})); const t = svg('text', {x: W - R + 6, y: y(v) + 4, class: 'a'}); t.textContent = fmtV(v) + unit; c.append(t); }
    if (finite(ref)) c.append(svg('line', {x1: L, x2: W - R, y1: y(ref), y2: y(ref), stroke: '#6a7570', 'stroke-dasharray': '3 3'}));
    const n = series.length, step = Math.max(1, Math.floor(n / 5)); for (let i = 0; i < n; i += step) { if (i > n - step / 2) break; const t = svg('text', {x: x(i), y: H - 5, class: 'a', 'text-anchor': i === 0 ? 'start' : 'middle'}); t.textContent = new Date(series[i][0] + 'T12:00:00Z').toLocaleDateString('en-US', {month: 'short', year: '2-digit', timeZone: 'UTC'}); c.append(t); }
    if (bands) { for (let i = 1; i < n; i++) c.append(svg('line', {x1: x(i - 1), x2: x(i), y1: y(vs[i - 1]), y2: y(vs[i]), stroke: zone((vs[i - 1] + vs[i]) / 2)[3], 'stroke-width': 1.5})); }
    else c.append(svg('polyline', {points: series.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 1.4, 'stroke-linejoin': 'round'}));
    const lv = vs.at(-1), tag = svg('rect', {x: W - R + 2, y: y(lv) - 8, width: R - 4, height: 15, fill: bands ? zone(lv)[3] : color, rx: 1}), tt = svg('text', {x: W - R + 6, y: y(lv) + 3.5, fill: '#000', 'font-size': 10, 'font-weight': 700, 'font-family': 'IBM Plex Mono, monospace'});
    tt.textContent = fmtV(lv) + unit; c.append(tag, tt);
    return c;
  }
  const SPAN = {'1M': 22, '3M': 64, '6M': 127, '1Y': 253, '2Y': 520};
  const IND_COLOR = {momentum: '#ffd23f', strength: '#c4a1ff', breadth: '#5ce1e6', volatility: '#ffd23f', term: '#ff8a3d', haven: '#c4a1ff', junk: '#5b8def'};
  const indFmt = ind => ind.unit === '×' ? v => v.toFixed(2) : v => v.toFixed(Math.abs(v) >= 100 ? 0 : 1);

  T.PANELS.fng = ['FNG', 'Fear & Greed', 'sentiment']; T.PANEL_DESC.fng = 'FYNX Fear & Greed index from seven market indicators, with the last 30 sessions';
  T.LINK_LABEL.sentiment = 'Sentiment';
  T.RENDER.fng = async () => {
    const host = T.panel('fng'); if (!SENT.data) host.append(el('p', 'fx-empty', 'Loading Fear & Greed…'));
    const d = await loadSent(); if (!host.isConnected) return; host.replaceChildren();
    if (!d) return host.append(el('p', 'fx-empty', 'The Fear & Greed reading is not available right now.'));
    T.setText('n-fng', `${Math.round(d.score)} · ${zone(d.score)[2]}`);
    host.append(gauge(d, {compact: true}));
    const list = el('div', 'fg-inds');
    for (const ind of d.indicators) { if (!finite(ind.score)) continue; const r = el('div', 'fg-ind'), bar = el('i'), f = el('b'); f.style.width = ind.score + '%'; f.style.background = zone(ind.score)[3]; bar.append(f); r.title = ind.desc; r.append(el('span', '', ind.name), bar, el('em', '', zone(ind.score)[2])); list.append(r); }
    host.append(list, el('p', 'fx-foot', 'FYNX formula: each indicator scored against its own past year, averaged · daily closes'));
  };
  T.EXTRA_GROUPS.push(['Sentiment', ['fng']]);
  if (T.DESK_DEFS?.dash && !T.DESK_DEFS.dash.slots.includes('fng')) { const s = T.DESK_DEFS.dash.slots, i = s.indexOf('intel'); if (i >= 0) s[i] = 'fng'; else s.push('fng'); }

  const sentimentPage = async (host, arg, alive) => {
    PG.setHead('SENT', 'Market sentiment', 'FYNX Fear & Greed index and the seven indicators behind it');
    host.append(el('p', 'fx-empty', 'Loading market sentiment…'));
    const d = await loadSent(); if (!alive()) return; host.replaceChildren();
    if (!d) return host.append(el('p', 'fx-empty', 'The Fear & Greed reading is not available right now. It refreshes with the market data every trading day.'));
    let span = store.get('fg-span') || '1Y';
    const top = el('div', 'fg-topgrid'), left = el('section', 'pg-sec fg-card'), right = el('section', 'pg-sec fg-card');
    left.append(el('h2', 'pg-h2', 'FEAR & GREED INDEX'), gauge(d));
    const grid = el('div', 'fg-grid');
    function draw() {
      right.replaceChildren(); const head = el('div', 'fg-ch'); head.append(el('h2', 'pg-h2', 'FEAR & GREED · HISTORICAL'), PG.pageTabs(Object.keys(SPAN).map(k => [k, k]), span, v => { span = v; store.set('fg-span', v); draw(); }));
      right.append(head, chart(d.history.slice(-SPAN[span]), {W: 760, H: 300, bands: true, fixed: [0, 100], fmtV: v => v.toFixed(0), aria: 'Fear and greed index history'}));
      grid.replaceChildren();
      for (const ind of d.indicators) {
        const c = el('section', 'pg-sec fg-card'), h = el('div', 'fg-ch'), chip = el('span', 'fg-chip', finite(ind.score) ? `${zone(ind.score)[2].toUpperCase()} · ${Math.round(ind.score)}` : 'NO READING');
        if (finite(ind.score)) chip.style.cssText = `background:${zone(ind.score)[3]};color:#000`;
        h.append(el('h2', 'pg-h2', ind.name.toUpperCase()), chip);
        const now = el('div', 'fg-now'); now.append(el('b', '', finite(ind.value) ? indFmt(ind)(ind.value) + (ind.unit === '×' ? '×' : ind.unit === '%' ? '%' : ' pts') : '—'), el('small', '', ind.invert ? 'higher = more fear' : 'higher = more greed'));
        c.append(h, now, chart(ind.series.slice(-SPAN[span]), {W: 520, H: 190, color: IND_COLOR[ind.key] || '#ffb000', ref: ind.key === 'term' ? 1 : 0, fmtV: indFmt(ind), unit: ind.unit === '%' ? '%' : '', aria: ind.name}), el('p', 'fx-foot', ind.desc));
        grid.append(c);
      }
      if (d.michigan?.length) {
        const c = el('section', 'pg-sec fg-card'), h = el('div', 'fg-ch'), last = d.michigan.at(-1), prev = d.michigan.at(-2);
        h.append(el('h2', 'pg-h2', 'CONSUMER SENTIMENT · MICHIGAN'), el('span', 'fg-chip', new Date(last[0] + 'T12:00:00Z').toLocaleDateString('en-US', {month: 'short', year: 'numeric', timeZone: 'UTC'}).toUpperCase()));
        const now = el('div', 'fg-now'); now.append(el('b', '', last[1].toFixed(1)), el('small', tone(last[1] - prev[1]), `${signed(last[1] - prev[1], 1)} vs prior month · monthly survey, 1966 = 100`));
        const months = {'1M': 13, '3M': 25, '6M': 61, '1Y': 61, '2Y': 121}[span];
        c.append(h, now, chart(d.michigan.slice(-months), {W: 520, H: 190, color: '#5b8def', fmtV: v => v.toFixed(0), aria: 'University of Michigan consumer sentiment'}), el('p', 'fx-foot', `${d.sources?.michigan || 'University of Michigan'} · last ${months > 61 ? '10' : '5'} years`));
        grid.append(c);
      }
    }
    top.append(left, right); host.append(top, grid);
    draw();
    host.append(PG.sourceNote(`${d.method} Scale: 0–25 extreme fear, 25–45 fear, 45–55 neutral, 55–75 greed, 75–100 extreme greed. Strength and breadth use ${d.membersUsed || 'the'} S&P 500 members. ${d.sources?.prices || ''}. This is FYNX's own transparent index, not a third-party gauge. Updated ${new Date(d.generatedAt).toLocaleString()}.`));
  };

  /* ======================= MARKET HOURS ======================= */
  const H = window.FynxExchangeHolidays || {};
  const WD = [1, 2, 3, 4, 5], SUTH = [0, 1, 2, 3, 4];
  const m = (h, mi = 0) => h * 60 + mi;
  // [code, name, country, tz, sessions [[openMin, closeMin]...], weekdays, holiday source]
  const VENUES = {
    Americas: [['NYSE', 'New York Stock Exchange', 'US', 'America/New_York', [[m(9, 30), m(16)]], WD, 'NYSE'], ['NASDAQ', 'Nasdaq Stock Market', 'US', 'America/New_York', [[m(9, 30), m(16)]], WD, 'NYSE'],
      ['TSX', 'Toronto Stock Exchange', 'CA', 'America/Toronto', [[m(9, 30), m(16)]], WD, 'TSX'], ['BMV', 'Bolsa Mexicana de Valores', 'MX', 'America/Mexico_City', [[m(8, 30), m(15)]], WD], ['B3', 'B3 São Paulo', 'BR', 'America/Sao_Paulo', [[m(10), m(17)]], WD]],
    'Europe, Middle East & Africa': [['LSE', 'London Stock Exchange', 'GB', 'Europe/London', [[m(8), m(16, 30)]], WD, 'LSE'], ['XETRA', 'Deutsche Börse Xetra', 'DE', 'Europe/Berlin', [[m(9), m(17, 30)]], WD], ['EPA', 'Euronext Paris', 'FR', 'Europe/Paris', [[m(9), m(17, 30)]], WD],
      ['AMS', 'Euronext Amsterdam', 'NL', 'Europe/Amsterdam', [[m(9), m(17, 30)]], WD], ['SIX', 'SIX Swiss Exchange', 'CH', 'Europe/Zurich', [[m(9), m(17, 20)]], WD], ['BIT', 'Borsa Italiana', 'IT', 'Europe/Rome', [[m(9), m(17, 30)]], WD], ['BME', 'Bolsa de Madrid', 'ES', 'Europe/Madrid', [[m(9), m(17, 30)]], WD],
      ['STO', 'Nasdaq Stockholm', 'SE', 'Europe/Stockholm', [[m(9), m(17, 30)]], WD], ['CPH', 'Nasdaq Copenhagen', 'DK', 'Europe/Copenhagen', [[m(9), m(17)]], WD], ['HEL', 'Nasdaq Helsinki', 'FI', 'Europe/Helsinki', [[m(10), m(18, 30)]], WD], ['OSL', 'Euronext Oslo Børs', 'NO', 'Europe/Oslo', [[m(9), m(16, 20)]], WD],
      ['WSE', 'Warsaw Stock Exchange', 'PL', 'Europe/Warsaw', [[m(9), m(17)]], WD], ['VIE', 'Wiener Börse', 'AT', 'Europe/Vienna', [[m(9), m(17, 30)]], WD], ['JSE', 'Johannesburg Stock Exchange', 'ZA', 'Africa/Johannesburg', [[m(9), m(17)]], WD], ['TADAWUL', 'Saudi Exchange (Tadawul)', 'SA', 'Asia/Riyadh', [[m(10), m(15)]], SUTH]],
    'Asia-Pacific': [['TSE', 'Tokyo Stock Exchange', 'JP', 'Asia/Tokyo', [[m(9), m(11, 30)], [m(12, 30), m(15, 30)]], WD, 'TSE'], ['HKEX', 'Hong Kong Exchanges', 'HK', 'Asia/Hong_Kong', [[m(9, 30), m(12)], [m(13), m(16)]], WD, 'HKEX'], ['SSE', 'Shanghai Stock Exchange', 'CN', 'Asia/Shanghai', [[m(9, 30), m(11, 30)], [m(13), m(15)]], WD],
      ['SZSE', 'Shenzhen Stock Exchange', 'CN', 'Asia/Shanghai', [[m(9, 30), m(11, 30)], [m(13), m(15)]], WD], ['KRX', 'Korea Exchange', 'KR', 'Asia/Seoul', [[m(9), m(15, 30)]], WD], ['TWSE', 'Taiwan Stock Exchange', 'TW', 'Asia/Taipei', [[m(9), m(13, 30)]], WD], ['SGX', 'Singapore Exchange', 'SG', 'Asia/Singapore', [[m(9), m(12)], [m(13), m(17)]], WD],
      ['NSE', 'National Stock Exchange of India', 'IN', 'Asia/Kolkata', [[m(9, 15), m(15, 30)]], WD], ['ASX', 'Australian Securities Exchange', 'AU', 'Australia/Sydney', [[m(10), m(16)]], WD], ['NZX', 'NZX', 'NZ', 'Pacific/Auckland', [[m(10), m(16, 45)]], WD]],
    'Futures': [['CME', 'CME Globex · equity, rates, FX, energy, metals', 'US', 'America/Chicago', {0: [[m(17), 1440]], 1: [[0, m(16)], [m(17), 1440]], 2: [[0, m(16)], [m(17), 1440]], 3: [[0, m(16)], [m(17), 1440]], 4: [[0, m(16)], [m(17), 1440]], 5: [[0, m(16)]]}, [0, 1, 2, 3, 4, 5]],
      ['ICE EU', 'ICE Futures Europe · Brent, gasoil', 'GB', 'Europe/London', [[m(1), m(23)]], WD], ['EUREX', 'Eurex · DAX, Euro Stoxx, Bund', 'DE', 'Europe/Berlin', [[m(1, 10), m(22)]], WD], ['LME', 'London Metal Exchange · LMEselect', 'GB', 'Europe/London', [[m(1), m(19)]], WD]],
    'Forex sessions': [['SYD', 'Sydney session · AUD, NZD', 'AU', 'Australia/Sydney', [[m(7), m(16)]], WD], ['TYO', 'Tokyo session · JPY', 'JP', 'Asia/Tokyo', [[m(9), m(18)]], WD], ['LDN', 'London session · EUR, GBP, CHF', 'GB', 'Europe/London', [[m(8), m(17)]], WD], ['NYC', 'New York session · USD, CAD', 'US', 'America/New_York', [[m(8), m(17)]], WD]]};
  const partsFmt = {};
  function local(t, tz) {
    const f = partsFmt[tz] ||= new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'});
    const p = Object.fromEntries(f.formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return {date: `${p.year}-${p.month}-${p.day}`, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), mins: (+p.hour % 24) * 60 + +p.minute + +p.second / 60, hhmm: `${p.hour % 24 < 10 ? '0' : ''}${+p.hour % 24}:${p.minute}`};
  }
  // UTC epoch of a local wall-clock time (date + minutes) in a time zone.
  function zoned(date, mins, tz) {
    const [y, mo, d] = date.split('-').map(Number), guess = Date.UTC(y, mo - 1, d, 0, mins);
    let t = guess; for (let k = 0; k < 3; k++) { const l = local(t, tz), [ly, lm, ld] = l.date.split('-').map(Number), shown = Date.UTC(ly, lm - 1, ld, 0, l.mins); t += guess - shown; }
    return Math.round(t / 1000) * 1000;
  }
  const addDay = (date, n) => { const [y, mo, d] = date.split('-').map(Number), t = new Date(Date.UTC(y, mo - 1, d + n)); return t.toISOString().slice(0, 10); };
  // Published half-day closes: TSX 1:00 PM, LSE 12:30 PM, HKEX noon (no afternoon session).
  const EARLY = {TSX: m(13), LSE: m(12, 30), HKEX: m(12)};
  function holiday(src, date) {
    if (!src) return null;
    if (src === 'NYSE') { const ms = T.MarketStatus; if (!ms) return null; const y = +date.slice(0, 4), c = ms.nyse(y); return c.closed.has(date) ? {closed: c.closed.get(date)} : c.early.has(date) ? {early: m(13)} : null; }
    const y = H[src]?.[+date.slice(0, 4)]; if (!y) return null; const md = date.slice(5);
    return (y.closed || []).includes(md) ? {closed: 'Exchange holiday'} : (y.early || []).includes(md) && EARLY[src] ? {early: EARLY[src]} : null;
  }
  function sessionsOn(v, date, wd) {
    const [, , , , ses, days, src] = v;
    if (!days.includes(wd)) return {list: [], why: 'Weekend'};
    const h = holiday(src, date); if (h?.closed) return {list: [], why: h.closed};
    let list = Array.isArray(ses) ? ses.map(s => [...s]) : (ses[wd] || []).map(s => [...s]);
    if (h?.early && list.length) { const end = h.early; list = list.filter(s => s[0] < end).map(s => [s[0], Math.min(s[1], end)]); }
    return {list, early: !!h?.early};
  }
  function venueState(v, now) {
    const tz = v[3], l = local(now, tz), today = sessionsOn(v, l.date, l.wd);
    const inS = today.list.find(s => l.mins >= s[0] && l.mins < s[1]);
    if (inS) { const end = zoned(l.date, inS[1], tz), start = zoned(l.date, inS[0], tz); return {state: 'open', label: 'OPEN', next: end, nextLabel: 'Closes in', progress: (now - start) / (end - start), early: today.early, l}; }
    const later = today.list.find(s => s[0] > l.mins), earlier = today.list.find(s => s[1] <= l.mins);
    if (later) return {state: earlier ? 'lunch' : 'closed', label: earlier ? (Array.isArray(v[4]) ? 'LUNCH' : 'DAILY PAUSE') : 'PRE-OPEN', next: zoned(l.date, later[0], tz), nextLabel: 'Opens in', l, why: null};
    for (let i = 1; i <= 12; i++) { const date = addDay(l.date, i), wd = (l.wd + i) % 7, s = sessionsOn(v, date, wd); if (s.list.length) return {state: 'closed', label: today.list.length ? 'CLOSED' : today.why === 'Weekend' ? 'WEEKEND' : 'HOLIDAY', why: today.list.length ? null : today.why, next: zoned(date, s.list[0][0], tz), nextLabel: 'Opens in', l}; }
    return {state: 'closed', label: 'CLOSED', next: null, l};
  }
  const hms = ms => { const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), mi = Math.floor(s % 3600 / 60), se = s % 60; return d ? `${d}d ${h}h ${mi}m` : `${h}h ${String(mi).padStart(2, '0')}m ${String(se).padStart(2, '0')}s`; };
  const hoursText = (v, l) => { const s = sessionsOn(v, l.date, l.wd).list, base = s.length ? s : Array.isArray(v[4]) ? v[4] : (v[4][1] || []); const f = x => `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; return base.map(x => `${f(x[0])}\u2060–\u2060${x[1] === 1440 ? '24:00' : f(x[1])}`).join(' · '); };
  T.VenueStatus = window.FynxVenueStatus = {state: venueState, venues: VENUES, zoned, find: code => Object.values(VENUES).flat().find(v => v[0] === code)};
  if (PG) PG.add('hours', 'Market hours', (host, arg, alive) => {
    PG.setHead('HOURS', 'Market hours', 'Every major exchange, futures venue and FX session: live status and countdowns');
    const summary = el('div', 'mkh-sum'), cards = [];
    host.append(summary);
    for (const [group, list] of Object.entries(VENUES)) {
      const sec = PG.section(group.toUpperCase()), grid = el('div', 'mkh-grid'); sec.append(grid);
      for (const v of list) {
        const c = el('div', 'mkh-card' + (v[2] === 'US' && group === 'Americas' ? ' us' : '')), head = el('div', 'mkh-h'), badge = el('span', 'mkh-badge');
        head.append(el('span', 'mkh-cc', v[2]), el('div', 'mkh-n'), badge); head.children[1].append(el('b', '', v[0]), el('small', '', v[1]));
        const rows = el('div', 'mkh-rows'), hours = el('span'), when = el('b'), whenL = el('small'), clock = el('span', 'mkh-clock'), bar = el('i', 'mkh-bar'), fill = el('b'); bar.append(fill);
        const r1 = el('div'); r1.append(el('small', '', 'Hours'), hours, clock); const r2 = el('div'); r2.append(whenL, when);
        rows.append(r1, r2, bar); c.append(head, rows); grid.append(c);
        cards.push({v, c, badge, hours, when, whenL, clock, fill, group});
      }
      host.append(sec);
    }
    const tickAll = () => {
      if (!alive() || !host.isConnected) return clearInterval(timer);
      const now = Date.now(); let open = 0, eq = 0;
      for (const k of cards) {
        const s = venueState(k.v, now);
        if (k.group !== 'Futures' && k.group !== 'Forex sessions') { eq++; if (s.state === 'open') open++; }
        if (k.c.dataset.s !== s.state) k.c.dataset.s = s.state;
        const label = s.why && s.why !== 'Weekend' ? s.why.toUpperCase() : s.label + (s.early && s.state === 'open' ? ' · EARLY CLOSE' : '');
        if (k.badge.textContent !== label) k.badge.textContent = label;
        const hr = hoursText(k.v, s.l) + ' local'; if (k.hours.textContent !== hr) k.hours.textContent = hr;
        k.clock.textContent = s.l.hhmm; k.whenL.textContent = s.next ? s.nextLabel : ''; k.when.textContent = s.next ? hms(s.next - now) : '—';
        k.fill.style.width = s.state === 'open' ? (Math.max(0, Math.min(1, s.progress)) * 100).toFixed(1) + '%' : '0%';
      }
      summary.replaceChildren(el('b', '', `${open} of ${eq}`), el('span', '', ' stock exchanges open now'), el('small', 'fx-dim', ` · your time ${new Date(now).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'})}`));
    };
    const timer = setInterval(tickAll, 1000); tickAll();
    host.append(PG.sourceNote('Regular continuous-trading hours in each venue’s local time, including lunch breaks (Tokyo, Hong Kong, Shanghai, Shenzhen, Singapore). Holiday calendars applied: NYSE and Nasdaq (NYSE rules, with 1 PM early closes), TSX, LSE, Japan Exchange Group and HKEX; other venues show their regular weekday schedule, so a local holiday there is not flagged. Futures show the electronic session (CME Globex: Sunday 5 PM to Friday 4 PM Central with a daily 4–5 PM pause). FX sessions are the customary centre hours; the FX market itself trades from Sunday 5 PM to Friday 5 PM New York time.'));
  });

  /* ======================= NEWS WIRE ======================= */
  const CAT_LABEL = Object.fromEntries((T.NEWS_CATS || []).map(([k, l]) => [k, l]));
  if (PG) PG.add('wire', 'News wire', (host, arg, alive) => {
    PG.setHead('WIRE', 'News wire', 'Four live headline columns side by side · choose any category for each');
    const defaults = ['all', 'stocks', 'crypto', 'forex'], cats = (T.NEWS_CATS || []).map(([k]) => k), grid = el('div', 'nw-grid'), cols = [];
    let chosen; try { chosen = JSON.parse(store.get('wire-cats') || 'null'); } catch { chosen = null; }
    if (!Array.isArray(chosen) || chosen.length !== 4 || chosen.some(c => !cats.includes(c))) chosen = defaults.filter(c => cats.includes(c) || c === 'all');
    async function fill(i, force) {
      const col = cols[i], cat = chosen[i]; col.status.textContent = 'Loading…';
      const r = await T.loadNews(cat, force); if (!alive()) return;
      const items = (r?.items || []).slice(0, 40); col.list.replaceChildren();
      PG.newsList(col.list, items, 'No headlines in this feed right now.');
      col.status.textContent = items.length ? `${items.length} · ${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}` : '';
    }
    chosen.forEach((cat, i) => {
      const box = el('section', 'nw-col'), head = el('div', 'nw-h'), sel = el('select', 'nw-sel'); sel.setAttribute('aria-label', `Column ${i + 1} category`);
      for (const c of cats) { const o = el('option', '', (CAT_LABEL[c] || c).toUpperCase()); o.value = c; if (c === cat) o.selected = true; sel.append(o); }
      sel.addEventListener('change', () => { chosen[i] = sel.value; store.set('wire-cats', JSON.stringify(chosen)); fill(i); });
      const status = el('small', 'nw-st'), refresh = btn('↻', 'nw-rf', () => fill(i, true), 'Refresh this column');
      head.append(sel, status, refresh); const list = el('div', 'nw-list'); box.append(head, list); grid.append(box); cols.push({list, status});
    });
    host.append(grid, PG.sourceNote('Headlines from the FYNX news feeds (publisher links open the source). Each column refreshes every two minutes while this page is open; your column choices are remembered.'));
    chosen.forEach((_, i) => fill(i));
    const timer = setInterval(() => { if (!alive() || !host.isConnected) return clearInterval(timer); if (!document.hidden) chosen.forEach((_, i) => fill(i, true)); }, 120000);
  });

  /* ======================= SEC FILINGS ======================= */
  const RESEARCH = ['/fn/research.js', 'https://fynxfinanceworld.vercel.app/fn/research.js', 'https://us-central1-fynx-c7a28.cloudfunctions.net/webResearchData'];
  let researchBase = null; const FIL = {};
  async function research(params) {
    const qs = '?' + new URLSearchParams(params), order = researchBase ? [researchBase, ...RESEARCH.filter(u => u !== researchBase)] : RESEARCH; let last;
    for (const base of order) {
      try {
        const r = await fetch(base + qs, {signal: AbortSignal.timeout(25000)});
        if (!/json/.test(r.headers.get('content-type') || '')) throw new Error('not a JSON endpoint');
        const d = await r.json(); if (!r.ok) throw new Error(d?.error || 'HTTP ' + r.status);
        researchBase = base; return d;
      } catch (e) { last = e; }
    }
    throw last || new Error('Research service unavailable');
  }
  async function cikFor(ticker) { const dir = await T.loadDirectory(); const s = String(ticker || '').toUpperCase(), alt = s.replace('-', '.'); return (dir || []).find(c => c.symbol === s || c.symbol === alt)?.cik || null; }
  async function loadFilings(ticker) {
    const key = String(ticker).toUpperCase(); if (FIL[key] && Date.now() - FIL[key].at < 30 * 60000) return FIL[key].d;
    const cik = /^\d+$/.test(key) ? Number(key) : await cikFor(key); if (!cik) throw Object.assign(new Error('nf'), {notFound: true});
    const d = await research({action: 'filings', cik}); FIL[key] = {d, at: Date.now()}; return d;
  }
  const GROUPS = [['all', 'ALL'], ['annual', '10-K'], ['quarterly', '10-Q'], ['current', '8-K'], ['proxy', 'PROXY'], ['insider', 'INSIDER'], ['ownership', '13D/G'], ['registration', 'OFFERINGS'], ['other', 'OTHER']];
  const GROUP_NAME = {annual: 'Annual report', quarterly: 'Quarterly report', current: 'Current report', proxy: 'Proxy statement', insider: 'Insider transaction', ownership: 'Beneficial ownership', registration: 'Securities offering'};
  const descOf = f => f.description && f.description.toUpperCase() !== f.form.toUpperCase() ? f.description : GROUP_NAME[f.group] || f.form;
  if (PG) PG.add('filings', 'SEC filings', async (host, arg, alive) => {
    const ticker = String(arg || S.sym?.symbol || S.focus || 'AAPL').toUpperCase();
    PG.setHead('FILINGS', `${ticker} · SEC filings`, 'Every recent filing on SEC EDGAR, linked to the document');
    const box = el('div'); box.append(el('p', 'fx-empty', 'Loading SEC EDGAR filings…')); host.append(PG.chips([PG.go('Security page', 'des', ticker), PG.go('Financial statements', 'fa', ticker)]), box);
    let d; try { d = await loadFilings(ticker); } catch (e) { if (!alive()) return; box.replaceChildren(el('p', 'fx-empty', e.notFound ? `${ticker} is not an SEC-registered company (funds, crypto, FX and many foreign listings file elsewhere).` : 'SEC EDGAR is not answering right now. Try again in a minute.')); if (!e.notFound) report('filings', e); return; }
    if (!alive()) return; box.replaceChildren();
    const id = PG.section('COMPANY'); const kvs = [['Name', d.name], ['Tickers', (d.tickers || []).join(', ')], ['Exchanges', (d.exchanges || []).join(', ')], ['SEC industry', d.industry ? `${d.industry} (SIC ${d.sic})` : null], ['Headquarters', [d.city, d.state].filter(Boolean).join(', ')], ['Incorporated', d.incorporated], ['Fiscal year ends', d.fiscalYearEnd ? new Date(`2001-${d.fiscalYearEnd}T12:00:00Z`).toLocaleDateString('en-US', {month: 'long', day: 'numeric', timeZone: 'UTC'}) : null], ['Filer status', d.category], ['CIK', String(d.cik)]];
    if (d.formerNames?.length) kvs.push(['Former names', d.formerNames.map(f => `${f.name} (to ${f.to.slice(0, 4)})`).join(' · ')]);
    T.kv(id, kvs.filter(x => x[1])); box.append(id);
    let group = 'all', q = '', shown = 60;
    const sec = PG.section(`FILINGS · ${d.filings.length} MOST RECENT`), bar = el('div', 'fl-bar'), tableBox = el('div');
    const find = el('input', 'ov-find'); find.type = 'search'; find.placeholder = 'Filter: form, item, text'; find.setAttribute('aria-label', 'Filter filings'); find.addEventListener('input', () => { q = find.value.trim().toLowerCase(); shown = 60; drawT(); });
    function drawBar() { const counts = Object.fromEntries(GROUPS.map(([k]) => [k, k === 'all' ? d.filings.length : d.filings.filter(f => f.group === k).length])); bar.replaceChildren(PG.pageTabs(GROUPS.filter(([k]) => counts[k]).map(([k, l]) => [k, `${l} ${counts[k]}`]), group, v => { group = v; shown = 60; drawBar(); drawT(); }), find); }
    function drawT() {
      tableBox.replaceChildren();
      const list = d.filings.filter(f => (group === 'all' || f.group === group) && (!q || `${f.form} ${descOf(f)} ${GROUP_NAME[f.group] || ''} ${f.items.map(i => i.code + ' ' + (i.title || '')).join(' ')}`.toLowerCase().includes(q)));
      if (!list.length) return tableBox.append(el('p', 'fx-empty', 'No filings match.'));
      const t = el('table', 'fx-table pg-table fl-table'), h = el('tr'); ['FILED', 'FORM', 'PERIOD', 'DESCRIPTION', 'SIZE', ''].forEach(x => h.append(el('th', '', x))); t.append(h);
      for (const f of list.slice(0, shown)) {
        const tr = el('tr'), desc = el('td', 'fl-desc'), form = el('td'); form.append(el('span', 'fl-form fl-' + f.group, f.form));
        desc.append(el('span', '', descOf(f)));
        if (f.items.length) desc.append(el('small', '', f.items.map(i => `${i.code} ${i.title || ''}`.trim()).join(' · ')));
        const links = el('td', 'fl-links');
        if (f.url) { const a = el('a', 'fx-chip fx-chip-link', 'Open ↗'); a.href = f.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; links.append(a); }
        const ix = el('a', 'fl-ix', 'Index'); ix.href = f.index; ix.target = '_blank'; ix.rel = 'noopener noreferrer'; links.append(ix);
        tr.append(el('td', 'fx-num', f.filed), form, el('td', 'fx-num fx-dim', f.report || ''), desc, el('td', 'fx-num fx-dim', f.size ? (f.size >= 1e6 ? (f.size / 1e6).toFixed(1) + ' MB' : Math.round(f.size / 1e3) + ' KB') : ''), links);
        t.append(tr);
      }
      const sc = el('div', 'pg-scroll'); sc.append(t); tableBox.append(sc);
      if (list.length > shown) tableBox.append(btn(`Show ${Math.min(60, list.length - shown)} more of ${list.length - shown}`, 'fx-chip', () => { shown += 60; drawT(); }));
    }
    drawBar(); drawT(); sec.append(bar, tableBox); box.append(sec);
    const all = el('a', 'fx-chip fx-chip-link', 'Full history on SEC EDGAR ↗'); all.href = d.secURL; all.target = '_blank'; all.rel = 'noopener noreferrer';
    box.append(PG.chips([all]), PG.sourceNote(`SEC EDGAR submissions for CIK ${d.cik}: the ${d.filings.length} most recent of ${d.total} indexed filings${d.olderFiles ? ' (older filings are on SEC EDGAR)' : ''}. Form 8-K item titles follow the SEC's Form 8-K instructions. Fetched ${new Date(d.fetchedAt).toLocaleString()}.`));
  });

  /* ======================= DES: company snapshot (stocks) ======================= */
  function perfChart(rows, sym) {
    const W = 640, H = 230, L = 6, R = 64, Tp = 8, B = 20, c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart fg-chart', role: 'img', 'aria-label': `${sym} versus the S&P 500`});
    const a = rows.map(r => r[1]), b = rows.map(r => r[2]), all = [...a, ...b, 0], lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08 || 1;
    const x = i => L + i / (rows.length - 1) * (W - L - R), y = v => Tp + (hi + pad - v) / (hi - lo + 2 * pad) * (H - Tp - B);
    for (let k = 0; k <= 4; k++) { const v = lo - pad + (hi - lo + 2 * pad) * k / 4; c.append(svg('line', {x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'g'})); const t = svg('text', {x: W - R + 6, y: y(v) + 4, class: 'a'}); t.textContent = signed(v, 0, '%'); c.append(t); }
    c.append(svg('line', {x1: L, x2: W - R, y1: y(0), y2: y(0), stroke: '#6a7570', 'stroke-dasharray': '3 3'}));
    const step = Math.max(1, Math.floor(rows.length / 5)); for (let i = 0; i < rows.length - step / 2; i += step) { const t = svg('text', {x: x(i), y: H - 5, class: 'a', 'text-anchor': i ? 'middle' : 'start'}); t.textContent = new Date(rows[i][0] + 'T12:00:00Z').toLocaleDateString('en-US', {month: 'short', year: '2-digit', timeZone: 'UTC'}); c.append(t); }
    for (const [vals, col] of [[b, '#cfd6d2'], [a, '#ffb000']]) c.append(svg('polyline', {points: vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '), fill: 'none', stroke: col, 'stroke-width': col === '#ffb000' ? 1.6 : 1.1, 'stroke-linejoin': 'round'}));
    for (const [v, col] of [[a.at(-1), '#ffb000'], [b.at(-1), '#cfd6d2']]) { c.append(svg('rect', {x: W - R + 2, y: y(v) - 8, width: R - 4, height: 15, fill: col})); const t = svg('text', {x: W - R + 6, y: y(v) + 3.5, fill: '#000', 'font-size': 10, 'font-weight': 700, 'font-family': 'IBM Plex Mono, monospace'}); t.textContent = signed(v, 1, '%'); c.append(t); }
    return c;
  }
  function donut(income, revenue) {
    const s = svg('svg', {viewBox: '0 0 120 120', class: 'cs-donut', role: 'img', 'aria-label': 'Net income as a share of revenue'});
    const share = revenue > 0 ? Math.max(0, Math.min(1, income / revenue)) : 0, r = 46, C = 2 * Math.PI * r;
    s.append(svg('circle', {cx: 60, cy: 60, r, fill: 'none', stroke: '#7c4dff', 'stroke-width': 16}));
    if (income > 0) s.append(svg('circle', {cx: 60, cy: 60, r, fill: 'none', stroke: '#9fdcf5', 'stroke-width': 16, 'stroke-dasharray': `${(share * C).toFixed(2)} ${C.toFixed(2)}`, transform: 'rotate(-90 60 60)'}));
    return s;
  }
  T.DES_SECTIONS = T.DES_SECTIONS || [];
  T.DES_SECTIONS.push((host, id, {inf, q, alive}) => {
    if (inf.group !== 'Stocks') return;
    const sec = PG.section('COMPANY SNAPSHOT', 'cs-sec'); sec.append(el('p', 'fx-empty', 'Loading company snapshot…')); host.append(sec);
    (async () => {
      const eq = T.Equities ? await T.Equities.load().catch(() => null) : null, mq = T.Equities?.quote(id), idx = T.Equities?.membership(id) || [];
      const [fil, fin] = await Promise.all([loadFilings(id).catch(() => null), T.loadFin(id).catch(() => null)]);
      if (!alive() || !sec.isConnected) return;
      if (!fil && !fin && !mq) { sec.remove(); return; }
      sec.replaceChildren(el('h2', 'pg-h2', 'COMPANY SNAPSHOT'));
      const tags = el('div', 'cs-tags');
      for (const t of [mq?.sector, mq?.industry, ...idx, fil?.industry ? 'SIC · ' + fil.industry : null, fil?.city ? [fil.city, fil.state].filter(Boolean).join(', ') : null, fil?.fiscalYearEnd ? 'FY ends ' + new Date(`2001-${fil.fiscalYearEnd}T12:00:00Z`).toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'}) : null].filter(Boolean)) tags.append(el('span', '', t));
      sec.append(tags);
      const grid = el('div', 'cs-grid'), perf = el('div', 'cs-card'), ov = el('div', 'cs-card'); grid.append(perf, ov); sec.append(grid);
      // Performance against the S&P 500 (dividend- and split-adjusted daily closes).
      let span = store.get('cs-span') || '1y';
      const drawPerf = async () => {
        perf.replaceChildren(); const h = el('div', 'fg-ch'); h.append(el('h3', 'cs-h', 'PERFORMANCE VS S&P 500'), PG.pageTabs([['1y', '1Y'], ['2y', '2Y'], ['5y', '5Y'], ['10y', '10Y']], span, v => { span = v; store.set('cs-span', v); drawPerf(); })); perf.append(h, el('p', 'fx-empty', 'Loading…'));
        let d; try { d = await T.fnMarket({op: 'closes', symbols: `${id},SPY`, range: span}); } catch (e) { report('cs-perf', e); }
        if (!perf.isConnected) return; perf.lastChild.remove();
        const A = d?.series?.[id], Bs = d?.series?.SPY; if (!A || !Bs) return perf.append(el('p', 'fx-empty', 'Price history is not available right now.'));
        const rows = []; let a0 = null, b0 = null; d.dates.forEach((dt, i) => { if (!finite(A[i]) || !finite(Bs[i])) return; a0 ??= A[i]; b0 ??= Bs[i]; rows.push([dt, (A[i] / a0 - 1) * 100, (Bs[i] / b0 - 1) * 100]); });
        if (rows.length < 5) return perf.append(el('p', 'fx-empty', 'Not enough shared history with the S&P 500.'));
        const ex = rows.at(-1)[1] - rows.at(-1)[2], leg = el('div', 'cs-leg'); leg.append(el('span', 'a', `${id} ${signed(rows.at(-1)[1], 1, '%')}`), el('span', 'b', `S&P 500 (SPY) ${signed(rows.at(-1)[2], 1, '%')}`), el('span', tone(ex), `${ex >= 0 ? 'Ahead' : 'Behind'} by ${Math.abs(ex).toFixed(1)} pts`));
        perf.append(leg, perfChart(rows, id), el('p', 'fx-foot', `Total return from adjusted daily closes, ${rows[0][0]} to ${rows.at(-1)[0]} · Yahoo Finance`));
      };
      drawPerf();
      // Financial overview: the latest 10-K against today's market value.
      ov.append(el('h3', 'cs-h', 'FINANCIAL OVERVIEW'));
      const p = fin?.periods?.[0], A = p ? fin.annual[p] || {} : {}, val = k => finite(A[k]?.value) ? A[k].value : finite(A[k]) ? A[k] : null;
      const rev = val('revenue'), inc = val('income'), eps = val('eps'), ocf = val('operatingCash'), capex = val('capex'), fcf = finite(ocf) && finite(capex) ? ocf - Math.abs(capex) : null;
      const mcap = mq?.cap ?? null, price = q?.price ?? mq?.price;
      if (!p && !finite(mcap)) { ov.append(el('p', 'fx-empty', 'SEC financial statements are not available for this company.')); return; }
      const top = el('div', 'cs-ov');
      if (finite(rev) && finite(inc)) {
        const dn = el('div', 'cs-dn'); dn.append(donut(inc, rev)); const mid = el('div', 'cs-mid'); mid.append(el('small', '', finite(mcap) ? 'Market value' : 'Net margin'), el('b', '', finite(mcap) ? usd(mcap) : (inc / rev * 100).toFixed(1) + '%')); dn.append(mid);
        const l = el('div', 'cs-side'); l.append(el('small', 'r', 'REVENUE'), el('b', '', usd(rev)), el('em', '', finite(mcap) ? `${(rev / mcap * 100).toFixed(1)}% of market value` : ''));
        const r = el('div', 'cs-side'); r.append(el('small', 'n', 'NET INCOME'), el('b', tone(inc), usd(inc)), el('em', '', `${(inc / rev * 100).toFixed(1)}% net margin${finite(mcap) ? ` · ${(inc / mcap * 100).toFixed(1)}% earnings yield` : ''}`));
        top.append(l, dn, r);
      }
      ov.append(top);
      const stats = [['Market value', usd(mcap)], ['Price', finite(price) ? '$' + fmt(price, 2) : '—'], ['P/E (10-K EPS)', finite(price) && finite(eps) && eps > 0 ? (price / eps).toFixed(1) + '×' : '—'], ['Price / sales', finite(mcap) && finite(rev) && rev > 0 ? (mcap / rev).toFixed(1) + '×' : '—'],
        ['Diluted EPS', finite(eps) ? '$' + eps.toFixed(2) : '—'], ['Operating cash flow', usd(ocf)], ['Free cash flow', usd(fcf)], ['FCF yield', finite(fcf) && finite(mcap) && mcap > 0 ? (fcf / mcap * 100).toFixed(1) + '%' : '—']];
      const st = el('div', 'cs-stats'); for (const [k, v] of stats) { const r = el('div'); r.append(el('span', '', k), el('b', '', v)); st.append(r); } ov.append(st);
      ov.append(el('p', 'fx-foot', `${p ? `Fiscal year ended ${p}, from the 10-K on SEC EDGAR` : 'No 10-K figures'}${finite(mcap) ? ' · market value from the Nasdaq screener' : ''} · ratios use the annual report, not trailing quarters`));
      sec.append(PG.chips([PG.go('SEC filings', 'filings', id), PG.go('All financial statements', 'fa', id)]));
    })().catch(e => { report('cs', e); if (sec.isConnected) sec.replaceChildren(el('h2', 'pg-h2', 'COMPANY SNAPSHOT'), el('p', 'fx-empty', 'The company snapshot is not available right now.')); });
  });

  /* ======================= CRYPTO SENTIMENT ======================= */
  // A 0–100 meter with labelled ends and bands, a marker at today's value and the look-backs.
  function meter(value, bands, ends, look) {
    const w = el('div', 'cr-meter'), bar = el('div', 'fg-scale');
    for (const [a, b, c] of bands) { const i = el('i'); i.style.cssText = `left:${a}%;width:${b - a}%;background:${c}`; bar.append(i); }
    const mk = el('b'); mk.style.left = Math.max(0, Math.min(100, value)) + '%'; bar.append(mk);
    const e = el('div', 'cr-ends'); e.append(el('span', '', ends[0]), el('span', '', ends[1]));
    w.append(bar, e);
    if (look) { const lb = el('div', 'cr-look'); for (const [k, v] of look) if (finite(v)) { const c = el('span'); c.append(el('small', '', k), el('b', '', v.toFixed(1))); lb.append(c); } w.append(lb); }
    return w;
  }
  const SEASON_BANDS = [[0, 25, '#f5a524'], [25, 75, '#3a4540'], [75, 100, '#5b8def']], RSI_BANDS = [[0, 30, '#2fb874'], [30, 70, '#3a4540'], [70, 100, '#e5484d']];
  function cryptoCards(c, {compact = false} = {}) {
    const g = el('div', 'cr-grid' + (compact ? ' compact' : ''));
    if (c.fng) { const card = el('div', 'cr-card'); card.append(el('h3', 'cs-h', 'CRYPTO FEAR & GREED'), gauge(c.fng, {compact: true})); g.append(card); }
    if (c.season) { const card = el('div', 'cr-card'), v = c.season.value, top = el('div', 'fg-top'), n = el('b', 'fg-num', String(Math.round(v))); n.style.color = v >= 75 ? '#5b8def' : v <= 25 ? '#f5a524' : 'var(--tx)';
      const lab = el('div', 'fg-lab'); lab.append(el('strong', '', c.season.label.toUpperCase()), el('small', '', finite(c.season.prev) ? `${signed(v - c.season.prev, 1)} vs yesterday` : ''), el('small', 'fx-dim', `${Math.round(v)}% of altcoins beat bitcoin over 90 days`)); top.append(n, lab);
      card.append(el('h3', 'cs-h', 'ALTCOIN SEASON INDEX'), top, meter(v, SEASON_BANDS, ['BITCOIN SEASON', 'ALTCOIN SEASON'], [['1 WEEK AGO', c.season.week], ['1 MONTH AGO', c.season.month]])); g.append(card); }
    if (c.rsi) { const card = el('div', 'cr-card'), v = c.rsi.value, top = el('div', 'fg-top'), n = el('b', 'fg-num', v.toFixed(1)); n.style.color = v >= 70 ? '#e5484d' : v <= 30 ? '#2fb874' : 'var(--tx)';
      const lab = el('div', 'fg-lab'); lab.append(el('strong', '', c.rsi.label.toUpperCase()), el('small', '', finite(c.rsi.prev) ? `${signed(v - c.rsi.prev, 1)} vs yesterday` : ''), el('small', 'fx-dim', 'average 14-day RSI of the largest coins')); top.append(n, lab);
      card.append(el('h3', 'cs-h', 'AVERAGE CRYPTO RSI'), top, meter(v, RSI_BANDS, ['OVERSOLD 30', 'OVERBOUGHT 70'], [['1 WEEK AGO', c.rsi.week], ['1 MONTH AGO', c.rsi.month]])); g.append(card); }
    return g;
  }
  function cryptoSection(c) {
    const sec = PG.section('CRYPTO SENTIMENT', 'cr-sec'); sec.append(cryptoCards(c));
    let span = store.get('cr-span') || '1Y'; const charts = el('div', 'fg-grid'); sec.append(charts);
    const draw = () => {
      charts.replaceChildren(); const n = SPAN[span];
      const add = (title, chip, series, opts, foot) => { const card = el('section', 'pg-sec fg-card'), h = el('div', 'fg-ch'); h.append(el('h2', 'pg-h2', title), chip); card.append(h, chart(series, opts), el('p', 'fx-foot', foot)); charts.append(card); };
      const tabs = PG.pageTabs(Object.keys(SPAN).map(k => [k, k]), span, v => { span = v; store.set('cr-span', v); draw(); });
      if (c.fng?.history?.length) add('CRYPTO FEAR & GREED · HISTORY', tabs, c.fng.history.slice(-n), {W: 520, H: 190, bands: true, fixed: [0, 100], fmtV: v => v.toFixed(0), aria: 'Crypto fear and greed history'}, `${c.fng.source} · daily`);
      if (c.season?.history?.length) add('ALTCOIN SEASON · HISTORY', el('span', 'fg-chip', c.season.label.toUpperCase()), c.season.history.slice(-n), {W: 520, H: 190, color: '#5b8def', fixed: [0, 100], ref: 75, fmtV: v => v.toFixed(0), unit: '%', aria: 'Altcoin season history'}, 'Share of altcoins whose 90-day return beats bitcoin’s · 75%+ altcoin season, 25% or less bitcoin season');
      if (c.rsi?.history?.length) add('AVERAGE CRYPTO RSI · HISTORY', el('span', 'fg-chip', c.rsi.label.toUpperCase()), c.rsi.history.slice(-n), {W: 520, H: 190, color: '#ffd23f', fixed: [0, 100], ref: 50, fmtV: v => v.toFixed(0), aria: 'Average crypto RSI history'}, 'Mean 14-day RSI (Wilder) · above 70 overbought, below 30 oversold');
    };
    draw();
    if (c.coins?.length) {
      const btc = c.coins.find(x => x.symbol === 'BTC'), list = [...c.coins].sort((a, b) => b.r90 - a.r90), box = PG.section(`90-DAY RETURN VS BITCOIN · ${list.length} COINS`), bars = el('div', 'cr-bars');
      const mx = Math.max(...list.map(x => Math.abs(x.r90)), 1);
      for (const x of list) { const r = el('div', 'cr-bar' + (x.symbol === 'BTC' ? ' btc' : '')), beat = btc && x.r90 > btc.r90, b = el('i'), f = el('b'); f.style.width = (Math.abs(x.r90) / mx * 50) + '%'; f.style[x.r90 >= 0 ? 'left' : 'right'] = '50%'; f.style.background = x.symbol === 'BTC' ? 'var(--am)' : beat ? '#5b8def' : '#5a6560'; b.append(f);
        r.title = `${x.name}: ${signed(x.r90, 1, '%')} over 90 days · RSI ${finite(x.rsi) ? x.rsi.toFixed(0) : '—'}`; r.append(el('span', '', x.symbol), b, el('em', tone(x.r90), signed(x.r90, 1, '%')), el('small', '', finite(x.rsi) ? 'RSI ' + x.rsi.toFixed(0) : '')); bars.append(r); }
      box.append(bars, el('p', 'fx-foot', `Blue: beat bitcoin over 90 days · ${c.universe || ''}`)); sec.append(box);
    }
    return sec;
  }
  const origSentiment = sentimentPage;
  const sentimentWithCrypto = async (host, arg, alive) => { await origSentiment(host, arg, alive); if (!alive() || !SENT.data?.crypto) return; host.insertBefore(cryptoSection(SENT.data.crypto), host.querySelector('.pg-note')); };
  const cryptoPage = async (host, arg, alive) => {
    PG.setHead('CSENT', 'Crypto sentiment', 'Crypto Fear & Greed, Altcoin Season and the average RSI of the largest coins');
    host.append(el('p', 'fx-empty', 'Loading crypto sentiment…')); const d = await loadSent(); if (!alive()) return; host.replaceChildren();
    if (!d?.crypto) return host.append(el('p', 'fx-empty', 'Crypto sentiment is not available right now.'));
    host.append(cryptoSection(d.crypto), PG.sourceNote(`Crypto Fear & Greed from Alternative.me (their published index). Altcoin Season and average RSI are FYNX calculations from daily closes: ${d.crypto.universe || ''}. Updated ${new Date(d.generatedAt).toLocaleString()}.`));
  };
  if (PG) { PG.add('sentiment', 'Market sentiment', sentimentWithCrypto); PG.add('fng', 'Market sentiment', sentimentWithCrypto); PG.add('csent', 'Crypto sentiment', cryptoPage); PG.add('cryptosent', 'Crypto sentiment', cryptoPage); }
  T.PANELS.cfng = ['CFNG', 'Crypto sentiment', 'csent']; T.PANEL_DESC.cfng = 'Crypto Fear & Greed, Altcoin Season index and average crypto RSI';
  T.RENDER.cfng = async () => {
    const host = T.panel('cfng'); const d = await loadSent(); if (!host.isConnected) return; host.replaceChildren();
    if (!d?.crypto) return host.append(el('p', 'fx-empty', 'Crypto sentiment is not available right now.'));
    T.setText('n-cfng', d.crypto.fng ? `${d.crypto.fng.score} · ${d.crypto.fng.label}` : '');
    host.append(cryptoCards(d.crypto, {compact: true}), el('p', 'fx-foot', 'Fear & Greed: Alternative.me · Altcoin Season and RSI: FYNX from daily closes'));
  };
  T.EXTRA_GROUPS.find(g => g[0] === 'Sentiment')?.[1].push('cfng');
  if (T.DESK_DEFS?.crypto && !T.DESK_DEFS.crypto.slots.includes('cfng')) { const sl = T.DESK_DEFS.crypto.slots, i = sl.indexOf('range'); if (i >= 0) sl[i] = 'cfng'; }

  /* ======================= OPTIONS: EXPECTED MOVE ======================= */
  T.OPT_SECTIONS = T.OPT_SECTIONS || [];
  T.OPT_SECTIONS.push((host, u) => {
    const ex = u.expiries.filter(e => finite(e.straddle) && e.straddle > 0 && e.dte >= 0).slice(0, 16); if (ex.length < 2) return;
    const sec = PG.section('EXPECTED MOVE', 'em-sec'), wrap = el('div', 'em-grid'), left = el('div', 'cs-card'), right = el('div', 'cs-card'); wrap.append(left, right); sec.append(wrap); host.append(sec);
    const sigma = e => finite(e.atmIV) ? u.price * e.atmIV * Math.sqrt(Math.max(e.dte, 0.5) / 365) : null;
    // Table: every expiry with the straddle-implied range and the IV one-sigma range.
    const t = el('table', 'fx-table pg-table em-table'), h = el('tr'); ['EXPIRY', 'DTE', 'STRADDLE', 'MOVE', 'LOWER', 'UPPER', 'ATM IV', '1σ (IV)'].forEach(x => h.append(el('th', '', x))); t.append(h);
    for (const e of ex) { const s1 = sigma(e), tr = el('tr'); tr.append(el('th', '', `${new Date(e.date + 'T12:00:00Z').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC'})}`), el('td', 'fx-num fx-dim', String(e.dte)), el('td', 'fx-num', '$' + fmt(e.straddle, 2)), el('td', 'fx-num em-mv', `±${fmt(e.straddle, 2)} · ${e.movePercent.toFixed(2)}%`), el('td', 'fx-num fx-down', fmt(u.price - e.straddle, 2)), el('td', 'fx-num fx-up', fmt(u.price + e.straddle, 2)), el('td', 'fx-num', finite(e.atmIV) ? (e.atmIV * 100).toFixed(1) + '%' : '—'), el('td', 'fx-num fx-dim', finite(s1) ? `±${fmt(s1, 2)}` : '—')); t.append(tr); }
    const sc = el('div', 'pg-scroll'); sc.append(t); right.append(el('h3', 'cs-h', 'EXPECTED MOVE BY EXPIRY'), sc, el('p', 'fx-foot', 'Move = at-the-money straddle (call + put mid) · lower/upper = price ∓ straddle · 1σ (IV) = price × ATM IV × √(days/365) · Cboe delayed chains'));
    // Cone: recent closes, then the straddle range (amber) and the IV 1σ range (blue) out to each expiry.
    left.append(el('h3', 'cs-h', `${u.symbol} · EXPECTED MOVE CONE`), el('p', 'fx-empty', 'Loading price history…'));
    (async () => {
      let d = null; try { d = await T.fnMarket({op: 'closes', symbols: u.symbol, range: '3mo'}); } catch (e) { report('em-closes', e); }
      if (!left.isConnected) return; left.lastChild.remove();
      const hist = (d?.dates || []).map((dt, i) => [Date.parse(dt + 'T21:00:00Z'), d.series?.[u.symbol]?.[i]]).filter(r => finite(r[1])).slice(-45);
      const now = Date.parse(u.asOf) || Date.now(), pts = ex.map(e => ({t: Date.parse(e.date + 'T21:00:00Z'), m: e.straddle, s: sigma(e), e}));
      const W = 620, H = 300, L = 6, R = 62, Tp = 10, B = 22, t0 = hist.length ? hist[0][0] : now - 30 * 864e5, t1 = pts.at(-1).t;
      const ys = [...hist.map(r => r[1]), ...pts.flatMap(p => [u.price + Math.max(p.m, p.s || 0), u.price - Math.max(p.m, p.s || 0)])], lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * 0.06;
      const x = t => L + (t - t0) / (t1 - t0) * (W - L - R), y = v => Tp + (hi + pad - v) / (hi - lo + 2 * pad) * (H - Tp - B);
      const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart fg-chart', role: 'img', 'aria-label': `${u.symbol} expected move cone`});
      for (let k = 0; k <= 4; k++) { const v = lo - pad + (hi - lo + 2 * pad) * k / 4; c.append(svg('line', {x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'g'})); const tx = svg('text', {x: W - R + 6, y: y(v) + 4, class: 'a'}); tx.textContent = fmt(v, 2); c.append(tx); }
      const poly = (k, fill, stroke, dash) => { if (k === 's' && pts.some(p => !finite(p.s))) return; const up = [[x(now), y(u.price)], ...pts.map(p => [x(p.t), y(u.price + p[k])])], dn = [...pts.map(p => [x(p.t), y(u.price - p[k])])].reverse(); c.append(svg('polygon', {points: [...up, ...dn].map(q => q.map(n => n.toFixed(1)).join(',')).join(' '), fill, stroke, 'stroke-width': 1, 'stroke-dasharray': dash || ''})); };
      poly('s', 'rgba(91,141,239,.10)', '#5b8def', '4 3'); poly('m', 'rgba(255,176,0,.16)', '#ffb000');
      c.append(svg('line', {x1: x(now), x2: x(now), y1: Tp, y2: H - B, stroke: '#6a7570', 'stroke-dasharray': '2 3'}));
      if (hist.length > 1) c.append(svg('polyline', {points: hist.map(r => `${x(r[0]).toFixed(1)},${y(r[1]).toFixed(1)}`).join(' '), fill: 'none', stroke: '#e7ece9', 'stroke-width': 1.4}));
      for (const p of pts.filter((_, i) => i === 0 || i === pts.length - 1 || i === Math.floor(pts.length / 2))) { const tx = svg('text', {x: x(p.t), y: H - 6, class: 'a', 'text-anchor': 'middle'}); tx.textContent = new Date(p.e.date + 'T12:00:00Z').toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'}); c.append(tx); }
      const last = pts.at(-1); for (const [v, col] of [[u.price + last.m, '#ffb000'], [u.price - last.m, '#ffb000']]) { c.append(svg('rect', {x: W - R + 2, y: y(v) - 8, width: R - 4, height: 15, fill: col})); const tx = svg('text', {x: W - R + 6, y: y(v) + 3.5, fill: '#000', 'font-size': 10, 'font-weight': 700, 'font-family': 'IBM Plex Mono, monospace'}); tx.textContent = fmt(v, 2); c.append(tx); }
      const leg = el('div', 'cs-leg'); leg.append(el('span', 'a', `Straddle ±${fmt(pts[0].m, 2)} by ${new Date(pts[0].e.date + 'T12:00:00Z').toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'})}`), el('span', 'em-iv', 'IV 1σ (dashed)'), el('span', 'b', 'Price'));
      left.append(leg, c);
    })().catch(e => report('em', e));
  });

  T.PAGE_NAMES.push('SENTIMENT', 'FNG', 'HOURS', 'WIRE', 'FILINGS', 'CSENT', 'CRYPTOSENT');
  const refreshFng = () => { if (!document.hidden && $('tp-fng')) loadSent(true).then(() => T.R('fng')); };
  setInterval(refreshFng, 15 * 60000);
});
