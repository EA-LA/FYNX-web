/* Market Movers recovery, trust and retry regression tests. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/home-movers.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const snapshot = Object.freeze({
  stocksAsOf: '2026-11-13T12:00:00Z',
  cryptoAsOf: '2026-11-13T12:00:00Z',
  gainers: [{ symbol: 'AAPL', name: 'Apple<img src=x onerror=alert(1)>', price: 245.12, changePct: 1.5, marketCap: 2500000000000 }],
  losers: [], active: [], crypto: [], aiUnder3: []
});
function setup(initialMode = 'ok') {
  const dom = new JSDOM('<div id="homeSecondaryStories"></div>', {
    url: 'https://www.fynxfinanceworld.com/', runScripts: 'outside-only'
  });
  const w = dom.window;
  let mode = initialMode, requests = 0, pending = null;
  const intervals = [], timeouts = new Map();
  let nextTimer = 0;
  w.setInterval = (fn, ms) => { assert.equal(ms, 300000); intervals.push(fn); return ++nextTimer; };
  w.setTimeout = (fn, ms) => { assert.equal(ms, 12000); const id = ++nextTimer; timeouts.set(id, fn); return id; };
  w.clearTimeout = id => { timeouts.delete(id); };
  w.fetch = (_url, opts) => {
    requests++;
    assert.equal(opts.cache, 'no-store');
    assert.ok(opts.signal, 'requests must be abortable');
    if (mode === 'fail') return Promise.reject(Error('offline'));
    if (mode === 'invalid') return Promise.resolve({ ok: true, json: async () => ({ gainers: null }) });
    if (mode === 'stall') return new Promise((_, reject) => {
      pending = { signal: opts.signal };
      opts.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
    });
    return Promise.resolve({ ok: true, json: async () => snapshot });
  };
  w.eval(source);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {
    dom, w, intervals, timeouts, get requests() { return requests; }, get pending() { return pending; },
    mode(next) { mode = next; },
    host() { return w.document.querySelector('.fx-movers'); },
    close() { w.close(); }
  };
}
test('a failed initial request leaves visible retryable content rather than hiding the widget', async () => {
  const app = setup('fail');
  try {
    await flush(); await flush();
    assert.ok(app.host());
    assert.equal(app.host().hidden, false);
    assert.match(app.host().textContent, /Market movers are temporarily unavailable/);
    assert.match(app.host().textContent, /No market prices are estimated/);
    assert.equal(app.host().querySelector('.fx-movers-error').getAttribute('role'), 'status');
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 0);
    app.mode('ok'); app.host().querySelector('[data-movers-retry]').click();
    await flush(); await flush();
    assert.match(app.host().textContent, /AAPL/);
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 1);
    assert.equal(app.host().querySelector('[data-movers-retry]'), null);
    assert.equal(app.host().querySelector('.fx-live').classList.contains('is-stale'), false);
  } finally { app.close(); }
});
test('a failed refresh retains sourced rows, shows failure state and supports a successful retry', async () => {
  const app = setup();
  try {
    await flush(); await flush();
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 1);
    app.mode('fail'); app.intervals[0]();
    await flush(); await flush();
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 1);
    assert.match(app.host().textContent, /Update failed. Showing the previous snapshot/);
    assert.equal(app.host().querySelector('.fx-live').classList.contains('is-stale'), true);
    app.mode('ok'); app.host().querySelector('[data-movers-retry]').click();
    await flush(); await flush();
    assert.doesNotMatch(app.host().textContent, /Update failed/);
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 1);
    assert.equal(app.host().querySelector('.fx-live').classList.contains('is-stale'), false);
  } finally { app.close(); }
});
test('stalled requests time out and restore the retry action', async () => {
  const app = setup('stall');
  try {
    assert.equal(app.requests, 1);
    assert.ok(app.pending);
    assert.equal(app.timeouts.size, 1);
    [...app.timeouts.values()][0]();
    await flush(); await flush();
    assert.equal(app.pending.signal.aborted, true);
    assert.match(app.host().textContent, /temporarily unavailable/);
    assert.ok(app.host().querySelector('[data-movers-retry]'));
    assert.equal(app.timeouts.size, 0);
    app.mode('ok'); app.host().querySelector('[data-movers-retry]').click();
    await flush(); await flush();
    assert.match(app.host().textContent, /AAPL/);
  } finally { app.close(); }
});
test('repeated scheduled refreshes do not start duplicate network requests while one is pending', async () => {
  const app = setup('stall');
  try {
    app.intervals[0](); app.intervals[0]();
    assert.equal(app.requests, 1);
    [...app.timeouts.values()][0]();
    await flush(); await flush();
    app.mode('ok'); app.intervals[0]();
    await flush(); await flush();
    assert.equal(app.requests, 2);
  } finally { app.close(); }
});
test('market identifiers and descriptions are escaped rather than inserted as executable HTML', async () => {
  const app = setup();
  try {
    await flush(); await flush();
    assert.equal(app.host().querySelectorAll('img,script').length, 0);
    assert.match(app.host().textContent, /Apple<img src=x onerror=alert\(1\)>/);
    app.host().querySelector('[data-tab="crypto"]').click();
    assert.match(app.host().textContent, /Nothing qualifies/);
  } finally { app.close(); }
});
