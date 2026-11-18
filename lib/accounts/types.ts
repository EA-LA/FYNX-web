/** Canonical account model. UTC ISO timestamps; money is numeric in `currency`.
 * Charges are negative cash effects. Unknown observations are null, never zero.
 * Prices remain instrument quote prices; only account-currency money is converted to USD. */
export type ISOTime = string;
export type Side = 'buy' | 'sell';
export type QuantityUnit = 'lots' | 'units' | 'contracts';
export type FXConversion = { rateToUSD: number; asOf: ISOTime; source: string };
export type Coverage = {
  from: ISOTime | null; to: ISOTime | null; historyComplete: boolean;
  cashflowsComplete: boolean; ledgerComplete?: boolean; dayStartBalanceKnown: boolean; dayStartEquityKnown: boolean;
  intraday: 'continuous' | 'sampled' | 'none'; positionsComplete?: boolean; reasons: string[];
};
export type AccountSnapshot = {
  asOf: ISOTime; balance: number | null; equity: number | null; margin: number | null;
  freeMargin: number | null; floatingPL: number | null; currency: string; leverage: number | null;
  assets?: { currency: string; free: number; locked: number }[];
  scope?: { kind: 'whole-account' | 'currency' | 'asset-balances'; currency: string | null; description: string };
  source: string; balanceBasis: 'provider' | 'statement-reported' | 'ledger-reconstructed' | 'user-declared' | 'unknown';
  coverage: Coverage; fx: FXConversion | null;
  usd: { balance: number | null; equity: number | null; floatingPL: number | null } | null;
  dayStart?: { day: string; timezone: string; balance: number | null; equity: number | null; source: string };
};
export type SymbolMatch = { symbol: string | null; rawSymbol: string; match: 'exact' | 'alias' | 'suffix' | 'unknown' | 'ambiguous'; candidates: string[] };
export type Position = {
  externalId: string; symbol: string | null; rawSymbol: string; side: Side; quantity: number;
  quantityUnit: QuantityUnit; lots: number | null; entry: number; currentPrice: number | null;
  stopLoss: number | null; takeProfit: number | null; floatingPL: number | null; riskToStop: number | null;
  openedAt: ISOTime | null; asOf: ISOTime; currency: string; magic: string | null;
  timeframe: string | null; strategyId: string | null; fx: FXConversion | null;
  usd: { floatingPL: number | null; riskToStop: number | null } | null;
};
export type Deal = {
  externalId: string; time: ISOTime; kind: 'trade' | 'deposit' | 'withdrawal' | 'fee' | 'adjustment' | 'dividend' | 'credit';
  symbol: string | null; rawSymbol: string | null; side: Side | null; entryType: 'in' | 'out' | 'inout' | 'out-by' | null;
  positionId: string | null; orderId: string | null; quantity: number | null; quantityUnit: QuantityUnit;
  price: number | null; grossPnl: number | null; commission: number | null; swap: number | null;
  fees: number | null; netPnl: number | null; balanceAfter: number | null; currency: string;
  stopLoss: number | null; takeProfit: number | null; initialRisk: number | null;
  stopLossBasis: 'initial' | 'observed' | 'reported-final' | 'unknown';
  magic: string | null; timeframe: string | null; strategyId: string | null;
  source: string; fx: FXConversion | null; usd: { netPnl: number | null; initialRisk: number | null } | null;
};
export type PlanTag = 'followed_plan' | 'stop_moved_wider' | 'closed_early' | 'no_stop' | 'opened_before_event' | 'low_fit' | 'oversized';
export type Trade = {
  id: string; externalId: string | null; dealIds: string[]; positionId: string | null;
  symbol: string | null; rawSymbol: string; side: Side; status: 'open' | 'partial' | 'closed';
  openedAt: ISOTime; closedAt: ISOTime | null; quantity: number; closedQuantity: number; remainingQuantity: number;
  quantityUnit: QuantityUnit; entry: number; exit: number | null; stopLoss: number | null; takeProfit: number | null;
  grossPnl: number | null; commission: number | null; swap: number | null; fees: number | null;
  netPnl: number | null; initialRisk: number | null; rMultiple: number | null; currency: string;
  riskBasis: 'reported-initial' | 'user-declared' | 'unknown'; costsComplete: boolean;
  magic: string | null; timeframe: string | null; strategyId: string | null; tags: PlanTag[];
  source: string; coverageReasons: string[]; realizedPnl?: { time: ISOTime; netPnl: number | null }[]; fx: FXConversion | null;
  usd: { netPnl: number | null; initialRisk: number | null } | null;
};
export type ParseIssue = { severity: 'error' | 'warning'; code: string; message: string; row: number | null };
export type ParseOptions = {
  format?: 'auto' | 'csv' | 'mt4-html' | 'mt5-html'; currency?: string; timezone?: string;
  dateFormat?: 'iso' | 'ymd' | 'dmy' | 'mdy'; decimalSeparator?: '.' | ','; delimiter?: ',' | ';' | '\t';
  columns?: Record<string, string>; costConvention?: 'signed' | 'positive-costs';
  initialBalance?: number; initialBalanceAt?: ISOTime; statementAsOf?: ISOTime;
  historyComplete?: boolean; accountMode?: 'netting' | 'hedging' | 'unknown';
  fx?: FXConversion; maxBytes?: number; maxRows?: number;
};
export type ParsedStatement = {
  format: 'csv' | 'mt4-html' | 'mt5-html'; schemaVersion: 1; currency: string;
  deals: Deal[]; trades: Trade[]; positions: Position[]; snapshots: AccountSnapshot[];
  preview: Trade[]; previewDeals: Deal[]; issues: ParseIssue[]; coverage: Coverage; metadata: {
    source: string; timezone: string | null; maskedLogin: string | null; statementAsOf: ISOTime | null;
    startingBalance: number | null; endingBalance: number | null;
    balanceBasis: AccountSnapshot['balanceBasis']; rows: number;
  };
};
export type GroupedDeals = { trades: Trade[]; ungrouped: Deal[]; cashflows: Deal[]; issues: ParseIssue[] };
export type GroupOptions = { accountMode?: 'netting' | 'hedging' | 'unknown'; maxDeals?: number };
export type StrategyBinding = { strategyId: string; magic: string | null; symbol: string | null; timeframe: string | null };
export type SavedStrategy = { id: string; name: string; symbol: string; timeframe: string; params?: { riskPct?: number; [key: string]: unknown }; backtest?: { trades: number; winRate: number | null; averageR: number | null; profitFactor: number | null } };
export type StrategyMatch = { strategyId: string | null; basis: 'manual' | 'binding' | 'unmatched' | 'ambiguous'; reason: string | null };
export type EntryFacts = {
  tradeId: string; asOf: ISOTime; initialStop: number | null; initialStopKnown?: boolean; plannedTarget: number | null;
  entryEquity: number | null; plannedRiskPct: number | null; initialRisk: number | null;
  fitScore: number | null; fitAsOf: ISOTime | null;
  stopObservations: { time: ISOTime; stopLoss: number | null }[];
  events: { time: ISOTime; currency: string; impact: 'high' | 'medium' | 'low'; knownAt: ISOTime | null }[];
  currencies: string[]; monitoringComplete: boolean; calendarComplete: boolean; exitReason: 'stop' | 'target' | 'manual' | 'other' | 'unknown';
};
export type PlanCheck = { tags: PlanTag[]; checks: { tag: Exclude<PlanTag, 'followed_plan'>; value: boolean | null; reason: string }[]; followedPlan: boolean | null; evidenceAsOf: ISOTime | null };
export type Metric = { value: number | null; reason: string | null; sampleSize?: number };
export type AccountMetrics = {
  currency: string; asOf: ISOTime; balance: Metric; equity: Metric; floatingPL: Metric;
  todayPL: Metric; totalPL: Metric; closedPL: Metric; winRate: Metric; averageTradeR: Metric; averageTradePL: Metric;
  closedTrades: number; rKnownTrades: number; dayLowestEquity: Metric; day: string; timezone: string;
  equitySeries: { time: ISOTime; balance: number | null; equity: number | null; source: string }[];
  calendar: { day: string; closedPL: number; trades: number; currency: string }[]; notes: string[];
};
export type RuleVersion = {
  id: string; firmId: string; label: string; version: string; verified: boolean; userDefined?: boolean; sourceUrls: string[];
  verifiedOn: string | null; effectiveFrom: string | null; effectiveUntil: string | null;
  effectiveDateEvidence: 'source-stated' | 'observed-as-of' | 'unknown';
  applicability: { plan: string | null; accountType: 'standard' | 'swing' | null; orderFrom: string | null; orderBefore: string | null };
  phases: { id: string; label: string; profitTargetFraction: number | null; minimumTradingDays: number | null; timeLimitDays: number | null }[];
  reset: { timezone: string; localTime: string } | null;
  dailyLoss: { fraction: number; amountBasis: 'initial-capital'; baseline: 'day-start-balance' | 'day-start-equity'; measured: 'equity' | 'balance'; breachComparison: 'below' | 'at-or-below' } | null;
  maximumLoss: { fraction: number; amountBasis: 'initial-capital'; mode: 'static' | 'intraday-balance-trailing' | 'intraday-equity-trailing' | 'end-of-day-balance-trailing'; measured: 'equity' | 'balance'; lockAtInitialBalance: boolean; resetOnReward: boolean; breachComparison: 'below' | 'at-or-below' } | null;
  consistency: { limit: number; basis: 'net-profit' | 'positive-days'; appliesTo: string[]; violationIsBreach: boolean } | null;
  restrictions: { news: { minutesBefore: number; minutesAfter: number; appliesTo: string[]; scope: 'specified-releases' } | null; weekend: { marketBreakHours: number; appliesTo: string[] } | null; notes: string[] };
};
export type RuleContext = {
  rule: RuleVersion; phase: string; initialBalance: number | null; phaseStartedAt: ISOTime | null;
  snapshots: AccountSnapshot[]; deals: Deal[]; trades: Trade[]; positions: Position[];
  coverage: Coverage; asOf: ISOTime; safetyDailyPct?: number;
  highWater?: { balance: number; basis: 'end-of-day-balance' | 'intraday-balance' | 'intraday-equity'; asOf: ISOTime; source: string }; 
};
export type RuleResult = {
  available: boolean; reason: string | null; ruleId: string; verified: boolean; phase: string;
  day: string | null; timezone: string | null; dailyLossAmount: Metric; dailyFloor: Metric;
  dailyLossUsed: Metric; dailyLossUsedFraction: Metric; dailyLossRoom: Metric; safetyLossRoom: Metric;
  maximumLossAmount: Metric; maximumFloor: Metric; maximumLossUsed: Metric; maximumLossUsedFraction: Metric; maximumLossRoom: Metric;
  targetAmount: Metric; targetDistance: Metric; targetProfit: Metric; targetProgress: Metric; targetBalance: Metric; targetReached: boolean | null; tradingDays: Metric;
  minimumTradingDays: number | null; consistency: Metric; consistencyMet: boolean | null;
  observedBreach: boolean; breaches: { kind: 'daily-loss' | 'maximum-loss' | 'time-limit' | 'consistency'; time: ISOTime; value: number; limit: number }[];
  assessment: 'unavailable' | 'observed-breach' | 'no-observed-breach' | 'objectives-met';
  coverage: Coverage; notes: string[];
};
export type CoachInsight = { id: string; title: string; text: string; sampleSize: number; metric: number; basis: string };
export type LiveComparison = { strategyId: string; strategyName: string; sampleSize: number; live: { winRate: number; averageR: number | null; averagePL: number; profitFactor: number | null }; backtest: NonNullable<SavedStrategy['backtest']> };
export type DashboardInput = {
  snapshots: AccountSnapshot[]; positions: Position[]; deals: Deal[]; trades: Trade[]; coverage: Coverage;
  initialBalance?: number | null; initialBalanceAt?: ISOTime | null; safetyDailyPct?: number | null; strategies?: SavedStrategy[];
  bindings?: StrategyBinding[]; manualAssignments?: Record<string, string>; entryFacts?: EntryFacts[];
  ruleContext?: Omit<RuleContext, 'snapshots' | 'positions' | 'deals' | 'trades' | 'coverage' | 'asOf'>;
};
export type AccountDashboard = {
  asOf: ISOTime; timezone: string; metrics: AccountMetrics; safetyLossRoom: Metric; safetyLossAmount: Metric; challenge: RuleResult | null;
  positions: Position[]; trades: (Trade & { planCheck: PlanCheck; strategyMatch: StrategyMatch })[];
  insights: CoachInsight[]; liveVsBacktest: LiveComparison[]; coverage: Coverage; notes: string[];
};
export type ReadOnlyEvidence = { verified: boolean; canTrade: boolean | null; canWithdraw: boolean | null; basis: string; checkedAt: ISOTime; sourceURL?: string };
export type ProviderContext = { signal?: AbortSignal; idempotencyKey?: string; onProvisioned?: (record: { externalId: string; provider: string }) => Promise<void> | void };
export interface AccountProvider<Input = unknown, Connection = unknown> {
  id: string; kind: 'login' | 'oauth' | 'apikey' | 'file' | 'ea';
  connect(input: Input, context?: ProviderContext): Promise<{ externalId: string; readOnlyEvidence: ReadOnlyEvidence; credential?: Record<string, unknown>; metadata: Record<string, unknown> }>;
  verifyReadOnly(connection: Connection): Promise<ReadOnlyEvidence>;
  fetchAccount(connection: Connection): Promise<AccountSnapshot>;
  fetchPositions(connection: Connection): Promise<Position[]>;
  fetchHistory(connection: Connection, since: ISOTime | null): Promise<{ deals: Deal[]; complete: boolean; from: ISOTime | null; to: ISOTime | null; notes: string[] }>;
  subscribe?(connection: Connection, onEvent: (event: unknown) => void): () => void;
  disconnect(connection: Connection): Promise<void>;
}
