/* Market Movers recovery, trust and retry regression tests. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/home-movers.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const snapshot = Object.freeze({
  // Recovery tests use a current fixture; stale and invalid timestamps are tested separately.
  stocksAsOf: new Date().toISOString(),
  cryptoAsOf: new Date().toISOString(),
  gainers: [{ symbol: 'AAPL', name: 'Apple<img src=x onerror=alert(1)>', price: 245.12, changePct: 1.5, marketCap: 2500000000000 }],
  losers: [], active: [], crypto: [], aiUnder3: []
});
function setup(initialMode = 'ok', initialSnapshot = snapshot, withoutAbortController = false) {
  const dom = new JSDOM('<div id="homeSecondaryStories"></div>', {
    url: 'https://www.fynxfinanceworld.com/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  if (withoutAbortController) w.AbortController = undefined;
  let mode = initialMode, requests = 0, pending = null, payload = initialSnapshot;
  const intervals = [], timeouts = new Map();
  let nextTimer = 0;
  w.setInterval = (fn, ms) => { assert.equal(ms, 300000); intervals.push(fn); return ++nextTimer; };
  w.setTimeout = (fn, ms) => { assert.equal(ms, 12000); const id = ++nextTimer; timeouts.set(id, fn); return id; };
  w.clearTimeout = id => { timeouts.delete(id); };
  w.fetch = (_url, opts) => {
    requests++;
    assert.equal(opts.cache, 'no-store');
    if (withoutAbortController) assert.equal(opts.signal, undefined, 'legacy webviews omit signal');
    else assert.ok(opts.signal, 'modern requests must be abortable');
    if (mode === 'fail') return Promise.reject(Error('offline'));
    if (mode === 'invalid') return Promise.resolve({ ok: true, json: async () => ({ gainers: null }) });
    if (mode === 'json-stall') return Promise.resolve({ ok: true, json: () => new Promise(() => {}) });
    if (mode === 'stall') return new Promise((_, reject) => {
      pending = { signal: opts.signal };
      opts.signal?.addEventListener('abort', () => reject(Error('aborted')), { once: true });
    });
    return Promise.resolve({ ok: true, json: async () => payload });
  };
  w.eval(source);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {
    dom, w, intervals, timeouts, get requests() { return requests; }, get pending() { return pending; },
    mode(next) { mode = next; },
    snapshot(next) { payload = next; },
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
    assert.match(app.host().textContent, /No verified movers are available/);
  } finally { app.close(); }
});

test('market mover tabs expose one keyboard stop and an associated panel', async () => {
  const app = setup();
  try {
    await flush(); await flush();
    const host = app.host();
    const tabs = Array.from(host.querySelectorAll('[role="tab"]'));
    const panel = host.querySelector('[role="tabpanel"]');
    assert.equal(host.querySelector('[role="tablist"]').getAttribute('aria-label'), 'Market mover categories');
    assert.equal(tabs.length, 5);
    assert.equal(panel.id, 'fx-movers-panel');
    assert.equal(panel.tabIndex, 0);
    tabs.forEach((b, i) => {
      assert.equal(b.id, 'fx-movers-tab-' + b.dataset.tab);
      assert.equal(b.getAttribute('aria-controls'), panel.id);
      assert.equal(b.tabIndex, i === 0 ? 0 : -1);
      assert.equal(b.getAttribute('aria-selected'), i === 0 ? 'true' : 'false');
    });
    assert.equal(panel.getAttribute('aria-labelledby'), tabs[0].id);
    const styles = host.ownerDocument.getElementById('fx-movers-style').textContent;
    assert.match(styles, /min-height:44px/);
    assert.match(styles, /button:focus-visible/);
  } finally { app.close(); }
});
test('arrow/Home/End keys move focus and selection without capturing Tab', async () => {
  const app = setup();
  try {
    await flush(); await flush();
    const host = app.host();
    const tabs = Array.from(host.querySelectorAll('[role="tab"]'));
    const panel = host.querySelector('[role="tabpanel"]');
    function press(key, target = app.w.document.activeElement) {
      const event = new app.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    }
    function active(index) {
      assert.equal(app.w.document.activeElement, tabs[index]);
      assert.equal(panel.getAttribute('aria-labelledby'), tabs[index].id);
      assert.equal(tabs[index].tabIndex, 0);
      assert.equal(tabs.filter(b => b.tabIndex === 0).length, 1);
      assert.equal(tabs.filter(b => b.getAttribute('aria-selected') === 'true').length, 1);
    }
    tabs[0].focus();
    active(0);
    for (const [key, index] of [['ArrowRight',1], ['End',4], ['ArrowRight',0], ['ArrowLeft',4], ['Home',0]]) {
      assert.equal(press(key).defaultPrevented, true);
      active(index);
    }
    assert.equal(press('Tab').defaultPrevented, false);
    tabs[3].click();
    assert.equal(tabs[3].tabIndex, 0);
    assert.equal(tabs[0].tabIndex, -1);
    assert.equal(panel.getAttribute('aria-labelledby'), tabs[3].id);
  } finally { app.close(); }
});

test('unverified source timestamps cannot publish market prices', async () => {
  for (const invalidTime of ['invalid-date', new Date(Date.now() + 60 * 60000).toISOString(), '2026-11-17']) {
    const app = setup('ok', {...snapshot, stocksAsOf: invalidTime});
    try {
      await flush(); await flush();
      assert.equal(app.host().querySelectorAll('.fx-mv').length, 0);
      assert.match(app.host().textContent, /temporarily unavailable/);
      assert.ok(app.host().querySelector('[data-movers-retry]'));
    } finally { app.close(); }
  }
});
test('failed snapshot time validation retains verified prices and retry', async () => {
  const app = setup();
  try {
    await flush(); await flush();
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 1);
    app.snapshot({...snapshot, cryptoAsOf: 'not-a-date'});
    app.intervals[0]();
    await flush(); await flush();
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 1);
    assert.match(app.host().textContent, /Update failed for crypto movers/);
    assert.equal(app.host().querySelector('.fx-live').classList.contains('is-stale'), false);
    assert.ok(app.host().querySelector('[data-movers-retry]'));
    app.snapshot(snapshot);
    app.host().querySelector('[data-movers-retry]').click();
    await flush(); await flush();
    assert.doesNotMatch(app.host().textContent, /Update failed/);
  } finally { app.close(); }
});
test('bad rows do not hide valid movers or break the instrument links', async () => {
  const app = setup('ok', {
    ...snapshot,
    gainers: [
      null, false, {}, { symbol:'', price:1, changePct:1 },
      { symbol:'BAD', price:Infinity, changePct:1 },
      { symbol:'BAD2', price:0, changePct:1 },
      { symbol:'AAPL', name:'Apple', price:245.12, changePct:1.5 }
    ]
  });
  try {
    await flush(); await flush();
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 1);
    assert.match(app.host().querySelector('.fx-mv').textContent, /AAPL/);
    assert.doesNotMatch(app.host().textContent, /Update failed/);
  } finally { app.close(); }
});
test('all unusable rows produce a truthful empty state instead of crashing', async () => {
  const app = setup('ok', {...snapshot, gainers:[null, {symbol:'?', price:NaN, changePct:0}]});
  try {
    await flush(); await flush();
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 0);
    assert.match(app.host().textContent, /No verified movers are available/);
    assert.doesNotMatch(app.host().textContent, /Update failed/);
  } finally { app.close(); }
});


test('verified stocks stay available when independent crypto data is unverified', async () => {
  const app = setup('ok', {...snapshot, cryptoAsOf: null, crypto: [{symbol:'FAKE',price:1,changePct:99}]});
  try {
    await flush(); await flush();
    assert.match(app.host().textContent, /AAPL/);
    assert.match(app.host().textContent, /Update failed for crypto movers/);
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 1);
    assert.equal(app.host().querySelector('.fx-live').classList.contains('is-stale'), false);
    app.host().querySelector('[data-tab="crypto"]').click();
    assert.match(app.host().textContent, /Crypto movers are temporarily unavailable/);
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 0);
    assert.ok(app.host().querySelector('[data-movers-retry]'));
  } finally { app.close(); }
});

test('verified crypto stays available when independent stock data is unverified', async () => {
  const app = setup('ok', {...snapshot, stocksAsOf: null,
    crypto:[{symbol:'BTC',name:'Bitcoin',price:90000,changePct:2,open:'BTC-USD'}]});
  try {
    await flush(); await flush();
    assert.match(app.host().textContent, /Stock movers are temporarily unavailable/);
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 0);
    app.host().querySelector('[data-tab="crypto"]').click();
    assert.match(app.host().textContent, /BTC/);
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 1);
    assert.match(app.host().textContent, /Update failed for stock movers/);
    assert.equal(app.host().querySelector('.fx-live').classList.contains('is-stale'), false);
  } finally { app.close(); }
});

test('partial refresh retains earlier verified crypto but never displays unverified replacement rows', async () => {
  const app = setup('ok', {...snapshot,crypto:[{symbol:'BTC',name:'Bitcoin',price:92000,changePct:1}]});
  try {
    await flush(); await flush();
    app.snapshot({...snapshot, cryptoAsOf:'invalid', crypto:[{symbol:'FAKE',price:1,changePct:99}]});
    app.intervals[0](); await flush(); await flush();
    app.host().querySelector('[data-tab="crypto"]').click();
    assert.match(app.host().textContent, /BTC/);
    assert.doesNotMatch(app.host().textContent, /FAKE/);
    assert.match(app.host().textContent, /Update failed. Showing the previous snapshot/);
    assert.equal(app.host().querySelector('.fx-live').classList.contains('is-stale'), true);
    app.snapshot({...snapshot, crypto:[{symbol:'ETH',name:'Ethereum',price:3100,changePct:3}]});
    app.host().querySelector('[data-movers-retry]').click(); await flush(); await flush();
    assert.match(app.host().textContent, /ETH/);
    assert.doesNotMatch(app.host().textContent, /Update failed/);
    assert.equal(app.host().querySelector('.fx-live').classList.contains('is-stale'), false);
  } finally { app.close(); }
});

test('webviews without AbortController still load, refresh and retry verified movers', async () => {
  const app = setup('ok', snapshot, true);
  try {
    await flush(); await flush();
    assert.equal(app.host().querySelectorAll('.fx-mv').length, 1);
    app.mode('fail'); app.intervals[0]();
    await flush(); await flush();
    assert.match(app.host().textContent, /Update failed. Showing the previous snapshot/);
    app.mode('ok'); app.host().querySelector('[data-movers-retry]').click();
    await flush(); await flush();
    assert.match(app.host().textContent, /AAPL/);
    assert.doesNotMatch(app.host().textContent, /Update failed/);
  } finally { app.close(); }
});

test('webviews without AbortController time out stalled requests and allow retry', async () => {
  const app = setup('stall', snapshot, true);
  try {
    assert.equal(app.requests, 1);
    assert.equal(app.timeouts.size, 1);
    assert.equal(app.pending.signal, undefined);
    [...app.timeouts.values()][0]();
    await flush(); await flush();
    assert.match(app.host().textContent, /temporarily unavailable/);
    assert.ok(app.host().querySelector('[data-movers-retry]'));
    assert.equal(app.timeouts.size, 0);
    app.mode('ok'); app.host().querySelector('[data-movers-retry]').click();
    await flush(); await flush();
    assert.match(app.host().textContent, /AAPL/);
  } finally { app.close(); }
});

test('stalled JSON parsing cannot leave Market Movers loading indefinitely', async () => {
  const app = setup('json-stall');
  try {
    assert.equal(app.requests, 1);
    assert.equal(app.timeouts.size, 1);
    [...app.timeouts.values()][0]();
    await flush(); await flush();
    assert.match(app.host().textContent, /temporarily unavailable/);
    assert.ok(app.host().querySelector('[data-movers-retry]'));
    app.mode('ok'); app.host().querySelector('[data-movers-retry]').click();
    await flush(); await flush();
    assert.match(app.host().textContent, /AAPL/);
  } finally { app.close(); }
});

test('an older valid snapshot cannot replace newer stock prices while crypto advances', async () => {
  const app = setup();
  try {
    await flush(); await flush();
    const older = new Date(Date.parse(snapshot.stocksAsOf) - 60000).toISOString();
    app.snapshot({...snapshot, stocksAsOf: older,
      gainers:[{symbol:'OLD',name:'Old stock',price:1,changePct:3}],
      cryptoAsOf:new Date(Date.parse(snapshot.cryptoAsOf) + 1000).toISOString(),
      crypto:[{symbol:'ETH',price:3000,changePct:2}]});
    app.intervals[0](); await flush(); await flush();
    assert.match(app.host().textContent, /AAPL/);
    assert.doesNotMatch(app.host().textContent, /OLD/);
    assert.match(app.host().textContent, /Update failed. Showing the previous snapshot/);
    app.host().querySelector('[data-tab="crypto"]').click();
    assert.match(app.host().textContent, /ETH/);
    assert.match(app.host().textContent, /Update failed for stock movers/);
    app.snapshot({...snapshot, stocksAsOf:new Date(Date.parse(snapshot.stocksAsOf) + 2000).toISOString(),
      gainers:[{symbol:'MSFT',price:400,changePct:2}],
      cryptoAsOf:new Date(Date.parse(snapshot.cryptoAsOf) + 2000).toISOString(),
      crypto:[{symbol:'ETH',price:3001,changePct:2}]});
    app.host().querySelector('[data-movers-retry]').click(); await flush(); await flush();
    app.host().querySelector('[data-tab="gainers"]').click();
    assert.match(app.host().textContent, /MSFT/);
    assert.doesNotMatch(app.host().textContent, /Update failed/);
  } finally { app.close(); }
});
test('when both sources regress the previous verified snapshots are preserved', async () => {
  const app = setup('ok', {...snapshot,crypto:[{symbol:'BTC',price:90000,changePct:1}]});
  try {
    await flush(); await flush();
    const older = new Date(Date.parse(snapshot.stocksAsOf) - 60000).toISOString();
    app.snapshot({...snapshot, stocksAsOf:older, cryptoAsOf:older,
      gainers:[{symbol:'OLD',price:1,changePct:1}], crypto:[{symbol:'OLD',price:1,changePct:1}]});
    app.intervals[0](); await flush(); await flush();
    assert.match(app.host().textContent, /AAPL/);
    assert.match(app.host().textContent, /Update failed/);
    app.host().querySelector('[data-tab="crypto"]').click();
    assert.match(app.host().textContent, /BTC/);
    assert.doesNotMatch(app.host().textContent, /OLD/);
  } finally { app.close(); }
});
