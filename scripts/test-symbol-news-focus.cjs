'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../tools/symbol-news.html'), 'utf8');
function section(from, to) {
  const start = html.indexOf(from);
  assert.ok(start !== -1, 'missing production code: ' + from);
  const end = html.indexOf(to, start + from.length);
  assert.ok(end !== -1, 'missing end marker: ' + to);
  return html.slice(start, end);
}

test('preset activation updates symbol without stealing keyboard focus', () => {
  const handler = {};
  let blurs = 0, requested = '';
  const chip = {
    getAttribute: () => 'EURUSD',
    addEventListener: (type, callback) => { handler[type] = callback; },
    blur: () => { blurs += 1; }
  };
  const q = { value: '' };
  const ctx = {
    QUICK_PRESETS: ['EURUSD'],
    el: {
      q,
      chipsWrap: {
        innerHTML: '',
        querySelectorAll: () => [chip]
      }
    },
    document: { activeElement: chip },
    fetchNews: (symbol) => { requested = symbol; }
  };
  const actual = section('    function renderChips(){', '    function escapeHtml(s){');
  vm.runInNewContext(actual + '\nrenderChips();', ctx);
  assert.match(ctx.el.chipsWrap.innerHTML, /EURUSD/);
  assert.equal(typeof handler.click, 'function');
  handler.click();
  assert.equal(q.value, 'EURUSD');
  assert.equal(requested, 'EURUSD');
  assert.equal(blurs, 0, 'keyboard-activated presets must retain focus');
});

test('outside clicks dismiss only the active input, never the clicked control', () => {
  let onClick, active, inputBlurs = 0, buttonBlurs = 0;
  const q = { blur() { inputBlurs += 1; active = null; } };
  const button = { blur() { buttonBlurs += 1; } };
  const ctx = {
    el: {
      q,
      tapDismiss: { addEventListener(type, callback) {
        assert.equal(type, 'click');
        onClick = callback;
      } }
    },
    document: { get activeElement() { return active; } }
  };
  const actual = section('    el.tapDismiss.addEventListener("click"', '\n\n    renderChips();');
  vm.runInNewContext(actual, ctx);
  active = button;
  onClick({ detail: 0, target: button }); // Keyboard/screen reader activation
  assert.equal(buttonBlurs, 0);
  active = q;
  onClick({ detail: 0, target: button }); // Virtual click must not dismiss input
  assert.equal(inputBlurs, 0);
  active = q;
  onClick({ detail: 1, target: q }); // Tap in the input
  assert.equal(inputBlurs, 0);
  active = q;
  onClick({ detail: 1, target: button }); // Outside pointer click
  assert.equal(inputBlurs, 1);
  active = button;
  onClick({ detail: 1, target: button });
  assert.equal(buttonBlurs, 0);
});

test('loading and failures have accessible announcements', () => {
  assert.match(html, /<div class="loadingRow" id="loadingRow" role="status" aria-live="polite">/);
  assert.match(html, /<div class="errorBox" id="errorBox" role="alert">/);
  assert.match(html, /el\.list\.setAttribute\("aria-busy", String\(isLoading\)\)/);
});
