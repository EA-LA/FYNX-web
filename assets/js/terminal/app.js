/* FYNX Terminal. Every panel renders attributed live data; anything clickable opens a chart, a detail view or its source.
 * External text is inserted with textContent only. Nothing is estimated in the browser except clearly labeled calculations. */
(() => {
  'use strict';
  const M = window.FynxMacroModel;
  if (!M) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const FN = name => local ? (name === 'webResearchData' ? '/api/research' : '/api/' + name) : 'https://us-central1-fynx-c7a28.cloudfunctions.net/' + name;
  const RESEARCH = ['https://raw.githubusercontent.com/EA-LA/FYNX-web/research-data/assets/data/research/', '/assets/data/research/'];
  const DESK_URL = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/macro-data/desk.json';
  const CATALOG = [
    ['AAPL', 'Apple', 'Stocks'], ['MSFT', 'Microsoft', 'Stocks'], ['NVDA', 'NVIDIA', 'Stocks'], ['AMZN', 'Amazon', 'Stocks'], ['GOOGL', 'Alphabet', 'Stocks'], ['META', 'Meta', 'Stocks'], ['TSLA', 'Tesla', 'Stocks'], ['JPM', 'JPMorgan', 'Stocks'], ['V', 'Visa', 'Stocks'], ['WMT', 'Walmart', 'Stocks'],
    ['XOM', 'Exxon Mobil', 'Stocks'], ['JNJ', 'Johnson & Johnson', 'Stocks'], ['BRK-B', 'Berkshire Hathaway', 'Stocks'], ['AVGO', 'Broadcom', 'Stocks'], ['COST', 'Costco', 'Stocks'], ['NFLX', 'Netflix', 'Stocks'], ['AMD', 'AMD', 'Stocks'], ['DIS', 'Disney', 'Stocks'], ['KO', 'Coca-Cola', 'Stocks'], ['BAC', 'Bank of America', 'Stocks'],
    ['SPY', 'S&P 500 ETF', 'ETFs'], ['QQQ', 'Nasdaq 100 ETF', 'ETFs'], ['IWM', 'Russell 2000 ETF', 'ETFs'], ['DIA', 'Dow Jones ETF', 'ETFs'], ['VTI', 'US total market ETF', 'ETFs'], ['TLT', 'Long Treasury ETF', 'ETFs'], ['GLD', 'Gold ETF', 'ETFs'], ['XLF', 'Financials ETF', 'ETFs'], ['XLK', 'Technology ETF', 'ETFs'], ['XLE', 'Energy ETF', 'ETFs'],
    ['BTC-USD', 'Bitcoin', 'Crypto'], ['ETH-USD', 'Ethereum', 'Crypto'], ['SOL-USD', 'Solana', 'Crypto'], ['LTC-USD', 'Litecoin', 'Crypto'],
    ['EURUSD=X', 'EUR/USD', 'FX'], ['GBPUSD=X', 'GBP/USD', 'FX'], ['JPY=X', 'USD/JPY', 'FX'], ['AUDUSD=X', 'AUD/USD', 'FX'], ['CAD=X', 'USD/CAD', 'FX'], ['CHF=X', 'USD/CHF', 'FX']
  ].map(([symbol, name, group]) => ({symbol, name, group}));
  const FX_TO_EDGE = {'EURUSD=X': 'EURUSD', 'GBPUSD=X': 'GBPUSD', 'JPY=X': 'USDJPY', 'AUDUSD=X': 'AUDUSD', 'CAD=X': 'USDCAD', 'CHF=X': 'USDCHF'};
  const EDGE_TO_FX = Object.fromEntries(Object.entries(FX_TO_EDGE).map(([a, b]) => [b, a]));
  const EDGE = {EURUSD: ['EUR/USD', 0.0001, 5], GBPUSD: ['GBP/USD', 0.0001, 5], USDJPY: ['USD/JPY', 0.01, 3], AUDUSD: ['AUD/USD', 0.0001, 5], USDCAD: ['USD/CAD', 0.0001, 5], USDCHF: ['USD/CHF', 0.0001, 5], NZDUSD: ['NZD/USD', 0.0001, 5],
    XAUUSD: ['Gold', 0.1, 2], XAGUSD: ['Silver', 0.01, 3], EURJPY: ['EUR/JPY', 0.01, 3], GBPJPY: ['GBP/JPY', 0.01, 3], EURGBP: ['EUR/GBP', 0.0001, 5], US30: ['US 30', 1, 1], NAS100: ['US Tech 100', 1, 1], SPX500: ['US 500', 0.1, 2], BTCUSD: ['Bitcoin (CFD)', 1, 2], ETHUSD: ['Ethereum (CFD)', 0.1, 2]};
  const ALIASES = {GOLD: 'XAUUSD', XAU: 'XAUUSD', SILVER: 'XAGUSD', BTC: 'BTC-USD', BITCOIN: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', LTC: 'LTC-USD', SPX: 'SPX500', NDX: 'NAS100', DOW: 'US30', BRK: 'BRK-B', BRKB: 'BRK-B'};
  const TICKER = ['SPY', 'QQQ', 'DIA', 'IWM', 'TLT', 'GLD', 'BTC-USD', 'ETH-USD', 'EURUSD=X', 'GBPUSD=X', 'JPY=X', 'AAPL', 'NVDA', 'MSFT'];
  const DESKS = [['forex', 'FX'], ['macro', 'Macro'], ['stocks', 'Stocks'], ['crypto', 'Crypto'], ['commodities', 'Cmdty'], ['energy', 'Energy'], ['technology', 'Tech'], ['politics', 'Policy'], ['world', 'World']];
  const KEYS = [['F1', 'Home', '/home.html'], ['F2', 'News', '/news.html'], ['F3', 'Markets', '/markets/'], ['F4', 'Macro Desk', '/macro-desk.html'], ['F5', 'Edge Radar', '/edge-radar/'], ['F6', 'Quant', '/quant-analyst.html'], ['F7', 'Research', '/tools/research-desk.html'], ['F8', 'Journal', '/journal.html'], ['F9', 'Calculator', '/calculator.html'], ['F10', 'Calendar', '/calendar.html'], ['F11', 'Learn', '/learn.html'], ['F12', 'Profile', '/profile.html']];
  const SESSIONS = [['SYD', 'Sydney', 'Australia/Sydney', 7, 16], ['TKY', 'Tokyo', 'Asia/Tokyo', 9, 18], ['LDN', 'London', 'Europe/London', 8, 17], ['NY', 'New York', 'America/New_York', 8, 17]];

  const S = {quotes: {}, quotesAt: null, prev: {}, desk: null, edge: null, calendar: null, schedule: null, briefing: [], desks: {}, vix: null, corr: {}, books: {}, history: {}, bars: {}, fin: {}, directory: null, journal: window.FynxTerminalJournal || {status: 'loading'},
    mktTab: 'All', mktSort: null, focus: 'SPY', range: 126, finTicker: 'AAPL', deskTab: 'forex', curve: 'US', ecoHigh: false, corrWindow: 60, tool: 'calc', feeds: {}, paused: false};
  const $ = id => document.getElementById(id);
  const finite = v => typeof v === 'number' && Number.isFinite(v);

  /* --- utilities --------------------------------------------------------- */
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined && text !== null) n.textContent = String(text); return n; }
  function safeHref(href) { try { const u = new URL(href, location.href); return ['https:', 'http:'].includes(u.protocol) ? u : null; } catch { return null; } }
  function link(text, href, cls) { const u = safeHref(href); if (!u) return el('span', cls, text); const a = el('a', cls, text); a.href = u.href; if (u.origin !== location.origin) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } return a; }
  function btn(text, cls, onClick, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', onClick); return b; }
  const signed = (v, d = 2, u = '') => finite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}${u}` : '—';
  const tone = v => !finite(v) || Math.abs(v) < 1e-9 ? 'fx-flat' : v > 0 ? 'fx-up' : 'fx-down';
  const ago = iso => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return !Number.isFinite(m) ? '' : m < 1 ? 'now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; };
  const hhmm = iso => new Date(iso).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  const day = iso => new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
  const fmt = (v, d) => finite(v) ? v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}) : '—';
  const big = v => !finite(v) ? '—' : Math.abs(v) >= 1e12 ? '$' + (v / 1e12).toFixed(2) + 'T' : Math.abs(v) >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : '$' + v.toFixed(2);
  const report = (op, e) => { try { window.FynxMonitor?.report('feed', 'terminal-' + op, e); } catch {} };
  const feed = (name, ok) => { S.feeds[name] = ok; renderLive(); };
  async function getJSON(url, {timeout = 25000, bust = false} = {}) {
    const target = bust ? url + (url.includes('?') ? '&' : '?') + 't=' + Math.floor(Date.now() / 120000) : url;
    const r = await fetch(target, {signal: AbortSignal.timeout(timeout), credentials: 'omit', referrerPolicy: 'no-referrer', headers: {Accept: 'application/json'}});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const t = await r.text(); if (t.length > 1.2e7) throw new Error('Too large');
    return JSON.parse(t);
  }
  async function research(path, check) {
    for (const base of RESEARCH) { try { const d = await getJSON(base + path, {bust: base.startsWith('https:')}); if (check(d)) return d; } catch (e) { report(path, e); } }
    return null;
  }
  function panel(id) { const b = $('b-' + id); b.replaceChildren(); return b; }
  function tabs(hostId, items, current, onPick) {
    const host = $(hostId); host.replaceChildren();
    for (const [value, label] of items) { const b = btn(label, value === current ? 'on' : '', () => onPick(value)); b.setAttribute('aria-pressed', String(value === current)); host.append(b); }
  }
  function rowButton(cls, onClick, label) { const r = el('button', 'fx-row ' + (cls || '')); r.type = 'button'; if (label) r.setAttribute('aria-label', label); r.addEventListener('click', onClick); return r; }
  const empty = (host, text) => host.append(el('p', 'fx-empty', text));
  const nameOf = id => EDGE[id]?.[0] || CATALOG.find(c => c.symbol === id)?.name || id;
  const shortOf = id => ({'EURUSD=X': 'EURUSD', 'GBPUSD=X': 'GBPUSD', 'JPY=X': 'USDJPY', 'AUDUSD=X': 'AUDUSD', 'CAD=X': 'USDCAD', 'CHF=X': 'USDCHF', 'BTC-USD': 'BTC', 'ETH-USD': 'ETH', 'SOL-USD': 'SOL', 'LTC-USD': 'LTC'})[id] || id;
  const digitsOf = id => EDGE[id]?.[2] ?? (FX_TO_EDGE[id] ? EDGE[FX_TO_EDGE[id]][2] : 2);
  const quoteFor = id => S.quotes[id] || S.quotes[EDGE_TO_FX[id]] || null;

  /* --- inspector ---------------------------------------------------------- */
  function inspect(title, build) {
    const box = $('fx-inspect'), body = $('fx-inspect-body');
    $('fx-inspect-title').textContent = title; body.replaceChildren(); build(body); box.hidden = false; $('fx-inspect-close').focus();
  }
  const kv = (host, rows) => { const dl = el('dl', 'fx-kv'); for (const [k, v] of rows) { if (v === undefined || v === null || v === '') continue; dl.append(el('dt', '', k), typeof v === 'object' ? (() => { const dd = el('dd'); dd.append(v); return dd; })() : el('dd', '', v)); } host.append(dl); };
  $('fx-inspect-close').addEventListener('click', () => { $('fx-inspect').hidden = true; });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('fx-inspect').hidden) { $('fx-inspect').hidden = true; return; }
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); $('fx-command').focus(); }
  });

  /* --- loaders ------------------------------------------------------------ */
  async function loadQuotes() {
    try {
      const d = await getJSON(FN('webResearchData') + '?action=quotes&symbols=' + encodeURIComponent(CATALOG.map(c => c.symbol).join(',')));
      const next = {};
      for (const c of CATALOG) { const q = d?.quotes?.[c.symbol]; if (q && finite(q.price) && q.price > 0) next[c.symbol] = {price: q.price, changePercent: finite(q.changePercent) ? q.changePercent : null, asOf: q.asOf, source: q.source || 'Yahoo Finance', delayed: q.delayed !== false}; }
      if (!Object.keys(next).length) throw new Error('No quotes');
      S.prev = Object.fromEntries(Object.entries(S.quotes).map(([k, v]) => [k, v.price])); S.quotes = next; S.quotesAt = d.fetchedAt || new Date().toISOString(); feed('quotes', true);
    } catch (e) { report('quotes', e); feed('quotes', false); }
  }
  async function loadDesk() { try { S.desk = M.validateDesk(await getJSON(DESK_URL, {bust: true})); feed('rates', true); } catch (e) { report('desk', e); feed('rates', false); } }
  async function loadEdge() { const d = await research('edge.json', d => Array.isArray(d?.markets)); if (d) S.edge = d; feed('edge', Boolean(S.edge)); }
  async function loadCalendar() { const d = await research('calendar.json', d => Array.isArray(d?.events)); if (d) S.calendar = d; feed('calendar', Boolean(S.calendar)); }
  async function loadSchedule() { if (!S.schedule) try { S.schedule = await getJSON('/assets/data/macro/central-banks.json'); } catch (e) { report('schedule', e); } }
  async function loadBriefing(force = false) { try { const r = await window.FynxTerminalData?.loadBriefing?.({force}); if (r?.items?.length) { S.briefing = r.items.slice(0, 60); feed('news', true); } else feed('news', false); } catch (e) { report('news', e); feed('news', false); } }
  async function loadDesk_(cat, force = false) {
    const D = window.FYNXMarketIntelligenceData; if (!D) return;
    try { const r = await D.loadHeadlines(cat, {force, timeoutMs: 6500}); S.desks[cat] = {items: (r.items || []).slice(0, 40), fetchedAt: r.fetchedAt, status: r.status}; } catch (e) { report('desk-' + cat, e); }
  }
  async function loadVix() { try { S.vix = await getJSON(FN('webMarketAnalytics') + '?kind=vix'); feed('vix', true); } catch (e) { report('vix', e); feed('vix', false); } }
  async function loadCorr(w = S.corrWindow) { try { S.corr[w] = await getJSON(FN('webMarketAnalytics') + '?kind=correlation&window=' + w); } catch (e) { report('corr', e); } }
  async function loadBooks() {
    for (const p of ['BTC-USD', 'ETH-USD']) { try { S.books[p] = await getJSON(FN('webMarketAnalytics') + '?kind=liquidity&product=' + p, {timeout: 15000}); } catch (e) { report('book', e); } }
  }
  async function loadSeries(id) {
    if (EDGE[id]) { if (!S.bars[id]) { const d = await research(`bars/${id}-D1.json`, d => d?.symbol === id && Array.isArray(d.bars)); if (d) S.bars[id] = {source: d.source || 'Dukascopy', rows: d.bars.filter(b => ![0, 6].includes(new Date(b.time).getUTCDay()) || /BTC|ETH/.test(id)).map(b => ({date: b.time.slice(0, 10), open: b.open, high: b.high, low: b.low, close: b.close}))}; } return S.bars[id] || null; }
    if (!S.history[id]) { try { const d = await getJSON(FN('webResearchData') + '?action=history&symbol=' + encodeURIComponent(id), {timeout: 30000}); if (Array.isArray(d?.bars)) S.history[id] = {source: d.source || 'Yahoo Finance', rows: d.bars}; } catch (e) { report('history', e); } }
    return S.history[id] || null;
  }
  async function loadFin(ticker) {
    if (S.fin[ticker]) return S.fin[ticker];
    try {
      if (!S.directory) { const d = await getJSON(FN('webResearchData') + '?action=directory', {timeout: 30000}); S.directory = d.companies || []; }
      const symbol = ticker.replace('-', '.'), company = S.directory.find(c => c.symbol === ticker || c.symbol === symbol);
      if (!company) return null;
      S.fin[ticker] = await getJSON(FN('webResearchData') + '?action=financials&cik=' + company.cik, {timeout: 30000});
      return S.fin[ticker];
    } catch (e) { report('fin', e); return null; }
  }

  /* --- header: clocks, live, quotes strip, news ticker ---------------------- */
  function sessionState([code, name, tz, open, close], now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit'}).formatToParts(now).map(p => [p.type, p.value]));
    const h = Number(parts.hour) + Number(parts.minute) / 60, weekend = ['Sat', 'Sun'].includes(parts.weekday);
    return {code, name, time: `${parts.hour}:${parts.minute}`, open: !weekend && h >= open && h < close, weekday: parts.weekday};
  }
  function renderClocks() {
    const host = $('fx-clocks'); host.replaceChildren();
    for (const s of SESSIONS) { const st = sessionState(s), span = el('span', 'fx-clock'); span.append(el('b', '', st.code), el('span', '', st.time), el('em', st.open ? 'fx-up' : 'fx-dim', st.open ? 'OPEN' : 'CLOSED')); span.title = `${st.name} session ${st.open ? 'open' : 'closed'} (local ${st.time})`; host.append(span); }
  }
  function renderLive() {
    const ok = Object.values(S.feeds).filter(Boolean).length, total = Object.keys(S.feeds).length, live = $('fx-live');
    live.lastChild.textContent = total ? `LIVE · ${ok}/${total} FEEDS` : 'CONNECTING';
    live.className = 'fx-live' + (total && ok < total ? ' fx-warn' : '');
    live.title = Object.entries(S.feeds).map(([k, v]) => `${k}: ${v ? 'ok' : 'unavailable'}`).join(' · ');
  }
  function renderStrip() {
    const host = $('fx-quotes'); host.replaceChildren();
    const ten = S.desk?.liveUS?.quotes?.find(q => q.tenor === '10Y');
    if (ten) { const b = btn('', 'fx-q', () => setCurve('US')); b.append(el('b', '', 'US10Y'), el('span', '', ten.price.toFixed(3) + '%'), el('em', tone(ten.price - ten.previousClose), signed((ten.price - ten.previousClose) * 100, 1, 'bp'))); host.append(b); }
    for (const id of TICKER) {
      const q = S.quotes[id]; if (!q) continue;
      const b = btn('', 'fx-q', () => focusOn(id), `${nameOf(id)} ${q.price}`); b.append(el('b', '', shortOf(id)), el('span', '', fmt(q.price, digitsOf(id))), el('em', tone(q.changePercent), (q.changePercent >= 0 ? '▲ ' : '▼ ') + signed(Math.abs(q.changePercent ?? 0), 2, '%').replace(/^[+−]/, '')));
      host.append(b);
    }
    if (S.quotesAt) host.append(el('span', 'fx-dim', `Delayed quotes · ${hhmm(S.quotesAt)}`));
  }
  function renderNews() {
    const track = $('fx-news-track'); track.replaceChildren();
    const items = S.briefing.slice(0, 18);
    if (!items.length) { track.append(el('span', 'fx-dim', 'Headlines are temporarily unavailable.')); track.classList.remove('run'); return; }
    for (const copy of [0, 1]) for (const h of items) { const a = link('', h.readerUrl || h.url, 'fx-hl'); if (copy) { a.tabIndex = -1; a.setAttribute('aria-hidden', 'true'); } a.append(el('time', '', hhmm(h.publishedAt)), el('strong', '', h.title), el('span', '', h.source)); track.append(a); }
    track.style.setProperty('--dur', Math.max(60, items.length * 8) + 's'); track.classList.add('run');
  }

  /* --- MKTS & HEAT ---------------------------------------------------------- */
  function renderMkts() {
    tabs('mkts-tabs', [['All', 'All'], ['Stocks', 'EQ'], ['ETFs', 'ETF'], ['Crypto', 'CRY'], ['FX', 'FX']], S.mktTab, v => { S.mktTab = v; renderMkts(); });
    const host = panel('mkts');
    let list = CATALOG.filter(c => S.mktTab === 'All' || c.group === S.mktTab);
    if (S.mktSort) list = [...list].sort((a, b) => (S.quotes[b.symbol]?.changePercent ?? -999) * S.mktSort - (S.quotes[a.symbol]?.changePercent ?? -999) * S.mktSort);
    const head = el('div', 'fx-th'); head.append(el('span', '', 'SYMBOL'), el('span', '', 'LAST'), btn(S.mktSort === 1 ? 'CHG ▼' : S.mktSort === -1 ? 'CHG ▲' : 'CHG ↕', 'fx-sort', () => { S.mktSort = S.mktSort === 1 ? -1 : S.mktSort === -1 ? null : 1; renderMkts(); }, 'Sort by change')); host.append(head);
    for (const c of list) {
      const q = S.quotes[c.symbol], r = rowButton('fx-r3' + (S.focus === c.symbol || S.focus === FX_TO_EDGE[c.symbol] ? ' sel' : ''), () => focusOn(c.symbol), `Chart ${c.name}`);
      const flash = q && finite(S.prev[c.symbol]) && S.prev[c.symbol] !== q.price ? (q.price > S.prev[c.symbol] ? ' fx-flash-up' : ' fx-flash-dn') : '';
      const n = el('span', 'fx-sym'); n.append(el('b', '', shortOf(c.symbol)), el('small', '', c.name));
      r.append(n, el('span', 'fx-num' + flash, q ? fmt(q.price, digitsOf(c.symbol)) : '—'), el('span', 'fx-num ' + tone(q?.changePercent), q ? signed(q.changePercent, 2, '%') : '—'));
      host.append(r);
    }
  }
  function renderHeat() {
    const host = panel('heat'), list = CATALOG.filter(c => ['Stocks', 'ETFs', 'Crypto'].includes(c.group) && S.quotes[c.symbol]);
    if (!list.length) return empty(host, 'Waiting for quotes…');
    const up = list.filter(c => S.quotes[c.symbol].changePercent > 0).length;
    $('n-heat').textContent = `${up} up · ${list.length - up} down`;
    const grid = el('div', 'fx-heat');
    for (const c of list) {
      const v = S.quotes[c.symbol].changePercent ?? 0, a = Math.min(1, Math.abs(v) / 3);
      const t = btn('', 'fx-tile', () => focusOn(c.symbol), `${c.name} ${signed(v, 2, '%')}`);
      t.style.background = v >= 0 ? `rgba(46,160,90,${0.15 + a * 0.75})` : `rgba(214,69,58,${0.15 + a * 0.75})`;
      t.append(el('b', '', shortOf(c.symbol)), el('span', '', signed(v, 2, '%'))); grid.append(t);
    }
    host.append(grid);
  }

  /* --- FOCUS chart ---------------------------------------------------------- */
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };
  function resolve(input) {
    const raw = String(input || '').trim().toUpperCase().replace(/\s+/g, '').replace('/', '');
    if (!raw) return null;
    if (ALIASES[raw]) return ALIASES[raw];
    if (EDGE[raw]) return raw;
    const c = CATALOG.find(x => x.symbol === raw || shortOf(x.symbol) === raw);
    if (c) return FX_TO_EDGE[c.symbol] || c.symbol;
    return null;
  }
  async function focusOn(input) {
    const id = resolve(input) || input; S.focus = FX_TO_EDGE[id] || id;
    if (CATALOG.find(c => c.symbol === S.focus && c.group === 'Stocks')) { S.finTicker = S.focus; renderFin(); }
    renderMkts(); renderFocus(); if (window.innerWidth < 1100) $('tp-focus').scrollIntoView({behavior: 'smooth', block: 'start'});
    await loadSeries(S.focus); renderFocus();
  }
  function renderFocus() {
    const id = S.focus, series = (EDGE[id] ? S.bars[id] : S.history[id]), digits = digitsOf(id);
    $('focus-title').textContent = `${shortOf(id)} · ${nameOf(id)}`;
    tabs('focus-ranges', [[21, '1M'], [63, '3M'], [126, '6M'], [252, '1Y'], [504, '2Y']], S.range, v => { S.range = v; renderFocus(); });
    const host = panel('focus');
    if (!series?.rows?.length) return empty(host, 'Loading daily history…');
    const rows = series.rows.slice(-S.range), closes = rows.map(r => r.close), q = quoteFor(id);
    const last = q?.price ?? closes.at(-1), first = closes[0], hi = Math.max(...rows.map(r => r.high ?? r.close)), lo = Math.min(...rows.map(r => r.low ?? r.close));
    const yr = series.rows.slice(-252), hi52 = Math.max(...yr.map(r => r.high ?? r.close)), lo52 = Math.min(...yr.map(r => r.low ?? r.close));
    const stats = el('div', 'fx-stats');
    const stat = (k, v, cls) => { const s = el('div'); s.append(el('span', '', k), el('b', cls || '', v)); stats.append(s); };
    stat('LAST', fmt(last, digits)); stat('DAY', q ? signed(q.changePercent, 2, '%') : '—', tone(q?.changePercent)); stat('PERIOD', signed((last / first - 1) * 100, 2, '%'), tone(last - first));
    stat('RANGE HI', fmt(hi, digits)); stat('RANGE LO', fmt(lo, digits)); stat('52W HI', fmt(hi52, digits)); stat('52W LO', fmt(lo52, digits));
    host.append(stats);
    const W = 640, H = 230, L = 6, R = 58, T = 10, B = 22;
    const min = Math.min(...closes, last), max = Math.max(...closes, last), pad = (max - min) * 0.08 || 1;
    const x = i => L + i * (W - L - R) / Math.max(1, rows.length - 1), y = v => T + (max + pad - v) / (max - min + 2 * pad) * (H - T - B);
    const chart = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart', role: 'img', 'aria-label': `${nameOf(id)} daily closes over ${rows.length} sessions, from ${fmt(first, digits)} to ${fmt(closes.at(-1), digits)}`});
    for (let k = 0; k <= 4; k++) { const v = min - pad + (max - min + 2 * pad) * k / 4; chart.append(svg('line', {x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'g'})); const t = svg('text', {x: W - R + 6, y: y(v) + 4, class: 'a'}); t.textContent = fmt(v, digits); chart.append(t); }
    const pts = closes.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '), upTrend = last >= first;
    chart.append(svg('polygon', {points: `${L},${H - B} ${pts} ${x(rows.length - 1)},${H - B}`, class: upTrend ? 'fa-up' : 'fa-dn'}), svg('polyline', {points: pts, class: upTrend ? 'ln-up' : 'ln-dn', fill: 'none'}));
    [0, Math.floor(rows.length / 2), rows.length - 1].forEach((i, k) => { const t = svg('text', {x: x(i), y: H - 6, class: 'a', 'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}); t.textContent = day(rows[i].date); chart.append(t); });
    const cross = svg('line', {class: 'cx', y1: T, y2: H - B, x1: -10, x2: -10}), dot = svg('circle', {r: 3.5, class: 'cd', cx: -10, cy: -10}); chart.append(cross, dot);
    const read = el('p', 'fx-readout', `Hover the chart for values · ${series.source} daily ${EDGE[id] ? 'bid candles' : 'adjusted closes'}`);
    chart.addEventListener('pointermove', e => {
      const box = chart.getBoundingClientRect(), px = (e.clientX - box.left) / box.width * W, i = Math.max(0, Math.min(rows.length - 1, Math.round((px - L) / (W - L - R) * (rows.length - 1))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(closes[i]));
      const r = rows[i]; read.textContent = `${r.date} · O ${fmt(r.open, digits)} H ${fmt(r.high, digits)} L ${fmt(r.low, digits)} C ${fmt(r.close, digits)} · ${signed((r.close / first - 1) * 100, 2, '%')} vs start`;
    });
    host.append(chart, read);
    const extra = el('div', 'fx-focus-extra'), edgeM = S.edge?.markets?.find(m => m.symbol === id);
    if (edgeM) {
      const pair = M.PAIRS.find(p => p.id === id) || {id, base: null, quote: null};
      const b = M.smartBias(pair, {desk: S.desk, edgeMarket: edgeM, livePrice: q?.price});
      const tag = el('div', 'fx-chips');
      tag.append(el('span', 'fx-chip', `Regime ${edgeM.state?.regime?.value || '—'}`), el('span', 'fx-chip', `Vol ${M.ordinal(Math.round(edgeM.state?.volatilityPercentile?.value ?? 0))} pct`), el('span', 'fx-chip ' + tone(edgeM.positioning?.net?.value), `COT ${signed((edgeM.positioning?.net?.value ?? 0) * 100, 0, '%')}${edgeM.positioning?.crowded?.value ? ' crowded' : ''}`));
      if (finite(b.score)) tag.append(el('span', 'fx-chip ' + (b.score >= 15 ? 'fx-up' : b.score <= -15 ? 'fx-down' : ''), `Bias ${b.label} ${b.score > 0 ? '+' : ''}${b.score}`));
      tag.append(link('Edge Radar ↗', `/edge-radar/${id.toLowerCase()}/`, 'fx-chip fx-chip-link'), link('Backtest ↗', `/quant-analyst.html?symbol=${id}`, 'fx-chip fx-chip-link'));
      extra.append(tag);
    } else {
      const tag = el('div', 'fx-chips'); tag.append(link('Research Desk ↗', '/tools/research-desk.html', 'fx-chip fx-chip-link'), link('Price alerts ↗', '/tools/price-alerts.html', 'fx-chip fx-chip-link'));
      if (CATALOG.find(c => c.symbol === id && c.group === 'Stocks')) tag.prepend(btn('Financials below', 'fx-chip fx-chip-link', () => $('tp-fin').scrollIntoView({behavior: 'smooth'})));
      extra.append(tag);
    }
    host.append(extra);
  }

  /* --- FIN ------------------------------------------------------------------ */
  async function renderFin() {
    const t = S.finTicker; $('fin-title').textContent = `${t} · annual SEC filings`;
    const host = panel('fin'); empty(host, 'Loading SEC filings…');
    const f = await loadFin(t); if (t !== S.finTicker) return;
    host.replaceChildren();
    if (!f?.periods?.length) return empty(host, 'Financial statements are not available from SEC EDGAR for this company right now.');
    $('fin-link').href = `/tools/company-financials.html?cik=${f.cik}`;
    const periods = f.periods.slice(0, 4), rows = [['revenue', 'Revenue'], ['income', 'Net income'], ['eps', 'Diluted EPS'], ['operatingCash', 'Operating cash'], ['capex', 'Capex'], ['cash', 'Cash'], ['assets', 'Assets'], ['liabilities', 'Liabilities'], ['equity', 'Equity'], ['longTermDebt', 'LT debt']];
    host.append(el('p', 'fx-sub', `${f.name} · CIK ${f.cik}`));
    const table = el('table', 'fx-table'), thead = el('tr'); thead.append(el('th', '', 'FY END')); periods.forEach(p => thead.append(el('th', '', p.slice(0, 7)))); table.append(thead);
    for (const [id, label] of rows) {
      if (!periods.some(p => f.annual[p]?.[id])) continue;
      const tr = el('tr'); tr.append(el('th', '', label));
      periods.forEach(p => { const fact = f.annual[p]?.[id], td = el('td', 'fx-num'); if (fact) { const a = btn(id === 'eps' ? '$' + fact.value.toFixed(2) : big(fact.value), 'fx-cell', () => inspect(`${t} ${label} · FY ${p}`, h => kv(h, [['Value', id === 'eps' ? '$' + fact.value : '$' + fact.value.toLocaleString('en-US')], ['Period', `${fact.start || ''} → ${fact.end}`], ['Filed', fact.filed], ['XBRL tag', fact.tag], ['Filing', link('Open on SEC ↗', `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${f.cik}&type=10-K`)]]))); td.append(a); } else td.textContent = '—'; tr.append(td); });
      table.append(tr);
    }
    const p0 = f.annual[periods[0]];
    if (p0?.revenue && p0?.income) { const tr = el('tr'); tr.append(el('th', '', 'Net margin')); periods.forEach(p => { const a = f.annual[p]; tr.append(el('td', 'fx-num', a?.revenue && a?.income ? (a.income.value / a.revenue.value * 100).toFixed(1) + '%' : '—')); }); table.append(tr); }
    host.append(table, el('p', 'fx-foot', 'Annual 10-K facts from SEC EDGAR · click a value for its filing.'));
  }

  /* --- STORY, TOP, DESKS ---------------------------------------------------- */
  function renderStory() {
    const host = panel('story'), rows = M.PAIRS.map(p => M.smartBias(p, {desk: S.desk, edgeMarket: S.edge?.markets?.find(m => m.symbol === p.id), livePrice: quoteFor(p.id)?.price}));
    const s = M.composeStory({desk: S.desk, banks: S.schedule?.banks || [], headlines: S.briefing, bias: rows});
    $('story-time').textContent = 'Today · ' + new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
    if (!s.available) return empty(host, 'Waiting for rate data…');
    host.append(el('h3', 'fx-h3', s.title), el('p', 'fx-story', s.lines.join(' ')));
    const facts = el('div', 'fx-facts');
    for (const f of s.facts) { const b = btn('', 'fx-fact', () => f.label === 'US 10-year' ? setCurve('US') : f.label === 'Next decision' ? inspectBank(S.schedule.banks.find(x => x.short === f.value)) : focusOn(f.value), f.label); b.append(el('span', '', f.label), el('b', '', f.value), el('small', '', f.note)); facts.append(b); }
    host.append(facts);
  }
  function headlineRow(h) {
    const a = link('', h.readerUrl || h.url, 'fx-row fx-hrow'); a.append(el('time', '', hhmm(h.publishedAt)), el('span', 'fx-ht', h.title), el('small', '', `${h.source}${h.kind === 'official-release' ? ' · OFFICIAL' : ''}`)); return a;
  }
  function renderTop() { const host = panel('top'); if (!S.briefing.length) return empty(host, 'Loading headlines…'); S.briefing.slice(0, 40).forEach(h => host.append(headlineRow(h))); }
  async function renderDesks(load = false) {
    tabs('desk-tabs', DESKS, S.deskTab, v => { S.deskTab = v; renderDesks(true); });
    const host = panel('desks'), cat = S.deskTab;
    if (load || !S.desks[cat]) { empty(host, 'Loading desk…'); await loadDesk_(cat); if (cat !== S.deskTab) return; host.replaceChildren(); }
    const d = S.desks[cat];
    if (!d?.items?.length) return empty(host, 'No current stories for this desk. Try another desk.');
    d.items.forEach(h => host.append(headlineRow(h)));
  }

  /* --- CB, CURVE, RISK ------------------------------------------------------ */
  function inspectBank(bank) {
    if (!bank) return;
    const rate = M.policyRate(bank.currency, S.desk), next = M.nextDecision(bank), odds = bank.area === 'US' ? S.desk?.fed?.odds : null;
    inspect(bank.name, h => {
      kv(h, [['Policy rate', rate ? `${rate.display} (${rate.source}, ${rate.observationDate})` : 'Unavailable'], ['Instrument', bank.instrument], ['Next decision', next ? (next.at ? new Date(next.at).toLocaleString() : next.date) : '—'], ['Countdown', next?.at ? M.countdown(next.at - Date.now()) : next ? next.daysAway + ' days' : ''],
        ['Following', (bank.decisions || []).filter(d => d > (next?.date || '')).slice(0, 3).map(day).join(' · ')],
        ['Futures pricing', odds ? `${[['cut50', 'Cut 50 bp'], ['cut', 'Cut 25 bp'], ['hold', 'No change'], ['hike', 'Hike 25 bp'], ['hike50', 'Hike 50 bp']].filter(([k]) => odds[k] > 0).map(([k, l]) => `${l} ${Math.round(odds[k])}%`).join(' · ')} (implied ${signed(odds.expectedChangeBp, 0, ' bp')}, CBOT Fed funds futures)` : 'No free public futures feed for this bank'],
        ['Calendar', link('Official calendar ↗', bank.calendarURL)]]);
      const ev = (S.desk?.events?.events || []).filter(e => e.currency === bank.currency);
      if (ev.length) { h.append(el('h3', 'fx-h4', 'This week')); ev.forEach(e => h.append(el('p', 'fx-sub', `${new Date(e.time).toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit'})} · ${e.title}`))); }
    });
  }
  function renderCB() {
    const host = panel('cb'), banks = S.schedule?.banks || [];
    if (!banks.length) return empty(host, 'Loading central banks…');
    const head = el('div', 'fx-th fx-c4'); head.append(el('span', '', 'BANK'), el('span', '', 'RATE'), el('span', '', 'NEXT'), el('span', '', 'IN')); host.append(head);
    for (const b of banks) {
      const rate = M.policyRate(b.currency, S.desk), next = M.nextDecision(b), r = rowButton('fx-c4', () => inspectBank(b), `${b.name} details`);
      const stale = rate && M.lastDecisionBefore(b) > rate.observationDate;
      r.append(el('b', '', b.short.toUpperCase()), el('span', 'fx-num' + (stale ? ' fx-warn' : ''), rate ? rate.display + (stale ? '*' : '') : '—'), el('span', '', next ? day(next.date) : '—'), el('span', 'fx-num fx-up', next ? (next.at ? M.countdown(next.at - Date.now()) : next.daysAway + 'd') : ''));
      host.append(r);
    }
    const odds = S.desk?.fed?.odds;
    if (odds) {
      const box = btn('', 'fx-odds', () => inspectBank(banks.find(b => b.area === 'US')), 'Fed futures odds');
      const bar = el('span', 'fx-oddsbar'); for (const [k, c] of [['cut50', 'c2'], ['cut', 'c1'], ['hold', 'h'], ['hike', 'k1'], ['hike50', 'k2']]) if (odds[k] > 0) { const s = el('i', c); s.style.width = odds[k] + '%'; bar.append(s); }
      box.append(el('span', 'fx-sub', `FED ${day(odds.meeting)} · futures imply ${signed(odds.expectedChangeBp, 0, ' bp')}`), bar, el('span', 'fx-sub', [['cut50', 'Cut 50'], ['cut', 'Cut 25'], ['hold', 'Hold'], ['hike', 'Hike 25'], ['hike50', 'Hike 50']].filter(([k]) => odds[k] > 0).map(([k, l]) => `${l} ${Math.round(odds[k])}%`).join(' · ')));
      host.append(box);
    }
    host.append(el('p', 'fx-foot', '* A decision happened after this reading. Click a bank for details.'));
  }
  function setCurve(area) { S.curve = area; renderCurve(); $('tp-curve').scrollIntoView?.({block: 'nearest'}); }
  function renderCurve() {
    tabs('curve-tabs', [['US', 'US'], ['EA', 'EA'], ['GB', 'UK'], ['JP', 'JP']], S.curve, setCurve);
    const host = panel('curve'), curve = S.desk?.curves?.[S.curve], v = M.curveView(curve);
    $('curve-title').textContent = M.AREAS[S.curve].short;
    if (!v) return empty(host, 'Loading yield curves…');
    const W = 320, H = 120, L = 30, R = 6, T = 8, B = 16, rows = v.rows, vals = rows.flatMap(r => [r.value, r.month]).filter(finite);
    const lo = Math.min(...vals) - 0.05, hi = Math.max(...vals) + 0.05, x = i => L + i * (W - L - R) / Math.max(1, rows.length - 1), y = val => T + (hi - val) / (hi - lo) * (H - T - B);
    const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart fx-curve', role: 'img', 'aria-label': `${M.AREAS[S.curve].label} yield curve ${v.latestDate}`});
    for (let k = 0; k <= 2; k++) { const val = lo + (hi - lo) * k / 2; c.append(svg('line', {x1: L, x2: W - R, y1: y(val), y2: y(val), class: 'g'})); const t = svg('text', {x: 2, y: y(val) + 3, class: 'a'}); t.textContent = val.toFixed(2); c.append(t); }
    const line = (key, cls) => { const p = rows.map((r, i) => finite(r[key]) ? `${x(i)},${y(r[key])}` : null).filter(Boolean); if (p.length > 1) c.append(svg('polyline', {points: p.join(' '), class: cls, fill: 'none'})); };
    line('month', 'ln-m'); line('value', 'ln-up');
    rows.forEach((r, i) => { const t = svg('text', {x: x(i), y: H - 3, class: 'a', 'text-anchor': 'middle'}); t.textContent = r.tenor; c.append(t); });
    host.append(c);
    const grid = el('div', 'fx-tenors');
    for (const r of rows) { const b = btn('', 'fx-tenor', () => inspect(`${M.AREAS[S.curve].short} ${r.tenor}`, h => kv(h, [['Yield', r.value.toFixed(3) + '%'], ['1 week change', signed(r.weekChangeBp, 0, ' bp')], ['1 month change', signed(r.monthChangeBp, 0, ' bp')], ['Close', v.latestDate], ['Source', link(curve.source, curve.sourceURL)]])), `${r.tenor} yield`); b.append(el('span', '', r.tenor), el('b', '', r.value.toFixed(2)), el('em', tone(r.monthChangeBp), signed(r.monthChangeBp, 0))); grid.append(b); }
    host.append(grid);
    const foot = el('p', 'fx-foot', `${v.spread ? `${v.spread.label} ${signed(v.spread.bp, 0, ' bp')} · ` : ''}close ${v.latestDate} · Δ = 1M bp`);
    host.append(foot);
    if (S.curve === 'US' && S.desk?.liveUS?.quotes) { const live = el('div', 'fx-chips'); S.desk.liveUS.quotes.forEach(q => live.append(el('span', 'fx-chip', `${q.tenor} ${q.price.toFixed(3)} `), el('span', 'fx-chip ' + tone(q.price - q.previousClose), signed((q.price - q.previousClose) * 100, 1, 'bp')))); host.append(live); }
  }
  function renderRisk() {
    const host = panel('vix');
    if (S.vix?.rows?.length) {
      const rows = S.vix.rows.slice(-90), vals = rows.map(r => r.close), last = vals.at(-1), prev = vals.at(-2);
      const top = btn('', 'fx-vixhead', () => inspect('Cboe VIX', h => kv(h, [['Close', last.toFixed(2)], ['Date', rows.at(-1).date], ['90-day high', Math.max(...vals).toFixed(2)], ['90-day low', Math.min(...vals).toFixed(2)], ['Source', link('Cboe VIX history ↗', 'https://www.cboe.com/tradable_products/vix/vix_historical_data/')]])), 'VIX details');
      top.append(el('b', '', 'VIX ' + last.toFixed(2)), el('em', tone(last - prev), signed(last - prev, 2)), el('small', '', rows.at(-1).date)); host.append(top);
      const W = 300, H = 50, lo = Math.min(...vals), hi = Math.max(...vals), c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart fx-spark', role: 'img', 'aria-label': `VIX last 90 closes, latest ${last.toFixed(2)}`});
      c.append(svg('polyline', {points: vals.map((v, i) => `${i * W / (vals.length - 1)},${H - 3 - (v - lo) / (hi - lo || 1) * (H - 6)}`).join(' '), class: 'ln-w', fill: 'none'})); host.append(c);
    } else host.append(el('p', 'fx-sub', 'VIX loading…'));
    const mood = S.edge?.mood, fxv = S.edge?.volatility;
    if (mood?.value) {
      const m = btn('', 'fx-mood', () => inspect('Market mood', h => { kv(h, [['Mood', mood.value], ['Score', finite(mood.score) ? mood.score.toFixed(2) : '—'], ['FX volatility', fxv ? `${fxv.value}, ${M.ordinal(Math.round(fxv.percentile))} percentile` : '—']]); (mood.parts || []).forEach(i => h.append(el('p', 'fx-sub', `${i.name}: ${finite(i.value) ? signed(i.value, 2) : 'n/a'}`))); h.append(link('Edge Radar ↗', '/edge-radar/')); }), 'Market mood details');
      m.append(el('span', '', 'MOOD'), el('b', '', mood.value), el('span', '', 'FX VOL'), el('b', '', fxv ? `${M.ordinal(Math.round(fxv.percentile))} · ${fxv.value}` : '—'));
      host.append(m);
      const parts = el('div', 'fx-chips'); (mood.parts || []).slice(0, 6).forEach(i => parts.append(el('span', 'fx-chip ' + tone(i.value), `${i.name} ${finite(i.value) ? signed(i.value, 2) : ''}`))); host.append(parts);
    }
    const head = el('div', 'fx-th fx-c4'); head.append(el('span', '', 'BOOK'), el('span', '', 'BID'), el('span', '', 'ASK'), el('span', '', 'SPRD')); host.append(head);
    for (const p of ['BTC-USD', 'ETH-USD']) {
      const b = S.books[p], r = rowButton('fx-c4', () => focusOn(p), `${p} top of book`);
      r.append(el('b', '', shortOf(p)), el('span', 'fx-num fx-up', b ? fmt(b.bid, 2) : '—'), el('span', 'fx-num fx-down', b ? fmt(b.ask, 2) : '—'), el('span', 'fx-num', b ? b.spreadBps.toFixed(2) + 'bp' : '—')); host.append(r);
    }
    host.append(el('p', 'fx-foot', 'Coinbase Exchange level-1 book · refreshes every 15 s'));
  }

  /* --- BIAS, EDGE, COT ------------------------------------------------------ */
  function renderBias() {
    const host = panel('bias');
    const rows = M.PAIRS.map(p => ({p, b: M.smartBias(p, {desk: S.desk, edgeMarket: S.edge?.markets?.find(m => m.symbol === p.id), livePrice: quoteFor(p.id)?.price})})).sort((a, c) => (c.b.score ?? -999) - (a.b.score ?? -999));
    for (const {p, b} of rows) {
      const r = rowButton('fx-bias', () => { focusOn(p.id); inspect(`Smart Bias · ${p.base}/${p.quote}`, h => { kv(h, [['Score', finite(b.score) ? `${b.score > 0 ? '+' : ''}${b.score} · ${b.label}` : b.reason], ['Coverage', b.coverage + '%']]); b.components.forEach(c => h.append(el('p', 'fx-sub', `${c.label} ${c.score > 0 ? '+' : ''}${c.score} (weight ${c.weight}%): ${c.detail}`))); h.append(link('How it is calculated ↗', '/macro-desk.html#md-bias-title')); }); }, `${p.base}/${p.quote} bias`);
      const bar = el('span', 'fx-bbar'), fill = el('i', (b.score ?? 0) >= 0 ? 'up' : 'dn'), w = Math.abs(b.score ?? 0) / 2; fill.style.width = w + '%'; fill.style.left = ((b.score ?? 0) >= 0 ? 50 : 50 - w) + '%'; bar.append(el('b'), fill);
      r.append(el('b', '', `${p.base}${p.quote}`), el('span', 'fx-num fx-dim', quoteFor(p.id) ? fmt(quoteFor(p.id).price, EDGE[p.id][2]) : ''), bar, el('span', 'fx-num ' + ((b.score ?? 0) >= 15 ? 'fx-up' : (b.score ?? 0) <= -15 ? 'fx-down' : 'fx-flat'), finite(b.score) ? `${b.score > 0 ? '+' : ''}${b.score}` : 'n/a'));
      host.append(r);
    }
  }
  function renderEdge() {
    const host = panel('edge'), ms = S.edge?.markets || [];
    if (!ms.length) return empty(host, 'Loading Edge Radar…');
    const head = el('div', 'fx-th fx-c5'); head.append(el('span', '', 'MKT'), el('span', '', 'REGIME'), el('span', '', 'TREND'), el('span', '', 'VOL'), el('span', '', 'EVENT')); host.append(head);
    for (const m of ms) {
      const st = m.state || {}, pos = finite(st.close?.value) && finite(st.high20?.value) && finite(st.low20?.value) && st.high20.value > st.low20.value ? (st.close.value - st.low20.value) / (st.high20.value - st.low20.value) * 2 - 1 : null;
      const r = rowButton('fx-c5', () => focusOn(m.symbol), `${m.symbol} ${st.regime?.value || ''}`);
      r.append(el('b', '', m.symbol), el('span', '', st.regime?.value || '—'), el('span', 'fx-num ' + tone(pos), pos === null ? '—' : signed(pos, 2)), el('span', 'fx-num', finite(st.volatilityPercentile?.value) ? M.ordinal(Math.round(st.volatilityPercentile.value)) : '—'), el('span', m.events?.eventIn24h ? 'fx-warn' : 'fx-dim', m.events?.eventIn24h ? '24h' : 'clear'));
      host.append(r);
    }
    host.append(el('p', 'fx-foot', `Snapshot ${ago(S.edge.generatedAt)} · trend = position in 20-day range`));
  }
  function renderPos() {
    const host = panel('pos'), ms = (S.edge?.markets || []).filter(m => finite(m.positioning?.net?.value)).sort((a, b) => b.positioning.net.value - a.positioning.net.value);
    if (!ms.length) return empty(host, 'Loading positioning…');
    $('n-pos').textContent = 'CFTC ' + (ms[0].positioning.reportDate || '');
    for (const m of ms) {
      const n = m.positioning.net.value, r = rowButton('fx-posrow', () => { focusOn(m.symbol); inspect(`${m.symbol} positioning`, h => { kv(h, [['Net', signed(n * 100, 0, '%')], ['Crowded', m.positioning.crowded?.value ? 'Yes' : 'No'], ['Report', m.positioning.reportDate], ['Source', 'CFTC Commitments of Traders']]); const hist = (m.positioning.history || []).slice(-12); hist.forEach(x => h.append(el('p', 'fx-sub', `${x.date}: ${signed(x.net * 100, 0, '%')}`))); }); }, `${m.symbol} net ${Math.round(n * 100)}%`);
      const bar = el('span', 'fx-bbar'), fill = el('i', n >= 0 ? 'up' : 'dn'), w = Math.min(50, Math.abs(n) * 50); fill.style.width = w + '%'; fill.style.left = (n >= 0 ? 50 : 50 - w) + '%'; bar.append(el('b'), fill);
      r.append(el('b', '', m.symbol), bar, el('span', 'fx-num ' + tone(n), signed(n * 100, 0, '%') + (m.positioning.crowded?.value ? '!' : ''))); host.append(r);
    }
    host.append(el('p', 'fx-foot', '! = crowded vs its own history · net (long − short) / total'));
  }

  /* --- ECO, CORR ------------------------------------------------------------ */
  function renderEco() {
    tabs('eco-tabs', [[false, 'All'], [true, 'High']], S.ecoHigh, v => { S.ecoHigh = v; renderEco(); });
    const host = panel('eco'), ev = (S.calendar?.events || []).filter(e => !S.ecoHigh || e.impact === 'high').sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    if (!ev.length) return empty(host, S.calendar ? 'No events match.' : 'Loading calendar…');
    const now = Date.now(); let marked = false;
    for (const e of ev) {
      const t = Date.parse(e.time), past = t < now;
      if (!past && !marked) { host.append(el('div', 'fx-nowline', 'NOW')); marked = true; }
      const r = rowButton('fx-eco' + (past ? ' past' : ''), () => inspect(e.title, h => kv(h, [['Currency', e.currency], ['Time', new Date(e.time).toLocaleString()], ['Impact', e.impact], ['Forecast', e.forecast || '—'], ['Previous', e.previous || '—'], ['Status', past ? 'Scheduled time has passed — check the source for the actual figure' : 'Upcoming'], ['Source', link('Forex Factory ↗', 'https://www.forexfactory.com/calendar')]])), e.title);
      r.append(el('time', '', new Date(e.time).toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'})), el('b', 'cc-' + e.currency, e.currency), el('i', 'imp-' + e.impact, ''), el('span', 'fx-ht', e.title), el('span', 'fx-num', e.forecast || ''), el('span', 'fx-num fx-dim', e.previous || ''));
      host.append(r);
    }
    // Scroll only inside the calendar panel; scrollIntoView also moved the whole page on phones.
    const nowLine = host.querySelector('.fx-nowline'); if (nowLine) host.scrollTop += nowLine.getBoundingClientRect().top - host.getBoundingClientRect().top;
  }
  async function renderCorr(load = false) {
    tabs('corr-tabs', [[30, '30D'], [60, '60D'], [90, '90D']], S.corrWindow, v => { S.corrWindow = v; renderCorr(true); });
    const host = panel('corr');
    if (load && !S.corr[S.corrWindow]) { empty(host, 'Loading…'); await loadCorr(); host.replaceChildren(); }
    const c = S.corr[S.corrWindow]; if (!c?.matrix) return empty(host, 'Correlation data is loading or unavailable.');
    const names = c.pairs.map(p => (typeof p === 'string' ? p : p.label || p.id || '').replace('/', ''));
    const grid = el('div', 'fx-corr'); grid.style.gridTemplateColumns = `48px repeat(${names.length}, minmax(0,1fr))`;
    grid.append(el('span')); names.forEach(n => grid.append(el('span', 'fx-ch', n.slice(0, 6))));
    c.matrix.forEach((row, i) => {
      grid.append(el('span', 'fx-ch', names[i].slice(0, 6)));
      row.forEach((v, j) => { const b = btn(i === j ? '' : v.toFixed(2), 'fx-cc', () => inspect(`${names[i]} vs ${names[j]}`, h => kv(h, [['Correlation', v.toFixed(3)], ['Window', `${c.window} daily returns`], ['Period', `${c.startDate} → ${c.observationDate}`], ['Meaning', v > 0.6 ? 'Strongly move together' : v < -0.6 ? 'Strongly move opposite' : 'Weak relationship'], ['Method', c.method], ['Source', c.source]])), `${names[i]} vs ${names[j]} ${v.toFixed(2)}`);
        b.style.background = i === j ? 'transparent' : v >= 0 ? `rgba(91,141,239,${Math.abs(v) * 0.85})` : `rgba(244,162,97,${Math.abs(v) * 0.85})`; grid.append(b); });
    });
    host.append(grid, el('p', 'fx-foot', `${c.source} · to ${c.observationDate}`));
  }

  /* --- TOOLS: calc, journal, sessions ---------------------------------------- */
  function renderTools() {
    tabs('tools-tabs', [['calc', 'CALC'], ['jrnl', 'JRNL'], ['sess', 'SESS']], S.tool, v => { S.tool = v; renderTools(); });
    const host = panel('tools');
    $('tools-title').textContent = {calc: 'Position size', jrnl: 'Your journal', sess: 'Trading sessions'}[S.tool];
    if (S.tool === 'calc') return renderCalc(host);
    if (S.tool === 'jrnl') return renderJournal(host);
    for (const s of SESSIONS) { const st = sessionState(s), r = el('div', 'fx-row fx-c3'); r.append(el('b', '', st.name), el('span', 'fx-num', st.time + ' local'), el('span', st.open ? 'fx-up' : 'fx-dim', st.open ? 'OPEN' : 'CLOSED')); host.append(r); }
    host.append(el('p', 'fx-foot', 'Regular weekday hours in local time. Holidays vary; see Market Hours.'), link('Market hours ↗', '/tools/market-hours.html', 'fx-chip fx-chip-link'));
  }
  const calc = {pair: 'EURUSD', balance: 10000, risk: 1, stop: 20};
  function renderCalc(host) {
    const pairs = M.PAIRS.map(p => p.id).concat(['XAUUSD']);
    const form = el('form', 'fx-form'); form.addEventListener('submit', e => e.preventDefault());
    const field = (label, input) => { const l = el('label'); l.append(el('span', '', label), input); form.append(l); return input; };
    const sel = document.createElement('select'); pairs.forEach(p => { const o = el('option', '', p); o.value = p; sel.append(o); }); sel.value = calc.pair; field('Pair', sel);
    const num = (v, step) => { const i = document.createElement('input'); i.type = 'number'; i.inputMode = 'decimal'; i.step = step; i.min = '0'; i.value = v; return i; };
    const bal = field('Balance $', num(calc.balance, '100')), risk = field('Risk %', num(calc.risk, '0.1')), stop = field('Stop (pips)', num(calc.stop, '1'));
    host.append(form);
    const out = el('div', 'fx-calcout'); host.append(out);
    const compute = () => {
      Object.assign(calc, {pair: sel.value, balance: Number(bal.value), risk: Number(risk.value), stop: Number(stop.value)});
      const id = calc.pair, pip = EDGE[id][1], quoteCcy = id.slice(3), price = quoteFor(id)?.price ?? S.edge?.markets?.find(m => m.symbol === id)?.state?.close?.value;
      const contract = id === 'XAUUSD' ? 100 : 100000;
      let usdPerQuote = null;
      if (quoteCcy === 'USD') usdPerQuote = 1;
      else if (id.startsWith('USD') && finite(price)) usdPerQuote = 1 / price;
      else { const conv = quoteFor('USD' + quoteCcy)?.price ?? S.edge?.markets?.find(m => m.symbol === 'USD' + quoteCcy)?.state?.close?.value; const inv = quoteFor(quoteCcy + 'USD')?.price ?? S.edge?.markets?.find(m => m.symbol === quoteCcy + 'USD')?.state?.close?.value; usdPerQuote = finite(conv) ? 1 / conv : finite(inv) ? inv : null; }
      out.replaceChildren();
      if (![calc.balance, calc.risk, calc.stop].every(v => finite(v) && v > 0) || !finite(usdPerQuote)) { out.append(el('p', 'fx-sub', 'Enter positive values. A current price is needed for this pair.')); return; }
      const pipValue = pip * contract * usdPerQuote, riskUsd = calc.balance * calc.risk / 100, lots = Math.floor(riskUsd / (calc.stop * pipValue) * 100) / 100;
      const card = (k, v) => { const d = el('div'); d.append(el('span', '', k), el('b', '', v)); out.append(d); };
      card('RISK', '$' + riskUsd.toFixed(2)); card('LOTS', lots.toFixed(2)); card('UNITS', Math.round(lots * contract).toLocaleString()); card('PIP / LOT', '$' + pipValue.toFixed(2));
      out.append(el('p', 'fx-foot', `Price ${finite(price) ? fmt(price, EDGE[id][2]) : '—'} · lots rounded down to 0.01 · confirm your broker's contract size.`));
    };
    form.addEventListener('input', compute); compute();
    host.append(link('Full calculator ↗', '/calculator.html', 'fx-chip fx-chip-link'));
  }
  function renderJournal(host) {
    const j = S.journal;
    if (j.status === 'signed-out') { host.append(el('p', 'fx-sub', 'Sign in to see your saved trades here.')); host.append(link('Sign in ↗', '/auth/login.html?return=/terminal.html', 'fx-chip fx-chip-link'), link('Open Journal ↗', '/journal.html', 'fx-chip fx-chip-link')); return; }
    if (j.status !== 'ready') return empty(host, j.status === 'error' ? 'Journal sync is unavailable right now.' : 'Loading your journal…');
    const t = j.trades, pls = t.map(x => x.pl).filter(finite), net = pls.reduce((s, v) => s + v, 0), wins = pls.filter(v => v > 0).length;
    const out = el('div', 'fx-calcout'); const card = (k, v, cls) => { const d = el('div'); d.append(el('span', '', k), el('b', cls || '', v)); out.append(d); };
    card('TRADES', String(t.length)); card('WIN RATE', pls.length ? (wins / pls.length * 100).toFixed(0) + '%' : '—'); card('NET P/L', pls.length ? (net >= 0 ? '+$' : '−$') + Math.abs(net).toFixed(2) : '—', tone(net)); card('BEST', pls.length ? '$' + Math.max(...pls).toFixed(2) : '—');
    host.append(out);
    const sorted = [...t].filter(x => x.date).sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length > 1) { let run = 0; const eq = sorted.map(x => (run += x.pl || 0)), W = 300, H = 46, lo = Math.min(0, ...eq), hi = Math.max(0, ...eq); const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart fx-spark', role: 'img', 'aria-label': 'Your equity curve'}); c.append(svg('polyline', {points: eq.map((v, i) => `${i * W / (eq.length - 1)},${H - 3 - (v - lo) / (hi - lo || 1) * (H - 6)}`).join(' '), class: 'ln-w', fill: 'none'})); host.append(c); }
    sorted.slice(-5).reverse().forEach(x => { const r = el('div', 'fx-row fx-c3'); r.append(el('span', '', x.date), el('b', '', x.symbol || '—'), el('span', 'fx-num ' + tone(x.pl), finite(x.pl) ? signed(x.pl, 2) : '—')); host.append(r); });
    host.append(link('Open Journal ↗', '/journal.html', 'fx-chip fx-chip-link'));
  }
  window.addEventListener('fx-journal', e => { S.journal = e.detail; if (S.tool === 'jrnl') renderTools(); });

  /* --- command bar & keys --------------------------------------------------- */
  const PAGES = {HOME: '/home.html', NEWS: '/news.html', MACRO: '/macro-desk.html', EDGE: '/edge-radar/', QUANT: '/quant-analyst.html', RESEARCH: '/tools/research-desk.html', JOURNAL: '/journal.html', CALC: '/calculator.html', CALENDAR: '/calendar.html', LEARN: '/learn.html', PROFILE: '/profile.html'};
  function say(text) { $('fx-cmd-msg').textContent = text; }
  function run(cmd) {
    const parts = cmd.trim().toUpperCase().split(/\s+/), [verb, arg] = parts;
    if (!verb) return;
    if (verb === 'HELP' || verb === '?') { inspect('Commands', h => kv(h, [['AAPL, EURUSD, GOLD, BTC', 'Chart any market'], ['NEWS FOREX | MACRO | ENERGY…', 'Switch the news desk'], ['CURVE US | EA | UK | JP', 'Show a yield curve'], ['CB FED | ECB | BOE…', 'Central bank detail'], ['FIN MSFT', 'Company financials'], ['CORR 30 | 60 | 90', 'Correlation window'], ['CALC EURUSD', 'Position size for a pair'], ['GO MACRO | EDGE | QUANT…', 'Open a full page'], ['/', 'Jump to this command bar']])); return say('Commands listed.'); }
    if (verb === 'NEWS') { const d = DESKS.find(([k, l]) => k.toUpperCase() === arg || l.toUpperCase() === arg); if (d) { S.deskTab = d[0]; renderDesks(true); return say(`News desk: ${d[1]}`); } return say('Desks: ' + DESKS.map(d => d[0].toUpperCase()).join(', ')); }
    if (verb === 'CURVE') { const a = {US: 'US', EA: 'EA', EU: 'EA', UK: 'GB', GB: 'GB', JP: 'JP', JAPAN: 'JP'}[arg || 'US']; if (a) { setCurve(a); return say('Curve: ' + M.AREAS[a].short); } return say('Use CURVE US, EA, UK or JP.'); }
    if (verb === 'CB') { const b = S.schedule?.banks?.find(x => x.short.toUpperCase() === arg || x.currency === arg); if (b) { inspectBank(b); return say(b.name); } return say('Use CB FED, ECB, BOE, BOJ, SNB, BOC, RBA or RBNZ.'); }
    if (verb === 'FIN' && arg) { if (CATALOG.find(c => c.symbol === arg && c.group === 'Stocks')) { S.finTicker = arg; renderFin(); return say('Financials: ' + arg); } return say('FIN works for the 20 listed stocks, e.g. FIN AAPL.'); }
    if (verb === 'CORR') { const w = Number(arg); if ([30, 60, 90].includes(w)) { S.corrWindow = w; renderCorr(true); return say(`Correlation: ${w} days`); } return say('Use CORR 30, 60 or 90.'); }
    if (verb === 'CALC') { const id = resolve(arg); S.tool = 'calc'; if (id && EDGE[id]) calc.pair = id; renderTools(); return say('Position size calculator'); }
    if (verb === 'GO') { if (PAGES[arg]) { location.href = PAGES[arg]; return; } return say('Pages: ' + Object.keys(PAGES).join(', ')); }
    const id = resolve(cmd);
    if (id) { focusOn(id); return say(`Chart: ${nameOf(id)}`); }
    say(`Unknown: "${cmd}". Type HELP.`);
  }
  $('fx-cmd-form').addEventListener('submit', e => { e.preventDefault(); const i = $('fx-command'); run(i.value); i.value = ''; });
  function renderKeys() { const host = $('fx-keys'); host.replaceChildren(); KEYS.forEach(([k, l, h]) => { const a = link('', h, 'fx-key'); a.append(el('b', '', k), document.createTextNode(l)); host.append(a); }); }
  $('fx-news-pause').addEventListener('click', e => { S.paused = !S.paused; e.currentTarget.setAttribute('aria-pressed', String(S.paused)); e.currentTarget.textContent = S.paused ? 'Play' : 'Pause'; $('fx-news-track').classList.toggle('paused', S.paused); });
  try { const ref = document.referrer && new URL(document.referrer); if (ref && ref.origin === location.origin && !ref.pathname.startsWith('/terminal')) $('fx-classic').href = ref.pathname + ref.search; } catch {}

  /* --- orchestration -------------------------------------------------------- */
  const renderQuotesAll = () => { renderStrip(); renderMkts(); renderHeat(); renderBias(); if (S.focus) renderFocus(); };
  function renderAll() { renderClocks(); renderStrip(); renderNews(); renderMkts(); renderHeat(); renderFocus(); renderStory(); renderTop(); renderCB(); renderCurve(); renderRisk(); renderBias(); renderEdge(); renderPos(); renderEco(); renderTools(); renderLive(); }
  async function start() {
    renderKeys(); renderClocks(); renderTools();
    const params = new URLSearchParams(location.search); if (params.get('symbol')) S.focus = resolve(params.get('symbol')) || S.focus;
    await Promise.allSettled([loadQuotes(), loadDesk(), loadSchedule(), loadEdge(), loadCalendar(), loadBriefing(), loadVix(), loadCorr(), loadBooks(), loadSeries(S.focus)]);
    renderAll(); renderDesks(true); renderCorr(); renderFin(); $('fx-main').setAttribute('aria-busy', 'false');
  }
  const every = (ms, task) => setInterval(async () => { if (!document.hidden) await task(); }, ms);
  every(30000, async () => { await loadQuotes(); renderQuotesAll(); renderStory(); });
  every(15000, async () => { await loadBooks(); renderRisk(); });
  every(30000, () => { renderClocks(); document.querySelectorAll('#b-cb .fx-up').length && renderCB(); });
  every(120000, async () => { await loadBriefing(); renderNews(); renderTop(); renderStory(); });
  every(300000, async () => { await Promise.allSettled([loadDesk(), loadDesk_(S.deskTab, true)]); renderCB(); renderCurve(); renderStrip(); renderStory(); renderBias(); renderDesks(); });
  every(1800000, async () => { await Promise.allSettled([loadEdge(), loadCalendar(), loadVix()]); renderEdge(); renderPos(); renderEco(); renderRisk(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadQuotes().then(renderQuotesAll); loadBriefing().then(() => { renderNews(); renderTop(); }); } });
  start();
})();
