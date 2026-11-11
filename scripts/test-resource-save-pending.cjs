const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.resolve(__dirname, '../assets/js/discovery.js'), 'utf8');
const key = 'fynx.saved-resources.v1';
const resource = '/tools/position-size.html';
const secondResource = '/tools/debt-payoff.html';

function setup({ secondURL=resource } = {}) {
  const html = `<!doctype html><html><head><link rel="canonical" href="https://www.fynxfinanceworld.com${resource}"></head>
    <body><button id="one" data-save-resource>Save resource</button>
    <button id="two" data-save-resource="${secondURL}">Save resource</button></body></html>`;
  const dom = new JSDOM(html, {
    url: 'https://www.fynxfinanceworld.com/explore.html',
    runScripts: 'outside-only'
  });
  const requests = [];
  dom.window.fetch = url => new Promise(resolve => requests.push({ url, resolve }));
  dom.window.eval(source);
  const one = dom.window.document.getElementById('one');
  const two = dom.window.document.getElementById('two');
  return { dom, requests, one, two };
}

const flush = async () => {
  for (let i=0; i<5; i++) await new Promise(resolve => setImmediate(resolve));
};

test('quick taps during index lookup toggle a resource only once and restore buttons', async () => {
  const { dom, requests, one, two } = setup();
  one.click();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/assets/resource-index.json');
  assert.equal(one.disabled, true);
  assert.equal(two.disabled, true);
  assert.equal(one.getAttribute('aria-busy'), 'true');
  two.click();
  requests[0].resolve({ ok: true, json: async () => [{ url: resource }] });
  await flush();
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(key)), [resource]);
  assert.equal(one.disabled, false);
  assert.equal(two.disabled, false);
  assert.equal(one.hasAttribute('aria-busy'), false);
  assert.equal(one.getAttribute('aria-pressed'), 'true');
  one.click();
  await flush();
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(key)), []);
  dom.window.close();
});

test('failed index request unlocks buttons and allows a successful retry', async () => {
  const { dom, requests, one } = setup();
  one.click();
  requests[0].resolve({ ok: false });
  await flush();
  assert.equal(one.disabled, false);
  assert.equal(one.hasAttribute('aria-busy'), false);
  assert.equal(dom.window.localStorage.getItem(key), null);
  assert.match(dom.window.document.querySelector('.discovery-toast').textContent, /cannot be saved/i);
  one.click();
  assert.equal(requests.length, 2, 'failed index fetch must not be cached forever');
  requests[1].resolve({ ok: true, json: async () => [{ url: resource }] });
  await flush();
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(key)), [resource]);
  dom.window.close();
});

test('distinct resources remain independently actionable during a pending save', async () => {
  const { dom, requests, one, two } = setup({ secondURL: secondResource });
  one.click();
  assert.equal(one.disabled, true);
  assert.equal(two.disabled, false);
  two.click();
  assert.equal(requests.length, 1, 'same index request should be shared');
  requests[0].resolve({ ok: true, json: async () => [{ url: resource }, { url: secondResource }] });
  await flush();
  assert.deepEqual(new Set(JSON.parse(dom.window.localStorage.getItem(key))), new Set([resource, secondResource]));
  assert.equal(one.disabled, false);
  assert.equal(two.disabled, false);
  dom.window.close();
});
