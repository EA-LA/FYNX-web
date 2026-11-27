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

test('a stalled resource index times out, unlocks Save, and supports a new request', async () => {
  const { dom, requests, one } = setup();
  const realSetTimeout = dom.window.setTimeout.bind(dom.window);
  let triggerTimeout;
  // Advance just the 8-second index deadline without sleeping or changing other UI timers.
  dom.window.setTimeout = (callback, delay, ...args) => {
    if (delay === 8000) {
      triggerTimeout = callback;
      return 999999;
    }
    return realSetTimeout(callback, delay, ...args);
  };
  one.click();
  assert.equal(requests.length, 1);
  assert.equal(typeof triggerTimeout, 'function');
  assert.equal(one.disabled, true);
  triggerTimeout();
  await flush();
  assert.equal(one.disabled, false);
  assert.equal(one.hasAttribute('aria-busy'), false);
  assert.equal(dom.window.localStorage.getItem(key), null);
  assert.match(dom.window.document.querySelector('.discovery-toast').textContent, /cannot be saved/i);
  one.click();
  assert.equal(requests.length, 2, 'timed-out index request must be retryable');
  requests[1].resolve({ ok: true, json: async () => [{ url: resource }] });
  await flush();
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(key)), [resource]);
  assert.equal(one.disabled, false);
  dom.window.close();
});

test('HTTP 200 with an empty index remains retryable instead of caching a false empty library', async () => {
  const { dom, requests, one } = setup();
  one.click();
  requests[0].resolve({ ok: true, json: async () => [] });
  await flush();
  assert.equal(one.disabled, false);
  assert.match(dom.window.document.querySelector('.discovery-toast').textContent, /cannot be saved/i);
  one.click();
  assert.equal(requests.length, 2, 'empty index should be fetched again after recovery');
  requests[1].resolve({ ok: true, json: async () => [{ url: resource }] });
  await flush();
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(key)), [resource]);
  dom.window.close();
});

test('malformed index rows fail safely without freezing Save and can recover', async () => {
  const { dom, requests, one } = setup();
  one.click();
  requests[0].resolve({ ok: true, json: async () => [{ url: resource }, null] });
  await flush();
  assert.equal(one.disabled, false);
  assert.equal(one.hasAttribute('aria-busy'), false);
  assert.equal(dom.window.localStorage.getItem(key), null);
  one.click();
  assert.equal(requests.length, 2, 'malformed index should be retryable');
  requests[1].resolve({ ok: true, json: async () => [{ url: resource }] });
  await flush();
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(key)), [resource]);
  dom.window.close();
});

test('index entries with unsafe off-site paths fail closed and can recover', async () => {
  const { dom, requests, one } = setup();
  one.click();
  requests[0].resolve({ ok: true, json: async () => [{ url: 'https://example.com/' }] });
  await flush();
  assert.equal(one.disabled, false);
  assert.equal(dom.window.localStorage.getItem(key), null);
  one.click();
  assert.equal(requests.length, 2);
  requests[1].resolve({ ok: true, json: async () => [{ url: resource }] });
  await flush();
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(key)), [resource]);
  dom.window.close();
});

function setupWorkspace({ stored = true, savedPaths = [resource], recentPaths = [secondResource] } = {}) {
  const dom = new JSDOM('<main><div data-workspace-saved></div><div data-workspace-recent></div></main>', {
    url: 'https://www.fynxfinanceworld.com/home.html', runScripts: 'outside-only'
  });
  if (stored) {
    dom.window.localStorage.setItem(key, JSON.stringify(savedPaths));
    dom.window.localStorage.setItem('fynx.recent-resources.v1', JSON.stringify(recentPaths));
  }
  const requests = [];
  dom.window.fetch = url => new Promise(resolve => requests.push({url, resolve}));
  dom.window.eval(source);
  return {dom, requests, saved: dom.window.document.querySelector('[data-workspace-saved]'),
    recent: dom.window.document.querySelector('[data-workspace-recent]')};
}

test('home resource index failure preserves saved paths and retry restores both lists', async () => {
  const {dom, requests, saved, recent} = setupWorkspace();
  try {
    requests[0].resolve({ok: false});
    await flush();
    assert.match(saved.textContent, /could not be loaded/);
    assert.match(recent.textContent, /could not be loaded/);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(key)), [resource]);
    const retry = saved.querySelector('button');
    retry.focus();
    retry.click();
    retry.click();
    assert.equal(requests.length, 2);
    assert.equal(retry.getAttribute('aria-disabled'), 'true');
    requests[1].resolve({ok: true, json: async () => [
      {url: resource, title: 'Position size'}, {url: secondResource, title: 'Debt payoff'}
    ]});
    await flush();
    assert.equal(saved.querySelector('a').getAttribute('href'), resource);
    assert.equal(recent.querySelector('a').getAttribute('href'), secondResource);
    assert.equal(dom.window.document.activeElement, saved.querySelector('a'));
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(key)), [resource]);
  } finally { dom.window.close(); }
});

test('home resource retry can fail again without losing stored entries or focus', async () => {
  const {dom, requests, saved} = setupWorkspace();
  try {
    requests[0].resolve({ok: false});
    await flush();
    const retry = saved.querySelector('button');
    retry.focus();
    retry.click();
    requests[1].resolve({ok: false});
    await flush();
    assert.equal(dom.window.document.activeElement, saved.querySelector('button'));
    assert.notEqual(saved.querySelector('button'), retry);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(key)), [resource]);
    saved.querySelector('button').click();
    assert.equal(requests.length, 3);
    requests[2].resolve({ok: true, json: async () => [{url: resource, title: 'Position size'}]});
    await flush();
    assert.equal(saved.querySelector('a').getAttribute('href'), resource);
  } finally { dom.window.close(); }
});

test('home with no stored resource paths retains truthful empty states on index failure', async () => {
  const {dom, requests, saved, recent} = setupWorkspace({stored: false});
  try {
    requests[0].resolve({ok: false});
    await flush();
    assert.match(saved.textContent, /Save tools and lessons/);
    assert.match(recent.textContent, /recently opened resources will appear/);
    assert.equal(saved.querySelector('button'), null);
    assert.equal(recent.querySelector('button'), null);
  } finally { dom.window.close(); }
});

const story = '/intelligence/current-saved-story/';
const retiredStory = '/intelligence/retired-saved-story/';
const storyRows = [
  {url: story + 'index.html', title: 'Current article'},
  {url: retiredStory + 'index.html', title: 'Retired article'},
  {url: resource, title: 'Position size'}
];
const sitemapResponse = (paths, includeHub=true) => ({ok: true, text: async () => '<urlset>'
  + [...(includeHub?['/intelligence/']:[]),...paths].map(href=>'<url><loc>'+(href.startsWith('/')?'https://www.fynxfinanceworld.com':'')+href+'</loc></url>').join('')
  + '</urlset>'});
const currentSitemap = () => sitemapResponse([story, 'https://other.example' + retiredStory]);
const hrefs = node => [...node.querySelectorAll('a')].map(a=>a.getAttribute('href'));

test('home suppresses retired saved links, canonicalizes current aliases and leaves stored IDs untouched', async () => {
  const savedPaths = [retiredStory + 'index.html', story + 'index.html', story, resource];
  const {dom, requests, saved, recent} = setupWorkspace({savedPaths, recentPaths: []});
  try {
    requests[0].resolve({ok: true, json: async () => storyRows});
    await flush();
    assert.deepEqual(requests.map(r=>r.url), ['/assets/resource-index.json','/intelligence/sitemap.xml']);
    requests[1].resolve(currentSitemap());
    await flush();
    assert.deepEqual(hrefs(saved), [story, resource, '/intelligence/']);
    assert.match(saved.textContent, /no longer listed/);
    assert.doesNotMatch(saved.textContent, /Retired article/);
    assert.equal(saved.querySelector('button'), null);
    assert.match(recent.textContent, /recently opened resources will appear/);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(key)), savedPaths);
  } finally { dom.window.close(); }
});

test('home can recheck a failed or malformed story inventory without hiding stored tools or changing IDs', async () => {
  const savedPaths = [story + 'index.html', resource];
  const {dom, requests, saved} = setupWorkspace({savedPaths, recentPaths: []});
  try {
    requests[0].resolve({ok: true, json: async () => storyRows});
    await flush();
    requests[1].resolve(sitemapResponse([story],false));
    await flush();
    assert.deepEqual(hrefs(saved), [resource, '/intelligence/']);
    assert.match(saved.textContent, /could not be verified/);
    const retry = saved.querySelector('button');
    retry.focus();
    retry.click();
    retry.click();
    await flush();
    assert.equal(requests.length, 3);
    assert.equal(retry.getAttribute('aria-disabled'), 'true');
    requests[2].resolve(currentSitemap());
    await flush();
    assert.deepEqual(hrefs(saved), [story, resource]);
    assert.equal(dom.window.document.activeElement, saved.querySelector('a'));
    assert.equal(saved.querySelector('button'), null);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(key)), savedPaths);
  } finally { dom.window.close(); }
});
