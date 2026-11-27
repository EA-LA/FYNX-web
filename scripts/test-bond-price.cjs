'use strict';
// [site-qa] run 119: "Bond price at different yields" on the bond prices lesson.
// Expected prices come from an independent cash-flow-by-cash-flow sum in Python.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { price, analyse, validate, parseNumber } = require('../assets/js/bond-price.js');

const near = (a, b, eps = 0.0001) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const bond = (face, couponPct, years, freq, yieldPct) => ({ face, couponPct, years, freq, yieldPct });

test('matches the lesson text: 1-year zero at 5% = $952.38, at 6% = $943.40', () => {
  near(price(bond(1000, 0, 1, 1, 5)), 952.3810);
  near(price(bond(1000, 0, 1, 1, 6)), 943.3962);
});

test('coupon bonds priced from discounted cash flows', () => {
  near(price(bond(1000, 4, 10, 2, 5)), 922.0542);
  near(price(bond(1000, 4, 10, 2, 6)), 851.2253);
  near(price(bond(1000, 4, 10, 2, 4)), 1000);
  near(price(bond(1000, 5, 30, 2, 6)), 861.6222);
  near(price(bond(1000, 5, 30, 2, 4)), 1173.8044);
  near(price(bond(1000, 6, 5, 1, 8)), 920.1458);
  // zero yield: just the sum of the payments
  near(price(bond(100, 3, 2.5, 2, 0)), 107.5);
});

test('analyse: discount/premium/par, current yield and the yield table', () => {
  const r = analyse(bond(1000, 4, 10, 2, 5));
  assert.equal(r.vsFace, 'discount');
  near(r.currentYield, 4.33814, 1e-4);
  assert.deepEqual(r.rows.map((x) => x.yieldPct), [3, 4, 4.5, 5, 5.5, 6, 7]);
  assert.equal(r.rows.filter((x) => x.yours).length, 1);
  near(r.up.price, 851.2253);
  near(r.down.price, 1000);
  // convexity: a 1-point fall lifts the price more than a 1-point rise cuts it
  assert.ok(r.down.changePct > Math.abs(r.up.changePct));
  assert.equal(analyse(bond(1000, 5, 30, 2, 5)).vsFace, 'par');
  assert.equal(analyse(bond(1000, 5, 30, 2, 4)).vsFace, 'premium');
  assert.equal(analyse(bond(1000, 0, 1, 1, 5)).currentYield, null);
  // yields below 0 are left out of the table
  assert.deepEqual(analyse(bond(1000, 2, 5, 1, 0.5)).rows.map((x) => x.yieldPct), [0, 0.5, 1, 1.5, 2.5]);
});

test('validation messages instead of wrong numbers', () => {
  assert.match(validate(bond(0, 4, 10, 2, 5)), /face value/);
  assert.match(validate(bond(1000, 60, 10, 2, 5)), /coupon/);
  assert.match(validate(bond(1000, 4, 10.3, 2, 5)), /whole number of coupon periods/);
  assert.match(validate(bond(1000, 4, 2.5, 1, 5)), /whole years/);
  assert.match(validate(bond(1000, 4, 10, 2, NaN)), /market yield/);
  assert.equal(validate(bond(1000, 4, 2.5, 2, 5)), '');
  assert.ok(Number.isNaN(parseNumber('abc')));
  assert.equal(parseNumber('$1,000'), 1000);
  assert.equal(parseNumber('5%'), 5);
});

test('lesson page and generator both carry the widget', () => {
  const root = join(__dirname, '..');
  const html = readFileSync(join(root, 'learn/lessons/bonds/bond-prices-and-yields-explained.html'), 'utf8');
  for (const id of ['bondBox', 'bondFace', 'bondCoupon', 'bondYears', 'bondFreq', 'bondYield', 'bondBody', 'bondNote']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /\/assets\/js\/bond-price\.js\?v=/);
  assert.match(html, /href="#bondBox"/);
  const gen = readFileSync(join(root, 'scripts/build-discovery.cjs'), 'utf8');
  assert.match(gen, /lesson-tools\.cjs/);
});
