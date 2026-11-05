'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { eventMoves } = require('../../backend/edge/engine.cjs');
const { parseClaimArchive, parseCalendar, validateBars, summarize } = require('../../scripts/refresh-public-research.cjs');

const day = n => new Date(Date.UTC(2026, 0, n)).toISOString();
test('official release dates inform daily moves only after observation, without inventing an intraday time', () => {
  const release = parseClaimArchive('<a href="/press/2026/010826.pdf">8</a><a href="/press/2026/013026.pdf">30</a>', 2026, day(15));
  assert.equal(release.length, 1);
  const bars = Array.from({length:15}, (_,i) => ({time:day(i+1), close:100+i}));
  const intraday = Array.from({length:300}, (_,i) => ({time:new Date(Date.parse(day(1))+i*3600000).toISOString(),close:90+i/10}));
  assert.deepEqual(eventMoves('EURUSD', bars, intraday, [], day(14), release), []);
  const [move] = eventMoves('EURUSD', bars, intraday, [], day(16), release);
  assert.equal(move.basis, 'daily-close');
  assert.equal(move.sampleSize, 1);
  assert.equal(move.averageAbsoluteMove, Math.abs(107/106-1));
});
test('a feed from another week cannot imply there are no events in the next 24 hours', () => {
  const rows = [{date:'2026-11-02T10:00:00-05:00',title:'ISM Manufacturing PMI',country:'USD',impact:'Medium'}];
  assert.throws(() => parseCalendar(rows, '2026-11-11T12:00:00Z'), /current week/);
  const result = parseCalendar(rows, '2026-11-04T12:00:00Z');
  assert.equal(result.events[0].availableAt, result.updatedAt);
  assert.equal(result.events[0].timing, 'scheduled');
  assert.equal(result.events[0].actual, null);
});
test('published bar archives and the manifest agree about observations and completed-close timestamps', () => {
  const manifest = require('../../assets/data/research/manifest.json');
  for (const market of manifest.markets) {
    const data = require(`../../assets/data/research/bars/${market.symbol}-D1.json`);
    validateBars(data.bars, {from:data.requestedFrom, to:data.requestedTo});
    assert.deepEqual(market, summarize(data));
  }
});
