#!/usr/bin/env node
/* FYNX World desk publisher. Writes public snapshots to the `world-data` branch:
 *   countries.json  every economy: World Bank profile and latest indicators (daily) + GDELT headlines for major economies (hourly)
 *   states.json     US states: BLS unemployment rate history and FEMA disaster declarations (daily)
 *   symbols.json    every US-listed stock and ETF (Nasdaq Trader), Coinbase crypto pairs, with first-seen dates for new listings (daily)
 *   ships.json      live AIS ship positions sampled from AISStream (only when AISSTREAM_API_KEY is set)
 * Each part keeps its last good snapshot (marked stale) when a source fails. Nothing is estimated.
 * Usage: node scripts/refresh-world-data.cjs <output-dir> [previous-dir] */
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

const HOUR = 3600000, DAY = 24 * HOUR;
const AGENT = 'Mozilla/5.0 (compatible; FYNXFinanceWorld/1.0; +https://www.fynxfinanceworld.com/terminal.html)';
const iso = ms => new Date(ms).toISOString();
const finite = v => typeof v === 'number' && Number.isFinite(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchText(url, {timeout = 30000, headers = {}, method = 'GET', body} = {}) {
  const res = await fetch(url, {method, body, signal: AbortSignal.timeout(timeout), headers: {'User-Agent': AGENT, Accept: '*/*', ...headers}});
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return res.text();
}
const fetchJSON = async (url, opts) => JSON.parse(await fetchText(url, opts));

/* --- Countries --------------------------------------------------------------- */
const INDICATORS = {gdp: 'NY.GDP.MKTP.CD', growth: 'NY.GDP.MKTP.KD.ZG', inflation: 'FP.CPI.TOTL.ZG', unemployment: 'SL.UEM.TOTL.ZS', population: 'SP.POP.TOTL', currentAccount: 'BN.CAB.XOKA.GD.ZS', debt: 'GC.DOD.TOTL.GD.ZS', exports: 'NE.EXP.GNFS.ZS', gdpPerCapita: 'NY.GDP.PCAP.CD'};
async function worldBank() {
  const meta = await fetchJSON('https://api.worldbank.org/v2/country?format=json&per_page=400');
  const countries = {};
  for (const c of meta[1] || []) {
    if (!c.iso2Code || c.region?.id === 'NA' || !/^[A-Z]{2}$/.test(c.iso2Code)) continue;
    countries[c.iso2Code] = {iso2: c.iso2Code, iso3: c.id, name: c.name, region: c.region?.value?.trim() || null, income: c.incomeLevel?.value || null, capital: c.capitalCity || null,
      lat: Number(c.latitude) || null, lon: Number(c.longitude) || null, data: {}};
  }
  for (const [key, code] of Object.entries(INDICATORS)) {
    try {
      const d = await fetchJSON(`https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&mrnev=1&per_page=400`);
      for (const row of d[1] || []) { const c = countries[row.country?.id]; if (c && finite(row.value)) c.data[key] = {value: Math.round(row.value * 1000) / 1000, year: Number(row.date)}; }
    } catch (e) { console.warn(`[world] World Bank ${key}: ${e.message}`); }
    await sleep(400);
  }
  return countries;
}
// Major economies get hourly headlines from GDELT (one request every 5+ seconds, as GDELT asks).
const NEWS = [['US', 'United States'], ['CN', 'China'], ['JP', 'Japan'], ['DE', 'Germany'], ['IN', 'India'], ['GB', 'United Kingdom'], ['FR', 'France'], ['IT', 'Italy'], ['BR', 'Brazil'], ['CA', 'Canada'],
  ['RU', 'Russia'], ['KR', 'South Korea'], ['AU', 'Australia'], ['MX', 'Mexico'], ['ES', 'Spain'], ['ID', 'Indonesia'], ['NL', 'Netherlands'], ['SA', 'Saudi Arabia'], ['TR', 'Turkey'], ['CH', 'Switzerland'],
  ['PL', 'Poland'], ['AR', 'Argentina'], ['SE', 'Sweden'], ['NO', 'Norway'], ['BE', 'Belgium'], ['IE', 'Ireland'], ['IL', 'Israel'], ['AE', 'United Arab Emirates'], ['ZA', 'South Africa'], ['EG', 'Egypt'],
  ['NG', 'Nigeria'], ['IR', 'Iran'], ['UA', 'Ukraine'], ['SG', 'Singapore'], ['HK', 'Hong Kong'], ['TW', 'Taiwan'], ['TH', 'Thailand'], ['VN', 'Vietnam'], ['MY', 'Malaysia'], ['PH', 'Philippines'],
  ['PK', 'Pakistan'], ['CL', 'Chile'], ['CO', 'Colombia'], ['PE', 'Peru'], ['VE', 'Venezuela'], ['NZ', 'New Zealand'], ['DK', 'Denmark'], ['AT', 'Austria'], ['GR', 'Greece'], ['PT', 'Portugal'],
  ['QA', 'Qatar'], ['KW', 'Kuwait'], ['IQ', 'Iraq'], ['KZ', 'Kazakhstan'], ['MA', 'Morocco'], ['KE', 'Kenya'], ['ET', 'Ethiopia'], ['BD', 'Bangladesh'], ['CZ', 'Czech Republic'], ['HU', 'Hungary']];
async function gdelt(name) {
  const q = `"${name}" (economy OR markets OR inflation OR government OR trade OR bank) sourcelang:english`;
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=15&timespan=24h&sort=hybridrel&format=json`;
  const text = await fetchText(url, {timeout: 20000});
  if (!text.trim().startsWith('{')) throw new Error(text.slice(0, 80));
  const d = JSON.parse(text), seen = new Set();
  return (d.articles || []).filter(a => /^https:\/\//.test(a.url || '') && a.title).map(a => {
    const t = String(a.seendate || '');
    const at = /^\d{8}T\d{6}Z$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z` : null;
    return {title: String(a.title).replace(/\s+/g, ' ').trim().slice(0, 240), url: a.url, source: String(a.domain || '').slice(0, 80), publishedAt: at};
  }).filter(a => { const k = a.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
}
async function countryNews(prev) {
  const out = {}; let ok = 0;
  for (const [code, name] of NEWS) {
    try { out[code] = {items: await gdelt(name), fetchedAt: iso(Date.now())}; ok++; }
    catch (e) { console.warn(`[world] GDELT ${code}: ${e.message}`); if (prev?.[code]) out[code] = {...prev[code], stale: true}; }
    await sleep(5600);
  }
  console.log(`[world] news for ${ok}/${NEWS.length} countries`);
  return out;
}

/* --- US states ----------------------------------------------------------------- */
const STATES = {'01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY'};
async function states(now) {
  const fips = Object.keys(STATES), out = {};
  for (const f of fips) out[STATES[f]] = {fips: f, unemployment: [], disasters: []};
  for (let i = 0; i < fips.length; i += 25) {
    const ids = fips.slice(i, i + 25).map(f => `LASST${f}0000000000003`);
    const d = await fetchJSON('https://api.bls.gov/publicAPI/v1/timeseries/data/', {method: 'POST', body: JSON.stringify({seriesid: ids}), headers: {'Content-Type': 'application/json'}});
    if (d.status !== 'REQUEST_SUCCEEDED') throw new Error('BLS: ' + (d.message || []).join(' '));
    for (const s of d.Results?.series || []) {
      const st = STATES[s.seriesID.slice(5, 7)]; if (!st) continue;
      out[st].unemployment = (s.data || []).filter(p => /^M\d\d$/.test(p.period) && p.period !== 'M13' && finite(Number(p.value))).map(p => ({date: `${p.year}-${p.period.slice(1)}`, value: Number(p.value)})).sort((a, b) => a.date.localeCompare(b.date)).slice(-24);
    }
    await sleep(1500);
  }
  try {
    const since = iso(now - 120 * DAY).slice(0, 10);
    const d = await fetchJSON(`https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=declarationDate%20ge%20'${since}T00:00:00.000Z'&$select=state,declarationDate,incidentType,declarationTitle,disasterNumber,declarationType&$orderby=declarationDate%20desc&$top=5000`);
    const seen = new Set();
    for (const r of d.DisasterDeclarationsSummaries || []) {
      const k = r.state + r.disasterNumber; if (seen.has(k) || !out[r.state]) continue; seen.add(k);
      out[r.state].disasters.push({number: r.disasterNumber, date: String(r.declarationDate).slice(0, 10), type: r.incidentType, title: String(r.declarationTitle || '').slice(0, 120), kind: r.declarationType});
    }
  } catch (e) { console.warn('[world] FEMA:', e.message); }
  return out;
}

/* --- Symbols (daily new-listing scan) ----------------------------------------------- */
function pipeTable(text) {
  const lines = text.trim().split(/\r?\n/), head = lines[0].split('|');
  return lines.slice(1).filter(l => !l.startsWith('File Creation Time')).map(l => Object.fromEntries(l.split('|').map((v, i) => [head[i], v])));
}
async function symbols(prev, now) {
  const today = iso(now).slice(0, 10), first = prev?.firstSeen || {}, base = !prev;
  const rows = [];
  const nasdaq = pipeTable(await fetchText('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt'));
  for (const r of nasdaq) if (r.Symbol && r['Test Issue'] === 'N') rows.push([r.Symbol.replace(/\./g, '-'), r['Security Name'].replace(/ - Common Stock$| Common Stock$/i, '').slice(0, 90), r.ETF === 'Y' ? 'ETF' : 'EQUITY', 'Nasdaq']);
  const other = pipeTable(await fetchText('https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt'));
  const EX = {A: 'NYSE American', N: 'NYSE', P: 'NYSE Arca', Z: 'Cboe BZX', V: 'IEX'};
  for (const r of other) if (r['ACT Symbol'] && r['Test Issue'] === 'N') rows.push([r['ACT Symbol'].replace(/\./g, '-').replace(/\$/g, '-P'), r['Security Name'].replace(/ Common Stock$/i, '').slice(0, 90), r.ETF === 'Y' ? 'ETF' : 'EQUITY', EX[r.Exchange] || r.Exchange]);
  try {
    const products = await fetchJSON('https://api.exchange.coinbase.com/products');
    for (const p of products) if (p.quote_currency === 'USD' && p.status === 'online' && !p.trading_disabled) rows.push([`${p.base_currency}-USD`, `${p.base_currency} / US dollar`, 'CRYPTOCURRENCY', 'Coinbase']);
  } catch (e) { console.warn('[world] Coinbase products:', e.message); }
  const seen = new Set(), list = [];
  for (const r of rows) { if (seen.has(r[0]) || !/^[A-Za-z0-9.\-=^&]{1,24}$/.test(r[0])) continue; seen.add(r[0]); list.push(r); }
  const firstSeen = {};
  for (const [s] of list) firstSeen[s] = first[s] || (base ? '2000-01-01' : today);
  const newest = list.filter(([s]) => firstSeen[s] >= iso(now - 30 * DAY).slice(0, 10)).map(([s, n, t, x]) => ({symbol: s, name: n, type: t, exchange: x, firstSeen: firstSeen[s]})).sort((a, b) => b.firstSeen.localeCompare(a.firstSeen)).slice(0, 300);
  if (list.length < 5000) throw new Error(`Only ${list.length} symbols; refusing to replace the directory.`);
  return {count: list.length, rows: list, newListings: newest, firstSeen};
}

/* --- Ships (AISStream) ----------------------------------------------------------------- */
const CHOKEPOINTS = {Hormuz: [[25.4, 55.4], [27.2, 57.5]], 'Bab-el-Mandeb': [[11.8, 42.6], [13.4, 44.2]], Suez: [[29.8, 32.2], [31.4, 32.7]], Panama: [[8.8, -80.1], [9.5, -79.4]], Gibraltar: [[35.7, -6.2], [36.3, -5.2]], Bosphorus: [[40.9, 28.9], [41.3, 29.2]], Malacca: [[1.0, 100.0], [4.5, 104.0]], 'Cape of Good Hope': [[-35.8, 17.5], [-33.5, 21.0]]};
async function ships(key, seconds = 75) {
  if (typeof WebSocket !== 'function') throw new Error('WebSocket is not available in this Node version.');
  const vessels = new Map(), types = new Map();
  await new Promise(resolve => {
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    const stop = setTimeout(() => { try { ws.close(); } catch {} resolve(); }, seconds * 1000);
    ws.onopen = () => ws.send(JSON.stringify({APIKey: key, BoundingBoxes: [[[-90, -180], [90, 180]]], FilterMessageTypes: ['PositionReport', 'ShipStaticData']}));
    ws.onerror = () => { clearTimeout(stop); resolve(); };
    ws.onclose = () => { clearTimeout(stop); resolve(); };
    ws.onmessage = async ev => {
      try {
        const m = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text()), meta = m.MetaData || {};
        if (m.error) { console.warn('[world] AIS:', m.error); return; }
        if (m.MessageType === 'ShipStaticData') { const s = m.Message?.ShipStaticData; if (s) types.set(meta.MMSI, {type: s.Type, destination: String(s.Destination || '').trim().slice(0, 30)}); return; }
        if (m.MessageType !== 'PositionReport' || !finite(meta.latitude) || !finite(meta.longitude)) return;
        const p = m.Message.PositionReport;
        vessels.set(meta.MMSI, {mmsi: meta.MMSI, name: String(meta.ShipName || '').trim().slice(0, 30), lat: Math.round(meta.latitude * 1e4) / 1e4, lon: Math.round(meta.longitude * 1e4) / 1e4, sog: finite(p.Sog) ? p.Sog : null, cog: finite(p.Cog) ? p.Cog : null, heading: finite(p.TrueHeading) && p.TrueHeading < 360 ? p.TrueHeading : null, at: String(meta.time_utc || '').slice(0, 19)});
      } catch {}
    };
  });
  const kind = t => t >= 80 && t <= 89 ? 'tanker' : t >= 70 && t <= 79 ? 'cargo' : t >= 60 && t <= 69 ? 'passenger' : t ? 'other' : 'unknown';
  const list = [...vessels.values()].map(v => ({...v, kind: kind(types.get(v.mmsi)?.type), destination: types.get(v.mmsi)?.destination || null}));
  if (!list.length) throw new Error('No AIS positions received.');
  const counts = Object.fromEntries(Object.entries(CHOKEPOINTS).map(([n, [[a, b], [c, d]]]) => { const inside = list.filter(v => v.lat >= a && v.lat <= c && v.lon >= b && v.lon <= d); return [n, {ships: inside.length, tankers: inside.filter(v => v.kind === 'tanker').length, cargo: inside.filter(v => v.kind === 'cargo').length}]; }));
  const ranked = list.sort((a, b) => (b.kind === 'tanker') - (a.kind === 'tanker') || (b.kind === 'cargo') - (a.kind === 'cargo'));
  return {sampleSeconds: seconds, total: list.length, chokepoints: CHOKEPOINTS, counts, vessels: ranked.slice(0, 8000)};
}

/* --- run ---------------------------------------------------------------------------- */
async function readJSON(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }
async function write(dir, name, value) { const t = path.join(dir, name); await fs.writeFile(t + '.tmp', JSON.stringify(value) + '\n'); await fs.rename(t + '.tmp', t); }
const fresh = (doc, ms) => doc?.generatedAt && Date.now() - Date.parse(doc.generatedAt) < ms;
async function main() {
  const [outDir, prevDir] = process.argv.slice(2);
  if (!outDir) throw new Error('Usage: refresh-world-data.cjs <output-dir> [previous-dir]');
  await fs.mkdir(outDir, {recursive: true});
  const now = Date.now(), prev = {};
  for (const f of ['countries', 'states', 'symbols', 'ships']) prev[f] = prevDir ? await readJSON(path.join(prevDir, f + '.json')) : null;
  const force = process.env.FORCE_DAILY === 'true';

  // Countries: profiles/indicators daily, news hourly.
  let countries = prev.countries?.countries || null, indicatorsAt = prev.countries?.indicatorsAt || null;
  if (force || !countries || !fresh({generatedAt: indicatorsAt}, 20 * HOUR)) {
    try { const wb = await worldBank(); for (const c of Object.values(wb)) c.news = countries?.[c.iso2]?.news; countries = wb; indicatorsAt = iso(now); console.log(`[world] World Bank: ${Object.keys(wb).length} economies`); }
    catch (e) { console.warn('[world] World Bank failed:', e.message); }
  }
  if (countries) {
    const news = await countryNews(Object.fromEntries(Object.entries(countries).map(([k, c]) => [k, c.news]).filter(([, v]) => v)));
    for (const [k, v] of Object.entries(news)) if (countries[k]) countries[k].news = v;
    await write(outDir, 'countries.json', {version: 1, generatedAt: iso(now), indicatorsAt, sources: {profile: 'World Bank Open Data (most recent value per indicator)', news: 'GDELT Project DOC 2.0 API (last 24 h)'}, countries});
  }

  if (force || !fresh(prev.states, 20 * HOUR)) {
    try { await write(outDir, 'states.json', {version: 1, generatedAt: iso(now), sources: {unemployment: 'U.S. Bureau of Labor Statistics, Local Area Unemployment Statistics (seasonally adjusted)', disasters: 'FEMA OpenFEMA disaster declarations (last 120 days)'}, states: await states(now)}); console.log('[world] states refreshed'); }
    catch (e) { console.warn('[world] states failed:', e.message); if (prev.states) await write(outDir, 'states.json', {...prev.states, stale: true}); }
  } else if (prev.states) await write(outDir, 'states.json', prev.states);

  if (force || !fresh(prev.symbols, 20 * HOUR)) {
    try { const s = await symbols(prev.symbols, now); await write(outDir, 'symbols.json', {version: 1, generatedAt: iso(now), source: 'Nasdaq Trader symbol directories (all US-listed securities) and Coinbase Exchange products', ...s}); console.log(`[world] symbols: ${s.count}, new in 30 days: ${s.newListings.length}`); }
    catch (e) { console.warn('[world] symbols failed:', e.message); if (prev.symbols) await write(outDir, 'symbols.json', {...prev.symbols, stale: true}); }
  } else if (prev.symbols) await write(outDir, 'symbols.json', prev.symbols);

  const key = process.env.AISSTREAM_API_KEY;
  if (key) {
    try { const s = await ships(key); await write(outDir, 'ships.json', {version: 1, generatedAt: iso(now), source: 'AISStream.io live AIS (terrestrial and satellite receivers; open-ocean coverage has gaps)', ...s}); console.log(`[world] ships: ${s.total}`, JSON.stringify(s.counts)); }
    catch (e) { console.warn('[world] ships failed:', e.message); if (prev.ships) await write(outDir, 'ships.json', {...prev.ships, stale: true}); }
  } else {
    await write(outDir, 'ships.json', {version: 1, generatedAt: iso(now), status: 'not-configured', message: 'Live ship tracking starts once the AISSTREAM_API_KEY repository secret is set.', chokepoints: CHOKEPOINTS, vessels: [], counts: {}});
  }
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = {pipeTable, STATES, CHOKEPOINTS, INDICATORS};
