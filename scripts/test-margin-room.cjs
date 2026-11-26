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

test('native form submission uses existing calculation, validation and reset without navigating', () => {
  const dom = new JSDOM(page, { url: 'https://www.fynxfinanceworld.com/tools/margin.html', runScripts: 'outside-only' });
  try {
    const { window } = dom;
    const doc = window.document;
    const get = id => doc.getElementById(id);
    window.eval(inline);
    const calculate = get('calculateBtn'), form = calculate.form;
    assert.ok(form, 'Calculate must be a native form submit button');
    assert.equal(calculate.type, 'submit');
    assert.equal(get('lotSize').form, form, 'number fields can submit by Enter');
    assert.equal(get('resetBtn').type, 'button');
    assert.equal(get('shareScenarioBtn').type, 'button');

    let submissions = 0;
    form.addEventListener('submit', event => {
      submissions++;
      assert.equal(event.defaultPrevented, true, 'calculation must not navigate');
    });
    get('lotSize').value = '0.50';
    form.requestSubmit(calculate);
    assert.equal(get('requiredMarginValue').textContent, '$1,833.33');
    assert.equal(submissions, 1);
    get('leverage').value = '0';
    form.requestSubmit(calculate);
    assert.equal(get('requiredMarginValue').textContent, '—');
    assert.equal(get('roomCard').hidden, true);
    assert.equal(submissions, 2);
    get('resetBtn').click();
    assert.equal(get('requiredMarginValue').textContent, '$3,666.67');
    assert.equal(submissions, 2);
    get('lotSize').value = '0.25';
    calculate.click(); // Scenario-link restore invokes the same calculate button.
    assert.equal(get('requiredMarginValue').textContent, '$916.67');
    assert.equal(submissions, 3);
  } finally {
    dom.window.close();
  }
});

// Run 114: "Same trade, different leverage" table and stale-result guard.
// Expected values checked independently in Python decimal (run 114).
function runLev(values) {
  const dom = new JSDOM(page, { url: 'https://www.fynxfinanceworld.com/tools/margin.html', runScripts: 'outside-only' });
  dom.window.eval(inline);
  const doc = dom.window.document;
  for (const [id, value] of Object.entries(values)) doc.getElementById(id).value = value;
  doc.getElementById('calculateBtn').click();
  const rows = [...doc.querySelectorAll('#levTable tbody tr')].map(tr => [...tr.cells].map(td => td.textContent.trim()));
  const note = doc.getElementById('levNote').textContent;
  return { dom, doc, rows, note, hidden: doc.getElementById('levCard').hidden };
}

test('leverage table: EURUSD default, yours marked, 10:1 already below stop-out', () => {
  const { dom, rows, note, hidden } = runLev({});
  try {
    assert.equal(hidden, false);
    assert.deepEqual(rows, [
      ['10:1', '$11,000.00', '43%', 'Already below 50%'],
      ['20:1', '$5,500.00', '83%', '200.0'],
      ['30:1yours', '$3,666.67', '120%', '291.7'],
      ['50:1', '$2,200.00', '185%', '365.0'],
      ['100:1', '$1,100.00', '312%', '420.0'],
      ['200:1', '$550.00', '476%', '447.5'],
      ['500:1', '$220.00', '694%', '464.0'],
    ]);
    assert.match(note, /One pip is worth \$10\.00 at every leverage/);
  } finally { dom.window.close(); }
});

test('leverage table: custom leverage is added in order; USD-base JPY pair', () => {
  const { dom, rows } = runLev({ pairType: 'usdBase', accountBalance: '10000', lotSize: '2', entryPrice: '150.25', leverage: '75', pipSize: '0.01', usedMarginExisting: '0' });
  try {
    assert.deepEqual(rows.map(r => r[0]), ['10:1', '20:1', '30:1', '50:1', '75:1yours', '100:1', '200:1', '500:1']);
    assert.deepEqual(rows[1].slice(1), ['$10,000.00', '100%', '375.6']);
    assert.deepEqual(rows[5].slice(1), ['$2,000.00', '500%', '676.1']);
    assert.deepEqual(rows[7].slice(1), ['$400.00', '2,500%', '736.2']);
  } finally { dom.window.close(); }
});

test('editing any input clears the old result until Calculate is pressed', () => {
  const { dom, doc } = runLev({});
  try {
    assert.equal(doc.getElementById('requiredMarginValue').textContent, '$3,666.67');
    const lev = doc.getElementById('leverage');
    lev.value = '50';
    lev.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(doc.getElementById('requiredMarginValue').textContent, '—');
    assert.equal(doc.getElementById('roomCard').hidden, true);
    assert.equal(doc.getElementById('levCard').hidden, true);
    assert.equal(doc.getElementById('statusTitle').textContent, 'Inputs changed');
    doc.getElementById('calculateBtn').click();
    assert.equal(doc.getElementById('requiredMarginValue').textContent, '$2,200.00');
    doc.getElementById('pairType').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(doc.getElementById('requiredMarginValue').textContent, '—');
  } finally { dom.window.close(); }
});
