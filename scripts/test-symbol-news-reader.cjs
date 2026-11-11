/* Symbol-news browsing tests. Publisher names and reports below are test fixtures. */
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../tools/symbol-news.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('const QUICK_PRESETS'));
const initialTime = Date.parse('2026-11-02T18:00:00Z');
const tick = () => new Promise(resolve => setImmediate(resolve));
const item = (extra = {}) => ({articleId: 'a'.repeat(64), title: 'Fixture company publishes results',
  source: 'Fixture Publisher', link: 'https://publisher.example/news/results',
  pubDate: new Date(initialTime - 3600000).toISOString(), ...extra});
function harness(t, {query = 'TSLA', helper = true, hostname = 'www.fynxfinanceworld.com'} = {}) {
  const dom = new JSDOM(html, {url: `https://${hostname}/tools/symbol-news.html?q=${query}`,
    runScripts: 'outside-only', virtualConsole: new VirtualConsole()});
  t.after(() => dom.window.close());
  const w = dom.window, calls = [], intervals = [], remembered = [], prefetched = [];
  let now = initialTime, hidden = false;
  w.Date.now = () => now;
  w.setInterval = (fn, ms) => { intervals.push({fn, ms}); return intervals.length; };
  w.setTimeout = () => 1; w.clearTimeout = () => {};
  Object.defineProperty(w.document, 'hidden', {get: () => hidden, configurable: true});
  if (helper) w.FYNXNewsReaderData = {
    href: row => '/news/article.html?' + new URLSearchParams({id: row.articleId, edition: row.edition, category: row.category, symbol: row.symbol}),
    remember: rows => remembered.push(rows), prefetch: rows => prefetched.push(rows)
  };
  w.fetch = (url, options) => new Promise((resolve, reject) => {
    calls.push({url, options, reject, resolve: (rows = [item()], extra = {}) => resolve({ok: true,
      json: async () => ({kind: 'symbol', query: new URL(url, w.location.origin).searchParams.get('q'),
        fetchedAt: new Date(now).toISOString(), items: rows, ...extra})})});
  });
  w.eval(script);
  return {w, calls, intervals, remembered, prefetched, q: selector => w.document.querySelector(selector),
    cards: () => [...w.document.querySelectorAll('#list .newsCard')],
    setNow: value => {now = value;}, setHidden: value => {hidden = value;},
    search: value => {w.document.getElementById('query').value = value; w.document.getElementById('searchBtn').click();}};
}

test('symbol results use the reader endpoint, current publication dates and internal destinations', async t => {
  const h = harness(t);
  assert.equal(new URL(h.calls[0].url).pathname, '/webMarketFeed');
  assert.equal(new URL(h.calls[0].url).searchParams.get('kind'), 'symbol');
  h.calls[0].resolve([item(), item(), item({articleId:'b'.repeat(64), pubDate: new Date(initialTime - 25*3600000).toISOString()}),
    item({articleId:'c'.repeat(64), pubDate: 'not a date'}), item({articleId:'d'.repeat(64), pubDate: new Date(initialTime + 3600000).toISOString()}),
    item({articleId:'e'.repeat(64), link:'javascript:alert(1)'}), item({articleId:'invalid'})]);
  await tick();
  assert.equal(h.cards().length, 1);
  const card = h.cards()[0], destination = new URL(card.href);
  assert.equal(destination.origin, h.w.location.origin);
  assert.equal(destination.pathname, '/news/article.html');
  assert.equal(destination.searchParams.get('id'), item().articleId);
  assert.equal(destination.searchParams.get('symbol'), 'TSLA');
  assert.equal(card.target, '');
  assert.match(card.textContent, /Fixture Publisher/);
  assert.match(card.textContent, /Read FYNX brief/);
  assert.match(h.q('#statusRight').textContent, /Published within 24 hours.*every 5 minutes/);
  assert.equal(h.remembered[0].length, 1); assert.equal(h.prefetched[0].length, 1);
});

test('refresh waits five minutes, pauses while hidden and catches up on return', async t => {
  const h = harness(t); h.calls[0].resolve(); await tick();
  assert.equal(h.intervals[0].ms, 60000);
  h.setNow(initialTime + 240000); h.intervals[0].fn(); assert.equal(h.calls.length, 1);
  h.setNow(initialTime + 300000); h.intervals[0].fn(); assert.equal(h.calls.length, 2);
  h.intervals[0].fn(); assert.equal(h.calls.length, 2, 'overlapping automatic requests must not start');
  h.calls[1].resolve(); await tick(); h.setHidden(true);
  h.setNow(initialTime + 900000); h.intervals[0].fn(); assert.equal(h.calls.length, 2);
  h.setHidden(false); h.w.document.dispatchEvent(new h.w.Event('visibilitychange'));
  assert.equal(h.calls.length, 3); h.calls[2].resolve(); await tick();
});

test('changing instruments removes old results and stale requests cannot overwrite the new search', async t => {
  const h = harness(t); h.calls[0].resolve(); await tick();
  h.search('NVDA'); assert.equal(h.cards().length, 0);
  const nvidiaRequest = h.calls[1]; h.search('AAPL');
  assert.equal(nvidiaRequest.options.signal.aborted, true);
  h.calls[2].resolve([item({articleId:'b'.repeat(64), title:'Fixture Apple report'})]); await tick();
  nvidiaRequest.resolve([item({title:'Fixture Nvidia report'})]); await tick();
  assert.match(h.cards()[0].textContent, /Fixture Apple report/);
  assert.equal(new URL(h.cards()[0].href).searchParams.get('symbol'), 'AAPL');
});

test('expired stories disappear even if refresh fails and old checked time is preserved', async t => {
  const h = harness(t);
  h.calls[0].resolve([item({pubDate:new Date(initialTime - 24*3600000 + 120000).toISOString()})]); await tick();
  const checked = h.q('#statusRight').textContent;
  h.setNow(initialTime + 300000); h.intervals[0].fn();
  assert.equal(h.cards().length, 0, 'expiry is applied before a remote result arrives');
  h.calls[1].reject(new Error('Fixture outage')); await tick();
  assert.equal(h.cards().length, 0);
  assert.match(h.q('#statusRight').textContent, /Refresh unavailable/);
  assert.equal(h.q('#statusRight').textContent.replace('Refresh unavailable · ', ''), checked);
  assert.equal(h.q('#errorBox').style.display, 'flex');
  assert.equal(h.q('#list a[href^="https://news.google.com"]'), null);
});

test('misrouted provider responses do not display and content is safely rendered as text', async t => {
  const h = harness(t); h.calls[0].resolve([item()], {query:'NVDA'}); await tick();
  assert.equal(h.cards().length, 0); assert.equal(h.q('#errorBox').style.display, 'flex');
  h.search('TSLA'); h.calls[1].resolve([item({title:'<img src=x onerror=alert(1)>', source:"Fixture's <script>"})]); await tick();
  assert.equal(h.q('#list img'), null); assert.equal(h.q('#list script'), null);
  assert.match(h.cards()[0].textContent, /<img src=x onerror=alert\(1\)>/);
  assert.match(h.cards()[0].textContent, /Fixture's <script>/);
});

test('validated internal reader fallback works without helper and local preview uses its proxy', async t => {
  const h = harness(t, {helper:false, hostname:'127.0.0.1'});
  assert.match(h.calls[0].url, /^\/api\/market-feed\?kind=symbol/);
  const readerUrl = '/news/article.html?id=' + item().articleId + '&edition=us&category=stocks&symbol=TSLA';
  h.calls[0].resolve([item({readerUrl}), item({articleId:'b'.repeat(64), readerUrl:'https://attacker.example'+readerUrl})]); await tick();
  assert.equal(h.cards().length, 1); assert.equal(h.cards()[0].pathname, '/news/article.html');
});
