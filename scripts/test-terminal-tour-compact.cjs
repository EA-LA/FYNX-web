'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/terminal/tour.js'), 'utf8');

function harness(t, {height = 280, cardHeight = 640} = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><button id="fx-command">Command</button><main id="fx-main" aria-busy="false"></main></body></html>', {
    url: 'https://www.fynxfinanceworld.com/terminal.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  Object.defineProperty(w, 'innerHeight', {configurable: true, value: height});
  Object.defineProperty(w, 'innerWidth', {configurable: true, value: 320});
  Object.defineProperty(w.HTMLElement.prototype, 'offsetWidth', {configurable: true, get() {
    return this.classList.contains('fx-tour-card') ? 296 : 160;
  }});
  Object.defineProperty(w.HTMLElement.prototype, 'offsetHeight', {configurable: true, get() {
    return this.classList.contains('fx-tour-card') ? cardHeight : 40;
  }});
  w.requestAnimationFrame = callback => { callback(0); return 1; };
  w.cancelAnimationFrame = () => {};
  w.matchMedia = () => ({matches: true});
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.document.querySelector('#fx-command').getBoundingClientRect = () => ({
    width: 160, height: 40, left: 20, right: 180, top: 80, bottom: 120
  });
  w.eval(source);
  const el = (tag, className, textValue) => {
    const node = w.document.createElement(tag);
    if (className) node.className = className;
    if (textValue) node.textContent = textValue;
    return node;
  };
  const btn = (label, cls, handler) => {
    const node = el('button', cls, label);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  };
  const svg = (tag, attrs = {}) => {
    const node = w.document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  assert.equal(w.FynxTerminalPlugins.length, 1);
  w.FynxTerminalPlugins[0]({
    el, btn, svg, $: id => w.document.getElementById(id),
    PAGE_NAMES: [], report: () => {}
  });
  const command = w.document.getElementById('fx-command');
  command.focus();
  w.FynxTerminalTour.start();
  return {w, command, card: w.document.querySelector('.fx-tour-card')};
}

test('guided tour constrains its dialog and keeps navigation reachable on short screens', t => {
  const h = harness(t, {height: 280, cardHeight: 640});
  assert(h.card, 'Tour dialog is rendered');
  assert.equal(h.card.getAttribute('aria-modal'), 'true');
  const css = h.w.document.querySelector('#fx-tour-style').textContent;
  assert.match(css, /\.fx-tour-card\{[^}]*max-height:calc\(100dvh - 24px\)/);
  assert.match(css, /\.fx-tour-card\{[^}]*overflow-y:auto/);
  assert.match(css, /\.fx-tour-foot\{[^}]*position:sticky;bottom:0/);
  h.card.querySelector('.fx-tour-next').click(); // Advance to a real highlighted control.
  assert.equal(h.card.querySelector('.fx-tour-head h2').textContent, 'Command bar');
  // Previously placed the dialog at a negative pixel offset on a short viewport.
  assert.equal(h.card.style.top, '12px');
});

test('regular-height viewports preserve a visible dialog placement and keyboard navigation', t => {
  const h = harness(t, {height: 720, cardHeight: 230});
  h.card.querySelector('.fx-tour-next').click();
  const top = Number.parseInt(h.card.style.top, 10);
  assert(Number.isFinite(top));
  assert(top >= 12 && top <= 720 - 230 - 12, 'Tour remains within viewport');
  assert.equal(h.w.document.activeElement, h.card.querySelector('.fx-tour-next'));
  h.card.dispatchEvent(new h.w.KeyboardEvent('keydown', {key: 'Tab', bubbles: true}));
  assert.equal(h.w.document.activeElement, h.card.querySelector('.fx-tour-skip'), 'Tab stays in tour controls');
});

test('Escape closes the tour and restores keyboard focus to its original control', t => {
  const h = harness(t);
  h.card.dispatchEvent(new h.w.KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
  assert.equal(h.w.document.querySelector('.fx-tour'), null);
  assert.equal(h.w.document.activeElement, h.command);
});
