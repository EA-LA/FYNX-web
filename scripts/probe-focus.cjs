#!/usr/bin/env node
'use strict';
/* FYNX Terminal FOCUS probe: boots this checkout as www.fynxfinanceworld.com with the real data providers and,
 * for each market, selects it through the command bar and through Find, then records what every panel shows:
 * the selected instrument, the URL, panel titles and whether any panel shows a different market.
 * Usage: node scripts/probe-focus.cjs <out-dir> [--symbols=META,BFLR,ANT,...] [--viewport=1920x1080]
 * Writes <out-dir>/focus.json, <out-dir>/focus.txt and one screenshot per scenario. Diagnostic only. */
const fs = require('node:fs'), path = require('node:path');
let chromium; try { ({chromium} = require('playwright')); } catch { ({chromium} = require('playwright-core')); }
const root = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(3).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const out = path.resolve(process.argv[2] || 'focus-out'); fs.mkdirSync(out, {recursive: true});
const [W, H] = String(args.viewport || '1920x1080').split('x').map(Number);
const SYMBOLS = String(args.symbols || 'META,AAPL,NVDA,MSFT,BFLR,ANT,EURUSD,GBPUSD,BTC,ETH,SPY,XAUUSD,USDTRY,SOL').split(',');
const ORIGIN = 'https://www.fynxfinanceworld.com';
const TYPES = {'.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png'};
const executablePath = process.env.FYNX_CHROMIUM_PATH || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const harness = () => fs.readFileSync(path.join(root, 'terminal.html'), 'utf8')
  .replace(/<!-- terminal-gate:start -->[\s\S]*?<!-- terminal-gate:end -->/, '')
  .replace(/<!-- FYNX ADSENSE VERIFICATION START -->[\s\S]*?<!-- FYNX ADSENSE VERIFICATION END -->/, '')
  .replace(/<script type="module"[^>]*><\/script>/g, '');
const PATCH = {'assets/js/terminal/app.js': s => s.replace('CORE.PG = PG;', 'CORE.PG = PG; window.__AUDIT_T = CORE;')};

// In the page: what the workspace shows right now.
function snapshot() {
  const T = window.__AUDIT_T, S = T.S;
  const panels = [...document.querySelectorAll('#fx-main > section.tp')].map(n => {
    const title = (n.querySelector('header h2')?.textContent || '').replace(/\s+/g, ' ').trim();
    const text = (n.querySelector('.tp-b')?.innerText || '').replace(/\s+/g, ' ').trim();
    return {id: n.id.replace(/^tp-/, ''), title, text: text.slice(0, 160), chars: text.length};
  });
  return {url: location.search, mode: T.modeOf ? T.modeOf() : (S.cmp ? 'compare' : S.sym ? 'focus' : 'all'), desk: S.deskKey,
    sym: S.sym ? {symbol: S.sym.symbol, name: S.sym.name, cls: S.sym.cls, type: S.sym.type, exchange: S.sym.exchange} : null,
    chip: document.getElementById('fx-symchip')?.hidden ? '' : (document.getElementById('fx-symchip')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    title: document.title, slots: T.getSlots ? T.getSlots() : null, panels};
}

(async () => {
  const browser = await chromium.launch({executablePath, args: ['--no-sandbox']});
  const results = [];
  const lines = [];
  for (const sym of SYMBOLS) for (const via of ['command', 'find']) {
    const ctx = await browser.newContext({viewport: {width: W, height: H}});
    const page = await ctx.newPage(), errors = [], searches = [];
    page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 200)));
    page.on('response', async r => { if (/op=search|action=search|\/search\?/.test(r.url())) { try { searches.push({url: r.url().slice(0, 160), body: (await r.text()).slice(0, 1500)}); } catch {} } });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === ORIGIN) {
        if (url.pathname === '/terminal.html' || url.pathname === '/terminal') return route.fulfill({contentType: 'text/html', body: harness()});
        const rel = decodeURIComponent(url.pathname).replace(/^\//, ''), file = path.join(root, rel);
        if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) { let body = fs.readFileSync(file); if (PATCH[rel]) body = PATCH[rel](body.toString()); return route.fulfill({contentType: TYPES[path.extname(file)] || 'application/octet-stream', body}); }
        if (url.pathname.startsWith('/fn/')) return route.continue({url: 'https://fynxfinanceworld.vercel.app' + url.pathname + url.search});
        return route.fulfill({status: 404, body: ''});
      }
      if (/googletagmanager|google-analytics|googlesyndication|doubleclick/.test(url.host)) return route.fulfill({status: 204, body: ''});
      return route.continue();
    });
    const entry = {sym, via, errors, searches};
    try {
      await page.goto(ORIGIN + '/terminal.html?desk=stocks', {waitUntil: 'domcontentloaded'});
      await page.waitForFunction(() => document.querySelector('#fx-main')?.getAttribute('aria-busy') === 'false', null, {timeout: 60000}).catch(() => {});
      await sleep(4000);
      if (via === 'command') {
        await page.fill('#fx-command', sym); await page.press('#fx-command', 'Enter');
      } else {
        await page.click('#fx-find-btn'); await sleep(500);
        await page.fill('#fx-finder-input', sym);
        await page.waitForFunction(() => /WORLDWIDE|unavailable/.test(document.getElementById('fx-finder-list')?.textContent || ''), null, {timeout: 15000}).catch(() => {});
        entry.results = await page.$$eval('#fx-finder-list .fx-find', ns => ns.slice(0, 8).map(n => n.textContent.replace(/\s+/g, ' ').trim().slice(0, 120)));
        const first = await page.$('#fx-finder-list .fx-find');
        if (!first) throw Error('Find returned no results');
        await first.click();
      }
      await sleep(9000);
      Object.assign(entry, await page.evaluate(snapshot));
      await page.screenshot({path: path.join(out, `${sym}-${via}.jpg`), type: 'jpeg', quality: 60});
    } catch (e) { entry.error = String(e.message || e).slice(0, 300); }
    results.push(entry);
    const other = (entry.panels || []).filter(p => /EUR\s?\/?\s?USD/.test(p.title + ' ' + p.text) && !/EUR|GBP|JPY|CHF|CAD|AUD|NZD/.test(sym));
    lines.push(`### ${sym} via ${via} → mode=${entry.mode} desk=${entry.desk} sym=${JSON.stringify(entry.sym)} url=${entry.url} chip="${entry.chip}" errors=${errors.length}${entry.error ? ' ERROR ' + entry.error : ''}`);
    if (entry.results) lines.push('  find results: ' + JSON.stringify(entry.results));
    lines.push('  slots: ' + JSON.stringify(entry.slots));
    for (const p of entry.panels || []) lines.push(`  ${p.id.padEnd(10)} ${String(p.chars).padStart(5)}  ${p.title.slice(0, 70)}  | ${p.text.slice(0, 110)}`);
    if (other.length) lines.push('  !!! EUR/USD shown in: ' + other.map(p => p.id).join(', '));
    await ctx.close();
    fs.writeFileSync(path.join(out, 'focus.json'), JSON.stringify(results, null, 1));
    fs.writeFileSync(path.join(out, 'focus.txt'), lines.join('\n') + '\n');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
