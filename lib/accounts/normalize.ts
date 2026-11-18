import { parseTimestamp } from './time';
import { SYMBOLS } from '../quant/config';
import type { AccountSnapshot, Coverage, Deal, FXConversion, Position, SymbolMatch } from './types';
export const LIMITS = { bytes: 5 * 1024 * 1024, rows: 100000, positions: 1000, snapshots: 200000, money: 1e12, quantity: 1e12 } as const;
export function finite(value: unknown, label: string, nullable = false, min: number = -LIMITS.money, max: number = LIMITS.money): number | null {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be a finite value in the supported range.`);
  return value;
}
export function currency(value: string): string { const result = value?.trim().toUpperCase(); if (!/^[A-Z0-9]{3,12}$/.test(result)) throw new Error('A valid account currency is required.'); return result; }
export function emptyCoverage(reasons: string[] = []): Coverage { return { from: null, to: null, historyComplete: false, cashflowsComplete: false, dayStartBalanceKnown: false, dayStartEquityKnown: false, intraday: 'none', reasons }; }
export function normalizeSymbol(raw: string, aliases: Record<string, string> = {}): SymbolMatch {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 80) throw new Error('Invalid instrument symbol.');
  const text = raw.trim(), upper = text.toUpperCase(), compact = upper.replace(/[ /-]/g, '');
  const direct = SYMBOLS.find(s => s.id === upper || s.id === compact);
  if (direct) return { symbol: direct.id, rawSymbol: text, match: 'exact', candidates: [direct.id] };
  const alias = aliases[upper] || aliases[text];
  if (alias && SYMBOLS.some(s => s.id === alias)) return { symbol: alias, rawSymbol: text, match: 'alias', candidates: [alias] };
  const candidates = SYMBOLS.filter(s => upper.startsWith(s.id) && /^[._#-][A-Z0-9]{1,12}$/.test(upper.slice(s.id.length))).map(s => s.id);
  if (candidates.length === 1) return { symbol: candidates[0], rawSymbol: text, match: 'suffix', candidates };
  return { symbol: null, rawSymbol: text, match: candidates.length ? 'ambiguous' : 'unknown', candidates };
}
export function conversion(code: string, at: string, fx?: FXConversion | null): FXConversion | null {
  const c = currency(code); if (c === 'USD') return { rateToUSD: 1, asOf: at, source: 'identity:USD' };
  if (!fx) return null; finite(fx.rateToUSD, 'USD exchange rate', false, Number.MIN_VALUE, 1e8);
  if (!fx.source || !Number.isFinite(Date.parse(fx.asOf)) || Date.parse(fx.asOf) > Date.parse(at)) throw new Error('USD conversion needs an attributed rate available by the observation time.');
  return { ...fx };
}
export function toUSD(value: number | null, fx: FXConversion | null): number | null { return value === null || fx === null ? null : value * fx.rateToUSD; }
export function normalizeDeal(input: Partial<Deal> & Pick<Deal, 'externalId' | 'time' | 'kind' | 'currency' | 'source'>): Deal {
  if (!input.externalId || input.externalId.length > 200 || !Number.isFinite(Date.parse(input.time))) throw new Error('A deal needs a stable identifier and valid UTC timestamp.');
  const time = parseTimestamp(input.time), code = currency(input.currency), fx = conversion(code, time, input.fx);
  if (input.symbol && !SYMBOLS.some(s => s.id === input.symbol)) throw new Error('Unknown canonical instrument symbol.');
  const rawSymbol = input.rawSymbol || input.symbol || null, symbol = rawSymbol ? normalizeSymbol(rawSymbol).symbol : null;
  const number = (key: keyof Deal) => finite(input[key], String(key), true);
  const deal: Deal = { externalId: input.externalId, time, kind: input.kind, symbol: input.symbol ?? symbol, rawSymbol, side: input.side ?? null, entryType: input.entryType ?? null, positionId: input.positionId ?? null, orderId: input.orderId ?? null, quantity: number('quantity'), quantityUnit: input.quantityUnit || 'lots', price: number('price'), grossPnl: number('grossPnl'), commission: number('commission'), swap: number('swap'), fees: number('fees'), netPnl: number('netPnl'), balanceAfter: number('balanceAfter'), currency: code, stopLoss: number('stopLoss'), takeProfit: number('takeProfit'), initialRisk: number('initialRisk'), stopLossBasis: input.stopLossBasis || 'unknown', magic: input.magic ?? null, timeframe: input.timeframe ?? null, strategyId: input.strategyId ?? null, source: input.source, fx, usd: null };
  if (deal.netPnl === null && [deal.grossPnl, deal.commission, deal.swap, deal.fees].every(n => n !== null)) deal.netPnl = deal.grossPnl! + deal.commission! + deal.swap! + deal.fees!;
  if (!['trade', 'deposit', 'withdrawal', 'fee', 'adjustment', 'dividend', 'credit'].includes(deal.kind) || !['lots', 'units', 'contracts'].includes(deal.quantityUnit) || deal.entryType !== null && !['in', 'out', 'inout', 'out-by'].includes(deal.entryType) || !['initial', 'observed', 'reported-final', 'unknown'].includes(deal.stopLossBasis)) throw new Error('Unsupported deal classification.');
  for (const id of [deal.positionId, deal.orderId, deal.magic, deal.strategyId, deal.timeframe, deal.source]) if (id !== null && (typeof id !== 'string' || id.length > 200)) throw new Error('Deal metadata exceeds its limit.');
  for (const field of ['stopLoss', 'takeProfit'] as const) { if (deal[field] === 0) deal[field] = null; else if (deal[field] !== null && deal[field]! < 0) throw new Error('Stop and target prices must be positive.'); }
  if (deal.initialRisk !== null && deal.initialRisk <= 0) throw new Error('Known initial trade risk must be positive.');
  if (deal.kind === 'trade' && (!deal.side || !['buy', 'sell'].includes(deal.side) || deal.quantity === null || deal.quantity <= 0 || deal.price === null || deal.price <= 0)) throw new Error('A trade deal needs side, positive quantity and price.');
  if (fx) deal.usd = { netPnl: toUSD(deal.netPnl, fx), initialRisk: toUSD(deal.initialRisk, fx) };
  return deal;
}
export function normalizeSnapshot(input: Partial<AccountSnapshot> & Pick<AccountSnapshot, 'asOf' | 'currency' | 'source'>): AccountSnapshot {
  if (!Number.isFinite(Date.parse(input.asOf))) throw new Error('Invalid account observation time.');
  const asOf = parseTimestamp(input.asOf), code = currency(input.currency), fx = conversion(code, asOf, input.fx);
  const out: AccountSnapshot = { ...input, asOf, currency: code, source: input.source, balance: finite(input.balance, 'Balance', true), equity: finite(input.equity, 'Equity', true), margin: finite(input.margin, 'Margin', true), freeMargin: finite(input.freeMargin, 'Free margin', true), floatingPL: finite(input.floatingPL, 'Floating profit', true), leverage: finite(input.leverage, 'Leverage', true, 0, 1000000), balanceBasis: input.balanceBasis || 'unknown', coverage: input.coverage || emptyCoverage(), fx, usd: null };
  if (fx) out.usd = { balance: toUSD(out.balance, fx), equity: toUSD(out.equity, fx), floatingPL: toUSD(out.floatingPL, fx) };
  return out;
}
export function normalizePosition(input: Partial<Position> & Pick<Position, 'externalId' | 'rawSymbol' | 'side' | 'quantity' | 'quantityUnit' | 'entry' | 'asOf' | 'currency'>): Position {
  if (!['lots', 'units', 'contracts'].includes(input.quantityUnit) || !['buy', 'sell'].includes(input.side) || !input.externalId || !Number.isFinite(Date.parse(input.asOf))) throw new Error('Position identity, side or observation time is invalid.');
  if (input.symbol && !SYMBOLS.some(s => s.id === input.symbol)) throw new Error('Unknown canonical instrument symbol.');
  const code = currency(input.currency), asOf = parseTimestamp(input.asOf), fx = conversion(code, asOf, input.fx);
  const out: Position = { externalId: input.externalId, symbol: input.symbol ?? normalizeSymbol(input.rawSymbol).symbol, rawSymbol: input.rawSymbol, side: input.side, quantity: finite(input.quantity, 'Position quantity', false, Number.MIN_VALUE, LIMITS.quantity)!, quantityUnit: input.quantityUnit, lots: finite(input.lots, 'Lots', true, 0, LIMITS.quantity), entry: finite(input.entry, 'Entry price', false, Number.MIN_VALUE)!, currentPrice: finite(input.currentPrice, 'Current price', true, Number.MIN_VALUE), stopLoss: finite(input.stopLoss, 'Stop loss', true, Number.MIN_VALUE), takeProfit: finite(input.takeProfit, 'Target', true, Number.MIN_VALUE), floatingPL: finite(input.floatingPL, 'Floating profit', true), riskToStop: finite(input.riskToStop, 'Stop risk', true, 0), openedAt: input.openedAt ? parseTimestamp(input.openedAt) : null, asOf, currency: code, magic: input.magic ?? null, timeframe: input.timeframe ?? null, strategyId: input.strategyId ?? null, fx, usd: null };
  if (out.openedAt && out.openedAt > out.asOf) throw new Error('A position cannot open after its observation time.');
  if (out.stopLoss === null) out.riskToStop = null;
  if (fx) out.usd = { floatingPL: toUSD(out.floatingPL, fx), riskToStop: toUSD(out.riskToStop, fx) };
  return out;
}
