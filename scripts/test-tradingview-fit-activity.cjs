'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/tradingview-fit.js'), 'utf8');

function setup({ noResizeObserver = false } = {}) {
  let scans = 0, onMutation, onResize, onHostResize, onReady;
  const host = { nodeType: 1, clientWidth: 320, clientHeight: 260, style: {}, getBoundingClientRect: () => ({ height: 260 }) };
  const frame = { style: {}, setAttribute(name, value) { this[name] = value; } };
  const chart = {
    nodeType: 1, parentElement: host, style: {}, children: [],
    matches: selector => selector === '.tradingview-widget-container',
    closest: selector => selector === '#tvTapeWrap' ? null : selector === '.widget-shell, .widget, .tv-wrap' ? host : null,
    querySelector: selector => selector === ':scope > iframe' ? frame : null,
    querySelectorAll: () => [frame]
  };
  const ordinary = { nodeType: 1, matches: () => false, querySelector: () => null, closest: () => null };
  const wrapper = { nodeType: 1, matches: () => false, querySelector: selector => selector === '.tradingview-widget-container' ? chart : null };
  const document = {
    documentElement: { nodeType: 1 },
    addEventListener(type, fn) { if (type === 'DOMContentLoaded') onReady = fn; },
    querySelectorAll(selector) { assert.equal(selector, '.tradingview-widget-container'); scans++; return [chart]; }
  };
  const window = { addEventListener(type, fn) { if (type === 'resize') onResize = fn; } };
  const context = {
    document, window, WeakSet, Object, Array,
    requestAnimationFrame(fn) { fn(); },
    getComputedStyle() { return { minHeight: '240px' }; },
    MutationObserver: class { constructor(fn) { onMutation = fn; } observe(target, options) { assert.equal(target, document.documentElement); assert.equal(options.subtree, true); } }
  };
  if (!noResizeObserver) context.ResizeObserver = class { constructor(fn) { onHostResize = fn; } observe(observed) { assert.equal(observed, host); } };
  vm.runInNewContext(source, context, { filename: 'tradingview-fit.js' });
  return { chart, frame, host, ordinary, wrapper, scans: () => scans,
    mutate: record => onMutation([record]), resize: () => onResize(),
    hostResize: () => onHostResize?.(), ready: () => onReady() };
}
test('initial chart sizing still works and widget insertion, removal and iframe changes refresh it', () => {
  const h = setup();
  assert.equal(h.scans(), 1);
  assert.equal(h.host.style.height, '240px');
  assert.equal(h.frame.style.height, '260px');
  h.mutate({ target: h.ordinary, addedNodes: [h.wrapper], removedNodes: [] });
  h.mutate({ target: h.chart, addedNodes: [h.ordinary], removedNodes: [] });
  h.mutate({ target: h.ordinary, addedNodes: [], removedNodes: [h.chart] });
  assert.equal(h.scans(), 4);
});
test('one hundred unrelated market headline mutations do not rescan the embedded charts', () => {
  const h = setup();
  for (let i = 0; i < 100; i++) h.mutate({ target: h.ordinary, addedNodes: [h.ordinary], removedNodes: [] });
  assert.equal(h.scans(), 1);
  h.resize(); h.hostResize();
  assert.equal(h.scans(), 3, 'real window and container resizes still update charts');
});
test('older iPhone webviews lacking ResizeObserver retain initial and future chart sizing', () => {
  const h = setup({ noResizeObserver: true });
  assert.equal(h.scans(), 1);
  h.ready(); h.resize();
  h.mutate({ target: h.ordinary, addedNodes: [h.wrapper], removedNodes: [] });
  assert.equal(h.scans(), 4);
});