'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const source = readFileSync(join(__dirname, '../assets/js/newsroom-media.js'), 'utf8');
const story = 'https://example.com/report';
const photo = 'https://example.com/photo.jpg';
const reply = () => ({ok: true, json: async () => ({previews: {[story]: {image: photo}}})});
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(fetch, controller) {
  const timers = new Map(); let id = 0;
  const window = {fetch, ...(controller ? {AbortController: controller} : {})};
  vm.runInNewContext(source, {window, URL, URLSearchParams,
    setTimeout(fn, ms) {timers.set(++id, {fn, ms}); return id;},
    clearTimeout(key) {timers.delete(key);}
  });
  return {lookup: window.FYNXNewsroomMedia.lookupStoryImage, timers,
    fire(ms) {
      const found = [...timers].find(([, timer]) => timer.ms === ms);
      assert.ok(found, 'expected timer ' + ms);
      timers.delete(found[0]); found[1].fn();
    }};
}
test('a hung request without AbortController releases all waiters and can retry', async () => {
  let calls = 0, late;
  const h = setup(() => ++calls === 1 ? new Promise(resolve => {late = resolve;}) : Promise.resolve(reply()));
  const first = h.lookup(story), duplicate = h.lookup(story);
  h.fire(40); assert.equal(calls, 1);
  h.fire(15000);
  assert.equal(await first, null); assert.equal(await duplicate, null);
  const retry = h.lookup(story); h.fire(40);
  assert.equal((await retry).image, photo); assert.equal(calls, 2);
  late({ok: true, json: async () => ({previews: {[story]: {image: 'https://example.com/old.jpg'}}})});
  await tick();
  assert.equal((await h.lookup(story)).image, photo);
  assert.equal(h.timers.size, 0);
});
test('a stalled JSON body is bounded and the controller is aborted', async () => {
  let signal, calls = 0;
  const h = setup((url, options) => {
    signal = options.signal;
    return ++calls === 1 ? Promise.resolve({ok: true, json: () => new Promise(() => {})}) : Promise.resolve(reply());
  }, AbortController);
  const first = h.lookup(story); h.fire(40); await tick();
  assert.equal(signal.aborted, false);
  h.fire(15000); assert.equal(await first, null); assert.equal(signal.aborted, true);
  const retry = h.lookup(story); h.fire(40);
  assert.equal((await retry).image, photo); assert.equal(h.timers.size, 0);
});
test('a synchronous fetch failure releases the batch and successful recovery clears its timer', async () => {
  let calls = 0;
  const h = setup(() => {if (++calls === 1) throw Error('offline'); return Promise.resolve(reply());});
  const first = h.lookup(story); h.fire(40); assert.equal(await first, null);
  assert.equal(h.timers.size, 0);
  const retry = h.lookup(story); h.fire(40); assert.equal((await retry).image, photo);
  assert.equal(h.timers.size, 0);
});

test('provider errors, omitted entries and invalid images are not cached as no-photo results', async () => {
  for (const previews of [{[story]: {error: 'temporary failure'}}, {}, {[story]: {image: 'invalid'}}]) {
    let calls = 0;
    const h = setup(() => Promise.resolve(++calls === 1 ? {ok: true, json: async () => ({previews})} : reply()));
    const first = h.lookup(story); h.fire(40);
    assert.equal(await first, null);
    const retry = h.lookup(story); h.fire(40);
    assert.equal((await retry).image, photo);
    assert.equal(calls, 2);
  }
});
test('a confirmed no-photo response is cached while a failed sibling remains retryable', async () => {
  const other = 'https://example.com/other';
  let calls = 0;
  const h = setup(() => Promise.resolve(++calls === 1
    ? {ok: true, json: async () => ({previews: {[story]: {image: null}, [other]: {error: 'temporary'}}})}
    : {ok: true, json: async () => ({previews: {[other]: {image: photo}}})}));
  const first = h.lookup(story), second = h.lookup(other); h.fire(40);
  assert.equal((await first).image, null);
  assert.equal(await second, null);
  assert.equal((await h.lookup(story)).image, null);
  assert.equal(calls, 1);
  const retry = h.lookup(other); h.fire(40);
  assert.equal((await retry).image, photo);
  assert.equal(calls, 2);
});
test('section lookup works without Object.hasOwn on older Safari', () => {
  const window = {};
  vm.runInNewContext('Object.hasOwn = undefined;\n' + source, {window});
  assert.ok(window.FYNXNewsroomMedia.get('markets'));
  assert.equal(window.FYNXNewsroomMedia.get('toString'), null);
});
