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
    tag, children: [], textContent: '', disabled: false, value: '', href: '',
    listeners,
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    trigger(type) { for (const listener of listeners[type] || []) listener({}); }
  };
}

function setup(kind = 'liquidity') {
  const select = element('select');
  select.value = kind === 'liquidity' ? 'BTC-USD' : '30';
  const button = element('button'), status = element('p');
  const output = element('div'), link = element('a');
  link.href = 'https://www.coinbase.com/advanced-trade/spot/BTC-USD';
  const root = {
    dataset: { marketAnalysis: kind },
    querySelector(name) {
      return {
        select, button, '[role=status]': status,
        '[data-analysis-output]': output, '[data-market-source]': link
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
  const window = { addEventListener() {}, FynxMonitor: { report(...args) { reports.push(args); } } };
  const context = {
    document, window, AbortController, URLSearchParams, Date, Number,
    setInterval(callback) { intervals.push(callback); return intervals.length; },
    clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {},
    fetch(url, options) {
      return new Promise((resolve, reject) => {
        calls.push({ url: String(url), signal: options.signal, resolve, reject });
      });
    }
  };
  vm.runInNewContext(source, context, { filename: 'market-analytics.js' });
  return { select, button, status, output, link, calls, intervals, reports };
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
  return {
    observations, pairs: ['EURUSD'], matrix: [[1]],
    source: 'ECB', startDate: '2026-10-01',
    observationDate: '2026-11-08', fetchedAt: now, stale: false
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
