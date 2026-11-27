'use strict';
// [site-qa] run 119: Risk/Reward "Take part off early?" table (hand-worked examples).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { rows, outcomes, formatR } = require('../assets/js/rr-partials.js');

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('long 100 / stop 98 / target 106 (3R), half off at 1R', () => {
  const r = rows({ entry: 100, stop: 98, target: 106, firstR: 1 });
  near(r.rr, 3);
  near(r.firstPrice, 102);
  assert.deepEqual(r.rows.map((x) => x.share), [0, 25, 50, 75]);
  const half = r.rows.find((x) => x.share === 50);
  near(half.target, 2); // 0.5 x 1 + 0.5 x 3
  near(half.stopped, 0); // 0.5 x 1 - 0.5
  near(half.entryStop, 0.5);
  const none = r.rows[0];
  near(none.target, 3);
  near(none.stopped, -1);
  near(none.entryStop, 0);
  const most = r.rows[3];
  near(most.target, 1.5); // 0.75 + 0.25 x 3
  near(most.stopped, 0.5); // 0.75 - 0.25
});

test('short trade: first target sits below entry', () => {
  const r = rows({ entry: 1.2675, stop: 1.27, target: 1.26, firstR: 1 });
  near(r.rr, 3);
  near(r.firstPrice, 1.265);
});

test('first target at 2R and a custom share of 33%', () => {
  const r = rows({ entry: 50, stop: 49, target: 54, firstR: 2, share: 33 });
  assert.deepEqual(r.rows.map((x) => x.share), [0, 25, 33, 50, 75]);
  const mine = r.rows.find((x) => x.yours);
  assert.equal(mine.share, 33);
  near(mine.target, 0.33 * 2 + 0.67 * 4); // 3.34
  near(mine.stopped, 0.33 * 2 - 0.67); // -0.01
  near(r.firstPrice, 52);
});

test('no table when the first target is at or beyond the final target', () => {
  assert.equal(rows({ entry: 100, stop: 98, target: 102, firstR: 1 }), null); // target is 1R
  assert.equal(rows({ entry: 100, stop: 98, target: 101, firstR: 1 }), null);
  assert.equal(rows({ entry: 100, stop: 100, target: 106, firstR: 1 }), null);
  assert.equal(rows({ entry: NaN, stop: 98, target: 106 }), null);
});

test('formatR', () => {
  assert.equal(formatR(2), '+2.00R');
  assert.equal(formatR(-0.5), '−0.50R');
  assert.equal(formatR(0.001), '0.00R');
  assert.equal(formatR(outcomes(50, 1, 3).stopped), '0.00R');
});

test('risk-reward page loads the table', () => {
  const html = readFileSync(join(__dirname, '..', 'tools', 'risk-reward.html'), 'utf8');
  assert.match(html, /id="rrPartials"/);
  assert.match(html, /\/assets\/js\/rr-partials\.js/);
});
