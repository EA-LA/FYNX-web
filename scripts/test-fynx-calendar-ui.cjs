// FYNX economic calendar UI: a data refresh (every 60 s, or on returning to the tab) must not replace the
// search box while someone is typing (on iPhone that closed the keyboard and dropped the next keystrokes),
// and a filter chip pressed from the keyboard keeps focus. Also checks search and chip filters still work.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets/js/fynx-calendar.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '..', 'tools/economic-calendar.html'), 'utf8');
assert.match(page, /fynx-calendar\.js\?v=20261125-calendar-bea-links-1/, 'page loads the updated calendar script');
assert.match(page, /verify the actual figure at the source/, 'page does not promise verified release data');
const home = fs.readFileSync(path.join(__dirname, '..', 'home.html'), 'utf8');
assert.match(home, /fynx-calendar\.js\?v=20261125-calendar-bea-links-1/, 'homepage preview loads the updated calendar script');
const releaseAssets = require('./build-release-assets.cjs');
assert.equal(releaseAssets.ASSET_VERSIONS['assets/js/fynx-calendar.js'], '20261125-calendar-bea-links-1',
  'release asset builder must not undo calendar cache invalidation');
const rewritten = releaseAssets.rewriteReferences(
  '<script src="/assets/js/fynx-calendar.js?v=20261120-site-pages-1"></script>', 'home.html', new Set(['assets/js/fynx-calendar.js'])
);
assert.match(rewritten, /fynx-calendar\.js\?v=20261125-calendar-bea-links-1/,
  'a website build upgrades stale economic calendar script versions');

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

  // "+ Calendar" on each upcoming row (run 98): one event per file, keyboard focus survives the refresh redraw.
  const adds = [...host.querySelectorAll('.fc-add')];
  assert.equal(adds.length, rows().length, 'every upcoming row has a + Calendar button');
  const blobs = [];
  window.URL.createObjectURL = blob => { blobs.push(blob); return 'blob:test'; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () { this.dataset.clicked = this.download; };
  const audBtn = adds.find(b => /AUD Retail Sales/.test(b.getAttribute('aria-label')));
  audBtn.focus(); audBtn.click();
  assert.equal(blobs.length, 1);
  const one = (await new Promise(res => { const fr = new window.FileReader(); fr.onload = () => res(fr.result); fr.readAsText(blobs[0]); })).replace(/\r\n /g, '');
  assert.equal((one.match(/BEGIN:VEVENT/g) || []).length, 1, 'one event in the file');
  assert.ok(one.includes('SUMMARY:AUD Retail Sales m/m') && one.includes('UID:b@fynxfinanceworld.com'));
  assert.ok(/Saved “AUD Retail Sales m\/m”/.test(host.querySelector('.fc-export-note').textContent));
  window.document.dispatchEvent(new window.Event('visibilitychange'));
  await tick();
  const focused = window.document.activeElement;
  assert.ok(focused && focused.classList.contains('fc-add') && focused.dataset.fcEvent === 'b', 'focus stays on the same + Calendar button after a redraw');
  assert.notStrictEqual(focused, audBtn, 'list was redrawn');
  const compactHost = window.document.createElement('div'); window.document.body.append(compactHost);
  const stopCompact = window.FynxCalendar.mount(compactHost, {compact: true});
  for (let i = 0; i < 20 && !compactHost.querySelector('.fc-row'); i++) await tick();
  assert.equal(compactHost.querySelectorAll('.fc-add').length, 0, 'compact home view has no per-row buttons');
  stopCompact();

  // A numeric zero is a real published forecast/previous value, not missing data.
  // Passing the scheduled release time is not evidence that an actual result is published.
  const pastZero = {id: 'zero-past', title: 'Producer Prices', currency: 'USD', impact: 'high',
    time: at(-1), forecast: 0, previous: 0};
  const futureZero = {id: 'zero-future', title: 'Inventory Change', currency: 'USD', impact: 'medium',
    time: at(1), forecast: 0, previous: null};
  const zeroICS = window.FynxCalendar.toICS([pastZero], Date.parse('2026-11-14T12:00:00Z')).replace(/\r\n /g, '');
  assert.ok(zeroICS.includes('Forecast: 0\\nPrevious: 0'), 'export preserves numerical zero forecast and previous');
  assert.ok(!zeroICS.includes('Forecast: —'), 'zero values must not be substituted with missing values');

  fixture.all = [pastZero, futureZero];
  window.localStorage.clear();
  await window.FynxCalendar.load(true);
  const truthHost = window.document.createElement('div');
  window.document.body.append(truthHost);
  const stopTruth = window.FynxCalendar.mount(truthHost, {compact: false});
  for (let i = 0; i < 20 && truthHost.querySelectorAll('.fc-row').length < 2; i++) await tick();
  const truthRows = [...truthHost.querySelectorAll('.fc-row')];
  assert.equal(truthRows.length, 2, 'both known past and upcoming releases appear');
  const pastRow = truthRows.find(row => row.textContent.includes('Producer Prices'));
  const futureRow = truthRows.find(row => row.textContent.includes('Inventory Change'));
  assert.deepEqual([...pastRow.querySelectorAll('.fc-val b')].map(n => n.textContent), ['0', '0'],
    'the displayed forecast and previous reflect numerical zero');
  assert.deepEqual([...futureRow.querySelectorAll('.fc-val b')].map(n => n.textContent), ['0', '—'],
    'numerical zero and a truly missing value remain distinct');
  assert.match(pastRow.getAttribute('aria-label'), /forecast 0, previous 0/,
    'VoiceOver also receives the zero values');
  assert.match(pastRow.textContent, /Result unavailable/, 'past events without a supplied actual say so instead of “awaiting” forever');
  assert.doesNotMatch(pastRow.textContent, /Released/);
  const resultLink = pastRow.querySelector('.fc-actual');
  assert.equal(resultLink.textContent, 'Result details ▸', 'the result control does not imply the release is verified');
  assert.equal(resultLink.tagName, 'BUTTON', 'results open inside FYNX, not at another site');
  assert.match(resultLink.title, /in FYNX/i);
  assert.ok(!futureRow.querySelector('.fc-actual'), 'future events do not show a result link');
  stopTruth();

  // A failed primary request must not disguise an expired bundled file as a quiet calendar.
  const archiveDom = new JSDOM('<!doctype html><body><div id="full"></div><div id="compact"></div></body>', {
    url: 'https://www.fynxfinanceworld.com/tools/economic-calendar.html', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const aw = archiveDom.window;
  const archive = {...fixture, updatedAt: at(-96), to: at(-48), sourceURL: 'https://www.forexfactory.com/calendar',
    all: [{...fixture.all[0], title: 'Archived CPI', time: at(-60)}]};
  let primaryAvailable = false;
  aw.fetch = async url => url.startsWith('https:')
    ? {ok: primaryAvailable, json: async () => JSON.parse(JSON.stringify({...fixture, to: at(48)}))}
    : {ok: true, json: async () => JSON.parse(JSON.stringify(archive))};
  aw.eval(source);
  const full = aw.document.getElementById('full'), compact = aw.document.getElementById('compact');
  const stopFull = aw.FynxCalendar.mount(full);
  const stopArchiveCompact = aw.FynxCalendar.mount(compact, {compact: true});
  for (let i = 0; i < 20 && !full.querySelector('.fc-title'); i++) await tick();
  assert.match(full.querySelector('[role="status"]').textContent, /coverage is unavailable/);
  assert.match(compact.querySelector('[role="status"]').textContent, /saved schedule has ended/);
  assert.match(compact.querySelector('.fc-recap').textContent, /Past events from the saved schedule/);
  assert.doesNotMatch(compact.textContent, /No more important releases are scheduled/);
  assert.match(full.querySelector('.fc-foot').textContent, /last checked/);
  assert.ok(full.querySelector('.fc-foot').textContent.includes(new aw.Date(archive.updatedAt).toLocaleString()));
  assert.ok(full.querySelector('.fc-source'));
  assert.ok(full.querySelector('.fc-ics').disabled);
  primaryAvailable = true;
  // A forced fetch tests recovery without a wall-clock minute; a fresh mount uses its result.
  await aw.FynxCalendar.load(true);
  const restored = aw.document.createElement('div');
  const stopRestored = aw.FynxCalendar.mount(restored);
  for (let i = 0; i < 20 && !restored.querySelector('.fc-title'); i++) await tick();
  assert.ok(restored.querySelector('[role="status"]').hidden, 'current coverage has no stale warning');
  assert.ok(!restored.querySelector('.fc-ics').disabled, 'upcoming export is available after recovery');
  primaryAvailable = false;
  assert.equal((await aw.FynxCalendar.load(true)).updatedAt, fixture.updatedAt, 'do not replace a newer verified in-memory snapshot with the older fallback');
  stopFull(); stopArchiveCompact(); stopRestored(); archiveDom.window.close();

  const beaDom = new JSDOM('<!doctype html><body><div id="cal"></div></body>', {
    url: 'https://www.fynxfinanceworld.com/tools/economic-calendar.html', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const bw = beaDom.window;
  const cases = [
    ['Prelim GDP q/q', 'USD', -8, 'https://www.bea.gov/data/gdp/gross-domestic-product'],
    ['Core PCE Price Index m/m', 'USD', -7, 'https://www.bea.gov/data/income-saving/personal-income'],
    ['Prelim GDP q/q', 'EUR', -6, null],
    ['Core PCE Price Index m/m', 'USD', 8, null],
    ['Core PCE Price Index m/m', 'USD', -5, null, '0.3%']
  ];
  bw.fetch = async () => ({ok: true, json: async () => ({...fixture, to: at(48), all: cases.map(([title, currency, offset, , actual], i) =>
    ({id: String(i + 1).repeat(64), time: at(offset), title, currency, impact: 'high', forecast: '0.3%', previous: '0.2%', actual}))
  })});
  bw.eval(source);
  const beaHost = bw.document.getElementById('cal'), stopBea = bw.FynxCalendar.mount(beaHost);
  for (let i = 0; i < 20 && beaHost.querySelectorAll('.fc-title').length < cases.length; i++) await tick();
  cases.forEach(([title, currency, offset, expected, actual], i) => {
    const row = [...beaHost.querySelectorAll('.fc-row')].find(row => row.querySelector('time').dateTime === at(offset));
    assert.ok(row, `expected fixture row ${i}`);
    (expected ? row.querySelector('.fc-actual') : row.querySelector('.fc-title')).click();
    const detail = beaHost.querySelector('.fc-detail');
    assert.equal(detail.querySelector('.fc-detail-title').textContent, title);
    const archive = detail.querySelector('a[href="/news.html#official-sources"]'), source = detail.querySelector('a[href^="https://www.bea.gov/"]');
    assert.equal(!!archive, !!expected, `FYNX release archive must match country, event, missing result and release time (${currency}/${offset})`);
    assert.equal(source?.getAttribute('href') || null, expected);
    if (expected) assert.deepEqual([...detail.querySelectorAll('.fc-detail-figures .fc-val b')].map(n => n.textContent), ['—', '0.3%', '0.2%'], 'link must not turn a forecast into an actual');
    if (actual) assert.equal(detail.querySelector('.fc-detail-figures .fc-val b').textContent, actual);
  });
  stopBea(); bw.close();

  stop();
  assert.ok(fetches >= 1);
  window.close();
  console.log('FYNX calendar UI: search box survives refreshes with focus and text; chip focus kept; filters work; .ics export valid; + Calendar saves one event and keeps focus.');
})().catch(e => { console.error(e); process.exit(1); });
