import { LIMITS, normalizeDeal, toUSD } from './normalize';
import type { Deal, GroupedDeals, GroupOptions, ParseIssue, Trade } from './types';
const tolerance = (quantity: number) => Number.EPSILON * 16 * Math.max(1, quantity);
const add = (a: number | null, b: number | null) => a === null || b === null ? null : a + b;
/** Position-id grouping preserves hedges. Without ids, symbol netting is opt-in only. */
export function groupDeals(input: Deal[], options: GroupOptions = {}): GroupedDeals {
  if (!Array.isArray(input) || input.length > Math.min(options.maxDeals || LIMITS.rows, LIMITS.rows)) throw new Error('Deal history exceeds the 100,000-record processing limit.');
  const issues: ParseIssue[] = [], ungrouped: Deal[] = [], cashflows: Deal[] = [], trades: Trade[] = [], active = new Map<string, Trade>(), generations = new Map<string, number>();
  const openingCash = new Map<string, number | null>();
  const seen = new Map<string, string>(), deals: Deal[] = [];
  for (const raw of input) { const d = normalizeDeal(raw), fingerprint = JSON.stringify(d), old = seen.get(d.externalId); if (old) { if (old !== fingerprint) throw new Error('Conflicting records share a provider deal identifier.'); continue; } seen.set(d.externalId, fingerprint); deals.push(d); }
  deals.sort((a, b) => a.time.localeCompare(b.time) || 0);
  const reject = (d: Deal, message: string) => { ungrouped.push(d); issues.push({ severity: 'warning', code: 'GROUPING_UNAVAILABLE', message, row: null }); };
  function start(key: string, d: Deal, quantity: number, cashFraction = 1): Trade {
    const sequence = (generations.get(key) || 0) + 1; generations.set(key, sequence);
    const initialRisk = d.initialRisk === null ? null : d.initialRisk * cashFraction;
    const t: Trade = { id: `trade:${d.externalId}:${sequence}`, externalId: d.orderId, dealIds: [d.externalId], positionId: d.positionId, symbol: d.symbol, rawSymbol: d.rawSymbol!, side: d.side!, status: 'open', openedAt: d.time, closedAt: null, quantity, closedQuantity: 0, remainingQuantity: quantity, quantityUnit: d.quantityUnit, entry: d.price!, exit: null, stopLoss: d.stopLoss, takeProfit: d.takeProfit, grossPnl: d.grossPnl === null ? null : d.grossPnl * cashFraction, commission: d.commission === null ? null : d.commission * cashFraction, swap: d.swap === null ? null : d.swap * cashFraction, fees: d.fees === null ? null : d.fees * cashFraction, netPnl: d.netPnl === null ? null : d.netPnl * cashFraction, initialRisk, rMultiple: null, currency: d.currency, riskBasis: initialRisk === null ? 'unknown' : 'reported-initial', costsComplete: [d.commission, d.swap, d.fees].every(n => n !== null), magic: d.magic, timeframe: d.timeframe, strategyId: d.strategyId, tags: [], source: d.source, coverageReasons: [], realizedPnl: [], fx: d.fx, usd: null };
    if (d.fx) t.usd = { netPnl: toUSD(t.netPnl, d.fx), initialRisk: toUSD(initialRisk, d.fx) };
    openingCash.set(t.id, t.netPnl); active.set(key, t); trades.push(t); return t;
  }
  function cash(t: Trade, d: Deal, fraction = 1, closePnl = false) {
    t.grossPnl = add(t.grossPnl, d.grossPnl === null ? null : d.grossPnl * (closePnl ? 1 : fraction));
    t.commission = add(t.commission, d.commission === null ? null : d.commission * fraction);
    t.swap = add(t.swap, d.swap === null ? null : d.swap * (closePnl ? 1 : fraction));
    t.fees = add(t.fees, d.fees === null ? null : d.fees * fraction);
    // On a reversal the gross realized P/L and accrued swap belong entirely to the closed leg.
    const splitNet = closePnl && d.netPnl !== null && d.commission !== null && d.fees !== null ? d.netPnl - (d.commission + d.fees) * (1 - fraction) : d.netPnl === null ? null : d.netPnl * fraction;
    t.netPnl = add(t.netPnl, splitNet); t.costsComplete &&= [d.commission, d.swap, d.fees].every(n => n !== null);
    t.dealIds.push(d.externalId);
    if (t.usd && d.fx) t.usd.netPnl = add(t.usd.netPnl, toUSD(splitNet, d.fx)); else t.usd = null;
    if (t.fx?.rateToUSD !== d.fx?.rateToUSD || t.fx?.source !== d.fx?.source) t.fx = null;
  }
  function close(key: string, t: Trade, d: Deal, quantity: number, fraction = 1, reversing = false) {
    const heldCash = openingCash.get(t.id) ?? null, allocated = heldCash === null ? null : heldCash * quantity / t.remainingQuantity, closeCash = reversing && d.netPnl !== null && d.commission !== null && d.fees !== null ? d.netPnl - (d.commission + d.fees) * (1 - fraction) : d.netPnl === null ? null : d.netPnl * fraction;
    t.realizedPnl!.push({ time: d.time, netPnl: add(allocated, closeCash) }); openingCash.set(t.id, heldCash === null || allocated === null ? null : heldCash - allocated);
    const closed = t.closedQuantity; t.exit = ((t.exit || 0) * closed + d.price! * quantity) / (closed + quantity);
    t.closedQuantity += quantity; t.remainingQuantity = Math.max(0, t.remainingQuantity - quantity); cash(t, d, fraction, reversing);
    if (t.remainingQuantity <= tolerance(t.quantity)) { t.remainingQuantity = 0; t.status = 'closed'; t.closedAt = d.time; active.delete(key); } else t.status = 'partial';
  }
  for (const d of deals) {
    if (d.kind !== 'trade') { cashflows.push(d); continue; }
    if (!d.rawSymbol || !d.side || d.quantity === null || d.price === null) { reject(d, 'Trade execution lacks instrument, side, quantity or price.'); continue; }
    const key = d.positionId ? `position:${d.positionId}` : options.accountMode === 'netting' ? `net:${d.rawSymbol}:${d.currency}` : null;
    if (!key) { reject(d, 'No position identifier and no confirmed netting mode; hedged executions are not guessed into round trips.'); continue; }
    const existing = active.get(key), quantity = d.quantity;
    if (existing && (existing.currency !== d.currency || existing.quantityUnit !== d.quantityUnit || existing.rawSymbol !== d.rawSymbol)) throw new Error('Position executions disagree on currency, quantity unit or instrument.');
    if (!existing) {
      if (d.entryType === 'out' || d.entryType === 'out-by' || d.entryType === 'inout') { reject(d, 'Closing/reversing execution has no observed opening; import the missing history.'); continue; }
      start(key, d, quantity); continue;
    }
    if (d.side === existing.side) {
      if (d.entryType === 'out' || d.entryType === 'out-by' || d.entryType === 'inout') { reject(d, 'Closing execution has the same direction as its open position.'); continue; }
      existing.entry = (existing.entry * existing.quantity + d.price * quantity) / (existing.quantity + quantity);
      openingCash.set(existing.id, add(openingCash.get(existing.id) ?? null, d.netPnl)); existing.quantity += quantity; existing.remainingQuantity += quantity; existing.initialRisk = add(existing.initialRisk, d.initialRisk); if (existing.usd && d.fx) existing.usd.initialRisk = add(existing.usd.initialRisk, toUSD(d.initialRisk, d.fx)); else existing.usd = null; cash(existing, d);
      if (d.timeframe !== existing.timeframe) existing.timeframe = null; if (d.magic !== existing.magic) existing.magic = null; if (d.strategyId !== existing.strategyId) existing.strategyId = null; continue;
    }
    if (d.entryType === 'in') { reject(d, 'An opposite opening execution cannot be merged into an existing hedge.'); continue; }
    const remaining = existing.remainingQuantity;
    if (quantity <= remaining + tolerance(remaining)) close(key, existing, d, Math.min(quantity, remaining));
    else if (d.entryType === 'inout' || options.accountMode === 'netting' && d.entryType === null) {
      const fraction = remaining / quantity; close(key, existing, d, remaining, fraction, true);
      const openingCash = d.commission === null || d.fees === null ? null : (d.commission + d.fees) * (1 - fraction);
      const opening: Deal = { ...d, grossPnl: 0, swap: 0, commission: d.commission === null ? null : d.commission * (1 - fraction), fees: d.fees === null ? null : d.fees * (1 - fraction), netPnl: openingCash, initialRisk: null, stopLossBasis: 'unknown' };
      const t = start(key, opening, quantity - remaining); t.coverageReasons.push('Reversal opening risk is unknown unless separately reported for the residual position. Reversal execution costs are allocated by quantity.');
    } else reject(d, 'Close quantity exceeds the observed position. It is not labeled as a netting reversal.');
  }
  for (const t of trades) {
    t.riskBasis = t.initialRisk === null ? 'unknown' : 'reported-initial';
    if (t.status === 'closed' && t.initialRisk !== null && t.initialRisk > 0 && t.netPnl !== null) t.rMultiple = t.netPnl / t.initialRisk;
    if (t.initialRisk === null) t.coverageReasons.push('Original monetary risk is unknown; a final/current stop does not establish initial risk.');
    if (!t.costsComplete) t.coverageReasons.push('At least one commission, swap or fee observation is missing.');
    if (t.currency === 'USD') t.fx = { rateToUSD: 1, asOf: t.closedAt || t.openedAt, source: 'identity:USD' };
    if (t.usd && t.fx === null) t.coverageReasons.push('USD amounts sum the attributed historical conversion on each execution; no single closing-date rate was substituted.');
  }
  return { trades, ungrouped, cashflows, issues };
}
