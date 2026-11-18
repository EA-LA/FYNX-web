'use strict';
// ATR Stop "Size This Stop" card (run 96), run against the real inline script.
// Expected values checked independently in Python with Decimal (floor to the size step).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const page = readFileSync(join(__dirname, '..', 'tools', 'atr-stop.html'), 'utf8');
const inline = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .find(source => source.includes('function updateSize('));
assert.ok(inline, 'The ATR stop script must exist');

function run({ pair = 'EUR/USD', side = 'buy', entry = '1.1000', atr = '0.0040', mult = '1.5', balance = '', riskPct = '1' } = {}) {
  const dom = new JSDOM(page, { url: 'https://www.fynxfinanceworld.com/tools/atr-stop.html', runScripts: 'outside-only' });
  dom.window.eval(inline);
  const doc = dom.window.document;
  const set = (id, v) => { const el = doc.getElementById(id); el.value = v; el.dispatchEvent(new dom.window.Event('input')); };
  doc.getElementById('pair').value = pair;
  doc.querySelector(`#sideSeg button[data-side="${side}"]`).click();
  [...doc.querySelectorAll('#multChips button')].find(b => b.textContent.startsWith(mult + 'x')).click();
  set('entry', entry); set('atrValue', atr); set('balance', balance); set('riskPct', riskPct);
  const text = id => doc.getElementById(id).textContent;
  const out = {
    risk: text('riskAmtOut'), size: text('sizeOut'), loss: text('lossOut'),
    targets: ['t1Out', 't2Out', 't3Out'].map(text),
    shown: !doc.getElementById('sizeRows').hidden, error: text('sizeError'), note: text('sizeNote'),
  };
  dom.window.close();
  return out;
}

test('EUR/USD buy: 1% of $10,000 at a 60-pip ATR stop is 0.16 lots', () => {
  const r = run({ balance: '10000' });
  assert.equal(r.shown, true);
  assert.equal(r.risk, '$100.00 (1%)');
  assert.equal(r.size, '0.16 lots (16,000 units)');
  assert.equal(r.loss, '$96.00');
  assert.deepEqual(r.targets, ['1.10600', '1.11200', '1.11800']);
});

test('USD/JPY sell converts yen to dollars at the entry price', () => {
  const r = run({ pair: 'USD/JPY', side: 'sell', entry: '150.000', atr: '0.80', mult: '2.0', balance: '5,000', riskPct: '2%' });
  assert.equal(r.size, '0.09 lots (9,000 units)');
  assert.equal(r.loss, '$96.00');
  assert.deepEqual(r.targets, ['148.400', '146.800', '145.200']);
});

test('gold uses 100 oz lots and BTC sizes in coins', () => {
  assert.equal(run({ pair: 'XAU/USD', entry: '2400', atr: '25', balance: '10000' }).size, '0.02 lots (2 oz)');
  const btc = run({ pair: 'BTC/USD', side: 'sell', entry: '65000', atr: '1500', mult: '2.0', balance: '2000' });
  assert.equal(btc.size, '0.0066 BTC');
  assert.equal(btc.loss, '$19.80');
  assert.deepEqual(btc.targets, ['62000.00', '59000.00', '56000.00']);
});

test('risk below the smallest size says so; bad inputs explain; blank balance shows targets only', () => {
  const small = run({ balance: '500' });
  assert.equal(small.size, 'Below 0.01 lots');
  assert.equal(small.loss, '$6.00 at 0.01 lots');
  assert.match(small.note, /would lose more than your \$5\.00 risk/);
  assert.match(run({ balance: '-5' }).error, /balance above 0/);
  assert.match(run({ balance: '1000', riskPct: '0' }).error, /more than 0%/);
  const blank = run();
  assert.equal(blank.shown, false);
  assert.deepEqual(blank.targets, ['1.10600', '1.11200', '1.11800']);
  assert.match(blank.note, /Enter your balance/);
  const shortBelowZero = run({ side: 'sell', entry: '10', atr: '3', mult: '1.0' });
  assert.deepEqual(shortBelowZero.targets, ['7.00000', '4.00000', '1.00000']);
  assert.deepEqual(run({ side: 'sell', entry: '10', atr: '4', mult: '1.0' }).targets.slice(2), ['below 0']);
});
