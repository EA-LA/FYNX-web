'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
const script = new vm.Script(match[1], { filename: 'news.html inline tabs controller' });

class Tokens {
  constructor(values = []) { this.values = new Set(values); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    if (force === undefined ? !this.values.has(name) : force) this.values.add(name);
    else this.values.delete(name);
  }
}

const document = {
  documentElement: { dataset: { theme: 'dark' } },
  body: { classList: new Tokens() },
  activeElement: null,
  querySelectorAll(selector) {
    if (selector === '[data-news-tab]') return tabs;
    if (selector === '[data-news-panel]') return panels;
    throw Error('Unexpected selector ' + selector);
  }
};

function element(dataset, active) {
  const listeners = {};
  const attributes = new Map();
  return {
    dataset,
    classList: new Tokens(active ? ['active'] : []),
    hidden: !active,
    tabIndex: active ? 0 : -1,
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name); },
    addEventListener(type, handler) { listeners[type] = handler; },
    focus() { document.activeElement = this; },
    dispatch(type, key) {
      let prevented = false;
      listeners[type]({ key, preventDefault() { prevented = true; } });
      return prevented;
    }
  };
}
const tabs = ids.map((id) => element({ newsTab: id }, id === 'feed'));
const panels = ids.map((id) => element({ newsPanel: id }, id === 'feed'));

script.runInNewContext({ document });

function expectActive(id) {
  const index = ids.indexOf(id);
  assert.ok(index !== -1);
  tabs.forEach((tab, i) => {
    assert.equal(tab.getAttribute('aria-selected'), i === index ? 'true' : 'false');
    assert.equal(tab.tabIndex, i === index ? 0 : -1);
    assert.equal(panels[i].hidden, i !== index);
    assert.equal(panels[i].getAttribute('aria-hidden'), i === index ? 'false' : 'true');
  });
}

expectActive('feed');
assert.equal(tabs[0].dispatch('keydown', 'ArrowRight'), true);
expectActive('macro');
assert.equal(document.activeElement, tabs[1]);
assert.equal(tabs[1].dispatch('keydown', 'End'), true);
expectActive('positioning');
assert.equal(tabs[4].dispatch('keydown', 'ArrowRight'), true);
expectActive('feed');
assert.equal(tabs[0].dispatch('keydown', 'ArrowLeft'), true);
expectActive('positioning');
assert.equal(tabs[4].dispatch('keydown', 'Home'), true);
expectActive('feed');
assert.equal(tabs[0].dispatch('keydown', 'Tab'), false, 'Tab must retain native browser behavior');
tabs[3].dispatch('click');
expectActive('analysis');
assert.equal(document.body.classList.contains('dark-mode'), true);
console.log('News tabs: semantic associations, keyboard navigation, focus, and panel visibility passed');
