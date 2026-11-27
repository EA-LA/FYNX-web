// Perpetual funding lesson box (site-qa run 121). Expected values were
// computed independently (Python: notional x rate x full intervals).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const F = require('../assets/js/perp-funding.js');

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const base = { notional: 5000, side: 'long', ratePct: 0.01, hours: 8, days: 30, leverage: 5 };

test('lesson example: $5,000 at 0.01% every 8 hours', () => {
  const r = F.analyse(base);
  close(r.perInterval, -0.5);
  close(r.perDay, -1.5);
  assert.equal(r.intervals, 90);
  close(r.total, -45);
  close(r.pctOfPosition, -0.9);
  close(r.margin, 1000);
  close(r.pctOfMargin, -4.5);
  close(r.annualPct, 10.95);
  close(r.daysToMargin, 2000 * 8 / 24);
  assert.equal(r.paying, true);
});

test('busy market 0.05% at 10x uses 45% of margin in 30 days', () => {
  const r = F.analyse({ ...base, ratePct: 0.05, leverage: 10 });
  close(r.perInterval, -2.5);
  close(r.total, -225);
  close(r.pctOfMargin, -45);
  close(r.daysToMargin, 200 * 8 / 24);
});

test('sign convention: positive funding longs pay, negative funding shorts pay', () => {
  assert.ok(F.analyse({ ...base, side: 'short' }).perInterval > 0);
  assert.ok(F.analyse({ ...base, side: 'short', ratePct: -0.01 }).perInterval < 0);
  assert.ok(F.analyse({ ...base, ratePct: -0.01 }).perInterval > 0);
  const zero = F.analyse({ ...base, ratePct: 0 });
  assert.equal(zero.total, 0);
  assert.equal(zero.daysToMargin, null);
  assert.equal(F.analyse({ ...base, side: 'short' }).daysToMargin, null);
});

test('only full funding payments count; table merges the holding time', () => {
  const r = F.analyse({ ...base, notional: 10000, days: 2.5 });
  assert.equal(r.intervals, 7);
  close(r.total, -7);
  assert.deepEqual(r.rows.map((x) => x.days), [1, 2.5, 7, 30, 90, 365]);
  assert.equal(r.rows.find((x) => x.yours).days, 2.5);
  const same = F.analyse(base);
  assert.equal(same.rows.length, 5);
  assert.equal(same.rows.filter((x) => x.yours).length, 1);
  close(same.rows.find((x) => x.days === 365).total, -0.5 * 3 * 365);
  assert.equal(F.intervals(1, 1), 24);
});

test('leverage is optional; bad input gives a message', () => {
  const r = F.analyse({ ...base, leverage: null });
  assert.equal(r.margin, null);
  assert.equal(r.pctOfMargin, null);
  assert.equal(r.rows[0].pctOfMargin, null);
  assert.match(F.analyse({ ...base, notional: 0 }).error, /position size/);
  assert.match(F.analyse({ ...base, ratePct: 2 }).error, /funding rate/);
  assert.match(F.analyse({ ...base, hours: 3 }).error, /how often/);
  assert.match(F.analyse({ ...base, days: 0 }).error, /days/);
  assert.match(F.analyse({ ...base, leverage: 0.5 }).error, /leverage/);
  assert.ok(Number.isNaN(F.parseNumber('-0.01')));
  assert.equal(F.parseNumber('−0.01%', true), -0.01);
  assert.equal(F.parseNumber('$5,000'), 5000);
  assert.equal(F.parseNumber('5x'), 5);
  assert.ok(Number.isNaN(F.parseNumber('1-2', true)));
});

test('lesson page and generator config both carry the widget', () => {
  const root = join(__dirname, '..');
  const html = readFileSync(join(root, 'learn/lessons/crypto/spot-vs-perpetual-futures.html'), 'utf8');
  for (const id of ['fundBox', 'fundSize', 'fundSide', 'fundRate', 'fundHours', 'fundDays', 'fundLev', 'fundBody', 'fundNote']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /\/assets\/js\/perp-funding\.js\?v=/);
  assert.match(html, /href="#fundBox"/);
  const tools = require('../content/lesson-tools.cjs');
  assert.ok(tools['/learn/lessons/crypto/spot-vs-perpetual-futures.html'].html.includes('id="fundBox"'));
  // The duration lesson boxes must survive a rebuild (they were missing from the generator before run 121).
  const dur = tools['/learn/lessons/bonds/duration-for-traders.html'];
  assert.ok(dur && dur.html.includes('id="durQuick"') && dur.html.includes('id="durBox"'));
  assert.match(dur.head, /bond-duration\.js/);
});
