'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const E = require('../../scripts/intelligence/entities.cjs'), A = require('../../scripts/intelligence/analysis.cjs'), B = require('../../scripts/build-intelligence.cjs');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(ROOT, 'intelligence');
const quotes = {'GBPUSD=X': {name: 'GBP/USD'}, '^TNX': {name: 'US 10-year yield'}, 'DX-Y.NYB': {name: 'US Dollar Index'}, '^GSPC': {name: 'S&P 500'}, 'GC=F': {name: 'Gold'}, '^FTSE': {name: 'FTSE 100'}, 'BZ=F': {name: 'Brent'}, 'CL=F': {name: 'WTI'}, XLE: {name: 'Energy'}, 'BTC-USD': {name: 'Bitcoin'}, IBIT: {name: 'IBIT'}};

test('links markets and companies only when the story names them, first mention leading', () => {
  const s = E.linkStory('Sterling slips as firm US inflation sustains Federal Reserve rate bets', {quotes});
  assert.equal(s.markets[0].symbol, 'GBPUSD=X'); assert.equal(s.markets[0].assetClass, 'forex');
  assert.ok(s.markets.some(m => m.symbol === '^TNX' && m.assetClass === 'rates'));
  assert.deepEqual(E.linkStory('General strikes to paralyze Spain ahead of election campaign', {quotes}).markets, []);
  assert.equal(E.linkStory('Nvidia shares rebound ahead of earnings', {quotes}).companies[0].ticker, 'NVDA');
  assert.equal(E.linkStory('Visa rules tighten for students', {quotes}).companies.length, 0);
  const idx = E.buildListingIndex([['CRWV', 'CoreWeave, Inc. - Class A Common Stock', 'EQUITY', 'Nasdaq'], ['TGT', 'Target Corporation Common Stock', 'EQUITY', 'NYSE']]);
  assert.ok(idx.has('coreweave')); assert.ok(!idx.has('target'));
});

test('market statistics come from the instrument history', () => {
  const history = Array.from({length: 260}, (_, i) => [new Date(Date.UTC(2025, 10, 11) + i * 86400000).toISOString().slice(0, 10), 100 + Math.sin(i / 9) * 3]);
  const last = history.at(-1)[1], q = {name: 'Test', price: last * 1.05, previousClose: last, changePercent: 5, vol20: 1, asOf: new Date().toISOString(), history};
  const s = A.instrumentStats('TEST', q);
  assert.equal(s.zscore, 5); assert.match(A.sinceText(s), /largest one-day gain/);
  assert.ok(Number.isFinite(s.m1) && Number.isFinite(s.ytd) && s.high.date);
});

test('AI drafts with invented numbers, quotations or sources are rejected', () => {
  const facts = {sources: [{publisher: 'Reuters'}], marketData: [{name: 'GBP/USD', day: '-1.25%', last: '1.3274'}]};
  const ok = {headline: 'Pound falls after US inflation data', overview: 'GBP/USD fell 1.25% to 1.3274 as traders weighed US inflation.', whatHappened: ['Reuters reported the move.'], whyItMatters: 'Rate expectations drive the pound against the dollar.', analysis: 'The 1.25% decline is large relative to recent sessions for this pair.'};
  assert.deepEqual(A.validateNarrative(ok, facts), []);
  assert.match(A.validateNarrative({...ok, analysis: 'Analysts expect a 7.5% drop by spring in this currency pair overall.'}, facts).join(), /7\.5/);
  assert.match(A.validateNarrative({...ok, overview: 'The minister said “we will not tolerate any further weakness in sterling markets” today.'}, facts).join(), /quotation/);
  assert.match(A.validateNarrative({...ok, whyItMatters: 'According to Goldman Sachs, the dollar has room to run higher this quarter.'}, facts).join(), /unlisted source/);
});

test('reports of one event group together; separate events stay apart', () => {
  const now = Date.now(), at = h => new Date(now - h * 3600000).toISOString();
  const g = B.cluster([
    {title: 'Brent crude briefly dips below $90 for first time since August', source: 'CNBC', link: 'https://www.cnbc.com/a', pubDate: at(3)},
    {title: 'Oil: Brent crude dips below $90 for first time since August', source: 'FT', link: 'https://www.ft.com/b', pubDate: at(2)},
    {title: 'Nvidia shares rebound ahead of earnings', source: 'CNBC', link: 'https://www.cnbc.com/c', pubDate: at(1)}], now);
  assert.equal(g.length, 2); assert.equal(g.find(x => x.items.length === 2).items[0].source, 'CNBC');
});

test('published pages are crawlable, unique and credit their sources', {skip: !fs.existsSync(path.join(OUT, 'data/articles.json'))}, () => {
  const {articles} = JSON.parse(fs.readFileSync(path.join(OUT, 'data/articles.json'), 'utf8'));
  const titles = new Set(), canon = new Set(), descs = new Set();
  for (const a of articles) {
    const html = fs.readFileSync(path.join(OUT, a.slug, 'index.html'), 'utf8');
    const title = html.match(/<title>([^<]+)<\/title>/)[1], c = html.match(/<link rel="canonical" href="([^"]+)"/)[1], d = html.match(/<meta name="description" content="([^"]+)"/)[1];
    assert.ok(!titles.has(title), 'duplicate title ' + title); titles.add(title);
    assert.ok(!canon.has(c)); canon.add(c); assert.equal(c, `https://www.fynxfinanceworld.com/intelligence/${a.slug}/`);
    descs.add(d); assert.match(html, /<meta name="robots" content="index,follow">/); assert.match(html, /"@type":"NewsArticle"/);
    assert.match(html, /Read original source/); for (const s of a.sources) assert.ok(html.includes(s.url.replace(/&/g, '&amp;')), 'source link ' + s.url);
    assert.ok(a.stats.length >= 1, 'every page measures at least one market');
    if (a.excerpt) assert.ok(a.excerpt.text.split(/\s+/).length <= 31, 'excerpts stay short');
    assert.doesNotMatch(html, /\bundefined\b|NaN|\[object Object\]/);
  }
  assert.equal(descs.size, articles.length, 'descriptions are unique');
  const map = JSON.parse(fs.readFileSync(path.join(OUT, 'data/map.json'), 'utf8')).map;
  for (const slug of Object.values(map)) assert.ok(fs.existsSync(path.join(OUT, slug, 'index.html')));
});
