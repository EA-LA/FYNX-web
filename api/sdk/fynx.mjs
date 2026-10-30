// FYNX API client for server-side JavaScript (Node 18+, Deno, Bun). No dependencies.
// Never ship an API key to a browser or mobile app; call FYNX from your backend.
//
//   import { Fynx } from './fynx.mjs';
//   const fynx = new Fynx(process.env.FYNX_API_KEY);
//   const { result } = await fynx.indicators('rsi', { values: [...], period: 14 });
//
// Spec: https://www.fynxfinanceworld.com/api/openapi.json
export const DEFAULT_BASE_URL = 'https://us-central1-fynx-c7a28.cloudfunctions.net/developerGateway';

export class FynxError extends Error {
  constructor(status, code, message, requestId) {
    super(message);
    this.name = 'FynxError';
    this.status = status;       // HTTP status, e.g. 422
    this.code = code;           // e.g. 'invalid_input', 'permission-denied'
    this.requestId = requestId; // X-Request-Id, when present
  }
}

export class Fynx {
  constructor(apiKey, { baseUrl = DEFAULT_BASE_URL, timeoutMs = 15000, maxRetries = 2 } = {}) {
    if (!/^fynx_(test|live)_[a-f0-9]{64}$/.test(apiKey || '')) throw new Error('Provide a FYNX API key (fynx_test_… or fynx_live_…).');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
  }

  /** Low-level request. Retries 429 and 5xx with exponential backoff. */
  async request(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(this.baseUrl + path, {
        method,
        headers: { Authorization: `Bearer ${this.apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < this.maxRetries) { await new Promise(r => setTimeout(r, 500 * 2 ** attempt)); continue; }
      throw new FynxError(res.status, data?.error?.code || 'http_error', data?.error?.message || `HTTP ${res.status}`, res.headers.get('X-Request-Id'));
    }
  }

  /** Risk: position-size, risk-reward, pip-value, margin, break-even, atr-stop */
  risk(name, input) { return this.request('POST', `/v1/risk/${name}`, input); }
  /** Indicators: sma, ema, rsi, macd, bollinger, atr, stochastic, vwap, screen */
  indicators(name, input) { return this.request('POST', `/v1/indicators/${name}`, input); }
  /** Market hours: status, holidays, sessions, exchanges */
  markets(name, input = {}) { return this.request('POST', `/v1/markets/${name}`, input); }
  /** Portfolio: performance, drawdown, exposure */
  portfolio(name, input) { return this.request('POST', `/v1/portfolio/${name}`, input); }

  /** Prop firm rules */
  propfirm = {
    createRuleSet: input => this.request('POST', '/v1/propfirm/rule-sets', input),
    createAccount: input => this.request('POST', '/v1/propfirm/accounts', input),
    addEvent: (accountId, input) => this.request('POST', `/v1/propfirm/accounts/${encodeURIComponent(accountId)}/events`, input),
    status: accountId => this.request('GET', `/v1/propfirm/accounts/${encodeURIComponent(accountId)}/status`),
    events: (accountId, { before, beforeId } = {}) => this.request('GET', `/v1/propfirm/accounts/${encodeURIComponent(accountId)}/events${before ? `?before=${encodeURIComponent(before)}&beforeId=${encodeURIComponent(beforeId)}` : ''}`),
  };
}
