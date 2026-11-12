/* FYNX Terminal full pages. Every "open", "detail" or site link inside the terminal lands here, in the terminal's own
 * design, so people never leave the terminal until they press Exit. Back (button, Esc or browser back) returns to the
 * previous terminal page or the desk. Outside sources open in a new tab. Text is inserted with textContent only. */
window.FynxTerminalPages = T => {
  'use strict';
  const {S, M, $, el, btn, link, svg, kv, inspect, signed, tone, ago, hhmm, day, fmt, big, count, finite, empty, rowButton} = T;
  const root = $('fx-page'), body = $('fx-page-body');
  // Keyboard access (site-qa run 72): table rows that open a market or country on click (COT, central banks,
  // Smart Bias, Edge, listings, countries...) were mouse/touch only. Each becomes focusable; Enter or Space opens it.
  const keyRows = n => { if (n.nodeType !== 1) return; for (const tr of n.matches('tr.pg-click') ? [n] : n.querySelectorAll('tr.pg-click')) if (!tr.hasAttribute('tabindex')) { tr.tabIndex = 0; tr.setAttribute('role', 'button'); tr.dataset.kbRow = '1'; } };
  if (body) {
    new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(keyRows); }).observe(body, {childList: true, subtree: true});
    body.addEventListener('keydown', e => { const tr = e.target; if (tr?.dataset?.kbRow !== '1' || (e.key !== 'Enter' && e.key !== ' ')) return; e.preventDefault(); tr.click(); });
  }
  if (!root || !body) return null;
  const stack = [];
  let token = 0;

  /* --- page chrome ----------------------------------------------------------- */
  const section = (title, cls) => { const s = el('section', 'pg-sec' + (cls ? ' ' + cls : '')); if (title) s.append(el('h2', 'pg-h2', title)); return s; };
  const grid = cls => el('div', 'pg-grid ' + (cls || ''));
  const cards = (rows) => { const out = el('div', 'pg-cards'); for (const [k, v, cls, note] of rows) { const d = el('div'); d.append(el('span', '', k), el('b', cls || '', v)); if (note) d.append(el('small', '', note)); out.append(d); } return out; };
  const chips = list => { const c = el('div', 'fx-chips'); list.filter(Boolean).forEach(x => c.append(x)); return c; };
  const go = (label, name, arg) => btn(label + ' ▸', 'fx-chip fx-chip-link', () => open(name, arg));
  const pageTabs = (items, current, onPick) => { const host = el('div', 'pg-tabs'); for (const [v, l] of items) { const b = btn(l, v === current ? 'on' : '', () => onPick(v)); b.setAttribute('aria-pressed', String(v === current)); host.append(b); } return host; };
  const sourceNote = text => el('p', 'pg-note', text);
  function setHead(code, title, sub) { $('fx-page-code').textContent = code; $('fx-page-name').textContent = title; $('fx-page-sub').textContent = sub || ''; document.title = `${code} ${title} · FYNX Terminal`; }
  function crumbs() {
    const nav = $('fx-page-crumbs'); nav.replaceChildren();
    const home = btn(`${T.D().label} desk`, 'pg-crumb', () => closeAll()); nav.append(home);
    stack.forEach((p, i) => { nav.append(el('span', 'pg-sep', '›')); if (i === stack.length - 1) nav.append(el('span', 'pg-crumb on', label(p))); else nav.append(btn(label(p), 'pg-crumb', () => history.go(-(stack.length - 1 - i)))); });
  }
  const NAMES = {help: 'Help', sources: 'Sources', news: 'News', article: 'Article', des: 'Security', fa: 'Financials', research: 'Research', macro: 'Macro Desk', cb: 'Central bank', bias: 'Smart Bias', edge: 'Edge Radar', mkts: 'Markets', cal: 'Calendar', journal: 'Journal', calc: 'Calculators', options: 'Options', vol: 'Volatility', intel: 'Intelligence'};
  const label = p => p.name === 'des' || p.name === 'options' || p.name === 'fa' || p.name === 'cb' ? `${NAMES[p.name]} ${typeof p.arg === 'string' ? T.shortOf(p.arg) : ''}`.trim() : p.name === 'article' ? 'Article' : p.name === 'edge' && typeof p.arg === 'string' ? `Edge ${p.arg}` : NAMES[p.name] || p.name;

  /* --- navigation (history-aware, never leaves the terminal) ------------------ */
  const hashOf = (name, arg) => {
    if (arg === undefined || arg === null || arg === '') return '#' + name;
    if (typeof arg === 'string') return `#${name}/${encodeURIComponent(arg)}`;
    if (name === 'article') { const o = readerKey(arg); return o ? `#article/${encodeURIComponent([o.id, o.edition, o.category].join('|'))}` : '#news'; }
    if (name === 'news') return arg.cat ? `#news/cat:${arg.cat}` : arg.q ? `#news/q:${encodeURIComponent(arg.q)}` : '#news';
    if (name === 'calc') return '#calc/' + (arg.kind || '');
    return '#' + name;
  };
  function parseHash(hash) {
    const m = /^#([a-z]+)(?:\/(.*))?$/.exec(hash || ''); if (!m || !NAMES[m[1]]) return null;
    const name = m[1], raw = m[2] ? decodeURIComponent(m[2]) : undefined;
    if (name === 'article' && raw) { const [id, edition, category] = raw.split('|'); return {name, arg: {articleId: id, id, edition, category, restored: true}}; }
    if (name === 'news' && raw) return {name, arg: raw.startsWith('cat:') ? {cat: raw.slice(4)} : raw.startsWith('q:') ? {q: raw.slice(2)} : undefined};
    if (name === 'calc' && raw) return {name, arg: {kind: raw}};
    return {name, arg: raw};
  }
  function open(name, arg) {
    if (!NAMES[name]) return;
    $('fx-inspect').hidden = true;
    stack.push({name, arg, pushed: true});
    history.pushState({fxDepth: stack.length}, '', location.pathname + location.search + hashOf(name, arg));
    show();
  }
  function back() {
    const top = stack.at(-1); if (!top) return;
    if (top.pushed && history.state?.fxDepth === stack.length) history.back();
    else { stack.pop(); history.replaceState({fxDepth: stack.length}, '', location.pathname + location.search + (stack.length ? hashOf(stack.at(-1).name, stack.at(-1).arg) : '')); show(); }
  }
  let closing = false;
  const base = () => location.pathname + location.search;
  function closeAll() {
    if (!stack.length) return;
    const pushed = stack.filter(p => p.pushed).length;
    if (pushed && history.state?.fxDepth === stack.length) { closing = true; history.go(-pushed); return; }
    stack.length = 0; history.replaceState({fxDepth: 0}, '', base()); show();
  }
  window.addEventListener('popstate', e => {
    if (closing) { closing = false; stack.length = 0; history.replaceState({fxDepth: 0}, '', base()); show(); return; }
    const depth = e.state?.fxDepth || 0;
    if (depth < stack.length) stack.length = depth;
    else if (depth > stack.length) { const p = parseHash(location.hash); if (p) stack.push({...p, pushed: true}); }
    show();
  });
  function fromLocation() {
    const p = parseHash(location.hash); if (!p) return;
    stack.length = 0; stack.push({...p, pushed: false});
    history.replaceState({fxDepth: 1}, '', location.href);
    show();
  }
  function show() {
    const top = stack.at(-1), main = $('fx-main');
    if (!top) { root.hidden = true; main.hidden = false; document.body.classList.remove('fx-paging'); document.title = `FYNX Terminal · ${T.D().label} desk`; return; }
    root.hidden = false; main.hidden = true; document.body.classList.add('fx-paging');
    body.replaceChildren(); body.scrollTop = 0; crumbs();
    const my = ++token;
    try { const r = PAGES[top.name](body, top.arg, () => my === token); if (r?.catch) r.catch(e => { if (my === token) body.append(el('p', 'fx-empty', 'This page could not load: ' + e.message)); }); }
    catch (e) { body.append(el('p', 'fx-empty', 'This page could not load.')); console.error(e); }
    $('fx-page-back').focus({preventScroll: true});
  }
  $('fx-page-back').addEventListener('click', back);
  $('fx-page-close').addEventListener('click', closeAll);

  /* --- shared builders ----------------------------------------------------------- */
  function quoteTable(ids, {perf = true} = {}) {
    const table = el('table', 'fx-table pg-table'), head = el('tr');
    ['SYMBOL', 'NAME', 'LAST', 'CHG', ...(perf ? ['1W', '1M', 'YTD', '1Y'] : []), '52W RANGE', '20D VOL'].forEach(h => head.append(el('th', '', h))); table.append(head);
    for (const id of ids) {
      const q = T.quoteFor(id); if (!q) continue;
      const tr = el('tr', 'pg-click'); tr.tabIndex = 0; tr.setAttribute('role', 'button'); tr.setAttribute('aria-label', `Open ${T.nameOf(id)}`);
      const go = () => open('des', id); tr.addEventListener('click', go); tr.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      tr.append(el('th', '', T.shortOf(id)), el('td', 'pg-name', T.nameOf(id)), el('td', 'fx-num', fmt(q.price, T.digitsOf(id))), el('td', 'fx-num ' + tone(q.changePercent), signed(q.changePercent, 2, '%')));
      if (perf) for (const w of [5, 21, 'ytd', 251]) { const r = T.periodReturn(id, w); tr.append(el('td', 'fx-num ' + tone(r), finite(r) ? signed(r, 1, '%') : '—')); }
      const rng = el('td', 'pg-range');
      if (finite(q.high52) && finite(q.low52) && q.high52 > q.low52) { const bar = el('span', 'pg-rbar'), dot = el('i'); dot.style.left = Math.max(0, Math.min(100, (q.price - q.low52) / (q.high52 - q.low52) * 100)) + '%'; bar.append(dot); rng.append(el('small', '', fmt(q.low52, T.digitsOf(id))), bar, el('small', '', fmt(q.high52, T.digitsOf(id)))); } else rng.textContent = '—';
      tr.append(rng, el('td', 'fx-num fx-dim', finite(q.vol20) ? q.vol20.toFixed(2) + '%' : '—'));
      table.append(tr);
    }
    const wrap = el('div', 'pg-scroll'); wrap.append(table); return wrap;
  }
  function allHeadlines() {
    const seen = new Set(), out = [];
    for (const h of [...S.briefing, ...Object.values(S.desks).flatMap(d => d.items || [])]) { if (seen.has(h.id || h.url)) continue; seen.add(h.id || h.url); out.push(h); }
    return out.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }
  function matchNews(terms, n = 12) {
    const words = terms.filter(t => t && t.length > 1).map(t => t.toLowerCase());
    if (!words.length) return [];
    return allHeadlines().filter(h => { const t = h.title.toLowerCase(); return words.some(w => w.length <= 4 ? new RegExp(`(^|[^a-z0-9])${w.replace(/[^a-z0-9]/g, '\\$&')}([^a-z0-9]|$)`).test(t) : t.includes(w)); }).slice(0, n);
  }
  function newsList(host, items, emptyText) { if (!items.length) return host.append(el('p', 'fx-empty', emptyText || 'No matching headlines in the current feeds.')); items.forEach(h => host.append(T.headlineRow(h))); }
  function readerKey(h) {
    if (!h) return null;
    try { if (h.readerUrl) { const u = new URL(h.readerUrl, location.origin), id = u.searchParams.get('id'); if (id) return {id, edition: u.searchParams.get('edition') || 'us', category: u.searchParams.get('category') || 'all'}; } } catch {}
    const id = h.articleId || (h.restored ? h.id : null);
    return id ? {id, edition: h.edition || 'us', category: h.kind === 'official-release' ? 'official' : h.category || 'all'} : null;
  }
  function bigChart(host, id, ranges = [[21, '1M'], [63, '3M'], [126, '6M'], [252, '1Y'], [504, '2Y'], [1260, '5Y']]) {
    const box = el('div', 'pg-chart'); host.append(box);
    let range = 252;
    const draw = series => {
      box.replaceChildren();
      if (!series?.rows?.length) return box.append(el('p', 'fx-empty', 'Daily history is not available for this market right now.'));
      const avail = ranges.filter(([n], i) => i === 0 || series.rows.length > ranges[i - 1][0]);
      box.append(pageTabs(avail, range, v => { range = v; draw(series); }));
      const q = T.quoteFor(id);
      box.append(T.lineChart(series.rows.slice(-range), {digits: T.digitsOf(id), W: 960, H: 320, label: T.nameOf(id), last: q?.price, source: `${series.source} daily ${T.EDGE[id] ? 'bid candles' : series.closeOnly ? 'closes' : 'adjusted closes'}`}));
    };
    box.append(el('p', 'fx-empty', 'Loading daily history…'));
    T.loadSeries(id).then(draw);
  }

  /* --- pages ------------------------------------------------------------------------ */
  const PAGES = {};

  PAGES.help = host => {
    setHead('HELP', 'Commands, keys and desks', 'Type in the command bar, press / to jump there');
    const s1 = section('Commands');
    kv(s1, [['NVDA · SAP.DE · 7203.T · EURUSD · BTC', 'Load every box for that market (any listed market worldwide)'], ['FIND toyota', 'Search stocks, funds, currencies, coins, indices and futures worldwide; new listings are scanned daily'], ['EDIT', 'Design your terminal: move, remove, swap and add panels or market cards'], ['CTRY JP · STATE TX · WORLD', 'Country and US state terminal pages; the live globe'], ['CHART TSLA', 'Candles, volume, compare markets, trend lines, levels and measure'], ['PORT', 'Portfolio analytics: value, P/L, volatility, beta, VaR, diversification'], ['LISTINGS', 'Stocks and ETFs listed in the last 30 days'], ['DES NVDA', 'Full security page: chart, stats, news, financials, options'], ['DESK STOCKS', 'Switch desk (or just type STOCKS, FOREX, BONDS…)'], ['NEWS · NEWS ENERGY · N fed', 'News pages: all, a desk, or a search'], ['FA MSFT', 'Full SEC financials'], ['OPT SPY', 'Options: chain, IV, expected move, max pain'], ['CB FED · CB ECB', 'Central bank page'], ['CURVE UK', 'Yield curve'], ['CORR 30', 'FX correlation window'], ['CALC EURUSD', 'Calculators'], ['GO MACRO · GO EDGE · GO CAL', 'Open any terminal page'], ['Esc', 'Back one page / close a detail'], ['/', 'Jump to the command bar']]);
    const s2 = section('Function keys');
    kv(s2, T.KEYS.map(([k, l, p]) => [k, `${l}${['F5', 'F11', 'F12'].includes(k) ? ' (click; the key keeps its browser use)' : ''}`]));
    const s3 = section('Desks: each one reloads every box for that market');
    const g = grid('pg-desks');
    for (const k of T.DESK_ORDER) { const d = T.DESK_DEFS[k], b = btn('', 'pg-desk' + (k === S.deskKey ? ' on' : ''), () => { closeAll(); T.setDesk(k); }); b.append(el('b', '', d.label), el('small', '', d.slots.map(s => s.toUpperCase()).join(' · '))); g.append(b); }
    s3.append(g);
    host.append(s1, s2, s3, sourceNote('Everything opens inside the terminal. Links marked ↗︎ go to an outside source in a new tab. Exit (top right) returns to the website.'));
  };

  PAGES.sources = host => {
    setHead('SRC', 'Data sources', 'Every number in the terminal comes from one of these feeds');
    const s = section('Feed status');
    kv(s, Object.entries(S.feeds).map(([k, v]) => [k, v ? 'Connected' : 'Unavailable right now']));
    const list = section('Sources');
    kv(list, [['Live quotes (40)', 'Yahoo Finance via FYNX quote service · delayed, refreshes every 30 s'], ['Futures, indices, funds, FX, crypto (157)', S.mk ? `${S.mk.source} · snapshot ${hhmm(S.mk.generatedAt)}, refreshed every 15 min` : 'Loading'], ['Options (18 chains)', S.opts ? `${S.opts.source} · ${hhmm(S.opts.generatedAt)}` : 'Loading'], ['Earnings', S.earn ? `${S.earn.source} · ${hhmm(S.earn.generatedAt)}` : 'Loading'],
      ['Yield curves', 'U.S. Treasury, ECB, Bank of England, Japan MOF'], ['Live US yields, Fed futures', S.desk?.fed?.source || 'CBOT 30-Day Fed Funds futures, New York Fed EFFR'], ['Policy rates', S.desk?.rates?.source || 'BIS'], ['Economic calendar', 'Forex Factory weekly calendar (FYNX research snapshot)'], ['Regimes, positioning', 'FYNX Edge Radar from Dukascopy candles and CFTC Commitments of Traders'],
      ['VIX history, correlation, crypto book', 'Cboe, ECB reference rates, Coinbase Exchange'], ['Company financials', 'SEC EDGAR XBRL company facts'], ['Headlines and articles', 'FYNX newsroom from publisher and official feeds']]);
    const out = section('Open the original sources ↗︎');
    out.append(chips([link('Yahoo Finance ↗︎', 'https://finance.yahoo.com/', 'fx-chip fx-chip-link'), link('Cboe delayed quotes ↗︎', 'https://www.cboe.com/delayed_quotes/', 'fx-chip fx-chip-link'), link('U.S. Treasury ↗︎', 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve', 'fx-chip fx-chip-link'), link('CFTC COT ↗︎', 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm', 'fx-chip fx-chip-link'), link('SEC EDGAR ↗︎', 'https://www.sec.gov/edgar/search/', 'fx-chip fx-chip-link'), link('Nasdaq earnings ↗︎', 'https://www.nasdaq.com/market-activity/earnings', 'fx-chip fx-chip-link')]));
    host.append(s, list, out);
  };

  PAGES.news = async (host, arg = {}, alive) => {
    let cat = arg.cat || (arg.q ? 'search' : T.D().news), q = arg.q || '';
    setHead('NEWS', q ? `News: ${arg.name || q}` : 'News', 'Every desk from the FYNX newsroom · click a headline for the full article page');
    const bar = el('form', 'pg-search'); const input = el('input'); input.type = 'search'; input.placeholder = 'Search headlines (company, country, topic)…'; input.value = q; input.setAttribute('aria-label', 'Search headlines'); bar.append(input, el('button', '', 'Search')); host.append(bar);
    const tabsHost = el('div'), list = el('div', 'pg-list'); host.append(tabsHost, list);
    const draw = async () => {
      tabsHost.replaceChildren(pageTabs([...(q ? [['search', 'Search']] : []), ...T.NEWS_CATS, ['official', 'Official']], cat, v => { cat = v; draw(); }));
      list.replaceChildren(el('p', 'fx-empty', 'Loading headlines…'));
      if (cat === 'search') { await Promise.allSettled(T.D().newsTabs.slice(0, 4).map(c => T.loadNews(c))); if (!alive()) return; list.replaceChildren(); return newsList(list, matchNews([q, arg.name]), `No headlines mention “${q}” right now.`); }
      if (cat === 'official') { list.replaceChildren(); return newsList(list, S.briefing.filter(h => h.kind === 'official-release'), 'No official releases in the current feed.'); }
      const r = await T.loadNews(cat); if (!alive()) return;
      list.replaceChildren(); newsList(list, r?.items || [], 'No current stories for this desk.');
      list.append(sourceNote('Headlines from publisher and official feeds, newest first. Articles open as terminal pages; the original story opens at its publisher in a new tab.'));
    };
    bar.addEventListener('submit', e => { e.preventDefault(); q = input.value.trim(); cat = q ? 'search' : T.D().news; setHead('NEWS', q ? `News: ${q}` : 'News'); draw(); });
    draw();
  };

  PAGES.article = async (host, h, alive) => {
    if (!h) return open('news');
    setHead('ART', h.title || 'Article', h.source ? `${h.source}${h.publishedAt ? ' · ' + new Date(h.publishedAt).toLocaleString() : ''}` : '');
    const head = section('', 'pg-article');
    if (h.title) head.append(el('h1', 'pg-title', h.title));
    const meta = el('p', 'pg-meta', [h.source, h.publishedAt ? ago(h.publishedAt) : '', h.kind === 'official-release' ? 'Official release' : ''].filter(Boolean).join(' · '));
    head.append(meta);
    const status = el('p', 'fx-empty', 'Loading the FYNX article…'); head.append(status); host.append(head);
    const R = window.FYNXNewsReaderData, key = readerKey(h);
    let a = null;
    if (R && key) { try { a = await R.loadArticle({...h, ...key, articleId: key.id}); } catch (e) { status.textContent = e.message || 'This article could not be loaded.'; } }
    if (!alive()) return;
    if (a) {
      status.remove();
      setHead('ART', a.title, `${a.source} · ${new Date(a.publishedAt).toLocaleString()}`);
      if (!h.title) head.prepend(el('h1', 'pg-title', a.title));
      meta.textContent = [a.source, ago(a.publishedAt), a.coverageLevel === 'source-text' ? 'From the source text' : a.coverageLevel === 'publisher-excerpt' ? 'From the publisher excerpt' : 'Headline only'].join(' · ');
      if (a.image?.url) { const fig = el('figure', 'pg-fig'), img = el('img'); img.src = a.image.url; img.alt = a.image.alt || ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; fig.append(img); if (a.image.credit) fig.append(el('figcaption', '', a.image.credit)); head.append(fig); }
      const plain = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (a.summary && !plain(a.title).startsWith(plain(a.summary))) head.append(el('p', 'pg-lead', a.summary));
      if (a.keyPoints?.length) { const s = section('Key points'); const ul = el('ul', 'pg-ul'); a.keyPoints.forEach(p => { const li = el('li'); li.append(el('span', '', p.text)); if (p.evidence) li.append(el('small', '', p.evidence)); ul.append(li); }); s.append(ul); host.append(s); }
      if (a.numbers?.length) { host.append(cards(a.numbers.map(n => [n.context.slice(0, 90), n.value]))); }
      if (a.context?.length) { const s = section('Context'); a.context.forEach(c => { s.append(el('h3', 'pg-h3', c.title), el('p', 'pg-p', c.text)); }); host.append(s); }
      if (a.terms?.length) { const s = section('Terms'); kv(s, a.terms.map(t => [t.term, t.definition])); host.append(s); }
      if (a.questions?.length) { const s = section('Questions to watch'); const ul = el('ul', 'pg-ul'); a.questions.forEach(q => ul.append(el('li', '', q))); s.append(ul); host.append(s); }
      const src = section('Sources'); src.append(chips([link(`Read the original at ${a.source} ↗︎`, a.sourceUrl, 'fx-chip fx-chip-link pg-primary'), ...(a.sources || []).map(s => link(s.name + ' ↗︎', s.url, 'fx-chip fx-chip-link'))]));
      if (a.coverageNote) src.append(sourceNote(a.coverageNote)); if (a.method) src.append(sourceNote('Method: ' + a.method));
      host.append(src);
      if (a.related?.length) { const s = section('Related'); a.related.forEach(r => s.append(T.headlineRow({...r, publishedAt: r.publishedAt || a.publishedAt, readerUrl: r.readerUrl}))); host.append(s); }
    } else {
      status.textContent = key ? status.textContent : 'FYNX has no reader version of this story yet.';
      const s = section(''); s.append(chips([h.url ? link(`Read the full story at ${h.source || 'the publisher'} ↗︎`, h.url, 'fx-chip fx-chip-link pg-primary') : null])); host.append(s);
    }
    const words = (h.title || a?.title || '').split(/\s+/).filter(w => /^[A-Z][a-zA-Z]{3,}/.test(w)).slice(0, 4);
    const more = section('More on this'); newsList(more, matchNews(words).filter(x => x.title !== (h.title || a?.title)).slice(0, 8), 'No related headlines in the current feeds.'); host.append(more);
  };

  PAGES.des = async (host, id, alive) => {
    id = T.resolve(id) || id || S.focus;
    const q = T.quoteFor(id), inf = T.info(id), dg = T.digitsOf(id);
    setHead('DES', `${T.shortOf(id)} · ${T.nameOf(id)}`, `${inf.group || ''}${q?.asOf ? ' · as of ' + new Date(q.asOf).toLocaleString() : ''}`);
    host.append(chips([btn('Chart on desk ▸', 'fx-chip fx-chip-link', () => { closeAll(); T.focusOn(id); }), S.opts?.underlyings?.[id] ? go('Options', 'options', id) : null, inf.group === 'Stocks' ? go('Financials', 'fa', id) : null, T.EDGE[id] ? go('Edge Radar', 'edge', id) : null, go('News', 'news', {q: T.shortOf(id), name: T.nameOf(id)}), link('Price alert ↗︎', '/tools/price-alerts.html', 'fx-chip fx-chip-link'), link('Backtest ↗︎', `/quant-analyst.html?symbol=${encodeURIComponent(id)}`, 'fx-chip fx-chip-link')]));
    if (q) host.append(cards([['LAST', fmt(q.price, dg)], ['CHANGE', signed(q.changePercent, 2, '%'), tone(q.changePercent)], ['PREV CLOSE', fmt(q.previousClose, dg)], ['DAY RANGE', finite(q.dayLow) ? `${fmt(q.dayLow, dg)}–${fmt(q.dayHigh, dg)}` : '—'], ['52W RANGE', finite(q.low52) ? `${fmt(q.low52, dg)}–${fmt(q.high52, dg)}` : '—'], ['VOLUME', count(q.volume)], ['20D VOL', finite(q.vol20) ? q.vol20.toFixed(2) + '% / day' : '—'], ['SOURCE', q.snapshot ? 'Yahoo (15-min snapshot)' : q.source || '—']]));
    const perf = [[5, '1W'], [21, '1M'], [63, '3M'], ['ytd', 'YTD'], [251, '1Y']].map(([w, l]) => { const r = T.periodReturn(id, w); return [l, finite(r) ? signed(r, 2, '%') : '—', tone(r)]; });
    if (perf.some(p => p[1] !== '—')) host.append(cards(perf));
    bigChart(host, id);
    const edgeM = S.edge?.markets?.find(m => m.symbol === id);
    if (edgeM) {
      const s = section('Regime, bias and positioning'), pair = M.PAIRS.find(p => p.id === id), b = pair ? M.smartBias(pair, {desk: S.desk, edgeMarket: edgeM, livePrice: q?.price}) : null;
      kv(s, [['Regime', edgeM.state?.regime?.value], ['Volatility percentile', finite(edgeM.state?.volatilityPercentile?.value) ? M.ordinal(Math.round(edgeM.state.volatilityPercentile.value)) : null], ['20-day range', finite(edgeM.state?.low20?.value) ? `${fmt(edgeM.state.low20.value, dg)} – ${fmt(edgeM.state.high20.value, dg)}` : null], ['CFTC net', finite(edgeM.positioning?.net?.value) ? `${signed(edgeM.positioning.net.value * 100, 0, '%')}${edgeM.positioning.crowded?.value ? ' (crowded)' : ''}` : null], ['Smart Bias', b && finite(b.score) ? `${b.score > 0 ? '+' : ''}${b.score} · ${b.label}` : null]]);
      s.append(go('Full Edge page', 'edge', id)); host.append(s);
    }
    const u = S.opts?.underlyings?.[id];
    if (u) { const s = section('Options'); T.optSummary(s, u, i => { S.optExp = i; open('options', id); }); s.append(go('Option chain', 'options', id)); host.append(s); }
    const earn = (S.earn?.events || []).find(e => e.symbol === id || e.symbol === id.replace('-', '.'));
    if (earn) { const s = section('Next earnings'); kv(s, [['Date', `${day(earn.date)} · ${earn.time}`], ['Fiscal quarter', earn.fiscalQuarter], ['EPS forecast', finite(earn.epsForecast) ? '$' + earn.epsForecast.toFixed(2) : '—'], ['Year-ago EPS', finite(earn.lastYearEPS) ? '$' + earn.lastYearEPS.toFixed(2) : '—']]); host.append(s); }
    const news = section('Headlines'); host.append(news);
    newsList(news, matchNews([T.nameOf(id).replace(/ (Inc|Corp|ETF|Trust).*$/, ''), T.shortOf(id).length > 2 ? T.shortOf(id) : '']), 'No headlines mention this market in the current feeds.');
    if (inf.group === 'Stocks') {
      const fin = section('Financials (SEC 10-K)'); fin.append(el('p', 'fx-empty', 'Loading SEC filings…')); host.append(fin);
      const f = await T.loadFin(id); if (!alive()) return;
      fin.replaceChildren(el('h2', 'pg-h2', 'Financials (SEC 10-K)'));
      if (f?.periods?.length) { const w = el('div', 'pg-scroll'); w.append(T.finTable(f, id, f.periods.slice(0, 5))); fin.append(w, go('All periods', 'fa', id)); } else fin.append(el('p', 'fx-empty', 'SEC financial statements are not available for this company.'));
    }
  };

  PAGES.fa = async (host, arg, alive) => {
    const cik = /^cik\d+$/i.test(arg || '') ? arg.slice(3) : null, ticker = cik ? null : (arg || S.finTicker).toUpperCase();
    setHead('FA', `${ticker || 'CIK ' + cik} · financial statements`, 'Annual 10-K facts from SEC EDGAR');
    host.append(chips([go('Search any company', 'research'), ticker ? go('Security page', 'des', ticker) : null]));
    const box = el('div'); box.append(el('p', 'fx-empty', 'Loading SEC filings…')); host.append(box);
    const f = await T.loadFin(ticker, cik); if (!alive()) return;
    box.replaceChildren();
    if (!f?.periods?.length) return box.append(el('p', 'fx-empty', 'Financial statements are not available from SEC EDGAR for this company right now.'));
    setHead('FA', `${f.name}`, `CIK ${f.cik} · ${f.periods.length} fiscal years on file`);
    const p0 = f.annual[f.periods[0]], p1 = f.annual[f.periods[1]] || {};
    const g = (k) => p0?.[k] && p1?.[k] ? (p0[k].value / p1[k].value - 1) * 100 : null;
    box.append(cards([['REVENUE', big(p0?.revenue?.value), '', finite(g('revenue')) ? signed(g('revenue'), 1, '% y/y') : ''], ['NET INCOME', big(p0?.income?.value), tone(p0?.income?.value), finite(g('income')) ? signed(g('income'), 1, '% y/y') : ''], ['DILUTED EPS', finite(p0?.eps?.value) ? '$' + p0.eps.value.toFixed(2) : '—'], ['NET MARGIN', p0?.revenue && p0?.income ? (p0.income.value / p0.revenue.value * 100).toFixed(1) + '%' : '—'], ['CASH', big(p0?.cash?.value)], ['LT DEBT', big(p0?.longTermDebt?.value)], ['EQUITY', big(p0?.equity?.value)], ['FREE CASH FLOW', p0?.operatingCash && p0?.capex ? big(p0.operatingCash.value - Math.abs(p0.capex.value)) : '—']]));
    const s = section('All reported years'), w = el('div', 'pg-scroll'); w.append(T.finTable(f, ticker || f.name, f.periods.slice(0, 8))); s.append(w, sourceNote('Click any value for its period, filing date and XBRL tag.'), chips([link('Filings on SEC EDGAR ↗︎', `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${f.cik}&type=10-K`, 'fx-chip fx-chip-link')]));
    box.append(s);
  };

  PAGES.research = async (host, arg, alive) => {
    setHead('RES', 'Company research', 'Search every SEC-registered company and open its financial statements');
    const bar = el('form', 'pg-search'); const input = el('input'); input.type = 'search'; input.placeholder = 'Company name or ticker (e.g. Costco, PLTR)…'; input.value = arg || ''; input.setAttribute('aria-label', 'Search companies'); bar.append(input, el('button', '', 'Search'));
    const list = el('div', 'pg-list'); host.append(bar, list);
    list.append(el('p', 'fx-empty', 'Loading the SEC company directory…'));
    const dir = await T.loadDirectory(); if (!alive()) return;
    const draw = () => {
      const q = input.value.trim().toLowerCase(); list.replaceChildren();
      if (!dir.length) return list.append(el('p', 'fx-empty', 'The SEC directory is unavailable right now.'));
      const hits = q ? dir.filter(c => (c.symbol || '').toLowerCase() === q || (c.symbol || '').toLowerCase().startsWith(q) || (c.name || '').toLowerCase().includes(q)).slice(0, 60) : T.CATALOG.filter(c => c.group === 'Stocks').map(c => dir.find(d => d.symbol === c.symbol || d.symbol === c.symbol.replace('-', '.'))).filter(Boolean);
      list.append(el('p', 'pg-note', q ? `${hits.length >= 60 ? '60+' : hits.length} matches of ${dir.length.toLocaleString()} companies` : `Popular · ${dir.length.toLocaleString()} companies in the directory`));
      for (const c of hits) { const r = rowButton('pg-co', () => open('fa', c.symbol || 'cik' + c.cik), `${c.name} financials`); r.append(el('b', '', c.symbol || '—'), el('span', '', c.name), el('small', 'fx-dim', 'CIK ' + c.cik)); list.append(r); }
    };
    bar.addEventListener('submit', e => { e.preventDefault(); draw(); }); input.addEventListener('input', () => { if (input.value.length === 0 || input.value.length > 1) draw(); });
    draw(); input.focus();
  };

  PAGES.macro = host => {
    setHead('MACRO', 'Macro Desk', 'Central banks, yield curves, policy rates, Smart Bias and this week’s events');
    const story = section('Today'), rows = T.biasRows().map(r => r.b), s = M.composeStory({desk: S.desk, banks: S.schedule?.banks || [], headlines: S.briefing, bias: rows});
    if (s.available) { story.append(el('h3', 'fx-h3', s.title), el('p', 'pg-lead', s.lines.join(' '))); story.append(cards(s.facts.map(f => [f.label, f.value, '', f.note]))); } else story.append(el('p', 'fx-empty', 'Waiting for rate data…'));
    host.append(story);
    const cb = section('Central banks'), table = el('table', 'fx-table pg-table'), head = el('tr'); ['BANK', 'POLICY RATE', 'AS OF', 'NEXT DECISION', 'COUNTDOWN', 'THEN'].forEach(h => head.append(el('th', '', h))); table.append(head);
    for (const b of S.schedule?.banks || []) {
      const rate = M.policyRate(b.currency, S.desk), n = M.nextDecision(b), tr = el('tr', 'pg-click'); tr.addEventListener('click', () => open('cb', b.short));
      tr.append(el('th', '', b.name), el('td', 'fx-num', rate?.display || '—'), el('td', 'fx-dim', rate?.observationDate || ''), el('td', '', n ? (n.at ? new Date(n.at).toLocaleString([], {weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : day(n.date)) : '—'), el('td', 'fx-num fx-up', n ? (n.at ? M.countdown(n.at - Date.now()) : n.daysAway + ' days') : ''), el('td', 'fx-dim', (b.decisions || []).filter(d => d > (n?.date || '')).slice(0, 2).map(day).join(' · ')));
      table.append(tr);
    }
    const w = el('div', 'pg-scroll'); w.append(table); cb.append(w);
    const odds = S.desk?.fed?.odds; if (odds) cb.append(cards([['FOMC', day(odds.meeting)], ['FUTURES IMPLY', signed(odds.expectedChangeBp, 0, ' bp')], ...[['cut50', 'CUT 50'], ['cut', 'CUT 25'], ['hold', 'HOLD'], ['hike', 'HIKE 25'], ['hike50', 'HIKE 50']].filter(([k]) => odds[k] > 0).map(([k, l]) => [l, Math.round(odds[k]) + '%']), ['EFFR', S.desk.fed.effr ? S.desk.fed.effr.value.toFixed(2) + '%' : '—']]));
    host.append(cb);
    const curves = section('Yield curves (solid = latest close, dashed = a month ago)'), g = grid('pg-g2');
    for (const a of ['US', 'EA', 'GB', 'JP']) { const c = T.curveChart(a, {W: 460, H: 160}); if (!c) continue; const box = el('div', 'pg-card'); box.append(el('h3', 'pg-h3', `${M.AREAS[a].label} · ${c.view.latestDate}${c.view.spread ? ` · ${c.view.spread.label} ${signed(c.view.spread.bp, 0, ' bp')}` : ''}`), c.chart, T.tenorGrid(a, c.view, c.curve), sourceNote(c.curve.source)); g.append(box); }
    curves.append(g); host.append(curves);
    const AREA = {AU: 'Australia', CA: 'Canada', CH: 'Switzerland', GB: 'United Kingdom', JP: 'Japan', NZ: 'New Zealand', US: 'United States', XM: 'Euro area', CN: 'China', IN: 'India', BR: 'Brazil', MX: 'Mexico', KR: 'South Korea', SE: 'Sweden', NO: 'Norway', ZA: 'South Africa', TR: 'Turkey'};
    const rates = section('Policy rates (BIS)'); const list = (S.desk?.rates?.rows || []).filter(r => finite(r.value)).sort((a, b) => b.value - a.value);
    if (list.length) kv(rates, list.map(r => [AREA[r.area] || r.area, `${r.value.toFixed(2)}% · ${r.observationDate}`])); else rates.append(el('p', 'fx-empty', 'Loading…'));
    const bias = section('Smart Bias'); bias.append(biasTable(), go('How Smart Bias works', 'bias'));
    const ev = section('This week'); const evs = (S.desk?.events?.events || []).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    if (evs.length) evs.forEach(e => ev.append(el('p', 'pg-p', `${new Date(e.time).toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit'})} · ${e.currency} · ${e.title}`))); else ev.append(el('p', 'fx-empty', 'No central bank events listed this week.'));
    const two = grid('pg-g2'); two.append(rates, ev);
    host.append(bias, two, sourceNote('Sources: U.S. Treasury, ECB, Bank of England, Japan MOF, New York Fed, CBOT Fed funds futures, BIS, Forex Factory, CFTC.'));
  };
  function biasTable(focus) {
    const table = el('table', 'fx-table pg-table'), head = el('tr'); ['PAIR', 'LAST', 'SCORE', 'LABEL', 'TREND', 'YIELD MOMENTUM', 'RATE GAP', 'POSITIONING', 'COVERAGE'].forEach(h => head.append(el('th', '', h))); table.append(head);
    for (const {p, b} of T.biasRows()) {
      const tr = el('tr', 'pg-click' + (p.id === focus ? ' sel' : '')); tr.addEventListener('click', () => open('bias', p.id));
      const comp = k => { const c = b.components?.find(x => x.key === k); return el('td', 'fx-num ' + tone(c?.score), c ? `${c.score > 0 ? '+' : ''}${c.score}` : '—'); };
      tr.append(el('th', '', `${p.base}/${p.quote}`), el('td', 'fx-num', T.quoteFor(p.id) ? fmt(T.quoteFor(p.id).price, T.EDGE[p.id][2]) : '—'), el('td', 'fx-num ' + tone(b.score), finite(b.score) ? `${b.score > 0 ? '+' : ''}${b.score}` : 'n/a'), el('td', '', b.label), comp('trend'), comp('yields'), comp('carry'), comp('positioning'), el('td', 'fx-num fx-dim', finite(b.coverage) ? b.coverage + '%' : '—'));
      table.append(tr);
    }
    const w = el('div', 'pg-scroll'); w.append(table); return w;
  }

  PAGES.bias = (host, pair) => {
    setHead('BIAS', 'Smart Bias · method', 'A transparent −100 to +100 score for each currency pair');
    if (pair && T.EDGE[pair]) {
      const p = M.PAIRS.find(x => x.id === pair), b = M.smartBias(p, {desk: S.desk, edgeMarket: S.edge?.markets?.find(m => m.symbol === pair), livePrice: T.quoteFor(pair)?.price});
      const s = section(`${p.base}/${p.quote} now`);
      s.append(cards([['SCORE', finite(b.score) ? `${b.score > 0 ? '+' : ''}${b.score}` : 'n/a', tone(b.score)], ['LABEL', b.label], ['COVERAGE', (b.coverage ?? 0) + '%']]));
      (b.components || []).forEach(c => s.append(el('p', 'pg-p', `${c.label} ${c.score > 0 ? '+' : ''}${c.score} (weight ${c.weight}%): ${c.detail}`)));
      if (b.reason) s.append(el('p', 'pg-p', b.reason));
      s.append(chips([btn('Chart on desk ▸', 'fx-chip fx-chip-link', () => { closeAll(); T.focusOn(pair); }), go('Edge page', 'edge', pair)]));
      host.append(s);
    }
    const m = section('How it is calculated');
    const W = M.WEIGHTS || {trend: 0.35, yields: 0.3, carry: 0.2, positioning: 0.15};
    kv(m, [[`Trend · ${Math.round(W.trend * 100)}%`, 'Where price sits inside its 20-day high–low range (−100 at the low, +100 at the high), scaled down when the trend is inefficient (choppy).'],
      [`Yield momentum · ${Math.round(W.yields * 100)}%`, 'The one-month change in each currency’s 2-year (or 5-year) government yield. If the base currency’s yields rose 40 bp more than the quote’s, the score is +100.'],
      [`Rate gap · ${Math.round(W.carry * 100)}%`, 'Policy rate of the base currency minus the quote currency. A 3-point gap or more scores ±100.'],
      [`Positioning · ${Math.round(W.positioning * 100)}%`, 'Contrarian, and only when CFTC speculators are crowded versus their own history: crowded long leans bearish, crowded short leans bullish. Otherwise 0.'],
      ['Missing inputs', 'A component without current data is left out and the remaining weights are rescaled; coverage shows how much of the model is present. Below 50% coverage the pair is not scored.'],
      ['Labels', '+50 or more strong bullish · +15 bullish · −15 to +15 neutral · −15 bearish · −50 or less strong bearish.'],
      ['Data', 'Live delayed FX quotes, Dukascopy daily candles, U.S. Treasury / ECB / BoE / MOF yields, BIS policy rates, CFTC Commitments of Traders.']]);
    m.append(sourceNote('Smart Bias summarizes public data. It is not a forecast or advice.'));
    const t = section('All pairs'); t.append(biasTable(pair));
    host.append(m, t);
  };

  PAGES.edge = async (host, sym, alive) => {
    const ms = S.edge?.markets || [];
    if (!sym || !ms.find(m => m.symbol === sym)) {
      setHead('EDGE', 'Edge Radar · all markets', S.edge ? `Snapshot ${ago(S.edge.generatedAt)} · click a market` : 'Loading…');
      if (!ms.length) return host.append(el('p', 'fx-empty', 'Loading Edge Radar…'));
      const mood = S.edge.mood; if (mood?.value) host.append(cards([['MARKET MOOD', mood.value], ['SCORE', finite(mood.score) ? mood.score.toFixed(2) : '—'], ['FX VOLATILITY', S.edge.volatility ? `${S.edge.volatility.value}, ${M.ordinal(Math.round(S.edge.volatility.percentile))} pct` : '—']]));
      const table = el('table', 'fx-table pg-table'), head = el('tr'); ['MARKET', 'LAST', 'REGIME', 'TREND', 'VOL PCT', 'CFTC NET', 'CROWDED', 'EVENT 24H', 'BIAS'].forEach(h => head.append(el('th', '', h))); table.append(head);
      for (const m of ms) {
        const st = m.state || {}, pos = T.trendPos(st), pair = M.PAIRS.find(p => p.id === m.symbol), b = pair ? M.smartBias(pair, {desk: S.desk, edgeMarket: m, livePrice: T.quoteFor(m.symbol)?.price}) : null, n = m.positioning?.net?.value;
        const tr = el('tr', 'pg-click'); tr.addEventListener('click', () => open('edge', m.symbol));
        tr.append(el('th', '', `${m.symbol} · ${T.nameOf(m.symbol)}`), el('td', 'fx-num', fmt(T.quoteFor(m.symbol)?.price ?? st.close?.value, T.digitsOf(m.symbol))), el('td', '', st.regime?.value || '—'), el('td', 'fx-num ' + tone(pos), pos === null ? '—' : signed(pos, 2)), el('td', 'fx-num', finite(st.volatilityPercentile?.value) ? M.ordinal(Math.round(st.volatilityPercentile.value)) : '—'), el('td', 'fx-num ' + tone(n), finite(n) ? signed(n * 100, 0, '%') : '—'), el('td', m.positioning?.crowded?.value ? 'fx-warn' : 'fx-dim', m.positioning?.crowded?.value ? 'Yes' : 'No'), el('td', m.events?.eventIn24h ? 'fx-warn' : 'fx-dim', m.events?.eventIn24h ? 'Yes' : '—'), el('td', 'fx-num ' + tone(b?.score), b && finite(b.score) ? `${b.score > 0 ? '+' : ''}${b.score}` : '—'));
        table.append(tr);
      }
      const w = el('div', 'pg-scroll'); w.append(table); host.append(w, sourceNote('Regimes from Dukascopy daily candles · positioning from CFTC Commitments of Traders · trend = position in the 20-day range (−1 low, +1 high).'));
      return;
    }
    const m = ms.find(x => x.symbol === sym), st = m.state || {}, q = T.quoteFor(sym), dg = T.digitsOf(sym);
    setHead('EDGE', `${sym} · ${T.nameOf(sym)}`, `Edge Radar market page · snapshot ${ago(S.edge.generatedAt)}`);
    host.append(chips([btn('Chart on desk ▸', 'fx-chip fx-chip-link', () => { closeAll(); T.focusOn(sym); }), go('All markets', 'edge'), M.PAIRS.find(p => p.id === sym) ? go('Smart Bias', 'bias', sym) : null, link('Backtest ↗︎', `/quant-analyst.html?symbol=${sym}`, 'fx-chip fx-chip-link'), link('Edge Radar on the website ↗︎', `/edge-radar/${sym.toLowerCase()}/`, 'fx-chip fx-chip-link')]));
    const series = await T.loadSeries(sym); if (!alive()) return;
    const vd = M.volDistribution(series?.raw, {symbol: sym, pip: T.EDGE[sym]?.[1]});
    const pair = M.PAIRS.find(p => p.id === sym), b = pair ? M.smartBias(pair, {desk: S.desk, edgeMarket: m, livePrice: q?.price}) : null;
    const story = M.marketStory({symbol: sym, label: T.nameOf(sym), edgeMarket: m, quote: q, desk: S.desk, headlines: allHeadlines(), bias: b, vol: vd, digits: dg});
    if (story.available) { const s = section('The story'); s.append(el('h3', 'fx-h3', story.title), el('p', 'pg-lead', story.lines.join(' '))); host.append(s); }
    host.append(cards([['LAST', fmt(q?.price ?? st.close?.value, dg)], ['DAY', signed(q?.changePercent, 2, '%'), tone(q?.changePercent)], ['REGIME', st.regime?.value || '—'], ['VOL PCT', finite(st.volatilityPercentile?.value) ? M.ordinal(Math.round(st.volatilityPercentile.value)) : '—'], ['20D HIGH', fmt(st.high20?.value, dg)], ['20D LOW', fmt(st.low20?.value, dg)], ['CFTC NET', finite(m.positioning?.net?.value) ? signed(m.positioning.net.value * 100, 0, '%') : '—', tone(m.positioning?.net?.value)], ['SMART BIAS', b && finite(b.score) ? `${b.score > 0 ? '+' : ''}${b.score}` : '—', tone(b?.score)]]));
    bigChart(host, sym);
    const two = grid('pg-g2');
    if (vd) {
      const s = section('Daily range distribution · 1 year'), W = 460, H = 120, maxC = Math.max(...vd.bins.map(x => x.count)), bw = W / vd.bins.length;
      const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart', role: 'img', 'aria-label': `Range distribution, latest ${M.ordinal(vd.percentile)} percentile`});
      vd.bins.forEach((x, i) => c.append(svg('rect', {x: i * bw + 1, width: bw - 2, y: H - 16 - x.count / maxC * (H - 22), height: x.count / maxC * (H - 22), class: i === vd.latestBin ? 'bar-on' : 'bar'})));
      s.append(c, el('p', 'pg-p', `Latest day ${fmt(vd.latest, vd.unit.digits)} ${vd.unit.label}, ${M.ordinal(vd.percentile)} percentile. Median ${fmt(vd.median, vd.unit.digits)}, typical ${fmt(vd.p25, vd.unit.digits)}–${fmt(vd.p75, vd.unit.digits)} ${vd.unit.label}.`)); two.append(s);
    }
    const hist = (m.positioning?.history || []).slice(-26);
    if (hist.length) {
      const s = section('CFTC positioning · last 6 months'), W = 460, H = 120, vals = hist.map(x => x.net), lo = Math.min(-0.1, ...vals), hi = Math.max(0.1, ...vals), x = i => 10 + i * (W - 20) / Math.max(1, hist.length - 1), y = v => 8 + (hi - v) / (hi - lo) * (H - 24);
      const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart', role: 'img', 'aria-label': `Net positioning history, latest ${signed(vals.at(-1) * 100, 0, '%')}`});
      c.append(svg('line', {x1: 10, x2: W - 10, y1: y(0), y2: y(0), class: 'g'}), svg('polyline', {points: vals.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: 'ln-w', fill: 'none'}));
      [0, hist.length - 1].forEach((i, k) => { const t = svg('text', {x: x(i), y: H - 3, class: 'a', 'text-anchor': k ? 'end' : 'start'}); t.textContent = `${hist[i].date} ${signed(hist[i].net * 100, 0, '%')}`; c.append(t); });
      s.append(c, el('p', 'pg-p', `Speculators net ${signed(m.positioning.net.value * 100, 0, '%')} on ${m.positioning.reportDate}${m.positioning.crowded?.value ? ' — crowded versus its own history.' : '.'}`)); two.append(s);
    }
    host.append(two);
    if (b?.components?.length) { const s = section('Smart Bias components'); b.components.forEach(c => s.append(el('p', 'pg-p', `${c.label} ${c.score > 0 ? '+' : ''}${c.score} (weight ${c.weight}%): ${c.detail}`))); host.append(s); }
    const ev = section('Events and headlines');
    if (m.events?.next?.length) m.events.next.slice(0, 6).forEach(e => ev.append(el('p', 'pg-p', `${new Date(e.time).toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit'})} · ${e.currency || ''} ${e.title || ''}`)));
    newsList(ev, story.related?.length ? story.related : matchNews([T.nameOf(sym)]), 'No related headlines in the current feeds.');
    host.append(ev);
  };

  PAGES.mkts = host => {
    setHead('MKTS', 'Market board', S.mk ? `${Object.keys(S.mk.quotes).length} markets · ${S.mk.source} · ${hhmm(S.mk.generatedAt)}` : 'Loading…');
    const bar = el('form', 'pg-search'); const input = el('input'); input.type = 'search'; input.placeholder = 'Filter by name or symbol…'; input.setAttribute('aria-label', 'Filter markets'); bar.append(input); host.append(bar);
    const box = el('div'); host.append(box);
    const groups = [...new Set(Object.values(S.mk?.quotes || {}).map(q => q.group))];
    const deskGroups = new Set(T.D().mkts.flatMap(([, g]) => g));
    groups.sort((a, b) => (deskGroups.has(b) ? 1 : 0) - (deskGroups.has(a) ? 1 : 0));
    const draw = () => {
      box.replaceChildren(); const f = input.value.trim().toLowerCase();
      if (!groups.length) return box.append(el('p', 'fx-empty', 'Loading the market snapshot…'));
      for (const g of groups) {
        const ids = T.universe([g]).filter(id => !f || id.toLowerCase().includes(f) || T.nameOf(id).toLowerCase().includes(f) || T.shortOf(id).toLowerCase().includes(f));
        if (!ids.length) continue;
        const s = section(g); s.append(quoteTable(ids)); box.append(s);
      }
    };
    bar.addEventListener('submit', e => e.preventDefault()); input.addEventListener('input', draw); draw();
    host.append(sourceNote('Delayed prices. Futures are the front month. Returns are price changes from daily closes. Click any row for its full page.'));
  };

  PAGES.cal = (host, arg) => {
    let tab = arg === 'earnings' ? 'earnings' : arg === 'cb' ? 'cb' : 'eco', ccy = new Set(T.D().ccy || []), high = false;
    setHead('CAL', 'Calendar', 'Economic releases, earnings and central bank decisions');
    const tabsHost = el('div'), box = el('div'); host.append(tabsHost, box);
    const draw = () => {
      tabsHost.replaceChildren(pageTabs([['eco', 'Economic'], ['earnings', 'Earnings'], ['cb', 'Central banks']], tab, v => { tab = v; draw(); }));
      box.replaceChildren();
      if (tab === 'eco') {
        const all = [...new Set((S.calendar?.events || []).map(e => e.currency))].sort();
        const f = el('div', 'fx-chips'); f.append(btn(high ? 'High impact only ✓' : 'High impact only', 'fx-chip' + (high ? ' on' : ''), () => { high = !high; draw(); }), btn('All currencies', 'fx-chip' + (!ccy.size ? ' on' : ''), () => { ccy.clear(); draw(); }));
        all.forEach(c => f.append(btn(c, 'fx-chip cc-' + c + (ccy.has(c) ? ' on' : ''), () => { ccy.has(c) ? ccy.delete(c) : ccy.add(c); draw(); }))); box.append(f);
        const ev = (S.calendar?.events || []).filter(e => (!high || e.impact === 'high') && (!ccy.size || ccy.has(e.currency))).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
        if (!ev.length) return box.append(el('p', 'fx-empty', S.calendar ? 'No events match.' : 'Loading calendar…'));
        let last = '';
        for (const e of ev) { const d = new Date(e.time).toLocaleDateString(undefined, {weekday: 'long', month: 'short', day: 'numeric'}); if (d !== last) { box.append(el('h3', 'pg-day', d)); last = d; } box.append(T.ecoRow(e)); }
        box.append(sourceNote('Forex Factory weekly calendar via the FYNX research snapshot · times in your local time zone · click an event for forecast and previous.'));
      } else if (tab === 'earnings') {
        const today = new Date().toISOString().slice(0, 10), ev = (S.earn?.events || []).filter(e => e.date >= today);
        if (!ev.length) return box.append(el('p', 'fx-empty', S.earn ? 'No earnings in the published window.' : 'Loading earnings…'));
        let last = '', table = null;
        for (const e of ev) {
          if (e.date !== last) { box.append(el('h3', 'pg-day', new Date(e.date + 'T12:00:00Z').toLocaleDateString(undefined, {weekday: 'long', month: 'short', day: 'numeric'}))); table = el('table', 'fx-table pg-table'); const h = el('tr'); ['SYMBOL', 'COMPANY', 'TIME', 'QUARTER', 'EPS FCST', 'YEAR AGO', 'MKT VALUE'].forEach(x => h.append(el('th', '', x))); table.append(h); const w = el('div', 'pg-scroll'); w.append(table); box.append(w); last = e.date; }
          const tr = el('tr', 'pg-click'); tr.addEventListener('click', () => open('des', e.symbol));
          tr.append(el('th', '', e.symbol), el('td', 'pg-name', e.name), el('td', '', e.time), el('td', 'fx-dim', e.fiscalQuarter), el('td', 'fx-num', finite(e.epsForecast) ? '$' + e.epsForecast.toFixed(2) : '—'), el('td', 'fx-num fx-dim', finite(e.lastYearEPS) ? '$' + e.lastYearEPS.toFixed(2) : '—'), el('td', 'fx-num', big(e.marketCap)));
          table.append(tr);
        }
        box.append(sourceNote(`${S.earn.source} · ${S.earn.from} to ${S.earn.to}`));
      } else {
        const rows = (S.schedule?.banks || []).flatMap(b => (b.decisions || []).filter(d => d >= new Date().toISOString().slice(0, 10)).slice(0, 4).map(d => ({b, d}))).sort((a, c) => a.d.localeCompare(c.d));
        if (!rows.length) return box.append(el('p', 'fx-empty', 'Loading central bank schedules…'));
        for (const {b, d} of rows) { const r = rowButton('pg-cbrow', () => open('cb', b.short), `${b.name} ${d}`); r.append(el('time', '', new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'})), el('b', '', b.short.toUpperCase()), el('span', '', b.name), el('span', 'fx-num fx-dim', M.policyRate(b.currency, S.desk)?.display || '')); box.append(r); }
        box.append(sourceNote('Decision dates from each central bank’s published calendar.'));
      }
    };
    draw();
  };

  PAGES.cb = (host, short) => {
    const banks = S.schedule?.banks || [], b = banks.find(x => x.short?.toLowerCase() === String(short || '').toLowerCase()) || banks.find(x => x.area === 'US');
    if (!b) { setHead('CB', 'Central banks'); return host.append(el('p', 'fx-empty', 'Loading central banks…')); }
    const rate = M.policyRate(b.currency, S.desk), n = M.nextDecision(b), odds = b.area === 'US' ? S.desk?.fed?.odds : null;
    setHead('CB', b.name, `${b.currency} · ${b.instrument || ''}`);
    host.append(pageTabs(banks.map(x => [x.short, x.short.toUpperCase()]), b.short, v => { stack.at(-1).arg = v; history.replaceState(history.state, '', location.pathname + location.search + hashOf('cb', v)); show(); }));
    host.append(cards([['POLICY RATE', rate?.display || '—', '', rate ? `${rate.source}, ${rate.observationDate}` : ''], ['NEXT DECISION', n ? day(n.date) : '—', '', n?.at ? new Date(n.at).toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit'}) : ''], ['COUNTDOWN', n ? (n.at ? M.countdown(n.at - Date.now()) : n.daysAway + ' days') : '—', 'fx-up'], ['FUTURES IMPLY', odds ? signed(odds.expectedChangeBp, 0, ' bp') : '—', '', odds ? 'CBOT Fed funds futures' : 'No free public futures feed']]));
    if (odds) { const s = section('Fed funds futures pricing'); const bar = el('span', 'fx-oddsbar pg-oddsbar'); for (const [k, c] of [['cut50', 'c2'], ['cut', 'c1'], ['hold', 'h'], ['hike', 'k1'], ['hike50', 'k2']]) if (odds[k] > 0) { const i = el('i', c); i.style.width = odds[k] + '%'; bar.append(i); } s.append(bar); kv(s, [...[['cut50', 'Cut 50 bp'], ['cut', 'Cut 25 bp'], ['hold', 'No change'], ['hike', 'Hike 25 bp'], ['hike50', 'Hike 50 bp']].filter(([k]) => odds[k] > 0).map(([k, l]) => [l, Math.round(odds[k]) + '%']), ['Implied rate after', finite(odds.impliedRateAfter) ? odds.impliedRateAfter.toFixed(3) + '%' : null], ['EFFR', S.desk.fed.effr ? `${S.desk.fed.effr.value.toFixed(2)}% (${S.desk.fed.effr.date})` : null], ['Method', odds.method === 'meeting-month' ? 'Meeting-month contract, FedWatch-style' : 'Following-month contract']]); host.append(s); }
    const sched = section('Decision schedule'); kv(sched, (b.decisions || []).filter(d => d >= new Date().toISOString().slice(0, 10)).slice(0, 8).map((d, i) => [i ? 'Then' : 'Next', new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'})])); sched.append(chips([b.calendarURL ? link('Official calendar ↗︎', b.calendarURL, 'fx-chip fx-chip-link') : null]));
    const ev = section('This week'), evs = (S.desk?.events?.events || []).filter(e => e.currency === b.currency).concat((S.calendar?.events || []).filter(e => e.currency === b.currency && e.impact === 'high'));
    const seen = new Set(); evs.filter(e => { const k = e.title + e.time; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, c) => Date.parse(a.time) - Date.parse(c.time)).forEach(e => ev.append(el('p', 'pg-p', `${new Date(e.time).toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit'})} · ${e.title}`)));
    if (!ev.querySelector('.pg-p')) ev.append(el('p', 'fx-empty', 'No scheduled events for this currency this week.'));
    const two = grid('pg-g2'); two.append(sched, ev); host.append(two);
    if (S.desk?.curves?.[b.area]) { const c = T.curveChart(b.area, {W: 960, H: 220}); const s = section(`${M.AREAS[b.area].label} yield curve`); s.append(c.chart, T.tenorGrid(b.area, c.view, c.curve)); host.append(s); }
    const news = section('Headlines'); newsList(news, matchNews([b.name, b.short.length > 2 ? b.short : '', ...({Fed: ['Powell', 'FOMC'], ECB: ['Lagarde'], BoE: ['Bailey'], BoJ: ['Ueda']}[b.short] || [])]), 'No headlines mention this central bank in the current feeds.'); host.append(news);
  };

  PAGES.journal = host => {
    setHead('JRNL', 'Your trading journal', 'Your saved trades, synced from your FYNX account');
    const j = S.journal;
    if (j.status === 'signed-out') return host.append(el('p', 'pg-lead', 'Sign in to see your saved trades here. Sign-in opens in a new tab; come back to this tab when you are done.'), chips([link('Sign in ↗︎', '/auth/login.html?return=/terminal.html%23journal', 'fx-chip fx-chip-link pg-primary'), link('Journal on the website ↗︎', '/journal.html', 'fx-chip fx-chip-link')]));
    if (j.status !== 'ready') return host.append(el('p', 'fx-empty', j.status === 'error' ? 'Journal sync is unavailable right now.' : 'Loading your journal…'));
    const t = j.trades, pls = t.map(x => x.pl).filter(finite), net = pls.reduce((s, v) => s + v, 0), wins = pls.filter(v => v > 0), losses = pls.filter(v => v < 0);
    const pf = losses.length ? wins.reduce((s, v) => s + v, 0) / Math.abs(losses.reduce((s, v) => s + v, 0)) : null;
    host.append(cards([['TRADES', String(t.length)], ['WIN RATE', pls.length ? (wins.length / pls.length * 100).toFixed(0) + '%' : '—'], ['NET P/L', pls.length ? signed(net, 2) : '—', tone(net)], ['PROFIT FACTOR', finite(pf) ? pf.toFixed(2) : '—'], ['AVG WIN', wins.length ? '$' + (wins.reduce((s, v) => s + v, 0) / wins.length).toFixed(2) : '—', 'fx-up'], ['AVG LOSS', losses.length ? '−$' + Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length).toFixed(2) : '—', 'fx-down'], ['BEST', pls.length ? '$' + Math.max(...pls).toFixed(2) : '—'], ['WORST', pls.length ? '$' + Math.min(...pls).toFixed(2) : '—']]));
    const sorted = [...t].filter(x => x.date).sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length > 1) { let run = 0; const rows = sorted.map(x => ({date: x.date, close: (run += x.pl || 0)})); const s = section('Equity curve'); s.append(T.lineChart(rows, {digits: 2, W: 960, H: 240, label: 'Cumulative P/L', source: 'Your journal trades'})); host.append(s); }
    const by = {}; t.forEach(x => { const k = x.symbol || '—'; by[k] = by[k] || {n: 0, pl: 0, w: 0}; by[k].n++; if (finite(x.pl)) { by[k].pl += x.pl; if (x.pl > 0) by[k].w++; } });
    const s2 = section('By market'), tb = el('table', 'fx-table pg-table'), h = el('tr'); ['MARKET', 'TRADES', 'WIN RATE', 'NET P/L'].forEach(x => h.append(el('th', '', x))); tb.append(h);
    Object.entries(by).sort((a, b) => b[1].pl - a[1].pl).forEach(([k, v]) => { const tr = el('tr'); tr.append(el('th', '', k), el('td', 'fx-num', v.n), el('td', 'fx-num', (v.w / v.n * 100).toFixed(0) + '%'), el('td', 'fx-num ' + tone(v.pl), signed(v.pl, 2))); tb.append(tr); });
    s2.append(tb);
    const s3 = section('All trades'), tt = el('table', 'fx-table pg-table'), h3 = el('tr'); ['DATE', 'MARKET', 'SIDE', 'SESSION', 'P/L'].forEach(x => h3.append(el('th', '', x))); tt.append(h3);
    [...sorted].reverse().forEach(x => { const tr = el('tr'); tr.append(el('td', '', x.date), el('th', '', x.symbol || '—'), el('td', '', x.side || ''), el('td', 'fx-dim', x.session || ''), el('td', 'fx-num ' + tone(x.pl), finite(x.pl) ? signed(x.pl, 2) : '—')); tt.append(tr); });
    const w = el('div', 'pg-scroll'); w.append(tt); s3.append(w, chips([link('Add or edit trades on the website ↗︎', '/journal.html', 'fx-chip fx-chip-link')]));
    host.append(s2, s3);
  };

  PAGES.calc = (host, arg = {}) => {
    let kind = arg.kind && T.CALC_TITLE[arg.kind] ? arg.kind : T.D().calc;
    setHead('CALC', 'Calculators', 'Live prices fill in automatically · calculations run in your browser');
    const tabsHost = el('div'), box = el('div', 'pg-calc'); host.append(tabsHost, box);
    const draw = (preset) => {
      tabsHost.replaceChildren(pageTabs(Object.entries(T.CALC_TITLE), kind, v => { kind = v; draw(); }));
      box.replaceChildren(el('h2', 'pg-h2', T.CALC_TITLE[kind]));
      T.calculator(box, kind, {preset});
    };
    const preset = arg.kind === 'options' ? {sym: arg.sym, strike: arg.strike, premium: finite(arg.premium) ? +arg.premium.toFixed(2) : null} : arg.pair ? {pair: arg.pair} : arg.sym ? {sym: arg.sym} : undefined;
    draw(preset);
    host.append(sourceNote('Results are arithmetic on the numbers shown. Contract sizes, margins and fees vary by broker. Not advice.'));
  };

  PAGES.options = (host, sym) => {
    const all = S.opts?.underlyings || {};
    if (!sym || !all[sym]) sym = all[S.optSym] ? S.optSym : Object.keys(all)[0];
    if (!sym) { setHead('OPT', 'Options'); return host.append(el('p', 'fx-empty', 'Loading option chains…')); }
    const u = all[sym]; let exp = Math.min(S.optExp, u.expiries.length - 1);
    setHead('OPT', `${sym} options`, `${S.opts.source} · ${new Date(u.asOf).toLocaleString()}`);
    host.append(pageTabs(Object.keys(all).map(s => [s, s]), sym, v => { stack.at(-1).arg = v; S.optSym = v; S.optExp = 0; history.replaceState(history.state, '', location.pathname + location.search + hashOf('options', v)); show(); }));
    host.append(cards([['LAST', fmt(u.price, 2)], ['CHANGE', signed(u.changePercent, 2, '%'), tone(u.changePercent)], ['IV30', finite(u.iv30) ? u.iv30.toFixed(2) + '%' : '—', '', finite(u.iv30Change) ? signed(u.iv30Change, 2, ' pts') : ''], ['PUT/CALL VOL', finite(u.putCallVolume) ? u.putCallVolume.toFixed(2) : '—', '', `${count(u.putVolume)} puts · ${count(u.callVolume)} calls`], ['PUT/CALL OI', finite(u.putCallOI) ? u.putCallOI.toFixed(2) : '—', '', `${count(u.putOI)} · ${count(u.callOI)}`], ['CONTRACTS', count(u.contracts)]]));
    const chainSec = section('');
    const ivs = u.expiries.filter(x => finite(x.atmIV));
    const two = grid('pg-g2');
    if (ivs.length > 2) {
      const s = section('At-the-money IV by expiry'), W = 460, H = 150, vals = ivs.map(x => x.atmIV * 100), lo = Math.min(...vals) * 0.9, hi = Math.max(...vals) * 1.1, x = i => 30 + i * (W - 40) / (ivs.length - 1), y = v => 8 + (hi - v) / (hi - lo) * (H - 28);
      const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart', role: 'img', 'aria-label': 'Implied volatility term structure'});
      c.append(svg('polyline', {points: vals.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: 'ln-w', fill: 'none'}));
      const marks = [...new Set([0, Math.round((ivs.length - 1) / 3), Math.round((ivs.length - 1) * 2 / 3), ivs.length - 1])];
      ivs.forEach((e, i) => { c.append(svg('circle', {cx: x(i), cy: y(vals[i]), r: 3, class: 'cd'})); if (marks.includes(i)) { const t = svg('text', {x: x(i), y: H - 3, class: 'a', 'text-anchor': i === 0 ? 'start' : i === ivs.length - 1 ? 'end' : 'middle'}); t.textContent = `${day(e.date)} ${vals[i].toFixed(1)}%`; c.append(t); } });
      s.append(c); two.append(s);
    }
    const es = section('Expiries'); S.optExp = exp; T.optSummary(es, u, i => { exp = i; es.querySelectorAll('button.fx-exp').forEach((r, j) => r.classList.toggle('sel', j === i)); drawChain(); chainSec.scrollIntoView({behavior: 'smooth', block: 'start'}); }); es.querySelector('.fx-calcout')?.remove(); two.append(es);
    host.append(two);
    host.append(chainSec);
    const drawChain = () => {
      chainSec.replaceChildren(el('h2', 'pg-h2', 'Option chain'), pageTabs(u.expiries.slice(0, 10).map((x, i) => [i, `${day(x.date)} · ${x.dte}d`]), exp, v => { exp = v; S.optExp = v; drawChain(); }));
      const e = u.expiries[exp];
      chainSec.append(cards([['EXPIRY', day(e.date), '', `${e.dte} days`], ['ATM STRIKE', fmt(e.atmStrike, e.atmStrike % 1 ? 1 : 0)], ['ATM IV', finite(e.atmIV) ? (e.atmIV * 100).toFixed(1) + '%' : '—'], ['EXPECTED MOVE', finite(e.straddle) ? `±${fmt(e.straddle, 2)} (${e.movePercent.toFixed(2)}%)` : '—'], ['MAX PAIN', fmt(e.maxPain, 0)], ['25Δ SKEW', finite(e.skew25) ? signed(e.skew25 * 100, 1, ' pts') : '—']]));
      const w = el('div', 'pg-scroll'); w.append(T.chainTable(u, e)); chainSec.append(w, sourceNote('Calls left, puts right · shaded = in the money · click a row for greeks, break-even and the payoff calculator.'));
    };
    drawChain();
    const act = section('Most active contracts'), tb = el('table', 'fx-table pg-table'), h = el('tr'); ['CONTRACT', 'LAST', 'BID', 'ASK', 'IV', 'DELTA', 'VOLUME', 'OPEN INT'].forEach(x => h.append(el('th', '', x))); tb.append(h);
    u.mostActive.forEach(c => { const tr = el('tr'); tr.append(el('th', c.type === 'C' ? 'fx-up' : 'fx-down', `${day(c.expiry)} ${fmt(c.strike, c.strike % 1 ? 1 : 0)} ${c.type === 'C' ? 'Call' : 'Put'}`), el('td', 'fx-num', fmt(c.last, 2)), el('td', 'fx-num', fmt(c.bid, 2)), el('td', 'fx-num', fmt(c.ask, 2)), el('td', 'fx-num', finite(c.iv) ? (c.iv * 100).toFixed(1) + '%' : '—'), el('td', 'fx-num', finite(c.delta) ? c.delta.toFixed(2) : '—'), el('td', 'fx-num', count(c.volume)), el('td', 'fx-num fx-dim', count(c.oi))); tb.append(tr); });
    const w = el('div', 'pg-scroll'); w.append(tb); act.append(w); host.append(act);
    host.append(chips([go('Payoff calculator', 'calc', {kind: 'options', sym}), go('Security page', 'des', sym), link('Cboe quote page ↗︎', `https://www.cboe.com/delayed_quotes/${sym.toLowerCase()}/quote_table`, 'fx-chip fx-chip-link')]));
  };

  PAGES.vol = host => {
    setHead('VOL', 'Volatility', 'VIX, its term structure, cross-asset volatility and market mood');
    const ids = ['^VIX9D', '^VIX', '^VIX3M', '^VIX6M', '^VVIX', '^VXN', '^MOVE', '^OVX', '^GVZ'].filter(id => T.quoteFor(id));
    if (ids.length) host.append(cards(ids.map(id => { const q = T.quoteFor(id); return [T.shortOf(id), fmt(q.price, 2), tone(q.changePercent), `${T.nameOf(id)} · ${signed(q.changePercent, 2, '%')}`]; })));
    if (S.vix?.rows?.length) { const s = section('VIX daily closes'); s.append(T.lineChart(S.vix.rows.slice(-504).map(r => ({date: r.date, close: r.close})), {digits: 2, W: 960, H: 260, label: 'VIX', source: 'Cboe VIX history'})); host.append(s); }
    const two = grid('pg-g2'), term = section('Term structure'), vix = ['^VIX9D', '^VIX', '^VIX3M', '^VIX6M'].map(id => ({id, q: T.quoteFor(id)})).filter(x => x.q);
    if (vix.length > 2) { kv(term, vix.map(x => [T.nameOf(x.id), `${x.q.price.toFixed(2)} (${signed(x.q.changePercent, 2, '%')})`])); term.append(el('p', 'pg-p', vix.at(-1).q.price > vix[0].q.price ? 'Upward slope (contango): near-term expected volatility is below longer-term — the usual, calmer state.' : 'Inverted (backwardation): near-term fear is above longer-term expectations — typical of stress.')); } else term.append(el('p', 'fx-empty', 'Loading…'));
    const mood = section('Market mood'), m = S.edge?.mood;
    if (m?.value) { kv(mood, [['Mood', m.value], ['Score', finite(m.score) ? m.score.toFixed(2) : '—'], ['FX volatility', S.edge.volatility ? `${S.edge.volatility.value}, ${M.ordinal(Math.round(S.edge.volatility.percentile))} percentile` : '—'], ...(m.parts || []).map(i => [i.name, finite(i.value) ? signed(i.value, 2) : 'n/a'])]); } else mood.append(el('p', 'fx-empty', 'Loading…'));
    two.append(term, mood); host.append(two);
    const opt = section('Options implied volatility (30-day)'); const u = Object.values(S.opts?.underlyings || {}).filter(x => finite(x.iv30)).sort((a, b) => b.iv30 - a.iv30);
    if (u.length) { const g = el('div', 'fx-heat pg-heat'); u.forEach(x => { const t = btn('', 'fx-tile', () => open('options', x.symbol), `${x.symbol} IV ${x.iv30}`); const a = Math.min(1, x.iv30 / 80); t.style.background = `rgba(91,141,239,${0.15 + a * 0.7})`; t.append(el('b', '', x.symbol), el('span', '', x.iv30.toFixed(1) + '%')); g.append(t); }); opt.append(g); }
    host.append(opt, sourceNote('Cboe volatility indices via Yahoo Finance (delayed) · VIX history from Cboe · option IV from Cboe delayed quotes.'));
  };

  PAGES.intel = host => {
    let key = S.deskKey;
    setHead('INTEL', 'FYNX Intelligence', 'What matters now, ranked from every live feed in the terminal');
    const tabsHost = el('div'), box = el('div'); host.append(tabsHost, box);
    const draw = () => {
      tabsHost.replaceChildren(pageTabs(T.DESK_ORDER.map(k => [k, T.DESK_DEFS[k].label]), key, v => { key = v; draw(); }));
      box.replaceChildren();
      const items = T.intelItems(key);
      if (!items.length) return box.append(el('p', 'fx-empty', 'Scanning the live feeds…'));
      const list = el('div', 'pg-intel'); items.slice(0, 30).forEach((it, i) => list.append(T.intelRow(it, i))); box.append(list);
    };
    draw();
    const m = section('How the ranking works');
    kv(m, [['MOVE', 'Today’s change divided by the market’s own typical daily move over 20 days. 2σ+ moves rank high.'], ['NEWS / OFFICIAL', 'This desk’s newsroom feed, newest and highest priority first, boosted when a headline names a market on the desk.'], ['EVENT', 'High-impact releases in the next 48 hours for the desk’s currencies; sooner ranks higher.'], ['CB / FED', 'Central bank decisions within a week; Fed funds futures pricing a move.'], ['RATES', 'A one-day move of 4 bp or more in the US 10-year yield.'], ['COT / BIAS', 'Crowded CFTC positioning; Smart Bias scores beyond ±40.'], ['VOL / OPT / IV', 'VIX moves of 7%+, unusual put/call volume, big changes in 30-day implied volatility.'], ['EARN', 'The largest companies reporting in the next two days.'], ['Score', '1–99, comparable across categories. Rules are fixed and shown here; nothing is a recommendation.']]);
    host.append(m);
  };

  // Plugins add pages: add(name, label, render(body, arg, alive)).
  const add = (name, label, render) => { NAMES[name] = label; PAGES[name] = render; };
  return {open, back, closeAll, fromLocation, add, setHead, section, cards, chips, go, pageTabs, sourceNote, quoteTable, newsList, matchNews, grid, rerender: () => { if (stack.length) show(); }, isOpen: () => stack.length > 0, refresh: name => { if (stack.at(-1)?.name === name) show(); }};
};
