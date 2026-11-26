'use strict';
/* End to end: the real FYNX Terminal scripts from terminal.html (sign-in gate and ads removed) running in Chromium
 * against fixture quote responses, with a controlled clock. Proves that nothing flashes on initial load or when
 * switching desks, that a 30-second quote refresh flashes only the price cells that moved (green for an uptick
 * on a stock that is down on the day, whose red day change does not flash), that identical data does not flash,
 * and that the SETTINGS page switch turns highlighting off. No request leaves the machine.
 * Run: node --test scripts/test-terminal-tick-e2e.cjs  (uses FYNX_CHROMIUM_PATH or the system Chrome) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
let chromium;
try { ({chromium} = require('playwright')); } catch { ({chromium} = require('playwright-core')); }
const executablePath = process.env.FYNX_CHROMIUM_PATH || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(p => fs.existsSync(p));
const ORIGIN = 'https://www.fynxfinanceworld.com';
const TYPES = {'.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html'};

// terminal.html as shipped, minus the sign-in gate, ads, account sync and web fonts (all need the network).
function harness() {
  return fs.readFileSync(path.join(root, 'terminal.html'), 'utf8')
    .replace(/<!-- terminal-gate:start -->[\s\S]*?<!-- terminal-gate:end -->/, '')
    .replace(/<!-- FYNX ADSENSE VERIFICATION START -->[\s\S]*?<!-- FYNX ADSENSE VERIFICATION END -->/, '')
    .replace(/<script type="module"[^>]*><\/script>/g, '')
    .replace(/<link[^>]+fonts\.(googleapis|gstatic)[^>]*>/g, '');
}
let quotes;
const setQuotes = q => { quotes = q; };
const quotePayload = () => ({fetchedAt: new Date().toISOString(), quotes: Object.fromEntries(Object.entries(quotes).map(([s, [price, changePercent]]) => [s, {price, changePercent, asOf: new Date().toISOString(), source: 'Fixture (delayed)', delayed: true}]))});

let browser;
test.before(async () => { browser = await chromium.launch({executablePath, args: ['--no-sandbox']}); });
test.after(async () => { await browser?.close(); });

async function boot() {
  const ctx = await browser.newContext(), page = await ctx.newPage(), outside = [];
  await page.clock.install({time: new Date('2026-11-25T16:00:00Z')});
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN) {
      if (url.pathname === '/terminal.html') return route.fulfill({contentType: 'text/html', body: harness()});
      const file = path.join(root, decodeURIComponent(url.pathname));
      if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)});
      return route.fulfill({status: 404, body: ''});
    }
    if (/cloudfunctions\.net\/webResearchData$/.test(url.origin + url.pathname) && url.searchParams.get('action') === 'quotes') return route.fulfill({contentType: 'application/json', body: JSON.stringify(quotePayload())});
    outside.push(url.host);
    return route.fulfill({status: 404, contentType: 'application/json', body: '{}'});
  });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(ORIGIN + '/terminal.html');
  await page.clock.runFor(2000);
  await page.waitForFunction(() => document.querySelector('#fx-main')?.getAttribute('aria-busy') === 'false', null, {timeout: 20000});
  return {ctx, page, errors, outside};
}
const flashing = page => page.evaluate(() => [...document.querySelectorAll('[data-tick-dir]')].map(n => ({key: n.dataset.tick, dir: n.dataset.tickDir, panel: n.closest('section,.fx-strip')?.id || n.closest('.fx-strip')?.id || ''})));
const cellsFor = (page, key) => page.evaluate(key => [...document.querySelectorAll(`[data-tick="${key}"]`)].map(n => ({text: n.textContent, dir: n.dataset.tickDir || null, cls: n.className, inMkts: !!n.closest('#tp-mkts'), inStrip: !!n.closest('#fx-quotes')})), key);

test('live Terminal: no flash on load, uptick flashes green on price cells only, identical data and desk switches never flash', async () => {
  setQuotes({AAPL: [149.30, -3.91], MSFT: [410.00, 0.50], NVDA: [166.19, -4.34], SPY: [600.00, 0.10], 'BTC-USD': [90000, 1.2]});
  const {ctx, page, errors} = await boot();
  assert.deepEqual(await flashing(page), [], 'nothing flashes during initial page loading');
  const loaded = await cellsFor(page, 'px:AAPL');
  assert.ok(loaded.some(c => c.inMkts) && loaded.some(c => c.inStrip), 'AAPL price is tagged in the market board and the ticker strip');

  // Next 30 s refresh: AAPL ticks up while still down 3.91% on the day; NVDA ticks down; the rest are identical.
  setQuotes({AAPL: [149.35, -3.91], MSFT: [410.00, 0.50], NVDA: [166.10, -4.39], SPY: [600.00, 0.10], 'BTC-USD': [90000, 1.2]});
  await page.clock.runFor(30000);
  await page.waitForFunction(() => document.querySelector('[data-tick="px:AAPL"][data-tick-dir]'), null, {timeout: 10000});
  const aapl = await cellsFor(page, 'px:AAPL'), aaplChg = await cellsFor(page, 'chg:AAPL');
  assert.ok(aapl.length >= 2 && aapl.every(c => c.dir === 'up' && c.text.includes('149.35')), 'every AAPL price cell flashes green: ' + JSON.stringify(aapl));
  assert.ok(aaplChg.length && aaplChg.every(c => c.dir === null && /fx-down/.test(c.cls)), 'AAPL day change keeps its red tone and does not flash');
  assert.ok((await cellsFor(page, 'px:NVDA')).every(c => c.dir === 'down'), 'NVDA downtick is red');
  assert.ok((await cellsFor(page, 'chg:NVDA')).every(c => c.dir === 'down'), 'NVDA day change moved lower: its own cell ticks down');
  for (const k of ['px:MSFT', 'chg:MSFT', 'px:SPY', 'px:BTC-USD']) assert.ok((await cellsFor(page, k)).every(c => c.dir === null), k + ' unchanged: no flash');
  const rows = await page.evaluate(() => [...document.querySelectorAll('#tp-mkts .fx-row')].filter(r => r.className.includes('fx-tk')).length);
  assert.equal(rows, 0, 'rows and panels never flash, only cells');

  // Identical data on the next refresh, then a desk switch after the highlight ended: nothing flashes.
  await page.clock.runFor(30000); await page.clock.runFor(1000);
  assert.deepEqual(await flashing(page), [], 'identical data');
  await page.click('#fx-deskbar-list button:nth-child(2)');
  await page.clock.runFor(1500);
  assert.deepEqual(await flashing(page), [], 'switching desks remounts panels without flashing');
  assert.deepEqual(errors, [], 'no page errors');
  await ctx.close();
});

test('live Terminal: SETTINGS › Market Data Display switches highlighting off and the choice survives a reload', async () => {
  setQuotes({AAPL: [150.00, 1.00], SPY: [600.00, 0.10]});
  const {ctx, page, errors} = await boot();
  await page.fill('#fx-command', 'SETTINGS'); await page.press('#fx-command', 'Enter'); await page.clock.runFor(300);
  assert.equal(await page.textContent('.pg-sec h2'), 'Market Data Display');
  assert.ok(await page.isVisible('.fx-key >> text=Settings'), 'Settings key in the function-key bar');
  await page.click('.fx-mdd-opts[aria-label="Live Tick Highlighting"] >> text=Off');
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('fx-term-market-display'))).enabled, false);
  await page.click('#fx-page-close'); await page.clock.runFor(300);
  setQuotes({AAPL: [151.00, 1.70], SPY: [601.00, 0.27]});
  await page.clock.runFor(30000); await page.clock.runFor(200);
  assert.equal(await page.evaluate(() => document.querySelector('#tp-mkts [data-tick="px:AAPL"]')?.textContent), '151.00', 'prices still update');
  assert.deepEqual(await flashing(page), [], 'highlighting off: no flashes');
  await page.reload(); await page.clock.runFor(2000);
  await page.waitForFunction(() => window.FynxTick);
  assert.equal(await page.evaluate(() => FynxTick.settings().enabled), false, 'preference restored after a browser refresh');
  assert.deepEqual(errors, []);
  await ctx.close();
});
