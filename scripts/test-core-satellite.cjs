// Drift, rebalance and overlap check on the Building a Core-Satellite Plan lesson (site-qa run 127).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const C = require('../assets/js/core-satellite.js');

const fund = (name, target, value, shared = null) => ({ name, target, value, shared });
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('lesson example: $10,000 at 80/20 is on target; look-through 9.6%', () => {
  const r = C.analyse([fund('Core', 80, 8000, 7), fund('Satellite', 20, 2000, 20)], 5);
  assert.equal(r.total, 10000);
  assert.deepEqual(r.rows.map((x) => [x.now, x.drift, x.trade, x.outside]), [[80, 0, 0, false], [20, 0, 0, false]]);
  assert.equal(r.anyOutside, false);
  assert.deepEqual(r.cash, { deposit: 0, buys: [0, 0], newTotal: 10000 });
  // 0.8 x 7% + 0.2 x 20% = 5.6% + 4% = 9.6% -> $960, more than the 7% in the core alone.
  near(r.overlap.pctNow, 9.6);
  near(r.overlap.pctTarget, 9.6);
  assert.equal(r.overlap.dollars, 960);
  assert.deepEqual(r.overlap.contributions, [560, 400]);
});

test('satellite rally: drift beyond the band, trades cancel, cash-only deposit', () => {
  const r = C.analyse([fund('Core', 80, 8200, 7), fund('Satellite', 20, 3300, 20)], 5);
  assert.equal(r.total, 11500);
  // 8200/11500 = 71.304%, 3300/11500 = 28.696%
  near(r.rows[0].drift, 8200 / 115 - 80);
  near(r.rows[1].drift, 3300 / 115 - 20);
  assert.equal(r.rows[1].outside, true);
  assert.equal(r.worst.index, 0); // ties keep the first fund
  assert.deepEqual(r.rows.map((x) => x.trade), [1000, -1000]); // 9200 - 8200, 2300 - 3300
  // No selling: total must reach 3300 / 0.20 = 16,500 -> deposit 5,000, all into the core.
  assert.deepEqual(r.cash, { deposit: 5000, buys: [5000, 0], newTotal: 16500 });
  near(r.overlap.pctNow, (8200 * 0.07 + 3300 * 0.2) / 115);
  assert.equal(r.overlap.dollars, 1234);
  assert.equal(C.tradeText(r.rows[1].trade), 'Sell $1,000.00');
});

test('three-fund practice and brute-force identities', () => {
  const r = C.analyse([fund('Core', 60, 6400, 6), fund('Tech', 25, 2900, 21), fund('Dividend', 15, 1200, 0)], 5);
  assert.equal(r.total, 10500);
  assert.deepEqual(r.rows.map((x) => x.trade), [-100, -275, 375]); // 6300-6400, 2625-2900, 1575-1200
  assert.equal(r.anyOutside, false); // drifts +0.95, +2.62, -3.57 pts
  assert.equal(r.worst.name, 'Dividend');
  // Cash only: max(6400/.6, 2900/.25, 1200/.15) = 11,600 -> deposit 1,100.
  assert.deepEqual(r.cash, { deposit: 1100, buys: [560, 0, 540], newTotal: 11600 });
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 300; k++) {
    const a = Math.round(rnd() * 90) + 5, b = Math.round(rnd() * (95 - a)), c = 100 - a - b;
    const fs = [fund('A', a, Math.round(rnd() * 1e5) + 1, Math.round(rnd() * 30)), fund('B', b, Math.round(rnd() * 1e5), null), fund('C', c, Math.round(rnd() * 1e5), Math.round(rnd() * 30))];
    const res = C.analyse(fs, 5);
    assert.ok(!res.error, res.error);
    assert.ok(Math.abs(res.rows.reduce((s, x) => s + x.trade, 0)) < 0.02);
    near(res.rows.reduce((s, x) => s + x.drift, 0), 0, 1e-6);
    if (res.cash) {
      const T = res.cash.newTotal;
      res.cash.buys.forEach((buy, i) => { assert.ok(buy >= 0); near(fs[i].value + buy, (fs[i].target / 100) * T, 0.02); });
      assert.ok(Math.abs(res.cash.buys.reduce((s, x) => s + x, 0) - res.cash.deposit) < 0.03);
    }
    const expect = (fs[0].value * fs[0].shared + fs[2].value * fs[2].shared) / res.total;
    near(res.overlap.pctNow, expect, 1e-6);
  }
});

test('0% target that is still held: no cash-only route; validation', () => {
  const r = C.analyse([fund('Core', 100, 9000), fund('Old satellite', 0, 1000)], 5);
  assert.equal(r.cash, null);
  assert.deepEqual(r.zeroHeld, [1]);
  assert.deepEqual(r.rows.map((x) => x.trade), [1000, -1000]);
  assert.equal(r.overlap, null);
  assert.match(C.analyse([fund('A', 80, 100), fund('B', 30, 100)], 5).error, /add up to 110%/);
  assert.match(C.analyse([fund('A', 100, 0)], 5).error, /above \$0/);
  assert.match(C.analyse([fund('A', 100, 10)], 0).error, /band/);
  assert.match(C.analyse([fund('A', 100, NaN)], 5).error, /Fund 1: enter the current value/);
  assert.match(C.analyse([fund('A', 100, 10, 120)], 5).error, /shared company/);
  assert.match(C.analyse([], 5).error, /at least one fund/);
  assert.equal(C.parseNumber('$8,000'), 8000);
  assert.equal(C.parseNumber('20%'), 20);
  assert.ok(Number.isNaN(C.parseNumber('-5')));
  assert.equal(C.parseOptional(''), null);
  assert.equal(C.pts(-8.6956), '−8.7 pts');
  assert.equal(C.safeName('  ', 2), 'Fund 2');
});

test('lesson page and generator config both carry the widget', () => {
  const root = join(__dirname, '..');
  const route = '/learn/lessons/funds/building-a-core-satellite-plan.html';
  const html = readFileSync(join(root, route.slice(1)), 'utf8');
  for (const id of ['csBox', 'csBand', 'csName1', 'csTarget3', 'csValue2', 'csShared1', 'csBody', 'csNote', 'csOverlap']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /href="#csBox"/);
  const cfg = require('../content/lesson-tools.cjs')[route];
  assert.ok(cfg && cfg.html.includes('id="csBox"') && cfg.head.includes('core-satellite.js'));
  assert.ok(html.includes(cfg.head));
  const i = html.indexOf('<form class="lesson-tool" id="csBox"');
  assert.equal(html.slice(i, html.indexOf('</form>', i) + 7), cfg.html);
});
