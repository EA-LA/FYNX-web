'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/newsroom-editions.js'), 'utf8');
const KEY = 'fynx_news_edition_v1';

function browser({ url = 'https://www.fynxfinanceworld.com/news.html', saved = 'uk' } = {}) {
  const data = new Map();
  if (saved !== null) data.set(KEY, saved);
  const events = [], handlers = new Map(), selects = [{ value: null }], labels = [{ textContent: '' }];
  const localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    clear: () => data.clear()
  };
  const location = { href: url };
  const window = {
    location, localStorage, history: {
      state: {}, replaceState: (_state, _unused, next) => { location.href = String(next); }
    },
    addEventListener: (name, fn) => handlers.set(name, fn)
  };
  const document = {
    readyState: 'complete', documentElement: { dataset: {} },
    querySelectorAll: selector => selector === '[data-edition-select]' ? selects : selector === '[data-edition-label]' ? labels : [],
    addEventListener: (name, fn) => handlers.set('document:' + name, fn),
    dispatchEvent: event => { events.push({type:event.type,...event.detail}); return true; }
  };
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  vm.runInNewContext(source, { window, document, CustomEvent, URL }, { filename:'newsroom-editions.js' });
  return { window, selects, labels, events, localStorage,
    storage: (key, newValue) => handlers.get('storage')({ key, newValue }),
    get: () => window.FynxEdition.get() };
}

test('clearing all local storage from another tab restores the default edition without saving', () => {
  const b = browser();
  assert.equal(b.get(), 'uk');
  b.localStorage.clear();
  b.storage(null, null);
  assert.equal(b.get(), 'us');
  assert.equal(b.selects[0].value, 'us');
  assert.equal(b.labels[0].textContent, 'US edition');
  assert.equal(b.localStorage.getItem(KEY), null);
  assert.deepEqual(b.events.map(x => x.type), ['fynx:edition-change']);
});

test('removing only the edition preference in another tab restores the default', () => {
  const b = browser();
  b.localStorage.removeItem(KEY);
  b.storage(KEY, null);
  assert.equal(b.get(), 'us');
  assert.equal(b.localStorage.getItem(KEY), null);
});

test('clearing stored preferences preserves an explicit edition permalink', () => {
  const b = browser({ url:'https://www.fynxfinanceworld.com/news.html?edition=global', saved:'uk' });
  assert.equal(b.get(), 'global');
  b.localStorage.clear();
  b.storage(null, null);
  assert.equal(b.get(), 'global');
  assert.equal(b.window.location.href, 'https://www.fynxfinanceworld.com/news.html?edition=global');
  assert.equal(b.localStorage.getItem(KEY), null);
});

test('valid cross-tab updates synchronize and unrelated storage changes do not', () => {
  const b = browser();
  b.storage(KEY, 'asia');
  assert.equal(b.get(), 'asia');
  b.events.length = 0;
  b.storage('theme', null);
  assert.equal(b.get(), 'asia');
  assert.equal(b.events.length, 0);
});

test('invalid cross-tab edition does not corrupt current selection', () => {
  const b = browser();
  b.storage(KEY, 'not-an-edition');
  assert.equal(b.get(), 'uk');
});

test('clearing storage preserves the current permalink after an explicit edition change', () => {
  const b = browser({ url:'https://www.fynxfinanceworld.com/news.html?edition=global&topic=markets#latest' });
  b.window.FynxEdition.set('asia');
  b.events.length = 0;
  b.localStorage.clear();
  b.storage(null, null);
  assert.equal(b.get(), 'asia');
  assert.equal(b.selects[0].value, 'asia');
  assert.equal(b.labels[0].textContent, 'Asia edition');
  assert.equal(b.window.location.href, 'https://www.fynxfinanceworld.com/news.html?edition=asia&topic=markets#latest');
  assert.equal(b.localStorage.getItem(KEY), null);
  assert.equal(b.events.length, 0);
});

test('removing a stored preference preserves the updated permalink after a cross-tab change', () => {
  const b = browser({ url:'https://www.fynxfinanceworld.com/news.html?edition=global' });
  b.storage(KEY, 'canada');
  b.events.length = 0;
  b.localStorage.removeItem(KEY);
  b.storage(KEY, null);
  assert.equal(b.get(), 'canada');
  assert.equal(b.window.location.href, 'https://www.fynxfinanceworld.com/news.html?edition=canada');
  assert.equal(b.localStorage.getItem(KEY), null);
  assert.equal(b.events.length, 0);
});
