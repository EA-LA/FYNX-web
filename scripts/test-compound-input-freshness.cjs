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
        attributes: new Map(),
        setAttribute(name, value) { this.attributes.set(name, value); },
        removeAttribute(name) { this.attributes.delete(name); },
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


test('delaying deposits uses the same month-by-month model without modifying the current projection', () => {
  const { el, fire } = boot();
  const originalRows = el('scheduleBody').innerHTML;
  assert.equal(el('endingBalance').textContent, '$49,308.12');
  el('depositDelayMonths').value = '12';
  fire('depositDelayMonths', 'input');
  assert.match(el('depositDelayResult').textContent, /\$49,308\.12 with no delay; \$41,878\.90 after skipping 12 months \(\$2,400\.00 not deposited\).*\$7,429\.22 lower/);
  assert.equal(el('scheduleBody').innerHTML, originalRows);
  assert.equal(el('endingBalance').textContent, '$49,308.12');
  assert.match(html, /id="depositDelayResult"[^>]*role="status"/);
  assert.doesNotMatch(html.match(/data-scenario-fields="[^"]+"/)[0], /depositDelayMonths/);
});

test('opening balance compounds during a delay, including a full-plan skip, and honors deposit timing', () => {
  const { el, fire } = boot();
  el('depositDelayMonths').value = '120';
  fire('depositDelayMonths', 'input');
  assert.match(el('depositDelayResult').textContent, /\$3,300\.39 after skipping 120 months \(\$24,000\.00 not deposited\)/);
  el('depositDelayMonths').value = '12';
  el('depositTiming').value = 'beginning';
  fire('depositTiming', 'change');
  assert.match(el('depositDelayResult').textContent, /Calculate a valid projection/);
  fire('calculateBtn', 'click');
  assert.match(el('depositDelayResult').textContent, /\$49,768\.20.*\$42,264\.69.*\$7,503\.51 lower/);
});

test('shorter projections reject out-of-range months without clearing the standard result', () => {
  const { el, fire } = boot();
  el('years').value = '1';
  fire('calculateBtn', 'click');
  for (const value of ['13','1.5','0','-2']) {
    el('depositDelayMonths').value = value;
    fire('depositDelayMonths', 'input');
    assert.match(el('depositDelayResult').textContent, /1 to 12 months/);
    assert.equal(el('depositDelayMonths').attributes.get('aria-invalid'), 'true');
    assert.notEqual(el('endingBalance').textContent, '$0.00');
  }
  el('depositDelayMonths').value = '1';
  fire('depositDelayMonths', 'input');
  assert.equal(el('depositDelayMonths').attributes.has('aria-invalid'), false);
  assert.match(el('depositDelayResult').textContent, /after skipping 1 month/);
});

test('0% return keeps the modeled gap equal to skipped principal; no deposits gives no comparison', () => {
  const { el, fire } = boot();
  el('annualRate').value = '0';
  el('depositDelayMonths').value = '12';
  fire('calculateBtn', 'click');
  assert.match(el('depositDelayResult').textContent, /\$25,000\.00 with no delay; \$22,600\.00.*\$2,400\.00 lower/);
  el('monthlyDeposit').value = '0';
  fire('calculateBtn', 'click');
  assert.match(el('depositDelayResult').textContent, /Set a monthly deposit above \$0/);
});

test('base validation, overflow and reset do not leave stale amounts', () => {
  const { el, fire } = boot();
  el('depositDelayMonths').value = '12';
  fire('depositDelayMonths', 'input');
  el('years').value = '0';
  fire('calculateBtn', 'click');
  assert.match(el('depositDelayResult').textContent, /Calculate a valid projection/);
  el('years').value = '100';
  el('annualRate').value = '1e100';
  fire('calculateBtn', 'click');
  assert.match(el('depositDelayResult').textContent, /Calculate a valid projection/);
  fire('resetBtn', 'click');
  assert.equal(el('depositDelayMonths').value, '');
  assert.match(el('depositDelayResult').textContent, /Enter how many months/);
});


test('a negative monthly return still applies to the starting balance while deposits are skipped', () => {
  const { el, fire } = boot();
  el('years').value = '1';
  el('annualRate').value = '-12'; // Monthly rate -1%; 12 months.
  el('depositDelayMonths').value = '6';
  fire('calculateBtn', 'click');
  const partialEnd = 1000 * 0.99 ** 12 + 200 * (1 - 0.99 ** 6) / 0.01;
  const us = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  assert.ok(el('depositDelayResult').textContent.includes(us.format(partialEnd) + ' after skipping 6 months'));
});
