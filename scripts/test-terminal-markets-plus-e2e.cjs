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
function cryptoFixture() {
  const dates = Array.from({length: 500}, (_, i) => new Date(Date.UTC(2025, 6, 15) + i * 86400000).toISOString().slice(0, 10)), mk = f => new Map(dates.map((d, i) => [d, f(i)]));
  const btc = mk(i => 60000 + i * 40 - Math.max(0, i - 440) * 300), alts = Array.from({length: 30}, (_, k) => mk(i => 10 + k + i * (k % 2 ? 0.05 : 0.01) - Math.max(0, i - 440) * (k % 3 ? 0.02 : 0.2)));
  const b = SN.cryptoBreadth(dates, btc, alts), last = b.season.length - 1;
  const fng = Array.from({length: 400}, (_, i) => [new Date(Date.UTC(2025, 9, 23) + i * 86400000).toISOString().slice(0, 10), Math.round(50 + Math.sin(i / 20) * 30)]); fng[fng.length - 1][1] = 11;
  const fl = fng.at(-1), at = n => ({date: fng.at(-1 - n)[0], score: fng.at(-1 - n)[1], label: 'Fear'});
  return {fng: {asOf: fl[0], score: 11, label: 'Extreme Fear', prev: at(1), week: at(7), month: at(30), year: at(365), history: fng, source: 'Alternative.me Crypto Fear & Greed Index'},
    season: {asOf: dates[last], value: b.season[last], label: SN.seasonLabel(b.season[last]), prev: b.season[last - 1], week: b.season[last - 7], month: b.season[last - 30], history: dates.map((d, i) => [d, b.season[i]]).filter(r => r[1] != null).slice(-365)},
    rsi: {asOf: dates[last], value: b.avgRsi[last], label: SN.rsiLabel(b.avgRsi[last]), prev: b.avgRsi[last - 1], week: b.avgRsi[last - 7], month: b.avgRsi[last - 30], history: dates.map((d, i) => [d, b.avgRsi[i]]).filter(r => r[1] != null).slice(-365)},
    coins: [{symbol: 'BTC', name: 'Bitcoin', r90: -22.2, rsi: 28.3}, {symbol: 'ETH', name: 'Ethereum', r90: -30.6, rsi: 30.1}, {symbol: 'XMR', name: 'Monero', r90: -3.4, rsi: 36.6}, {symbol: 'ZEC', name: 'Zcash', r90: 12.3, rsi: 61}],
    universe: '30 largest altcoins (fixture)'};
}
const SENT = {...sentimentFixture(), crypto: cryptoFixture()};
const CHART_BASE = {AAPL: 270, NVDA: 180, MSFT: 480, 'EURUSD=X': 1.08, 'GBPUSD=X': 1.27, 'BTC-USD': 90000, SPY: 680, QQQ: 600, 'DX-Y.NYB': 99};
const OPTIONS = {version: 1, generatedAt: new Date(NOW).toISOString(), source: 'Cboe delayed (fixture)', underlyings: {SPY: {symbol: 'SPY', price: 680.5, change: 1.2, changePercent: 0.18, iv30: 17.2, iv30Change: -0.4, callVolume: 1e6, putVolume: 1.3e6, putCallVolume: 1.3, callOI: 5e6, putOI: 7e6, putCallOI: 1.4, asOf: new Date(NOW).toISOString(), contracts: 9000, mostActive: [],
  expiries: [[1, 0.21, 6.1], [2, 0.19, 8.4], [7, 0.175, 15.8], [14, 0.17, 22.3], [30, 0.168, 32.5], [58, 0.172, 45.1], [86, 0.175, 55.9]].map(([dte, iv, st]) => ({date: new Date(NOW + dte * 864e5).toISOString().slice(0, 10), dte, atmStrike: 680, atmIV: iv, straddle: st, movePercent: Math.round(st / 680.5 * 1e4) / 100, maxPain: 675, callVolume: 1, putVolume: 1, callOI: 1, putOI: 1, skew25: 0.04, chain: []}))}}};

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
// Test-only membership server: FYNXPlan's test hook gets a fake 'consumerLiveWorkspace' with the given plan.
const PLAN_SHIM = `;(function(){var c=window.__PLAN;if(!c||!window.FYNXPlan||!FYNXPlan._test)return;var LIM={free:5,starter:15,plus:60,pro:null};
var svc={config:{auth:{currentUser:{uid:'u1'}}},call:async function(d){(window.__calls=window.__calls||[]).push(d);
 if(d.action==='status')return {mode:'live',tier:c.tier==='free'?null:c.tier,owner:!!c.owner};
 if(d.action==='usage'){if(d.op==='read')return {counts:{analysis:window.__used||0}};var l=LIM[c.tier];if(l!==null&&(window.__used||0)>=l)return {allowed:false,used:window.__used,limit:l};window.__used=(window.__used||0)+1;return {allowed:true,used:window.__used,limit:l,owner:!!c.owner};}
 if(d.action==='industries'){if(!(c.tier in {starter:1,plus:1,pro:1})){var e=new Error('Advanced industry analytics are part of FYNX Pro membership.');e.code='functions/permission-denied';throw e;}return c.industries;}
 return {};}};
FYNXPlan._test.set(svc,{tier:c.tier,uid:'u1',signedIn:true,verified:true,owner:!!c.owner});})();`;
// Test-only notification bridge (the real one is the account module notify-bridge.js): records what would be saved.
function fakeBridge(cfg) {
  const st = {user: cfg.user === null ? null : {uid: 'u1'}, items: cfg.items || [], followed: cfg.followed || [], rules: cfg.rules || [], prefs: cfg.prefs || {}, emits: [], read: [], allRead: [], saved: []};
  const ucb = [], icb = [], acb = [];
  const acct = () => ({followed: st.followed, rules: st.rules, prefs: st.prefs});
  window.__bridge = st;
  window.FynxNotifyBridge = {
    onUser: cb => { ucb.push(cb); cb(st.user); }, onNotifications: cb => { icb.push(cb); cb(st.items); }, onAccount: cb => { acb.push(cb); cb(acct()); },
    markRead: async id => { st.read.push(id); }, markAllRead: async ids => { st.allRead.push(...ids); },
    emit: async p => { st.emits.push(p); st.items = [{id: 'n' + st.emits.length, ...p, read: false, timestamp: new Date().toISOString()}, ...st.items]; icb.forEach(cb => cb(st.items)); return {created: true}; },
    savePrefs: async p => { Object.assign(st.prefs, p); acb.forEach(cb => cb(acct())); }, requestDesktop: async () => ({permission: 'granted'}),
    terminalList: () => [...st.followed], saveTerminalList: async l => { st.saved.push(l); st.followed = l; acb.forEach(cb => cb(acct())); }
  };
}
async function boot({time = NOW, width = 1600, height = 1100, filingsDown = false, plan = null, bridge = null} = {}) {
  const ctx = await browser.newContext({viewport: {width, height}}), page = await ctx.newPage();
  await page.clock.install({time: new Date(time)});
  if (bridge) await page.addInitScript(fakeBridge, bridge);
  if (plan) await page.addInitScript(p => { window.__FYNX_PLAN_TEST__ = true; window.__PLAN = p; window.__used = p.used || 0; }, plan);
  const json = (route, body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
  const seen = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url()); seen.push(url.href);
    if (url.origin === ORIGIN && url.pathname === '/fn/research.js') {
      if (url.searchParams.get('action') !== 'filings') return json(route, {error: 'unknown'}, 400);
      return filingsDown ? json(route, {error: 'SEC down'}, 502) : json(route, FILINGS);
    }
    if (url.origin === ORIGIN && url.pathname === '/fn/market.js') {
      if (url.searchParams.get('op') === 'chart') {
        const sym = url.searchParams.get('symbol'); if (!CHART_BASE[sym]) return json(route, {error: 'No data'}, 404);
        (globalThis.__chartCalls ||= []).push(sym);
        const b = CHART_BASE[sym], rows = Array.from({length: 300}, (_, k) => ({date: new Date(Date.UTC(2025, 8, 1) + k * 86400000 * 1.4).toISOString().slice(0, 10), open: b, high: b * 1.01, low: b * 0.99, close: Number((b * (1 + k * 0.0004 * (sym.charCodeAt(0) % 5 - 1)) * (1 + Math.sin(k / (3 + sym.charCodeAt(1) % 7)) * 0.03 + Math.cos(k / (4 + sym.charCodeAt(0) % 5)) * 0.02)).toFixed(4))}));
        const last = rows.at(-1).close, prev = rows.at(-2).close;
        return json(route, {symbol: sym, name: {AAPL: 'Apple Inc.', NVDA: 'NVIDIA Corporation', MSFT: 'Microsoft Corporation', 'EURUSD=X': 'EUR/USD', 'GBPUSD=X': 'GBP/USD', 'BTC-USD': 'Bitcoin USD', SPY: 'SPDR S&P 500', 'DX-Y.NYB': 'US Dollar Index', QQQ: 'Invesco QQQ'}[sym] || sym, rows, price: last, changePercent: (last / prev - 1) * 100, previousClose: prev, high52: Math.max(...rows.map(r => r.close)), low52: Math.min(...rows.map(r => r.close)), currency: 'USD', exchange: 'NMS', asOf: new Date(NOW).toISOString(), type: sym.endsWith('=X') ? 'CURRENCY' : sym.endsWith('-USD') ? 'CRYPTOCURRENCY' : 'EQUITY'});
      }
      if (url.searchParams.get('op') === 'search') return json(route, {quotes: [], news: [{title: `${url.searchParams.get('q')} fixture story`, url: 'https://www.reuters.com/x', publisher: 'Reuters', publishedAt: new Date(NOW - 3600000).toISOString()}]});
      if (url.searchParams.get('op') === 'closes') {
        const syms = url.searchParams.get('symbols').split(','), dates = Array.from({length: 252}, (_, k) => new Date(Date.UTC(2025, 10, 26) + k * 86400000 * 1.45).toISOString().slice(0, 10));
        const base = s => s === 'SPY' ? 600 : 100; return json(route, {dates, series: Object.fromEntries(syms.map((s, i) => [s, dates.map((_, k) => Number((base(s) * (1 + k * (i ? 0.0005 : 0.0016) + Math.sin(k / 9) * 0.02)).toFixed(2)))]))});
      }
      return json(route, {});
    }
    if (url.origin === ORIGIN) {
      if (url.pathname === '/terminal.html') return route.fulfill({contentType: 'text/html', body: harness()});
      if (url.pathname === '/assets/js/market-intelligence-data.js') return route.fulfill({contentType: 'text/javascript', body: NEWS_STUB});
      if (url.pathname === '/assets/js/fynx-plan.js' && plan) return route.fulfill({contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'assets/js/fynx-plan.js'), 'utf8') + PLAN_SHIM});
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
    if (url.pathname.endsWith('/terminal-data/options.json')) return json(route, OPTIONS);
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
  assert.equal(await page.$$eval('.fg-topgrid .fg-30s span', s => s.length), 30);
  assert.equal(await page.$$eval('.fg-topgrid + .fg-grid .fg-card', c => c.length), 8, 'seven indicators + Michigan');
  assert.ok(await page.$('.cr-sec'), 'crypto sentiment follows on the same page');
  assert.match(await page.textContent('.fg-topgrid + .fg-grid'), /MARKET MOMENTUM.*STOCK PRICE STRENGTH.*STOCK PRICE BREADTH.*MARKET VOLATILITY.*VOLATILITY TERM STRUCTURE.*SAFE HAVEN DEMAND.*JUNK BOND DEMAND.*CONSUMER SENTIMENT · MICHIGAN/);
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

test('Edit: rows are not capped at 28 boxes and "+ All panels" fits every panel on one desk', async () => {
  const {ctx, page, errors} = await boot();
  await page.click('#fx-edit'); await page.clock.runFor(300);
  const info = () => page.evaluate(() => ({boxes: document.querySelectorAll('#fx-main > section.tp').length, panels: document.querySelectorAll('#fx-main > section.tp:not(.tp-empty)').length}));
  const start = await info();
  for (let i = 0; i < 6; i++) { await page.click('#fx-ed-row'); await page.clock.runFor(200); }
  const grown = await info();
  assert.equal(grown.boxes, start.boxes + 36, 'six more rows: past the old 28-box limit');
  assert.ok(grown.boxes > 28);
  await page.click('#fx-ed-all'); await page.clock.runFor(1500);
  const all = await info();
  console.log('panels placed', all.panels, 'boxes', all.boxes);
  assert.ok(all.panels >= 60, `every panel placed: ${all.panels}`);
  assert.equal(new Set(await page.$$eval('#fx-main > section.tp:not(.tp-empty)', s => s.map(x => x.id))).size, all.panels, 'no duplicates');
  assert.match(await page.textContent('#fx-say, .fx-say, body'), /Added \d+ panels|Every panel/);
  await page.click('#fx-ed-all'); await page.clock.runFor(300);
  assert.equal((await info()).panels, all.panels, 'a second click adds nothing');
  // The layout survives a reload.
  await page.click('#fx-ed-done'); await page.reload(); await page.clock.runFor(2000);
  await page.waitForFunction(() => document.querySelector('#fx-main')?.getAttribute('aria-busy') === 'false', null, {timeout: 20000});
  assert.equal((await info()).panels, all.panels);
  await shot(page, 'all-panels.png');
  assert.deepEqual(errors.filter(e => !/ResizeObserver/.test(e)), []);
  await ctx.close();
});

test('crypto sentiment: RSI, altcoin season and the Alternative.me parser', () => {
  assert.equal(SN.rsi(Array.from({length: 30}, (_, i) => i)).at(-1), 100);
  const z = SN.rsi(Array.from({length: 60}, (_, i) => 100 + (i % 2 ? 1 : -1))).at(-1); assert.ok(z > 45 && z < 55);
  const d = Array.from({length: 120}, (_, i) => String(i)), btc = new Map(d.map((x, i) => [x, 100 + i])), up = new Map(d.map((x, i) => [x, 100 + i * 3])), dn = new Map(d.map((x, i) => [x, 100 + i * 0.5]));
  assert.equal(SN.cryptoBreadth(d, btc, [...Array(15).fill(up), ...Array(5).fill(dn)]).season.at(-1), 75);
  assert.deepEqual([80, 50, 10].map(SN.seasonLabel), ['Altcoin season', 'Neither', 'Bitcoin season']);
  assert.deepEqual(SN.parseCryptoFng({data: [{value: '11', value_classification: 'Extreme Fear', timestamp: '1764115200'}]}), [['2025-11-26', 11, 'Extreme Fear']]);
  const fields = ['id', 'symbol', 'name', 'price', 'change1h', 'change24h', 'change7d', 'marketCap', 'volume', 'rank', 'fromATH', 'categories'], row = (s, n, r, c = []) => [s.toLowerCase(), s, n, 1, 0, 0, 0, 1, 1, r, 0, c];
  assert.deepEqual(SN.coinUniverse({crypto: {fields, rows: [row('USDT', 'Tether', 3, ['stable']), row('WBTC', 'Wrapped Bitcoin', 9), row('STETH', 'Lido Staked Ether', 7), row('ETH', 'Ethereum', 2), row('BTC', 'Bitcoin', 1), row('STX', 'Stacks', 40)]}}).map(c => c.symbol), ['BTC', 'ETH', 'STX']);
});

test('CSENT and CFNG: crypto Fear & Greed, Altcoin Season, average RSI and the coin board; also on SENTIMENT', async () => {
  const {ctx, page, errors} = await boot();
  await command(page, 'CSENT');
  await page.waitForSelector('.cr-grid');
  const t = await page.textContent('.cr-grid');
  assert.match(t, /CRYPTO FEAR & GREED11EXTREME FEAR/); assert.match(t, /ALTCOIN SEASON INDEX\d+/); assert.match(t, /AVERAGE CRYPTO RSI\d+\.\d/);
  assert.equal(await page.$$eval('.cr-sec .fg-grid .fg-card', c => c.length), 3);
  assert.deepEqual(await page.$$eval('.cr-bar span', s => s.map(x => x.textContent)), ['ZEC', 'XMR', 'BTC', 'ETH']);
  await shot(page, 'crypto-sentiment.png');
  await command(page, 'SENTIMENT'); await page.waitForSelector('.cr-sec');
  await page.click('.fx-page-close').catch(() => {}); await page.keyboard.press('Escape'); await page.clock.runFor(300);
  await page.click('#fx-deskbar-list >> text=CRYPTO'); await page.clock.runFor(1500);
  await page.waitForSelector('#b-cfng .cr-card');
  assert.match(await page.textContent('#b-cfng'), /CRYPTO FEAR & GREED.*ALTCOIN SEASON.*AVERAGE CRYPTO RSI/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('OPTIONS: expected move table and cone from the straddles', async () => {
  const {ctx, page, errors} = await boot();
  await command(page, 'GO OPTIONS');
  await page.waitForSelector('.em-table'); await page.waitForSelector('.em-sec polygon');
  const rows = await page.$$eval('.em-table tr', r => r.slice(1).map(x => [...x.children].map(c => c.textContent)));
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[2].slice(1), ['7', '$15.80', '±15.80 · 2.32%', '664.70', '696.30', '17.5%', '±' + (680.5 * 0.175 * Math.sqrt(7 / 365)).toFixed(2)]);
  assert.equal(await page.$$eval('.em-sec polygon', p => p.length), 2, 'straddle and IV ranges');
  assert.match(await page.textContent('.em-sec .cs-leg'), /Straddle ±6\.10/);
  await page.locator('.em-sec').scrollIntoViewIfNeeded(); await shot(page, 'expected-move.png');
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* ---------- membership: free vs Pro vs owner ---------- */
const IA = require('../backend/industry-analytics.cjs');
function industriesFixture() {
  const syms = [], info = {}, closes = {}, rows = [];
  [['Information Technology', 'Semiconductors', 1.6], ['Information Technology', 'Systems Software', 1.2], ['Energy', 'Integrated Oil & Gas', 0.8], ['Utilities', 'Electric Utilities', 1.0], ['Financials', 'Diversified Banks', 1.1]].forEach(([sec, ind, drift], g) => { for (let k = 0; k < 5; k++) { const s = `S${g}${k}`; syms.push(s); info[s] = {n: s, sec, ind};
    const w = Array.from({length: 53}, (_, i) => 100 * (1 + (drift - 1) * i / 52) * (1 + Math.sin(i / 5 + k) * 0.01)), d = Array.from({length: 23}, (_, i) => w[52] * (1 + (drift - 1) * (i - 22) / 250 * (g % 2 ? -1 : 1)));
    closes[s] = {p: d[22], c: 0.1, d, w, y0: w[0]}; rows.push([s, s, d[22], 0.1, 1, 1e10 * (k + 1), sec, ind]); } });
  const m = IA.membersFrom({indices: {sp500: syms}, info, closes}, {stocks: {fields: ['symbol', 'name', 'price', 'changePct', 'volume', 'marketCap', 'sector', 'industry'], rows}});
  const r = IA.compute(m, {group: 'industry'});
  return {level: 'industry', asOf: new Date(NOW).toISOString(), generatedAt: new Date(NOW).toISOString(), benchmark: r.benchmark, groups: r.groups, method: 'Relative strength (fixture).', sources: 'fixture'};
}
const usageCharges = page => page.evaluate(() => (window.__calls || []).filter(c => c.action === 'usage' && c.op === 'charge'));

test('free member: OVERVIEW and HMAP never use an allowance; INDUSTRIES table free, advanced analytics locked', async () => {
  const {ctx, page, errors} = await boot({plan: {tier: 'free'}});
  for (let i = 0; i < 4; i++) { await command(page, 'OVERVIEW'); await page.waitForSelector('.ov-card'); await command(page, 'HMAP'); await page.clock.runFor(300); }
  assert.deepEqual(await usageCharges(page), [], 'OVERVIEW and HMAP are completely free');
  assert.equal(await page.$('.fxp-lock'), null);
  await command(page, 'INDUSTRIES');
  await page.waitForSelector('.ind-table');
  await page.waitForSelector('.ia-lock');
  assert.match(await page.textContent('.ia-lock'), /Advanced industry analytics are part of FYNX Pro/);
  assert.equal(await page.$('.ia-table'), null, 'no advanced results without membership');
  assert.deepEqual(await usageCharges(page), [], 'the basic industries table uses no allowance');
  await shot(page, 'industries-free.png');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('DOM follows the Order Flow allowance: counted per day on the server, blocked when used up', async () => {
  const {ctx, page} = await boot({plan: {tier: 'free'}});
  await command(page, 'DOM'); await page.clock.runFor(500);
  const charges = await usageCharges(page);
  assert.equal(charges.length, 1); assert.equal(charges[0].cat, 'analysis'); assert.match(charges[0].key, /^Depth of market\|/);
  assert.equal(await page.$('.fxp-lock'), null);
  await ctx.close();
  const used = await boot({plan: {tier: 'free', used: 5}});
  await command(used.page, 'DOM'); await used.page.clock.runFor(500);
  await used.page.waitForSelector('.fxp-lock');
  assert.match(await used.page.textContent('.fxp-lock'), /Depth of market is ready/);
  await command(used.page, 'ORDERFLOW'); await used.page.clock.runFor(500);
  assert.match(await used.page.textContent('.fxp-lock'), /Live order flow is ready/, 'same allowance as Order Flow');
  await used.ctx.close();
});

test('Pro member: advanced industry analytics with rotation map and ranked table', async () => {
  const {ctx, page, errors} = await boot({plan: {tier: 'plus', industries: industriesFixture()}});
  await command(page, 'INDUSTRIES');
  await page.waitForSelector('.ia-table');
  assert.equal(await page.$$eval('.ia-table tr', r => r.length - 1), 5);
  assert.equal(await page.$$eval('.ia-map circle', c => c.length), 5);
  assert.match(await page.textContent('.ia-sum'), /LEADING.*IMPROVING.*WEAKENING.*LAGGING/);
  assert.equal(await page.$eval('.ia-table tr:nth-child(2) th', t => t.textContent), 'Semiconductors');
  await page.locator('.ia-sec').scrollIntoViewIfNeeded(); await shot(page, 'industries-pro.png');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('FYNX owner: lifetime unlimited badge, no limits on DOM/Order Flow, every premium page opens', async () => {
  const {ctx, page, errors} = await boot({plan: {tier: 'pro', owner: true, used: 10000, industries: industriesFixture()}});
  await page.waitForSelector('#fx-plan.owner');
  assert.match(await page.textContent('#fx-plan'), /FYNX OWNER ∞/);
  assert.equal(await page.getAttribute('#fx-plan', 'title'), 'FYNX Owner — Lifetime Unlimited Access');
  for (const c of ['DOM', 'ORDERFLOW', 'OVERVIEW', 'HMAP', 'FILINGS AAPL', 'SENTIMENT', 'CSENT', 'HOURS', 'WIRE', 'VCLUST', 'ISEAS', 'BTEST', 'FCAST', 'OPTLAB', 'EARNPREV', 'COMPLY', 'FACTORLOOP', 'VALUE']) { await command(page, c); await page.clock.runFor(400); assert.equal(await page.$('.fxp-lock'), null, c + ' is open'); assert.equal(await page.$('.fxp-dlg'), null, c + ' shows no paywall'); }
  await command(page, 'INDUSTRIES'); await page.waitForSelector('.ia-table');
  const charged = await usageCharges(page); assert.ok(charged.length >= 8, 'premium pages still record usage on the server'); 
  await page.click('#fx-plan'); await page.clock.runFor(200);
  assert.equal(await page.$('.fxp-dlg'), null, 'the owner is never sent to checkout');
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* ---------- Global Market Focus: ALL · FOCUS · COMPARE ---------- */
const mode = page => page.$$eval('#fx-modebar .fx-mode', b => b.map(x => x.textContent + (x.classList.contains('on') ? '*' : '')).join(' '));
const boxes = page => page.$$eval('#fx-main > section.tp', s => s.map(x => x.id.replace('tp-', '')));

test('FOCUS: typing a ticker turns every box to it; ✕ returns to ALL with the desk layout intact', async () => {
  const {ctx, page, errors} = await boot();
  assert.deepEqual(await page.evaluate(() => window.__fynxPanelCollisions), [], 'no two features share a panel id');
  const allBoxes = await boxes(page);
  assert.equal(await mode(page), 'ALL* FOCUS COMPARE');
  await command(page, 'AAPL'); await page.clock.runFor(1500);
  assert.equal(await mode(page), 'ALL FOCUS* COMPARE');
  assert.match(new URL(page.url()).search, /sym=AAPL/);
  const fb = await boxes(page); assert.ok(fb.includes('squote') && fb.includes('snews') && fb.includes('srisk'), 'market boxes');
  await page.waitForFunction(() => /AAPL/.test(document.querySelector('#t-squote')?.textContent || ''));
  assert.match(await page.textContent('#fx-deskbar-note'), /Every box shows AAPL/);
  assert.match(await page.textContent('#t-earn'), /Earnings · AAPL/, 'earnings filtered to the focus');
  await page.click('#fx-symchip .fx-symx:last-child'); await page.clock.runFor(800);
  assert.equal(await mode(page), 'ALL* FOCUS COMPARE');
  assert.deepEqual(await boxes(page), allBoxes, 'ALL workspace restored exactly');
  assert.doesNotMatch(page.url(), /sym=/);
  // FOCUS remembers the last market.
  await page.click('#fx-modebar .fx-mode >> text=FOCUS'); await page.clock.runFor(1200);
  assert.match(page.url(), /sym=AAPL/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('COMPARE: AAPL NVDA MSFT in the command bar, add/remove, focus one, clear, URL restore, one request per market', async () => {
  const {ctx, page, errors} = await boot();
  globalThis.__chartCalls = [];
  await command(page, 'AAPL NVDA MSFT'); await page.clock.runFor(2000);
  assert.equal(await mode(page), 'ALL FOCUS COMPARE*');
  assert.match(page.url(), /cmp=AAPL%2CNVDA%2CMSFT|cmp=AAPL,NVDA,MSFT/);
  await page.waitForSelector('#b-cmpq .fx-cmpt tr:nth-child(4)');
  const rows = await page.$$eval('#b-cmpq .fx-cmpt tr', r => r.slice(1).map(x => x.querySelector('.fx-cmplink').textContent));
  assert.deepEqual(rows, ['AAPL', 'NVDA', 'MSFT']);
  await page.waitForSelector('#b-cmpcorr .fx-corrm');
  assert.equal(await page.$$eval('#b-cmpcorr .fx-corrm tr', r => r.length), 4, '3×3 matrix');
  const diag = await page.$$eval('#b-cmpcorr .fx-corrm tr:nth-child(2) td', t => t.map(x => x.textContent)); assert.equal(diag[0], '1.00');
  await page.waitForSelector('#b-cmprisk .fx-cmpt');
  assert.equal(await page.$$eval('#b-cmprisk .fx-cmpt tr', r => r.length), 4);
  await page.waitForSelector('#b-cmpnews .fx-symtag');
  assert.equal(await page.$$eval('#b-cmp svg polyline', p => p.length) >= 3, true, 'one line per market');
  const counts = globalThis.__chartCalls.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
  for (const k of ['AAPL', 'NVDA', 'MSFT']) assert.equal(counts[k], 1, `${k} history fetched once, shared by every panel (${JSON.stringify(counts)})`);
  assert.deepEqual(await page.$$eval('#fx-symchip .fx-cmpname', b => b.map(x => x.textContent)), ['AAPL', 'NVDA', 'MSFT']);
  await shot(page, 'compare.png');
  // + adds a market; ✕ removes one.
  await command(page, '+SPY'); await page.clock.runFor(1500);
  assert.deepEqual(await page.$$eval('#fx-symchip .fx-cmpname', b => b.map(x => x.textContent)), ['AAPL', 'NVDA', 'MSFT', 'SPY']);
  await page.click('#fx-symchip .fx-cmpchip:nth-child(2) .fx-cmpx'); await page.clock.runFor(1500);
  assert.deepEqual(await page.$$eval('#fx-symchip .fx-cmpname', b => b.map(x => x.textContent)), ['AAPL', 'MSFT', 'SPY']);
  assert.ok(!(await page.textContent('#b-cmpq')).includes('NVDA'), 'no data from the removed market');
  // Refresh restores the comparison from the URL.
  await page.reload(); await page.clock.runFor(2500);
  await page.waitForFunction(() => document.querySelector('#fx-main')?.getAttribute('aria-busy') === 'false', null, {timeout: 20000});
  await page.waitForSelector('#b-cmpq .fx-cmpt');
  assert.equal(await mode(page), 'ALL FOCUS COMPARE*');
  // Click one name: FOCUS on it. COMPARE brings the comparison back.
  await page.click('#b-cmpq .fx-cmplink >> text=MSFT'); await page.clock.runFor(1500);
  assert.equal(await mode(page), 'ALL FOCUS* COMPARE'); assert.match(page.url(), /sym=MSFT/);
  await page.click('#fx-modebar .fx-mode >> text=COMPARE'); await page.clock.runFor(200);
  await page.waitForSelector('#fx-finder[open]'); await page.keyboard.press('Escape');
  await command(page, 'CMP AAPL'); await page.clock.runFor(1500);
  assert.deepEqual(await page.$$eval('#fx-symchip .fx-cmpname', b => b.map(x => x.textContent)), ['MSFT', 'AAPL'], 'CMP adds to the focused market');
  await page.click('.fx-cmpclear'); await page.clock.runFor(800);
  assert.equal(await mode(page), 'ALL* FOCUS COMPARE'); assert.doesNotMatch(page.url(), /cmp=|sym=/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('COMPARE FX: EUR/USD + GBP/USD; "EUR USD" and "Apple Inc" stay one market; unknown markets are reported, not invented', async () => {
  const {ctx, page, errors} = await boot();
  await command(page, 'EUR/USD + GBP/USD'); await page.clock.runFor(2000);
  assert.equal(await mode(page), 'ALL FOCUS COMPARE*');
  assert.deepEqual(await page.$$eval('#fx-symchip .fx-cmpname', b => b.map(x => x.textContent)), ['EURUSD', 'GBPUSD']);
  await page.waitForSelector('#b-cmprisk .fx-cmpt');
  assert.match(await page.textContent('#b-cmprisk'), /DXY|DX-Y/, 'FX risk measured against the dollar index');
  assert.ok(!/EPS|P\/E|Earnings · /.test(await page.textContent('#b-earn')), 'no stock metrics for currencies');
  await command(page, 'CLEAR'); await page.clock.runFor(600);
  await command(page, 'EUR USD'); await page.clock.runFor(1500);
  assert.equal(await mode(page), 'ALL FOCUS* COMPARE');
  await command(page, 'AAPL ZZZZ'); await page.clock.runFor(2500);
  await page.waitForSelector('#b-cmpq .fx-cmpt');
  assert.match(await page.textContent('#fx-cmd-msg'), /no data for ZZZZ/);
  const z = await page.$$eval('#b-cmpq .fx-cmpt tr', r => r.slice(1).map(x => x.textContent)).then(r => r.find(x => x.includes('ZZZZ')));
  assert.match(z, /—.*—/, 'unavailable values show as —');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('FOCUS crypto: order flow and depth of market follow a Kraken-listed coin', async () => {
  const {ctx, page, errors} = await boot();
  await command(page, 'ETH-USD'); await page.clock.runFor(1500);
  assert.ok((await boxes(page)).includes('dom'));
  assert.equal(await page.evaluate(() => localStorage.getItem('fx-term-oflow-pair')), 'ETH/USD');
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* ---------- notifications: bell, follow, alerts ---------- */
test('bell: unread count, read/unread, symbol chips, clicking opens the market inside the Terminal', async () => {
  const items = [{id: 'a', title: 'AAPL +5.10% today', message: 'Apple · last 280', category: 'market_alerts', priority: 'high', read: false, timestamp: new Date(NOW - 600000).toISOString(), sourceUrl: '/terminal.html?sym=AAPL', metadata: {symbol: 'AAPL'}},
    {id: 'b', title: 'Fed holds rates', category: 'economic_calendar', read: false, timestamp: new Date(NOW - 3600000).toISOString(), sourceUrl: '/news/article.html?url=x', metadata: {}},
    {id: 'c', title: 'Old alert', category: 'market_alerts', read: true, timestamp: new Date(NOW - 86400000).toISOString(), sourceUrl: '/terminal.html?sym=MSFT', metadata: {symbol: 'MSFT'}}];
  const {ctx, page, errors} = await boot({bridge: {items}});
  await page.waitForSelector('.fx-bell');
  assert.equal(await page.textContent('.fx-bellbadge'), '2');
  await page.click('.fx-bell');
  assert.equal(await page.$$eval('.fx-bellitem', b => b.length), 3);
  assert.equal(await page.$$eval('.fx-bellitem.unread', b => b.length), 2);
  assert.match(await page.textContent('.fx-bellitem >> nth=0'), /AAPL.*MARKET.*10m.*AAPL \+5\.10% today/);
  await shot(page, 'bell.png');
  await page.click('.fx-bellitem >> nth=0'); await page.clock.runFor(1500);
  assert.match(page.url(), /sym=AAPL/, 'opened in the Terminal without leaving the page');
  assert.deepEqual(await page.evaluate(() => window.__bridge.read), ['a']);
  assert.equal(await page.textContent('.fx-bellbadge'), '1');
  await page.click('.fx-bell'); await page.click('.fx-bellhead .fx-belllink');
  assert.deepEqual(await page.evaluate(() => window.__bridge.allRead), ['b']);
  assert.equal(await page.isHidden('.fx-bellbadge'), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('follow ★: saves to the account watchlist, adds a ★ tab, alerts for followed markets are sent once', async () => {
  const rule = {id: 'r1', symbol: 'AAPL', kind: 'priceAbove', threshold: 1, enabled: true};
  const {ctx, page, errors} = await boot({bridge: {followed: ['^VIX'], rules: [rule]}});
  await command(page, 'NVDA'); await page.clock.runFor(1500);
  await page.click('.fx-follow');
  assert.deepEqual(await page.evaluate(() => window.__bridge.saved.at(-1)), ['^VIX', 'NVDA']);
  assert.equal(await page.textContent('.fx-follow'), '★');
  await page.click('.fx-symchip .fx-symx:last-child'); await page.clock.runFor(800);
  await page.waitForSelector('#mkts-tabs >> text=★');
  await page.click('#mkts-tabs >> text=★'); await page.clock.runFor(200);
  assert.match(await page.textContent('#b-mkts'), /VIX/);
  // Scans run on each tick commit and every minute; one alert per key.
  await page.clock.runFor(61000); await page.clock.runFor(61000);
  const emits = await page.evaluate(() => window.__bridge.emits);
  const keys = emits.map(e => e.dedupeKey);
  assert.ok(keys.includes('rule:r1:2026-11-26'), keys.join(','));
  assert.ok(keys.some(k => /^move:\^VIX:2026-11-26:down$/.test(k)), 'VIX −5% is a big move');
  assert.equal(new Set(keys).size, keys.length, 'never twice');
  const r = emits.find(e => e.dedupeKey === 'rule:r1:2026-11-26');
  assert.equal(r.category, 'market_alerts'); assert.equal(r.priority, 'high'); assert.equal(r.sourceUrl, '/terminal.html?sym=AAPL'); assert.deepEqual(r.metadata, {symbol: 'AAPL', kind: 'rule'});
  // Turning market alerts off stops new ones.
  await page.click('.fx-bell'); await page.click('.fx-bellpref >> text=Market alerts');
  assert.equal(await page.evaluate(() => window.__bridge.prefs.marketAlerts), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('guest: the bell asks to sign in; following needs an account; nothing is sent', async () => {
  const {ctx, page, errors} = await boot({bridge: {user: null}});
  await page.click('.fx-bell');
  assert.match(await page.textContent('.fx-belldrop'), /Sign in to follow markets/);
  await page.keyboard.press('Escape');
  await command(page, 'AAPL'); await page.clock.runFor(1200);
  await page.click('.fx-follow');
  assert.deepEqual(await page.evaluate(() => [window.__bridge.saved, window.__bridge.emits]), [[], []]);
  assert.deepEqual(errors, []);
  await ctx.close();
});
