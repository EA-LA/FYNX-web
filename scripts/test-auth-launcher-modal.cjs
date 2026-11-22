const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.resolve(__dirname, '../assets/js/auth-launcher.js'), 'utf8');

function mount() {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main id="page"><a id="signIn" href="/auth/login.html">Sign in</a><button id="other">Other action</button></main><aside id="alreadyInert" inert>Reserved</aside></body></html>', {
    url: 'https://www.fynxfinanceworld.com/home.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.eval(source);
  const page = window.document.getElementById('page');
  const originalInert = window.document.getElementById('alreadyInert');
  const signIn = window.document.getElementById('signIn');
  return { window, page, originalInert, signIn, close: () => window.close() };
}

test('sign-in prevents focus reaching underlying page and restores previous inert state', () => {
  const ui = mount();
  try {
    ui.signIn.focus();
    ui.window.FynxAuth.open('login');
    const dialog = ui.window.document.querySelector('.fx-signin');
    const close = dialog.querySelector('.fx-signin-close');
    assert.equal(dialog.hidden, false);
    assert.equal(ui.page.hasAttribute('inert'), true);
    assert.equal(ui.originalInert.hasAttribute('inert'), true);
    assert.equal(ui.window.document.activeElement, close);

    // Simulate code or an older WebView trying to focus outside the modal.
    ui.window.document.getElementById('other').focus();
    assert.equal(ui.window.document.activeElement, close);

    ui.window.FynxAuth.close();
    assert.equal(dialog.hidden, true);
    assert.equal(ui.page.hasAttribute('inert'), false);
    assert.equal(ui.originalInert.hasAttribute('inert'), true);
    assert.equal(ui.window.document.activeElement, ui.signIn);
  } finally { ui.close(); }
});

test('opening a second sign-in view preserves the original focus return target', () => {
  const ui = mount();
  try {
    ui.signIn.focus();
    ui.window.FynxAuth.open('login');
    ui.window.FynxAuth.open('signup');
    assert.equal(ui.page.hasAttribute('inert'), true);
    ui.window.document.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(ui.window.document.querySelector('.fx-signin').hidden, true);
    assert.equal(ui.page.hasAttribute('inert'), false);
    assert.equal(ui.window.document.activeElement, ui.signIn);

    ui.window.FynxAuth.open('forgot');
    assert.equal(ui.page.hasAttribute('inert'), true);
    ui.window.FynxAuth.close();
    assert.equal(ui.page.hasAttribute('inert'), false);
  } finally { ui.close(); }
});

test('the existing login link still opens an in-page dialog', () => {
  const ui = mount();
  try {
    const ev = new ui.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    ui.signIn.dispatchEvent(ev);
    const dialog = ui.window.document.querySelector('.fx-signin');
    assert.equal(ev.defaultPrevented, true);
    assert.equal(dialog.hidden, false);
    assert.equal(ui.page.hasAttribute('inert'), true);
    assert.match(dialog.querySelector('iframe').src, /\/auth\/login\.html\?embed=1/);
    ui.window.FynxAuth.close();
  } finally { ui.close(); }
});

test('Escape in the same-origin sign-in iframe closes the dialog', () => {
  const ui = mount();
  try {
    ui.signIn.focus();
    ui.window.FynxAuth.open('login');
    const dialog = ui.window.document.querySelector('.fx-signin');
    const frame = dialog.querySelector('iframe');
    assert.ok(frame.contentDocument, 'Same-origin iframe document is available in this test');
    frame.dispatchEvent(new ui.window.Event('load'));
    frame.contentDocument.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(dialog.hidden, true);
    assert.equal(ui.page.hasAttribute('inert'), false);
  } finally { ui.close(); }
});
