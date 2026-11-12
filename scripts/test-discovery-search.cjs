#!/usr/bin/env node
// Behaviour test for the Explore library search in assets/js/discovery.js (target of every header search box).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'explore.html'), 'utf8').replace(/<script\b[^>]*src=[^>]*><\/script>/gi, '');
const code = fs.readFileSync(path.join(root, 'assets/js/discovery.js'), 'utf8');

function search(query) {
  const dom = new JSDOM(html, { url: 'https://www.fynxfinanceworld.com/explore.html?q=' + encodeURIComponent(query), runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = () => Promise.reject(new Error('offline'));
  window.matchMedia = () => ({ matches: false });
  window.eval(code);
  const visible = [...window.document.querySelectorAll('.discovery-card')].filter((card) => !card.hidden);
  const status = window.document.getElementById('discovery-count').textContent;
  const titles = visible.map((card) => card.querySelector('h2').textContent.trim());
  window.close();
  return { count: visible.length, status, titles };
}

// Joined spellings match the spaced/hyphenated forms ("break-even", "stop loss").
for (const [joined, spaced] of [['breakeven', 'break-even'], ['stoploss', 'stop loss'], ['positionsize', 'position size']]) {
  const a = search(joined);
  assert.ok(a.count > 0, `"${joined}" should find resources`);
  assert.ok(!/No exact match/.test(a.status), `"${joined}" is an exact match`);
  assert.ok(a.count <= search(spaced).count, `"${joined}" should not find more than "${spaced}"`);
}
assert.ok(search('breakeven').titles.some((t) => /break-even/i.test(t)), 'breakeven lists the Break-even calculator');

// A typo in a joined spelling is corrected to the joined form.
const typo = search('brekeven');
assert.ok(typo.count > 0 && /Showing \d+ resources? for “breakeven”/.test(typo.status), `brekeven status: ${typo.status}`);

// Existing behaviour stays: short tokens only match word starts, typos are forgiven, nonsense finds nothing.
assert.ok(!search('rsi').titles.some((t) => /currency conversion/i.test(t)), '"rsi" must not match "conversion"');
assert.ok(/for “fibonacci”/.test(search('fibonaci').status), 'fibonaci is corrected');
assert.strictEqual(search('zzqxjv').count, 0);
// Corrections must not swap in an unrelated or generic word.
assert.ok(!/takes/.test(search('taxes').status), 'taxes must not become takes');
assert.ok(!/trading stop/.test(search('trailing stop').status), 'trailing must not become trading');
assert.ok(/for “forex”/.test(search('forx').status), 'forx is corrected to forex');
// Trader shorthand and symbols.
for (const q of ['take profit', 'take-profit', 'tp', 's&p']) assert.ok(search(q).count > 0, `"${q}" should find resources`);
// Regex characters in a query are harmless.
assert.doesNotThrow(() => search('c++( [risk'));

console.log('discovery search behaviour checks passed');
