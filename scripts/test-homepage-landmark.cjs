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

console.log('Homepage accessibility: skip link, main landmark, and keyboard focus checks passed.');
