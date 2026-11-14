/* Account disclosure semantics and keyboard navigation regression. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/account-menu.js'), 'utf8');
const navSource = fs.readFileSync(path.join(__dirname, '../fynx-nav.js'), 'utf8');

function setup(signedIn = true) {
  const dom = new JSDOM('<div class="user-avatar" id="avatarInitials"></div><a id="outside" href="/home.html">Outside</a>', {
    url: 'https://www.fynxfinanceworld.com/home.html',
    runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  w.FynxIdentity = signedIn ? { uid: 'trader123', displayName: 'FYNX Trader' } : {};
  let loginRequests = 0;
  w.FynxAuth = { open: () => { loginRequests++; } };
  w.eval(source);
  const button = w.document.querySelector('button.fx-acct-btn');
  return {
    w, button,
    menu: () => w.document.querySelector('.fx-acct-menu'),
    outside: w.document.querySelector('#outside'),
    loginRequests: () => loginRequests,
    close: () => w.close()
  };
}

test('account links are a labelled disclosure navigation, not a false ARIA application menu', () => {
  const app = setup();
  try {
    const menu = app.menu();
    assert.equal(menu.tagName, 'NAV');
    assert.equal(menu.getAttribute('aria-label'), 'Account navigation');
    assert.equal(app.button.getAttribute('aria-controls'), menu.id);
    assert.equal(app.button.getAttribute('aria-expanded'), 'false');
    assert.equal(app.button.hasAttribute('aria-haspopup'), false);
    app.button.click();
    assert.equal(app.button.getAttribute('aria-expanded'), 'true');
    assert.equal(menu.hidden, false);
    assert.equal(menu.querySelectorAll('[role="menuitem"]').length, 0);
    assert.ok(menu.querySelectorAll('a').length >= 10);
    assert.ok(menu.querySelector('button.fx-acct-out'));
    assert.equal(app.w.document.activeElement, menu.querySelector('a'));
  } finally { app.close(); }
});

test('Tab-style focus moves through account links and closes when focus exits', () => {
  const app = setup();
  try {
    app.button.click();
    const menu = app.menu();
    const links = [...menu.querySelectorAll('a')];
    links[2].focus();
    assert.equal(app.w.document.activeElement, links[2]);
    assert.equal(menu.hidden, false);
    menu.querySelector('button.fx-acct-out').focus();
    assert.equal(menu.hidden, false);
    app.outside.focus();
    assert.equal(menu.hidden, true);
    assert.equal(app.button.getAttribute('aria-expanded'), 'false');
    app.button.click();
    assert.equal(menu.hidden, false, 'must reopen after focus-exit closure');
  } finally { app.close(); }
});

test('Escape returns focus to trigger; outside click closes; signed-out trigger retains login flow', () => {
  const app = setup();
  try {
    app.button.click();
    const link = app.menu().querySelector('a');
    link.dispatchEvent(new app.w.KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
    assert.equal(app.menu().hidden, true);
    assert.equal(app.w.document.activeElement, app.button);
    app.button.click();
    app.outside.click();
    assert.equal(app.menu().hidden, true);
  } finally { app.close(); }
  const guest = setup(false);
  try {
    guest.button.click();
    assert.equal(guest.loginRequests(), 1);
    assert.equal(guest.menu().hidden, true);
  } finally { guest.close(); }
});

test('visible focus indication, compact touch targets and versioned asset', () => {
  assert.match(source, /a\.fx-acct-item:focus-visible\{[^}]*outline:2px solid/);
  assert.match(source, /a\.fx-acct-item\{[^}]*min-height:44px/);
  assert.match(source, /\.fx-acct-out\{min-height:44px/);
  assert.match(navSource, /account-menu\.js\?v=20261114-consistency-1/);
});
