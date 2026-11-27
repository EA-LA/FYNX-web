/* Readable hourly seasonality details from the same inputs used by the Terminal heatmap. */
const {test} = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
global.window = {FynxTerminalPlugins: []}; global.document = {head: {append() {}}};
const T = {el: () => ({style: {}, append() {}}), store: {get: () => null},
  finite: Number.isFinite, PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {}, RENDER: {},
  EXTRA_GROUPS: [], TABBED: new Set(), DESK_ORDER: ['all'], DESK_DEFS: {all: {}}};
for (const f of ['quantlab.js', 'quantlab-research.js']) eval(fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'terminal', f), 'utf8'));
for (const plug of window.FynxTerminalPlugins) plug(T, null);
const {weekdayHourRows: rows} = T.QuantResearch;
const fixture = {days:[1,2], hours:[9,10], avgA:.004, vol:[[{v:2,n:12},null],[{v:.5,n:8},{v:1,n:13}]],
  volu:[[{v:1.5},null],[{v:.5},{v:.9}]]};
test('rows preserve local hour order, exact counts, moves and relative volume', () => {
  assert.deepEqual(rows(fixture, 2), [
    {hour:9,n:8,move:.002,moveRatio:.5,volumeRatio:.5}, {hour:10,n:13,move:.004,moveRatio:1,volumeRatio:.9}
  ]);
});
test('hours below the coverage threshold and absent days are omitted', () => {
  assert.equal(rows(fixture, 1).length, 1);
  assert.deepEqual(rows({...fixture, vol:[[{v:2,n:7}, null]]}, 1), []);
  assert.deepEqual(rows(fixture, 3), []);
});
test('zero absolute moves remain numeric while unavailable volume stays unavailable', () => {
  const [item] = rows({...fixture, avgA:0, vol:[[{v:NaN,n:12}]], volu:null}, 1);
  assert.equal(item.move, 0);
  assert.equal(item.volumeRatio, undefined);
  assert.equal(Number.isNaN(item.moveRatio), true);
});
