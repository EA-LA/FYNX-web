'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('tools/risk-reward.html');
const decimal = read('assets/vendor/decimal.js');
const script = read('assets/js/risk-reward-costs.js');
const existing = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g), m => m[1])
  .find(code => code.includes('function calculate(){') && code.includes('const el = {'));
const outputs = ['netStopLoss', 'netTargetResult', 'netCostRatio', 'netCostBreakEven'];

function open(t) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://www.fynxfinanceworld.com/tools/risk-reward.html' });
  t.after(() => dom.window.close());
  const el = id => dom.window.document.getElementById(id);
  assert.equal(el('compareRiskRewardCosts').disabled, true);
  dom.window.eval(decimal);
  dom.window.eval(existing);
  dom.window.eval(script);
  assert.equal(el('compareRiskRewardCosts').disabled, false);
  const set = (id, value, event = 'input') => {
    el(id).value = value;
    el(id).dispatchEvent(new dom.window.Event(event, { bubbles: true }));
  };
  return {
    el,
    set,
    setup(entry = '100', stop = '98', target = '106', cost = '0.5') {
      Object.entries({ entry, sl: stop, tp: target, roundTripUnitCost: cost }).forEach(([id, value]) => set(id, value));
    },
    compare() {
      el('compareRiskRewardCosts').click();
      return outputs.map(id => el(id).textContent);
    }
  };
}

test('public page mounts the comparison after Decimal and does not change the gross calculator or share fields', t => {
  const p = open(t);
  const doc = p.el('riskRewardCosts').ownerDocument;
  const sources = Array.from(doc.scripts, s => s.getAttribute('src') || '');
  assert.ok(sources.findIndex(src => src.includes('/decimal.js')) <
    sources.findIndex(src => src === '/assets/js/risk-reward-costs.js?v=20261125'));
  assert.equal(sources.filter(src => src.includes('risk-reward-costs.js')).length, 1);
  p.setup();
  p.el('calcBtn').click();
  assert.equal(p.el('rrOut').textContent, '3.00');
  assert.equal(p.el('beOut').textContent, '25.0%');
  assert.deepEqual(p.compare(), ['2.50', '5.50', '3.00 : 1 before → 2.20 : 1 after', '25.00% before → 31.25% after']);
  assert.equal(p.el('rrOut').textContent, '3.00');
  assert.equal(p.el('shareScenarioBtn').dataset.scenarioFields, 'entry,sl,tp,winRate');
  assert.equal(p.el('roundTripUnitCost').name, '');
  assert.equal(doc.getElementById('resultsCard').contains(p.el('riskRewardCosts')), false);
  assert.doesNotMatch(script, /fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|clipboard|navigator\.share/);
});

test('short setup with 0 cost is equivalent to the previous gross metrics', t => {
  const p = open(t);
  p.setup('100', '102', '94', '0');
  assert.deepEqual(p.compare(), ['2.00', '6.00', '3.00 : 1 before → 3.00 : 1 after', '25.00% before → 25.00% after']);
});

test('cost equal to reward is not confused with an impossible or profitable target', t => {
  const p = open(t);
  p.setup('1.10000', '1.09990', '1.10030', '.00030');
  assert.deepEqual(p.compare(), ['0.0004', '0.00', '3.00 : 1 before → No positive reward after costs', '25.00% before → 100.00% after']);
  assert.match(p.el('riskRewardCostStatus').textContent, /target only covers costs/);
  p.set('roundTripUnitCost', '.00031');
  assert.deepEqual(p.compare(), ['0.00041', '-0.00001', '3.00 : 1 before → No positive reward after costs', '25.00% before → Not possible after costs']);
});

test('tiny positive net reward does not display as zero or a literal 100% threshold', t => {
  const p = open(t);
  p.setup('1.10000', '1.00000', '1.20000', '0.099999999999');
  assert.deepEqual(p.compare(), ['0.199999999999', '0.000000000001', '1.00 : 1 before → less than 0.01 : 1 after', '50.00% before → just under 100% after']);
});

test('rejects invalid inputs without leaving stale data and Clear resets only the expected fields', t => {
  const p = open(t);
  p.setup();
  p.compare();
  assert.equal(p.el('riskRewardCostResults').hidden, false);
  p.set('tp', '97', 'change');
  assert.equal(p.el('riskRewardCostResults').hidden, true);
  assert.match(p.el('riskRewardCostStatus').textContent, /Inputs changed/);
  assert.deepEqual(p.compare(), ['', '', '', '']);
  assert.match(p.el('riskRewardCostStatus').textContent, /opposite sides/);
  p.setup();
  for (const bad of ['', '-1', '1e2', '0x11', '1,2', 'NaN', '1000000000001', '0.0000000000001']) {
    p.set('roundTripUnitCost', bad);
    assert.deepEqual(p.compare(), ['', '', '', '']);
    assert.match(p.el('riskRewardCostStatus').textContent, /Enter a cost/);
  }
  p.setup();
  p.compare();
  p.el('clearBtn').click();
  assert.equal(p.el('roundTripUnitCost').value, '0');
  assert.equal(p.el('riskRewardCostResults').hidden, true);
  assert.equal(p.el('riskRewardCostStatus').textContent, '');
  assert.equal(p.el('entry').value, '');
});
