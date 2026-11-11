'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
process.env.TZ = 'America/Los_Angeles';
const html = fs.readFileSync('tools/calendar-alerts.html', 'utf8');
const match = html.match(/<script>\s*(const THEME_KEY = "fynx_theme";[\s\S]*?)<\/script>/);
assert.ok(match, 'Calendar browser-alert source is present');
const source = match[1];
function mount(alerts, nowISO) {
  const nodes = new Map(), listeners = {};
  const saved = { fynx_calendar_alerts: JSON.stringify(alerts) };
  const classes = { add() {}, remove() {}, contains() { return false; } };
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', textContent: '', innerHTML: '', className: '',
      addEventListener(type, cb) { listeners[id + ':' + type] = cb; },
      classList: classes
    });
    return nodes.get(id);
  };
  class FixedDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(nowISO); }
    static now() { return new Date(nowISO).getTime(); }
  }
  const context = {
    document: { body: { classList: classes }, getElementById: get },
    window: { FynxPreferences: { getItem() { return null; }, setItem() {} }, addEventListener() {} },
    localStorage: {
      getItem(key) { return Object.hasOwn(saved, key) ? saved[key] : null; },
      setItem(key, value) { saved[key] = value; }
    },
    crypto: { randomUUID() { return 'new-test-alert'; } },
    Date: FixedDate, setInterval() {}, console
  };
  vm.runInNewContext(source, context, { timeout: 1500 });
  return { get, listeners, saved, context };
}
const malicious = {
  id: 'a" onmouseover="alert(1)',
  name: '<img src=x onerror=alert(1)>',
  note: '</div><script>alert(1)</script>',
  category: '<svg onload=alert(1)>',
  impact: 'high',
  date: '2026-12-01', time: '12:00', reminderOffset: 15,
  notified: false
};
const a = mount([malicious], '2026-11-10T01:30:00Z');
const markup = a.get('alertsList').innerHTML;
assert.ok(markup.includes('&lt;img src=x onerror=alert(1)&gt;'), 'name escaped as text');
assert.ok(markup.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'note escaped as text');
assert.ok(markup.includes('&lt;svg onload=alert(1)&gt;'), 'category escaped as text');
assert.ok(markup.includes('a&quot; onmouseover=&quot;alert(1)'), 'identifier escaped in attribute');
assert.ok(!markup.includes('<img') && !markup.includes('<script') && !markup.includes('<svg'), 'no executable injected markup');
assert.ok(!markup.includes(' onclick='), 'deletion no longer uses inline JS');
assert.ok(markup.includes('aria-label="Delete '), 'delete control has an accessible name');
assert.ok(markup.includes('data-ics-id='), 'existing calendar download action is preserved');
assert.equal(a.get('eventDate').value, '2026-11-09', 'defaults to local day, not UTC day');
assert.equal(a.get('eventTime').value, '18:30', 'defaults to local time plus one hour');
const handler = a.listeners['alertsList:click'];
assert.equal(typeof handler, 'function', 'delegated delete handler is installed');
handler({ target: { closest(selector) {
  return selector === '[data-delete-id]' ? { getAttribute(name) {
    assert.equal(name, 'data-delete-id'); return malicious.id;
  } } : null;
} } });
assert.equal(JSON.parse(a.saved.fynx_calendar_alerts).length, 0, 'delete works without inline JavaScript');
const b = mount([], '2026-11-09T07:30:00Z');
assert.equal(b.get('eventDate').value, '2026-11-09', 'midnight rollover uses local date');
assert.equal(b.get('eventTime').value, '00:30', 'midnight rollover uses local time');
const c = mount({ unexpected: 'data' }, '2026-11-10T01:30:00Z');
assert.ok(c.get('alertsList').innerHTML.includes('No alerts saved yet'), 'invalid stored shape cannot crash render');
const d = mount([null, false, 'bad', [], malicious], '2026-11-10T01:30:00Z');
assert.ok(d.get('alertsList').innerHTML.includes('&lt;img'), 'invalid entries are ignored while valid alerts remain');
console.log('Calendar alerts: HTML escaping, safe delegated delete, local date/time, invalid storage all passed.');
