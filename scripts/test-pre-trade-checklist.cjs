const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');
const html = read('trading-psychology.html');
const script = read('assets/js/pre-trade-checklist.js');

function page(t) {
  const { window } = new JSDOM(html, { runScripts: 'outside-only' });
  t.after(() => window.close());
  return window;
}

test('the original six entry points and separate mental filter remain usable without JS', (t) => {
  const { document } = page(t);
  assert.equal(document.querySelectorAll('#pre-trade-checklist ul > li').length, 11);
  assert.equal(document.querySelectorAll('[data-pretrade-criteria] li').length, 6);
  assert.equal(document.querySelectorAll('#pre-trade-checklist input').length, 0);
  assert.equal(document.querySelector('[data-pretrade-controls]').hidden, true);
  assert.ok(document.querySelector('a[href="#pre-trade-checklist"]'));
  assert.ok(document.querySelector('script[src^="/assets/js/pre-trade-checklist.js"]'));
});

test('only the six positive criteria become individually named checkboxes', (t) => {
  const window = page(t);
  const { document } = window;
  window.eval(script);

  const checks = [...document.querySelectorAll('#pre-trade-checklist input[type=checkbox]')];
  assert.equal(checks.length, 6);
  assert.ok(checks.every((check) => check.labels.length === 1 && !check.checked));
  assert.match(checks[0].labels[0].textContent, /Market selected/);
  assert.match(checks[5].labels[0].textContent, /Emotion checked/);
  assert.equal(document.querySelector('[data-pretrade-controls]').hidden, false);
});

test('progress follows check, uncheck and reset without making a trade recommendation or saving data', (t) => {
  const window = page(t);
  const { document } = window;
  window.eval(script);

  const checks = [...document.querySelectorAll('[data-pretrade-criteria] input')];
  const status = document.querySelector('[role=status][data-pretrade-progress]');
  const reset = document.querySelector('[data-pretrade-reset]');
  assert.equal(status.textContent, '0 of 6 checked');
  checks[1].click();
  checks[4].click();
  assert.equal(status.textContent, '2 of 6 checked');
  checks[1].click();
  assert.equal(status.textContent, '1 of 6 checked');
  checks.filter((check) => !check.checked).forEach((check) => check.click());
  assert.equal(status.textContent, '6 of 6 checked');
  assert.match(reset.parentElement.textContent, /doesn’t tell you whether a trade is safe or advisable/);
  reset.focus();
  reset.click();
  assert.ok(checks.every((check) => !check.checked));
  assert.equal(status.textContent, '0 of 6 checked');
  assert.equal(document.activeElement, reset);
  assert.doesNotMatch(script, /localStorage|sessionStorage|FynxPreferences|fetch\s*\(|sendBeacon/);
});
