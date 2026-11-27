'use strict';
// [site-qa] run 115: Break-Even "Same trade, other spreads" table.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spreadRows } = require('../assets/js/breakeven-spreads.js');

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('EURUSD long, 1 lot, $10/pip, 1 pip spread, $7 commission (hand-worked)', () => {
  const rows = spreadRows({ type: 'buy', entry: 1.1, lot: 1, pipSize: 0.0001, pipValue: 10, commission: 7, spread: 1 });
  assert.deepEqual(rows.map((r) => r.spread), [0.2, 0.5, 1, 2, 3, 5, 10]);
  assert.deepEqual(rows.map((r) => r.yours), [false, false, true, false, false, false, false]);
  const expect = { 0.2: [9, 0.9, 1.10009, -8], 0.5: [12, 1.2, 1.10012, -5], 1: [17, 1.7, 1.10017, 0], 2: [27, 2.7, 1.10027, 10], 10: [107, 10.7, 1.10107, 90] };
  for (const r of rows) {
    if (!expect[r.spread]) continue;
    const [cost, pips, be, extra] = expect[r.spread];
    near(r.cost, cost); near(r.pips, pips); near(r.breakEven, be); near(r.extra, extra);
  }
});

test('your own spread is added once, in order, when it is not a preset', () => {
  const rows = spreadRows({ type: 'buy', entry: 1.1, lot: 1, pipSize: 0.0001, pipValue: 10, commission: 0, spread: 1.4 });
  assert.deepEqual(rows.map((r) => r.spread), [0.2, 0.5, 1, 1.4, 2, 3, 5, 10]);
  assert.equal(rows.filter((r) => r.yours).length, 1);
  near(rows[3].pips, 1.4);
});

test('USDJPY short, 2 lots, $6.67/pip, 1.5 pip spread, $14 commission', () => {
  const rows = spreadRows({ type: 'sell', entry: 150, lot: 2, pipSize: 0.01, pipValue: 6.67, commission: 14, spread: 1.5 });
  const three = rows.find((r) => r.spread === 3);
  // 3 x 6.67 x 2 = 40.02; + 14 = 54.02; / 13.34 = 4.04948 pips; 150 - 0.0404948 = 149.9595052
  near(three.cost, 54.02, 1e-9); near(three.pips, 54.02 / 13.34); near(three.breakEven, 150 - (54.02 / 13.34) * 0.01);
  near(three.extra, 1.5 * 13.34, 1e-9);
  assert.ok(three.breakEven < 150, 'short break-even is below entry');
});

test('invalid inputs give no rows; a short that would go below zero shows null', () => {
  assert.deepEqual(spreadRows({ type: 'buy', entry: 0, lot: 1, pipSize: 0.0001, pipValue: 10, commission: 7, spread: 1 }), []);
  assert.deepEqual(spreadRows({ type: 'buy', entry: 1.1, lot: 1, pipSize: 0.0001, pipValue: 10, commission: -1, spread: 1 }), []);
  assert.deepEqual(spreadRows({ type: 'buy', entry: 1.1, lot: 1, pipSize: 0.0001, pipValue: NaN, commission: 7, spread: 1 }), []);
  const rows = spreadRows({ type: 'sell', entry: 0.0005, lot: 1, pipSize: 0.0001, pipValue: 10, commission: 0, spread: 1 });
  assert.equal(rows.find((r) => r.spread === 10).breakEven, null);
});

test('page: table appears with the result and hides when inputs change', async () => {
  const { JSDOM } = require('jsdom');
  const html = readFileSync(join(__dirname, '..', 'tools', 'breakeven.html'), 'utf8');
  assert.ok(html.includes('/assets/js/breakeven-spreads.js'), 'page loads the module');
  const inline = html.match(/<script>\s*(function clearResults\([\s\S]*?)<\/script>/)[1];
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'outside-only' });
  const { window } = dom;
  window.eval(inline);
  window.eval(readFileSync(join(__dirname, '..', 'assets', 'js', 'breakeven-spreads.js'), 'utf8'));
  const doc = window.document;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  assert.equal(doc.getElementById('beSpreads').hidden, true);
  window.calc();
  await tick();
  assert.equal(doc.getElementById('beSpreads').hidden, false);
  const rows = [...doc.querySelectorAll('#beSpreadsBody tr')].map((tr) => [...tr.children].map((c) => c.textContent));
  assert.deepEqual(rows[2], ['1 (yours)', '1.70', '1.10017', '$17.00', '—']);
  assert.deepEqual(rows[6], ['10', '10.70', '1.10107', '$107.00', '+$90.00']);
  assert.deepEqual(rows[0], ['0.2', '0.90', '1.10009', '$9.00', '−$8.00']);
  const spread = doc.getElementById('spread');
  spread.value = '2';
  spread.dispatchEvent(new window.Event('input'));
  await tick();
  assert.equal(doc.getElementById('beSpreads').hidden, true);
  assert.equal(doc.querySelectorAll('#beSpreadsBody tr').length, 0);
  window.calc();
  await tick();
  assert.equal(doc.querySelector('#beSpreadsBody .be-row th').textContent, '2 (yours)');
});
