// Regression coverage for the WORLD desk's "last 72 h" headline claims.
// Execute the real browser plugin in a minimal VM harness; no network or Firebase credentials.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/terminal/world-intel.js'), 'utf8');
const hoursAgo = h => new Date(Date.now() - h * 3600000).toISOString();

async function conflicts(briefing, countryItems = []) {
  const world = {
    countries: {countries: {RU: {name: 'Russia', lon: 37.6, lat: 55.7, region: 'Europe', news: {items: countryItems}}}},
    statusOf: () => null
  };
  const win = {FynxGeo: {}};
  vm.runInNewContext(source, {
    window: win,
    document: {head: {append() {}}, hidden: false},
    setInterval() {} // Avoid background timers in an isolated regression test.
  }, {filename: 'world-intel.js', timeout: 2500});
  assert.equal(win.FynxTerminalPlugins.length, 1);
  win.FynxTerminalPlugins[0]({
    S: {world, briefing},
    WDATA: '/world-data/',
    store: {get: () => '{}', set() {}},
    el: () => ({}),
    finite: Number.isFinite,
    getJSON: async url => url.includes('intel-layers.json')
      ? {reviewed: '2026-11', layers: {}}
      : {generatedAt: new Date().toISOString(), quakes: [], alerts: []},
    report: e => { throw new Error('Unexpected provider failure: ' + e); }
  });
  await world.intel.load();
  return world.intelData.events.filter(e => e.layer === 'conflict');
}

test('recent, timestamped headlines remain in the 72-hour intelligence feed', async () => {
  const result = await conflicts([
    {title: 'Russian airstrikes reported near border', publishedAt: hoursAgo(2)},
    {title: 'Russia reports military clashes at frontier', at: hoursAgo(71)}
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].n, 2);
  assert.ok(result[0].items.every(x => x.at && Number.isFinite(Date.parse(x.at))));
});

test('headlines older than 72 hours cannot be counted as recent', async () => {
  assert.equal((await conflicts([{title: 'Russia reports airstrikes', publishedAt: hoursAgo(73)}])).length, 0);
});

test('missing and malformed timestamps do not become supposedly live conflict reports', async () => {
  assert.equal((await conflicts([
    {title: 'Russian airstrike reported without publication time'},
    {title: 'Russia reports missile launches', publishedAt: 'date-not-available'}
  ])).length, 0);
});

test('future timestamps outside the five-minute clock tolerance are excluded', async () => {
  assert.equal((await conflicts([
    {title: 'Russian missile strike reported tomorrow', publishedAt: hoursAgo(-2)}
  ])).length, 0);
});

test('small provider clock skew is allowed, including per-country headlines', async () => {
  const result = await conflicts([], [
    {title: 'Russia reports drone strikes near border', time: hoursAgo(-2 / 60)}
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].n, 1);
  assert.ok(result[0].items[0].at);
});
