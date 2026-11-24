'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { eventMoves } = require('../../backend/edge/engine.cjs');
const { parseClaimArchive, parseCalendar, validateBars, summarize, loadBars } = require('../../scripts/refresh-public-research.cjs');

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

test('stale research fallbacks identify the failing stage without logging upstream errors or changing observations', async () => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fynx-research-'));
  const market = {id:'EURUSD'};
  const start = Date.UTC(2025,0,1), DAY = 86400000;
  const iso = ms => new Date(ms).toISOString();
  const bars = Array.from({length:260}, (_,i) => ({time:iso(start+i*DAY),open:1,high:2,low:1,close:2}));
  const dates = {from:iso(start),to:iso(start+261*DAY)};
  const previous = {symbol:market.id,timeframe:'D1',requestedFrom:dates.from,requestedTo:dates.to,to:bars.at(-1).time,bars,updatedAt:iso(start+260*DAY),status:'historical'};
  const messages = [];
  const warn = console.warn;
  try {
    await fs.mkdir(path.join(dir,'bars'));
    await fs.writeFile(path.join(dir,'bars/EURUSD-D1.json'),JSON.stringify(previous));
    console.warn = message => messages.push(message);
    const cases = [
      [async () => { throw Error('upstream-private-error'); }, 'provider request failed'],
      [async () => [], 'provider returned empty or regressed history'],
      [async () => [{...bars.at(-1),close:-1}], 'daily history validation failed'],
    ];
    for (const [history,stage] of cases) {
      const result = await loadBars(dir,market,dates,{history});
      assert.equal(result.status,'stale');
      assert.equal(result.updatedAt,previous.updatedAt);
      assert.deepEqual(result.bars,previous.bars);
      assert.ok(messages.at(-1).includes(stage), messages.at(-1));
    }
    assert.equal(messages.length,3);
    assert.ok(messages.every(m => !m.includes('upstream-private-error')));
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'bars/EURUSD-D1.json'),'utf8')),previous);
  } finally {
    console.warn = warn;
    await fs.rm(dir,{recursive:true,force:true});
  }
});
