/* Regression coverage for public terminal data and the shared shell integration. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { createTerminalData, normalizeBriefing, normalizeQuotes, normalizeHistory, instruments } = require('../assets/js/terminal-market-data.js');
const NOW = Date.parse('2026-10-29T18:00:00.000Z');
const iso = offset => new Date(NOW + offset).toISOString();
const DAY = 86400000;
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = payload => ({ ok: true, text: async () => JSON.stringify(payload) });
const quote = (symbol = 'SPY', overrides = {}) => ({ symbol, price: 123.45, currency: 'USD', asOf: iso(-60000), fetchedAt: iso(0), changePercent: 1.25, source: 'Fixture source', sourceURL: 'https://finance.yahoo.com/quote/SPY/', basis: 'Previous close', delayed: true, ...overrides });
const quotePayload = overrides => ({ fetchedAt: iso(0), quotes: { SPY: quote() }, ...overrides });
const story = overrides => ({ id: 'release-1', title: 'Published economic release', url: 'https://www.bea.gov/news/2026/fixture', source: 'BEA', sourceId: 'bea', publishedAt: iso(-3600000), ...overrides });
const feed = (items, overrides = {}) => ({ status: 'fresh', stale: false, fetchedAt: iso(0), items, sources: [{ id: 'bea', name: 'BEA', status: 'fresh', fetchedAt: iso(0) }], ...overrides });
const historyPayload = overrides => ({ symbol: 'SPY', currency: 'USD', adjusted: true, fetchedAt: iso(0), source: 'Fixture source', sourceURL: 'https://finance.yahoo.com/quote/SPY/history/', bars: [{ date: '2026-10-27', open: 122, high: 126, low: 121, close: 124 }, { date: '2026-10-28', open: 124, high: 128, low: 123, close: 127 }], ...overrides });

test('official releases remain usable when publisher headlines fail, with their original dates and provenance', async () => {
  const data = createTerminalData({ FYNXMarketIntelligenceData: {
    loadHeadlines: async () => { throw Error('Headlines offline'); },
    loadOfficialReleases: async () => feed([story()]),
  } }, { now: () => NOW });
  const result = await data.loadBriefing();
  assert.equal(result.coverage, 'official-releases');
  assert.equal(result.headlineCount, 0);
  assert.equal(result.releaseCount, 1);
  assert.equal(result.partial, true);
  assert.equal(result.items[0].kind, 'official-release');
  assert.equal(result.items[0].publishedAt, iso(-3600000));
  assert.equal(result.items[0].source, 'BEA');
  assert.match(result.message, /Publisher headlines could not be retrieved/);
  assert.equal(result.feeds.headlines.status, 'unavailable');
  assert.equal(result.feeds.releases.status, 'fresh');
});

test('briefings reject unsafe links, missing or implausible dates, and duplicate sources without inventing replacement stories', () => {
  const unsafe = ['javascript:alert(1)', 'data:text/html,test', 'http://example.com/story', 'https://user:secret@example.com/story', 'https://127.0.0.1/story', 'https://example.local/story', 'https://example.com:8443/story'];
  const rows = [story({ title: '<img src=x onerror=alert(1)> Published release' }), ...unsafe.map((url, i) => story({ id: 'bad-' + i, url })), story({ id: 'no-date', url: 'https://www.bea.gov/no-date', publishedAt: null }), story({ id: 'future', url: 'https://www.bea.gov/future', publishedAt: iso(2 * DAY) })];
  const result = normalizeBriefing(null, feed(rows), NOW);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, 'Published release');
  assert.equal(result.items[0].description, '');
  const duplicate = normalizeBriefing(feed([story()]), feed([story()]), NOW);
  assert.equal(duplicate.items.length, 1);
  const noContent = normalizeBriefing(feed([story({ publishedAt: iso(-9 * DAY) })]), null, NOW);
  assert.equal(noContent.items.length, 0);
  assert.equal(noContent.status, 'unavailable');
  assert.equal(noContent.publishedAt, null);
});

test('quotes retain ETF labels and real values, while invalid prices and timestamps remain unavailable', () => {
  assert.deepEqual(instruments.filter(item => item.group === 'ETF').map(item => [item.symbol, item.name]), [['SPY', 'S&P 500 ETF'], ['QQQ', 'Nasdaq 100 ETF'], ['DIA', 'Dow Jones ETF']]);
  const valid = normalizeQuotes(quotePayload(), NOW);
  assert.equal(valid.quotes.SPY.price, 123.45);
  assert.equal(valid.quotes.SPY.asOf, iso(-60000));
  assert.equal(valid.quotes.SPY.basis, 'Previous close');
  assert.equal(valid.quotes.QQQ, undefined);
  assert.equal(valid.partial, true);
  for (const bad of [{ price: 0 }, { price: -10 }, { price: '123.45' }, { price: Infinity }, { asOf: null }, { asOf: 'unknown' }, { asOf: iso(-5 * DAY) }, { asOf: iso(600000) }, { sourceURL: 'javascript:alert(1)' }, { symbol: 'SPX' }, { currency: '' }, { basis: '' }]) {
    const result = normalizeQuotes(quotePayload({ quotes: { SPY: quote('SPY', bad) } }), NOW);
    assert.deepEqual(result.quotes, {}, JSON.stringify(bad));
    assert.equal(result.status, 'unavailable');
  }
  assert.equal(normalizeQuotes(quotePayload({ quotes: { SPY: quote('SPY', { changePercent: NaN }) } }), NOW).quotes.SPY.changePercent, null);
  assert.throws(() => normalizeQuotes(quotePayload({ fetchedAt: iso(-2 * DAY) }), NOW));
});

test('history requires current, ordered adjusted ETF prices and never fabricates chart bars', () => {
  const payload = historyPayload(), result = normalizeHistory(payload, NOW);
  assert.deepEqual(result.bars, payload.bars);
  assert.equal(result.name, 'S&P 500 ETF');
  assert.match(result.message, /not an intraday chart/);
  for (const bad of [{ adjusted: false }, { symbol: 'SPX' }, { bars: [] }, { bars: payload.bars.slice().reverse() }, { bars: [...payload.bars, payload.bars[1]] }, { bars: [{ ...payload.bars[0], date: '2026-02-30' }, payload.bars[1]] }, { bars: [{ ...payload.bars[0], high: 100 }, payload.bars[1]] }, { sourceURL: 'data:text/html,test' }]) {
    assert.throws(() => normalizeHistory(historyPayload(bad), NOW));
  }
});

test('concurrent consumers share one quote request; refresh failures expose dated saved data only within the cache window', async () => {
  let clock = NOW, calls = 0, resolveFetch, fail = false;
  const data = createTerminalData({ location: { hostname: 'www.fynxfinanceworld.com' }, fetch: (url, options) => {
    calls++;
    assert.equal(new URL(url).hostname, 'us-central1-fynx-c7a28.cloudfunctions.net');
    assert.equal(options.credentials, 'omit');
    if (fail) return Promise.reject(Error('Offline'));
    return new Promise(resolve => { resolveFetch = resolve; });
  } }, { now: () => clock });
  const first = data.loadQuotes(), simultaneous = data.loadQuotes({ force: true });
  assert.equal(first, simultaneous);
  assert.equal(calls, 1);
  resolveFetch(response(quotePayload()));
  const fresh = await first;
  assert(Object.isFrozen(fresh.quotes.SPY));
  assert.equal(await data.loadQuotes(), fresh);
  assert.equal(calls, 1);
  fail = true; clock += 120000;
  const saved = await data.loadQuotes({ force: true });
  assert.equal(saved.status, 'cached');
  assert.equal(saved.stale, true);
  assert.equal(saved.fetchedAt, iso(0));
  assert.equal(saved.quotes.SPY.asOf, iso(-60000));
  assert.equal(saved.quotes.SPY.price, 123.45);
  assert.match(saved.message, /dated saved quotes/);
  clock = NOW + 16 * 60000;
  const expired = await data.loadQuotes({ force: true });
  assert.deepEqual(expired.quotes, {});
  assert.equal(expired.status, 'unavailable');
  assert.equal(expired.fetchedAt, null);
});

test('briefing cache marks every retained item and source saved after both upstream services fail', async () => {
  let clock = NOW, fail = false, headlineCalls = 0, releaseCalls = 0, release;
  const data = createTerminalData({ FYNXMarketIntelligenceData: {
    loadHeadlines: async () => { headlineCalls++; if (fail) throw Error('Offline'); return feed([story({ id: 'headline', url: 'https://www.reuters.com/markets/fixture' })]); },
    loadOfficialReleases: () => { releaseCalls++; if (fail) return Promise.reject(Error('Offline')); return new Promise(resolve => { release = resolve; }); },
  } }, { now: () => clock });
  const first = data.loadBriefing(), second = data.loadBriefing({ force: true });
  assert.equal(first, second);
  release(feed([story()]));
  await first;
  assert.equal(headlineCalls, 1); assert.equal(releaseCalls, 1);
  fail = true; clock += 360000;
  const saved = await data.loadBriefing({ force: true });
  assert.equal(saved.status, 'cached');
  assert(saved.items.every(item => item.stale && item.status === 'cached'));
  assert(saved.sources.every(source => source.status === 'cached'));
  assert(saved.items.every(item => item.publishedAt === iso(-3600000)));
  assert.equal(saved.fetchedAt, iso(0));
  clock = NOW + DAY + 1;
  const expired = await data.loadBriefing({ force: true });
  assert.equal(expired.items.length, 0);
  assert.equal(expired.status, 'unavailable');
});

async function domFor(file) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(read(file), { url: 'https://www.fynxfinanceworld.com/' + file, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
  dom.window.setInterval = () => 1;
  return { dom, window: dom.window, errors };
}

test('deferred header waits for actual fynx-nav at interactive, preserves account nodes, and mounts once', async () => {
  const { dom, window: w, errors } = await domFor('home.html');
  try {
    let state = 'loading';
    Object.defineProperty(w.document, 'readyState', { configurable: true, get: () => state });
    w.eval(read('fynx-nav.js'));
    state = 'interactive';
    w.eval(read('assets/js/terminal-header.js'));
    assert(!w.document.body.classList.contains('terminal-masthead-ready'));
    let originalAvatar, originalBell, bellClicks = 0;
    w.document.addEventListener('DOMContentLoaded', () => {
      originalAvatar = w.document.getElementById('avatarInitials');
      originalBell = w.document.querySelector('.icon-btn[aria-label="Notifications"]');
      originalBell.addEventListener('click', () => bellClicks++);
    }, { once: true });
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    await tick();
    assert(w.document.body.classList.contains('terminal-masthead-ready'));
    assert.equal(w.document.getElementById('avatarInitials'), originalAvatar);
    assert.equal(w.document.querySelector('.icon-btn[aria-label="Notifications"]'), originalBell);
    originalBell.click(); assert.equal(bellClicks, 1);
    w.FynxIdentity = { uid: 'fixture-user', displayName: 'Test Trader' };
    w.dispatchEvent(new w.Event('fynx:identity'));
    assert.equal(originalAvatar.textContent, 'TT');
    assert.equal(w.document.querySelector('#publicAccountLinks a:last-child').pathname, '/profile.html');
    assert.equal(w.document.querySelector('.terminal-header-search').action, 'https://www.fynxfinanceworld.com/explore.html');
    assert.equal(w.document.querySelector('.nav-item[aria-current="page"]').dataset.view, 'home');
    state = 'complete'; w.dispatchEvent(new w.Event('load')); await tick();
    assert.equal(w.document.querySelectorAll('.terminal-utility').length, 1);
    assert.equal(w.document.querySelectorAll('[data-terminal-ticker]').length, 1);
    assert.equal(w.document.querySelectorAll('.terminal-header-search').length, 1);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('Home preserves journal selectors and real account updates after its layout changes', async () => {
  const { dom, window: w } = await domFor('home.html');
  try {
    for (const id of ['homeStatsStatus', 'homePnl', 'homeTrades', 'homeWinRate']) assert.equal(w.document.querySelectorAll('#' + id).length, 1, id);
    let authChange, snapshot;
    const stripImports = source => source.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace(/export /g, '');
    vm.runInNewContext(stripImports(read('assets/js/home-journal.js')), { document: w.document, localStorage: w.localStorage, auth: {}, app: {}, onAuthStateChanged: (_, callback) => { authChange = callback; }, getFirestore: () => ({}), collection: () => ({}), onSnapshot: (_, callback) => { snapshot = callback; return () => {}; } });
    authChange({ uid: 'fixture-user' });
    snapshot({ docs: [{ data: () => ({ pl: 125 }) }, { data: () => ({ pl: -25 }) }], empty: false });
    assert.equal(w.document.getElementById('homeTrades').textContent, '2');
    assert.equal(w.document.getElementById('homePnl').textContent, '$100.00');
    assert.equal(w.document.getElementById('homeWinRate').textContent, '50.0%');
    authChange(null);
    assert.equal(w.document.getElementById('homeTrades').textContent, '0');
    assert.equal(w.document.getElementById('homePnl').textContent, '$0.00');
  } finally { dom.window.close(); }
});

test('Home and ticker render validated links, dated official fallback, unavailable quotes, and a sourced history chart', async () => {
  const { dom, window: w, errors } = await domFor('home.html');
  try {
    const malicious = story({ id: 'bad', url: 'javascript:alert(1)', title: 'Unsafe story' });
    w.FynxTerminalData = createTerminalData({ location: w.location, fetch: async url => response(new URL(url).searchParams.get('action') === 'history' ? historyPayload() : quotePayload()), FYNXMarketIntelligenceData: { loadHeadlines: async () => { throw Error('Offline'); }, loadOfficialReleases: async () => feed([story({ title: '<img src=x onerror=alert(1)> Official fixture release' }), malicious]) } }, { now: () => NOW });
    w.eval(read('fynx-nav.js'));
    w.eval(read('assets/js/terminal-header.js'));
    w.eval(read('assets/js/terminal-market-ui.js'));
    w.eval(read('assets/js/terminal-home.js'));
    await tick(); await tick();
    const lead = w.document.getElementById('homeLeadStory');
    assert.equal(lead.querySelector('h2').textContent, 'Official fixture release');
    assert.equal(lead.querySelector('time').dateTime, iso(-3600000));
    assert.equal(lead.querySelectorAll('img,script').length, 0);
    assert.match(w.document.getElementById('briefingSource').textContent, /Official release/);
    assert.match(w.document.getElementById('homeBriefingStatus').textContent, /Publisher headlines could not be retrieved/);
    assert.equal(w.document.querySelectorAll('#homeQuoteRows tr').length, instruments.length);
    assert.match(w.document.getElementById('homeQuoteRows').textContent, /S&P 500 ETF/);
    assert.match(w.document.getElementById('homeQuoteRows').textContent, /Unavailable/);
    assert.equal(w.document.getElementById('homeChartValue').textContent, '$127.00');
    assert.match(w.document.querySelector('#homeHistoryChart svg title').textContent, /2026-10-27 to 2026-10-28/);
    assert.match(w.document.querySelector('[data-terminal-ticker]').textContent, /SPY ETF/);
    assert(!w.document.body.textContent.includes('Unsafe story'));
    for (const anchor of w.document.querySelectorAll('#homeLeadStory a, #homeSecondaryStories a, #homeLatestStories a, #homeQuoteRows a, #homeChartSource a')) {
      const url = new URL(anchor.href);
      assert.equal(url.protocol, 'https:'); assert.equal(url.username, ''); assert.equal(url.password, '');
      assert.equal(anchor.rel, 'noopener noreferrer');
    }
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('a complete upstream outage renders explicit unavailable states without invented prices, chart points, or stories', async () => {
  const { dom, window: w, errors } = await domFor('home.html');
  try {
    const offline = async () => { throw Error('Offline'); };
    w.FynxTerminalData = createTerminalData({ location: w.location, fetch: offline, FYNXMarketIntelligenceData: { loadHeadlines: offline, loadOfficialReleases: offline } }, { now: () => NOW });
    w.eval(read('fynx-nav.js'));
    w.eval(read('assets/js/terminal-header.js'));
    w.eval(read('assets/js/terminal-market-ui.js'));
    w.eval(read('assets/js/terminal-home.js'));
    await tick(); await tick();
    assert.match(w.document.getElementById('homeLeadStory').textContent, /Coverage is temporarily unavailable/);
    assert.equal(w.document.querySelector('#homeLeadStory a').pathname, '/news.html');
    assert.equal(w.document.querySelectorAll('#homeLatestStories article, #homeSecondaryStories article').length, 0);
    assert.equal(w.document.querySelectorAll('#homeHistoryChart polyline, #homeHistoryChart path').length, 0);
    assert.equal(w.document.getElementById('homeChartValue').textContent, '—');
    assert.match(w.document.getElementById('homeChartSource').textContent, /temporarily unavailable/);
    for (const row of w.document.querySelectorAll('#homeQuoteRows tr')) {
      assert.equal(row.children[1].textContent, '—');
      assert.equal(row.children[2].textContent, 'Unavailable');
    }
    assert.match(w.document.querySelector('[data-terminal-ticker]').textContent, /Quotes unavailable/);
    assert.equal(w.document.getElementById('homeBriefingRefresh').disabled, false);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('new terminal scripts and retained Home inline scripts parse without syntax errors', () => {
  for (const file of ['assets/js/terminal-market-data.js', 'assets/js/terminal-market-ui.js', 'assets/js/terminal-header.js', 'assets/js/terminal-home.js', 'assets/js/news-intelligence.js']) assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }));
  const document = new JSDOM(read('home.html')).window.document;
  for (const [index, script] of [...document.querySelectorAll('script:not([src])')].entries()) {
    if (script.type && !['module', 'text/javascript', 'application/javascript'].includes(script.type)) continue;
    if (script.type === 'module') {
      const check = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: script.textContent, encoding: 'utf8' });
      assert.equal(check.status, 0, check.stderr);
    } else assert.doesNotThrow(() => new vm.Script(script.textContent, { filename: 'home.html inline ' + index }));
  }
  document.defaultView.close();
});
