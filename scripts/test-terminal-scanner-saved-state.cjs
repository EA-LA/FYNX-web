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

function fixture(savedState, savedScans = []) {
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
  const PG = {
    add: (key, title, render) => { pages[key] = render; },
    setHead: () => {}, rerender: () => {},
    pageTabs: () => el('div'),
    chips: buttons => { const box = el('div'); buttons.forEach(b => box.append(b)); return box; },
    sourceNote: value => el('p', 'source', value)
  };
  const T = {
    S: {deskKey: 'stocks', mk: {quotes: {}}},
    el, btn, store: {get: k => raw.get(k) ?? null, set: (k, v) => raw.set(k, v)},
    signed: (n, dp, suffix) => n.toFixed(dp) + suffix,
    tone: () => '', fmt: n => String(n), finite: Number.isFinite,
    getJSON: async () => snapshot, report: () => {}, setSymbol: () => {},
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
    renderPage: async () => {
      const host = el('main'); doc.body.append(host);
      await pages.scan(host, null, () => true); return host;
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
