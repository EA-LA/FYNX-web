'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { PLANS, run } = require('../backend/consumer-core.cjs');

test('paid Trade Review result preserves note line breaks and wraps long research references', async () => {
  const dom = new JSDOM(fs.readFileSync('pro.html', 'utf8'), {
    url: 'https://www.fynxfinanceworld.com/pro.html?tool=review'
  });
  const { window } = dom;
  try {
    const { document } = window;
    const style = document.createElement('style');
    style.textContent = fs.readFileSync('assets/css/pro-workspace.css', 'utf8');
    document.head.append(style);
    const note = 'Event: CPI\n\n  Plan: reduce risk\nhttps://example.invalid/research/' + 'ABC'.repeat(70);
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
          return { data: { result: run(req.product, req.input) } };
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
    const field = document.getElementById('tool-notes');
    field.value = note;
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
    document.getElementById('runTool').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ran?.product, 'review');
    const rendered = [...document.querySelectorAll('#workbench #result > p')]
      .find(p => p.textContent === note);
    assert.ok(rendered, 'the original reference remains in the result');
    assert.equal(window.getComputedStyle(rendered).whiteSpace, 'pre-wrap');
    assert.notEqual(window.getComputedStyle(document.querySelector('.intro')).whiteSpace, 'pre-wrap');
    assert.equal(window.getComputedStyle(rendered).overflowWrap, 'anywhere');
    assert.notEqual(window.getComputedStyle(document.querySelector('.intro')).overflowWrap, 'anywhere');
  } finally {
    window.close();
  }
});
