'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = readFileSync(path.join(__dirname, '../assets/js/settings-shell.js'), 'utf8');

function run({page, scrollWidth, clientWidth, selectedLeft, selectedWidth = 90}) {
  let focusedDocumentScroll = 0;
  const makeNode = tag => ({
    tagName: tag.toUpperCase(), className: '', textContent: '', href: '', hidden: false,
    attributes: {}, children: [], style: {}, scrollLeft: 0,
    classList: { add() {} },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    append(...nodes) { this.children.push(...nodes); },
    prepend(...nodes) { this.children.unshift(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    addEventListener() {},
    scrollIntoView() { focusedDocumentScroll++; },
    getBoundingClientRect() { return {left: this.left ?? 0, width: this.width ?? 90}; },
    querySelector(selector) {
      if (selector === '[aria-current="page"]' || selector === '[aria-current]') return this.children.find(n => n.attributes['aria-current'] === 'page') || null;
      if (selector === 'h2') return null;
      return null;
    }
  });
  let nav;
  const area = makeNode('main');
  area.querySelector = selector => selector === '.st-tabs' ? nav : selector === ':scope > .section-header, :scope > div:first-child' ? null : null;
  area.prepend = (...nodes) => { nav = nodes.find(n => n.tagName === 'NAV'); };
  const document = {
    readyState: 'complete', body: {dataset: {fynxSettings: page}}, title: 'FYNX Account settings',
    createElement(tag) {
      const el = makeNode(tag);
      if (tag === 'nav') {
        el.scrollWidth = scrollWidth; el.clientWidth = clientWidth;
        el.width = clientWidth; el.left = 0;
      }
      if (tag === 'a') { el.width = selectedWidth; el.left = selectedLeft; }
      return el;
    },
    querySelector(selector) { return selector === '.content-area' ? area : null; }
  };
  const window = {FynxIdentity: {}, addEventListener() {}};
  vm.runInNewContext(source, {document,window,console}, {filename:'settings-shell.js'});
  assert.ok(nav, 'settings nav was inserted');
  const current = nav.querySelector('[aria-current="page"]');
  assert.ok(current, 'active page is marked for assistive technology');
  return {nav, current, focusedDocumentScroll};
}

test('centers current tab within horizontal settings strip on narrow iPhone', () => {
  const {nav,current,focusedDocumentScroll} = run({page:'notifications',scrollWidth:1200,clientWidth:350,selectedLeft:710,selectedWidth:110});
  assert.equal(current.textContent,'Notifications');
  assert.equal(Math.round(nav.scrollLeft),590);
  assert.equal(focusedDocumentScroll,0,'must not scroll the entire document past the page heading');
});

test('does not move a non-overflowing settings strip', () => {
  const {nav,focusedDocumentScroll} = run({page:'profile',scrollWidth:900,clientWidth:900,selectedLeft:25});
  assert.equal(nav.scrollLeft,0);
  assert.equal(focusedDocumentScroll,0);
});

test('renders offscreen last item as current and brings it into the scrollable strip only', () => {
  const {nav,current,focusedDocumentScroll} = run({page:'membership',scrollWidth:1500,clientWidth:320,selectedLeft:1400,selectedWidth:100});
  assert.equal(current.textContent,'Membership');
  assert.ok(nav.scrollLeft>1000);
  assert.equal(focusedDocumentScroll,0);
});
