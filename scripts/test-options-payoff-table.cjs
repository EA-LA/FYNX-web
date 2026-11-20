'use strict';
// Options calculator "Payoff at expiration" table, run against the real inline script.
// Expected values were computed independently in Python (intrinsic - premium) x shares.
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
    const first = tr.cells[0].cloneNode(true);
    const tag = first.querySelector('.mv-tag');
    const label = tag ? tag.textContent.trim() : '';
    if (tag) tag.remove();
    return { price: first.textContent.trim(), label, pnl: tr.cells[1].textContent.trim(), pct: tr.cells[2].textContent.trim(), cls: tr.className };
  });
  const note = doc.querySelector('.move-note')?.textContent || '';
  const result = doc.getElementById('resultArea');
  const state = { rows, note, resultClass: result.className, text: result.textContent };
  return { doc, dom, state };
}

const byPrice = rows => Object.fromEntries(rows.map(r => [r.price, r]));

test('long call 100 strike, $3 premium, 1 contract', () => {
  const { dom, state } = run({ optionType: 'call', positionType: 'long', strikePrice: '100', premium: '3', stockPrice: '110', contracts: '1' });
  const rows = byPrice(state.rows);
  assert.equal(state.rows.length, 10);
  assert.deepEqual(state.rows.map(r => r.price), ['$70.00', '$80.00', '$90.00', '$95.00', '$100.00', '$103.00', '$105.00', '$110.00', '$120.00', '$130.00']);
  assert.deepEqual([rows['$70.00'].label, rows['$70.00'].pnl, rows['$70.00'].pct], ['−30%', '−$300.00', '−100%']);
  assert.deepEqual([rows['$100.00'].label, rows['$100.00'].pnl], ['Strike', '−$300.00']);
  assert.deepEqual([rows['$103.00'].label, rows['$103.00'].pnl, rows['$103.00'].pct, rows['$103.00'].cls], ['Break-even', '$0.00', '0%', 'is-be']);
  assert.deepEqual([rows['$105.00'].pnl, rows['$105.00'].pct], ['+$200.00', '+66.7%']);
  assert.deepEqual([rows['$110.00'].label, rows['$110.00'].pnl, rows['$110.00'].pct, rows['$110.00'].cls], ['+10% · Your price', '+$700.00', '+233.3%', 'is-yours']);
  assert.deepEqual([rows['$130.00'].pnl, rows['$130.00'].pct], ['+$2,700.00', '+900%']);
  assert.match(state.note, /100 shares/);
  assert.match(state.note, /\$300\.00 premium paid/);
  dom.window.close();
});

test('long put merges break-even with the −5% row and sorts your price in', () => {
  const { dom, state } = run({ optionType: 'put', positionType: 'long', strikePrice: '50', premium: '2.5', stockPrice: '44', contracts: '3' });
  const rows = byPrice(state.rows);
  assert.equal(state.rows.length, 10);
  assert.deepEqual([rows['$35.00'].pnl, rows['$35.00'].pct], ['+$3,750.00', '+500%']);
  assert.deepEqual([rows['$44.00'].label, rows['$44.00'].pnl, rows['$44.00'].pct], ['Your price', '+$1,050.00', '+140%']);
  assert.deepEqual([rows['$47.50'].label, rows['$47.50'].pnl, rows['$47.50'].cls], ['−5% · Break-even', '$0.00', 'is-be']);
  assert.deepEqual([rows['$65.00'].pnl, rows['$65.00'].pct], ['−$750.00', '−100%']);
  dom.window.close();
});

test('short put on an index: premium received, losses below break-even', () => {
  const { dom, state } = run({ optionType: 'put', positionType: 'short', strikePrice: '4500', premium: '125.5', stockPrice: '4380', contracts: '10' });
  const rows = byPrice(state.rows);
  assert.equal(state.rows.length, 11);
  assert.deepEqual([rows['$3,150.00'].pnl, rows['$3,150.00'].pct], ['−$1,224,500.00', '−975.7%']);
  assert.deepEqual([rows['$4,374.50'].label, rows['$4,374.50'].pnl], ['Break-even', '$0.00']);
  assert.deepEqual([rows['$4,380.00'].pnl, rows['$4,380.00'].pct], ['+$5,500.00', '+4.4%']);
  assert.deepEqual([rows['$5,850.00'].pnl, rows['$5,850.00'].pct], ['+$125,500.00', '+100%']);
  assert.match(state.note, /premium received/);
  dom.window.close();
});

test('short call, zero premium shows a dash, and the table goes away when inputs change', () => {
  let { dom, state } = run({ optionType: 'call', positionType: 'short', strikePrice: '20', premium: '1.25', stockPrice: '23', contracts: '2' });
  let rows = byPrice(state.rows);
  assert.deepEqual([rows['$21.00'].pnl, rows['$21.00'].pct], ['+$50.00', '+20%']);
  assert.deepEqual([rows['$23.00'].pnl, rows['$23.00'].pct], ['−$350.00', '−140%']);
  assert.deepEqual([rows['$26.00'].pnl, rows['$26.00'].pct], ['−$950.00', '−380%']);
  dom.window.document.getElementById('premium').value = '2';
  dom.window.document.getElementById('premium').dispatchEvent(new dom.window.Event('input'));
  assert.equal(dom.window.document.getElementById('payoffTable'), null);
  dom.window.close();

  ({ dom, state } = run({ optionType: 'call', positionType: 'long', strikePrice: '10', premium: '0', stockPrice: '12', contracts: '1' }));
  rows = byPrice(state.rows);
  assert.deepEqual([rows['$12.00'].pnl, rows['$12.00'].pct], ['+$200.00', '—']);
  dom.window.close();
});

test('invalid input shows the error and no table', () => {
  const { dom, state } = run({ strikePrice: '100', premium: '', stockPrice: '110', contracts: '1' });
  assert.equal(state.rows.length, 0);
  assert.match(state.text, /Please enter valid values/);
  dom.window.close();
});
