/* Edge Radar · Market focus: story, Smart Bias, volatility distribution, order and position books.
 * Mounted above the existing Edge Radar content. Every value keeps its source; external text uses textContent. */
(() => {
  'use strict';
  const M = window.FynxMacroModel, root = document.getElementById('edge-insights');
  if (!M || !root) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const RESEARCH = ['https://raw.githubusercontent.com/EA-LA/FYNX-web/research-data/assets/data/research/', '/assets/data/research/'];
  const DESK_URL = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/macro-data/desk.json';
  const QUOTES = (local ? '/api/research' : 'https://us-central1-fynx-c7a28.cloudfunctions.net/webResearchData') + '?action=quotes&symbols=' + encodeURIComponent(M.PAIRS.map(p => p.quoteSymbol).filter(Boolean).join(','));
  const PIP = {EURUSD: 0.0001, GBPUSD: 0.0001, USDJPY: 0.01, AUDUSD: 0.0001, USDCAD: 0.0001, USDCHF: 0.0001, NZDUSD: 0.0001, XAUUSD: 0.1, XAGUSD: 0.01, EURJPY: 0.01, GBPJPY: 0.01, EURGBP: 0.0001, US30: 1, NAS100: 1, SPX500: 0.1, BTCUSD: 1, ETHUSD: 0.1};
  const DIGITS = {USDJPY: 3, EURJPY: 3, GBPJPY: 3, XAUUSD: 2, XAGUSD: 3, US30: 1, NAS100: 1, SPX500: 2, BTCUSD: 2, ETHUSD: 2};
  let markets = [];
  try { markets = JSON.parse(document.getElementById('edge-market-config')?.textContent || '[]'); } catch {}
  const fixed = document.body.dataset.edgeSymbol || '';
  const state = {symbol: fixed || readPref() || 'EURUSD', edge: null, desk: null, bars: {}, quotes: {}, headlines: [], loaded: false};
  const $ = id => document.getElementById(id);
  const finite = v => typeof v === 'number' && Number.isFinite(v);

  function readPref() { try { const v = localStorage.getItem('fynx-edge-focus'); return PIP[v] ? v : null; } catch { return null; } }
  function savePref(v) { try { localStorage.setItem('fynx-edge-focus', v); } catch {} }
  function el(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined && text !== null) n.textContent = text; return n; }
  function link(text, href, className) {
    const a = el('a', className, text);
    try { const u = new URL(href, location.href); if (!['https:', 'http:'].includes(u.protocol)) return el('span', className, text); a.href = u.href; if (u.origin !== location.origin) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } } catch { return el('span', className, text); }
    return a;
  }
  const ago = iso => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return !Number.isFinite(m) ? '' : m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  const labelOf = id => markets.find(m => m.id === id)?.label || id;
  const pairOf = id => M.PAIRS.find(p => p.id === id) || {id, base: null, quote: null, quoteSymbol: null};
  const report = (op, e) => { try { window.FynxMonitor?.report('feed', 'edge-focus-' + op, e); } catch {} };

  async function getJSON(url, bust = false) {
    const target = bust ? url + (url.includes('?') ? '&' : '?') + 't=' + Math.floor(Date.now() / 120000) : url;
    const r = await fetch(target, {signal: AbortSignal.timeout(25000), credentials: 'omit', referrerPolicy: 'no-referrer', headers: {Accept: 'application/json'}});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text(); if (text.length > 8e6) throw new Error('Too large');
    return JSON.parse(text);
  }
  async function research(path, check) {
    for (const base of RESEARCH) { try { const d = await getJSON(base + path, base.startsWith('https:')); if (check(d)) return d; } catch (e) { report(path, e); } }
    return null;
  }
  const loadEdge = async () => { const d = await research('edge.json', d => Array.isArray(d?.markets)); if (d) state.edge = d; };
  const loadBars = async symbol => { if (state.bars[symbol]) return; const d = await research(`bars/${symbol}-D1.json`, d => d?.symbol === symbol && Array.isArray(d.bars)); if (d) state.bars[symbol] = d; };
  async function loadDesk() { try { state.desk = M.validateDesk(await getJSON(DESK_URL, true)); } catch (e) { report('desk', e); } }
  async function loadQuotes() {
    try {
      const d = await getJSON(QUOTES), quotes = {};
      for (const p of M.PAIRS) { const q = d?.quotes?.[p.quoteSymbol]; if (q && finite(q.price) && q.price > 0 && Date.now() - Date.parse(q.asOf) < 4 * 86400000) quotes[p.id] = {price: q.price, changePercent: finite(q.changePercent) ? q.changePercent : null, asOf: q.asOf}; }
      state.quotes = quotes;
    } catch (e) { report('quotes', e); }
  }
  async function loadHeadlines() { try { const r = await window.FynxTerminalData?.loadBriefing?.(); if (r?.items) state.headlines = r.items.slice(0, 40); } catch (e) { report('headlines', e); } }

  /* --- cards --------------------------------------------------------------- */
  function head(card, eyebrow, title, right) {
    card.replaceChildren();
    const h = el('header', 'ei-card-head'), left = el('div');
    left.append(el('span', 'edge-eyebrow', eyebrow), el('h3', '', title)); h.append(left);
    if (right) h.append(right);
    card.append(h); return card;
  }
  const empty = (card, text) => card.append(el('p', 'ei-empty', text));

  function renderStory(symbol, market, bias, vol) {
    const card = $('ei-story'), quote = state.quotes[symbol];
    const story = M.marketStory({symbol, label: labelOf(symbol), edgeMarket: market, quote, desk: state.desk, headlines: state.headlines, bias, vol, digits: DIGITS[symbol] || 5});
    head(card, 'THE STORY TODAY', story.title);
    if (!story.available) return empty(card, 'This market is not in the latest published snapshot yet.');
    card.append(el('p', 'ei-story-text', story.lines.join(' ')));
    if (story.related.length) {
      const ul = el('ul', 'ei-related');
      for (const h of story.related) { const li = el('li'); li.append(el('time', 'edge-mono', new Date(h.publishedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})), link(h.title, h.url), el('span', 'edge-muted', ' · ' + h.source)); ul.append(li); }
      card.append(ul);
    }
    pricePath(card, symbol);
    card.append(el('p', 'ei-foot', `Written automatically from the figures in this section · Edge Radar snapshot ${String(market.state?.date || '').slice(0, 10)}${quote ? ' · live delayed quote' : ''}. No opinions added.`));
  }

  function renderBias(symbol, result) {
    const card = $('ei-bias'), right = link('Method ↗︎', '/macro-desk.html#md-bias-title', 'ei-small-link');
    head(card, 'SMART BIAS', labelOf(symbol), right);
    if (!finite(result.score)) return empty(card, result.reason || 'Not enough current inputs to score this market.');
    const tone = result.score >= 15 ? 'ei-up' : result.score <= -15 ? 'ei-down' : 'ei-flat';
    const big = el('div', 'ei-score'); big.append(el('strong', tone, `${result.score > 0 ? '+' : ''}${result.score}`), el('span', tone, result.label)); card.append(big);
    card.append(el('p', 'edge-muted ei-small', `${result.coverage}% of inputs available · −100 bearish to +100 bullish for ${labelOf(symbol).split('/')[0]}`));
    const gauge = el('div', 'ei-gauge'); gauge.setAttribute('role', 'img'); gauge.setAttribute('aria-label', `Score ${result.score} on a scale from −100 to +100`);
    const mark = el('i'); mark.style.left = (50 + result.score / 2) + '%'; gauge.append(mark); card.append(gauge);
    const scale = el('div', 'ei-scale'); scale.append(el('span', '', '−100'), el('span', '', '0'), el('span', '', '+100')); card.append(scale);
    const list = el('ul', 'ei-parts');
    for (const c of result.components) {
      const li = el('li'), bar = el('span', 'ei-bar'), fill = el('i', c.score >= 0 ? 'ei-fill-up' : 'ei-fill-down'), w = Math.abs(c.score) / 2;
      fill.style.width = w + '%'; fill.style.left = (c.score >= 0 ? 50 : 50 - w) + '%'; bar.append(el('b'), fill);
      const top = el('div', 'ei-part-top'); top.append(el('strong', '', c.label), bar, el('span', 'edge-mono', `${c.score > 0 ? '+' : ''}${c.score}`));
      li.append(top, el('small', 'edge-muted', `${c.detail} · weight ${c.weight}%`)); list.append(li);
    }
    card.append(list, el('p', 'ei-foot', 'A summary of public data, not a forecast or trade signal.'));
  }

  function renderVol(symbol, vol) {
    const card = $('ei-vol');
    head(card, 'VOLATILITY DISTRIBUTION', 'Daily range over the last year', vol ? el('p', 'ei-vol-now', '') : null);
    if (!vol) return empty(card, 'Daily price history for this market is unavailable right now.');
    const now = card.querySelector('.ei-vol-now');
    now.append(el('strong', '', `Latest day: ${vol.latest.toFixed(vol.unit.digits)} ${vol.unit.label} · ${M.ordinal(vol.percentile)} percentile`), el('span', 'edge-muted', ` · busier than ${vol.percentile}% of days`));
    const max = Math.max(...vol.bins.map(b => b.count));
    const chart = el('div', 'ei-hist'); chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', `Histogram of ${vol.sample} daily ranges. Median ${vol.median.toFixed(vol.unit.digits)} ${vol.unit.label}; latest ${vol.latest.toFixed(vol.unit.digits)}, the ${M.ordinal(vol.percentile)} percentile.`);
    vol.bins.forEach((b, i) => {
      const col = el('span', i === vol.latestBin ? 'ei-hist-now' : i < vol.latestBin ? 'ei-hist-below' : 'ei-hist-above');
      col.style.height = Math.max(2, b.count / max * 100) + '%';
      col.title = `${b.from.toFixed(vol.unit.digits)}–${b.to.toFixed(vol.unit.digits)} ${vol.unit.label}: ${b.count} days`;
      chart.append(col);
    });
    card.append(chart);
    const axis = el('div', 'ei-axis edge-mono');
    axis.append(el('span', '', `${vol.bins[0].from.toFixed(vol.unit.digits)} ${vol.unit.label}`), el('span', '', `median ${vol.median.toFixed(vol.unit.digits)}`), el('span', '', `typical ${vol.p25.toFixed(vol.unit.digits)}–${vol.p75.toFixed(vol.unit.digits)}`), el('span', '', `${vol.bins.at(-1).to.toFixed(vol.unit.digits)}+`));
    card.append(axis, el('p', 'ei-foot', `${vol.sample} completed daily bars to ${vol.latestDate} · high minus low · Dukascopy bid candles.`));
  }

  function ladder(card, book, digits, longLabel, shortLabel) {
    const max = Math.max(1e-9, ...book.buckets.flatMap(b => [b.long, b.short]));
    const cols = el('div', 'ei-ladder-head'); cols.append(el('span', '', shortLabel), el('span', '', 'PRICE'), el('span', '', longLabel)); card.append(cols);
    const list = el('div', 'ei-ladder');
    let marked = false;
    for (const b of book.buckets) {
      if (!marked && b.price <= book.price) { const now = el('div', 'ei-row ei-row-now'); now.append(el('span'), el('strong', 'edge-mono', book.price.toFixed(digits)), el('span', 'edge-muted', 'now')); list.append(now); marked = true; }
      const row = el('div', 'ei-row'), s = el('span', 'ei-left'), l = el('span', 'ei-right'), sb = el('i', 'ei-short'), lb = el('i', 'ei-long');
      sb.style.width = (b.short / max * 100) + '%'; lb.style.width = (b.long / max * 100) + '%'; s.append(sb); l.append(lb);
      s.title = `${shortLabel} ${b.short.toFixed(2)}%`; l.title = `${longLabel} ${b.long.toFixed(2)}%`;
      row.append(s, el('span', 'edge-mono ei-price', b.price.toFixed(digits)), l); list.append(row);
    }
    card.append(list);
  }
  function renderOrders(symbol) {
    const card = $('ei-orders'), book = state.desk?.books?.markets?.[symbol]?.orderBook, digits = DIGITS[symbol] || 5;
    if (!book) { head(card, 'KEY PRICE LEVELS', 'Where price sits against recent highs, lows and pivots'); keyLevels(card, symbol); return; }
    head(card, 'ORDER BOOK', 'Pending orders by price');
    ladder(card, book, digits, 'BUY ORDERS', 'SELL ORDERS');
    const wall = [...book.buckets].sort((a, b) => Math.max(b.long, b.short) - Math.max(a.long, a.short))[0];
    card.append(el('p', 'ei-small', `Largest cluster: ${wall.long >= wall.short ? 'buy' : 'sell'} orders near ${wall.price.toFixed(digits)}.`), el('p', 'ei-foot', `OANDA client order book · ${ago(book.time)} · % of all pending orders per price bucket.`));
  }
  function renderPositions(symbol, market) {
    const card = $('ei-positions'), book = state.desk?.books?.markets?.[symbol]?.positionBook, digits = DIGITS[symbol] || 5;
    if (book) {
      head(card, 'POSITION BOOK', 'Open trades by entry price');
      const longs = book.longTotal, shorts = book.shortTotal, total = longs + shorts || 1;
      const split = el('div', 'ei-split'); const a = el('span', 'ei-split-long', `Long ${Math.round(longs / total * 100)}%`), b = el('span', 'ei-split-short', `Short ${Math.round(shorts / total * 100)}%`);
      a.style.width = longs / total * 100 + '%'; b.style.width = shorts / total * 100 + '%'; split.append(a, b); card.append(split);
      ladder(card, book, digits, 'LONG', 'SHORT');
      card.append(el('p', 'ei-foot', `OANDA client position book · ${ago(book.time)}.`));
      return;
    }
    head(card, 'POSITION BOOK', 'How futures traders are positioned');
    const pos = market?.positioning, history = (pos?.history || []).slice(-26);
    if (!history.length || !finite(pos?.net?.value)) return empty(card, 'Positioning data is not available for this market.');
    const net = pos.net.value, longPct = Math.round((1 + net) / 2 * 100);
    const split = el('div', 'ei-split'); const a = el('span', 'ei-split-long', `Long ${longPct}%`), b = el('span', 'ei-split-short', `Short ${100 - longPct}%`);
    a.style.width = longPct + '%'; b.style.width = (100 - longPct) + '%'; split.append(a, b); card.append(split);
    card.append(el('p', 'ei-small', `Net ${net >= 0 ? 'long' : 'short'} ${Math.abs(Math.round(net * 100))}% · ${pos.crowded?.value ? 'crowded (beyond its usual 85th-percentile range)' : 'not crowded'} · report ${pos.reportDate || ''}`));
    const max = Math.max(0.05, ...history.map(h => Math.abs(h.net)));
    const chart = el('div', 'ei-weeks'); chart.setAttribute('role', 'img'); chart.setAttribute('aria-label', `Weekly net positioning for the last ${history.length} weeks, latest ${Math.round(net * 100)}%`);
    for (const h of history) { const col = el('span'), bar = el('i', h.net >= 0 ? 'ei-long' : 'ei-short'); bar.style.height = Math.abs(h.net) / max * 50 + '%'; bar.style[h.net >= 0 ? 'bottom' : 'top'] = '50%'; col.title = `${h.date}: ${Math.round(h.net * 100)}%`; col.append(bar); chart.append(col); }
    card.append(chart);
    const axis = el('div', 'ei-axis edge-mono'); axis.append(el('span', '', history[0].date), el('span', '', '26 weeks'), el('span', '', history.at(-1).date)); card.append(axis);
    card.append(el('p', 'ei-foot', 'CFTC Commitments of Traders · weekly net (long − short) / (long + short) for speculators. Broker price-level position data appears here once that feed is enabled.'));
  }


  /* Price path + returns (from completed Dukascopy daily bars; live delayed quote marks the latest point). */
  function pricePath(card, symbol) {
    const bars = (state.bars[symbol]?.bars || []).filter(b => finite(b.close)); if (bars.length < 30) return;
    const digits = DIGITS[symbol] || 5, live = state.quotes[symbol]?.price, last = finite(live) ? live : bars.at(-1).close;
    const pts = bars.slice(-130).map(b => b.close); if (finite(live)) pts.push(live);
    const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1, n = pts.length - 1;
    const line = pts.map((v, i) => `${(i / n * 600).toFixed(1)},${(96 - (v - min) / span * 88).toFixed(1)}`).join(' ');
    const up = last >= pts[0], ns = 'http://www.w3.org/2000/svg';
    const wrap = el('div', 'ei-path'), svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 600 100'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${labelOf(symbol)} daily closes for the last ${pts.length} sessions, from ${pts[0].toFixed(digits)} to ${last.toFixed(digits)}`);
    const area = document.createElementNS(ns, 'polygon'); area.setAttribute('points', `0,100 ${line} 600,100`); area.setAttribute('class', up ? 'ei-path-area-up' : 'ei-path-area-down');
    const pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', line); pl.setAttribute('class', up ? 'ei-path-up' : 'ei-path-down');
    svg.append(area, pl);
    const top = el('div', 'ei-path-head'); top.append(el('span', 'edge-eyebrow', 'PRICE PATH · ~6 MONTHS'), el('span', 'edge-mono edge-muted', `${min.toFixed(digits)} – ${max.toFixed(digits)}`));
    const ret = el('div', 'ei-returns');
    const lastTime = Date.parse(bars.at(-1).time);
    for (const [label, days] of [['1W', 7], ['1M', 30], ['3M', 91], ['6M', 182], ['1Y', 365]]) {
      const ref = [...bars].reverse().find(b => Date.parse(b.time) <= lastTime - days * 86400000); if (!ref) continue;
      const chg = (last / ref.close - 1) * 100, chip = el('span', chg >= 0 ? 'ei-ret ei-up' : 'ei-ret ei-down');
      chip.append(el('small', '', label), document.createTextNode(`${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`)); ret.append(chip);
    }
    wrap.append(top, svg, ret); card.append(wrap);
  }
  /* Key levels: previous session, classic floor pivots, 20-day and 52-week extremes. Used while the broker order book is not connected. */
  function keyLevels(card, symbol) {
    const bars = (state.bars[symbol]?.bars || []).filter(b => finite(b.high) && finite(b.low) && finite(b.close)), digits = DIGITS[symbol] || 5;
    if (bars.length < 20) return empty(card, 'Daily price history for this market is unavailable right now.');
    const p = bars.at(-1), P = (p.high + p.low + p.close) / 3, last20 = bars.slice(-20), year = bars.slice(-252);
    const now = state.quotes[symbol]?.price ?? p.close;
    const levels = [
      ['52-week high', Math.max(...year.map(b => b.high))], ['20-day high', Math.max(...last20.map(b => b.high))],
      ['R2 pivot', P + (p.high - p.low)], ['R1 pivot', 2 * P - p.low], ['Previous high', p.high], ['Pivot', P], ['Previous low', p.low],
      ['S1 pivot', 2 * P - p.high], ['S2 pivot', P - (p.high - p.low)], ['20-day low', Math.min(...last20.map(b => b.low))], ['52-week low', Math.min(...year.map(b => b.low))]
    ].sort((a, b) => b[1] - a[1]);
    const list = el('div', 'ei-levels'); let marked = false;
    for (const [label, value] of levels) {
      if (!marked && value <= now) { const r = el('div', 'ei-level ei-level-now'); r.append(el('span', '', state.quotes[symbol] ? 'Price now (delayed)' : 'Last close'), el('strong', 'edge-mono', now.toFixed(digits)), el('span', 'edge-mono', '')); list.append(r); marked = true; }
      const dist = (value / now - 1) * 100, r = el('div', 'ei-level' + (value >= now ? ' ei-level-above' : ' ei-level-below'));
      r.append(el('span', '', label), el('strong', 'edge-mono', value.toFixed(digits)), el('span', 'edge-mono edge-muted', `${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%`)); list.append(r);
    }
    if (!marked) { const r = el('div', 'ei-level ei-level-now'); r.append(el('span', '', 'Price now'), el('strong', 'edge-mono', now.toFixed(digits)), el('span')); list.append(r); }
    card.append(list, el('p', 'ei-foot', `Computed from the ${String(p.time).slice(0, 10)} daily candle and the last year of Dukascopy bid candles. Broker order-book clusters replace this once that feed is enabled.`));
  }

  /* --- orchestration -------------------------------------------------------- */
  function render() {
    const symbol = state.symbol, market = state.edge?.markets?.find(m => m.symbol === symbol);
    const bars = state.bars[symbol]?.bars, vol = bars ? M.volDistribution(bars, {symbol, pip: PIP[symbol]}) : null;
    const bias = M.smartBias(pairOf(symbol), {desk: state.desk, edgeMarket: market, livePrice: state.quotes[symbol]?.price});
    renderStory(symbol, market, bias, vol); renderBias(symbol, bias); renderVol(symbol, vol); renderOrders(symbol); renderPositions(symbol, market);
    const status = $('ei-status'), parts = [];
    if (state.edge) parts.push(`Edge Radar snapshot ${ago(state.edge.generatedAt)}`);
    if (state.desk) parts.push(`rates ${ago(state.desk.generatedAt)}`);
    if (state.quotes[symbol]) parts.push('live quote, delayed');
    status.textContent = state.loaded ? (parts.length ? parts.join(' · ') : 'Market data is temporarily unavailable. Try again shortly.') : 'Loading market focus…';
    root.setAttribute('aria-busy', String(!state.loaded));
  }
  function buildPicker() {
    const select = $('ei-market'); select.replaceChildren();
    const groups = new Map();
    for (const m of markets) { if (!groups.has(m.group)) { const g = document.createElement('optgroup'); g.label = m.group; groups.set(m.group, g); select.append(g); } const o = el('option', '', m.label); o.value = m.id; groups.get(m.group).append(o); }
    select.value = state.symbol;
    select.addEventListener('change', async () => {
      const id = select.value; if (!PIP[id]) return;
      if (fixed) { location.href = `/edge-radar/${id.toLowerCase()}/`; return; }
      state.symbol = id; savePref(id); render(); await loadBars(id); render();
    });
  }
  async function start() {
    buildPicker(); render();
    await Promise.allSettled([loadEdge(), loadDesk(), loadQuotes(), loadHeadlines(), loadBars(state.symbol)]);
    state.loaded = true; render();
  }
  const every = (ms, task) => setInterval(async () => { if (!document.hidden) { await task(); render(); } }, ms);
  every(60000, loadQuotes); every(120000, loadHeadlines); every(300000, loadDesk); every(1800000, async () => { state.bars = {}; await Promise.allSettled([loadEdge(), loadBars(state.symbol)]); });
  start();
})();
