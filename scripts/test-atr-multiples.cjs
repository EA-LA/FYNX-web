'use strict';
// [site-qa] run 117: ATR Stop "Same ATR, other multiples" table (hand-worked examples).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { multipleRows, sizeFor, MULTIPLES } = require('../assets/js/atr-multiples.js');

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('EURUSD buy 1.1000, ATR 0.0040, $10,000 at 1%: wider stops allow smaller sizes', () => {
  const rows = multipleRows({ name: 'EUR/USD', side: 'buy', entry: 1.1, atr: 0.004, pip: 0.0001, current: 1.5, balance: 10000, riskPct: 1 });
  assert.deepEqual(rows.map((r) => r.multiple), [1, 1.5, 2, 2.5, 3]);
  assert.deepEqual(rows.map((r) => r.yours), [false, true, false, false, false]);
  const r15 = rows[1];
  near(r15.stop, 1.094); near(r15.pips, 60); near(r15.target2R, 1.112);
  // risk $100; loss per lot = 0.006 x 100,000 = $600 -> floor(16.67) x 0.01 = 0.16 lots, loss $96
  near(r15.size.lots, 0.16); near(r15.size.loss, 96, 1e-6); assert.equal(r15.size.belowMin, false);
  near(rows[0].size.lots, 0.25); near(rows[0].size.loss, 100, 1e-6); // $400 per lot
  near(rows[4].size.lots, 0.08); near(rows[4].stop, 1.088); near(rows[4].pips, 120);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].size.lots <= rows[i - 1].size.lots);
});

test('USDJPY sell 150, ATR 0.50, 2x, $5,000 at 2%: stop above entry, yen converted at entry', () => {
  const rows = multipleRows({ name: 'USD/JPY', side: 'sell', entry: 150, atr: 0.5, pip: 0.01, current: 2, balance: 5000, riskPct: 2 });
  const r = rows.find((x) => x.yours);
  near(r.stop, 151); near(r.pips, 100); near(r.target2R, 148);
  // loss per lot = 1.00 x (1/150) x 100,000 = $666.67; $100 / 666.67 = 0.15 lots exactly
  near(r.size.lots, 0.15); near(r.size.loss, 100, 1e-6);
});

test('gold below minimum size and a buy stop under zero are flagged', () => {
  const gold = sizeFor({ name: 'XAU/USD', entry: 2000, distance: 20, balance: 1000, riskPct: 1 });
  assert.equal(gold.belowMin, true); near(gold.loss, 20, 1e-9); // 0.01 lot x 100 oz x $20
  const btc = multipleRows({ name: 'BTC/USD', side: 'buy', entry: 1000, atr: 400, pip: 1, current: 1, balance: 10000, riskPct: 1 });
  assert.equal(btc.find((r) => r.multiple === 3).stop, null);
  assert.equal(btc.find((r) => r.multiple === 3).size, null);
  assert.equal(btc.find((r) => r.multiple === 2).target2R, 2600);
  // BTC: risk $100 / ($400 x 1 coin) = 0.25 BTC
  near(btc.find((r) => r.multiple === 1).size.lots, 0.25);
});

test('no balance gives rows without sizes; invalid inputs give no rows', () => {
  const rows = multipleRows({ name: 'EUR/USD', side: 'buy', entry: 1.1, atr: 0.004, pip: 0.0001, current: 1.5, balance: null, riskPct: 1 });
  assert.equal(rows.length, MULTIPLES.length);
  assert.ok(rows.every((r) => r.size === null));
  assert.deepEqual(multipleRows({ name: 'EUR/USD', side: 'buy', entry: 0, atr: 0.004, pip: 0.0001, current: 1.5 }), []);
  assert.deepEqual(multipleRows({ name: 'EUR/USD', side: 'buy', entry: 1.1, atr: -1, pip: 0.0001, current: 1.5 }), []);
  assert.equal(sizeFor({ name: 'EUR/USD', entry: 1.1, distance: 0.004, balance: 1000, riskPct: 101 }), null);
});

test('page loads the module and renders the table', () => {
  const html = readFileSync(join(__dirname, '..', 'tools', 'atr-stop.html'), 'utf8');
  assert.match(html, /src="\/assets\/js\/atr-multiples\.js/);
  assert.match(html, /id="multBody"/);
  assert.match(html, /renderMultiples\(\);/);
});

test('real ATR controls keep their node and pressed state after activation or opening a scenario', () => {
  const { JSDOM } = require('jsdom');
  const html = readFileSync(join(__dirname, '..', 'tools', 'atr-stop.html'), 'utf8');
  const { window } = new JSDOM(html, { url: 'https://www.fynxfinanceworld.com/tools/atr-stop.html', runScripts: 'outside-only' });
  try {
    const doc = window.document;
    const get = id => doc.getElementById(id);
    const controller = [...doc.scripts].find(script => script.textContent.includes('function buildMultipleChips()'));
    assert.ok(controller);
    window.eval(readFileSync(join(__dirname, '..', 'assets', 'js', 'atr-multiples.js'), 'utf8'));
    window.eval(controller.textContent);
    const chips = [...get('multChips').querySelectorAll('button')];
    const [buy, sell] = get('sideSeg').querySelectorAll('button');
    const pressed = node => [...node.querySelectorAll('button[aria-pressed="true"]')];
    assert.deepEqual(pressed(get('multChips')), [chips[1]]);
    assert.deepEqual(pressed(get('sideSeg')), [buy]);
    chips[2].focus();
    chips[2].click();
    assert.equal(doc.activeElement, chips[2]);
    assert.deepEqual(pressed(get('multChips')), [chips[2]]);
    assert.equal(get('stopOut').textContent, '1.09200');
    assert.equal(chips[2].classList.contains('active'), true);
    assert.equal(chips[1].classList.contains('active'), false);
    get('side').value = 'sell';
    get('mult').value = '3';
    get('applyScenario').click();
    assert.deepEqual([...get('multChips').querySelectorAll('button')], chips, 'scenario changes same controls, not replacement nodes');
    assert.deepEqual(pressed(get('sideSeg')), [sell]);
    assert.deepEqual(pressed(get('multChips')), [chips[4]]);
    assert.equal(get('stopOut').textContent, '1.11200');
  } finally {
    window.close();
  }
});
