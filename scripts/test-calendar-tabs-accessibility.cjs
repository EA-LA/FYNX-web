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

  // Same-origin embedded pages must still size and forward links when an older
  // WebView does not expose ResizeObserver. Exercise the real load handler.
  const frame = panels[2].querySelector('iframe');
  const embedded = document.implementation.createHTMLDocument('Embedded market hours');
  embedded.body.getBoundingClientRect = () => ({ height: 320 });
  Object.defineProperty(frame, 'contentDocument', { configurable: true, value: embedded });
  for (const supported of [false, true]) {
    let observed = false;
    window.ResizeObserver = supported ? class {
      observe(target) { observed = target === embedded.body; }
    } : undefined;
    frame.style.height = '';
    const linkHandlers = [];
    const originalAdd = embedded.addEventListener;
    embedded.addEventListener = function(type, handler, ...args) {
      if (type === 'click') linkHandlers.push(handler);
      return originalAdd.call(this, type, handler, ...args);
    };
    frame.dispatchEvent(new window.Event('load'));
    embedded.addEventListener = originalAdd;
    assert.equal(frame.style.height, '324px', 'initial frame height works with ResizeObserver supported=' + supported);
    assert.equal(observed, supported, 'observe only when available');
    assert.equal(linkHandlers.length, 1, 'same-origin link handling is installed regardless of ResizeObserver');
    const link = embedded.createElement('a');
    link.href = window.location.href + '#module-link-test';
    const child = embedded.createElement('span');
    link.append(child);
    embedded.body.append(link);
    const handle = linkHandlers[0];
    const initialLocation = window.location.href;
    function activate(overrides = {}) {
      let prevented = false;
      handle({
        target: child, button: 0, defaultPrevented: false,
        preventDefault() { prevented = true; }, ...overrides
      });
      return prevented;
    }
    for (const gesture of [
      { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true },
      { button: 1 }, { button: 2 }, { defaultPrevented: true }
    ]) {
      assert.equal(activate(gesture), false, 'Preserve native modified or handled link gestures');
      assert.equal(window.location.href, initialLocation);
    }
    for (const target of ['_blank', '_parent', '_top', 'research-window']) {
      link.target = target;
      assert.equal(activate(), false, 'Preserve explicit link target ' + target);
    }
    link.removeAttribute('target');
    link.setAttribute('download', '');
    assert.equal(activate(), false, 'Preserve download links');
    link.removeAttribute('download');
    link.setAttribute('href', '#local');
    assert.equal(activate(), false, 'Keep anchors inside the embedded document');
    link.href = initialLocation.split('#')[0] + '#module-link-test';
    assert.equal(activate(), true, 'Forward ordinary same-tab link clicks');
    assert.equal(window.location.hash, '#module-link-test');
    window.history.replaceState(null, '', initialLocation);
    link.remove();
    for (const handler of linkHandlers) embedded.removeEventListener('click', handler);
  }

  // A reload must release the old document's observer and forwarding listener.
  // A queued old callback must not resize the replacement document.
  const observers = [];
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.disconnects = 0; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnects++; }
  };
  frame.dispatchEvent(new window.Event('load'));
  const previous = observers[0];
  assert.equal(previous.target, embedded.body);
  assert.equal(embedded.head.querySelectorAll('style').length, 1, 'reload does not accumulate injected styles');
  const staleLink = embedded.createElement('a');
  staleLink.href = window.location.href.split('#')[0] + '#stale-module';
  embedded.body.append(staleLink);
  const replacement = document.implementation.createHTMLDocument('Replacement market hours');
  replacement.body.getBoundingClientRect = () => ({ height: 540 });
  Object.defineProperty(frame, 'contentDocument', { configurable: true, value: replacement });
  frame.dispatchEvent(new window.Event('load'));
  assert.equal(previous.disconnects, 1, 'prior observer is disconnected on document replacement');
  assert.equal(embedded.head.querySelectorAll('style').length, 0, 'prior injected style is removed');
  assert.equal(observers[1].target, replacement.body);
  assert.equal(frame.style.height, '544px');
  previous.callback();
  assert.equal(frame.style.height, '544px', 'a queued stale callback cannot resize the new frame');
  const staleClick = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  staleLink.dispatchEvent(staleClick);
  assert.equal(staleClick.defaultPrevented, false, 'old document no longer forwards links to the parent');
  replacement.body.getBoundingClientRect = () => ({ height: 620 });
  observers[1].callback();
  assert.equal(frame.style.height, '624px', 'replacement observer continues resizing');

  console.log('Calendar tabs: focus, labels, hidden iframes, keyboard controls and deep links passed');
} finally {
  setImmediate(() => window.close());
}
