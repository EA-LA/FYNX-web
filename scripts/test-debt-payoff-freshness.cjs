'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'tools', 'debt-payoff.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const controller = scripts.find(code => code.includes('function calculatePayoff()'));
assert.ok(controller, 'must test the real inline Debt Payoff controller');

function boot() {
  const nodes = new Map();
  const inputs = {loanAmount: '10000', interestRate: '10', monthlyPayment: '300'};
  function el(id) {
    if (!nodes.has(id)) {
      nodes.set(id, {
        value: Object.hasOwn(inputs, id) ? inputs[id] : '',
        textContent: '',
        innerHTML: '',
        className: '',
        listeners: {},
        addEventListener(name, fn) {
          (this.listeners[name] ||= []).push(fn);
        }
      });
    }
    return nodes.get(id);
  }
  const classes = new Set();
  const document = {
    getElementById: el,
    body: {
      classList: {
        contains: name => classes.has(name),
        add: name => classes.add(name),
        remove: name => classes.delete(name)
      }
    }
  };
  const window = {addEventListener() {}};
  vm.runInNewContext(controller, {document, window, Intl}, {timeout: 1000});
  function fire(id, name) {
    const handlers = el(id).listeners[name] || [];
    assert.ok(handlers.length, id + ' must register ' + name);
    handlers.forEach(fn => fn());
  }
  return {el, fire};
}

test('the initial example still calculates its correct 40-month schedule', () => {
  const {el} = boot();
  assert.equal(el('monthsValue').textContent, '40 months');
  assert.equal(el('resultStatus').textContent, 'Payoff calculation completed.');
  assert.match(el('scheduleBody').innerHTML, /<tr>/);
});

for (const id of ['loanAmount', 'interestRate', 'monthlyPayment', 'extraPayment']) {
  test('editing ' + id + ' immediately invalidates all previous results', () => {
    const {el, fire} = boot();
    el(id).value = String(Number(el(id).value) + 1);
    fire(id, 'input');
    assert.equal(el('monthsValue').textContent, '—');
    assert.equal(el('interestValue').textContent, '$0.00');
    assert.equal(el('totalPaidValue').textContent, '$0.00');
    assert.equal(el('firstInterestValue').textContent, '$0.00');
    assert.equal(el('summaryText').textContent, 'No calculation yet.');
    assert.match(el('scheduleBody').innerHTML, /No payoff schedule yet/);
    assert.match(el('resultStatus').textContent, /Inputs changed.*Calculate again/);
  });
}

test('change events also invalidate stale outputs, and Calculate recomputes them', () => {
  const {el, fire} = boot();
  el('monthlyPayment').value = '600';
  fire('monthlyPayment', 'change');
  assert.equal(el('monthsValue').textContent, '—');
  fire('calculateBtn', 'click');
  assert.notEqual(el('monthsValue').textContent, '40 months');
  assert.notEqual(el('monthsValue').textContent, '—');
  assert.equal(el('resultStatus').textContent, 'Payoff calculation completed.');
});

test('invalid calculation errors recover after editing and recalculating', () => {
  const {el, fire} = boot();
  el('monthlyPayment').value = '0';
  fire('monthlyPayment', 'input');
  fire('calculateBtn', 'click');
  assert.match(el('resultStatus').textContent, /valid positive values/);
  el('monthlyPayment').value = '450';
  fire('monthlyPayment', 'input');
  assert.match(el('resultStatus').textContent, /Calculate again/);
  fire('calculateBtn', 'click');
  assert.equal(el('resultStatus').textContent, 'Payoff calculation completed.');
});

test('Reset clears results without pretending a new calculation happened', () => {
  const {el, fire} = boot();
  el('loanAmount').value = '25000';
  fire('loanAmount', 'input');
  fire('calculateBtn', 'click');
  fire('resetBtn', 'click');
  assert.equal(el('loanAmount').value, 10000);
  assert.equal(el('interestRate').value, 10);
  assert.equal(el('monthlyPayment').value, 300);
  assert.equal(el('monthsValue').textContent, '—');
  assert.match(el('scheduleBody').innerHTML, /No payoff schedule yet/);
});

test('updated calculation state is announced accessibly', () => {
  assert.match(html, /id="resultStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
});

// [site-qa] run 84: optional extra payment + "Pay it off faster" comparison.
test('extra monthly payment is added and compared with the plain payment', () => {
  const {el, fire} = boot();
  assert.match(el('fasterList').innerHTML, /\$330\.00\/month[\s\S]*36 months[\s\S]*4 months sooner[\s\S]*saves \$190\.34/);
  el('extraPayment').value = '100';
  fire('calculateBtn', 'click');
  assert.equal(el('monthsValue').textContent, '29 months');
  assert.equal(el('interestValue').textContent, '$1,260.38');
  assert.match(el('summaryText').textContent, /Without the \$100\.00 extra it would take 40 months and \$1,764\.16 in interest, so the extra saves 11 months and \$503\.78/);
  assert.match(el('fasterList').innerHTML, /faster-mine[\s\S]*your extra[\s\S]*11 months sooner/);
});

test('an extra payment that rescues a too-low payment is explained, negative extra rejected', () => {
  const {el, fire} = boot();
  el('loanAmount').value = '5000'; el('interestRate').value = '24'; el('monthlyPayment').value = '90'; el('extraPayment').value = '60';
  fire('calculateBtn', 'click');
  assert.equal(el('monthsValue').textContent, '56 months');
  assert.match(el('fasterList').innerHTML, /Without the extra, the debt would never be paid off/);
  el('extraPayment').value = '-5';
  fire('calculateBtn', 'click');
  assert.match(el('resultStatus').textContent, /valid positive values/);
});
