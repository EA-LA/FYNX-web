#!/usr/bin/env node
/* FYNX Terminal desk publisher. Writes three public snapshots for the terminal desks:
 *   markets.json  delayed quotes + 6-month daily closes for futures, indices, volatility, funds, FX, crypto and stocks (Yahoo Finance chart endpoint)
 *   options.json  delayed option-chain summaries from Cboe (put/call, implied volatility, expected move, max pain, most active)
 *   earnings.json upcoming large-company earnings dates (Nasdaq earnings calendar)
 * Every value keeps its source and time. A provider that fails keeps its last snapshot, marked stale. Nothing is estimated.
 * Usage: node scripts/refresh-terminal-markets.cjs <output-dir> [previous-dir] */
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

const DAY = 86400000;
const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const iso = ms => new Date(ms).toISOString();
const finite = v => typeof v === 'number' && Number.isFinite(v);
const round = (v, d = 4) => finite(v) ? Math.round(v * 10 ** d) / 10 ** d : null;

/* [symbol, name, group, desks] — groups drive the terminal tables. */
const UNIVERSE = [
  // Futures (front month, CME/CBOT/NYMEX/COMEX/ICE via Yahoo)
  ['ES=F', 'E-mini S&P 500', 'Equity futures'], ['NQ=F', 'E-mini Nasdaq 100', 'Equity futures'], ['YM=F', 'E-mini Dow', 'Equity futures'], ['RTY=F', 'E-mini Russell 2000', 'Equity futures'],
  ['ZT=F', '2-Year T-Note', 'Rate futures'], ['ZF=F', '5-Year T-Note', 'Rate futures'], ['ZN=F', '10-Year T-Note', 'Rate futures'], ['ZB=F', '30-Year T-Bond', 'Rate futures'],
  ['CL=F', 'WTI crude oil', 'Energy'], ['BZ=F', 'Brent crude oil', 'Energy'], ['NG=F', 'Natural gas', 'Energy'], ['RB=F', 'RBOB gasoline', 'Energy'], ['HO=F', 'Heating oil', 'Energy'],
  ['GC=F', 'Gold', 'Metals'], ['SI=F', 'Silver', 'Metals'], ['HG=F', 'Copper', 'Metals'], ['PL=F', 'Platinum', 'Metals'], ['PA=F', 'Palladium', 'Metals'],
  ['ZC=F', 'Corn', 'Agriculture'], ['ZW=F', 'Wheat', 'Agriculture'], ['ZS=F', 'Soybeans', 'Agriculture'], ['KC=F', 'Coffee', 'Agriculture'], ['SB=F', 'Sugar', 'Agriculture'], ['CC=F', 'Cocoa', 'Agriculture'], ['LE=F', 'Live cattle', 'Agriculture'],
  ['6E=F', 'Euro FX', 'Currency futures'], ['6J=F', 'Japanese yen', 'Currency futures'], ['6B=F', 'British pound', 'Currency futures'], ['BTC=F', 'CME Bitcoin', 'Currency futures'],
  // Cash indices
  ['^GSPC', 'S&P 500', 'Americas'], ['^DJI', 'Dow Jones', 'Americas'], ['^IXIC', 'Nasdaq Composite', 'Americas'], ['^NDX', 'Nasdaq 100', 'Americas'], ['^RUT', 'Russell 2000', 'Americas'], ['^GSPTSE', 'S&P/TSX', 'Americas'], ['^BVSP', 'Bovespa', 'Americas'],
  ['^FTSE', 'FTSE 100', 'Europe'], ['^GDAXI', 'DAX', 'Europe'], ['^FCHI', 'CAC 40', 'Europe'], ['^STOXX50E', 'Euro Stoxx 50', 'Europe'],
  ['^N225', 'Nikkei 225', 'Asia-Pacific'], ['^HSI', 'Hang Seng', 'Asia-Pacific'], ['000001.SS', 'Shanghai Composite', 'Asia-Pacific'], ['^AXJO', 'ASX 200', 'Asia-Pacific'], ['^KS11', 'KOSPI', 'Asia-Pacific'], ['^NSEI', 'Nifty 50', 'Asia-Pacific'],
  ['DX-Y.NYB', 'US Dollar Index', 'Dollar'],
  // Volatility indices
  ['^VIX9D', 'VIX 9-day', 'Volatility'], ['^VIX', 'VIX 30-day', 'Volatility'], ['^VIX3M', 'VIX 3-month', 'Volatility'], ['^VIX6M', 'VIX 6-month', 'Volatility'], ['^VVIX', 'VIX of VIX', 'Volatility'], ['^VXN', 'Nasdaq 100 volatility', 'Volatility'], ['^OVX', 'Oil volatility', 'Volatility'], ['^GVZ', 'Gold volatility', 'Volatility'], ['^MOVE', 'Treasury volatility (MOVE)', 'Volatility'],
  // Treasury yields (Cboe indices)
  ['^IRX', 'US 13-week yield', 'Yields'], ['^FVX', 'US 5-year yield', 'Yields'], ['^TNX', 'US 10-year yield', 'Yields'], ['^TYX', 'US 30-year yield', 'Yields'],
  // Funds
  ['SPY', 'SPDR S&P 500', 'Equity funds'], ['VOO', 'Vanguard S&P 500', 'Equity funds'], ['QQQ', 'Invesco QQQ', 'Equity funds'], ['IWM', 'iShares Russell 2000', 'Equity funds'], ['DIA', 'SPDR Dow Jones', 'Equity funds'], ['VTI', 'Vanguard Total Market', 'Equity funds'], ['SCHD', 'Schwab US Dividend', 'Equity funds'], ['ARKK', 'ARK Innovation', 'Equity funds'], ['SMH', 'VanEck Semiconductors', 'Equity funds'],
  ['EFA', 'iShares MSCI EAFE', 'International funds'], ['VEA', 'Vanguard Developed Markets', 'International funds'], ['VWO', 'Vanguard Emerging Markets', 'International funds'],
  ['XLK', 'Technology', 'Sector funds'], ['XLF', 'Financials', 'Sector funds'], ['XLE', 'Energy', 'Sector funds'], ['XLV', 'Health care', 'Sector funds'], ['XLY', 'Consumer discretionary', 'Sector funds'], ['XLP', 'Consumer staples', 'Sector funds'], ['XLI', 'Industrials', 'Sector funds'], ['XLU', 'Utilities', 'Sector funds'], ['XLB', 'Materials', 'Sector funds'], ['XLRE', 'Real estate', 'Sector funds'], ['XLC', 'Communication services', 'Sector funds'],
  ['SOXX', 'Semiconductors', 'Thematic funds'], ['IGV', 'Software', 'Thematic funds'], ['CIBR', 'Cybersecurity', 'Thematic funds'], ['SKYY', 'Cloud computing', 'Thematic funds'], ['BOTZ', 'Robotics & AI', 'Thematic funds'], ['ICLN', 'Clean energy', 'Thematic funds'], ['TAN', 'Solar', 'Thematic funds'], ['LIT', 'Lithium & batteries', 'Thematic funds'],
  ['URA', 'Uranium', 'Thematic funds'], ['XBI', 'Biotech', 'Thematic funds'], ['ITA', 'Aerospace & defense', 'Thematic funds'], ['JETS', 'Airlines', 'Thematic funds'], ['KRE', 'Regional banks', 'Thematic funds'], ['ITB', 'Homebuilders', 'Thematic funds'], ['COPX', 'Copper miners', 'Thematic funds'], ['PAVE', 'US infrastructure', 'Thematic funds'],
  ['RSP', 'S&P 500 equal weight', 'Factor funds'], ['MTUM', 'Momentum factor', 'Factor funds'], ['QUAL', 'Quality factor', 'Factor funds'], ['USMV', 'Minimum volatility', 'Factor funds'], ['VLUE', 'Value factor', 'Factor funds'], ['IJH', 'S&P MidCap 400', 'Factor funds'], ['IJR', 'S&P SmallCap 600', 'Factor funds'],
  ['TLT', 'iShares 20+ Year Treasury', 'Bond funds'], ['IEF', 'iShares 7-10 Year Treasury', 'Bond funds'], ['SHY', 'iShares 1-3 Year Treasury', 'Bond funds'], ['AGG', 'iShares Core US Aggregate', 'Bond funds'], ['BND', 'Vanguard Total Bond', 'Bond funds'], ['LQD', 'iShares Investment Grade', 'Bond funds'], ['HYG', 'iShares High Yield', 'Bond funds'], ['TIP', 'iShares TIPS', 'Bond funds'],
  ['GLD', 'SPDR Gold', 'Commodity funds'], ['SLV', 'iShares Silver', 'Commodity funds'], ['GDX', 'VanEck Gold Miners', 'Commodity funds'], ['USO', 'United States Oil', 'Commodity funds'], ['UNG', 'United States Natural Gas', 'Commodity funds'], ['DBA', 'Invesco Agriculture', 'Commodity funds'], ['IBIT', 'iShares Bitcoin Trust', 'Commodity funds'], ['VNQ', 'Vanguard Real Estate', 'Commodity funds'],
  // FX
  ['EURUSD=X', 'EUR/USD', 'FX majors'], ['GBPUSD=X', 'GBP/USD', 'FX majors'], ['JPY=X', 'USD/JPY', 'FX majors'], ['AUDUSD=X', 'AUD/USD', 'FX majors'], ['CAD=X', 'USD/CAD', 'FX majors'], ['CHF=X', 'USD/CHF', 'FX majors'], ['NZDUSD=X', 'NZD/USD', 'FX majors'],
  ['EURGBP=X', 'EUR/GBP', 'FX crosses'], ['EURJPY=X', 'EUR/JPY', 'FX crosses'], ['GBPJPY=X', 'GBP/JPY', 'FX crosses'], ['AUDJPY=X', 'AUD/JPY', 'FX crosses'], ['EURCHF=X', 'EUR/CHF', 'FX crosses'],
  ['CNY=X', 'USD/CNY', 'FX emerging'], ['MXN=X', 'USD/MXN', 'FX emerging'], ['INR=X', 'USD/INR', 'FX emerging'], ['ZAR=X', 'USD/ZAR', 'FX emerging'], ['TRY=X', 'USD/TRY', 'FX emerging'], ['BRL=X', 'USD/BRL', 'FX emerging'],
  // Crypto
  ['BTC-USD', 'Bitcoin', 'Crypto'], ['ETH-USD', 'Ethereum', 'Crypto'], ['SOL-USD', 'Solana', 'Crypto'], ['XRP-USD', 'XRP', 'Crypto'], ['BNB-USD', 'BNB', 'Crypto'], ['DOGE-USD', 'Dogecoin', 'Crypto'], ['ADA-USD', 'Cardano', 'Crypto'], ['AVAX-USD', 'Avalanche', 'Crypto'], ['LINK-USD', 'Chainlink', 'Crypto'], ['LTC-USD', 'Litecoin', 'Crypto'],
  // Stocks
  ['AAPL', 'Apple', 'Stocks'], ['MSFT', 'Microsoft', 'Stocks'], ['NVDA', 'NVIDIA', 'Stocks'], ['AMZN', 'Amazon', 'Stocks'], ['GOOGL', 'Alphabet', 'Stocks'], ['META', 'Meta', 'Stocks'], ['TSLA', 'Tesla', 'Stocks'], ['AVGO', 'Broadcom', 'Stocks'], ['BRK-B', 'Berkshire Hathaway', 'Stocks'], ['JPM', 'JPMorgan', 'Stocks'],
  ['V', 'Visa', 'Stocks'], ['MA', 'Mastercard', 'Stocks'], ['LLY', 'Eli Lilly', 'Stocks'], ['UNH', 'UnitedHealth', 'Stocks'], ['WMT', 'Walmart', 'Stocks'], ['COST', 'Costco', 'Stocks'], ['HD', 'Home Depot', 'Stocks'], ['PG', 'Procter & Gamble', 'Stocks'], ['JNJ', 'Johnson & Johnson', 'Stocks'], ['XOM', 'Exxon Mobil', 'Stocks'],
  ['CVX', 'Chevron', 'Stocks'], ['ORCL', 'Oracle', 'Stocks'], ['CRM', 'Salesforce', 'Stocks'], ['NFLX', 'Netflix', 'Stocks'], ['AMD', 'AMD', 'Stocks'], ['INTC', 'Intel', 'Stocks'], ['PLTR', 'Palantir', 'Stocks'], ['DIS', 'Disney', 'Stocks'], ['KO', 'Coca-Cola', 'Stocks'], ['BAC', 'Bank of America', 'Stocks']
];
const OPTION_UNDERLYINGS = ['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AMD', 'GLD', 'SLV', 'TLT', 'HYG', 'XLF', 'USO'];

async function fetchText(url, {timeout = 25000, maxBytes = 12e6, headers = {}} = {}) {
  const response = await fetch(url, {signal: AbortSignal.timeout(timeout), redirect: 'follow', headers: {'User-Agent': AGENT, Accept: '*/*', ...headers}});
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  const text = await response.text();
  if (text.length > maxBytes) throw new Error(`Response from ${new URL(url).hostname} is too large`);
  return text;
}
const fetchJSON = async (url, options) => JSON.parse(await fetchText(url, options));
async function pool(items, size, task) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({length: Math.min(size, items.length)}, async () => { while (next < items.length) { const i = next++; try { out[i] = {ok: true, value: await task(items[i], i)}; } catch (error) { out[i] = {ok: false, error}; } } }));
  return out;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* --- Quotes and daily history ---------------------------------------------- */
function parseChart(symbol, data, now) {
  const r = data?.chart?.result?.[0], m = r?.meta;
  if (!m || String(m.symbol).toUpperCase() !== symbol.toUpperCase() || !finite(m.regularMarketPrice) || !finite(m.regularMarketTime)) throw new Error(`No valid quote for ${symbol}`);
  const ts = r.timestamp || [], closes = r.indicators?.quote?.[0]?.close || [], gmt = m.gmtoffset || 0;
  const rows = [];
  ts.forEach((t, i) => { const c = closes[i]; if (finite(c) && c > 0) { const date = iso((t + gmt) * 1000).slice(0, 10); if (rows.length && rows.at(-1)[0] === date) rows[rows.length - 1] = [date, round(c, 6)]; else rows.push([date, round(c, 6)]); } });
  if (rows.length < 2) throw new Error(`Too little history for ${symbol}`);
  const marketDate = iso((m.regularMarketTime + gmt) * 1000).slice(0, 10), price = m.regularMarketPrice;
  // Previous close: the last completed session before the quote's session.
  const prior = rows.filter(([d]) => d < marketDate), previousClose = prior.length ? prior.at(-1)[1] : null;
  if (rows.at(-1)[0] !== marketDate) rows.push([marketDate, round(price, 6)]); else rows[rows.length - 1] = [marketDate, round(price, 6)];
  const rets = []; for (let i = Math.max(1, rows.length - 21); i < rows.length - 1; i++) rets.push(Math.log(rows[i][1] / rows[i - 1][1]) * 100);
  const mean = rets.reduce((s, v) => s + v, 0) / (rets.length || 1), vol20 = rets.length > 5 ? Math.sqrt(rets.reduce((s, v) => s + (v - mean) ** 2, 0) / (rets.length - 1)) : null;
  const yr = rows.slice(-252).map(r => r[1]);
  return {
    price: round(price, 6), previousClose, changePercent: finite(previousClose) && previousClose ? round((price / previousClose - 1) * 100, 3) : null,
    dayHigh: round(m.regularMarketDayHigh, 6), dayLow: round(m.regularMarketDayLow, 6), volume: finite(m.regularMarketVolume) ? m.regularMarketVolume : null,
    high52: round(finite(m.fiftyTwoWeekHigh) ? m.fiftyTwoWeekHigh : Math.max(...yr), 6), low52: round(finite(m.fiftyTwoWeekLow) ? m.fiftyTwoWeekLow : Math.min(...yr), 6),
    vol20: round(vol20, 3), currency: m.currency || null, exchange: m.fullExchangeName || m.exchangeName || null,
    asOf: iso(m.regularMarketTime * 1000), stale: m.regularMarketTime * 1000 < now - 4 * DAY, history: rows.slice(-260)
  };
}
async function yahoo(symbol, now, attempt = 0) {
  const host = attempt % 2 ? 'query2' : 'query1';
  try { return parseChart(symbol, await fetchJSON(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&includePrePost=false`, {timeout: 15000}), now); }
  catch (error) { if (attempt < 2 && /HTTP (429|5\d\d)|fetch failed|timeout/i.test(error.message)) { await sleep(1500 * (attempt + 1)); return yahoo(symbol, now, attempt + 1); } throw error; }
}
async function fetchMarkets(previous, now) {
  const prevQuotes = previous?.quotes || {};
  const results = await pool(UNIVERSE, 5, ([symbol]) => yahoo(symbol, now));
  const quotes = {}; let fresh = 0;
  UNIVERSE.forEach(([symbol, name, group], i) => {
    const r = results[i];
    if (r.ok) { quotes[symbol] = {symbol, name, group, ...r.value, status: 'fresh'}; fresh++; }
    else { console.warn(`[terminal-markets] ${symbol}: ${r.error.message}`); if (prevQuotes[symbol]) quotes[symbol] = {...prevQuotes[symbol], name, group, status: 'stale'}; }
  });
  if (!fresh) throw new Error('No market quotes were fetched.');
  return {quotes, fresh, total: UNIVERSE.length};
}

/* --- Options (Cboe delayed quotes) ------------------------------------------- */
function parseOCC(code) {
  const m = /^([A-Z.]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(code);
  if (!m) return null;
  return {root: m[1], expiry: `20${m[2]}-${m[3]}-${m[4]}`, type: m[5], strike: Number(m[6]) / 1000};
}
const mid = o => finite(o.bid) && finite(o.ask) && o.ask > 0 && o.ask >= o.bid ? (o.bid + o.ask) / 2 : finite(o.last_trade_price) && o.last_trade_price > 0 ? o.last_trade_price : null;
function summarizeOptions(symbol, payload, now) {
  const d = payload?.data, spot = d?.current_price ?? d?.close;
  if (!d || !finite(spot) || !Array.isArray(d.options)) throw new Error(`No option data for ${symbol}`);
  const today = iso(now).slice(0, 10);
  const contracts = d.options.map(o => ({...parseOCC(o.option), raw: o})).filter(o => o.expiry && o.expiry >= today);
  if (!contracts.length) throw new Error(`No live contracts for ${symbol}`);
  let callVol = 0, putVol = 0, callOI = 0, putOI = 0;
  const byExp = new Map();
  for (const c of contracts) {
    const v = finite(c.raw.volume) ? c.raw.volume : 0, oi = finite(c.raw.open_interest) ? c.raw.open_interest : 0;
    if (c.type === 'C') { callVol += v; callOI += oi; } else { putVol += v; putOI += oi; }
    if (!byExp.has(c.expiry)) byExp.set(c.expiry, []);
    byExp.get(c.expiry).push(c);
  }
  const dte = date => Math.max(0, Math.round((Date.parse(date + 'T21:00:00Z') - now) / DAY));
  const expiries = [...byExp.keys()].sort();
  const summary = expiries.slice(0, 10).map(date => {
    const list = byExp.get(date), strikes = [...new Set(list.map(c => c.strike))].sort((a, b) => a - b);
    const atm = strikes.reduce((best, k) => Math.abs(k - spot) < Math.abs(best - spot) ? k : best, strikes[0]);
    const call = list.find(c => c.type === 'C' && c.strike === atm), put = list.find(c => c.type === 'P' && c.strike === atm);
    const cm = call ? mid(call.raw) : null, pm = put ? mid(put.raw) : null, straddle = finite(cm) && finite(pm) ? cm + pm : null;
    const ivs = [call?.raw.iv, put?.raw.iv].filter(v => finite(v) && v > 0 && v < 5);
    let pain = null, painValue = Infinity;
    for (const k of strikes) { let paid = 0; for (const c of list) { const oi = c.raw.open_interest || 0; if (!oi) continue; paid += c.type === 'C' ? Math.max(0, k - c.strike) * oi : Math.max(0, c.strike - k) * oi; } if (paid < painValue) { painValue = paid; pain = k; } }
    const cv = list.filter(c => c.type === 'C').reduce((s, c) => s + (c.raw.volume || 0), 0), pv = list.filter(c => c.type === 'P').reduce((s, c) => s + (c.raw.volume || 0), 0);
    const coi = list.filter(c => c.type === 'C').reduce((s, c) => s + (c.raw.open_interest || 0), 0), poi = list.filter(c => c.type === 'P').reduce((s, c) => s + (c.raw.open_interest || 0), 0);
    // 25-delta skew: put IV at delta ≈ −0.25 minus call IV at delta ≈ +0.25.
    const near = (type, target) => list.filter(c => c.type === type && finite(c.raw.delta) && finite(c.raw.iv) && c.raw.iv > 0).sort((a, b) => Math.abs(a.raw.delta - target) - Math.abs(b.raw.delta - target))[0];
    const p25 = near('P', -0.25), c25 = near('C', 0.25);
    const ai = strikes.indexOf(atm), window = strikes.slice(Math.max(0, ai - 10), ai + 11);
    const row = c => c ? {bid: round(c.raw.bid, 3), ask: round(c.raw.ask, 3), last: round(c.raw.last_trade_price, 3), iv: round(c.raw.iv, 4), delta: round(c.raw.delta, 3), volume: c.raw.volume || 0, oi: c.raw.open_interest || 0} : null;
    const chain = window.map(k => ({strike: k, call: row(list.find(c => c.type === 'C' && c.strike === k)), put: row(list.find(c => c.type === 'P' && c.strike === k))}));
    return {date, dte: dte(date), atmStrike: atm, atmIV: ivs.length ? round(ivs.reduce((s, v) => s + v, 0) / ivs.length, 4) : null, straddle: round(straddle, 3), movePercent: finite(straddle) ? round(straddle / spot * 100, 2) : null,
      maxPain: pain, callVolume: cv, putVolume: pv, callOI: coi, putOI: poi, skew25: p25 && c25 ? round(p25.raw.iv - c25.raw.iv, 4) : null, chain};
  });
  const active = contracts.filter(c => (c.raw.volume || 0) > 0).sort((a, b) => b.raw.volume - a.raw.volume).slice(0, 15)
    .map(c => ({contract: c.raw.option, type: c.type, strike: c.strike, expiry: c.expiry, last: round(c.raw.last_trade_price, 3), bid: round(c.raw.bid, 3), ask: round(c.raw.ask, 3), iv: round(c.raw.iv, 4), delta: round(c.raw.delta, 3), volume: c.raw.volume, oi: c.raw.open_interest || 0}));
  return {symbol, price: round(spot, 4), change: round(d.price_change, 4), changePercent: round(d.price_change_percent, 3), iv30: round(d.iv30, 3), iv30Change: round(d.iv30_change, 3),
    callVolume: callVol, putVolume: putVol, putCallVolume: callVol ? round(putVol / callVol, 3) : null, callOI, putOI, putCallOI: callOI ? round(putOI / callOI, 3) : null,
    asOf: payload.timestamp ? new Date(String(payload.timestamp).replace(' ', 'T') + (/[zZ+]/.test(String(payload.timestamp)) ? '' : 'Z')).toISOString() : iso(now), expiries: summary, mostActive: active, contracts: contracts.length};
}
async function fetchOptions(previous, now) {
  const prev = previous?.underlyings || {}, out = {}; let fresh = 0;
  const results = await pool(OPTION_UNDERLYINGS, 3, symbol => fetchJSON(`https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`, {timeout: 45000, maxBytes: 8e7, headers: {Accept: 'application/json'}}).then(p => summarizeOptions(symbol, p, now)));
  OPTION_UNDERLYINGS.forEach((symbol, i) => {
    const r = results[i];
    if (r.ok) { out[symbol] = {...r.value, status: 'fresh'}; fresh++; }
    else { console.warn(`[terminal-options] ${symbol}: ${r.error.message}`); if (prev[symbol]) out[symbol] = {...prev[symbol], status: 'stale'}; }
  });
  if (!fresh) throw new Error('No option chains were fetched.');
  return {underlyings: out, fresh, total: OPTION_UNDERLYINGS.length};
}

/* --- Earnings calendar (Nasdaq) ------------------------------------------------ */
const money = s => { const v = Number(String(s || '').replace(/[$,]/g, '')); return finite(v) && String(s || '').trim() !== '' ? v : null; };
async function fetchEarnings(now) {
  const days = [];
  for (let i = 0; days.length < 8 && i < 14; i++) { const d = new Date(now + i * DAY); if (![0, 6].includes(d.getUTCDay())) days.push(iso(d.getTime()).slice(0, 10)); }
  const results = await pool(days, 2, date => fetchJSON(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {timeout: 20000, headers: {Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/'}}));
  const events = []; let ok = 0;
  days.forEach((date, i) => {
    const r = results[i]; if (!r.ok) { console.warn(`[terminal-earnings] ${date}: ${r.error.message}`); return; }
    ok++;
    for (const row of r.value?.data?.rows || []) {
      const cap = money(row.marketCap); if (!finite(cap) || cap < 5e9 || !row.symbol) continue;
      events.push({date, symbol: String(row.symbol).slice(0, 10), name: String(row.name || '').slice(0, 80), marketCap: cap, time: /after/i.test(row.time) ? 'After close' : /pre/i.test(row.time) ? 'Before open' : 'Not set',
        fiscalQuarter: String(row.fiscalQuarterEnding || '').slice(0, 20), epsForecast: money(row.epsForecast), estimates: Number(row.noOfEsts) || null, lastYearEPS: money(row.lastYearEPS), lastYearDate: /\d/.test(row.lastYearRptDt || '') ? String(row.lastYearRptDt).slice(0, 12) : null});
    }
  });
  if (!ok) throw new Error('Earnings calendar unavailable');
  events.sort((a, b) => a.date.localeCompare(b.date) || b.marketCap - a.marketCap);
  return {from: days[0], to: days.at(-1), events: events.slice(0, 300)};
}

async function readJSON(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }
async function write(dir, name, value) { const target = path.join(dir, name); await fs.writeFile(target + '.tmp', JSON.stringify(value) + '\n'); await fs.rename(target + '.tmp', target); }

const PULSE = [['^GSPC','S&P 500'],['^IXIC','Nasdaq'],['^DJI','Dow'],['^RUT','Russell 2000'],['^VIX','VIX'],['^TNX','US 10Y'],['DX-Y.NYB','Dollar'],['EURUSD=X','EUR/USD'],['JPY=X','USD/JPY'],['GC=F','Gold'],['CL=F','WTI crude'],['BTC-USD','Bitcoin'],['ETH-USD','Ether'],['^FTSE','FTSE 100'],['^GDAXI','DAX'],['^N225','Nikkei']];
function buildPulse(quotes) {
  return PULSE.map(([sym, label]) => { const q = quotes[sym]; if (!q || typeof q.price !== 'number') return null;
    const closes = Array.isArray(q.history) ? q.history.slice(-30).map(r => Array.isArray(r) ? r[1] : null).filter(v => typeof v === 'number') : [];
    return {symbol: sym, label, price: q.price, changePercent: typeof q.changePercent === 'number' ? q.changePercent : null, asOf: q.asOf || null, stale: !!q.stale, spark: closes}; }).filter(Boolean);
}

async function main() {
  const [outDir, prevDir] = process.argv.slice(2);
  if (!outDir) throw new Error('Usage: refresh-terminal-markets.cjs <output-dir> [previous-dir]');
  await fs.mkdir(outDir, {recursive: true});
  const now = Date.now();
  const prev = {markets: prevDir ? await readJSON(path.join(prevDir, 'markets.json')) : null, options: prevDir ? await readJSON(path.join(prevDir, 'options.json')) : null, earnings: prevDir ? await readJSON(path.join(prevDir, 'earnings.json')) : null};
  const [markets, options, earnings] = await Promise.allSettled([fetchMarkets(prev.markets, now), fetchOptions(prev.options, now), fetchEarnings(now)]);
  let published = 0;
  if (markets.status === 'fulfilled') { await write(outDir, 'markets.json', {version: 1, generatedAt: iso(now), source: 'Yahoo Finance chart data (delayed; futures front month, exchange delays apply)', sourceURL: 'https://finance.yahoo.com/', ...markets.value}); published++; console.log(`[terminal-markets] ${markets.value.fresh}/${markets.value.total} quotes fresh`); }
  else { console.warn('[terminal-markets] markets failed:', markets.reason.message); if (prev.markets) await write(outDir, 'markets.json', {...prev.markets, stale: true}); }
  if (options.status === 'fulfilled') { await write(outDir, 'options.json', {version: 1, generatedAt: iso(now), source: 'Cboe delayed option quotes (15-minute delay)', sourceURL: 'https://www.cboe.com/delayed_quotes/', ...options.value}); published++; console.log(`[terminal-options] ${options.value.fresh}/${options.value.total} chains fresh`, JSON.stringify(Object.values(options.value.underlyings).slice(0, 2).map(u => [u.symbol, u.price, u.iv30, u.putCallVolume, u.expiries[0]?.date, u.expiries[0]?.movePercent, u.expiries[0]?.maxPain]))); }
  else { console.warn('[terminal-options] options failed:', options.reason.message); if (prev.options) await write(outDir, 'options.json', {...prev.options, stale: true}); }
  if (earnings.status === 'fulfilled') { await write(outDir, 'earnings.json', {version: 1, generatedAt: iso(now), source: 'Nasdaq earnings calendar (companies above $5B market value)', sourceURL: 'https://www.nasdaq.com/market-activity/earnings', ...earnings.value}); published++; console.log(`[terminal-earnings] ${earnings.value.events.length} events ${earnings.value.from} → ${earnings.value.to}`); }
  else { console.warn('[terminal-earnings] earnings failed:', earnings.reason.message); if (prev.earnings) await write(outDir, 'earnings.json', {...prev.earnings, stale: true}); }
  // pulse.json: a few-KB slice of markets.json for the live strip on site pages (same data, no history bloat).
  const snap = markets.status === 'fulfilled' ? markets.value : prev.markets;
  if (snap && snap.quotes) { const pulse = buildPulse(snap.quotes); if (pulse.length) await write(outDir, 'pulse.json', {version: 1, generatedAt: iso(now), stale: markets.status !== 'fulfilled', source: 'Yahoo Finance chart data (delayed)', items: pulse}); }
  if (!published && !prev.markets) throw new Error('Every provider failed and no previous snapshot exists; nothing published.');
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = {buildPulse, parseChart, parseOCC, summarizeOptions, UNIVERSE, OPTION_UNDERLYINGS};
