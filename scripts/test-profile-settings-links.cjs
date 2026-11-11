'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../profile.html'), 'utf8');
const expected = new Map([
  ['account-settings.html', 'Account Settings'],
  ['security.html', 'Security'],
  ['notifications.html', 'Notifications'],
  ['preferences.html', 'Preferences'],
]);
const links = [...html.matchAll(/<a class="settings-item" href="([^"]+)">([\s\S]*?)<\/a>/g)];

assert.equal(links.length, expected.size, 'All settings destinations must be native links');
for (const [, destination, body] of links) {
  const label = expected.get(destination);
  assert.ok(label, `Unexpected settings destination: ${destination}`);
  assert.ok(body.includes(`<div class="settings-label">${label}</div>`), `Missing accessible link text: ${label}`);
  assert.ok(fs.existsSync(path.resolve(__dirname, '..', destination)), `Missing destination: ${destination}`);
}
assert.doesNotMatch(html, /data-link=/, 'No click-only settings links may remain');
assert.match(html, /a\.settings-item:focus-visible\s*\{/, 'Keyboard focus must be visible');
assert.match(html, /data-journal-theme/, 'Appearance control must remain a button');
assert.match(html, /id="accountsProfileEntry"[^>]*href="\/profile\/accounts"/, 'My accounts link must be preserved');
console.log('Profile settings links: all 4 destinations and keyboard semantics verified');
