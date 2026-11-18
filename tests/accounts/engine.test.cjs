'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const bundle = path.join(os.tmpdir(), `fynx-accounts-engine-${process.pid}.cjs`);
require('esbuild').buildSync({ entryPoints: [path.resolve(__dirname, '../../lib/accounts/index.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'cjs' });
const e = require(bundle); fs.unlinkSync(bundle);
const t0 = '2026-11-01T23:00:00.000Z', asOf = '2026-11-03T16:00:00.000Z';
const near = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const read = file => fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8');
const coverage = (extra = {}) => ({ ...e.emptyCoverage(), from: t0, to: asOf, historyComplete: true, cashflowsComplete: true, positionsComplete: true, ...extra });
const snapshot = (time, balance, equity = balance, extra = {}) => e.normalizeSnapshot({ asOf: time, balance, equity, currency: 'USD', source: 'synthetic-test', balanceBasis: 'provider', ...extra });
const deal = (id, time, extra = {}) => e.normalizeDeal({ externalId: id, time, kind: 'trade', rawSymbol: 'EURUSD', side: 'buy', entryType: 'in', positionId: 'p1', quantity: 1, price: 1.1, grossPnl: 0, commission: 0, swap: 0, fees: 0, currency: 'USD', source: 'synthetic-test', ...extra });
const fixture = () => e.parseStatement(read('trades.csv'), { currency: 'USD' });
const trade = (id, pnl = 50, extra = {}) => ({ ...fixture().trades[0], realizedPnl: undefined, id, openedAt: '2026-11-02T08:00:00.000Z', closedAt: '2026-11-02T10:00:00.000Z', netPnl: pnl, initialRisk: 50, rMultiple: pnl / 50, ...extra });
const context = (extra = {}) => ({ rule: e.getRule('2-step'), phase: 'challenge', initialBalance: 10000, phaseStartedAt: t0, snapshots: [snapshot(t0, 10000), snapshot('2026-11-02T23:00:00.000Z', 10000), snapshot(asOf, 10070)], deals: [], trades: [], positions: [], coverage: coverage(), asOf, ...extra });
const input = (extra = {}) => ({ snapshots: [], positions: [], deals: [], trades: [], coverage: coverage(), ...extra });
const facts = (id, extra = {}) => ({ tradeId: id, asOf, initialStop: 1.095, initialStopKnown: true, plannedTarget: 1.11, entryEquity: 10000, plannedRiskPct: 1, initialRisk: 50, fitScore: 60, fitAsOf: t0, stopObservations: [], events: [], currencies: ['EUR', 'USD'], monitoringComplete: true, calendarComplete: true, exitReason: 'target', ...extra });

test('MT4 fixture preserves reported balance/equity and net costs without inventing original R', () => {
  const p = e.parseStatement(read('mt4-statement.html'), { timezone: 'Europe/Prague' });
  assert.deepEqual(p.issues, []); assert.equal(p.currency, 'USD'); assert.equal(p.trades.length, 3); assert.deepEqual(p.trades.map(t => t.netPnl), [99, -53, 24]); assert.ok(p.trades.every(t => t.rMultiple === null));
  assert.equal(p.metadata.maskedLogin, '••••5678'); assert.equal(p.snapshots[0].asOf, '2026-11-03T15:00:00.000Z');
  const d = e.buildDashboard(p, { asOf, timezone: 'Europe/Prague' }); near(d.metrics.winRate.value, 2 / 3); assert.equal(d.metrics.closedPL.value, 70); assert.equal(d.metrics.balance.value, 10070); assert.equal(d.metrics.equity.value, 10070); assert.equal(d.metrics.todayPL.value, null); assert.equal(d.metrics.floatingPL.value, null);
});
test('MT5 deals preserve fractional milliseconds and partial exits, balance never implies equity', () => {
  const p = e.parseStatement(read('mt5-deals.html'), { timezone: 'Europe/Prague' }); assert.deepEqual(p.issues, []); assert.equal(p.trades.length, 1); const t = p.trades[0]; assert.equal(t.status, 'closed'); assert.equal(t.netPnl, 92); assert.equal(t.rMultiple, null); assert.equal(t.openedAt, '2026-11-02T08:00:00.123Z'); assert.equal(t.closedAt, '2026-11-03T09:00:00.126Z'); assert.equal(p.snapshots[0].balance, 10092); assert.equal(p.snapshots[0].equity, null);
});
test('CSV imports known monetary initial risk, missing risk and absent balance explicitly', () => {
  const p = fixture(); assert.deepEqual(p.trades.map(t => t.rMultiple), [1.98, -1.06, null]); assert.equal(p.snapshots.length, 0); const m = e.accountMetrics(p, { asOf, timezone: 'UTC' }); assert.equal(m.balance.value, null); assert.equal(m.equity.value, null); near(m.averageTradeR.value, .46); assert.equal(m.averageTradeR.sampleSize, 2);
});
test('CSV supports explicit mapped headers, semicolon decimal commas, quoted newlines and signed charges', () => {
  const csv = 'ticket;start;finish;asset;direction;size;opening;closing;profit;cost;swap;fees\n1;2026-11-02T08:00:00Z;2026-11-02T09:00:00Z;EURUSD;buy;0,1;1,1;1,11;100,5;1,5;0;0';
  const p = e.parseStatement(csv, { currency: 'EUR', delimiter: ';', decimalSeparator: ',', costConvention: 'positive-costs', columns: { open_time: 'start', close_time: 'finish', symbol: 'asset', entry_price: 'opening', exit_price: 'closing', commission: 'cost' } }); assert.equal(p.trades[0].netPnl, 99); assert.equal(p.trades[0].usd, null); assert.deepEqual(e.parseCSVRows('a,b\n"one\ntwo","a""b"'), [['a', 'b'], ['one\ntwo', 'a"b']]);
});
test('parser rejects missing currency/timezone, ambiguous dates, conflicting ids and budget abuse', () => {
  assert.throws(() => e.parseStatement(read('trades.csv')), /currency/); assert.throws(() => e.parseStatement(read('mt4-statement.html')), /timezone/); assert.throws(() => e.parseStatement(read('mt4-statement.html'), { currency: 'EUR', timezone: 'UTC' }), /differs/);
  assert.throws(() => e.parseCSVRows('a,b\n"unclosed'), /Unclosed/); assert.throws(() => e.parseStatement(read('trades.csv'), { currency: 'USD', maxBytes: 10 }), /5 MB/); assert.throws(() => e.parseStatement(read('trades.csv'), { currency: 'USD', maxRows: -1 }), /budget/);
  const lines = read('trades.csv').trim().split('\n'); const duplicate = [lines[0], lines[1], lines[1]].join('\n'); assert.equal(e.parseStatement(duplicate, { currency: 'USD' }).trades.length, 1); assert.throws(() => e.parseStatement([duplicate, lines[1].replace(',99,', ',98,')].join('\n'), { currency: 'USD' }), /Conflicting/);
});
test('HTML is text-only: script/style/remote contents cannot become values or execute', () => {
  const p = e.parseStatement(read('mt4-statement.html').replace('</body>', '<script>globalThis.UNSAFE=true; Balance: 1</script><style>Equity: 0</style><img src="https://invalid.example/secret"></body>'), { timezone: 'Europe/Prague' }); assert.equal(p.snapshots[0].balance, 10070); assert.equal(globalThis.UNSAFE, undefined);
});
test('symbol normalization keeps exact source instrument and never turns USDT into USD', () => {
  assert.equal(e.normalizeSymbol('EURUSD.r').symbol, 'EURUSD'); assert.equal(e.normalizeSymbol('XAUUSD.m').symbol, 'XAUUSD'); assert.equal(e.normalizeSymbol('EUR/USD').symbol, 'EURUSD'); assert.equal(e.normalizeSymbol('BTCUSDT').symbol, null); assert.equal(e.normalizeSymbol('EURUSDextra').symbol, null); assert.equal(e.normalizeSymbol('GOLD', { GOLD: 'XAUUSD' }).symbol, 'XAUUSD');
});
test('currency conversions remain null without actual time-valid rate and USDT stays native', () => {
  const usd = snapshot(asOf, 100); assert.equal(usd.usd.balance, 100); const stable = snapshot(asOf, 100, null, { currency: 'USDT' }); assert.equal(stable.currency, 'USDT'); assert.equal(stable.usd, null);
  const eur = snapshot(asOf, 100, null, { currency: 'EUR', fx: { rateToUSD: 1.08, asOf: t0, source: 'fixture-rate' } }); near(eur.usd.balance, 108); assert.throws(() => snapshot(t0, 100, 100, { currency: 'EUR', fx: { rateToUSD: 1.08, asOf, source: 'future' } }), /available/);
});
test('normalization rejects malformed UTC dates, classifications, numeric infinity and negative risk', () => {
  assert.throws(() => deal('x', '2026-11-01 12:00:00'), /timezone/); assert.throws(() => deal('x', t0, { entryType: 'fake' }), /classification/); assert.throws(() => deal('x', t0, { quantity: Infinity }), /finite/); assert.throws(() => deal('x', t0, { initialRisk: -1 }), /positive/); assert.throws(() => snapshot(asOf, NaN), /finite/);
});
test('IANA conversion preserves milliseconds and rejects ambiguous/nonexistent DST wall times', () => {
  assert.equal(e.parseTimestamp('2026.11.03 10:20:30.123', { timezone: 'Europe/Prague' }), '2026-11-03T09:20:30.123Z'); assert.equal(e.parseTimestamp('03/11/2026 10:20:30.9', { timezone: 'Europe/Prague', dateFormat: 'dmy' }), '2026-11-03T09:20:30.900Z');
  assert.throws(() => e.parseTimestamp('2026-10-25 02:30:00', { timezone: 'Europe/Prague' }), /Ambiguous/); assert.throws(() => e.parseTimestamp('2026-03-29 02:30:00', { timezone: 'Europe/Prague' }), /does not exist/); assert.throws(() => e.parseTimestamp('2026-02-30T10:00:00Z'), /Invalid/);
  const spring = Date.parse(e.resetBoundary('2026-03-30T10:00:00Z', 'Europe/Prague')) - Date.parse(e.resetBoundary('2026-03-29T10:00:00Z', 'Europe/Prague')); assert.equal(spring, 23 * 3600000);
  const fall = Date.parse(e.resetBoundary('2026-10-26T10:00:00Z', 'Europe/Prague')) - Date.parse(e.resetBoundary('2026-10-25T10:00:00Z', 'Europe/Prague')); assert.equal(fall, 25 * 3600000);
});
test('partial closes aggregate all costs exactly once and R requires closed original risk', () => {
  const ds = [deal('a', t0, { initialRisk: 100, commission: -2 }), deal('b', '2026-11-02T08:00:00Z', { side: 'sell', entryType: 'out', quantity: .4, price: 1.101, grossPnl: 40, commission: -1, swap: -1 }), deal('c', asOf, { side: 'sell', entryType: 'out', quantity: .6, price: 1.102, grossPnl: 120, commission: -1, swap: -2 })];
  const partial = e.groupDeals(ds.slice(0, 2)).trades[0]; assert.equal(partial.status, 'partial'); assert.equal(partial.rMultiple, null); near(partial.remainingQuantity, .6);
  const t = e.groupDeals(ds).trades[0]; assert.equal(t.netPnl, 153); near(t.rMultiple, 1.53); near(t.exit, 1.1016); assert.deepEqual(t.dealIds, ['a', 'b', 'c']);
});
test('scale-ins use weighted execution prices and sum documented risk, unknown contribution removes R', () => {
  const ds = [deal('a', t0, { initialRisk: 100, timeframe: 'H1' }), deal('b', '2026-11-02T08:00:00Z', { quantity: 2, price: 1.2, initialRisk: 200, timeframe: 'M15' }), deal('c', asOf, { side: 'sell', entryType: 'out', quantity: 3, price: 1.3, grossPnl: 300 })]; const t = e.groupDeals(ds).trades[0]; near(t.entry, (1.1 + 2.4) / 3); assert.equal(t.initialRisk, 300); assert.equal(t.rMultiple, 1); assert.equal(t.timeframe, null); ds[1].initialRisk = null; assert.equal(e.groupDeals(ds).trades[0].rMultiple, null);
});
test('netting reversal allocates gross/swap to close and execution costs by quantity without double count', () => {
  const ds = [deal('a', t0, { initialRisk: 100, commission: -2 }), deal('b', '2026-11-02T08:00:00Z', { side: 'sell', entryType: 'inout', quantity: 1.5, grossPnl: 100, swap: -3, commission: -3 }), deal('c', asOf, { side: 'buy', entryType: 'out', quantity: .5, grossPnl: 25, commission: -1 })];
  const ts = e.groupDeals(ds).trades; assert.equal(ts.length, 2); assert.equal(ts[0].status, 'closed'); assert.equal(ts[1].status, 'closed'); near(ts[0].netPnl, 93); near(ts[1].netPnl, 23); near(ts.reduce((sum, t) => sum + t.netPnl, 0), ds.reduce((sum, d) => sum + d.netPnl, 0)); assert.equal(ts[1].initialRisk, null); assert.equal(ts[1].side, 'sell');
});
test('hedges never guess round trips without position ids; netting explicit; missing opening stays ungrouped', () => {
  const ds = [deal('a', t0, { positionId: null }), deal('b', asOf, { positionId: null, side: 'sell', entryType: 'out', grossPnl: 100 })]; assert.equal(e.groupDeals(ds).ungrouped.length, 2); assert.equal(e.groupDeals(ds, { accountMode: 'netting' }).trades.length, 1); assert.equal(e.groupDeals(ds.slice(1), { accountMode: 'netting' }).ungrouped.length, 1);
  const hedges = [deal('a', t0), deal('b', t0, { positionId: 'p2', side: 'sell' })]; assert.equal(e.groupDeals(hedges).trades.length, 2);
});
test('stable deal id makes repeated imports idempotent and conflicting records fail', () => {
  const d = deal('a', t0); assert.equal(e.groupDeals([d, d]).trades.length, 1); assert.throws(() => e.groupDeals([d, { ...d, price: 1.2 }]), /Conflicting/);
});
test('snapshot metrics exclude cash injections and use actual reset equity rather than balance', () => {
  const reset = '2026-11-02T23:00:00.000Z', p = input({ initialBalance: 10000, initialBalanceAt: t0, snapshots: [snapshot(t0, 10000), snapshot(reset, 10100, 10050), snapshot(asOf, 10500, 10480)], deals: [deal('dep', '2026-11-03T08:00:00Z', { kind: 'deposit', netPnl: 300 })] });
  const m = e.accountMetrics(p, { asOf, timezone: 'Europe/Prague' }); assert.equal(m.todayPL.value, 130); assert.equal(m.totalPL.value, 180); assert.equal(m.dayLowestEquity.value, 10050);
  p.coverage.cashflowsComplete = false; assert.equal(e.accountMetrics(p, { asOf, timezone: 'Europe/Prague' }).totalPL.value, null);
});
test('coverage flags alone cannot fill unobserved starts, stale-day P&L or earlier ledger gaps', () => {
  const p = input({ snapshots: [snapshot(t0, 10000)], initialBalance: 10000, initialBalanceAt: '2026-10-01T00:00:00Z' }); const m = e.accountMetrics(p, { asOf, timezone: 'Europe/Prague' }); assert.equal(m.todayPL.value, null); assert.equal(m.totalPL.value, null);
  const lookup = e.balanceLookup([snapshot(t0, 10000)], [deal('p', '2026-11-02T08:00:00Z', { grossPnl: 100 })], coverage({ ledgerComplete: true })); assert.equal(lookup(asOf), 10100); assert.equal(e.balanceLookup([snapshot(t0, 10000)], [], coverage())(asOf), null);
});
test('FTMO 2-step static floors, strict below-boundary loss and known reset baseline are exact', () => {
  const r = e.evaluateRules(context()); assert.equal(r.dailyFloor.value, 9500); assert.equal(r.maximumFloor.value, 9000); assert.equal(r.targetAmount.value, 1000); assert.equal(r.targetProfit.value, 70); near(r.targetProgress.value, .07); assert.equal(r.targetDistance.value, 930); assert.equal(r.minimumTradingDays, 4); assert.equal(r.observedBreach, false);
  assert.equal(e.evaluateRules(context({ snapshots: [snapshot(t0, 10000), snapshot('2026-11-02T10:00:00Z', 10000, 9500)] })).observedBreach, false);
  assert.equal(e.evaluateRules(context({ snapshots: [snapshot(t0, 10000), snapshot('2026-11-02T10:00:00Z', 10000, 9499.99)] })).observedBreach, true);
});
test('target progress is deposit adjusted and clamped; unknown adjustments/coverage withhold eligibility', () => {
  const extra = { snapshots: [snapshot(asOf, 11500)], deals: [deal('dep', '2026-11-02T10:00:00Z', { kind: 'deposit', netPnl: 1000 })] }; const r = e.evaluateRules(context(extra)); assert.equal(r.targetProfit.value, 500); assert.equal(r.targetDistance.value, 500); assert.equal(r.targetBalance.value, 12000); assert.equal(r.targetReached, false);
  assert.equal(e.evaluateRules(context({ ...extra, coverage: coverage({ cashflowsComplete: false }) })).targetProfit.value, null);
  extra.deals[0].kind = 'adjustment'; assert.equal(e.evaluateRules(context(extra)).targetProfit.value, null);
  assert.equal(e.evaluateRules(context({ snapshots: [snapshot(asOf, 12000)] })).targetProgress.value, 1);
});
test('FTMO 1-step trails prior firm midnight balances, not an intraday equity or balance peak', () => {
  const ctx = context({ rule: e.getRule('1-step'), snapshots: [snapshot(t0, 10000), snapshot('2026-11-02T12:00:00Z', 12000, 13000), snapshot('2026-11-02T23:00:00Z', 10500), snapshot(asOf, 10400)] }); const r = e.evaluateRules(ctx); assert.equal(r.maximumFloor.value, 9500); assert.equal(r.dailyFloor.value, 10200); assert.equal(r.observedBreach, false);
  ctx.snapshots.splice(2, 1); assert.equal(e.evaluateRules(ctx).maximumFloor.value, null); assert.equal(e.evaluateRules(ctx).dailyFloor.value, null);
});
test('actual provider highwater restores current trailing floor without certifying missing history', () => {
  const r = e.evaluateRules(context({ rule: e.getRule('1-step'), snapshots: [snapshot(asOf, 10500, 9400)], highWater: { balance: 10700, basis: 'end-of-day-balance', asOf, source: 'provider' } })); assert.equal(r.maximumFloor.value, 9700); assert.equal(r.observedBreach, true);
});
test('custom intraday balance trailing includes complete ledger peaks between snapshots', () => {
  const rule = structuredClone(e.getRule('2-step')); rule.id = 'custom'; rule.verified = false; rule.userDefined = true; rule.maximumLoss.mode = 'intraday-balance-trailing';
  const ctx = context({ rule, snapshots: [snapshot(t0, 10000), snapshot(asOf, 10500)], deals: [deal('up', '2026-11-02T09:00:00Z', { netPnl: 2000 }), deal('down', '2026-11-02T10:00:00Z', { netPnl: -1500 })], coverage: coverage({ ledgerComplete: true }) }); const r = e.evaluateRules(ctx); assert.equal(r.maximumFloor.value, 11000); assert.equal(r.observedBreach, true); ctx.coverage.ledgerComplete = false; assert.equal(e.evaluateRules(ctx).maximumFloor.value, null);
});
test('minimum days count opening days in firm timezone and reset for the selected phase', () => {
  const trades = [trade('a', 100, { openedAt: '2026-10-30T10:00:00Z' }), trade('b', 100), trade('c', 100, { openedAt: '2026-11-02T23:30:00Z', closedAt: asOf })]; const r = e.evaluateRules(context({ trades })); assert.equal(r.tradingDays.value, 2); assert.equal(r.minimumTradingDays, 4);
  const verification = e.evaluateRules(context({ phase: 'verification', phaseStartedAt: '2026-11-02T23:00:00.000Z', trades })); assert.equal(verification.tradingDays.value, 1); assert.equal(verification.targetAmount.value, 500);
});
test('current net-profit consistency differs from legacy positive-day version and is not a breach', () => {
  const trades = [trade('a', 600), trade('b', 400, { openedAt: '2026-11-03T08:00:00Z', closedAt: '2026-11-03T09:00:00Z' }), trade('c', -200, { openedAt: '2026-11-03T10:00:00Z', closedAt: '2026-11-03T11:00:00Z' })];
  const current = e.evaluateRules(context({ rule: e.getRule('1-step'), trades })); near(current.consistency.value, .75); assert.equal(current.consistencyMet, false); assert.equal(current.observedBreach, false);
  // A separate losing day changes the legacy denominator, so use a three-day phase.
  trades[2].openedAt = '2026-11-01T12:00:00Z'; trades[2].closedAt = '2026-11-01T13:00:00Z'; const start = '2026-10-31T23:00:00.000Z';
  const old = e.evaluateRules(context({ phaseStartedAt: start, coverage: coverage({ from: start }), rule: e.getRule('1-step-legacy'), trades })); near(old.consistency.value, .6);
});
test('unverified firms have no invented rules and funded phase has no target', () => {
  assert.equal(e.PROP_FIRMS.length, 8); for (const rule of e.RULES.filter(r => r.firmId !== 'ftmo')) { assert.equal(rule.verified, false); assert.equal(rule.phases.length, 0); assert.equal(e.evaluateRules(context({ rule })).available, false); }
  assert.equal(e.evaluateRules(context({ phase: 'funded' })).targetAmount.value, null); assert.equal(e.getRule('1-step').effectiveFrom, '2026-10-12'); assert.equal(e.getRule('2-step').effectiveFrom, null);
});
test('strategy matching requires manual or explicit binding, never global magic or symbol guesses', () => {
  const strategies = [{ id: 'a', name: 'A', symbol: 'EURUSD', timeframe: 'H1' }, { id: 'b', name: 'B', symbol: 'EURUSD', timeframe: 'H1' }], t = trade('x', 50, { magic: '770101', timeframe: 'H1', strategyId: null });
  assert.equal(e.matchStrategy(t, strategies).basis, 'unmatched'); assert.equal(e.matchStrategy(t, strategies, [{ strategyId: 'a', magic: null, symbol: 'EURUSD', timeframe: null }]).basis, 'unmatched'); const bindings = ['a', 'b'].map(strategyId => ({ strategyId, magic: '770101', symbol: 'EURUSD', timeframe: 'H1' })); assert.equal(e.matchStrategy(t, strategies, bindings).basis, 'ambiguous'); assert.equal(e.matchStrategy(t, strategies, bindings, { x: 'b' }).strategyId, 'b');
});
test('plan tags use actual entry stop/risk/known calendar and saved entry score', () => {
  const t = trade('x', 10, { strategyId: 'a', exit: 1.102 }); const f = facts('x', { initialRisk: 150, fitScore: 30, exitReason: 'manual', stopObservations: [{ time: '2026-11-02T09:00:00Z', stopLoss: 1.09 }], events: [{ time: '2026-11-02T08:20:00Z', currency: 'USD', impact: 'high', knownAt: t0 }] });
  const c = e.planChecks(t, f); for (const tag of ['stop_moved_wider', 'closed_early', 'opened_before_event', 'low_fit', 'oversized']) assert.ok(c.tags.includes(tag)); assert.equal(c.followedPlan, false);
  assert.equal(e.planChecks(t).followedPlan, null); assert.deepEqual(e.planChecks(t).tags, []); assert.equal(e.planChecks(t, facts('x', { fitAsOf: asOf })).checks.find(c => c.tag === 'low_fit').value, null);
});
test('unknown initial stop is not a no-stop allegation and complete clean evidence yields followed plan', () => {
  const t = trade('x', 100, { strategyId: 'a' }); const unknown = e.planChecks(t, facts('x', { initialStopKnown: false, initialStop: null })); assert.equal(unknown.checks.find(c => c.tag === 'no_stop').value, null); assert.equal(unknown.followedPlan, null); assert.deepEqual(e.planChecks(t, facts('x')).tags, ['followed_plan']);
});
test('coaching and live comparison require at least twenty measured relevant samples', () => {
  const ts = Array.from({ length: 20 }, (_, i) => { const t = trade('t' + i, i % 2 ? 50 : -25, { strategyId: 'a' }); return { ...t, planCheck: e.planChecks(t, facts(t.id, { initialRisk: 200 })) }; }); assert.deepEqual(e.coachInsights(ts.slice(0, 19)), []); assert.ok(e.coachInsights(ts).some(i => i.id === 'oversized')); assert.throws(() => e.coachInsights(ts, { minimumTrades: 1 }), /threshold/);
  const strategies = [{ id: 'a', name: 'A', symbol: 'EURUSD', timeframe: 'D1', backtest: { trades: 50, winRate: .5, averageR: .2, profitFactor: 1.2 } }]; assert.equal(e.liveComparisons(ts.slice(0, 19), strategies, asOf).length, 0); assert.equal(e.liveComparisons(ts, strategies, asOf).length, 1); ts[0].rMultiple = null; assert.equal(e.liveComparisons(ts, strategies, asOf)[0].live.averageR, null);
});
test('historical dashboard never leaks future closing summary, later facts or later snapshots', () => {
  const p = fixture(), cutoff = '2026-11-02T12:00:00.000Z', d = e.buildDashboard(input({ trades: p.trades, snapshots: [snapshot(t0, 10000), snapshot(asOf, 10070)], entryFacts: [facts(p.trades[0].id)], strategies: [] }), { asOf: cutoff, timezone: 'UTC' }); assert.equal(d.trades.length, 1); assert.deepEqual(d.trades[0].planCheck.tags, []); assert.equal(d.metrics.balance.value, 10000); assert.equal(d.metrics.closedPL.value, 99);
});
test('personal daily safety stop works without prop rules and discloses baseline with gaps unknown', () => {
  const p = input({ safetyDailyPct: 2, initialBalance: 10000, snapshots: [snapshot('2026-11-02T23:00:00.000Z', 10300, 10250), snapshot(asOf, 10300, 10200)] });
  const d = e.buildDashboard(p, { asOf, timezone: 'Europe/Prague' }); assert.equal(d.challenge, null); assert.equal(d.safetyLossAmount.value, 200); assert.equal(d.safetyLossRoom.value, 100); assert.match(d.safetyLossRoom.reason, /declared initial capital/);
  delete p.initialBalance; near(e.buildDashboard(p, { asOf, timezone: 'Europe/Prague' }).safetyLossAmount.value, 206); p.snapshots.shift(); assert.equal(e.buildDashboard(p, { asOf, timezone: 'Europe/Prague' }).safetyLossRoom.value, null); p.safetyDailyPct = 0; assert.equal(e.buildDashboard(p, { asOf, timezone: 'Europe/Prague' }).safetyLossAmount.value, null);
});
test('partial realization days preserve original-cost allocation for calendar and best-day math', () => {
  const ds = [deal('a', t0, { commission: -10 }), deal('b', '2026-11-02T12:00:00Z', { entryType: 'out', side: 'sell', quantity: .5, grossPnl: 100, commission: -2 }), deal('c', '2026-11-03T12:00:00Z', { entryType: 'out', side: 'sell', quantity: .5, grossPnl: 200, commission: -2 })]; const trades = e.groupDeals(ds).trades;
  assert.deepEqual(trades[0].realizedPnl.map(r => r.netPnl), [93, 193]); near(trades[0].realizedPnl.reduce((s, r) => s + r.netPnl, 0), trades[0].netPnl);
  const m = e.accountMetrics(input({ deals: ds, trades }), { asOf, timezone: 'Europe/Prague' }); assert.deepEqual(m.calendar.map(d => d.closedPL), [93, 193]); const r = e.evaluateRules(context({ rule: e.getRule('1-step'), deals: ds, trades })); near(r.consistency.value, 193 / 286);
  const partial = e.groupDeals(ds.slice(0, 2)).trades; assert.equal(partial[0].status, 'partial'); assert.equal(e.accountMetrics(input({ deals: ds.slice(0, 2), trades: partial }), { asOf, timezone: 'UTC' }).calendar[0].closedPL, 93);
});
test('HTML nesting and aggregate entry evidence have explicit processing budgets', () => {
  assert.throws(() => e.parseStatement('<html>' + '<div>'.repeat(300) + read('mt4-statement.html') + '</div>'.repeat(300) + '</html>', { timezone: 'UTC' }), /nesting/);
  const f = facts('x', { stopObservations: Array(250001).fill({ time: t0, stopLoss: 1 }) }); assert.throws(() => e.buildDashboard(input({ entryFacts: [f] }), { asOf, timezone: 'UTC' }), /budget/);
});
test('stale high-water reports cannot establish a later trailing limit', () => {
  const r = e.evaluateRules(context({ rule: e.getRule('1-step'), snapshots: [snapshot(asOf, 10500)], highWater: { balance: 10700, basis: 'end-of-day-balance', asOf: t0, source: 'provider' } })); assert.equal(r.maximumFloor.value, null);
});
test('hard custom consistency rule is distinct from soft FTMO eligibility', () => {
  const rule = structuredClone(e.getRule('1-step')); rule.userDefined = true; rule.verified = false; rule.consistency.violationIsBreach = true; const r = e.evaluateRules(context({ rule, trades: [trade('a', 500)] })); assert.equal(r.consistencyMet, false); assert.ok(r.breaches.some(b => b.kind === 'consistency'));
});
