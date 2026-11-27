'use strict';
// Market alert rules for followed markets (assets/js/terminal/alerts.js · FynxAlertsCore) and the engine's
// market-alert handling (assets/js/notifications/engine.js).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ctx = {console, Date, Math, JSON, RegExp, String, Number, Array, Set, Map, Object};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/terminal/alerts.js'), 'utf8'), ctx);
const plain = v => JSON.parse(JSON.stringify(v));
const C = ctx.FynxAlertsCore, NOW = Date.parse('2026-11-27T15:00:00Z');

test('big moves only: thresholds by kind of market, or 3× the typical daily move', () => {
  assert.equal(C.moveSignal('AAPL', 'stock', {price: 100, changePercent: 1.2, vol20: 1.5}, NOW), null, 'ordinary day');
  assert.equal(C.moveSignal('AAPL', 'stock', {price: 100, changePercent: 4.2, vol20: 1.5}, NOW).priority, 'medium');
  assert.equal(C.moveSignal('AAPL', 'stock', {price: 100, changePercent: -8.5}, NOW).priority, 'high');
  assert.equal(C.moveSignal('AAPL', 'stock', {price: 100, changePercent: 2.4, vol20: 0.7}, NOW).priority, 'medium', '3.4× typical');
  assert.equal(C.moveSignal('EURUSD=X', 'fx', {price: 1.08, changePercent: 0.4}, NOW), null);
  assert.ok(C.moveSignal('EURUSD=X', 'fx', {price: 1.08, changePercent: -1.1}, NOW));
  assert.equal(C.moveSignal('BTC-USD', 'crypto', {price: 9e4, changePercent: 4}, NOW), null, 'crypto needs a larger move');
  assert.equal(C.moveSignal('AAPL', 'stock', {price: NaN, changePercent: 9}, NOW), null, 'no price, no alert');
  const k = C.moveSignal('AAPL', 'stock', {price: 1, changePercent: 5}, NOW).key; assert.equal(k, 'move:AAPL:2026-11-27:up', 'one per market, day and direction');
});

test('news that names the market (ticker as a whole word or the company name), recent only', () => {
  const h = (title, mins = 30, extra = {}) => ({title, publishedAt: new Date(NOW - mins * 60000).toISOString(), url: 'https://www.reuters.com/' + title.length, ...extra});
  const heads = [h('Nvidia beats estimates as data-center sales surge'), h('NVDA options volume hits record'), h('Envy and greed in the markets'), h('Nvidia old story', 600), h('Apple shares slip', 20, {breaking: true})];
  const n = C.newsSignals('NVDA', 'NVIDIA Corporation', heads, NOW);
  assert.deepEqual(plain(n.map(x => x.headline.title)), ['Nvidia beats estimates as data-center sales surge', 'NVDA options volume hits record']);
  assert.equal(C.newsSignals('AAPL', 'Apple Inc.', heads, NOW)[0].priority, 'high', 'breaking story');
  assert.deepEqual(C.newsSignals('EURUSD=X', 'EUR/USD', [h('EURUSD jumps after ECB')], NOW).length, 1);
  assert.deepEqual(plain(C.marketWords('BAC', 'Bank of America Corporation').map(w => w.w)), ['BAC'], 'generic first words are not matched');
});

test('earnings today or tomorrow, high-impact events within 45 minutes, research price rules', () => {
  const ev = [{symbol: 'AAPL', date: '2026-11-27', time: 'After close', epsForecast: 1.6}, {symbol: 'MSFT', date: '2026-11-28'}, {symbol: 'NVDA', date: '2026-12-03'}];
  assert.equal(C.earningsSignal('AAPL', ev, NOW).when, 'today'); assert.equal(C.earningsSignal('MSFT', ev, NOW).when, 'tomorrow'); assert.equal(C.earningsSignal('NVDA', ev, NOW), null);
  const cal = [{currency: 'EUR', title: 'CPI', impact: 'High', time: '2026-11-27T15:30:00Z'}, {currency: 'EUR', title: 'PMI', impact: 'Medium', time: '2026-11-27T15:20:00Z'}, {currency: 'USD', title: 'GDP', impact: 'high', time: '2026-11-27T17:00:00Z'}, {currency: 'GBP', title: 'BoE', impact: 'high', time: '2026-11-27T15:10:00Z'}];
  assert.deepEqual(plain(C.calendarSignals(['EUR', 'USD'], cal, NOW).map(x => x.event.title)), ['CPI']);
  const r = (kind, threshold, enabled = true) => ({id: 'r1', kind, threshold, enabled, symbol: 'AAPL'});
  assert.ok(C.ruleSignal(r('priceAbove', 200), {price: 210, changePercent: 1}, NOW)); assert.equal(C.ruleSignal(r('priceAbove', 220), {price: 210}, NOW), null);
  assert.ok(C.ruleSignal(r('changeBelow', -3), {price: 1, changePercent: -3.5}, NOW)); assert.equal(C.ruleSignal(r('priceBelow', 300, false), {price: 1}, NOW), null, 'disabled rule');
  assert.equal(C.ruleSignal(r('priceAbove', 1), null, NOW), null, 'no quote, no alert');
});

test('followed markets come from every watchlist record, deleted ones excluded', () => {
  assert.deepEqual(plain(C.followedFrom([{data: {symbols: ['aapl', 'NVDA']}}, {data: {symbols: ['NVDA', 'EURUSD=X']}}, {deleted: true, data: {symbols: ['TSLA']}}, {data: {}}])), ['AAPL', 'NVDA', 'EURUSD=X']);
});

test('engine: market alerts have their own category, 36 h de-duplication window, off switch, and read state is written only when it changes', () => {
  const src = fs.readFileSync(path.join(__dirname, '../assets/js/notifications/engine.js'), 'utf8');
  assert.match(src, /MARKET_ALERTS: "market_alerts"/); assert.match(src, /market_alerts: 36 \* 60 \* 60 \* 1000/); assert.match(src, /marketAlerts: true/);
  assert.match(src, /payload\.category === NOTIFICATION_CATEGORY\.MARKET_ALERTS && prefs\.marketAlerts === false/);
  assert.match(src, /if \(Boolean\(accountData\('notificationState',id\)\?\.read\) === Boolean\(read\)\) return;/);
  assert.match(src, /saveManyAccountState\(todo\.slice\(i, i \+ 50\)/, 'mark all read in batches, only unread');
  assert.doesNotMatch(src, /where\("read", "==", false\), where\("archived", "==", false\)/, 'no longer rewrites every old notification');
});
