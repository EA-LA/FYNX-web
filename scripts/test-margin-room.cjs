'use strict';
// Margin calculator "How far can price move against you?" card, run against the real inline script.
// Expected values checked independently in Python (run 90).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const page = readFileSync(join(__dirname, '..', 'tools', 'margin.html'), 'utf8');
const inline = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .find(source => source.includes('function calculateMargin()'));
assert.ok(inline, 'The margin calculator script must exist');

function run(values) {
  const dom = new JSDOM(page, { url: 'https://www.fynxfinanceworld.com/tools/margin.html', runScripts: 'outside-only' });
  dom.window.eval(inline);
  const doc = dom.window.document;
  for (const [id, value] of Object.entries(values)) doc.getElementById(id).value = value;
  doc.getElementById('calculateBtn').click();
  const rows = [...doc.querySelectorAll('#roomTable tbody tr')].map(tr => [...tr.cells].map(td => {
    const cell = td.cloneNode(true);
    cell.querySelectorAll('.room-sub').forEach(n => n.remove());
    return cell.textContent.trim();
  }));
  const lots = doc.getElementById('roomLots').textContent.replace(/\s+/g, ' ');
  const hidden = doc.getElementById('roomCard').hidden;
  dom.window.close();
  return { rows, lots, hidden };
}

test('EURUSD default: pips to margin call, stop-out and zero; max lots', () => {
  const { rows, lots, hidden } = run({});
  assert.equal(hidden, false);
  assert.deepEqual(rows, [
    ['100%', '$4,166.67', '83.3', '1.09167', '1.10833'],
    ['50%', '$2,083.33', '291.7', '1.07083', '1.12917'],
    ['0%', '$0.00', '500.0', '1.05000', '1.15000'],
  ]);
  assert.match(lots, /free margin opens \(100% level\): 1\.22 lots/);
  assert.match(lots, /300% or more: 0\.31 lots/);
  assert.match(lots, /Margin per lot at this price and leverage: \$3,666\.67/);
});

test('USD-base JPY pair uses 0.01 pips and 3 decimals', () => {
  const { rows, lots } = run({ pairType: 'usdBase', accountBalance: '10000', lotSize: '2', entryPrice: '150.25', leverage: '100', pipSize: '0.01', usedMarginExisting: '0' });
  assert.deepEqual(rows.map(r => r.slice(2)), [
    ['601.0', '144.240', '156.260'],
    ['676.1', '143.489', '157.011'],
    ['751.3', '142.738', '157.763'], // exactly 751.25 pips; display rounds half up,
  ]);
  assert.match(lots, /100% level\): 10\.00 lots/);
  assert.match(lots, /300% or more: 3\.33 lots/);
});

test('a trade that opens below margin call says so instead of showing a distance', () => {
  const { rows, lots } = run({ accountBalance: '1000', usedMarginExisting: '0' });
  assert.match(rows[0][2], /Already below this level/);
  assert.match(rows[1][2], /Already below this level/);
  assert.deepEqual(rows[2].slice(2), ['100.0', '1.09000', '1.11000']);
  assert.match(lots, /100% level\): 0\.27 lots/);
});

test('invalid inputs hide the card', () => {
  const { hidden } = run({ leverage: '0' });
  assert.equal(hidden, true);
});
