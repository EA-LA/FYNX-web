#!/usr/bin/env node
'use strict';
/* FYNX Terminal audit: boots the real Terminal from this checkout (served as www.fynxfinanceworld.com) with the
 * real data providers (network passes through), then visits every desk, every panel and every page and records:
 *  - uncaught page errors and console errors, failed requests by host
 *  - panels/pages that never finish loading, show an error, or render nothing
 *  - content that overflows its container horizontally (clipped or spilling text, tables wider than the box)
 *  - overlapping text in the headline ticker
 * Usage: node scripts/audit-terminal.cjs <out-dir> [--viewport=1920x1080] [--quick] [--proxy=http://host:port]
 * Writes <out-dir>/audit.json and screenshots. Exit code 0; read the report. */
const fs = require('node:fs'), path = require('node:path');
let chromium; try { ({chromium} = require('playwright')); } catch { ({chromium} = require('playwright-core')); }
const root = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(3).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const out = path.resolve(process.argv[2] || 'audit-out'); fs.mkdirSync(out, {recursive: true});
const [W, H] = String(args.viewport || '1920x1080').split('x').map(Number);
const ORIGIN = 'https://www.fynxfinanceworld.com';
const TYPES = {'.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png'};
const executablePath = process.env.FYNX_CHROMIUM_PATH || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function harness() {
  return fs.readFileSync(path.join(root, 'terminal.html'), 'utf8')
    .replace(/<!-- terminal-gate:start -->[\s\S]*?<!-- terminal-gate:end -->/, '')
    .replace(/<!-- FYNX ADSENSE VERIFICATION START -->[\s\S]*?<!-- FYNX ADSENSE VERIFICATION END -->/, '')
    .replace(/<script type="module"[^>]*><\/script>/g, '');
}
// Expose the Terminal's core and page registry to the audit only (never shipped).
const PATCH = {
  'assets/js/terminal/app.js': s => s.replace('CORE.PG = PG;', 'CORE.PG = PG; window.__AUDIT_T = CORE;'),
  'assets/js/terminal/pages.js': s => s.replace('const add = (name, label, render) => { NAMES[name] = label; PAGES[name] = render; };', 'const add = (name, label, render) => { NAMES[name] = label; PAGES[name] = render; }; window.__AUDIT_PAGES = NAMES;')
};

// Runs in the page: inspect every visible panel or the open page for problems.
function inspect(scope) {
  const vis = n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const issues = [];
  const boxes = scope === 'page' ? [document.getElementById('fx-page')] : [...document.querySelectorAll('#fx-main > section.tp')];
  const report = [];
  for (const box of boxes) {
    if (!vis(box)) continue;
    const id = box.id || box.dataset.kind || '(page)', title = (box.querySelector('.tp-h, header, h1')?.textContent || '').trim().slice(0, 80);
    const body = box.querySelector('.tp-b, .fx-pagebody, .pg-body') || box;
    const text = body.innerText.replace(/\s+/g, ' ').trim();
    const r = box.getBoundingClientRect(), item = {id, title, chars: text.length, problems: []};
    if (!text.length && !body.querySelector('svg, canvas, img, table')) item.problems.push('empty');
    if (/^(Loading|Connecting|Checking|Searching)\b[^.]*…?$/i.test(text) || /\bLoading\b[^.]{0,60}…/.test(text.slice(0, 120)) && text.length < 160) item.problems.push('stuck-loading: ' + text.slice(0, 100));
    if (/\b(undefined|NaN|\[object Object\]|Infinity%|null%)\b/.test(text)) item.problems.push('bad-value: ' + (text.match(/.{0,40}\b(undefined|NaN|\[object Object\]|Infinity%|null%)\b.{0,40}/) || [''])[0]);
    // Horizontal overflow: descendants extending beyond the panel's right edge while not inside a scroll container.
    let spill = 0, spillSample = '';
    for (const n of body.querySelectorAll('*')) {
      if (!vis(n)) continue;
      const nr = n.getBoundingClientRect();
      if (nr.right > r.right + 2 && nr.left < r.right) {
        let p = n.parentElement, scrolls = false;
        while (p && p !== box) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth) { scrolls = true; break; } p = p.parentElement; }
        if (!scrolls) { spill++; if (!spillSample) spillSample = `${n.tagName.toLowerCase()}.${String(n.className).slice(0, 30)} "${(n.textContent || '').trim().slice(0, 40)}" +${Math.round(nr.right - r.right)}px`; }
      }
    }
    if (spill) item.problems.push(`overflow-x ${spill} elements, e.g. ${spillSample}`);
    // Text clipped by ellipsis is intended; text cut by a fixed-height box with overflow hidden is not.
    const bodyCs = getComputedStyle(body);
    if (bodyCs.overflowY === 'hidden' && body.scrollHeight > body.clientHeight + 4) item.problems.push(`clipped-y ${body.scrollHeight - body.clientHeight}px hidden`);
    report.push(item);
  }
  return report;
}
// Headline ticker: items must not overlap each other.
function tickerOverlap() {
  const items = [...document.querySelectorAll('#fx-news-track > *')].filter(n => n.getBoundingClientRect().width > 0);
  let overlaps = 0, sample = '';
  for (let i = 1; i < items.length; i++) { const a = items[i - 1].getBoundingClientRect(), b = items[i].getBoundingClientRect(); if (Math.abs(a.top - b.top) < 4 && b.left < a.right - 1) { overlaps++; if (!sample) sample = `${items[i - 1].textContent.slice(0, 40)} | ${items[i].textContent.slice(0, 40)}`; } }
  // Children inside one item overlapping (time / title / source).
  let inner = 0;
  for (const it of items) { const kids = [...it.children].filter(k => k.getBoundingClientRect().width > 0); for (let i = 1; i < kids.length; i++) { const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect(); if (Math.abs(a.top - b.top) < 4 && b.left < a.right - 1) inner++; } }
  return {items: items.length, overlaps, inner, sample};
}

(async () => {
  const launch = {executablePath, args: ['--no-sandbox']};
  if (args.proxy) launch.proxy = {server: args.proxy};
  const browser = await chromium.launch(launch);
  const ctx = await browser.newContext({viewport: {width: W, height: H}, ignoreHTTPSErrors: !!args.proxy});
  const page = await ctx.newPage();
  const errors = [], consoleErrors = [], failed = {}, requests = {};
  page.on('pageerror', e => errors.push(String(e.stack || e).slice(0, 600)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('requestfinished', r => { try { const u = new URL(r.url()); const k = u.host + u.pathname.replace(/\/[^/]*\.(js|css|png|svg|json)$/, '/*.$1'); requests[k] = (requests[k] || 0) + 1; } catch {} });
  page.on('requestfailed', r => { try { const h = new URL(r.url()).host; (failed[h] ||= []).push(r.url().slice(0, 160) + ' ' + (r.failure()?.errorText || '')); } catch {} });
  page.on('response', r => { if (r.status() >= 400) { try { const h = new URL(r.url()).host; (failed[h] ||= []).push(`${r.status()} ${r.url().slice(0, 160)}`); } catch {} } });
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
  const t0 = Date.now();
  await page.goto(ORIGIN + '/terminal.html', {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#fx-main')?.getAttribute('aria-busy') === 'false', null, {timeout: 60000}).catch(() => {});
  const bootMs = Date.now() - t0;
  await sleep(6000);
  const inv = await page.evaluate(() => { const T = window.__AUDIT_T; return {desks: T.DESK_ORDER.filter(k => T.DESK_DEFS[k]), deskDefs: Object.keys(T.DESK_DEFS), panels: Object.keys(T.PANELS), pages: Object.keys(window.__AUDIT_PAGES || {}), commands: [...T.PAGE_NAMES]}; });
  const result = {viewport: `${W}x${H}`, bootMs, inventory: inv, desks: {}, pages: {}, allPanels: null, ticker: null, errors, consoleErrors, failed, requests};
  result.ticker = await page.evaluate(tickerOverlap);
  await page.screenshot({path: path.join(out, `boot-${W}x${H}.jpg`), type: 'jpeg', quality: 55});
  const deskList = args.quick ? inv.desks.slice(0, 3) : inv.deskDefs;
  for (const k of deskList) {
    const before = errors.length;
    await page.evaluate(k => window.__AUDIT_T.setDesk(k), k).catch(e => errors.push('setDesk ' + k + ': ' + e.message));
    await sleep(args.quick ? 2500 : 5000);
    result.desks[k] = {panels: await page.evaluate(inspect, 'desk'), newErrors: errors.slice(before)};
    await page.screenshot({path: path.join(out, `desk-${k}-${W}x${H}.jpg`), type: 'jpeg', quality: 55});
  }
  // Every panel: one desk holding every panel (the Edit "+ All panels" layout), inspected box by box.
  await page.evaluate(() => window.__AUDIT_T.setDesk('all'));
  await page.evaluate(() => { const T = window.__AUDIT_T; const v = Object.keys(T.PANELS).filter(k => T.RENDER[k] && !/^mine-/.test(k)); T.store.set('layout-all', JSON.stringify(v)); T.buildGrid(); T.renderAll(); });
  await sleep(args.quick ? 4000 : 10000);
  result.allPanels = await page.evaluate(inspect, 'desk');
  await page.evaluate(() => { window.__AUDIT_T.store.set('layout-all', ''); window.__AUDIT_T.buildGrid(); window.__AUDIT_T.renderAll(); });
  const pageList = args.nopages ? [] : args.quick ? inv.pages.slice(0, 8) : inv.pages;
  for (const name of pageList) {
    const before = errors.length;
    await page.evaluate(n => window.__AUDIT_T.openPage(n), name).catch(e => errors.push('open ' + name + ': ' + e.message));
    await sleep(args.quick ? 2000 : 4500);
    const info = await page.evaluate(inspect, 'page');
    result.pages[name] = {...info[0], newErrors: errors.slice(before)};
    if (!args.quick && args.pageshots) await page.screenshot({path: path.join(out, `page-${name}-${W}x${H}.jpg`), type: 'jpeg', quality: 55});
    await page.evaluate(() => window.__AUDIT_T.PG?.closeAll()).catch(() => {});
  }
  result.heap = await page.evaluate(() => performance.memory ? {usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1)} : null);
  result.domNodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  fs.writeFileSync(path.join(out, `audit-${W}x${H}.json`), JSON.stringify(result, null, 1));
  // Short summary.
  const probs = [];
  for (const [k, d] of Object.entries(result.desks)) for (const p of d.panels) if (p.problems.length) probs.push(`desk ${k} / ${p.id}: ${p.problems.join('; ')}`);
  for (const p of result.allPanels || []) if (p.problems.length) probs.push(`panel ${p.id}: ${p.problems.join('; ')}`);
  for (const [k, p] of Object.entries(result.pages)) if (p.problems?.length || p.newErrors?.length) probs.push(`page ${k}: ${[...(p.problems || []), ...(p.newErrors || []).map(e => 'ERROR ' + e.split('\n')[0])].join('; ')}`);
  fs.writeFileSync(path.join(out, `summary-${W}x${H}.txt`), [`viewport ${W}x${H} · boot ${bootMs}ms · ${inv.desks.length} desks · ${inv.panels.length} panels · ${inv.pages.length} pages · heap ${result.heap?.usedMB}MB · DOM ${result.domNodes}`,
    `ticker: ${JSON.stringify(result.ticker)}`, `page errors: ${errors.length}`, ...[...new Set(errors.map(e => e.split('\n')[0]))].map(e => '  ' + e), `console errors: ${consoleErrors.length}`, ...[...new Set(consoleErrors)].slice(0, 30).map(e => '  ' + e),
    'failed hosts: ' + Object.entries(failed).map(([h, l]) => `${h}(${l.length})`).join(', '), `problems: ${probs.length}`, ...probs].join('\n') + '\n');
  console.log(fs.readFileSync(path.join(out, `summary-${W}x${H}.txt`), 'utf8').slice(0, 20000));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
