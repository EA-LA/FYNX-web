'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../tools/pivot.html'), 'utf8');
const script = html.match(/<script>\s*(const THEME_KEY[\s\S]*?)<\/script>/);
assert.ok(script, 'Pivot calculator inline controller must be present');

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
    fire(type, extras = {}) {
      for (const fn of listeners.get(type) || []) fn({ type, ...extras });
    },
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = String(value); text = markup.replace(/<[^>]*>/g, ''); },
    get textContent() { return text; },
    set textContent(value) { text = String(value); markup = ''; },
  };
}
function boot() {
  const controls = Object.fromEntries(
    ['high', 'low', 'close', 'method', 'calculateBtn', 'clearBtn', 'resultArea']
      .map(id => [id, element()])
  );
  controls.method.value = 'classic';
  controls.resultArea.className = 'result-placeholder';
  controls.high.value = '110';
  controls.low.value = '100';
  controls.close.value = '105';
  const document = {
    getElementById(id) { assert.ok(controls[id], 'Missing controller binding: ' + id); return controls[id]; },
    body: { classList: { add() {}, remove() {} } },
  };
  const window = { FynxPreferences: { getItem() { return null; } }, addEventListener() {} };
  vm.runInNewContext(script[1], { document, window, console }, { filename: 'tools/pivot.html' });
  return controls;
}
const calculate = c => c.calculateBtn.fire('click');
const assertFresh = c => {
  assert.equal(c.resultArea.className, 'result-placeholder');
  assert.match(c.resultArea.textContent, /Inputs changed.*Calculate/);
  assert.doesNotMatch(c.resultArea.innerHTML, /PP:/);
};

test('successful calculation is removed immediately while editing High on iPhone', () => {
  const c = boot();
  calculate(c);
  assert.match(c.resultArea.innerHTML, /PP:\s*105/);
  c.high.value = '120';
  c.high.fire('input');
  assertFresh(c);
  calculate(c);
  assert.match(c.resultArea.innerHTML, /PP:\s*108\.33/);
});

test('Low and Close edits both invalidate previously calculated levels', () => {
  const c = boot();
  calculate(c);
  c.low.value = '99';
  c.low.fire('input');
  assertFresh(c);
  calculate(c);
  assert.match(c.resultArea.innerHTML, /PP:/);
  c.close.value = '104';
  c.close.fire('change');
  assertFresh(c);
});

test('changing pivot method hides old levels until Fibonacci recalculation', () => {
  const c = boot();
  calculate(c);
  assert.match(c.resultArea.innerHTML, /Method used:\s*<strong>Classic/);
  c.method.value = 'fibonacci';
  c.method.fire('change');
  assertFresh(c);
  calculate(c);
  assert.match(c.resultArea.innerHTML, /Method used:\s*<strong>Fibonacci/);
});

test('typing before the first calculation preserves the empty starting state', () => {
  const c = boot();
  c.high.value = '120';
  c.high.fire('input');
  assert.equal(c.resultArea.className, 'result-placeholder');
  assert.equal(c.resultArea.textContent, '');
});

test('editing a validation error replaces it with retry guidance', () => {
  const c = boot();
  c.close.value = '999';
  calculate(c);
  assert.match(c.resultArea.innerHTML, /Close should usually/);
  c.close.value = '105';
  c.close.fire('input');
  assertFresh(c);
  calculate(c);
  assert.match(c.resultArea.innerHTML, /PP:/);
});

test('Clear restores empty inputs and does not reintroduce stale results', () => {
  const c = boot();
  calculate(c);
  c.clearBtn.fire('click');
  assert.equal(c.high.value, '');
  assert.equal(c.low.value, '');
  assert.equal(c.close.value, '');
  assert.equal(c.resultArea.className, 'result-placeholder');
  assert.match(c.resultArea.textContent, /Your pivot levels will appear/);
  c.high.fire('input');
  assert.match(c.resultArea.textContent, /Your pivot levels will appear/);
});

test('Enter key still calculates after input invalidation', () => {
  const c = boot();
  calculate(c);
  c.high.value = '111';
  c.high.fire('input');
  assertFresh(c);
  c.high.fire('keydown', { key: 'Enter' });
  assert.match(c.resultArea.innerHTML, /PP:/);
});

test('result area announces changes politely to assistive technology', () => {
  assert.match(html, /id="resultArea"[^>]*aria-live="polite"/);
});
