'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const groups = require('../content/company-products.cjs');
const products = groups.flatMap(group => group.items);

function localDestination(href) {
  const pathname = new URL(href, 'https://www.fynxfinanceworld.com').pathname;
  const relative = decodeURIComponent(pathname).replace(/^\//, '');
  return [relative || 'index.html', path.posix.join(relative, 'index.html'), relative + '.html']
    .some(file => { try { return fs.statSync(path.join(root, file)).isFile(); } catch { return false; } });
}

test('company catalog uses real public destinations and distinguishes unavailable products', () => {
  assert(groups.length >= 3, 'The company directory must cover more than calculator tools');
  assert(products.length >= 12, 'The directory must expose the broader FYNX product family');
  const ids = new Set();
  for (const group of groups) {
    assert(group.id && group.title && group.items.length, 'Each group needs a name and products');
    assert(!ids.has(group.id), 'Duplicate category: ' + group.id); ids.add(group.id);
    for (const product of group.items) {
      assert(product.name && product.description && product.href, 'Incomplete product in ' + group.id);
      assert.equal(typeof product.description, 'string');
      const url = new URL(product.href, 'https://www.fynxfinanceworld.com');
      assert.equal(url.protocol, 'https:', product.name + ': unsafe URL scheme');
      assert(!url.username && !url.password, product.name + ': credentials must not appear in links');
      assert(!['localhost', '127.0.0.1'].includes(url.hostname), product.name + ': local preview link');
      if (product.href.startsWith('/')) assert(localDestination(product.href), product.name + ': missing local destination ' + product.href);
      if (product.status !== undefined) assert.equal(typeof product.status, 'string');
    }
  }
  for (const name of ['FYNX Wallet', 'Quant Analyst', 'Edge Radar']) {
    const product = products.find(item => item.name.includes(name));
    assert(product, 'Missing known product: ' + name);
    assert(product.status, name + ': public availability needs an explicit label');
  }
});

async function page() {
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><head></head><body><header><div class="terminal-utility-actions"></div></header><div id="fynx-products-launch"><a data-company-products-open href="/products.html">FYNX · Company &amp; Products</a></div><main><button id="existing-control">Existing page control</button></main></body></html>', {
    url: 'https://www.fynxfinanceworld.com/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
  });
  await new Promise(resolve => dom.window.addEventListener('load', resolve, {once:true}));
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.eval(read('assets/js/company-products-data.js'));
  w.eval(read('assets/js/company-products.js'));
  await tick();
  return {dom, w, errors};
}

function openDirectory(w) {
  const trigger = w.document.querySelector('[data-company-products-open]');
  assert(trigger, 'The static products link must remain available before JS enhancement');
  trigger.focus(); trigger.click();
  const dialog = w.document.querySelector('#fynx-products-dialog');
  assert(dialog && dialog.open, 'The company directory should open from its trigger');
  return {trigger, dialog};
}

test('company menu opens without replacing existing controls and closes with focus restored', async () => {
  const {dom,w,errors} = await page();
  try {
    const existing = w.document.querySelector('#existing-control');
    let clicks = 0; existing.addEventListener('click', () => clicks++);
    const {trigger,dialog} = openDirectory(w);
    await tick();
    assert(dialog.contains(w.document.activeElement), 'Keyboard focus must enter the directory');
    assert(dialog.querySelector('[data-company-products-close]'), 'A visible close control is required');
    for (const item of products.filter(product => product.status)) {
      const row = [...dialog.querySelectorAll('[data-product-item]')].find(node => node.textContent.includes(item.name));
      assert(row, 'Missing product: ' + item.name);
      assert(row.textContent.includes(item.status), 'Availability label omitted: ' + item.name);
    }
    dialog.querySelector('[data-company-products-close]').click(); await tick();
    assert.equal(dialog.open, false);
    assert.equal(w.document.activeElement, trigger, 'Close must return focus to the opening control');
    assert.equal(w.document.querySelector('#existing-control'), existing, 'Existing page nodes must survive');
    existing.click(); assert.equal(clicks, 1);
    assert.deepEqual(errors, []);
  } finally {dom.window.close();}
});

test('native Escape/cancel closes the menu and a later activation still works', async () => {
  const {dom,w} = await page();
  try {
    const {trigger,dialog} = openDirectory(w); await tick();
    const cancelled = !dialog.dispatchEvent(new w.Event('cancel', {cancelable:true}));
    // In the browser, an uncancelled dialog cancel event has close() as its default action.
    if (!cancelled && dialog.open) dialog.close();
    await tick();
    assert.equal(dialog.open, false);
    assert.equal(w.document.activeElement, trigger);
    trigger.click(); await tick(); assert(dialog.open);
    w.document.dispatchEvent(new w.CustomEvent('fynx:terminal-header', {bubbles:true}));
    w.document.dispatchEvent(new w.CustomEvent('fynx:terminal-header', {bubbles:true})); await tick();
    assert.equal(w.document.querySelectorAll('#fynx-products-dialog').length, 1, 'Header events must not duplicate the directory');
  } finally {dom.window.close();}
});

test('search has an honest no-match state and clearing it restores all product links', async () => {
  const {dom,w} = await page();
  try {
    const {dialog} = openDirectory(w); await tick();
    const input = dialog.querySelector('[data-company-products-search]');
    assert(input, 'The directory should offer product search');
    const visible = () => [...dialog.querySelectorAll('[data-product-item]')].filter(item => !item.hidden && !item.closest('[hidden]'));
    const initial = visible().length; assert.equal(initial, products.length);
    input.value = 'zzq-no-product-can-match-this-8712'; input.dispatchEvent(new w.Event('input', {bubbles:true})); await tick();
    assert.equal(visible().length, 0);
    assert.match(dialog.querySelector('[data-company-products-count]').textContent, /\b0\b|no (?:products|results|matches)/i);
    input.value = ''; input.dispatchEvent(new w.Event('input', {bubbles:true})); await tick();
    assert.equal(visible().length, initial, 'Clearing search must restore the complete directory');
    input.value = 'wallet'; input.dispatchEvent(new w.Event('input', {bubbles:true})); await tick();
    assert(visible().length > 0 && visible().some(item => /wallet/i.test(item.textContent)));
  } finally {dom.window.close();}
});

test('injection is idempotent and leaves lightweight, authentication, and private sources alone', () => {
  const {inject} = require('./build-company-products.cjs');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fynx-company-products-'));
  const markup = '<!doctype html><html><head><title>Fixture</title></head><body><header><a href="/">FYNX</a></header><main>Original content</main></body></html>';
  const eligible = ['index.html', 'home.html', 'tools/margin.html', 'news/markets.html'];
  const excluded = ['directory.html', 'auth/login.html', 'auth/email-action.html', 'tests/fixtures/example.html', 'backend/private.html', 'output/preview.html'];
  try {
    for (const file of [...eligible,...excluded]) {
      const target = path.join(temporary,file); fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,markup);
    }
    inject(temporary);
    const first = new Map([...eligible,...excluded].map(file => [file,fs.readFileSync(path.join(temporary,file),'utf8')]));
    for (const file of eligible) {
      const document = new JSDOM(first.get(file)).window.document;
      assert.equal(document.querySelectorAll('#fynx-products-launch').length,1,file);
      assert.equal(document.querySelectorAll('[data-company-products-open][href="/products.html"]').length,1,file);
      assert(document.querySelector('script[src*="company-products.js"]'),file);
      assert.equal(document.querySelector('main').textContent,'Original content',file);
    }
    for (const file of excluded) assert.equal(first.get(file),markup,'Excluded route was modified: '+file);
    inject(temporary);
    for (const [file,source] of first) assert.equal(fs.readFileSync(path.join(temporary,file),'utf8'),source,'Second injection changed: '+file);
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
});
