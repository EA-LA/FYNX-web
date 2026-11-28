'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real browser controller without network, browser APIs, or external dependencies.
function element(initialValue = '') {
  const callbacks = new Map();
  return {
    value: initialValue, textContent: '', hidden: false, children: [],
    validity: {},
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
    get valueAsNumber() { return this.value.trim() === '' ? NaN : Number(this.value); },
    addEventListener(event, callback) {
      if (!callbacks.has(event)) callbacks.set(event, []);
      callbacks.get(event).push(callback);
    },
    fire(event, data = {}) {
      for (const callback of callbacks.get(event) || []) callback(data);
    },
    replaceChildren(...children) { this.children = children; },
    append(child) { this.children.push(child); },
  };
}
const nodes = new Map(Object.entries({
  swingHigh: '1.1200', swingLow: '1.1000', entryPrice: '1.1124',
  trendDirection: 'up', pricePrecision: '4',
}).map(([id, value]) => [id, element(value)]));
const get = id => {
  if (!nodes.has(id)) nodes.set(id, element());
  return nodes.get(id);
};
const fakeDocument = {getElementById: get, createElement: () => element()};
const source = fs.readFileSync(path.join(__dirname, '../assets/js/fibonacci-calculator.js'), 'utf8');
vm.runInNewContext(source, {document: fakeDocument}, {filename: 'fibonacci-calculator.js'});
let checks = 0;
function equals(actual, expected, label) {
  assert.equal(actual, expected, label);
  checks++;
}

// The initial real controller render uses its example data.
equals(get('rangeValue').textContent, '0.0200', 'Initial example range');
equals(get('fibLevels').children.length, 8, 'Initial table rows');

// Typing into a number field must recalculate before blur or Calculate is clicked.
get('swingHigh').value = '1.1300';
get('swingHigh').fire('input');
equals(get('rangeValue').textContent, '0.0300', 'Swing high changes on input');
equals(get('fibLevels').children.length, 8, 'Rebuilt levels after typing');

// Clearing optional entry must not retain a nearest-level result from the old entry.
get('entryPrice').value = '';
get('entryPrice').fire('input');
equals(get('nearestValue').textContent, 'No entry provided', 'Removed entry clears nearest level');

// Invalid interim edits must also clear the previously calculated numeric levels.
get('swingLow').value = '1.1400';
get('swingLow').fire('input');
equals(get('fibError').hidden, false, 'Invalid interim swing shows validation');
equals(get('rangeValue').textContent, '—', 'Invalid input clears stale range');
equals(get('fibLevels').children.length, 0, 'Invalid input clears stale table');

// Restoring a valid value recovers immediately, without leaving the input field.
get('swingLow').value = '1.1000';
get('swingLow').fire('input');
equals(get('fibError').hidden, true, 'Valid input hides validation');
equals(get('rangeValue').textContent, '0.0300', 'Valid value recovers range');
equals(get('fibLevels').children.length, 8, 'Valid value rebuilds table');

// Existing controls must still behave normally.
get('trendDirection').value = 'down';
get('trendDirection').fire('change');
equals(get('fibLevels').children[0].children[2].textContent, '1.1071', 'Downtrend calculation retained');
get('pricePrecision').value = '5';
get('pricePrecision').fire('change');
equals(get('fibLevels').children[0].children[2].textContent, '1.10708', 'Precision control retained');
get('resetBtn').fire('click');
equals(get('rangeValue').textContent, '0.0200', 'Reset computes original sample');
equals(get('entryPrice').value, '1.1124', 'Reset restores original entry');

// The optional custom ratio is independent of the base table and optional entry/stop.
const custom = get('customPullback');
const customResult = get('customPullbackResult');
const baseRows = get('fibLevels').children;
equals(customResult.textContent, '', 'Blank custom ratio has no result');
custom.value = '70.5';
custom.fire('input');
equals(customResult.textContent, '70.5% pullback: 1.1059', 'Custom ratio updates without Calculate');
equals(get('fibLevels').children, baseRows, 'Custom ratio does not rebuild the standard rows');
custom.value = '100.001';
custom.fire('input');
equals(custom.attributes.get('aria-invalid'), 'true', 'Out of range custom input is called out');
equals(get('fibError').hidden, true, 'Invalid custom field does not invalidate standard values');
custom.value = '50.0001';
custom.fire('input');
equals(custom.attributes.get('aria-invalid'), 'true', 'Over-precise custom input is called out');
custom.value = '80.125';
custom.fire('input');
equals(custom.attributes.has('aria-invalid'), false, 'Valid custom input clears the error');
equals(customResult.textContent, '80.125% pullback: 1.1040', 'Custom result recovers');
get('trendDirection').value = 'down';
get('trendDirection').fire('change');
equals(customResult.textContent, '80.125% pullback: 1.1160', 'Custom uses a downtrend');
get('pricePrecision').value = '5';
get('pricePrecision').fire('change');
equals(customResult.textContent, '80.125% pullback: 1.11603', 'Custom follows price precision');
get('entryPrice').value = '-1';
get('entryPrice').fire('input');
equals(customResult.textContent, '80.125% pullback: 1.11603', 'Custom remains independent of entry');
get('swingLow').value = '1.12';
get('swingLow').fire('input');
equals(customResult.textContent, 'Enter a positive swing low and a swing high greater than the low.', 'Bad swing clears stale custom price');
get('resetBtn').fire('click');
equals(custom.value, '', 'Reset clears custom input');
equals(customResult.textContent, '', 'Reset clears custom price');
const html = fs.readFileSync(path.join(__dirname, '../tools/fibonacci.html'), 'utf8');
assert.match(html, /fibonacci-calculator\.js\?v=20261128-custom-pullback-1/);
assert.doesNotMatch(html.match(/data-scenario-fields="[^"]+"/)[0], /customPullback/);
console.log('Fibonacci live input: ' + checks + ' browser-controller assertions passed.');
