const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const page = fs.readFileSync(path.join(__dirname, '../tools/currency.html'), 'utf8');
const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const controller = scripts.find(script => script.includes('function calculateConversion()'));

assert.ok(controller, 'test must execute the shipped currency-converter controller');
assert.match(page, /id="resultArea"[^>]*role="status"[^>]*aria-live="polite"/);

function setup() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <input id="amount" type="number">
    <select id="fromCurrency"></select><select id="toCurrency"></select>
    <input id="customRate" type="number">
    <button id="calculateBtn">Calculate</button>
    <button id="clearBtn">Clear</button>
    <button id="swapBtn">Swap</button>
    <div id="resultArea" class="result-placeholder" role="status"></div>
  </body></html>`, { url: 'https://www.fynxfinanceworld.com/tools/currency.html', runScripts: 'outside-only' });
  dom.window.eval(controller);
  const el = id => dom.window.document.getElementById(id);
  const change = (id, value, type = 'input') => {
    el(id).value = value;
    el(id).dispatchEvent(new dom.window.Event(type, { bubbles: true }));
  };
  return { dom, el, change, calculate: () => el('calculateBtn').click() };
}

test('amount editing removes a previously calculated conversion until recalculation', () => {
  const { dom, el, change, calculate } = setup();
  change('amount', '100');
  change('customRate', '0.92');
  calculate();
  assert.match(el('resultArea').textContent, /100\.00 USD = 92\.00 EUR/);
  change('amount', '200');
  assert.equal(el('resultArea').className, 'result-placeholder');
  assert.match(el('resultArea').textContent, /Inputs changed.*Calculate again/);
  assert.doesNotMatch(el('resultArea').textContent, /92\.00 EUR/);
  calculate();
  assert.match(el('resultArea').textContent, /200\.00 USD = 184\.00 EUR/);
  dom.window.close();
});

test('manual exchange-rate edits invalidate stale results and allow new calculations', () => {
  const { dom, el, change, calculate } = setup();
  change('amount', '100');
  change('customRate', '0.8');
  calculate();
  assert.match(el('resultArea').textContent, /80\.00 EUR/);
  change('customRate', '0.9', 'change');
  assert.match(el('resultArea').textContent, /Calculate again/);
  assert.doesNotMatch(el('resultArea').textContent, /80\.00 EUR/);
  calculate();
  assert.match(el('resultArea').textContent, /90\.00 EUR/);
  dom.window.close();
});

test('changing pair removes previous quote and requires a newly supplied rate', () => {
  const { dom, el, change, calculate } = setup();
  change('amount', '100');
  change('customRate', '0.8');
  calculate();
  change('toCurrency', 'GBP', 'change');
  assert.equal(el('customRate').value, '');
  assert.equal(el('resultArea').className, 'result-placeholder');
  assert.match(el('resultArea').textContent, /Enter the exchange rate/);
  calculate();
  assert.match(el('resultArea').textContent, /No rate is supplied automatically/);
  dom.window.close();
});

test('reversing a calculated currency pair preserves existing recalculation behavior', () => {
  const { dom, el, change, calculate } = setup();
  change('amount', '100');
  change('customRate', '0.8');
  calculate();
  el('swapBtn').click();
  assert.equal(el('fromCurrency').value, 'EUR');
  assert.equal(el('toCurrency').value, 'USD');
  assert.equal(Number(el('customRate').value), 1.25);
  assert.match(el('resultArea').textContent, /100\.00 EUR = 125\.00 USD/);
  dom.window.close();
});

test('old validation errors clear when amount or rate is corrected; Clear still resets', () => {
  const { dom, el, change, calculate } = setup();
  change('amount', '0');
  change('customRate', '0.8');
  calculate();
  assert.match(el('resultArea').textContent, /Error:/);
  change('amount', '25');
  assert.match(el('resultArea').textContent, /Calculate again/);
  calculate();
  assert.match(el('resultArea').textContent, /25\.00 USD = 20\.00 EUR/);
  el('clearBtn').click();
  assert.equal(el('amount').value, '');
  assert.equal(el('customRate').value, '');
  assert.equal(el('resultArea').className, 'result-placeholder');
  dom.window.close();
});
