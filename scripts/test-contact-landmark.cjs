'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {inject} = require('./build-company-products.cjs');

const html = fs.readFileSync(path.resolve(__dirname, '../contact.html'), 'utf8');
const occurrences = regex => [...html.matchAll(regex)].length;
const skip = '<a class="contact-skip" href="#contact-main">Skip to main content</a>';
assert.equal(occurrences(/<main\\b/g), 1, 'Contact page should have one main landmark');
assert.equal(occurrences(/<\\/main>/g), 1, 'Main landmark should close exactly once');
assert.equal(occurrences(/class="contact-skip"/g), 1, 'Keep one keyboard bypass');
assert.ok(html.includes(skip), 'Skip link should target the contact page main landmark');
assert.ok(html.includes('<main class="contact-page" id="contact-main" tabindex="-1">'), 'Main must be keyboard focusable after bypass');
assert.ok(html.indexOf(skip) > html.indexOf('<body '), 'Skip link belongs in body');
assert.ok(html.indexOf(skip) < html.indexOf('<!-- company-products:launch:start -->'), 'Skip link must precede generated Products navigation');
assert.ok(html.indexOf(skip) < html.indexOf('<header>'), 'Skip link must precede header links');
assert.match(html, /\\.contact-skip:focus-visible,\\s*\\.contact-skip:focus\\s*\\{/);
assert.match(html, /\\.contact-skip\\{[^}]*transform:translateY\\(/, 'Skip link stays out of view until focused');
assert.match(html, /\\.contact-skip:focus-visible,\\s*\\.contact-skip:focus\\{[^}]*transform:none;/, 'Keyboard focus reveals the skip link');
assert.match(html, /mailto:fynxteam5@gmail\\.com/, 'Existing support contact is preserved');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fynx-contact-landmark-'));
try {
  fs.writeFileSync(path.join(temp, 'contact.html'), html);
  for (let pass = 0; pass < 2; pass++) {
    inject(temp);
    const built = fs.readFileSync(path.join(temp, 'contact.html'), 'utf8');
    assert.ok(built.indexOf(skip) < built.indexOf('<!-- company-products:launch:start -->'), 'Generated product navigation must not overtake the bypass');
    assert.equal([...built.matchAll(/class="contact-skip"/g)].length, 1, 'Build must not duplicate skip link');
  }
} finally {
  fs.rmSync(temp, {recursive:true,force:true});
}
console.log('Contact accessibility: keyboard skip, main landmark, support links and repeated build verified');
