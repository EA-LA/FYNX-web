// Daily-reset leverage lesson box (site-qa run 122). Expected values were
// computed independently (Python: value *= 1 + L x move each day).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const F = require('../assets/js/leveraged-path.js');

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const run = (leverage, moves, repeat = 1, start = 100) => F.analyse({ leverage, moves, repeat, start });

test('lesson example: 2x, +10% then -10% -> 100, 120, 96', () => {
  const r = run(2, [10, -10]);
  close(r.benchEnd, 99);
  close(r.prodEnd, 96);
  close(r.benchPct, -1);
  close(r.prodPct, -4);
  close(r.naivePct, -2);
  close(r.gapPts, -2);
  assert.equal(r.daily, true);
  assert.deepEqual(r.rows.map((x) => Math.round(x.prod)), [120, 96]);
  assert.deepEqual(r.rows.map((x) => x.productMove), [20, -20]);
});

test('choppy month, steady rise and inverse chop match the independent values', () => {
  const chop = run(2, [3, -3], 10);
  assert.equal(chop.days, 20);
  close(chop.benchEnd, 99.103636);
  close(chop.prodEnd, 96.457764);
  close(chop.naivePct, -1.792727);
  const rise = run(2, [1], 20);
  close(rise.benchPct, 22.019004);
  close(rise.prodPct, 48.59474);
  assert.ok(rise.gapPts > 0);
  const inv = run(-1, [5, -5], 10);
  close(inv.prodPct, -2.472062);
  close(inv.naivePct, 2.472062);
  const one = run(1, [5, -2], 3);
  close(one.gapPts, 0);
});

test('a day of -100% or worse wipes the product out and it stays at 0', () => {
  const r = run(3, [10, -40, 50]);
  assert.equal(r.wipedDay, 2);
  assert.equal(r.prodEnd, 0);
  close(r.prodPct, -100);
  assert.equal(r.rows[2].productMove, 0);
  close(r.benchEnd, 99);
});

test('long paths are summarised per pass of the moves', () => {
  const r = run(2, [2, -1, 1], 20);
  assert.equal(r.days, 60);
  assert.equal(r.daily, false);
  assert.equal(r.rows.length, 20);
  assert.equal(r.rows.at(-1).day, 60);
  const single = run(2, Array.from({ length: 45 }, (_, i) => (i % 2 ? -1 : 1.2)), 1);
  assert.equal(single.rows.at(-1).day, 45);
  assert.ok(single.rows.length <= 23);
});

test('input parsing and validation messages', () => {
  assert.deepEqual(F.parseMoves('10, -10'), [10, -10]);
  assert.deepEqual(F.parseMoves('+3 −3'), [3, -3]);
  assert.deepEqual(F.parseMoves('1%; 2%; -0.5%'), [1, 2, -0.5]);
  assert.equal(F.parseMoves('a, 1'), null);
  assert.deepEqual(F.parseMoves(''), []);
  assert.equal(F.parseNumber('−2', true), -2);
  assert.equal(F.parseNumber('2x'), 2);
  assert.match(run(0, [1]).error, /multiple/);
  assert.match(run(6, [1]).error, /multiple/);
  assert.match(run(2, null).error, /numbers/);
  assert.match(run(2, []).error, /at least one/);
  assert.match(run(2, [-100]).error, /above −100%/);
  assert.match(run(2, [1], 0).error, /repeats/);
  assert.match(run(2, [1], 1.5).error, /repeats/);
  assert.match(run(2, Array(60).fill(1), 9).error, /500 days/);
  assert.match(run(2, Array(61).fill(1)).error, /up to 60/);
  assert.match(run(2, [1], 1, 0).error, /starting value/);
});

test('lesson page and generator config both carry the widget', () => {
  const root = join(__dirname, '..');
  const route = '/learn/lessons/funds/volatility-etfs-risks-and-uses.html';
  const html = readFileSync(join(root, route.slice(1)), 'utf8');
  for (const id of ['levBox', 'levMult', 'levMoves', 'levRepeat', 'levStart', 'levBody', 'levNote']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /\/assets\/js\/leveraged-path\.js\?v=/);
  assert.match(html, /href="#levBox"/);
  const tools = require('../content/lesson-tools.cjs');
  assert.ok(tools[route].html.includes('id="levBox"'));
  assert.match(tools[route].head, /leveraged-path\.js/);
});
