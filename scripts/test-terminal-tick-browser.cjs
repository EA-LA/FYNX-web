'use strict';
/* Market Data Display in a real browser (Chromium): the shipped terminal-all.css + tick.js paint a cell-level
 * flash that appears at once and fades back, never shifts layout, beats tone colours in Text style, holds
 * without a fade under reduced motion, and FYNX.tick works inside a sandboxed Build Your Own widget.
 * Run: node --test scripts/test-terminal-tick-browser.cjs  (uses FYNX_CHROMIUM_PATH or the system Chrome) */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
let chromium;
try { ({chromium} = require('playwright')); } catch { ({chromium} = require('playwright-core')); }
const executablePath = process.env.FYNX_CHROMIUM_PATH || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(p => fs.existsSync(p));

const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/terminal-all.css"></head>
<body class="fx-terminal"><div id="host" style="display:grid;grid-template-columns:120px 90px 90px;width:300px"></div>
<script src="/assets/js/terminal/tick.js"></script>
<script src="/assets/js/terminal/builder-core.js"></script></body></html>`;
const TYPES = {'.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html'};

let server, base, browser;
test.before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/harness.html') { res.writeHead(200, {'content-type': 'text/html'}); return res.end(HARNESS); }
    const file = path.join(root, path.normalize(url.pathname).replace(/^([/\\])+/, ''));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'}); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({executablePath, args: ['--no-sandbox']});
});
test.after(async () => { await browser?.close(); server?.close(); });

async function open(options = {}) {
  const ctx = await browser.newContext(options), page = await ctx.newPage();
  await page.goto(base + '/harness.html');
  await page.waitForFunction(() => window.FynxTick);
  return {ctx, page};
}
// Render a row the way the Terminal panels do: replace the panel's children with fresh cells.
const renderRow = (page, price, chg) => page.evaluate(([price, chg]) => {
  const T = window.FynxTick, host = document.getElementById('host');
  const mk = (cls, text) => { const n = document.createElement('span'); n.className = cls; n.textContent = text; return n; };
  host.replaceChildren(mk('fx-sym', 'AAPL'), T.mark(mk('fx-num', price.toFixed(2)), 'px:AAPL', price), T.mark(mk('fx-num fx-down', chg.toFixed(2) + '%'), 'chg:AAPL', chg));
}, [price, chg]);
const style = (page, i) => page.evaluate(i => { const n = document.getElementById('host').children[i], cs = getComputedStyle(n), r = n.getBoundingClientRect(); return {bg: cs.backgroundImage, color: cs.color, classes: n.className, box: [r.x, r.y, r.width, r.height].map(v => Math.round(v))}; }, i);

test('uptick on a stock that is down on the day: price cell flashes green and fades; nothing else moves', async () => {
  const {ctx, page} = await open();
  await page.evaluate(() => { FynxTick.ingest('px:AAPL', 149.30, {digits: 2}); FynxTick.ingest('chg:AAPL', -3.91, {digits: 2}); });
  await renderRow(page, 149.30, -3.91);
  const before = [await style(page, 0), await style(page, 1), await style(page, 2)];
  await page.evaluate(() => { FynxTick.ingest('px:AAPL', 149.35, {digits: 2}); FynxTick.ingest('chg:AAPL', -3.91, {digits: 2}); FynxTick.commit(); });
  await renderRow(page, 149.35, -3.91);
  await page.waitForTimeout(40);
  const during = [await style(page, 0), await style(page, 1), await style(page, 2)];
  assert.match(during[1].bg, /rgba\(0, 200, 83, 0\.3\d*\)/, 'price cell has the green overlay right away: ' + during[1].bg);
  assert.equal(during[0].bg, 'none'); assert.equal(during[2].bg, 'none', 'day-change cell does not flash');
  assert.equal(during[2].color, before[2].color, 'day change stays red');
  for (let i = 0; i < 3; i++) assert.deepEqual(during[i].box, before[i].box, 'no layout shift, no column width change');
  await page.waitForTimeout(450);
  const fading = await style(page, 1), alpha = Number((/rgba\(0, 200, 83, ([\d.]+)\)/.exec(fading.bg) || [0, 0])[1]);
  assert.ok(alpha > 0 && alpha < 0.2, 'fading back: ' + fading.bg);
  await page.waitForTimeout(400);
  const after = await style(page, 1);
  assert.equal(after.bg, 'none', 'back to the original appearance'); assert.ok(!/fx-tk/.test(after.classes), 'classes removed on animationend');
  await ctx.close();
});

test('downtick red, neutral amber, strong intensity is a solid block with black text', async () => {
  const {ctx, page} = await open();
  await page.evaluate(() => { FynxTick.setSettings({intensity: 'strong'}); FynxTick.ingest('px:AAPL', 150, {digits: 2}); FynxTick.ingest('px:AAPL', 149.5, {digits: 2}); });
  await renderRow(page, 149.5, -1); await page.waitForTimeout(30);
  const down = await style(page, 1);
  assert.match(down.bg, /rgb\(255, 51, 71\)/); assert.equal(down.color, 'rgb(0, 0, 0)');
  const amber = await page.evaluate(() => {
    FynxTick.setSettings({intensity: 'standard'}); FynxTick.ingest('eco:x:f', null, {neutral: true, track: true}); FynxTick.ingest('eco:x:f', '3.1%', {neutral: true});
    const n = FynxTick.mark(Object.assign(document.createElement('span'), {className: 'fx-num', textContent: '3.1%'}), 'eco:x:f', '3.1%');
    document.getElementById('host').replaceChildren(n);
    return new Promise(r => setTimeout(() => r(getComputedStyle(n).backgroundImage), 30));
  });
  assert.match(amber, /rgba\(255, 184, 0, 0\.3\d*\)/);
  await ctx.close();
});

test('Text style overrides tone colours during the flash and returns to them', async () => {
  const {ctx, page} = await open();
  const base = await page.evaluate(() => { FynxTick.setSettings({style: 'text'}); FynxTick.ingest('chg:AAPL', -3.91, {digits: 2}); return true; });
  assert.ok(base);
  await renderRow(page, 149.3, -3.91);
  const red = (await style(page, 2)).color;
  await page.evaluate(() => FynxTick.ingest('chg:AAPL', -3.80, {digits: 2}));
  await renderRow(page, 149.3, -3.80); await page.waitForTimeout(30);
  const during = await style(page, 2);
  assert.equal(during.color, 'rgb(0, 200, 83)', 'uptick colour beats the .fx-down !important tone'); assert.equal(during.bg, 'none');
  await page.waitForTimeout(800);
  assert.equal((await style(page, 2)).color, red, 'back to the red day-change tone');
  await ctx.close();
});

test('reduced motion: highlight holds without a fade, then switches off', async () => {
  const {ctx, page} = await open({reducedMotion: 'reduce'});
  await page.evaluate(() => { FynxTick.ingest('px:AAPL', 149.30, {digits: 2}); FynxTick.ingest('px:AAPL', 149.40, {digits: 2}); });
  await renderRow(page, 149.40, -1); await page.waitForTimeout(450);
  assert.match((await style(page, 1)).bg, /rgba\(0, 200, 83, 0\.32\)/, 'still full strength late in the window (no fade)');
  await page.waitForTimeout(350);
  assert.equal((await style(page, 1)).bg, 'none');
  await ctx.close();
});

test('400 instruments ticking at once paint quickly', async () => {
  const {ctx, page} = await open();
  const ms = await page.evaluate(() => {
    const host = document.getElementById('host'), N = 400;
    for (let i = 0; i < N; i++) FynxTick.ingest('px:S' + i, 100 + i, {digits: 2});
    const t0 = performance.now();
    for (let i = 0; i < N; i++) FynxTick.ingest('px:S' + i, 100.01 + i, {digits: 2});
    const frag = document.createDocumentFragment();
    for (let i = 0; i < N; i++) { const n = document.createElement('span'); n.textContent = (100.01 + i).toFixed(2); frag.append(FynxTick.mark(n, 'px:S' + i, 100.01 + i)); }
    host.replaceChildren(frag);
    return new Promise(r => requestAnimationFrame(() => r({ms: performance.now() - t0, flashing: host.querySelectorAll('.fx-tk-1').length})));
  });
  assert.equal(ms.flashing, 400);
  assert.ok(ms.ms < 250, `ingest + render + paint of 400 cells took ${ms.ms.toFixed(1)} ms`);
  await ctx.close();
});

test('Build Your Own widget: FYNX.tick flashes a re-rendered price inside the sandbox, not on first run', async () => {
  const {ctx, page} = await open();
  const result = await page.evaluate(async () => {
    const Core = window.FynxBuilderCore || window.FYNXBuilderCore;
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', Core.SANDBOX_ATTR); frame.srcdoc = Core.SANDBOX_HTML; document.body.append(frame);
    const code = `function render(root, FYNX) {
      function draw() {
        const s = document.createElement('span'); const q = FYNX.quote('SPY');
        s.textContent = FYNX.format(q.price, 2); FYNX.tick(s, 'SPY', q.price); root.replaceChildren(s);
        parent.postMessage({type: 'probe', animations: s.getAnimations().length, price: q.price}, '*');
      }
      draw(); FYNX.onQuotes(draw);
    }`;
    const probes = [];
    window.addEventListener('message', e => { if (e.data?.type === 'probe') probes.push(e.data); if (e.data?.type === 'fynx-ready') frame.contentWindow.postMessage({type: 'fynx-run', token: 't1', code, quotes: [{symbol: 'SPY', price: 600, changePercent: -1}], display: FynxTick.sandboxSettings()}, '*'); });
    const wait = n => new Promise(r => { const t = setInterval(() => { if (probes.length >= n) { clearInterval(t); r(); } }, 20); setTimeout(() => { clearInterval(t); r(); }, 4000); });
    await wait(1);
    frame.contentWindow.postMessage({type: 'fynx-quotes', token: 't1', quotes: [{symbol: 'SPY', price: 601.25, changePercent: -0.8}], display: FynxTick.sandboxSettings()}, '*'); await wait(2);
    frame.contentWindow.postMessage({type: 'fynx-quotes', token: 't1', quotes: [{symbol: 'SPY', price: 601.25, changePercent: -0.8}], display: FynxTick.sandboxSettings()}, '*'); await wait(3);
    return probes;
  });
  assert.deepEqual(result.map(p => [p.price, p.animations]), [[600, 0], [601.25, 1], [601.25, 0]], 'first run baseline, uptick flashes, identical data does not');
  await ctx.close();
});
