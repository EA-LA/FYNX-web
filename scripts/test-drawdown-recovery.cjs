'use strict';
// [site-qa] run 118: Risk Management "Drawdown recovery table" (hand-worked examples).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { gainNeeded, lossesToReach, winsToRecover, rows, parseNumber } = require('../assets/js/drawdown-recovery.js');

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('gain needed to get back: 10% -> 11.11%, 20% -> 25%, 50% -> 100%, 75% -> 300%', () => {
  near(gainNeeded(10), 100 / 9);
  near(gainNeeded(20), 25);
  near(gainNeeded(50), 100);
  near(gainNeeded(75), 300);
});

test('losses in a row at 1% risk compound on the balance left', () => {
  // 0.99^10 = 0.90438 (9.56% down, not yet 10%); 0.99^11 = 0.89534 -> 11
  assert.equal(lossesToReach(10, 1), 11);
  // 0.99^22 = 0.8016, 0.99^23 = 0.7936 -> 23 for 20%
  assert.equal(lossesToReach(20, 1), 23);
  // 0.98^11 = 0.8007, 0.98^12 = 0.7847 -> 12 at 2% risk
  assert.equal(lossesToReach(20, 2), 12);
  // exactly 50% at 50% risk takes one loss, not two
  assert.equal(lossesToReach(50, 50), 1);
});

test('wins to recover at risk x R per win', () => {
  // 1.02^5 = 1.10408 < 1.1111; 1.02^6 = 1.12616 -> 6 wins at 1% x 2R from a 10% drawdown
  assert.equal(winsToRecover(10, 1, 2), 6);
  // 20% down needs x1.25; 1.02^11 = 1.2434, 1.02^12 = 1.2682 -> 12
  assert.equal(winsToRecover(20, 1, 2), 12);
  // 50% down needs x2; 1.04^17 = 1.9479, 1.04^18 = 2.0258 -> 18 at 2% x 2R
  assert.equal(winsToRecover(50, 2, 2), 18);
});

test('rows: standard depths, your depth inserted and marked, balance columns', () => {
  const res = rows({ riskPct: 1, rr: 2, drawdown: 12, balance: 10000 });
  assert.deepEqual(res.rows.map((r) => r.drawdown), [5, 10, 12, 15, 20, 25, 30, 40, 50, 75]);
  const mine = res.rows.find((r) => r.yours);
  assert.equal(mine.drawdown, 12);
  near(mine.left, 8800, 1e-6); near(mine.needed, 1200, 1e-6);
  near(mine.gain, 12 / 88 * 100);
  // 0.99^12 = 0.8864, 0.99^13 = 0.8775 -> 13
  assert.equal(mine.losses, 13);
  // need x1.13636; 1.02^6 = 1.1262, 1.02^7 = 1.1487 -> 7
  assert.equal(mine.wins, 7);
  const same = rows({ riskPct: 1, rr: 2, drawdown: 20 });
  assert.equal(same.rows.length, 9);
  assert.equal(same.rows.filter((r) => r.yours).length, 1);
  assert.equal(same.rows[0].left, null);
});

test('invalid inputs give a message instead of a table', () => {
  assert.match(rows({ riskPct: 0, rr: 2 }).error, /risk per trade/);
  assert.match(rows({ riskPct: 25, rr: 2 }).error, /risk per trade/);
  assert.match(rows({ riskPct: 1, rr: NaN }).error, /reward-to-risk/);
  assert.match(rows({ riskPct: 1, rr: 2, drawdown: 100 }).error, /drawdown/);
  assert.match(rows({ riskPct: 1, rr: 2, balance: -5 }).error, /balance/);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('$10,000'), 10000);
  assert.equal(parseNumber('1.5%'), 1.5);
  assert.ok(Number.isNaN(parseNumber('abc')));
});

test('page wires the widget with 16px fields', () => {
  const html = readFileSync(join(__dirname, '..', 'risk-management.html'), 'utf8');
  for (const id of ['ddrBox', 'ddrRisk', 'ddrRR', 'ddrDepth', 'ddrBalance', 'ddrBody', 'ddrStatus', 'ddrNote']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /\/assets\/js\/drawdown-recovery\.js\?v=/);
  assert.match(html, /\.ddr-fields input\{[^}]*font-size:16px/);
});
