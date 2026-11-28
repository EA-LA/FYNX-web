// Currency exposure table on the Correlation and Basket Exposure lesson (site-qa run 125).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const B = require('../assets/js/basket-exposure.js');

const row = (res, c) => res.rows.find((r) => r.currency === c);

test('28 standard pairs, base currency first by market convention', () => {
  assert.equal(B.PAIRS.length, 28);
  for (const p of ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'USD/CAD', 'AUD/USD', 'NZD/USD', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/NZD', 'CHF/JPY']) assert.ok(B.PAIRS.includes(p), p);
  assert.ok(!B.PAIRS.includes('USD/EUR'));
  assert.equal(B.splitPair('JPY/USD'), null);
});

test('lesson example: two long-USD-quote pairs are one short dollar bet', () => {
  const r = B.analyse([{ pair: 'EUR/USD', side: 'buy', lots: 0.5, risk: 50 }, { pair: 'GBP/USD', side: 'buy', lots: 0.5, risk: 50 }]);
  assert.equal(r.totalRisk, 100);
  assert.deepEqual(r.shared, { currency: 'USD', side: 'short', count: 2, positions: [0, 1], lots: 1, risk: 100 });
  assert.equal(row(r, 'USD').net, -1);
  assert.equal(row(r, 'USD').riskIfRises, 100);
  assert.equal(row(r, 'USD').riskIfFalls, 0);
  assert.equal(row(r, 'EUR').net, 0.5);
  assert.equal(row(r, 'EUR').riskIfFalls, 50);
  assert.equal(r.rows[0].currency, 'USD'); // largest net first
  assert.equal(r.actsLike, null); // three open currencies
  assert.deepEqual(r.offsets, []);
});

test('three pairs: selling USD/JPY is also short USD', () => {
  const r = B.analyse([
    { pair: 'EUR/USD', side: 'buy', lots: 1, risk: 100 },
    { pair: 'GBP/USD', side: 'buy', lots: 1, risk: 100 },
    { pair: 'USD/JPY', side: 'sell', lots: 1, risk: 100 },
  ]);
  assert.equal(r.shared.currency, 'USD');
  assert.equal(r.shared.count, 3);
  assert.equal(r.shared.risk, 300);
  assert.equal(row(r, 'USD').net, -3);
  assert.equal(row(r, 'JPY').net, 1);
  assert.equal(row(r, 'JPY').riskIfFalls, 100);
});

test('long EUR/USD + long USD/CHF cancels USD and acts like long EUR/CHF', () => {
  const r = B.analyse([{ pair: 'EUR/USD', side: 'buy', lots: 1, risk: 100 }, { pair: 'USD/CHF', side: 'buy', lots: 1, risk: 100 }]);
  assert.equal(row(r, 'USD').net, 0);
  assert.deepEqual(r.offsets, ['USD']);
  assert.deepEqual(r.actsLike, { pair: 'EUR/CHF', side: 'buy', lots: 1 });
  assert.equal(r.shared.count, 1); // nothing repeated on the same side
  // Order of the cancelled pair follows the base convention: short EUR/CHF via sells.
  const s = B.analyse([{ pair: 'EUR/USD', side: 'sell', lots: 2 }, { pair: 'USD/CHF', side: 'sell', lots: 2 }]);
  assert.deepEqual(s.actsLike, { pair: 'EUR/CHF', side: 'sell', lots: 2 });
  assert.equal(s.hasRisk, false);
});

test('opposite positions in one pair are flat', () => {
  const r = B.analyse([{ pair: 'AUD/USD', side: 'buy', lots: 1 }, { pair: 'AUD/USD', side: 'sell', lots: 1 }]);
  assert.equal(r.flat, true);
  assert.equal(r.actsLike, null);
  assert.deepEqual(r.offsets.sort(), ['AUD', 'USD']);
});

test('unequal sizes keep the net in lots without price conversion', () => {
  const r = B.analyse([{ pair: 'EUR/USD', side: 'buy', lots: 0.3 }, { pair: 'EUR/JPY', side: 'buy', lots: 0.1 }, { pair: 'USD/JPY', side: 'buy', lots: 0.2 }]);
  assert.equal(row(r, 'EUR').net, 0.4);
  assert.equal(row(r, 'USD').net, -0.1);
  assert.equal(row(r, 'JPY').net, -0.3);
  assert.equal(r.shared.currency, 'EUR'); // long EUR in 2 positions, 0.4 lots beats short JPY 0.3
});

test('bad input gives a message; parser accepts $ and commas', () => {
  assert.match(B.analyse([]).error, /at least one/);
  assert.match(B.analyse([{ pair: 'USD/EUR', side: 'buy', lots: 1 }]).error, /pair/);
  assert.match(B.analyse([{ pair: 'EUR/USD', side: 'hold', lots: 1 }]).error, /buy or sell/);
  assert.match(B.analyse([{ pair: 'EUR/USD', side: 'buy', lots: 0 }]).error, /0\.01/);
  assert.match(B.analyse([{ pair: 'EUR/USD', side: 'buy', lots: 1, risk: NaN }]).error, /stop risk/);
  assert.equal(B.parseNumber('$1,250'), 1250);
  assert.equal(B.parseOptional(' '), null);
  assert.ok(Number.isNaN(B.parseNumber('-1')));
  assert.equal(B.netText(-1.5), 'Short 1.5');
  assert.equal(B.netText(0), 'Flat');
});

test('lesson page and generator config both carry the widget', () => {
  const root = join(__dirname, '..');
  const route = '/learn/lessons/forex/correlation-and-basket-exposure.html';
  const html = readFileSync(join(root, route.slice(1)), 'utf8');
  for (let i = 1; i <= 4; i++) for (const k of ['bxPair', 'bxSide', 'bxLots', 'bxRisk']) assert.ok(html.includes(`id="${k}${i}"`), k + i);
  for (const id of ['bxBox', 'bxBody', 'bxNote', 'bxShared']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /\/assets\/js\/basket-exposure\.js\?v=/);
  assert.match(html, /href="#bxBox"/);
  const cfg = require('../content/lesson-tools.cjs')[route];
  assert.ok(cfg && cfg.head.includes('basket-exposure.js'));
  const i = html.indexOf('<form class="lesson-tool" id="bxBox"');
  assert.equal(html.slice(i, html.indexOf('</form>', i) + 7), cfg.html);
});
