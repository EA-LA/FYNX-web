'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/js/vix-chart.js'), 'utf8');

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this._text = '';
    this.listeners = {};
    this.disabled = false;
    this.parent = null;
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this._text = ''; this.append(...children); }
  remove() { if(this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  click() { this.listeners.click?.(); }
  querySelector(selector) {
    const matches = element => selector === '[data-vix-retry-status]' && element.dataset.vixRetryStatus !== undefined;
    for (const child of this.children) {
      if (matches(child)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  find(tag) {
    if (this.tagName === tag) return this;
    for (const child of this.children) { const found = child.find(tag); if(found) return found; }
    return null;
  }
}

const sample = () => ({
  rows: [{date: '2026-11-13', close: 19.1}, {date: '2026-11-12', close: 18.8}, {date: '2026-11-14', close: 20.25}],
  observationDate: '2026-11-14', fetchedAt: '2026-11-15T03:00:00Z', stale: false
});
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
function setup(initial = sample(), options = {}) {
  const root = new Element('div');
  const button = new Element('button');
  let data = initial, requestCount = 0;
  const calls = [];
  const document = {
    getElementById: id => id === 'volWidget' ? root : id === 'retryVix' ? button : null,
    createElement: tag => new Element(tag),
    createElementNS: (_ns, tag) => new Element(tag)
  };
  const sandbox = {
    document, window: {}, Date, AbortSignal: options.AbortSignal ?? AbortSignal,
    AbortController: options.noController ? undefined : AbortController,
    setTimeout: options.setTimeout ?? setTimeout, clearTimeout: options.clearTimeout ?? clearTimeout,
    fetch: async (_url, init) => {
      requestCount++;
      calls.push({url:_url, signal:init.signal});
      if (typeof data === 'function') return data(init.signal);
      if(data instanceof Error) throw data;
      return {ok: true, json: async () => data};
    }
  };
  vm.runInNewContext(source, sandbox);
  return {root, button, calls, setData(next) { data = next; }, get requests() { return requestCount; }};
}

test('renders sorted, source-verified Cboe dates and a monochrome chart', async () => {
  const app = setup();
  await settle();
  assert.match(app.root.textContent, /20\.25VIX · Daily close 2026-11-14 \(UTC\)/);
  assert.match(app.root.textContent, /Latest source observation 2026-11-14 \(UTC\)/);
  const svg = app.root.find('svg');
  assert.ok(svg);
  assert.match(svg.getAttribute('aria-label'), /not live quotes/);
  assert.equal(svg.find('polyline').getAttribute('stroke'), 'currentColor');
  assert.ok(svg.find('polyline').getAttribute('points').split(' ').length === 3);
  assert.equal(app.button.disabled, false);
  assert.equal(app.root.getAttribute('aria-busy'), null);
  assert.equal(app.requests, 1);
  assert.match(app.calls[0].url, /webMarketAnalytics\?kind=vix$/);
  assert.ok(app.calls[0].signal);
});

test('rejects invalid and malicious source dates without injecting markup', async () => {
  const app = setup({...sample(), rows: [{date: '2026-11-13', close: 20}, {date: '<img src=x onerror=alert(1)>', close: 21}]});
  await settle();
  assert.match(app.root.textContent, /observations are unavailable/);
  assert.equal(app.root.find('svg'), null);
});

test('rejects invalid price, duplicate date, and malformed feed rather than drawing a misleading trend', async () => {
  const app = setup({...sample(), rows: [{date:'2026-11-12',close:18}, {date:'2026-11-13',close:Infinity}]});
  await settle();
  assert.equal(app.root.find('svg'), null);
  app.setData({...sample(), rows: [{date:'2026-11-13',close:18},{date:'2026-11-13',close:19}]});
  app.button.click(); await settle();
  assert.equal(app.root.find('svg'), null);
  app.setData({rows: []});
  app.button.click(); await settle();
  assert.match(app.root.textContent, /No values are estimated/);
});

test('preserves last verified observations across an outage and clears warning on recovery', async () => {
  const app = setup();
  await settle();
  app.setData(new Error('Offline'));
  app.button.click(); await settle();
  assert.ok(app.root.find('svg'));
  assert.match(app.root.textContent, /Update failed\. Showing the last sourced daily observations/);
  assert.equal(app.root.querySelector('[data-vix-retry-status]').getAttribute('role'), 'status');
  app.button.click(); await settle();
  assert.equal(app.root.children.filter(child => child.dataset.vixRetryStatus).length, 1);
  app.setData({...sample(),observationDate:'2026-11-15',rows: [{date:'2026-11-14',close:22},{date:'2026-11-15',close:23}]});
  app.button.click(); await settle();
  assert.match(app.root.textContent, /23\.00VIX/);
  assert.doesNotMatch(app.root.textContent, /Update failed/);
});

test('serializes retries while request is in-flight and releases button afterward', async () => {
  let finish;
  const app = setup(() => new Promise(resolve => { finish = resolve; }));
  assert.equal(app.requests, 1);
  assert.equal(app.button.disabled, true);
  app.button.click(); app.button.click();
  assert.equal(app.requests, 1);
  finish({ok:true, json:async()=>sample()});
  await settle();
  assert.equal(app.button.disabled,false);
  assert.ok(app.root.find('svg'));
});

test('stale and missing retrieval timestamps are explicitly labeled', async () => {
  const app = setup({...sample(),stale:true,fetchedAt:'not-a-date'});
  await settle();
  assert.match(app.root.textContent, /Stale source/);
  assert.match(app.root.textContent, /Retrieval time unavailable/);
  assert.doesNotMatch(app.root.textContent, /Invalid Date/);
});


test('rejects tomorrow or future daily closes and allows recovery from an invalid first load', async () => {
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const app = setup({...sample(), observationDate: tomorrow,
    rows: [{date:'2026-11-13',close:19.1},{date:tomorrow,close:21}]});
  await settle();
  assert.equal(app.root.find('svg'), null);
  assert.match(app.root.textContent, /observations are unavailable/);
  app.setData(sample());
  app.button.click();
  await settle();
  assert.ok(app.root.find('svg'));
  assert.match(app.root.textContent, /Latest source observation 2026-11-14/);
});

test('rejects mismatched declared observation date without erasing a verified chart', async () => {
  const app = setup();
  await settle();
  app.setData({...sample(), observationDate:'2026-11-13'});
  app.button.click(); await settle();
  assert.ok(app.root.find('svg'));
  assert.match(app.root.textContent, /Update failed.*last sourced/);
  assert.match(app.root.textContent, /20\.25VIX · Daily close 2026-11-14/);
});

test('flags old history and does not claim future-dated retrieval metadata as verified', async () => {
  const app = setup({...sample(), stale:false, fetchedAt:'2099-01-01T12:00:00Z',
    observationDate:'2020-01-03',
    rows:[{date:'2020-01-02',close:14.2},{date:'2020-01-03',close:14.7}]});
  await settle();
  assert.ok(app.root.find('svg'));
  assert.match(app.root.textContent, /Stale source/);
  assert.match(app.root.textContent, /Retrieval time unavailable/);
  assert.doesNotMatch(app.root.textContent, /2099/);
});


test('loads verified history on older browsers without AbortSignal.timeout', async () => {
  const app = setup(sample(), {AbortSignal: {}});
  await settle();
  assert.equal(app.requests, 1);
  assert.ok(app.root.find('svg'));
  assert.equal(app.button.disabled, false);
});

test('a stalled JSON body times out without AbortController; a late response cannot replace recovery', async () => {
  let expire, finishBody, clearCount = 0;
  const app = setup(() => ({ok: true, json: () => new Promise(resolve => { finishBody = resolve; })}), {
    AbortSignal: {}, noController: true,
    setTimeout: (callback, delay) => { assert.equal(delay, 20000); expire = callback; return 1; },
    clearTimeout: () => { clearCount++; }
  });
  await settle();
  assert.equal(app.button.disabled, true);
  expire();
  await settle();
  assert.equal(app.button.disabled, false);
  assert.match(app.root.textContent, /observations are unavailable/);
  assert.equal(clearCount, 1);
  app.setData(sample());
  app.button.click();
  await settle();
  assert.ok(app.root.find('svg'));
  finishBody({...sample(), observationDate: '2026-11-15', rows: [{date:'2026-11-14',close:80},{date:'2026-11-15',close:90}]});
  await settle();
  assert.match(app.root.textContent, /20\.25VIX/);
  assert.doesNotMatch(app.root.textContent, /90\.00VIX/);
  assert.equal(clearCount, 2);
});
