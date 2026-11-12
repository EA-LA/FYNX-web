#!/usr/bin/env node
'use strict';
/* FYNX Terminal positioning and policy-rate publisher.
 *  cot.json    — CFTC Commitments of Traders, 3 years of weekly positions for major futures:
 *                Traders in Financial Futures (leveraged funds = hedge funds, asset managers, dealers),
 *                Disaggregated (managed money, producers, swap dealers) and Legacy (non-commercial) reports.
 *  policy.json — BIS central bank policy rates, monthly since 2015, for G10 and large emerging markets.
 * Public sources only (publicreporting.cftc.gov, stats.bis.org). Weekly/monthly data is refreshed at most
 * every 6 hours; otherwise the previous snapshot is carried forward.
 * Usage: node scripts/refresh-positioning.cjs <output-dir> [previous-dir] */
const fs = require('node:fs/promises'), path = require('node:path');
const DAY = 86400000, AGENT = 'FYNX-Terminal/1.0 (+https://www.fynxfinanceworld.com/terminal.html)';
const CFTC = 'https://publicreporting.cftc.gov/resource/';
const REPORTS = {
  tff: {id: 'gpe5-46if', name: 'Traders in Financial Futures', groups: {leveraged: ['lev_money_positions_long', 'lev_money_positions_short'], assetManagers: ['asset_mgr_positions_long', 'asset_mgr_positions_short'], dealers: ['dealer_positions_long_all', 'dealer_positions_short_all']}, spec: 'leveraged'},
  disagg: {id: '72hh-3qpy', name: 'Disaggregated', groups: {managedMoney: ['m_money_positions_long_all', 'm_money_positions_short_all'], producers: ['prod_merc_positions_long', 'prod_merc_positions_short'], swapDealers: ['swap_positions_long_all', 'swap__positions_short_all']}, spec: 'managedMoney'},
  legacy: {id: '6dca-aqww', name: 'Legacy', groups: {nonCommercial: ['noncomm_positions_long_all', 'noncomm_positions_short_all'], commercial: ['comm_positions_long_all', 'comm_positions_short_all']}, spec: 'nonCommercial'}
};
// [key, label, report, CFTC contract code, price symbol, price note]
const MARKETS = [
  ['EUR', 'Euro FX', 'tff', '099741', '6E=F'], ['GBP', 'British pound', 'tff', '096742', '6B=F'], ['JPY', 'Japanese yen', 'tff', '097741', '6J=F'],
  ['AUD', 'Australian dollar', 'tff', '232741', 'AUDUSD=X'], ['CAD', 'Canadian dollar', 'tff', '090741', 'CAD=X', 'inverse'], ['CHF', 'Swiss franc', 'tff', '092741', 'CHF=X', 'inverse'],
  ['NZD', 'New Zealand dollar', 'tff', '112741', 'NZDUSD=X'], ['MXN', 'Mexican peso', 'tff', '095741', 'MXN=X', 'inverse'], ['DXY', 'US dollar index', 'legacy', '098662', 'DX-Y.NYB'],
  ['ES', 'E-mini S&P 500', 'tff', '13874A', '^GSPC'], ['NQ', 'E-mini Nasdaq 100', 'tff', '209742', '^NDX'], ['RTY', 'E-mini Russell 2000', 'tff', '239742', '^RUT'],
  ['ZN', '10-year T-note', 'tff', '043602', 'ZN=F'], ['ZT', '2-year T-note', 'tff', '042601', 'ZT=F'], ['VX', 'VIX futures', 'tff', '1170E1', '^VIX'],
  ['BTC', 'Bitcoin (CME)', 'tff', '133741', 'BTC-USD'], ['ETH', 'Ether (CME)', 'tff', '146021', 'ETH-USD'],
  ['GC', 'Gold', 'disagg', '088691', 'GC=F'], ['SI', 'Silver', 'disagg', '084691', 'SI=F'], ['HG', 'Copper', 'disagg', '085692', 'HG=F'],
  ['CL', 'WTI crude oil', 'disagg', '067651', 'CL=F'], ['NG', 'Natural gas', 'disagg', '023651', 'NG=F'],
  ['ZC', 'Corn', 'disagg', '002602', 'ZC=F'], ['ZW', 'Wheat', 'disagg', '001602', 'ZW=F'], ['ZS', 'Soybeans', 'disagg', '005602', 'ZS=F']
];
const AREAS = {US: 'Federal Reserve', XM: 'European Central Bank', GB: 'Bank of England', JP: 'Bank of Japan', CA: 'Bank of Canada', AU: 'Reserve Bank of Australia', NZ: 'Reserve Bank of New Zealand', CH: 'Swiss National Bank', SE: 'Riksbank', NO: 'Norges Bank', CN: "People's Bank of China", IN: 'Reserve Bank of India', BR: 'Banco Central do Brasil', MX: 'Banco de México', ZA: 'South African Reserve Bank', TR: 'Central Bank of Turkey', KR: 'Bank of Korea'};

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
async function fetchText(url, timeout = 45000) {
  const res = await fetch(url, {headers: {'User-Agent': AGENT, Accept: '*/*'}, signal: AbortSignal.timeout(timeout)});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return res.text();
}
const readJSON = async f => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return null; } };

async function fetchCOT(now) {
  const since = new Date(now - 3 * 366 * DAY).toISOString().slice(0, 10);
  const byReport = {};
  for (const [, , report, code] of MARKETS) (byReport[report] ||= []).push(code);
  const rows = {};
  for (const [report, codes] of Object.entries(byReport)) {
    const R = REPORTS[report], fields = ['cftc_contract_market_code', 'report_date_as_yyyy_mm_dd', 'open_interest_all', ...Object.values(R.groups).flat()];
    const where = `report_date_as_yyyy_mm_dd >= '${since}' AND cftc_contract_market_code in(${codes.map(c => `'${c}'`).join(',')})`;
    const url = `${CFTC}${R.id}.json?$select=${fields.join(',')}&$where=${encodeURIComponent(where)}&$order=report_date_as_yyyy_mm_dd&$limit=50000`;
    for (const r of JSON.parse(await fetchText(url))) (rows[r.cftc_contract_market_code] ||= []).push(r);
  }
  const markets = {};
  for (const [key, label, report, code, price, note] of MARKETS) {
    const R = REPORTS[report], list = (rows[code] || []).sort((a, b) => a.report_date_as_yyyy_mm_dd.localeCompare(b.report_date_as_yyyy_mm_dd));
    const history = list.map(r => {
      const o = {date: r.report_date_as_yyyy_mm_dd.slice(0, 10), oi: num(r.open_interest_all)};
      for (const [g, [l, s]] of Object.entries(R.groups)) { const L = num(r[l]), S = num(r[s]); if (L != null && S != null) o[g] = [L, S]; }
      return o;
    }).filter(o => o.oi && o[R.spec]);
    if (history.length < 20) { console.warn('[positioning] too little COT history for', key); continue; }
    markets[key] = {key, label, report, reportName: R.name, code, spec: R.spec, groups: Object.keys(R.groups), price, inverse: note === 'inverse', history};
  }
  if (Object.keys(markets).length < 10) throw new Error('COT: too few markets returned');
  const latest = Object.values(markets).map(m => m.history.at(-1).date).sort().at(-1);
  return {markets, latest};
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/), head = splitCSV(lines[0]);
  return lines.slice(1).map(l => { const c = splitCSV(l); return Object.fromEntries(head.map((h, i) => [h, c[i]])); });
}
function splitCSV(line) { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; }
async function fetchPolicy() {
  const rows = parseCSV(await fetchText(`https://stats.bis.org/api/v1/data/WS_CBPOL/M.${Object.keys(AREAS).join('+')}?startPeriod=2015-01&format=csv`));
  const areas = {};
  for (const r of rows) {
    const v = num(r.OBS_VALUE); if (v == null || !AREAS[r.REF_AREA] || !/^\d{4}-\d{2}$/.test(r.TIME_PERIOD)) continue;
    (areas[r.REF_AREA] ||= {area: r.REF_AREA, bank: AREAS[r.REF_AREA], history: []}).history.push([r.TIME_PERIOD, v]);
  }
  for (const a of Object.values(areas)) a.history.sort((x, y) => x[0].localeCompare(y[0]));
  if (Object.keys(areas).length < 6) throw new Error('BIS: too few policy-rate series');
  return {areas};
}

async function main() {
  const [outDir, prevDir] = process.argv.slice(2);
  if (!outDir) throw new Error('Usage: refresh-positioning.cjs <output-dir> [previous-dir]');
  await fs.mkdir(outDir, {recursive: true});
  const now = Date.now(), iso = new Date(now).toISOString();
  const prev = {cot: prevDir ? await readJSON(path.join(prevDir, 'cot.json')) : null, policy: prevDir ? await readJSON(path.join(prevDir, 'policy.json')) : null};
  const fresh = p => p && now - Date.parse(p.generatedAt) < 6 * 3600000 && !p.stale;
  for (const [name, fn, meta] of [
    ['cot', () => fetchCOT(now), {source: 'CFTC Commitments of Traders (futures only; positions as of Tuesday, released Friday)', sourceURL: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm'}],
    ['policy', () => fetchPolicy(), {source: 'Bank for International Settlements, central bank policy rates (monthly, end of period)', sourceURL: 'https://data.bis.org/topics/CBPOL'}]
  ]) {
    if (fresh(prev[name])) { await fs.writeFile(path.join(outDir, name + '.json'), JSON.stringify(prev[name]) + '\n'); continue; }
    try { await fs.writeFile(path.join(outDir, name + '.json'), JSON.stringify({version: 1, generatedAt: iso, ...meta, ...(await fn())}) + '\n'); console.log('[positioning]', name, 'published'); }
    catch (e) { console.warn('[positioning]', name, 'failed:', e.message); if (prev[name]) await fs.writeFile(path.join(outDir, name + '.json'), JSON.stringify({...prev[name], stale: true}) + '\n'); }
  }
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = {MARKETS, REPORTS, AREAS, parseCSV};
