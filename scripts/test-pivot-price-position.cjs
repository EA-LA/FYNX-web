'use strict';
// Pivot Points "Where price sits" + "All methods for this candle" (site-qa run 99),
// run against the page's real inline scripts. Expected values from an independent Python check.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const page = readFileSync(join(__dirname, '..', 'tools', 'pivot.html'), 'utf8');
const inline = [...page.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const main = inline.find(s => s.includes('function renderResult('));
const extras = inline.find(s => s.includes('FynxPivotExtras = {'));
assert.ok(main && extras, 'Pivot scripts must exist');

function run(values) {
  const dom = new JSDOM(page, { url: 'https://www.fynxfinanceworld.com/tools/pivot.html', runScripts: 'outside-only' });
  dom.window.eval(main + '\n' + extras);
  const doc = dom.window.document;
  for (const [id, v] of Object.entries(values)) doc.getElementById(id).value = v;
  doc.getElementById('calculateBtn').click();
  return dom;
}
const text = (dom, id) => { const el = dom.window.document.getElementById(id); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; };
const table = dom => [...dom.window.document.querySelectorAll('#pxCompare tr')].map(tr => [...tr.cells].map(td => td.textContent.trim()));
const EUR = { high: '1.08950', low: '1.08120', close: '1.08610' };

test('classic: price between PP and R1 with distances and the closer level', () => {
  const dom = run({ ...EUR, method: 'classic', price: '1.08702' });
  const t = text(dom, 'pxPosition');
  assert.match(t, /Price 1\.08702 sits between PP and R1\./);
  assert.match(t, /Next level up: R1 1\.09000, 0\.00298 away \(\+0\.27%\)/);
  assert.match(t, /Next level down: PP 1\.08560, 0\.00142 away \(−0\.13%\)/);
  assert.match(t, /Closer level: PP\./);
});

test('all methods table: chosen method first, every level matches the formulas', () => {
  const dom = run({ ...EUR, method: 'camarilla', price: '1.08702' });
  const rows = table(dom);
  assert.deepEqual(rows[0].map(c => c.replace(/(Camarilla|Fibonacci|Classic|Woodie).*/, '$1')), ['Level', 'Camarilla', 'Classic', 'Fibonacci', 'Woodie']);
  const get = k => rows.find(r => r[0] === k);
  assert.deepEqual(get('R4'), ['R4', '1.09067', '–', '–', '–']);
  assert.deepEqual(get('R1'), ['R1', '1.08686', '1.09000', '1.08877', '1.09025']);
  assert.deepEqual(get('PP'), ['PP', '1.08560', '1.08560', '1.08560', '1.08573']);
  assert.deepEqual(get('S3'), ['S3', '1.08382', '1.07340', '1.07730', '1.07365']);
  assert.match(text(dom, 'pxPosition'), /between R1 and R2.*R2 1\.08762, 0\.00060 away \(\+0\.06%\).*R1 1\.08686, 0\.00016 away \(−0\.01%\)/);
});

test('price above every level, exactly at a level, invalid and blank', () => {
  let dom = run({ high: '110', low: '100', close: '105', method: 'classic', price: '130' });
  assert.match(text(dom, 'pxPosition'), /above every Classic level\..*Next level down: R3 120\.00, 10\.00 away \(−7\.69%\)/);
  assert.doesNotMatch(text(dom, 'pxPosition'), /Next level up/);
  dom = run({ high: '110', low: '100', close: '105', method: 'classic', price: '105' });
  assert.match(text(dom, 'pxPosition'), /Price 105\.00 is at PP\..*Next level up: R1 110\.00.*Next level down: S1 100\.00/);
  dom = run({ high: '110', low: '100', close: '105', method: 'classic', price: '-1' });
  assert.match(text(dom, 'pivotExtras'), /Enter a current price above 0/);
  dom = run({ high: '110', low: '100', close: '105', method: 'classic', price: '' });
  assert.equal(text(dom, 'pxPosition'), null);
  assert.ok(text(dom, 'pxCompare'));
});

test('typing a price updates live; changing the candle or Clear hides the extras', () => {
  const dom = run({ ...EUR, method: 'classic' });
  const doc = dom.window.document;
  const price = doc.getElementById('price');
  price.value = '1.07000';
  price.dispatchEvent(new dom.window.Event('input'));
  assert.match(text(dom, 'pxPosition'), /below every Classic level\..*Next level up: S3 1\.07340/);
  doc.getElementById('high').value = '1.09';
  doc.getElementById('high').dispatchEvent(new dom.window.Event('input'));
  assert.equal(doc.getElementById('pivotExtras').hidden, true);
  doc.getElementById('calculateBtn').click();
  assert.equal(doc.getElementById('pivotExtras').hidden, false);
  doc.getElementById('clearBtn').click();
  assert.equal(doc.getElementById('pivotExtras').hidden, true);
  assert.equal(price.value, '');
  doc.getElementById('low').value = '120'; doc.getElementById('high').value = '110'; doc.getElementById('close').value = '115';
  doc.getElementById('calculateBtn').click();
  assert.equal(doc.getElementById('pivotExtras').hidden, true, 'no extras next to an error');
});
