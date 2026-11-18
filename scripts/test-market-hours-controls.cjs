'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'tools', 'market-hours.html'), 'utf8');

// Native controls must remain keyboard operable without custom key handlers.
assert.match(html, /<button\b[^>]*\bid="refreshBtn"[^>]*>/);
assert.match(html, /<button\b[^>]*\bid="refreshBtn"[^>]*\btype="button"/);
assert.match(html, /<div\b[^>]*\bid="tabs"[^>]*\brole="group"[^>]*\baria-label="Market type"/);
assert.match(html, /\.btn:focus-visible,\s*\.tab:focus-visible/);

const start = html.indexOf('function buildTabs(){');
const end = html.indexOf('\nfunction renderAxis(){', start);
assert.ok(start >= 0 && end > start, 'market tab renderer exists');
const source = html.slice(start, end);

let renderCount = 0;
const buttons = [];
const tabsEl = {
  children: buttons,
  appendChild(button) { buttons.push(button); },
  querySelectorAll(selector) {
    assert.equal(selector, 'button[data-market]');
    return buttons.filter(button => button.dataset.market);
  }
};
const document = {
  createElement(tag) {
    assert.equal(tag, 'button', 'tabs must be native buttons');
    const classes = new Set();
    return {
      type: '', dataset: {}, attributes: {}, listeners: {},
      classList: {
        toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); }
      },
      addEventListener(event, handler) { this.listeners[event] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      click() { this.listeners.click(); }
    };
  }
};
const STATE = { active: 'forex' };
const context = {
  tabsEl, document, STATE,
  MARKETS: { forex: { label: 'Forex' }, stocks: { label: 'Stocks' }, crypto: { label: 'Crypto' } },
  renderAll() { renderCount++; context.buildTabs(); }
};
vm.runInNewContext(source, context, { timeout: 1000 });
context.buildTabs();
assert.equal(buttons.length, 3);
assert.equal(buttons[0].type, 'button');
assert.equal(buttons[0].attributes['aria-pressed'], 'true');
assert.equal(buttons[1].attributes['aria-pressed'], 'false');
const original = [...buttons];
buttons[1].click();
assert.equal(STATE.active, 'stocks');
assert.equal(renderCount, 1);
assert.equal(buttons[0].attributes['aria-pressed'], 'false');
assert.equal(buttons[1].attributes['aria-pressed'], 'true');
context.buildTabs(); // Simulate the 30-second periodic refresh.
assert.equal(buttons.length, 3);
for (let i = 0; i < buttons.length; i++) {
  assert.equal(buttons[i], original[i], 'refresh should preserve the focused button node');
}
console.log('Market Hours control semantics and stable renderer: PASS');
