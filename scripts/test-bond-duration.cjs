'use strict';
// [site-qa] run 120: "Duration estimate versus the real price change" on the duration lesson.
// Expected values come from an independent Python calculation (cash-flow sums;
// convexity from a numeric second difference of price).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { measures, analyse, quick, parseSigned, validateMove } = require('../assets/js/bond-duration.js');

const near = (a, b, eps = 0.0005) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const bond = (face, couponPct, years, freq, yieldPct) => ({ face, couponPct, years, freq, yieldPct });

test('Macaulay, modified duration and convexity', () => {
  const cases = [
    [bond(1000, 4, 10, 2, 5), 8.255587, 8.054231, 77.1117],
    [bond(1000, 4, 2, 2, 5), 1.941305, 1.893956, 4.5732],
    [bond(1000, 5, 30, 2, 5), 15.840686, 15.454328, 352.0852],
    [bond(1000, 0, 10, 1, 5), 10, 9.523810, 99.7733],
    [bond(1000, 6, 5, 1, 8), 4.439323, 4.110484, 21.9108],
  ];
  for (const [b, mac, mod, conv] of cases) {
    const m = measures(b);
    near(m.macaulay, mac);
    near(m.modified, mod);
    near(m.convexity, conv, 0.01);
  }
});

test('table: actual vs duration-only estimates, yours marked and sorted', () => {
  const r = analyse(bond(1000, 4, 10, 2, 5), 0.5);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.rows.map((x) => x.move), [-2, -1, -0.5, -0.25, 0.25, 0.5, 1, 2]);
  near(r.yours.actual, -3.932370);
  near(r.yours.durationOnly, -4.027116);
  near(r.rows.find((x) => x.move === 1).actual, -7.681646);
  near(r.rows.find((x) => x.move === 2).durationOnly, -16.108462);
  near(r.rows.find((x) => x.move === -0.5).actual, 4.125195);
  // convexity estimate is closer than duration alone; duration alone is always below actual
  for (const x of r.rows) {
    assert.ok(x.error < 0, 'duration-only below actual');
    assert.ok(Math.abs(x.withConvexity - x.actual) < Math.abs(x.error));
  }
  // a custom move is added in order
  const c = analyse(bond(1000, 5, 30, 2, 5), 0.75);
  assert.deepEqual(c.rows.map((x) => x.move), [-2, -1, -0.5, -0.25, 0.25, 0.5, 0.75, 1, 2]);
  assert.equal(c.yours.move, 0.75);
  near(analyse(bond(1000, 5, 30, 2, 5), 2).yours.actual, -24.944734);
});

test('moves that would push the yield below 0 are left out or rejected', () => {
  const r = analyse(bond(1000, 2, 5, 1, 0.5), 0.25);
  assert.deepEqual(r.rows.map((x) => x.move), [-0.5, -0.25, 0.25, 0.5, 1, 2]);
  assert.match(analyse(bond(1000, 2, 5, 1, 0.5), -1).error, /below 0%/);
  assert.match(validateMove(0, 5), /not 0/);
  assert.match(validateMove(6, 5), /−5 to \+5/);
  assert.match(analyse(bond(1000, 4, 2.3, 2, 5), 0.5).error, /coupon periods/);
});

test('quick check matches the lesson: duration 5, +0.5 pt = −2.5%; 2 vs 8', () => {
  const l = quick(5, 5, 0.5);
  near(l.a, -2.5);
  const p = quick(2, 8, 0.5);
  near(p.a, -1); near(p.b, -4); near(p.ratio, 4);
  near(quick(2, 8, -0.25).b, 2);
  assert.match(quick(-1, 8, 0.5).error, /0 to 100/);
  assert.match(quick(2, 8, 0).error, /not 0/);
});

test('signed input parsing', () => {
  assert.equal(parseSigned('0.5'), 0.5);
  assert.equal(parseSigned('+1'), 1);
  assert.equal(parseSigned('-0.25'), -0.25);
  assert.equal(parseSigned('−0.25'), -0.25);
  assert.ok(Number.isNaN(parseSigned('abc')));
  assert.ok(Number.isNaN(parseSigned('')));
});

test('page wiring: duration lesson loads both scripts and the boxes', () => {
  const html = readFileSync(join(__dirname, '../learn/lessons/bonds/duration-for-traders.html'), 'utf8');
  for (const id of ['durBox', 'durQuick', 'durMove', 'durBody', 'durQ1', 'durQ2', 'durQMove']) assert.ok(html.includes(`id="${id}"`), id);
  const a = html.indexOf('/assets/js/bond-price.js'), b = html.indexOf('/assets/js/bond-duration.js');
  assert.ok(a > 0 && b > a, 'bond-price.js before bond-duration.js');
  assert.ok(html.includes('/assets/css/lesson-tool.css'));
});
