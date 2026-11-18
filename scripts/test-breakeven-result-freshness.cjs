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
    type: 'buy', entry: '1.1000', lot: '1', spread: '1', commission: '7', pipSize: '0.0001', pipValue: '10'
  };
  const elements = {};
  const makeNode = (tag) => {
    const node = {
      tag, children: [], className: '', hidden: false,
      appendChild(child) { this.children.push(child); return child; }
    };
    Object.defineProperty(node, 'textContent', {
      get() { return this._text ?? this.children.map((c) => c.textContent).join('|'); },
      set(value) { this._text = value === '' ? undefined : value; if (value === '') this.children = []; }
    });
    return node;
  };
  for (const id of [...Object.keys(defaults), 'be', 'cost', 'pips', 'statusBox', 'calculationStatus', 'beMoves', 'beMovesBody']) {
    const handlers = { input: [], change: [] };
    if (id === 'beMoves' || id === 'beMovesBody') { elements[id] = makeNode('div'); continue; }
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
      createElement(tag) { return makeNode(tag); },
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
  assert.match(page, /data-scenario-fields="type,entry,lot,spread,commission,pipSize,pipValue"/);
  assert.match(page, /data-scenario-run="calculateBtn"/);
  assert.equal(typeof f.context.window.fynxRiskPilot, 'function');
});

test('JPY pairs use a 0.01 pip and the entered pip value (run 93)', () => {
  // USDJPY 150.000, 1 lot, 1.5 pip spread, $8 commission, pip value 1000/150 = $6.6667 per lot.
  // Independent check (Python): pips needed = 1.5 + 8/6.6667 = 2.70; long BE = 150 + 2.70 x 0.01 = 150.027.
  const f = fixture();
  f.edit('entry', '150.000');
  f.edit('pipSize', '0.01', 'change');
  f.edit('pipValue', String(1000 / 150));
  f.edit('spread', '1.5');
  f.edit('commission', '8');
  f.context.calc();
  assert.equal(f.result(), '150.027');
  assert.equal(f.elements.pips.textContent, '2.70 pips');
  assert.equal(f.elements.cost.textContent, '$18.00');
  f.edit('type', 'sell', 'change');
  f.context.calc();
  assert.equal(f.result(), '149.973');
});

test('net result table: moves after costs, break-even row, cleared on edit', () => {
  const f = fixture();
  f.context.calc();
  const body = f.elements.beMovesBody;
  assert.equal(f.elements.beMoves.hidden, false);
  const rows = body.children.map((tr) => tr.children.map((td) => td.textContent));
  // Default: $10/pip, total cost $17. -20 pips: -$217; +10: +$83; +50: +$483.
  assert.deepEqual(rows[0], ['−20 pips', '1.09800', '−$217.00']);
  assert.deepEqual(rows.find((r) => r[0].startsWith('Break-even')), ['Break-even', '1.10017', '$0.00']);
  assert.deepEqual(rows.find((r) => r[0].startsWith('+10')), ['+10 pips', '1.10100', '+$83.00']);
  assert.deepEqual(rows.at(-1), ['+50 pips', '1.10500', '+$483.00']);
  f.edit('lot', '10');
  f.context.calc();
  assert.deepEqual(f.elements.beMovesBody.children.at(-1).children.map((td) => td.textContent), ['+50 pips', '1.10500', '+$4,893']);
  f.edit('pipValue', '5');
  assert.equal(f.elements.beMoves.hidden, true);
  assert.equal(body.children.length, 0);
});

test('nonpositive pip value is rejected without stale results', () => {
  const f = fixture();
  f.context.calc();
  f.edit('pipValue', '0');
  f.context.calc();
  assert.equal(f.result(), '—');
  assert.match(f.elements.calculationStatus.textContent, /positive pip value/);
});
