'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict');
const F = require('./filings-core.cjs'), {createResearchService} = require('./research-data.cjs');
const sub = {cik: '320193', name: 'Apple Inc.', tickers: ['AAPL'], exchanges: ['Nasdaq'], sic: '3571', sicDescription: 'Electronic Computers', category: 'Large accelerated filer', stateOfIncorporation: 'CA', fiscalYearEnd: '0926',
  addresses: {business: {city: 'CUPERTINO', stateOrCountry: 'CA', stateOrCountryDescription: 'CA'}}, formerNames: [{name: 'APPLE COMPUTER INC', from: '1994-01-26T00:00:00.000Z', to: '2007-01-04T00:00:00.000Z'}],
  filings: {recent: {accessionNumber: ['0000320193-26-000105', '0000320193-26-000101', '0000320193-26-000099', 'bad', '0001140361-26-000001'], filingDate: ['2026-10-31', '2026-10-30', '2026-08-01', '2026-01-01', '2026-07-01'],
    reportDate: ['2026-09-27', '2026-10-30', '2026-06-28', '', ''], form: ['10-K', '8-K', '10-Q', '10-K', '4'], primaryDocument: ['aapl-20260927.htm', 'aapl-20261030.htm', 'aapl-20260628.htm', 'x.htm', 'xslF345X05/wk-form4.xml'],
    primaryDocDescription: ['10-K', '8-K', '10-Q', '', 'FORM 4'], items: ['', '2.02,9.01', '', '', ''], size: [9000000, 300000, 7000000, 1, 5000]}, files: [{name: 'CIK0000320193-submissions-001.json'}]}};
test('filings: groups, 8-K items, SEC links; invalid rows and unsafe documents are dropped', () => {
  const r = F.recentFilings(sub, 320193);
  assert.equal(r.name, 'Apple Inc.'); assert.equal(r.fiscalYearEnd, '09-26'); assert.equal(r.industry, 'Electronic Computers'); assert.equal(r.city, 'CUPERTINO');
  assert.equal(r.filings.length, 4, 'malformed accession dropped');
  assert.deepEqual(r.filings.map(f => f.group), ['annual', 'current', 'quarterly', 'insider']);
  assert.equal(r.filings[0].url, 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000105/aapl-20260927.htm');
  assert.equal(r.filings[0].index, 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000105/0000320193-26-000105-index.htm');
  assert.deepEqual(r.filings[1].items, [{code: '2.02', title: 'Results of operations'}, {code: '9.01', title: 'Financial statements and exhibits'}]);
  assert.equal(r.filings[3].url, null, 'a path with a slash is never turned into a link');
  assert.equal(r.olderFiles, 1);
  assert.throws(() => F.recentFilings(sub, 1), /did not match/);
  assert.equal(F.groupOf('10-K/A'), 'annual'); assert.equal(F.groupOf('DEF 14A'), 'proxy'); assert.equal(F.groupOf('SC 13G/A'), 'ownership'); assert.equal(F.groupOf('424B2'), 'registration'); assert.equal(F.groupOf('ARS'), 'other');
});
test('filings action: validated CIK, SEC submissions URL with declared agent, cached', async () => {
  const calls = [];
  const fetcher = async (url, opt) => { calls.push([url, opt.headers['User-Agent']]); return new Response(JSON.stringify(sub), {status: 200, headers: {'content-type': 'application/json'}}); };
  const svc = createResearchService({fetcher});
  await assert.rejects(svc.query({action: 'filings', cik: 'abc'}), /valid SEC company/);
  const a = await svc.query({action: 'filings', cik: '320193'}), b = await svc.query({action: 'filings', cik: '320193'});
  assert.equal(a.filings.length, 4); assert.equal(a.source, 'SEC EDGAR submissions'); assert.equal(b, a);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'https://data.sec.gov/submissions/CIK0000320193.json'); assert.match(calls[0][1], /FYNX Finance World Research/);
});
