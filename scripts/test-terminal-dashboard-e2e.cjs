'use strict';
/* DASHBOARD desk, US market status, Market overview, heat map and Industries — unit checks for the equities
 * publisher and the NYSE calendar, then the real Terminal scripts in Chromium with fixture data (equities.json,
 * scanner.json, markets.json and extended-hours bars). No request leaves the machine.
 * Screenshots go to $FYNX_SHOTS when set. Run: node --test scripts/test-terminal-dashboard-e2e.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('./refresh-equities.cjs');

const root = path.resolve(__dirname, '..');
let chromium;
try { ({chromium} = require('playwright')); } catch { ({chromium} = require('playwright-core')); }
const executablePath = process.env.FYNX_CHROMIUM_PATH || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(p => fs.existsSync(p));
const ORIGIN = 'https://www.fynxfinanceworld.com';
const TYPES = {'.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html'};
const NOW = Date.parse('2026-11-25T21:30:00Z'); // Wed 4:30 PM ET: after hours
const SHOTS = process.env.FYNX_SHOTS;

/* ---------- publisher parsing ---------- */
test('S&P 500 table: symbols (share classes as Yahoo dashes), GICS sector, sub-industry and article link', () => {
  const row = (sym, name, art, sec, ind) => `<tr><td><a href="https://www.nyse.com/quote/XNYS:${sym}">${sym}</a></td><td><a href="https://en.wikipedia.org/wiki/${art}">${name}</a></td><td>${sec}</td><td>${ind}</td><td>X</td></tr>`;
  const rows = Array.from({length: 498}, (_, i) => row('S' + i, 'Co ' + i, 'Co_' + i, 'Industrials', 'Machinery')).join('');
  const html = `<table id="constituents"><tr><th>Symbol</th><th>Security</th><th>GICS Sector</th><th>GICS Sub-Industry</th><th>HQ</th></tr>${row('BRK.B', 'Berkshire Hathaway', 'Berkshire_Hathaway', 'Financials', 'Multi-Sector Holdings')}${row('GOOG', 'Alphabet Inc. (Class C)', 'Alphabet_Inc.', 'Communication Services', 'Interactive Media &amp; Services')}${row('GOOGL', 'Alphabet Inc. (Class A)', 'Alphabet_Inc.', 'Communication Services', 'Interactive Media &amp; Services')}${row('AAPL', 'Apple Inc.', 'Apple_Inc.', 'Information Technology', 'Technology Hardware')}${rows}</table>`;
  const sp = E.parseSP500(html);
  assert.equal(sp.length, 502);
  assert.deepEqual(sp[0], {symbol: 'BRK-B', name: 'Berkshire Hathaway', sector: 'Financials', industry: 'Multi-Sector Holdings', article: 'Berkshire_Hathaway'});
  assert.equal(sp[1].industry, 'Interactive Media & Services');
  assert.throws(() => E.parseSP500('<table id="constituents"><tr><th>Symbol</th></tr></table>'), /rows|not found/);
  // Dow: the DJIA page's member box of company links, matched to S&P 500 rows (Class A preferred).
  const list = [...sp.slice(0, 4), ...Array.from({length: 26}, (_, i) => ({symbol: 'D' + i, name: 'Dow ' + i, article: 'Dow_' + i}))];
  const box = `<table><tr><td>${['Berkshire_Hathaway', 'Alphabet_Inc.', 'Apple_Inc.', ...Array.from({length: 26}, (_, i) => 'Dow_' + i), 'Some_Non_Member'].map(a => `<a href="/wiki/${a}">x</a>`).join(' ')}</td></tr></table>`;
  assert.throws(() => E.parseDow(box, list), /not found/, '29 members is not a Dow list');
  const box30 = box.replace('Some_Non_Member', 'Dow_25_extra').replace('</td>', '<a href="/wiki/Microsoft">x</a></td>');
  const list30 = [...list, {symbol: 'MSFT', name: 'Microsoft', article: 'Microsoft'}];
  const dow = E.parseDow(box30, list30);
  assert.equal(dow.length, 30); assert.ok(dow.some(m => m.symbol === 'GOOGL') && !dow.some(m => m.symbol === 'GOOG'));
  assert.equal(E.DOW_FALLBACK.length, 30);
});

test('Nasdaq-100 list and Yahoo spark summaries', () => {
  const rows = Array.from({length: 101}, (_, i) => ({symbol: i ? 'N' + i : 'BRK/B', companyName: 'Name ' + i + ' Common Stock', marketCap: '1,000,000'}));
  const ndx = E.parseNdx({data: {data: {rows}}});
  assert.equal(ndx.length, 101); assert.equal(ndx[0].symbol, 'BRK-B'); assert.equal(ndx[1].name, 'Name 1'); assert.equal(ndx[1].marketCap, 1e6);
  const day = 86400000, start = Date.UTC(2025, 10, 24), pts = []; let p = 100;
  for (let t = start; t <= Date.UTC(2026, 10, 25); t += day) { const w = new Date(t).getUTCDay(); if (w && w < 6) pts.push([t, p += 0.1]); }
  const s = E.summarize(pts, Date.UTC(2026, 10, 25, 20));
  assert.equal(s.d.length, 23); assert.equal(s.w.length, 53); assert.equal(s.p, Number(pts.at(-1)[1].toPrecision(6)));
  assert.ok(Math.abs(s.c - (pts.at(-1)[1] / pts.at(-2)[1] - 1) * 100) < 1e-3);
  assert.ok(s.y0 > 100 && s.y0 < s.p, 'last close of 2025');
  assert.equal(E.summarize(pts.slice(0, 10), Date.now()), null, 'too little history is left out');
  assert.deepEqual(E.sparkSeries({timestamp: [1, 2], close: [5, null]}).points, [[1000, 5]]);
  assert.deepEqual(E.sparkSeries({response: [{timestamp: [3], indicators: {quote: [{close: [7]}]}}]}).points, [[3000, 7]]);
});

/* ---------- fixtures for the live Terminal ---------- */
const SECTORS = ['Information Technology', 'Financials', 'Health Care', 'Consumer Discretionary', 'Communication Services', 'Industrials', 'Consumer Staples', 'Energy', 'Utilities', 'Materials', 'Real Estate'];
const STOCKS = [['AAPL', 'Apple Inc.', 0, 'Technology Hardware', 4.1e12, 0.43], ['MSFT', 'Microsoft', 0, 'Systems Software', 3.6e12, -1.25], ['NVDA', 'Nvidia', 0, 'Semiconductors', 3.6e12, -3.91], ['AVGO', 'Broadcom', 0, 'Semiconductors', 1.4e12, -0.07],
  ['JPM', 'JPMorgan Chase', 1, 'Diversified Banks', 0.86e12, -0.11], ['BRK-B', 'Berkshire Hathaway', 1, 'Multi-Sector Holdings', 1.0e12, 0.37], ['V', 'Visa Inc.', 1, 'Transaction & Payment Processing', 0.8e12, 1.83],
  ['LLY', 'Eli Lilly', 2, 'Pharmaceuticals', 1.3e12, -1.09], ['JNJ', 'Johnson & Johnson', 2, 'Pharmaceuticals', 0.66e12, -0.91], ['AMZN', 'Amazon', 3, 'Broadline Retail', 2.6e12, -3.12], ['TSLA', 'Tesla, Inc.', 3, 'Automobile Manufacturers', 1.2e12, -1.18],
  ['GOOGL', 'Alphabet Inc. (Class A)', 4, 'Interactive Media & Services', 3.3e12, -2.13], ['META', 'Meta Platforms', 4, 'Interactive Media & Services', 1.5e12, 3.4], ['CAT', 'Caterpillar Inc.', 5, 'Construction Machinery', 0.26e12, 0.57], ['GE', 'GE Aerospace', 5, 'Aerospace & Defense', 0.33e12, -0.33],
  ['WMT', 'Walmart', 6, 'Consumer Staples Merchandise Retail', 1.05e12, -0.28], ['PG', 'Procter & Gamble', 6, 'Household Products', 0.4e12, 0.44], ['XOM', 'ExxonMobil', 7, 'Integrated Oil & Gas', 0.66e12, -0.04], ['NEE', 'NextEra Energy', 8, 'Electric Utilities', 0.17e12, 0.98], ['LIN', 'Linde plc', 9, 'Industrial Gases', 0.24e12, 1.51], ['PLD', 'Prologis', 10, 'Industrial REITs', 0.12e12, -0.19]];
function closesFor(i, chg) {
  const d = Array.from({length: 23}, (_, k) => 100 + i + Math.sin(k / 3 + i) * 3 + k * 0.2), w = Array.from({length: 53}, (_, k) => 80 + i + k * 0.4 + Math.cos(k / 4) * 4);
  d[22] = d[21] * (1 + chg / 100); w[52] = d[22];
  return {p: Number(d[22].toFixed(2)), c: chg, t: '2026-11-25', d: d.map(v => Number(v.toFixed(2))), w: w.map(v => Number(v.toFixed(2))), y0: 90 + i};
}
function equities() {
  const info = {}, closes = {};
  STOCKS.forEach(([s, n, sec, ind], i) => { info[s] = {n, sec: SECTORS[sec], ind}; closes[s] = closesFor(i, STOCKS[i][5]); });
  const dates = Array.from({length: 785}, (_, k) => new Date(Date.UTC(2011, 10, 21) + k * 7 * 86400000).toISOString().slice(0, 10));
  return {version: 1, generatedAt: new Date(NOW).toISOString(), membersAt: new Date(NOW).toISOString(), sources: {sp500: 'Wikipedia (fixture)', ndx: 'Nasdaq (fixture)', dow: 'Wikipedia (fixture)'},
    indices: {sp500: STOCKS.map(s => s[0]), ndx: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO'], dow: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'JPM', 'V', 'CAT', 'WMT', 'PG', 'JNJ']}, info, closes,
    macro: {dates, spx: dates.map((_, k) => 1200 + k * 7.6 + Math.sin(k / 9) * 80), tnx: dates.map((_, k) => 2 + Math.sin(k / 60) * 1.2 + k / 400), dxy: dates.map((_, k) => 80 + Math.cos(k / 70) * 8 + k / 60), source: 'fixture'}};
}
function scanner() {
  const rows = STOCKS.filter(s => s[0] !== 'BRK-B').map(([s, n, sec, ind, capv, chg], i) => [s, n, closesFor(i, chg).p, chg, 1e7 + i * 1e6, capv, 'Technology', ind, 'United States', null, []]);
  rows.push(['ZZZP', 'Penny Rocket Corp', 0.5, 80, 5e8, 1e7, 'Technology', 'x', 'United States', null, []], ['UPUP', 'Up Up Inc.', 12.5, 25.5, 4e6, 2e9, 'Industrials', 'x', 'United States', null, []], ['DOWN', 'Down Co', 8.2, -18.2, 3e6, 1e9, 'Industrials', 'x', 'United States', null, []], ['TSM', 'Taiwan Semiconductor', 342.34, 0, 2e7, 1.78e12, 'Technology', 'Semis', 'Taiwan', null, []]);
  return {version: 1, generatedAt: new Date(NOW).toISOString(), stocks: {fields: ['symbol', 'name', 'price', 'changePct', 'volume', 'marketCap', 'sector', 'industry', 'country', 'ipoYear', 'themes'], rows}, etfs: {rows: []}, crypto: {rows: []}};
}
function markets() {
  const quotes = {}, hist = (base, drift) => Array.from({length: 251}, (_, k) => [new Date(Date.UTC(2025, 10, 26) + k * 86400000 * 1.45).toISOString().slice(0, 10), Number((base * (1 + drift * k + Math.sin(k / 10) * 0.02)).toFixed(2))]);
  const add = (sym, name, group, price, chg) => { quotes[sym] = {symbol: sym, name, group, price, changePercent: chg, asOf: new Date(NOW).toISOString(), history: hist(price * 0.8, 0.001), vol20: 1}; };
  [['SPY', 716.6, -0.32], ['QQQ', 633.97, -0.66], ['IWM', 268.77, 0.58], ['DIA', 501.22, 0.28]].forEach(([s, p, c]) => add(s, s, 'Equity funds', p, c));
  [['XLK', -0.81], ['XLF', 0.71], ['XLV', -0.56], ['XLY', -0.2], ['XLC', 0.89], ['XLI', 0.83], ['XLP', 0.46], ['XLE', 0.74], ['XLU', 0.3], ['XLB', 2.07], ['XLRE', -0.1]].forEach(([s, c]) => add(s, s, 'Sector funds', 100, c));
  [['^GSPC', 'S&P 500', 7182.78, -0.25], ['^DJI', 'Dow Jones', 50182.95, 0.33], ['^IXIC', 'Nasdaq', 23585.8, -0.62], ['^NDX', 'Nasdaq 100', 26046.9, -0.64], ['^RUT', 'Russell 2000', 2704.06, 0.71]].forEach(([s, n, p, c]) => add(s, n, 'Americas', p, c));
  [['ES=F', 'E-mini S&P 500', 7237.75, 0.58], ['NQ=F', 'E-mini Nasdaq 100', 26249.25, 0.57]].forEach(([s, n, p, c]) => add(s, n, 'Equity futures', p, c));
  [['ZN=F', '10-Year T-Note', 107.08, -0.17]].forEach(([s, n, p, c]) => add(s, n, 'Rate futures', p, c));
  [['^FTSE', 'FTSE 100', 10613.04, 1.78], ['^GDAXI', 'DAX', 25232.93, 2.15], ['^N225', 'Nikkei 225', 57499.16, 0.86]].forEach(([s, n, p, c]) => add(s, n, 'Europe', p, c));
  [['^VIX', 'VIX', 26.8, -5.27], ['^MOVE', 'MOVE', 97.54, -0.01]].forEach(([s, n, p, c]) => add(s, n, 'Volatility', p, c));
  add('DX-Y.NYB', 'US Dollar Index', 'Dollar', 103.74, 0.07);
  return {version: 1, generatedAt: new Date(NOW).toISOString(), source: 'fixture', quotes};
}
function extBars(sym, prev, close, after) {
  const day = Date.UTC(2026, 10, 25), pre = day / 1000 + 9 * 3600, reg0 = day / 1000 + 14.5 * 3600, reg1 = day / 1000 + 21 * 3600, post1 = day / 1000 + 25 * 3600;
  const t = [], c = []; for (let x = pre; x <= day / 1000 + 21.5 * 3600; x += 300) { t.push(x); const k = (x - pre) / (reg1 - pre); c.push(Number((prev * (1 + Math.sin(k * 9) * 0.004) + (close - prev) * Math.min(1, k)).toFixed(2))); }
  c[c.length - 1] = after;
  return {symbol: sym, interval: '5m', previousClose: prev, regularPrice: close, sessions: {pre: {start: pre, end: reg0}, regular: {start: reg0, end: reg1}, post: {start: reg1, end: post1}}, t, c, o: c, h: c, l: c, v: c.map(() => 0)};
}
const BARS = {SPY: extBars('SPY', 718.9, 716.6, 720.43), QQQ: extBars('QQQ', 638.2, 633.97, 636.62), IWM: extBars('IWM', 267.21, 268.77, 270.31), DIA: extBars('DIA', 499.82, 501.22, 503.98)};

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
async function boot({time = NOW, width = 1600, height = 1100} = {}) {
  const ctx = await browser.newContext({viewport: {width, height}}), page = await ctx.newPage();
  await page.clock.install({time: new Date(time)});
  const json = (route, body) => route.fulfill({contentType: 'application/json', body: JSON.stringify(body)});
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN && url.pathname === '/fn/market.js') {
      const op = url.searchParams.get('op'), sym = url.searchParams.get('symbol');
      if (op === 'bars' && BARS[sym]) return json(route, BARS[sym]);
      if (op === 'closes') { const dates = Array.from({length: 1250}, (_, k) => new Date(Date.UTC(2021, 10, 26) + k * 86400000 * 1.46).toISOString().slice(0, 10)); return json(route, {dates, series: Object.fromEntries(['SPY', 'QQQ', 'DIA', 'IWM'].map((s, i) => [s, dates.map((_, k) => 100 * (1 + k * (0.0004 + i * 0.0001)))]))}); }
      return json(route, {});
    }
    if (url.origin === ORIGIN) {
      if (url.pathname === '/terminal.html') return route.fulfill({contentType: 'text/html', body: harness()});
      const file = path.join(root, decodeURIComponent(url.pathname));
      if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)});
      return route.fulfill({status: 404, body: ''});
    }
    if (url.pathname.endsWith('/terminal-data/equities.json')) return json(route, equities());
    if (url.pathname.endsWith('/terminal-data/scanner.json')) return json(route, scanner());
    if (url.pathname.endsWith('/terminal-data/markets.json')) return json(route, markets());
    return route.fulfill({status: 404, contentType: 'application/json', body: '{}'});
  });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(ORIGIN + '/terminal.html');
  await page.clock.runFor(2000);
  await page.waitForFunction(() => document.querySelector('#fx-main')?.getAttribute('aria-busy') === 'false', null, {timeout: 20000});
  return {ctx, page, errors};
}
const command = async (page, text) => { await page.fill('#fx-command', text); await page.press('#fx-command', 'Enter'); await page.clock.runFor(600); };
const shot = (page, name) => SHOTS ? page.screenshot({path: path.join(SHOTS, name)}) : null;

test('US market status follows NYSE hours, holidays and early closes', async () => {
  const {ctx, page} = await boot();
  const at = iso => page.evaluate(t => window.FynxMarketStatus.status(Date.parse(t)), iso);
  assert.deepEqual(await at('2026-11-26T17:37:00Z').then(s => [s.state, s.text]), ['closed', 'Thanksgiving Day · Opens in 20h 53m'], 'Thanksgiving 12:37 ET (as on QFI)');
  assert.match((await at('2026-11-27T15:00:00Z')).text, /Closes in 3h 0m · early close 1:00 PM ET/, 'Black Friday early close');
  assert.equal((await at('2026-11-25T13:00:00Z')).state, 'pre');
  assert.equal((await at('2026-11-25T21:30:00Z')).state, 'post');
  assert.equal((await at('2026-11-28T15:00:00Z')).text, 'Opens in 47h 30m', 'Saturday 10 AM ET: Monday open');
  const cal = await page.evaluate(() => [...window.FynxMarketStatus.nyse(2027).closed.keys()]);
  assert.deepEqual(cal, ['2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']);
  assert.match(await page.textContent('#fx-mstat'), /US MARKET AFTER HOURS/);
  await ctx.close();
});

test('DASHBOARD desk: index cards with after hours, performance chart, sectors, US & global markets, movers, rates & dollar', async () => {
  const {ctx, page, errors} = await boot();
  await page.click('#fx-deskbar-list >> text=DASHBOARD');
  await page.clock.runFor(1500);
  await page.waitForSelector('.fx-idxcard');
  await page.waitForSelector('.fx-tmtile'); await page.waitForSelector('#b-ixm .fx-drow b');
  const card = await page.textContent('.fx-idxcard');
  assert.match(card, /S&P 500SPY/); assert.match(card, /Market close\$716\.60−0\.32%/); assert.match(card, /After hours\$720\.43\+0\.53%/);
  assert.equal(await page.$$eval('.fx-nperf polyline', p => p.length), 4);
  assert.match(await page.textContent('.fx-nperf'), /OPEN.*CLOSE/);
  assert.equal(await page.$$eval('.fx-tmtile', t => t.length), 11);
  assert.match(await page.textContent('#b-dsect'), /TECHNOLOGY.*XLK −0\.81%/);
  assert.match(await page.textContent('#b-usm'), /S&P 500.*7,182\.78.*E-mini S&P 500/);
  assert.match(await page.textContent('#b-glob'), /FTSE 100.*VIX/);
  const big = await page.$$eval('#b-big .fx-drow b', b => b.map(x => x.textContent)); assert.deepEqual(big.slice(0, 4), ['AAPL', 'MSFT', 'NVDA', 'GOOGL']);
  const ixm = await page.$$eval('#b-ixm .fx-ixm > div:first-child .fx-drow b', b => b.map(x => x.textContent)); assert.equal(ixm[0], 'META', 'top S&P 500 gainer');
  const gl = await page.$$eval('#b-glam .fx-drow b', b => b.map(x => x.textContent)); assert.equal(gl[0], 'UPUP'); assert.ok(!gl.includes('ZZZP'), 'sub-$1 prints are filtered out');
  assert.match(await page.textContent('#b-ratesdx'), /LAST PRICE.*S&P 500.*US 10Y.*DXY/);
  await page.click('#nperf-tabs >> text=1Y'); await page.clock.runFor(500);
  assert.equal(await page.$$eval('.fx-nperf polyline', p => p.length), 4);
  await page.click('#nperf-tabs >> text=TODAY'); await page.clock.runFor(500);
  await shot(page, 'dashboard.png');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('OVERVIEW: index cards with sparklines, filters, sort, periods, favourites', async () => {
  const {ctx, page, errors} = await boot();
  await command(page, 'OVERVIEW');
  await page.waitForSelector('.ov-card');
  assert.equal(await page.$$eval('.ov-card', c => c.length), 21);
  assert.equal(await page.$$eval('.ov-sec', h => h.length), 11, 'grouped by sector');
  await page.click('.ov-bar >> text=FLAT'); await page.clock.runFor(100);
  assert.equal(await page.$eval('.ov-card b', b => b.textContent), 'AAPL', 'largest first');
  await page.click('.ov-bar >> text=CHANGE'); await page.clock.runFor(100);
  assert.equal(await page.$eval('.ov-card b', b => b.textContent), 'META');
  await page.click('.ov-bar >> text=DOW 30'); await page.clock.runFor(100);
  assert.equal(await page.$$eval('.ov-card', c => c.length), 10);
  await page.selectOption('.ov-sel[aria-label=Sector]', 'Information Technology'); await page.clock.runFor(100);
  assert.deepEqual(await page.$$eval('.ov-card b', b => b.map(x => x.textContent).sort()), ['AAPL', 'MSFT', 'NVDA']);
  await page.click('.ov-card >> nth=0'); await page.clock.runFor(100);
  await page.click('.ov-bar >> text=/FAVORITES/'); await page.clock.runFor(100);
  assert.equal(await page.$$eval('.ov-card', c => c.length), 1);
  await page.click('.ov-bar >> text=S&P 500'); await page.clock.runFor(100);
  await page.click('.ov-bar >> text=1Y'); await page.clock.runFor(100);
  assert.ok(await page.$$eval('.ov-card polyline', p => p.length) >= 21);
  await shot(page, 'overview.png');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('HMAP heat map by sector and industry with periods; INDUSTRIES table', async () => {
  const {ctx, page, errors} = await boot();
  await command(page, 'HMAP');
  await page.waitForSelector('.xm-tile');
  assert.equal(await page.$$eval('.xm-tile', t => t.length), 20, 'S&P members with a market value (BRK-B has none in this fixture)');
  assert.equal(await page.$$eval('.xm-sec', t => t.length), 11);
  assert.match(await page.textContent('.xm-box'), /INFORMATION TECHNOLOGY/);
  const nvda = await page.$eval('.xm-tile[aria-label^="NVDA"]', t => getComputedStyle(t).backgroundColor); assert.match(nvda, /rgb\(2\d\d, 5\d, 5\d\)/, 'NVDA −3.9% is red');
  await page.click('.ov-bar >> text=YTD'); await page.clock.runFor(200);
  assert.ok(await page.$('.xm-tile'));
  await page.click('.ov-bar >> text=TODAY'); await page.clock.runFor(200);
  await shot(page, 'heatmap.png');
  await command(page, 'INDUSTRIES');
  await page.waitForSelector('.ind-table');
  const first = await page.$$eval('.ind-table tr', r => r.slice(1).map(x => x.querySelector('th').textContent));
  assert.ok(first.length >= 17 && first[0] === 'Transaction & Payment Processing' && first.at(-1) === 'Broadline Retail', 'sorted by market-value-weighted change today: ' + first.slice(0, 3));
  await page.click('.ind-table >> text=/^1Y/'); await page.clock.runFor(100);
  await page.click('.ind-table tr.pg-click >> nth=0'); await page.clock.runFor(500);
  await page.waitForSelector('.ov-card');
  assert.deepEqual(errors, []);
  await ctx.close();
});
