'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const page = readFileSync(join(__dirname, '../tools/profit-loss.html'), 'utf8');
const controller = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .find(script => script.includes('function calculateStock()'));
assert.ok(controller, 'Tests must execute the real Stock Calculator controller');

function element(value = '') {
  const listeners = new Map();
  return {
    value,
    textContent: '',
    style: { display: '' },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    fire(type, properties = {}) {
      for (const handler of listeners.get(type) || []) {
        handler({ type, ...properties });
      }
    }
  };
}

function boot() {
  const defaults = {
    accountSize: '10000', riskPercent: '1', entryPrice: '150.25', stopLoss: '145'
  };
  const elements = Object.fromEntries(
    [...Object.keys(defaults), 'calculateBtn', 'clearBtn', 'emptyState',
      'resultList', 'riskAmountValue', 'riskPerShareValue', 'sharesValue',
      'capitalNeededValue', 'maxLossValue', 'notesValue']
      .map(id => [id, element(defaults[id] || '')])
  );
  elements.emptyState.textContent =
    'Enter values and tap Calculate to see risk amount, share size, capital needed, and trade details.';

  const document = {
    getElementById(id) {
      assert.ok(elements[id], 'Unexpected DOM lookup: ' + id);
      return elements[id];
    },
    body: { classList: { add() {}, remove() {} } }
  };
  const window = {
    FynxPreferences: { getItem() { return null; } },
    addEventListener() {}
  };
  runInNewContext(controller, { document, window }, {
    filename: 'tools/profit-loss.html', timeout: 1500
  });
  return {
    elements,
    calculate() { elements.calculateBtn.fire('click'); },
    clear() { elements.clearBtn.fire('click'); },
    edit(id, value, event = 'input') {
      elements[id].value = String(value);
      elements[id].fire(event);
    }
  };
}

test('baseline stock position sizing stays unchanged', () => {
  const f = boot();
  f.calculate();
  assert.equal(f.elements.riskAmountValue.textContent, '$100.00');
  assert.equal(f.elements.riskPerShareValue.textContent, '$5.25');
  assert.equal(f.elements.sharesValue.textContent, '19 shares');
  assert.equal(f.elements.capitalNeededValue.textContent, '$2,854.75');
  assert.equal(f.elements.maxLossValue.textContent, '$99.75');
  assert.equal(f.elements.resultList.style.display, 'grid');
});

for (const [id, value] of [
  ['accountSize', '20000'], ['riskPercent', '2'],
  ['entryPrice', '160'], ['stopLoss', '140']
]) {
  test('editing ' + id + ' hides and clears prior financial results', () => {
    const f = boot();
    f.calculate();
    f.edit(id, value);
    assert.equal(f.elements.resultList.style.display, 'none');
    assert.equal(f.elements.emptyState.style.display, 'block');
    assert.match(f.elements.emptyState.textContent, /Inputs changed.*Calculate/);
    assert.equal(f.elements.sharesValue.textContent, '0 shares');
    assert.equal(f.elements.maxLossValue.textContent, '$0.00');
    f.calculate();
    assert.equal(f.elements.resultList.style.display, 'grid');
    assert.notEqual(f.elements.maxLossValue.textContent, '$99.75');
  });
}

test('change events also invalidate previous estimates', () => {
  const f = boot();
  f.calculate();
  f.edit('stopLoss', '140', 'change');
  assert.equal(f.elements.resultList.style.display, 'none');
  assert.match(f.elements.emptyState.textContent, /Inputs changed/);
});

test('editing fields before first calculation preserves initial guidance', () => {
  const f = boot();
  f.edit('entryPrice', '160');
  assert.match(f.elements.emptyState.textContent, /Enter values and tap Calculate/);
  assert.doesNotMatch(f.elements.emptyState.textContent, /Inputs changed/);
});

test('editing to correct a failed calculation removes stale validation errors', () => {
  const f = boot();
  f.edit('stopLoss', '0');
  f.calculate();
  assert.match(f.elements.emptyState.textContent, /valid positive numbers/);
  f.edit('stopLoss', '145');
  assert.doesNotMatch(f.elements.emptyState.textContent, /valid positive numbers/);
  f.calculate();
  assert.equal(f.elements.sharesValue.textContent, '19 shares');
});

test('Clear returns the form and result to their initial state', () => {
  const f = boot();
  f.calculate();
  f.clear();
  for (const id of ['accountSize', 'riskPercent', 'entryPrice', 'stopLoss']) {
    assert.equal(f.elements[id].value, '');
  }
  assert.equal(f.elements.resultList.style.display, 'none');
  assert.match(f.elements.emptyState.textContent, /Enter values and tap Calculate/);
  f.edit('entryPrice', '155');
  assert.match(f.elements.emptyState.textContent, /Enter values and tap Calculate/);
});

test('Enter still recalculates the current risk estimate after an edit', () => {
  const f = boot();
  f.calculate();
  f.edit('accountSize', '20000');
  f.elements.accountSize.fire('keydown', { key: 'Enter' });
  assert.equal(f.elements.resultList.style.display, 'grid');
  assert.equal(f.elements.sharesValue.textContent, '38 shares');
});

test('status regions announce guidance and results without changing scenario links', () => {
  assert.match(page, /id="emptyState"[^>]*role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(page, /id="resultList"[^>]*role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(page, /data-scenario-fields="accountSize,riskPercent,entryPrice,stopLoss"/);
  assert.match(page, /data-scenario-run="calculateBtn"/);
});
