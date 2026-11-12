#!/usr/bin/env node
'use strict';
/* FYNX Market Scanner publisher → scanner.json (terminal-data branch).
 *  stocks — every US-listed common stock from the Nasdaq screener (Nasdaq, NYSE, NYSE American):
 *           price, change, volume, market cap, sector, industry, country, IPO year, themes
 *  etfs   — every US-listed ETF from the Nasdaq ETF screener: price, change, 1-year change, themes
 *  crypto — top 500 coins from CoinGecko with 1h/24h/7d change, market cap, volume, distance from
 *           all-time high and CoinGecko categories (AI, memes, layer 1, DeFi …)
 * Themes are rule-based and transparent: a stock joins a theme by its exchange-reported industry,
 * a word in its registered company name, or a short curated list of well-known members.
 * Usage: node scripts/refresh-scanner.cjs <output-dir> [previous-dir] */
const fs = require('node:fs/promises'), path = require('node:path');
const NASDAQ = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/'};
const GECKO = {'User-Agent': 'FYNX-Terminal/1.0 (+https://www.fynxfinanceworld.com/terminal.html)', Accept: 'application/json'};

const THEMES = [
  {id: 'ai', label: 'Artificial intelligence', name: /\bAI\b|\.ai\b|Artificial Intelligence|Machine Learning|\bGenAI\b/i, tickers: 'NVDA AMD AVGO MSFT GOOGL GOOG META AMZN PLTR AI BBAI SOUN PATH SNOW CRWV NBIS SMCI ARM TSM MU MRVL ANET VRT DELL ORCL IBM TEM RXRX ALAB APP CRDO AMBA POET INOD AISP CXAI'},
  {id: 'semis', label: 'Semiconductors', industry: /Semiconductor/i, tickers: 'TSM ASML ARM NVDA AMD AVGO INTC QCOM MU TXN ADI MRVL NXPI ON MCHP LRCX AMAT KLAC SMCI'},
  {id: 'quantum', label: 'Quantum computing', name: /Quantum/i, tickers: 'IONQ RGTI QBTS QUBT ARQQ LAES'},
  {id: 'nuclear', label: 'Nuclear & uranium', name: /Nuclear|Uranium/i, tickers: 'CCJ OKLO SMR NNE LEU UEC UUUU DNN NXE BWXT CEG VST LTBR'},
  {id: 'ev', label: 'Electric vehicles & batteries', name: /Electric Vehicle|\bEV\b|Lithium|Battery|Batteries/i, tickers: 'TSLA RIVN LCID NIO XPEV LI PSNY CHPT BLNK EVGO QS ALB SLDP ENVX'},
  {id: 'crypto', label: 'Crypto & bitcoin stocks', name: /Bitcoin|Blockchain|Crypto|Digital Asset/i, tickers: 'COIN MSTR MARA RIOT CLSK HUT CIFR WULF BITF HIVE IREN CORZ GLXY HOOD BTDR BMNR SBET CRCL BLSH'},
  {id: 'cyber', label: 'Cybersecurity', name: /Cyber|Security Software/i, tickers: 'CRWD PANW FTNT ZS S OKTA NET CYBR TENB RPD QLYS CHKP VRNS'},
  {id: 'software', label: 'Software & cloud', industry: /Prepackaged Software|EDP Services|Computer Software/i},
  {id: 'biotech', label: 'Biotech', industry: /Biotechnology|Biological Products/i},
  {id: 'pharma', label: 'Pharmaceuticals', industry: /Pharmaceutical/i},
  {id: 'banks', label: 'Banks', industry: /Major Banks|Commercial Banks|Savings Institutions|Banks/i},
  {id: 'reits', label: 'REITs & real estate', industry: /Real Estate Investment Trust|Real Estate/i},
  {id: 'oilgas', label: 'Oil & gas', industry: /Oil & Gas|Integrated oil|Oil Refining|Oilfield|Petroleum/i},
  {id: 'miners', label: 'Gold, silver & metals miners', industry: /Precious Metals|Metal Mining|Mining/i, name: /Gold|Silver|Mining/i},
  {id: 'defense', label: 'Aerospace & defense', industry: /Aerospace|Military|Ordnance/i, tickers: 'LMT RTX NOC GD LHX HII KTOS AVAV BA'},
  {id: 'space', label: 'Space', name: /\bSpace|Rocket|Satellite|Orbital|Lunar/i, tickers: 'RKLB ASTS LUNR RDW SPCE PL BKSY SATS IRDM FLY'},
  {id: 'clean', label: 'Solar, hydrogen & clean energy', name: /Solar|Renewable|Clean Energy|Hydrogen|Fuel Cell|Wind/i, tickers: 'FSLR ENPH SEDG RUN NXT ARRY PLUG BE FCEL'},
  {id: 'robotics', label: 'Robotics & drones', name: /Robot|Automation|Autonomous|Drone/i, tickers: 'ISRG SYM TER SERV RR PDYN UMAC'},
  {id: 'cannabis', label: 'Cannabis', name: /Cannabis|Hemp|Marijuana/i, tickers: 'TLRY CGC SNDL ACB CRON'},
  {id: 'china', label: 'China & Hong Kong listings', country: /^(China|Hong Kong)$/},
  {id: 'spac', label: 'SPACs (blank-check)', name: /Acquisition Corp|Acquisition Company|Acquisition Ltd|SPAC/i}
].map(t => ({...t, set: new Set((t.tickers || '').split(/\s+/).filter(Boolean))}));

const ETF_THEMES = [
  ['ai', /Artificial Intelligence|\bAI\b|Robotics|Machine Learning/i], ['semis', /Semiconductor/i], ['crypto', /Bitcoin|Ether|Crypto|Blockchain|Digital Asset|Solana|XRP/i],
  ['nuclear', /Uranium|Nuclear/i], ['clean', /Clean Energy|Solar|Renewable|Hydrogen|Wind/i], ['ev', /Electric Vehicle|Lithium|Battery/i], ['cyber', /Cyber/i],
  ['gold', /Gold|Silver|Precious/i], ['oil', /Oil|Energy/i], ['bonds', /Treasury|Bond|Fixed Income|Municipal|Credit/i], ['dividend', /Dividend|Income/i],
  ['leveraged', /\b[23]X\b|Ultra|Leveraged|Daily Bull|Daily Bear|Inverse|Short/i], ['international', /International|Emerging|Europe|Japan|China|India|Developed/i], ['covered', /Covered Call|Option Income|Premium Income|Buffer/i]
];
const GECKO_CATS = [['ai', 'artificial-intelligence'], ['meme', 'meme-token'], ['l1', 'layer-1'], ['l2', 'layer-2'], ['defi', 'decentralized-finance-defi'], ['rwa', 'real-world-assets-rwa'], ['gaming', 'gaming'], ['solana', 'solana-ecosystem'], ['depin', 'depin'], ['stable', 'stablecoins']];

const num = v => { const n = Number(String(v ?? '').replace(/[$,%\s]/g, '')); return Number.isFinite(n) ? n : null; };
const readJSON = async f => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return null; } };
async function getJSON(url, headers, timeout = 45000) {
  const res = await fetch(url, {headers, signal: AbortSignal.timeout(timeout)});
  if (!res.ok) throw new Error(`HTTP ${res.status} ${new URL(url).hostname}${new URL(url).pathname}`);
  return res.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function cleanName(n) {
  return String(n || '').replace(/\s+/g, ' ').trim().replace(/\s+(Common Stock|Ordinary Shares?|Class [A-Z](?: Common Stock| Ordinary Shares?)?|American Depositary Shares?.*|ADS.*|Common Shares?|Depositary Shares?.*)$/i, '').replace(/\s+(Common Stock|Ordinary Shares?)$/i, '').slice(0, 70);
}

async function stocks() {
  const d = await getJSON('https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true', NASDAQ);
  const rows = d?.data?.rows || [], out = [];
  for (const r of rows) {
    const sym = String(r.symbol || '').trim();
    // Common stock only: no warrants, units, rights or preferred classes.
    if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(sym) || /\b(Warrants?|Units?|Rights?|Preferred|Depositary Shares? Representing|Notes due|Debentures)\b/i.test(r.name)) continue;
    const price = num(r.lastsale); if (!price) continue;
    const name = cleanName(r.name), industry = String(r.industry || '').trim(), country = String(r.country || '').trim();
    const themes = THEMES.filter(t => t.set.has(sym) || (t.name && t.name.test(r.name)) || (t.industry && t.industry.test(industry)) || (t.country && t.country.test(country))).map(t => t.id);
    out.push([sym, name, price, num(r.pctchange), num(r.volume), num(r.marketCap) || null, r.sector || '', industry, country, num(r.ipoyear) || null, themes]);
  }
  if (out.length < 3000) throw new Error('Nasdaq screener returned too few stocks: ' + out.length);
  return {asOf: new Date().toISOString(), fields: ['symbol', 'name', 'price', 'changePct', 'volume', 'marketCap', 'sector', 'industry', 'country', 'ipoYear', 'themes'], rows: out};
}
async function etfs() {
  const d = await getJSON('https://api.nasdaq.com/api/screener/etf?tableonly=true&download=true', NASDAQ);
  const rows = d?.data?.data?.rows || d?.data?.rows || [], out = [];
  for (const r of rows) {
    const sym = String(r.symbol || '').trim(), price = num(r.lastSalePrice); if (!/^[A-Z]{1,5}$/.test(sym) || !price) continue;
    const name = String(r.companyName || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    out.push([sym, name, price, num(r.percentageChange), num(r.oneYearPercentage), ETF_THEMES.filter(([, re]) => re.test(name)).map(([id]) => id)]);
  }
  if (out.length < 500) throw new Error('Nasdaq ETF screener returned too few funds: ' + out.length);
  return {asOf: d?.data?.dataAsOf ? new Date(d.data.dataAsOf + ' GMT-0500').toISOString() : new Date().toISOString(), fields: ['symbol', 'name', 'price', 'changePct', 'oneYearPct', 'themes'], rows: out};
}
async function crypto(prevCats) {
  const coins = [];
  for (const page of [1, 2]) { coins.push(...await getJSON(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&price_change_percentage=1h,24h,7d`, GECKO)); await sleep(2500); }
  // Category membership changes slowly. CoinGecko's free tier allows a few calls a minute, so each run
  // refreshes at most three categories older than 6 hours, spaced out, and keeps the rest.
  const cats = {asOf: new Date().toISOString(), members: {...(prevCats?.members || {})}, updated: {...(prevCats?.updated || {})}};
  const due = GECKO_CATS.filter(([id]) => !cats.members[id] || Date.now() - Date.parse(cats.updated[id] || 0) > 6 * 3600000).slice(0, 3);
  for (const [id, slug] of due) {
    await sleep(13000);
    try { cats.members[id] = (await getJSON(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&category=${slug}`, GECKO)).map(c => c.id); cats.updated[id] = new Date().toISOString(); }
    catch (e) { console.warn('[scanner] category', slug, e.message); }
  }
  const inCat = id => Object.entries(cats.members).filter(([, ids]) => ids.includes(id)).map(([k]) => k);
  const rows = coins.filter(c => c && c.current_price > 0).map(c => [c.id, String(c.symbol || '').toUpperCase(), String(c.name || '').slice(0, 50), c.current_price, num(c.price_change_percentage_1h_in_currency), num(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h), num(c.price_change_percentage_7d_in_currency), num(c.market_cap), num(c.total_volume), c.market_cap_rank || null, num(c.ath_change_percentage), inCat(c.id)]);
  if (rows.length < 200) throw new Error('CoinGecko returned too few coins: ' + rows.length);
  return {asOf: new Date().toISOString(), fields: ['id', 'symbol', 'name', 'price', 'change1h', 'change24h', 'change7d', 'marketCap', 'volume', 'rank', 'fromATH', 'categories'], rows, categories: cats};
}

async function main() {
  const [outDir, prevDir] = process.argv.slice(2);
  if (!outDir) throw new Error('Usage: refresh-scanner.cjs <output-dir> [previous-dir]');
  await fs.mkdir(outDir, {recursive: true});
  const prev = prevDir ? await readJSON(path.join(prevDir, 'scanner.json')) : null, now = Date.now();
  const out = {version: 1, generatedAt: new Date(now).toISOString(),
    sources: {stocks: 'Nasdaq stock screener (Nasdaq, NYSE, NYSE American listings; delayed)', etfs: 'Nasdaq ETF screener (delayed)', crypto: 'CoinGecko market data'},
    themes: THEMES.map(t => ({id: t.id, label: t.label, rule: [t.industry ? 'industry' : '', t.name ? 'company name' : '', t.set.size ? 'curated members' : '', t.country ? 'country' : ''].filter(Boolean).join(' + ')})),
    etfThemes: ETF_THEMES.map(([id]) => id), cryptoCategories: GECKO_CATS.map(([id, slug]) => ({id, slug}))};
  for (const [key, fn, maxAge] of [['stocks', stocks, 0], ['etfs', etfs, 0], ['crypto', () => crypto(prev?.crypto?.categories), 25 * 60000]]) {
    if (maxAge && prev?.[key] && now - Date.parse(prev[key].asOf) < maxAge) { out[key] = prev[key]; continue; }
    try { out[key] = await fn(); console.log('[scanner]', key, out[key].rows.length); }
    catch (e) { console.warn('[scanner]', key, 'failed:', e.message); if (prev?.[key]) out[key] = {...prev[key], stale: true}; }
  }
  if (!out.stocks && !out.crypto) throw new Error('No scanner data');
  await fs.writeFile(path.join(outDir, 'scanner.json'), JSON.stringify(out) + '\n');
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = {THEMES, ETF_THEMES, cleanName};
