'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { PLANS, run } = require('../backend/consumer-core.cjs');

async function withPaidResult(tool, exercise) {
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
          if (req.action === 'status') return { data: { tier: 'starter', plans: PLANS } };
          if (req.action === 'list') return { data: { items: [], limit: 25 } };
          ran = req;
          return { data: { result: run(req.product, req.input, [{ pl: 120 }, { pl: -40 }]) } };
        }
      }
    };
    const ctx = vm.createContext({
      window, document, location: window.location, history: window.history,
      URL, URLSearchParams, sessionStorage: window.sessionStorage,
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
