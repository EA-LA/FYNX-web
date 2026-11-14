'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/partners-directory.js'), 'utf8');

function node(id = '') {
  const events = {}, attributes = {}, scrolls = [];
  const element = {
    id, hidden: false, value: '', textContent: '', dataset: {}, href: '', scrolls,
    classList: { values: new Set(), toggle(name, enabled) {
      if (enabled) this.values.add(name); else this.values.delete(name);
    } },
    setAttribute(name, value) { attributes[name] = value; },
    getAttribute(name) { return attributes[name] ?? null; },
    removeAttribute(name) { delete attributes[name]; },
    addEventListener(type, listener) { (events[type] ||= []).push(listener); },
    dispatch(type) { const event = { prevented: false, preventDefault() { this.prevented = true; } }; (events[type] || []).forEach(fn => fn(event)); return event; },
    scrollIntoView(options) { scrolls.push(options); },
    focus() { this.focused = true; },
    querySelectorAll() { return []; }
  };
  return element;
}
function setup({ reducedMotion = false, hash = '' } = {}) {
  const sections = ['funded', 'brokers', 'trading-tools'].map(id => node(id));
  const cards = sections.map((section, i) => {
    const card = node();
    card.textContent = ['FTMO Funded Platform', 'IC Markets Broker', 'Tradezella Trading Tool'][i];
    section.querySelectorAll = selector => selector === '.partner-card' ? [card] : [];
    return card;
  });
  const links = ['all', ...sections.map(s => s.id)].map(id => {
    const link = node(); link.dataset.partnerCategory = id; link.setAttribute('href', '#' + id); return link;
  });
  const elements = {
    partnerSearch: node(), clearPartnerSearch: node(), partnerResultCount: node(),
    partnerEmpty: node(), resetPartnerFilters: node(), all: node('all')
  };
  for (const section of sections) elements[section.id] = section;
  const location = { hash, pathname: '/partners.html', search: '' };
  const history = {
    paths: [],
    pushState(state, title, next) { this.paths.push(next); location.hash = '#' + next.split('#')[1]; },
    replaceState(state, title, next) { this.paths.push(next); location.hash = '#' + next.split('#')[1]; }
  };
  const events = {};
  const window = {
    matchMedia: () => ({ matches: reducedMotion }),
    addEventListener(type, fn) { (events[type] ||= []).push(fn); }
  };
  const document = {
    getElementById(id) { return elements[id] || null; },
    querySelectorAll(selector) {
      if (selector === '.partner-section') return sections;
      if (selector === '[data-partner-category]') return links;
      return [];
    }
  };
  vm.runInNewContext(source, { document, window, history, location }, { filename: 'partners-directory.js' });
  function click(category) { return links.find(link => link.dataset.partnerCategory === category).dispatch('click'); }
  function totalScrolls() { return [...sections, elements.all, elements.partnerEmpty].reduce((n, el) => n + el.scrolls.length, 0); }
  return { sections, cards, links, elements, location, history, window, events, click, totalScrolls };
}

test('selecting a platform category reveals its cards and preserves the shareable hash', () => {
  const app = setup();
  const event = app.click('brokers');
  assert.equal(event.prevented, true);
  assert.equal(app.location.hash, '#brokers');
  assert.equal(app.sections[1].hidden, false);
  assert.equal(app.sections[0].hidden, true);
  assert.equal(app.sections[1].scrolls.length, 1);
  assert.equal(app.sections[1].scrolls[0].block, 'start');
  assert.equal(app.sections[1].scrolls[0].behavior, 'smooth');
  assert.equal(app.totalScrolls(), 1);
  assert.equal(app.elements.partnerResultCount.textContent, '1 platform');
});

test('reduced-motion users do not receive animated scrolling', () => {
  const app = setup({ reducedMotion: true });
  app.click('funded');
  assert.equal(app.sections[0].scrolls[0].behavior, 'auto');
});

test('all-platforms filter navigates to the beginning of results', () => {
  const app = setup({ hash: '#brokers' });
  app.click('all');
  assert.equal(app.location.hash, '#all');
  assert.equal(app.elements.all.scrolls.length, 1);
  assert.equal(app.elements.partnerResultCount.textContent, '3 platforms');
});

test('when a search has no matches, category selection reveals the empty-state recovery', () => {
  const app = setup();
  app.elements.partnerSearch.value = 'not a listed platform';
  app.elements.partnerSearch.dispatch('input');
  app.click('funded');
  assert.equal(app.elements.partnerEmpty.hidden, false);
  assert.equal(app.elements.partnerEmpty.scrolls.length, 1);
  assert.equal(app.sections[0].scrolls.length, 0);
});

test('typing, hash changes, and browser history do not unexpectedly move the viewport', () => {
  const app = setup();
  app.elements.partnerSearch.value = 'FTMO';
  app.elements.partnerSearch.dispatch('input');
  app.location.hash = '#funded';
  for (const fn of app.events.popstate) fn();
  for (const fn of app.events.hashchange) fn();
  assert.equal(app.totalScrolls(), 0);
});
