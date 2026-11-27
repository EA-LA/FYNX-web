/* Homepage Market Desk carousel accessibility regression. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function setup(reduced = false, legacyMotion = false) {
  const dom = new JSDOM(read('index.html'), {
    url: 'https://www.fynxfinanceworld.com/',
    runScripts: 'outside-only', pretendToBeVisual: true
  });
  const { window } = dom;
  const timers = new Map(), listeners = [];
  let id = 0;
  const media = { matches: reduced };
  if (legacyMotion) media.addListener = fn => listeners.push(fn);
  else media.addEventListener = (_, fn) => listeners.push(fn);
  let onIntersection;
  window.matchMedia = () => media;
  window.IntersectionObserver = class {
    constructor(fn) { onIntersection = fn; }
    observe() { onIntersection([{ isIntersecting: true, intersectionRatio: 1 }]); }
  };
  window.setInterval = (fn, ms) => {
    assert.equal(ms, 7000);
    timers.set(++id, fn);
    return id;
  };
  window.clearInterval = key => { timers.delete(key); };
  window.eval(read('assets/js/landing-workspace.js'));
  const terminal = window.document.querySelector('.fw-terminal');
  return {
    dom, window, timers, terminal,
    toggle: terminal.querySelector('[data-fw-rotation-toggle]'),
    tabs: [...terminal.querySelectorAll('[data-fw-tab]')],
    changeMotion(value) { media.matches = value; listeners.forEach(fn => fn({matches:value})); },
    intersect(ratio) { onIntersection([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]); }
  };
}
test('pause, manual tab selection and resume are functional', () => {
  const app = setup();
  try {
    assert.equal(app.toggle.tagName, 'BUTTON');
    assert.equal(app.toggle.type, 'button');
    assert.equal(app.timers.size, 1);
    [...app.timers.values()][0]();
    assert.equal(app.tabs[1].getAttribute('aria-selected'), 'true');
    app.toggle.focus();
    app.toggle.click();
    assert.equal(app.timers.size, 0);
    assert.match(app.toggle.textContent, /Resume rotation/);
    assert.equal(app.terminal.classList.contains('fw-paused'), true);
    app.tabs[2].click();
    assert.equal(app.tabs[2].getAttribute('aria-selected'), 'true');
    assert.equal(app.timers.size, 0);
    app.toggle.focus();
    app.toggle.click();
    assert.equal(app.timers.size, 1);
    assert.match(app.toggle.getAttribute('aria-label'), /Pause automatic/);
  } finally { app.dom.window.close(); }
});
test('reduced motion pauses by default and can be resumed explicitly', () => {
  const app = setup(true);
  try {
    assert.equal(app.timers.size, 0);
    assert.match(app.toggle.textContent, /Resume rotation/);
    app.toggle.focus();
    app.toggle.click();
    assert.equal(app.timers.size, 1);
    app.changeMotion(true);
    assert.equal(app.timers.size, 0);
  } finally { app.dom.window.close(); }
});
test('tab focus temporarily suspends rotation', async () => {
  const app = setup();
  try {
    app.tabs[1].focus();
    assert.equal(app.timers.size, 0);
    const outside = app.window.document.createElement('button');
    app.window.document.body.append(outside);
    outside.focus();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.timers.size, 1);
  } finally { app.dom.window.close(); }
});

function dispatchPointer(app, name, pointerType) {
  const event = new app.window.Event(name);
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  app.terminal.dispatchEvent(event);
}
test('hovering with a mouse suspends automatic Market Desk rotation until the pointer leaves', () => {
  const app = setup();
  try {
    assert.equal(app.timers.size, 1);
    dispatchPointer(app, 'pointerenter', 'mouse');
    assert.equal(app.timers.size, 0);
    assert.equal(app.terminal.classList.contains('fw-paused'), true);
    dispatchPointer(app, 'pointerleave', 'mouse');
    assert.equal(app.timers.size, 1);
    assert.equal(app.terminal.classList.contains('fw-paused'), false);
  } finally { app.dom.window.close(); }
});
test('touch pointers do not interrupt automatic Market Desk rotation', () => {
  const app = setup();
  try {
    dispatchPointer(app, 'pointerenter', 'touch');
    assert.equal(app.timers.size, 1);
    dispatchPointer(app, 'pointerleave', 'touch');
    assert.equal(app.timers.size, 1);
  } finally { app.dom.window.close(); }
});
test('leaving hover does not override reduced-motion or explicit pause choices', () => {
  const app = setup(true);
  try {
    dispatchPointer(app, 'pointerenter', 'pen');
    dispatchPointer(app, 'pointerleave', 'pen');
    assert.equal(app.timers.size, 0);
    assert.match(app.toggle.textContent, /Resume rotation/);
  } finally { app.dom.window.close(); }
});

test('a partially visible Market Desk does not rotate below the visibility threshold', () => {
  const app = setup();
  try {
    app.intersect(.1);
    assert.equal(app.timers.size, 0);
    app.intersect(.25);
    assert.equal(app.timers.size, 1);
    app.toggle.click();
    app.intersect(0);
    app.intersect(1);
    assert.equal(app.timers.size, 0, 'visibility must not override manual pause');
  } finally { app.dom.window.close(); }
});
test('legacy Safari media-query listeners pause rotation when Reduce Motion changes', () => {
  const app = setup(false, true);
  try {
    assert.equal(app.timers.size, 1);
    app.changeMotion(true);
    assert.equal(app.timers.size, 0);
    app.changeMotion(false);
    assert.equal(app.timers.size, 0, 'resume requires explicit visitor action');
    app.toggle.click();
    assert.equal(app.timers.size, 1);
  } finally { app.dom.window.close(); }
});
