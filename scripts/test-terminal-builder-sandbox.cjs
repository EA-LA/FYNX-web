'use strict';
/* Runs the real builder iframe in Chromium. Proves the widget can render a quote
 * and cannot reach the terminal page, account storage, or the network. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
let chromium;
try {
  ({chromium} = require('/tmp/builder-tools/node_modules/playwright'));
} catch {
  ({chromium} = require('playwright'));
}

const hits = [];
const html = `<!doctype html><html><head><title>SAFE</title></head><body>
<div id="host"></div>
<script src="/assets/js/terminal/builder-core.js"></script>
<script src="/assets/js/terminal/builder.js"></script>
</body></html>`;

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      hits.push({path: url.pathname + url.search, cookie: req.headers.cookie || '', referer: req.headers.referer || ''});
      if (url.pathname === '/' || url.pathname === '/harness.html') {
        res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
        res.end(html);
        return;
      }
      const file = path.join(root, decodeURIComponent(url.pathname));
      if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); res.end('missing'); return;
      }
      res.writeHead(200, {'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store'});
      fs.createReadStream(file).pipe(res);
    });
    server.on('upgrade', req => { hits.push({path: 'upgrade:' + req.url, cookie: req.headers.cookie || '', referer: ''}); });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('sandboxed widget renders quotes and cannot reach the account, page, or network', async () => {
  hits.length = 0;
  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], ...(process.env.FYNX_CHROMIUM_PATH ? {executablePath: process.env.FYNX_CHROMIUM_PATH} : {})});
  try {
    const page = await browser.newPage();
    await page.goto(base + '/harness.html', {waitUntil: 'domcontentloaded'});
    await page.evaluate(() => {
      document.cookie = 'fynx_session=SUPERSECRET; path=/';
      localStorage.setItem('fx-term-secret', 'SUPERSECRET');
    });
    const report = await page.evaluate(async (pageBase) => {
      const quotes = {SPY: {price: 500.25, changePercent: -0.4, idToken: 'SUPERSECRET', source: 'https://secret.example', uid: 'alice'}};
      const seen = [];
      const onMessage = event => { if (event.data && event.data.type === 'fynx-probe') seen.push({origin: event.origin, name: event.data.name, value: String(event.data.value)}); };
      window.addEventListener('message', onMessage);
      function run(code) {
        const host = document.getElementById('host');
        return new Promise(resolve => {
          let finished = false;
          const stop = window.FynxBuilderMount(host, code, quotes, {
            title: 'Security test',
            onDone: () => { if (!finished) { finished = true; resolve({status: 'done'}); } },
            onError: message => { if (!finished) { finished = true; resolve({status: 'error', message: String(message)}); } }
          });
          setTimeout(() => { if (!finished) { finished = true; try { stop(); } catch (e) {} resolve({status: 'timeout'}); } }, 5000);
        });
      }
      const render = await run(`function render(root, FYNX) {
        const row = FYNX.quote('SPY');
        const line = document.createElement('p');
        const gold = FYNX.quote('GC=F') || FYNX.quote('GLD');
        line.textContent = (row ? 'S&P 500 ' + FYNX.format(row.price, 2) + ' (' + FYNX.signed(row.changePercent) + ')' : 'S&P 500 is not in this terminal snapshot')
          + (gold ? '' : ' · Gold is not in this terminal snapshot');
        root.replaceChildren(line);
        parent.postMessage({type: 'fynx-probe', name: 'render', value: JSON.stringify({keys: row ? Object.keys(row).sort() : [], text: root.textContent, raw: row})}, '*');
      }`);
      const attacks = await run(`function render(root, FYNX) {
        var notes = [];
        function note(name, value) { notes.push(name + '=' + String(value).slice(0, 180)); }
        var attack = ${JSON.stringify(pageBase)} + '/attack';
        try { fetch(attack + '/fetch'); note('fetch', 'called'); } catch (e) { note('fetch', e.message); }
        try { Object.getPrototypeOf(window).fetch(attack + '/proto-fetch'); note('proto', 'called'); } catch (e) { note('proto', e.message); }
        try { new XMLHttpRequest(); note('xhr', 'called'); } catch (e) { note('xhr', e.message); }
        try { new WebSocket(attack.replace('http', 'ws') + '/ws'); note('ws', 'called'); } catch (e) { note('ws', e.message); }
        try { navigator.sendBeacon(attack + '/beacon', 'x'); note('beacon', 'called'); } catch (e) { note('beacon', e.message); }
        try { new Worker(attack + '/worker.js'); note('worker', 'called'); } catch (e) { note('worker', e.message); }
        try { new RTCPeerConnection(); note('rtc', 'called'); } catch (e) { note('rtc', e.message); }
        try { new EventSource(attack + '/events'); note('sse', 'called'); } catch (e) { note('sse', e.message); }
        try { document.write('<img src="' + attack + '/write">'); note('write', 'called'); } catch (e) { note('write', e.message); }
        try {
          var img = document.createElement('img');
          img.src = attack + '/pixel.gif';
          document.body.appendChild(img);
          note('img', 'inserted');
        } catch (e) { note('img', e.message); }
        try {
          var frame = document.createElement('iframe');
          document.body.appendChild(frame);
          frame.contentWindow.fetch(attack + '/nested');
          note('nested', 'called');
        } catch (e) { note('nested', e.message); }
        try {
          root.innerHTML = '<iframe></iframe>';
          root.querySelector('iframe').contentWindow.fetch(attack + '/inner');
          note('inner', 'called');
        } catch (e) { note('inner', e.message); }
        var cookie = '', parentCookie = '', store = '', parentStore = '', parentDoc = '';
        try { cookie = document.cookie; } catch (e) { cookie = 'throw:' + e.name; }
        try { parentCookie = String(parent.document.cookie); } catch (e) { parentCookie = 'throw:' + e.name; }
        try { store = String(localStorage.getItem('fx-term-secret')); } catch (e) { store = 'throw:' + e.name; }
        try { parentStore = String(parent.localStorage.getItem('fx-term-secret')); } catch (e) { parentStore = 'throw:' + e.name; }
        try { parentDoc = parent.document.title; } catch (e) { parentDoc = 'throw:' + e.name; }
        try { Object.prototype.fynxPwned = 'yes'; } catch (e) {}
        try { location.href = attack + '/leave'; note('loc', 'called'); } catch (e) { note('loc', e.message); }
        try { eval('location.href=' + JSON.stringify(attack + '/eval')); note('eval', 'called'); } catch (e) { note('eval', e.message); }
        try { Function('location.href=' + JSON.stringify(attack + '/fn'))(); note('fn', 'called'); } catch (e) { note('fn', e.message); }
        try { root.constructor.constructor('location.href=' + JSON.stringify(attack + '/ctor'))(); note('ctor', 'called'); } catch (e) { note('ctor', e.message); }
        try { realWin.location.href = attack + '/realwin'; note('realwin', 'called'); } catch (e) { note('realwin', e.message); }
        try { nativeEval(attack); note('native', 'called'); } catch (e) { note('native', e.message); }
        try {
          var topNode = root.getRootNode();
          if (topNode && topNode.location) topNode.location.href = attack + '/root';
          else note('root', 'no-location');
        } catch (e) { note('root', e.message); }
        try {
          var meta = document.createElement('meta');
          meta.httpEquiv = 'refresh';
          meta.content = '0;url=' + attack + '/meta';
          document.head.appendChild(meta);
          note('meta', 'inserted');
        } catch (e) { note('meta', e.message); }
        parent.postMessage({type: 'fynx-probe', name: 'attacks', value: JSON.stringify({notes: notes, cookie: cookie, parentCookie: parentCookie, store: store, parentStore: parentStore, parentDoc: parentDoc})}, '*');
        root.textContent = 'attack-ran';
      }`);
      const closer = '<' + '/script>';
      const breakoutCode = 'function render(root, FYNX) { root.textContent = "ok"; }\\n' + closer + '<script>parent.document.title="PWNED"' + closer + '\\nfunction render(root, FYNX) { parent.document.title = "PWNED"; }';
      const breakout = await run(breakoutCode);
      const leave = await run(`function render(root, FYNX) { location.href = ${JSON.stringify(pageBase + '/attack/leave')}; root.textContent = 'left'; }`);
      window.removeEventListener('message', onMessage);
      return {
        title: document.title,
        polluted: ({}).fynxPwned || 'clean',
        href: location.href,
        render, attacks, breakout, leave,
        probes: seen
      };
    }, base);
    await new Promise(resolve => setTimeout(resolve, 400));
    const attackHits = hits.filter(hit => hit.path.includes('/attack') || hit.path.startsWith('upgrade:'));
    assert.equal(report.render.status, 'done', JSON.stringify(report.render));
    const rendered = report.probes.find(probe => probe.name === 'render');
    assert.ok(rendered, JSON.stringify(report.probes));
    assert.equal(rendered.origin, 'null');
    const quote = JSON.parse(rendered.value);
    assert.deepEqual(quote.keys, ['changePercent', 'price', 'symbol']);
    assert.equal(JSON.stringify(quote.raw).includes('SUPERSECRET'), false);
    assert.match(quote.text, /500\.25/);
    assert.match(quote.text, /Gold is not in this terminal snapshot/);
    assert.equal(report.attacks.status, 'done', JSON.stringify(report.attacks));
    const attack = JSON.parse(report.probes.find(probe => probe.name === 'attacks').value);
    for (const note of attack.notes) {
      if (note.startsWith('img=')) continue;
      assert.doesNotMatch(note, /=(called|inserted|no-throw)$/, note);
      assert.match(note, /blocked|SecurityError|not a constructor|is not a constructor|is not a function|undefined|no-location|denied/i, note);
    }
    assert.equal(attack.cookie.includes('SUPERSECRET'), false);
    assert.match(attack.parentCookie, /throw:SecurityError/);
    assert.match(attack.parentStore, /throw:SecurityError/);
    assert.match(attack.parentDoc, /throw:SecurityError/);
    assert.equal(attack.store.includes('SUPERSECRET'), false);
    assert.equal(report.title, 'SAFE');
    assert.equal(report.polluted, 'clean');
    assert.equal(report.href, base + '/harness.html');
    const navigations = attackHits.filter(hit => hit.path.startsWith('/attack/leave'));
    const others = attackHits.filter(hit => !hit.path.startsWith('/attack/leave') && !hit.path.startsWith('upgrade:/attack/leave'));
    assert.equal(others.length, 0, JSON.stringify(others));
    assert.equal(navigations.length, 0, JSON.stringify(navigations));
    assert.equal(report.title, 'SAFE');
    assert.equal(page.url(), base + '/harness.html');
    assert.equal(report.leave.status, 'error', JSON.stringify(report.leave));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
