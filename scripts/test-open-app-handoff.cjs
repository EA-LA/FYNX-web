'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'open-app.html'), 'utf8');
const handoff = html.match(/<script>\s*(const APP_STORE_URL[\s\S]*?)<\/script>/);
assert.ok(handoff, 'Expected to find the native app handoff script');
const appStoreURL = 'https://apps.apple.com/app/id6752357210';

function startPage(href = 'https://www.fynxfinanceworld.com/open-app.html') {
  const history = [];
  const listeners = { document: {}, window: {} };
  const timers = new Map();
  let nextTimer = 1;
  let currentHref = href;

  const location = {
    get href() { return currentHref; },
    set href(value) {
      currentHref = value;
      history.push(value);
    },
  };
  const window = {
    location,
    addEventListener(name, handler) { listeners.window[name] = handler; },
  };
  const document = {
    visibilityState: 'visible',
    addEventListener(name, handler) { listeners.document[name] = handler; },
  };

  const context = {
    window,
    document,
    URL,
    setTimeout(fn, milliseconds) {
      assert.equal(milliseconds, 1200, 'Preserve existing fallback delay');
      const id = nextTimer++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  runInNewContext(handoff[1], context, { timeout: 1000 });
  return {
    history, document, timers,
    hide() {
      document.visibilityState = 'hidden';
      listeners.document.visibilitychange?.();
    },
    pagehide() { listeners.window.pagehide?.(); },
    fireTimers() {
      for (const [id, fn] of [...timers]) {
        timers.delete(id);
        fn();
      }
    },
  };
}

test('without a native app opening, Safari receives the App Store fallback', () => {
  const page = startPage();
  assert.equal(page.history[0], 'fynx://auth/web-login?returnTo=');
  page.fireTimers();
  assert.equal(page.history[1], appStoreURL);
});

test('backgrounding Safari cancels fallback before it can reopen the App Store', () => {
  const page = startPage();
  page.hide();
  page.fireTimers();
  assert.deepEqual(page.history, ['fynx://auth/web-login?returnTo=']);
  assert.equal(page.timers.size, 0);
});

test('navigating away with pagehide cancels a pending fallback', () => {
  const page = startPage();
  page.pagehide();
  page.fireTimers();
  assert.equal(page.history.length, 1);
  assert.equal(page.timers.size, 0);
});

test('a hidden page never sends a fallback even if its visibility event was missed', () => {
  const page = startPage();
  page.document.visibilityState = 'hidden';
  page.fireTimers();
  assert.equal(page.history.length, 1);
});

test('handoff continues to pass the original encoded returnTo argument', () => {
  const target = '/tools/atr-stop.html?symbol=EURUSD&tab=plan';
  const page = startPage('https://www.fynxfinanceworld.com/open-app.html?returnTo=' + encodeURIComponent(target));
  assert.equal(page.history[0], 'fynx://auth/web-login?returnTo=' + encodeURIComponent(target));
});

test('manual App Store recovery and accessibility remain available', () => {
  assert.match(html, /<a href="https:\/\/apps\.apple\.com\/app\/id6752357210">open it in the App Store<\/a>/);
  assert.match(html, /<div class="card" role="status" aria-live="polite">/);
  assert.match(html, /<span class="spinner" aria-hidden="true"><\/span>/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
});
