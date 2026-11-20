'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const html = readFileSync(join(__dirname, '..', 'app-return.html'), 'utf8');

test('login return presents a main landmark and a programmatic heading', () => {
  assert.match(html, /<main class="card" aria-labelledby="signin-title">/);
  assert.match(html, /<h1 class="title" id="signin-title">/);
  assert.match(html, /<\/main>/);
});

test('Firebase ticket verification progress is announced to assistive technology', () => {
  assert.match(html, /id="msg" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /msg\.textContent = "Verifying ticket…"/);
  assert.match(html, /msg\.textContent = "Signing in…"/);
  assert.match(html, /msg\.textContent = text;/);
  assert.match(html, /class="spinner" aria-hidden="true"/);
});

test('users can recover from stalled scripts or disabled JavaScript', () => {
  assert.match(html, /Taking too long\? <a href="\/auth\/login\.html">Return to sign in<\/a>/);
  assert.match(html, /<noscript><p class="text retry">JavaScript is required/);
});

test('return screen remains usable on short iPhones and respects reduced motion', () => {
  assert.match(html, /min-height:100svh/);
  assert.match(html, /padding:16px; display:grid/);
  assert.match(html, /width:min\(520px, 100%\)/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /\.retry a:focus-visible/);
});

test('existing ticket exchange and safe navigation remain intact', () => {
  assert.match(html, /safeReturnTo\(url\.searchParams\.get\("returnTo"\)\)/);
  assert.match(html, /httpsCallable\(functions, "exchangeWebLoginTicket"\)/);
  assert.match(html, /await signInWithCustomToken\(auth, customToken\)/);
  assert.match(html, /window\.location\.href = returnTo;/);
});
