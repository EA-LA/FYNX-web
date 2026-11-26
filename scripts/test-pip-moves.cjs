'use strict';
// Pip calculator "What a move is worth" table and risk fit, run against the real inline script.
// Expected values come from an independent Python calculation (site-qa run 98).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const page = readFileSync(join(__dirname, '..', 'tools', 'pip.html'), 'utf8');
const inline = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .find(source => source.includes('function renderMoves('));
assert.ok(inline, 'The pip calculator script must exist');

function open() {
  const dom = new JSDOM(page, { url: 'https://www.fynxfinanceworld.com/tools/pip.html', runScripts: 'outside-only' });
  dom.window.eval(inline);
  return dom;
}
function set(dom, values) {
  const doc = dom.window.document;
  for (const [id, value] of Object.entries(values)) doc.getElementById(id).value = value;
}
function read(dom) {
  const doc = dom.window.document;
  return {
    shown: doc.getElementById('resultsBox').style.display !== 'none',
    your: doc.getElementById('yourOut').textContent,
    error: doc.getElementById('error').textContent,
    rows: [...doc.querySelectorAll('#pipMoveTable tbody tr')].map(tr => [...tr.cells].map(td => td.textContent)),
    yours: [...doc.querySelectorAll('#pipMoveTable tbody tr.pm-yours')].map(tr => tr.cells[0].textContent),
    risk: doc.getElementById('riskOut').hidden ? null : doc.getElementById('riskOut').textContent,
  };
}
function calc(values) {
  const dom = open();
  set(dom, values);
  dom.window.document.getElementById('calcBtn').click();
  const out = read(dom);
  dom.window.close();
  return out;
}

test('0.5 lots EURUSD: move table, your 25-pip move and the risk fit', () => {
  const r = calc({ price: '1', lots: '0.5', pipIncrement: '0.0001', pipMove: '25', riskAmount: '100' });
  assert.equal(r.your, '5.00 USD');
  assert.deepEqual(r.rows.map(row => row[0]), ['1 pip', '5 pips', '10 pips', '20 pips', '25 pips (yours)', '50 pips', '100 pips']);
  const by = Object.fromEntries(r.rows.map(row => [row[0], row.slice(1)]));
  assert.deepEqual(by['1 pip'], ['0.0001', '5.00']);
  assert.deepEqual(by['25 pips (yours)'], ['0.0025', '125.00']);
  assert.deepEqual(by['100 pips'], ['0.0100', '500.00']);
  assert.match(r.risk, /At 0\.5 lots, 100\.00 USD covers a stop of 20 pips \(price distance 0\.0020\)\./);
  assert.match(r.risk, /For a 25-pip stop, 100\.00 USD allows 0\.40 lots \(rounded down to 0\.01\), losing 100\.00 USD at the stop\./);
});

test('JPY pair with a typed conversion rate rounds sizes down', () => {
  const r = calc({ price: '0.0066667', lots: '1', pipIncrement: '0.01', pipMove: '30', riskAmount: '100' });
  assert.equal(r.your, '6.67 USD');
  const by = Object.fromEntries(r.rows.map(row => [row[0], row.slice(1)]));
  assert.deepEqual(by['30 pips (yours)'], ['0.30', '200.00']);
  assert.deepEqual(by['10 pips'], ['0.10', '66.67']);
  assert.match(r.risk, /covers a stop of 14\.9 pips \(price distance 0\.149\)/);
  assert.match(r.risk, /allows 0\.49 lots .* losing 98\.00 USD/);
});

test('fractional move and an amount too small for 0.01 lots', () => {
  let r = calc({ price: '1', lots: '0.03', pipMove: '37.5', riskAmount: '50' });
  assert.deepEqual(r.yours, ['37.5 pips (yours)']);
  assert.deepEqual(r.rows.find(row => row[0].startsWith('37.5'))[1], '0.00375');
  assert.match(r.risk, /covers a stop of 166\.6 pips/);
  assert.match(r.risk, /allows 0\.13 lots .* losing 48\.75 USD/);
  r = calc({ price: '1', lots: '1', pipMove: '500', riskAmount: '40' });
  assert.match(r.risk, /less than the smallest 0\.01 lot would lose \(50\.00 USD\)/);
});

test('optional fields: blank is fine, bad values explain themselves', () => {
  let r = calc({ price: '1', lots: '1', pipMove: '', riskAmount: '' });
  assert.equal(r.rows.length, 6);
  assert.equal(r.risk, null);
  r = calc({ price: '1', lots: '1', pipMove: '-5' });
  assert.equal(r.shown, false);
  assert.match(r.error, /positive pip move, or leave it blank/);
  r = calc({ price: '1', lots: '0' });
  assert.match(r.error, /positive number of lots/);
});

test('result follows the inputs after the first Calculate (no stale numbers)', () => {
  const dom = open();
  const doc = dom.window.document;
  set(dom, { price: '1', lots: '1' });
  doc.getElementById('calcBtn').click();
  assert.equal(read(dom).your, '10.00 USD');
  const lots = doc.getElementById('lots');
  lots.value = '2';
  lots.dispatchEvent(new dom.window.Event('input'));
  assert.equal(read(dom).your, '20.00 USD');
  const size = doc.getElementById('pipIncrement');
  size.value = '0.01';
  size.dispatchEvent(new dom.window.Event('change'));
  assert.equal(read(dom).your, '2000.00 USD');
  lots.value = '';
  lots.dispatchEvent(new dom.window.Event('input'));
  assert.equal(read(dom).shown, false, 'an emptied field hides the old result');
  doc.getElementById('clearBtn').click();
  lots.value = '3';
  lots.dispatchEvent(new dom.window.Event('input'));
  assert.equal(read(dom).shown, false, 'after Clear nothing calculates until Calculate');
  dom.window.close();
});

function delayedRates(t) {
  const dom = open();
  t.after(() => dom.window.close());
  const {window:w} = dom, doc = w.document;
  const get = id => doc.getElementById(id), requests = [];
  w.AbortSignal.timeout = () => new w.AbortController().signal;
  w.fetch = url => new Promise((resolve, reject) => requests.push({url: new URL(url), resolve, reject}));
  const edit = (id, value, type = 'input') => {
    get(id).value = value;
    get(id).dispatchEvent(new w.Event(type, {bubbles: true}));
  };
  const success = async (index, rate) => {
    const r = requests[index], curr = r.url.searchParams.get('symbols');
    r.resolve({ok: true, json: async () => ({date: new Date().toISOString().slice(0, 10), rates: {[curr]:rate}})});
    await new Promise(setImmediate);
  };
  return {dom, get, requests, edit, success};
}

test('pending reference rate hides old output, and a typed broker rate wins over a late success', async t => {
  const f = delayedRates(t);
  f.get('calcBtn').click();
  assert.equal(read(f.dom).your, '10.00 USD');
  f.edit('accountCcy', 'EUR', 'change');
  assert.equal(f.requests.length, 1);
  assert.equal(f.get('price').value, '');
  assert.equal(read(f.dom).shown, false, 'last USD result is no longer presented under the EUR selection');
  f.edit('price', '0.8');
  assert.equal(read(f.dom).your, '8.00 EUR');
  assert.match(f.get('noteOut').textContent, /entered manually/);
  await f.success(0, 0.9);
  assert.equal(f.get('price').value, '0.8');
  assert.equal(read(f.dom).your, '8.00 EUR');
  assert.match(f.get('rateStatus').textContent, /Manual rate/);
});

test('a late failure cannot clear a typed broker rate, including when the prior rate mode was manual', async t => {
  const f = delayedRates(t);
  f.edit('price', '0.95');
  f.edit('accountCcy', 'GBP', 'change');
  f.edit('price', '0.7');
  f.get('calcBtn').click();
  f.requests[0].reject(Error('Synthetic reference outage'));
  await new Promise(setImmediate);
  assert.equal(f.get('price').value, '0.7');
  assert.equal(read(f.dom).your, '7.00 GBP');
  assert.match(f.get('rateStatus').textContent, /Manual rate/);
});

test('Clear does not assume parity: cross-currency restarts the lookup; matching currency keeps exact parity', async t => {
  const f = delayedRates(t);
  f.edit('accountCcy', 'EUR', 'change');
  f.get('clearBtn').click();
  assert.equal(f.requests.length, 2);
  assert.equal(f.get('price').value, '');
  assert.equal(read(f.dom).shown, false);
  await f.success(0, 0.75);
  assert.equal(f.get('price').value, '', 'pre-Clear request cannot write into a blank field');
  await f.success(1, 0.9);
  assert.equal(f.get('price').value, '0.9');
  assert.equal(read(f.dom).shown, false, 'Clear restores an uncalculated state');
  f.get('calcBtn').click();
  assert.equal(read(f.dom).your, '9.00 EUR');
  assert.match(f.get('noteOut').textContent, /ECB daily reference rate/);
  f.edit('accountCcy', 'USD', 'change');
  f.get('clearBtn').click();
  assert.equal(f.requests.length, 2);
  assert.equal(f.get('price').value, '1');
  assert.match(f.get('rateStatus').textContent, /exactly 1/);
  f.edit('pair', 'custom', 'change');
  f.get('clearBtn').click();
  assert.equal(f.get('price').value, '');
  assert.equal(f.requests.length, 2);
});
