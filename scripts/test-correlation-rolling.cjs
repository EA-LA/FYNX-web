'use strict';
// Correlation "Is the link changing?" rolling-window card, run against the real page script.
// Expected values checked independently in Python (statistics.correlation over each window, run 112).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');
const stats = require('../assets/js/correlation-stats.js');

const page = readFileSync(join(__dirname, '..', 'tools', 'correlation.html'), 'utf8');
const inline = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .find(source => source.includes('function calculateCorrelation()'));
assert.ok(inline, 'The correlation script must exist');

// 60 pairs: B follows A for the first 30 pairs and moves against it for the last 30.
const A = [0.2, 0.7728, 1.1229, 1.2891, 0.4857, -0.6555, -1.0544, -1.1286, -0.9954, -0.0137, 1.0518, 1.1923, 0.9729, 0.5964, -0.4558, -1.3385, -1.1676, -0.6768, -0.1436, 0.8648, 1.4788, 0.9816, 0.2792, -0.3046, -1.1632, -1.4543, -0.6566, 0.1677, 0.6908, 1.315, 1.2676, 0.2324, -0.6058, -0.9655, -1.3026, -0.9417, 0.2384, 0.9777, 1.0934, 1.1294, 0.517, -0.6972, -1.2344, -1.058, -0.8192, -0.0467, 1.087, 1.3418, 0.864, 0.4132, -0.4106, -1.3591, -1.2842, -0.5359, 0.0354, 0.798, 1.4799, 1.0673, 0.1158, -0.4678];
const B = [0.16, 0.842, 0.6002, 1.2048, 0.4554, -0.787, -0.5604, -1.0175, -0.9267, 0.2774, 0.5876, 1.0038, 0.9656, 0.1776, -0.1528, -1.0536, -1.1689, -0.2458, -0.2741, 0.6083, 1.4536, 0.5083, 0.3219, -0.098, -1.2232, -0.9192, -0.5581, -0.0663, 0.8526, 0.8527, -1.0485, 0.0593, 0.1924, 0.9167, 1.1421, 0.4758, 0.0791, -0.8642, -1.0352, -0.6076, -0.6474, 0.5734, 1.2005, 0.5469, 0.8414, 0.0889, -1.1243, -0.7855, -0.8201, -0.4466, 0.6121, 0.8254, 1.0927, 0.6035, -0.3266, -0.4158, -1.1823, -1.0786, 0.2053, 0.202];

function close(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} vs ${expected}`);
}

test('rolling windows match an independent calculation', () => {
  const res = stats.rolling(A, B, 20);
  assert.equal(res.windows.length, 41);
  close(res.first.r, 0.960556, 1e-6, 'first');
  close(res.last.r, -0.960388, 1e-6, 'last');
  close(res.min.r, -0.965212, 1e-6, 'min');
  assert.deepEqual([res.min.start, res.min.end], [34, 53]);
  close(res.max.r, 0.964695, 1e-6, 'max');
  assert.deepEqual([res.max.start, res.max.end], [8, 27]);
  close(res.overall, 0.007344, 1e-6, 'overall');
  assert.equal(res.sameSign, 21);
  close(res.criticalR, 0.4438, 1e-4, 'critical r for 20 pairs');
  assert.equal(res.pattern, 'flipped');

  assert.equal(stats.defaultWindow(9), null);
  assert.equal(stats.defaultWindow(10), 5);
  assert.equal(stats.defaultWindow(39), 10);
  assert.equal(stats.defaultWindow(60), 20);
  assert.deepEqual(stats.windowOptions(60), [5, 10, 20, 30]);
  assert.equal(stats.rolling([1, 2, 3], [1, 2, 3], 5), null);

  const flat = stats.rolling([1, 1, 1, 1, 1, 2, 3, 4, 5, 6], [1, 3, 2, 5, 4, 6, 5, 8, 7, 9], 5);
  assert.equal(flat.first.r, null);
  assert.equal(flat.flat, 1);
  const x = [...Array(40).keys()];
  assert.equal(stats.rolling(x, x.map(i => 2 * i + (i % 3)), 10).pattern, 'steady');
});

function run(values, after) {
  const dom = new JSDOM(page, { url: 'https://www.fynxfinanceworld.com/tools/correlation.html', runScripts: 'outside-only' });
  dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  dom.window.eval(readFileSync(join(__dirname, '..', 'assets', 'js', 'correlation-stats.js'), 'utf8'));
  dom.window.eval(readFileSync(join(__dirname, '..', 'assets', 'js', 'correlation-export.js'), 'utf8'));
  dom.window.eval(inline);
  const doc = dom.window.document;
  for (const [id, value] of Object.entries(values)) doc.getElementById(id).value = value;
  doc.getElementById('calculateBtn').click();
  if (after) after(doc, dom.window);
  const text = id => doc.getElementById(id).textContent;
  const out = {
    hidden: doc.getElementById('rollCard').hidden,
    options: [...doc.getElementById('rollWindow').options].map(o => o.value),
    window: doc.getElementById('rollWindow').value,
    verdict: text('rollVerdict'), first: text('rollFirst'), firstLabel: text('rollFirstLabel'),
    last: text('rollLast'), lastLabel: text('rollLastLabel'), min: text('rollMin'), minLabel: text('rollMinLabel'),
    max: text('rollMax'), same: text('rollSame'), crit: text('rollCrit'),
    lines: doc.querySelectorAll('#rollChart polyline').length,
  };
  dom.window.close();
  return out;
}

test('card shows the flip with a 20-pair default window', () => {
  const out = run({ seriesALabel: 'EUR/USD', seriesBLabel: 'USD/CHF', seriesA: A.join(', '), seriesB: B.join(', ') });
  assert.equal(out.hidden, false);
  assert.deepEqual(out.options, ['5', '10', '20', '30']);
  assert.equal(out.window, '20');
  assert.equal(out.firstLabel, 'First 20 pairs (1\u2060–\u206020)');
  assert.equal(out.first, '0.961');
  assert.equal(out.lastLabel, 'Last 20 pairs (41\u2060–\u206060)');
  assert.equal(out.last, '−0.960');
  assert.equal(out.minLabel, 'Lowest window (pairs\u00a034\u2060–\u206053)');
  assert.equal(out.min, '−0.965');
  assert.equal(out.max, '0.965');
  assert.equal(out.same, '21 of 41');
  assert.equal(out.crit, '±0.444');
  assert.equal(out.lines, 1);
  assert.match(out.verdict, /^The link flipped: EUR\/USD and USD\/CHF moved clearly together in pairs\u00a08\u2060–\u206027/);
});

test('window change, short data, invalid input and edits', () => {
  const changed = run({ seriesA: A.join(' '), seriesB: B.join(' ') }, (doc, win) => {
    const sel = doc.getElementById('rollWindow');
    sel.value = '30';
    sel.dispatchEvent(new win.Event('change'));
  });
  assert.equal(changed.firstLabel, 'First 30 pairs (1\u2060–\u206030)');
  assert.equal(changed.crit, '±0.361');
  assert.equal(run({ seriesA: '1, 2, 3, 4, 5', seriesB: '2, 4, 5, 4, 5' }).hidden, true);
  assert.equal(run({ seriesA: '1, 2, 3', seriesB: '1, 2' }).hidden, true);
  const edited = run({ seriesA: A.join(','), seriesB: B.join(',') }, (doc, win) => {
    doc.getElementById('seriesB').dispatchEvent(new win.Event('input'));
  });
  assert.equal(edited.hidden, true);
});
