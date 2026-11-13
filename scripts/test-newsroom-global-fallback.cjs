/* Run the actual newsroom controller against a minimal real DOM surface. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const source = readFileSync(join(__dirname, '../assets/js/newsroom-page.js'), 'utf8');
const html = `<!doctype html><html><body>
<div data-newsroom-page>
  <div data-newsroom-edition></div>
  <button type="button" data-newsroom-refresh>Refresh</button>
  <button type="button" data-newsroom-more>More</button>
  <div data-newsroom-status-label></div>
  <div data-newsroom-status></div>
  <section data-newsroom-stories aria-busy="false">
    <div data-newsroom-lead></div>
    <div data-newsroom-secondary></div>
    <section data-newsroom-latest-section><div data-newsroom-latest></div><span data-newsroom-count></span></section>
  </section>
</div>
<script id="newsroom-config" type="application/json">{"id":"markets","category":"markets","title":"Markets"}</script>
</body></html>`;
const flush = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { await flush(); await flush(); await flush(); };

function setup(loader) {
  const dom = new JSDOM(html, { url: 'https://www.fynxfinanceworld.com/markets/stocks.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.setInterval = () => 1; // Keep the real five-minute auto-refresh path from creating test timers.
  w.FynxEdition = { get: () => 'us', editions: [{ id: 'us', label: 'United States', locale: 'en-US' }] };
  if (loader !== undefined) w.FYNXMarketIntelligenceData = { loadHeadlines: loader };
  w.eval(source);
  const doc = w.document;
  return {
    dom, doc,
    button: doc.querySelector('[data-newsroom-refresh]'),
    feed: doc.querySelector('[data-newsroom-stories]'),
    lead: doc.querySelector('[data-newsroom-lead]'),
    label: doc.querySelector('[data-newsroom-status-label]'),
    close() { w.close(); }
  };
}
function completed(app, state) {
  assert.equal(app.button.disabled, false, 'Refresh is usable after a failure');
  assert.equal(app.feed.getAttribute('aria-busy'), 'false', 'screen reader loading state is cleared');
  assert.equal(app.doc.querySelector('[data-newsroom-page]').dataset.feedState, state);
}
const story = edition => ({
  title: 'Verified source headline',
  source: 'Example source',
  url: 'https://example.com/report',
  edition,
  publishedAt: new Date().toISOString()
});
test('missing news loader does not trap a non-Global edition in a busy state', async () => {
  const app = setup(undefined);
  try {
    await settle();
    completed(app, 'unavailable');
    assert.match(app.lead.textContent, /temporarily unavailable/i);
    assert.match(app.label.textContent, /Sources unavailable/i);
    assert.doesNotMatch(app.lead.textContent, /Verified source headline/);
  } finally { app.close(); }
});
test('a synchronously throwing loader is handled for both edition and Global fallback', async () => {
  let calls = 0;
  const app = setup(() => { calls++; throw Error('offline'); });
  try {
    await settle();
    assert.equal(calls, 2);
    completed(app, 'unavailable');
  } finally { app.close(); }
});
test('rejected source requests finish with retry enabled instead of a permanent spinner', async () => {
  let calls = 0;
  const app = setup(() => { calls++; return Promise.reject(Error('offline')); });
  try {
    await settle();
    assert.equal(calls, 2);
    completed(app, 'unavailable');
    assert.match(app.lead.textContent, /temporarily unavailable/i);
  } finally { app.close(); }
});
test('after an outage, Retry renders genuinely sourced coverage', async () => {
  let online = false;
  const app = setup(() => online
    ? Promise.resolve({ status: 'fresh', fetchedAt: new Date().toISOString(), items: [story('us')] })
    : Promise.reject(Error('offline')));
  try {
    await settle();
    completed(app, 'unavailable');
    online = true;
    app.button.click();
    await settle();
    completed(app, 'fresh');
    assert.match(app.lead.textContent, /Verified source headline/);
    assert.match(app.label.textContent, /Coverage updated/);
  } finally { app.close(); }
});
test('a successful Global fallback still populates coverage for an empty edition', async () => {
  const editions = [];
  const app = setup((category, { edition }) => {
    editions.push(edition);
    return Promise.resolve({ status: 'fresh', fetchedAt: new Date().toISOString(), items: edition === 'global' ? [story('global')] : [] });
  });
  try {
    await settle();
    assert.deepEqual(editions, ['us', 'global']);
    completed(app, 'fresh');
    assert.match(app.lead.textContent, /Verified source headline/);
    assert.match(app.doc.querySelector('[data-newsroom-status]').textContent, /Global edition desk/);
  } finally { app.close(); }
});
