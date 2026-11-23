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
    generatedAt: new Date(Date.now() - 10 * 60000).toISOString(), stale: false,
    items: [{symbol: '^GSPC', label: 'S&P 500', price: 7515.05,
      asOf: new Date(Date.now() - 12 * 60000).toISOString(),
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
    if (mode === 'old') return Promise.resolve({ok: true, json: async () => ({...quote,
      generatedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      items: [{...quote.items[0], asOf: new Date(Date.now() - 2.5 * 3600000).toISOString()}]})});
    if (mode === 'future') return Promise.resolve({ok: true, json: async () => ({...quote, generatedAt: new Date(Date.now() + 3600000).toISOString()})});
    if (mode === 'unverified') return Promise.resolve({ok: true, json: async () => ({...quote, generatedAt: 'not-an-ISO-timestamp'})});
    if (mode === 'invalid-row') return Promise.resolve({ok: true, json: async () => ({...quote,
      items: [{...quote.items[0], symbol: ''}, {...quote.items[0], label: null}]})});
    if (mode === 'mixed-rows') return Promise.resolve({ok: true, json: async () => ({...quote,
      items: [{...quote.items[0], symbol: ''}, quote.items[0]]})});
    if (mode === 'old-quote') return Promise.resolve({ok: true, json: async () => ({...quote,
      items: [{...quote.items[0], asOf: new Date(Date.now() - 2 * 3600000).toISOString()}]})});
    if (mode === 'future-quote') return Promise.resolve({ok: true, json: async () => ({...quote,
      items: [{...quote.items[0], asOf: new Date(Date.now() + 3600000).toISOString()}]})});
    if (mode === 'mixed-quote-times') return Promise.resolve({ok: true, json: async () => ({...quote,
      items: [quote.items[0], {...quote.items[0], symbol: 'BTC-USD', label: 'Bitcoin', asOf: 'invalid'}]})});
    if (mode === 'bad-spark') return Promise.resolve({ok: true, json: async () => ({...quote,
      items: [{...quote.items[0], spark: [7600, NaN]}]})});
    if (mode === 'oversized-spark') return Promise.resolve({ok: true, json: async () => ({...quote,
      items: [{...quote.items[0], spark: Array(400).fill(7600)}]})});
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

test('a successful fetch of an old source snapshot is explicitly older, never live', async () => {
  const app = setup('old');
  try {
    await settle();
    assert.equal(app.strip().classList.contains('is-stale'), true);
    assert.equal(app.strip().querySelector('.lp-tag-sub').textContent, 'Older');
    assert.match(app.strip().querySelector('.lp-asof').textContent, /Older snapshot/);
    assert.equal(app.strip().querySelectorAll('.lp-item').length, 2);
  } finally { app.close(); }
});

test('future or invalid source timestamps never display unverified quotes', async () => {
  for (const mode of ['future', 'unverified']) {
    const app = setup(mode);
    try {
      await settle();
      assert.equal(app.strip().classList.contains('is-stale'), true);
      assert.equal(app.strip().querySelector('.lp-tag-sub').textContent, 'Unavailable');
      assert.equal(app.strip().querySelectorAll('.lp-item').length, 0);
      assert.match(app.strip().textContent, /Market pulse unavailable. No prices are estimated/);
    } finally { app.close(); }
  }
});

test('quotes missing a symbol or label never create broken Terminal destinations', async () => {
  const app = setup('invalid-row');
  try {
    await settle();
    assert.equal(app.strip().querySelectorAll('.lp-item').length, 0);
    assert.match(app.strip().textContent, /No prices are estimated/);
    app.setMode('mixed-rows');
    app.strip().querySelector('.lp-retry').click();
    await settle();
    const links = [...app.strip().querySelectorAll('.lp-item')];
    assert.equal(links.length, 2);
    assert.ok(links.every(link => link.getAttribute('href') === '/terminal.html?sym=%5EGSPC'));
  } finally { app.close(); }
});

test('malformed or oversized sparklines cannot generate invalid SVG paths', async () => {
  for (const mode of ['bad-spark', 'oversized-spark']) {
    const app = setup(mode);
    try {
      await settle();
      const strip = app.strip();
      assert.equal(strip.querySelectorAll('.lp-item').length, 2, 'verified prices remain visible');
      assert.equal(strip.querySelectorAll('.lp-spark').length, 0);
      assert.doesNotMatch(strip.innerHTML, /NaN|Infinity|30-day trend/);
      app.setMode('ok');
      strip.querySelector('.lp-retry').click();
      await settle();
      assert.equal(strip.querySelectorAll('.lp-spark').length, 2, 'verified trend recovers');
    } finally { app.close(); }
  }
});

test('invalid refresh preserves and labels the previously verified snapshot', async () => {
  const app = setup();
  try {
    await settle();
    assert.equal(app.strip().querySelectorAll('.lp-item').length, 2);
    app.setMode('unverified');
    app.intervals[0]();
    await settle();
    assert.equal(app.strip().querySelectorAll('.lp-item').length, 2);
    assert.match(app.strip().querySelector('.lp-asof').textContent, /Stale/);
    assert.match(app.strip().textContent, /Showing the last sourced snapshot/);
  } finally { app.close(); }
});

test('fresh verified retry recovers from older snapshot without changing sourced prices', async () => {
  const app = setup('old');
  try {
    await settle();
    app.setMode('ok');
    app.strip().querySelector('.lp-retry').click();
    await settle();
    assert.equal(app.strip().classList.contains('is-stale'), false);
    assert.match(app.strip().querySelector('.lp-asof').textContent, /Delayed snapshot/);
    assert.equal(app.strip().querySelectorAll('.lp-item').length, 2);
    const css = app.w.document.getElementById('lp-style').textContent;
    assert.doesNotMatch(css, /animation:lp-pulse|background:#1f8a5a/);
  } finally { app.close(); }
});

test('a fresh feed never represents an older underlying market observation as current', async () => {
  const app = setup('old-quote');
  try {
    await settle();
    const strip = app.strip();
    assert.equal(strip.querySelector('.lp-tag-sub').textContent, 'Older quotes');
    assert.equal(strip.classList.contains('is-stale'), true);
    assert.match(strip.querySelector('.lp-asof').textContent, /1 quote older than 45 minutes/);
    assert.equal(strip.querySelectorAll('.lp-age').length, 2, 'both visual ticker copies label the old quote');
    assert.match(strip.querySelector('.lp-item').title, /Older sourced quote as of/);
    app.setMode('ok');
    strip.querySelector('.lp-retry').click();
    await settle();
    assert.equal(strip.classList.contains('is-stale'), false);
    assert.equal(strip.querySelectorAll('.lp-age').length, 0);
  } finally { app.close(); }
});

test('invalid or future underlying quote timestamps are never displayed as verified prices', async () => {
  const app = setup('future-quote');
  try {
    await settle();
    assert.equal(app.strip().querySelectorAll('.lp-item').length, 0);
    assert.match(app.strip().textContent, /No prices are estimated/);
    app.setMode('mixed-quote-times');
    app.strip().querySelector('.lp-retry').click();
    await settle();
    assert.equal(app.strip().querySelectorAll('.lp-item').length, 2, 'only valid sourced quote and its ticker copy survive');
    assert.equal(app.strip().querySelector('.lp-tag-sub').textContent, 'Partial');
    assert.match(app.strip().querySelector('.lp-asof').textContent, /timestamps could not be verified/);
    assert.doesNotMatch(app.strip().innerHTML, /Bitcoin/);
  } finally { app.close(); }
});

test('fresh canonical ticker quote does not inherit an older source-batch badge', async () => {
  const app = setup('stale');
  try {
    await settle();
    assert.equal(app.strip().querySelectorAll('.lp-age').length, 2, 'stale source rows are visibly marked older');
    app.w.document.dispatchEvent(new app.w.CustomEvent('fynx:terminal-quotes', {
      detail: {status: 'ok', quotes: {
        '^GSPC': {price: 7520.25, changePercent: 0.25, asOf: new Date(Date.now() - 60000).toISOString()}
      }}
    }));
    const strip = app.strip(), links = [...strip.querySelectorAll('.lp-item')];
    assert.equal(links.length, 2, 'the ticker duplication remains stable');
    assert.match(links[0].textContent, /7,520\.25/, 'a newer canonical quote replaces the old batch price');
    assert.match(links[0].title, /Same quote as the market ticker as of/, 'quote provenance remains visible');
    assert.equal(strip.querySelectorAll('.lp-age').length, 0, 'fresh canonical observations must not inherit batch staleness');
    assert.match(strip.querySelector('.lp-asof').textContent, /Stale snapshot/, 'the older source batch remains disclosed');
  } finally { app.close(); }
});
