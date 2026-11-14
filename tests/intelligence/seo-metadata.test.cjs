'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../scripts/intelligence/render.cjs');

function article(id, publisher, timestamp, headline = 'Wall Street stocks steady as traders weigh rate outlook') {
  return {
    id, slug: 'brief-' + id, headline, summary: 'Markets moved as investors reviewed updated interest rate expectations and the latest public trading data.',
    sources: [{publisher, publishedAt: timestamp, title: headline, url: 'https://example.org/news/' + id}],
    stats: [], companies: [], themes: [], facts: [], dataPoints: [], macro: [], catalysts: [],
    related: [], excerpt: null, narrative: null, method: 'data', whyData: 'Rates remain relevant to traders.',
    publishedAt: timestamp, updatedAt: timestamp, analyzedAt: timestamp
  };
}
const from = html => ({
  title: html.match(/<title>([^<]+)<\\/title>/)[1],
  description: html.match(/<meta name="description" content="([^"]+)"/)[1],
  canonical: html.match(/<link rel="canonical" href="([^"]+)"/)[1]
});

test('separate source reports with the same headline get unique, truthful SEO metadata', () => {
  const records = [
    article('a1b2c3', 'Reuters', '2026-11-14T15:20:00Z'),
    article('b2c3d4', 'Associated Press', '2026-11-14T15:25:00Z'),
    article('c3d4e5', 'Reuters', '2026-11-14T15:20:00Z')
  ];
  const metadata = R.seoMetadata(records);
  const context = {assets: '', bySlug: new Map(records.map(r => [r.slug, r])), metadata};
  const pages = records.map(rec => R.articlePage(rec, context));
  const parsed = pages.map(from);
  assert.equal(new Set(parsed.map(p => p.title)).size, records.length);
  assert.equal(new Set(parsed.map(p => p.description)).size, records.length);
  assert.equal(new Set(parsed.map(p => p.canonical)).size, records.length);
  assert.ok(parsed.some(p => p.title.includes('Reuters')));
  for (let i = 0; i < records.length; i++) {
    assert.ok(pages[i].includes('<h1>' + records[i].headline + '</h1>'), 'original headline preserved');
    assert.ok(pages[i].includes(records[i].sources[0].url), 'source provenance preserved');
    assert.equal(parsed[i].canonical, 'https://www.fynxfinanceworld.com/intelligence/' + records[i].slug + '/');
    assert.ok(pages[i].includes('"headline":"' + records[i].headline + '"'), 'structured headline preserved');
  }
  // Feed order is not allowed to change search-result metadata.
  const reverse = R.seoMetadata([...records].reverse());
  for (const rec of records) assert.deepEqual(metadata.get(rec.slug), reverse.get(rec.slug));
});

test('non-colliding SEO titles and descriptions remain unchanged', () => {
  const rec = article('uniqueslug', 'Reuters', '2026-11-14T12:00:00Z', 'Bitcoin markets stabilize after volatile overnight trading');
  const meta = R.seoMetadata([rec]).get(rec.slug);
  assert.equal(meta.title, rec.headline + ' | FYNX Intelligence');
  assert.equal(meta.description, rec.summary.replace(/\\s+/g, ' ').slice(0, 155).replace(/\\s\\S*$/, '') + '…');
});
