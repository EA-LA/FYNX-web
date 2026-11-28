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
// Level values only: the run-105 bracket marks (glyph + screen-reader text) are checked separately below.
const table = dom => [...dom.window.document.querySelectorAll('#pxCompare tr')].map(tr => [...tr.cells].map(td => { const c = td.cloneNode(true); c.querySelectorAll('.px-mk,.px-sr').forEach(n => n.remove()); return c.textContent.trim(); }));
const tableMarks = dom => { const doc = dom.window.document; const heads = [...doc.querySelectorAll('#pxCompare thead th')].map(th => (th.querySelector('.px-long') || th).textContent.trim()); return [...doc.querySelectorAll('#pxCompare td.px-near')].map(td => { const tr = td.parentElement; return `${heads[[...tr.cells].indexOf(td)]} ${tr.cells[0].textContent.trim()} ${td.querySelector('.px-mk').textContent}`; }).sort(); };
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

// [site-qa] run 103: the level cards that bracket the current price are marked.
const marks = dom => Object.fromEntries([...dom.window.document.querySelectorAll('#resultArea .px-mark')].map(el => [el.dataset.level, el.querySelector('.px-tag').textContent]));

test('level cards: next level up/down and price-at-level are marked and follow the price input', () => {
  let dom = run({ ...EUR, method: 'classic', price: '1.08702' });
  assert.deepEqual(marks(dom), { PP: '↓ Next down', R1: '↑ Next up' });
  dom = run({ ...EUR, method: 'camarilla', price: '1.08702' });
  assert.deepEqual(marks(dom), { R1: '↓ Next down', R2: '↑ Next up' });
  dom = run({ high: '110', low: '100', close: '105', method: 'classic', price: '105' });
  assert.deepEqual(marks(dom), { PP: '● Price here', R1: '↑ Next up', S1: '↓ Next down' });
  dom = run({ high: '110', low: '100', close: '105', method: 'classic', price: '130' });
  assert.deepEqual(marks(dom), { R3: '↓ Next down' });
  // Typing a new price re-marks; clearing it removes every mark and tag.
  const doc = dom.window.document, price = doc.getElementById('price');
  price.value = '96'; price.dispatchEvent(new dom.window.Event('input'));
  assert.deepEqual(marks(dom), { S1: '↑ Next up', S2: '↓ Next down' });
  price.value = ''; price.dispatchEvent(new dom.window.Event('input'));
  assert.deepEqual(marks(dom), {});
  assert.equal(doc.querySelectorAll('#resultArea .px-tag').length, 0);
  dom = run({ high: '110', low: '100', close: '105', method: 'classic', price: '-1' });
  assert.deepEqual(marks(dom), {});
});

test('all methods table marks, per method, the levels that bracket the current price (run 105)', () => {
  // Hand-checked: H110 L100 C108. Classic PP 106 R1 112; Fib PP 106 R1 109.82; Woodie PP 106.5 R1 113;
  // Camarilla R1 108.917 R2 109.833. Price 109 sits between those pairs.
  let dom = run({ high: '110', low: '100', close: '108', method: 'classic', price: '109' });
  assert.deepEqual(tableMarks(dom), ['Camarilla R1 ↓', 'Camarilla R2 ↑', 'Classic PP ↓', 'Classic R1 ↑', 'Fibonacci PP ↓', 'Fibonacci R1 ↑', 'Woodie PP ↓', 'Woodie R1 ↑']);
  assert.match(text(dom, 'pxCompare'), /Shaded: in each column, the nearest level above and below your current price 109\.00/);
  assert.match(dom.window.document.querySelector('#pxCompare td.px-near .px-sr').textContent, /next level (up|down)/);
  // At a level (display precision): Classic/Fib PP 106 at the price; Woodie PP 106.5 is next up.
  dom = run({ high: '110', low: '100', close: '108', method: 'classic', price: '106' });
  const m = tableMarks(dom);
  assert.ok(m.includes('Classic PP ●') && m.includes('Classic R1 ↑') && m.includes('Classic S1 ↓'));
  assert.ok(m.includes('Woodie PP ↑') && m.includes('Woodie S1 ↓'));
  // Above every level: only the top level of each column is marked (down).
  dom = run({ high: '110', low: '100', close: '108', method: 'classic', price: '200' });
  assert.deepEqual(tableMarks(dom), ['Camarilla R4 ↓', 'Classic R3 ↓', 'Fibonacci R3 ↓', 'Woodie R3 ↓']);
  // No price, or an invalid one: no marks and no shading note.
  for (const price of ['', '-1']) {
    dom = run({ high: '110', low: '100', close: '108', method: 'classic', price });
    assert.deepEqual(tableMarks(dom), []);
    assert.doesNotMatch(text(dom, 'pxCompare'), /Shaded/);
  }
});

// [site-qa] run 108: "Where the methods agree" (3+ methods within 5% of the candle's range). Expected zones from an
// independent Python grouping of the same formulas.
const zones = dom => [...dom.window.document.querySelectorAll('#pxAgree .px-zone')].map(li => li.textContent.replace(/\s+/g, ' ').trim());

test('where the methods agree: stock candle, with distance from the current price', () => {
  const dom = run({ high: '110', low: '100', close: '108', method: 'classic', price: '109' });
  const z = zones(dom);
  assert.equal(z.length, 4);
  assert.match(z[0], /^116\.00 – 116\.50 · 3 methods.*Classic R2, Fibonacci R3, Woodie R2\. 7\.00 above your price \(\+6\.42%\)\.$/);
  assert.match(z[1], /^106\.00 – 106\.50 · 4 methods.*Classic PP.*Woodie PP\. 2\.50 below your price \(−2\.29%\)\.$/);
  assert.match(z[2], /^102\.00 – 102\.50 · 3 methods.*Classic S1, Fibonacci S1, Camarilla S4\./);
  assert.match(z[3], /^96\.00 – 96\.50 · 3 methods.*Classic S2, Fibonacci S3, Woodie S2\./);
  assert.match(text(dom, 'pxAgree'), /within 0\.50 of each other \(5% of the candle's range\)/);
});

test('where the methods agree: FX candle, price inside a zone, no price, flat candle', () => {
  let dom = run({ ...EUR, method: 'woodie', price: '1.08550' });
  const z = zones(dom);
  assert.deepEqual(z.map(t => t.split(' · ')[0]), ['1.09390 – 1.09403', '1.08534 – 1.08573', '1.08154 – 1.08195', '1.07730 – 1.07743']);
  assert.match(z[1], /4 methods.*Your price is inside this area\.$/);
  dom = run({ ...EUR, method: 'classic', price: '' });
  assert.equal(zones(dom).length, 4);
  assert.doesNotMatch(text(dom, 'pxAgree'), /your price/);
  dom = run({ high: '100', low: '100', close: '100', method: 'classic', price: '' });
  assert.equal(text(dom, 'pxAgree'), null);
});

test('all methods table keeps full method names and marks every pivot level as a row header', () => {
  const dom = run({ ...EUR, method: 'camarilla', price: '1.08702' });
  try {
    const doc = dom.window.document;
    const columns = [...doc.querySelectorAll('#pxCompare thead th')];
    assert.equal(columns[0].textContent, 'Level');
    assert.deepEqual(columns.slice(1).map(th => th.getAttribute('aria-label')), ['Camarilla', 'Classic', 'Fibonacci', 'Woodie']);
    assert(columns.every(th => th.scope === 'col'));
    assert(columns.slice(1).every(th => th.querySelector('.px-short').getAttribute('aria-hidden') === 'true'), 'visual abbreviations are not repeated');
    const rowHeads = [...doc.querySelectorAll('#pxCompare tbody th[scope="row"]')];
    assert.deepEqual(rowHeads.map(th => th.textContent), ['R4', 'R3', 'R2', 'R1', 'PP', 'S1', 'S2', 'S3', 'S4']);
    assert(rowHeads.every(th => th.cellIndex === 0 && th.parentElement.querySelectorAll('td').length === 4));
  } finally {
    dom.window.close();
  }
});
