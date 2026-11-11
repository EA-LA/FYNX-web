'use strict';
const { finite, iso, ProviderError } = require('./transport.cjs');
function currency(value) { if (typeof value !== 'string' || !/^[A-Z0-9]{2,12}$/.test(value)) throw new ProviderError('PROVIDER_SCHEMA'); return value; }
function coverage(reasons = []) { return { from: null, to: null, historyComplete: false, cashflowsComplete: false, dayStartBalanceKnown: false, dayStartEquityKnown: false, intraday: 'sampled', reasons }; }
function snapshot(data) { return { asOf: data.asOf, balance: null, equity: null, margin: null, freeMargin: null, floatingPL: null, currency: data.currency, leverage: null, source: data.source, balanceBasis: 'provider', coverage: coverage(), fx: null, usd: null, ...data }; }
function position(data) { return { externalId: data.externalId, symbol: null, rawSymbol: data.rawSymbol, side: data.side, quantity: data.quantity, quantityUnit: 'lots', lots: null, entry: data.entry, currentPrice: null, stopLoss: null, takeProfit: null, floatingPL: null, riskToStop: null, openedAt: null, asOf: data.asOf, currency: data.currency, magic: null, timeframe: null, strategyId: null, fx: null, usd: null, ...data }; }
function deal(data) { return { externalId: data.externalId, time: data.time, kind: data.kind, symbol: null, rawSymbol: null, side: null, entryType: null, positionId: null, orderId: null, quantity: null, quantityUnit: 'lots', price: null, grossPnl: null, commission: null, swap: null, fees: null, netPnl: null, balanceAfter: null, currency: data.currency, stopLoss: null, takeProfit: null, initialRisk: null, stopLossBasis: 'unknown', magic: null, timeframe: null, strategyId: null, source: data.source, fx: null, usd: null, ...data }; }
function optionalNumber(value) { return finite(value, true); }
function positiveStop(value) { const n = optionalNumber(value); return n != null && n > 0 ? n : null; }
// eslint-disable-next-line no-control-regex -- Reject control characters in untrusted provider identifiers.
function identifier(value) { if (!['number', 'string'].includes(typeof value) || (typeof value === 'number' && !Number.isSafeInteger(value)) || !String(value) || String(value).length > 128 || /[\x00-\x1f]/.test(String(value))) throw new ProviderError('PROVIDER_SCHEMA'); return String(value); }
function brokerSymbol(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_.#/-]{1,40}$/.test(value)) throw new ProviderError('PROVIDER_SCHEMA'); return value; }
function metaAccount(row, asOf) {
  const c = currency(row.currency), balance = finite(row.balance), equity = finite(row.equity), rate = c === 'USD' ? 1 : optionalNumber(row.accountCurrencyExchangeRate);
  const fx = rate != null && rate > 0 ? { rateToUSD: rate, asOf, source: 'MetaApi accountCurrencyExchangeRate; configured baseCurrency USD' } : null;
  return snapshot({ asOf, currency: c, source: 'MetaApi', balance, equity, margin: optionalNumber(row.margin), freeMargin: optionalNumber(row.freeMargin), floatingPL: equity - balance - (optionalNumber(row.credit) || 0), leverage: optionalNumber(row.leverage), fx, usd: fx ? { balance: balance * rate, equity: equity * rate, floatingPL: (equity - balance - (optionalNumber(row.credit) || 0)) * rate } : null });
}
function metaPosition(row, account, asOf) {
  if (!['POSITION_TYPE_BUY', 'POSITION_TYPE_SELL'].includes(row.type)) throw new ProviderError('PROVIDER_SCHEMA');
  const lots = finite(row.volume), floatingPL = optionalNumber(row.unrealizedProfit);
  return position({ externalId: identifier(row.id), rawSymbol: brokerSymbol(row.symbol), side: row.type === 'POSITION_TYPE_BUY' ? 'buy' : 'sell', quantity: lots, lots, entry: finite(row.openPrice), currentPrice: optionalNumber(row.currentPrice), stopLoss: positiveStop(row.stopLoss), takeProfit: positiveStop(row.takeProfit), floatingPL, openedAt: row.time ? iso(row.time) : null, asOf, currency: account.currency, magic: row.magic == null ? null : identifier(row.magic), fx: account.fx, usd: account.fx ? { floatingPL: floatingPL == null ? null : floatingPL * account.fx.rateToUSD, riskToStop: null } : null });
}
function metaDeal(row, c) {
  const trade = ['DEAL_TYPE_BUY', 'DEAL_TYPE_SELL'].includes(row.type);
  const pnl = optionalNumber(row.profit), commission = optionalNumber(row.commission), swap = optionalNumber(row.swap), fees = optionalNumber(row.fee);
  // Missing cost fields stay unknown. A fee of zero is accepted only when supplied.
  const net = [pnl, commission, swap].every(x => x !== null) ? pnl + commission + swap + (fees || 0) : null;
  const kind = trade ? 'trade' : row.type === 'DEAL_TYPE_BALANCE' ? (pnl >= 0 ? 'deposit' : 'withdrawal') : row.type === 'DEAL_TYPE_CREDIT' ? 'credit' : /COMMISSION|CHARGE/.test(row.type) ? 'fee' : /DIVIDEND/.test(row.type) ? 'dividend' : 'adjustment';
  return deal({ externalId: identifier(row.id), time: iso(row.time), kind, rawSymbol: trade ? brokerSymbol(row.symbol) : null, side: trade ? row.type === 'DEAL_TYPE_BUY' ? 'buy' : 'sell' : null, entryType: ({ DEAL_ENTRY_IN: 'in', DEAL_ENTRY_OUT: 'out', DEAL_ENTRY_INOUT: 'inout', DEAL_ENTRY_OUT_BY: 'out-by' })[row.entryType] || null, positionId: row.positionId == null ? null : identifier(row.positionId), orderId: row.orderId == null ? null : identifier(row.orderId), quantity: trade ? finite(row.volume) : null, price: trade ? finite(row.price) : null, grossPnl: pnl, commission, swap, fees, netPnl: trade ? net : pnl, currency: c, stopLoss: positiveStop(row.stopLoss), takeProfit: positiveStop(row.takeProfit), stopLossBasis: row.stopLoss ? 'reported-final' : 'unknown', magic: row.magic == null ? null : identifier(row.magic), source: 'MetaApi' });
}
module.exports = { currency, coverage, snapshot, position, deal, optionalNumber, positiveStop, identifier, brokerSymbol, metaAccount, metaPosition, metaDeal };
