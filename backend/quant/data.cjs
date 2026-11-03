'use strict';
const { Store } = require('./store.cjs');
const { DukascopyProvider, TwelveDataQuotes, TradingEconomicsCalendar, aggregate } = require('./providers.cjs');
const { symbol, symbols, timeframe, range, fail, hash, TF } = require('./common.cjs');
const { partitionPlan } = require('./history-plan.cjs');
const ONLINE_DAYS = { D1: 3660, H4: 366, H1: 93, M5: 14, M1: 7, TICK: 1 };
class QuantData {
  constructor({ store = new Store(), history = new DukascopyProvider(), quotes = new TwelveDataQuotes(), calendar = new TradingEconomicsCalendar(), now = () => Date.now(), quoteLimit = Number(process.env.QUANT_QUOTES_PER_MINUTE || 8) } = {}) { this.store = store; this.historyProvider = history; this.quoteProvider = quotes; this.calendarProvider = calendar; this.now = now; this.pending = new Map(); this.cache = new Map(); if (!Number.isInteger(quoteLimit) || quoteLimit < 1 || quoteLimit > 1000) throw new Error('QUANT_QUOTES_PER_MINUTE must be an integer from 1 to 1000.'); this.quoteLimit = quoteLimit; this.quoteAttempts = []; this.lastQuotes = new Map(); }
  async cached(key, ttl, load) { const old = this.cache.get(key); if (old && this.now() - old.at < ttl) return old.value; if (this.pending.has(key)) return this.pending.get(key); if (this.pending.size >= 4) throw fail('Data service is busy. Please retry shortly.', 429, 'DATA_BUSY'); const task = (async () => { try { const value = await load(); this.cache.set(key, { at: this.now(), value }); while (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value); return value; } finally { this.pending.delete(key); } })(); this.pending.set(key, task); return task; }
  async bars(query) {
    const market = symbol(query.symbol), tf = timeframe(query.tf || query.timeframe); const dates = range(query.from, query.to, { now: this.now(), maxDays: 3660 });
    return this.cached(`bars:${market.id}:${tf}:${dates.from}:${dates.to}`, 300000, async () => {
      const key = `requests/${hash([market.id, tf, dates.from, dates.to])}`; const saved = await this.store.read(key);
      if (saved && this.now() - Date.parse(saved.updatedAt) < 6 * 3600000) return { ...saved, status: 'cached' };
      const storedHistory = await this.readPartitions(market.id, tf, dates); let rows = storedHistory?.rows, derived = false, stored = !!storedHistory;
      // Large ranges must be ingested offline in bounded chunks, never downloaded into an API process.
      if (!rows && dates.days > ONLINE_DAYS[tf]) { if (!rows) throw fail(`This ${tf} range is not fully stored. Run the resumable history importer first; online requests are limited to ${ONLINE_DAYS[tf]} days.`, 409, 'HISTORY_NOT_INGESTED'); }
      else if (!rows) {
        try { rows = await this.historyProvider.history({ symbol: market, timeframe: tf, ...dates }); }
        catch (error) { if (saved) return { ...saved, status: 'stale', warning: error.message }; throw error; }
      }
      if (rows.length > 500000) throw fail('Requested history exceeds the 500,000-record API limit. Use a narrower range or coarser timeframe.', 413, 'RANGE_TOO_LARGE');
      if (tf === 'TICK') { const completeFrom = Math.ceil(Date.parse(dates.from) / 60000) * 60000, completeTo = Math.min(Date.parse(dates.to), this.now()); rows = aggregate(rows, 'M1', { tick: true, includeTicks: true }).filter(bar => Date.parse(bar.time) >= completeFrom && Date.parse(bar.time) + 60000 <= completeTo); derived = true; }
      const data = { symbol: market.id, timeframe: derived ? 'M1' : tf, requestedTimeframe: tf, execution: derived ? 'tick' : 'ohlc', bars: rows, source: 'Dukascopy', sourceURL: 'https://www.dukascopy.com/swiss/english/marketwatch/historical/', requestedFrom: dates.from, requestedTo: dates.to, from: rows[0]?.time || null, to: rows.at(-1)?.time || null, updatedAt: stored ? storedHistory.updatedAt : new Date(this.now()).toISOString(), status: rows.length ? (stored ? 'stored' : 'historical') : 'no-data', priceSide: 'bid', completeBarsOnly: true, granularityNote: derived ? 'Signals use completed M1 bars; raw bid/ask ticks inside each bar drive exits. This is not a tick-to-tick signal strategy.' : 'Historical bid candles. Configure spread and slippage for the venue you intend to test.' };
      if (!stored) await this.store.write(key, data); return data;
    });
  }
  async readPartitions(id, tf, dates) {
    const manifest = await this.store.read(`history/${id}/${tf}/manifest`); if (!manifest) return null;
    let chunks; try { chunks = partitionPlan(manifest, dates.from, dates.to); } catch (e) { if (e.code === 'HISTORY_NOT_INGESTED') return null; throw e; }
    const rows = []; for (const chunk of chunks) { const data = await this.store.read(chunk.key); if (!data) return null; for (const row of data.rows) if (row.time >= chunk.readFrom && row.time < chunk.readTo) rows.push(row); if (rows.length > 500000) throw fail('Stored range exceeds the API record limit. Narrow the range or submit a server tick backtest.', 413, 'RANGE_TOO_LARGE'); }
    return { rows, updatedAt: chunks.map(c => c.updatedAt || manifest.updatedAt).filter(Boolean).sort().at(-1) || manifest.updatedAt };
  }
  async streamingHistory(query) {
    const market = symbol(query.symbol); if (timeframe(query.tf || query.timeframe) !== 'TICK') throw fail('Streaming history currently requires recorded tick data.');
    const dates = range(query.from, query.to, { now: this.now(), maxDays: 3660 }); if (Date.parse(dates.from) % 60000 || Date.parse(dates.to) % 60000) throw fail('Stored tick backtest boundaries must align to complete UTC minutes.'); const manifest = await this.store.read(`history/${market.id}/TICK/manifest`);
    const plan = partitionPlan(manifest, dates.from, dates.to);
    return { symbol: market.id, from: dates.from, to: dates.to, dataDir: this.store.root, manifestRevision: manifest.updatedAt, partitions: plan.length, pipSize: market.pipSize };
  }
  async markets() { const results = []; for (const item of symbols()) { const manifest = await this.store.read(`history/${item.id}/D1/manifest`); results.push({ ...item, historyUpdatedAt: manifest?.updatedAt || null }); } return { symbols: results }; }
  quoteBudget() {
    const cutoff = this.now() - 60000; this.quoteAttempts = this.quoteAttempts.filter(time => time > cutoff);
    return { perMinute: this.quoteLimit, remaining: Math.max(0, this.quoteLimit - this.quoteAttempts.length), windowSeconds: 60 };
  }
  reserveQuote() {
    if (!this.quoteBudget().remaining) { const retryAfterSeconds = Math.max(1, Math.ceil((this.quoteAttempts[0] + 60000 - this.now()) / 1000)); throw Object.assign(fail('Quote refresh budget reached. Cached prices retain their original timestamps; remaining markets will be checked later.', 429, 'QUOTE_BUDGET'), { retryAfterSeconds }); }
    this.quoteAttempts.push(this.now());
  }
  async quotes(ids) {
    const list = [...new Set(String(ids || 'EURUSD').split(','))]; if (list.length > 20) throw fail('Request at most 20 quotes.');
    const markets = list.map(symbol), quotes = [], errors = {}, configured = this.quoteProvider.configured !== false; let retryAfterSeconds = null;
    for (const market of markets) {
      if (!configured) { errors[market.id] = { code: 'QUOTES_NOT_CONFIGURED', message: 'Live quotes need QUANT_QUOTES_API_KEY. Historical research remains available.' }; continue; }
      try {
        const quote = await this.cached(`quote:${market.id}`, 60000, async () => { this.reserveQuote(); const value = await this.quoteProvider.quote(market); this.lastQuotes.set(market.id, value); return value; });
        quotes.push(quote);
      } catch (error) {
        errors[market.id] = { code: error.code || 'QUOTE_UNAVAILABLE', message: error.message, ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) };
        if (error.retryAfterSeconds) retryAfterSeconds = retryAfterSeconds === null ? error.retryAfterSeconds : Math.min(retryAfterSeconds, error.retryAfterSeconds);
        const previous = this.lastQuotes.get(market.id); if (previous) quotes.push({ ...previous, status: 'stale', warning: error.message, reason: error.code || 'QUOTE_UNAVAILABLE' });
      }
    }
    return { quotes, errors, configured, retryAfterSeconds, budget: this.quoteBudget(), status: quotes.length ? (Object.keys(errors).length ? 'partial' : 'available') : 'unavailable', updatedAt: new Date(this.now()).toISOString() };
  }
  async calendar(query) {
    const dates = range(query.from, query.to, { now: this.now() + 31 * 86400000, maxDays: 3660 });
    const market = query.symbol ? symbol(query.symbol) : null;
    return this.cached(`calendar:${dates.from}:${dates.to}:${market?.id || ''}`, 300000, async () => {
      const key = `calendar/ranges/${hash([dates.from, dates.to])}`; const saved = await this.store.read(key); let events, status = 'historical', warning, storedUpdatedAt;
      if (dates.days > 93) { const manifest = await this.store.read('calendar/manifest'); const chunks = (manifest?.chunks || []).filter(c => c.to >= dates.from && c.from <= dates.to).sort((a, b) => a.from.localeCompare(b.from)); let covered = dates.from; for (const chunk of chunks) { if (chunk.from > covered) throw fail('Calendar history is not fully imported. Run the calendar importer with an entitled provider key.', 409, 'CALENDAR_HISTORY_NOT_INGESTED'); covered = chunk.to > covered ? chunk.to : covered; } if (covered < dates.to) throw fail('Calendar history is not fully imported. Run the calendar importer with an entitled provider key.', 409, 'CALENDAR_HISTORY_NOT_INGESTED'); const partitions = await Promise.all(chunks.map(c => this.store.read(c.key))); if (partitions.some(part => !part || !Array.isArray(part.events))) throw fail('A calendar history partition is missing. Resume the calendar import before running an event study.', 409, 'CALENDAR_HISTORY_NOT_INGESTED'); events = partitions.flatMap(part => part.events); status = 'stored'; storedUpdatedAt = manifest.updatedAt; }
      else { try { events = await this.calendarProvider.calendar(dates); await this.store.write(key, { events, updatedAt: new Date(this.now()).toISOString() }); } catch (e) { if (!saved) throw e; events = saved.events; status = 'stale'; warning = e.message; } }
      events = [...new Map(events.filter(e => e.time >= dates.from && e.time <= dates.to && (!market || market.currencies.includes(e.currency))).map(e => [e.id, e])).values()].sort((a, b) => a.time.localeCompare(b.time));
      return { events, source: 'Trading Economics', from: dates.from, to: dates.to, updatedAt: status === 'stale' ? saved.updatedAt : status === 'stored' ? storedUpdatedAt : new Date(this.now()).toISOString(), status, warning, timingNote: 'Estimated release times are shown in the calendar but excluded from release-time backtests.' };
    });
  }
}
module.exports = { QuantData, ONLINE_DAYS };
