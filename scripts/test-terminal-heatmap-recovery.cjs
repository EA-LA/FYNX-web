'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');

const source = readFileSync(path.join(__dirname, '..', 'assets/js/terminal/heatmaps.js'), 'utf8');

function harness({saved = {}, headlines = [], desks = {}, failScanner = false, fxQuote = null} = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://www.fynxfinanceworld.com/terminal.html'
  });
  const {document} = dom.window;
  const roots = new Map(), pages = {}, reported = [], selectedTabs = [];
  let panelRetries = 0, pageRetries = 0;

  function el(tag, className = '', value = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined && value !== null) element.textContent = String(value);
    return element;
  }
  function btn(label, className = '', click = () => {}, accessibleLabel) {
    const element = el('button', className, label);
    element.type = 'button';
    if (accessibleLabel) element.setAttribute('aria-label', accessibleLabel);
    element.addEventListener('click', click);
    return element;
  }
  const T = {
    S: {briefing: headlines, desks, deskKey: 'stocks'},
    el, btn,
    svg: (tag, attributes = {}) => {
      const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
      return element;
    },
    signed: value => String(value), big: value => String(value), finite: Number.isFinite,
    quoteFor: () => fxQuote, universe: groups => fxQuote && groups.includes('FX majors') ? ['EURUSD=X'] : [], shortOf: value => value, nameOf: value => value,
    focusOn() {}, panel: id => {
      if (!roots.has(id)) {
        const root = el('section'); document.body.append(root); roots.set(id, root);
      }
      return roots.get(id);
    },
    setText() {}, inspect() {}, kv() {}, ago: () => 'recent',
    loadNews: async () => {},
    headlineRow: h => el('p', '', h.title),
    loadScanner: async () => {
      if (failScanner) throw new Error('Scanner unavailable');
      return null;
    },
    store: {get: key => saved[key] ?? null, set: (key, value) => {saved[key] = value;}},
    report: (key, err) => reported.push({key, message: err.message}),
    R: () => {panelRetries++;},
    PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {}, RENDER: {}, EXTRA_GROUPS: [],
    PAGE_NAMES: [], DESK_DEFS: {}
  };
  const PG = {
    add: (key, _label, render) => {pages[key] = render;},
    setHead() {},
    pageTabs: (_tabs, selected) => {selectedTabs.push(selected); return el('nav');},
    rerender: () => {pageRetries++;}
  };
  const context = {
    window: dom.window, document, innerWidth: 375,
    ResizeObserver: class {observe() {} disconnect() {}},
    setInterval() {return 0;}
  };
  vm.runInNewContext(source, context, {timeout: 1000});
  assert.equal(dom.window.FynxTerminalPlugins.length, 1);
  dom.window.FynxTerminalPlugins[0](T, PG);
  function host() {
    const root = el('main'); document.body.append(root); return root;
  }
  return {T, PG, pages, host, roots, reported, selectedTabs,
    get panelRetries() {return panelRetries;},
    get pageRetries() {return pageRetries;}
  };
}

test('invalid saved Heat maps tab safely falls back to AI without overwriting saved preferences', async () => {
  const saved = {'hm-page': 'removed-legacy-map'};
  const h = harness({saved});
  const root = h.host();
  await h.pages.heatmaps(root);
  assert.equal(h.selectedTabs.at(-1), 'aimap');
  assert.match(root.textContent, /scanner universe is being published/);
  assert.equal(saved['hm-page'], 'removed-legacy-map');
  assert.equal(h.reported.length, 0);
});

test('valid saved tab remains selected when opening Heat maps', async () => {
  const h = harness({saved: {'hm-page': 'newsmap'}});
  const root = h.host();
  await h.pages.heatmaps(root);
  assert.equal(h.selectedTabs.at(-1), 'newsmap');
  assert.match(root.textContent, /verified publication times in the last 24 hours/);
});

test('failed scanner request shows an actionable panel error instead of a permanent spinner', async () => {
  const h = harness({failScanner: true});
  await h.T.RENDER.aimap();
  const root = h.roots.get('aimap');
  assert.match(root.textContent, /Heat map unavailable right now/);
  assert.equal(root.querySelector('[role="alert"]')?.tagName, 'P');
  assert.equal(h.reported.length, 1);
  root.querySelector('button').click();
  assert.equal(h.panelRetries, 1);
});

test('failed scanner request shows an actionable Heat maps page error', async () => {
  const h = harness({failScanner: true});
  const root = h.host();
  await h.pages.heatmaps(root, 'aimap');
  assert.match(root.textContent, /Heat map unavailable right now/);
  assert.ok(root.querySelector('[role="alert"]'));
  root.querySelector('button').click();
  assert.equal(h.pageRetries, 1);
  assert.equal(h.reported.length, 1);
});

test('news heat map excludes missing, stale and future timestamps rather than claiming 24-hour coverage', async () => {
  const now = Date.now();
  const h = harness({headlines: [
    {title: 'Fed announces policy', publishedAt: null},
    {title: 'Inflation report released', publishedAt: new Date(now - 25 * 3600000).toISOString()},
    {title: 'Oil price swings', publishedAt: new Date(now + 3600000).toISOString()}
  ]});
  await h.T.RENDER.newsmap();
  const root = h.roots.get('newsmap');
  assert.match(root.textContent, /No headlines with verified publication times in the last 24 hours/);
  assert.equal(root.querySelector('.hm-stage'), null);
  assert.equal(h.reported.length, 0);
});

test('null and incomplete headline records do not crash a temporarily incomplete news feed', async () => {
  const h = harness({headlines: [null, undefined, {}, {title: ''}]});
  await h.T.RENDER.newsmap();
  assert.match(h.roots.get('newsmap').textContent, /verified publication times/);
  assert.equal(h.reported.length, 0);
});

test('a valid recently published headline still produces a news heat map', async () => {
  const h = harness({headlines: [
    {title: 'Fed keeps interest rates unchanged', publishedAt: new Date(Date.now() - 60000).toISOString()}
  ]});
  await h.T.RENDER.newsmap();
  const root = h.roots.get('newsmap');
  assert.ok(root.querySelector('.hm-stage'));
  assert.match(root.textContent, /1 headlines/);
  assert.equal(h.reported.length, 0);
});

test('Terminal boot page requests the fixed heatmap JavaScript rather than a cached version', () => {
  const html = readFileSync(path.join(__dirname, '..', 'terminal.html'), 'utf8');
  assert.match(html, /assets\/js\/terminal\/heatmaps\.js\?v=20261121-heatmap-recovery-1/);
});

const cryptoFixture = {
  crypto: {fields:['symbol', 'name', 'price', 'marketCap', 'change24h', 'change7d', 'volume', 'categories'],
    rows:[['BTC', 'Bitcoin fixture', 100, 1e9, 1.2, 2.4, 1e8, []]]},
  sources: {crypto:'Synthetic test feed'}
};

function currencyHeatmap() {
  return harness({fxQuote:{changePercent:0.3, vol20:0.2}});
}

test('a late Crypto response must not replace the active Currency view', async () => {
  const h = currencyHeatmap(), host = h.host();
  let settle;
  h.T.loadScanner = () => new Promise(resolve => {settle = resolve;});
  const pending = h.pages.heatmaps(host, 'cfx');
  assert.match(host.textContent, /Loading crypto/);
  [...host.querySelectorAll('button')].find(b => b.textContent === 'Currencies').click();
  const legend = host.querySelector('.hm-legend');
  assert.match(legend?.textContent, /Spot FX/);
  settle(cryptoFixture); await pending;
  assert.ok(legend.isConnected, 'the existing FX legend is not removed');
  assert.equal(host.querySelectorAll('.hm-stage').length, 0, 'no Crypto treemap leaks into Currencies');
  assert.match(host.querySelector('.hm-legend').textContent, /Spot FX/);
});

test('switching back to Crypto while the shared load is pending renders only the latest Crypto view', async () => {
  const h = currencyHeatmap(), host = h.host();
  let settle;
  const shared = new Promise(resolve => {settle = resolve;});
  h.T.loadScanner = () => shared;
  const pending = h.pages.heatmaps(host, 'cfx');
  const tab = name => [...host.querySelectorAll('button')].find(b => b.textContent === name);
  tab('Currencies').click();
  tab('Crypto').click();
  settle(cryptoFixture); await pending; await new Promise(setImmediate);
  assert.equal(host.querySelectorAll('.hm-stage').length, 1);
  assert.equal(host.querySelectorAll('.hm-legend').length, 1);
  assert.match(host.querySelector('.hm-legend').textContent, /Synthetic test feed/);
});

test('a late rejection does not erase Currencies or show a retry for inactive Crypto', async () => {
  const h = currencyHeatmap(), host = h.host();
  let reject;
  h.T.loadScanner = () => new Promise((resolve, bad) => {reject = bad;});
  const pending = h.pages.heatmaps(host, 'cfx');
  [...host.querySelectorAll('button')].find(b => b.textContent === 'Currencies').click();
  reject(Error('Synthetic scanner outage'));
  await pending;
  assert.match(host.querySelector('.hm-legend').textContent, /Spot FX/);
  assert.ok(!host.querySelector('[role="alert"]'));
  assert.equal(h.reported.length, 0);
});
