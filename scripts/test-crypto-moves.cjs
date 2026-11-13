'use strict';
// Crypto calculator "If the price moves" table and price precision, run against the real inline script.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const page = readFileSync(join(__dirname, '..', 'tools', 'crypto.html'), 'utf8');
const inline = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .find(source => source.includes('function calculateCryptoTrade()'));
assert.ok(inline, 'The crypto calculator script must exist');

function run(values) {
  const dom = new JSDOM(page, { url: 'https://www.fynxfinanceworld.com/tools/crypto.html', runScripts: 'outside-only' });
  dom.window.eval(inline);
  const doc = dom.window.document;
  for (const [id, value] of Object.entries(values)) doc.getElementById(id).value = value;
  doc.getElementById('calculateBtn').click();
  const rows = [...doc.querySelectorAll('#moveTable tbody tr')].map(tr => [...tr.cells].map(td => {
    const cell = td.cloneNode(true);
    cell.querySelectorAll('.mv-roi-inline').forEach(n => n.remove()); // phone-only copy of the ROI column
    return cell.textContent.trim();
  }));
  const inlineRoi = [...doc.querySelectorAll('#moveTable tbody .mv-roi-inline')].map(n => n.textContent);
  const text = doc.getElementById('resultArea').textContent.replace(/\s+/g, ' ');
  dom.window.close();
  return { rows, text, inlineRoi };
}

test('long BTC example: moves, your exit and break-even after fees (checked in Python)', () => {
  const { rows, text, inlineRoi } = run({ capital: '1000', entryPrice: '65000', exitPrice: '70000', feePercent: '0.1', tradeType: 'long' });
  const byLabel = Object.fromEntries(rows.map(r => [r[0], r.slice(1)]));
  assert.deepEqual(byLabel['−50%'], ['$32,500.00', '−$501.50', '−50.15%']);
  assert.deepEqual(byLabel['+10%'], ['$71,500.00', '+$97.90', '+9.79%']);
  assert.deepEqual(byLabel['+100%'], ['$130,000.00', '+$997.00', '+99.70%']);
  assert.deepEqual(byLabel['Your exit'], ['$70,000.00', '+$74.85', '+7.48%']);
  assert.deepEqual(byLabel['Break-even'], ['$65,130.13', '$0.00', '0.00%']);
  assert.equal(rows.length, 9);
  assert.deepEqual(inlineRoi, rows.map(r => r[3]), 'phone ROI line matches the ROI column');
  const prices = rows.map(r => Number(r[1].replace(/[$,]/g, '')));
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), 'rows sorted by price');
  assert.match(text, /Net Profit: \$74\.85/);
});

test('cheap coins keep their decimals instead of rounding to cents', () => {
  const { rows, text } = run({ capital: '500', entryPrice: '0.1234', exitPrice: '0.15', feePercent: '0.1', tradeType: 'long' });
  assert.match(text, /Break-even Price\s*\$0\.1236\b/);
  const be = rows.find(r => r[0] === 'Break-even');
  assert.equal(be[1], '$0.1236');
});

test('short that more than doubles warns that the loss exceeds the stake', () => {
  const { rows, text } = run({ capital: '500', entryPrice: '0.1234', exitPrice: '0.2468', feePercent: '0.1', tradeType: 'short' });
  assert.match(text, /loses more than the \$500\.00 you put in/);
  const exit = rows.find(r => r[0] === 'Your exit');
  assert.deepEqual(exit.slice(2), ['−$501.50', '−100.30%']);
});

test('errors show no table', () => {
  const { rows } = run({ capital: '', entryPrice: '100', exitPrice: '110', feePercent: '0', tradeType: 'long' });
  assert.equal(rows.length, 0);
});
