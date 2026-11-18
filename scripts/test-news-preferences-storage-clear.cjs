'use strict';
// No jsdom or external dependencies: run the actual browser preferences module
// inside a minimal simulated window and dispatch real-shape storage events.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/news-preferences.js'), 'utf8');
const KEY = 'fynx_your_news_v1';
const id = 'a'.repeat(64);
const article = () => ({
  id, title: 'Example policy decision', source: 'Example wire',
  publishedAt: new Date(Date.now() - 60000).toISOString(),
  readerUrl: '/news/article.html?' + new URLSearchParams({id, edition: 'us', category: 'macro'})
});
function browser() {
  const data = new Map(), handlers = new Map(), events = [];
  const localStorage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    clear: () => data.clear()
  };
  const window = {
    location: {origin: 'https://www.fynxfinanceworld.com'}, localStorage,
    addEventListener: (name, fn) => handlers.set(name, fn)
  };
  const document = {dispatchEvent: event => {events.push(event.type); return true;}};
  class CustomEvent {constructor(type) {this.type = type;}}
  vm.runInNewContext(source, {window, document, CustomEvent, URL, URLSearchParams, Date}, {filename:'news-preferences.js'});
  return {
    api: window.FYNXYourNews, localStorage, events,
    storage: (key, newValue) => handlers.get('storage')({key, newValue})
  };
}

test('clearing origin storage in another tab removes private reading history and resets topics immediately', () => {
  const b = browser();
  b.api.setTopics(['crypto']);
  assert.equal(b.api.markOpened(article()), true);
  assert.equal(b.api.getHistory().length, 1);
  b.events.length = 0;
  b.localStorage.clear();
  // Browsers dispatch {key:null} for Storage.clear() in a *different* tab.
  b.storage(null, null);
  assert.deepEqual(Array.from(b.api.getTopics()), ['stocks', 'economics', 'technology']);
  assert.equal(b.api.getHistory().length, 0);
  assert.equal(b.api.isRead(id), false);
  assert.deepEqual(b.events, ['fynx:news-preferences-change', 'fynx:news-history-change']);
  assert.equal(b.localStorage.getItem(KEY), null, 'must not recreate cleared storage');
});

test('a targeted cross-tab removal still clears history without recreating saved data', () => {
  const b = browser();
  b.api.markOpened(article());
  b.api.setTopics(['world']);
  b.localStorage.removeItem(KEY);
  b.storage(KEY, null);
  assert.equal(b.api.getHistory().length, 0);
  assert.deepEqual(Array.from(b.api.getTopics()), ['stocks', 'economics', 'technology']);
  assert.equal(b.localStorage.getItem(KEY), null);
});

test('unrelated storage changes do not erase topics or history', () => {
  const b = browser();
  b.api.setTopics(['energy']);b.api.markOpened(article());
  b.events.length = 0;
  b.storage('fynx_theme', null);
  assert.deepEqual(Array.from(b.api.getTopics()), ['energy']);
  assert.equal(b.api.getHistory().length, 1);
  assert.deepEqual(b.events, []);
});

test('cross-tab preferences updates synchronize choices and history', () => {
  const b = browser();
  b.api.markOpened(article());
  b.storage(KEY, JSON.stringify({version:1,topics:['finance','stocks'],history:[]}));
  assert.deepEqual(Array.from(b.api.getTopics()), ['finance','stocks']);
  assert.equal(b.api.getHistory().length, 0);
});

test('invalid cross-tab payload cannot replace current private state', () => {
  const b = browser();
  b.api.markOpened(article());b.api.setTopics(['economics']);
  b.events.length = 0;
  b.storage(KEY, '{"version":999}');
  b.storage(KEY, 'not json');
  assert.equal(b.api.getHistory().length, 1);
  assert.deepEqual(Array.from(b.api.getTopics()), ['economics']);
  assert.deepEqual(b.events, []);
});
