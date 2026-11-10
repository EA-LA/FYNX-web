'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'markets/index.html'), 'utf8');
const sections = ['currencies','crypto','indicators','patterns','volatility','correlation','cot','liquidity','historical-data'];

test('market directory exposes real, crawlable links to all nine implemented sections', () => {
  assert.match(html, /<nav class="market-grid" aria-label="Market research sections">/);
  assert.equal((html.match(/class="market-card"/g) || []).length, sections.length);
  for (const section of sections) {
    assert.match(html, new RegExp('<a class="market-card" href="/markets/' + section + '\\.html" data-market="' + section + '">'));
    const page = path.join(root, 'markets', section + '.html');
    assert.ok(fs.existsSync(page), section + ' must have a real destination');
    assert.match(fs.readFileSync(page, 'utf8'), /<h1[^>]*>[^<]+/i);
  }
});

test('each static card has readable text and responsive keyboard styling', () => {
  const cards = [...html.matchAll(/<a class="market-card"[^>]+>([\s\S]*?)<\/a>/g)];
  assert.equal(cards.length, sections.length);
  for (const [, body] of cards) {
    assert.match(body, /<strong>[^<]+<\/strong>/);
    assert.match(body, /<span>[^<]{20,}<\/span>/);
  }
  assert.match(html, /\.market-card:focus-visible/);
  assert.match(html, /@media\(max-width:600px\)/);
});

test('no placeholder text or obsolete section-only navigation remains', () => {
  assert.doesNotMatch(html, /Placeholder|Add your UI|Add your real content|Add the real dashboards/i);
  assert.doesNotMatch(html, /href="index\.html\?section=/);
  assert.match(html, /Market data can be delayed or unavailable/);
});

const inline = html.match(/<script data-market-redirect>([\s\S]*?)<\/script>/);
function redirect(query) {
  assert.ok(inline, 'legacy route script exists');
  const replaced = [];
  const links = sections.map(section => ({ dataset: { market: section }, href: 'https://www.fynxfinanceworld.com/markets/' + section + '.html' }));
  const location = { search: query, replace: url => replaced.push(url) };
  vm.runInNewContext(inline[1], {
    URLSearchParams,
    location,
    document: { querySelectorAll: selector => {
      assert.equal(selector, 'a[data-market]');
      return links;
    } },
  });
  return replaced;
}

test('legacy ?section= routes replace the placeholder URL with their working page', () => {
  for (const section of sections) {
    assert.deepEqual(redirect('?section=' + section), ['https://www.fynxfinanceworld.com/markets/' + section + '.html']);
  }
  assert.deepEqual(redirect('?section=VIX'), []);
  assert.deepEqual(redirect('?section=CRYPTO'), ['https://www.fynxfinanceworld.com/markets/crypto.html']);
});

test('unknown and injection-shaped section queries never navigate', () => {
  for (const query of ['', '?section=', '?section=unknown', '?section=javascript%3Aalert(1)', '?section=..%2F..%2Fowner']) {
    assert.deepEqual(redirect(query), []);
  }
});
