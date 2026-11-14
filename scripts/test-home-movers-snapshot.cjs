'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/home-movers.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const NOW = Date.parse('2026-11-14T05:00:00Z');
const iso = offset => new Date(NOW + offset * 60000).toISOString();

function snapshot(stockTime = iso(-10), cryptoTime = iso(-10)) {
  const item = {symbol:'TEST', name:'Test Asset', price:25.5, changePct:1.2, volume:100, marketCap:1000000};
  return {stocksAsOf:stockTime, cryptoAsOf:cryptoTime,
    gainers:[item], losers:[item], active:[item], crypto:[{...item, symbol:'BTC-USD'}], aiUnder3:[item]};
}

async function page(responses) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main><div id="homeSecondaryStories"></div></main></body></html>', {
    url:'https://www.fynxfinanceworld.com/home.html', runScripts:'outside-only', pretendToBeVisual:true
  });
  const w = dom.window;
  await new Promise(resolve => w.addEventListener('load', resolve, {once:true}));
  w.Date.now = () => NOW;
  w.fetch = async () => {
    if (!responses.length) throw Error('No fake response left');
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return {ok:true, json:async () => response};
  };
  w.setInterval = callback => { w.__refresh = callback; return 1; };
  w.eval(source);
  await tick(); await tick();
  const host = w.document.querySelector('.fx-movers');
  assert(host, 'Actual movers UI should render');
  const quality = () => host.querySelector('.fx-movers-quality')?.textContent;
  const indicator = () => host.querySelector('.fx-live');
  const finish = () => dom.window.close();
  return {w,host,quality,indicator,finish};
}

test('recent stock snapshot is explicitly labeled a snapshot, not live prices', async () => {
  const p = await page([snapshot()]);
  try {
    assert.equal(p.quality(), 'Recent snapshot');
    assert.equal(p.indicator().classList.contains('is-stale'), false);
    assert.match(p.host.textContent, /Stock data may be delayed/);
    assert.doesNotMatch(p.host.querySelector('.fx-movers-foot').textContent, /Older snapshot/);
  } finally {p.finish();}
});

test('successful fetch with stock data older than 45 minutes is marked stale', async () => {
  const p = await page([snapshot(iso(-150))]);
  try {
    assert.equal(p.quality(), 'Older snapshot');
    assert.equal(p.indicator().classList.contains('is-stale'), true);
    assert.equal(p.indicator().title, 'Older snapshot');
    assert.match(p.host.querySelector('.fx-movers-foot').textContent, /as of 3 h ago/);
  } finally {p.finish();}
});

test('future and invalid timestamps cannot be mislabeled just now', async () => {
  for (const time of [iso(20), 'invalid-date']) {
    const p = await page([snapshot(time)]);
    try {
      assert.equal(p.quality(), 'Snapshot time unverified');
      assert.equal(p.indicator().classList.contains('is-stale'), true);
      assert.doesNotMatch(p.host.querySelector('.fx-movers-foot').textContent, /as of just now/);
    } finally {p.finish();}
  }
});

test('each tab uses its own stock or crypto snapshot timestamp', async () => {
  const p = await page([snapshot(iso(-10),iso(-200))]);
  try {
    assert.equal(p.quality(), 'Recent snapshot');
    p.host.querySelector('button[data-tab="crypto"]').click();
    assert.equal(p.quality(), 'Older snapshot');
    assert.equal(p.indicator().classList.contains('is-stale'), true);
    p.host.querySelector('button[data-tab="gainers"]').click();
    assert.equal(p.quality(), 'Recent snapshot');
  } finally {p.finish();}
});

test('refresh failure retains existing sourced rows and marks the indicator stale', async () => {
  const p = await page([snapshot(), Error('network failed')]);
  try {
    assert.match(p.host.textContent, /TEST/);
    p.w.__refresh();
    await tick(); await tick();
    assert.match(p.host.textContent, /TEST/);
    assert.match(p.host.querySelector('.fx-movers-foot').textContent, /Update failed/);
    assert.equal(p.indicator().classList.contains('is-stale'), true);
    assert.equal(p.indicator().title, 'Update unavailable; previous snapshot');
  } finally {p.finish();}
});

test('initial failure presents Retry, and a recovered snapshot resets the stale state', async () => {
  const p = await page([Error('offline'), snapshot()]);
  try {
    assert.match(p.host.textContent, /temporarily unavailable/);
    const retry = p.host.querySelector('[data-movers-retry]');
    assert(retry, 'Retry should be available after first-load failure');
    retry.click();
    await tick(); await tick();
    assert.equal(p.quality(), 'Recent snapshot');
    assert.equal(p.indicator().classList.contains('is-stale'), false);
  } finally {p.finish();}
});
