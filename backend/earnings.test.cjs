'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict');
const E = require('./earnings-core.cjs'), {createResearchService} = require('./research-data.cjs');

const sub = {name: 'Example Corp', filings: {recent: {
  form: ['8-K', '10-Q', '8-K', '8-K', '8-K/A', '8-K'],
  items: ['2.02,9.01', '', '5.02', '2.02,7.01,9.01', '2.02', '2.02'],
  filingDate: ['2026-10-30', '2026-10-31', '2026-09-01', '2026-07-31', '2026-08-02', '2026-05-01'],
  acceptanceDateTime: ['2026-10-30T16:31:07.000Z', '2026-10-31T09:00:00.000Z', '2026-09-01T08:00:00.000Z', '2026-07-31T06:45:00.000Z', '2026-08-02T10:00:00.000Z', '2026-05-01T12:15:00.000Z'],
  reportDate: ['2026-10-30', '2026-09-27', '2026-09-01', '2026-07-31', '2026-07-31', '2026-05-01'],
  accessionNumber: ['0000123456-26-000050', '0000123456-26-000051', '0000123456-26-000040', '0000123456-26-000030', '0000123456-26-000031', '0000123456-26-000020'],
  primaryDocument: ['exm-20261030.htm', 'exm-10q.htm', 'exm-0901.htm', 'exm-20260731.htm', 'exm-a.htm', 'exm-20260501.htm']}}};

test('earnings releases are 8-Ks reporting Item 2.02, placed in the market session they were filed', () => {
  const r = E.earningsReleases(sub, 8);
  assert.deepEqual(r.map(x => x.filed), ['2026-10-30', '2026-07-31', '2026-05-01']);
  assert.deepEqual(r.map(x => x.session), ['after close', 'before open', 'during market']);
  assert.equal(r[0].acceptedET, '16:31'); assert.equal(E.earningsReleases(sub, 1).length, 1); assert.deepEqual(E.earningsReleases({}), []);
});

test('the press-release exhibit is chosen from the filing index', () => {
  const idx = names => ({directory: {item: names.map(([name, size]) => ({name, size}))}});
  assert.equal(E.pickExhibit(idx([['exm-20261030.htm', 9000], ['a8-kex991q32026.htm', 80000], ['a8-kex992.htm', 9000000], ['R1.htm', 1]]), 'exm-20261030.htm'), 'a8-kex991q32026.htm');
  assert.equal(E.pickExhibit(idx([['d812dex99.htm', 50000], ['d812d8k.htm', 7000]]), 'd812d8k.htm'), 'd812dex99.htm');
  assert.equal(E.pickExhibit(idx([['form8k.htm', 7000], ['release.htm', 90000], ['0001-index.htm', 99]]), 'form8k.htm'), 'release.htm');
});

test('HTML becomes plain text with entities decoded', () => {
  assert.equal(E.htmlToText('<p>Revenue&nbsp;rose <b>12%</b> &amp; margins grew&#8212;strong.</p><script>x()</script><style>p{}</style>'), 'Revenue rose 12% & margins grew—strong.');
});

test('release tone counts finance words, respects negation and reads guidance direction', () => {
  const up = E.releaseTone('Record revenue and strong growth. The company raised its full-year outlook and now expects revenue above the high end of prior guidance.');
  assert.ok(up.tone > 0.5); assert.equal(up.guidance, 'raised');
  const down = E.releaseTone('Results were weak amid headwinds and an impairment. The company lowered its guidance for fiscal 2026 and expects continued pressure.');
  assert.ok(down.tone < -0.5); assert.equal(down.guidance, 'lowered');
  const flat = E.releaseTone('Demand was not strong. The company reaffirms its full-year outlook and expects stable margins.');
  assert.equal(flat.guidance, 'maintained'); assert.equal(flat.pos, 0); assert.equal(flat.neg, 1);
  assert.equal(E.releaseTone('Quarterly dividend declared.').guidance, 'none');
});

test('quarterly EPS keeps three-month periods, newest filing wins, and matches each release with the year-earlier quarter', () => {
  const f = (start, end, val, filed, form = '10-Q') => ({start, end, val, filed, form});
  const facts = {facts: {'us-gaap': {EarningsPerShareDiluted: {units: {'USD/shares': [f('2025-06-29', '2025-09-27', 1.2, '2025-10-31'), f('2025-12-29', '2026-09-26', 4.5, '2026-10-31'), f('2026-06-28', '2026-09-26', 1.45, '2026-10-31'), f('2026-06-28', '2026-09-26', 1.5, '2026-11-15', '10-Q/A'), f('2026-03-29', '2026-06-27', 1.3, '2026-08-01')]}}}}};
  const q = E.quarterlyEPS(facts);
  assert.deepEqual(q.map(x => [x.end, x.eps]), [['2025-09-27', 1.2], ['2026-06-27', 1.3], ['2026-09-26', 1.5]]);
  const m = E.matchEPS(q, '2026-10-30');
  assert.equal(m.eps, 1.5); assert.equal(m.prevEPS, 1.2); assert.ok(Math.abs(m.yoy - 0.25) < 1e-12);
  assert.equal(E.matchEPS(q, '2027-06-01'), null);
});

test('Nasdaq surprise rows are parsed defensively', () => {
  const s = E.parseSurprises({data: {earningsSurpriseTable: {rows: [{fiscalQtrEnd: 'Sep 2026', dateReported: '10/30/2026', eps: 1.5, consensusForecast: '1.41', percentageSurprise: '6.38'}, {fiscalQtrEnd: 'Jun 2026', dateReported: '7/31/2026', eps: '(0.05)', consensusForecast: 'N/A', percentageSurprise: '--'}, {dateReported: 'bad', eps: 1}]}}});
  assert.deepEqual(s, [{fiscal: 'Sep 2026', date: '2026-10-30', eps: 1.5, consensus: 1.41, surprisePct: 6.38}, {fiscal: 'Jun 2026', date: '2026-07-31', eps: -0.05, consensus: null, surprisePct: null}]);
  assert.deepEqual(E.parseSurprises(null), []);
});

test('earnings action: releases, tone, EPS and consensus from SEC and Nasdaq, with no company text returned', async () => {
  const two = {name: sub.name, filings: {recent: Object.fromEntries(Object.entries(sub.filings.recent).map(([k, v]) => [k, v.slice(0, 4)]))}};
  const facts = {facts: {'us-gaap': {EarningsPerShareDiluted: {units: {'USD/shares': [{start: '2025-06-29', end: '2025-09-27', val: 1.2, filed: '2025-10-31', form: '10-Q'}, {start: '2026-06-28', end: '2026-09-26', val: 1.5, filed: '2026-10-31', form: '10-Q'}]}}}}};
  const pages = {
    'https://data.sec.gov/submissions/CIK0000123456.json': JSON.stringify(two),
    'https://data.sec.gov/api/xbrl/companyfacts/CIK0000123456.json': JSON.stringify(facts),
    'https://www.sec.gov/Archives/edgar/data/123456/000012345626000050/index.json': JSON.stringify({directory: {item: [{name: 'exm-20261030.htm', size: 5000}, {name: 'exm-ex991.htm', size: 60000}]}}),
    'https://www.sec.gov/Archives/edgar/data/123456/000012345626000050/exm-ex991.htm': '<html><p>Record quarter with strong growth. We raised our full-year outlook and now expect higher revenue.</p></html>',
    'https://www.sec.gov/Archives/edgar/data/123456/000012345626000030/index.json': JSON.stringify({directory: {item: [{name: 'exm-20260731.htm', size: 5000}, {name: 'ex99-1.htm', size: 50000}]}}),
    'https://www.sec.gov/Archives/edgar/data/123456/000012345626000030/ex99-1.htm': '<p>Weak demand and headwinds. We lowered our guidance for fiscal 2026.</p>',
    'https://api.nasdaq.com/api/company/EXM/earnings-surprise': JSON.stringify({data: {earningsSurpriseTable: {rows: [{fiscalQtrEnd: 'Sep 2026', dateReported: '10/30/2026', eps: 1.5, consensusForecast: '1.41', percentageSurprise: '6.38'}]}}})
  };
  const seen = [];
  const fetcher = async (url, opts) => { seen.push([url, opts.headers['User-Agent']]); const body = pages[url]; return {ok: body !== undefined, status: body === undefined ? 404 : 200, headers: {get: () => null}, text: async () => body}; };
  const svc = createResearchService({fetcher, now: () => Date.parse('2026-11-20T12:00:00Z')});
  const r = await svc.query({action: 'earnings', cik: '123456', symbol: 'EXM'});
  assert.equal(r.name, 'Example Corp'); assert.equal(r.releases.length, 2);
  assert.equal(r.releases[0].tone.guidance, 'raised'); assert.ok(r.releases[0].tone.tone > 0); assert.equal(r.releases[1].tone.guidance, 'lowered');
  assert.equal(r.releases[0].eps.eps, 1.5); assert.equal(r.releases[0].eps.prevEPS, 1.2);
  assert.equal(r.surprises[0].consensus, 1.41); assert.match(r.source, /Nasdaq consensus/);
  assert.ok(!JSON.stringify(r).includes('Record quarter'), 'no release text is passed on');
  assert.ok(seen.filter(([u]) => /sec\.gov/.test(u)).every(([, ua]) => /FYNX Finance World Research/.test(ua)), 'SEC requests identify FYNX');
  await assert.rejects(svc.query({action: 'earnings', cik: 'abc'}), /valid SEC company/);
  // Nasdaq failing must not break the SEC history
  delete pages['https://api.nasdaq.com/api/company/EXM/earnings-surprise'];
  const r2 = await createResearchService({fetcher, now: () => Date.parse('2026-11-20T12:00:00Z')}).query({action: 'earnings', cik: '123456', symbol: 'EXM'});
  assert.deepEqual(r2.surprises, []); assert.equal(r2.releases.length, 2);
});
