'use strict';
/* End to end in Chromium, on the real Terminal scripts (sign-in gate and ads removed), with no request leaving the
 * machine:
 *  - OPTIONS: the pro chain built from a Cboe-format payload run through the real pipeline (summarizeOptions):
 *    underlying bid/ask × size, every expiry as a collapsible group with ATM IV and Monthly/Weekly, Greeks columns,
 *    ±5 / ±10 / All strikes, row details with gamma/theta/vega.
 *  - DOM: the depth-of-market ladder fed by a mocked Kraken WebSocket (book snapshot + updates).
 *  - PORT: portfolio drawdown (per-holding P/L on one deposit, total, underwater) from fixture daily closes.
 * Screenshots go to $FYNX_SHOTS when set. Run: node --test scripts/test-terminal-pro-tools-e2e.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {summarizeOptions} = require('./refresh-terminal-markets.cjs');

const root = path.resolve(__dirname, '..');
let chromium;
try { ({chromium} = require('playwright')); } catch { ({chromium} = require('playwright-core')); }
const executablePath = process.env.FYNX_CHROMIUM_PATH || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(p => fs.existsSync(p));
const ORIGIN = 'https://www.fynxfinanceworld.com';
const TYPES = {'.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html'};
const NOW = Date.parse('2026-11-25T16:00:00Z');
const SHOTS = process.env.FYNX_SHOTS;

function harness() {
  return fs.readFileSync(path.join(root, 'terminal.html'), 'utf8')
    .replace(/<!-- terminal-gate:start -->[\s\S]*?<!-- terminal-gate:end -->/, '')
    .replace(/<!-- FYNX ADSENSE VERIFICATION START -->[\s\S]*?<!-- FYNX ADSENSE VERIFICATION END -->/, '')
    .replace(/<script type="module"[^>]*><\/script>/g, '')
    .replace(/<link[^>]+fonts\.(googleapis|gstatic)[^>]*>/g, '');
}

// A Cboe delayed-quotes payload in the published format (fields verified against cdn.cboe.com on 2026-11-26).
function cboePayload() {
  const spot = 700, options = [];
  const occ = (date, type, k) => `SPY${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}${type}${String(Math.round(k * 1000)).padStart(8, '0')}`;
  for (const [date, t] of [['2026-11-27', 2 / 365], ['2026-12-18', 23 / 365], ['2027-01-15', 51 / 365]]) {
    for (let k = 680; k <= 720; k++) for (const type of ['C', 'P']) {
      const m = (spot - k) / (spot * 0.2 * Math.sqrt(t)), nd = 1 / (1 + Math.exp(-1.7 * m)), delta = type === 'C' ? nd : nd - 1;
      const intrinsic = Math.max(0, type === 'C' ? spot - k : k - spot), tv = 6 * Math.sqrt(t * 52) * Math.exp(-((spot - k) ** 2) / 800);
      const px = Math.round((intrinsic + tv) * 100) / 100;
      options.push({option: occ(date, type, k), bid: Math.max(0.01, px - 0.05), bid_size: 50, ask: px + 0.05, ask_size: 75, iv: 0.18 + Math.abs(spot - k) / 2000 + (type === 'P' ? 0.01 : 0), open_interest: 1000 + k, volume: 100 + (k % 7) * 50,
        delta: Math.round(delta * 1e4) / 1e4, gamma: 0.0123, vega: 0.25, theta: -0.0782, rho: 0.01, theo: px, change: type === 'C' ? -1.25 : 0.75, open: px, high: px, low: px, tick: 'down', last_trade_price: px, last_trade_time: '2026-11-25T15:59:00', percent_change: -2, prev_day_close: px + 1});
    }
  }
  return {timestamp: '2026-11-25 15:45:00', data: {symbol: 'SPY', current_price: spot, price_change: -5.1, price_change_percent: -0.72, bid: 699.98, ask: 700.02, bid_size: 200, ask_size: 300, iv30: 14.2, iv30_change: 0.3, prev_day_close: 705.1, options}};
}
function optionsJson() {
  const u = summarizeOptions('SPY', cboePayload(), NOW);
  return {version: 1, generatedAt: new Date(NOW).toISOString(), source: 'Cboe delayed option quotes (15-minute delay)', underlyings: {SPY: {...u, status: 'fresh'}}};
}
function chartRows(symbol, drift) {
  const rows = []; let p = 100; const start = Date.UTC(2024, 10, 1);
  for (let i = 0, d = start; d < NOW; d += 86400000) { const day = new Date(d).getUTCDay(); if (day === 0 || day === 6) continue; i++; p *= 1 + drift + 0.012 * Math.sin(i / 7 + symbol.length); rows.push({date: new Date(d).toISOString().slice(0, 10), open: p, high: p, low: p, close: Math.round(p * 100) / 100}); }
  return {symbol, name: symbol + ' Inc', currency: 'USD', price: rows.at(-1).close, changePercent: 0.4, previousClose: rows.at(-2).close, asOf: new Date(NOW).toISOString(), rows};
}

let browser;
test.before(async () => { browser = await chromium.launch({executablePath, args: ['--no-sandbox']}); });
test.after(async () => { await browser?.close(); });

async function boot({storage = {}, kraken} = {}) {
  const ctx = await browser.newContext({viewport: {width: 1500, height: 1000}}), page = await ctx.newPage();
  await page.clock.install({time: new Date(NOW)});
  await page.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  if (kraken) await page.routeWebSocket('wss://ws.kraken.com/v2', kraken);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN && url.pathname === '/fn/market.js') {
      const sym = url.searchParams.get('symbol');
      return route.fulfill({contentType: 'application/json', body: JSON.stringify(url.searchParams.get('op') === 'chart' && sym ? chartRows(sym, sym === 'SPY' ? 0.0004 : sym === 'AAA' ? 0.001 : -0.0002) : {})});
    }
    if (url.origin === ORIGIN) {
      if (url.pathname === '/terminal.html') return route.fulfill({contentType: 'text/html', body: harness()});
      const file = path.join(root, decodeURIComponent(url.pathname));
      if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)});
      return route.fulfill({status: 404, body: ''});
    }
    if (url.pathname.endsWith('/terminal-data/options.json')) return route.fulfill({contentType: 'application/json', body: JSON.stringify(optionsJson())});
    return route.fulfill({status: 404, contentType: 'application/json', body: '{}'});
  });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(ORIGIN + '/terminal.html');
  await page.clock.runFor(2000);
  await page.waitForFunction(() => document.querySelector('#fx-main')?.getAttribute('aria-busy') === 'false', null, {timeout: 20000});
  return {ctx, page, errors};
}
const command = async (page, text) => { await page.fill('#fx-command', text); await page.press('#fx-command', 'Enter'); await page.clock.runFor(500); };
const shot = (page, name) => SHOTS ? page.screenshot({path: path.join(SHOTS, name), fullPage: false}) : null;

test('pipeline keeps Cboe Greeks, day change, sizes and the underlying bid/ask', () => {
  const u = optionsJson().underlyings.SPY, row = u.expiries[0].chain.find(r => r.strike === u.expiries[0].atmStrike);
  assert.deepEqual([u.bid, u.ask, u.bidSize, u.askSize], [699.98, 700.02, 200, 300]);
  for (const k of ['delta', 'gamma', 'theta', 'vega', 'change', 'bidSize', 'askSize']) assert.ok(Number.isFinite(row.call[k]), k);
  assert.equal(row.call.gamma, 0.0123); assert.equal(row.call.theta, -0.0782); assert.equal(row.put.change, 0.75);
  assert.ok(Number.isFinite(u.mostActive[0].gamma));
});

test('OPTIONS: pro chain with Greeks, collapsible expiries with ATM IV, ±strikes, row details', async () => {
  const {ctx, page, errors} = await boot();
  await command(page, 'OPT SPY');
  await page.waitForSelector('.oc-table');
  const head = await page.textContent('.oc-head');
  assert.match(head, /SPY/); assert.match(head, /Bid 699\.98 ×200/); assert.match(head, /Ask 700\.02 ×300/); assert.match(head, /Cboe 15-min delayed/);
  const cols = await page.$$eval('.oc-h2 th', t => t.map(x => x.textContent));
  assert.deepEqual(cols.slice(0, 11), ['Delta', 'Gamma', 'Theta', 'IV%', 'Volume', 'Open Int', 'Bid', 'Ask', 'Last', 'Chng', 'Strike']);
  const groups = await page.$$eval('.oc-exp', r => r.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  assert.equal(groups.length, 3);
  assert.match(groups[0], /NOV 27 '26 \(2d\)\s*100 Weekly\s*ATM IV: \d+\.\d%/); assert.match(groups[1], /DEC 18 '26 .*100 Monthly/);
  assert.equal(await page.$$eval('.oc-group.open .oc-row', r => r.length), 11, '±5 strikes around the money');
  assert.equal(await page.$$eval('.oc-group.open .oc-row.atm', r => r.length), 1);
  const atm = await page.$$eval('.oc-group.open .oc-row.atm td', t => t.map(x => x.textContent));
  assert.equal(atm[1], '.0123'); assert.equal(atm[2], '-.0782'); assert.equal(atm[9], '−1.25');
  await shot(page, 'options-chain.png');
  await page.click('.oc-sel >> text=All'); await page.clock.runFor(100);
  assert.equal(await page.$$eval('.oc-group.open .oc-row', r => r.length), 21);
  await page.click(".oc-exp >> text=DEC 18 '26"); await page.clock.runFor(100);
  assert.equal(await page.$$eval('.oc-group.open', g => g.length), 2, 'second expiry expanded too');
  await page.click('.oc-sel >> text=Quotes'); await page.clock.runFor(100);
  assert.ok(!(await page.$$eval('.oc-h2 th', t => t.map(x => x.textContent))).includes('Gamma'), 'quote-only layout');
  await page.click('.oc-group.open .oc-row.atm'); await page.clock.runFor(100);
  const detail = await page.textContent('#fx-inspect-body');
  assert.match(detail, /Gamma\.0123/); assert.match(detail, /Vega\.2500/); assert.match(detail, /Bid × size.*× 50/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('DOM: live ladder from the Kraken book, best bid/ask highlighted, inside market flashes on a tick', async () => {
  let ws;
  const kraken = s => { ws = s; s.onMessage(m => { const d = JSON.parse(m); if (d.method === 'subscribe' && d.params.channel === 'book') {
    const bids = [], asks = [];
    for (let i = 0; i < 40; i++) { bids.push({price: 90000 - i, qty: 0.5 + (i % 5) * 0.4}); asks.push({price: 90001 + i, qty: 0.4 + (i % 4) * 0.5}); }
    s.send(JSON.stringify({channel: 'book', type: 'snapshot', data: [{symbol: 'BTC/USD', bids, asks}]}));
  } }); };
  const {ctx, page, errors} = await boot({kraken});
  await command(page, 'DOM');
  await page.waitForSelector('.fx-dom-big');
  await page.clock.runFor(2500);
  await page.waitForFunction(() => document.querySelector('.fx-dom-row.bb'));
  const ladder = await page.$$eval('.fx-dom-big .fx-dom-body .fx-dom-row', rows => rows.map(r => ({cls: r.className, b: r.children[0].textContent, p: r.children[1].textContent, a: r.children[2].textContent})));
  assert.equal(ladder.length, 34);
  const bb = ladder.find(r => r.cls.includes(' bb')), ba = ladder.find(r => r.cls.includes(' ba'));
  assert.equal(bb.p, '90,000'); assert.equal(ba.p, '90,001'); assert.ok(bb.b && !bb.a && ba.a && !ba.b, 'sizes on the right side');
  assert.ok(ladder.indexOf(ba) < ladder.indexOf(bb), 'asks above bids');
  assert.match(await page.textContent('[data-d=bid] b'), /^90,000 × 0\.5000$/);
  await shot(page, 'dom-ladder.png');
  // Best bid steps up: the inside market flashes green and the ladder keeps its rows (updated in place).
  const firstRow = await page.$('.fx-dom-big .fx-dom-body .fx-dom-row');
  ws.send(JSON.stringify({channel: 'book', type: 'update', data: [{symbol: 'BTC/USD', bids: [{price: 90000.6, qty: 1.25}], asks: []}]}));
  await page.clock.runFor(300);
  assert.equal(await page.getAttribute('[data-d=bid] b', 'data-tick-dir'), 'up');
  assert.match(await page.textContent('[data-d=bid] b'), /^90,000\.6 × 1\.25$/, 'shown at the exchange precision, not the ladder tick');
  assert.ok(await firstRow.evaluate(n => n.isConnected), 'rows are reused, not rebuilt');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('PORT: drawdown charts for holdings on one deposit, portfolio total and underwater', async () => {
  const {ctx, page, errors} = await boot({storage: {'fx-term-portfolio': JSON.stringify([{symbol: 'AAA', qty: 50}, {symbol: 'BBB', qty: 40}, {symbol: 'CCC', qty: 30}])}});
  await command(page, 'PORT');
  await page.waitForSelector('.pf-dd', {timeout: 15000});
  const text = await page.textContent('#fx-page-body');
  assert.match(text, /Portfolio drawdown/); assert.match(text, /Portfolio total/); assert.match(text, /Underwater/); assert.match(text, /worst -\d+\.\d pp of deposit/);
  assert.equal(await page.$$eval('.pf-dd', c => c.length), 3);
  assert.equal(await page.$$eval('.pf-dd:first-of-type polyline, .pf-legend span', n => n.length) >= 3, true);
  const legend = await page.$$eval('.pf-legend b', b => b.map(x => x.textContent)); assert.deepEqual(legend, ['AAA', 'BBB', 'CCC']);
  const uwMax = await page.$$eval('.pf-dd', svgs => { const s = svgs[2], labels = [...s.querySelectorAll('text')].map(t => t.textContent).filter(t => /%$/.test(t)).map(parseFloat); return Math.max(...labels); });
  assert.equal(uwMax, 0, 'underwater never goes above zero');
  await page.$eval('.pf-dd', n => n.scrollIntoView());
  await shot(page, 'portfolio-drawdown.png');
  assert.deepEqual(errors, []);
  await ctx.close();
});
