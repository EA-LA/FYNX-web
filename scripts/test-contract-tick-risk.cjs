// Contract specs lesson box (site-qa run 124). Expected values computed
// independently by hand: tick value = tick x multiplier, risk = ticks x tick value
// x contracts + fees x contracts, most that fit = floor(budget / per-contract risk).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const C = require('../assets/js/contract-tick-risk.js');

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const base = { tickSize: 0.25, multiplier: 20, contracts: 3, stopTicks: 8, fees: 0, smallMultiplier: 2, equity: null, riskPct: null };

test('lesson example: $5 tick, 8 ticks x 3 contracts = $120', () => {
  const r = C.analyse(base);
  close(r.tickValue, 5);
  close(r.ticksPerPoint, 4);
  close(r.stopPoints, 2);
  close(r.lossPerContract, 40);
  close(r.totalRisk, 120);
  close(r.small.tickValue, 0.5);
  close(r.small.totalRisk, 12);
  close(r.small.ratio, 10);
  close(r.small.equivalent, 30);
  assert.equal(r.budget, null);
  assert.equal(r.maxContracts, null);
  assert.deepEqual(r.rows.map((x) => x.ticks), [4, 8, 12, 20, 40, 80]);
  assert.equal(r.rows.filter((x) => x.yours).length, 1);
  const forty = r.rows.find((x) => x.ticks === 40);
  close(forty.points, 10);
  close(forty.total, 600);
  close(forty.smallTotal, 60);
});

test('fees and a 1% budget on $10,000 size the position', () => {
  const r = C.analyse({ ...base, fees: 4, equity: 10000, riskPct: 1 });
  close(r.perContract, 44);
  close(r.feesTotal, 12);
  close(r.totalRisk, 132);
  close(r.budget, 100);
  assert.equal(r.maxContracts, 2); // 100 / 44 = 2.27
  close(r.budgetUsed, 88);
  close(r.small.perContract, 8); // 8 x $0.50 + $4
  assert.equal(r.small.maxContracts, 12); // 100 / 8 = 12.5
  assert.deepEqual(r.rows.map((x) => x.fits), [4, 2, 1, 0, 0, 0]); // 100/24, 100/44, 100/64, 100/104 ...
});

test('$10 tick contract: 0.01 x $1,000; 20 ticks = 0.2 points = $200', () => {
  const r = C.analyse({ ...base, tickSize: 0.01, multiplier: 1000, contracts: 1, stopTicks: 20, smallMultiplier: 100 });
  close(r.tickValue, 10);
  close(r.ticksPerPoint, 100);
  close(r.stopPoints, 0.2);
  close(r.totalRisk, 200);
  close(r.small.tickValue, 1);
  close(r.small.totalRisk, 20);
});

test('budget exactly equal to the risk fits despite float noise; too small fits 0', () => {
  // 0.1 x 3 ticks x $10 = $3 per contract; 1% of $300 = $3.
  const exact = C.analyse({ ...base, tickSize: 0.1, multiplier: 10, contracts: 1, stopTicks: 3, smallMultiplier: null, equity: 300, riskPct: 1 });
  close(exact.perContract, 3);
  assert.equal(exact.maxContracts, 1);
  assert.equal(exact.small, null);
  assert.ok(exact.rows.every((x) => x.smallTotal === null));
  const tiny = C.analyse({ ...base, equity: 2000, riskPct: 1 }); // $20 budget < $40
  assert.equal(tiny.maxContracts, 0);
  assert.equal(tiny.small.maxContracts, 5); // 20 / 4
});

test('custom stop merges into the table in order', () => {
  const r = C.analyse({ ...base, stopTicks: 15 });
  assert.deepEqual(r.rows.map((x) => x.ticks), [4, 8, 12, 15, 20, 40, 80]);
  assert.equal(r.rows.find((x) => x.yours).ticks, 15);
  close(r.rows.find((x) => x.yours).total, 225); // 15 x $5 x 3
});

test('bad input gives a message; parser accepts $ and commas, blanks are optional', () => {
  assert.match(C.analyse({ ...base, tickSize: 0 }).error, /tick size/);
  assert.match(C.analyse({ ...base, multiplier: NaN }).error, /multiplier/);
  assert.match(C.analyse({ ...base, contracts: 1.5 }).error, /whole number of contracts/);
  assert.match(C.analyse({ ...base, stopTicks: 2.5 }).error, /whole number of ticks/);
  assert.match(C.analyse({ ...base, fees: NaN }).error, /fees/);
  assert.match(C.analyse({ ...base, smallMultiplier: 20 }).error, /smaller version/);
  assert.match(C.analyse({ ...base, equity: 10000 }).error, /both/);
  assert.match(C.analyse({ ...base, equity: 10000, riskPct: 0 }).error, /risk %/);
  assert.match(C.analyse({ ...base, equity: 10000, riskPct: 150 }).error, /risk %/);
  assert.equal(C.parseNumber('$10,000'), 10000);
  assert.equal(C.parseOptional('  '), null);
  assert.ok(Number.isNaN(C.parseOptional('-2')));
  assert.ok(Number.isNaN(C.parseNumber('1e3')));
});

test('lesson page and generator config both carry the widget', () => {
  const root = join(__dirname, '..');
  const route = '/learn/lessons/futures/contract-specs-every-trader-must-know.html';
  const html = readFileSync(join(root, route.slice(1)), 'utf8');
  for (const id of ['cstBox', 'cstTick', 'cstMult', 'cstQty', 'cstStop', 'cstFees', 'cstSmall', 'cstEquity', 'cstRisk', 'cstBody', 'cstNote']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /\/assets\/js\/contract-tick-risk\.js\?v=/);
  assert.match(html, /href="#cstBox"/);
  const cfg = require('../content/lesson-tools.cjs')[route];
  assert.ok(cfg && cfg.html.includes('id="cstBox"') && cfg.head.includes('contract-tick-risk.js'));
  const i = html.indexOf('<form class="lesson-tool" id="cstBox"');
  assert.equal(html.slice(i, html.indexOf('</form>', i) + 7), cfg.html);
});
