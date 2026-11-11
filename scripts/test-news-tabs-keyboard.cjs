'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'news.html'), 'utf8');
const ids = ['feed', 'macro', 'markets', 'analysis', 'positioning'];

for (const id of ids) {
  assert.match(html, new RegExp('<button[^>]+role="tab"[^>]+id="news-tab-' + id + '"[^>]+aria-controls="news-panel-' + id + '"[^>]+data-news-tab="' + id + '"'));
  assert.match(html, new RegExp('<div[^>]+id="news-panel-' + id + '"[^>]+role="tabpanel"[^>]+aria-labelledby="news-tab-' + id + '"[^>]+data-news-panel="' + id + '"'));
}
for (const id of ids.slice(1)) {
  assert.match(html, new RegExp('<div[^>]+data-news-panel="' + id + '"[^>]+hidden>'));
}

const match = html.match(/<script>\s*(const isLightTheme[\s\S]*?)<\/script>/);
assert.ok(match, 'News tab controller should be present');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(html, { url: 'https://www.fynxfinanceworld.com/news.html', runScripts: 'outside-only' });
const { window } = dom;
const { document } = window;
const tabs = ids.map(id => document.getElementById('news-tab-' + id));
const panels = ids.map(id => document.getElementById('news-panel-' + id));

// Match the browser: the inline controller runs before the deferred shared loader.
// Both must run so bubbling keyboard events catch duplicate navigation handlers.
document.documentElement.dataset.theme = 'dark';
window.eval(match[1]);
window.eval(fs.readFileSync(path.join(__dirname, '..', 'assets/js/module-loader.js'), 'utf8'));

function expectActive(id) {
  const index = ids.indexOf(id);
  tabs.forEach((tab, i) => {
    assert.equal(tab.getAttribute('aria-selected'), i === index ? 'true' : 'false');
    assert.equal(tab.tabIndex, i === index ? 0 : -1);
    assert.equal(panels[i].hidden, i !== index);
    assert.equal(panels[i].getAttribute('aria-hidden'), i === index ? 'false' : 'true');
  });
}

try {
  expectActive('feed');
  tabs[0].focus();
  for (const [key, expected] of [['ArrowRight', 'macro'], ['End', 'positioning'], ['ArrowRight', 'feed'], ['ArrowLeft', 'positioning'], ['Home', 'feed']]) {
    const previousHistoryLength = window.history.length;
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(document.activeElement.dataset.newsTab, expected, key + ' must move exactly once');
    expectActive(expected);
    assert.equal(new URL(window.location.href).searchParams.get('section'), expected, 'Keyboard navigation must update the shareable route');
    assert.equal(window.history.length, previousHistoryLength + 1, 'Each navigation should create exactly one history entry');
  }
  const tab = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.activeElement.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false, 'Tab must retain native browser behavior');
  tabs[3].click();
  expectActive('analysis');
  assert.equal(new URL(window.location.href).searchParams.get('section'), 'analysis');
  window.history.replaceState(null, '', '?section=macro&tool=%2Ftools%2Feconomic-indicators-heatmap.html');
  window.dispatchEvent(new window.PopStateEvent('popstate'));
  expectActive('macro');
  assert.equal(document.body.classList.contains('dark-mode'), true);
  console.log('News tabs: integrated keyboard navigation, route history, focus, and panel visibility passed');
} finally {
  // Drain queued DOM mutations before disposing the browser-like document.
  setImmediate(() => window.close());
}
