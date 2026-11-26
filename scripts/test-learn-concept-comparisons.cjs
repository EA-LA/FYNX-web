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

test('keyboard tablist keeps a single stop and moves focus, selection and panel together', t => {
  const { window } = open('learn.html', t);
  const { document } = window;
  const controller = [...document.scripts].find(script => script.textContent.includes('function setLearnMode('));
  assert.ok(controller);
  const tabs = [...document.querySelectorAll('[role="tablist"] [role="tab"]')];
  const panels = ['learn-content', 'quiz-content'].map(id => document.getElementById(id));
  function verify(active) {
    tabs.forEach((tab, index) => {
      const panel = panels[index], selected = index === active;
      assert.equal(tab.getAttribute('aria-controls'), panel.id);
      assert.equal(tab.getAttribute('aria-selected'), String(selected));
      assert.equal(tab.tabIndex, selected ? 0 : -1);
      assert.equal(panel.getAttribute('role'), 'tabpanel');
      assert.equal(panel.getAttribute('aria-labelledby'), tab.id);
      assert.equal(panel.hidden, !selected);
      assert.equal(panel.tabIndex, 0);
    });
  }
  assert.match(document.querySelector('script[src*="module-loader.js"]').getAttribute('src'), /module-loader\.js/);
  verify(0); // The first paint has the same state as the interactive widget.
  window.eval(controller.textContent);
  window.eval(fs.readFileSync(path.join(root, 'assets/js/module-loader.js'), 'utf8'));
  tabs[0].focus();
  const key = (name, modifiers = {}) => {
    const event = new window.KeyboardEvent('keydown', { key: name, cancelable: true, bubbles: true, ...modifiers });
    document.activeElement.dispatchEvent(event);
    return event.defaultPrevented;
  };
  function move(name, active) {
    assert.ok(key(name), name + ' should not scroll the page');
    verify(active);
    assert.equal(document.activeElement, tabs[active], name + ' should move focus with selection');
  }
  move('ArrowRight', 1);
  assert.equal(panels[1].querySelector('a').pathname, '/trading-quizzes.html');
  move('ArrowRight', 0);
  move('ArrowLeft', 1);
  move('Home', 0);
  move('End', 1);
  assert.equal(key('ArrowDown'), false, 'ordinary page scrolling stays available');
  assert.equal(key('Tab'), false, 'Tab keeps its native sequential focus behavior');
  verify(1);
  tabs[0].click();
  verify(0);
});
