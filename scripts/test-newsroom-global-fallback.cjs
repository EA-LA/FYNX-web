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


test('retains valid saved reports when the next refresh fails, with honest status and working Retry', async () => {
  let online = true;
  const calls = [];
  const app = setup((category, { edition }) => {
    calls.push(edition);
    return online
      ? Promise.resolve({ status: 'fresh', fetchedAt: new Date().toISOString(), items: [story('us')] })
      : Promise.reject(Error('offline'));
  });
  try {
    await settle();
    completed(app, 'fresh');
    assert.match(app.lead.textContent, /Verified source headline/);
    online = false;
    app.button.click();
    await settle();
    completed(app, 'cached');
    assert.match(app.lead.textContent, /Verified source headline/, 'verified story remains visible');
    assert.match(app.label.textContent, /Saved coverage/);
    assert.match(app.doc.querySelector('[data-newsroom-status]').textContent, /Source refresh unavailable/);
    assert.deepEqual(calls, ['us', 'us'], 'an outage with saved coverage does not silently replace it with Global');
    online = true;
    app.button.click();
    await settle();
    completed(app, 'fresh');
    assert.match(app.label.textContent, /Coverage updated/);
  } finally { app.close(); }
});

test('changing edition never presents retained reporting from the previous edition after an outage', async () => {
  let online = true;
  const app = setup((category, { edition }) => online
    ? Promise.resolve({ status: 'fresh', fetchedAt: new Date().toISOString(), items: [story('us')] })
    : Promise.reject(Error('offline')));
  try {
    await settle();
    completed(app, 'fresh');
    online = false;
    app.dom.window.FynxEdition.get = () => 'uk';
    app.dom.window.document.dispatchEvent(new app.dom.window.Event('fynx:edition-change'));
    await settle();
    completed(app, 'unavailable');
    assert.doesNotMatch(app.lead.textContent, /Verified source headline/);
    assert.match(app.lead.textContent, /temporarily unavailable/i);
  } finally { app.close(); }
});

test('a successful empty update is not mislabeled as saved coverage', async () => {
  let first = true;
  const app = setup(() => {
    if (first) {
      first = false;
      return Promise.resolve({ status: 'fresh', fetchedAt: new Date().toISOString(), items: [story('us')] });
    }
    return Promise.resolve({ status: 'fresh', fetchedAt: new Date().toISOString(), items: [] });
  });
  try {
    await settle();
    completed(app, 'fresh');
    app.button.click();
    await settle();
    completed(app, 'fresh');
    assert.doesNotMatch(app.lead.textContent, /Verified source headline/);
    assert.match(app.lead.textContent, /No recent reports/i);
  } finally { app.close(); }
});

test('a successful Global fallback after a regional outage is partly refreshed, not unavailable', async () => {
  const fetchedAt = new Date().toISOString();
  const app = setup((category, { edition }) => Promise.resolve(edition === 'global'
    ? { status: 'fresh', fetchedAt, items: [story('global')] }
    : { status: 'unavailable', fetchedAt: null, items: [] }));
  try {
    await settle();
    completed(app, 'partial');
    assert.match(app.lead.textContent, /Verified source headline/);
    assert.match(app.label.textContent, /Partly refreshed/);
    assert.match(app.doc.querySelector('[data-newsroom-status]').textContent, /Selected edition sources unavailable/);
    assert.match(app.doc.querySelector('[data-newsroom-status]').textContent, /Retrieved/);
    assert.doesNotMatch(app.label.textContent, /Sources unavailable/);
  } finally { app.close(); }
});

test('an empty edition with saved Global reports shows Saved coverage, not Coverage updated', async () => {
  const app = setup((category, { edition }) => Promise.resolve(edition === 'global'
    ? { status: 'cached', stale: true, fetchedAt: new Date().toISOString(), items: [story('global')] }
    : { status: 'fresh', fetchedAt: new Date().toISOString(), items: [] }));
  try {
    await settle();
    completed(app, 'cached');
    assert.match(app.lead.textContent, /Verified source headline/);
    assert.match(app.label.textContent, /Saved coverage/);
  } finally { app.close(); }
});

test('an unavailable Global response with residual items cannot appear as verified fallback', async () => {
  const app = setup((category, { edition }) => Promise.resolve(edition === 'global'
    ? { status: 'unavailable', fetchedAt: null, items: [story('global')] }
    : { status: 'unavailable', fetchedAt: null, items: [] }));
  try {
    await settle();
    completed(app, 'unavailable');
    assert.doesNotMatch(app.lead.textContent, /Verified source headline/);
    assert.match(app.label.textContent, /Sources unavailable/);
  } finally { app.close(); }
});

test('Show more appends reporting without replacing the lead and focuses the first newly revealed link', async () => {
  const fresh = Array.from({length:23}, (_,i)=>({
    ...story('us'), title:'Fixture report '+(i+1), url:'https://example.com/report-'+i, rank:i+1
  }));
  const app = setup(async()=>({items:fresh,status:'fresh',fetchedAt:new Date().toISOString()}));
  try {
    await settle();
    const more = app.doc.querySelector('[data-newsroom-more]');
    const lead = app.lead.querySelector('article'), secondary = app.doc.querySelector('[data-newsroom-secondary] article');
    const latest = app.doc.querySelector('[data-newsroom-latest]');
    const cards = () => [...latest.querySelectorAll('article')];
    const heading = article => article.querySelector('h3 a');
    const prior = cards()[0];
    assert.equal(cards().length,8);
    assert.equal(more.hidden,false);
    assert.match(more.textContent,/11/);
    more.focus(); more.click();
    assert.equal(cards().length,16);
    assert.strictEqual(cards()[0],prior);
    assert.strictEqual(app.lead.querySelector('article'),lead);
    assert.strictEqual(app.doc.querySelector('[data-newsroom-secondary] article'),secondary);
    assert.strictEqual(app.doc.activeElement,heading(cards()[8]));
    assert.equal(more.hidden,false);
    assert.match(more.textContent,/3/);
    more.focus(); more.click();
    assert.equal(cards().length,19);
    assert.strictEqual(cards()[0],prior);
    assert.equal(more.hidden,true);
    assert.strictEqual(app.doc.activeElement,heading(cards()[16]));
    assert.equal(new Set(cards().map(card=>heading(card).textContent)).size,19,'no duplicates');
    assert.equal(app.doc.querySelector('[data-newsroom-count]').textContent,'19 reports');
  } finally { app.close(); }
});
