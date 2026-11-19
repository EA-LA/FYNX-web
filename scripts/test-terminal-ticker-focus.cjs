'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '../assets/js/terminal-market-ui.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function setup({ quoteAsOf, stale = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body data-fynx-terminal><div data-terminal-ticker></div><button id="outside">Outside</button></body></html>', {
    url: 'https://www.fynxfinanceworld.com/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  await tick(); // Allow JSDOM's initial DOMContentLoaded/pageshow to settle.
  const { window } = dom;
  window.matchMedia = () => ({ matches: false });
  window.setInterval = () => 1; // Avoid leaving real timers running in the tests.
  window.clearInterval = () => {};
  let price = 100;
  const makeData = () => ({
    quotes: {
      'BTC-USD': {
        price, changePercent: 1.5, currency: 'USD', source: 'Exchange',
        asOf: quoteAsOf || new Date().toISOString(), basis: 'indicative', delayed: true
      }
    },
    fetchedAt: new Date().toISOString(), status: stale ? 'cached' : 'fresh', stale
  });
  window.FynxTerminalData = {
    instruments: [{ symbol: 'BTC-USD', name: 'Bitcoin', shortName: 'BTC', group: 'Crypto' }],
    loadQuotes: () => Promise.resolve(makeData())
  };
  window.eval(script);
  await tick();
  const host = window.document.querySelector('[data-terminal-ticker]');
  assert.ok(host.querySelector('.terminal-ticker-track'), 'initial market ticker rendered');
  async function refresh(nextPrice) {
    price = nextPrice;
    window.document.dispatchEvent(new window.Event('visibilitychange'));
    await tick();
  }
  return { window, host, refresh, close: () => dom.window.close() };
}

test('keeps instrument-link focus and scroll position through a price update', async () => {
  const { window, host, refresh, close } = await setup();
  try {
    const before = host.querySelector('.terminal-ticker-item');
    const track = host.querySelector('.terminal-ticker-track');
    track.scrollLeft = 120;
    before.focus();
    assert.equal(window.document.activeElement, before);
    await refresh(105);
    const after = host.querySelector('.terminal-ticker-item');
    assert.notEqual(after, before, 'quote markup was actually refreshed');
    assert.equal(window.document.activeElement, after);
    assert.equal(host.querySelector('.terminal-ticker-track').scrollLeft, 120);
    assert.match(after.textContent, /105/);
  } finally { close(); }
});

test('keeps focused previous/next controls usable across refreshes', async () => {
  const { window, host, refresh, close } = await setup();
  try {
    const buttons = host.querySelectorAll('.terminal-ticker-controls button');
    buttons[1].focus();
    await refresh(106);
    const updatedButtons = host.querySelectorAll('.terminal-ticker-controls button');
    assert.notEqual(updatedButtons[1], buttons[1]);
    assert.equal(window.document.activeElement, updatedButtons[1]);
    assert.equal(updatedButtons[1].getAttribute('aria-label'), 'Next market quotes');
  } finally { close(); }
});

test('keeps scroll-region keyboard focus when prices refresh', async () => {
  const { window, host, refresh, close } = await setup();
  try {
    const track = host.querySelector('.terminal-ticker-track');
    track.focus();
    await refresh(107);
    assert.equal(window.document.activeElement, host.querySelector('.terminal-ticker-track'));
  } finally { close(); }
});

test('does not steal focus from controls outside the ticker', async () => {
  const { window, host, refresh, close } = await setup();
  try {
    const outside = window.document.getElementById('outside');
    outside.focus();
    await refresh(108);
    assert.equal(window.document.activeElement, outside);
    assert.match(host.textContent, /108/);
  } finally { close(); }
});

test('reveals old source quotes visibly even when the feed was just retrieved', async () => {
  const quoteAsOf = new Date(Date.now() - 2 * 3600000).toISOString();
  const { host, close } = await setup({ quoteAsOf });
  try {
    const item = host.querySelector('.terminal-ticker-item');
    assert.match(item.querySelector('strong').textContent, /BTC · Older/);
    assert.match(item.title, /Older source quote/);
    assert.match(item.title, /As of/);
    assert.match(host.querySelector('.terminal-ticker-status').textContent, /1 older source quote/);
    assert.match(host.textContent, /100\.00/, 'the original sourced price stays visible');
  } finally { close(); }
});

test('does not mislabel recent quotes and distinguishes saved data from aged source times', async () => {
  const fresh = await setup();
  try {
    assert.doesNotMatch(fresh.host.querySelector('.terminal-ticker-item strong').textContent, /Older/);
    assert.doesNotMatch(fresh.host.querySelector('.terminal-ticker-status').textContent, /older source quote/);
  } finally { fresh.close(); }

  const saved = await setup({ quoteAsOf: new Date(Date.now() - 3 * 3600000).toISOString(), stale: true });
  try {
    assert.match(saved.host.querySelector('.terminal-ticker-status').textContent, /Saved · 1 older source quote/);
    assert.match(saved.host.querySelector('.terminal-ticker-item').title, /Saved quote.*Older source quote/);
  } finally { saved.close(); }
});
