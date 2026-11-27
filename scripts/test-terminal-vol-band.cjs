/* Fitted GARCH volatility band coverage. No network or price-feed dependencies. */
const {test} = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
global.window = {FynxTerminalPlugins: []};
global.document = {head: {append() {}}};
const T = {el: () => ({style: {}, append() {}}), store: {get: () => null},
  finite: v => typeof v === 'number' && Number.isFinite(v), PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {}, RENDER: {},
  EXTRA_GROUPS: [], TABBED: new Set(), DESK_ORDER: ['all'], DESK_DEFS: {all: {}}};
for (const f of ['quantlab.js', 'quantlab-research.js']) eval(fs.readFileSync(path.join(__dirname,'..','assets','js','terminal',f), 'utf8'));
for (const plug of window.FynxTerminalPlugins) plug(T, null);
const {fittedBandCoverage: cover} = T.QuantResearch;
test('counts each tail, including boundary observations inside the band', () => {
  assert.deepEqual(cover([.021, -.026, .02, -.02, .008], [.01, .01, .01, .01, .01], 0, 5), {n:5,above:1,below:1,inside:3});
});
test('uses the latest dated positions and corresponding volatilities, centered on the fitted mean', () => {
  assert.deepEqual(cover([.20, .03, -.01], [.01, .01, .02], .018, 2), {n:2,above:0,below:0,inside:2});
});
test('invalid observations do not enter the numerator or denominator', () => {
  assert.deepEqual(cover([.03, NaN, -.07, -.032, .02], [.01, .01, Infinity, 0, .02], 0, 5), {n:2,above:1,below:0,inside:1});
});
test('insufficient history and a window with no usable vol are not reported as 0% inside', () => {
  assert.equal(cover([0], [.01], 0, 21), null);
  assert.equal(cover([0], [0], 0, 1), null);
  assert.equal(cover([0], [.01], NaN, 1), null);
});
