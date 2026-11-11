/* Macro Desk page. Renders only attributed data; all text from sources goes in via textContent. */
(() => {
  'use strict';
  const M = window.FynxMacroModel;
  if (!M) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const DESK_URL = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/macro-data/desk.json';
  const EDGE_URLS = ['https://raw.githubusercontent.com/EA-LA/FYNX-web/research-data/assets/data/research/edge.json', '/assets/data/research/edge.json'];
  const QUOTES_URL = (local ? '/api/research' : 'https://us-central1-fynx-c7a28.cloudfunctions.net/webResearchData') + '?action=quotes&symbols=' + encodeURIComponent(M.PAIRS.map(p => p.quoteSymbol).filter(Boolean).join(','));
  const $ = id => document.getElementById(id);
  const state = {desk: null, deskError: null, edge: null, schedule: null, quotes: {}, quotesAt: null, headlines: [], curve: 'US', paused: false};
  const finite = v => typeof v === 'number' && Number.isFinite(v);

  /* --- helpers ----------------------------------------------------------- */
  function el(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined && text !== null) n.textContent = text; return n; }
  function link(text, href, className) {
    const a = el('a', className, text);
    try { const u = new URL(href, location.href); if (!['https:', 'http:'].includes(u.protocol)) return el('span', className, text); a.href = u.href; if (u.origin !== location.origin) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } } catch { return el('span', className, text); }
    return a;
  }
  const signed = (v, digits = 0, unit = '') => finite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}${unit}` : '—';
  const pct = (v, d = 2) => finite(v) ? `${v.toFixed(d)}%` : '—';
  const dateLabel = iso => { const t = Date.parse(iso.length === 10 ? iso + 'T12:00:00Z' : iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: iso.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric'}) : iso; };
  const timeLabel = ms => new Date(ms).toLocaleString(undefined, {weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'});
  const ago = iso => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return !Number.isFinite(m) ? '' : m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  const signClass = v => !finite(v) || Math.abs(v) < 0.5 ? 'md-flat' : v > 0 ? 'md-up' : 'md-down';

  async function getJSON(url, {timeout = 20000, bust = false} = {}) {
    const target = bust ? url + (url.includes('?') ? '&' : '?') + 't=' + Math.floor(Date.now() / 120000) : url;
    const response = await fetch(target, {signal: AbortSignal.timeout(timeout), credentials: 'omit', referrerPolicy: 'no-referrer', headers: {Accept: 'application/json'}});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const text = await response.text();
    if (text.length > 6e6) throw new Error('Response too large');
    return JSON.parse(text);
  }
  const report = (op, error) => { try { window.FynxMonitor?.report('feed', 'macro-' + op, error); } catch {} };

  /* --- loaders ----------------------------------------------------------- */
  async function loadSchedule() { if (!state.schedule) state.schedule = await getJSON('/assets/data/macro/central-banks.json'); }
  async function loadDesk() {
    try { state.desk = M.validateDesk(await getJSON(DESK_URL, {bust: true})); state.deskError = null; }
    catch (error) { state.deskError = error; report('desk', error); }
  }
  async function loadEdge() {
    for (const url of EDGE_URLS) {
      try { const data = await getJSON(url, {bust: url.startsWith('https:')}); if (Array.isArray(data?.markets)) { state.edge = data; return; } }
      catch (error) { report('edge', error); }
    }
  }
  async function loadQuotes() {
    try {
      const data = await getJSON(QUOTES_URL, {timeout: 25000});
      const quotes = {};
      for (const pair of M.PAIRS) {
        const q = data?.quotes?.[pair.quoteSymbol];
        if (q && finite(q.price) && q.price > 0 && Date.now() - Date.parse(q.asOf) < 4 * 86400000) quotes[pair.id] = {price: q.price, changePercent: finite(q.changePercent) ? q.changePercent : null, asOf: q.asOf, source: q.source || 'Yahoo Finance'};
      }
      state.quotes = quotes; state.quotesAt = data?.fetchedAt || new Date().toISOString();
    } catch (error) { report('quotes', error); }
  }
  async function loadHeadlines(force = false) {
    const data = window.FynxTerminalData;
    if (!data?.loadBriefing) return;
    try { const result = await data.loadBriefing({force}); state.headlines = (result.items || []).slice(0, 24); }
    catch (error) { report('headlines', error); }
  }

  /* --- headline ticker ---------------------------------------------------- */
  function renderTicker() {
    const track = $('md-ticker'); track.replaceChildren();
    const items = state.headlines.slice(0, 16);
    if (!items.length) { track.append(el('span', 'md-ticker-empty', 'Headlines are temporarily unavailable. Open News for source links.')); track.classList.remove('md-animate'); return; }
    for (const copy of [0, 1]) {
      for (const item of items) {
        const a = link('', item.readerUrl || item.url, 'md-headline');
        if (copy) { a.setAttribute('aria-hidden', 'true'); a.tabIndex = -1; }
        a.append(el('time', 'md-mono', new Date(item.publishedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})), el('span', item.kind === 'official-release' ? 'md-dot md-dot-official' : 'md-dot', ''), el('strong', '', item.title), el('span', 'md-src', item.source));
        a.querySelector('time').dateTime = item.publishedAt;
        track.append(a);
      }
    }
    track.style.setProperty('--md-duration', Math.max(40, items.length * 7) + 's');
    track.classList.add('md-animate');
  }

  /* --- story -------------------------------------------------------------- */
  function biasRows() {
    return M.PAIRS.map(pair => ({pair, result: M.smartBias(pair, {desk: state.desk, edgeMarket: state.edge?.markets?.find(m => m.symbol === pair.id), livePrice: state.quotes[pair.id]?.price})}));
  }
  function renderStory(rows) {
    const story = M.composeStory({desk: state.desk, banks: state.schedule?.banks || [], headlines: state.headlines, bias: rows.map(r => r.result)});
    $('md-story-time').textContent = `TODAY'S STORY · ${new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit', timeZoneName: 'short'})}`;
    const body = $('md-story-body'); body.replaceChildren();
    if (!story.available) { $('md-story-title').textContent = 'Today’s story is waiting for data'; body.append(el('p', 'md-muted', 'The rate data could not be loaded. Try Refresh now.')); return; }
    $('md-story-title').textContent = story.title;
    const p = el('p', 'md-story-text', story.lines.join(' ')); body.append(p);
    if (story.facts.length) {
      const grid = el('div', 'md-facts');
      for (const f of story.facts) { const card = el('div', 'md-fact'); card.append(el('span', 'md-eyebrow', f.label), el('strong', '', f.value), el('small', 'md-muted', f.note)); grid.append(card); }
      body.append(grid);
    }
    if (story.lead) {
      const lead = el('p', 'md-lead'); lead.append(el('span', 'md-eyebrow', 'TOP HEADLINE'), link(story.lead.title, story.lead.url), el('small', 'md-muted', ` · ${story.lead.source} · ${ago(story.lead.publishedAt)}`));
      body.append(lead);
    }
    body.append(el('p', 'md-foot', 'Written automatically from the figures on this page' + (story.sources.length ? ': ' + story.sources.join(' · ') : '') + '. No opinions added.'));
  }

  /* --- central banks ------------------------------------------------------ */
  function oddsBar(odds) {
    const wrap = el('div', 'md-odds');
    const bar = el('div', 'md-odds-bar'); bar.setAttribute('role', 'img');
    const parts = [['cut50', 'md-cut2', 'Cut 50 bp'], ['cut', 'md-cut', 'Cut 25 bp'], ['hold', 'md-hold', 'No change'], ['hike', 'md-hike', 'Hike 25 bp'], ['hike50', 'md-hike2', 'Hike 50 bp']].filter(([k]) => odds[k] > 0);
    bar.setAttribute('aria-label', parts.map(([k, , label]) => `${label} ${odds[k]}%`).join(', '));
    for (const [k, cls] of parts) { const s = el('span', cls); s.style.width = odds[k] + '%'; bar.append(s); }
    const legend = el('div', 'md-odds-legend');
    for (const [k, cls, label] of parts) { const s = el('span'); s.append(el('i', 'md-key ' + cls), document.createTextNode(`${label} ${Math.round(odds[k])}%`)); legend.append(s); }
    wrap.append(bar, legend);
    return wrap;
  }
  // Column names for the stacked phone layout (td::before reads data-label).
  function labelCells(tr, labels) { tr.querySelectorAll('td').forEach((td, i) => { if (labels[i]) td.dataset.label = labels[i]; }); }
  function renderBanks() {
    const tbody = $('md-banks'); tbody.replaceChildren();
    const banks = state.schedule?.banks || [], desk = state.desk, now = Date.now();
    for (const bank of banks) {
      const tr = el('tr');
      const name = el('th'); name.scope = 'row'; name.append(el('strong', '', bank.name), el('small', 'md-muted', `${bank.currency} · ${bank.instrument}`)); tr.append(name);
      const rateCell = el('td');
      const rate = M.policyRate(bank.currency, desk);
      if (rate) {
        rateCell.append(el('strong', 'md-mono md-big', rate.display), el('small', 'md-muted', `${rate.source}, ${dateLabel(rate.observationDate)}`));
        const last = M.lastDecisionBefore(bank, now);
        if (last && last > rate.observationDate) rateCell.append(el('small', 'md-warn', `Decision on ${dateLabel(last)} is after this reading — check the bank.`));
      } else rateCell.append(el('span', 'md-muted', 'Unavailable'));
      tr.append(rateCell);
      const nextCell = el('td'), next = M.nextDecision(bank, now);
      if (next) {
        nextCell.append(el('strong', '', next.timeKnown ? timeLabel(next.at) : dateLabel(next.date)));
        const cd = el('small', 'md-countdown md-mono', next.timeKnown ? 'in ' + M.countdown(next.at - now) : next.daysAway === 0 ? 'today' : `in ${next.daysAway} days`);
        cd.dataset.at = next.timeKnown ? String(next.at) : ''; nextCell.append(cd);
        if (!next.timeKnown && bank.timeNote) nextCell.append(el('small', 'md-muted', bank.timeNote));
      } else nextCell.append(el('span', 'md-muted', 'No published date yet'));
      nextCell.append(link('Official calendar ↗︎', bank.calendarURL, 'md-small-link'));
      tr.append(nextCell);
      const pricing = el('td');
      const odds = bank.area === 'US' && desk?.fed?.odds && next && desk.fed.odds.meeting === next.date ? desk.fed.odds : null;
      if (odds) {
        pricing.append(oddsBar(odds), el('small', 'md-muted', `Futures imply ${signed(odds.expectedChangeBp, 0, ' bp')} · ${dateLabel(odds.contracts?.[0]?.asOf || desk.generatedAt)}`));
      } else pricing.append(el('span', 'md-muted md-small', bank.area === 'US' ? 'Futures pricing unavailable right now.' : 'No free public futures feed for this bank.'));
      tr.append(pricing);
      const week = el('td');
      const events = (desk?.events?.events || []).filter(e => e.currency === bank.currency && Date.parse(e.time) >= now - 3600000).slice(0, 3);
      if (events.length) { const ul = el('ul', 'md-events'); for (const e of events) { const li = el('li'); li.append(el('span', 'md-mono md-small', new Date(e.time).toLocaleString([], {weekday: 'short', hour: 'numeric', minute: '2-digit'})), document.createTextNode(' ' + e.title)); ul.append(li); } week.append(ul); }
      else week.append(el('span', 'md-muted md-small', 'Nothing scheduled'));
      tr.append(week);
      labelCells(tr, ['Policy rate', 'Next decision', 'Market pricing', 'This week']);
      tbody.append(tr);
    }
    const foot = $('md-banks-foot'); foot.replaceChildren();
    foot.append(document.createTextNode('Rates: '), link('BIS', 'https://data.bis.org/topics/CBPOL'), document.createTextNode(' (weekly) and the '), link('New York Fed', 'https://www.newyorkfed.org/markets/reference-rates/effr'), document.createTextNode(' for the Fed target range. Fed odds: simplified estimate from CBOT 30-Day Fed Funds futures (delayed). Events: '), link('Forex Factory calendar', 'https://www.forexfactory.com/calendar'), document.createTextNode(`. Meeting dates checked ${dateLabel(state.schedule?.verifiedAt || '')}.`));
  }
  function tickCountdowns() {
    const now = Date.now();
    document.querySelectorAll('.md-countdown[data-at]').forEach(node => { const at = Number(node.dataset.at); if (at) node.textContent = 'in ' + M.countdown(at - now); });
  }

  /* --- curves ------------------------------------------------------------- */
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };
  function renderChart(view, area) {
    const host = $('md-chart'); host.replaceChildren();
    const W = 640, H = 300, L = 48, R = 16, T = 18, B = 34;
    const rows = view.rows, values = rows.flatMap(r => [r.value, r.week, r.month]).filter(finite);
    let lo = Math.min(...values), hi = Math.max(...values); const pad = Math.max(0.1, (hi - lo) * 0.12); lo -= pad; hi += pad;
    const x = i => L + (rows.length === 1 ? 0 : i * (W - L - R) / (rows.length - 1)), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
    const chart = svg('svg', {viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'md-svg'});
    const ten = rows.find(r => r.tenor === '10Y');
    chart.setAttribute('aria-label', `${M.AREAS[area].label} yield curve on ${view.latestDate}, from ${pct(rows[0].value)} at ${rows[0].tenor} to ${pct(rows.at(-1).value)} at ${rows.at(-1).tenor}${ten ? `; 10-year ${pct(ten.value)}` : ''}. Full values are in the table.`);
    const step = (hi - lo) > 2 ? 0.5 : (hi - lo) > 0.8 ? 0.25 : 0.1;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      chart.append(svg('line', {x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'md-grid'}));
      const t = svg('text', {x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'md-axis'}); t.textContent = v.toFixed(step < 0.25 ? 1 : 2) + '%'; chart.append(t);
    }
    rows.forEach((r, i) => { const t = svg('text', {x: x(i), y: H - 10, 'text-anchor': 'middle', class: 'md-axis'}); t.textContent = r.tenor; chart.append(t); });
    for (const [key, cls] of [['month', 'md-line-month'], ['week', 'md-line-week'], ['value', 'md-line-today']]) {
      const pts = rows.map((r, i) => finite(r[key]) ? `${x(i).toFixed(1)},${y(r[key]).toFixed(1)}` : null).filter(Boolean);
      if (pts.length > 1) chart.append(svg('polyline', {points: pts.join(' '), class: cls, fill: 'none'}));
    }
    rows.forEach((r, i) => { const c = svg('circle', {cx: x(i), cy: y(r.value), r: 4, class: 'md-point'}); const tt = svg('title'); tt.textContent = `${r.tenor}: ${pct(r.value, 3)} (${view.latestDate})`; c.append(tt); chart.append(c); });
    host.append(chart);
  }
  function renderCurves() {
    const area = state.curve, curve = state.desk?.curves?.[area], view = M.curveView(curve);
    document.querySelectorAll('#md-curve-tabs [role=tab]').forEach(tab => {
      const selected = tab.dataset.area === area;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      tab.disabled = !state.desk?.curves?.[tab.dataset.area] && Boolean(state.desk);
    });
    $('md-curve-panel').setAttribute('aria-labelledby', 'md-tab-' + area);
    const tbody = $('md-tenors'), cards = $('md-spreads'), foot = $('md-curve-foot');
    tbody.replaceChildren(); cards.replaceChildren(); foot.replaceChildren();
    if (!view) { $('md-chart').replaceChildren(el('p', 'md-muted md-empty', state.deskError ? 'Yield curve data is temporarily unavailable. Try again shortly.' : 'Loading yield curve…')); return; }
    renderChart(view, area);
    for (const r of view.rows) {
      const tr = el('tr'); const th = el('th', '', r.tenor); th.scope = 'row';
      tr.append(th, el('td', 'md-mono', pct(r.value, 3)), el('td', 'md-mono ' + signClass(r.weekChangeBp), signed(r.weekChangeBp, 0, ' bp')), el('td', 'md-mono ' + signClass(r.monthChangeBp), signed(r.monthChangeBp, 0, ' bp')));
      tbody.append(tr);
    }
    const card = (label, value, note) => { const c = el('div', 'md-fact'); c.append(el('span', 'md-eyebrow', label), el('strong', 'md-mono', value), el('small', 'md-muted', note)); cards.append(c); };
    if (view.spread) card(view.spread.label + ' spread', signed(view.spread.bp, 0, ' bp'), finite(view.spread.monthChangeBp) ? `${signed(view.spread.monthChangeBp, 0, ' bp')} in a month` : 'Long minus short yield');
    const us = M.curveView(state.desk?.curves?.US);
    if (area !== 'US' && us && finite(us.tenYear) && finite(view.tenYear)) card('US 10Y premium', signed((us.tenYear - view.tenYear) * 100, 0, ' bp'), `US vs ${M.AREAS[area].short}`);
    const status = state.desk?.status?.['curve-' + area];
    foot.append(document.createTextNode(`Latest close ${dateLabel(view.latestDate)}${view.weekDate ? ` · week compare ${dateLabel(view.weekDate)}` : ''}${view.monthDate ? ` · month compare ${dateLabel(view.monthDate)}` : ''} · Source: `), link(curve.source, curve.sourceURL));
    if (status?.status === 'stale') foot.append(el('span', 'md-warn', ' · The source did not refresh on the last check; showing the last saved data.'));
  }
  function renderLiveYields() {
    const host = $('md-live-yields'); host.replaceChildren();
    const live = state.desk?.liveUS;
    if (!live?.quotes?.length || state.curve !== 'US') { host.hidden = true; return; }
    host.hidden = false;
    host.append(el('span', 'md-eyebrow', 'US YIELDS NOW'));
    for (const q of live.quotes) {
      const change = finite(q.previousClose) ? (q.price - q.previousClose) * 100 : null;
      const item = el('div', 'md-live-item'); item.append(el('span', 'md-muted', q.tenor), el('strong', 'md-mono', pct(q.price, 3)), el('span', 'md-mono ' + signClass(change), signed(change, 1, ' bp')));
      host.append(item);
    }
    const asOf = live.quotes.map(q => Date.parse(q.asOf)).sort().at(-1);
    host.append(el('small', 'md-muted', `Cboe yield indices, delayed · ${asOf ? new Date(asOf).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) : ''}`));
  }

  /* --- smart bias --------------------------------------------------------- */
  function renderBias(rows) {
    const tbody = $('md-bias'); tbody.replaceChildren();
    for (const {pair, result} of rows) {
      const tr = el('tr');
      const th = el('th'); th.scope = 'row'; th.append(link(`${pair.base}/${pair.quote}`, `/edge-radar/${pair.id.toLowerCase()}/`, 'md-pair')); tr.append(th);
      const q = state.quotes[pair.id], edgeMarket = state.edge?.markets?.find(m => m.symbol === pair.id);
      const priceCell = el('td', 'md-mono');
      if (q) { priceCell.append(el('strong', '', q.price.toFixed(pair.quote === 'JPY' ? 3 : 5)), el('small', signClass(q.changePercent), signed(q.changePercent, 2, '%'))); }
      else if (finite(edgeMarket?.state?.close?.value)) priceCell.append(el('strong', '', edgeMarket.state.close.value.toFixed(pair.quote === 'JPY' ? 3 : 5)), el('small', 'md-muted', 'daily close ' + dateLabel(edgeMarket.state.date || edgeMarket.asOf)));
      else priceCell.append(el('span', 'md-muted', '—'));
      tr.append(priceCell);
      const scoreCell = el('td');
      if (finite(result.score)) {
        const meter = el('div', 'md-meter'); meter.setAttribute('role', 'img'); meter.setAttribute('aria-label', `${result.label}, score ${result.score}`);
        const fill = el('span', result.score >= 0 ? 'md-meter-up' : 'md-meter-down'); const w = Math.abs(result.score) / 2;
        fill.style.width = w + '%'; fill.style.left = (result.score >= 0 ? 50 : 50 - w) + '%'; meter.append(el('i', 'md-meter-mid'), fill);
        scoreCell.append(el('strong', 'md-score ' + (result.score >= 15 ? 'md-up' : result.score <= -15 ? 'md-down' : 'md-flat'), `${result.label} ${result.score > 0 ? '+' : ''}${result.score}`), meter, el('small', 'md-muted', `${result.coverage}% of inputs available`));
      } else scoreCell.append(el('span', 'md-muted', result.reason));
      tr.append(scoreCell);
      const parts = el('td'); const ul = el('ul', 'md-parts');
      for (const c of result.components) { const li = el('li'); li.append(el('span', 'md-chip ' + signClass(c.score), `${c.label} ${c.score > 0 ? '+' : ''}${c.score}`), el('small', 'md-muted', `${c.detail}${c.weight ? ` · weight ${c.weight}%` : ''}`)); ul.append(li); }
      parts.append(ul); tr.append(parts);
      labelCells(tr, ['Price', 'Bias', 'What drives it']);
      tbody.append(tr);
    }
  }

  /* --- status & orchestration --------------------------------------------- */
  function renderStatus() {
    const s = $('md-status'); s.classList.remove('md-warn');
    if (state.desk) {
      const names = {'curve-US': 'US curve', 'curve-EA': 'euro area curve', 'curve-GB': 'UK curve', 'curve-JP': 'Japan curve', 'live-us': 'live yields', fed: 'Fed futures', rates: 'policy rates', events: 'events'};
      const stale = Object.entries(state.desk.status).filter(([, v]) => v.status !== 'fresh').map(([k]) => names[k] || k);
      s.textContent = `Rates snapshot updated ${ago(state.desk.generatedAt)} · checks every 15 min${state.quotesAt ? ` · FX quotes ${ago(state.quotesAt)}` : ''}${stale.length ? ` · Not refreshed: ${stale.join(', ')}` : ''}`;
      if (stale.length) s.classList.add('md-warn');
    } else if (state.deskError) { s.textContent = 'The rates snapshot is temporarily unavailable. Headlines and FX quotes still update.'; s.classList.add('md-warn'); }
    const sources = new Set();
    for (const key of ['liveUS', 'fed', 'rates', 'events']) if (state.desk?.[key]?.source) sources.add(state.desk[key].source);
    for (const c of Object.values(state.desk?.curves || {})) sources.add(c.source);
    if (state.edge) sources.add('FYNX Edge Radar research snapshot (Dukascopy prices, CFTC positioning)');
    if (Object.keys(state.quotes).length) sources.add('FX quotes: Yahoo Finance (delayed)');
    if (state.headlines.length) sources.add('Headlines: publisher RSS and official releases via FYNX News');
    $('md-sources').textContent = sources.size ? [...sources].join(' · ') + '.' : 'Sources appear here once data loads.';
  }
  function renderAll() {
    const rows = biasRows();
    renderTicker(); renderStory(rows); renderBanks(); renderLiveYields(); renderCurves(); renderBias(rows); renderStatus();
    $('md-main').setAttribute('aria-busy', 'false');
  }
  async function refresh(force = false) {
    const button = $('md-refresh'); button.disabled = true;
    await Promise.allSettled([loadSchedule(), loadDesk(), loadQuotes(), loadHeadlines(force), state.edge && !force ? null : loadEdge()]);
    renderAll(); button.disabled = false;
  }

  $('md-refresh').addEventListener('click', () => refresh(true));
  $('md-curve-tabs').addEventListener('click', event => { const tab = event.target.closest('[role=tab]'); if (tab && !tab.disabled) { state.curve = tab.dataset.area; renderLiveYields(); renderCurves(); } });
  $('md-curve-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll('#md-curve-tabs [role=tab]:not(:disabled)')], i = tabs.findIndex(t => t.dataset.area === state.curve);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); state.curve = tabs[next].dataset.area; renderLiveYields(); renderCurves(); tabs[next].focus();
  });
  $('md-ticker-toggle').addEventListener('click', event => {
    state.paused = !state.paused; event.currentTarget.setAttribute('aria-pressed', String(state.paused)); event.currentTarget.textContent = state.paused ? 'Play' : 'Pause';
    $('md-ticker').classList.toggle('md-paused', state.paused);
  });

  const every = (ms, task) => setInterval(() => { if (!document.hidden) task(); }, ms);
  every(60000, async () => { await loadQuotes(); const rows = biasRows(); renderBias(rows); renderStory(rows); renderStatus(); });
  every(120000, async () => { await loadHeadlines(); renderTicker(); renderStory(biasRows()); renderStatus(); });
  every(300000, async () => { await loadDesk(); renderAll(); });
  every(1800000, async () => { await loadEdge(); renderAll(); });
  every(30000, tickCountdowns);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
})();
