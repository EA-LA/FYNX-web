'use strict';

// Exercise the real Calendar markup with its inline tab controller AND shared module loader.
// Regression: screen readers need a programmatic tab/panel relationship; inactive
// embedded calendars must be removed from the focus and accessibility trees.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'calendar.html'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'assets/js/module-loader.js'), 'utf8');
const controller = html.match(/<script>\s*(const THEME_KEY = 'fynx_theme';[\s\S]*?)<\/script>/);
assert.ok(controller, 'Calendar inline tab controller exists');
assert.match(html, /\.calendar-mode-btn:focus-visible\s*\{/, 'keyboard users have a clear focus ring');
assert.match(html, /module-loader\.js/, 'Calendar uses the shared keyboard navigation and route controller');

const dom = new JSDOM(html, {
  url: 'https://www.fynxfinanceworld.com/calendar.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;
window.FynxPreferences = { getItem: () => null };
window.ResizeObserver = class { observe() {} disconnect() {} };
const keys = ['economic', 'holidays', 'hours'];
const tabs = keys.map(key => document.getElementById('calendar-tab-' + key));
const panels = keys.map(key => document.getElementById('calendar-panel-' + key));

for (const [i, key] of keys.entries()) {
  const tab = tabs[i];
  const panel = panels[i];
  assert.ok(tab && panel, key + ' exposes an addressable tab and panel');
  assert.equal(tab.getAttribute('role'), 'tab');
  assert.equal(tab.getAttribute('aria-controls'), panel.id);
  assert.equal(panel.getAttribute('role'), 'tabpanel');
  assert.equal(panel.getAttribute('aria-labelledby'), tab.id);
  assert.equal(panel.dataset.calendarPanel, key);
}

function checkSelected(key) {
  keys.forEach((name, i) => {
    const active = name === key;
    assert.equal(tabs[i].getAttribute('aria-selected'), String(active), name + ' selected');
    assert.equal(tabs[i].tabIndex, active ? 0 : -1, name + ' keyboard tab stop');
    assert.equal(panels[i].hidden, !active, name + ' hidden state');
    assert.equal(panels[i].getAttribute('aria-hidden'), String(!active), name + ' screen reader state');
    assert.equal(panels[i].classList.contains('active'), active, name + ' visual state');
  });
}

try {
  // Real event wiring; do not replace it with a test-only controller.
  window.eval(controller[1]);
  window.eval(loader);
  checkSelected('economic');

  tabs[0].focus();
  for (const [key, expected] of [
    ['ArrowRight', 'holidays'],
    ['End', 'hours'],
    ['ArrowRight', 'economic'],
    ['ArrowLeft', 'hours'],
    ['Home', 'economic']
  ]) {
    const evt = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(evt);
    assert.equal(evt.defaultPrevented, true, key + ' handled by shared tab navigation');
    assert.equal(document.activeElement.dataset.calendarTab, expected, key + ' moves keyboard focus');
    checkSelected(expected);
    assert.equal(new URL(window.location.href).searchParams.get('section'), expected, key + ' updates route');
  }

  const tab = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.activeElement.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false, 'Tab keeps its native focus behavior');

  tabs[1].click();
  checkSelected('holidays');
  window.history.replaceState(null, '', '?section=hours&tool=%2Ftools%2Fmarket-hours.html');
  window.dispatchEvent(new window.PopStateEvent('popstate'));
  checkSelected('hours');
  assert.equal(new URL(window.location.href).searchParams.get('section'), 'hours');

  console.log('Calendar tabs: focus, labels, hidden iframes, keyboard controls and deep links passed');
} finally {
  setImmediate(() => window.close());
}
