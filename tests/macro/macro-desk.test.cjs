'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../scripts/refresh-macro-desk.cjs');
const M = require('../../assets/js/macro-desk/model.js');
const desk = require('./fixtures/desk.json');
const schedule = require('../../assets/data/macro/central-banks.json');
const edge = require('../../assets/data/research/edge.json');

test('Treasury CSV parses dates and tenors', () => {
  const rows = P.parseTreasury('Date,"1 Mo","1.5 Month","3 Mo","6 Mo","1 Yr","2 Yr","5 Yr","10 Yr","30 Yr"\n11/09/2026,4.04,4.1,4.24,4.26,4.38,4.56,4.67,4.88,5.26\n13/40/2026,1,1,1,1,1,1,1,1,1\n');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {date: '2026-11-09', values: {'1M': 4.04, '3M': 4.24, '6M': 4.26, '1Y': 4.38, '2Y': 4.56, '5Y': 4.67, '10Y': 4.88, '30Y': 5.26}});
});
test('ECB, MOF and BoE parsers', () => {
  const ecb = P.parseECB('KEY,DATA_TYPE_FM,TIME_PERIOD,OBS_VALUE\n' + ['SR_3M', 'SR_1Y', 'SR_2Y', 'SR_5Y', 'SR_10Y'].map((t, i) => `k,${t},2026-11-09,${2 + i / 10}`).join('\n'));
  assert.equal(ecb[0].date, '2026-11-09'); assert.equal(ecb[0].values['10Y'], 2.4);
  const mof = P.parseMOF('Interest Rate\nDate,1Y,2Y,3Y,5Y,7Y,10Y,20Y,30Y\nR8.11.9,1.5,1.7,1.8,2.1,2.3,2.7,3.6,3.9\n2026/11/10,1.5,1.7,1.8,2.1,-,2.7,3.6,3.9\n');
  assert.deepEqual(mof.map(r => r.date), ['2026-11-09', '2026-11-10']); assert.equal(mof[1].values['7Y'], undefined);
  const boe = P.parseBoE('DATE,IUDSNPY,IUDMNPY,IUDLNPY\n06 Nov 2026,4.77,5.11,5.42\n');
  assert.deepEqual(boe, [{date: '2026-11-06', values: {'5Y': 4.77, '10Y': 5.11, '20Y': 5.42}}]);
});
test('Fed odds follow the futures-implied change', () => {
  const hold = P.fedOdds({meeting: '2026-12-09', effr: 3.88, prices: {'ZQZ26.CBT': 100 - 3.88}});
  assert.equal(hold.hold, 100); assert.equal(hold.cut, 0);
  const cut = P.fedOdds({meeting: '2026-12-09', effr: 3.88, prices: {'ZQZ26.CBT': 96.2}});
  assert.ok(cut.cut > 40 && cut.cut < 50 && Math.abs(cut.cut + cut.hold - 100) < 0.2);
  const late = P.fedOdds({meeting: '2027-01-27', effr: 3.88, prices: {'ZQG27.CBT': 100 - 3.63}});
  assert.equal(late.method, 'following-month'); assert.equal(late.cut, 100);
  assert.equal(P.fedOdds({meeting: '2026-12-09', effr: 3.88, prices: {}}), null);
});
test('Central bank schedule is valid and ordered', () => {
  assert.equal(schedule.banks.length, 8);
  for (const b of schedule.banks) {
    assert.ok(b.decisions.length >= 5 && b.calendarURL.startsWith('https://'));
    assert.deepEqual([...b.decisions].sort(), b.decisions);
    assert.ok(b.previous < b.decisions[0]);
  }
});
test('Next decision uses the bank time zone', () => {
  const fed = schedule.banks.find(b => b.area === 'US');
  const next = M.nextDecision(fed, Date.parse('2026-11-10T17:00:00Z'));
  assert.equal(next.date, '2026-12-09'); assert.equal(new Date(next.at).toISOString(), '2026-12-09T19:00:00.000Z');
  const rba = schedule.banks.find(b => b.area === 'AU');
  assert.equal(new Date(M.nextDecision(rba, Date.parse('2026-11-10T17:00:00Z')).at).toISOString(), '2026-12-08T03:30:00.000Z');
  assert.equal(M.nextDecision(fed, Date.parse('2026-12-09T20:30:00Z')).date, '2027-01-27');
});
test('Curve view, story and bias from the published snapshot', () => {
  M.validateDesk(desk);
  const us = M.curveView(desk.curves.US);
  assert.equal(us.latestDate, desk.curves.US.latest); assert.ok(us.spread && Number.isFinite(us.spread.bp));
  for (const pair of M.PAIRS) {
    const r = M.smartBias(pair, {desk, edgeMarket: edge.markets.find(m => m.symbol === pair.id)});
    if (r.score !== null) { assert.ok(r.score >= -100 && r.score <= 100); assert.ok(r.components.length >= 2); }
  }
  const story = M.composeStory({desk, banks: schedule.banks, now: Date.parse('2026-11-10T17:30:00Z')});
  assert.ok(story.available && story.lines.length >= 3);
  assert.equal(M.smartBias(M.PAIRS[0], {}).score, null);
  assert.throws(() => M.validateDesk({version: 1}));
});

test('Volatility distribution from daily bars', () => {
  const bars = require('../../assets/data/research/bars/EURUSD-D1.json').bars;
  const v = M.volDistribution(bars, {symbol: 'EURUSD', pip: 0.0001});
  assert.equal(v.sample, 252); assert.equal(v.bins.reduce((s, b) => s + b.count, 0), 252);
  assert.ok(v.percentile >= 0 && v.percentile <= 100 && v.median > 0 && v.unit.label === 'pips');
  assert.equal(M.volDistribution(bars.slice(0, 10), {symbol: 'EURUSD', pip: 0.0001}), null);
});
test('Broker book parser keeps buckets near price', () => {
  const buckets = Array.from({length: 60}, (_, i) => ({price: (1.1 + i * 0.0005).toFixed(4), longCountPercent: '0.5', shortCountPercent: '0.4'}));
  const b = P.parseBook({orderBook: {time: '2026-11-10T17:00:00Z', price: '1.1154', bucketWidth: '0.0005', buckets}}, 'orderBook');
  assert.equal(b.buckets.length, 24); assert.ok(b.buckets[0].price > b.buckets.at(-1).price);
  assert.throws(() => P.parseBook({orderBook: {price: 'x'}}, 'orderBook'));
});
test('Market story is built only from inputs', () => {
  const m = edge.markets.find(x => x.symbol === 'GBPJPY');
  const s = M.marketStory({symbol: 'GBPJPY', label: 'GBP/JPY', edgeMarket: m, desk, digits: 3, now: Date.parse('2026-11-05T00:00:00Z')});
  assert.ok(s.available && s.lines.length >= 3 && s.title.startsWith('GBP/JPY'));
  assert.equal(M.marketStory({symbol: 'X', label: 'X'}).available, false);
});
