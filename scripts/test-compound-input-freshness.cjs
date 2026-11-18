'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual page controller, not a rewritten calculator.
const html = fs.readFileSync(path.join(__dirname, '..', 'tools', 'compound.html'), 'utf8');
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const controller = inlineScripts.find(code => code.includes('function calculateCompound()'));
assert.ok(controller, 'Compound Calculator controller must be present in the production HTML');

function boot() {
  const defaults = {
    startingBalance: '1000', monthlyDeposit: '200', annualRate: '12',
    years: '10', compoundFrequency: '12', depositTiming: 'end'
  };
  const nodes = new Map();
  function el(id) {
    if (!nodes.has(id)) {
      nodes.set(id, {
        value: Object.hasOwn(defaults, id) ? defaults[id] : '',
        textContent: '', innerHTML: '', className: '', listeners: {},
        addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
      });
    }
    return nodes.get(id);
  }
  const classes = new Set();
  const document = {
    getElementById: el,
    body: { classList: {
      contains: name => classes.has(name),
      add: name => classes.add(name),
      remove: name => classes.delete(name)
    }}
  };
  const window = { addEventListener() {} };
  vm.runInNewContext(controller, { document, window, Intl }, { timeout: 1000 });
  function fire(id, event) {
    const handlers = el(id).listeners[event] || [];
    assert.ok(handlers.length, id + ' should register ' + event + ' listener');
    for (const handler of handlers) handler();
  }
  return { el, fire };
}

function assertCleared(el) {
  assert.equal(el('endingBalance').textContent, '$0.00');
  assert.equal(el('totalContributions').textContent, '$0.00');
  assert.equal(el('totalGrowth').textContent, '$0.00');
  assert.equal(el('returnMultiple').textContent, '0.00x');
  assert.match(el('scheduleBody').innerHTML, /No calculation yet/);
  assert.match(el('summaryText').textContent, /Inputs changed.*Calculate again/);
}

test('initial example still renders a real projection and yearly schedule', () => {
  const { el } = boot();
  assert.match(el('summaryText').textContent, /Starting with.*could grow to/);
  assert.notEqual(el('endingBalance').textContent, '$0.00');
  assert.match(el('scheduleBody').innerHTML, /Year 10/);
});

for (const [id, newValue] of [
  ['startingBalance', '4000'],
  ['monthlyDeposit', '350'],
  ['annualRate', '7'],
  ['years', '15'],
  ['compoundFrequency', '4'],
  ['depositTiming', 'beginning']
]) {
  test('editing ' + id + ' invalidates stale projection and schedule', () => {
    const { el, fire } = boot();
    el(id).value = newValue;
    fire(id, 'input');
    assertCleared(el);
  });
}

test('select change events invalidate output even when input is not dispatched', () => {
  const { el, fire } = boot();
  el('depositTiming').value = 'beginning';
  fire('depositTiming', 'change');
  assertCleared(el);
});

test('recalculation after editing uses changed assumptions, not old output', () => {
  const { el, fire } = boot();
  const initial = el('endingBalance').textContent;
  el('monthlyDeposit').value = '700';
  fire('monthlyDeposit', 'input');
  assertCleared(el);
  fire('calculateBtn', 'click');
  assert.notEqual(el('endingBalance').textContent, '$0.00');
  assert.notEqual(el('endingBalance').textContent, initial);
  assert.match(el('summaryText').textContent, /adding \$700.00 per month/);
  assert.match(el('scheduleBody').innerHTML, /Year 10/);
});

test('Reset restores defaults and clears calculated output', () => {
  const { el, fire } = boot();
  el('years').value = '30';
  fire('calculateBtn', 'click');
  fire('resetBtn', 'click');
  assert.equal(el('years').value, 10);
  assert.equal(el('depositTiming').value, 'end');
  assert.equal(el('startingBalance').value, 1000);
  assert.equal(el('endingBalance').textContent, '$0.00');
  assert.match(el('summaryText').textContent, /Fill in the numbers and calculate/);
  assert.match(el('scheduleBody').innerHTML, /No calculation yet/);
});

test('projection updates are communicated to assistive technology', () => {
  assert.match(html, /id="summaryText"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
});
