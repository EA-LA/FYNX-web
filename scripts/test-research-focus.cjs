const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const helper = fs.readFileSync(path.join(root, 'assets/js/research/focus.js'), 'utf8');
const focusModule = import('data:text/javascript;base64,' + Buffer.from(helper).toString('base64'));

function button(field, id) {
  return {
    dataset: { [field]: id },
    focus(options) { this.focusOptions = options; document.activeElement = this; }
  };
}
function fixture(before, after, fallback) {
  const container = {
    buttons: before,
    contains(node) { return this.buttons.includes(node); },
    querySelectorAll(selector) { assert.equal(selector, 'button'); return this.buttons; },
    set innerHTML(value) { assert.equal(value, 'updated'); this.buttons = after; }
  };
  global.document = {
    activeElement: null,
    querySelector(selector) { assert.match(selector, /^#/); return fallback; }
  };
  return container;
}
test('research portfolio and price-alert renderers use the shared focus helper', () => {
  const personal = fs.readFileSync(path.join(root, 'assets/js/research/personal.js'), 'utf8');
  assert.match(personal, /import \{replaceMarkupWithFocus\} from '\.\/focus\.js(?:\?v=[^'\s]+)?'/);
  assert.match(personal, /replaceMarkupWithFocus\(\$\('#portfolio-output'\),/);
  assert.match(personal, /'holdings', '#holding-symbol'\)/);
  assert.match(personal, /replaceMarkupWithFocus\(\$\('#alerts-output'\),/);
  assert.match(personal, /'alerts', '#alert-symbol'\)/);
});
test('keeps focus on the same alert toggle after rearming', async () => {
  const { replaceMarkupWithFocus } = await focusModule;
  const old = button('toggleAlert', 'rule-a');
  const replacement = button('toggleAlert', 'rule-a');
  const container = fixture([old], [replacement], button('none', 'fallback'));
  document.activeElement = old;
  replaceMarkupWithFocus(container, 'updated', 'alerts', '#alert-symbol');
  assert.equal(document.activeElement, replacement);
  assert.deepEqual(replacement.focusOptions, { preventScroll: true });
});
test('removing an alert moves focus to a safe toggle, not another Remove button', async () => {
  const { replaceMarkupWithFocus } = await focusModule;
  const old = button('deleteAlert', 'rule-a');
  const next = button('toggleAlert', 'rule-b');
  const container = fixture([button('toggleAlert', 'rule-a'), old, next], [next, button('deleteAlert', 'rule-b')], button('none', 'fallback'));
  document.activeElement = old;
  replaceMarkupWithFocus(container, 'updated', 'alerts', '#alert-symbol');
  assert.equal(document.activeElement, next);
});
test('last alert removed returns focus to the alert form', async () => {
  const { replaceMarkupWithFocus } = await focusModule;
  const old = button('deleteAlert', 'rule-a');
  const fallback = button('none', 'fallback');
  const container = fixture([button('toggleAlert', 'rule-a'), old], [], fallback);
  document.activeElement = old;
  replaceMarkupWithFocus(container, 'updated', 'alerts', '#alert-symbol');
  assert.equal(document.activeElement, fallback);
});
test('removing a holding focuses Edit instead of another Remove control', async () => {
  const { replaceMarkupWithFocus } = await focusModule;
  const old = button('deleteHolding', 'holding-a');
  const next = button('editHolding', 'holding-b');
  const container = fixture([button('editHolding', 'holding-a'), old, next], [next, button('deleteHolding', 'holding-b')], button('none', 'fallback'));
  document.activeElement = old;
  replaceMarkupWithFocus(container, 'updated', 'holdings', '#holding-symbol');
  assert.equal(document.activeElement, next);
});
test('does not steal focus from controls outside the rendered list', async () => {
  const { replaceMarkupWithFocus } = await focusModule;
  const external = button('other', 'external');
  const container = fixture([button('toggleAlert', 'rule-a')], [button('toggleAlert', 'rule-a')], button('none', 'fallback'));
  document.activeElement = external;
  replaceMarkupWithFocus(container, 'updated', 'alerts', '#alert-symbol');
  assert.equal(document.activeElement, external);
});
