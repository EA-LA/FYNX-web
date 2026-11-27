#!/usr/bin/env node
// Behaviour test for the Explore library search in assets/js/discovery.js (target of every header search box).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'explore.html'), 'utf8').replace(/<script\b[^>]*src=[^>]*><\/script>/gi, '');
const code = fs.readFileSync(path.join(root, 'assets/js/discovery.js'), 'utf8');

const site = 'https://www.fynxfinanceworld.com';
const testStoryPath = '/intelligence/test-search-headline/';
const retiredStoryPath = '/intelligence/test-retired-headline/';
const sitemap = (paths, includeHub = true) => '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  + [...(includeHub ? ['/intelligence/'] : []), ...paths].map(url => '<url><loc>' + (url.startsWith('/') ? site + url : url) + '</loc></url>').join('') + '</urlset>';

function search(query, { fixture = false, category, response = sitemap([testStoryPath]) } = {}) {
  const dom = new JSDOM(html, { url: 'https://www.fynxfinanceworld.com/explore.html?q=' + encodeURIComponent(query), runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = url => {
    if (!fixture || url !== '/intelligence/sitemap.xml' || response === 'offline') return Promise.reject(new Error('offline'));
    if (response === 'stalled') return new Promise(() => {});
    return Promise.resolve({ok: true, text: async () => response});
  };
  if (response === 'stalled') {
    const setTimer = window.setTimeout.bind(window);
    window.setTimeout = (cb, ms) => setTimer(cb, ms === 4000 ? 0 : ms);
  }
  window.matchMedia = () => ({ matches: false });
  if (fixture) {
    window.localStorage.setItem('fynx.saved-resources.v1', JSON.stringify([testStoryPath + 'index.html', retiredStoryPath + 'index.html']));
    for (const [pathname, label] of [[testStoryPath,'Qalzor releases a fictional market report'], [retiredStoryPath,'Qalzor reports retired news']]) {
      const story = window.document.createElement('article');
      story.className = 'discovery-card';
      story.dataset.resourceUrl = pathname + 'index.html';
      story.dataset.category = 'News & events';
      story.dataset.search = label;
      const title = window.document.createElement('h2');
      const link = window.document.createElement('a');
      link.href = story.dataset.resourceUrl;
      link.textContent = label;
      title.append(link);
      story.append(title);
      window.document.querySelector('.discovery-grid').append(story);
    }
  }
  window.eval(code);
  if (category) {
    [...window.document.querySelectorAll('[data-filter]')].find((button) => button.dataset.filter === category).click();
  }
  const result = () => {
    const visible = [...window.document.querySelectorAll('.discovery-card')].filter((card) => !card.hidden);
    const status = window.document.getElementById('discovery-count').textContent;
    const titles = visible.map(card => card.querySelector('h2').textContent.trim());
    const links = visible.map(card => card.querySelector('h2 a').getAttribute('href'));
    const notice = window.document.getElementById('discovery-intelligence-message');
    const noticeText = notice?.textContent;
    const browse = notice?.querySelector('a').getAttribute('href');
    const saved = JSON.parse(window.localStorage.getItem('fynx.saved-resources.v1') || '[]');
    window.close();
    return { count: visible.length, status, titles, links, browse, saved, noticeText };
  };
  if (response === 'stalled') {
    assert.match(window.document.getElementById('discovery-count').textContent, /^Checking Intelligence/);
    assert.ok(window.document.getElementById('discovery-empty').hidden);
    return new Promise(resolve => setTimeout(() => resolve(result()), 15));
  }
  return fixture ? new Promise(resolve => setImmediate(() => resolve(result()))) : result();
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
assert.ok(!/for “takes”/.test(search('taxes').status), 'taxes must not become takes');
assert.ok(/for “fibonacci”/.test(search('fibonxcci', { category: 'Tools' }).status), 'stable title substitution works in Tools');
assert.ok(!/trading stop/.test(search('trailing stop').status), 'trailing must not become trading');
assert.ok(/for “forex”/.test(search('forx').status), 'forx is corrected to forex');
// Trader shorthand and symbols.
for (const q of ['take profit', 'take-profit', 'tp', 's&p']) assert.ok(search(q).count > 0, `"${q}" should find resources`);
// Regex characters in a query are harmless.
assert.doesNotThrow(() => search('c++( [risk'));

async function verifyStories() {
  const story = { fixture: true, category: 'News & events' };
  // A headline-only same-length neighbor cannot turn on autocorrection.
  assert.strictEqual((await search('qalzop', story)).count, 0, 'a headline must not introduce unrelated substitution');
  const exact = await search('qalzor', story);
  assert.ok(!/No exact match/.test(exact.status));
  assert.deepEqual(exact.titles, ['Qalzor releases a fictional market report']);
  assert.deepEqual(exact.links, [testStoryPath], 'existing current link goes to its canonical route');
  assert.equal(exact.browse, '/intelligence/');

  const saved = await search('qalzor', {...story, category: 'Saved'});
  assert.deepEqual(saved.links, [testStoryPath], 'current saved legacy paths still match');
  assert.deepEqual(saved.saved, [testStoryPath + 'index.html', retiredStoryPath + 'index.html'], 'saved URLs were not rewritten or dropped');

  for (const response of ['offline', 'stalled', '<urlset>', sitemap([testStoryPath], false)]) {
    const result = await search('qalzor', {...story, response});
    assert.equal(result.count, 0);
    assert.match(result.noticeText, /Could not verify/);
    assert.equal(result.browse, '/intelligence/');
  }
  const foreign = await search('qalzor', {...story, response: sitemap(['https://example.invalid' + testStoryPath])});
  assert.equal(foreign.count, 0, 'a different origin cannot establish a valid article');

  console.log('discovery search behaviour checks passed');
}
verifyStories().catch(error => { console.error(error); process.exitCode = 1; });
