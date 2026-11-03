'use strict';
const { QuantData } = require('./data.cjs');
const { JobQueue, OPERATIONS } = require('./jobs.cjs');
const { verifyUser, validateSaved } = require('./auth.cjs');
const { fail, engine, symbol, fetchJSON } = require('./common.cjs');
class RateLimiter {
  constructor({ limit = 90, windowMs = 60000, now = () => Date.now() } = {}) { this.limit = limit; this.windowMs = windowMs; this.now = now; this.clients = new Map(); }
  take(id) { const now = this.now(); let c = this.clients.get(id); if (!c || c.reset <= now) c = { count: 0, reset: now + this.windowMs }; c.count++; this.clients.set(id, c); if (this.clients.size > 5000) for (const [key, value] of this.clients) if (value.reset <= now) this.clients.delete(key); if (this.clients.size > 10000) throw fail('Service is busy. Retry shortly.', 429, 'RATE_LIMIT'); if (c.count > this.limit) throw fail('Too many requests. Retry in a minute.', 429, 'RATE_LIMIT'); }
}
async function readBody(req, limit = 12000000) { const contentType = String(req.headers['content-type'] || '').split(';')[0]; if (contentType !== 'application/json') throw fail('Use application/json for this request.', 415); if (Number(req.headers['content-length']) > limit) throw fail('Request body is too large.', 413); const parts = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > limit) throw fail('Request body is too large.', 413); parts.push(chunk); } try { const body = JSON.parse(Buffer.concat(parts).toString()); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); return body; } catch { throw fail('Request body must be a JSON object.'); } }
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
function createQuantAPI({ data = new QuantData(), jobs = new JobQueue(), authenticate = verifyUser, limiter = new RateLimiter(), fetcher = fetch } = {}) {
  const api = async (req, res) => {
    const url = new URL(req.url, 'http://quant.local'); if (!url.pathname.startsWith('/api/quant/')) return false;
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      // No wildcard CORS. Production should proxy same-origin; native APIs remain inaccessible to arbitrary sites.
      const origin = req.headers.origin; if (origin) { const allowed = new Set(String(process.env.QUANT_ALLOWED_ORIGINS || 'https://fynxfinanceworld.com,https://www.fynxfinanceworld.com,http://127.0.0.1:4174,http://localhost:4174').split(',')); if (!allowed.has(origin)) throw fail('This origin is not allowed.', 403, 'ORIGIN_FORBIDDEN'); res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.writeHead(204); res.end(); return true; }
      limiter.take(req.socket?.remoteAddress || 'unknown');
      const rawRoute = url.pathname.slice('/api/quant/'.length); const route = rawRoute === 'eventstudy' ? 'event-study' : rawRoute; const query = Object.fromEntries(url.searchParams);
      if (Object.keys(query).length > 20 || Object.values(query).some(v => v.length > 1000)) throw fail('Query is too large.');
      if (req.method === 'GET' && route === 'symbols') json(res, 200, await data.markets());
      else if (req.method === 'GET' && route === 'history') { const history = await data.streamingHistory(query); json(res, 200, { symbol: history.symbol, timeframe: 'M1', requestedTimeframe: 'TICK', execution: 'tick', source: 'Dukascopy', from: history.from, to: history.to, requestedFrom: history.from, requestedTo: history.to, updatedAt: history.manifestRevision, partitions: history.partitions, status: 'stored', fullCoverage: true, rangeBasis: 'Requested interval fully ingested; actual quote bounds are reported with results.', granularityNote: 'Completed M1 signal bars with recorded bid/ask ticks for execution; non-trading intervals contain no synthetic quotes.' }); }
      else if (req.method === 'GET' && route === 'bars') json(res, 200, await data.bars(query));
      else if (req.method === 'GET' && route === 'quotes') json(res, 200, await data.quotes(query.symbols));
      else if (req.method === 'GET' && route === 'news/calendar') json(res, 200, await data.calendar(query));
      else if (req.method === 'GET' && route === 'news/headlines') { const market = symbol(query.symbol); const endpoint = new URL('https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketFeed'); endpoint.searchParams.set('kind', 'symbol'); endpoint.searchParams.set('q', market.symbol || market.label); const headlines = await data.cached(`news:${market.id}`, 300000, () => fetchJSON(endpoint, { fetcher, provider: 'FYNX News' })); json(res, 200, { ...headlines, symbol: market.id }); }
      else if (req.method === 'DELETE' && /^jobs\/[A-Za-z0-9_-]{32}$/.test(route)) json(res, 200, jobs.cancel(route.slice(5)));
      else if (req.method === 'GET' && /^jobs\/[A-Za-z0-9_-]{32}$/.test(route)) json(res, 200, jobs.get(route.slice(5)));
      else if (req.method === 'POST' && OPERATIONS.has(route) && !route.endsWith('-history')) { const body = await readBody(req); if (Array.isArray(body.events)) body.events = body.events.filter(e => e.timing !== 'estimated'); if (Array.isArray(body.params?.events)) body.params.events = body.params.events.filter(e => e.timing !== 'estimated'); if (['backtest', 'optimize'].includes(route) && !body.bars && body.symbol && String(body.tf || body.timeframe).toUpperCase() === 'TICK') { const history = await data.streamingHistory(body); const job = jobs.submit(route + '-history', { history, options: body.options, params: { ...body.params, pipSize: history.pipSize, mode: 'tick' } }); json(res, job.status === 'complete' ? 200 : 202, job); return true; } if (['backtest', 'optimize'].includes(route) && !body.bars && body.symbol) { const history = await data.bars(body); body.bars = history.bars; body.provenance = { source: history.source, from: history.from, to: history.to, updatedAt: history.updatedAt }; body.params = { ...body.params, pipSize: symbol(body.symbol).pipSize, mode: history.execution === 'tick' ? 'tick' : (body.params?.mode || 'ohlc') }; } const job = jobs.submit(route, body); json(res, job.status === 'complete' ? 200 : 202, job); }
      else if (req.method === 'POST' && route === 'ea') { const body = await readBody(req, 100000); const generate = engine().generateEA; if (!generate) throw fail('EA generator is not present in this build.', 503, 'GENERATOR_NOT_BUILT'); const output = generate(body); json(res, 200, output); }
      else if (/^(strategies|portfolios)(\/[A-Za-z0-9_-]{1,80})?$/.test(route)) { const [type, id] = route.split('/'); const user = await authenticate(req); if (req.method === 'GET' && !id) { const saved = await data.store.userRead(user.uid, type); json(res, 200, { ...saved, [type]: saved.items }); } else if (req.method === 'POST' && !id) { const item = validateSaved(await readBody(req, 1000000), type); await data.store.userSave(user.uid, type, item); json(res, 200, { item }); } else if (req.method === 'DELETE' && id) json(res, 200, await data.store.userDelete(user.uid, type, id)); else throw fail('Unsupported saved-item operation.', 405); }
      else throw fail('Quant endpoint not found.', 404, 'NOT_FOUND');
    } catch (error) { const status = error.status || 500; const message = status >= 500 && !error.code ? 'Quant service is temporarily unavailable.' : error.message; json(res, status, { error: message, code: error.code || 'SERVICE_ERROR' }); }
    return true;
  };
  api.close = () => jobs.close(); api.data = data; return api;
}
module.exports = { createQuantAPI, RateLimiter, readBody };
