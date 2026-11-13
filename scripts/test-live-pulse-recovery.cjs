'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/live-pulse.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); }

function setup(mode = 'ok') {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>', {
    url: 'https://www.fynxfinanceworld.com/learn.html', runScripts: 'outside-only'
  });
  const w = dom.window;
  Object.defineProperty(w.document, 'hidden', {configurable: true, value: false});
  const intervals = [], timeouts = new Map();
  let sequence = 0, requests = 0, pendingSignal = null;
  const quote = {
    generatedAt: '2026-11-13T16:48:32Z', stale: false,
    items: [{symbol: '^GSPC', label: 'S&P 500', price: 7515.05,
      changePercent: -1.019, spark: [7600, 7515.05]}]
  };
  w.setInterval = (callback, ms) => { assert.equal(ms, 300000); intervals.push(callback); return ++sequence; };
  w.setTimeout = (callback, ms) => { assert.equal(ms, 12000); const id = ++sequence; timeouts.set(id, callback); return id; };
  w.clearTimeout = id => timeouts.delete(id);
  w.fetch = (_url, options) => {
    requests++;
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal, 'requests must support cancellation');
    if (mode === 'fail') return Promise.reject(new Error('offline'));
    if (mode === 'empty') return Promise.resolve({ok: true, json: async () => ({items: []})});
    if (mode === 'stall') return new Promise((_, reject) => {
      pendingSignal = options.signal;
      options.signal.addEventListener('abort', () => reject(Error('aborted')), {once: true});
    });
    if (mode === 'stale') return Promise.resolve({ok: true, json: async () => ({...quote, stale: true})});
    return Promise.resolve({ok: true, json: async () => quote});
  };
  w.eval(source);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {
    w, intervals, timeouts, setMode: value => { mode = value; },
    get requests() { return requests; },
    get pendingSignal() { return pendingSignal; },
    strip: () => w.document.querySelector('.lp-strip'),
    close: () => w.close()
  };
}

test('initial offline failure is readable and manually retryable, without fabricated quotes', async () => {
  const app = setup('fail');
  try {
    await settle();
    const strip = app.strip();
    assert.ok(strip && strip.isConnected);
    assert.equal(strip.hidden, false);
    assert.match(strip.textContent, /Market pulse unavailable. No prices are estimated/);
    assert.equal(strip.querySelectorAll('.lp-item').length, 0);
    assert.equal(strip.querySelector('.lp-feedback').getAttribute('role'), 'status');
    app.setMode('ok');
    strip.querySelector('.lp-retry').click();
    await settle();
    assert.equal(strip.querySelectorAll('.lp-item').length, 2);
    assert.equal(strip.querySelector('.lp-feedback').hidden, true);
    assert.match(strip.querySelector('.lp-asof').textContent, /Delayed/);
  } finally { app.close(); }
});

test('failed refresh preserves sourced prices but clearly labels them as stale', async () => {
  const app = setup();
  try {
    await settle();
    assert.equal(app.strip().querySelectorAll('.lp-item').length, 2);
    app.setMode('fail'); app.intervals[0]();
    await settle();
    assert.equal(app.strip().querySelectorAll('.lp-item').length, 2);
    assert.match(app.strip().textContent, /Update failed. Showing the last sourced snapshot/);
    assert.match(app.strip().querySelector('.lp-asof').textContent, /Stale/);
    app.setMode('ok'); app.strip().querySelector('.lp-retry').click();
    await settle();
    assert.equal(app.strip().querySelector('.lp-feedback').hidden, true);
    assert.equal(app.strip().classList.contains('is-stale'), false);
  } finally { app.close(); }
});

test('stalled requests abort after twelve seconds and recover on retry', async () => {
  const app = setup('stall');
  try {
    assert.equal(app.requests, 1);
    assert.equal(app.timeouts.size, 1);
    [...app.timeouts.values()][0]();
    await settle();
    assert.equal(app.pendingSignal.aborted, true);
    assert.match(app.strip().textContent, /unavailable/);
    assert.equal(app.timeouts.size, 0);
    app.setMode('ok'); app.strip().querySelector('.lp-retry').click();
    await settle();
    assert.equal(app.strip().querySelectorAll('.lp-item').length, 2);
  } finally { app.close(); }
});

test('scheduled refresh never duplicates an in-flight network request', async () => {
  const app = setup('stall');
  try {
    app.intervals[0](); app.intervals[0]();
    assert.equal(app.requests, 1);
    [...app.timeouts.values()][0]();
    await settle();
    app.setMode('ok'); app.intervals[0]();
    await settle();
    assert.equal(app.requests, 2);
  } finally { app.close(); }
});

test('an empty response never produces estimated quotes, and source stale flags are honored', async () => {
  const app = setup('empty');
  try {
    await settle();
    assert.match(app.strip().textContent, /No prices are estimated/);
    app.setMode('stale'); app.strip().querySelector('.lp-retry').click();
    await settle();
    assert.match(app.strip().querySelector('.lp-asof').textContent, /Stale/);
    assert.equal(app.strip().querySelector('.lp-tag-sub').textContent, 'Stale');
    assert.equal(app.strip().querySelector('.lp-item').getAttribute('href'), '/terminal.html?sym=%5EGSPC');
  } finally { app.close(); }
});
