'use strict';
const { createMetaApi } = require('./metaapi.cjs');
const { createBinance, createBybit } = require('./exchanges.cjs');
const { ProviderError, evidence } = require('./transport.cjs');

const GATED = Object.freeze([
  { id: 'oanda', name: 'OANDA', kind: 'apikey', reason: 'OANDA personal tokens can trade and do not expose a verified read-only permission scope. FYNX refuses broad tokens.', helpURL: 'https://developer.oanda.com/rest-live-v20/authentication/' },
  { id: 'ctrader', name: 'cTrader', kind: 'oauth', reason: 'A real accounts-only scope exists. App approval, documented PKCE and a token exchange without secrets in URLs must be confirmed before enabling this connector.', helpURL: 'https://help.ctrader.com/open-api/account-authentication/' },
  { id: 'ibkr', name: 'Interactive Brokers', kind: 'oauth', reason: 'Third-party compliance approval and a verified read-only authorization flow are required. Current public onboarding specifies OAuth 1.0a; generic retail OAuth 2.0 with PKCE is not assumed.', helpURL: 'https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/' },
  { id: 'dxtrade', name: 'DXtrade', kind: 'login', reason: 'Each broker or prop firm controls API access and allowed IPs. A documented investor credential and permission verifier are required.', helpURL: 'https://dx.trade/traders-faq/' },
  { id: 'tradelocker', name: 'TradeLocker', kind: 'login', reason: 'The public login JWT can access trading operations. Verified read-only credentials and third-party developer access are required; FYNX never requests the trading password.', helpURL: 'https://public-api.tradelocker.com/docs/getting-started' },
  { id: 'matchtrader', name: 'Match-Trader', kind: 'apikey', reason: 'Broker-enabled read-only API tokens exist, but authoritative token-permission introspection must be confirmed. Account trading status alone is not credential permission proof.', helpURL: 'https://app.theneo.io/match-trade/trader-api/introduction' },
]);
function createUnavailable(row, now) {
  const reject = async () => { throw new ProviderError('PROVIDER_DISABLED'); };
  return { id: row.id, kind: row.kind, enabled: false, configured: false, descriptor: { ...row, enabled: false, configured: false, serverSearch: false, scope: null, limits: { activePollSeconds: 15, backgroundPollSeconds: 300 } }, connect: reject, verifyReadOnly: async () => evidence(false, row.reason, row.helpURL, now), fetchAccount: reject, fetchPositions: reject, fetchHistory: reject, disconnect: reject };
}
function createRegistry(options = {}) {
  const adapters = [createMetaApi('mt4', options), createMetaApi('mt5', options), createBinance(options), createBybit(options), ...GATED.map(row => createUnavailable(row, options.now || Date.now))];
  const map = new Map(adapters.map(adapter => [adapter.id, adapter]));
  return {
    list() { return adapters.map(adapter => structuredClone(adapter.descriptor)); },
    get(id) { const adapter = map.get(id); if (!adapter) throw new ProviderError('PROVIDER_INPUT'); return adapter; },
    has(id) { return map.has(id); },
  };
}
module.exports = { createRegistry, GATED };
