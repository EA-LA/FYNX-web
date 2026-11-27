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
const CHART_BASE = {AAPL: 270, NVDA: 180, MSFT: 480, 'EURUSD=X': 1.08, 'GBPUSD=X': 1.27, 'BTC-USD': 90000, SPY: 680, QQQ: 600, 'DX-Y.NYB': 99,
  // Markets from the production reports: Meta (two share classes in SEC EDGAR), two new listings, an emerging-market pair, a coin without a Kraken book.
  META: 610, BFLR: 0.017, ANT: 82.8, 'TRY=X': 50.8, 'PEPE-USD': 0.00001};
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

function harness({account = false} = {}) {
  return fs.readFileSync(path.join(root, 'terminal.html'), 'utf8')
    .replace(/<!-- terminal-gate:start -->[\s\S]*?<!-- terminal-gate:end -->/, '')
    .replace(/<!-- FYNX ADSENSE VERIFICATION START -->[\s\S]*?<!-- FYNX ADSENSE VERIFICATION END -->/, '')
    .replace(/<script type="module"[^>]*><\/script>/g, m => account && m.includes('/assets/js/saved-settings.js') ? m : '')
    .replace(/<link[^>]+fonts\.(googleapis|gstatic)[^>]*>/g, '');
}
// Test account server: the real fynxAccountSync service over the in-memory database used by the backend tests.
const {FakeDB} = require('../backend/test-support/account-sync-fake-db.cjs');
const {createService} = require('../backend/account-sync-service.cjs');
function accountServer() {
  const db = new FakeDB(), service = createService({db, now: () => Date.now()});
  const server = {db, service, down: false, writes: 0, reads: 0,
    async handle(uid, payload) {
      if (server.down) return {ok: false, error: {message: 'Network error', code: 'unavailable'}};
      if (payload?.action === 'mutate') server.writes++; else server.reads++;
      try { return {ok: true, data: await service.handle(payload, {auth: uid ? {uid, token: {firebase: {sign_in_provider: 'password'}}} : null})}; }
      catch (e) { return {ok: false, error: {message: e.message, code: e.code, details: e.details}}; }
    },
    async settings(uid) { const r = await service.handle({action: 'read', expectedUid: uid, domains: ['preferences']}, {auth: {uid, token: {firebase: {sign_in_provider: 'password'}}}}); return r.records.find(x => x.domain === 'preferences' && x.id === 'default')?.data?.savedSettings?.keys || {}; }
  };
  return server;
}
// The browser half of account sync with only Firebase swapped out: same Store, same cache scope, same refresh triggers.
const FAKE_ACCOUNT_SYNC = `import './account-sync-core.js?v=20261115-intelligence-1';
const listeners = new Set();
export async function stableID(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export const sync = new globalThis.FynxAccountSyncCore.Store({storage: localStorage, call: async payload => { const r = await window.__acctCall(payload); if (r.ok) return r.data; const e = new Error(r.error.message); e.code = r.error.code; e.details = r.error.details; throw e; }, changed: s => listeners.forEach(fn => { try { fn(s); } catch {} })});
export const subscribe = fn => { listeners.add(fn); fn(sync); return () => listeners.delete(fn); };
export const connected = (async () => { const uid = window.__ACCT_UID || null; await sync.switchUser(uid, uid ? 'fynx.account.sync.v1.' + await stableID(uid) : null); })();
export const save = (...a) => sync.save(...a);
export const accountData = (domain, id = 'default') => sync.record(domain, id)?.data || null;
window.addEventListener('online', () => sync.refresh());
window.addEventListener('focus', () => sync.refresh());
setInterval(() => { if (!document.hidden && sync.uid && !sync.pending.length) sync.refresh(); }, 5000);`;
// Run the page clock until cond() is true in the page (account calls are real promises between ticks).
async function until(page, cond, arg, {step = 500, max = 40} = {}) {
  for (let i = 0; i < max; i++) { if (await page.evaluate(cond, arg)) return true; await page.clock.runFor(step); await new Promise(r => setTimeout(r, 30)); }
  return false;
}
const synced = page => until(page, () => window.FynxSavedSettings?.state.restored && ['synced', 'partial'].includes(window.FynxSavedSettings.state.status));

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
async function boot({time = NOW, width = 1600, height = 1100, filingsDown = false, plan = null, bridge = null, url = '', phone = false, account = null, seed = null} = {}) {
  const ctx = await browser.newContext(phone ? {viewport: {width, height}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'} : {viewport: {width, height}}), page = await ctx.newPage();
  await page.clock.install({time: new Date(time)});
  if (bridge) await page.addInitScript(fakeBridge, bridge);
  // Settings already on this device before the page starts (written once, before any FYNX script runs).
  if (seed) await page.addInitScript(seed => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); }, seed);
  if (account) {
    // A signed-in FYNX account: the real account-sync Store in the page, the real fynxAccountSync service in the
    // test, which takes the user id from the verified auth context (here: this browser's signed-in user).
    await page.addInitScript(uid => { window.__ACCT_UID = sessionStorage.getItem('test-uid') ?? uid; if (window.__ACCT_UID) try { localStorage.setItem('fynx_auth_email', window.__ACCT_UID + '@example.com'); } catch {} }, account.uid);
    await page.exposeFunction('__acctCall', payload => page.evaluate(() => window.__ACCT_UID).then(uid => account.server.handle(uid, payload)));
  }
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
      if (url.pathname === '/terminal.html') return route.fulfill({contentType: 'text/html', body: harness({account: !!account})});
      if (url.pathname === '/assets/js/account-sync.js') return route.fulfill({contentType: 'text/javascript', body: FAKE_ACCOUNT_SYNC});
      if (url.pathname === '/assets/js/market-intelligence-data.js') return route.fulfill({contentType: 'text/javascript', body: NEWS_STUB});
      if (url.pathname === '/assets/js/fynx-plan.js' && plan) return route.fulfill({contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'assets/js/fynx-plan.js'), 'utf8') + PLAN_SHIM});
      const file = path.join(root, decodeURIComponent(url.pathname));
      if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)});
      return route.fulfill({status: 404, body: ''});
    }
    if (url.pathname.endsWith('/webResearchData')) {
      const a = url.searchParams.get('action');
      // SEC EDGAR groups share classes under one CIK ("META, METAM"); BFLR is not listed; ANT has no 10-K yet.
      if (a === 'directory') return json(route, {companies: [{symbol: 'AAPL', cik: 320193, name: 'Apple Inc.'}, {symbol: 'META, METAM', cik: 1326801, name: 'Meta Platforms, Inc.'}, {symbol: 'ANT', cik: 2130357, name: 'Anthropic, PBC'}]});
      if (a === 'financials') { const cik = Number(url.searchParams.get('cik')); if (cik === 1326801) return json(route, {...FIN, cik, name: 'Meta Platforms, Inc.'}); if (cik === 2130357) return json(route, {error: 'No supported US-GAAP annual facts were returned.'}, 404); return json(route, FIN); }
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
  await page.goto(ORIGIN + '/terminal.html' + (url || ''));
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
  // Thanksgiving: the quote says it is delayed and that the US market is closed (holiday), never 'live'.
  assert.match(await page.textContent('#b-squote .fx-sqasof'), /^Delayed/);
  assert.equal(await page.textContent('#b-squote .fx-sess'), 'CLOSED'); assert.match(await page.getAttribute('#b-squote .fx-sess', 'title'), /US market (closed|holiday)/i);
  assert.match(await page.textContent('#fx-live'), /FEEDS \d+\/\d+ · DELAYED/); assert.doesNotMatch(await page.textContent('#fx-live'), /LIVE/);
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

test('HEADLINES ticker: items never overlap; time, title and source stay apart; no restart on data refresh', async () => {
  for (const [w, h] of [[1920, 1080], [390, 844], [3440, 1440]]) {
    const {ctx, page, errors} = await boot({width: w, height: h});
    await page.waitForSelector('#fx-news-track .fx-hl');
    const r = await page.evaluate(() => {
      const items = [...document.querySelectorAll('#fx-news-track .fx-hl')]; let overlap = 0, inner = 0, clipped = 0;
      for (let i = 1; i < items.length; i++) { const a = items[i - 1].getBoundingClientRect(), b = items[i].getBoundingClientRect(); if (b.left < a.right - 0.5) overlap++; }
      for (const it of items) { const k = [...it.children].map(c => c.getBoundingClientRect()); for (let i = 1; i < k.length; i++) if (k[i].left < k[i - 1].right - 0.5) inner++; if (it.scrollWidth > it.clientWidth + 1) clipped++; }
      const tr = document.getElementById('fx-news-track'), cs = getComputedStyle(tr);
      return {n: items.length, overlap, inner, clipped, anim: cs.animationName, h: document.querySelector('.fx-news').getBoundingClientRect().height, itemH: Math.max(...items.map(i => i.getBoundingClientRect().height))};
    });
    assert.equal(r.overlap, 0, `${w}px: items overlap ${JSON.stringify(r)}`); assert.equal(r.inner, 0, `${w}px: time/title/source overlap`); assert.equal(r.clipped, 0, `${w}px: text cut inside an item`);
    assert.ok(r.itemH <= r.h, `${w}px: items fit the strip height ${JSON.stringify(r)}`);
    // A routine refresh with the same headlines must not rebuild the strip (rebuilding restarts and jerks it).
    const before = await page.evaluateHandle(() => document.querySelector('#fx-news-track .fx-hl')); await page.clock.runFor(125000);
    assert.equal(await before.evaluate(el => el.isConnected), true, `${w}px: strip rebuilt although headlines did not change`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('long session: 6 simulated hours of desks, focus, compare and pages do not grow timers, DOM or memory', async () => {
  // Reuse the standard harness (fixtures, clock) and add the interval counter.
  const {ctx: c2, page, errors} = await boot({width: 1920, height: 1080});
  await page.evaluate(() => { const live = new Set(), si = window.setInterval, ci = window.clearInterval; window.setInterval = function (...a) { const id = si.apply(this, a); live.add(id); return id; }; window.clearInterval = function (id) { live.delete(id); return ci.call(this, id); }; window.__intervals = () => live.size; });
  const cdp = await c2.newCDPSession(page); await cdp.send('HeapProfiler.enable');
  const measure = async () => { await cdp.send('HeapProfiler.collectGarbage'); const {usedSize} = await cdp.send('Runtime.getHeapUsage'); return {heap: usedSize / 1048576, dom: await page.evaluate(() => document.getElementsByTagName('*').length), intervals: await page.evaluate(() => window.__intervals()), listeners: (await cdp.send('DOMDebugger.getEventListeners', {objectId: (await cdp.send('Runtime.evaluate', {expression: 'window'})).result.objectId})).listeners.length}; };
  const cycle = async i => {
    await command(page, ['STOCKS', 'FOREX', 'CRYPTO', 'ALL'][i % 4]); await page.clock.runFor(4000);
    await command(page, ['AAPL', 'EUR/USD', 'BTC-USD', 'NVDA'][i % 4]); await page.clock.runFor(4000);
    await command(page, 'AAPL NVDA MSFT'); await page.clock.runFor(4000);
    await command(page, ['HOURS', 'SENTIMENT', 'WIRE', 'INDUSTRIES'][i % 4]); await page.clock.runFor(6000);
    await page.keyboard.press('Escape'); await command(page, 'CLEAR'); await page.clock.runFor(4000);
    await page.clock.runFor(20 * 60000); // 20 minutes of refresh timers
  };
  for (let i = 0; i < 2; i++) await cycle(i); // warm-up
  const a = await measure();
  for (let i = 2; i < 18; i++) await cycle(i); // ≈ 6 hours
  const b = await measure();
  console.log('long session', JSON.stringify({a, b}));
  assert.ok(b.intervals <= a.intervals + 2, `timers keep piling up: ${a.intervals} → ${b.intervals}`);
  assert.ok(b.dom <= a.dom * 1.25 + 300, `DOM grows: ${a.dom} → ${b.dom}`);
  assert.ok(b.heap <= a.heap * 1.6 + 8, `heap grows: ${a.heap.toFixed(1)} → ${b.heap.toFixed(1)} MB`);
  assert.ok(b.listeners <= a.listeners + 10, `window listeners pile up: ${a.listeners} → ${b.listeners}`);
  assert.deepEqual(errors, []);
  await c2.close();
});

test('network: start-up and 10 minutes of refreshes fetch each data file only as often as its refresh schedule needs', async () => {
  const {ctx, page, errors, seen} = await boot();
  await page.clock.runFor(3000);
  const count = list => list.reduce((m, u) => { const k = u.replace(/[?&](_|t|bust|v)=[^&]*/g, '').replace(/^https?:\/\/[^/]+/, ''); m[k] = (m[k] || 0) + 1; return m; }, {});
  const data = list => list.filter(u => !/\.(js|css|svg|png|woff2?)(\?|$)/.test(u) && !/webOperationalEvent/.test(u)); // the error monitor throttles itself (12/min)
  const boot1 = count(data(seen));
  console.log('boot requests', JSON.stringify(boot1));
  for (const [k, n] of Object.entries(boot1)) assert.ok(n <= 2, `${k} requested ${n}× during start-up`);
  const mark = seen.length; await page.clock.runFor(10 * 60000);
  const later = count(data(seen.slice(mark)));
  console.log('10 min requests', JSON.stringify(later));
  for (const [k, n] of Object.entries(later)) assert.ok(n <= 21, `${k} requested ${n}× in 10 minutes`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* ---------- routing ---------- */
const isPage = page => page.evaluate(() => document.body.classList.contains('fx-paging'));
test('routing: deep links, refresh, back/forward, invalid routes never give a blank screen', async () => {
  // Desk deep link.
  let b = await boot({url: '?desk=forex'});
  assert.equal(await b.page.textContent('.fx-desk.on'), 'FOREX'); await b.ctx.close();
  // Invalid desk → ALL, and the grid is there.
  b = await boot({url: '?desk=nope&cmp=,&sym='});
  assert.equal(await b.page.textContent('.fx-desk.on'), 'ALL'); assert.ok(await b.page.$$eval('#fx-main > section.tp', s => s.length) >= 12); await b.ctx.close();
  // Page deep link, back closes it, forward reopens it.
  b = await boot({url: '#hours'});
  await b.page.waitForSelector('.mkh-card'); assert.equal(await isPage(b.page), true);
  await b.page.goBack(); await b.page.clock.runFor(300); assert.equal(await isPage(b.page), false, 'Back returns to the desk');
  await b.page.goForward(); await b.page.clock.runFor(300); await b.page.waitForSelector('.mkh-card');
  // Refresh keeps the page.
  await b.page.reload(); await b.page.clock.runFor(2500); await b.page.waitForSelector('.mkh-card');
  await b.ctx.close();
  // Unknown page hash → the desk, not a blank screen.
  b = await boot({url: '#doesnotexist/xyz'});
  assert.equal(await isPage(b.page), false); assert.ok(await b.page.isVisible('#fx-main'));
  // Focus + page: back from a page keeps the focused market.
  await command(b.page, 'AAPL'); await b.page.clock.runFor(1200);
  await command(b.page, 'FILINGS AAPL'); await b.page.waitForSelector('.fl-table');
  await b.page.goBack(); await b.page.clock.runFor(400);
  assert.match(b.page.url(), /sym=AAPL/); assert.equal(await b.page.textContent('#fx-modebar .on'), 'FOCUS');
  assert.deepEqual(b.errors, []);
  await b.ctx.close();
});

test('workflow: scanner → focus → follow → compare → back to ALL', async () => {
  const {ctx, page, errors} = await boot({bridge: {followed: []}});
  await command(page, 'SCAN'); await page.waitForSelector('.sc-table tr.pg-click');
  await page.click('.sc-table tr.pg-click >> text=AAPL'); await page.clock.runFor(1500);
  assert.equal(await page.textContent('#fx-modebar .on'), 'FOCUS'); assert.match(page.url(), /sym=AAPL/);
  await page.click('.fx-follow'); assert.deepEqual(await page.evaluate(() => window.__bridge.saved.at(-1)), ['AAPL']);
  await command(page, 'SCAN'); await page.waitForSelector('.sc-table tr.pg-click');
  // The scanner fixture lists AAPL only; Shift-click it while focused adds nothing new, so add NVDA from the command bar.
  await page.keyboard.press('Escape'); await command(page, '+NVDA'); await page.clock.runFor(1500);
  assert.equal(await page.textContent('#fx-modebar .on'), 'COMPARE');
  assert.deepEqual(await page.$$eval('#fx-symchip .fx-cmpname', b => b.map(x => x.textContent)), ['AAPL', 'NVDA']);
  await page.click('#fx-modebar .fx-mode >> text=ALL'); await page.clock.runFor(800);
  assert.equal(await page.textContent('#fx-modebar .on'), 'ALL'); assert.doesNotMatch(page.url(), /sym=|cmp=/);
  assert.deepEqual(await page.evaluate(() => window.__bridge.followed), ['AAPL'], 'still followed after leaving focus');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a paywall never stays over the next page (free pages stay free)', async () => {
  const {ctx, page, errors} = await boot({plan: {tier: 'free', used: 5}});
  await command(page, 'VCLUST'); await page.clock.runFor(800);
  const opened = await page.$('.fxp-dlg, .fxp-lock'); assert.ok(opened, 'the premium page is gated');
  for (const c of ['HOURS', 'OVERVIEW', 'HMAP', 'SENTIMENT']) { await command(page, c); await page.clock.runFor(600); assert.equal(await page.$('.fxp-dlg'), null, `${c}: no paywall left over`); assert.equal(await page.$('#fx-page .fxp-lock'), null, `${c} is free`); }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mobile 390px and ultrawide 3440px: mode switch, comparison chips and the bell fit on screen', async () => {
  for (const [w, h] of [[390, 844], [820, 1180], [3440, 1440]]) {
    const {ctx, page, errors} = await boot({width: w, height: h, bridge: {items: [{id: 'a', title: 'AAPL +5.10% today', category: 'market_alerts', read: false, timestamp: new Date(NOW).toISOString(), sourceUrl: '/terminal.html?sym=AAPL', metadata: {symbol: 'AAPL'}}]}});
    await command(page, 'AAPL NVDA MSFT'); await page.clock.runFor(2000);
    const box = sel => page.$eval(sel, n => { const r = n.getBoundingClientRect(); return {l: r.left, r: r.right, w: r.width, h: r.height, vis: r.width > 0 && r.height > 0}; });
    const vw = await page.evaluate(() => document.documentElement.clientWidth);
    for (const sel of ['#fx-modebar', '.fx-bell']) { const b = await box(sel); assert.ok(b.vis, `${w}px: ${sel} visible`); }
    // Every compare chip can be reached (the chip strip scrolls rather than overflowing the page).
    const over = await page.evaluate(() => { const vw = document.documentElement.clientWidth; const out = []; for (const n of document.querySelectorAll('body *')) { const r = n.getBoundingClientRect(); if (r.width && r.right > vw + 1) { let p = n.parentElement, clipped = false; while (p && p !== document.body) { const o = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(o.overflowX)) { const pr = p.getBoundingClientRect(); if (pr.right <= vw + 1) { clipped = true; break; } } p = p.parentElement; } if (!clipped) out.push((n.id ? '#' + n.id : '') + '.' + String(n.className).split(' ')[0] + ':' + Math.round(r.right)); } } return {sw: document.documentElement.scrollWidth, vw, out: out.slice(0, 8)}; });
    assert.ok(over.sw <= over.vw + 1, `${w}px: no horizontal page scroll ${JSON.stringify(over)}`);
    await shot(page, `compare-${w}-chips.png`);
    const chips = await page.$$eval('.fx-cmpchip', ns => ns.map(n => { const r = n.getBoundingClientRect(); return r.width > 20 && r.height > 10; }));
    assert.ok(chips.length === 3 && chips.every(Boolean), `${w}px: all three compare chips are visible ${chips}`);
    await page.click('.fx-bell'); const d = await box('#fx-belldrop'); assert.ok(d.l >= 0 && d.r <= vw + 1, `${w}px: bell menu inside the screen ${JSON.stringify(d)}`);
    await shot(page, `compare-${w}.png`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

// Visual pass only (FYNX_PHONE_SHOTS=dir): iPhone screenshots of every desk and the main pages.
test('iPhone screenshots', {skip: !process.env.FYNX_PHONE_SHOTS}, async () => {
  const dir = process.env.FYNX_PHONE_SHOTS; fs.mkdirSync(dir, {recursive: true});
  const {ctx, page, errors} = await boot({width: Number(process.env.FYNX_W || 393), height: Number(process.env.FYNX_H || 852), phone: true, plan: {tier: 'free', used: 0}, bridge: {user: {uid: 'u1'}, items: [{id: 'a', title: 'AAPL +5.10% today', category: 'market_alerts', read: false, timestamp: new Date(NOW).toISOString(), sourceUrl: '/terminal.html?sym=AAPL', metadata: {symbol: 'AAPL'}}, {id: 'b', title: 'NVDA earnings tomorrow after the close', category: 'market_alerts', read: true, timestamp: new Date(NOW - 3600e3).toISOString(), sourceUrl: '/terminal.html?sym=NVDA', metadata: {symbol: 'NVDA'}}]}});
  const snap = async (name, frames = Number(process.env.FYNX_FRAMES || 1)) => {
    await page.clock.runFor(1500); await page.evaluate(() => window.scrollTo(0, 0));
    for (let i = 0; i < frames; i++) { await page.evaluate(k => window.scrollTo(0, k * (innerHeight - 60)), i); await page.clock.runFor(200); await page.screenshot({path: path.join(dir, `${name}${i ? '-' + i : ''}.png`)}); }
    await page.evaluate(() => window.scrollTo(0, 0));
  };
  await snap('00-all', Number(process.env.FYNX_ALL_FRAMES || 1));
  if (process.env.FYNX_MENU) { await page.click('#fx-mmenu'); await page.clock.runFor(300); await page.screenshot({path: path.join(dir, 'menu.png')}); await page.keyboard.press('Escape'); await page.click('.fx-bell'); await page.clock.runFor(300); await page.screenshot({path: path.join(dir, 'bell.png')}); await page.click('.fx-bell'); }
  for (const d of (process.env.FYNX_DESKS || 'DASHBOARD,STOCKS,CRYPTO,FOREX').split(',')) { await command(page, d); await snap('desk-' + d.toLowerCase()); }
  await command(page, 'AAPL'); await snap('focus-aapl');
  await command(page, 'AAPL NVDA MSFT'); await snap('compare');
  await command(page, 'ALL');
  for (const p of (process.env.FYNX_PAGES || 'NEWS,MKTS,HELP,SETTINGS').split(',')) { await command(page, p); await snap('page-' + p.toLowerCase()); await page.keyboard.press('Escape'); await page.clock.runFor(300); }
  console.log('errors', JSON.stringify(errors));
  await ctx.close();
});

test('dump phone dom', {skip: !process.env.FYNX_DUMP}, async () => {
  const {ctx, page} = await boot({width: 393, height: 852, phone: true, plan: {tier: 'free', used: 0}});
  await page.addInitScript(() => {}); await page.evaluate(s => { window.process = {env: {FYNX_DUMP_SEL: s}}; }, process.env.FYNX_DUMP_SEL || '');
  await page.clock.runFor(1500);
  console.log(await page.evaluate(() => {
    const d = (n, depth = 0) => { if (depth > 3) return ''; const r = n.getBoundingClientRect(); let out = '  '.repeat(depth) + n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : '') + (n.hidden ? ' [hidden]' : '') + ` ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` + (n.children.length ? '' : ' "' + (n.textContent || '').trim().slice(0, 30) + '"') + '\n'; for (const c of n.children) if (!['SCRIPT','svg','STYLE'].includes(c.tagName) && c.tagName !== 'svg') out += d(c, depth + 1); return out; };
    return process.env.FYNX_DUMP_SEL ? [...document.querySelectorAll(process.env.FYNX_DUMP_SEL)].map(n => d(n)).join('---\n') : [...document.body.children].filter(n => !['SCRIPT','LINK','STYLE'].includes(n.tagName)).map(n => n.id === 'fx-main' ? d(n, 2) : d(n)).join('');
  }));
  await ctx.close();
});

test('phone probe', {skip: !process.env.FYNX_PROBE}, async () => {
  const {ctx, page} = await boot({width: 393, height: 852, phone: true, plan: {tier: 'free', used: 0}});
  await page.clock.runFor(1500);
  console.log(await page.evaluate(new Function(process.env.FYNX_PROBE)));
  await ctx.close();
});

test('iPhone layout: compact header, menu sheet, desk tabs, even controls, pages on top, nothing off-screen', async () => {
  for (const [w, h] of [[375, 667], [393, 852], [430, 932]]) {
    const {ctx, page, errors} = await boot({width: w, height: h, phone: true, bridge: {items: [{id: 'a', title: 'AAPL +5.10% today', category: 'market_alerts', read: false, timestamp: new Date(NOW).toISOString(), sourceUrl: '/terminal.html?sym=AAPL', metadata: {symbol: 'AAPL'}}]}});
    const r = sel => page.$eval(sel, n => { const b = n.getBoundingClientRect(); return {x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom}; });
    const noSideScroll = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${w}px ${label}: no sideways page scroll`);
    // Header: brand, status, bell and menu on one row, search below. About half the old 252px.
    assert.ok((await r('header.fx-top')).h <= 132, `${w}px: header is compact`);
    for (const sel of ['.fx-brand', '.fx-mstat', '.fx-bell', '#fx-mmenu']) { const b = await r(sel); assert.ok(b.y < 60 && b.r <= w, `${w}px: ${sel} on the first row`); }
    const cmd = await r('#fx-cmd-form'); assert.ok(cmd.h >= 44 && Math.abs(cmd.x - 12) <= 1 && Math.abs(w - cmd.r - 12) <= 1, `${w}px: full-width search bar`);
    // Secondary buttons live in the menu sheet, as one even grid.
    for (const id of ['fx-plan', 'fx-live', 'fx-tour-btn', 'fx-build', 'fx-edit', 'fx-classic']) assert.equal(await page.$eval('#' + id, n => n.closest('#fx-msheet') !== null), true, `${id} is in the menu`);
    await page.click('#fx-mmenu'); await page.clock.runFor(200);
    const items = await page.$$eval('.fx-mgrid > *', ns => ns.map(n => { const b = n.getBoundingClientRect(); return {id: n.id, h: b.height, r: b.right, txt: n.textContent.trim()}; }));
    assert.equal(items.length, 6, `${w}px: six menu items (no stray ones)`); assert.ok(items.every(i => i.h >= 44 && i.r <= w && i.txt), `${w}px: menu items are even, labelled and on screen`);
    await page.keyboard.press('Escape'); assert.equal(await page.$eval('#fx-msheet', n => n.hidden), true, 'Escape closes the menu');
    // Desk tabs scroll; mode switch, Find and Scanner share one row.
    const tabs = await page.$$eval('.fx-desk', ns => ns.map(n => n.getBoundingClientRect().height)); assert.ok(tabs.length >= 10 && tabs.every(x => x >= 44), `${w}px: every desk is a full-height tab`);
    const mode = await r('#fx-modebar'), find = await r('#fx-find-btn'), scan = await r('#fx-scan-btn');
    assert.ok(Math.abs(mode.y - find.y) < 2 && Math.abs(mode.y - scan.y) < 2 && scan.r <= w - 11, `${w}px: mode, Find and Scanner on one row`);
    // Bell menu opens on screen and above the header.
    await page.click('.fx-bell'); await page.clock.runFor(200);
    const d = await r('#fx-belldrop'); assert.ok(d.x >= 0 && d.r <= w && d.h > 100, `${w}px: bell menu visible`);
    assert.equal(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#fx-belldrop'), [d.x + d.w / 2, d.y + 20]), true, `${w}px: bell menu is not under the header`);
    await page.click('.fx-bell');
    await noSideScroll('ALL desk');
    // Cards: full width, even gutters, sized to content (no tall empty boxes).
    const cards = await page.$$eval('#fx-main > section.tp', ns => ns.map(n => { const b = n.getBoundingClientRect(), body = n.querySelector('.tp-b'); return {id: n.id, x: b.left, r: b.right, gap: body ? body.getBoundingClientRect().height - body.scrollHeight : 0}; }));
    assert.ok(cards.every(c => Math.abs(c.x - 12) <= 1 && Math.abs(w - c.r - 12) <= 1), `${w}px: every card has the same 12px gutters`);
    for (const c of cards) assert.ok(c.gap < 24, `${w}px: ${c.id} has no empty filler space (${c.gap}px)`);
    // Focus and compare, then typed desk commands leave them.
    await command(page, 'AAPL'); await noSideScroll('FOCUS');
    await command(page, 'AAPL NVDA MSFT'); await page.clock.runFor(1500); await noSideScroll('COMPARE');
    await command(page, 'ALL'); assert.equal(await page.$eval('.fx-mode.on', n => n.textContent), 'ALL', 'ALL leaves compare');
    await command(page, 'AAPL'); await command(page, 'STOCKS');
    assert.equal(await page.$eval('.fx-mode.on', n => n.textContent), 'ALL', 'a desk name leaves focus'); assert.equal(await page.$eval('.fx-desk.on', n => n.textContent), 'STOCKS');
    // Full pages open at the top of the screen, with the panels hidden underneath.
    for (const p of ['NEWS', 'CAL', 'HELP']) {
      await command(page, p); await page.clock.runFor(800);
      const pg = await r('#fx-page'); assert.ok(pg.y < 260 && pg.h > 200, `${w}px: ${p} page starts near the top (${Math.round(pg.y)})`);
      assert.equal(await page.$eval('#fx-main', n => getComputedStyle(n).display), 'none', `${w}px: panels hidden under ${p}`);
      await noSideScroll(p + ' page');
      await page.keyboard.press('Escape'); await page.clock.runFor(300);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('desktop keeps its header buttons (phone menu only below 761px)', async () => {
  const {ctx, page} = await boot({width: 1600, height: 1000});
  for (const id of ['fx-plan', 'fx-live', 'fx-tour-btn', 'fx-build', 'fx-edit', 'fx-classic']) assert.equal(await page.$eval('#' + id, n => n.closest('#fx-msheet') === null && n.closest('header.fx-top') !== null), true, `${id} stays in the header`);
  assert.equal(await page.$eval('#fx-mmenu', n => n.getBoundingClientRect().width), 0, 'no menu button on desktop');
  await page.setViewportSize({width: 393, height: 852}); await page.clock.runFor(300);
  assert.equal(await page.$eval('#fx-edit', n => n.closest('#fx-msheet') !== null), true, 'narrowing the window moves them into the menu');
  await page.setViewportSize({width: 1600, height: 1000}); await page.clock.runFor(300);
  if (process.env.FYNX_DBG) console.log(await page.evaluate(() => JSON.stringify({mq: matchMedia('(max-width:760px)').matches, iw: innerWidth, edit: document.getElementById('fx-edit').parentElement.className, comments: [...document.querySelector('header.fx-top').childNodes].filter(n => n.nodeType === 8).map(n => n.data)})));
  assert.equal(await page.$eval('#fx-edit', n => n.closest('#fx-msheet') === null), true, 'and widening moves them back');
  await ctx.close();
});

test('focus probe', {skip: !process.env.FYNX_FOCUS}, async () => {
  for (const sym of process.env.FYNX_FOCUS.split(',')) {
    const {ctx, page, errors} = await boot({width: 1920, height: 1080, url: '?desk=stocks&sym=' + encodeURIComponent(sym)});
    await page.clock.runFor(4000);
    const info = await page.evaluate(() => [...document.querySelectorAll('#fx-main > section.tp')].map(n => { const h = n.querySelector('header h2')?.textContent.replace(/\s+/g, ' ').trim(); const t = n.querySelector('.tp-b')?.innerText || ''; return {id: n.id, h, eur: /EUR\s?\/?\s?USD/.test(h + ' ' + t), len: t.length, empty: /unavailable|Loading|No |not /i.test(t.slice(0, 80)) ? t.slice(0, 70).replace(/\s+/g, ' ') : ''}; }));
    console.log('### ' + sym + ' mode=' + (await page.$eval('.fx-mode.on', n => n.textContent)) + ' chip=' + (await page.$eval('#fx-symchip', n => n.hidden ? 'hidden' : n.textContent.replace(/\s+/g, ' ').slice(0, 40))) + ' url=' + (await page.evaluate(() => location.search)) + ' errors=' + errors.length);
    for (const i of info) console.log('  ' + i.id.padEnd(12) + (i.eur ? ' **EURUSD** ' : '            ') + String(i.len).padStart(5) + '  ' + (i.h || '').slice(0, 60) + (i.empty ? '  [' + i.empty + ']' : ''));
    await ctx.close();
  }
});

/* ── Account-wide settings: separate browser contexts are separate devices (own localStorage), one account server ── */
const layoutOf = page => page.evaluate(() => localStorage.getItem('fx-term-layout-all'));
const boxesOf = page => page.$$eval('#fx-main > section.tp:not(.tp-empty)', s => s.map(x => x.id));
const pageNow = page => page.evaluate(() => Date.now());

test('account sync: a workspace customised on one device opens the same on a new device, browser and screen size', async () => {
  const server = accountServer();
  // Device A: a big monitor. Customise the ALL desk with the real Edit controls.
  const A = await boot({width: 3440, height: 1440, account: {server, uid: 'alice'}});
  assert.ok(await synced(A.page), 'A connected to the account');
  await A.page.click('#fx-edit'); await A.page.clock.runFor(300);
  for (let i = 0; i < 2; i++) { await A.page.click('#fx-ed-row'); await A.page.clock.runFor(200); }
  await A.page.click('#fx-ed-all'); await A.page.clock.runFor(800);
  await A.page.click('#fx-ed-done'); await A.page.clock.runFor(300);
  const layoutA = await layoutOf(A.page), boxesA = await boxesOf(A.page);
  assert.ok(layoutA && boxesA.length >= 60, 'A has a customised layout with every panel');
  assert.ok(await until(A.page, async () => true) && await (async () => { for (let i = 0; i < 40; i++) { if ((await server.settings('alice'))['fx-term-layout-all']?.v === layoutA) return true; await A.page.clock.runFor(1000); await new Promise(r => setTimeout(r, 30)); } return false; })(), 'saved to the account automatically (no Save button)');
  // Device B: a laptop that has never opened FYNX, a later clock.
  const B = await boot({width: 1366, height: 768, time: await pageNow(A.page) + 5000, account: {server, uid: 'alice'}});
  assert.ok(await synced(B.page), 'B connected');
  assert.equal(await layoutOf(B.page), layoutA, 'B received the account layout');
  assert.ok(await until(B.page, n => document.querySelectorAll('#fx-main > section.tp:not(.tp-empty)').length === n, boxesA.length), 'B shows the same panels');
  assert.deepEqual(await boxesOf(B.page), boxesA, 'same panels in the same order');
  // B's smaller screen adapts the presentation but writes nothing back.
  const writes = server.writes; await B.page.clock.runFor(20000);
  assert.equal(server.writes, writes, 'opening on a smaller screen saves nothing (the big-monitor layout is untouched)');
  // A phone: same panels, phone layout, still no writes.
  const P = await boot({width: 393, height: 852, phone: true, time: await pageNow(B.page) + 5000, account: {server, uid: 'alice'}});
  assert.ok(await synced(P.page)); assert.deepEqual(await boxesOf(P.page), boxesA, 'the phone shows the same panels'); await P.page.clock.runFor(15000);
  assert.equal(server.writes, writes, 'the phone saves nothing either');
  // Refresh B: still the same.
  await B.page.reload(); await B.page.clock.runFor(2000); assert.ok(await synced(B.page)); assert.equal(await layoutOf(B.page), layoutA);
  for (const d of [A, B, P]) { assert.deepEqual(d.errors, []); await d.ctx.close(); }
});

test('account sync: two devices open at once see each other’s changes without reloading, never mid-edit', async () => {
  const server = accountServer();
  const A = await boot({width: 1920, height: 1080, account: {server, uid: 'alice'}});
  assert.ok(await synced(A.page));
  const B = await boot({width: 1440, height: 900, time: await pageNow(A.page) + 2000, account: {server, uid: 'alice'}});
  assert.ok(await synced(B.page));
  const before = (await boxesOf(B.page)).length;
  // A adds every panel.
  await A.page.click('#fx-edit'); await A.page.clock.runFor(300); await A.page.click('#fx-ed-all'); await A.page.clock.runFor(800); await A.page.click('#fx-ed-done');
  const want = (await boxesOf(A.page)).length; assert.ok(want > before);
  // B is in the middle of editing: its screen is not replaced under the user.
  await B.page.click('#fx-edit'); await B.page.clock.runFor(300);
  for (let i = 0; i < 30 && !(await server.settings('alice'))['fx-term-layout-all']; i++) { await A.page.clock.runFor(1000); await new Promise(r => setTimeout(r, 30)); }
  await B.page.evaluate(() => window.FynxSavedSettings.refresh()); await B.page.clock.runFor(2000);
  assert.equal((await boxesOf(B.page)).length, before, 'no change while B is editing');
  await B.page.click('#fx-ed-done');
  assert.ok(await until(B.page, n => document.querySelectorAll('#fx-main > section.tp:not(.tp-empty)').length === n, want), 'B shows A’s layout as soon as editing ends, without a reload');
  // A different desk changed on B reaches A live; A's own current desk choice is not hijacked.
  await command(B.page, 'STOCKS'); await B.page.click('#fx-edit'); await B.page.clock.runFor(300); await B.page.click('#fx-ed-row'); await B.page.clock.runFor(300); await B.page.click('#fx-ed-done');
  const stocksB = await B.page.evaluate(() => localStorage.getItem('fx-term-layout-stocks'));
  assert.ok(await until(A.page, () => window.FynxSavedSettings.refresh().then(() => true)) || true);
  let got = null; for (let i = 0; i < 40 && got !== stocksB; i++) { await B.page.clock.runFor(1000); await A.page.evaluate(() => window.FynxSavedSettings.refresh()); await A.page.clock.runFor(1000); got = await A.page.evaluate(() => localStorage.getItem('fx-term-layout-stocks')); }
  assert.equal(got, stocksB, 'B’s Stocks layout reached A');
  assert.equal(await A.page.$eval('.fx-desk.on', n => n.textContent), 'ALL', 'A stays on the desk its user is looking at');
  for (const d of [A, B]) { assert.deepEqual(d.errors, []); await d.ctx.close(); }
});

test('account sync: offline edits are kept, and an older device never overwrites a newer change', async () => {
  const server = accountServer();
  const A = await boot({width: 1920, height: 1080, account: {server, uid: 'alice'}});
  assert.ok(await synced(A.page));
  // A goes offline and changes a setting.
  server.down = true;
  await A.page.evaluate(() => localStorage.setItem('fx-term-layout-bonds', '["curve","rates"]'));
  await A.page.clock.runFor(4000);
  // Later, B (online) sets the same setting to something newer.
  const B = await boot({width: 1440, height: 900, time: await pageNow(A.page) + 60000, account: {server, uid: 'alice'}});
  server.down = false; assert.ok(await synced(B.page));
  await B.page.evaluate(() => localStorage.setItem('fx-term-layout-bonds', '["gov","curve"]')); await B.page.clock.runFor(2000);
  for (let i = 0; i < 30 && (await server.settings('alice'))['fx-term-layout-bonds']?.v !== '["gov","curve"]'; i++) { await B.page.clock.runFor(1000); await new Promise(r => setTimeout(r, 30)); }
  // A reconnects: its older offline value must not replace B's newer one; A shows B's.
  await A.page.evaluate(() => window.dispatchEvent(new Event('online'))); 
  let a = null; for (let i = 0; i < 40 && a !== '["gov","curve"]'; i++) { await A.page.clock.runFor(1500); await A.page.evaluate(() => window.FynxSavedSettings.refresh()); await new Promise(r => setTimeout(r, 30)); a = await A.page.evaluate(() => localStorage.getItem('fx-term-layout-bonds')); }
  assert.equal(a, '["gov","curve"]', 'A shows the newer value'); assert.equal((await server.settings('alice'))['fx-term-layout-bonds'].v, '["gov","curve"]', 'the account kept the newer value');
  // A newer offline edit does win once it reaches the account.
  server.down = true; await A.page.evaluate(() => localStorage.setItem('fx-term-layout-bonds', '["term"]')); await A.page.clock.runFor(3000); server.down = false;
  let saved = null; for (let i = 0; i < 40 && saved !== '["term"]'; i++) { await A.page.clock.runFor(2000); await A.page.evaluate(() => window.FynxSavedSettings.flush()); await new Promise(r => setTimeout(r, 30)); saved = (await server.settings('alice'))['fx-term-layout-bonds']?.v; }
  assert.equal(saved, '["term"]', 'the offline edit made after B’s reached the account on reconnect');
  for (const d of [A, B]) await d.ctx.close();
});

test('account sync: accounts are private; signing out and in on a shared browser never mixes settings', async () => {
  const server = accountServer();
  const A = await boot({width: 1600, height: 1000, account: {server, uid: 'alice'}});
  assert.ok(await synced(A.page));
  await A.page.evaluate(() => localStorage.setItem('fx-term-layout-all', '["heat","top"]')); await A.page.clock.runFor(2000);
  for (let i = 0; i < 30 && !(await server.settings('alice'))['fx-term-layout-all']; i++) { await A.page.clock.runFor(1000); await new Promise(r => setTimeout(r, 30)); }
  // Bob signs in on the same browser: he does not see or receive Alice's layout.
  await A.page.evaluate(() => sessionStorage.setItem('test-uid', 'bob')); await A.page.reload(); await A.page.clock.runFor(1500);
  assert.ok(await synced(A.page));
  assert.equal(await layoutOf(A.page), null, 'Alice’s layout is not shown to Bob');
  await A.page.clock.runFor(15000);
  assert.deepEqual(Object.keys(await server.settings('bob')).filter(k => k === 'fx-term-layout-all'), [], 'nothing of Alice’s was uploaded into Bob’s account');
  // Bob's page cannot read or write Alice's account: the server binds every call to the signed-in user.
  const spoof = await A.page.evaluate(() => window.__acctCall({action: 'read', expectedUid: 'alice', domains: ['preferences']}));
  assert.equal(spoof.ok, false, 'reading another account is refused');
  // Alice signs back in: her layout comes back from her account.
  await A.page.evaluate(() => sessionStorage.setItem('test-uid', 'alice')); await A.page.reload(); await A.page.clock.runFor(1500);
  assert.ok(await synced(A.page)); assert.equal(await layoutOf(A.page), '["heat","top"]', 'Alice’s layout restored after signing back in');
  // Signed out: the device keeps working locally, nothing is sent.
  const writes = server.writes;
  await A.page.evaluate(() => sessionStorage.setItem('test-uid', '')); await A.page.reload(); await A.page.clock.runFor(3000);
  await A.page.evaluate(() => localStorage.setItem('fx-term-layout-all', '["guest"]')); await A.page.clock.runFor(15000);
  assert.equal(server.writes, writes, 'guests are device-only');
  await A.ctx.close();
});

test('account sync: settings saved before this update are migrated once, and a different older layout is kept as a choice', async () => {
  const server = accountServer();
  // Desktop customised before account saving existed.
  const A = await boot({width: 1920, height: 1080, account: {server, uid: 'alice'}, seed: {'fx-term-layout-all': '["heat","top","eco"]', 'fx-term-market-display': '{"enabled":false}'}});
  assert.ok(await synced(A.page));
  for (let i = 0; i < 30 && !(await server.settings('alice'))['fx-term-layout-all']; i++) { await A.page.clock.runFor(1000); await new Promise(r => setTimeout(r, 30)); }
  assert.equal((await server.settings('alice'))['fx-term-layout-all'].v, '["heat","top","eco"]', 'the existing desktop layout was saved to the account, not replaced by a default');
  assert.equal(await layoutOf(A.page), '["heat","top","eco"]', 'and the desktop still shows it');
  // A laptop with its own older layout: shows the account's, keeps its own as a one-click choice.
  const B = await boot({width: 1440, height: 900, time: await pageNow(A.page) + 5000, account: {server, uid: 'alice'}, seed: {'fx-term-layout-all': '["cb","curve"]'}});
  assert.ok(await synced(B.page));
  assert.equal(await layoutOf(B.page), '["heat","top","eco"]');
  assert.ok(await B.page.$('#fx-syncnote'), 'the laptop is told and offered its own layout');
  await B.page.click('#fx-syncnote .fx-chip-link'); await B.page.clock.runFor(500);
  assert.equal(await layoutOf(B.page), '["cb","curve"]');
  let v = null; for (let i = 0; i < 30 && v !== '["cb","curve"]'; i++) { await B.page.clock.runFor(1000); await new Promise(r => setTimeout(r, 30)); v = (await server.settings('alice'))['fx-term-layout-all']?.v; }
  assert.equal(v, '["cb","curve"]', 'choosing it saves it for every device');
  for (const d of [A, B]) await d.ctx.close();
});

/* ── FOCUS shows the selected market and nothing else in its place ───────────────────────────────────────────── */
// Every box of a FOCUS workspace: its title and text. A box may show context, but never another market as if it were this one.
const focusBoxes = page => page.$$eval('#fx-main > section.tp:not(.tp-empty)', ns => Object.fromEntries(ns.map(n => [n.id.replace('tp-', ''), {title: (n.querySelector('header h2')?.textContent || '').replace(/\s+/g, ' ').trim(), text: (n.querySelector('.tp-b')?.innerText || '').replace(/\s+/g, ' ').trim()}])));

test('FOCUS regression: META, BFLR and ANT never show EUR/USD, Apple’s statements or another company’s options', async () => {
  for (const [sym, via] of [['META', 'command'], ['BFLR', 'command'], ['ANT', 'command'], ['META', 'link'], ['BFLR', 'link'], ['ANT', 'link']]) {
    const {ctx, page, errors} = await boot({width: 1920, height: 1080, url: via === 'link' ? `?desk=stocks&sym=${sym}` : '?desk=stocks'});
    if (via === 'command') { await page.clock.runFor(1500); await command(page, sym); }
    await page.clock.runFor(4000);
    const b = await focusBoxes(page), label = `${sym} via ${via}`;
    assert.equal(await page.$eval('.fx-mode.on', n => n.textContent), 'FOCUS', label);
    assert.match(await page.evaluate(() => location.search), new RegExp('sym=' + sym), label + ': URL names the market');
    assert.ok(Object.keys(b).length >= 20, `${label}: a full workspace (${Object.keys(b).length} boxes)`);
    for (const [id, x] of Object.entries(b)) assert.doesNotMatch(x.title + ' ' + x.text, /EUR\s?\/?\s?USD/, `${label}: ${id} shows EUR/USD`);
    assert.match(b.fin.title, new RegExp('^FA' + sym), `${label}: financials are ${sym}'s`);
    assert.doesNotMatch(b.fin.text, /Apple Inc\.|CIK 320193/, `${label}: never Apple's statements`);
    if (sym === 'META') assert.match(b.fin.text, /Meta Platforms, Inc\. · CIK 1326801/, 'Meta is found under "META, METAM"');
    if (sym === 'BFLR') assert.match(b.fin.text, /BFLR is not in SEC EDGAR's company list/);
    if (sym === 'ANT') assert.match(b.fin.text, /no annual \(10-K\) US-GAAP statements for ANT yet/);
    assert.match(b.opt.title, new RegExp('^OPT' + sym + ' options'), `${label}: options title`);
    assert.doesNotMatch(b.opt.text, /AAPL|SPY/, `${label}: no other underlying's options`);
    assert.equal(await page.$eval('#tp-tools select', n => n.value), sym, `${label}: the position-size tool starts on ${sym}`);
    for (const id of ['committee', 'earnprev']) assert.doesNotMatch(b[id].text + b[id].title, /\b(MSFT|NVDA|AAPL)\b/, `${label}: ${id} reviews ${sym}`);
    assert.equal(await page.title(), `FYNX Terminal · ${sym}`, label + ': page title');
    assert.deepEqual(errors, [], label);
    await ctx.close();
  }
});

test('FOCUS regression: an emerging-market pair and an uncovered coin get honest boxes, never EUR/USD or BTC in their place', async () => {
  {
    const {ctx, page, errors} = await boot({width: 1920, height: 1080, url: '?sym=' + encodeURIComponent('TRY=X')});
    await page.clock.runFor(4000);
    const b = await focusBoxes(page);
    assert.match(b.range.title + b.range.text, /USDTRY daily range.*not one of them/, 'no EUR/USD range for USD/TRY');
    assert.doesNotMatch(b.range.text + b.tools.text, /EURUSD|EUR\/USD/, 'range and calculator never fall back to EUR/USD');
    assert.match(b.bias.title, /pairs sharing USD or TRY \(USDTRY not covered\)/, 'Smart Bias says which pairs it shows and why');
    assert.match(b.mkts.title, /USDTRY and related markets/);
    assert.match(b.mkts.text, /^SYMBOL LAST CHG.{0,3}USDTRY/, 'the focused pair leads the market table');
    assert.deepEqual(errors, []); await ctx.close();
  }
  {
    const {ctx, page, errors} = await boot({width: 1920, height: 1080, url: '?sym=PEPE-USD'});
    await page.clock.runFor(4000);
    const b = await focusBoxes(page);
    for (const id of ['dom', 'oflow']) { assert.match(b[id].text, /PEPE is not one of them/, `${id} says the coin has no live book`); assert.doesNotMatch(b[id].text, /BTC\/USD|ETH\/USD/, `${id} shows no other coin`); }
    assert.deepEqual(errors, []); await ctx.close();
  }
});

test('FOCUS regression: rapid switching and back/forward never leave another market on screen', async () => {
  const {ctx, page, errors} = await boot({width: 1920, height: 1080, url: '?desk=stocks'});
  await page.clock.runFor(1500);
  for (const s of ['META', 'BFLR', 'EURUSD', 'ANT', 'BTC', 'META']) { await page.fill('#fx-command', s); await page.press('#fx-command', 'Enter'); await page.clock.runFor(120); }
  await page.clock.runFor(5000);
  let b = await focusBoxes(page);
  assert.match(await page.evaluate(() => location.search), /sym=META/);
  for (const id of ['focus', 'squote', 'fin', 'opt', 'snews', 'story', 'vstat']) assert.match(b[id].title + ' ' + b[id].text, /META|Meta/, `${id} shows META after rapid switching (stale responses discarded): ${b[id].title}`);
  for (const [id, x] of Object.entries(b)) assert.doesNotMatch(x.title, /\b(BFLR|ANT|EURUSD|BTC)\b/, `${id} kept an earlier market: ${x.title}`);
  // Back to ALL restores the saved desk layout; the browser's Back returns to META.
  await command(page, 'ALL'); await page.clock.runFor(1500);
  assert.equal(await page.$eval('.fx-mode.on', n => n.textContent), 'ALL');
  assert.doesNotMatch(await page.evaluate(() => location.search), /sym=/);
  await page.reload(); await page.clock.runFor(2500);
  assert.equal(await page.$eval('.fx-mode.on', n => n.textContent), 'ALL', 'refresh keeps ALL');
  await page.goto(page.url().replace(/\?.*$/, '') + '?sym=ANT'); await page.clock.runFor(4000);
  b = await focusBoxes(page); assert.match(b.focus.title, /ANT/); assert.match(b.fin.title, /^FAANT/);
  assert.deepEqual(errors, []); await ctx.close();
});

test('FOCUS: an old saved FOCUS layout with only a few boxes does not leave the workspace empty (and is kept)', async () => {
  const {ctx, page, errors} = await boot({width: 1920, height: 1080, seed: {'fx-term-layout-sym-stock': JSON.stringify(['range', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null])}, url: '?sym=META'});
  await page.clock.runFor(4000);
  const b = await focusBoxes(page);
  assert.ok(Object.keys(b).length >= 20, `full workspace (${Object.keys(b).length} boxes), not one chart`);
  assert.equal(await page.evaluate(() => localStorage.getItem('fx-term-layout-sym-stock')), JSON.stringify(['range', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]), 'the saved layout is not deleted');
  assert.deepEqual(errors, []); await ctx.close();
});
