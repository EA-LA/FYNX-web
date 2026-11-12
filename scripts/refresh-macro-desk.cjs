#!/usr/bin/env node
/* Macro Desk publisher. Fetches public rate data and writes one dated snapshot.
 * Every value keeps its source and observation date. A provider that fails keeps
 * its last successful values, marked stale; nothing is estimated or invented.
 * Usage: node scripts/refresh-macro-desk.cjs <output-dir> [previous-desk.json] */
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

const DAY = 86400000;
const HISTORY_DAYS = 80;
const AGENT = 'Mozilla/5.0 (compatible; FYNXFinanceWorld/1.0; +https://www.fynxfinanceworld.com/macro-desk.html)';
const SCHEDULE = require('../assets/data/macro/central-banks.json');
const RESEARCH = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/research-data/assets/data/research/';

const SOURCES = Object.freeze({
  US: {name: 'U.S. Treasury daily par yield curve', url: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve'},
  EA: {name: 'ECB euro area yield curve (all government bonds, spot rates)', url: 'https://data.ecb.europa.eu/data/datasets/YC'},
  JP: {name: 'Japan Ministry of Finance JGB interest rates', url: 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/index.htm'},
  GB: {name: 'Bank of England nominal par gilt yields', url: 'https://www.bankofengland.co.uk/statistics/yield-curves'},
  live: {name: 'Cboe Treasury yield indices via Yahoo Finance (delayed)', url: 'https://finance.yahoo.com/quote/%5ETNX/'},
  fed: {name: 'CBOT 30-Day Fed Funds futures via Yahoo Finance (delayed); EFFR from the New York Fed', url: 'https://www.newyorkfed.org/markets/reference-rates/effr'},
  rates: {name: 'Bank for International Settlements central bank policy rates', url: 'https://data.bis.org/topics/CBPOL'},
  events: {name: 'Forex Factory weekly calendar (FYNX research snapshot)', url: 'https://www.forexfactory.com/calendar'}
});

const iso = ms => new Date(ms).toISOString();
const isoDate = ms => iso(ms).slice(0, 10);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

async function fetchText(url, {timeout = 25000, maxBytes = 12e6, headers = {}} = {}) {
  const response = await fetch(url, {signal: AbortSignal.timeout(timeout), redirect: 'follow', headers: {'User-Agent': AGENT, Accept: '*/*', ...headers}});
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  const text = await response.text();
  if (text.length > maxBytes) throw new Error(`Response from ${new URL(url).hostname} is too large`);
  return text;
}
const fetchJSON = async (url, options) => JSON.parse(await fetchText(url, options));

/* RFC 4180 CSV with quoted fields. */
function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.map(r => r.map(v => v.trim())).filter(r => r.some(v => v !== ''));
}
const num = value => {
  if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value.trim())) return null;
  const n = Number(value); return Number.isFinite(n) && Math.abs(n) < 50 ? n : null;
};
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && isoDate(Date.parse(value + 'T00:00:00Z')) === value; }

/* --- Yield curves ------------------------------------------------------- */
const US_TENORS = {'1 Mo': '1M', '3 Mo': '3M', '6 Mo': '6M', '1 Yr': '1Y', '2 Yr': '2Y', '3 Yr': '3Y', '5 Yr': '5Y', '7 Yr': '7Y', '10 Yr': '10Y', '20 Yr': '20Y', '30 Yr': '30Y'};
function parseTreasury(text) {
  const rows = parseCSV(text), header = rows[0] || [];
  if (!/date/i.test(header[0] || '')) throw new Error('Treasury CSV has no Date column');
  const columns = header.map(h => US_TENORS[h] || null);
  if (columns.filter(Boolean).length < 8) throw new Error('Treasury CSV is missing tenor columns');
  return rows.slice(1).map(r => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(r[0] || ''); if (!m) return null;
    const date = `${m[3]}-${m[1]}-${m[2]}`; if (!validDate(date)) return null;
    const values = {}; columns.forEach((tenor, i) => { const v = tenor ? num(r[i]) : null; if (tenor && v !== null) values[tenor] = v; });
    return Object.keys(values).length >= 6 ? {date, values} : null;
  }).filter(Boolean);
}
const EA_TENORS = ['SR_3M', 'SR_1Y', 'SR_2Y', 'SR_5Y', 'SR_10Y', 'SR_20Y', 'SR_30Y'];
function parseECB(text) {
  const rows = parseCSV(text), header = rows[0] || [];
  const at = name => header.indexOf(name);
  const [iType, iTime, iValue] = [at('DATA_TYPE_FM'), at('TIME_PERIOD'), at('OBS_VALUE')];
  if (iType < 0 || iTime < 0 || iValue < 0) throw new Error('ECB CSV is missing expected columns');
  const byDate = new Map();
  for (const r of rows.slice(1)) {
    const type = r[iType], date = r[iTime], value = num(r[iValue]);
    if (!EA_TENORS.includes(type) || !validDate(date) || value === null) continue;
    if (!byDate.has(date)) byDate.set(date, {});
    byDate.get(date)[type.slice(3)] = round(value, 4);
  }
  return [...byDate].filter(([, v]) => Object.keys(v).length >= 5).map(([date, values]) => ({date, values}));
}
const JP_TENORS = ['1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y', '40Y'];
function japaneseDate(value) {
  let m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(value);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^([RHS])(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/.exec(value); // Reiwa / Heisei / Showa era dates
  if (!m) return null;
  const year = {R: 2018, H: 1988, S: 1925}[m[1]] + Number(m[2]);
  return `${year}-${m[3].padStart(2, '0')}-${m[4].padStart(2, '0')}`;
}
function parseMOF(text) {
  const rows = parseCSV(text);
  const h = rows.findIndex(r => /^(date|基準日)$/i.test(r[0]));
  if (h < 0) throw new Error('MOF CSV has no header row');
  const header = rows[h];
  return rows.slice(h + 1).map(r => {
    const date = japaneseDate(r[0]); if (!date || !validDate(date)) return null;
    const values = {}; header.forEach((name, i) => { if (JP_TENORS.includes(name)) { const v = num(r[i]); if (v !== null) values[name] = v; } });
    return Object.keys(values).length >= 6 ? {date, values} : null;
  }).filter(Boolean);
}
const GB_SERIES = {IUDSNPY: '5Y', IUDMNPY: '10Y', IUDLNPY: '20Y'};
const MONTHS = {Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'};
function parseBoE(text) {
  const rows = parseCSV(text), header = rows[0] || [];
  if (!/date/i.test(header[0] || '')) throw new Error('Bank of England CSV has no DATE column');
  return rows.slice(1).map(r => {
    const m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(r[0] || ''); if (!m || !MONTHS[m[2]]) return null;
    const date = `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, '0')}`; if (!validDate(date)) return null;
    const values = {}; header.forEach((name, i) => { const tenor = GB_SERIES[name.trim()]; const v = tenor ? num(r[i]) : null; if (tenor && v !== null) values[tenor] = v; });
    return Object.keys(values).length >= 2 ? {date, values} : null;
  }).filter(Boolean);
}
function boeDate(ms) { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, '0')}/${Object.keys(MONTHS)[d.getUTCMonth()]}/${d.getUTCFullYear()}`; }

async function fetchCurve(area, now) {
  const year = new Date(now).getUTCFullYear();
  if (area === 'US') {
    const url = y => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`;
    const rows = parseTreasury(await fetchText(url(year)));
    if (new Date(now).getUTCMonth() < 3) rows.push(...parseTreasury(await fetchText(url(year - 1))).filter(r => Date.parse(r.date) > now - 120 * DAY));
    return rows;
  }
  if (area === 'EA') return parseECB(await fetchText(`https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_C.SV_C_YM.${EA_TENORS.join('+')}?lastNObservations=${HISTORY_DAYS}&format=csvdata`, {headers: {Accept: 'text/csv'}}));
  if (area === 'JP') {
    const recent = parseMOF(await fetchText('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv'));
    return recent;
  }
  if (area === 'GB') {
    const url = `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${boeDate(now - 120 * DAY)}&Dateto=now&SeriesCodes=${Object.keys(GB_SERIES).join(',')}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
    return parseBoE(await fetchText(url, {headers: {Accept: 'text/csv,*/*'}}));
  }
  throw new Error('Unknown curve');
}
/* MOF publishes the current month separately; the full history file is fetched only
 * when the merged history cannot yet cover a one-month comparison. */
async function fetchJapanHistory() {
  return parseMOF(await fetchText('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv', {timeout: 40000, maxBytes: 25e6}));
}

function mergeHistory(previous = [], fresh = [], now) {
  const byDate = new Map();
  for (const row of [...previous, ...fresh]) if (row && validDate(row.date) && row.values) byDate.set(row.date, row);
  const cutoff = isoDate(now - HISTORY_DAYS * DAY), future = isoDate(now + DAY);
  return [...byDate.values()].filter(r => r.date >= cutoff && r.date <= future).sort((a, b) => a.date.localeCompare(b.date));
}

/* --- Live US yields and Fed funds futures (Yahoo chart endpoint) --------- */
async function yahooQuote(symbol) {
  const data = await fetchJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`, {timeout: 15000});
  const r = data?.chart?.result?.[0], m = r?.meta;
  if (!m || String(m.symbol).toUpperCase() !== symbol.toUpperCase() || !finite(m.regularMarketPrice) || !finite(m.regularMarketTime)) throw new Error(`No valid quote for ${symbol}`);
  return {symbol, price: m.regularMarketPrice, previousClose: finite(m.chartPreviousClose) ? m.chartPreviousClose : finite(m.previousClose) ? m.previousClose : null, asOf: iso(m.regularMarketTime * 1000)};
}
const LIVE_US = [['^IRX', '13W'], ['^FVX', '5Y'], ['^TNX', '10Y'], ['^TYX', '30Y']];
async function fetchLiveUS(now) {
  const settled = await Promise.allSettled(LIVE_US.map(([s]) => yahooQuote(s)));
  const quotes = settled.map((r, i) => r.status === 'fulfilled' && r.value.price > 0 && r.value.price < 30 && Date.parse(r.value.asOf) > now - 5 * DAY ? {...r.value, tenor: LIVE_US[i][1]} : null).filter(Boolean);
  if (!quotes.length) throw new Error(settled.find(r => r.status === 'rejected')?.reason?.message || 'No live yields');
  return quotes;
}

const MONTH_CODES = 'FGHJKMNQUVXZ';
const contractSymbol = (year, month) => `ZQ${MONTH_CODES[month]}${String(year).slice(-2)}.CBT`;
const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/* Simplified FedWatch-style estimate for the next scheduled FOMC decision.
 * start = current EFFR; end = rate implied for the days after the decision. */
function fedOdds({meeting, effr, prices}) {
  const d = new Date(meeting + 'T00:00:00Z'), y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate(), n = daysInMonth(y, m);
  const meetingMonth = prices[contractSymbol(y, m)];
  const next = m === 11 ? [y + 1, 0] : [y, m + 1];
  const nextMonth = prices[contractSymbol(...next)];
  let end, method;
  if (finite(meetingMonth) && n - day >= 7) {
    const average = 100 - meetingMonth;
    end = (average * n - effr * day) / (n - day); method = 'meeting-month';
  } else if (finite(nextMonth)) { end = 100 - nextMonth; method = 'following-month'; }
  else return null;
  if (!finite(end) || end < -1 || end > 20) return null;
  const changeBp = (end - effr) * 100, steps = Math.abs(changeBp) / 25, direction = changeBp >= 0 ? 'hike' : 'cut';
  const result = {cut: 0, hold: 0, hike: 0, cut50: 0, hike50: 0};
  if (steps <= 1) { result[direction] = steps; result.hold = 1 - steps; }
  else { const big = Math.min(1, steps - 1); result[direction + '50'] = big; result[direction] = 1 - big; }
  for (const k of Object.keys(result)) result[k] = round(result[k] * 100, 1);
  return {meeting, expectedChangeBp: round(changeBp, 1), impliedRateAfter: round(end, 3), method, ...result};
}
async function fetchFed(now) {
  const effrData = await fetchJSON('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json', {timeout: 15000});
  const row = effrData?.refRates?.[0];
  if (!row || !finite(row.percentRate) || !validDate(row.effectiveDate)) throw new Error('EFFR unavailable');
  const effr = {value: row.percentRate, date: row.effectiveDate, targetFrom: finite(row.targetRateFrom) ? row.targetRateFrom : null, targetTo: finite(row.targetRateTo) ? row.targetRateTo : null};
  const meeting = SCHEDULE.banks.find(b => b.area === 'US').decisions.find(date => Date.parse(date + 'T23:59:59Z') >= now);
  if (!meeting) return {effr, odds: null, reason: 'No future FOMC date in the published schedule.'};
  const d = new Date(meeting + 'T00:00:00Z'), y = d.getUTCFullYear(), m = d.getUTCMonth();
  const symbols = [contractSymbol(y, m), m === 11 ? contractSymbol(y + 1, 0) : contractSymbol(y, m + 1)];
  const prices = {}, contracts = [];
  for (const symbol of symbols) {
    try { const q = await yahooQuote(symbol); if (q.price > 80 && q.price < 101 && Date.parse(q.asOf) > now - 5 * DAY) { prices[symbol] = q.price; contracts.push({symbol, price: q.price, asOf: q.asOf}); } }
    catch (error) { console.warn('Fed funds futures', symbol, error.message); }
  }
  const odds = fedOdds({meeting, effr: effr.value, prices});
  // Implied path: monthly average fed funds rate priced by the next 12 contract months (100 − price).
  const path = [], start = new Date(now);
  for (let k = 0; k < 12; k++) {
    const yy = start.getUTCFullYear() + Math.floor((start.getUTCMonth() + k) / 12), mm = (start.getUTCMonth() + k) % 12, symbol = contractSymbol(yy, mm);
    try { const q = prices[symbol] ? {price: prices[symbol], asOf: contracts.find(c => c.symbol === symbol).asOf} : await yahooQuote(symbol); if (q.price > 80 && q.price < 101 && Date.parse(q.asOf) > now - 5 * DAY) path.push({month: `${yy}-${String(mm + 1).padStart(2, '0')}`, symbol, rate: round(100 - q.price, 4), asOf: q.asOf}); }
    catch (error) { console.warn('Fed funds path', symbol, error.message); }
  }
  return {effr, odds: odds ? {...odds, contracts} : null, path: path.length >= 3 ? path : null, reason: odds ? null : 'Fed funds futures prices were unavailable.'};
}

/* --- Policy rates and central-bank events ------------------------------- */
async function fetchRates() {
  const data = await fetchJSON('https://us-central1-fynx-c7a28.cloudfunctions.net/webMacroData?kind=rates', {timeout: 60000});
  if (!Array.isArray(data?.rows) || !data.rows.length) throw new Error('Policy rates unavailable');
  const rows = data.rows.filter(r => typeof r.area === 'string' && finite(r.value) && validDate(r.observationDate)).map(r => ({area: r.area, value: r.value, observationDate: r.observationDate}));
  if (!rows.length) throw new Error('No valid policy rates');
  return {rows, retrievedAt: data.fetchedAt || null, stale: data.cacheStatus === 'stale'};
}
const CB_EVENT = /\b(speaks?|press conference|monetary policy|policy rate|funds rate|bank rate|cash rate|refinancing rate|deposit facility|overnight rate|rate statement|minutes|mpc|fomc|boj|ecb|snb|boc|rba|rbnz|boe|fed chair|governor|lagarde|bailey|ueda|schlegel|macklem|bullock|breman|beige book)\b/i;
async function fetchEvents(now) {
  const data = await fetchJSON(RESEARCH + 'calendar.json', {timeout: 20000});
  if (!Array.isArray(data?.events)) throw new Error('Calendar snapshot unavailable');
  const currencies = new Set(SCHEDULE.banks.map(b => b.currency));
  const events = data.events.filter(e => currencies.has(e.currency) && typeof e.title === 'string' && CB_EVENT.test(e.title) && Number.isFinite(Date.parse(e.time)) && Date.parse(e.time) >= now - DAY)
    .map(e => ({time: e.time, title: e.title.slice(0, 140), currency: e.currency, impact: ['high', 'medium', 'low'].includes(e.impact) ? e.impact : 'low', forecast: e.forecast || null, previous: e.previous || null}))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time)).slice(0, 40);
  return {events, calendarUpdatedAt: data.updatedAt || null, coverageTo: data.to || null};
}

/* --- Broker order and position books (optional) ----------------------------
 * OANDA publishes aggregated order/position books to any account holder. They
 * are fetched only when OANDA_API_TOKEN is configured as a repository secret;
 * only bucket percentages near the current price are published. */
const BOOK_INSTRUMENTS = {EURUSD: 'EUR_USD', GBPUSD: 'GBP_USD', USDJPY: 'USD_JPY', AUDUSD: 'AUD_USD', USDCAD: 'USD_CAD', USDCHF: 'USD_CHF', NZDUSD: 'NZD_USD', EURJPY: 'EUR_JPY', GBPJPY: 'GBP_JPY', EURGBP: 'EUR_GBP', XAUUSD: 'XAU_USD', XAGUSD: 'XAG_USD'};
function parseBook(payload, kind, around = 12) {
  const book = payload?.[kind];
  const price = Number(book?.price), width = Number(book?.bucketWidth);
  if (!book || !Number.isFinite(price) || !Number.isFinite(width) || width <= 0 || !Array.isArray(book.buckets) || !Number.isFinite(Date.parse(book.time))) throw new Error(`Invalid ${kind}`);
  const buckets = book.buckets.map(b => ({price: Number(b.price), long: Number(b.longCountPercent), short: Number(b.shortCountPercent)}))
    .filter(b => Number.isFinite(b.price) && Number.isFinite(b.long) && Number.isFinite(b.short) && b.long >= 0 && b.short >= 0 && b.long <= 100 && b.short <= 100)
    .sort((a, b) => a.price - b.price);
  if (!buckets.length) throw new Error(`Empty ${kind}`);
  const at = buckets.findIndex(b => b.price >= price), center = at < 0 ? buckets.length - 1 : at;
  const near = buckets.slice(Math.max(0, center - around), center + around).reverse();
  const total = (k, list) => round(list.reduce((s, b) => s + b[k], 0), 4);
  return {time: book.time, price, bucketWidth: width, buckets: near, longTotal: total('long', buckets), shortTotal: total('short', buckets)};
}
async function fetchBooks(token, env = 'practice') {
  const base = env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
  const headers = {Authorization: `Bearer ${token}`, Accept: 'application/json'};
  const books = {};
  for (const [symbol, instrument] of Object.entries(BOOK_INSTRUMENTS)) {
    const entry = {};
    for (const kind of ['orderBook', 'positionBook']) {
      try { entry[kind] = parseBook(await fetchJSON(`${base}/v3/instruments/${instrument}/${kind}`, {timeout: 15000, headers}), kind); }
      catch (error) { console.warn('[macro-desk] book', symbol, kind, error.message); }
    }
    if (entry.orderBook || entry.positionBook) books[symbol] = entry;
  }
  if (!Object.keys(books).length) throw new Error('No broker books returned');
  return books;
}

/* --- Assemble ------------------------------------------------------------ */
async function build(previous, now = Date.now()) {
  const prev = previous && previous.version === 1 ? previous : {};
  const status = {}, curves = {};
  const attempt = async (key, task) => {
    try { const value = await task(); status[key] = {status: 'fresh', fetchedAt: iso(now)}; return value; }
    catch (error) {
      console.warn(`[macro-desk] ${key}: ${error.message}`);
      status[key] = {status: prev.status?.[key]?.fetchedAt ? 'stale' : 'unavailable', fetchedAt: prev.status?.[key]?.fetchedAt || null, error: String(error.message).slice(0, 200)};
      return undefined;
    }
  };
  const areas = ['US', 'EA', 'JP', 'GB'];
  const curveResults = await Promise.all(areas.map(area => attempt('curve-' + area, () => fetchCurve(area, now))));
  for (const [i, area] of areas.entries()) {
    let history = mergeHistory(prev.curves?.[area]?.history, curveResults[i], now);
    if (area === 'JP' && curveResults[i] && (!history.length || Date.parse(history[0].date) > now - 35 * DAY)) {
      try { history = mergeHistory(history, (await fetchJapanHistory()).filter(r => Date.parse(r.date) > now - HISTORY_DAYS * DAY), now); }
      catch (error) { console.warn('[macro-desk] JP history:', error.message); }
    }
    if (history.length) curves[area] = {source: SOURCES[area].name, sourceURL: SOURCES[area].url, latest: history.at(-1).date, history};
  }
  const [liveUS, fed, rates, events] = await Promise.all([
    attempt('live-us', () => fetchLiveUS(now)), attempt('fed', () => fetchFed(now)),
    attempt('rates', () => fetchRates()), attempt('events', () => fetchEvents(now))
  ]);
  const token = process.env.OANDA_API_TOKEN;
  const books = token ? await attempt('books', () => fetchBooks(token, process.env.OANDA_ENV)) : undefined;
  return {
    version: 1, generatedAt: iso(now),
    curves,
    liveUS: liveUS ? {source: SOURCES.live.name, sourceURL: SOURCES.live.url, quotes: liveUS} : prev.liveUS || null,
    fed: fed ? {source: SOURCES.fed.name, sourceURL: SOURCES.fed.url, ...fed} : prev.fed || null,
    rates: rates ? {source: SOURCES.rates.name, sourceURL: SOURCES.rates.url, ...rates} : prev.rates || null,
    events: events ? {source: SOURCES.events.name, sourceURL: SOURCES.events.url, ...events} : prev.events || null,
    books: books ? {source: 'OANDA order and position books (aggregated client data, ~20-minute snapshots)', sourceURL: 'https://www.oanda.com/forex-trading/analysis/forex-order-book', markets: books}
      : token && prev.books ? prev.books : null,
    status
  };
}

async function main() {
  const [outDir, previousFile] = process.argv.slice(2);
  if (!outDir) throw new Error('Usage: refresh-macro-desk.cjs <output-dir> [previous-desk.json]');
  let previous = null;
  if (previousFile) { try { previous = JSON.parse(await fs.readFile(previousFile, 'utf8')); } catch { previous = null; } }
  const desk = await build(previous);
  const fresh = Object.values(desk.status).filter(s => s.status === 'fresh').length;
  if (!fresh && !previous) throw new Error('Every provider failed and no previous snapshot exists; nothing published.');
  await fs.mkdir(outDir, {recursive: true});
  const target = path.join(outDir, 'desk.json');
  await fs.writeFile(target + '.tmp', JSON.stringify(desk) + '\n');
  await fs.rename(target + '.tmp', target);
  console.log(`[macro-desk] ${fresh}/${Object.keys(desk.status).length} providers fresh:`, Object.entries(desk.status).map(([k, v]) => `${k}=${v.status}`).join(' '));
  for (const [area, curve] of Object.entries(desk.curves)) console.log(`[macro-desk] curve ${area}: ${curve.history.length} days, latest ${curve.latest}`, JSON.stringify(curve.history.at(-1).values));
  if (desk.fed?.odds) console.log('[macro-desk] fed odds', JSON.stringify(desk.fed.odds));
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = {parseBook, parseCSV, parseTreasury, parseECB, parseMOF, parseBoE, japaneseDate, fedOdds, mergeHistory, contractSymbol, build, CB_EVENT};
