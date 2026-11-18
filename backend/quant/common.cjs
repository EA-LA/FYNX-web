'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
function fail(message, status = 400, code = 'INVALID_REQUEST') { return Object.assign(new Error(message), { status, code }); }
function engine() { try { return require('./engine.cjs'); } catch (e) { if (e.code === 'MODULE_NOT_FOUND') throw fail('Build the Quant engine first with npm run build:quant.', 503, 'ENGINE_NOT_BUILT'); throw e; } }
function symbols() { return engine().SYMBOLS; }
function symbol(value) { const id = String(value || 'EURUSD').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); const s = symbols().find(s => s.id === id); if (!s) throw fail('Choose a supported Quant market.'); return s; }
const TF = { M1: 60000, M5: 300000, H1: 3600000, H4: 14400000, D1: 86400000, TICK: 0 };
function timeframe(value = 'D1') { const key = String(value).toUpperCase(); if (!(key in TF)) throw fail('Timeframe must be tick, M1, M5, H1, H4 or D1.'); return key; }
function iso(value, fallback) { const v = value === 'now' || value === undefined || value === '' ? fallback : value; if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(v)) throw fail('A valid ISO date is required.'); const day = v.slice(0, 10); const midnight = Date.parse(day + 'T00:00:00Z'); if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) throw fail('A valid ISO date is required.'); const time = Date.parse(String(v)); if (!Number.isFinite(time)) throw fail('A valid ISO date is required.'); return new Date(time).toISOString(); }
function range(from, to, { now = Date.now(), maxDays = 3660 } = {}) { const start = iso(from, new Date(now - 365 * 86400000).toISOString()); const end = iso(to, new Date(now).toISOString()); const days = (Date.parse(end) - Date.parse(start)) / 86400000; if (days <= 0 || days > maxDays || Date.parse(end) > now + 86400000) throw fail(`Choose an increasing date range of at most ${maxDays} days, ending no later than tomorrow.`); return { from: start, to: end, days }; }
function hash(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }
function dataDir() { return path.resolve(process.env.QUANT_DATA_DIR || path.join(__dirname, '../../.quant-data')); }
function bounded(value, min, max, fallback) { const n = value === undefined ? fallback : Number(value); if (!Number.isFinite(n) || n < min || n > max) throw fail(`Value must be between ${min} and ${max}.`); return n; }
async function fetchJSON(url, { fetcher = fetch, limit = 8000000, timeout = 20000, provider = 'Data provider' } = {}) {
  let res;
  try { res = await fetcher(url, { signal: AbortSignal.timeout(timeout), headers: { Accept: 'application/json', 'User-Agent': 'FYNX-Quant-Research/1.0' } }); }
  catch { throw fail(`${provider} is unreachable. Please retry later.`, 503, 'PROVIDER_UNAVAILABLE'); }
  if (!res.ok) throw fail(`${provider} is unavailable or this request is not included in the configured subscription.`, 503, 'PROVIDER_UNAVAILABLE');
  if (Number(res.headers.get('content-length')) > limit) throw fail(`${provider} response exceeds the data limit.`, 503, 'PROVIDER_TOO_LARGE');
  let text = '';
  if (res.body?.getReader) { const reader = res.body.getReader(); const decoder = new TextDecoder(); let bytes = 0; try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > limit) throw fail(`${provider} response exceeds the data limit.`, 503, 'PROVIDER_TOO_LARGE'); text += decoder.decode(part.value, { stream: true }); } text += decoder.decode(); } finally { await reader.cancel(); } }
  else { text = await res.text(); if (Buffer.byteLength(text) > limit) throw fail(`${provider} response exceeds the data limit.`, 503); }
  try { return JSON.parse(text); } catch { throw fail(`${provider} returned an invalid response.`, 503, 'PROVIDER_UNAVAILABLE'); }
}
module.exports = { fail, engine, symbols, symbol, timeframe, TF, range, iso, hash, dataDir, bounded, fetchJSON };
