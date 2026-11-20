'use strict';
// Liquidation Guard "Same margin, different leverage" table, run against the real inline script.
// Expected values checked independently in Python with Decimal (run 109).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const page = readFileSync(join(__dirname, '..', 'tools', 'liquidation-guard.html'), 'utf8');
const inline = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .find(source => source.includes('function calculateGuard()'));
assert.ok(inline, 'The liquidation guard script must exist');

function run(values) {
  const dom = new JSDOM(page, { url: 'https://www.fynxfinanceworld.com/tools/liquidation-guard.html', runScripts: 'outside-only' });
  dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  dom.window.eval(inline);
  const doc = dom.window.document;
  for (const [id, value] of Object.entries(values)) doc.getElementById(id).value = value;
  doc.getElementById('calculateBtn').click();
  const rows = [...doc.querySelectorAll('#levTable tbody tr')].map(tr => [...tr.cells].map(td => td.textContent.replace(/\s+/g, ' ').trim()));
  const out = { rows, hidden: doc.getElementById('levCard').hidden, pill: doc.getElementById('maxLeveragePill').textContent, bad: [...doc.querySelectorAll('#levTable tbody tr.lev-bad')].length };
  dom.window.close();
  return out;
}

test('default long: liquidation price, move and loss at stop per leverage', () => {
  const { rows, hidden, pill, bad } = run({});
  assert.equal(hidden, false);
  assert.equal(pill, 'Max leverage for this stop: 22.2x');
  assert.deepEqual(rows, [
    ['1x', '0.5', '99.50%', '−$10.00'],
    ['2x', '50.5', '49.50%', '−$20.00'],
    ['3x', '67.1667', '32.83%', '−$30.00'],
    ['5x', '80.5', '19.50%', '−$50.00'],
    ['10x yours', '90.5', '9.50%', '−$100.00'],
    ['20x', '95.5', '4.50%', '−$200.00'],
    ['22.2x max for your stop', '95.9955', '4.00%', '−$222.00'],
    ['50x', '98.5', '1.50%', 'Liquidated (−$250.00)'],
    ['100x', '99.5', '0.50%', 'Liquidated (−$250.00)'],
  ]);
  assert.equal(bad, 2);
});

test('short where the stop sits exactly on the 20x liquidation price', () => {
  const { rows, pill } = run({ positionSide: 'short', entryPrice: '2000', accountBalance: '5000', riskAllocation: '500', leverage: '15', maintenanceMargin: '1', stopPrice: '2080' });
  assert.equal(pill, 'Max leverage for this stop: 19.9x');
  const byLev = Object.fromEntries(rows.map(r => [r[0], r.slice(1)]));
  assert.deepEqual(byLev['15x yours'], ['2,113.3333', '5.67%', '−$300.00']);
  assert.deepEqual(byLev['19.9x max for your stop'].slice(2), ['−$398.00']);
  assert.deepEqual(byLev['50x'], ['2,020', '1.00%', 'Liquidated (−$500.00)']);
  assert.deepEqual(byLev['100x'], ['Liquidated at entry']);
});

test('table hides on invalid input', () => {
  const { hidden, rows } = run({ entryPrice: '0' });
  assert.equal(hidden, true);
  assert.equal(rows.length, 0);
});
