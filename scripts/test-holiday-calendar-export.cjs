'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TextEncoder } = require('node:util');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/holiday-calendar-export.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'tools/market-holidays.html'), 'utf8');
const clicked = [];
const revoked = [];
let downloadContent;
const window = {
  Blob: class Blob { constructor(parts, options) { downloadContent = parts.join(''); this.type = options.type; } },
  URL: { createObjectURL: () => 'blob:fynx-test', revokeObjectURL: url => revoked.push(url) },
  document: {
    body: { appendChild: node => clicked.push(node) },
    createElement: () => ({ click() { this.wasClicked = true; }, remove() { this.wasRemoved = true; } })
  },
  setTimeout: callback => callback()
};
vm.runInNewContext(source, { window, TextEncoder });
const api = window.FynxHolidayCalendarExport;

function sample(overrides = {}) {
  return {
    id: 'NYSE-close-2026',
    date: new Date(2026, 11, 31),
    name: 'New Year, Eve; "Markets" \\ Test',
    status: 'early',
    impact: 'high',
    exchanges: ['NYSE', 'NASDAQ'],
    markets: ['Stocks', 'Options'],
    regions: ['Americas'],
    notes: 'Early close.\nFollow the official exchange schedule.',
    ...overrides
  };
}
const unfold = value => value.replace(/\r\n /g, '');

test('exports a valid CRLF calendar with a deterministic all-day UID', () => {
  const a = api.serialize([sample()], new Date('2026-11-09T18:30:00.000Z'));
  const b = api.serialize([sample()], new Date('2026-11-09T18:30:00.000Z'));
  assert.equal(a, b);
  assert.ok(a.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(a.endsWith('END:VCALENDAR\r\n'));
  assert.match(unfold(a), /DTSTAMP:20261109T183000Z/);
  assert.match(unfold(a), /DTSTART;VALUE=DATE:20261231/);
  assert.match(unfold(a), /DTEND;VALUE=DATE:20270101/);
  assert.match(unfold(a), /UID:20261231-[0-9a-f]{8}@fynxfinanceworld.com/);
  assert.match(unfold(a), /TRANSP:TRANSPARENT/);
  assert.equal((a.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test('escapes commas, semicolons, backslashes and line breaks without ICS injection', () => {
  const a = unfold(api.serialize([sample()]));
  assert.ok(a.includes('New Year\\, Eve\\;'));
  assert.ok(a.includes('Markets" \\\\ Test'));
  assert.ok(a.includes('Early close.\\nFollow the official exchange schedule.'));
  assert.ok(!a.includes('Early close.\nFollow'));
});

test('folded UTF-8 calendar lines stay within RFC 5545 75-octet limit', () => {
  const payload = api.serialize([sample({ name: '重要市場'.repeat(50), notes: '💼'.repeat(100) })]);
  for (const line of payload.split('\r\n')) {
    if (line) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, 'Overlong ICS line: ' + line.slice(0, 30));
  }
  assert.ok(payload.includes('\r\n '), 'Expected folded line continuation');
});

test('serializes only the selected events and supports a valid empty snapshot', () => {
  const empty = api.serialize([]);
  assert.equal((empty.match(/BEGIN:VEVENT/g) || []).length, 0);
  const one = api.serialize([sample()]);
  assert.equal((one.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.equal(api.filename(2029), 'fynx-market-holidays-2029.ics');
  assert.throws(() => api.filename(2031), /Unsupported/);
  assert.throws(() => api.serialize([{ name: 'Bad', date: new Date('invalid') }]), /invalid date/);
});

test('download uses a local Blob and cleans up the temporary URL and element', () => {
  const result = api.download([sample()], 2026);
  assert.equal(result.count, 1);
  assert.equal(result.name, 'fynx-market-holidays-2026.ics');
  assert.equal(clicked.length, 1);
  assert.equal(clicked[0].href, 'blob:fynx-test');
  assert.equal(clicked[0].download, 'fynx-market-holidays-2026.ics');
  assert.ok(clicked[0].wasClicked);
  assert.ok(clicked[0].wasRemoved);
  assert.deepEqual(revoked, ['blob:fynx-test']);
  assert.ok(downloadContent.includes('BEGIN:VCALENDAR'));
  assert.throws(() => api.download([], 2026), /No events/);
});

test('page integrates actual filtered selection and accessible status, without inert buttons', () => {
  assert.match(html, /id="downloadHolidays"[^>]*aria-describedby="calendarExportNote"/);
  assert.match(html, /id="calendarExportStatus" role="status" aria-live="polite"/);
  assert.match(html, /FynxHolidayCalendarExport\.download\(filtered\(\), state\.year\)/);
  assert.match(html, /downloadHolidays\.disabled = items\.length === 0/);
  assert.match(html, /src="\/assets\/js\/holiday-calendar-export\.js\?v=[^"\s]+"/);
  assert.match(html, /all-day calendar snapshot/);
});
