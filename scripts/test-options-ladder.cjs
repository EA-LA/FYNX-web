'use strict';
// Options calculator "P/L at other expiration prices" table, run against the real inline script.
// Expected values were computed independently in Python (payoff = intrinsic x 100 x contracts -/+ premium).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const page = readFileSync(join(__dirname, '..', 'tools', 'options.html'), 'utf8');
const inline = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .find(source => source.includes('function calculateOptionPL()'));
assert.ok(inline, 'The options calculator script must exist');

function run(values) {
  const dom = new JSDOM(page, { url: 'https://www.fynxfinanceworld.com/tools/options.html', runScripts: 'outside-only' });
  dom.window.eval(inline);
  const doc = dom.window.document;
  for (const [id, value] of Object.entries(values)) doc.getElementById(id).value = value;
  doc.getElementById('calculateBtn').click();
  const rows = [...doc.querySelectorAll('#payoffTable tbody tr')].map(tr => {
    const first = tr.cells[0];
    const label = first.querySelector('small').textContent;
    const price = first.firstChild.textContent;
    const pl = tr.cells[1].cloneNode(true);
    const inlineReturn = pl.querySelector('.pl-ret').textContent; // phone-only copy of the return column
    pl.querySelector('.pl-ret').remove();
    assert.equal(inlineReturn, tr.cells[2].textContent);
    return [price, label, pl.textContent, tr.cells[2].textContent, tr.classList.contains('is-key')];
  });
  const text = doc.getElementById('resultArea').textContent.replace(/\s+/g, ' ');
  const head = doc.querySelector('#payoffTable thead') ? doc.querySelector('#payoffTable thead').textContent : '';
  const result = { rows, text, head, doc };
  return { ...result, close: () => dom.window.close() };
}

test('long call 100 strike, 3 premium, price 110: ladder, break-even and return on premium', () => {
  const r = run({ optionType: 'call', positionType: 'long', strikePrice: '100', premium: '3', stockPrice: '110', contracts: '1' });
  assert.deepEqual(r.rows, [
    ['$80.00', '−20% vs strike', '−$300.00', '−100.00%', false],
    ['$90.00', '−10% vs strike', '−$300.00', '−100.00%', false],
    ['$95.00', '−5% vs strike', '−$300.00', '−100.00%', false],
    ['$100.00', 'Strike', '−$300.00', '−100.00%', true],
    ['$103.00', 'Break-even', '$0.00', '0.00%', true],
    ['$105.00', '+5% vs strike', '+$200.00', '+66.67%', false],
    ['$110.00', '+10% vs strike · Your price', '+$700.00', '+233.33%', true],
    ['$120.00', '+20% vs strike', '+$1,700.00', '+566.67%', false]
  ]);
  assert.match(r.text, /Profit: \$700\.00/);
  assert.match(r.text, /Return on Premium Paid: \+233\.33%/);
  assert.match(r.head, /On premium/);
  r.close();
});

test('short put 50 strike, 2 premium, price 45, 2 contracts: losses below break-even, premium kept above strike', () => {
  const r = run({ optionType: 'put', positionType: 'short', strikePrice: '50', premium: '2', stockPrice: '45', contracts: '2' });
  const byPrice = Object.fromEntries(r.rows.map(row => [row[0], row.slice(1)]));
  assert.deepEqual(byPrice['$40.00'], ['−20% vs strike', '−$1,600.00', '−400.00%', false]);
  assert.deepEqual(byPrice['$45.00'], ['−10% vs strike · Your price', '−$600.00', '−150.00%', true]);
  assert.deepEqual(byPrice['$47.50'], ['−5% vs strike', '−$100.00', '−25.00%', false]);
  assert.deepEqual(byPrice['$48.00'], ['Break-even', '$0.00', '0.00%', true]);
  assert.deepEqual(byPrice['$50.00'], ['Strike', '+$400.00', '+100.00%', true]);
  assert.deepEqual(byPrice['$60.00'], ['+20% vs strike', '+$400.00', '+100.00%', false]);
  assert.equal(r.rows.length, 8);
  assert.match(r.text, /Share of Premium Kept: −150\.00%/);
  assert.match(r.head, /Of premium/);
  r.close();
});

test('long put with premium at or above the strike says it cannot break even instead of a negative price', () => {
  const r = run({ optionType: 'put', positionType: 'long', strikePrice: '5', premium: '6', stockPrice: '1', contracts: '1' });
  assert.match(r.text, /Break-even Price: Not reachable \(premium ≥ strike\)/);
  assert.match(r.text, /Max Profit None \(premium ≥ strike\)/);
  assert.doesNotMatch(r.text, /\$-|−\$1\.00 Max/);
  assert.ok(!r.rows.some(row => row[1].includes('Break-even')));
  r.close();
});

test('editing an input clears the old table; invalid input shows no table', () => {
  const r = run({ optionType: 'call', positionType: 'long', strikePrice: '100', premium: '3', stockPrice: '110', contracts: '1' });
  const strike = r.doc.getElementById('strikePrice');
  strike.value = '105';
  strike.dispatchEvent(new r.doc.defaultView.Event('input'));
  assert.equal(r.doc.getElementById('payoffTable'), null);
  strike.value = '';
  r.doc.getElementById('calculateBtn').click();
  assert.equal(r.doc.getElementById('payoffTable'), null);
  assert.match(r.doc.getElementById('resultArea').textContent, /valid values/);
  r.close();
});
