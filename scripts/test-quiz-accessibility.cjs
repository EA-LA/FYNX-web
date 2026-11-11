'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'trading-quizzes.html'), 'utf8');

function extractFunctionGroup(start, end) {
  const first = html.indexOf(start);
  const last = html.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Expected quiz code between ${start} and ${end}`);
  return html.slice(first, last);
}

function makeButton(dataset, classes, pressed) {
  const listeners = {};
  const activeClasses = new Set(classes.split(/\s+/));
  return {
    dataset,
    listeners,
    attributes: { 'aria-pressed': pressed },
    classList: {
      toggle(name, active) {
        if (active) activeClasses.add(name);
        else activeClasses.delete(name);
      },
      contains(name) { return activeClasses.has(name); },
    },
    addEventListener(name, callback) { listeners[name] = callback; },
    setAttribute(name, value) { this.attributes[name] = value; },
    click() { assert.equal(typeof listeners.click, 'function'); listeners.click(); },
  };
}

function categoryHarness() {
  let rendered = 0;
  let buttons = [];
  const categoriesEl = {
    _html: '',
    set innerHTML(value) {
      this._html = value;
      rendered++;
      buttons = [...value.matchAll(/<button type="button" class="([^"]+)" data-category="([^"]+)" aria-pressed="(true|false)">/g)]
        .map(match => makeButton({ category: match[2] }, match[1], match[3]));
    },
    get innerHTML() { return this._html; },
  };
  const keys = ['all', 'forex', 'crypto', 'stocks', 'futures', 'funds', 'indices', 'bonds', 'economy', 'options'];
  const labels = Object.fromEntries(keys.map(key => [key, key.toUpperCase()]));
  const context = vm.createContext({
    categoriesEl, selectedCategory: 'all',
    CATEGORY_LABELS: labels,
    CATEGORY_DESCRIPTIONS: Object.fromEntries(keys.map(key => [key, `Study ${key}`])),
    FULL_COUNTS: Object.fromEntries(keys.map(key => [key, 10])),
    document: { querySelectorAll(selector) {
      assert.equal(selector, '.category-card');
      return buttons;
    } },
  });
  vm.runInContext(extractFunctionGroup('    function setSelectedCategory(key) {', '    function getPool()'), context);
  vm.runInContext('renderCategories()', context);
  return { context, categoriesEl, buttons: () => buttons, renders: () => rendered };
}

function questionHarness() {
  let rendered = 0;
  let options = [];
  const optionsWrap = {
    set innerHTML(value) {
      rendered++;
      options = [...value.matchAll(/<button type="button" class="option ([^"]*)" data-index="(\d+)" aria-pressed="(true|false)">/g)]
        .map(match => makeButton({ index: match[2] }, `option ${match[1]}`, match[3]));
    },
    querySelectorAll(selector) {
      assert.equal(selector, '.option');
      return options;
    },
  };
  const context = vm.createContext({
    activeQuestions: [{ category: 'forex', question: 'Example?', options: ['A', 'B', 'C'], correctIndex: 1 }],
    currentIndex: 0, selectedAnswers: [null],
    CATEGORY_LABELS: { forex: 'Forex' },
    progressMeta: {}, progressFill: { style: {} },
    questionCategoryTag: {}, questionText: {}, nextBtn: {}, optionsWrap,
  });
  vm.runInContext(extractFunctionGroup('    function renderQuestion(){', '    function finishQuiz(){'), context);
  vm.runInContext('renderQuestion()', context);
  return { context, options: () => options, renders: () => rendered };
}

test('category controls are genuine, labeled keyboard-operable buttons with focus styles', () => {
  const h = categoryHarness();
  assert.equal(h.buttons().length, 10);
  assert.equal((h.categoriesEl.innerHTML.match(/<button type="button"/g) || []).length, 10);
  assert.equal(h.buttons().filter(button => button.attributes['aria-pressed'] === 'true').length, 1);
  assert.match(html, /\.category-card:focus-visible/);
  assert.doesNotMatch(h.categoriesEl.innerHTML, /<article class="card category-card/);
});

test('category selection updates pressed state without destroying the focused element', () => {
  const h = categoryHarness();
  const forex = h.buttons().find(button => button.dataset.category === 'forex');
  forex.click();
  assert.equal(h.context.selectedCategory, 'forex');
  assert.equal(h.renders(), 1, 'Do not rebuild the focused button on selection');
  assert.strictEqual(h.buttons().find(button => button.dataset.category === 'forex'), forex);
  assert.equal(forex.attributes['aria-pressed'], 'true');
  assert.equal(h.buttons().find(button => button.dataset.category === 'all').attributes['aria-pressed'], 'false');
  assert.ok(forex.classList.contains('selected'));
});

test('random-category pathway uses the same in-place selection function', () => {
  const h = categoryHarness();
  assert.match(html, /randomCategoryBtn\.addEventListener\("click",[\s\S]*?setSelectedCategory\(keys\[/);
  vm.runInContext('setSelectedCategory("crypto")', h.context);
  assert.equal(h.context.selectedCategory, 'crypto');
  assert.equal(h.renders(), 1);
  assert.equal(h.buttons().find(button => button.dataset.category === 'crypto').attributes['aria-pressed'], 'true');
});

test('choosing and changing answers preserves button identity, focus and pressed state', () => {
  const h = questionHarness();
  const originalButtons = h.options();
  assert.equal(originalButtons.length, 3);
  assert.equal(originalButtons[0].attributes['aria-pressed'], 'false');
  originalButtons[2].click();
  assert.equal(h.context.selectedAnswers[0], 2);
  assert.equal(h.renders(), 1, 'Do not rebuild the focused answer button');
  assert.strictEqual(h.options()[2], originalButtons[2]);
  assert.equal(originalButtons[2].attributes['aria-pressed'], 'true');
  originalButtons[1].click();
  assert.equal(h.context.selectedAnswers[0], 1);
  assert.equal(originalButtons[2].attributes['aria-pressed'], 'false');
  assert.ok(originalButtons[1].classList.contains('selected'));
  assert.equal(h.renders(), 1);
});

test('question rendering continues to show the saved selection when navigating', () => {
  const h = questionHarness();
  h.options()[1].click();
  vm.runInContext('renderQuestion()', h.context);
  assert.equal(h.options()[1].attributes['aria-pressed'], 'true');
  assert.equal(h.options()[0].attributes['aria-pressed'], 'false');
});
