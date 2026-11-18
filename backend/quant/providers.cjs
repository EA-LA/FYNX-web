'use strict';
const { fail, fetchJSON, TF } = require('./common.cjs');
const COUNTRY_CURRENCY = { 'United States': 'USD', 'United Kingdom': 'GBP', 'Euro Area': 'EUR', Germany: 'EUR', France: 'EUR', Japan: 'JPY', Australia: 'AUD', Canada: 'CAD', Switzerland: 'CHF', 'New Zealand': 'NZD' };
class DukascopyProvider {
  constructor({ download } = {}) { this.download = download; this.name = 'Dukascopy'; }
  async history({ symbol, timeframe, from, to }) {
    let downloader = this.download;
    if (!downloader) { try { downloader = require('dukascopy-node').getHistoricalRates; } catch { throw fail('Install dukascopy-node to enable historical market data.', 503, 'PROVIDER_NOT_INSTALLED'); } }
    let rows;
    try { rows = await downloader({ instrument: symbol.dukascopy || symbol.dukascopyId, dates: { from, to }, timeframe: timeframe.toLowerCase(), format: 'json', priceType: 'bid', volumes: true, batchSize: 3, pauseBetweenBatchesMs: 300, retryCount: 2, retryOnEmpty: false, useCache: false }); }
    catch { throw fail('Dukascopy history is temporarily unavailable. Retry this range later.', 503, 'PROVIDER_UNAVAILABLE'); }
    if (!Array.isArray(rows)) throw fail('Dukascopy returned invalid history.', 503, 'PROVIDER_UNAVAILABLE');
    const fromMs = Date.parse(from), toMs = Math.min(Date.parse(to), Date.now());
    const normalized = rows.filter(r => Number.isFinite(r.timestamp) && r.timestamp >= fromMs && r.timestamp < toMs).map(r => {
      const time = new Date(r.timestamp).toISOString();
      if (timeframe === 'TICK') { if (![r.bidPrice, r.askPrice].every(v => Number.isFinite(v) && v > 0) || r.askPrice < r.bidPrice) throw fail('Dukascopy returned an invalid tick.', 503); return { time, bid: r.bidPrice, ask: r.askPrice, bidVolume: r.bidVolume ?? null, askVolume: r.askVolume ?? null }; }
      if (!['open', 'high', 'low', 'close'].every(k => Number.isFinite(r[k]) && r[k] > 0) || r.high < Math.max(r.open, r.close, r.low) || r.low > Math.min(r.open, r.close)) throw fail('Dukascopy returned an invalid candle.', 503);
      return { time, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? null };
    }).filter(r => timeframe === 'TICK' || Date.parse(r.time) + TF[timeframe] <= toMs);
    normalized.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    // Candles must be unique. Tick streams may legitimately have multiple quotes per millisecond.
    return timeframe === 'TICK' ? normalized : [...new Map(normalized.map(r => [r.time, r])).values()];
  }
}
class TwelveDataQuotes {
  constructor({ key = process.env.QUANT_QUOTES_API_KEY, fetcher } = {}) { this.key = key; this.configured = Boolean(key); this.fetcher = fetcher; this.name = 'Twelve Data'; }
  async quote(symbol) {
    if (!this.key) throw fail('Live quotes need QUANT_QUOTES_API_KEY. Historical research remains available.', 503, 'QUOTES_NOT_CONFIGURED');
    if (!symbol.quoteSymbol) throw fail('This market has no configured Twelve Data symbol.', 503, 'SYMBOL_UNAVAILABLE');
    const url = new URL('https://api.twelvedata.com/quote'); url.searchParams.set('symbol', symbol.quoteSymbol); url.searchParams.set('apikey', this.key);
    const q = await fetchJSON(url, { fetcher: this.fetcher, provider: this.name });
    const price = Number(q.close), timestamp = Number(q.timestamp), change = Number(q.percent_change);
    if (q.status === 'error' || !Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) || timestamp <= 0 || timestamp * 1000 > Date.now() + 60000) throw fail('A validated quote is unavailable for this market or subscription.', 503, 'QUOTE_UNAVAILABLE');
    return { symbol: symbol.id, price, changePct: q.percent_change === undefined || q.percent_change === null || !Number.isFinite(change) ? null : change, changeBasis: 'Previous session', asOf: new Date(timestamp * 1000).toISOString(), fetchedAt: new Date().toISOString(), source: this.name, sourceURL: 'https://twelvedata.com/', status: Date.now() - timestamp * 1000 > 15 * 60000 ? 'delayed' : 'recent', currency: q.currency || null };
  }
}
function eventType(name) { if (/non.?farm|payroll/i.test(name)) return 'NFP'; if (/consumer price|inflation|\bCPI\b/i.test(name)) return 'CPI'; if (/FOMC|fed.*rate|federal.*rate/i.test(name)) return 'FOMC'; if (/GDP|gross domestic/i.test(name)) return 'GDP'; if (/interest rate|rate decision|policy rate|bank rate/i.test(name)) return 'RATES'; return 'OTHER'; }
function normalizeEvent(raw) {
  const valueOrNull = value => value === undefined || value === null || value === '' ? null : value;
  const timeString = String(raw.Date || ''); const time = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(timeString) ? timeString : timeString + 'Z');
  if (!Number.isFinite(time) || !raw.CalendarId || typeof raw.Event !== 'string') return null;
  const precision = String(raw.DateSpan) === '0' ? 'confirmed' : 'estimated';
  const currency = COUNTRY_CURRENCY[raw.Country] || (/^[A-Z]{3}$/.test(raw.Currency) ? raw.Currency : null);
  return { id: String(raw.CalendarId), time: new Date(time).toISOString(), name: raw.Event, title: raw.Event, country: raw.Country || '', currency, type: eventType(`${raw.Event} ${raw.Category || ''}`), impact: ({ 1: 'low', 2: 'medium', 3: 'high' })[raw.Importance] || 'unknown', actual: valueOrNull(raw.Actual), forecast: valueOrNull(raw.Forecast), previous: valueOrNull(raw.Previous), revised: valueOrNull(raw.Revised), unit: raw.Unit || null, source: raw.Source || 'Trading Economics', sourceURL: /^https?:\/\//.test(raw.SourceURL || '') ? raw.SourceURL : 'https://tradingeconomics.com/calendar', provider: 'Trading Economics', timing: precision, updatedAt: raw.LastUpdate || null };
}
class TradingEconomicsCalendar {
  constructor({ key = process.env.QUANT_CALENDAR_API_KEY, fetcher } = {}) { this.key = key; this.fetcher = fetcher; this.name = 'Trading Economics'; }
  async calendar({ from, to, impact = 'high' }) {
    if (!this.key) throw fail('Economic calendar needs QUANT_CALENDAR_API_KEY and historical-calendar access. No event dates are approximated.', 503, 'CALENDAR_NOT_CONFIGURED');
    const url = new URL(`https://api.tradingeconomics.com/calendar/country/All/${from.slice(0, 10)}/${to.slice(0, 10)}`); url.searchParams.set('c', this.key); url.searchParams.set('f', 'json'); if (!['high','medium-high'].includes(impact)) throw fail('Choose high or medium-high calendar impact.'); if (impact === 'high') url.searchParams.set('importance', '3');
    const rows = await fetchJSON(url, { fetcher: this.fetcher, limit: 15000000, provider: this.name });
    if (!Array.isArray(rows)) throw fail('Historical calendar access is unavailable for this subscription.', 503, 'CALENDAR_UNAVAILABLE');
    return rows.map(normalizeEvent).filter(Boolean).filter(e => impact === 'high' ? e.impact === 'high' : ['high','medium'].includes(e.impact)).filter(e => Date.parse(e.time) >= Date.parse(from) && Date.parse(e.time) <= Date.parse(to)).sort((a, b) => a.time.localeCompare(b.time));
  }
}
function aggregate(rows, timeframe, { tick = false, includeTicks = false } = {}) {
  const size = TF[timeframe]; if (!size) throw fail('Choose a candle timeframe for aggregation.'); const map = new Map();
  for (const row of rows) { const key = Math.floor(Date.parse(row.time) / size) * size; const price = tick ? row.bid : row.close; if (!(price > 0)) continue; let bar = map.get(key); if (!bar) { bar = { time: new Date(key).toISOString(), open: tick ? price : row.open, high: tick ? price : row.high, low: tick ? price : row.low, close: price }; if (includeTicks) bar.ticks = []; map.set(key, bar); } bar.high = Math.max(bar.high, tick ? price : row.high); bar.low = Math.min(bar.low, tick ? price : row.low); bar.close = price; if (includeTicks) bar.ticks.push({ time: row.time, bid: row.bid, ask: row.ask }); }
  return [...map.values()].sort((a, b) => a.time.localeCompare(b.time));
}
module.exports = { DukascopyProvider, TwelveDataQuotes, TradingEconomicsCalendar, normalizeEvent, eventType, aggregate };
