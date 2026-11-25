'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const html = read('tools/market-hours.html');
const feature = read('assets/js/fx-session-overlap.js');

function open(t) {
  const env = new JSDOM(html, { runScripts: 'outside-only', url: 'https://www.fynxfinanceworld.com/tools/market-hours.html' });
  t.after(() => env.window.close());
  const { document } = env.window;
  const id = name => document.getElementById(name);
  const page = Array.from(document.scripts).find(s => s.textContent.includes('const MARKETS = {'));
  assert.ok(page);
  // Script tags share globals. Separate calls to window.eval do not share lexical scope.
  env.window.eval(page.textContent + '\n' + feature);
  const select = (name, value) => {
    id(name).value = value;
    id(name).dispatchEvent(new env.window.Event('change', { bubbles: true }));
  };
  return {
    id, select,
    compare(first, second, date, zone = 'UTC') {
      select('fx-overlap-first', first);
      select('fx-overlap-second', second);
      select('fx-overlap-date', date);
      select('tz', zone);
      id('fx-overlap-run').click();
      return id('fx-overlap-result').textContent;
    }
  };
}

test('Home links to free Market Hours, and planner loads after the existing schedule', t => {
  const entry = new JSDOM(read('home.html'));
  t.after(() => entry.window.close());
  assert.ok(entry.window.document.querySelector('.nr-sessions a[href="/tools/market-hours.html"]'));
  const p = open(t);
  const scripts = Array.from(p.id('fx-overlap').ownerDocument.scripts);
  assert.ok(scripts.findIndex(s => s.textContent.includes('const MARKETS = {')) <
    scripts.findIndex(s => s.getAttribute('src')?.startsWith('/assets/js/fx-session-overlap.js?')));
  assert.equal(p.id('fx-overlap-first').options.length, 4);
  assert.equal(p.id('fx-overlap-first').value, 'london');
  assert.equal(p.id('fx-overlap-second').value, 'newyork');
  assert.equal(p.id('fx-overlap-run').disabled, false);
  assert.equal(p.id('fx-overlap-result').getAttribute('role'), 'status');
  assert.doesNotMatch(feature, /localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest/);
});

test('US/UK daylight-saving mismatch extends the London–New York overlap', t => {
  const p = open(t);
  assert.match(p.compare('london', 'newyork', '2026-01-15'), /13:00 to .*17:00 UTC \(4 hr\)/);
  assert.match(p.compare('london', 'newyork', '2026-03-11'), /12:00 to .*17:00 UTC \(5 hr\)/);
  assert.match(p.compare('london', 'newyork', '2026-04-02'), /12:00 to .*16:00 UTC \(4 hr\)/);
});

test('date rollover is visible when display-zone hours extend into tomorrow', t => {
  const p = open(t);
  const text = p.compare('london', 'newyork', '2026-03-11', 'Asia/Tokyo');
  assert.match(text, /11 Mar.*21:00 to 12 Mar.*02:00 Asia\/Tokyo \(5 hr\)/);
});

test('neighboring local weekdays contribute to the selected UTC day', t => {
  const p = open(t);
  assert.match(p.compare('sydney', 'tokyo', '2026-11-23'), /00:00 to .*06:00 UTC \(6 hr\)/);
  assert.match(p.compare('newyork', 'sydney', '2026-01-02'), /no scheduled overlap/);
  assert.match(p.compare('newyork', 'sydney', '2026-01-05'), /21:00 to .*22:00 UTC \(1 hr\)/);
  assert.match(p.compare('london', 'newyork', '2026-01-04'), /no scheduled overlap/);
});

test('no overlap and duplicate inputs are distinguishable, and edits invalidate old results', t => {
  const p = open(t);
  assert.match(p.compare('tokyo', 'newyork', '2026-03-11'), /no scheduled overlap/);
  assert.match(p.compare('tokyo', 'tokyo', '2026-03-11'), /Choose two different sessions/);
  assert.match(p.compare('london', 'newyork', '2026-03-11'), /5 hr/);
  p.select('tz', 'America/Boise');
  assert.equal(p.id('fx-overlap-result').textContent, 'Selection changed. Find overlap again for the current inputs.');
  p.id('fx-overlap-run').click();
  assert.match(p.id('fx-overlap-result').textContent, /06:00 to .*11:00 America\/Boise \(5 hr\)/);
});
