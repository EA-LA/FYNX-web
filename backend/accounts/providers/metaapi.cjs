'use strict';
const { createHash } = require('node:crypto');
const { ProviderError, createTransport, safeId, nonempty, array, iso, evidence, requireReadOnly, bounded } = require('./transport.cjs');
const { metaAccount, metaPosition, metaDeal } = require('./normalize.cjs');
const SOURCE = 'https://metaapi.cloud/docs/client/models/metatraderAccountInformation/';
const PROVISIONING = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
const REGIONS = Object.freeze(['new-york', 'london', 'singapore', 'tokyo']);
const idPath = '[A-Za-z0-9_-]{1,100}';
const provisioningRules = [
  { method: 'GET', path: /^\/known-mt-servers\/[45]\/search$/, query: ['query'] },
  { method: 'POST', path: /^\/users\/current\/accounts$/, query: [] },
  { method: 'GET', path: /^\/users\/current\/accounts$/, query: ['query', 'offset', 'limit'] },
  { method: 'GET', path: new RegExp(`^/users/current/accounts/${idPath}$`), query: [] },
  { method: 'DELETE', path: new RegExp(`^/users/current/accounts/${idPath}$`), query: [] },
];
const clientRules = [
  { method: 'GET', path: new RegExp(`^/users/current/accounts/${idPath}/account-information$`), query: ['refreshTerminalState'] },
  { method: 'GET', path: new RegExp(`^/users/current/accounts/${idPath}/positions$`), query: ['refreshTerminalState'] },
  { method: 'GET', path: new RegExp(`^/users/current/accounts/${idPath}/history-deals/time/[0-9T:.Z%-]+/[0-9T:.Z%-]+$`), query: ['offset', 'limit'] },
];
function metaReadOnly(row, now = Date.now) {
  const verified = row?.investorMode === true && row?.tradeAllowed === false;
  return evidence(verified, 'MetaApi cloud-g2 investorMode and terminal tradeAllowed', SOURCE, now, verified ? false : row?.tradeAllowed === true ? true : null, verified ? false : null);
}
function createMetaApi(id, options = {}) {
  const { env = process.env, now = Date.now } = options;
  const region = env.ACCOUNTS_METAAPI_REGION || 'new-york';
  const configured = !!env.ACCOUNTS_METAAPI_TOKEN && REGIONS.includes(region);
  const enabled = env[`ACCOUNTS_${id.toUpperCase()}_ENABLED`] === 'true' && configured;
  const transportOptions = { ...options, provider: id, timeoutMs: bounded(env.ACCOUNTS_PROVIDER_TIMEOUT_MS, 10000, 500, 30000), perMinute: bounded(env.ACCOUNTS_PROVIDER_REQUESTS_PER_MINUTE, 60, 1, 600) };
  const provision = createTransport({ ...transportOptions, origin: PROVISIONING, rules: provisioningRules });
  const client = createTransport({ ...transportOptions, origin: `https://mt-client-api-v1.${REGIONS.includes(region) ? region : 'new-york'}.agiliumtrade.ai`, rules: clientRules });
  const headers = { 'auth-token': env.ACCOUNTS_METAAPI_TOKEN || '' };
  const context = new WeakMap();
  function gate() { if (!enabled) throw new ProviderError('PROVIDER_DISABLED'); }
  async function info(conn, signal, fresh = false) {
    gate(); safeId(conn.externalId);
    const previous = context.get(conn);
    if (!fresh && previous && now() - previous.checked < 10000) return previous;
    const terminal = (await provision.request('GET', `/users/current/accounts/${conn.externalId}`, { headers, signal })).data;
    const version = id === 'mt4' ? 4 : 5;
    if (terminal?.type !== 'cloud-g2' || (terminal.version !== version && terminal.platform !== id) || (terminal.version != null && terminal.version !== version) || (terminal.platform != null && terminal.platform !== id) || terminal?.region !== region) throw new ProviderError('PROVIDER_SCHEMA');
    if (terminal.connectionStatus !== 'CONNECTED') throw new ProviderError('PROVIDER_PENDING', { retryAfterSeconds: 15 });
    const row = (await client.request('GET', `/users/current/accounts/${conn.externalId}/account-information`, { headers, query: { refreshTerminalState: true }, signal })).data;
    const proof = requireReadOnly(metaReadOnly(row, now));
    const result = { row, proof, account: metaAccount(row, new Date(now()).toISOString()), checked: now() }; context.set(conn, result); return result;
  }
  const adapter = {
    id, kind: 'login', enabled, configured,
    descriptor: { id, name: id.toUpperCase(), kind: 'login', enabled, configured, reason: enabled ? null : 'MetaApi cloud-g2 access and an explicit feature flag are required.', helpURL: 'https://www.metatrader5.com/en/terminal/help/startworking/authorization', serverSearch: true, scope: 'Investor login; account, open positions and broker deal history', limits: { activePollSeconds: 15, backgroundPollSeconds: 300, historyMaxPages: bounded(env.ACCOUNTS_PROVIDER_HISTORY_MAX_PAGES, 20, 1, 200) } },
    async searchServers(query, { signal } = {}) {
      gate(); nonempty(query, 100); if (query.trim().length < 2) return [];
      const rows = (await provision.request('GET', `/known-mt-servers/${id === 'mt4' ? 4 : 5}/search`, { headers, query: { query: query.trim() }, signal })).data;
      if (!rows || typeof rows !== 'object' || Array.isArray(rows)) throw new ProviderError('PROVIDER_SCHEMA');
      return Object.entries(rows).flatMap(([broker, servers]) => array(servers).map(server => ({ broker: String(broker).slice(0, 160), server: nonempty(server, 160) }))).slice(0, 100);
    },
    async connect(input, { signal, idempotencyKey, onProvisioned } = {}) {
      gate();
      if (!input || Object.keys(input).some(k => !['login', 'investorPassword', 'server'].includes(k)) || !/^\d{1,20}$/.test(input.login || '')) throw new ProviderError('PROVIDER_INPUT');
      nonempty(input.investorPassword, 256); nonempty(input.server, 160); nonempty(idempotencyKey, 200);
      const servers = await adapter.searchServers(input.server, { signal });
      if (!servers.some(row => row.server === input.server)) throw new ProviderError('PROVIDER_INPUT');
      // Only a stable worker-generated key is used; never retry provisioning under a new transaction id.
      const transaction = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32);
      const created = await provision.request('POST', '/users/current/accounts', { headers: { ...headers, 'transaction-id': transaction }, body: { login: input.login, password: input.investorPassword, server: input.server, platform: id, type: 'cloud-g2', region, name: `FYNX-RO-${transaction}`, metadata: { fynxReadOnlyOperation: transaction }, magic: 0, manualTrades: true, baseCurrency: 'USD', resourceSlots: 1, riskManagementApiEnabled: false, metastatsApiEnabled: false }, signal });
      const externalId = safeId(created.data?.id); const conn = { externalId };
      try {
        if (onProvisioned) await onProvisioned({ externalId, provider: id });
        const current = await info(conn, signal, true);
        return { externalId, readOnlyEvidence: current.proof, readOnlyVerified: true, metadata: { currency: current.account.currency, maskedLogin: `••••${input.login.slice(-4)}`, region, accountMode: current.row.marginMode === 'ACCOUNT_MARGIN_MODE_RETAIL_HEDGING' ? 'hedging' : 'netting', scope: adapter.descriptor.scope } };
      } catch (error) {
        // Pending connections can be resumed from the durable external ID, without retaining the password.
        if (error.code === 'PROVIDER_PENDING') { error.externalId = externalId; throw error; }
        try { await adapter.disconnect(conn); } catch { /* Durable onProvisioned cleanup identity remains available to the service. */ }
        const safe = error instanceof ProviderError ? error : new ProviderError('PROVIDER_UNAVAILABLE'); safe.externalId = externalId; throw safe;
      }
    },
    async verifyReadOnly(conn, { signal } = {}) { try { return (await info(conn, signal, true)).proof; } catch (error) { if (error.code === 'READ_ONLY_REQUIRED') return error.readOnlyEvidence; throw error; } },
    async fetchAccount(conn, { signal } = {}) { return (await info(conn, signal)).account; },
    async fetchPositions(conn, { signal } = {}) { const current = await info(conn, signal); const rows = array((await client.request('GET', `/users/current/accounts/${safeId(conn.externalId)}/positions`, { headers, query: { refreshTerminalState: true }, signal })).data); return rows.map(row => metaPosition(row, current.account, new Date(now()).toISOString())); },
    async fetchHistory(conn, since, { signal } = {}) {
      const current = await info(conn, signal), to = new Date(now()).toISOString(), from = iso(since || '1970-01-01T00:00:00Z');
      if (Date.parse(from) >= Date.parse(to)) throw new ProviderError('PROVIDER_INPUT');
      const deals = [], seen = new Set(), maxPages = adapter.descriptor.limits.historyMaxPages;
      for (let page = 0; page < maxPages; page++) {
        const rows = array((await client.request('GET', `/users/current/accounts/${safeId(conn.externalId)}/history-deals/time/${from}/${to}`, { headers, query: { offset: page * 1000, limit: 1000 }, signal })).data);
        for (const row of rows) { const normalized = metaDeal(row, current.account.currency); if (!seen.has(normalized.externalId)) { seen.add(normalized.externalId); deals.push(normalized); } }
        if (rows.length < 1000) return { deals, complete: true, from, to, notes: ['Complete for the requested provider time range; broker-retained history may begin later. Historical FX conversion and initial-stop risk remain unavailable unless recorded.'] };
      }
      return { deals, complete: false, from, to, notes: ['History page budget reached. Coverage remains incomplete; continue in a later history job.'] };
    },
    async disconnect(conn, { signal } = {}) {
      // Cleanup remains available after the feature flag is disabled; it needs only the service key and remote ID.
      if (!configured) throw new ProviderError('PROVIDER_DISABLED');
      try { await provision.request('DELETE', `/users/current/accounts/${safeId(conn.externalId)}`, { headers, signal }); } catch (error) { if (error.upstreamStatus !== 404) throw error; }
      context.delete(conn); return { revoked: true, manualRevocationRequired: false };
    },
    async cleanupByIdempotencyKey(idempotencyKey, { signal } = {}) {
      if (!configured) throw new ProviderError('PROVIDER_DISABLED');
      nonempty(idempotencyKey, 200);
      const operation = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32), name = `FYNX-RO-${operation}`;
      const rows = array((await provision.request('GET', '/users/current/accounts', { headers: { ...headers, 'api-version': '1' }, query: { query: name, offset: 0, limit: 1000 }, signal })).data);
      let removed = 0;
      for (const row of rows) {
        // A fuzzy search match is not enough to authorize deletion of a service account.
        if (row.name !== name || row.metadata?.fynxReadOnlyOperation !== operation || row.type !== 'cloud-g2' || row.region !== region || (row.version !== (id === 'mt4' ? 4 : 5) && row.platform !== id)) continue;
        await adapter.disconnect({ externalId: safeId(row._id) }, { signal }); removed++;
      }
      return { removed, resolved: removed > 0 && rows.length < 1000, retryRequired: removed === 0 || rows.length >= 1000, reason: removed === 0 ? 'No provisioned account was found yet. An accepted asynchronous request may still complete; keep cleanup pending and escalate unresolved requests for provider review.' : null };
    },
  };
  return adapter;
}
module.exports = { createMetaApi, metaReadOnly, provisioningRules, clientRules, REGIONS };
