'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const page = readFileSync(join(__dirname, '../tools/options.html'), 'utf8');
const match = page.match(/<script>\s*(const THEME_KEY[\s\S]*?)<\/script>/);
assert.ok(match, 'Execute the actual shipped Options Calculator controller');

function element(value = '') {
  const listeners = new Map();
  let markup = '';
  let text = '';
  return {
    value,
    className: '',
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    fire(type, extra = {}) {
      for (const fn of listeners.get(type) || []) fn({ type, ...extra });
    },
    get innerHTML() { return markup; },
    set innerHTML(value) {
      markup = String(value);
      text = markup.replace(/<[^>]*>/g, '');
    },
    get textContent() { return text; },
    set textContent(value) {
      text = String(value);
      markup = '';
    }
  };
}

function boot() {
  const defaults = {
    optionType: 'call', positionType: 'long', strikePrice: '100',
    premium: '3', stockPrice: '110', contracts: '1'
  };
  const fields = Object.keys(defaults);
  const controls = Object.fromEntries(
    [...fields, 'calculateBtn', 'clearBtn', 'resultArea']
      .map(id => [id, element(defaults[id] || '')])
  );
  controls.resultArea.className = 'result-placeholder';
  controls.resultArea.textContent = 'Your option payoff result will appear here.';
  const document = {
    getElementById(id) {
      assert.ok(controls[id], 'Unexpected controller binding: ' + id);
      return controls[id];
    },
    body: { classList: { add() {}, remove() {} } }
  };
  const window = {
    FynxPreferences: { getItem() { return null; } },
    addEventListener() {}
  };
  runInNewContext(match[1], { document, window }, { filename: 'tools/options.html', timeout: 1500 });
  return {
    controls,
    calc() { controls.calculateBtn.fire('click'); },
    edit(id, value, event = 'input') {
      controls[id].value = String(value);
      controls[id].fire(event);
    }
  };
}

test('baseline expiration call P/L is unchanged at $700', () => {
  const f = boot();
  f.calc();
  assert.match(f.controls.resultArea.innerHTML, /Profit: \$700\.00/);
  assert.match(f.controls.resultArea.innerHTML, /Break-even Price:<\/strong> \$103\.00/);
});

for (const [id, value, event] of [
  ['optionType', 'put', 'change'],
  ['positionType', 'short', 'change'],
  ['strikePrice', '101', 'input'],
  ['premium', '5', 'input'],
  ['stockPrice', '112', 'input'],
  ['contracts', '2', 'input']
]) {
  test('editing ' + id + ' clears old P/L via ' + event + ' until recalculation', () => {
    const f = boot();
    f.calc();
    assert.match(f.controls.resultArea.innerHTML, /Profit: \$700\.00/);
    f.edit(id, value, event);
    assert.equal(f.controls.resultArea.className, 'result-placeholder');
    assert.match(f.controls.resultArea.textContent, /Inputs changed.*Calculate/);
    assert.doesNotMatch(f.controls.resultArea.textContent, /700\.00/);
    f.calc();
    assert.equal(f.controls.resultArea.className, 'result-box');
    assert.doesNotMatch(f.controls.resultArea.innerHTML, /Profit: \$700\.00/);
  });
}

test('either input or change invalidates a number entry', () => {
  const f = boot();
  f.calc();
  f.edit('contracts', '3', 'change');
  assert.match(f.controls.resultArea.textContent, /Inputs changed/);
  f.calc();
  assert.match(f.controls.resultArea.innerHTML, /Profit: \$2,100\.00/);
});

test('edits before any calculation preserve the initial guidance', () => {
  const f = boot();
  f.edit('stockPrice', '111');
  assert.match(f.controls.resultArea.textContent, /Your option payoff result will appear/);
  assert.doesNotMatch(f.controls.resultArea.textContent, /Inputs changed/);
});

test('fixing invalid values removes stale validation messages', () => {
  const f = boot();
  f.edit('contracts', '0');
  f.calc();
  assert.match(f.controls.resultArea.innerHTML, /Error:/);
  f.edit('contracts', '1');
  assert.equal(f.controls.resultArea.className, 'result-placeholder');
  assert.doesNotMatch(f.controls.resultArea.textContent, /Error:/);
  f.calc();
  assert.match(f.controls.resultArea.innerHTML, /Profit: \$700\.00/);
});

test('Clear restores the six inputs and initial result state', () => {
  const f = boot();
  f.calc();
  f.controls.clearBtn.fire('click');
  for (const id of ['strikePrice', 'premium', 'stockPrice', 'contracts']) {
    assert.equal(f.controls[id].value, '');
  }
  assert.equal(f.controls.optionType.value, 'call');
  assert.equal(f.controls.positionType.value, 'long');
  assert.equal(f.controls.resultArea.className, 'result-placeholder');
  assert.match(f.controls.resultArea.textContent, /Your option payoff result will appear/);
});

test('Enter still recalculates after edits', () => {
  const f = boot();
  f.calc();
  f.edit('premium', '4');
  f.controls.premium.fire('keydown', { key: 'Enter' });
  assert.match(f.controls.resultArea.innerHTML, /Profit: \$600\.00/);
});

test('result status is accessible and shared scenario still recalculates', () => {
  assert.match(page, /id="resultArea"[^>]*role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(page, /data-scenario-fields="optionType,positionType,strikePrice,premium,stockPrice,contracts"/);
  assert.match(page, /data-scenario-run="calculateBtn"/);
});
