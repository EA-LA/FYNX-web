'use strict';
const { setTimeout: delay } = require('node:timers/promises');

const MESSAGES = Object.freeze({
  PROVIDER_DISABLED: 'This connection is not enabled. Use a statement import while access is being verified.',
  PROVIDER_AUTH: 'The provider refused these credentials. Check or replace your read-only credentials.',
  PROVIDER_UNAVAILABLE: 'The provider is temporarily unavailable. Your last successful data is preserved.',
  PROVIDER_RATE_LIMIT: 'The provider request limit was reached. Synchronization will retry later.',
  PROVIDER_PENDING: 'The provider is still preparing this connection.',
  PROVIDER_SCHEMA: 'The provider returned data that could not be verified safely.',
  PROVIDER_INPUT: 'Check the connection fields and try again.',
  READ_ONLY_REQUIRED: 'This credential is not verified as read-only. Trading, transfers and withdrawals must be disabled.',
  ENDPOINT_DENIED: 'This operation is not permitted by the read-only connector.',
  HISTORY_INCOMPLETE: 'The provider history could not be completed within the configured limits.',
});
class ProviderError extends Error {
  constructor(code, options = {}) {
    super(MESSAGES[code] || MESSAGES.PROVIDER_UNAVAILABLE);
    this.name = 'ProviderError'; this.code = code;
    this.status = options.status || (code === 'PROVIDER_AUTH' ? 401 : code === 'PROVIDER_INPUT' ? 400 : code === 'READ_ONLY_REQUIRED' ? 422 : 503);
    if (options.retryAfterSeconds) this.retryAfterSeconds = Math.min(3600, Math.max(1, Number(options.retryAfterSeconds)));
    // Never attach upstream bodies, request URLs, headers or an unsanitized cause.
  }
}
function bounded(value, fallback, min, max) { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : fallback; }
function safeId(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new ProviderError('PROVIDER_INPUT'); return value; }
// eslint-disable-next-line no-control-regex -- Reject CR, LF and NUL in credential fields before request construction.
function nonempty(value, max = 512) { if (typeof value !== 'string' || !value.length || value.length > max || /[\r\n\u0000]/.test(value)) throw new ProviderError('PROVIDER_INPUT'); return value; }
function finite(value, nullable = false) {
  if (nullable && (value == null || value === '')) return null;
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))) throw new ProviderError('PROVIDER_SCHEMA');
  const n = Number(value); if (!Number.isFinite(n)) throw new ProviderError('PROVIDER_SCHEMA'); return n;
}
function iso(value) { const n = typeof value === 'number' ? value : Date.parse(value); if (!Number.isFinite(n)) throw new ProviderError('PROVIDER_SCHEMA'); return new Date(n).toISOString(); }
function array(value) { if (!Array.isArray(value)) throw new ProviderError('PROVIDER_SCHEMA'); return value; }
function evidence(verified, basis, sourceURL, now, canTrade = null, canWithdraw = null) { return { verified, canTrade, canWithdraw, basis, checkedAt: new Date(now()).toISOString(), sourceURL }; }
function requireReadOnly(proof) { if (!proof?.verified || proof.canTrade !== false || proof.canWithdraw !== false) { const error = new ProviderError('READ_ONLY_REQUIRED'); error.readOnlyEvidence = proof; throw error; } return proof; }

/** Fixed origin + method/path/query allow-list. Request details never enter error messages. */
function createTransport({ origin, rules, provider = 'unknown', beforeRequest, fetchImpl = globalThis.fetch, now = Date.now, sleep = delay, timeoutMs = 10000, perMinute = 60, maxBytes = 4 * 1024 * 1024 }) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new ProviderError('ENDPOINT_DENIED');
  let requests = [], failures = 0, circuitUntil = 0;
  async function request(method, path, { query = {}, headers = {}, body, signal, retries = method === 'GET' ? 2 : 0, accept202 = false } = {}) {
    if (typeof path !== 'string' || !path.startsWith('/') || /[?#\\]|%2f|%5c|\.\./i.test(path)) throw new ProviderError('ENDPOINT_DENIED');
    const rule = rules.find(r => r.method === method && r.path.test(path));
    if (!rule || Object.keys(query).some(key => !rule.query.includes(key))) throw new ProviderError('ENDPOINT_DENIED');
    const url = new URL(path, origin);
    if (url.origin !== base.origin) throw new ProviderError('ENDPOINT_DENIED');
    for (const [key, value] of Object.entries(query)) { if (value !== undefined && value !== null) url.searchParams.set(key, String(value)); }
    if (body !== undefined && method === 'GET') throw new ProviderError('ENDPOINT_DENIED');
    for (let attempt = 0; attempt <= Math.min(2, retries); attempt++) {
      const ts = now(); requests = requests.filter(t => t > ts - 60000);
      if (circuitUntil > ts) throw new ProviderError('PROVIDER_UNAVAILABLE', { retryAfterSeconds: Math.ceil((circuitUntil - ts) / 1000) });
      if (requests.length >= perMinute) throw new ProviderError('PROVIDER_RATE_LIMIT', { retryAfterSeconds: 60 });
      if (beforeRequest) {
        let reservation;
        try { reservation = await beforeRequest({ provider, method, path }); }
        catch (error) { throw error instanceof ProviderError ? error : new ProviderError('PROVIDER_RATE_LIMIT', { retryAfterSeconds: 60 }); }
        if (reservation === false || reservation?.allowed === false) throw new ProviderError('PROVIDER_RATE_LIMIT', { retryAfterSeconds: reservation?.retryAfterSeconds || 60 });
      }
      requests.push(ts);
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal?.aborted) throw new ProviderError('PROVIDER_UNAVAILABLE');
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, timeoutMs);
      try {
        const response = await fetchImpl(url.toString(), { method, headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: controller.signal });
        if (response.status === 401 || response.status === 403) throw new ProviderError('PROVIDER_AUTH');
        if (response.status === 429) throw new ProviderError('PROVIDER_RATE_LIMIT', { retryAfterSeconds: 60 });
        if (response.status >= 300 && response.status < 400) throw new ProviderError('ENDPOINT_DENIED');
        if (!response.ok) { const error = new ProviderError(response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_INPUT'); error.upstreamStatus = response.status; throw error; }
        if (response.status === 202 && !accept202) throw new ProviderError('PROVIDER_PENDING', { retryAfterSeconds: 60 });
        if (response.status === 204) { failures = 0; return { data: null, status: 204 }; }
        const advertised = Number(response.headers.get('content-length'));
        if (advertised > maxBytes) throw new ProviderError('PROVIDER_SCHEMA');
        let text = '';
        if (response.body?.getReader) {
          const reader = response.body.getReader(); const decoder = new TextDecoder(); let bytes = 0;
          for (;;) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; if (bytes > maxBytes) { await reader.cancel(); throw new ProviderError('PROVIDER_SCHEMA'); } text += decoder.decode(item.value, { stream: true }); }
          text += decoder.decode();
        } else { text = await response.text(); if (Buffer.byteLength(text) > maxBytes) throw new ProviderError('PROVIDER_SCHEMA'); }
        let data; try { data = text ? JSON.parse(text) : null; } catch { throw new ProviderError('PROVIDER_SCHEMA'); }
        failures = 0; return { data, status: response.status };
      } catch (error) {
        const safe = error instanceof ProviderError ? error : new ProviderError('PROVIDER_UNAVAILABLE');
        if (safe.code === 'PROVIDER_UNAVAILABLE') { failures++; if (failures >= 5) circuitUntil = now() + 30000; }
        if (safe.code !== 'PROVIDER_UNAVAILABLE' || attempt >= retries || signal?.aborted) throw safe;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
      await sleep(250 * (2 ** attempt));
    }
    throw new ProviderError('PROVIDER_UNAVAILABLE');
  }
  return { request };
}
module.exports = { ProviderError, bounded, safeId, nonempty, finite, iso, array, evidence, requireReadOnly, createTransport };
