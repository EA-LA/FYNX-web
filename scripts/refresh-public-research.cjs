'use strict';
// Produce only anonymous market evidence. No user store, credentials, positions, or broker inputs are used.
const fs = require('node:fs/promises');
const path = require('node:path');
const { symbols, hash, fetchJSON } = require('../backend/quant/common.cjs');
const { DukascopyProvider, eventType } = require('../backend/quant/providers.cjs');
const { CFTCProvider } = require('../backend/edge/providers.cjs');
const { buildSnapshot, COT_MARKETS } = require('../backend/edge/engine.cjs');
const { parseVix } = require('../backend/vix-data.cjs');

const DAY = 86400000;
const iso = ms => new Date(ms).toISOString();
const SOURCE = {
  prices: { name: 'Dukascopy', url: 'https://www.dukascopy.com/swiss/english/marketwatch/historical/' },
  cot: { name: 'CFTC Commitments of Traders', url: 'https://publicreporting.cftc.gov/stories/s/r4w3-av2u' },
  releases: { name: 'U.S. Department of Labor weekly claims archive', url: 'https://oui.doleta.gov/unemploy/claims_arch.asp' },
  vix: { name: 'Cboe VIX daily history', url: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv' },
  calendar: { name: 'Forex Factory weekly calendar', url: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json' },
};
async function read(dir, file) {
  try { return JSON.parse(await fs.readFile(path.join(dir, file), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function write(dir, file, data) {
  const target = path.join(dir, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target + '.tmp', JSON.stringify(data) + '\n');
  await fs.rename(target + '.tmp', target);
}
function coverage(asOf) {
  const to = new Date(asOf);
  to.setUTCHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - 10);
  from.setUTCDate(from.getUTCDate() - 2);
  return { from: from.toISOString(), to: to.toISOString() };
}
function validateBars(rows, dates) {
  let previous = -Infinity;
  for (const bar of rows) {
    const time = Date.parse(bar.time);
    if (!Number.isFinite(time) || time % DAY || time <= previous || bar.time < dates.from || bar.time >= dates.to ||
        ![bar.open, bar.high, bar.low, bar.close].every(p => Number.isFinite(p) && p > 0) ||
        bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) throw new Error('Invalid daily candle history.');
    previous = time;
  }
  if (rows.length < 252) throw new Error('Insufficient observed daily history.');
  for (let i = 1; i < rows.length; i++) {
    if (Date.parse(rows[i].time) - Date.parse(rows[i-1].time) > 21 * DAY) throw new Error('Incomplete historical price archive.');
  }
}
async function loadBars(dir, market, dates, provider) {
  const previous = await read(dir, `bars/${market.id}-D1.json`);
  const canExtend = previous?.symbol === market.id && previous.timeframe === 'D1' && previous.requestedFrom <= dates.from && previous.to >= iso(Date.parse(dates.to) - 35 * DAY);
  // Re-fetch a recent overlap so ordinary provider corrections are applied.
  const start = canExtend ? iso(Math.max(Date.parse(dates.from), Date.parse(previous.to) - 14 * DAY)) : dates.from;
  try {
    const fresh = await provider.history({ symbol: market, timeframe: 'D1', from: start, to: dates.to });
    if (!fresh.length || previous && fresh.at(-1).time < previous.to) throw new Error('The provider did not return the latest previously published session.');
    const bars = [...(canExtend ? previous.bars.filter(b => b.time >= dates.from && b.time < start) : []), ...fresh];
    validateBars(bars, dates);
    const last = bars.at(-1).time;
    if (Date.parse(dates.to) - Date.parse(last) > DAY * 7) throw new Error('Provider daily history is more than one week old.');
    return { symbol: market.id, timeframe: 'D1', requestedTimeframe: 'D1', execution: 'ohlc', bars, source: SOURCE.prices.name, sourceURL: SOURCE.prices.url,
      requestedFrom: dates.from, requestedTo: dates.to, from: bars[0].time, to: last, updatedAt: iso(Date.now()), status: 'historical', priceSide: 'bid', completeBarsOnly: true,
      granularityNote: 'Completed daily bid candles. The candle timestamp is its UTC opening. Market history begins with the first available session.' };
  } catch (error) {
    if (!previous || previous.symbol !== market.id || previous.timeframe !== 'D1') throw new Error(`${market.id}: ${error.message}`);
    validateBars(previous.bars, {from: previous.requestedFrom, to: previous.requestedTo});
    return { ...previous, status: 'stale', warning: 'The data provider could not refresh this market. Original observation and retrieval dates are preserved.' };
  }
}
function summarize(dataset) {
  const { bars, symbol, source, sourceURL, timeframe, requestedFrom, requestedTo, from, to, updatedAt, status } = dataset;
  const last = bars.at(-1), prior = bars.at(-2), cutoff = new Date(last.time);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const base = bars.findLast(b => Date.parse(b.time) <= cutoff.getTime());
  return { symbol, source, sourceURL, timeframe, from, to, updatedAt, requestedFrom, requestedTo, status, count: bars.length, price: last.close, asOf: iso(Date.parse(last.time) + DAY),
    dayChangePct: prior ? 100 * (last.close / prior.close - 1) : null, yearChangePct: base ? 100 * (last.close / base.close - 1) : null, yearBaseAsOf: base ? iso(Date.parse(base.time) + DAY) : null };
}
function nyDate(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
function weekStart(value) {
  const date = new Date(nyDate(value) + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0,10);
}
// Public calendar rows: every country and importance level, as published (no values estimated).
const IMPACTS = {High: 'high', Medium: 'medium', Low: 'low', Holiday: 'holiday', 'Non-Economic': 'other'};
function publicRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter(r => typeof r.title === 'string' && r.title.trim() && /^[A-Z]{3}$/.test(String(r.country || '')) && Number.isFinite(Date.parse(r.date))).map(r => {
    const time = iso(Date.parse(r.date)), name = r.title.trim();
    return { id: hash([r.country, name, time]), time, title: name, currency: r.country, impact: IMPACTS[r.impact] || 'other', forecast: r.forecast || null, previous: r.previous || null };
  }).sort((a,b) => a.time.localeCompare(b.time) || a.currency.localeCompare(b.currency));
}
function parseCalendar(rows, observedAt) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('The weekly calendar is empty.');
  const week = weekStart(observedAt);
  if (rows.some(r => !Number.isFinite(Date.parse(r.date)) || weekStart(r.date) !== week)) throw new Error('The weekly calendar does not cover the current week.');
  const currencies = new Set(symbols().flatMap(s => s.currencies));
  const events = rows.filter(r => ['High','Medium'].includes(r.impact) && currencies.has(r.country)).map(r => {
    if (typeof r.title !== 'string' || !r.title.trim()) throw new Error('Incomplete calendar item.');
    const time = iso(Date.parse(r.date)), name = r.title.trim();
    return { id: hash([r.country, name, time]), time, name, title: name, currency: r.country, type: eventType(name) === 'OTHER' ? name : eventType(name), impact: r.impact.toLowerCase(),
      actual: null, forecast: r.forecast || null, previous: r.previous || null, timing: 'scheduled', availableAt: observedAt, source: SOURCE.calendar.name, sourceURL: 'https://www.forexfactory.com/calendar' };
  }).sort((a,b) => a.time.localeCompare(b.time));
  // Full week for the public calendar pages (every country and importance). Scoring keeps using `events` above.
  const all = publicRows(rows);
  // Use a conservative UTC boundary so we never claim coverage past Saturday evening in New York.
  return { source: SOURCE.calendar.name, sourceURL: SOURCE.calendar.url, updatedAt: observedAt, from: week, to: iso(Date.parse(week) + 7 * DAY), events, all, status: 'scheduled' };
}
function parseClaimArchive(html, year, observedAt) {
  const days = new Map();
  for (const match of html.matchAll(/href=["'](\/press\/(\d{4})\/(\d{2})(\d{2})(\d{2})\.pdf)["']/gi)) {
    const [, href, fullYear, month, day, shortYear] = match;
    const date = `${fullYear}-${month}-${day}`;
    if (Number(fullYear) !== year || !fullYear.endsWith(shortYear) || !Number.isFinite(Date.parse(date)) ||
        iso(Date.parse(date)).slice(0, 10) !== date || Date.parse(date) + DAY > Date.parse(observedAt)) continue;
    days.set(date, {date, type:'Unemployment Claims', currency:'USD', availableAt:observedAt, source:SOURCE.releases.name, sourceURL:new URL(href, SOURCE.releases.url).href});
  }
  if (!days.size) throw new Error('No published weekly claims releases were found for this year.');
  return [...days.values()];
}
async function claimReleaseDays(previous, asOf) {
  const year = new Date(asOf).getUTCFullYear(), old = previous?.releaseDays || [];
  const days = [];
  for (let y = year - 3; y <= year; y++) {
    const saved = old.filter(d => d.date.startsWith(`${y}-`));
    if (y < year && saved.length >= 40) { days.push(...saved); continue; }
    try {
      const response = await fetch('https://oui.doleta.gov/unemploy/archive.asp', {
        method:'POST', body:new URLSearchParams({report:'press',year:String(y)}), signal:AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error('The DOL archive did not respond.');
      const latest = parseClaimArchive(await response.text(), y, iso(Date.now()));
      const versions = new Map(saved.map(d => [d.date, d]));
      for (const day of latest) if (!versions.has(day.date)) versions.set(day.date, day);
      days.push(...versions.values());
    } catch { days.push(...saved); }
  }
  return days.sort((a,b) => a.date.localeCompare(b.date));
}
async function observedSources(previous, previousCalendar) {
  const result = await Promise.allSettled([
    new CFTCProvider().history(),
    (async () => { const response = await fetch(SOURCE.vix.url, {signal: AbortSignal.timeout(25000)}); if (!response.ok) throw new Error('Cboe is unavailable.'); return parseVix(await response.text()); })(),
    (async () => parseCalendar(await fetchJSON(SOURCE.calendar.url, {provider: SOURCE.calendar.name, timeout: 20000}), iso(Date.now())))(),
    claimReleaseDays(previous, iso(Date.now())),
    (async () => publicRows(await fetchJSON(SOURCE.calendar.url.replace('thisweek', 'nextweek'), {provider: SOURCE.calendar.name, timeout: 20000})))(),
  ]);
  const [cotResult, vixResult, calendarResult, releasesResult, nextWeekResult] = result;
  const releaseDays = releasesResult.status === 'fulfilled' ? releasesResult.value : previous?.releaseDays || [];
  const cotData = cotResult.status === 'fulfilled' ? cotResult.value : null;
  const cot = cotData ? cotData.records.map(({market,reportDate,availableAt,long,short,report,contractCode,availabilityBasis}) => ({market,reportDate,availableAt,long,short,report,contractCode,availabilityBasis})) : previous?.cot || [];
  const vixData = vixResult.status === 'fulfilled' ? vixResult.value : null;
  const fetchedAt = iso(Date.now());
  const vix = vixData ? vixData.rows.filter(r => Date.parse(r.date) + DAY <= Date.now()).map(r => ({...r, availableAt: fetchedAt, source: SOURCE.vix.name, sourceURL: SOURCE.vix.url})) : previous?.vix || [];
  const calendar = calendarResult.status === 'fulfilled' ? calendarResult.value : previousCalendar;
  // Next week's schedule (published by the same source) so weekend visitors still see what is coming.
  if (calendar) { const prevNext = (previousCalendar?.nextWeek || []).filter(e => Date.parse(e.time) > Date.now()); calendar.nextWeek = nextWeekResult.status === 'fulfilled' && nextWeekResult.value.length ? nextWeekResult.value : prevNext; }
  const calendarUsable = Boolean(calendar && calendar.status === 'scheduled' && Date.parse(calendar.to) >= Date.now() + DAY && Date.parse(calendar.updatedAt) > Date.now() - DAY);
  const cotFresh = cot.length > 0 && Date.now() - Date.parse(cotData?.latestReportDate || previous?.providerStatus?.cot?.reportDate) <= 18 * DAY;
  const providerStatus = {
    cot: {status: cotData && cotFresh ? 'available' : cot.length ? 'delayed' : 'unavailable', updatedAt: cotData?.fetchedAt || previous?.providerStatus?.cot?.updatedAt || null, reportDate: cotData?.latestReportDate || previous?.providerStatus?.cot?.reportDate || null, source: SOURCE.cot.name},
    vix: {status: vixData && vix.length && Date.now() - Date.parse(vix.at(-1).date) < 7 * DAY ? 'available' : vix.length ? 'delayed' : 'unavailable', updatedAt: vixData ? fetchedAt : previous?.providerStatus?.vix?.updatedAt || null, source: SOURCE.vix.name},
    calendar: {status: calendarUsable ? 'available' : 'unavailable', historyAvailable: false, source: SOURCE.calendar.name, updatedAt: calendar?.updatedAt || null, reason: calendarUsable ? 'Current weekly schedule. Official archived claims dates support daily event-move estimates.' : 'The current weekly calendar does not cover the next 24 hours.'},
    quotes: {status: 'historical', configured: false, reason: 'Published prices are completed daily bid closes.'},
  };
  const asOf = iso(Date.now());
  // The calendar contains schedules. Only upcoming announcements enter the scoring engine; past scheduled times are not confirmed releases.
  const factors = {version: 1, asOf, cot, vix, releaseDays, events: calendar?.events.filter(e => e.time >= asOf) || [], calendarAvailable: calendarUsable,
    calendarAsOf: calendar?.updatedAt || null, calendarCoverageTo: calendar?.to || null, sources: SOURCE, providerStatus};
  return { factors, calendar: calendar || {source: SOURCE.calendar.name, sourceURL: SOURCE.calendar.url, status:'unavailable',events:[],from:null,to:null,updatedAt:null} };
}
async function refresh(dir) {
  const dates = coverage(Date.now()), markets = symbols(), provider = new DukascopyProvider();
  const queue = markets.slice(), datasets = new Map();
  async function collect() {
    while (queue.length) {
      const market = queue.shift();
      const data = await loadBars(dir, market, dates, provider);
      datasets.set(market.id, data);
      console.log(`${market.id}: ${data.bars.length} ${data.status} bars, through ${data.to}.`);
    }
  }
  await Promise.all([collect(), collect()]);
  if ([...datasets.values()].every(s => s.status === 'stale')) throw new Error('No markets refreshed. Keeping the previous publication.');
  const { factors, calendar } = await observedSources(await read(dir, 'factors.json'), await read(dir, 'calendar.json'));
  const inputs = Object.fromEntries(markets.map(market => {
    const data = datasets.get(market.id), legs = COT_MARKETS[market.id];
    return [market.id, { bars: data.bars, source: data.source, releaseDays: factors.releaseDays, cot: factors.cot.filter(r => legs.some(leg => r.market === leg.market)),
      calendarAvailable: factors.calendarAvailable, calendarAsOf: factors.calendarAsOf, events: factors.events.filter(e => market.currencies.includes(e.currency)) }];
  }));
  const snapshot = buildSnapshot({ asOf: factors.asOf, userTimezone: 'UTC', watchlist: markets.map(m => m.id), markets: inputs, vix: factors.vix });
  for (const market of snapshot.markets) {
    const data = datasets.get(market.symbol);
    // Correlations and all fit statistics have already been calculated. Full price histories are served separately.
    market.returns = market.returns.slice(-20);
    market.priceSource = data.source;
    market.priceSourceURL = data.sourceURL;
  }
  Object.assign(snapshot, {publicResearch:true, guest:true, generatedAt:factors.asOf, localDate:factors.asOf.slice(0,10), status:'partial', providerStatus:factors.providerStatus,
    providerIssues:[...datasets.values()].filter(d => d.status === 'stale').map(d => `${d.symbol}: ${d.warning}`), sources:Object.values(SOURCE).map(s => s.name),
    guard:{connected:false,status:'not-connected'}, notes:[...snapshot.notes,'Prices are completed daily bid closes. Calendar times are published schedules. Historical claims moves use confirmed DOL release dates and daily closes. Other release types need their own dated price evidence.']});
  for (const data of datasets.values()) await write(dir, `bars/${data.symbol}-D1.json`, data);
  await write(dir, 'calendar.json', calendar);
  await write(dir, 'factors.json', factors);
  await write(dir, 'edge.json', snapshot);
  await write(dir, 'manifest.json', {version:1, generatedAt:factors.asOf, markets:markets.map(m => summarize(datasets.get(m.id)))});
  console.log(`Published ${snapshot.markets.length} markets with ${factors.cot.length} CFTC reports, ${factors.vix.length} VIX closes and ${factors.events.length} upcoming announcements.`);
}
module.exports = { coverage, validateBars, summarize, parseCalendar, publicRows, parseClaimArchive, loadBars };
if (require.main === module) refresh(path.resolve(process.argv[2] || path.join(__dirname, '../assets/data/research'))).catch(error => { console.error(error.message); process.exitCode = 1; });
