'use strict';
// Exercise the real inline crypto calculator against a DOM; no live market feed is used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const page = readFileSync(join(__dirname, '..', 'tools', 'crypto.html'), 'utf8');
const inline = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .find(source => source.includes('function calculateCryptoTrade()'));

assert.ok(inline, 'The actual crypto calculator script must exist');

function calculate(overrides = {}) {
  const dom = new JSDOM(page, {
    url: 'https://www.fynxfinanceworld.com/tools/crypto.html',
    runScripts: 'outside-only',
  });
  dom.window.eval(inline);
  const doc = dom.window.document;
  const values = {
    coin: 'BTC / USDT', capital: '1000', entryPrice: '100',
    exitPrice: '110', feePercent: '0', tradeType: 'long',
    ...overrides,
  };
  for (const [id, value] of Object.entries(values)) {
    assert.ok(doc.getElementById(id), 'Missing field: ' + id);
    doc.getElementById(id).value = value;
  }
  doc.getElementById('calculateBtn').click();
  return dom;
}

test('ordinary pair displays with unchanged long-trade result', () => {
  const dom = calculate();
  const doc = dom.window.document;
  assert.match(doc.getElementById('resultArea').textContent, /Pair:\s*BTC \/ USDT/);
  assert.match(doc.querySelector('.big-result').textContent, /Net Profit:\s*\$100\.00/);
  assert.match(doc.getElementById('resultArea').textContent, /ROI:\s*10\.00%/);
  dom.window.close();
});

test('user-entered IMG markup is displayed literally, never as an image', () => {
  const attack = '<img src=x onerror="window.fynxInjected=true">';
  const dom = calculate({ coin: attack });
  const doc = dom.window.document;
  assert.equal(doc.querySelector('#resultArea img'), null);
  assert.match(doc.getElementById('resultArea').textContent, /<img src=x onerror=/);
  assert.equal(dom.window.fynxInjected, undefined);
  dom.window.close();
});

test('user-entered SVG markup never creates active DOM nodes', () => {
  const dom = calculate({ coin: '<svg onload=alert(1)></svg>' });
  assert.equal(dom.window.document.querySelector('#resultArea svg'), null);
  assert.match(dom.window.document.getElementById('resultArea').textContent, /<svg onload=/);
  dom.window.close();
});

test('ampersands, angles, and quotes retain their text meaning', () => {
  const raw = 'ETH & "AVAX" <spot> - it\'s a test';
  const dom = calculate({ coin: raw });
  const doc = dom.window.document;
  const pair = [...doc.querySelectorAll('#resultArea .result-line')]
    .find(row => row.textContent.startsWith('Pair:'));
  assert.ok(pair);
  assert.equal(pair.textContent, 'Pair: ' + raw);
  assert.match(pair.innerHTML, /&amp;/);
  assert.match(pair.innerHTML, /&lt;spot&gt;/);
  assert.equal(pair.querySelector('spot'), null);
  dom.window.close();
});

test('normal short-trade result remains unchanged', () => {
  const dom = calculate({ tradeType: 'short', exitPrice: '90' });
  assert.match(dom.window.document.querySelector('.big-result').textContent, /Net Profit:\s*\$100\.00/);
  dom.window.close();
});

test('invalid numeric values show the existing validation message', () => {
  const dom = calculate({ capital: 'invalid', coin: '<img src=x>' });
  const doc = dom.window.document;
  assert.match(doc.getElementById('resultArea').textContent, /Please fill in all numeric fields/);
  assert.equal(doc.querySelector('#resultArea img'), null);
  dom.window.close();
});

test('Clear restores blank state and deletes input', () => {
  const dom = calculate({ coin: 'SOL/USDT' });
  const doc = dom.window.document;
  doc.getElementById('clearBtn').click();
  assert.equal(doc.getElementById('coin').value, '');
  assert.equal(doc.getElementById('resultArea').textContent.trim(),
    'Your crypto trade result will appear here.');
  dom.window.close();
});
