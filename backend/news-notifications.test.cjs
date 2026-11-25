'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { _test } = require('./news-notifications');

test('isAuthorizedInternal rejects external and unknown paths', () => {
  assert.equal(_test.isAuthorizedInternal('https://evil.com'), false);
  assert.equal(_test.isAuthorizedInternal('/other.html'), false);
  assert.equal(_test.isAuthorizedInternal('/news/article.html?id=abc'), true);
  assert.equal(_test.isAuthorizedInternal('/notifications.html'), true);
  assert.equal(_test.isAuthorizedInternal(''), false);
});

test('inQuietHours respects timezone and empty prefs', () => {
  assert.equal(_test.inQuietHours({}), false);
  assert.equal(_test.inQuietHours({ quietHours: { enabled: false } }), false);
  // With a known timezone, the function should not throw
  const prefs = { quietHours: { enabled: true, start: '00:00', end: '23:59', timezone: 'UTC' } };
  assert.equal(typeof _test.inQuietHours(prefs), 'boolean');
});
