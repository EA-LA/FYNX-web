/** Pure research types. Returns and ratios are fractions; UI percent inputs are named *Pct. */
export type Time = string | number;
export type Tick = { time: Time; bid: number; ask: number };
export type Bar = { time: Time; close: number; open?: number; high?: number; low?: number; ticks?: Tick[] };
export type EconomicEvent = {
  id?: string; time: Time; name: string; type?: string; currency: string;
  impact: 'high' | 'medium' | 'low'; timing?: 'confirmed' | 'estimated'; actual?: string | number | null;
  forecast?: string | number | null; previous?: string | number | null;
};
export type IntradayMark = { time: number; equity: number; balance: number; flat: boolean };
export type IntradayPath = {
  timezone: 'UTC' | 'Europe/Prague'; from: number; to: number;
  openingEquity: number; openingBalance: number; marks: IntradayMark[];
  complete: boolean; model: 'recorded-ticks' | 'synchronized-ticks';
};
export type ReturnPoint = {
  date: string; return: number; traded?: boolean; flat?: boolean;
  /** Minimum equity change from this day's opening equity. Never infer from daily close. */
  intradayMin?: number; intradayComplete?: boolean; intraday?: IntradayPath; dayTimezone?: 'UTC' | 'Europe/Prague';
  /** Balance / equity at day boundaries, needed for the actual midnight balance rule. */
  startBalanceRatio?: number; endBalanceRatio?: number;
};
export type EquityPoint = { date: string; equity: number };
export type QuantParams = {
  lookback: number; atrPeriod: number; entryK: number; stopS: number; targetTP: number;
  maxHold: number; costPips: number; riskPct: number; pipSize: number;
  spreadPips: number; slippagePips: number; mode: 'close' | 'ohlc' | 'tick';
  strategy: 'breakout' | 'mean-reversion' | 'news'; meanLookback?: number; meanEntryZ?: number; newsWindowMinutes: number; events?: EconomicEvent[];
  eventType?: string; initialEquity: number; startIndex?: number; captureIntraday?: boolean; maxIntradayMarks?: number; captureAfterDays?: number; dayTimezone?: 'UTC' | 'Europe/Prague';
};
export type Trade = {
  entryDate: string; exitDate: string; entryPrice: number; exitPrice: number;
  side: 'long' | 'short'; R: number; pnl: number; reason: 'stop' | 'target' | 'time' | 'last';
  entryIndex: number; exitIndex: number; riskAmount: number;
};
export type Stats = {
  totalReturn: number; cagr: number; sharpe: number; maxDrawdown: number;
  trades: number; winRate: number | null; profitFactor: number | null;
  averageR: number | null; returnMaxDD: number | null;
};
export type BacktestResult = {
  equity: EquityPoint[]; dailyReturns: ReturnPoint[]; trades: Trade[]; stats: Stats;
  params: QuantParams; notes: string[];
};
export type Progress = (fraction: number) => void;
export type Sleeve = { name: string; returns: ReturnPoint[] };
