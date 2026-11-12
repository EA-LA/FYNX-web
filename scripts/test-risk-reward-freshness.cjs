'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'tools', 'risk-reward.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const controller = scripts.find(code => code.includes('function calculate(){') && code.includes('const el = {'));
assert.ok(controller, 'tests must execute the production Risk/Reward controller');

function boot() {
  const nodes = new Map();
  const document = {
    getElementById(id) {
      if (!nodes.has(id)) {
        nodes.set(id, {
          value: '',
          textContent: '',
          style: { display: '' },
          listeners: {},
          addEventListener(eventName, handler) {
            (this.listeners[eventName] ||= []).push(handler);
          },
          focus() {},
          blur() {}
        });
      }
      return nodes.get(id);
    },
    activeElement: { blur() {} }
  };
  vm.runInNewContext(controller, {
    document,
    window: {},
    navigator: {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    html2canvas: async () => { throw new Error('not exercised'); }
  }, { timeout: 1000 });
  function fire(id, eventName) {
    const listeners = document.getElementById(id).listeners[eventName] || [];
    assert.ok(listeners.length, id + ' must listen for ' + eventName);
    listeners.forEach(handler => handler({
      key: 'Enter',
      preventDefault() {},
      target: document.getElementById(id)
    }));
  }
  const el = id => document.getElementById(id);
  function calculate(entry = '100', stop = '98', target = '106') {
    el('entry').value = entry;
    el('sl').value = stop;
    el('tp').value = target;
    fire('calcBtn', 'click');
  }
  return { el, fire, calculate };
}

test('initial result is empty and does not show stale share controls', () => {
  const { el } = boot();
  assert.equal(el('rrOut').textContent, '—');
  assert.equal(el('resultsBox').style.display, 'none');
});

test('valid long result preserves 3:1 and 25% break-even calculations', () => {
  const { el, calculate } = boot();
  calculate();
  assert.equal(el('rrOut').textContent, '3.00');
  assert.equal(el('riskOut').textContent, '2.0000');
  assert.equal(el('rewardOut').textContent, '6.0000');
  assert.equal(el('beOut').textContent, '25.0%');
  assert.match(el('noteOut').textContent, /Long/);
  assert.equal(el('resultsBox').style.display, 'flex');
});

test('valid short still produces the correct directional result', () => {
  const { el, calculate } = boot();
  calculate('100', '102', '94');
  assert.equal(el('rrOut').textContent, '3.00');
  assert.match(el('noteOut').textContent, /Short/);
});

for (const field of ['entry', 'sl', 'tp']) {
  for (const eventName of ['input', 'change']) {
    test('changing ' + field + ' via ' + eventName + ' immediately clears previously calculated values', () => {
      const { el, fire, calculate } = boot();
      calculate();
      el(field).value = String(Number(el(field).value) + 0.5);
      fire(field, eventName);
      assert.equal(el('resultsBox').style.display, 'none');
      assert.equal(el('rrOut').textContent, '—');
      assert.equal(el('riskOut').textContent, '—');
      assert.equal(el('rewardOut').textContent, '—');
      assert.equal(el('beOut').textContent, '—');
      assert.match(el('emptyHint').textContent, /Calculate again/);
      assert.match(el('resultStatus').textContent, /Calculate again/);
    });
  }
}

test('recalculation uses the updated price inputs and becomes visible again', () => {
  const { el, fire, calculate } = boot();
  calculate();
  el('tp').value = '108';
  fire('tp', 'input');
  fire('calcBtn', 'click');
  assert.equal(el('rrOut').textContent, '4.00');
  assert.equal(el('beOut').textContent, '20.0%');
  assert.equal(el('resultsBox').style.display, 'flex');
  assert.match(el('resultStatus').textContent, /calculated for the current inputs/);
});

test('invalid directional inputs cannot retain an earlier valid trade result', () => {
  const { el, fire, calculate } = boot();
  calculate();
  el('tp').value = '90';
  fire('tp', 'input');
  fire('calcBtn', 'click');
  assert.equal(el('resultsBox').style.display, 'none');
  assert.equal(el('rrOut').textContent, '—');
  assert.match(el('error').textContent, /opposite sides/);
});

test('editing a validation error clears it and permits recovery', () => {
  const { el, fire, calculate } = boot();
  calculate('100', '98', '90');
  assert.ok(el('error').textContent);
  el('tp').value = '106';
  fire('tp', 'input');
  assert.equal(el('error').textContent, '');
  fire('calcBtn', 'click');
  assert.equal(el('rrOut').textContent, '3.00');
});

test('Clear resets inputs and all risk/reward outputs', () => {
  const { el, fire, calculate } = boot();
  calculate();
  fire('clearBtn', 'click');
  assert.equal(el('entry').value, '');
  assert.equal(el('sl').value, '');
  assert.equal(el('tp').value, '');
  assert.equal(el('rrOut').textContent, '—');
  assert.equal(el('resultsBox').style.display, 'none');
});

test('result status and validation errors have assistive technology announcements', () => {
  assert.match(html, /id="resultStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /id="error"[^>]*role="alert"/);
});
