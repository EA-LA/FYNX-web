'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function open(t, extraQuestion) {
  const dom = new JSDOM(read('trading-quizzes.html'), { url:'https://www.fynxfinanceworld.com/trading-quizzes.html',runScripts:'outside-only' });
  const { window } = dom;
  t.after(() => dom.window.close());
  window.crypto.randomUUID = require('node:crypto').randomUUID;
  window.matchMedia = () => ({ matches:true });
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.alert = () => { throw Error('Unexpected answer validation'); };
  const events = [];
  for (const name of ['fynx:quiz-started','fynx:quiz-completed']) {
    window.addEventListener(name, event => events.push([name, event.detail]));
  }
  const { document } = window;
  const get = id => document.getElementById(id);
  const js = [...document.scripts].find(s => s.textContent.includes('function startQuiz()')).textContent;
  const snapshot = () => JSON.parse(window.quizTestSnapshot());
  const script = extraQuestion
    ? js.replace('const QUIZ_BANK = [', 'const QUIZ_BANK = [' + JSON.stringify(extraQuestion) + ',')
    : js;
  window.eval(script + '\nwindow.quizTestSnapshot = () => JSON.stringify({activeQuestions, currentIndex, bank:QUIZ_BANK});');
  return { document, get, snapshot, events,
    answer(correct) {
      const { activeQuestions, currentIndex } = snapshot();
      const q = activeQuestions[currentIndex];
      const buttons = document.querySelectorAll('#optionsWrap button');
      buttons[correct ? q.correctIndex : (q.correctIndex + 1) % q.options.length].click();
      get('nextBtn').click();
    },
  };
}

test('Learning tab exposes the existing free quiz route', t => {
  const page = new JSDOM(read('learn.html'), { runScripts:'outside-only' });
  t.after(() => page.window.close());
  const doc = page.window.document;
  const toggle = Array.from(doc.scripts).find(script => script.textContent.includes('function setLearnMode('));
  page.window.eval(toggle.textContent);
  doc.getElementById('quizzes-toggle').click();
  assert.equal(doc.getElementById('quiz-content').classList.contains('active'), true);
  assert.ok(doc.querySelector('#quiz-content a[href="trading-quizzes.html"]'));
});

test('practice includes only missed questions and uses fresh selection and focus', t => {
  const q = open(t);
  q.get('startQuizBtn').click();
  const before = q.snapshot().activeQuestions;
  for (let i = 0; i < 10; i++) q.answer(i !== 1 && i !== 7);
  assert.equal(q.get('scoreValue').textContent, '8/10');
  assert.equal(q.get('practiceMissedBtn').textContent, 'Practice 2 missed questions');
  assert.equal(q.document.querySelectorAll('#reviewList .review-card').length, 10);
  q.get('practiceMissedBtn').click();
  const firstPractice = q.snapshot().activeQuestions;
  assert.deepEqual(firstPractice.map(x => x.question), [before[1].question,before[7].question]);
  assert.deepEqual(firstPractice.map(x => x.options[x.correctIndex]), [before[1],before[7]].map(x => x.options[x.correctIndex]));
  assert.equal(q.get('progressMeta').textContent, 'Question 1 of 2');
  assert.equal(q.document.activeElement, q.get('questionText'));
  assert.equal(q.document.querySelectorAll('#optionsWrap [aria-pressed="true"]').length, 0);
  q.answer(true);
  q.answer(false);
  assert.equal(q.get('scoreValue').textContent, '1/2');
  assert.equal(q.get('quizResultsHeading').textContent, 'Practice results');
  assert.equal(q.document.activeElement, q.get('quizResultsHeading'));
  assert.match(q.get('quizResultsIntro').textContent, /not saved/);
  assert.equal(q.get('practiceMissedBtn').textContent, 'Practice 1 missed question');
  q.get('practiceMissedBtn').click();
  assert.deepEqual(q.snapshot().activeQuestions.map(x => x.question), [before[7].question]);
  q.answer(true);
  assert.equal(q.get('scoreValue').textContent, '1/1');
  assert.equal(q.get('practiceMissedBtn').hidden, true);
  assert.equal(q.events.length, 2, 'practice attempts do not emit saved quiz events');
  assert.equal(q.events[1][1].total, 10);
  assert.equal(q.events[1][1].correct, 8);
  q.get('retryBtn').click();
  assert.equal(q.get('progressMeta').textContent, 'Question 1 of 10');
  assert.equal(q.events.length, 3);
});

test('a perfect full attempt offers no missed-question practice', t => {
  const q = open(t);
  q.get('startQuizBtn').click();
  for (let i = 0; i < 10; i++) q.answer(true);
  assert.equal(q.get('scoreValue').textContent, '10/10');
  assert.equal(q.get('practiceMissedBtn').hidden,true);
  assert.equal(q.get('quizResultsHeading').textContent,'Your results');
  assert.equal(q.events.length,2);
});

test('the visible bank, category counts and quiz all use the same actual question pool', t => {
  const q = open(t);
  const { bank } = q.snapshot();
  const cards = [...q.document.querySelectorAll('#categories [data-category]')];
  assert.equal(cards.length, 10);
  assert.equal(cards.find(card => card.dataset.category === 'all').querySelector('.category-count').textContent, bank.length.toLocaleString() + ' questions');
  assert.equal(q.get('quizBankTotal').textContent, bank.length.toLocaleString());
  assert.equal(q.document.querySelector('[data-quiz-bank-count]').textContent, bank.length.toLocaleString() + ' educational questions');
  for (const card of cards) {
    const category = card.dataset.category;
    const expected = category === 'all' ? bank : bank.filter(question => question.category === category);
    assert.equal(card.querySelector('.category-count').textContent, expected.length.toLocaleString() + ' questions', category);
    card.click();
    q.get('startQuizBtn').click();
    const { activeQuestions } = q.snapshot();
    assert.equal(activeQuestions.length, 10);
    assert.ok(activeQuestions.every(question => expected.some(entry => entry.question === question.question)));
  }
});

test('adding a question to the bank automatically updates total and category copy', t => {
  const original = open(t);
  const added = open(t, {category:'crypto', question:'Extra practice question?', options:['A','B'], correctIndex:1, explanation:'B'});
  const cardCount = (q, category) => parseInt(q.document.querySelector('[data-category="' + category + '"] .category-count').textContent.replace(/,/g, ''), 10);
  assert.equal(cardCount(added, 'all'), cardCount(original, 'all') + 1);
  assert.equal(cardCount(added, 'crypto'), cardCount(original, 'crypto') + 1);
  assert.equal(cardCount(added, 'forex'), cardCount(original, 'forex'));
  assert.equal(added.get('quizBankTotal').textContent, cardCount(added, 'all').toLocaleString());
});
