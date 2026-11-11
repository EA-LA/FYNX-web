'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const page = readFileSync(join(__dirname, '..', 'tools', 'breakeven.html'), 'utf8');
const inlineController = page.match(/<script>\s*(function clearResults\([\s\S]*?)<\/script>/);
assert.ok(inlineController, 'Run the real inline break-even controller, not a reimplementation');

function fixture() {
  const defaults = {
    type: 'buy', entry: '1.1000', lot: '1', spread: '1', commission: '7'
  };
  const elements = {};
  for (const id of [...Object.keys(defaults), 'be', 'cost', 'pips', 'statusBox', 'calculationStatus']) {
    const handlers = { input: [], change: [] };
    const el = {
      value: defaults[id] ?? '',
      textContent: '—',
      innerHTML: '',
      addEventListener(name, fn) { (handlers[name] ??= []).push(fn); },
      fire(name) { for (const fn of handlers[name] ?? []) fn({ type: name }); }
    };
    Object.defineProperty(el, 'innerText', {
      get() { return this.textContent; },
      set(value) { this.textContent = value; }
    });
    elements[id] = el;
  }
  const window = {};
  const context = {
    document: {
      getElementById(id) {
        assert.ok(elements[id], 'Unexpected DOM dependency: ' + id);
        return elements[id];
      }
    },
    window,
    alert() { throw new Error('Blocking alerts are not allowed for input validation'); }
  };
  runInNewContext(inlineController[1], context, { filename: 'tools/breakeven.html' });
  return {
    elements,
    context,
    edit(id, value, event = 'input') {
      elements[id].value = String(value);
      elements[id].fire(event);
    },
    result() { return elements.be.textContent; }
  };
}

test('status explains how to recalculate and announces changes accessibly', () => {
  assert.match(page, /id="calculationStatus"[^>]*role="status" aria-live="polite"/);
  const f = fixture();
  f.context.calc();
  assert.equal(f.elements.calculationStatus.textContent, 'Calculated using the current inputs.');
  f.edit('entry', '1.2000');
  assert.match(f.elements.calculationStatus.textContent, /Calculate again/);
});

test('unmodified long setup returns the existing validated model values', () => {
  const f = fixture();
  f.context.calc();
  assert.equal(f.result(), '1.10017');
  assert.equal(f.elements.cost.textContent, '$17.00');
  assert.equal(f.elements.pips.textContent, '1.70 pips');
  assert.match(f.elements.statusBox.innerHTML, /Efficient Trade/);
});

for (const id of ['entry', 'lot', 'spread', 'commission']) {
  test('editing ' + id + ' invalidates every previously calculated result', () => {
    const f = fixture();
    f.context.calc();
    assert.notEqual(f.result(), '—');
    f.edit(id, id === 'entry' ? '1.21' : '2');
    for (const output of ['be', 'cost', 'pips']) {
      assert.equal(f.elements[output].textContent, '—');
    }
    assert.equal(f.elements.statusBox.textContent, 'Status: —');
    assert.match(f.elements.calculationStatus.textContent, /Calculate again/);
  });
}

test('switching to short invalidates results on change and recalculates', () => {
  const f = fixture();
  f.context.calc();
  f.edit('type', 'sell', 'change');
  assert.equal(f.result(), '—');
  f.context.calc();
  assert.equal(f.result(), '1.09983');
  assert.equal(f.elements.calculationStatus.textContent, 'Calculated using the current inputs.');
});

test('invalid input never leaves the prior valid quote on screen', () => {
  const f = fixture();
  f.context.calc();
  f.edit('lot', '0');
  f.context.calc();
  assert.equal(f.result(), '—');
  assert.match(f.elements.calculationStatus.textContent, /positive entry price and lot size/);
});

test('nonpositive short break-even clears output without a blocking alert', () => {
  const f = fixture();
  f.edit('type', 'sell', 'change');
  f.edit('entry', '0.0001');
  f.edit('spread', '100');
  f.context.calc();
  assert.equal(f.result(), '—');
  assert.match(f.elements.calculationStatus.textContent, /must be positive/);
});

test('Reset restores long direction, defaults, and an uncalculated state', () => {
  const f = fixture();
  f.edit('type', 'sell');
  f.context.calc();
  f.context.resetCalc();
  assert.equal(f.elements.type.value, 'buy');
  assert.equal(f.elements.entry.value, '1.1000');
  assert.equal(f.elements.lot.value, '1');
  assert.equal(f.elements.spread.value, '1');
  assert.equal(f.elements.commission.value, '7');
  assert.equal(f.result(), '—');
  assert.match(f.elements.calculationStatus.textContent, /Inputs reset/);
});

test('shared-scenario restoration and opt-in API hooks are still present', () => {
  const f = fixture();
  assert.match(page, /data-scenario-fields="type,entry,lot,spread,commission"/);
  assert.match(page, /data-scenario-run="calculateBtn"/);
  assert.equal(typeof f.context.window.fynxRiskPilot, 'function');
});
