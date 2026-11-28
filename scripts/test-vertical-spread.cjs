// Defined-Risk Strategies lesson box (site-qa run 126). Expected values worked by hand:
// debit spread max loss = debit, max gain = width - debit; credit spread the reverse;
// position = per unit x multiplier x spreads - fees; break-even inside the strikes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const V = require('../assets/js/vertical-spread.js');

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const base = { kind: 'call-debit', low: 100, high: 105, premium: 2, multiplier: 100, contracts: 1, fees: 0, price: null };

test('lesson example: 100/105 call debit for 2 -> lose 2, make 3, break-even 102', () => {
  const r = V.analyse(base);
  close(r.width, 5);
  close(r.cash, 200);
  close(r.maxLoss, 200);
  close(r.maxGain, 300);
  close(r.breakEven, 102);
  close(r.ratio, 1.5);
  assert.deepEqual(r.lossAt, { side: 'atOrBelow', strike: 100 });
  assert.deepEqual(r.gainAt, { side: 'atOrAbove', strike: 105 });
  assert.deepEqual(r.rows.map((x) => x.price), [95, 100, 102, 102.5, 105, 110]);
  assert.deepEqual(r.rows.map((x) => x.unit), [-2, -2, 0, 0.5, 3, 3]);
  assert.deepEqual(r.rows.map((x) => x.total), [-200, -200, 0, 50, 300, 300]);
  assert.equal(r.rows.find((x) => x.price === 102).label, 'break-even');
  assert.equal(r.shortStrike, 105);
  assert.equal(r.shortAlone.capped, false);
});

test('bull put credit 95/100 for 1.5, 2 spreads, $4 fees', () => {
  const r = V.analyse({ ...base, kind: 'put-credit', low: 95, high: 100, premium: 1.5, contracts: 2, fees: 4 });
  close(r.maxGain, 296); // 1.5 x 200 - 4
  close(r.maxLoss, 704); // 3.5 x 200 + 4
  close(r.breakEven, 98.52); // 100 - (1.5 - 4/200)
  assert.deepEqual(r.gainAt, { side: 'atOrAbove', strike: 100 });
  assert.deepEqual(r.lossAt, { side: 'atOrBelow', strike: 95 });
  const at = (p) => r.rows.find((x) => x.price === p);
  close(at(97.5).total, -204); // value 2.5 -> -1 x 200 - 4
  close(at(98.52).total, 0);
  close(at(105).total, 296);
  close(at(90).total, -704);
  assert.equal(r.shortStrike, 100);
  assert.deepEqual(r.shortAlone, { capped: true, worst: 20000 });
});

test('bear put debit 95/100 for 2.2 with a price of 97', () => {
  const r = V.analyse({ ...base, kind: 'put-debit', low: 95, high: 100, premium: 2.2, price: 97 });
  close(r.maxLoss, 220);
  close(r.maxGain, 280);
  close(r.breakEven, 97.8);
  close(r.atPrice.unit, 0.8); // 100 - 97 = 3 - 2.2
  close(r.atPrice.total, 80);
  assert.deepEqual(r.gainAt, { side: 'atOrBelow', strike: 95 });
  assert.equal(r.rows.filter((x) => x.yours).length, 1);
  assert.equal(r.longStrike, 100);
});

test('bear call credit 100/110 for 3', () => {
  const r = V.analyse({ ...base, kind: 'call-credit', high: 110, premium: 3 });
  close(r.maxGain, 300);
  close(r.maxLoss, 700);
  close(r.breakEven, 103);
  close(V.payoff({ ...base, kind: 'call-credit', high: 110, premium: 3 }, 120).total, -700);
  close(V.payoff({ ...base, kind: 'call-credit', high: 110, premium: 3 }, 106).total, -300);
  assert.equal(r.shortStrike, 100);
});

test('rows at the same price merge; your price marks the merged row', () => {
  const r = V.analyse({ ...base, high: 104, price: 102 }); // midpoint = break-even = 102
  const rows = r.rows.filter((x) => x.price === 102);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, 'break-even');
  assert.equal(rows[0].yours, true);
  assert.equal(V.analyse({ ...base, low: 2, high: 5, premium: 1 }).rows[0].price, 0); // below clamps at 0
});

test('fees larger than the best case: no break-even', () => {
  const r = V.analyse({ ...base, high: 101, premium: 0.99, fees: 5 });
  close(r.maxGain, -4);
  close(r.maxLoss, 104);
  assert.equal(r.breakEven, null);
  assert.equal(r.ratio, null);
});

test('bad input gives a message; parser accepts $ and commas', () => {
  assert.match(V.analyse({ ...base, kind: 'x' }).error, /spread type/);
  assert.match(V.analyse({ ...base, low: 0 }).error, /lower strike/);
  assert.match(V.analyse({ ...base, high: 100 }).error, /above the lower/);
  assert.match(V.analyse({ ...base, premium: 5 }).error, /never make money/);
  assert.match(V.analyse({ ...base, kind: 'put-credit', premium: 6 }).error, /would not offer/);
  assert.match(V.analyse({ ...base, premium: 0 }).error, /debit/);
  assert.match(V.analyse({ ...base, multiplier: 0 }).error, /multiplier/);
  assert.match(V.analyse({ ...base, contracts: 1.5 }).error, /whole number/);
  assert.match(V.analyse({ ...base, fees: NaN }).error, /fees/);
  assert.match(V.analyse({ ...base, price: NaN }).error, /price at expiration/);
  assert.equal(V.parseNumber('$1,000.5'), 1000.5);
  assert.equal(V.parseOptional(' '), null);
  assert.ok(Number.isNaN(V.parseNumber('-1')));
});

test('lesson page and generator config both carry the widget', () => {
  const root = join(__dirname, '..');
  const route = '/learn/lessons/options/defined-risk-strategies.html';
  const html = readFileSync(join(root, route.slice(1)), 'utf8');
  for (const id of ['vsBox', 'vsKind', 'vsLow', 'vsHigh', 'vsPrem', 'vsMult', 'vsQty', 'vsFees', 'vsPrice', 'vsBody', 'vsNote', 'vsLegs']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /\/assets\/js\/vertical-spread\.js\?v=/);
  assert.match(html, /href="#vsBox"/);
  const cfg = require('../content/lesson-tools.cjs')[route];
  assert.ok(cfg && cfg.html.includes('id="vsBox"') && cfg.head.includes('vertical-spread.js'));
  assert.ok(html.includes(cfg.head));
  const i = html.indexOf('<form class="lesson-tool" id="vsBox"');
  assert.equal(html.slice(i, html.indexOf('</form>', i) + 7), cfg.html);
});
