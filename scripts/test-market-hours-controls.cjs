'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'tools', 'market-hours.html'), 'utf8');

// Native controls must remain keyboard operable without custom key handlers.
assert.match(html, /<button\b[^>]*\bid="refreshBtn"[^>]*>/);
assert.match(html, /<button\b[^>]*\bid="refreshBtn"[^>]*\btype="button"/);
assert.match(html, /<div\b[^>]*\bid="tabs"[^>]*\brole="group"[^>]*\baria-label="Market type"/);
assert.match(html, /\.btn:focus-visible,\s*\.tab:focus-visible/);

const start = html.indexOf('function buildTabs(){');
const end = html.indexOf('\nfunction renderAxis(){', start);
assert.ok(start >= 0 && end > start, 'market tab renderer exists');
const source = html.slice(start, end);

let renderCount = 0;
const buttons = [];
const tabsEl = {
  children: buttons,
  appendChild(button) { buttons.push(button); },
  querySelectorAll(selector) {
    assert.equal(selector, 'button[data-market]');
    return buttons.filter(button => button.dataset.market);
  }
};
const document = {
  createElement(tag) {
    assert.equal(tag, 'button', 'tabs must be native buttons');
    const classes = new Set();
    return {
      type: '', dataset: {}, attributes: {}, listeners: {},
      classList: {
        toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); }
      },
      addEventListener(event, handler) { this.listeners[event] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      click() { this.listeners.click(); }
    };
  }
};
const STATE = { active: 'forex' };
const context = {
  tabsEl, document, STATE,
  MARKETS: { forex: { label: 'Forex' }, stocks: { label: 'Stocks' }, crypto: { label: 'Crypto' } },
  renderAll() { renderCount++; context.buildTabs(); }
};
vm.runInNewContext(source, context, { timeout: 1000 });
context.buildTabs();
assert.equal(buttons.length, 3);
assert.equal(buttons[0].type, 'button');
assert.equal(buttons[0].attributes['aria-pressed'], 'true');
assert.equal(buttons[1].attributes['aria-pressed'], 'false');
const original = [...buttons];
buttons[1].click();
assert.equal(STATE.active, 'stocks');
assert.equal(renderCount, 1);
assert.equal(buttons[0].attributes['aria-pressed'], 'false');
assert.equal(buttons[1].attributes['aria-pressed'], 'true');
context.buildTabs(); // Simulate the 30-second periodic refresh.
assert.equal(buttons.length, 3);
for (let i = 0; i < buttons.length; i++) {
  assert.equal(buttons[i], original[i], 'refresh should preserve the focused button node');
}
console.log('Market Hours control semantics and stable renderer: PASS');

// Drive the actual public Stocks tab and timezone selector with a frozen clock.
{
  const { JSDOM } = require('jsdom');
  const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).find(source => source.includes('function renderAll()'));
  assert.ok(inline, 'production Market Hours controller');
  function at(instant, timezone, verify) {
    const dom = new JSDOM(html, { url: 'https://www.fynxfinanceworld.com/tools/market-hours.html', runScripts: 'outside-only' });
    try {
      const { window } = dom;
      const RealDate = window.Date, fixed = RealDate.parse(instant);
      window.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [fixed])); }
        static now() { return fixed; }
      };
      const doc = window.document;
      window.eval(inline);
      const get = id => doc.getElementById(id);
      const tz = get('tz');
      tz.value = timezone;
      tz.dispatchEvent(new window.Event('change', { bubbles: true }));
      doc.querySelector('button[data-market="stocks"]').click();
      const row = [...get('list').children].find(item => item.querySelector('.marketName').textContent === 'NYSE');
      const bar = [...get('bars').querySelectorAll('.bar')].find(item => item.querySelector('.barName').textContent === 'NYSE');
      const fields = Object.fromEntries([...row.querySelectorAll('.kv > b')].map(el => [el.textContent, el.nextElementSibling.textContent]));
      assert.match(get('subtitle').textContent, /Indicative schedule/i);
      assert.match(get('liveChip').textContent, /Schedule/i);
      assert.ok(doc.querySelector('.cardHead a[href="https://www.nyse.com/trade/hours-calendars"]'), 'visible official-calendar link');
      verify({ row, bar, fields });
    } finally {
      dom.window.close();
    }
  }
  const is = ({ row }, value) => assert.equal(row.querySelector('.badge').textContent, value);
  at('2026-11-25T17:00:00Z', 'America/New_York', res => {
    is(res, 'OPEN');
    assert.equal(res.fields.LOCAL, '09:30 → 16:00');
  });
  at('2026-07-01T13:30:00Z', 'America/New_York', res => {
    is(res, 'OPEN');
    assert.equal(res.fields.LOCAL, '09:30 → 16:00', 'regular summer hours follow EDT');
  });
  at('2026-11-26T17:00:00Z', 'America/New_York', res => {
    is(res, 'CLOSED');
    assert.equal(res.fields.LOCAL, '— → —');
    assert.match(res.fields.MODE, /Thanksgiving/);
    assert.match(res.fields.NEXT, /opens in 21h 30m/);
    assert.equal(res.bar, undefined, 'holiday has no NYSE session bar');
  });
  at('2026-11-26T17:00:00Z', 'Asia/Tokyo', res => {
    is(res, 'CLOSED');
    assert.match(res.fields.MODE, /Thanksgiving/, 'holiday is based on New York date, not the Friday display date');
  });
  at('2026-11-27T14:29:00Z', 'America/Boise', res => {
    is(res, 'CLOSED');
    assert.equal(res.fields.LOCAL, '07:30 → 11:00');
    assert.match(res.fields.NEXT, /opens in 0h 1m/);
  });
  at('2026-11-27T17:59:59Z', 'America/New_York', res => {
    is(res, 'OPEN');
    assert.equal(res.fields.LOCAL, '09:30 → 13:00');
    assert.match(res.fields.MODE, /13:00 ET/);
    assert.equal(res.bar.querySelector('small').textContent, '09:30–13:00');
    assert.match(res.fields.NEXT, /closes in 0h 0m/);
  });
  at('2026-11-27T18:00:00Z', 'America/New_York', res => {
    is(res, 'CLOSED');
    assert.match(res.fields.NEXT, /opens in 68h 30m/, 'exact closing minute advances to Monday');
  });
  at('2026-11-27T19:00:00Z', 'America/New_York', res => {
    is(res, 'CLOSED');
    assert.equal(res.fields.LOCAL, '09:30 → 13:00', 'after the early close retains the correct day schedule');
  });
  at('2026-11-28T01:00:00Z', 'Asia/Tokyo', res => {
    is(res, 'CLOSED');
    assert.equal(res.fields.LOCAL, '00:00 → 03:00', 'display day gets the correctly clipped Friday ET bar');
  });
  at('2026-11-28T17:00:00Z', 'America/New_York', res => {
    is(res, 'CLOSED');
    assert.equal(res.bar, undefined, 'NYSE weekends have no session bar');
    assert.match(res.fields.NEXT, /opens in 45h 30m/);
  });
  console.log('NYSE core schedule: ordinary day, closure, early cutoff, weekend and cross-timezone UI pass');
}
