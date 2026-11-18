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

  // A 200 OK consent/error page is not a verified empty market glossary.
  // The failed market must remain retryable while healthy market results survive.
  const malformedUrls = [];
  let futuresMarkupHealthy = false;
  const malformed = open(href => {
    malformedUrls.push(href);
    if (href.includes('/futures-')) return Promise.resolve(response(
      futuresMarkupHealthy ? markup : '<html><body><h1>Please sign in to continue</h1></body></html>'
    ));
    return Promise.resolve(response(emptyMarkup));
  });
  malformed.search('uniquemarketterm');
  await flush();
  assert.match(malformed.status.textContent, /could not be checked|unavailable/i,
    'unexpected successful HTML is not mistaken for a complete no-match');
  assert.equal(malformed.retry.hidden, false, 'the unexpected market response remains retryable');
  futuresMarkupHealthy = true;
  malformed.retry.click();
  await flush();
  assert.equal(malformedUrls.length, 10, 'retry fetches only the invalid market page');
  assert.match(malformedUrls.at(-1), /futures-glossary/);
  assert.equal(malformed.more.hidden, false, 'market term appears after valid markup returns');
  assert.equal(malformed.retry.hidden, true, 'a valid retry clears incomplete coverage');
  malformed.dom.window.close();

  // Even a fetch that never resolves must end in recoverable feedback rather than indefinite loading.
  const shortTimeoutCode = productionCode.replace('const EXTRA_TIMEOUT_MS = 8000;', 'const EXTRA_TIMEOUT_MS = 35;');
  assert.notEqual(shortTimeoutCode, productionCode, 'the actual production timeout is exercised');
  const d = open(() => new Promise(() => {}), shortTimeoutCode);
  d.search('uniquemarketterm');
  await new Promise(resolve => setTimeout(resolve, 75));
  assert.match(d.status.textContent, /unavailable/i);
  assert.equal(d.retry.hidden, false);
  d.dom.window.close();

  // If one market responds before the deadline while other pages stall, keep its result.
  const partialTimeout = open(href => href.includes('/stocks-')
    ? Promise.resolve(response(markup))
    : new Promise(() => {}), shortTimeoutCode);
  partialTimeout.search('uniquemarketterm');
  await new Promise(resolve => setTimeout(resolve, 75));
  assert.equal(partialTimeout.more.hidden, false, 'a completed result survives the timeout');
  assert.equal(partialTimeout.more.querySelector('a')?.textContent, 'uniquemarketterm');
  assert.match(partialTimeout.status.textContent, /could not be checked/i,
    'incomplete coverage remains visible with a partial result');
  assert.equal(partialTimeout.retry.hidden, false, 'unavailable markets can still be retried');
  partialTimeout.dom.window.close();

  // Retrying a failed market must retain already verified terms and avoid refetching them.
  const retryUrls = [];
  let retryFutures = false;
  let resolveFutures;
  const f = open(href => {
    retryUrls.push(href);
    if (href.includes('/futures-')) {
      if (!retryFutures) return Promise.reject(new Error('offline'));
      return new Promise(resolve => { resolveFutures = resolve; });
    }
    return Promise.resolve(response(markup));
  });
  f.search('uniquemarketterm');
  await flush();
  assert.equal(retryUrls.length, 9);
  assert.equal(f.more.hidden, false);
  assert.equal(f.more.querySelectorAll('li').length, 8);
  assert.equal(f.retry.hidden, false);
  retryFutures = true;
  f.retry.click();
  assert.equal(retryUrls.length, 10, 'retry fetches only the missing market');
  assert.match(retryUrls[9], /futures-glossary/);
  assert.equal(f.more.querySelectorAll('li').length, 8, 'known results stay visible during retry');
  assert.equal(f.retry.hidden, true, 'no duplicate retry while request is running');
  assert.match(f.status.textContent, /Checking other market glossaries/i);
  resolveFutures(response(markup));
  await flush();
  assert.match(f.status.textContent, /9 terms in the market glossaries/i);
  assert.equal(f.retry.hidden, true);
  f.dom.window.close();

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

  console.log('Glosssary market-search recovery: pending, success, outage/retry, partial failure, timeout and partial-timeout checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
