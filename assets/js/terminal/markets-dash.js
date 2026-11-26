/* FYNX Terminal plugin: DASHBOARD desk, US market status, Market Overview, S&P 500 heat map and Industries.
 *
 * Header   US MARKET OPEN / PRE-MARKET / AFTER HOURS / CLOSED with a countdown, from NYSE hours (America/New_York)
 *          and the NYSE holiday and early-close rules.
 * Panels   IDX   SPY · QQQ · IWM · DIA: last regular price, pre-market or after-hours price, intraday line
 *          NPERF Normalized market performance: SPY, QQQ, DIA, IWM in % (today with extended hours … 5 years)
 *          SECT  The 11 S&P 500 sectors sized by market value, coloured by the sector SPDR fund's move
 *          LARGE Largest US-listed companies by market value (paged)
 *          USMOV US stock gainers, losers and most active
 *          IXMOV Top gainers and losers inside the S&P 500, Nasdaq-100 or Dow 30
 *          RATES Rates & dollar: S&P 500, US 10-year yield and dollar index since 2011 (or the US curve)
 *          TSY   Treasury yields and bond futures · USMKT US indices and equity futures · GLOBAL world markets
 * Pages    OVERVIEW market overview cards · HMAP S&P 500 / Nasdaq-100 / Dow heat map · INDUSTRIES
 * Data: equities.json (index members, closes, macro history) and scanner.json from the terminal-data branch, the
 * markets snapshot, live quotes and Yahoo intraday bars through the FYNX market function. Delayed data, labelled. */
(window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
  'use strict';
  const {S, el, btn, svg, signed, tone, fmt, finite, store, quoteFor, shortOf, nameOf} = T;
  const $ = id => document.getElementById(id);
  const tk = (n, key, v) => T.tk ? T.tk(n, key, v) : n;
  const TK = () => window.FynxTick || null;
  const pct = (v, d = 2) => finite(v) ? signed(v, d, '%') : '—';
  const money = v => finite(v) ? '$' + v.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '—';
  const cap = v => !finite(v) ? '—' : v >= 1e12 ? (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : (v / 1e6).toFixed(0) + 'M';

  /* ---------- NYSE calendar and market status ---------- */
  const ET = 'America/New_York';
  const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const nth = (y, m, wd, n) => { let c = 0; for (let d = 1; d <= 31; d++) if (dow(y, m, d) === wd && ++c === n) return d; return null; };
  const lastWd = (y, m, wd) => { for (let d = 31; d > 0; d--) if (new Date(Date.UTC(y, m - 1, d)).getUTCMonth() === m - 1 && dow(y, m, d) === wd) return d; return null; };
  const observed = (y, m, d) => { const w = dow(y, m, d); const t = new Date(Date.UTC(y, m - 1, d + (w === 0 ? 1 : w === 6 ? -1 : 0))); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
  function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return [mo, da]; }
  // NYSE rules: New Year (no Friday make-up when Jan 1 is a Saturday), MLK, Presidents, Good Friday, Memorial,
  // Juneteenth, Independence, Labor, Thanksgiving, Christmas; 1 PM ET early closes on Jul 3, Black Friday, Dec 24.
  function nyse(y) {
    const closed = new Map(), early = new Set(), add = (d, n) => closed.set(d, n);
    if (dow(y, 1, 1) !== 6) add(observed(y, 1, 1), 'New Year’s Day');
    add(ymd(y, 1, nth(y, 1, 1, 3)), 'Martin Luther King Jr. Day'); add(ymd(y, 2, nth(y, 2, 1, 3)), 'Presidents’ Day');
    const [em, ed] = easter(y), gf = new Date(Date.UTC(y, em - 1, ed - 2)); add(ymd(y, gf.getUTCMonth() + 1, gf.getUTCDate()), 'Good Friday');
    add(ymd(y, 5, lastWd(y, 5, 1)), 'Memorial Day'); if (y >= 2022) add(observed(y, 6, 19), 'Juneteenth'); add(observed(y, 7, 4), 'Independence Day');
    add(ymd(y, 9, nth(y, 9, 1, 1)), 'Labor Day'); const tg = nth(y, 11, 4, 4); add(ymd(y, 11, tg), 'Thanksgiving Day'); add(observed(y, 12, 25), 'Christmas Day');
    if ([1, 2, 3, 4].includes(dow(y, 7, 3))) early.add(ymd(y, 7, 3));
    early.add(ymd(y, 11, tg + 1));
    if ([1, 2, 3, 4].includes(dow(y, 12, 24))) early.add(ymd(y, 12, 24));
    return {closed, early};
  }
  const cal = {}; const nyseYear = y => cal[y] ||= nyse(y);
  function etParts(t) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: ET, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return {date: `${p.year}-${p.month}-${p.day}`, y: +p.year, mins: (+p.hour % 24) * 60 + +p.minute + +p.second / 60};
  }
  // Trading day info for an ET calendar date: {open: minutes, close: minutes} or null when closed.
  function session(date) {
    const [y, m, d] = date.split('-').map(Number), w = dow(y, m, d), c = nyseYear(y);
    if (w === 0 || w === 6 || c.closed.has(date)) return null;
    return {open: 570, close: c.early.has(date) ? 780 : 960, early: c.early.has(date)};
  }
  const addDays = (date, n) => { const [y, m, d] = date.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d + n)); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
  const span = mins => { const h = Math.floor(mins / 60), m = Math.floor(mins % 60); return h ? `${h}h ${m}m` : `${m}m`; };
  function marketStatus(now = Date.now()) {
    const p = etParts(now), s = session(p.date), [y, m, d] = p.date.split('-').map(Number), hol = nyseYear(y).closed.get(p.date);
    if (s && p.mins >= s.open && p.mins < s.close) return {state: 'open', label: 'OPEN', text: `Closes in ${span(s.close - p.mins)}${s.early ? ' · early close 1:00 PM ET' : ''}`};
    if (s && p.mins >= 240 && p.mins < s.open) return {state: 'pre', label: 'PRE-MARKET', text: `Opens in ${span(s.open - p.mins)}`};
    if (s && p.mins >= s.close && p.mins < 1200) return {state: 'post', label: 'AFTER HOURS', text: `Session ends in ${span(1200 - p.mins)}`};
    // Closed: find the next session (up to two weeks ahead).
    let mins = 0, date = p.date, next = null;
    if (s && p.mins < s.open) next = s; else { mins = 1440 - p.mins; for (let i = 1; i < 15; i++) { date = addDays(p.date, i); next = session(date); if (next) break; mins += 1440; } }
    const wait = s && p.mins < s.open ? s.open - p.mins : mins + next.open;
    return {state: 'closed', label: 'CLOSED', text: `${hol ? hol + ' · ' : ''}Opens in ${span(wait)}`, holiday: hol || null};
  }
  T.MarketStatus = window.FynxMarketStatus = {status: marketStatus, session, nyse: nyseYear};
  function renderStatus() {
    const top = document.querySelector('.fx-top'); if (!top) return;
    let n = $('fx-mstat');
    if (!n) { n = el('span', 'fx-mstat'); n.id = 'fx-mstat'; n.setAttribute('role', 'status'); const clocks = $('fx-clocks'); if (clocks) clocks.before(n); else top.append(n); }
    const s = marketStatus(); n.dataset.s = s.state; n.replaceChildren(el('span', '', 'US MARKET '), el('b', '', s.label), el('small', '', ' · ' + s.text));
    n.title = 'NYSE regular session 9:30 AM – 4:00 PM ET; pre-market from 4:00 AM, after hours to 8:00 PM. Holidays and early closes follow the NYSE calendar.';
  }
  renderStatus(); setInterval(renderStatus, 30000);

  /* ---------- data: equities.json + scanner.json ---------- */
  const D = {eq: null, eqAt: 0, scan: null, scanAt: 0, bars: {}, barsAt: {}, long: null};
  const EQ_TTL = 10 * 60000;
  async function loadEq(force) {
    if (!force && D.eq && Date.now() - D.eqAt < EQ_TTL) return D.eq;
    const [eq, scan] = await Promise.all([
      T.getJSON(T.TDATA + 'equities.json', {bust: true, timeout: 30000}).then(d => d?.version === 1 && d.indices ? d : null).catch(e => { T.report('equities', e); return null; }),
      (D.scan && Date.now() - D.scanAt < EQ_TTL ? Promise.resolve(D.scan) : T.getJSON(T.TDATA + 'scanner.json', {bust: true, timeout: 30000}).catch(e => { T.report('dash-scanner', e); return null; }))]);
    const first = !D.eq;
    if (eq) { D.eq = eq; D.eqAt = Date.now(); }
    if (scan && scan !== D.scan) { D.scan = scan; D.scanAt = Date.now(); D.scanMap = null; }
    // Record every member's price and day change for tick highlighting (the first load is the baseline).
    const tick = TK(); if (tick && D.eq) { for (const s of members('all')) { const q = mq(s); if (!q) continue; tick.ingest('eq:px:' + s, q.price, {digits: 2, silent: first, src: q.src}); tick.ingest('eq:chg:' + s, q.chg, {digits: 2, silent: first, src: q.src}); } tick.commit({silent: first}); }
    return D.eq;
  }
  function scanMap() {
    if (D.scanMap || !D.scan?.stocks) return D.scanMap || new Map();
    const f = Object.fromEntries(D.scan.stocks.fields.map((k, i) => [k, i])), m = new Map();
    for (const r of D.scan.stocks.rows) m.set(String(r[f.symbol]).replace(/[./]/g, '-'), {name: r[f.name], price: r[f.price], chg: r[f.changePct], vol: r[f.volume], cap: r[f.marketCap], sector: r[f.sector], industry: r[f.industry]});
    return (D.scanMap = m);
  }
  const INDEX_NAME = {sp500: 'S&P 500', ndx: 'Nasdaq-100', dow: 'Dow 30'};
  function members(ix) {
    const i = D.eq?.indices || {};
    if (ix === 'all') return [...new Set([...(i.sp500 || []), ...(i.ndx || []), ...(i.dow || [])])];
    if (ix === 'fav') return favs().filter(s => D.eq?.closes?.[s]);
    return i[ix] || [];
  }
  // Shared with other plugins (company snapshot): index membership plus the screener quote, sector and industry.
  T.Equities = {load: loadEq, quote: sym => { const s = scanMap().get(String(sym).replace(/[./]/g, '-')); return s ? {...s} : null; },
    membership: sym => Object.entries(INDEX_NAME).filter(([k]) => (D.eq?.indices?.[k] || []).includes(String(sym).replace(/[./]/g, '-'))).map(([, n]) => n)};
  const cleanName = n => String(n || '').replace(/\s*\((Class [A-Z])\)/, ' $1').replace(/,?\s+(Inc\.?|Corp(oration)?\.?|Co\.|Company|plc|N\.V\.|Ltd\.?|Holdings?)$/i, '').trim();
  // One member's quote: the Nasdaq screener (fresher) when it has the symbol, else the latest Yahoo close.
  function mq(sym) {
    const c = D.eq?.closes?.[sym], s = scanMap().get(sym), inf = D.eq?.info?.[sym] || {};
    if (!c && !s) return null;
    const useScan = s && finite(s.price) && s.price > 0;
    return {sym, name: cleanName(inf.n || s?.name || sym), price: useScan ? s.price : c?.p, chg: useScan && finite(s.chg) ? s.chg : c?.c, cap: s?.cap || inf.cap || null, vol: s?.vol ?? null,
      sector: inf.sec || s?.sector || 'Other', industry: inf.ind || s?.industry || 'Other', c, src: useScan ? 'nasdaq' : 'yahoo'};
  }
  const PERIODS = {'1D': 'Today', '1W': '1 week', '1M': '1 month', '3M': '3 months', '6M': '6 months', 'YTD': 'Year to date', '1Y': '1 year'};
  function ret(q, period) {
    if (!q) return null; if (period === '1D') return q.chg;
    const c = q.c, p = q.price; if (!c || !finite(p)) return null;
    const base = period === '1W' ? c.d?.at(-6) : period === '1M' ? c.d?.[0] : period === '3M' ? c.w?.at(-14) : period === '6M' ? c.w?.at(-27) : period === 'YTD' ? c.y0 : period === '1Y' ? c.w?.[0] : null;
    return finite(base) && base > 0 ? (p / base - 1) * 100 : null;
  }
  function sparkOf(q, period) { const c = q?.c; if (!c) return []; const s = ['3M', '6M', 'YTD', '1Y'].includes(period) ? (period === '3M' ? c.w.slice(-14) : period === '6M' ? c.w.slice(-27) : c.w) : period === '1W' ? c.d.slice(-6) : c.d; return s.filter(finite); }
  const favs = () => { try { const v = JSON.parse(store.get('ov-fav') || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; } };
  const setFavs = v => store.set('ov-fav', JSON.stringify([...new Set(v)].slice(0, 200)));

  /* ---------- drawing helpers ---------- */
  function spark(vals, {W = 90, H = 26, cls = ''} = {}) {
    const s = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-dspark ' + cls, 'aria-hidden': 'true', preserveAspectRatio: 'none'});
    if (vals.length < 2) return s;
    const lo = Math.min(...vals), hi = Math.max(...vals), y = v => H - 2 - (v - lo) / (hi - lo || 1) * (H - 4);
    s.append(svg('polyline', {points: vals.map((v, i) => `${(i / (vals.length - 1) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' '), fill: 'none', stroke: vals.at(-1) >= vals[0] ? '#3ecf8e' : '#ff6b5f', 'stroke-width': 1.3, 'vector-effect': 'non-scaling-stroke'}));
    return s;
  }
  // finviz-style colour: red (−) · slate (0) · green (+), saturating at ±lim percent.
  function heat(v, lim = 3) {
    if (!finite(v)) return 'rgb(50,54,64)';
    const a = Math.max(-1, Math.min(1, v / lim)), base = [65, 69, 84], to = a >= 0 ? [48, 204, 90] : [246, 53, 56], k = Math.abs(a);
    return `rgb(${base.map((b, i) => Math.round(b + (to[i] - b) * k)).join(',')})`;
  }
  function squarify(items, x, y, w, h) {
    const out = [], list = items.filter(i => i.v > 0).sort((a, b) => b.v - a.v), total = list.reduce((s, i) => s + i.v, 0);
    if (!total || w <= 0 || h <= 0) return out;
    let rest = list.map(i => ({...i, a: i.v * w * h / total}));
    const worst = (row, s) => { const sum = row.reduce((t, i) => t + i.a, 0), mx = Math.max(...row.map(i => i.a)), mn = Math.min(...row.map(i => i.a)); return Math.max(s * s * mx / (sum * sum), sum * sum / (s * s * mn)); };
    while (rest.length) {
      const short = Math.min(w, h); let row = [rest[0]], best = worst(row, short), k = 1;
      while (k < rest.length) { const nr = [...row, rest[k]], nw = worst(nr, short); if (nw > best) break; row = nr; best = nw; k++; }
      const sum = row.reduce((t, i) => t + i.a, 0), thick = sum / short; let off = 0;
      for (const i of row) { const len = i.a / thick; out.push(w >= h ? {...i, x, y: y + off, w: thick, h: len} : {...i, x: x + off, y, w: len, h: thick}); off += len; }
      if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
      rest = rest.slice(row.length);
    }
    return out;
  }
  const tabsHost = (kind, items, cur, pick) => T.tabs(kind + '-tabs', items, cur, pick);
  const pref = (k, d) => store.get('dash-' + k) || d;
  const setPref = (k, v) => store.set('dash-' + k, String(v));
  const loading = (host, text) => { host.replaceChildren(el('p', 'fx-empty', text)); };

  /* ---------- intraday bars with extended hours (index cards, normalized chart) ---------- */
  const IDX = [['SPY', 'S&P 500'], ['QQQ', 'Nasdaq'], ['IWM', 'Russell 2K'], ['DIA', 'Dow Jones']];
  async function barsFor(sym) {
    if (D.bars[sym] && Date.now() - D.barsAt[sym] < 120000) return D.bars[sym];
    try { const d = await T.fnMarket({op: 'bars', symbol: sym, prepost: '1'}); if (Array.isArray(d?.t) && d.t.length) { D.bars[sym] = d; D.barsAt[sym] = Date.now(); } }
    catch (e) { T.report('dash-bars', e); }
    return D.bars[sym] || null;
  }
  function extended(b) {
    if (!b?.t?.length || !b.sessions?.regular) return null;
    const reg = b.sessions.regular, lastT = b.t.at(-1), last = b.c.at(-1), prev = b.previousClose, regPrice = b.regularPrice;
    const phase = lastT >= reg.end ? 'post' : lastT < reg.start ? 'pre' : 'regular';
    return {phase, last, regPrice, prev, regChg: finite(prev) && finite(regPrice) ? (regPrice / prev - 1) * 100 : null, extChg: finite(regPrice) && phase !== 'regular' ? (last / regPrice - 1) * 100 : null};
  }
  function dayLine(b, {W = 160, H = 46} = {}) {
    const s = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-dline', 'aria-hidden': 'true', preserveAspectRatio: 'none'});
    if (!b?.t?.length) return s;
    const ses = b.sessions || {}, t0 = ses.pre?.start ?? b.t[0], t1 = ses.post?.end ?? b.t.at(-1), x = t => (t - t0) / (t1 - t0 || 1) * W;
    const vals = [...b.c, b.previousClose].filter(finite), lo = Math.min(...vals), hi = Math.max(...vals), y = v => H - 2 - (v - lo) / (hi - lo || 1) * (H - 4);
    if (ses.regular) { s.append(svg('rect', {x: 0, y: 0, width: x(ses.regular.start), height: H, fill: 'rgba(255,255,255,.04)'}), svg('rect', {x: x(ses.regular.end), y: 0, width: W - x(ses.regular.end), height: H, fill: 'rgba(255,255,255,.04)'})); }
    if (finite(b.previousClose)) s.append(svg('line', {x1: 0, x2: W, y1: y(b.previousClose), y2: y(b.previousClose), stroke: '#55605b', 'stroke-dasharray': '2 3', 'vector-effect': 'non-scaling-stroke'}));
    const pts = b.t.map((t, i) => `${x(t).toFixed(1)},${y(b.c[i]).toFixed(1)}`).join(' ');
    s.append(svg('polyline', {points: pts, fill: 'none', stroke: b.c.at(-1) >= b.previousClose ? '#3ecf8e' : '#ff6b5f', 'stroke-width': 1.3, 'vector-effect': 'non-scaling-stroke'}));
    return s;
  }

  /* ---------- panels ---------- */
  const R = {};
  R.idxc = async () => {
    const host = T.panel('idxc'); if (!host.childNodes.length) loading(host, 'Loading index funds…');
    const all = await Promise.all(IDX.map(([s]) => barsFor(s))); if (!host.isConnected) return;
    host.replaceChildren(); const grid = el('div', 'fx-idxc');
    IDX.forEach(([sym, label], i) => {
      const b = all[i], x = extended(b), q = quoteFor(sym), card = btn('', 'fx-idxcard', () => T.setSymbol({symbol: sym}), `${label} (${sym})`);
      const head = el('div', 'fx-idxh'); head.append(el('b', '', label), el('span', '', sym)); card.append(head);
      const reg = el('div', 'fx-idxp'), regPrice = x?.regPrice ?? q?.price, regChg = x?.regChg ?? q?.changePercent;
      reg.append(el('small', '', x?.phase === 'regular' ? 'Market open' : 'Market close'), tk(el('b', '', money(regPrice)), 'px:' + sym, x ? null : regPrice), el('em', tone(regChg), pct(regChg)));
      const ext = el('div', 'fx-idxp');
      if (x && x.phase !== 'regular') ext.append(el('small', '', x.phase === 'post' ? 'After hours' : 'Pre-market'), tk(el('b', '', money(x.last)), 'ext:' + sym, null), el('em', tone(x.extChg), pct(x.extChg)));
      card.append(el('div', 'fx-idxrow'));
      card.lastChild.append(reg, ext, dayLine(b));
      grid.append(card);
      const t = TK(); if (t && x) t.ingest('ext:' + sym, x.last, {digits: 2, src: 'yahoo-ext'});
    });
    host.append(grid, el('p', 'fx-foot', `Yahoo Finance 5-minute bars incl. pre-market (4:00 AM) and after hours (to 8:00 PM ET) · shaded = outside regular hours · dashed = previous close · delayed`));
  };

  const NP_SERIES = [['SPY', '#3ecf8e'], ['QQQ', '#c4a1ff'], ['DIA', '#5ce1e6'], ['IWM', '#ffd166']];
  async function nperfData(period) {
    if (period === 'TODAY') {
      const all = await Promise.all(NP_SERIES.map(([s]) => barsFor(s)));
      return {intraday: true, sessions: all.find(b => b?.sessions)?.sessions, series: NP_SERIES.map(([s, c], i) => { const b = all[i]; return b && finite(b.previousClose) ? {sym: s, color: c, pts: b.t.map((t, k) => [t * 1000, (b.c[k] / b.previousClose - 1) * 100])} : null; }).filter(Boolean)};
    }
    let rows;
    if (['3Y', '5Y'].includes(period)) {
      if (!D.long) { try { D.long = await T.fnMarket({op: 'closes', symbols: NP_SERIES.map(s => s[0]).join(','), range: '5y'}); } catch (e) { T.report('dash-closes', e); } }
      const d = D.long; if (!d?.dates) return {series: []};
      const from = new Date(); from.setUTCFullYear(from.getUTCFullYear() - (period === '3Y' ? 3 : 5)); const iso = from.toISOString().slice(0, 10), i0 = Math.max(0, d.dates.findIndex(x => x >= iso));
      rows = NP_SERIES.map(([s]) => (d.series?.[s] || []).slice(i0).map((v, k) => [Date.parse(d.dates[i0 + k]), v]));
    } else {
      const n = {'1W': 6, '1M': 22, '3M': 64, '1Y': 252}[period], ytd = `${new Date().getUTCFullYear()}-01-01`;
      rows = NP_SERIES.map(([s]) => { const h = S.mk?.quotes?.[s]?.history || []; const sl = period === 'YTD' ? h.slice(Math.max(0, h.findIndex(r => r[0] >= ytd) - 1)) : h.slice(-n); return sl.map(r => [Date.parse(r[0]), r[1]]); });
    }
    return {series: NP_SERIES.map(([s, c], i) => { const r = rows[i].filter(p => finite(p[1])); return r.length > 1 ? {sym: s, color: c, pts: r.map(p => [p[0], (p[1] / r[0][1] - 1) * 100])} : null; }).filter(Boolean)};
  }
  function perfChart(data, {W = 900, H = 300} = {}) {
    const L = 8, Rr = 70, Tp = 10, B = 22, all = data.series.flatMap(s => s.pts), c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart fx-nperf', role: 'img', 'aria-label': 'Normalized performance of SPY, QQQ, DIA and IWM in percent'});
    if (!all.length) return c;
    const t0 = data.intraday && data.sessions?.pre ? data.sessions.pre.start * 1000 : Math.min(...all.map(p => p[0])), t1 = data.intraday && data.sessions?.post ? data.sessions.post.end * 1000 : Math.max(...all.map(p => p[0]));
    const vs = all.map(p => p[1]), lo0 = Math.min(0, ...vs), hi0 = Math.max(0, ...vs), pad = (hi0 - lo0) * 0.08 || 0.5, lo = lo0 - pad, hi = hi0 + pad;
    const x = t => L + (t - t0) / (t1 - t0 || 1) * (W - L - Rr), y = v => Tp + (hi - v) / (hi - lo) * (H - Tp - B);
    if (data.intraday && data.sessions?.regular) {
      const rs = data.sessions.regular.start * 1000, re = data.sessions.regular.end * 1000;
      c.append(svg('rect', {x: L, y: Tp, width: x(rs) - L, height: H - Tp - B, fill: 'rgba(255,255,255,.035)'}), svg('rect', {x: x(re), y: Tp, width: W - Rr - x(re), height: H - Tp - B, fill: 'rgba(255,255,255,.035)'}));
      for (const [t, l] of [[rs, 'OPEN'], [re, 'CLOSE']]) { c.append(svg('line', {x1: x(t), x2: x(t), y1: Tp, y2: H - B, stroke: '#3a4440', 'stroke-dasharray': '2 3'})); const tx = svg('text', {x: x(t) + 3, y: Tp + 10, class: 'a'}); tx.textContent = l; c.append(tx); }
    }
    const step = [0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100].find(s => (hi - lo) / s <= 6) || 200;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { c.append(svg('line', {x1: L, x2: W - Rr, y1: y(v), y2: y(v), class: 'g'})); const t = svg('text', {x: W - Rr + 6, y: y(v) + 4, class: 'a'}); t.textContent = v.toFixed(step < 1 ? 2 : 1) + '%'; c.append(t); }
    c.append(svg('line', {x1: L, x2: W - Rr, y1: y(0), y2: y(0), stroke: '#6a7570', 'stroke-dasharray': '3 3'}));
    const ticks = 6; for (let k = 0; k <= ticks; k++) { const t = t0 + (t1 - t0) * k / ticks, tx = svg('text', {x: x(t), y: H - 6, class: 'a', 'text-anchor': k === 0 ? 'start' : k === ticks ? 'end' : 'middle'}); tx.textContent = data.intraday ? new Date(t).toLocaleTimeString('en-US', {timeZone: ET, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}) : new Date(t).toLocaleDateString('en-US', {month: 'short', day: 'numeric', ...(t1 - t0 > 3e10 ? {year: '2-digit'} : {})}); c.append(tx); }
    const labels = [];
    for (const s of data.series) {
      c.append(svg('polyline', {points: s.pts.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' '), fill: 'none', stroke: s.color, 'stroke-width': 1.4, 'stroke-linejoin': 'round'}));
      labels.push({s, yv: y(s.pts.at(-1)[1]), v: s.pts.at(-1)[1], xe: x(s.pts.at(-1)[0])});
    }
    labels.sort((a, b) => a.yv - b.yv).forEach((l, i, a) => { if (i && l.yv - a[i - 1].yv < 11) l.yv = a[i - 1].yv + 11; const t = svg('text', {x: Math.min(W - Rr - 4, l.xe + 4), y: l.yv + 3, fill: l.s.color, 'font-size': 10, 'font-family': 'IBM Plex Mono, monospace', 'text-anchor': l.xe > W - Rr - 60 ? 'end' : 'start'}); t.textContent = `${l.s.sym} ${signed(l.v, 2, '%')}`; c.append(t); });
    return c;
  }
  R.nperf = async () => {
    const period = pref('nperf', 'TODAY');
    tabsHost('nperf', ['TODAY', '1W', '1M', '3M', 'YTD', '1Y', '3Y', '5Y'].map(p => [p, p]), period, v => { setPref('nperf', v); R.nperf(); });
    const host = T.panel('nperf'); loading(host, 'Loading…');
    const data = await nperfData(period); if (!host.isConnected || pref('nperf', 'TODAY') !== period) return;
    host.replaceChildren();
    if (!data.series.length) return host.append(el('p', 'fx-empty', 'Performance data is not available right now.'));
    host.append(perfChart(data), el('p', 'fx-foot', period === 'TODAY' ? 'Change from the previous close, 5-minute bars, pre-market and after hours shaded · SPY, QQQ, DIA, IWM · delayed' : `Total change over ${period} from daily closes · SPY, QQQ, DIA, IWM`));
  };

  const SECTOR_ETF = {'Information Technology': 'XLK', Financials: 'XLF', 'Health Care': 'XLV', 'Consumer Discretionary': 'XLY', 'Communication Services': 'XLC', Industrials: 'XLI', 'Consumer Staples': 'XLP', Energy: 'XLE', Utilities: 'XLU', Materials: 'XLB', 'Real Estate': 'XLRE'};
  const SHORT_SECTOR = {'Information Technology': 'Technology', 'Communication Services': 'Communication', 'Consumer Discretionary': 'Consumer Disc.', 'Consumer Staples': 'Consumer Staples'};
  function etfReturn(etf, period) {
    const q = quoteFor(etf); if (period === '1D') return q?.changePercent ?? null;
    const h = S.mk?.quotes?.[etf]?.history || [], last = q?.price ?? h.at(-1)?.[1], n = {'1W': 5, '1M': 21, '3M': 63, '1Y': 251}[period];
    const base = period === 'YTD' ? [...h].reverse().find(r => r[0] < `${new Date().getUTCFullYear()}-01-01`)?.[1] : h.at(-1 - n)?.[1];
    return finite(base) && finite(last) ? (last / base - 1) * 100 : null;
  }
  R.dsect = async () => {
    const period = pref('sect', '1D');
    tabsHost('dsect', ['1D', '1W', '1M', '3M', 'YTD'].map(p => [p, p === '1D' ? 'TODAY' : p]), period, v => { setPref('sect', v); R.dsect(); });
    const host = T.panel('dsect'); if (!D.eq) loading(host, 'Loading sectors…');
    await loadEq(); if (!host.isConnected) return; host.replaceChildren();
    const caps = {}; for (const s of members('sp500')) { const q = mq(s); if (q && finite(q.cap)) caps[q.sector] = (caps[q.sector] || 0) + q.cap; }
    const items = Object.entries(SECTOR_ETF).map(([sec, etf]) => ({sec, etf, v: caps[sec] || 0, r: etfReturn(etf, period)})).filter(i => i.v > 0);
    if (!items.length) return host.append(el('p', 'fx-empty', 'Sector data is not available right now.'));
    const box = el('div', 'fx-treemap'); host.append(box);
    const lim = {'1D': 2, '1W': 4, '1M': 6, '3M': 10, YTD: 20}[period];
    for (const r of squarify(items, 0, 0, 100, 100)) {
      const t = btn('', 'fx-tmtile', () => T.setSymbol({symbol: r.etf}), `${r.sec} ${r.etf} ${pct(r.r)}`);
      Object.assign(t.style, {left: r.x + '%', top: r.y + '%', width: r.w + '%', height: r.h + '%', background: heat(r.r, lim)});
      t.append(el('b', '', (SHORT_SECTOR[r.sec] || r.sec).toUpperCase()), tk(el('span', '', `${r.etf} ${pct(r.r)}`), period === '1D' ? 'chg:' + r.etf : 'sect:' + period + r.etf, period === '1D' ? r.r : null));
      if (r.w * r.h < 120) t.classList.add('sm');
      box.append(t);
    }
    host.append(el('p', 'fx-foot', `Tile = sector share of S&P 500 market value · colour = sector SPDR fund ${period === '1D' ? 'today' : 'over ' + PERIODS[period].toLowerCase()} · click for the fund`));
  };

  function stockRow(q, i, {period = '1D', showCap = true} = {}) {
    const r = T.rowButton('fx-drow' + (showCap ? '' : ' nocap'), () => T.setSymbol({symbol: q.sym, name: q.name}), `${q.sym} ${q.name}`), v = ret(q, period);
    r.append(el('span', 'fx-dim', String(i + 1)), el('b', '', q.sym), el('span', 'fx-dname', q.name), tk(el('span', 'fx-num', money(q.price)), 'eq:px:' + q.sym, q.price), tk(el('span', 'fx-num ' + tone(v), pct(v)), period === '1D' ? 'eq:chg:' + q.sym : '', period === '1D' ? v : null));
    if (showCap) r.append(el('span', 'fx-num fx-dim', cap(q.cap)));
    return r;
  }
  const rowHead = (showCap = true) => { const h = el('div', 'fx-th fx-drow' + (showCap ? '' : ' nocap')); h.append(el('span', '', '#'), el('span', '', 'SYM'), el('span', '', 'NAME'), el('span', '', 'PRICE'), el('span', '', 'CHG %')); if (showCap) h.append(el('span', '', 'MCAP')); return h; };
  R.big = async () => {
    const page = Math.max(1, Math.min(5, Number(pref('bigp', 1)) || 1));
    const host = T.panel('big'); if (!D.scan) loading(host, 'Loading companies…');
    await loadEq(); if (!host.isConnected) return; host.replaceChildren();
    const list = [...scanMap().entries()].filter(([, s]) => finite(s.cap) && s.cap > 0 && finite(s.price)).sort((a, b) => b[1].cap - a[1].cap).slice(0, 50).map(([sym]) => mq(sym) || {sym, ...scanMap().get(sym), name: cleanName(scanMap().get(sym).name)});
    if (!list.length) return host.append(el('p', 'fx-empty', 'Company data is not available right now.'));
    const nav = el('div', 'fx-pager'); nav.append(btn('◀', 'fx-chip', () => { setPref('bigp', Math.max(1, page - 1)); R.big(); }, 'Previous page'), el('span', '', `${page}/5`), btn('▶', 'fx-chip', () => { setPref('bigp', Math.min(5, page + 1)); R.big(); }, 'Next page'));
    T.setText('n-big', ''); $('n-big')?.append(nav);
    host.append(rowHead()); list.slice((page - 1) * 10, page * 10).forEach((q, i) => host.append(stockRow({...q, c: D.eq?.closes?.[q.sym]}, (page - 1) * 10 + i)));
    host.append(el('p', 'fx-foot', 'US-listed companies by market value · Nasdaq screener (delayed)'));
  };
  R.glam = async () => {
    const tab = pref('glam', 'gain');
    tabsHost('glam', [['gain', 'GAINERS'], ['lose', 'LOSERS'], ['active', 'ACTIVE']], tab, v => { setPref('glam', v); R.glam(); });
    const host = T.panel('glam'); if (!D.scan) loading(host, 'Loading US stocks…');
    await loadEq(); if (!host.isConnected) return; host.replaceChildren();
    // Listed US stocks above $1 with real trading (100,000+ shares) so one-off prints in dormant tickers don't top the list.
    const all = [...scanMap().entries()].filter(([, s]) => finite(s.price) && s.price >= 1 && finite(s.chg) && (s.vol || 0) >= 1e5).map(([sym, s]) => ({sym, name: cleanName(s.name), price: s.price, chg: s.chg, vol: s.vol, cap: s.cap}));
    const list = tab === 'active' ? all.sort((a, b) => b.vol - a.vol) : tab === 'lose' ? all.sort((a, b) => a.chg - b.chg) : all.sort((a, b) => b.chg - a.chg);
    host.append(rowHead(false)); list.slice(0, 20).forEach((q, i) => { const r = stockRow(q, i, {showCap: false}); if (tab === 'active') r.lastChild.title = `${q.vol.toLocaleString()} shares`; host.append(r); });
    host.append(el('p', 'fx-foot', `All US-listed stocks priced $1 or more with 100,000+ shares traded · ${tab === 'active' ? 'by volume' : 'by change today'} · Nasdaq screener (delayed)`));
  };
  R.ixm = async () => {
    const ix = pref('ixm', 'sp500');
    tabsHost('ixm', [['sp500', 'S&P 500'], ['ndx', 'NDX'], ['dow', 'DJIA']], ix, v => { setPref('ixm', v); R.ixm(); });
    const host = T.panel('ixm'); if (!D.eq) loading(host, 'Loading index members…');
    await loadEq(); if (!host.isConnected) return; host.replaceChildren();
    const qs = members(ix).map(mq).filter(q => q && finite(q.chg)).sort((a, b) => b.chg - a.chg);
    if (!qs.length) return host.append(el('p', 'fx-empty', 'Index members are not available right now.'));
    const cols = el('div', 'fx-ixm');
    for (const [label, list] of [['TOP GAINERS', qs.slice(0, 12)], ['TOP LOSERS', qs.slice(-12).reverse()]]) { const c = el('div'); c.append(el('div', 'fx-th1', `${label} · ${INDEX_NAME[ix]}`), rowHead(false)); list.forEach((q, i) => c.append(stockRow(q, i, {showCap: false}))); cols.append(c); }
    const up = qs.filter(q => q.chg > 0).length; T.setText('n-ixm', `${up} up · ${qs.length - up} down`);
    host.append(cols, el('p', 'fx-foot', `${qs.length} ${INDEX_NAME[ix]} members · ${D.eq.sources?.[ix] || ''}`));
  };
  R.ratesdx = async () => {
    const mode = pref('rdx', 'RATES'), span = pref('rdxs', 'MAX');
    tabsHost('ratesdx', [['RATES', 'RATES'], ['CURVE', 'CURVE'], ...(mode === 'RATES' ? [['5Y', '5Y'], ['10Y', '10Y'], ['MAX', 'MAX']] : [])], mode === 'RATES' ? span : mode, v => { if (['RATES', 'CURVE'].includes(v)) setPref('rdx', v); else setPref('rdxs', v); R.ratesdx(); });
    $('ratesdx-tabs')?.querySelector(`button:nth-child(${mode === 'RATES' ? 1 : 2})`)?.classList.add('on');
    const host = T.panel('ratesdx');
    if (mode === 'CURVE') { const c = T.curveChart('US', {W: 520, H: 220}); if (!c) return host.append(el('p', 'fx-empty', 'Loading the yield curve…')); host.append(c.chart, T.tenorGrid('US', c.view, c.curve)); return; }
    if (!D.eq) loading(host, 'Loading history…');
    await loadEq(); if (!host.isConnected) return; host.replaceChildren();
    const m = D.eq?.macro; if (!m?.dates?.length) return host.append(el('p', 'fx-empty', 'Rates and dollar history is not available right now.'));
    const from = span === 'MAX' ? 0 : Math.max(0, m.dates.length - (span === '5Y' ? 261 : 522));
    const S3 = [['spx', 'S&P 500', '#ffffff', v => fmt(v, 2)], ['tnx', 'US 10Y', '#5b8def', v => v.toFixed(2) + '%'], ['dxy', 'DXY', '#ff8a3d', v => fmt(v, 2)]];
    const W = 900, H = 300, L = 8, Rr = 8, Tp = 8, B = 22, n = m.dates.length - from, x = i => L + i / (n - 1) * (W - L - Rr);
    const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart fx-rdx', role: 'img', 'aria-label': 'S&P 500, US 10-year yield and dollar index, each on its own scale'});
    for (const [k, , col] of S3) { const vals = m[k].slice(from), ok = vals.filter(finite), lo = Math.min(...ok), hi = Math.max(...ok); c.append(svg('polyline', {points: vals.map((v, i) => finite(v) ? `${x(i).toFixed(1)},${(Tp + (hi - v) / (hi - lo || 1) * (H - Tp - B)).toFixed(1)}` : null).filter(Boolean).join(' '), fill: 'none', stroke: col, 'stroke-width': 1.1, opacity: k === 'spx' ? 1 : 0.9})); }
    let lastY = ''; m.dates.slice(from).forEach((d, i) => { const yy = d.slice(0, 4); if (yy !== lastY) { lastY = yy; if (i > 8 && i < n - 20 && (span !== 'MAX' || +yy % 2 === 0)) { const t = svg('text', {x: x(i), y: H - 6, class: 'a', 'text-anchor': 'middle'}); t.textContent = yy; c.append(t); } } });
    const leg = el('div', 'fx-rdxleg'); leg.append(el('small', '', 'LAST PRICE'));
    for (const [k, label, col, f] of S3) { const s = el('span'), i = el('i'); i.style.background = col; s.append(i, el('b', '', label), el('em', '', f(m[k].at(-1)))); leg.append(s); }
    host.append(c, leg, el('p', 'fx-foot', `Weekly closes since ${m.dates[from].slice(0, 4)}, each line on its own scale (shape, not size) · ${m.source || 'Yahoo Finance'}`));
  };
  function quoteList(host, ids, title) {
    if (title) host.append(el('div', 'fx-th1', title));
    for (const id of ids) {
      const q = quoteFor(id); if (!q) continue;
      const r = T.rowButton('fx-qrow', () => T.focusOn(id), `${nameOf(id)}`);
      r.append(el('span', '', nameOf(id)), tk(el('span', 'fx-num', fmt(q.price, T.digitsOf(id))), 'px:' + id, q.price), tk(el('span', 'fx-num ' + tone(q.changePercent), pct(q.changePercent)), 'chg:' + id, q.changePercent));
      host.append(r);
    }
  }
  R.tsy = () => {
    const host = T.panel('tsy'), v = T.M?.curveView?.(S.desk?.curves?.US), live = S.desk?.liveUS?.quotes || [];
    if (!v && !live.length) return host.append(el('p', 'fx-empty', 'Loading Treasury yields…'));
    host.append(el('div', 'fx-th1', `YIELDS (%)${v ? ' · ' + v.latestDate : ''}`));
    for (const r of v?.rows || []) {
      if (!['3M', '6M', '1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'].includes(r.tenor)) continue;
      const lq = live.find(q => q.tenor === r.tenor), val = lq?.price ?? r.value, ch = lq && finite(lq.previousClose) ? lq.price - lq.previousClose : null;
      const row = el('div', 'fx-row fx-qrow'); row.append(el('span', '', 'US ' + r.tenor), tk(el('span', 'fx-num', val.toFixed(lq ? 3 : 2) + '%'), lq ? 'ust:' + r.tenor : 'curve:US:' + r.tenor, val), el('span', 'fx-num ' + tone(ch), finite(ch) ? signed(ch, 3) : '')); host.append(row);
    }
    quoteList(host, ['ZT=F', 'ZF=F', 'ZN=F', 'ZB=F'], 'BOND FUTURES');
    host.append(el('p', 'fx-foot', 'Official Treasury par yields (latest close), live CBOT yields where available, and CBOT Treasury futures (delayed)'));
  };
  R.usm = () => { const host = T.panel('usm'); quoteList(host, ['^GSPC', '^DJI', '^IXIC', '^NDX', '^RUT', 'DX-Y.NYB'], 'US INDICES'); quoteList(host, ['ES=F', 'NQ=F', 'YM=F', 'RTY=F'], 'EQUITY FUTURES'); if (!host.querySelector('.fx-qrow')) host.append(el('p', 'fx-empty', 'Loading US markets…')); };
  R.glob = () => {
    const tab = pref('glob', 'idx'), sets = {idx: ['^STOXX50E', '^FTSE', '^GDAXI', '^FCHI', '^N225', '^HSI', '000001.SS', '^KS11', '^NSEI', '^AXJO', '^GSPTSE', '^BVSP'], crypto: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'BNB-USD', 'DOGE-USD', 'ADA-USD', 'AVAX-USD'], fx: ['EURUSD=X', 'GBPUSD=X', 'JPY=X', 'CHF=X', 'AUDUSD=X', 'CAD=X', 'CNY=X', 'MXN=X'], cmdty: ['CL=F', 'BZ=F', 'NG=F', 'GC=F', 'SI=F', 'HG=F', 'ZC=F', 'ZW=F']};
    tabsHost('glob', [['idx', 'INDICES'], ['crypto', 'CRYPTO'], ['fx', 'FX'], ['cmdty', 'CMDTY']], tab, v => { setPref('glob', v); R.glob(); });
    const host = T.panel('glob'); quoteList(host, sets[tab] || sets.idx, {idx: 'INTERNATIONAL MARKETS', crypto: 'CRYPTO', fx: 'CURRENCIES', cmdty: 'COMMODITIES'}[tab]); quoteList(host, ['^VIX', '^VXN', '^MOVE'], 'VOLATILITY');
    if (!host.querySelector('.fx-qrow')) host.append(el('p', 'fx-empty', 'Loading world markets…'));
  };

  const P = (k, code, title, page, desc) => { T.PANELS[k] = [code, title, page]; T.PANEL_DESC[k] = desc; T.RENDER[k] = () => R[k]().catch?.(e => T.report('dash-' + k, e)); };
  P('idxc', 'IDX', 'Index funds · extended hours', 'des', 'SPY, QQQ, IWM, DIA with pre-market and after-hours prices');
  P('nperf', 'NPERF', 'Normalized market performance', null, 'SPY, QQQ, DIA and IWM in % — today with extended hours to 5 years');
  P('dsect', 'SECT', 'Sectors', 'hmap', 'The 11 S&P 500 sectors sized by market value, coloured by their move');
  P('big', 'LARGE', 'Largest companies', 'overview', 'Largest US-listed companies by market value');
  P('glam', 'USMOV', 'US stocks movers', 'scan', 'All US stocks: top gainers, losers and most active');
  P('ixm', 'IXMOV', 'Index gainers & losers', 'overview', 'Top gainers and losers in the S&P 500, Nasdaq-100 or Dow 30');
  P('ratesdx', 'RATES', 'Rates & dollar', 'macro', 'S&P 500 vs US 10-year yield vs dollar index since 2011, or the US curve');
  P('tsy', 'TSY', 'Treasuries & bond futures', 'macro', 'US Treasury yields and CBOT Treasury futures');
  P('usm', 'USMKT', 'US markets', 'mkts', 'US indices, dollar index and equity futures');
  P('glob', 'GLOBAL', 'Global markets', 'mkts', 'World indices, crypto, FX, commodities and volatility');
  for (const k of ['nperf', 'dsect', 'glam', 'ixm', 'ratesdx', 'glob']) T.TABBED.add(k);
  T.LINK_LABEL.hmap = 'Heat map'; T.LINK_LABEL.overview = 'Overview'; T.LINK_LABEL.scan = 'Scanner';
  T.EXTRA_GROUPS.push(['Dashboard', ['idxc', 'nperf', 'dsect', 'big', 'glam', 'ixm', 'ratesdx', 'tsy', 'usm', 'glob']]);
  if (T.DESK_DEFS && !T.DESK_DEFS.dash) {
    T.DESK_DEFS.dash = {...T.DESK_DEFS.stocks, label: 'DASHBOARD', noun: 'US markets', who: 'US market watchers', storyKind: null,
      slots: ['nperf', 'idxc', 'dsect', 'usm', 'glob', 'tsy', 'big', 'ixm', 'glam', 'ratesdx', 'intel'],
      grid: {cols: '1fr 1fr 1fr 1fr 1fr 1fr', areas: ['s1 s1 s1 s1 s2 s2', 's3 s3 s4 s4 s5 s5', 's7 s7 s8 s8 s8 s6', 's9 s9 s10 s10 s10 s11']}};
    const ai = T.DESK_ORDER.indexOf('all'); T.DESK_ORDER.splice(ai >= 0 ? ai + 1 : 0, 0, 'dash');
  }
  // Quote-driven panels redraw when a new quote batch arrives (their cells flash through the shared tick system).
  window.addEventListener('fynx:ticks', () => T.R('usm', 'glob', 'tsy'));
  // Refresh: intraday bars every 2 minutes and member data every 10 while any of these panels is on screen.
  setInterval(async () => {
    if (document.hidden) return;
    if ($('tp-idxc') || $('tp-nperf')) { D.barsAt = {}; T.R('idxc'); if (pref('nperf', 'TODAY') === 'TODAY') T.R('nperf'); }
  }, 120000);
  setInterval(async () => {
    if (document.hidden || !['dsect', 'big', 'glam', 'ixm'].some(k => $('tp-' + k)) && !document.querySelector('.ov-grid,.xm-box,.ind-table')) return;
    await loadEq(true); T.R('dsect', 'big', 'glam', 'ixm'); PG?.refresh?.('overview'); PG?.refresh?.('hmap'); PG?.refresh?.('industries');
  }, EQ_TTL);
  if (!PG) return;

  /* ---------- OVERVIEW: market overview cards ---------- */
  PG.add('overview', 'Market overview', async (host, arg, alive) => {
    PG.setHead('OVR', 'Market overview', 'Every member of the S&P 500, Nasdaq-100 or Dow 30 as a card · click a card to favourite it');
    host.append(el('p', 'fx-empty', 'Loading index members…'));
    await loadEq(); if (!alive()) return; host.replaceChildren();
    if (!D.eq) return host.append(el('p', 'fx-empty', 'Index data is not available right now.'));
    const st = {ix: pref('ov-ix', 'sp500'), sector: pref('ov-sec', ''), industry: pref('ov-ind', ''), q: '', sort: pref('ov-sort', 'cap'), dir: Number(pref('ov-dir', -1)), period: pref('ov-per', '1D'), group: pref('ov-grp', 'sector'), size: pref('ov-size', 'M')};
    const bar = el('div', 'ov-bar'), gridHost = el('div');
    const save = () => { for (const [k, v] of Object.entries({ix: st.ix, sec: st.sector, ind: st.industry, sort: st.sort, dir: st.dir, per: st.period, grp: st.group, size: st.size})) setPref('ov-' + k, v); };
    function select(label, options, cur, on) { const s = el('select', 'ov-sel'); s.setAttribute('aria-label', label); for (const [v, l] of options) { const o = el('option', '', l); o.value = v; if (v === cur) o.selected = true; s.append(o); } s.addEventListener('change', () => on(s.value)); return s; }
    function drawBar() {
      bar.replaceChildren();
      const all = members(st.ix === 'fav' ? 'all' : st.ix).map(mq).filter(Boolean), sectors = [...new Set(all.map(q => q.sector))].sort(), industries = [...new Set(all.filter(q => !st.sector || q.sector === st.sector).map(q => q.industry))].sort();
      bar.append(PG.pageTabs([['sp500', 'S&P 500'], ['ndx', 'NASDAQ 100'], ['dow', 'DOW 30'], ['fav', `FAVORITES${favs().length ? ' ' + favs().length : ''}`]], st.ix, v => { st.ix = v; st.sector = ''; st.industry = ''; save(); drawBar(); draw(); }));
      bar.append(select('Sector', [['', 'All sectors'], ...sectors.map(s => [s, s])], st.sector, v => { st.sector = v; st.industry = ''; save(); drawBar(); draw(); }), select('Industry', [['', 'All industries'], ...industries.map(s => [s, s])], st.industry, v => { st.industry = v; save(); draw(); }));
      const find = el('input', 'ov-find'); find.type = 'search'; find.placeholder = 'Find'; find.value = st.q; find.setAttribute('aria-label', 'Find a company'); find.addEventListener('input', () => { st.q = find.value.trim().toLowerCase(); draw(); }); bar.append(find);
      const sortTabs = PG.pageTabs([['cap', `MARKET CAP${st.sort === 'cap' ? (st.dir < 0 ? ' ↓' : ' ↑') : ''}`], ['chg', `CHANGE${st.sort === 'chg' ? (st.dir < 0 ? ' ↓' : ' ↑') : ''}`], ['name', `NAME${st.sort === 'name' ? (st.dir < 0 ? ' ↓' : ' ↑') : ''}`]], st.sort, v => { st.dir = st.sort === v ? -st.dir : v === 'name' ? 1 : -1; st.sort = v; save(); drawBar(); draw(); });
      bar.append(sortTabs, PG.pageTabs(['1D', '1W', '1M', '3M', '1Y'].map(p => [p, p]), st.period, v => { st.period = v; save(); drawBar(); draw(); }), PG.pageTabs([['sector', 'SECTOR'], ['flat', 'FLAT']], st.group, v => { st.group = v; save(); drawBar(); draw(); }), PG.pageTabs([['S', 'S'], ['M', 'M'], ['L', 'L']], st.size, v => { st.size = v; save(); drawBar(); draw(); }));
    }
    function card(q) {
      const v = ret(q, st.period), fav = favs().includes(q.sym), c = btn('', 'ov-card' + (fav ? ' fav' : ''), () => { const f = favs(), on = f.includes(q.sym); setFavs(on ? f.filter(x => x !== q.sym) : [...f, q.sym]); c.setAttribute('aria-pressed', String(!on)); if (st.ix === 'fav') { drawBar(); draw(); } else { c.classList.toggle('fav', !on); drawBar(); } }, `${q.sym} ${q.name} ${pct(v)} · favourite`);
      c.setAttribute('aria-pressed', String(fav));
      c.style.background = `linear-gradient(90deg, ${heat(v, {'1D': 3, '1W': 6, '1M': 10, '3M': 15, '1Y': 30}[st.period])} 0%, rgba(14,18,20,.92) 140%)`;
      const top = el('div', 'ov-top'); top.append(el('b', '', q.sym), spark(sparkOf(q, st.period), {W: 70, H: 22}));
      c.append(top, tk(el('span', 'ov-px', fmt(q.price, 2)), 'eq:px:' + q.sym, q.price), el('small', 'ov-name', q.name), el('em', 'ov-chg', pct(v)));
      const open = btn('↗', 'ov-open', e => { e.stopPropagation(); T.setSymbol({symbol: q.sym, name: q.name}); }, `Open ${q.sym}`); c.append(open);
      return c;
    }
    function draw() {
      gridHost.replaceChildren();
      let list = members(st.ix).map(mq).filter(Boolean).filter(q => (!st.sector || q.sector === st.sector) && (!st.industry || q.industry === st.industry) && (!st.q || q.sym.toLowerCase().includes(st.q) || q.name.toLowerCase().includes(st.q)));
      const key = q => st.sort === 'cap' ? q.cap ?? -Infinity : st.sort === 'chg' ? ret(q, st.period) ?? -Infinity : q.sym;
      list.sort((a, b) => st.sort === 'name' ? st.dir * a.sym.localeCompare(b.sym) : st.dir * (key(a) - key(b)));
      if (!list.length) return gridHost.append(el('p', 'fx-empty', st.ix === 'fav' ? 'No favourites yet: click any card to add it.' : 'No companies match.'));
      const through = D.eq.closes?.[list[0].sym]?.t;
      gridHost.append(el('p', 'pg-note', `${list.length} companies · ${PERIODS[st.period]} change · through ${through || ''} · colour scale ±${{'1D': 3, '1W': 6, '1M': 10, '3M': 15, '1Y': 30}[st.period]}% · click a card to favourite it, ↗ to open it`));
      const groups = st.group === 'sector' ? [...new Set(list.map(q => q.sector))].sort().map(s => [s, list.filter(q => q.sector === s)]) : [['', list]];
      for (const [name, qs] of groups) { if (name) gridHost.append(el('h3', 'ov-sec', `${name} · ${qs.length}`)); const g = el('div', 'ov-grid ov-' + st.size); qs.forEach(q => g.append(card(q))); gridHost.append(g); }
    }
    drawBar(); host.append(bar, gridHost); draw();
    host.append(PG.sourceNote(`Members: ${Object.values(D.eq.sources || {}).join(' · ')}. Prices: Nasdaq screener, else Yahoo Finance closes (delayed). Sparklines: daily closes (1D–1M) or weekly closes (3M–1Y).`));
  });

  /* ---------- HMAP: S&P 500 / Nasdaq-100 / Dow heat map by sector and industry ---------- */
  PG.add('hmap', 'Heat map', async (host, arg, alive) => {
    PG.setHead('HMAP', 'Heat map', 'Index members grouped by sector and industry · size = market value · colour = performance');
    host.append(el('p', 'fx-empty', 'Loading index members…'));
    await loadEq(); if (!alive()) return; host.replaceChildren();
    if (!D.eq) return host.append(el('p', 'fx-empty', 'Index data is not available right now.'));
    let ix = pref('hm-ix', 'sp500'), period = pref('hm-per', '1D');
    const bar = el('div', 'ov-bar'), box = el('div', 'xm-box'), legend = el('div', 'xm-legend');
    const LIM = {'1D': 3, '1W': 6, '1M': 10, '6M': 20, YTD: 25, '1Y': 30};
    function draw() {
      bar.replaceChildren(PG.pageTabs([['sp500', 'S&P 500'], ['ndx', 'NASDAQ 100'], ['dow', 'DOW 30']], ix, v => { ix = v; setPref('hm-ix', v); draw(); }), PG.pageTabs(['1D', '1W', '1M', '6M', 'YTD', '1Y'].map(p => [p, p === '1D' ? 'TODAY' : p]), period, v => { period = v; setPref('hm-per', v); draw(); }));
      box.replaceChildren();
      const qs = members(ix).map(mq).filter(q => q && finite(q.cap) && q.cap > 0), lim = LIM[period];
      if (!qs.length) return box.append(el('p', 'fx-empty', 'Market values are not available right now.'));
      const W = box.clientWidth || 1200, H = Math.max(420, Math.min(900, Math.round(W * 0.56)));
      box.style.height = H + 'px';
      const bySec = new Map(); for (const q of qs) { if (!bySec.has(q.sector)) bySec.set(q.sector, []); bySec.get(q.sector).push(q); }
      for (const s of squarify([...bySec].map(([sec, list]) => ({sec, list, v: list.reduce((t, q) => t + q.cap, 0)})), 0, 0, W, H)) {
        const sec = el('div', 'xm-sec'); Object.assign(sec.style, {left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px'});
        const head = s.h > 40 && s.w > 60 ? 14 : 0; if (head) sec.append(el('span', 'xm-sech', s.sec.toUpperCase()));
        const byInd = new Map(); for (const q of s.list) { if (!byInd.has(q.industry)) byInd.set(q.industry, []); byInd.get(q.industry).push(q); }
        for (const ind of squarify([...byInd].map(([name, list]) => ({name, list, v: list.reduce((t, q) => t + q.cap, 0)})), 0, head, s.w, s.h - head)) {
          const ig = el('div', 'xm-ind'); Object.assign(ig.style, {left: ind.x + 'px', top: ind.y + 'px', width: ind.w + 'px', height: ind.h + 'px'});
          const ih = ind.h > 46 && ind.w > 70 ? 11 : 0; if (ih) ig.append(el('span', 'xm-indh', ind.name));
          for (const t of squarify(ind.list.map(q => ({q, v: q.cap})), 0, ih, ind.w, ind.h - ih)) {
            const v = ret(t.q, period), tile = btn('', 'xm-tile', () => T.setSymbol({symbol: t.q.sym, name: t.q.name}), `${t.q.sym} ${t.q.name}: ${pct(v)} · ${cap(t.q.cap)}`);
            Object.assign(tile.style, {left: t.x + 'px', top: t.y + 'px', width: t.w + 'px', height: t.h + 'px', background: heat(v, lim)});
            tile.title = `${t.q.sym} · ${t.q.name}\n${t.q.industry}\n${PERIODS[period]}: ${pct(v)} · $${cap(t.q.cap)}`;
            const fs = Math.max(0, Math.min(40, Math.sqrt(t.w * t.h) / 4.2));
            if (fs >= 7 && t.w > 22) { tile.style.fontSize = fs.toFixed(1) + 'px'; tile.append(el('b', '', t.q.sym)); if (t.h > fs * 2.4) tile.append(tk(el('span', '', pct(v)), period === '1D' ? 'eq:chg:' + t.q.sym : '', period === '1D' ? v : null)); }
            ig.append(tile);
          }
          sec.append(ig);
        }
        box.append(sec);
      }
      legend.replaceChildren(...[-lim, -lim * 2 / 3, -lim / 3, 0, lim / 3, lim * 2 / 3, lim].map(v => { const s = el('span', '', signed(v, lim >= 10 ? 0 : 1, '%')); s.style.background = heat(v, lim); return s; }));
    }
    host.append(bar, box, legend, PG.sourceNote(`Size = market value (Nasdaq screener; Nasdaq-100 list for members it lacks) · colour = ${'performance'} · S&P 500 groups use GICS sectors and sub-industries (Wikipedia list); Nasdaq-100 and Dow members outside the S&P 500 use exchange-reported sectors · delayed · click a tile to load the stock`));
    draw();
    const ro = new ResizeObserver(() => { if (!box.isConnected) return ro.disconnect(); const w = box.clientWidth; if (Math.abs(w - (box._w || 0)) > 40) { box._w = w; draw(); } }); ro.observe(box); box._w = box.clientWidth;
  });

  /* ---------- INDUSTRIES ---------- */
  PG.add('industries', 'Industries', async (host, arg, alive) => {
    PG.setHead('IND', 'Industries', 'Every GICS sub-industry in the S&P 500: market-value-weighted performance, breadth and leaders');
    host.append(el('p', 'fx-empty', 'Loading index members…'));
    await loadEq(); if (!alive()) return; host.replaceChildren();
    if (!D.eq) return host.append(el('p', 'fx-empty', 'Index data is not available right now.'));
    let sector = pref('ind-sec', ''), sort = pref('ind-sort', '1D'), dir = Number(pref('ind-dir', -1));
    const cols = ['1D', '1W', '1M', '3M', 'YTD', '1Y'], wrap = el('div');
    function rows() {
      const m = new Map();
      for (const q of members('sp500').map(mq).filter(q => q && finite(q.cap))) { const k = q.industry; if (!m.has(k)) m.set(k, {industry: k, sector: q.sector, list: []}); m.get(k).list.push(q); }
      return [...m.values()].map(g => { const capSum = g.list.reduce((t, q) => t + q.cap, 0), w = p => { let s = 0, ws = 0; for (const q of g.list) { const r = ret(q, p); if (finite(r)) { s += r * q.cap; ws += q.cap; } } return ws ? s / ws : null; };
        const today = g.list.filter(q => finite(q.chg)).sort((a, b) => b.chg - a.chg);
        return {...g, cap: capSum, n: g.list.length, up: today.filter(q => q.chg > 0).length, r: Object.fromEntries(cols.map(p => [p, w(p)])), best: today[0], worst: today.at(-1)}; });
    }
    function draw() {
      wrap.replaceChildren();
      const all = rows(), sectors = [...new Set(all.map(r => r.sector))].sort();
      wrap.append(PG.pageTabs([['', 'ALL'], ...sectors.map(s => [s, (SHORT_SECTOR[s] || s).toUpperCase()])], sector, v => { sector = v; setPref('ind-sec', v); draw(); }));
      const list = all.filter(r => !sector || r.sector === sector).sort((a, b) => { const ka = sort === 'name' ? a.industry : sort === 'cap' ? a.cap : a.r[sort] ?? -Infinity, kb = sort === 'name' ? b.industry : sort === 'cap' ? b.cap : b.r[sort] ?? -Infinity; return sort === 'name' ? dir * ka.localeCompare(kb) : dir * (ka - kb); });
      const t = el('table', 'fx-table pg-table ind-table'), h = el('tr');
      for (const [k, label] of [['name', 'INDUSTRY'], ['sector', 'SECTOR'], ['n', 'STOCKS'], ['cap', 'MKT VALUE'], ...cols.map(c => [c, c]), ['breadth', 'UP TODAY'], ['best', 'BEST TODAY'], ['worst', 'WORST TODAY']]) {
        const th = el('th', ''); if (['name', 'cap', ...cols].includes(k)) { th.append(btn(label + (sort === k ? (dir < 0 ? ' ↓' : ' ↑') : ''), 'sc-sort', () => { dir = sort === k ? -dir : k === 'name' ? 1 : -1; sort = k; setPref('ind-sort', k); setPref('ind-dir', dir); draw(); }, `Sort by ${label}`)); } else th.textContent = label; h.append(th);
      }
      t.append(h);
      for (const r of list) {
        const tr = el('tr', 'pg-click'); tr.tabIndex = 0; tr.setAttribute('role', 'button'); tr.setAttribute('aria-label', `${r.industry}: open on the overview`);
        const go = () => { setPref('ov-ix', 'sp500'); setPref('ov-sec', r.sector); setPref('ov-ind', r.industry); PG.open('overview'); };
        tr.addEventListener('click', go); tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        tr.append(el('th', '', r.industry), el('td', 'pg-name', r.sector), el('td', 'fx-num', String(r.n)), el('td', 'fx-num', '$' + cap(r.cap)), ...cols.map(c => { const td = el('td', 'fx-num ' + tone(r.r[c]), pct(r.r[c])); td.style.background = finite(r.r[c]) ? heat(r.r[c], {'1D': 3, '1W': 6, '1M': 10, '3M': 15, YTD: 25, '1Y': 30}[c]).replace('rgb', 'rgba').replace(')', ',.28)') : ''; return td; }),
          el('td', 'fx-num', `${r.up}/${r.n}`), el('td', 'fx-up', r.best ? `${r.best.sym} ${pct(r.best.chg, 1)}` : '—'), el('td', 'fx-down', r.worst && r.worst !== r.best ? `${r.worst.sym} ${pct(r.worst.chg, 1)}` : '—'));
        t.append(tr);
      }
      const sc = el('div', 'pg-scroll'); sc.append(t); wrap.append(el('p', 'pg-note', `${list.length} sub-industries · returns weighted by market value · click a row to see its companies`), sc);
    }
    host.append(wrap, PG.sourceNote(`GICS sub-industries from Wikipedia's S&P 500 list · market values from the Nasdaq screener · prices from the Nasdaq screener and Yahoo Finance closes (delayed)`));
    draw();
  });
  T.PAGE_NAMES.push('OVERVIEW', 'HMAP', 'INDUSTRIES');
});
