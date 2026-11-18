import { LIMITS, finite } from './normalize';
import { localDay, resetBoundary } from './time';
import type { AccountMetrics, AccountSnapshot, Coverage, DashboardInput, Deal, Metric, Trade } from './types';
export const metric = (value: number | null, reason: string | null = null, sampleSize?: number): Metric => ({ value, reason, ...(sampleSize === undefined ? {} : { sampleSize }) });
export const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
export function knownClosed(trades: Trade[], asOf: string): Trade[] { return trades.filter(t => t.status === 'closed' && t.closedAt !== null && t.closedAt <= asOf && t.netPnl !== null && Number.isFinite(t.netPnl)).sort((a, b) => a.closedAt!.localeCompare(b.closedAt!)); }
export function realizedRows(trades: Trade[], asOf: string): { time: string; netPnl: number | null }[] { return trades.flatMap(t => t.realizedPnl || (t.status === 'closed' && t.closedAt ? [{ time: t.closedAt, netPnl: t.netPnl }] : [])).filter(r => r.time <= asOf); }
export function selectSnapshots(input: AccountSnapshot[], asOf: string): AccountSnapshot[] {
  if (input.length > LIMITS.snapshots) throw new Error('Snapshot history exceeds the supported processing budget.');
  const cutoff = Date.parse(asOf); if (!Number.isFinite(cutoff)) throw new Error('Invalid dashboard timestamp.');
  return input.filter(s => Number.isFinite(Date.parse(s.asOf)) && Date.parse(s.asOf) <= cutoff).sort((a, b) => a.asOf.localeCompare(b.asOf));
}
export function coverageCovers(coverage: Coverage, from: string, to: string): boolean { return coverage.from !== null && coverage.to !== null && coverage.from <= from && coverage.to >= to; }
export function cashflows(deals: Deal[], from: string, to: string): number | null {
  if (deals.some(d => d.time > from && d.time <= to && d.kind === 'adjustment')) return null;
  const rows = deals.filter(d => d.time > from && d.time <= to && ['deposit', 'withdrawal', 'credit'].includes(d.kind));
  return rows.every(d => d.netPnl !== null) ? rows.reduce((sum, d) => sum + d.netPnl!, 0) : null;
}
/** Balance reconstruction requires an explicit complete ledger; absence of a record is not zero activity. */
export function balanceLookup(snapshots: AccountSnapshot[], deals: Deal[], coverage: Coverage): (time: string) => number | null {
  const observations = snapshots.filter(s => s.balance !== null).sort((a, b) => a.asOf.localeCompare(b.asOf)), times = deals.map(d => ({ time: d.time, cash: d.netPnl })).sort((a, b) => a.time.localeCompare(b.time));
  const prefix = [0], missing = [0]; for (const row of times) { prefix.push(prefix.at(-1)! + (row.cash ?? 0)); missing.push(missing.at(-1)! + (row.cash === null ? 1 : 0)); }
  const upper = (list: { time: string }[], target: string) => { let lo = 0, hi = list.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (list[mid].time <= target) lo = mid + 1; else hi = mid; } return lo; };
  const balanceTimes = observations.map(s => ({ time: s.asOf }));
  return time => { const index = upper(balanceTimes, time) - 1, before = observations[index]; if (!before) return null; if (before.asOf === time) return before.balance;
    if (!coverage.ledgerComplete || !coverage.from || !coverage.to || coverage.from > before.asOf || coverage.to < time || missing[upper(times, time)] !== missing[upper(times, before.asOf)]) return null;
    return before.balance! + prefix[upper(times, time)] - prefix[upper(times, before.asOf)]; };
}
export function dayStartValues(snapshots: AccountSnapshot[], deals: Deal[], coverage: Coverage, asOf: string, timezone: string, localTime = '00:00'): { time: string; balance: number | null; equity: number | null } {
  const time = resetBoundary(asOf, timezone, localTime), day = localDay(time, timezone), latest = snapshots.at(-1), stated = latest?.dayStart?.day === day && latest.dayStart.timezone === timezone && localTime === '00:00' ? latest.dayStart : null;
  const exact = snapshots.find(s => s.asOf === time);
  return { time, balance: stated?.balance ?? exact?.balance ?? balanceLookup(snapshots, deals, coverage)(time), equity: stated?.equity ?? exact?.equity ?? null };
}
export function accountMetrics(input: DashboardInput, options: { asOf: string; timezone: string }): AccountMetrics {
  finite(input.initialBalance, 'Initial balance', true, 0);
  const asOf = new Date(options.asOf).toISOString(), timezone = options.timezone, observations = selectSnapshots(input.snapshots, asOf), latest = observations.at(-1), currency = latest?.currency || input.trades[0]?.currency || input.deals[0]?.currency || '';
  if (input.trades.length > LIMITS.rows || input.deals.length > LIMITS.rows) throw new Error('Account history exceeds the 100,000-record budget.');
  if ([...observations, ...input.trades, ...input.deals].some(row => row.currency !== currency)) throw new Error('An account calculation cannot mix settlement currencies.');
  const closed = knownClosed(input.trades, asOf), totalClosed = input.trades.filter(t => t.status === 'closed' && t.closedAt && t.closedAt <= asOf).length, knownR = closed.filter(t => t.rMultiple !== null && Number.isFinite(t.rMultiple)), day = localDay(asOf, timezone), start = dayStartValues(observations, input.deals, input.coverage, asOf, timezone), daySnapshots = observations.filter(s => s.asOf >= start.time && s.equity !== null);
  const flow = latest && latest.asOf >= start.time && input.coverage.cashflowsComplete && coverageCovers(input.coverage, start.time, latest.asOf) ? cashflows(input.deals, start.time, latest.asOf) : null;
  const todayPL = latest?.equity !== null && latest?.equity !== undefined && start.equity !== null && flow !== null ? metric(latest.equity - start.equity - flow) : metric(null, 'Today P&L needs an observed day-start equity and complete cash movements.');
  const initialAt = input.initialBalanceAt, initial = input.initialBalance, totalFlow = initialAt && latest && input.coverage.cashflowsComplete && coverageCovers(input.coverage, initialAt, latest.asOf) ? cashflows(input.deals, initialAt, latest.asOf) : null;
  const totalPL = initial !== null && initial !== undefined && initialAt && initialAt <= asOf && latest?.equity !== null && latest?.equity !== undefined && totalFlow !== null ? metric(latest.equity - initial - totalFlow) : metric(null, 'Total account P&L needs initial capital/date, actual equity and complete deposits/withdrawals.');
  const days = new Map<string, { day: string; closedPL: number; trades: number; currency: string }>(); for (const realization of realizedRows(input.trades, asOf).filter(r => r.netPnl !== null)) { const d = localDay(realization.time, timezone), row = days.get(d) || { day: d, closedPL: 0, trades: 0, currency }; row.closedPL += realization.netPnl!; row.trades++; days.set(d, row); }
  const partialReason = closed.length !== totalClosed ? `${totalClosed - closed.length} closed trades have unknown net P&L and are excluded.` : null;
  const notes = ['Equity uses observed equity only. A balance-only statement does not create an equity curve.', 'Calendar P&L uses observed partial-close times with opening costs allocated by quantity when execution history is available. Summary-only statements use the final close date; fee posting times can differ.'];
  if (input.coverage.intraday !== 'continuous') notes.push('Lowest equity is the minimum recorded observation. Gaps can conceal a lower intraday value.');
  if (latest && Date.parse(asOf) - Date.parse(latest.asOf) > 180000) notes.push('Account values are historical or delayed; inspect the observation timestamp.');
  return { currency, asOf: latest?.asOf || asOf, balance: metric(latest?.balance ?? null, latest?.balance === null || !latest ? 'No recorded account balance.' : null), equity: metric(latest?.equity ?? null, latest?.equity === null || !latest ? 'Equity is unavailable; balance is not a substitute.' : null), floatingPL: metric(latest?.floatingPL ?? null, latest?.floatingPL === null || !latest ? 'Floating P&L was not reported.' : null), todayPL, totalPL, closedPL: metric(closed.length ? closed.reduce((sum, t) => sum + t.netPnl!, 0) : null, closed.length ? partialReason : 'No closed trades with known net P&L.', closed.length), winRate: metric(closed.length ? closed.filter(t => t.netPnl! > 0).length / closed.length : null, partialReason || (closed.length ? null : 'No closed trade sample.'), closed.length), averageTradeR: metric(knownR.length ? average(knownR.map(t => t.rMultiple!)) : null, knownR.length === closed.length && knownR.length ? null : 'R uses only trades with known original monetary risk. A final/current stop is insufficient.', knownR.length), averageTradePL: metric(closed.length ? average(closed.map(t => t.netPnl!)) : null, partialReason || (closed.length ? null : 'No closed trade sample.'), closed.length), closedTrades: totalClosed, rKnownTrades: knownR.length, dayLowestEquity: metric(daySnapshots.length ? daySnapshots.reduce((min, s) => Math.min(min, s.equity!), Infinity) : null, input.coverage.intraday === 'continuous' ? null : 'Minimum of recorded observations; intraday gaps remain unknown.', daySnapshots.length), day, timezone, equitySeries: observations.map(s => ({ time: s.asOf, balance: s.balance, equity: s.equity, source: s.source })), calendar: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)), notes };
}
