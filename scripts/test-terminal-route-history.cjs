'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('terminal.html');
const pages = read('assets/js/terminal/pages.js');
const url = hash => 'https://www.fynxfinanceworld.com/terminal.html' + hash;

function openPage(t, hash = '', state) {
  const {window:w} = new JSDOM(html, {url: url(hash), runScripts: 'outside-only'});
  t.after(() => w.close());
  if (state) w.history.replaceState(state, '', url(hash));
  const $ = id => w.document.getElementById(id);
  const el = (tag, cls = '', text = '') => {
    const e = w.document.createElement(tag); e.className = cls; e.textContent = text; return e;
  };
  const btn = (text, cls, fn) => {
    const e = el('button', cls, text); e.type = 'button'; e.addEventListener('click', fn); return e;
  };
  w.eval(pages);
  const PG = w.FynxTerminalPages({$, el, btn, link: text => el('a', '', text), kv() {},
    S: {feeds: {}, deskKey: 'all'}, D: () => ({label:'All', calc:'fx'}), KEYS: [],
    DESK_ORDER: [], DESK_DEFS: {}, CALC_TITLE: {fx:'Forex'}, calculator() {}});
  const name = () => $('fx-page-name').textContent;
  const hashes = () => [...$('fx-page-crumbs').querySelectorAll('.pg-crumb')].map(e => e.textContent);
  function move(nextHash, nextState) {
    w.history.replaceState(nextState, '', url(nextHash));
    w.dispatchEvent(new w.PopStateEvent('popstate', {state: nextState}));
  }
  return {w, $, PG, name, hashes, move};
}

test('nested route ancestry survives reload, and browser navigation updates the displayed route', t => {
  const first = openPage(t), {PG,w} = first;
  PG.open('help');
  const help = w.history.state;
  PG.open('calc', {kind: 'fx', preset: 'fixture not part of the URL'});
  const calc = w.history.state;
  PG.open('sources');
  const sources = w.history.state;
  assert.equal(sources.fxDepth, 3);
  assert.equal(JSON.stringify(sources.fxRoutes), '[["#help",true],["#calc/fx",true],["#sources",true]]');
  assert.ok(!JSON.stringify(sources).includes('fixture'));
  const reload = openPage(t, '#sources', sources);
  reload.PG.fromLocation();
  assert.equal(reload.name(),'Data sources');
  assert.deepEqual(reload.hashes(), ['All desk','Help','Calculators','Sources']);
  reload.move('#calc/fx', calc);
  assert.equal(reload.name(), 'Calculators');
  assert.deepEqual(reload.hashes(), ['All desk','Help','Calculators']);
  reload.move('#help', help);
  assert.equal(reload.name(), 'Commands, keys and desks');
  reload.move('#calc/fx', calc);
  assert.equal(reload.name(), 'Calculators');
  reload.move('#sources', sources);
  assert.equal(reload.name(), 'Data sources');
  reload.move('', null);
  assert.equal(reload.$('fx-main').hidden, false);
});

test('legacy depth-only state obeys the URL, and Back on a pasted direct link returns to the desk', t => {
  const page = openPage(t, '#sources', {fxDepth: 3});
  page.PG.fromLocation();
  assert.equal(page.name(), 'Data sources');
  page.move('#calc/fx', {fxDepth: 1});
  assert.equal(page.name(), 'Calculators');
  assert.deepEqual(page.hashes(), ['All desk','Calculators']);
  page.$('fx-page-back').click();
  assert.equal(page.w.location.hash, '');
  assert.equal(page.$('fx-main').hidden, false);
});

test('malformed route params do not stop the Terminal from opening another panel', t => {
  const page = openPage(t, '#calc/%');
  assert.doesNotThrow(() => page.PG.fromLocation());
  assert.equal(page.$('fx-main').hidden, false);
  page.PG.open('help');
  assert.equal(page.name(), 'Commands, keys and desks');
});
