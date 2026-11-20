'use strict';
// Correlation "How reliable is this r?" card, run against the real page script.
// Expected values checked independently in Python (statistics + numerical t integration, run 110).
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

function close(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} vs ${expected}`);
}

test('statistics match an independent calculation', () => {
  const a = stats.describe([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
  close(a.r, 0.7745966692, 1e-9, 'r');
  close(a.p, 0.1240270627, 1e-8, 'p');
  close(a.betaBonA, 0.6, 1e-12, 'beta B on A');
  close(a.betaAonB, 1, 1e-12, 'beta A on B');
  close(a.ci[0], -0.3400820352, 1e-8, 'ci low');
  close(a.ci[1], 0.9842357552, 1e-8, 'ci high');
  close(a.criticalR, 0.8783394482, 1e-8, 'critical r n=5');
  assert.equal(a.significant, false);

  const b = stats.describe([0.20, -0.10, 0.35, 0.50, -0.22], [0.18, -0.07, 0.29, 0.42, -0.19]);
  close(b.p, 1.880143211e-5, 1e-11, 'p example');
  close(b.betaBonA, 0.8353096179, 1e-9, 'beta example');
  assert.equal(b.significant, true);

  const x = [...Array(30).keys()];
  const c = stats.describe(x, x.map(i => (i * 7) % 11));
  close(c.r, 0.0762340808, 1e-9, 'r n=30');
  close(c.p, 0.6888675264, 1e-8, 'p n=30');
  close(c.criticalR, 0.3610069077, 1e-8, 'critical r n=30');
  close(stats.criticalR(4, 0.05), 0.95, 1e-9, 'critical r n=4');
  close(stats.describe([1, 2, 3], [3, 1, 2]).p, 2 / 3, 1e-12, 'p n=3');

  const perfect = stats.describe([1, 2, 3, 4], [2, 4, 6, 8]);
  assert.equal(perfect.perfect, true);
  assert.equal(perfect.ci, null);
  assert.equal(stats.describe([1, 2], [3, 4]), null);
  assert.equal(stats.describe([1, 1, 1], [3, 4, 5]), null);
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
    hidden: doc.getElementById('relCard').hidden,
    verdict: text('relVerdict'), r2: text('relR2'), ci: text('relCi'), ciNote: text('relCiNote'),
    p: text('relP'), crit: text('relCrit'), n: text('relN'),
    betaB: text('relBetaB'), betaA: text('relBetaA'), betaBLabel: text('relBetaBLabel'),
  };
  dom.window.close();
  return out;
}

test('small sample: high r is flagged as possibly luck', () => {
  const out = run({ seriesALabel: 'EUR/USD', seriesBLabel: 'GBP/USD', seriesA: '1, 2, 3, 4, 5', seriesB: '2, 4, 5, 4, 5' });
  assert.equal(out.hidden, false);
  assert.equal(out.r2, '60.0%');
  assert.equal(out.ci, '−0.340 to 0.984');
  assert.equal(out.ciNote, 'Includes 0, so no link at all is still possible.');
  assert.equal(out.p, '0.124');
  assert.equal(out.n, '5');
  assert.equal(out.crit, '±0.878');
  assert.equal(out.betaB, '0.6');
  assert.equal(out.betaA, '1');
  assert.equal(out.betaBLabel, 'Average move in GBP/USD when EUR/USD moves 1');
  assert.match(out.verdict, /^Could be luck: with 5 pairs, an r of 0\.775 is not enough/);
});

test('strong example: probably real, p shown as < 0.001', () => {
  const out = run({ seriesA: '0.20, -0.10, 0.35, 0.50, -0.22', seriesB: '0.18, -0.07, 0.29, 0.42, -0.19' });
  assert.equal(out.p, '< 0.001');
  assert.equal(out.ci, '0.990 to 1.000');
  assert.equal(out.betaB, '0.8353');
  assert.match(out.verdict, /^Probably a real link in this sample: an r of 0\.999 from 5 pairs .*fewer than 30 pairs/);
});

test('two pairs, perfect line, invalid input and edits', () => {
  assert.match(run({ seriesA: '1, 2', seriesB: '3, 5' }).verdict, /^With only 2 pairs, r is always/);
  const perfect = run({ seriesA: '1 2 3 4', seriesB: '−2 −4 −6 −8'.replace(/−/g, '-') });
  assert.match(perfect.verdict, /exactly on a straight line \(r = −1\)/);
  assert.equal(perfect.ci, '—');
  assert.equal(perfect.betaB, '−2');
  assert.equal(run({ seriesA: '1, 2, 3', seriesB: '1, 2' }).hidden, true);
  const edited = run({ seriesA: '1, 2, 3, 4, 5', seriesB: '2, 4, 5, 4, 5' }, (doc, win) => {
    doc.getElementById('seriesA').dispatchEvent(new win.Event('input'));
  });
  assert.equal(edited.hidden, true);
});
