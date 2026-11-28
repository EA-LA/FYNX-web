'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '../assets/js/terminal/scanner.js'), 'utf8');
const snapshot = {
  generatedAt: '2026-11-19T12:00:00Z',
  sources: {stocks: 'Test scanner feed', etfs: 'Test ETF feed', crypto: 'Test crypto feed'},
  stocks: {asOf: '2026-11-19T12:00:00Z', rows: [
    ['FYNX', 'FYNX Example', 42, 2.5, 1000000, 2500000000, 'Technology', 'Software', 'US', 2024, ['ai']]
  ]},
  etfs: {rows: []}, crypto: {rows: []}, themes: [{id: 'ai', label: 'AI'}]
};

function fixture(savedState, savedScans = [], scannerFeed = snapshot) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'https://www.fynxfinanceworld.com/terminal.html'});
  const doc = dom.window.document, raw = new Map();
  if (savedState !== undefined) raw.set('scan-state', JSON.stringify(savedState));
  raw.set('scan-saved', JSON.stringify(savedScans));
  const el = (tag, cls = '', label) => {
    const node = doc.createElement(tag); node.className = cls;
    if (label != null) node.textContent = String(label);
    return node;
  };
  const btn = (label, cls, action, accessibleName) => {
    const b = el('button', cls, label); b.type = 'button';
    if (accessibleName) b.setAttribute('aria-label', accessibleName);
    b.addEventListener('click', action); return b;
  };
  const pages = {};
  let currentView;
  const PG = {
    add: (key, title, render) => { pages[key] = render; },
    setHead: () => {}, rerender: () => {},
    pageState: name => name === 'scan' ? currentView : undefined,
    pageTabs: (tabs, active, onTab) => {
      const box = el('div');
      for (const [key, label] of tabs) {
        const tab = btn(label, '', () => onTab(key));
        tab.setAttribute('aria-pressed', String(key === active));
        box.append(tab);
      }
      return box;
    },
    chips: buttons => { const box = el('div'); buttons.forEach(b => box.append(b)); return box; },
    sourceNote: value => el('p', 'source', value)
  };
  const T = {
    S: {deskKey: 'stocks', mk: {quotes: {}}},
    el, btn, store: {get: k => raw.get(k) ?? null, set: (k, v) => raw.set(k, v)},
    signed: (n, dp, suffix) => n.toFixed(dp) + suffix,
    tone: () => '', fmt: n => String(n), finite: Number.isFinite,
    getJSON: async () => scannerFeed, report: () => {}, setSymbol: () => {},
    digitsOf: () => 2, rowButton: (cls, handler) => btn('Open', cls, handler),
    TDATA: '/terminal-data/', PAGE_NAMES: [], PANELS: {}, PANEL_DESC: {}, LINK_LABEL: {},
    EXTRA_GROUPS: [], RENDER: {}, panel: () => {
      const host = el('section'); doc.body.append(host); return host;
    }
  };
  const context = {
    window: dom.window, document: doc,
    matchMedia: () => ({matches: false}), setTimeout, setInterval: () => 0,
    clearTimeout, prompt: () => null, Blob, URL, console
  };
  vm.runInNewContext(script, context, {filename: 'scanner.js'});
  assert.equal(dom.window.FynxTerminalPlugins.length, 1);
  dom.window.FynxTerminalPlugins[0](T, PG);
  return {
    doc, pages, T, raw,
    renderPage: async (arg = null, view) => {
      currentView = view;
      const host = el('main'); doc.body.append(host);
      await pages.scan(host, arg, () => true); return host;
    }
  };
}

test('obsolete saved asset falls back to a real scanner tab instead of crashing', async () => {
  const {renderPage, T, doc} = fixture({asset: 'retired-asset', preset: 'unknown', f: {q: 'FYNX'}, sort: null});
  const host = await renderPage();
  assert.match(host.textContent, /market scanner|1 of 1 stocks match/i);
  await T.RENDER.scan();
  assert.match(doc.body.textContent, /FYNX/);
});

test('missing or corrupted filter and sort values cannot break the scanner page or panel', async () => {
  for (const state of [
    {asset: 'stocks', f: {q: [], cap: {}, priceMin: [], noLev: 'true'}, sort: null, limit: -10},
    {asset: 'stocks', preset: 99, f: null, sort: ['not-a-column', -1], limit: 1e9},
    'invalid stored shape'
  ]) {
    const {renderPage, T, doc} = fixture(state);
    const host = await renderPage();
    assert.match(host.textContent, /1 of 1 stocks match/);
    await T.RENDER.scan();
    assert.match(doc.body.textContent, /FYNX/);
  }
});

test('well-formed custom filters and sort remain active across a reload', async () => {
  const {renderPage, raw} = fixture({asset: 'stocks', preset: 'custom', f: {q: 'FYNX', priceMin: 40}, sort: ['chg', -1], limit: 100});
  const host = await renderPage();
  assert.match(host.textContent, /1 of 1 stocks match/);
  assert.match(host.querySelector('.sc-sort').textContent, /SYMBOL/);
  assert.deepEqual(JSON.parse(raw.get('scan-state')).sort, ['chg', -1]);
});

test('a non-array saved-scan collection is ignored without destroying stored data', async () => {
  const {renderPage, raw} = fixture(null, {unexpected: 'legacy storage'});
  const original = raw.get('scan-saved');
  const host = await renderPage();
  assert.match(host.textContent, /1 of 1 stocks match/);
  assert.equal(raw.get('scan-saved'), original);
});

test('text headers sort the rendered rows in both directions, using displayed labels and putting missing values last', async () => {
  const stocks = {rows: [
    ['A1', 'Zulu Company', 42, 3, 1000000, 850000000, 'Technology', 'Zinc', 'US', 2024, ['a-id']],
    ['B2', 'alpha Company', 52, 1, 1000000, 850000000, 'Industrials', 'aluminium', 'US', 2024, ['z-id']],
    ['B10', 'Beta Company', 12, 2, 1000000, 850000000, 'Other', null, 'US', 2024, []]
  ]};
  const feed = {...snapshot, stocks, themes: [{id: 'a-id', label: 'Zenith'}, {id: 'z-id', label: 'Arctic'}]};
  const {renderPage, raw, T} = fixture(undefined, [], feed);
  let host = await renderPage();
  const ordered = () => [...host.querySelectorAll('.sc-sym')].map(cell => cell.textContent);
  const header = name => host.querySelector(`[aria-label="Sort by ${name}"]`);
  assert.deepEqual(ordered(), ['A1', 'B10', 'B2'], 'initial numeric sort is unchanged');
  async function sort(name, direction, expected) {
    header(name).click();
    host = await renderPage();
    assert.equal(header(name).closest('th').getAttribute('aria-sort'), direction);
    assert.deepEqual(ordered(), expected);
  }
  await sort('name', 'ascending', ['B2', 'B10', 'A1']);
  await sort('name', 'descending', ['A1', 'B10', 'B2']);
  await sort('industry', 'ascending', ['B2', 'A1', 'B10']);
  await sort('industry', 'descending', ['A1', 'B2', 'B10']);
  await sort('themes', 'ascending', ['B2', 'A1', 'B10']);
  await sort('themes', 'descending', ['A1', 'B2', 'B10']);
  await sort('symbol', 'ascending', ['A1', 'B2', 'B10']);
  await sort('symbol', 'descending', ['B10', 'B2', 'A1']);
  assert.deepEqual(JSON.parse(raw.get('scan-state')).sort, ['sym', -1]);
  const resultPane = await (async () => { await T.RENDER.scan(); return host.ownerDocument.querySelector('section:last-of-type'); })();
  assert.deepEqual([...resultPane.querySelectorAll('button b')].map(e => e.textContent), ['B10', 'B2', 'A1']);
  await sort('price', 'descending', ['B2', 'A1', 'B10']);
});

test('cross-asset group text sorts without changing magnitude-based presets', async () => {
  const {renderPage, T} = fixture({asset: 'markets', preset: 'unusual', f: {}, sort: ['z', -2]});
  const history = Array.from({length: 32}, (_, i) => ['2026-11-19', 100 + i]);
  T.quoteFor = () => null;
  T.S.mk.quotes = {
    FX1: {symbol: 'FX1', name: 'Currency example', group: 'FX majors', price: 130, changePercent: -6, vol20: 1, history},
    RATE1: {symbol: 'RATE1', name: 'Rate example', group: 'US Yields', price: 130, changePercent: 2, vol20: 1, history},
    EN1: {symbol: 'EN1', name: 'Energy example', group: 'Energy futures', price: 130, changePercent: 4, vol20: 1, history}
  };
  let host = await renderPage();
  const ordered = () => [...host.querySelectorAll('.sc-sym')].map(cell => cell.textContent);
  assert.deepEqual(ordered(), ['FX1', 'EN1', 'RATE1'], 'negative largest magnitude still ranks first');
  host.querySelector('[aria-label="Sort by group"]').click();
  host = await renderPage();
  assert.deepEqual(ordered(), ['EN1', 'FX1', 'RATE1']);
});

test('an explicit scanner command seeds a visit once; sort, filter, and asset changes survive redraw', async () => {
  const feed = {...snapshot, crypto:{rows:[
    ['zulu','ZZZ','Zulu Coin',1,0,10,10,1e8,1e7,1,-1,[]],
    ['alpha','AAA','Alpha Coin',2,0,9,10,1e8,1e7,2,-2,[]]
  ]}, etfs:{rows:[['SPY','Synthetic ETF',250,2,5,[]]]}};
  const {doc, raw, renderPage} = fixture({asset:'stocks', preset:'gainers', f:{}, sort:['chg',-1]}, [], feed);
  const visit = {};
  let host = await renderPage('CRYPTO', visit);
  const symbols = node => [...node.querySelectorAll('.sc-sym')].map(cell => cell.textContent);
  const redraw = async () => { host = await renderPage('CRYPTO', visit); };
  assert.deepEqual(symbols(host), ['ZZZ','AAA']);
  // A background redraw also keeps the initial explicit asset, without writing a preset.
  await redraw();
  assert.deepEqual(symbols(host), ['ZZZ','AAA']);
  assert.equal(JSON.parse(raw.get('scan-state')).asset, 'stocks');

  host.querySelector('[aria-label="Sort by name"]').click();
  await redraw();
  assert.deepEqual(symbols(host), ['AAA','ZZZ']);
  const search = host.querySelector('input[type=search]');
  search.value = 'Zulu';
  search.dispatchEvent(new doc.defaultView.Event('change'));
  await redraw();
  assert.deepEqual(symbols(host), ['ZZZ']);

  [...host.querySelectorAll('button')].find(button => button.textContent === 'ETFs').click();
  await redraw();
  assert.deepEqual(symbols(host), ['SPY']);
  assert.equal(JSON.parse(raw.get('scan-state')).asset, 'etfs');
  const newVisit = await renderPage('CRYPTO', {});
  assert.deepEqual(symbols(newVisit), ['ZZZ','AAA'], 'a new command still applies its initial preset');
});
