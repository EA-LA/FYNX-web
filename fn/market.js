/* FYNX market proxy (Vercel serverless). Read-only, delayed public market data for any listed symbol:
 *   ?op=search&q=nvidia          instruments worldwide (stocks, ETFs, indices, futures, FX, crypto) and related news
 *   ?op=chart&symbol=NVDA&range=1y   quote plus daily (or intraday) bars
 *   ?op=quotes&symbols=NVDA,SAP.DE  up to 25 latest quotes
 * Source: Yahoo Finance public endpoints. Nothing is stored; responses are cached briefly at the edge. */
'use strict';
const AGENT = 'Mozilla/5.0 (compatible; FYNXFinanceWorld/1.0; +https://www.fynxfinanceworld.com/terminal.html)';
const SYMBOL = /^[A-Za-z0-9.\-=^&]{1,24}$/;
const RANGES = {'1d': '5m', '5d': '30m', '1mo': '1d', '3mo': '1d', '6mo': '1d', '1y': '1d', '2y': '1d', '5y': '1wk', '10y': '1mo', 'max': '1mo'};
const finite = v => typeof v === 'number' && Number.isFinite(v);
const r6 = v => finite(v) ? Math.round(v * 1e6) / 1e6 : null;

async function yahoo(path) {
  let last;
  for (const host of ['query1', 'query2']) {
    try {
      const res = await fetch(`https://${host}.finance.yahoo.com${path}`, {headers: {'User-Agent': AGENT, Accept: 'application/json'}, signal: AbortSignal.timeout(9000)});
      if (res.ok) return await res.json();
      last = new Error('Upstream HTTP ' + res.status);
    } catch (e) { last = e; }
  }
  throw last;
}
function parseChart(symbol, data, intraday) {
  const r = data?.chart?.result?.[0], m = r?.meta;
  if (!m || !finite(m.regularMarketPrice)) throw Object.assign(new Error('No data for this symbol.'), {status: 404});
  const t = r.timestamp || [], q = r.indicators?.quote?.[0] || {}, adj = r.indicators?.adjclose?.[0]?.adjclose, off = m.gmtoffset || 0;
  const rows = [];
  t.forEach((ts, i) => {
    const c = q.close?.[i]; if (!finite(c) || c <= 0) return;
    const k = !intraday && finite(adj?.[i]) && adj[i] > 0 ? adj[i] / c : 1;
    const date = new Date((ts + off) * 1000).toISOString();
    rows.push({date: intraday ? date.slice(0, 16) : date.slice(0, 10), open: r6((q.open?.[i] ?? c) * k), high: r6((q.high?.[i] ?? c) * k), low: r6((q.low?.[i] ?? c) * k), close: r6(c * k), volume: finite(q.volume?.[i]) ? q.volume[i] : null});
  });
  const prev = finite(m.chartPreviousClose) && intraday ? m.chartPreviousClose : finite(m.previousClose) ? m.previousClose : null;
  return {symbol: m.symbol || symbol, name: m.longName || m.shortName || symbol, currency: m.currency || null, exchange: m.fullExchangeName || m.exchangeName || null, type: m.instrumentType || null, timezone: m.exchangeTimezoneName || null,
    price: r6(m.regularMarketPrice), previousClose: r6(prev), dayHigh: r6(m.regularMarketDayHigh), dayLow: r6(m.regularMarketDayLow), volume: finite(m.regularMarketVolume) ? m.regularMarketVolume : null,
    high52: r6(m.fiftyTwoWeekHigh), low52: r6(m.fiftyTwoWeekLow), asOf: finite(m.regularMarketTime) ? new Date(m.regularMarketTime * 1000).toISOString() : null, rows};
}
async function chart(symbol, range) {
  const interval = RANGES[range];
  const data = await yahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplit`);
  const out = parseChart(symbol, data, interval.endsWith('m'));
  // Daily ranges: compute the day change from the last two sessions when Yahoo omits previousClose.
  if (!out.previousClose && out.rows.length > 1 && !interval.endsWith('m')) out.previousClose = out.rows.at(-2).close;
  out.changePercent = out.previousClose ? r6((out.price / out.previousClose - 1) * 100) : null;
  return out;
}
async function search(q) {
  const d = await yahoo(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=10&enableFuzzyQuery=false&lang=en-US&region=US`);
  return {
    quotes: (d.quotes || []).filter(x => x.symbol && SYMBOL.test(x.symbol)).map(x => ({symbol: x.symbol, name: x.longname || x.shortname || x.symbol, type: x.quoteType || null, exchange: x.exchDisp || x.exchange || null, sector: x.sectorDisp || x.sector || null, industry: x.industryDisp || x.industry || null})),
    news: (d.news || []).filter(n => /^https:\/\//.test(n.link || '') && n.title).map(n => ({title: String(n.title).slice(0, 300), publisher: String(n.publisher || '').slice(0, 80), url: n.link, publishedAt: finite(n.providerPublishTime) ? new Date(n.providerPublishTime * 1000).toISOString() : null}))
  };
}
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET'); return res.status(204).end(); }
  if (req.method !== 'GET') return res.status(405).json({error: 'Use GET.'});
  const q = req.query || {};
  try {
    let body;
    if (q.op === 'search') {
      const term = String(q.q || '').trim();
      if (term.length < 1 || term.length > 40) return res.status(400).json({error: 'Type 1 to 40 characters.'});
      body = {...await search(term), source: 'Yahoo Finance', fetchedAt: new Date().toISOString()};
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
    } else if (q.op === 'chart') {
      const symbol = String(q.symbol || ''), range = RANGES[q.range] ? q.range : '1y';
      if (!SYMBOL.test(symbol)) return res.status(400).json({error: 'Choose a valid symbol.'});
      body = {...await chart(symbol, range), range, source: 'Yahoo Finance (delayed)', fetchedAt: new Date().toISOString()};
      res.setHeader('Cache-Control', `public, s-maxage=${range === '1d' ? 60 : 300}, stale-while-revalidate=900`);
    } else if (q.op === 'quotes') {
      const symbols = [...new Set(String(q.symbols || '').split(',').filter(Boolean))];
      if (!symbols.length || symbols.length > 25 || !symbols.every(s => SYMBOL.test(s))) return res.status(400).json({error: 'Choose 1 to 25 valid symbols.'});
      const quotes = {}, errors = {};
      await Promise.all(symbols.map(async s => { try { const c = await chart(s, '5d'); delete c.rows; quotes[s] = c; } catch (e) { errors[s] = e.message; } }));
      body = {quotes, errors, source: 'Yahoo Finance (delayed)', fetchedAt: new Date().toISOString()};
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    } else return res.status(400).json({error: 'Choose op=search, chart or quotes.'});
    return res.status(200).json(body);
  } catch (e) {
    return res.status(e.status === 404 ? 404 : 502).json({error: e.status === 404 ? e.message : 'Market data is temporarily unavailable.'});
  }
};
