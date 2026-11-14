// FYNX economic calendar UI: a data refresh (every 60 s, or on returning to the tab) must not replace the
// search box while someone is typing (on iPhone that closed the keyboard and dropped the next keystrokes),
// and a filter chip pressed from the keyboard keeps focus. Also checks search and chip filters still work.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets/js/fynx-calendar.js'), 'utf8');
const base = Date.now();
const at = h => new Date(base + h * 3600000).toISOString();
const fixture = {updatedAt: new Date(base).toISOString(), all: [
  {id: 'a', title: 'CPI m/m', currency: 'USD', impact: 'high', time: at(2), forecast: '0.3%', previous: '0.2%'},
  {id: 'b', title: 'Retail Sales m/m', currency: 'AUD', impact: 'medium', time: at(3), forecast: '0.4%', previous: null},
  {id: 'c', title: 'Core CPI y/y', currency: 'EUR', impact: 'high', time: at(5), forecast: '2.1%', previous: '2.2%'},
  {id: 'd', title: 'Trade Balance', currency: 'NZD', impact: 'low', time: at(6), forecast: '-1.1B', previous: '-0.9B'},
]};

(async () => {
  const dom = new JSDOM('<!doctype html><body><div id="cal"></div></body>', {url: 'https://www.fynxfinanceworld.com/tools/economic-calendar.html', runScripts: 'outside-only', pretendToBeVisual: true});
  const {window} = dom;
  let fetches = 0;
  window.fetch = async () => { fetches++; return {ok: true, json: async () => JSON.parse(JSON.stringify(fixture))}; };
  window.TextEncoder = TextEncoder; // jsdom 20 does not expose it; every supported browser does
  window.eval(source);
  const tick = () => new Promise(r => setTimeout(r, 20));
  const host = window.document.getElementById('cal');
  const stop = window.FynxCalendar.mount(host, {compact: false});
  for (let i = 0; i < 20 && !host.querySelector('.fc-search'); i++) await tick();
  const rows = () => [...host.querySelectorAll('.fc-title')].map(n => n.textContent);

  window.localStorage.clear();
  host.querySelector('.fc-chip[data-fc-key="Day:week"]').click();
  assert.deepEqual(rows(), ['CPI m/m', 'Retail Sales m/m', 'Core CPI y/y', 'Trade Balance'], 'all events this week');

  const search = host.querySelector('.fc-search');
  search.focus();
  search.value = 'cpi';
  search.dispatchEvent(new window.Event('input'));
  assert.deepEqual(rows(), ['CPI m/m', 'Core CPI y/y'], 'search filters by title');

  // Returning to the tab redraws from the cache; the 60 s poll redraws from a new fetch. Neither may replace the box.
  window.document.dispatchEvent(new window.Event('visibilitychange'));
  await tick();
  assert.strictEqual(host.querySelector('.fc-search'), search, 'refresh keeps the same search element');
  assert.strictEqual(window.document.activeElement, search, 'search box keeps focus during a refresh');
  assert.equal(search.value, 'cpi');
  assert.deepEqual(rows(), ['CPI m/m', 'Core CPI y/y'], 'search still applied after refresh');

  // Keyboard: pressing a chip redraws the chips; focus must stay on the pressed chip, not fall to the page.
  const high = host.querySelector('.fc-chip[data-fc-key="Importance:high"]');
  high.focus(); high.click();
  const highAfter = host.querySelector('.fc-chip[data-fc-key="Importance:high"]');
  assert.strictEqual(window.document.activeElement, highAfter, 'focus stays on the pressed chip');
  assert.equal(highAfter.getAttribute('aria-pressed'), 'false');
  assert.deepEqual(rows(), [], 'no medium/low CPI rows once High is off');
  assert.ok(/No events match/.test(host.textContent));
  assert.strictEqual(host.querySelector('.fc-search'), search, 'chip clicks keep the same search element');
  assert.equal(host.querySelectorAll('.fc-search').length, 1, 'exactly one search box');

  search.value = ''; search.dispatchEvent(new window.Event('input'));
  host.querySelector('.fc-chip[data-fc-key="Currency:NZD"]').click();
  assert.deepEqual(rows(), ['Trade Balance'], 'currency chip filters');

  // "Add to calendar": only upcoming events that match the filters (NZD chip on -> 1 event).
  const btn = host.querySelector('.fc-ics');
  assert.equal(btn.textContent, 'Add 1 upcoming to calendar (.ics)');
  host.querySelector('.fc-chip[data-fc-key="Currency:*"]').click();
  assert.equal(host.querySelector('.fc-ics').textContent, 'Add 2 upcoming to calendar (.ics)', 'High is still off: AUD (medium) and NZD (low)');

  const holiday = {id: 'h', title: 'Bank Holiday', currency: 'JPY', impact: 'holiday', time: '2026-11-23T00:00:00Z'};
  const odd = {id: 'x'.repeat(64), title: 'GDP q/q, final; revised\\ note — long title that should fold across the 75-octet line limit', currency: 'EUR', impact: 'high', time: '2026-11-20T13:30:00Z', forecast: '0.3%', previous: '0.2%'};
  const ics = window.FynxCalendar.toICS([holiday, odd], Date.parse('2026-11-14T12:00:00Z'));
  const lines = ics.split('\r\n');
  assert.ok(ics.endsWith('\r\n') && lines[0] === 'BEGIN:VCALENDAR' && lines.at(-2) === 'END:VCALENDAR');
  assert.ok(lines.every(l => Buffer.byteLength(l, 'utf8') <= 75), 'lines folded at 75 octets');
  const unfolded = ics.replace(/\r\n /g, '');
  assert.equal((unfolded.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(unfolded.includes('DTSTART;VALUE=DATE:20261123') && unfolded.includes('DTEND;VALUE=DATE:20261124'), 'holiday is all-day');
  assert.ok(unfolded.includes('DTSTART:20261120T133000Z') && unfolded.includes('DTEND:20261120T134500Z'), 'release in UTC, 15 minutes');
  assert.equal((unfolded.match(/BEGIN:VALARM/g) || []).length, 1, 'reminder only for the timed release');
  assert.ok(unfolded.includes('TRIGGER:-PT10M'));
  assert.ok(unfolded.includes('SUMMARY:EUR GDP q/q\\, final\\; revised\\\\ note'), 'commas, semicolons and backslashes escaped');
  assert.ok(unfolded.includes('Forecast: 0.3%\\nPrevious: 0.2%'));
  assert.ok(unfolded.includes('DTSTAMP:20261114T120000Z'));

  stop();
  assert.ok(fetches >= 1);
  window.close();
  console.log('FYNX calendar UI: search box survives refreshes with focus and text; chip focus kept; filters work; .ics export valid.');
})().catch(e => { console.error(e); process.exit(1); });
