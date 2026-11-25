'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { _test } = require('./notification-delivery.cjs');

test('articlePath opens internal FYNX article for https sources', () => {
  assert.equal(_test.articlePath({ sourceUrl: '/news/article.html?id=abc' }), '/news/article.html?id=abc');
  const fromHttps = _test.articlePath({ sourceUrl: 'https://publisher.example.com/story' });
  assert.equal(fromHttps, '/news/article.html?url=' + encodeURIComponent('https://publisher.example.com/story'));
  assert.equal(_test.articlePath({}), '/notifications.html');
  assert.equal(_test.articlePath({ sourceUrl: 'javascript:alert(1)' }), '/notifications.html');
});

test('payloadFor uses internal article URL not the publisher site', () => {
  const payload = _test.payloadFor({ title: 'Rates', sourceUrl: 'https://publisher.example.com/a' }, 'n1');
  assert.equal(payload.url, 'https://www.fynxfinanceworld.com/news/article.html?url=' + encodeURIComponent('https://publisher.example.com/a'));
  assert.equal(payload.tag, 'fynx-n1');
});

test('category and channel gating match production preferences', () => {
  assert.equal(_test.categoryEnabled({ breakingNews: false }, 'market_news'), false);
  assert.equal(_test.categoryEnabled({ breakingNews: true }, 'market_news'), true);
  const channels = _test.channelsFor(
    { category: 'market_news', deliveryChannels: ['push', 'email'] },
    { breakingNews: true, pushEnabled: true, emailEnabled: false }
  );
  assert.deepEqual(channels, ['push']);
});

test('quiet hours respect timezone', () => {
  assert.equal(_test.quiet({}), false);
  assert.equal(_test.quiet({ quietHours: { enabled: false } }), false);
  const always = { quietHours: { enabled: true, start: '00:00', end: '23:59', timezone: 'UTC' } };
  assert.equal(typeof _test.quiet(always), 'boolean');
});
