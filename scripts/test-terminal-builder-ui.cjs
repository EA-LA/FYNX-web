'use strict';
/* Chromium check for the builder page: dark fields under the light theme,
 * a local CodeMirror, run/stop, device save, and account isolation.
 * Safari is not installed in this environment. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
let chromium;
try { ({chromium} = require('/tmp/builder-tools/node_modules/playwright')); }
catch { ({chromium} = require('playwright')); }

const html = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/funded-system.css">
<link rel="stylesheet" href="/assets/css/terminal-all.css">
<link rel="stylesheet" href="/assets/vendor/codemirror/codemirror.css">
<link rel="stylesheet" href="/assets/css/terminal-builder.css">
</head><body class="fx-terminal">
<form class="fx-cmd"><input id="fx-command" value="AAPL"></form>
<div id="fx-page-body"></div>
<script>window.__fxbUser = {uid:'alice'}; window.__fxbDeny = true; window.__fxbDocs = [];</script>
<script src="/assets/vendor/codemirror/codemirror.js"></script>
<script src="/assets/vendor/codemirror/javascript.js"></script>
<script src="/assets/vendor/codemirror/closebrackets.js"></script>
<script src="/assets/vendor/codemirror/matchbrackets.js"></script>
<script src="/assets/vendor/codemirror/searchcursor.js"></script>
<script src="/assets/js/terminal/builder-core.js"></script>
<script src="/assets/js/terminal/builder.js"></script>
<script>
window.__fxbOpen = function () {
  const plugins = window.FynxTerminalPlugins || [];
  const PG = {add(id, name, render) { this.render = render; }, setHead() {}, closeAll() {}, isOpen() { return true; }};
  const T = {
    PANELS: {}, RENDER: {}, PANEL_DESC: {}, EXTRA_GROUPS: [],
    S: {quotes: {SPY: {price: 510.5, changePercent: 0.35}}, deskKey: 'all', sym: null},
    store: {mem: {}, get(k) { return this.mem[k] == null ? null : this.mem[k]; }, set(k, v) { this.mem[k] = v; }},
    getSlots() { return [null, 'mkts', null]; },
    buildGrid() {}, renderAll() {},
    say(text) { document.body.dataset.said = text; },
    openPage() {},
    panel() { return document.createElement('div'); }
  };
  window.__T = T;
  plugins.forEach(fn => fn(T, PG));
  PG.render(document.getElementById('fx-page-body'));
};
</script></body></html>`;

const authMock = `export const app = {name:'test'};
export const auth = {get currentUser() { return globalThis.__fxbUser || null; }};`;
const authStateMock = `export function onAuthStateChanged(auth, cb) {
  globalThis.__fxbSetUser = user => { globalThis.__fxbUser = user; cb(user); };
  cb(globalThis.__fxbUser || null);
  return () => {};
}`;
const firestoreMock = `function denied() { const error = new Error('Missing or insufficient permissions.'); error.code = 'permission-denied'; return error; }
export function getFirestore() { return {}; }
export function collection() { return {path: Array.prototype.slice.call(arguments, 1).join('/')}; }
export function doc() { return {path: Array.prototype.slice.call(arguments, 1).join('/')}; }
export function getDocs(ref) {
  if (globalThis.__fxbDeny) return Promise.reject(denied());
  const rows = (globalThis.__fxbDocs || []).filter(row => row.path.indexOf(ref.path + '/') === 0);
  return Promise.resolve({docs: rows.map(row => ({id: row.id, data: () => row.data}))});
}
export function getDoc(ref) {
  if (globalThis.__fxbDeny) return Promise.reject(denied());
  const hit = (globalThis.__fxbDocs || []).find(row => row.path === ref.path);
  return Promise.resolve({exists: () => !!hit, data: () => hit ? hit.data : {}});
}
export function setDoc(ref, data) {
  if (globalThis.__fxbDeny) return Promise.reject(denied());
  const docs = globalThis.__fxbDocs || (globalThis.__fxbDocs = []);
  const row = {path: ref.path, id: ref.path.split('/').pop(), data: data};
  const at = docs.findIndex(item => item.path === ref.path);
  if (at >= 0) docs[at] = row; else docs.push(row);
  return Promise.resolve();
}
export function deleteDoc(ref) {
  if (globalThis.__fxbDeny) return Promise.reject(denied());
  globalThis.__fxbDocs = (globalThis.__fxbDocs || []).filter(row => row.path !== ref.path);
  return Promise.resolve();
}`;

function startServer() {
  const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png'};
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/builder-ui.html') {
        res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
        res.end(html);
        return;
      }
      const file = path.join(root, decodeURIComponent(url.pathname));
      if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('missing'); return; }
      res.writeHead(200, {'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store'});
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function mockFirebase(page) {
  const fulfill = body => route => route.fulfill({status: 200, contentType: 'text/javascript', body});
  await page.route('**/auth/firebase.js*', fulfill(authMock));
  await page.route('**/firebase-auth.js*', fulfill(authStateMock));
  await page.route('**/firebase-firestore.js*', fulfill(firestoreMock));
}

function isLight(color) {
  const match = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
  if (!match) return false;
  if (match[4] != null && Number(match[4]) === 0) return false;
  return Number(match[1]) > 210 && Number(match[2]) > 210 && Number(match[3]) > 210;
}

test('builder stays dark, runs, and keeps a denied account on this browser only', {timeout: 60000}, async () => {
  const server = await startServer();
  const browser = await chromium.launch({headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  const errors = [];
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}});
    page.on('pageerror', error => errors.push(String(error)));
    await mockFirebase(page);
    await page.goto(`http://127.0.0.1:${server.address().port}/builder-ui.html`, {waitUntil: 'domcontentloaded'});
    await page.evaluate(() => window.__fxbOpen());
    await page.waitForFunction(() => /refused|browser|Private to your account/.test(document.querySelector('[data-fxb-status]')?.textContent || ''));
    const style = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.fxb input, .fxb textarea, .fxb select, .fxb .CodeMirror, .fxb .CodeMirror-gutters, .fxb-side, .fxb-editor, .fxb-preview, .fxb-assist, .fxb-bar, .fxb-console, .fxb-cmhost')];
      const light = nodes.filter(node => {
        const bg = getComputedStyle(node).backgroundColor;
        const match = String(bg).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
        if (!match || (match[4] != null && Number(match[4]) === 0)) return false;
        return Number(match[1]) > 210 && Number(match[2]) > 210 && Number(match[3]) > 210;
      }).map(node => node.tagName + '.' + node.className + ' ' + getComputedStyle(node).backgroundColor);
      const command = getComputedStyle(document.querySelector('#fx-command')).backgroundColor;
      const name = getComputedStyle(document.querySelector('[aria-label="Project name"]'));
      const editor = getComputedStyle(document.querySelector('.CodeMirror'));
      const keyword = getComputedStyle(document.querySelector('.cm-keyword') || document.body).color;
      return {
        light,
        command,
        nameBg: name.backgroundColor,
        nameColor: name.color,
        scheme: name.colorScheme,
        editorBg: editor.backgroundColor,
        lines: document.querySelectorAll('.CodeMirror-linenumber').length,
        keyword,
        assistant: getComputedStyle(document.querySelector('[aria-label="Prompt for an external coding assistant"]')).backgroundColor
      };
    });
    assert.deepEqual(style.light, [], JSON.stringify(style.light));
    assert.match(style.command, /rgba?\(0,\s*0,\s*0,\s*0\)/);
    assert.equal(isLight(style.nameBg), false);
    assert.equal(isLight(style.editorBg), false);
    assert.equal(isLight(style.assistant), false);
    assert.equal(style.scheme, 'dark');
    assert.ok(style.lines > 1);
    assert.match(style.keyword, /255,\s*176,\s*0/);
    assert.equal(errors.join('\n'), '');

    await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.setValue('function render(root, FYNX) {'));
    await page.click('.fxb-tools button:text("Run")');
    await page.waitForFunction(() => /Syntax error/.test(document.querySelector('[data-fxb-console]')?.textContent || ''));
    assert.equal(await page.locator('[data-fxb-preview] iframe').count(), 0);

    await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.setValue('function render(root, FYNX) { throw new Error("Widget exploded"); }'));
    await page.click('.fxb-tools button:text("Run")');
    await page.waitForFunction(() => /Widget exploded/.test(document.querySelector('[data-fxb-console]')?.textContent || ''));

    const core = require(path.join(root, 'assets/js/terminal/builder-core.js'));
    await page.evaluate(template => document.querySelector('.CodeMirror').CodeMirror.setValue(template), core.TEMPLATE);
    await page.click('.fxb-tools button:text("Run")');
    await page.waitForFunction(() => /1 snapshot price/.test(document.querySelector('[data-fxb-console]')?.textContent || ''));
    assert.equal(await page.locator('[data-fxb-preview] iframe').count(), 1);
    await page.evaluate(() => { window.__T.S.quotes = {}; });
    await page.click('.fxb-tools button:text("Run")');
    await page.waitForFunction(() => /No prices are in this terminal snapshot/.test(document.querySelector('[data-fxb-console]')?.textContent || ''));
    assert.equal(await page.locator('[data-fxb-console]').innerText().then(text => /510\.50|100\.00|invented a/.test(text) && !/Nothing was invented/.test(text)), false);
    await page.click('.fxb-tools button:text("Stop")');
    await page.waitForFunction(() => document.querySelector('[data-fxb-console]')?.textContent === 'Stopped.');

    await page.evaluate(template => {
      document.querySelector('.CodeMirror').CodeMirror.setValue(template.replace('Global Market Intelligence', 'FYNX_MARKER_77'));
      const name = document.querySelector('[aria-label="Project name"]');
      name.value = 'Alice Private Book';
      name.dispatchEvent(new Event('input', {bubbles: true}));
    }, core.TEMPLATE);
    await page.fill('[data-fxb-find]', 'function');
    await page.click('.fxb-find button:text("Find")');
    const found = await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getSelection());
    assert.equal(found, 'function');
    await page.click('.fxb-tools button:text("Save")');
    await page.waitForFunction(() => /this browser only|Not saved to your account/.test(document.querySelector('[data-fxb-console]')?.textContent || ''));
    const saved = await page.evaluate(() => localStorage.getItem('fx-term-builder-v1:alice'));
    assert.match(saved, /Alice Private Book/);
    assert.match(saved, /FYNX_MARKER_77/);
    assert.equal(await page.evaluate(() => localStorage.getItem('fx-term-builder-v1:bob')), null);

    await page.reload({waitUntil: 'domcontentloaded'});
    await page.evaluate(() => window.__fxbOpen());
    await page.waitForFunction(() => document.querySelector('.CodeMirror')?.CodeMirror?.getValue?.().includes('FYNX_MARKER_77'));
    assert.match(await page.locator('.fxb-side').innerText(), /Alice Private Book/);

    await page.click('[data-fxb-install]');
    await page.waitForFunction(() => /this browser only/.test(document.body.dataset.said || ''));
    const said = await page.evaluate(() => document.body.dataset.said);
    assert.match(said, /will not follow you to another device/);
    assert.doesNotMatch(said, /Other people cannot see it/);
    const installed = await page.evaluate(() => ({
      panels: Object.keys(window.__T.PANELS),
      layout: window.__T.store.mem['layout-all']
    }));
    assert.ok(installed.panels.some(key => key.startsWith('mine-p')));
    assert.match(installed.layout, /mine-p/);

    const box = await page.locator('[data-fxb-split="side"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + 30);
    await page.mouse.up();
    const side = await page.evaluate(() => getComputedStyle(document.querySelector('.fxb')).getPropertyValue('--fxb-side').trim());
    assert.ok(parseInt(side, 10) > 248, side);

    await page.setViewportSize({width: 800, height: 900});
    const stacked = await page.evaluate(() => {
      const split = getComputedStyle(document.querySelector('[data-fxb-split="side"]')).display;
      const sideTop = document.querySelector('.fxb-side').getBoundingClientRect().top;
      const editorTop = document.querySelector('.fxb-editor').getBoundingClientRect().top;
      return {split, stacked: editorTop > sideTop};
    });
    assert.equal(stacked.split, 'none');
    assert.equal(stacked.stacked, true);

    await page.evaluate(() => window.__fxbSetUser({uid: 'bob'}));
    await page.waitForFunction(() => !document.querySelector('.fxb-side')?.innerText.includes('Alice Private Book'));
    const keys = await page.evaluate(() => ({
      alice: localStorage.getItem('fx-term-builder-v1:alice'),
      bob: localStorage.getItem('fx-term-builder-v1:bob'),
      editor: document.querySelector('.CodeMirror')?.CodeMirror?.getValue?.() || ''
    }));
    assert.match(keys.alice, /Alice Private Book/);
    assert.equal(keys.bob, null);
    assert.equal(keys.editor.includes('FYNX_MARKER_77'), false);
    assert.equal(errors.join('\n'), '');
  } finally {
    await browser.close();
    server.close();
  }
});

test('an accepted account save is labeled as an account save and stays private', {timeout: 60000}, async () => {
  const server = await startServer();
  const browser = await chromium.launch({headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}});
    await mockFirebase(page);
    await page.goto(`http://127.0.0.1:${server.address().port}/builder-ui.html`, {waitUntil: 'domcontentloaded'});
    await page.evaluate(() => { window.__fxbDeny = false; window.__fxbOpen(); });
    await page.waitForFunction(() => /Private to your account|Loading your projects/.test(document.querySelector('[data-fxb-status]')?.textContent || ''));
    await page.waitForFunction(() => document.querySelector('[data-fxb-status]')?.textContent === 'Private to your account');
    const core = require(path.join(root, 'assets/js/terminal/builder-core.js'));
    await page.evaluate(template => {
      document.querySelector('.CodeMirror').CodeMirror.setValue(template);
      const name = document.querySelector('[aria-label="Project name"]');
      name.value = 'Alice Account Book';
      name.dispatchEvent(new Event('input', {bubbles: true}));
    }, core.TEMPLATE);
    await page.click('.fxb-tools button:text("Save")');
    await page.waitForFunction(() => /Synced to your account as version/.test(document.querySelector('[data-fxb-console]')?.textContent || ''));
    await page.click('[data-fxb-install]');
    await page.waitForFunction(() => /Other people cannot see it/.test(document.body.dataset.said || ''));
    const stored = await page.evaluate(() => (window.__fxbDocs || []).map(row => row.path));
    assert.ok(stored.some(path => path.startsWith('users/alice/builderProjects/p')));
    assert.ok(stored.some(path => path === 'users/alice/builderInstalls/current' || path.endsWith('/builderInstalls/current')));
    await page.evaluate(() => window.__fxbSetUser({uid: 'bob'}));
    await page.waitForFunction(() => !document.querySelector('.fxb-side')?.innerText.includes('Alice Account Book'));
    assert.equal(await page.evaluate(() => (document.querySelector('.CodeMirror')?.CodeMirror?.getValue?.() || '').includes('Alice Account Book')), false);
  } finally {
    await browser.close();
    server.close();
  }
});

test('reopening builder preserves the unsaved latest code and independent saved projects', {timeout: 60000}, async () => {
  const server = await startServer();
  const browser = await chromium.launch({headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  try {
    const page = await browser.newPage();
    await mockFirebase(page);
    await page.goto(`http://127.0.0.1:${server.address().port}/builder-ui.html`, {waitUntil: 'domcontentloaded'});
    await page.evaluate(() => { window.__fxbDeny = false; window.__fxbOpen(); });
    await page.waitForFunction(() => document.querySelector('[data-fxb-status]')?.textContent === 'Private to your account');
    const codeA = 'function render(root, FYNX) { root.textContent = "PROJECT_A_MARKER"; }';
    const codeB = 'function render(root, FYNX) { root.textContent = "PROJECT_B_MARKER"; }';
    const setCodeAndName = async (code, name) => page.evaluate(({code, name}) => {
      document.querySelector('.CodeMirror').CodeMirror.setValue(code);
      const input = document.querySelector('[aria-label="Project name"]');
      input.value = name;
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }, {code, name});
    await setCodeAndName(codeA, 'Independent Project A');
    await page.click('.fxb-tools button:text("Save")');
    await page.waitForFunction(() => /Synced to your account as version/.test(document.querySelector('[data-fxb-console]')?.textContent || ''));
    await page.click('button:text("New project")');
    await setCodeAndName(codeB, 'Independent Project B');
    await page.click('.fxb-tools button:text("Run")');
    await page.waitForFunction(() => /PROJECT_B_MARKER/.test(document.querySelector('[data-fxb-preview]')?.textContent || '') ||
      !!document.querySelector('[data-fxb-preview] iframe'));
    await page.waitForFunction(() => /Saved to this browser/.test(document.querySelector('[data-fxb-save]')?.textContent || ''));
    // Regression: remount without signing out or refreshing. Previously the
    // auth-time in-memory draft replaced the latest locally preserved code.
    await page.evaluate(() => window.__fxbOpen());
    assert.equal(await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue()), codeB);
    await page.click('.fxb-tools button:text("Save")');
    await page.waitForFunction(() => /Synced to your account as version/.test(document.querySelector('[data-fxb-console]')?.textContent || ''));
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.evaluate(() => { window.__fxbDeny = false; window.__fxbOpen(); });
    await page.waitForFunction(() => document.querySelector('[data-fxb-status]')?.textContent === 'Private to your account');
    await page.click('button:text("Independent Project A")');
    assert.equal(await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue()), codeA);
    await page.click('button:text("Independent Project B")');
    assert.equal(await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue()), codeB);
    const docs = await page.evaluate(() => (window.__fxbDocs || []).filter(row => row.path.includes('/builderProjects/')));
    assert.equal(docs.length, 2);
    assert.notEqual(docs[0].id, docs[1].id);
  } finally {
    await browser.close();
    server.close();
  }
});
