'use strict';

// Guard the keyboard bypass and landmark on FYNX's primary public landing page.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const count = (pattern) => [...html.matchAll(pattern)].length;
const at = (text) => html.indexOf(text);

assert.equal(count(/<main\b/g), 1, 'Homepage must expose one main landmark');
assert.equal(count(/<\/main>/g), 1, 'Main landmark must close exactly once');
assert.equal(count(/class="fynx-skip-link"/g), 1, 'Keep exactly one skip link');
assert.ok(html.includes('<a class="fynx-skip-link" href="#fynx-main">Skip to main content</a>'));
assert.ok(html.includes('<main id="fynx-main" tabindex="-1">'));
assert.ok(at('class="fynx-skip-link"') > at('<body '), 'Skip link belongs in body');
assert.ok(at('class="fynx-skip-link"') < at('<!-- company-products:launch:start -->'), 'Skip link must be first among interactive page content');
assert.ok(at('class="fynx-skip-link"') < at('<header id="header">'), 'Skip link must precede navigation');
assert.ok(at('<main id="fynx-main"') < at('<!-- Hero Section -->'), 'Main must contain the hero');
assert.ok(at('<h1>') > at('<main id="fynx-main"'), 'Main must contain the page heading');
assert.ok(at('</main>') < at('<!-- Footer -->'), 'Footer must remain outside main');
assert.match(html, /\.fynx-skip-link:focus-visible\s*\{/);
assert.match(html, /\.fynx-skip-link:focus,\s*\.fynx-skip-link:focus-visible/);

// Exercise the real build step: generated navigation must not overtake the bypass.
const os = require('node:os');
const { inject } = require('./build-company-products.cjs');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fynx-landmark-'));
try {
  fs.writeFileSync(path.join(fixture, 'index.html'), html);
  for (let pass = 0; pass < 2; pass++) {
    inject(fixture);
    const built = fs.readFileSync(path.join(fixture, 'index.html'), 'utf8');
    assert.ok(built.indexOf('class="fynx-skip-link"') < built.indexOf('<!-- company-products:launch:start -->'), 'Build must preserve the skip link before generated navigation');
    assert.equal([...built.matchAll(/class="fynx-skip-link"/g)].length, 1, 'Build must not duplicate the bypass');
  }
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

console.log('Homepage accessibility: skip link, main landmark, and keyboard focus checks passed.');
