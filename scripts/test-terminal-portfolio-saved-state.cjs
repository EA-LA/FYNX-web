'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../assets/js/terminal/portfolio.js'), 'utf8');
function element(_tag, className) {
  return {
    className,
    children: [],
    clientWidth: 390,
    textContent: '',
    append(...children) {this.children.push(...children);},
    replaceChildren(...children) {this.children = children;},
    addEventListener() {},
    setAttribute() {},
    getBoundingClientRect() { return {left: 0, top: 0, width: 390, height: 440}; }
  };
}
function setup(initial = {}) {
  const storage = {...initial};
  const plugins = [], pages = {}, buttons = [], drawn = [], comparisons = [];
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
    compareChart(series, options) {comparisons.push({series, options}); return element("figure", "comparison");},
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
  return {T, PG, pages, buttons, drawn, comparisons, storage};
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


async function deferredChart() {
  const h = setup(), host = element(), pending = [];
  const history = h.T.symHistory;
  h.T.symHistory = (symbol, range) => symbol === 'SPY' && range === '5y'
    ? new Promise(resolve => pending.push(async () => resolve(await history(symbol, range))))
    : history(symbol, range);
  await h.pages.chart(host, 'AAPL', () => true);
  return {h, pending, pick: label => h.buttons.findLast(b => b.label === label).click(),
    chart: host.children.find(n => n.className === 'pg-chart'), note: host.children.find(n => n.className === 'pg-note')};
}
const settleChart = async release => {await release(); await new Promise(resolve => setImmediate(resolve));};

test('Price remains the only chart after a comparison request finishes late', async () => {
  const {h,chart,note,pending,pick} = await deferredChart();
  pick('Compare %');
  assert.equal(pending.length,1);
  pick('Price');
  const price = chart.children[0];
  await settleChart(pending[0]);
  assert.equal(h.comparisons.length,0);
  assert.strictEqual(chart.children[0],price);
  assert.equal(chart.children.length,2,'price graphic and readout only');
  assert.match(note.textContent,/sessions.*change/);
});

test('only the newest comparison can populate the chart after a range change', async () => {
  const {h,chart,note,pending,pick} = await deferredChart();
  pick('Compare %');
  pick('1M');
  assert.equal(pending.length,2);
  await settleChart(pending[1]);
  assert.equal(h.comparisons.length,1);
  assert.equal(h.comparisons[0].options.sessions,21);
  const current = chart.children[0];
  await settleChart(pending[0]);
  assert.equal(h.comparisons.length,1);
  assert.deepEqual(chart.children,[current]);
  assert.match(note.textContent,/Each line starts/);
});

test('changing a chart market uses in-Terminal navigation without queuing a close', async () => {
  const h = setup(), calls = [];
  // Observe the plugin boundary: closing now would queue a history traversal after the new chart opens.
  h.PG.closeAll = () => calls.push(['close']);
  h.T.openPage = (page, symbol) => calls.push(['open', page, symbol]);
  await h.pages.chart(element(), 'AAPL', () => true);
  h.buttons.find(b => b.label.startsWith('Change market')).click();
  assert.deepEqual(calls, [['open', 'chart', 'MSFT']]);
});
