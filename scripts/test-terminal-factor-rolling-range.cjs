/* Summary of 63-day factor beta windows, independent of pricing responses. */
const {test} = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
global.window = {FynxTerminalPlugins: []}; global.document = {head: {append() {}}};
const T = {el: () => ({style: {}, append() {}}), store: {get: () => null},
  finite: Number.isFinite, PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {}, RENDER: {},
  EXTRA_GROUPS: [], TABBED: new Set(), DESK_ORDER: ['all'], DESK_DEFS: {all: {}}};
for (const f of ['quantlab.js', 'quantlab-research.js']) eval(fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'terminal', f), 'utf8'));
for (const plug of window.FynxTerminalPlugins) plug(T, null);
const get = T.QuantResearch.rollingBetaSummary;
const data = [{date:'first',b:[.7,.1]}, {date:'middle',b:[-.4,NaN]},
  {date:'later',b:[.3,0]}, {date:'last',b:[NaN,.2]}];
test('extrema and latest finite window retain their own dates and factor column', () => {
  assert.deepEqual(get(data,0),{low:{value:-.4,date:'middle'},high:{value:.7,date:'first'},latest:{value:.3,date:'later'},n:3,bothSigns:true});
  assert.deepEqual(get(data,1),{low:{value:0,date:'later'},high:{value:.2,date:'last'},latest:{value:.2,date:'last'},n:3,bothSigns:false});
});
test('empty, invalid or absent factor estimates never report a zero exposure', () => {
  assert.equal(get([],0),null);assert.equal(get(data,2),null);
  assert.equal(get([{b:[Infinity]},{b:null}],0),null);
});
test('a measured zero remains valid and is not a sign change', () => {
  assert.deepEqual(get([{date:'T',b:[0]}],0),{low:{value:0,date:'T'},high:{value:0,date:'T'},latest:{value:0,date:'T'},n:1,bothSigns:false});
});
