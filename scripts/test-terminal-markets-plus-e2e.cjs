'use strict';
/* Market sentiment (FYNX Fear & Greed), Market hours, News wire, SEC filings and the DES company snapshot.
 * Unit checks for the sentiment publisher, then the real Terminal scripts in Chromium with fixture data
 * (sentiment.json built by the publisher's own maths, SEC filings, financials, closes, headlines).
 * No request leaves the machine. Screenshots go to $FYNX_SHOTS when set.
 * Run: node --test scripts/test-terminal-markets-plus-e2e.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SN = require('./refresh-sentiment.cjs');
const F = require('../backend/filings-core.cjs');

const root = path.resolve(__dirname, '..');
let chromium;
try { ({chromium} = require('playwright')); } catch { ({chromium} = require('playwright-core')); }
const executablePath = process.env.FYNX_CHROMIUM_PATH || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(p => fs.existsSync(p));
const ORIGIN = 'https://www.fynxfinanceworld.com';
const TYPES = {'.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html'};
const NOW = Date.parse('2026-11-26T17:37:00Z'); // Thanksgiving, 12:37 PM ET
const SHOTS = process.env.FYNX_SHOTS;

/* ---------- publisher maths ---------- */
test('sma, rolling percentile and labels', () => {
  assert.deepEqual(SN.sma([1, 2, 3, 4, null, 6], 2), [null, 1.5, 2.5, 3.5, null, null]);
  const p = SN.rollingPercentile([1, 2, 3, 4, 5], 5, 3);
  assert.deepEqual(p, [null, null, 100, 100, 100], 'a new high ranks at the top of its window');
  assert.equal(SN.rollingPercentile([5, 4, 3, 2, 1], 5, 3)[4], 0);
  assert.equal(SN.rollingPercentile([2, 2, 2], 3, 3)[2], 50, 'ties sit in the middle');
  assert.deepEqual([10, 25, 44.9, 50, 55, 60, 75, 76].map(SN.label), ['Extreme fear', 'Fear', 'Fear', 'Neutral', 'Neutral', 'Greed', 'Greed', 'Extreme greed']);
  assert.equal(SN.label(null), null);
});

test('Michigan CSV parsing and breadth from members', () => {
  const csv = 'Month,YYYY,ICS_ALL\nNovember,2026,51.5\n"October",2026,53.6\nJunk,x,y\n';
  assert.deepEqual(SN.parseMichigan(csv), [['2026-10-01', 53.6], ['2026-11-01', 51.5]]);
  const dates = Array.from({length: 300}, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10));
  const up = new Map(dates.map((d, i) => [d, 100 + i])), down = new Map(dates.map((d, i) => [d, 500 - i]));
  const b = SN.breadth(dates, [...Array(30).fill(up), ...Array(30).fill(down)]);
  assert.equal(b.breadth.at(-1), 50, 'half the members are above their 50-day average');
  assert.equal(b.strength.at(-1), 0, '30 new highs minus 30 new lows');
  assert.equal(b.members, 60);
});

// Synthetic five-year price paths through the publisher's own maths: a long rally, then a sharp sell-off.
function sentimentFixture() {
  const dates = [], start = Date.UTC(2021, 10, 26); for (let t = start; dates.length < 1260; t += 86400000) { const w = new Date(t).getUTCDay(); if (w && w < 6) dates.push(new Date(t).toISOString().slice(0, 10)); }
  const n = dates.length, path0 = (f) => new Map(dates.map((d, i) => [d, f(i)]));
  const crash = i => i > n - 40 ? (i - (n - 40)) : 0;
  const spx = path0(i => 4000 * (1 + i * 0.0006 + Math.sin(i / 40) * 0.03) * (1 - crash(i) * 0.004));
  const vix = path0(i => 16 + Math.sin(i / 25) * 3 + crash(i) * 0.35), vix3m = path0(i => 18 + Math.sin(i / 30) * 2 + crash(i) * 0.12);
  const spy = path0(i => spx.get(dates[i]) / 10), ief = path0(i => 95 + i * 0.001 + crash(i) * 0.05);
  const hyg = path0(i => 75 + Math.sin(i / 50) - crash(i) * 0.04), lqd = path0(i => 108 + Math.cos(i / 60));
  const members = Array.from({length: 60}, (_, k) => path0(i => 50 + k + i * 0.02 * (k % 3 - 0.8) + Math.sin(i / (20 + k)) * 4 - crash(i) * 0.15));
  const out = SN.compute({dates, spx, vix, vix3m, spy, ief, hyg, lqd, members}), sum = SN.summarize(dates, out);
  return {version: 1, generatedAt: new Date(NOW - 3600000).toISOString(), method: 'Average of seven indicator scores; each scored by its percentile within its own trailing year.', ...sum,
    membersUsed: out.members, michigan: Array.from({length: 131}, (_, i) => [new Date(Date.UTC(2016, 1 + i, 1)).toISOString().slice(0, 10), Number((80 + Math.sin(i / 12) * 12 - i * 0.2).toFixed(1))]),
    sources: {prices: 'Yahoo Finance daily closes (fixture)', michigan: 'University of Michigan Surveys of Consumers (fixture)'}};
}
const SENT = sentimentFixture();

test('the publisher output has a score, look-backs and every indicator with history', () => {
  assert.ok(SENT.score >= 0 && SENT.score <= 100);
  assert.ok(SENT.score < 25, 'the sell-off reads as extreme fear: ' + SENT.score);
  assert.equal(SENT.label, SN.label(SENT.score));
  for (const k of ['prev', 'week', 'month', 'year']) assert.ok(SENT[k]?.date < SENT.asOf, k);
  assert.equal(SENT.indicators.length, 7);
  assert.ok(SENT.indicators.every(i => i.series.length > 200 && Number.isFinite(i.score)));
  assert.ok(SENT.history.length >= 500);
});

/* ---------- SEC fixtures ---------- */
const SUB = {cik: '0000320193', name: 'Apple Inc.', tickers: ['AAPL'], exchanges: ['Nasdaq'], sic: '3571', sicDescription: 'Electronic Computers', category: 'Large accelerated filer', stateOfIncorporation: 'CA', fiscalYearEnd: '0926',
  addresses: {business: {city: 'CUPERTINO', stateOrCountry: 'CA'}}, formerNames: [{name: 'APPLE COMPUTER INC', from: '1994-01-26', to: '2007-01-04'}],
  filings: {recent: {
    form: ['8-K', '10-K', '4', 'DEF 14A', '10-Q', 'SC 13G/A', 'S-8', '8-K'],
    filingDate: ['2026-10-30', '2026-10-31', '2026-10-15', '2026-01-08', '2026-08-01', '2026-02-12', '2026-03-01', '2026-07-31'],
    reportDate: ['2026-10-30', '2026-09-26', '2026-10-13', '', '2026-06-27', '', '', '2026-07-31'],
    accessionNumber: ['0000320193-26-000100', '0000320193-26-000101', '0000320193-26-000090', '0001308179-26-000010', '0000320193-26-000070', '0000930413-26-000020', '0000320193-26-000030', '0000320193-26-000060'],
    primaryDocument: ['aapl-20261030.htm', 'aapl-20260926.htm', 'xslF345X05/wk-form4.xml', 'proxy.htm', 'aapl-20260627.htm', 'sc13g.htm', 's8.htm', 'aapl-20260731.htm'],
    primaryDocDescription: ['8-K', '10-K', 'FORM 4', 'DEF 14A', '10-Q', '', 'S-8', '8-K'],
    items: ['2.02,9.01', '', '', '', '', '', '', '5.02'], size: [120000, 9800000, 4000, 2100000, 6200000, 9000, 50000, 80000]}, files: []}};
const FILINGS = {...F.recentFilings(SUB, 320193), source: 'SEC EDGAR submissions', fetchedAt: new Date(NOW).toISOString()};
const FIN = {cik: 320193, name: 'Apple Inc.', periods: ['2026-09-26', '2025-09-27'], annual: {
  '2026-09-26': {revenue: {value: 416e9}, income: {value: 112e9}, eps: {value: 7.46}, operatingCash: {value: 111e9}, capex: {value: -12.7e9}},
  '2025-09-27': {revenue: {value: 391e9}, income: {value: 94e9}, eps: {value: 6.11}}}};

test('filings core: groups, 8-K item titles and sec.gov links', () => {
  assert.equal(FILINGS.filings.length, 8);
  assert.deepEqual(FILINGS.filings.map(f => f.group), ['current', 'annual', 'insider', 'proxy', 'quarterly', 'ownership', 'registration', 'current'], 'SEC order, grouped by form');
  const eightK = FILINGS.filings.find(f => f.accession === '0000320193-26-000100');
  assert.deepEqual(eightK.items.map(i => i.code), ['2.02', '9.01']); assert.match(eightK.items[0].title, /Results of operations/i);
  assert.equal(eightK.url, 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000100/aapl-20261030.htm');
  assert.equal(FILINGS.filings.find(f => f.group === 'insider').url, null, 'a document path with folders is not linked directly');
});

/* ---------- the live Terminal ---------- */
const NEWS = cat => Array.from({length: 12}, (_, i) => ({id: `${cat}-${i}`, title: `${cat.toUpperCase()} fixture headline ${i + 1}`, url: `https://www.reuters.com/${cat}/${i}`, source: 'Reuters', publishedAt: new Date(NOW - i * 600000).toISOString(), category: cat}));
const NEWS_STUB = `window.FYNXMarketIntelligenceData = Object.freeze({publishers: [], institutions: [], officialSources: [], topics: [], categories: ['all','forex','crypto','stocks','macro','commodities','world','finance','economics','technology','politics','industries','energy','analysis'],
  getCachedHeadlines: () => null, getCachedOfficialReleases: () => null,
  loadHeadlines: async (cat) => { window.__news = (window.__news || 0) + 1; const items = Array.from({length: 12}, (_, i) => ({id: cat + '-' + i, title: cat.toUpperCase() + ' fixture headline ' + (i + 1), url: 'https://www.reuters.com/' + cat + '/' + i, source: 'Reuters', publishedAt: new Date(Date.now() - i * 600000).toISOString(), category: cat})); return {items, status: 'fresh', fetchedAt: new Date().toISOString()}; },
  loadOfficialReleases: async () => ({items: [], status: 'fresh', fetchedAt: new Date().toISOString()})});`;
const markets = () => {
  const quotes = {}, hist = p => Array.from({length: 251}, (_, k) => [new Date(Date.UTC(2025, 10, 26) + k * 86400000 * 1.45).toISOString().slice(0, 10), Number((p * (0.8 + k * 0.001)).toFixed(2))]);
  for (const [s, n, g, p, c] of [['SPY', 'SPY', 'Equity funds', 716.6, -0.3], ['AAPL', 'Apple', 'Stocks', 276.4, 0.4], ['^VIX', 'VIX', 'Volatility', 26.8, -5]]) quotes[s] = {symbol: s, name: n, group: g, price: p, changePercent: c, asOf: new Date(NOW).toISOString(), history: hist(p), vol20: 1};
  return {version: 1, generatedAt: new Date(NOW).toISOString(), source: 'fixture', quotes};
};
const equities = () => ({version: 1, generatedAt: new Date(NOW).toISOString(), indices: {sp500: ['AAPL', 'MSFT'], ndx: ['AAPL'], dow: ['AAPL']}, info: {AAPL: {n: 'Apple Inc.', sec: 'Information Technology', ind: 'Technology Hardware'}}, closes: {}, macro: null});
const scanner = () => ({version: 1, generatedAt: new Date(NOW).toISOString(), stocks: {fields: ['symbol', 'name', 'price', 'changePct', 'volume', 'marketCap', 'sector', 'industry', 'country', 'ipoYear', 'themes'], rows: [['AAPL', 'Apple Inc.', 276.4, 0.4, 4e7, 4.1e12, 'Technology', 'Computer Manufacturing', 'United States', 1980, []]]}, etfs: {rows: []}, crypto: {rows: []}});

function harness() {
  return fs.readFileSync(path.join(root, 'terminal.html'), 'utf8')
    .replace(/<!-- terminal-gate:start -->[\s\S]*?<!-- terminal-gate:end -->/, '')
    .replace(/<!-- FYNX ADSENSE VERIFICATION START -->[\s\S]*?<!-- FYNX ADSENSE VERIFICATION END -->/, '')
    .replace(/<script type="module"[^>]*><\/script>/g, '')
    .replace(/<link[^>]+fonts\.(googleapis|gstatic)[^>]*>/g, '');
}
let browser;
test.before(async () => { browser = await chromium.launch({executablePath, args: ['--no-sandbox']}); });
test.after(async () => { await browser?.close(); });
async function boot({time = NOW, width = 1600, height = 1100, filingsDown = false} = {}) {
  const ctx = await browser.newContext({viewport: {width, height}}), page = await ctx.newPage();
  await page.clock.install({time: new Date(time)});
  const json = (route, body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
  const seen = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url()); seen.push(url.href);
    if (url.origin === ORIGIN && url.pathname === '/fn/research.js') {
      if (url.searchParams.get('action') !== 'filings') return json(route, {error: 'unknown'}, 400);
      return filingsDown ? json(route, {error: 'SEC down'}, 502) : json(route, FILINGS);
    }
    if (url.origin === ORIGIN && url.pathname === '/fn/market.js') {
      if (url.searchParams.get('op') === 'closes') {
        const syms = url.searchParams.get('symbols').split(','), dates = Array.from({length: 252}, (_, k) => new Date(Date.UTC(2025, 10, 26) + k * 86400000 * 1.45).toISOString().slice(0, 10));
        return json(route, {dates, series: Object.fromEntries(syms.map((s, i) => [s, dates.map((_, k) => Number((100 * (1 + k * (i ? 0.0008 : 0.0016)) + Math.sin(k / 9) * 2).toFixed(2)))]))});
      }
      return json(route, {});
    }
    if (url.origin === ORIGIN) {
      if (url.pathname === '/terminal.html') return route.fulfill({contentType: 'text/html', body: harness()});
      if (url.pathname === '/assets/js/market-intelligence-data.js') return route.fulfill({contentType: 'text/javascript', body: NEWS_STUB});
      const file = path.join(root, decodeURIComponent(url.pathname));
      if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)});
      return route.fulfill({status: 404, body: ''});
    }
    if (url.pathname.endsWith('/webResearchData')) {
      const a = url.searchParams.get('action');
      if (a === 'directory') return json(route, {companies: [{symbol: 'AAPL', cik: 320193, name: 'Apple Inc.'}]});
      if (a === 'financials') return json(route, FIN);
      if (a === 'filings') return filingsDown ? json(route, {error: 'down'}, 502) : json(route, FILINGS);
      return json(route, {});
    }
    if (url.pathname.endsWith('/terminal-data/sentiment.json')) return json(route, SENT);
    if (url.pathname.endsWith('/terminal-data/equities.json')) return json(route, equities());
    if (url.pathname.endsWith('/terminal-data/scanner.json')) return json(route, scanner());
    if (url.pathname.endsWith('/terminal-data/markets.json')) return json(route, markets());
    return route.fulfill({status: 404, contentType: 'application/json', body: '{}'});
  });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(ORIGIN + '/terminal.html');
  await page.clock.runFor(2000);
  await page.waitForFunction(() => document.querySelector('#fx-main')?.getAttribute('aria-busy') === 'false', null, {timeout: 20000});
  return {ctx, page, errors, seen};
}
const command = async (page, text) => { await page.fill('#fx-command', text); await page.press('#fx-command', 'Enter'); await page.clock.runFor(600); };
const shot = (page, name) => SHOTS ? page.screenshot({path: path.join(SHOTS, name), fullPage: false}) : null;

test('venue status: holidays, lunch breaks, weekends, early closes and futures sessions', async () => {
  const {ctx, page} = await boot();
  const at = (code, iso) => page.evaluate(([c, t]) => { const V = window.FynxVenueStatus, s = V.state(V.find(c), Date.parse(t)); return {state: s.state, label: s.label, why: s.why || null, wait: s.next ? Math.round((s.next - Date.parse(t)) / 60000) : null}; }, [code, iso]);
  assert.deepEqual(await at('NYSE', '2026-11-26T17:37:00Z'), {state: 'closed', label: 'HOLIDAY', why: 'Thanksgiving Day', wait: 20 * 60 + 53}, 'Thanksgiving: opens Friday 9:30 ET');
  assert.deepEqual(await at('NYSE', '2026-11-27T17:00:00Z'), {state: 'open', label: 'OPEN', why: null, wait: 60}, 'Black Friday closes at 1 PM ET');
  assert.deepEqual(await at('TSE', '2026-11-25T03:00:00Z'), {state: 'lunch', label: 'LUNCH', why: null, wait: 30}, 'Tokyo lunch 11:30–12:30');
  assert.deepEqual(await at('HKEX', '2026-11-25T03:00:00Z'), {state: 'open', label: 'OPEN', why: null, wait: 60});
  assert.deepEqual(await at('HKEX', '2026-12-24T03:30:00Z'), {state: 'open', label: 'OPEN', why: null, wait: 30}, 'Christmas Eve half day ends at noon');
  assert.equal((await at('LSE', '2026-12-25T10:00:00Z')).why, 'Exchange holiday');
  assert.equal((await at('LSE', '2026-12-24T12:00:00Z')).wait, 30, 'LSE half day closes 12:30');
  assert.deepEqual(await at('XETRA', '2026-11-28T12:00:00Z').then(s => [s.label, s.wait]), ['WEEKEND', 44 * 60], 'Saturday noon UTC → Monday 9:00 Berlin');
  assert.equal((await at('TADAWUL', '2026-11-29T08:00:00Z')).state, 'open', 'Saudi Exchange trades on Sunday');
  assert.deepEqual(await at('CME', '2026-11-25T22:30:00Z').then(s => [s.state, s.label, s.wait]), ['lunch', 'DAILY PAUSE', 30], 'Globex daily pause 4–5 PM CT');
  assert.equal((await at('CME', '2026-11-29T23:30:00Z')).state, 'open', 'Sunday evening open');
  assert.equal((await at('CME', '2026-11-28T15:00:00Z')).label, 'WEEKEND');
  assert.deepEqual(await at('NYSE', '2026-03-09T13:30:00Z').then(s => [s.label, s.wait]), ['OPEN', 390], 'after the US clocks change, 9:30 EDT is 13:30 UTC');
  await ctx.close();
});

test('HOURS page: every venue with live status, local time and a ticking countdown', async () => {
  const {ctx, page, errors} = await boot();
  await command(page, 'HOURS');
  await page.waitForSelector('.mkh-card');
  const n = await page.$$eval('.mkh-card', c => c.length); assert.equal(n, 38, 'stock exchanges, futures venues and FX sessions');
  const card = code => page.$$eval('.mkh-card', (cs, c) => { const x = cs.find(k => k.querySelector('.mkh-n b').textContent === c); return x && {s: x.dataset.s, t: x.textContent.replace(/\u2060/g, '')}; }, code);
  const nyse = await card('NYSE');
  assert.equal(nyse.s, 'closed'); assert.match(nyse.t, /THANKSGIVING DAY/); assert.match(nyse.t, /09:30–16:00 local/); assert.match(nyse.t, /Opens in20h 5[23]m \d\ds/); assert.match(nyse.t, /12:37/);
  assert.match((await card('TSE')).t, /09:00–11:30 · 12:30–15:30 local/);
  assert.equal((await card('CME')).s, 'open');
  const before = (await card('LSE')).t; await page.clock.runFor(5000); const after = (await card('LSE')).t;
  assert.notEqual(before, after, 'countdown ticks'); assert.match(after, /Opens in14h 2[12]m \d\ds/);
  assert.match(await page.textContent('.mkh-sum'), /of \d+ stock exchanges open now/);
  assert.match(await page.textContent('.pg-note'), /Holiday calendars applied/);
  await shot(page, 'hours.png');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('SENTIMENT page and FNG panel: Fear & Greed score, last 30 sessions, look-backs, history and every indicator', async () => {
  const {ctx, page, errors} = await boot();
  await command(page, 'SENTIMENT');
  await page.waitForSelector('.fg-gauge');
  const g = await page.textContent('.fg-gauge');
  assert.match(g, new RegExp('^' + Math.round(SENT.score) + 'EXTREME FEAR'));
  assert.match(g, /PREV CLOSE.*1 WEEK AGO.*1 MONTH AGO.*1 YEAR AGO/);
  assert.equal(await page.$$eval('.fg-30s span', s => s.length), 30);
  assert.equal(await page.$$eval('.fg-grid .fg-card', c => c.length), 8, 'seven indicators + Michigan');
  assert.match(await page.textContent('.fg-grid'), /MARKET MOMENTUM.*STOCK PRICE STRENGTH.*STOCK PRICE BREADTH.*MARKET VOLATILITY.*VOLATILITY TERM STRUCTURE.*SAFE HAVEN DEMAND.*JUNK BOND DEMAND.*CONSUMER SENTIMENT · MICHIGAN/);
  const lines1y = await page.$$eval('.fg-topgrid svg line[stroke]', l => l.length);
  await page.click('.fg-topgrid .pg-tabs >> text=1M'); await page.clock.runFor(100);
  const lines1m = await page.$$eval('.fg-topgrid svg line[stroke]', l => l.length);
  assert.ok(lines1m < lines1y, `1M draws fewer segments (${lines1m} < ${lines1y})`);
  await page.click('.fg-topgrid .pg-tabs >> text=1Y'); await page.clock.runFor(100);
  assert.match(await page.textContent('.pg-note'), /not a third-party gauge/);
  await shot(page, 'sentiment.png');
  // The FNG panel sits on the DASHBOARD desk.
  await page.click('.fx-page-close').catch(() => {}); await page.keyboard.press('Escape'); await page.clock.runFor(300);
  await page.click('#fx-deskbar-list >> text=DASHBOARD'); await page.clock.runFor(1500);
  await page.waitForSelector('#b-fng .fg-gauge');
  assert.match(await page.textContent('#b-fng'), /EXTREME FEAR.*Market momentum/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('WIRE: four headline columns, each with its own category, remembered', async () => {
  const {ctx, page, errors} = await boot();
  await command(page, 'WIRE');
  await page.waitForSelector('.nw-col .fx-hrow');
  assert.deepEqual(await page.$$eval('.nw-sel', s => s.map(x => x.value)), ['all', 'stocks', 'crypto', 'forex']);
  await page.waitForFunction(() => document.querySelectorAll('.nw-col')[1]?.textContent.includes('STOCKS fixture headline 1'));
  assert.match(await page.$$eval('.nw-col', c => c[2].textContent), /CRYPTO fixture headline 1/);
  await page.waitForFunction(() => document.querySelectorAll('.nw-col')[0]?.textContent.includes('ALL fixture headline 1'));
  await page.selectOption('.nw-col >> nth=3 >> select', 'energy'); await page.clock.runFor(300);
  await page.waitForFunction(() => document.querySelectorAll('.nw-col')[3]?.textContent.includes('ENERGY fixture headline'));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fx-term-wire-cats'))[3]), 'energy');
  const calls = await page.evaluate(() => window.__news); await page.clock.runFor(121000);
  assert.ok(await page.evaluate(() => window.__news) > calls, 'columns refresh every two minutes');
  await shot(page, 'wire.png');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('FILINGS: company identity, form tabs, 8-K items and sec.gov links; offline is reported plainly', async () => {
  const {ctx, page, errors} = await boot();
  await command(page, 'FILINGS AAPL');
  await page.waitForSelector('.fl-table');
  const ident = await page.$$eval('dl.fx-kv', d => d.map(x => x.textContent).join('|'));
  assert.match(ident, /Apple Inc\..*Electronic Computers \(SIC 3571\).*CUPERTINO, CA.*September 26.*Large accelerated filer.*320193/s);
  assert.equal(await page.$$eval('.fl-table tr', r => r.length - 1), 8);
  assert.match(await page.textContent('.fl-bar'), /ALL 8.*10-K 1.*10-Q 1.*8-K 2.*PROXY 1.*INSIDER 1/);
  await page.click('.fl-bar >> text=/^8-K 2/'); await page.clock.runFor(100);
  const rows = await page.$$eval('.fl-table tr', r => r.slice(1).map(x => x.textContent));
  assert.equal(rows.length, 2); assert.match(rows[0], /2026-10-30.*8-K.*2\.02 Results of operations · 9\.01 Financial statements and exhibits/);
  const href = await page.$eval('.fl-table a.fx-chip', a => [a.href, a.target, a.rel]);
  assert.deepEqual(href, ['https://www.sec.gov/Archives/edgar/data/320193/000032019326000100/aapl-20261030.htm', '_blank', 'noopener noreferrer']);
  await page.click('.fl-bar >> text=/^ALL/'); await page.clock.runFor(100);
  await page.fill('.fl-bar input', 'proxy'); await page.clock.runFor(100);
  assert.equal(await page.$$eval('.fl-table tr', r => r.length - 1), 1);
  await shot(page, 'filings.png');
  assert.deepEqual(errors, []);
  await ctx.close();
  const down = await boot({filingsDown: true});
  await command(down.page, 'FILINGS AAPL');
  await down.page.waitForFunction(() => /SEC EDGAR is not answering/.test(document.body.textContent));
  await command(down.page, 'FILINGS ZZZZ');
  await down.page.waitForFunction(() => /ZZZZ is not an SEC-registered company/.test(document.body.textContent));
  await down.ctx.close();
});

test('DES company snapshot: tags, performance vs S&P 500, financial overview from the 10-K, filings link', async () => {
  const {ctx, page, errors} = await boot();
  await command(page, 'DES AAPL');
  await page.waitForSelector('.cs-stats');
  await page.waitForSelector('.cs-leg');
  const tags = await page.$$eval('.cs-tags span', s => s.map(x => x.textContent));
  assert.deepEqual(tags, ['Technology', 'Computer Manufacturing', 'S&P 500', 'Nasdaq-100', 'Dow 30', 'SIC · Electronic Computers', 'CUPERTINO, CA', 'FY ends Sep 26']);
  assert.match(await page.textContent('.cs-leg'), /AAPL \+\d+\.\d%S&P 500 \(SPY\) \+\d+\.\d%Ahead by/);
  assert.equal(await page.$$eval('.cs-card polyline', p => p.length), 2);
  const ov = await page.textContent('.cs-ov');
  assert.match(ov, /REVENUE\$416\.00B10\.1% of market value/); assert.match(ov, /Market value\$4\.10T/); assert.match(ov, /NET INCOME\$112\.00B26\.9% net margin · 2\.7% earnings yield/);
  const stats = await page.textContent('.cs-stats');
  assert.match(stats, /P\/E \(10-K EPS\)37\.1×/); assert.match(stats, /Price \/ sales9\.9×/); assert.match(stats, /Free cash flow\$98\.30B/); assert.match(stats, /FCF yield2\.4%/);
  assert.match(await page.textContent('.cs-sec'), /Fiscal year ended 2026-09-26, from the 10-K on SEC EDGAR/);
  await page.click('.cs-sec >> text=1Y').catch(() => {});
  await page.click('.cs-sec >> text=5Y'); await page.clock.runFor(400); await page.waitForSelector('.cs-leg');
  assert.equal(await page.evaluate(() => localStorage.getItem('fx-term-cs-span')), '5y');
  await page.locator('.cs-sec').scrollIntoViewIfNeeded(); await shot(page, 'des-snapshot.png');
  await page.click('.cs-sec >> text=SEC filings ▸'); await page.clock.runFor(500);
  await page.waitForSelector('.fl-table');
  assert.deepEqual(errors, []);
  await ctx.close();
});
