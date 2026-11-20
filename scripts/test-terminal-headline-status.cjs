'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const terminalHTML = fs.readFileSync(path.join(root, 'terminal.html'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'assets/js/terminal/app.js'), 'utf8');
const startTag = '  function renderNews() {';
const endTag = '\n  /* --- quote rows';
const begin = appSource.indexOf(startTag);
const end = appSource.indexOf(endTag, begin);
assert(begin >= 0 && end > begin, 'Find the real Terminal renderNews implementation');
// Exercise the actual rendering function rather than a duplicated model.
const makeRenderer = new Function('S', 'D', '$', 'el', 'btn', 'hhmm', 'openPage',
  appSource.slice(begin, end) + '\nreturn renderNews;');

function setup(t) {
  const dom = new JSDOM(terminalHTML, {
    url: 'https://www.fynxfinanceworld.com/terminal.html'
  });
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const state = { briefing: [], desks: [] };
  let category = 'all';
  const opened = [];
  const el = (tag, cssClass, textValue) => {
    const node = document.createElement(tag);
    if (cssClass) node.className = cssClass;
    if (textValue != null) node.textContent = String(textValue);
    return node;
  };
  const btn = (label, cssClass, handler) => {
    const node = el('button', cssClass, label);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  };
  const render = makeRenderer(state, () => ({ news: category }), id => document.getElementById(id),
    el, btn, () => '08:00', (...args) => opened.push(args));
  return {
    document, state, render, opened,
    setCategory: value => { category = value; },
    status: () => document.getElementById('fx-headline-feed-status'),
    track: () => document.getElementById('fx-news-track'),
    pause: () => document.getElementById('fx-news-pause')
  };
}

function story(title = 'Verified headline') {
  return { title, source: 'FYNX source', publishedAt: '2026-11-20T08:00:00Z' };
}

test('initial markup describes a loading, possibly delayed feed without promising LIVE', t => {
  const h = setup(t);
  assert.equal(h.status().textContent, 'LOADING');
  assert.equal(h.pause().disabled, true);
  const badge = h.document.querySelector('.fx-news .fx-livebadge');
  assert.equal(badge.getAttribute('role'), 'status');
  assert.equal(badge.getAttribute('aria-live'), 'polite');
  assert.doesNotMatch(badge.textContent, /\bLIVE\b/i);
  assert.match(h.document.querySelector('.fx-news').getAttribute('aria-label'), /may be delayed/);
});

test('empty response explains unavailability and prevents unusable Pause interaction', t => {
  const h = setup(t);
  h.render();
  assert.equal(h.status().textContent, 'UNAVAILABLE');
  assert.equal(h.pause().disabled, true);
  assert.match(h.track().textContent, /temporarily unavailable/);
  assert.equal(h.track().classList.contains('run'), false);
});

test('available headlines enable Pause, keep links functional, and never claim a live connection', t => {
  const h = setup(t);
  h.state.briefing = [story()];
  h.render();
  assert.equal(h.status().textContent, 'HEADLINES');
  assert.equal(h.pause().disabled, false);
  assert.doesNotMatch(h.status().textContent, /live/i);
  const links = h.track().querySelectorAll('.fx-hl');
  assert.equal(links.length, 2, 'a duplicate set supports the ticker animation');
  assert.equal(links[1].tabIndex, -1);
  assert.equal(links[1].getAttribute('aria-hidden'), 'true');
  links[0].click();
  assert.equal(h.opened.length, 1);
  assert.equal(h.opened[0][0], 'article');
});

test('regional feed fallback labels previously loaded global stories as headlines, not LIVE', t => {
  const h = setup(t);
  h.setCategory('forex');
  h.state.desks.forex = { items: [] };
  h.state.briefing = [story('Fallback global story')];
  h.render();
  assert.equal(h.status().textContent, 'HEADLINES');
  assert.match(h.track().textContent, /Fallback global story/);
});

test('feed loss after success restores unavailable state and disables stale controls', t => {
  const h = setup(t);
  h.state.briefing = [story()];
  h.render();
  assert.equal(h.pause().disabled, false);
  h.state.briefing = [];
  h.render();
  assert.equal(h.status().textContent, 'UNAVAILABLE');
  assert.equal(h.pause().disabled, true);
  assert.equal(h.track().querySelectorAll('.fx-hl').length, 0);
});
