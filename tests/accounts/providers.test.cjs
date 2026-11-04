'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistry, GATED } = require('../../backend/accounts/providers/index.cjs');
const { createTransport, ProviderError } = require('../../backend/accounts/providers/transport.cjs');
const { createMetaApi, metaReadOnly, clientRules, provisioningRules } = require('../../backend/accounts/providers/metaapi.cjs');
const { createBinance, createBybit, binanceReadOnly, bybitReadOnly, BINANCE_WRITES, binanceRules, bybitRules } = require('../../backend/accounts/providers/exchanges.cjs');

// Documentation-derived response shapes, not recordings from real user accounts.
const NOW = Date.parse('2026-11-03T12:00:00Z');
const now = () => NOW;
const json = (value, status = 200) => new Response(value == null ? null : JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const binanceProof = () => ({ enableReading: true, ...Object.fromEntries(BINANCE_WRITES.map(key => [key, false])), enableFixReadOnly: true, ipRestrict: true });
const bybitProof = (apiKey = 'test-key') => ({ apiKey, userID: '12345', uta: 1, readOnly: 1, isFixApi: false, permissions: { ContractTrade: ['Order', 'Position'], Spot: ['SpotTrade'], Wallet: ['AccountTransfer'], Derivatives: ['DerivativesTrade'] } });
const accountInfo = overrides => ({ platform: 'mt5', currency: 'USD', balance: 10000, equity: 10020, margin: 50, freeMargin: 9970, leverage: 100, credit: 0, investorMode: true, tradeAllowed: false, ...overrides });
const envMT = { ACCOUNTS_MT5_ENABLED: 'true', ACCOUNTS_METAAPI_TOKEN: 'test-service-secret', ACCOUNTS_METAAPI_REGION: 'new-york' };

test('every external provider defaults off and gated providers cannot be enabled by a flag', async () => {
  let calls = 0; const registry = createRegistry({ env: {}, fetchImpl: async () => { calls++; throw new Error('must not connect'); } });
  assert.equal(registry.list().length, 10);
  for (const entry of registry.list()) { assert.equal(entry.enabled, false); await assert.rejects(registry.get(entry.id).connect({ apiKey: 'canary', apiSecret: 'canary' }), { code: 'PROVIDER_DISABLED' }); }
  for (const row of GATED) { const forced = createRegistry({ env: { [`ACCOUNTS_${row.id.toUpperCase()}_ENABLED`]: 'true' } }).get(row.id); assert.equal(forced.enabled, false); assert.equal((await forced.verifyReadOnly({})).verified, false); }
  assert.equal(calls, 0); assert.throws(() => registry.get('https://evil.example'), { code: 'PROVIDER_INPUT' });
});
test('MetaApi requires positive investor proof; disabled master accounts are not readonly', () => {
  assert.equal(metaReadOnly({ investorMode: true, tradeAllowed: false }, now).verified, true);
  for (const row of [{ tradeAllowed: false }, { investorMode: false, tradeAllowed: false }, { investorMode: true, tradeAllowed: true }, { investorMode: 'true', tradeAllowed: false }]) assert.equal(metaReadOnly(row, now).verified, false);
});
test('Binance fails closed on missing, unknown or any enabled financial capability', () => {
  assert.equal(binanceReadOnly(binanceProof(), now).verified, true);
  for (const key of BINANCE_WRITES) { assert.equal(binanceReadOnly({ ...binanceProof(), [key]: true }, now).verified, false, key); const missing = binanceProof(); delete missing[key]; assert.equal(binanceReadOnly(missing, now).verified, false, key); }
  assert.equal(binanceReadOnly({ ...binanceProof(), enableNewTradeProduct: false }, now).verified, false);
  assert.equal(binanceReadOnly({ ...binanceProof(), enableReading: 'true' }, now).verified, false);
});
test('Bybit honors global readonly despite product labels and rejects withdrawal, FIX and unknown rights', () => {
  assert.equal(bybitReadOnly(bybitProof(), 'test-key', now).verified, true);
  for (const patch of [{ readOnly: 0 }, { readOnly: '1' }, { isFixApi: true }, { apiKey: 'wrong-key' }, { permissions: { Wallet: ['Withdraw'] } }, { permissions: { Wallet: [], NewTradingScope: ['Read'] } }, { permissions: { Wallet: [], Compliance: ['ComplianceAppeal'] } }]) assert.equal(bybitReadOnly({ ...bybitProof(), ...patch }, 'test-key', now).verified, false);
});
test('transport refuses trade endpoints, query injection, foreign origins and redirects before credentials leave', async () => {
  let calls = 0;
  for (const [origin, rules, denied] of [['https://api.binance.com', binanceRules, '/api/v3/order'], ['https://api.bybit.com', bybitRules, '/v5/order/create'], ['https://mt-client-api-v1.new-york.agiliumtrade.ai', clientRules, '/users/current/accounts/test/trade']]) {
    const client = createTransport({ origin, rules, fetchImpl: async () => { calls++; return json({}); } });
    for (const path of [denied, 'https://evil.example/a', '//evil.example/a', '/api/v3/../order', '/api/v3/account?x=1']) await assert.rejects(client.request('POST', path, { body: { secret: 'canary' } }), { code: 'ENDPOINT_DENIED' });
  }
  const client = createTransport({ origin: 'https://api.binance.com', rules: binanceRules, fetchImpl: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://evil.example' } }); } });
  await assert.rejects(client.request('GET', '/api/v3/account', { query: { secret: 'canary' } }), { code: 'ENDPOINT_DENIED' });
  assert.equal(calls, 0);
  await assert.rejects(client.request('GET', '/api/v3/account'), { code: 'ENDPOINT_DENIED' }); assert.equal(calls, 1);
  assert.equal(provisioningRules.some(rule => rule.method === 'PUT'), false);
});
test('transport scrubs upstream exceptions/bodies and bounds retry, circuit, request and body budgets', async () => {
  let calls = 0; const errors = [];
  const client = createTransport({ origin: 'https://api.binance.com', rules: binanceRules, now, sleep: async () => {}, fetchImpl: async () => { calls++; throw new Error('secret-CANARY https://key@provider.example'); } });
  for (let i = 0; i < 3; i++) { try { await client.request('GET', '/api/v3/account'); } catch (e) { errors.push(e); } }
  assert.equal(calls, 5); assert.ok(errors.every(e => e instanceof ProviderError && !JSON.stringify(e).includes('CANARY') && !String(e).includes('CANARY')));
  const quota = createTransport({ origin: 'https://api.binance.com', rules: binanceRules, now, perMinute: 1, fetchImpl: async () => json({}) });
  await quota.request('GET', '/api/v3/account'); await assert.rejects(quota.request('GET', '/api/v3/account'), { code: 'PROVIDER_RATE_LIMIT' });
  const huge = createTransport({ origin: 'https://api.binance.com', rules: binanceRules, maxBytes: 20, fetchImpl: async () => json({ secret: 'x'.repeat(100) }) });
  await assert.rejects(huge.request('GET', '/api/v3/account'), { code: 'PROVIDER_SCHEMA' });
});
test('durable quota hook gates every outbound attempt and never receives credentials or query signatures', async () => {
  const seen = []; let calls = 0;
  const adapter = createBinance({ env: { ACCOUNTS_BINANCE_ENABLED: 'true' }, now, beforeRequest: async record => { seen.push(record); return { allowed: false, retryAfterSeconds: 12 }; }, fetchImpl: async () => { calls++; return json(binanceProof()); } });
  await assert.rejects(adapter.verifyReadOnly({ credential: { apiKey: 'test-key', apiSecret: 'secret-CANARY' } }), e => e.code === 'PROVIDER_RATE_LIMIT' && e.retryAfterSeconds === 12);
  assert.equal(calls, 0); assert.deepEqual(seen, [{ provider: 'binance', method: 'GET', path: '/sapi/v1/account/apiRestrictions' }]);
});
test('MetaApi provisioning uses investor input, durable cleanup callback and deletes a refused account', async () => {
  const calls = [], persisted = [];
  const adapter = createMetaApi('mt5', { env: envMT, now, fetchImpl: async (url, options) => {
    const parsed = new URL(url); calls.push({ path: parsed.pathname, ...options });
    if (parsed.pathname.startsWith('/known')) return json({ Broker: ['Broker-Demo'] });
    if (options.method === 'POST') return json({ id: 'remote-test', state: 'DEPLOYED' }, 201);
    if (options.method === 'DELETE') return json(null, 204);
    if (parsed.pathname.endsWith('account-information')) return json(accountInfo({ investorMode: false, tradeAllowed: true }));
    return json({ type: 'cloud-g2', platform: 'mt5', region: 'new-york', connectionStatus: 'CONNECTED' });
  } });
  await assert.rejects(adapter.connect({ login: '123456', investorPassword: 'test-investor-secret', server: 'Broker-Demo' }, { idempotencyKey: 'worker-id-1', onProvisioned: async row => persisted.push(row) }), { code: 'READ_ONLY_REQUIRED' });
  assert.deepEqual(persisted, [{ externalId: 'remote-test', provider: 'mt5' }]); assert.equal(calls.at(-1).method, 'DELETE');
  const posted = JSON.parse(calls.find(c => c.method === 'POST').body); assert.equal(posted.type, 'cloud-g2'); assert.equal(posted.password, 'test-investor-secret'); assert.equal(posted.resourceSlots, 1); assert.equal(posted.baseCurrency, 'USD');
  assert.match(calls.find(c => c.method === 'POST').headers['transaction-id'], /^[a-f0-9]{32}$/);
});
test('MetaApi accepted connection retains only provider id and fetches real paged deals', async () => {
  const calls = []; const adapter = createMetaApi('mt5', { env: envMT, now, fetchImpl: async (url, options) => {
    const p = new URL(url); calls.push(p.pathname);
    if (p.pathname.startsWith('/known')) return json({ Broker: ['Broker-Demo'] });
    if (options.method === 'POST') return json({ id: 'remote-test' }, 201);
    if (p.pathname.endsWith('account-information')) return json(accountInfo());
    if (p.pathname.includes('history-deals')) return json([{ id: 'deal-1', type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_IN', positionId: 'position-1', orderId: 'order-1', time: '2026-11-01T10:00:00Z', symbol: 'EURUSD.r', volume: 0.1, price: 1.1, profit: 0, commission: -1, swap: 0, fee: 0 }]);
    if (p.pathname.endsWith('/positions')) return json([{ id: 'position-1', type: 'POSITION_TYPE_BUY', symbol: 'EURUSD.r', volume: .1, openPrice: 1.1, currentPrice: 1.101, unrealizedProfit: 10, stopLoss: 0 }]);
    return json({ type: 'cloud-g2', platform: 'mt5', region: 'new-york', connectionStatus: 'CONNECTED' });
  } });
  const result = await adapter.connect({ login: '123456', investorPassword: 'test-investor-secret', server: 'Broker-Demo' }, { idempotencyKey: 'worker-id' });
  assert.equal(JSON.stringify(result).includes('test-investor-secret'), false); assert.equal('credential' in result, false);
  const conn = { externalId: result.externalId }, history = await adapter.fetchHistory(conn, '2026-11-01T00:00:00Z');
  assert.equal(history.complete, true); assert.equal(history.deals[0].netPnl, -1); assert.equal(history.deals[0].positionId, 'position-1');
  const positions = await adapter.fetchPositions(conn); assert.equal(positions[0].riskToStop, null); assert.equal(positions[0].stopLoss, null);
  assert.equal((await adapter.fetchAccount(conn)).floatingPL, 20); assert.ok(calls.some(p => p.includes('2026-11-01T00:00:00.000Z')));
});
test('MetaApi cleanup works after disabling the feature and idempotently accepts missing remote account', async () => {
  const adapter = createMetaApi('mt5', { env: { ...envMT, ACCOUNTS_MT5_ENABLED: 'false' }, fetchImpl: async () => json({}, 404) });
  assert.deepEqual(await adapter.disconnect({ externalId: 'deleted-id' }), { revoked: true, manualRevocationRequired: false });
});
test('asynchronous MetaApi orphan cleanup requires exact operation metadata and never calls absence resolved', async () => {
  const { createHash } = require('node:crypto'); const operation = createHash('sha256').update('worker-1').digest('hex').slice(0, 32); let rows = [], deletes = [];
  const adapter = createMetaApi('mt5', { env: envMT, now, fetchImpl: async (url, options) => { if (options.method === 'DELETE') { deletes.push(new URL(url).pathname); return json(null, 204); } return json(rows); } });
  assert.equal((await adapter.cleanupByIdempotencyKey('worker-1')).resolved, false);
  const exact = { _id: 'owned', name: `FYNX-RO-${operation}`, metadata: { fynxReadOnlyOperation: operation }, type: 'cloud-g2', region: 'new-york', version: 5 };
  rows = [exact, { ...exact, _id: 'unrelated', metadata: {} }, { ...exact, _id: 'other-region', region: 'london' }];
  const result = await adapter.cleanupByIdempotencyKey('worker-1'); assert.equal(result.removed, 1); assert.equal(result.resolved, true); assert.deepEqual(deletes, ['/users/current/accounts/owned']);
});
test('Binance signs reads, rechecks changed permissions and never labels native USDT as USD equity', async () => {
  let writable = false; const calls = []; const adapter = createBinance({ env: { ACCOUNTS_BINANCE_ENABLED: 'true' }, now, fetchImpl: async (url, options) => {
    const u = new URL(url); calls.push({ u, options }); assert.equal(options.method, 'GET'); assert.equal(u.searchParams.has('apiSecret'), false); assert.equal(options.headers['X-MBX-APIKEY'], 'test-key');
    return json(u.pathname.endsWith('apiRestrictions') ? { ...binanceProof(), enableWithdrawals: writable } : { uid: 12345, balances: [{ asset: 'USDT', free: '100', locked: '20' }, { asset: 'BTC', free: '1', locked: '0' }] });
  } });
  const connected = await adapter.connect({ apiKey: 'test-key', apiSecret: 'test-secret', quoteCurrency: 'USDT', symbols: ['BTCUSDT'] });
  const row = await adapter.fetchAccount(connected); assert.equal(row.balance, 120); assert.equal(row.equity, null); assert.equal(row.usd, null); assert.equal(row.currency, 'USDT'); assert.equal(row.assets.length, 2); assert.equal(row.coverage.positionsComplete, false);
  assert.match(calls[0].u.searchParams.get('signature'), /^[a-f0-9]{64}$/);
  writable = true; await assert.rejects(adapter.fetchPositions(connected), { code: 'READ_ONLY_REQUIRED' });
  assert.equal((await adapter.disconnect()).manualRevocationRequired, true);
});
test('Bybit actual USDT snapshots, position schema and incomplete history never synthesize USD or initial risk', async () => {
  const adapter = createBybit({ env: { ACCOUNTS_BYBIT_ENABLED: 'true', ACCOUNTS_PROVIDER_HISTORY_MAX_PAGES: '2' }, now, fetchImpl: async (url, options) => {
    assert.equal(options.method, 'GET'); assert.match(options.headers['X-BAPI-SIGN'], /^[a-f0-9]{64}$/);
    const path = new URL(url).pathname; let result;
    if (path.endsWith('query-api')) result = bybitProof();
    else if (path.endsWith('wallet-balance')) result = { list: [{ accountType: 'UNIFIED', coin: [{ coin: 'USDT', walletBalance: '100', equity: '110', unrealisedPnl: '10', totalPositionIM: '5' }] }] };
    else if (path.endsWith('/position/list')) result = { list: [{ symbol: 'BTCUSDT', positionIdx: 1, size: '.01', side: 'Buy', avgPrice: '50000', markPrice: '51000', stopLoss: '0', takeProfit: '52000', unrealisedPnl: '10' }] };
    else result = { list: [{ id: 't1', transactionTime: String(NOW - 3600000), type: 'TRADE', category: 'linear', currency: 'USDT', symbol: 'BTCUSDT', side: 'Sell', qty: '0.01', tradePrice: '51000', cashFlow: '10', fee: '.2', funding: '0', change: '9.8', cashBalance: '109.8' }] };
    return json({ retCode: 0, result });
  } });
  const conn = await adapter.connect({ apiKey: 'test-key', apiSecret: 'test-secret' }); const row = await adapter.fetchAccount(conn);
  assert.equal(row.currency, 'USDT'); assert.equal(row.usd, null); assert.equal(row.equity, 110);
  const positions = await adapter.fetchPositions(conn); assert.equal(positions[0].lots, null); assert.equal(positions[0].riskToStop, null);
  const history = await adapter.fetchHistory(conn, new Date(NOW - 86400000).toISOString()); assert.equal(history.complete, false); assert.equal(history.deals[0].commission, -.2); assert.equal(history.deals[0].netPnl, 9.8); assert.equal(history.deals[0].initialRisk, null);
});
