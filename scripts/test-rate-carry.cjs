// Rate-gap carry estimate on tools/interest-rates.html (site-qa run 116).
// Expected values worked by hand: units x (base - quote) / 100 / 365.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { carry, parseLots } = require('../assets/js/rate-carry.js');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('long earns the positive gap per day, week, 30 days and year', () => {
  const r = carry({ lots: 1, direction: 'long', baseRate: 4, quoteRate: 2 });
  near(r.perDay, 100000 * 0.02 / 365); // 5.4794...
  assert.deepEqual(r.periods.map(p => p.days), [1, 7, 30, 365]);
  near(r.periods[3].amount, 2000);
  near(r.periods[2].amount, 164.38356164383563);
  assert.equal(r.earns, true);
});

test('short pays the same gap; negative gap flips', () => {
  const s = carry({ lots: 2.5, direction: 'short', baseRate: 4, quoteRate: 0.5 });
  near(s.perDay, -250000 * 0.035 / 365); // -23.97
  near(s.periods[3].amount, -8750);
  assert.equal(s.earns, false);
  const l = carry({ lots: 1, direction: 'long', baseRate: 0, quoteRate: 3.75 });
  near(l.periods[3].amount, -3750);
  const z = carry({ lots: 1, direction: 'long', baseRate: 2, quoteRate: 2 });
  assert.equal(z.zero, true);
});

test('rejects bad sizes and missing rates', () => {
  assert.ok(carry({ lots: 0, direction: 'long', baseRate: 1, quoteRate: 0 }).error);
  assert.ok(carry({ lots: 0.001, direction: 'long', baseRate: 1, quoteRate: 0 }).error);
  assert.ok(carry({ lots: 20000, direction: 'long', baseRate: 1, quoteRate: 0 }).error);
  assert.ok(carry({ lots: 1, direction: 'long', baseRate: undefined, quoteRate: 0 }).error);
  assert.equal(parseLots('1,000'), 1000);
  assert.equal(parseLots('0.5 lots'), 0.5);
  assert.ok(Number.isNaN(parseLots('abc')));
  assert.ok(Number.isNaN(parseLots('-1')));
});

test('page wiring: widget markup, script order and event hook', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'tools/interest-rates.html'), 'utf8');
  for (const id of ['rateCarry', 'carryLots', 'carryDirection', 'carryStatus', 'carryResult']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.indexOf('rate-carry.js') < html.indexOf('macro-data.js?'), 'rate-carry loads before macro-data');
  assert.ok(/Not a quote from any broker/.test(html));
  const src = fs.readFileSync(path.join(root, 'assets/js/macro-data.js'), 'utf8');
  assert.ok(src.includes("'fynx:rate-difference'"));
});
