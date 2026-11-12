#!/usr/bin/env node
// Regression checks execute the production glossary controller against the real page DOM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'trading-glossary.html'), 'utf8');
const productionCode = fs.readFileSync(path.join(root, 'assets/js/glossary-search.js'), 'utf8');
const markup = '<div class="glossary"><article class="term"><strong>uniquemarketterm</strong><p>A useful market term</p></article></div>';
const emptyMarkup = '<div class="glossary"></div>';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function flush() { await tick(); await tick(); await tick(); }

function open(fetcher, code = productionCode) {
  const dom = new JSDOM(html, {
    url: 'https://www.fynxfinanceworld.com/trading-glossary.html',
    runScripts: 'outside-only'
  });
  dom.window.fetch = fetcher;
  dom.window.matchMedia = () => ({ matches: false });
  dom.window.eval(code);
  const doc = dom.window.document;
  const input = doc.getElementById('glossarySearch');
  const status = doc.querySelector('[data-glossary-status]');
  const retry = doc.querySelector('[data-glossary-retry]');
  const more = doc.querySelector('[data-glossary-more]');
  assert.ok(input && status && retry && more, 'real page exposes the controls');
  function search(query) {
    input.value = query;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }
  return { dom, input, status, retry, more, search };
}

function response(body = emptyMarkup) {
  return { ok: true, text: async () => body };
}

(async () => {
  // Pending lookups must not assert that a result is absent while remote glossaries are still loading.
  const pending = [];
  const a = open(() => new Promise(resolve => pending.push(resolve)));
  a.search('uniquemarketterm');
  assert.equal(pending.length, 9, 'all nine market glossaries are queried once');
  assert.match(a.status.textContent, /Checking the market glossaries/i);
  assert.equal(a.retry.hidden, true);
  pending.forEach((resolve, i) => resolve(response(i === 0 ? markup : emptyMarkup)));
  await flush();
  assert.equal(a.more.hidden, false, 'the market result appears');
  assert.match(a.status.textContent, /market glossaries below/i);
  assert.equal(a.retry.hidden, true);
  assert.equal(a.more.querySelector('a')?.textContent, 'uniquemarketterm');
  a.dom.window.close();

  // A network outage must be distinguished from a complete no-match and let the user retry.
  let online = false;
  const b = open(() => online ? Promise.resolve(response(markup)) : Promise.reject(new Error('offline')));
  b.search('uniquemarketterm');
  await flush();
  assert.match(b.status.textContent, /unavailable/i);
  assert.equal(b.retry.hidden, false, 'retry is available when all requests fail');
  online = true;
  b.retry.click();
  assert.match(b.status.textContent, /Checking the market glossaries/i);
  await flush();
  assert.equal(b.retry.hidden, true, 'successful retry clears outage warning');
  assert.equal(b.more.hidden, false, 'retry returns matching market entries');
  b.dom.window.close();

  // Partial failures must not imply that the collection of results is exhaustive.
  const c = open(href => href.includes('/futures-') ? Promise.resolve({ ok: false }) : Promise.resolve(response(markup)));
  c.search('uniquemarketterm');
  await flush();
  assert.match(c.status.textContent, /could not be checked/i);
  assert.equal(c.retry.hidden, false);
  assert.equal(c.more.hidden, false);
  c.dom.window.close();

  // Even a fetch that never resolves must end in recoverable feedback rather than indefinite loading.
  const shortTimeoutCode = productionCode.replace('const EXTRA_TIMEOUT_MS = 8000;', 'const EXTRA_TIMEOUT_MS = 35;');
  assert.notEqual(shortTimeoutCode, productionCode, 'the actual production timeout is exercised');
  const d = open(() => new Promise(() => {}), shortTimeoutCode);
  d.search('uniquemarketterm');
  await new Promise(resolve => setTimeout(resolve, 75));
  assert.match(d.status.textContent, /unavailable/i);
  assert.equal(d.retry.hidden, false);
  d.dom.window.close();

  // When a topic is chosen, local terms are filtered without unnecessary remote requests.
  let calls = 0;
  const e = open(() => { calls++; return Promise.resolve(response()); });
  const select = e.dom.window.document.getElementById('glossaryTopic');
  select.value = select.options[1].value;
  select.dispatchEvent(new e.dom.window.Event('change', { bubbles: true }));
  e.search('uniquemarketterm');
  assert.equal(calls, 0);
  assert.equal(e.retry.hidden, true);
  e.dom.window.close();

  console.log('Glosssary market-search recovery: pending, success, outage/retry, partial and timeout checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
