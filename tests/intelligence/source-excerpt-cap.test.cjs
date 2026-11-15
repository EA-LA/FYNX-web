'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Reader = require('../../backend/news-reader.cjs');
const Publisher = require('../../scripts/build-intelligence.cjs');

const url = 'https://example.org/economy/source-brief';
const headline = 'Markets respond to new inflation report and central bank guidance';
const publishedAt = new Date(Date.now() - 2 * 3600000).toISOString();
const source = {link: url, title: headline, source: 'Example Journal', pubDate: publishedAt};
const shortSentence = 'The source reported inflation at 4.2% as officials reviewed the latest policy statement.';
const longSentence = 'The source reported ' + Array(34).fill('developments').join(' ') + '.';

function article(overrides = {}) {
  return {
    id: Reader.articleId(url), sourceUrl: url, title: headline, publishedAt,
    category: 'official', coverageLevel: 'source-text', method: 'source-backed-extractive',
    source: source.source, summary: shortSentence, keyPoints: [],
    contentExpiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
    updatedAt: publishedAt, numbers: [{value: '4.2%'}, {value: '8.3%'}],
    ...overrides
  };
}

test('public source excerpt uses one full verified sentence, never concatenated reader evidence', () => {
  const excerpt = Publisher.excerptFromArticle(article({keyPoints: [{text: longSentence}]}), source);
  assert.ok(excerpt);
  assert.equal(excerpt.text, shortSentence);
  assert.ok(excerpt.text.trim().split(/\s+/).length <= 31);
  assert.deepEqual(excerpt.numbers, ['4.2%']);
  assert.equal(excerpt.sourceURL, url);
  assert.equal(excerpt.publisher, source.source);
  assert.equal(Publisher.reusableExcerpt(excerpt, source), true);
});

test('a too-long upstream summary can fall back to a separate complete sourced key point', () => {
  const excerpt = Publisher.excerptFromArticle(article({
    summary: longSentence, keyPoints: [{text: shortSentence}]
  }), source);
  assert.ok(excerpt);
  assert.equal(excerpt.text, shortSentence);
  assert.ok(excerpt.text.endsWith('.'));
});

test('when several complete excerpts qualify, a dated catalyst takes priority', () => {
  const dated = 'The company said its next earnings release is scheduled for November 20, 2026.';
  const excerpt = Publisher.excerptFromArticle(article({
    summary: shortSentence, keyPoints: [{text: dated}]
  }), source);
  assert.ok(excerpt);
  assert.equal(excerpt.text, dated);
  assert.deepEqual(excerpt.numbers, []);
});

test('a single source sentence over the cap is omitted rather than truncated or fabricated', () => {
  assert.equal(Publisher.excerptFromArticle(article({
    summary: longSentence, keyPoints: []
  }), source), null);
});

test('saved excerpts over 31 words are not reused and require a fresh source check', () => {
  const excerpt = Publisher.excerptFromArticle(article(), source);
  assert.ok(excerpt);
  assert.equal(Publisher.reusableExcerpt({...excerpt, text: longSentence}, source), false);
  assert.equal(Publisher.reusableExcerpt(excerpt, {...source, link: 'https://example.org/other'}), false);
});

test('missing source evidence and incomplete sentences are never used', () => {
  assert.equal(Publisher.excerptFromArticle(article({summary: shortSentence.slice(0, -1)}), source), null);
  assert.equal(Publisher.excerptFromArticle(article({coverageLevel: 'headline-only'}), source), null);
  assert.equal(Publisher.excerptFromArticle(article({method: 'generated'}), source), null);
});

test('historic cached articles beyond their refresh window cannot block new publication', () => {
  const aged = {
    id: 'historic', publishedAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    sources: [{publisher: source.source, url}], stats: [{symbol: 'SPY'}],
    excerpt: {text: longSentence, publisher: source.source, sourceURL: url}
  };
  const recent = {id: 'recent', excerpt: {text: shortSentence}};
  const invalid = {id: 'invalid', excerpt: {text: 42}};
  const records = new Map([[aged.id, aged], [recent.id, recent], [invalid.id, invalid]]);
  assert.equal(Publisher.sanitizeStoredExcerpts(records), records);
  assert.equal(records.get('historic').excerpt, null);
  assert.equal(records.get('invalid').excerpt, null);
  assert.equal(records.get('recent').excerpt.text, shortSentence);
  assert.equal(records.get('historic').sources[0].url, url, 'verified attribution must be retained');
  assert.deepEqual(records.get('historic').stats, [{symbol: 'SPY'}], 'market context must be retained');
});
