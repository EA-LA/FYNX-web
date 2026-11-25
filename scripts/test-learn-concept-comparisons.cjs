'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const open = (file, t) => {
  const page = new JSDOM(fs.readFileSync(path.join(root, file), 'utf8'),
    { url: 'https://www.fynxfinanceworld.com/' + file, runScripts: 'outside-only' });
  t.after(() => page.window.close());
  return page;
};

test('home links to Learning center and the free default panel exposes three native comparisons', t => {
  const home = open('home.html', t).window.document;
  const link = Array.from(home.querySelectorAll('a[href="/learn.html"]')).find(a => /Learning center/i.test(a.textContent));
  assert.ok(link);
  const learn = open(link.pathname.slice(1), t).window.document;
  const region = learn.querySelector('#compare-concepts');
  const title = learn.getElementById(region.getAttribute('aria-labelledby'));
  assert.equal(title.textContent, 'Market concepts side by side');
  assert.equal(region.closest('.mode-content.active').id, 'learn-content');
  assert.equal(learn.body.dataset.protectedPage, 'false');
  assert.equal(region.querySelectorAll('button,input,form,script,iframe').length, 0);
  const comparisons = Array.from(region.querySelectorAll('details'));
  assert.deepEqual(comparisons.map(d => d.id), ['compare-order-types', 'compare-fund-pricing', 'compare-bond-yields']);
  for (const detail of comparisons) {
    assert.equal(detail.firstElementChild.tagName, 'SUMMARY');
    assert.equal(detail.open, false);
    assert.equal(detail.querySelectorAll('dt').length, 2);
    assert.equal(detail.querySelectorAll('dd').length, 2);
    assert.match(detail.textContent, /Example:/);
  }
});

test('each comparison links directly to an existing relevant public FYNX lesson', t => {
  const learn = open('learn.html', t).window.document;
  const examples = [
    ['compare-order-types', /market order.*limit order/is, /stock market structure/i],
    ['compare-fund-pricing', /net asset value/i, /ETF Basics/i],
    ['compare-bond-yields', /yield measures/i, /Bond Prices and Yields/i]
  ];
  for (const [id, subject, title] of examples) {
    const detail = learn.getElementById(id);
    const links = detail.querySelectorAll('a');
    assert.equal(links.length, 1);
    const link = links[0];
    assert.equal(link.origin, 'https://www.fynxfinanceworld.com');
    assert.match(link.pathname, /^\/learn\/lessons\//);
    assert.equal(link.target, '');
    const lesson = open(link.pathname.slice(1), t).window.document;
    assert.equal(lesson.title.includes('FYNX'), true);
    assert.match(lesson.querySelector('h1').textContent, title);
    assert.match(lesson.querySelector('main').textContent, subject);
  }
});

test('switching to Quizzes hides the comparison and back to Learning restores it', t => {
  const page = open('learn.html', t);
  const { document } = page.window;
  const toggle = Array.from(document.scripts).find(script => script.textContent.includes('function setLearnMode('));
  assert.ok(toggle);
  page.window.eval(toggle.textContent);
  const panel = document.getElementById('compare-concepts').closest('.mode-content');
  document.getElementById('quizzes-toggle').click();
  assert.equal(panel.classList.contains('active'), false);
  assert.equal(panel.getAttribute('aria-hidden'), 'true');
  assert.equal(document.getElementById('quiz-content').classList.contains('active'), true);
  document.getElementById('learning-toggle').click();
  assert.equal(panel.classList.contains('active'), true);
  assert.equal(panel.getAttribute('aria-hidden'), 'false');
});
