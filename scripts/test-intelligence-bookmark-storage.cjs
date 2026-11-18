'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/intelligence.js'), 'utf8');
const start = source.indexOf('  const localSaved = () => {');
const end = source.indexOf('  const saved = () =>', start);
assert.ok(start !== -1 && end > start, 'test the actual Intelligence browser bookmark loader');
const implementation = source.slice(start, end);
const origin = 'https://www.fynxfinanceworld.com';
const good = {id: 'a'.repeat(12), url: '/intelligence/market-rally-123abc/', title: 'Verified market coverage'};

function load(savedJSON, {throws = false} = {}) {
  const context = {
    KEY: 'fynx_intel_saved_v1', URL, location: {origin},
    localStorage: {getItem() {if (throws) throw new Error('storage denied');return savedJSON;}}
  };
  return JSON.parse(JSON.stringify(vm.runInNewContext(implementation + '\nlocalSaved()', context)));
}

test('preserves valid existing Intelligence bookmarks', () => {
  assert.deepEqual(load(JSON.stringify([good])), [good]);
});

test('malformed JSON, null, objects and blocked storage return an empty list', () => {
  for (const value of ['{', 'null', '{}', '"hello"', '17', undefined]) {
    assert.deepEqual(load(value), []);
  }
  assert.deepEqual(load(null, {throws: true}), []);
});

test('ignores corrupt, off-site and misleading browser records without losing valid stories', () => {
  const rows = [null, 42, {}, {id: 'not-hex', url: good.url},
    {id: 'b'.repeat(12), url: 'https://evil.example/intelligence/story/'},
    {id: 'c'.repeat(12), url: '//evil.example/intelligence/story/'},
    {id: 'd'.repeat(12), url: '/intelligence/story/?redirect=https://evil.example'},
    {id: 'e'.repeat(12), url: '/intelligence/story/#redirect'},
    {id: 'f'.repeat(12), url: '/news/article.html'},
    good];
  assert.deepEqual(load(JSON.stringify(rows)), [good]);
});

test('normalizes same-origin absolute story URLs for hub filtering and import', () => {
  const row = {...good, url: origin + good.url};
  assert.deepEqual(load(JSON.stringify([row])), [good]);
});

test('deduplicates IDs and honors the existing 200-story browser limit', () => {
  const duplicate = {...good, title: 'Conflicting duplicate'};
  const rows = [good, duplicate, ...Array.from({length: 220}, (_, i) => ({
    id: i.toString(16).padStart(12, '0'), url: '/intelligence/story-' + i + '/', title: 'Story ' + i
  }))];
  const loaded = load(JSON.stringify(rows));
  assert.equal(loaded.length, 200);
  assert.equal(loaded[0].title, good.title);
  assert.equal(loaded.filter(row => row.id === good.id).length, 1);
});
