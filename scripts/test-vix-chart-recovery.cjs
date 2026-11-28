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
  const range = new Element('select');
  const rangeControl = new Element('div');
  range.value = '90';
  rangeControl.hidden = true;
  const table = new Element('details');
  const tableBody = new Element('tbody');
  const tableCaption = new Element('caption');
  table.hidden = true;
  table.open = false;
  const comparison = new Element('section');
  const reference = new Element('select');
  const comparisonResult = new Element('p');
  comparison.hidden = true;
  reference.value = '';
  let data = initial, requestCount = 0;
  const calls = [];
  const document = {
    getElementById: id => ({volWidget:root,retryVix:button,vixRange:range,vixRangeControl:rangeControl,vixObservationTable:table,vixObservationRows:tableBody,vixObservationCaption:tableCaption,vixComparison:comparison,vixReferenceDate:reference,vixComparisonResult:comparisonResult})[id] ?? null,
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
  return {root, button, range, rangeControl, table, tableBody, tableCaption, comparison, reference, comparisonResult, calls, setData(next) { data = next; }, get requests() { return requestCount; }};
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

test('range uses only latest verified closes, dates and extrema without a request', async () => {
  const rows = Array.from({length:95},(_,i)=>({
    date:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),close:100-i*.5
  }));
  const app = setup({rows, observationDate:rows[94].date, fetchedAt:'2026-04-06T00:00:00Z'});
  assert.equal(app.rangeControl.hidden,true);
  await settle();
  assert.equal(app.rangeControl.hidden,false);
  const points = () => app.root.find('polyline').getAttribute('points').split(' ').length;
  assert.equal(points(),90);
  assert.match(app.root.textContent,/90 closes · Low 53\.00 \(2026-04-05\) · High 97\.50 \(2026-01-06\) · First-to-last change -44\.50 VIX points/);
  app.range.value='20';app.range.listeners.change();
  assert.equal(points(),20);
  assert.match(app.root.textContent,/20 closes · Low 53\.00 \(2026-04-05\) · High 62\.50 \(2026-03-17\) · First-to-last change -9\.50 VIX points/);
  assert.match(app.root.find('svg').getAttribute('aria-label'),/2026-03-17 to 2026-04-05/);
  app.range.value='60';app.range.listeners.change();
  assert.equal(points(),60);
  assert.equal(app.requests,1);
});

test('partial ranges and failed refresh remain honest across selection and recovery', async () => {
  const app = setup();
  await settle();
  assert.match(app.root.textContent,/3 of 90 requested closes available/);
  app.setData(new Error('offline'));
  app.button.click();await settle();
  app.range.value='20';app.range.listeners.change();
  assert.match(app.root.textContent,/3 of 20 requested closes available/);
  assert.match(app.root.textContent,/Update failed.*last sourced daily observations/);
  assert.equal(app.requests,2);
  app.setData(sample());
  app.button.click();await settle();
  assert.match(app.root.textContent,/3 of 20 requested closes available/);
  assert.doesNotMatch(app.root.textContent,/Update failed/);
});

test('never exposes the chart range control before a verified response', async () => {
  const app = setup({rows:[]});
  await settle();
  app.range.value='20';app.range.listeners.change();
  assert.equal(app.rangeControl.hidden,true);
  assert.equal(app.root.find('svg'),null);
  assert.equal(app.requests,1);
});

test('daily observation table stays hidden until valid data and matches the selected chart range', async () => {
  const rows = Array.from({length:95},(_,i)=>({
    date:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),close:18+i*.125
  }));
  const app = setup({rows,observationDate:rows[94].date,fetchedAt:'2026-04-06T00:00:00Z'});
  assert.equal(app.table.hidden,true);
  await settle();
  assert.equal(app.table.hidden,false);
  assert.equal(app.tableBody.children.length,90);
  const first = app.tableBody.children[0];
  assert.equal(first.children[0].textContent,rows[94].date);
  assert.equal(first.children[0].getAttribute('scope'),'row');
  assert.equal(first.children[1].textContent,String(rows[94].close));
  assert.equal(app.tableBody.children[89].children[0].textContent,rows[5].date);
  app.table.open=true;
  app.range.value='20';app.range.listeners.change();
  assert.equal(app.tableBody.children.length,20);
  assert.equal(app.tableBody.children[19].children[0].textContent,rows[75].date);
  assert.match(app.tableCaption.textContent,/20 closes.*newest first/);
  assert.equal(app.table.open,true);
  assert.equal(app.requests,1);
});

test('table retains validated observations during failed refresh and replaces them on recovery', async () => {
  const app=setup({rows:[]});
  await settle();
  assert.equal(app.table.hidden,true);
  assert.equal(app.tableBody.children.length,0);
  app.setData(sample());app.button.click();await settle();
  assert.equal(app.table.hidden,false);
  assert.match(app.tableCaption.textContent,/3 of 90 requested closes available/);
  app.table.open=true;
  app.setData(new Error('offline'));app.button.click();await settle();
  assert.equal(app.tableBody.children.length,3);
  assert.match(app.root.textContent,/Update failed/);
  app.range.value='20';app.range.listeners.change();
  assert.match(app.tableCaption.textContent,/3 of 20 requested closes available/);
  assert.equal(app.tableBody.children.length,3);
  app.setData({...sample(),observationDate:'2026-11-15',rows:[{date:'2026-11-14',close:22},{date:'2026-11-15',close:23}]});
  app.button.click();await settle();
  assert.equal(app.tableBody.children.length,2);
  assert.equal(app.tableBody.children[0].children[1].textContent,'23');
  assert.equal(app.table.open,true);
  assert.doesNotMatch(app.root.textContent,/Update failed/);
});

test('public page provides a native disclosure and labeled table outside the chart live region', () => {
  const html=fs.readFileSync(require('node:path').join(__dirname,'../markets/volatility.html'),'utf8');
  assert.match(html,/<div id="volWidget" aria-live="polite">[^]*?<\/div>\s*<details[^>]+id="vixObservationTable" hidden>/);
  assert.match(html,/<summary>View daily closing values<\/summary>/);
  assert.match(html,/<caption id="vixObservationCaption">/);
  assert.match(html,/<th scope="col">Date \(UTC\)<\/th><th scope="col">VIX close<\/th>/);
  assert.match(html,/<tbody id="vixObservationRows"><\/tbody>/);
  assert.match(html,/vix-chart\.js\?v=20261128-reference-date/);
});

test('reference comparison uses an actual earlier close, no new request, and no default claim', async () => {
  const app=setup();
  assert.equal(app.comparison.hidden,true);
  await settle();
  assert.equal(app.comparison.hidden,false);
  assert.equal(app.reference.value,'');
  assert.deepEqual(app.reference.children.map(o=>o.value),['','2026-11-13','2026-11-12']);
  app.reference.value='2026-11-13';app.reference.listeners.change();
  assert.match(app.comparisonResult.textContent,/2026-11-13: 19\.10 → 2026-11-14: 20\.25 · \+1\.15 VIX points/);
  app.reference.value='2026-11-14';app.reference.listeners.change();
  assert.match(app.comparisonResult.textContent,/Choose an earlier/);
  assert.equal(app.requests,1);
});

test('reference comparison clears out-of-range dates, retains valid dates and labels failed refresh', async () => {
  const rows=Array.from({length:90},(_,i)=>({
    date:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),close:100-i*.5
  }));
  const payload={rows,observationDate:rows[89].date,fetchedAt:'2026-04-01T00:00:00Z'};
  const app=setup(payload);
  await settle();
  app.reference.value=rows[10].date;app.reference.listeners.change();
  assert.match(app.comparisonResult.textContent,/-39\.50 VIX points/);
  app.range.value='20';app.range.listeners.change();
  assert.equal(app.reference.value,'');
  assert.match(app.comparisonResult.textContent,/Choose an earlier/);
  app.reference.value=rows[80].date;app.reference.listeners.change();
  app.setData(new Error('offline'));app.button.click();await settle();
  assert.match(app.comparisonResult.textContent,/-4\.50 VIX points.*update failed/);
  app.range.value='60';app.range.listeners.change();
  assert.equal(app.reference.value,rows[80].date);
  assert.match(app.comparisonResult.textContent,/update failed/);
  app.setData(payload);app.button.click();await settle();
  assert.equal(app.reference.value,rows[80].date);
  assert.doesNotMatch(app.comparisonResult.textContent,/update failed/);
  assert.equal(app.requests,3);
});

test('reference comparison remains hidden on invalid source and page exposes labeled native select', async () => {
  const app=setup({rows:[]});
  await settle();
  assert.equal(app.comparison.hidden,true);
  const html=fs.readFileSync(require('node:path').join(__dirname,'../markets/volatility.html'),'utf8');
  assert.match(html,/<section[^>]+id="vixComparison"[^>]+hidden>/);
  assert.match(html,/<label for="vixReferenceDate">/);
  assert.match(html,/<select id="vixReferenceDate"[^>]+aria-describedby="vixComparisonHelp"/);
  assert.match(html,/<p[^>]+id="vixComparisonResult" role="status"/);
});
