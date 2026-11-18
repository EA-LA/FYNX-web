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
console.log('Fibonacci live input: ' + checks + ' browser-controller assertions passed.');
