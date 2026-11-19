'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const start = html.indexOf('<!-- MOBILE OVERLAY + DRAWER (NEW) -->');
const end = html.indexOf('<!-- HOME SUB-NAV -->', start);
assert.ok(start !== -1 && end > start, 'The real homepage mobile drawer must exist');
const drawerMarkup = html.slice(start, end);
const sections = ['home', 'homeMarkets', 'learn', 'tools', 'news'];

function setup() {
  // Exercise the actual production drawer markup and script, not a duplicated menu.
  const stubIds = [
    'toolsSubnav', 'newsSubnav', 'learnSubnav', 'learnDetailSubnav',
    'homeSubnav', 'homeMarketsSubnav', 'learnDetailCaption',
    'learnHowTo', 'learnQuizzes', 'learnGlossary'
  ];
  const fixtures = stubIds.map(id => '<div id="' + id + '"></div>').join('');
  const dom = new JSDOM('<!doctype html><html><body>' +
    '<header id="header"><button type="button" id="mobileMenuBtn" aria-expanded="false" aria-label="Open menu"></button></header>' +
    '<div class="animated-bg"></div>' + fixtures + drawerMarkup + '</body></html>', {
    url: 'https://www.fynxfinanceworld.com/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const w = dom.window;
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.scrollTo = () => {};
  w.eval(source);
  const get = name => w.document.querySelector('.m-accordion[data-acc="' + name + '"]');
  const button = name => get(name).querySelector(':scope > .m-acc-btn');
  const panel = name => get(name).querySelector(':scope > .m-acc-panel');
  return { w, get, button, panel, close: () => w.close() };
}

test('mobile drawer disclosures are labelled, initially collapsed and not tabbable', () => {
  const app = setup();
  try {
    const drawer = app.w.document.getElementById('mobileDrawer');
    assert.equal(drawer.getAttribute('aria-hidden'), 'true');
    assert.ok(drawer.hasAttribute('inert'));
    assert.equal(app.w.document.querySelectorAll('.m-acc-btn').length, sections.length);
    for (const name of sections) {
      const button = app.button(name), panel = app.panel(name);
      assert.equal(button.getAttribute('aria-expanded'), 'false', name);
      assert.equal(button.getAttribute('aria-controls'), panel.id, name);
      assert.ok(panel.id, 'panel must have a stable ID');
      assert.equal(panel.getAttribute('aria-hidden'), 'true', name);
      assert.ok(panel.hasAttribute('inert'), 'closed panel must not expose links');
    }
    const ids = sections.map(name => app.panel(name).id);
    assert.equal(new Set(ids).size, sections.length, 'panel IDs must be unique');
  } finally { app.close(); }
});

test('opening drawer and nested Markets updates screen-reader and focus states', () => {
  const app = setup();
  try {
    const w = app.w, trigger = w.document.getElementById('mobileMenuBtn');
    trigger.click();
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(trigger.getAttribute('aria-label'), 'Close menu');
    assert.equal(w.document.getElementById('mobileDrawer').hasAttribute('inert'), false);
    assert.equal(w.document.activeElement.id, 'mobileCloseBtn');
    app.button('home').click();
    assert.equal(app.button('home').getAttribute('aria-expanded'), 'true');
    assert.equal(app.panel('home').hasAttribute('inert'), false);
    assert.equal(app.button('homeMarkets').getAttribute('aria-expanded'), 'false');
    assert.equal(app.panel('homeMarkets').hasAttribute('inert'), true);
    app.button('homeMarkets').click();
    assert.equal(app.button('homeMarkets').getAttribute('aria-expanded'), 'true');
    assert.equal(app.panel('homeMarkets').hasAttribute('inert'), false);
    app.button('home').click();
    assert.equal(app.button('home').getAttribute('aria-expanded'), 'false');
    assert.equal(app.button('homeMarkets').getAttribute('aria-expanded'), 'false', 'collapsing parent resets nested disclosures');
    assert.ok(app.panel('homeMarkets').hasAttribute('inert'));
    app.button('home').click();
    assert.equal(app.button('homeMarkets').getAttribute('aria-expanded'), 'false', 'reopening parent keeps nested panel closed');
  } finally { app.close(); }
});

test('opening another main section closes previous section without exposing its links', () => {
  const app = setup();
  try {
    app.w.document.getElementById('mobileMenuBtn').click();
    app.button('home').click();
    app.button('homeMarkets').click();
    app.button('learn').click();
    assert.equal(app.button('home').getAttribute('aria-expanded'), 'false');
    assert.equal(app.button('homeMarkets').getAttribute('aria-expanded'), 'false');
    assert.ok(app.panel('home').hasAttribute('inert'));
    assert.ok(app.panel('homeMarkets').hasAttribute('inert'));
    assert.equal(app.button('learn').getAttribute('aria-expanded'), 'true');
    assert.equal(app.panel('learn').hasAttribute('inert'), false);
  } finally { app.close(); }
});

test('Escape closes the drawer, resets sections and returns focus to its trigger', () => {
  const app = setup();
  try {
    const w = app.w, toggle = w.document.getElementById('mobileMenuBtn');
    toggle.click();
    app.button('tools').click();
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(w.document.body.classList.contains('mobile-menu-open'), false);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(toggle.getAttribute('aria-label'), 'Open menu');
    assert.equal(w.document.getElementById('mobileDrawer').getAttribute('aria-hidden'), 'true');
    assert.ok(w.document.getElementById('mobileDrawer').hasAttribute('inert'));
    assert.equal(app.button('tools').getAttribute('aria-expanded'), 'false');
    assert.ok(app.panel('tools').hasAttribute('inert'));
    assert.equal(w.document.activeElement, toggle);
    toggle.click();
    assert.equal(app.button('tools').getAttribute('aria-expanded'), 'false', 'a reopened drawer starts collapsed');
  } finally { app.close(); }
});

test('overlay and close-button dismissals return keyboard focus', () => {
  const app = setup();
  try {
    const w = app.w, toggle = w.document.getElementById('mobileMenuBtn');
    toggle.click();
    w.document.getElementById('mobileOverlay').click();
    assert.equal(w.document.activeElement, toggle);
    assert.ok(w.document.getElementById('mobileDrawer').hasAttribute('inert'));
    toggle.click();
    w.document.getElementById('mobileCloseBtn').click();
    assert.equal(w.document.activeElement, toggle);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  } finally { app.close(); }
});

test('nested CSS disclosure applies only to direct panels and keyboard focus is visible', () => {
  assert.match(styles, /\.m-accordion\.open\s*>\s*\.m-acc-panel\s*\{/);
  assert.doesNotMatch(styles, /\.m-accordion\.open\s+\.m-acc-panel\s*\{/);
  assert.match(styles, /\.m-acc-btn:focus-visible\s*\{\s*outline:/);
});
