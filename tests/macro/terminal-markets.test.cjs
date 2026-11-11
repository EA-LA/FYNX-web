'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {parseChart, parseOCC, summarizeOptions, UNIVERSE, OPTION_UNDERLYINGS} = require('../../scripts/refresh-terminal-markets.cjs');

const DAY = 86400;
function chart(symbol, closes, {start = Date.UTC(2026, 9, 1) / 1000, price, time} = {}) {
  const timestamp = closes.map((_, i) => start + i * DAY);
  return {chart: {result: [{meta: {symbol, regularMarketPrice: price ?? closes.at(-1), regularMarketTime: time ?? timestamp.at(-1) + 3600, gmtoffset: 0, fiftyTwoWeekHigh: 120, fiftyTwoWeekLow: 80, currency: 'USD'}, timestamp, indicators: {quote: [{close: closes}]}}]}};
}

test('universe and option lists are unique and grouped', () => {
  const symbols = UNIVERSE.map(u => u[0]);
  assert.equal(new Set(symbols).size, symbols.length);
  assert.ok(UNIVERSE.every(([s, name, group]) => s && name && group));
  assert.equal(new Set(OPTION_UNDERLYINGS).size, OPTION_UNDERLYINGS.length);
});

test('daily chart parsing uses the prior session as previous close and never invents bars', () => {
  const closes = Array.from({length: 30}, (_, i) => 100 + i);
  const now = Date.UTC(2026, 9, 31);
  const q = parseChart('ES=F', chart('ES=F', closes, {price: 131}), now);
  assert.equal(q.price, 131);
  assert.equal(q.previousClose, 128);
  assert.equal(q.changePercent, Math.round((131 / 128 - 1) * 100 * 1000) / 1000);
  assert.equal(q.history.length, 30);
  assert.deepEqual(q.history.at(-1), [q.history.at(-1)[0], 131]);
  assert.ok(q.vol20 > 0);
  assert.equal(q.high52, 120);
  assert.throws(() => parseChart('NQ=F', chart('ES=F', closes), now), /No valid quote/);
  assert.throws(() => parseChart('ES=F', chart('ES=F', [null, 5]), now), /Too little history/);
});

test('a quote in a new session appends that session instead of overwriting the last close', () => {
  const closes = [100, 101, 102];
  const start = Date.UTC(2026, 9, 1) / 1000, nextSession = start + 3 * DAY + 3600;
  const q = parseChart('SPY', chart('SPY', closes, {start, price: 104, time: nextSession}), Date.UTC(2026, 9, 5));
  assert.equal(q.previousClose, 102);
  assert.equal(q.history.length, 4);
});

test('OCC option symbols parse into root, expiry, type and strike', () => {
  assert.deepEqual(parseOCC('SPY261120C00750000'), {root: 'SPY', expiry: '2026-11-20', type: 'C', strike: 750});
  assert.deepEqual(parseOCC('AAPL261218P00287500'), {root: 'AAPL', expiry: '2026-12-18', type: 'P', strike: 287.5});
  assert.equal(parseOCC('bad'), null);
});

test('option summaries compute put/call ratios, expected move, max pain and skew from the chain only', () => {
  const now = Date.UTC(2026, 10, 11, 15);
  const strikes = [95, 100, 105], options = [], occ = (t, k) => `XYZ261120${t}${String(k * 1000).padStart(8, '0')}`;
  for (const k of strikes) {
    options.push({option: occ('C', k), bid: Math.max(0.1, 101 - k), ask: Math.max(0.2, 101.4 - k), iv: 0.3, delta: k === 95 ? 0.75 : k === 100 ? 0.5 : 0.25, volume: 100, open_interest: k === 100 ? 1000 : 300, last_trade_price: 1});
    options.push({option: occ('P', k), bid: Math.max(0.1, k - 99), ask: Math.max(0.2, k - 98.6), iv: 0.34, delta: k === 95 ? -0.25 : k === 100 ? -0.5 : -0.75, volume: 50, open_interest: k === 100 ? 900 : 200, last_trade_price: 1});
  }
  options.push({option: 'XYZ201120C00100000', bid: 1, ask: 1, iv: 0.3, volume: 999, open_interest: 1});
  const u = summarizeOptions('XYZ', {timestamp: '2026-11-11 15:00:00', data: {current_price: 100, price_change: 1, price_change_percent: 1, iv30: 31, iv30_change: 0.5, options}}, now);
  assert.equal(u.callVolume, 300);
  assert.equal(u.putVolume, 150);
  assert.equal(u.putCallVolume, 0.5);
  assert.equal(u.expiries.length, 1);
  const e = u.expiries[0];
  assert.equal(e.atmStrike, 100);
  assert.equal(e.straddle, 2.4);
  assert.equal(e.movePercent, 2.4);
  assert.equal(e.maxPain, 100);
  assert.equal(e.skew25, 0.04);
  assert.equal(e.chain.length, 3);
  assert.equal(u.asOf, '2026-11-11T15:00:00.000Z');
  assert.throws(() => summarizeOptions('XYZ', {data: {current_price: 100, options: []}}, now), /No live contracts/);
  assert.throws(() => summarizeOptions('XYZ', {data: {}}, now), /No option data/);
});
