// Futures margin lesson box (site-qa run 123). Expected values computed
// independently by hand: notional = price x multiplier x contracts,
// loss = notional x move, margin call when equity < maintenance x contracts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const F = require('../assets/js/futures-margin.js');

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const base = { price: 5000, multiplier: 20, contracts: 1, side: 'long', initial: 5000, maintenance: 4500, equity: 10000, movePct: 2 };

test('lesson example: $100,000 notional on $5,000 margin, 2% move', () => {
  const r = F.analyse(base);
  close(r.notional, 100000);
  close(r.initialTotal, 5000);
  close(r.notionalToMargin, 20);
  close(r.leverageOnEquity, 10);
  close(r.marginPctOfNotional, 5);
  close(r.mine.loss, 2000);
  close(r.mine.after, 8000);
  assert.equal(r.mine.status, 'ok');
  close(r.callPct, 5.5);
  close(r.callPoints, 275);
  close(r.callPrice, 4725);
  close(r.gonePct, 10);
  close(r.gonePoints, 500);
  close(r.gonePrice, 4500);
  assert.equal(r.underfunded, false);
  assert.deepEqual(r.rows.map((x) => x.pct), [1, 2, 3, 5, 10, 20]);
  assert.equal(r.rows.filter((x) => x.yours).length, 1);
  assert.deepEqual(r.rows.map((x) => x.status), ['ok', 'ok', 'ok', 'ok', 'gone', 'gone']);
});

test('only the margin in the account: tiny buffer, call and top-up', () => {
  const r = F.analyse({ ...base, equity: 5000 });
  close(r.callPct, 0.5);
  close(r.callPrice, 4975);
  assert.equal(r.mine.status, 'call');
  close(r.mine.after, 3000);
  close(r.mine.topUp, 2000);
  const ten = r.rows.find((x) => x.pct === 10);
  assert.equal(ten.status, 'gone');
  close(ten.after, -5000);
});

test('short: adverse move is up; three contracts scale everything', () => {
  const r = F.analyse({ ...base, contracts: 3, side: 'short', equity: 20000, movePct: 3 });
  close(r.notional, 300000);
  close(r.maintenanceTotal, 13500);
  close(r.mine.loss, 9000);
  close(r.mine.price, 5150);
  assert.equal(r.mine.status, 'call');
  close(r.mine.topUp, 4000);
  close(r.callPct, 6500 / 3000);
  close(r.callPoints, 6500 / 60);
  close(r.callPrice, 5000 * (1 + 6500 / 300000));
  close(r.gonePrice, 5000 * (1 + 20000 / 300000));
});

test('custom move merges into the table; underfunded and already-called flags', () => {
  const r = F.analyse({ ...base, movePct: 7.5 });
  assert.deepEqual(r.rows.map((x) => x.pct), [1, 2, 3, 5, 7.5, 10, 20]);
  assert.equal(r.rows.find((x) => x.yours).pct, 7.5);
  const u = F.analyse({ ...base, equity: 4000 });
  assert.equal(u.underfunded, true);
  assert.equal(u.alreadyCalled, true);
  assert.equal(u.callPct, 0);
  assert.equal(F.analyse({ ...base, movePct: 0 }).mine.loss, 0);
});

test('bad input gives a message; parser accepts $ and commas', () => {
  assert.match(F.analyse({ ...base, price: 0 }).error, /price/);
  assert.match(F.analyse({ ...base, multiplier: NaN }).error, /multiplier/);
  assert.match(F.analyse({ ...base, contracts: 1.5 }).error, /whole number/);
  assert.match(F.analyse({ ...base, maintenance: 6000 }).error, /Maintenance/);
  assert.match(F.analyse({ ...base, equity: 0 }).error, /equity/);
  assert.match(F.analyse({ ...base, movePct: 120 }).error, /adverse move/);
  assert.match(F.analyse({ ...base, side: 'flat' }).error, /long or short/);
  assert.equal(F.parseNumber('$10,000'), 10000);
  assert.equal(F.parseNumber('2%'), 2);
  assert.ok(Number.isNaN(F.parseNumber('-2')));
  assert.ok(Number.isNaN(F.parseNumber('1e3')));
});

test('lesson page and generator config both carry the widget', () => {
  const root = join(__dirname, '..');
  const html = readFileSync(join(root, 'learn/lessons/futures/futures-margin-and-leverage-101.html'), 'utf8');
  for (const id of ['fmBox', 'fmPrice', 'fmMult', 'fmQty', 'fmSide', 'fmInit', 'fmMaint', 'fmEquity', 'fmMove', 'fmBody', 'fmNote']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /\/assets\/js\/futures-margin\.js\?v=/);
  assert.match(html, /href="#fmBox"/);
  const tools = require('../content/lesson-tools.cjs');
  const cfg = tools['/learn/lessons/futures/futures-margin-and-leverage-101.html'];
  assert.ok(cfg && cfg.html.includes('id="fmBox"') && cfg.head.includes('futures-margin.js'));
  const i = html.indexOf('<form class="lesson-tool" id="fmBox"');
  assert.equal(html.slice(i, html.indexOf('</form>', i) + 7), cfg.html);
});
