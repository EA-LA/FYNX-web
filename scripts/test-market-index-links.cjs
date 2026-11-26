'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'markets/index.html'), 'utf8');
const sections = ['currencies','crypto','indicators','patterns','volatility','correlation','cot','liquidity','historical-data'];

test('market directory exposes real, crawlable links to all nine implemented sections', () => {
  assert.match(html, /<nav class="market-grid" aria-label="Market research sections">/);
  assert.equal((html.match(/class="market-card"/g) || []).length, sections.length);
  for (const section of sections) {
    assert.match(html, new RegExp('<a class="market-card" href="/markets/' + section + '\\.html" data-market="' + section + '">'));
    const page = path.join(root, 'markets', section + '.html');
    assert.ok(fs.existsSync(page), section + ' must have a real destination');
    assert.match(fs.readFileSync(page, 'utf8'), /<h1[^>]*>[^<]+/i);
  }
});

test('each static card has readable text and responsive keyboard styling', () => {
  const cards = [...html.matchAll(/<a class="market-card"[^>]+>([\s\S]*?)<\/a>/g)];
  assert.equal(cards.length, sections.length);
  for (const [, body] of cards) {
    assert.match(body, /<strong>[^<]+<\/strong>/);
    assert.match(body, /<span>[^<]{20,}<\/span>/);
  }
  assert.match(html, /\.market-card:focus-visible/);
  assert.match(html, /@media\(max-width:600px\)/);
});

test('no placeholder text or obsolete section-only navigation remains', () => {
  assert.doesNotMatch(html, /Placeholder|Add your UI|Add your real content|Add the real dashboards/i);
  assert.doesNotMatch(html, /href="index\.html\?section=/);
  assert.match(html, /Market data can be delayed or unavailable/);
});

const inline = html.match(/<script data-market-redirect>([\s\S]*?)<\/script>/);
function redirect(query) {
  assert.ok(inline, 'legacy route script exists');
  const replaced = [];
  const links = sections.map(section => ({ dataset: { market: section }, href: 'https://www.fynxfinanceworld.com/markets/' + section + '.html' }));
  const location = { search: query, replace: url => replaced.push(url) };
  vm.runInNewContext(inline[1], {
    URLSearchParams,
    location,
    document: { querySelectorAll: selector => {
      assert.equal(selector, 'a[data-market]');
      return links;
    } },
  });
  return replaced;
}

test('legacy ?section= routes replace the placeholder URL with their working page', () => {
  for (const section of sections) {
    assert.deepEqual(redirect('?section=' + section), ['https://www.fynxfinanceworld.com/markets/' + section + '.html']);
  }
  assert.deepEqual(redirect('?section=VIX'), []);
  assert.deepEqual(redirect('?section=CRYPTO'), ['https://www.fynxfinanceworld.com/markets/crypto.html']);
});

test('unknown and injection-shaped section queries never navigate', () => {
  for (const query of ['', '?section=', '?section=unknown', '?section=javascript%3Aalert(1)', '?section=..%2F..%2Fowner']) {
    assert.deepEqual(redirect(query), []);
  }
});

const historical = fs.readFileSync(path.join(root, 'markets/historical-data.html'), 'utf8');
function historicalHarness(initialAsset = 'EUR/USD', initialPeriod = '1 Week', supportsObserver = true) {
  const scripts = [], storage = {}, windowEvents = {}, timers = new Map(), observers = [];
  let nextTimer = 0, frame = null;
  class FakeObserver {
    constructor(callback) { this.callback = callback; this.active = false; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  function node(props = {}) {
    const listeners = {};
    return { ...props, addEventListener(type, callback) { listeners[type] = callback; },
      fire(type) { listeners[type](); } };
  }
  const els = {
    asset: node({ value: initialAsset }), period: node({ value: initialPeriod }),
    histResult: node(), histPending: node(), histApply: node(), themeLabel: node(), themeToggle: node(),
    histWidget: node({ querySelector(selector) { return selector === 'iframe' ? frame : { appendChild(script) { scripts.push(script); } }; } })
  };
  Object.defineProperty(els.histWidget, 'innerHTML', { set() { frame = null; } });
  const source = historical.match(/<script data-historical-chart>([\s\S]*?)<\/script>/);
  assert.ok(source, 'historical chart script is present');
  vm.runInNewContext(source[1], {
    MutationObserver: supportsObserver ? FakeObserver : undefined,
    setTimeout(callback, delay) { assert.equal(delay, 15000); const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: { getElementById(id) { return els[id]; }, createElement() { return {}; }, body: { classList: { toggle() {} } } },
    window: { FynxPreferences: { getItem(key) { return storage[key]; }, setItem(key,value) { storage[key] = value; } },
      addEventListener(type, callback) { windowEvents[type] = callback; } }
  });
  const latest = () => JSON.parse(scripts.at(-1).textContent);
  const expire = () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } };
  const insertFrame = () => { frame = {}; for (const observer of observers) if (observer.active) observer.callback(); };
  return { els, scripts, latest, storage, windowEvents, timers, observers, expire, insertFrame };
}
test('historical chart starts with the restored valid controls and honest request status', () => {
  const { els, latest } = historicalHarness('Gold', '3 Months');
  assert.equal(latest().symbol, 'OANDA:XAUUSD');
  assert.equal(latest().range, '3M');
  assert.equal(els.histPending.hidden, true);
  assert.match(els.histResult.textContent, /Requested 3 Months view for Gold/);
  assert.match(historical, /id="histResult" role="status"/);
});
test('historical chart theme changes do not apply unsubmitted market and range selections', () => {
  const { els, scripts, latest, storage, windowEvents } = historicalHarness();
  els.asset.value = 'BTC/USD'; els.asset.fire('change');
  els.period.value = '1 Year'; els.period.fire('change');
  assert.equal(els.histPending.hidden, false);
  assert.equal(scripts.length, 1);
  els.themeToggle.fire('click');
  assert.equal(latest().theme, 'dark');
  assert.equal(latest().symbol, 'FX:EURUSD');
  assert.equal(latest().range, '5D');
  storage.fynx_theme = 'light'; windowEvents.storage({ key: 'fynx_theme' });
  assert.equal(latest().symbol, 'FX:EURUSD');
  assert.match(els.histResult.textContent, /EUR\/USD/);
  els.histApply.fire('click');
  assert.equal(latest().symbol, 'BITSTAMP:BTCUSD');
  assert.equal(latest().range, '12M');
  assert.equal(els.histPending.hidden, true);
});
test('historical chart ignores obsolete provider failures and enables a real retry', () => {
  const { els, scripts, latest } = historicalHarness();
  const first = scripts[0];
  els.asset.value = 'Gold'; els.asset.fire('change'); els.histApply.fire('click');
  first.onerror();
  assert.match(els.histResult.textContent, /^Requested.*Gold/);
  scripts.at(-1).onerror();
  assert.match(els.histResult.textContent, /Could not load.*Gold.*retry/);
  els.histApply.fire('click');
  assert.equal(latest().symbol, 'OANDA:XAUUSD');
  assert.match(els.histResult.textContent, /^Requested/);
});
test('historical chart ignores unknown configuration values rather than sending them to the provider', () => {
  const { els, scripts } = historicalHarness();
  els.asset.value = '__proto__'; els.asset.fire('change'); els.histApply.fire('click');
  assert.equal(scripts.length, 1);
  assert.equal(els.histPending.hidden, false);
});

test('historical chart reports a silent missing frame and recovers when it arrives late', () => {
  const h = historicalHarness();
  h.expire();
  assert.match(h.els.histResult.textContent, /has not appeared yet.*retry/);
  assert.equal(h.timers.size, 0);
  h.insertFrame();
  assert.match(h.els.histResult.textContent, /Chart frame opened.*data may be delayed.*blank/);
  assert.equal(h.observers.filter(o => o.active).length, 0);
});
test('historical chart frame arrival cancels the timeout without claiming verified prices', () => {
  const h = historicalHarness();
  h.insertFrame();
  assert.equal(h.timers.size, 0);
  assert.match(h.els.histResult.textContent, /Chart frame opened.*data may be delayed/);
  h.expire();
  assert.doesNotMatch(h.els.histResult.textContent, /has not appeared/);
});
test('historical chart superseded timers and observers cannot overwrite a new selection', () => {
  const h = historicalHarness();
  const oldTimer = [...h.timers.values()][0], oldObserver = h.observers[0];
  h.els.asset.value = 'Gold'; h.els.asset.fire('change'); h.els.histApply.fire('click');
  assert.equal(h.timers.size, 1);
  assert.equal(oldObserver.active, false);
  oldTimer(); oldObserver.callback();
  assert.match(h.els.histResult.textContent, /^Requested.*Gold/);
  h.scripts.at(-1).onerror();
  assert.equal(h.timers.size, 0);
  assert.equal(h.observers.filter(o => o.active).length, 0);
  assert.match(h.els.histResult.textContent, /Could not load.*Gold/);
});
test('historical chart checks for a frame at the deadline without MutationObserver', () => {
  const missing = historicalHarness('Gold', '1 Week', false);
  missing.expire();
  assert.match(missing.els.histResult.textContent, /has not appeared yet/);
  const present = historicalHarness('Gold', '1 Week', false);
  present.insertFrame(); present.expire();
  assert.match(present.els.histResult.textContent, /Chart frame opened.*Gold/);
});
