'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../assets/js/terminal/portfolio.js'), 'utf8');
function element() {
  return {
    clientWidth: 390,
    textContent: '',
    append() {},
    replaceChildren() {},
    addEventListener() {},
    setAttribute() {},
    getBoundingClientRect() { return {left: 0, top: 0, width: 390, height: 440}; }
  };
}
function setup(initial = {}) {
  const storage = {...initial};
  const plugins = [], pages = {}, buttons = [], drawn = [];
  const context = {
    window: {FynxTerminalPlugins: plugins},
    innerWidth: 390,
    matchMedia: () => ({matches: false}),
    console
  };
  vm.runInNewContext(script, context, {timeout: 2000});
  const history = [0, 1, 2, 3, 4, 5].map((n) => ({
    date: '2026-11-' + String(n + 10).padStart(2, '0'),
    open: 100 + n, high: 101 + n, low: 99 + n, close: 100.5 + n, volume: 100
  }));
  const T = {
    S: {focus: 'AAPL'},
    el: element,
    btn: (label, _cls, onClick) => { const b = element(); b.label = label; b.click = onClick; buttons.push(b); return b; },
    svg: (tag, attrs) => {drawn.push({tag, attrs}); return element();},
    store: {get: key => storage[key] ?? null, set: (key, value) => {storage[key] = value;}},
    finite: Number.isFinite,
    signed: n => String(n),
    fmt: n => String(n),
    day: d => d,
    tone: () => '',
    shortOf: s => String(s),
    nameOf: s => String(s),
    quoteFor: () => null,
    digitsOf: () => 2,
    symHistory: async () => ({source: 'Test history', rows: history}),
    compareChart: element,
    setSymbol() {},
    openPage() {},
    openFinder({onPick}) {onPick({symbol: 'MSFT'});},
    say() {},
    report() {},
    PANEL_DESC: {}, PANELS: {}, RENDER: {}, EXTRA_GROUPS: [], PAGE_NAMES: []
  };
  const PG = {
    add: (key, _label, fn) => {pages[key] = fn;},
    setHead() {},
    chips: element,
    go: element,
    pageTabs: (options, _current, onPick) => {
      for (const [value, label] of options) buttons.push({label, click: () => onPick(value)});
      return element();
    }
  };
  plugins[0](T, PG);
  return {T, pages, buttons, drawn, storage};
}

test('non-array saved portfolio data never crashes the Terminal panel', () => {
  for (const value of ['{"old":true}', '"not-a-list"', '12', 'null', '{broken-json']) {
    const {T} = setup({portfolio: value});
    assert.deepEqual(Array.from(T.portfolioHoldings()), []);
  }
});
test('valid holdings survive while malformed saved entries are ignored', () => {
  const {T} = setup({portfolio: JSON.stringify([null, 123, {}, {symbol: 'AAPL', qty: 2}, {symbol: 'BAD', qty: -1}, {symbol: 'MSFT', qty: 3}])});
  assert.deepEqual(Array.from(T.portfolioHoldings(), h => [h.symbol, h.qty]), [['AAPL', 2], ['MSFT', 3]]);
});
test('old object-shaped drawing state does not break chart rendering', async () => {
  const {pages} = setup({'draw-AAPL': '{"legacy":1}'});
  await pages.chart(element(), 'AAPL', () => true);
});
test('null and incomplete trend/level entries do not break chart rendering', async () => {
  const {pages, drawn} = setup({'draw-AAPL': JSON.stringify([null, {type:'trend', a:null}, {type:'h', price:'invalid'}, {type:'h', price:103}])});
  await pages.chart(element(), 'AAPL', () => true);
  assert.ok(drawn.some(x => x.tag === 'line' && x.attrs?.stroke === '#ffb000'), 'A valid saved level should still render');
});
test('corrupt comparison list can switch mode and add a valid market', async () => {
  const h = setup({'cmp-list': '{"legacy":true}'});
  await h.pages.chart(element(), 'AAPL', () => true);
  const compare = h.buttons.find(b => b.label === 'Compare %');
  assert.ok(compare, 'Compare tab should be available');
  compare.click();
  const add = h.buttons.find(b => b.label === '+ Add market');
  assert.ok(add, 'Add-market recovery should remain available');
  add.click();
  assert.deepEqual(JSON.parse(h.storage['cmp-list']), ['SPY', 'MSFT']);
});
test('comparison list preserves valid strings but discards invalid saved elements', async () => {
  const h = setup({'cmp-list': JSON.stringify([null, 7, 'SPY', {}, 'MSFT'])});
  await h.pages.chart(element(), 'AAPL', () => true);
  h.buttons.find(b => b.label === 'Compare %').click();
  assert.ok(h.buttons.some(b => b.label === 'SPY ✕'));
  assert.ok(h.buttons.some(b => b.label === 'MSFT ✕'));
  assert.equal(h.buttons.some(b => b.label === '7 ✕'), false);
});
