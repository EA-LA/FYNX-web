'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { PLANS, run } = require('../backend/consumer-core.cjs');

async function withPaidResult(tool, exercise, tier = 'starter') {
  const dom = new JSDOM(fs.readFileSync('pro.html', 'utf8'), {
    url: 'https://www.fynxfinanceworld.com/pro.html?tool=' + tool
  });
  const { window } = dom;
  try {
    const { document } = window;
    const style = document.createElement('style');
    style.textContent = fs.readFileSync('assets/css/pro-workspace.css', 'utf8');
    document.head.append(style);
    let ready, ran;
    const modules = {
      '../../auth/firebase.js': { app: {}, auth: {}, authPersistenceReady: Promise.resolve() },
      'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js': {
        onAuthStateChanged: (_, fn) => { ready = fn({ uid: 'synthetic-pro' }); }
      },
      'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js': {
        getFunctions: () => ({}),
        httpsCallable: () => async req => {
          if (req.action === 'status') return { data: { tier, plans: PLANS } };
          if (req.action === 'list') return { data: { items: [], limit: 25 } };
          ran = req;
          return { data: { result: run(req.product, req.input, [{ pl: 120 }, { pl: -40 }]) } };
        }
      }
    };
    const ctx = vm.createContext({
      window, document, location: window.location, history: window.history,
      URL, URLSearchParams, Blob, sessionStorage: window.sessionStorage,
      loadModule: async path => modules[path]
    });
    vm.runInContext(fs.readFileSync('assets/js/pro-catalog.js', 'utf8'), ctx);
    const app = fs.readFileSync('assets/js/pro-workspace.js', 'utf8').replace(/\bimport\(/g, 'loadModule(');
    await vm.runInContext('(async () => {' + app + '})()', ctx);
    await ready;
    assert.match(document.getElementById('accessMessage').textContent, /Included/);
    await exercise({window, document, lastRequest: () => ran});
  } finally {
    window.close();
  }
}

test('paid Trade Review result preserves note line breaks and wraps long research references', async () => {
  await withPaidResult('review', async ({window, document, lastRequest}) => {
    const note = 'Event: CPI\n\n  Plan: reduce risk\nhttps://example.invalid/research/' + 'ABC'.repeat(70);
    const field = document.getElementById('tool-notes');
    field.value = note;
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
    document.getElementById('runTool').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(lastRequest()?.product, 'review');
    const rendered = [...document.querySelectorAll('#workbench #result > p')]
      .find(p => p.textContent === note);
    assert.ok(rendered, 'the original reference remains in the result');
    assert.equal(window.getComputedStyle(rendered).whiteSpace, 'pre-wrap');
    assert.notEqual(window.getComputedStyle(document.querySelector('.intro')).whiteSpace, 'pre-wrap');
    assert.equal(window.getComputedStyle(rendered).overflowWrap, 'anywhere');
    assert.notEqual(window.getComputedStyle(document.querySelector('.intro')).overflowWrap, 'anywhere');
  });
});

test('paid Journal path details have a 44 px minimum target without changing other disclosures', async () => {
  await withPaidResult('analytics', async ({window, document}) => {
    document.getElementById('runTool').click();
    await new Promise(resolve => setImmediate(resolve));
    const inspector = document.querySelector('#workbench #result details.path-inspector > summary');
    assert.ok(inspector, 'Journal Intelligence result has the native path disclosure');
    assert.equal(window.getComputedStyle(inspector).minHeight, '44px');
    const other = [...document.querySelectorAll('summary')].find(el => !el.closest('#workbench'));
    assert.ok(other, 'unrelated disclosures remain outside the paid workbench');
    assert.notEqual(window.getComputedStyle(other).minHeight, '44px');
  });
});

test('paid Research Watchlist keeps long symbols visible without changing their news links', async () => {
  await withPaidResult('watchlist', async ({window, document, lastRequest}) => {
    const symbol = 'NASDAQ100WEEKLYCALL20261218USD';
    const field = document.getElementById('tool-symbols');
    field.value = symbol;
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
    document.getElementById('runTool').click();
    await new Promise(resolve => setImmediate(resolve));
    const link = document.querySelector('#workbench #result > ul > li > a');
    assert.ok(link);
    assert.equal(lastRequest()?.product, 'watchlist');
    assert.ok(link.textContent.startsWith(symbol));
    assert.equal(link.getAttribute('href'), '/tools/symbol-news.html?q=' + symbol);
    assert.equal(window.getComputedStyle(link).overflowWrap, 'anywhere');
    link.focus();
    assert.equal(document.activeElement, link);
  });
});

test('paid Journal download stays one target and keeps its file name', async () => {
  await withPaidResult('export', async ({window, document, lastRequest}) => {
    document.getElementById('runTool').click();
    await new Promise(resolve => setImmediate(resolve));
    const link = document.querySelector('#workbench #result > a[download]');
    assert.ok(link);
    assert.equal(lastRequest()?.product, 'export');
    try {
      assert.equal(link.download, 'fynx-journal.csv');
      assert.equal(window.getComputedStyle(link).display, 'inline-block');
      assert.equal(window.getComputedStyle(link).maxWidth, '100%');
      link.focus();
      assert.equal(document.activeElement, link);
    } finally {
      URL.revokeObjectURL(link.href);
    }
  });
});

test('paid Portfolio Stress can wrap a long symbol without changing its numeric cells', async () => {
  await withPaidResult('portfolio', async ({window, document, lastRequest}) => {
    const symbol = 'NASDAQ100WEEKLYCALL20261218USD';
    const positions = document.getElementById('tool-positions');
    positions.value = symbol + ', 6000\nSPY, -2000';
    positions.dispatchEvent(new window.Event('input', { bubbles: true }));
    document.getElementById('runTool').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(lastRequest()?.product, 'portfolio');
    const table = document.querySelector('#workbench #result table');
    assert.equal(table.caption.textContent, 'Portfolio stress test results');
    const cells = [...table.tBodies[0].rows[0].cells];
    assert.deepEqual(cells.map(cell => cell.textContent), [symbol, (6000).toLocaleString(), '-300']);
    assert.equal(window.getComputedStyle(cells[0]).overflowWrap, 'anywhere');
    assert.notEqual(window.getComputedStyle(cells[1]).overflowWrap, 'anywhere');
    assert.notEqual(window.getComputedStyle(cells[2]).overflowWrap, 'anywhere');
  }, 'plus');
});

test('print report isolates an available paid result without changing unrun or edited workspaces', async () => {
  await withPaidResult('risk', async ({window, document}) => {
    const styles = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules]);
    const print = styles.find(rule => rule.media?.mediaText === 'print');
    assert.ok(print);
    const hide = [...print.cssRules].find(rule => rule.style?.display === 'none');
    assert.ok(hide);
    const hiddenInPrint = element => element.matches(hide.selectorText);
    const toolForm = document.getElementById('toolForm');
    const result = document.getElementById('result');
    const heading = document.getElementById('toolTitle');
    const saved = document.getElementById('savedItems').closest('.workbench > *');
    const header = document.querySelector('body > header');
    assert.equal(hiddenInPrint(toolForm), false);
    assert.equal(hiddenInPrint(header), false);
    document.getElementById('runTool').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(result.querySelector('.metric-grid'));
    for (const shown of [result, heading]) assert.equal(hiddenInPrint(shown), false);
    for (const hidden of [toolForm, saved, header, document.getElementById('toolGuide')])
      assert.equal(hiddenInPrint(hidden), true);
    assert.notEqual(window.getComputedStyle(toolForm).display, 'none', 'screen controls remain usable');
    const entry = document.getElementById('tool-entry');
    entry.value = '101';
    entry.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(hiddenInPrint(toolForm), false);
  });
});
