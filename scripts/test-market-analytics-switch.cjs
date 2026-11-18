'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/market-analytics.js'), 'utf8');

function element(tag = 'div') {
  const listeners = {};
  return {
    tag, children: [], textContent: '', disabled: false, value: '', href: '', hidden: false,
    focus() { this.focused = true; }, select() { this.selected = true; },
    listeners,
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    trigger(type) { return Promise.all((listeners[type] || []).map(listener => listener({}))); }
  };
}

function setup(kind = 'liquidity', { search = '', clipboard } = {}) {
  const select = element('select');
  select.value = kind === 'liquidity' ? 'BTC-USD' : '30';
  select.options = (kind === 'liquidity' ? ['BTC-USD', 'ETH-USD'] : ['30', '60', '90']).map(value => ({value}));
  const button = element('button'), status = element('p');
  const shareButton = element('button'), shareStatus = element('p'), shareFallback = element('input');
  shareFallback.hidden = true;
  const output = element('div'), link = element('a');
  link.href = 'https://www.coinbase.com/advanced-trade/spot/BTC-USD';
  const root = {
    dataset: { marketAnalysis: kind },
    querySelector(name) {
      return {
        select, button, '[data-analysis-feed-status]': status, '[role=status]': status,
        '[data-analysis-output]': output, '[data-market-source]': link,
        '[data-analysis-share]': shareButton, '[data-analysis-share-status]': shareStatus,
        '[data-analysis-share-fallback]': shareFallback
      }[name] || null;
    }
  };
  const calls = [], intervals = [], reports = [];
  const document = {
    hidden: false,
    querySelector(name) { return name === '[data-market-analysis]' ? root : null; },
    createElement: element,
    addEventListener() {}
  };
  const window = {
    addEventListener() {},
    location: {
      origin: 'https://www.fynxfinanceworld.com',
      pathname: kind === 'liquidity' ? '/markets/liquidity.html' : '/markets/correlation.html',
      search
    },
    navigator: { clipboard },
    FynxMonitor: { report(...args) { reports.push(args); } }
  };
  const context = {
    document, window, AbortController, URL, URLSearchParams, Date, Number,
    setInterval(callback) { intervals.push(callback); return intervals.length; },
    clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {},
    fetch(url, options) {
      return new Promise((resolve, reject) => {
        calls.push({ url: String(url), signal: options.signal, resolve, reject });
      });
    }
  };
  vm.runInNewContext(source, context, { filename: 'market-analytics.js' });
  return { select, button, status, output, link, shareButton, shareStatus, shareFallback, calls, intervals, reports };
}

function sample(product = 'BTC-USD') {
  const now = new Date().toISOString();
  return {
    product, bid: 102, ask: 103, spread: 1, spreadBps: 98,
    bidSize: 3, askSize: 4, source: 'Coinbase',
    observationTime: now, fetchedAt: now, stale: false
  };
}
function correlation(observations) {
  const now = new Date().toISOString();
  // Keep simulated ECB observations recent across subsequent calendar dates.
  const startDate = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  return {
    observations, pairs: ['EURUSD'], matrix: [[1]],
    source: 'ECB', startDate,
    observationDate: now.slice(0, 10), fetchedAt: now, stale: false
  };
}
async function settle(call, data) {
  call.resolve({ ok: true, json: async () => data });
  await new Promise(resolve => setImmediate(resolve));
}
async function fail(call) {
  call.reject(new Error('network unavailable'));
  await new Promise(resolve => setImmediate(resolve));
}

test('market selector stays enabled while a request is loading', () => {
  const h = setup();
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /product=BTC-USD/);
  assert.equal(h.button.disabled, true);
  assert.equal(h.select.disabled, false);
});

test('switching markets immediately cancels and ignores old results', async () => {
  const h = setup(), first = h.calls[0];
  h.select.value = 'ETH-USD';
  h.select.trigger('change');
  assert.equal(first.signal.aborted, true);
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[1].url, /product=ETH-USD/);
  assert.match(h.link.href, /ETH-USD$/);
  await settle(first, sample('BTC-USD')); // Simulates a server response after cancellation.
  assert.equal(h.output.children.length, 0);
  await settle(h.calls[1], sample('ETH-USD'));
  assert.equal(h.output.children.length, 1);
  assert.match(h.output.children[0].children[0].textContent, /ETH-USD/);
  assert.match(h.status.textContent, /Coinbase/);
  assert.equal(h.button.disabled, false);
  assert.equal(h.reports.length, 0);
});

test('selected market source link remains correct when its feed fails', async () => {
  const h = setup(), first = h.calls[0];
  h.select.value = 'ETH-USD';
  h.select.trigger('change');
  await fail(h.calls[1]);
  assert.match(h.status.textContent, /unavailable/);
  assert.match(h.link.href, /ETH-USD$/);
  assert.equal(h.output.children.length, 0);
  assert.equal(h.button.disabled, false);
  // Resolving the cancelled old request cannot restore the BTC data.
  await settle(first, sample());
  assert.equal(h.output.children.length, 0);
});

test('timer does not start overlapping requests and can refresh after completion', async () => {
  const h = setup();
  h.intervals[0]();
  assert.equal(h.calls.length, 1);
  await settle(h.calls[0], sample());
  h.intervals[0]();
  assert.equal(h.calls.length, 2);
  await settle(h.calls[1], sample());
  assert.equal(h.output.children.length, 1);
});

test('mismatched market responses are rejected instead of shown as another market', async () => {
  const h = setup();
  await settle(h.calls[0], sample('ETH-USD'));
  assert.equal(h.output.children.length, 0);
  assert.match(h.status.textContent, /unavailable/);
  assert.equal(h.button.disabled, false);
});

test('correlation windows can be switched during a pending request', async () => {
  const h = setup('correlation'), first = h.calls[0];
  h.select.value = '90';
  h.select.trigger('change');
  assert.equal(first.signal.aborted, true);
  assert.match(h.calls[1].url, /window=90/);
  await settle(h.calls[1], correlation(90));
  await settle(first, correlation(30));
  assert.match(h.output.children[0].children[0].textContent, /90 daily returns/);
  assert.match(h.status.textContent, /ECB/);
});


test('malformed liquidity observations are rejected rather than rendered as prices', async () => {
  const h = setup();
  await settle(h.calls[0], { ...sample(), bid: null });
  assert.equal(h.output.children.length, 0, 'a missing bid must not become $0.00');
  assert.match(h.status.textContent, /unavailable/i);
  assert.equal(h.button.disabled, false, 'user can retry');
  assert.equal(h.reports.length, 1, 'invalid feed is reported');
});

test('invalid or future source timestamps cannot make prices look current', async () => {
  const invalid = setup();
  await settle(invalid.calls[0], { ...sample(), observationTime: 'not-a-time' });
  assert.equal(invalid.output.children.length, 0);
  assert.match(invalid.status.textContent, /unavailable/i);

  const future = setup();
  await settle(future.calls[0], { ...sample(), fetchedAt: '2099-01-01T00:00:00Z' });
  assert.equal(future.output.children.length, 0);
  assert.match(future.status.textContent, /unavailable/i);
});

test('a rejected refresh keeps the prior valid market snapshot and marks it stale', async () => {
  const h = setup();
  await settle(h.calls[0], sample());
  const previous = h.output.children[0];
  h.button.trigger('click');
  await settle(h.calls[1], { ...sample(), askSize: 'unavailable' });
  assert.equal(h.output.children[0], previous, 'valid prior table survives bad data');
  assert.match(h.status.textContent, /Stale data/);
  assert.match(h.status.textContent, /Refresh failed/);
  assert.equal(h.button.disabled, false);
});

test('incomplete and out-of-range correlation matrices cannot be shown', async () => {
  const h = setup('correlation');
  await settle(h.calls[0], { ...correlation(30), matrix: [[1.3]] });
  assert.equal(h.output.children.length, 0);
  assert.match(h.status.textContent, /unavailable/i);
  h.button.trigger('click');
  await settle(h.calls[1], { ...correlation(30), matrix: [] });
  assert.equal(h.output.children.length, 0);
  assert.match(h.status.textContent, /unavailable/i);
});

test('valid market observations still render after a rejected response', async () => {
  const h = setup('correlation');
  await settle(h.calls[0], { ...correlation(30), matrix: [[null, 1]] });
  assert.equal(h.output.children.length, 0);
  h.button.trigger('click');
  await settle(h.calls[1], correlation(30));
  assert.equal(h.output.children.length, 1);
  assert.match(h.status.textContent, /ECB/);
  assert.doesNotMatch(h.status.textContent, /Stale data/);
});

test('a feed for the wrong correlation window never replaces the selected window', async () => {
  const h = setup('correlation'); // Selector requests 30 observations.
  await settle(h.calls[0], correlation(90));
  assert.equal(h.output.children.length, 0, '90 observations must not be shown under 30');
  assert.match(h.status.textContent, /unavailable/i);
  h.button.trigger('click');
  await settle(h.calls[1], { ...correlation(30), window: 90 });
  assert.equal(h.output.children.length, 0, 'the explicit backend window must also match');
  h.button.trigger('click');
  await settle(h.calls[2], { ...correlation(30), window: 30 });
  assert.equal(h.output.children.length, 1, 'valid selected-window data still renders');
});

test('crossed or internally inconsistent order books cannot be shown as quotes', async () => {
  const h = setup();
  await settle(h.calls[0], { ...sample(), ask: 101, spread: 0 });
  assert.equal(h.output.children.length, 0, 'ask below bid must not render');
  h.button.trigger('click');
  await settle(h.calls[1], { ...sample(), spread: 0.2 });
  assert.equal(h.output.children.length, 0, 'displayed spread must match best bid and ask');
  h.button.trigger('click');
  await settle(h.calls[2], sample());
  assert.equal(h.output.children.length, 1, 'valid live quotes still render');
  assert.equal(h.button.disabled, false);
});

test('future-dated correlation observations are rejected but current dates still work', async () => {
  const h = setup('correlation');
  await settle(h.calls[0], { ...correlation(30), observationDate: '2099-01-01' });
  assert.equal(h.output.children.length, 0, 'future market data must not appear as verified');
  assert.match(h.status.textContent, /unavailable/i);
  assert.equal(h.button.disabled, false, 'retry remains available');
  h.button.trigger('click');
  await settle(h.calls[1], correlation(30));
  assert.equal(h.output.children.length, 1, 'a valid observation recovers after rejection');
  assert.match(h.status.textContent, /ECB/);
});

test('a future-dated correlation refresh cannot overwrite the last verified table', async () => {
  const h = setup('correlation');
  await settle(h.calls[0], correlation(30));
  const previous = h.output.children[0];
  h.button.trigger('click');
  await settle(h.calls[1], { ...correlation(30), observationDate: '2099-01-01' });
  assert.equal(h.output.children[0], previous);
  assert.match(h.status.textContent, /Stale data/);
  assert.match(h.status.textContent, /Refresh failed/);
  assert.equal(h.button.disabled, false);
});


test('refresh keeps verified source time and failure warning visible until recovery', async () => {
  const h = setup();
  await settle(h.calls[0], sample());
  const previous = h.output.children[0];

  h.button.trigger('click');
  assert.match(h.status.textContent, /Coinbase.*Source time/);
  assert.match(h.status.textContent, /Checking for updated observations/);
  assert.equal(h.output.children[0], previous, 'verified table remains available');

  await fail(h.calls[1]);
  assert.match(h.status.textContent, /Stale data/);
  assert.match(h.status.textContent, /Refresh failed/);

  // The scheduled tick must not erase the warning while a fresh request is pending.
  h.intervals[0]();
  assert.equal(h.calls.length, 3);
  assert.match(h.status.textContent, /Stale data/);
  assert.match(h.status.textContent, /Refresh failed/);
  assert.match(h.status.textContent, /Checking for updated observations/);
  assert.equal(h.output.children[0], previous);

  await settle(h.calls[2], sample());
  assert.match(h.status.textContent, /Coinbase/);
  assert.doesNotMatch(h.status.textContent, /Stale data|Refresh failed|Checking for updated observations/);
  assert.equal(h.button.disabled, false);
});

test('switching markets clears an earlier failure instead of mislabelling new quotes', async () => {
  const h = setup();
  await settle(h.calls[0], sample());
  h.button.trigger('click');
  await fail(h.calls[1]);
  assert.match(h.status.textContent, /Refresh failed/);

  h.select.value = 'ETH-USD';
  h.select.trigger('change');
  assert.equal(h.output.children.length, 0, 'old BTC table is removed');
  assert.match(h.status.textContent, /Loading source observations/);
  assert.doesNotMatch(h.status.textContent, /Refresh failed/);

  await settle(h.calls[2], sample('ETH-USD'));
  assert.match(h.status.textContent, /Coinbase/);
  assert.doesNotMatch(h.status.textContent, /Stale data|Refresh failed/);
  assert.match(h.output.children[0].children[0].textContent, /ETH-USD/);
});

test('market view links restore only allowlisted selections before source requests', () => {
  const eth = setup('liquidity', { search: '?product=ETH-USD' });
  assert.equal(eth.select.value, 'ETH-USD');
  assert.match(eth.calls[0].url, /product=ETH-USD/);
  assert.match(eth.link.href, /ETH-USD$/);

  const fx = setup('correlation', { search: '?window=90' });
  assert.equal(fx.select.value, '90');
  assert.match(fx.calls[0].url, /window=90/);
});

test('invalid or injected URL selections never change the active market', () => {
  const invalid = setup('liquidity', { search: '?product=BTC-USD%3Cscript%3E' });
  assert.equal(invalid.select.value, 'BTC-USD');
  assert.match(invalid.calls[0].url, /product=BTC-USD/);
  const invalidWindow = setup('correlation', { search: '?window=999' });
  assert.equal(invalidWindow.select.value, '30');
  assert.match(invalidWindow.calls[0].url, /window=30/);
});

test('copy view link includes the chosen public symbol but no incoming private query', async () => {
  const copied = [];
  const h = setup('liquidity', {
    search: '?product=BTC-USD&token=private-secret',
    clipboard: { writeText: async url => copied.push(url) }
  });
  h.select.value = 'ETH-USD';
  h.select.trigger('change');
  await h.shareButton.trigger('click');
  assert.deepEqual(copied, ['https://www.fynxfinanceworld.com/markets/liquidity.html?product=ETH-USD']);
  assert.match(h.shareStatus.textContent, /copied/);
  assert.equal(h.shareFallback.hidden, true);
});

test('denied clipboard offers a selectable manual link without claiming success', async () => {
  const h = setup('correlation', {
    clipboard: { writeText: async () => { throw new Error('denied'); } }
  });
  h.select.value = '60';
  h.select.trigger('change');
  await h.shareButton.trigger('click');
  assert.equal(h.shareFallback.hidden, false);
  assert.equal(h.shareFallback.value, 'https://www.fynxfinanceworld.com/markets/correlation.html?window=60');
  assert.equal(h.shareFallback.focused, true);
  assert.equal(h.shareFallback.selected, true);
  assert.doesNotMatch(h.shareStatus.textContent, /copied/i);
  h.select.value = '90';
  h.select.trigger('change');
  assert.equal(h.shareFallback.hidden, true);
  assert.equal(h.shareStatus.textContent, '');
});

test('clipboard not supported reveals manual share URL', async () => {
  const h = setup();
  await h.shareButton.trigger('click');
  assert.equal(h.shareFallback.hidden, false);
  assert.match(h.shareFallback.value, /product=BTC-USD$/);
});

test('both public market research views expose accessible share controls and current asset versions', () => {
  for (const name of ['liquidity', 'correlation']) {
    const html = fs.readFileSync(path.join(__dirname, '../markets', name + '.html'), 'utf8');
    assert.match(html, /data-analysis-share>/);
    assert.match(html, /data-analysis-share-status[^>]*role="status"/);
    assert.match(html, /data-analysis-share-fallback[^>]*aria-label=/);
    assert.ok(html.includes('market-analytics.js?v=20261118-share-view-1'), 'script version is refreshed');
  }
});
