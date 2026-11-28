'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const html = read('tools/market-hours.html');
const feature = read('assets/js/fx-session-overlap.js');

function open(t, sourceHtml = html) {
  const env = new JSDOM(sourceHtml, { runScripts: 'outside-only', url: 'https://www.fynxfinanceworld.com/tools/market-hours.html' });
  t.after(() => env.window.close());
  const { document } = env.window;
  const downloads = [];
  const created = [];
  env.window.Blob = Blob;
  env.window.URL.createObjectURL = blob => { created.push(blob); return 'blob:local-test-' + created.length; };
  env.window.URL.revokeObjectURL = () => {};
  env.window.HTMLAnchorElement.prototype.click = function () { downloads.push({name: this.download, url: this.href}); };
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
    id, select, downloads, created, window: env.window,
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
  assert.equal(p.id('fx-overlap-calendar').disabled, true);
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


test('the downloaded .ics uses the overlap’s actual UTC instants, even with next-day display time', async t => {
  const p = open(t);
  assert.match(p.compare('london', 'newyork', '2026-03-11', 'Asia/Tokyo'), /12 Mar/);
  const calendar = p.id('fx-overlap-calendar');
  assert.equal(calendar.disabled, false);
  calendar.click();
  assert.deepEqual(p.downloads, [{name: 'fynx-forex-overlap-london-newyork-2026-03-11.ics', url: 'blob:local-test-1'}]);
  assert.match(p.created[0].type, /^text\/calendar/);
  const file = await p.created[0].text();
  assert.match(file, /^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n/);
  assert.match(file, /DTSTAMP:\d{8}T\d{6}Z\r\nDTSTART:20260311T120000Z\r\nDTEND:20260311T170000Z\r\n/);
  assert.match(file, /SUMMARY:London \/ New York forex overlap \(indicative\)\r\n/);
  assert.match(file, /Not live or holiday-adjusted/);
  assert.match(file, /TRANSP:TRANSPARENT\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n$/);
  assert.ok(file.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  assert.doesNotMatch(file, /ATTENDEE|ORGANIZER|RRULE|VALARM|Asia\/Tokyo/);
  assert.match(p.id('fx-overlap-calendar-status').textContent, /Open it in your calendar/);
});

test('stable IDs use the paired sessions and timed window, not dropdown order or display zone', async t => {
  const p = open(t);
  const button = p.id('fx-overlap-calendar');
  p.compare('london', 'newyork', '2026-03-11');
  button.click();
  p.compare('newyork', 'london', '2026-03-11', 'America/Boise');
  button.click();
  p.compare('newyork', 'london', '2026-03-12');
  button.click();
  const ids = await Promise.all(p.created.map(async blob => (await blob.text()).match(/UID:([^\r]+)/)[1]));
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[1], ids[2]);
});

test('no overlap, edited selections and silently changed inputs cannot download old event data', t => {
  const p = open(t);
  const button = p.id('fx-overlap-calendar');
  p.compare('london', 'newyork', '2026-03-11');
  p.id('fx-overlap-date').value = '2026-03-12'; // no change event
  button.click();
  assert.equal(button.disabled, true);
  assert.equal(p.downloads.length, 0);
  p.compare('london', 'newyork', '2026-03-11');
  p.select('tz', 'America/Boise');
  assert.equal(button.disabled, true);
  p.compare('london', 'newyork', '2026-03-14');
  button.click();
  assert.equal(button.disabled, true);
  p.compare('london', 'london', '2026-03-11');
  assert.equal(button.disabled, true);
  assert.equal(p.downloads.length, 0);
});

test('download service unavailable recovers without implying the event was imported', t => {
  const p = open(t);
  p.compare('london', 'newyork', '2026-03-11');
  p.window.URL.createObjectURL = undefined;
  p.id('fx-overlap-calendar').click();
  assert.equal(p.downloads.length, 0);
  assert.match(p.id('fx-overlap-calendar-status').textContent, /Could not prepare the calendar file/);
});


test('mixed-version fixture: prior planner HTML computes an overlap with the current script', t => {
  // Restore the prior page's planner markup and script URL. open() deliberately
  // evaluates the current script anyway, as an uncached request to the old URL can.
  const priorHtml = html.split('\n').filter(line =>
    !['fx-overlap-calendar', 'fx-overlap-calendar-note', 'fx-overlap-calendar-status']
      .some(id => line.includes(`id="${id}"`)))
    .join('\n').replace('fx-session-overlap.js?v=20261128-calendar-1', 'fx-session-overlap.js?v=20261125');
  const p = open(t, priorHtml);
  assert.equal(p.id('fx-overlap-calendar'), null);
  assert.equal(p.id('fx-overlap-calendar-status'), null);
  assert.ok(p.id('fx-overlap').ownerDocument.querySelector('script[src="/assets/js/fx-session-overlap.js?v=20261125"]'));
  assert.equal(p.id('fx-overlap-run').disabled, false);
  assert.match(p.compare('london', 'newyork', '2026-03-11', 'Asia/Tokyo'), /12:00 to .*17:00 UTC;.*12 Mar.*02:00 Asia\/Tokyo \(5 hr\)/);
  p.select('fx-overlap-date', '2026-03-14');
  assert.match(p.id('fx-overlap-result').textContent, /Selection changed/);
  p.id('fx-overlap-run').click();
  assert.match(p.id('fx-overlap-result').textContent, /no scheduled overlap/);
});

for (const absent of ['fx-overlap-calendar', 'fx-overlap-calendar-status']) {
  test(`a missing ${absent} disables only the calendar enhancement`, t => {
    const partial = html.split('\n').filter(line => !line.includes(`id="${absent}"`)).join('\n');
    const p = open(t, partial);
    assert.match(p.compare('london', 'newyork', '2026-03-11'), /12:00 to .*17:00 UTC \(5 hr\)/);
    p.id('fx-overlap-calendar')?.click();
    assert.equal(p.downloads.length, 0);
    assert.notEqual(p.id('fx-overlap-calendar')?.disabled, false);
  });
}
