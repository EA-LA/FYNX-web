const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.window = {FynxTerminalPlugins: []};
const node = () => ({style: {}, append() {}});
global.document = {head: node()};
const T = {el: node, finite: Number.isFinite, store: {get: () => null},
  PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {}, RENDER: {}, TABBED: new Set(), EXTRA_GROUPS: []};
eval(fs.readFileSync(path.join(__dirname, '../assets/js/terminal/quantlab.js'), 'utf8'));
window.FynxTerminalPlugins[0](T, null);
const {lossThresholdStats: stats} = T.QuantLab;

test('strict threshold excludes ties at the loss amount and includes all paths in the denominator', () => {
  const pnl = new Float64Array([-120, -100, -100, -99, 0, 120]);
  assert.deepEqual(stats(pnl, 1000, 10), {amount: 100, count: 1, paths: 6, fraction: 1 / 6});
  assert.equal(stats(pnl, 1000, 0).count, 4);
  assert.equal(stats(pnl, 1000, 100).count, 0);
});

test('fractional thresholds use the run value and do not mutate sorted results', () => {
  const pnl = new Float64Array([-12.51, -12.50, -12.49]);
  assert.deepEqual(stats(pnl, 500, 2.5), {amount: 12.5, count: 1, paths: 3, fraction: 1 / 3});
  assert.equal(stats(pnl, 499, 2.5).count, 3);
  assert.deepEqual([...pnl], [-12.51, -12.50, -12.49]);
});

test('missing runs, invalid percentages, and nonpositive values cannot report odds', () => {
  for (const [pnl, value, percent] of [[[], 1000, 10], [[-2], 0, 10], [[-2], -10, 10],
    [[-2], NaN, 10], [[-2], 1000, -3], [[-2], 1000, 101], [[-2], 1000, NaN]]) {
    assert.equal(stats(pnl, value, percent), null);
  }
});
