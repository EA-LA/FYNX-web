'use strict';
const { createHmac, createHash, timingSafeEqual } = require('node:crypto');
const { ProviderError, createTransport, nonempty, finite, array, iso, evidence, requireReadOnly, bounded } = require('./transport.cjs');
const { currency, coverage, snapshot, position, deal, positiveStop, identifier, optionalNumber } = require('./normalize.cjs');
const BINANCE_SOURCE = 'https://developers.binance.com/en/docs/catalog/core-trading-wallet/api/rest-api/account';
const BYBIT_SOURCE = 'https://bybit-exchange.github.io/docs/v5/user/apikey-info';
const BINANCE_WRITES = Object.freeze(['enableWithdrawals', 'enableInternalTransfer', 'enableMargin', 'enableFutures', 'permitsUniversalTransfer', 'enableVanillaOptions', 'enableFixApiTrade', 'enableSpotAndMarginTrading', 'enablePortfolioMarginTrading']);
function binanceReadOnly(row, now = Date.now) {
  const unknown = row && Object.keys(row).some(k => /^(enable|permit)/i.test(k) && ![...BINANCE_WRITES, 'enableReading', 'enableFixReadOnly'].includes(k));
  const verified = !!row && row.enableReading === true && BINANCE_WRITES.every(k => row[k] === false) && !unknown;
  return evidence(verified, 'Signed Binance apiRestrictions; all documented trade, transfer and withdrawal flags disabled', BINANCE_SOURCE, now, verified ? false : BINANCE_WRITES.filter(k => k !== 'enableWithdrawals').some(k => row?.[k] === true) ? true : null, row?.enableWithdrawals === true ? true : verified ? false : null);
}
const BYBIT_PERMISSIONS = Object.freeze({ ContractTrade: ['Order', 'Position'], Spot: ['SpotTrade'], Wallet: ['AccountTransfer', 'SubMemberTransfer', 'SubMemberTransferList'], Options: ['OptionsTrade'], Derivatives: ['DerivativesTrade'], Exchange: ['ExchangeHistory'], Earn: ['Earn'], FiatP2P: [], FiatBitPay: [], FiatConvertBroker: [], BitCard: [], ByXPost: [], Affiliate: [], BlockTrade: [], NFT: [], CopyTrading: [], Compliance: [] });
function bybitReadOnly(row, apiKey, now = Date.now) {
  const expected = Buffer.from(apiKey || ''), actual = Buffer.from(typeof row?.apiKey === 'string' ? row.apiKey : '');
  const sameKey = expected.length > 0 && actual.length === expected.length && timingSafeEqual(actual, expected);
  const permissions = row?.permissions;
  const known = permissions && typeof permissions === 'object' && !Array.isArray(permissions) && Array.isArray(permissions.Wallet) && Object.entries(permissions).every(([key, values]) => BYBIT_PERMISSIONS[key] && Array.isArray(values) && values.every(value => BYBIT_PERMISSIONS[key].includes(value)));
  // The provider's global readOnly=1 overrides named product categories such as Order and SpotTrade.
  // Separate withdrawal/unknown/FIX rights still fail closed; do not infer readonly from empty groups.
  const verified = !!(sameKey && row.readOnly === 1 && known && row.isFixApi === false);
  return evidence(verified, 'Signed Bybit query-api: global readOnly=1, known permission schema, no withdrawal/FIX rights', BYBIT_SOURCE, now, verified ? false : row?.readOnly === 0 ? true : null, permissions?.Wallet?.includes('Withdraw') ? true : verified ? false : null);
}
const binanceRules = [
  { method: 'GET', path: /^\/sapi\/v1\/account\/apiRestrictions$/, query: ['timestamp', 'recvWindow', 'signature'] },
  { method: 'GET', path: /^\/api\/v3\/account$/, query: ['timestamp', 'recvWindow', 'signature', 'omitZeroBalances'] },
  { method: 'GET', path: /^\/api\/v3\/myTrades$/, query: ['timestamp', 'recvWindow', 'signature', 'symbol', 'startTime', 'endTime', 'fromId', 'limit'] },
  { method: 'GET', path: /^\/sapi\/v1\/capital\/deposit\/hisrec$/, query: ['timestamp', 'recvWindow', 'signature', 'coin', 'startTime', 'endTime', 'offset', 'limit'] },
  { method: 'GET', path: /^\/sapi\/v1\/capital\/withdraw\/history$/, query: ['timestamp', 'recvWindow', 'signature', 'coin', 'startTime', 'endTime', 'offset', 'limit'] },
];
const bybitRules = [
  { method: 'GET', path: /^\/v5\/user\/query-api$/, query: [] },
  { method: 'GET', path: /^\/v5\/account\/wallet-balance$/, query: ['accountType', 'coin'] },
  { method: 'GET', path: /^\/v5\/position\/list$/, query: ['category', 'settleCoin', 'limit', 'cursor'] },
  { method: 'GET', path: /^\/v5\/account\/transaction-log$/, query: ['accountType', 'currency', 'startTime', 'endTime', 'limit', 'cursor'] },
];
function credentials(input, allowed) {
  if (!input || typeof input !== 'object' || Object.keys(input).some(k => !allowed.includes(k))) throw new ProviderError('PROVIDER_INPUT');
  nonempty(input.apiKey, 512); nonempty(input.apiSecret, 512);
  if (!/^[A-Za-z0-9_-]+$/.test(input.apiKey) || !/^[A-Za-z0-9_-]+$/.test(input.apiSecret)) throw new ProviderError('PROVIDER_INPUT');
  return input;
}
function setup(id, options, origin, rules) {
  const env = options.env || process.env, now = options.now || Date.now;
  const transport = createTransport({ ...options, provider: id, origin, rules, perMinute: bounded(env.ACCOUNTS_PROVIDER_REQUESTS_PER_MINUTE, 60, 1, 600), timeoutMs: bounded(env.ACCOUNTS_PROVIDER_TIMEOUT_MS, 10000, 500, 30000) });
  const enabled = env[`ACCOUNTS_${id.toUpperCase()}_ENABLED`] === 'true';
  return { env, now, transport, enabled, maxPages: bounded(env.ACCOUNTS_PROVIDER_HISTORY_MAX_PAGES, 20, 1, 200), gate() { if (!enabled) throw new ProviderError('PROVIDER_DISABLED'); } };
}
function createBinance(options = {}) {
  const config = setup('binance', options, 'https://api.binance.com', binanceRules), { now } = config;
  async function request(conn, path, query = {}, signal) {
    config.gate(); const cred = credentials(conn.credential, ['apiKey', 'apiSecret', 'quoteCurrency', 'symbols']);
    const params = new URLSearchParams({ ...query, timestamp: String(now()), recvWindow: '5000' });
    const signature = createHmac('sha256', cred.apiSecret).update(params.toString()).digest('hex');
    return (await config.transport.request('GET', path, { query: { ...Object.fromEntries(params), signature }, headers: { 'X-MBX-APIKEY': cred.apiKey }, signal })).data;
  }
  const adapter = {
    id: 'binance', kind: 'apikey', enabled: config.enabled, configured: true,
    descriptor: { id: 'binance', name: 'Binance Spot', kind: 'apikey', enabled: config.enabled, configured: true, reason: config.enabled ? null : 'Exchange connections are disabled until regional access and terms are approved.', helpURL: 'https://www.binance.com/en/support/faq/detail/360002502072', scope: 'Spot asset balances; selected-symbol history, not Futures/Margin or a complete consolidated portfolio', serverSearch: false, fields: ['apiKey', 'apiSecret', 'quoteCurrency', 'symbols'], limits: { activePollSeconds: 15, backgroundPollSeconds: 300, historyMaxPages: config.maxPages } },
    async connect(input, { signal } = {}) {
      config.gate(); credentials(input, ['apiKey', 'apiSecret', 'quoteCurrency', 'symbols']);
      const quoteCurrency = currency(input.quoteCurrency || 'USDT');
      const symbols = array(input.symbols || []).map(s => { if (typeof s !== 'string' || !/^[A-Z0-9]{5,24}$/.test(s) || !s.endsWith(quoteCurrency)) throw new ProviderError('PROVIDER_INPUT'); return s; });
      if (symbols.length > 20 || new Set(symbols).size !== symbols.length) throw new ProviderError('PROVIDER_INPUT');
      const credential = { apiKey: input.apiKey, apiSecret: input.apiSecret, quoteCurrency, symbols }, conn = { credential };
      const proof = requireReadOnly(await adapter.verifyReadOnly(conn, { signal }));
      const account = await request(conn, '/api/v3/account', { omitZeroBalances: 'true' }, signal);
      const externalId = account.uid == null ? createHash('sha256').update(input.apiKey).digest('hex') : String(account.uid);
      return { externalId, credential, readOnlyEvidence: proof, readOnlyVerified: true, metadata: { currency: quoteCurrency, maskedLogin: `••••${externalId.slice(-4)}`, accountMode: 'netting', scope: adapter.descriptor.scope } };
    },
    async verifyReadOnly(conn, { signal } = {}) { return binanceReadOnly(await request(conn, '/sapi/v1/account/apiRestrictions', {}, signal), now); },
    async fetchAccount(conn, { signal } = {}) {
      requireReadOnly(await adapter.verifyReadOnly(conn, { signal }));
      const row = await request(conn, '/api/v3/account', { omitZeroBalances: 'true' }, signal), c = currency(conn.credential.quoteCurrency);
      const assets = array(row.balances).map(item => ({ currency: currency(item.asset), free: finite(item.free), locked: finite(item.locked) }));
      const selected = assets.find(item => item.currency === c);
      // A missing asset in an omitZeroBalances response explicitly represents zero cash for that asset.
      return snapshot({ asOf: new Date(now()).toISOString(), balance: selected ? selected.free + selected.locked : 0, currency: c, source: 'Binance Spot account balances', assets, scope: { kind: 'currency', currency: c, description: `${c} cash balance only. Other assets are listed separately; total account equity, floating P&L and USD conversion are unavailable.` }, coverage: { ...coverage(['Selected-symbol Spot history is partial. No portfolio valuation or synthetic open positions is inferred from asset holdings.']), positionsComplete: false } });
    },
    async fetchPositions(conn, { signal } = {}) { requireReadOnly(await adapter.verifyReadOnly(conn, { signal })); return []; },
    async fetchHistory(conn, since, { signal } = {}) {
      requireReadOnly(await adapter.verifyReadOnly(conn, { signal }));
      const c = currency(conn.credential.quoteCurrency), toMs = now(), fromMs = since ? Date.parse(iso(since)) : toMs - 90 * 86400000;
      if (fromMs >= toMs) throw new ProviderError('PROVIDER_INPUT');
      const deals = [], notes = ['Spot history is limited to the explicitly selected symbols and deposit/withdrawal records in the selected cash currency. Internal transfers and unselected symbols are not a complete account ledger. Historical fee conversion is withheld when the fee asset differs.'];
      let requests = 0;
      for (const symbol of conn.credential.symbols) {
        // Binance time windows are limited to 24h. Pagination uses trade IDs within each window.
        for (let start = fromMs; start < toMs; start += 86400000) {
          const end = Math.min(start + 86400000 - 1, toMs); let next = null;
          for (;;) {
            if (requests++ >= config.maxPages) return { deals, complete: false, from: iso(fromMs), to: iso(toMs), notes: [...notes, 'History request budget reached.'] };
            const query = next == null ? { symbol, startTime: String(start), endTime: String(end), limit: '1000' } : { symbol, fromId: next, limit: '1000' };
            const rows = array(await request(conn, '/api/v3/myTrades', query, signal)); let inWindow = 0;
            for (const row of rows) {
              const time = finite(row.time); if (time < start || time > end) continue; inWindow++;
              const commission = row.commissionAsset === c ? -finite(row.commission) : null;
              deals.push(deal({ externalId: `${symbol}:${identifier(row.id)}`, time: iso(time), kind: 'trade', rawSymbol: symbol, side: row.isBuyer === true ? 'buy' : row.isBuyer === false ? 'sell' : (() => { throw new ProviderError('PROVIDER_SCHEMA'); })(), entryType: null, orderId: identifier(row.orderId), quantity: finite(row.qty), quantityUnit: 'units', price: finite(row.price), commission, swap: 0, fees: 0, currency: c, source: 'Binance Spot fills' }));
            }
            if (rows.length < 1000 || !inWindow || finite(rows.at(-1).time) > end) break;
            const last = identifier(rows.at(-1).id); if (!/^\d+$/.test(last)) throw new ProviderError('PROVIDER_SCHEMA'); const candidate = (BigInt(last) + 1n).toString(); if (candidate === next) throw new ProviderError('PROVIDER_SCHEMA'); next = candidate;
          }
        }
      }
      // Wallet APIs bound time ranges to 90 days. Pagination remains strictly bounded.
      for (let start = fromMs; start < toMs; start += 90 * 86400000) {
        for (const kind of ['deposit', 'withdrawal']) {
          for (let offset = 0; ; offset += 1000) {
            if (requests++ >= config.maxPages) return { deals, complete: false, from: iso(fromMs), to: iso(toMs), notes: [...notes, 'History request budget reached.'] };
            const path = kind === 'deposit' ? '/sapi/v1/capital/deposit/hisrec' : '/sapi/v1/capital/withdraw/history';
            const rows = array(await request(conn, path, { coin: c, startTime: String(start), endTime: String(Math.min(toMs, start + 90 * 86400000 - 1)), offset: String(offset), limit: '1000' }, signal));
            for (const row of rows) {
              if (row.status !== (kind === 'deposit' ? 1 : 6)) continue;
              const amount = finite(row.amount), time = kind === 'deposit' ? iso(finite(row.insertTime)) : iso(/Z$/.test(row.applyTime || '') ? row.applyTime : `${String(row.applyTime).replace(' ', 'T')}Z`);
              deals.push(deal({ externalId: `${kind}:${identifier(row.id || row.txId)}`, time, kind, currency: c, grossPnl: kind === 'deposit' ? amount : -amount, netPnl: kind === 'deposit' ? amount : -amount, source: 'Binance wallet history' }));
            }
            if (rows.length < 1000) break;
          }
        }
      }
      return { deals, complete: false, from: iso(fromMs), to: iso(toMs), notes };
    },
    async disconnect() { return { revoked: false, manualRevocationRequired: true, instructions: 'FYNX has removed its stored key. Delete the API key in Binance API Management to revoke it at the exchange.' }; },
  };
  return adapter;
}

function createBybit(options = {}) {
  const config = setup('bybit', options, 'https://api.bybit.com', bybitRules), { now } = config;
  async function request(conn, path, query = {}, signal) {
    config.gate(); const cred = credentials(conn.credential, ['apiKey', 'apiSecret']);
    const timestamp = String(now()), recvWindow = '5000', queryString = new URLSearchParams(query).toString();
    const sign = createHmac('sha256', cred.apiSecret).update(timestamp + cred.apiKey + recvWindow + queryString).digest('hex');
    const data = (await config.transport.request('GET', path, { query, headers: { 'X-BAPI-API-KEY': cred.apiKey, 'X-BAPI-TIMESTAMP': timestamp, 'X-BAPI-RECV-WINDOW': recvWindow, 'X-BAPI-SIGN': sign }, signal })).data;
    if (data?.retCode !== 0) throw new ProviderError([10003, 10004, 10005, 10007].includes(data?.retCode) ? 'PROVIDER_AUTH' : data?.retCode === 10006 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_UNAVAILABLE');
    if (!data.result || typeof data.result !== 'object') throw new ProviderError('PROVIDER_SCHEMA'); return data.result;
  }
  const adapter = {
    id: 'bybit', kind: 'apikey', enabled: config.enabled, configured: true,
    descriptor: { id: 'bybit', name: 'Bybit Unified · USDT', kind: 'apikey', enabled: config.enabled, configured: true, reason: config.enabled ? null : 'Exchange connections are disabled until regional access and terms are approved.', helpURL: 'https://www.bybit.com/en/help-center/article/How-to-create-your-API-key', scope: 'Unified USDT wallet and linear USDT positions; other settlement currencies and products are not consolidated', serverSearch: false, fields: ['apiKey', 'apiSecret'], limits: { activePollSeconds: 15, backgroundPollSeconds: 300, historyMaxPages: config.maxPages } },
    async connect(input, { signal } = {}) {
      config.gate(); credentials(input, ['apiKey', 'apiSecret']); const credential = { apiKey: input.apiKey, apiSecret: input.apiSecret }, conn = { credential };
      const row = await request(conn, '/v5/user/query-api', {}, signal), proof = requireReadOnly(bybitReadOnly(row, input.apiKey, now));
      if (row.uta !== 1) throw new ProviderError('PROVIDER_INPUT');
      const externalId = identifier(row.userID);
      return { externalId, credential, readOnlyEvidence: proof, readOnlyVerified: true, metadata: { currency: 'USDT', maskedLogin: `••••${externalId.slice(-4)}`, accountMode: 'hedging', scope: adapter.descriptor.scope } };
    },
    async verifyReadOnly(conn, { signal } = {}) { const row = await request(conn, '/v5/user/query-api', {}, signal); if (conn.externalId && String(row.userID) !== String(conn.externalId)) throw new ProviderError('PROVIDER_AUTH'); return bybitReadOnly(row, conn.credential.apiKey, now); },
    async fetchAccount(conn, { signal } = {}) {
      requireReadOnly(await adapter.verifyReadOnly(conn, { signal }));
      const rows = array((await request(conn, '/v5/account/wallet-balance', { accountType: 'UNIFIED', coin: 'USDT' }, signal)).list), wallet = rows.find(r => r.accountType === 'UNIFIED');
      const coin = array(wallet?.coin).find(c => c.coin === 'USDT'); if (!coin) throw new ProviderError('PROVIDER_SCHEMA');
      return snapshot({ asOf: new Date(now()).toISOString(), currency: 'USDT', source: 'Bybit Unified USDT wallet', balance: finite(coin.walletBalance), equity: finite(coin.equity), floatingPL: optionalNumber(coin.unrealisedPnl), margin: optionalNumber(coin.totalPositionIM), scope: { kind: 'currency', currency: 'USDT', description: 'USDT wallet and linear USDT positions only. USDT is not USD; other settlement currencies and products are excluded.' }, coverage: { ...coverage(['Scoped USDT data; historical API windows and unsupported products prevent a claim of complete account history.']), positionsComplete: false } });
    },
    async fetchPositions(conn, { signal } = {}) {
      requireReadOnly(await adapter.verifyReadOnly(conn, { signal })); const output = []; let cursor;
      for (let page = 0; page < config.maxPages; page++) {
        const result = await request(conn, '/v5/position/list', { category: 'linear', settleCoin: 'USDT', limit: '200', ...(cursor ? { cursor } : {}) }, signal);
        for (const row of array(result.list)) {
          const quantity = finite(row.size); if (quantity === 0) continue;
          if (!['Buy', 'Sell'].includes(row.side)) throw new ProviderError('PROVIDER_SCHEMA');
          output.push(position({ externalId: `${identifier(row.symbol)}:${identifier(row.positionIdx)}`, rawSymbol: row.symbol, side: row.side === 'Buy' ? 'buy' : 'sell', quantity, quantityUnit: 'units', entry: finite(row.avgPrice), currentPrice: optionalNumber(row.markPrice), stopLoss: positiveStop(row.stopLoss), takeProfit: positiveStop(row.takeProfit), floatingPL: optionalNumber(row.unrealisedPnl), asOf: new Date(now()).toISOString(), currency: 'USDT', openedAt: row.createdTime ? iso(finite(row.createdTime)) : null }));
        }
        if (!result.nextPageCursor) return output;
        if (result.nextPageCursor === cursor) throw new ProviderError('PROVIDER_SCHEMA'); cursor = result.nextPageCursor;
      }
      // Never return a truncated position list that would erase unseen live positions.
      throw new ProviderError('HISTORY_INCOMPLETE');
    },
    async fetchHistory(conn, since, { signal } = {}) {
      requireReadOnly(await adapter.verifyReadOnly(conn, { signal }));
      const toMs = now(), earliest = toMs - 730 * 86400000, requested = since ? Date.parse(iso(since)) : earliest, fromMs = Math.max(earliest, requested);
      if (fromMs >= toMs) throw new ProviderError('PROVIDER_INPUT');
      const deals = [], notes = ['Unified USDT transaction log only; provider retention is up to two years. Other currencies and prior account migrations are not complete account coverage.']; let requests = 0;
      for (let start = fromMs; start < toMs; start += 7 * 86400000) {
        let cursor;
        for (;;) {
          if (requests++ >= config.maxPages) return { deals, complete: false, from: iso(fromMs), to: iso(toMs), notes: [...notes, 'History request budget reached.'] };
          const result = await request(conn, '/v5/account/transaction-log', { accountType: 'UNIFIED', currency: 'USDT', startTime: String(start), endTime: String(Math.min(toMs, start + 7 * 86400000 - 1)), limit: '50', ...(cursor ? { cursor } : {}) }, signal);
          for (const row of array(result.list)) {
            if (row.currency !== 'USDT') throw new ProviderError('PROVIDER_SCHEMA');
            const trading = row.type === 'TRADE' && row.category === 'linear';
            // Transaction log carries actual cash effects. Do not invent hedge position IDs or initial risk.
            const kind = trading ? 'trade' : row.type === 'TRANSFER_IN' ? 'deposit' : row.type === 'TRANSFER_OUT' ? 'withdrawal' : row.type === 'SETTLEMENT' ? 'fee' : 'adjustment';
            const cashFlow = optionalNumber(row.cashFlow), fee = optionalNumber(row.fee), funding = optionalNumber(row.funding), change = optionalNumber(row.change);
            deals.push(deal({ externalId: identifier(row.id), time: iso(finite(row.transactionTime)), kind, rawSymbol: trading ? String(row.symbol) : null, side: trading ? row.side === 'Buy' ? 'buy' : row.side === 'Sell' ? 'sell' : null : null, quantity: trading ? finite(row.qty) : null, quantityUnit: 'units', price: trading ? finite(row.tradePrice) : null, grossPnl: cashFlow, commission: fee == null ? null : -fee, swap: funding, fees: 0, netPnl: change, balanceAfter: optionalNumber(row.cashBalance), currency: 'USDT', source: 'Bybit Unified transaction log' }));
          }
          if (!result.nextPageCursor) break;
          if (result.nextPageCursor === cursor) throw new ProviderError('PROVIDER_SCHEMA'); cursor = result.nextPageCursor;
        }
      }
      return { deals, complete: false, from: iso(fromMs), to: iso(toMs), notes };
    },
    async disconnect() { return { revoked: false, manualRevocationRequired: true, instructions: 'FYNX has removed its stored key. Delete the API key in Bybit API Management to revoke it at the exchange.' }; },
  };
  return adapter;
}
module.exports = { createBinance, createBybit, binanceReadOnly, bybitReadOnly, BINANCE_WRITES, BYBIT_PERMISSIONS, binanceRules, bybitRules };
