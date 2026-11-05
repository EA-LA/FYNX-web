var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/edge/index.ts
var index_exports = {};
__export(index_exports, {
  BRIEF_TEMPLATES: () => BRIEF_TEMPLATES,
  COT_MARKETS: () => COT_MARKETS,
  DAY: () => DAY,
  DEFAULT_STRATEGIES: () => DEFAULT_STRATEGIES,
  EDGE_CONFIG: () => EDGE_CONFIG,
  adxSeries: () => adxSeries,
  buildSnapshot: () => buildSnapshot,
  calendarFlag: () => calendarFlag,
  classifyRegime: () => classifyRegime,
  clipScoreParts: () => clipScoreParts,
  completedDailyBars: () => completedDailyBars,
  computeEventRisk: () => computeEventRisk,
  computeMarket: () => computeMarket,
  computeRegime: () => computeRegime,
  computeSnapshot: () => computeSnapshot,
  computeTradePlan: () => computeTradePlan,
  correlationRisk: () => correlationRisk,
  dailyBrief: () => dailyBrief,
  efficiencyRatio: () => efficiencyRatio,
  emptyState: () => emptyState,
  eventMoves: () => eventMoves,
  known: () => known,
  marketMood: () => marketMood,
  missing: () => missing,
  netPosition: () => netPosition,
  percentileRank: () => percentileRank,
  positioning: () => positioning,
  runStrategyBacktest: () => runStrategyBacktest,
  scoreStrategy: () => scoreStrategy,
  shrinkAverage: () => shrinkAverage,
  signedCorrelation: () => signedCorrelation,
  stateSeries: () => stateSeries,
  strategyATR: () => strategyATR,
  tagTrades: () => tagTrades,
  tradeStatistics: () => tradeStatistics,
  volatilityBucket: () => volatilityBucket,
  weeklyRegimes: () => weeklyRegimes
});
module.exports = __toCommonJS(index_exports);

// lib/edge/config.ts
var EDGE_CONFIG = {
  erPeriod: 20,
  adxPeriod: 14,
  atrPeriod: 14,
  volatilityWindow: 252,
  regimes: { strong: { er: 0.45, adx: 30 }, trend: { er: 0.3, adx: 22 }, weakER: 0.2, rangeVolatility: 50 },
  volatilityBuckets: { low: 33, high: 66 },
  cotHistoryYears: 3,
  cotMinimumReports: 104,
  crowdingQuantile: 0.85,
  similarDesired: 30,
  similarMinimum: 15,
  shrinkagePriorTrades: 30,
  minimumBucketTrades: 10,
  weights: { regime: 40, volatility: 25, record: 20, positioningPositive: 15, positioningNegative: 10, eventPenalty: 20 },
  recordMapping: { zeroAtAvgR: -0.25, fullAtAvgR: 0.5 },
  fitThreshold: 70,
  maybeThreshold: 45,
  mood: { riskOffVix: 25, riskOnVix: 15, threshold: 0.25, minimumMoveParts: 4 },
  dailyFreshnessMs: 4 * 864e5,
  correlationWindow: 20,
  correlationWarning: 0.8,
  brokerFreshnessMs: 18e4,
  quoteFreshnessMs: 9e5
};
var DEFAULT_STRATEGIES = [
  { id: "builtin-atr-breakout", name: "ATR breakout", kind: "breakout", params: { strategy: "breakout", lookback: 20, atrPeriod: 14, entryK: 0.25, stopS: 2, targetTP: 4, maxHold: 20, riskPct: 0.5, costPips: 1.5, mode: "ohlc" }, description: "Completed close breaks the prior 20 closes by 0.25 ATR; next-bar entry, 2 ATR stop, 4 ATR target, 20-bar hold." },
  { id: "builtin-mean-reversion", name: "Mean reversion", kind: "mean-reversion", params: { strategy: "mean-reversion", meanLookback: 20, meanEntryZ: 1.5, lookback: 20, atrPeriod: 14, entryK: 0, stopS: 2, targetTP: 2, maxHold: 10, riskPct: 0.5, costPips: 1.5, mode: "ohlc" }, description: "Fade a completed close more than 1.5 sample standard deviations from the preceding 20 closes; next-bar entry, 2 ATR stop/target, 10-bar hold." },
  { id: "builtin-news-drift", name: "News drift", kind: "news", params: { strategy: "news", lookback: 20, atrPeriod: 14, entryK: 0.25, stopS: 2, targetTP: 4, maxHold: 5, riskPct: 0.5, costPips: 1.5, mode: "close", newsWindowMinutes: 60 }, description: "Follow the recorded high-impact release day close-to-close move beyond 0.25 ATR; daily proxy, not a 60-minute fill. Requires actual calendar history." }
];
var COT_MARKETS = {
  EURUSD: [{ market: "EUR", direction: 1 }],
  GBPUSD: [{ market: "GBP", direction: 1 }],
  USDJPY: [{ market: "JPY", direction: -1 }],
  AUDUSD: [{ market: "AUD", direction: 1 }],
  USDCAD: [{ market: "CAD", direction: -1 }],
  USDCHF: [{ market: "CHF", direction: -1 }],
  NZDUSD: [{ market: "NZD", direction: 1 }],
  EURJPY: [{ market: "EUR", direction: 1 }, { market: "JPY", direction: -1 }],
  GBPJPY: [{ market: "GBP", direction: 1 }, { market: "JPY", direction: -1 }],
  EURGBP: [{ market: "EUR", direction: 1 }, { market: "GBP", direction: -1 }],
  XAUUSD: [{ market: "XAU", direction: 1 }],
  XAGUSD: [{ market: "XAG", direction: 1 }],
  US30: [{ market: "US30", direction: 1 }],
  NAS100: [{ market: "NAS100", direction: 1 }],
  SPX500: [{ market: "SPX500", direction: 1 }],
  BTCUSD: [{ market: "BTC", direction: 1 }],
  ETHUSD: [{ market: "ETH", direction: 1 }]
};
var BRIEF_TEMPLATES = {
  fits: "{first} with {firstStrategy} scores {firstScore}; {second} with {secondStrategy} scores {secondScore}.",
  oneFit: "{first} with {firstStrategy} is the strongest measured fit at {firstScore}.",
  noFits: "No strategy has a complete, sufficiently sampled fit score for this snapshot.",
  avoid: "{market} is the weakest measured fit ({score}); its historical sample contains {count} trades.",
  event: "Next high-impact release: {event} ({currency}) at {time}."
};

// lib/quant/intraday.ts
var IntradayCapture = class {
  constructor(enabled, timezone, limit = 5e4, skipDays = 0) {
    this.enabled = enabled;
    this.timezone = timezone;
    this.limit = limit;
    this.skipDays = skipDays;
  }
  enabled;
  timezone;
  limit;
  skipDays;
  paths = /* @__PURE__ */ new Map();
  count = 0;
  days = 0;
  exceeded = false;
  begin(date, from, equity, balance) {
    if (!this.enabled || ++this.days <= this.skipDays) return;
    this.paths.set(date, { timezone: this.timezone, from, to: from, openingEquity: equity, openingBalance: balance, marks: [], complete: !this.exceeded, model: "recorded-ticks" });
  }
  record(date, time, equity, balance, flat) {
    if (!this.enabled) return;
    const path = this.paths.get(date);
    if (!path) return;
    if (this.exceeded) {
      path.complete = false;
      return;
    }
    const last = path.marks[path.marks.length - 1];
    if (last && last.equity === equity && last.balance === balance && last.flat === flat) return;
    if (this.count >= this.limit) {
      this.exceeded = true;
      path.complete = false;
      return;
    }
    path.marks.push({ time, equity, balance, flat });
    this.count++;
  }
  cover(date, to, complete) {
    const path = this.paths.get(date);
    if (!path) return;
    path.to = to;
    path.complete &&= complete && !this.exceeded;
  }
  path(date) {
    return this.paths.get(date);
  }
};

// lib/quant/config.ts
var DEFAULT_PARAMS = Object.freeze({
  lookback: 20,
  atrPeriod: 14,
  entryK: 0.25,
  stopS: 2,
  targetTP: 4,
  maxHold: 20,
  costPips: 1.5,
  riskPct: 0.5,
  pipSize: 1e-4,
  spreadPips: 0,
  slippagePips: 0,
  mode: "close",
  strategy: "breakout",
  newsWindowMinutes: 15,
  initialEquity: 1e4
});
var symbol = (id, label, name, group, pipSize, dukascopyId, currencies, aliases = []) => ({ id, symbol: label, label, name, group, pipSize, dukascopy: dukascopyId, dukascopyId, quoteSymbol: label, currencies, aliases: [id.toLowerCase(), label.toLowerCase(), ...aliases] });
var SYMBOLS = [
  symbol("EURUSD", "EUR/USD", "Euro / US dollar", "Forex majors", 1e-4, "eurusd", ["EUR", "USD"], ["euro"]),
  symbol("GBPUSD", "GBP/USD", "British pound / US dollar", "Forex majors", 1e-4, "gbpusd", ["GBP", "USD"], ["cable"]),
  symbol("USDJPY", "USD/JPY", "US dollar / Japanese yen", "Forex majors", 0.01, "usdjpy", ["USD", "JPY"], ["dollar yen"]),
  symbol("AUDUSD", "AUD/USD", "Australian dollar / US dollar", "Forex majors", 1e-4, "audusd", ["AUD", "USD"], ["aussie"]),
  symbol("USDCAD", "USD/CAD", "US dollar / Canadian dollar", "Forex majors", 1e-4, "usdcad", ["USD", "CAD"], ["loonie"]),
  symbol("USDCHF", "USD/CHF", "US dollar / Swiss franc", "Forex majors", 1e-4, "usdchf", ["USD", "CHF"], ["swissy"]),
  symbol("NZDUSD", "NZD/USD", "New Zealand dollar / US dollar", "Forex majors", 1e-4, "nzdusd", ["NZD", "USD"], ["kiwi"]),
  symbol("XAUUSD", "XAU/USD", "Gold", "Metals & crosses", 0.1, "xauusd", ["USD"], ["gold", "xau"]),
  symbol("XAGUSD", "XAG/USD", "Silver", "Metals & crosses", 0.01, "xagusd", ["USD"], ["silver", "xag"]),
  symbol("EURJPY", "EUR/JPY", "Euro / Japanese yen", "Metals & crosses", 0.01, "eurjpy", ["EUR", "JPY"]),
  symbol("GBPJPY", "GBP/JPY", "British pound / Japanese yen", "Metals & crosses", 0.01, "gbpjpy", ["GBP", "JPY"]),
  symbol("EURGBP", "EUR/GBP", "Euro / British pound", "Metals & crosses", 1e-4, "eurgbp", ["EUR", "GBP"]),
  symbol("US30", "US30", "US 30 CFD", "Indices & crypto", 1, "usa30idxusd", ["USD"], ["dow", "dow jones"]),
  symbol("NAS100", "NAS100", "US Tech 100 CFD", "Indices & crypto", 1, "usatechidxusd", ["USD"], ["nasdaq", "nasdaq 100"]),
  symbol("SPX500", "SPX500", "US 500 CFD", "Indices & crypto", 0.1, "usa500idxusd", ["USD"], ["sp500", "s&p 500", "s&p"]),
  symbol("BTCUSD", "BTC/USD", "Bitcoin", "Indices & crypto", 1, "btcusd", ["USD"], ["bitcoin", "btc"]),
  symbol("ETHUSD", "ETH/USD", "Ethereum", "Indices & crypto", 0.1, "ethusd", ["USD"], ["ethereum", "eth"])
];
var ftmoCommon = { source: "https://ftmo.com/en/trading-objectives/", verifiedOn: "2026-11-03", timezone: "Europe/Prague" };
var FTMO_RULES = {
  "2-step": { ...ftmoCommon, id: "2-step", label: "FTMO 2-Step", phaseTargets: [0.1, 0.05], dailyLoss: 0.05, maxLoss: 0.1, trailing: false, minTradingDays: 4, bestDayLimit: null, bestDayBasis: null },
  "1-step": { ...ftmoCommon, id: "1-step", label: "FTMO 1-Step \xB7 current consistency", phaseTargets: [0.1], dailyLoss: 0.03, maxLoss: 0.1, trailing: true, minTradingDays: 0, bestDayLimit: 0.5, bestDayBasis: "net-profit" },
  "1-step-legacy": { ...ftmoCommon, id: "1-step-legacy", label: "FTMO 1-Step \xB7 pre-12 Oct 2026", phaseTargets: [0.1], dailyLoss: 0.03, maxLoss: 0.1, trailing: true, minTradingDays: 0, bestDayLimit: 0.5, bestDayBasis: "positive-days" }
};

// lib/quant/math.ts
function finite(value, name, min = -Infinity, max = Infinity) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be a finite number between ${min} and ${max}.`);
  return value;
}
function integer(value, name, min, max) {
  const n = finite(value, name, min, max);
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer.`);
  return n;
}
var mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
function variance(values) {
  const m = mean(values);
  return values.length > 1 ? values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1) : 0;
}
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q, j = Math.floor(i);
  return sorted[j] + (sorted[Math.min(j + 1, sorted.length - 1)] - sorted[j]) * (i - j);
}
var timeMs = (time) => {
  const t = typeof time === "number" ? time : Date.parse(time);
  if (!Number.isFinite(t)) throw new Error("A valid ISO timestamp or epoch milliseconds is required.");
  return t;
};
function statistics(returns, trades = [], initial = 1e4) {
  const vals = returns.map((p) => typeof p === "number" ? p : p.return);
  let value = 1, peak = 1, dd = 0;
  for (const r of vals) {
    value *= Math.max(0, 1 + r);
    peak = Math.max(peak, value);
    dd = Math.max(dd, peak ? 1 - value / peak : 0);
  }
  const totalReturn = value - 1;
  const first = returns[0], last = returns[returns.length - 1];
  const years = typeof first === "object" && typeof last === "object" && last.date !== first.date ? Math.max(1 / 252, (timeMs(last.date) - timeMs(first.date)) / 864e5 / 365.25) : Math.max(1 / 252, vals.length / 252);
  const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl < 0), profit = wins.reduce((s, t) => s + t.pnl, 0), loss = -losses.reduce((s, t) => s + t.pnl, 0);
  const sd = Math.sqrt(variance(vals));
  return { totalReturn, cagr: value === 0 ? -1 : Math.pow(value, 1 / years) - 1, sharpe: sd > 1e-15 ? mean(vals) / sd * Math.sqrt(252) : 0, maxDrawdown: dd, trades: trades.length, winRate: trades.length ? wins.length / trades.length : null, profitFactor: loss > 0 ? profit / loss : null, averageR: trades.length ? mean(trades.map((t) => t.R)) : null, returnMaxDD: dd > 0 ? totalReturn / dd : null };
}
function correlation(a, b) {
  const ma = mean(a), mb = mean(b);
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa > 0 && bb > 0 ? Math.max(-1, Math.min(1, ab / Math.sqrt(aa * bb))) : 0;
}

// lib/quant/backtest.ts
function normalizeParams(input = {}) {
  const p = { ...DEFAULT_PARAMS, ...input };
  p.dayTimezone = input.dayTimezone ?? (p.mode === "close" ? "UTC" : "Europe/Prague");
  if (!["UTC", "Europe/Prague"].includes(p.dayTimezone)) throw new Error("Choose UTC or Europe/Prague day boundaries.");
  integer(p.lookback, "Lookback", 2, 500);
  integer(p.atrPeriod, "ATR period", 2, 500);
  finite(p.entryK, "Entry multiplier", 0, 10);
  finite(p.stopS, "Stop multiplier", 0.05, 20);
  finite(p.targetTP, "Target multiplier", 0.05, 100);
  integer(p.maxHold, "Maximum hold", 1, 2e3);
  finite(p.costPips, "Round-trip cost", 0, 1e4);
  finite(p.riskPct, "Risk percent", 1e-3, 20);
  finite(p.pipSize, "Pip size", 1e-8, 1e4);
  finite(p.spreadPips, "Spread", 0, 1e4);
  finite(p.slippagePips, "Slippage", 0, 1e4);
  integer(p.newsWindowMinutes, "News window", 1, 1440);
  finite(p.initialEquity, "Initial equity", 1, 1e12);
  if (!["close", "ohlc", "tick"].includes(p.mode)) throw new Error("Choose close, ohlc or tick execution.");
  if (!["breakout", "mean-reversion", "news"].includes(p.strategy)) throw new Error("Choose breakout, mean-reversion or news strategy.");
  p.meanLookback = integer(p.meanLookback ?? 20, "Mean-reversion lookback", 2, 500);
  p.meanEntryZ = finite(p.meanEntryZ ?? 1.5, "Mean-reversion entry Z", 0.1, 10);
  if (p.captureIntraday !== void 0 && typeof p.captureIntraday !== "boolean") throw new Error("captureIntraday must be boolean.");
  if (p.maxIntradayMarks !== void 0) integer(p.maxIntradayMarks, "Intraday capture budget", 100, 5e4);
  if (p.captureAfterDays !== void 0) integer(p.captureAfterDays, "Intraday capture warmup days", 0, 3660);
  if (p.startIndex !== void 0) integer(p.startIndex, "Evaluation start", 0, 1e8);
  return p;
}
function validateBars(bars, mode = "close") {
  if (!Array.isArray(bars) || bars.length < 3 || bars.length > 2e6) throw new Error("Between 3 and 2,000,000 price bars are required.");
  let prev = -Infinity;
  let tickCount = 0;
  for (let bi = 0; bi < bars.length; bi++) {
    const bar = bars[bi], t = timeMs(bar.time);
    if (t <= prev) throw new Error("Price bars must have unique, increasing timestamps.");
    prev = t;
    finite(bar.close, "Close", Number.MIN_VALUE, 1e12);
    if (mode !== "close") {
      for (const key of ["open", "high", "low"]) finite(bar[key], key, Number.MIN_VALUE, 1e12);
      if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close) || bar.low > bar.high) throw new Error("OHLC bars have inconsistent high/low prices.");
    }
    if (mode === "tick") {
      if (!Array.isArray(bar.ticks) || !bar.ticks.length) throw new Error("Tick execution requires recorded bid/ask ticks in every execution bar.");
      let last = -Infinity;
      for (const tick of bar.ticks) {
        const tt = timeMs(tick.time);
        if (tt < last) throw new Error("Ticks must be chronological.");
        if (tt < t || bi + 1 < bars.length && tt >= timeMs(bars[bi + 1].time)) throw new Error("Each tick must lie inside its execution bar.");
        last = tt;
        finite(tick.bid, "Tick bid", Number.MIN_VALUE, 1e12);
        finite(tick.ask, "Tick ask", tick.bid, 1e12);
        if (++tickCount > 1e7) throw new Error("Split tick runs into chunks of at most 10,000,000 ticks.");
      }
    }
  }
}
function closeATR(closes, period = 14) {
  integer(period, "ATR period", 1, 500);
  const out = Array(closes.length).fill(NaN);
  let sum = 0;
  for (let i = 1; i < closes.length; i++) {
    sum += Math.abs(closes[i] - closes[i - 1]);
    if (i > period) sum -= Math.abs(closes[i - period] - closes[i - period - 1]);
    if (i >= period) out[i] = sum / period;
  }
  return out;
}
function wilderATR(bars, period = 14) {
  integer(period, "ATR period", 1, 500);
  const out = Array(bars.length).fill(NaN);
  let sum = 0, previous = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i], tr = i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close));
    if (i < period) sum += tr;
    if (i === period - 1) out[i] = previous = sum / period;
    else if (i >= period) out[i] = previous = (previous * (period - 1) + tr) / period;
  }
  return out;
}
function breakoutSignal(bars, i, atr, p) {
  if (i < p.lookback || !Number.isFinite(atr) || atr <= 0) return 0;
  let high = -Infinity, low = Infinity;
  for (let j = i - p.lookback; j < i; j++) {
    high = Math.max(high, bars[j].close);
    low = Math.min(low, bars[j].close);
  }
  return bars[i].close > high + p.entryK * atr ? 1 : bars[i].close < low - p.entryK * atr ? -1 : 0;
}
function meanReversionSignal(bars, i, p) {
  const n = p.meanLookback ?? 20, z = p.meanEntryZ ?? 1.5;
  if (i < n) return 0;
  let sum = 0;
  for (let j = i - n; j < i; j++) sum += bars[j].close;
  const average = sum / n;
  let ss = 0;
  for (let j = i - n; j < i; j++) ss += (bars[j].close - average) ** 2;
  const sd = Math.sqrt(ss / (n - 1));
  if (!(sd > 0)) return 0;
  return bars[i].close < average - z * sd ? 1 : bars[i].close > average + z * sd ? -1 : 0;
}
function relevantEvents(events, eventType) {
  if (!events?.length) throw new Error("News strategies require actual high-impact economic-calendar events. Configure a calendar provider first.");
  if (events.length > 1e5) throw new Error("Too many calendar events.");
  const confirmed = events.filter((e) => e.timing !== "estimated" && e.impact === "high" && (!eventType || eventType === "all" || e.type === eventType || e.name === eventType)).map((e) => {
    timeMs(e.time);
    return e;
  });
  if (!confirmed.length) throw new Error("No confirmed high-impact event times match this strategy.");
  return confirmed;
}
function barIntervalMs(bars) {
  const samples = [];
  for (let i = 1; i < Math.min(bars.length, 513); i++) samples.push(timeMs(bars[i].time) - timeMs(bars[i - 1].time));
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] || 864e5;
}
function newsSignals(bars, atr, p) {
  const events = relevantEvents(p.events, p.eventType), result = /* @__PURE__ */ new Map(), interval = barIntervalMs(bars);
  const times = bars.map((b) => timeMs(b.time)), ends = times.map((t) => t + interval);
  if (p.mode !== "close" && interval > p.newsWindowMinutes * 6e4) throw new Error("The news window needs a finer bar timeframe. Use M1/M5 bars or recorded ticks.");
  for (const event of events) {
    const release = timeMs(event.time);
    if (p.mode === "close") {
      const date = new Date(release).toISOString().slice(0, 10), i = lowerBound(times, timeMs(date));
      if (i <= 0 || i >= bars.length || new Date(times[i]).toISOString().slice(0, 10) !== date) continue;
      const move = bars[i].close - bars[i - 1].close;
      if (Math.abs(move) > p.entryK * atr[i]) result.set(i, Math.sign(move));
    } else {
      let start = lowerBound(ends, release);
      if (start === ends.length || ends[start] > release) start--;
      const end = lowerBound(ends, release + p.newsWindowMinutes * 6e4);
      if (start < 0 || end >= bars.length || release - ends[start] > interval || ends[end] - (release + p.newsWindowMinutes * 6e4) > interval) continue;
      const move = bars[end].close - bars[start].close;
      if (Number.isFinite(atr[end]) && Math.abs(move) > p.entryK * atr[end]) result.set(end, Math.sign(move));
    }
  }
  return result;
}
function tickNewsEntries(bars, atr, p) {
  const entries = /* @__PURE__ */ new Map(), times = bars.map((b) => timeMs(b.time));
  const quoteAt = (timestamp) => {
    let bi = lowerBound(times, timestamp);
    if (bi === times.length || times[bi] > timestamp) bi--;
    if (bi < 0) return null;
    for (; bi < bars.length; bi++) {
      const ticks = bars[bi].ticks;
      let a = 0, b = ticks.length;
      while (a < b) {
        const m = a + b >>> 1;
        if (timeMs(ticks[m].time) < timestamp) a = m + 1;
        else b = m;
      }
      if (a < ticks.length) {
        const tick = ticks[a];
        return timeMs(tick.time) - timestamp <= 6e4 ? { bi, ti: a, tick } : null;
      }
    }
    return null;
  };
  for (const event of relevantEvents(p.events, p.eventType)) {
    const release = timeMs(event.time), begin = quoteAt(release), end = quoteAt(release + p.newsWindowMinutes * 6e4);
    if (!begin || !end || end.bi < 1) continue;
    const a = atr[end.bi - 1], move = (end.tick.bid + end.tick.ask - begin.tick.bid - begin.tick.ask) / 2;
    if (!(a > 0) || Math.abs(move) <= p.entryK * a) continue;
    if (!entries.has(end.bi)) entries.set(end.bi, []);
    entries.get(end.bi).push({ tickIndex: end.ti, side: Math.sign(move), atr: a });
  }
  return entries;
}
function lowerBound(values, target) {
  let a = 0, b = values.length;
  while (a < b) {
    const m = a + b >>> 1;
    if (values[m] < target) a = m + 1;
    else b = m;
  }
  return a;
}
function backtest(bars, input = {}) {
  const p = normalizeParams(input);
  validateBars(bars, p.mode);
  const start = Math.max(p.startIndex || 0, Math.max(p.lookback, p.strategy === "mean-reversion" ? p.meanLookback : 0) + p.atrPeriod + 1);
  if (start >= bars.length - 1) throw new Error(`Not enough history: at least ${start + 2} bars are needed for these settings.`);
  const atr = p.mode === "close" ? closeATR(bars.map((b) => b.close), p.atrPeriod) : wilderATR(bars, p.atrPeriod);
  const events = p.strategy === "news" && p.mode !== "tick" ? newsSignals(bars, atr, p) : /* @__PURE__ */ new Map();
  const tickEntries = p.strategy === "news" && p.mode === "tick" ? tickNewsEntries(bars, atr, p) : /* @__PURE__ */ new Map(), interval = barIntervalMs(bars);
  const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: p.dayTimezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dayKey = (t) => p.dayTimezone === "UTC" ? new Date(timeMs(t)).toISOString().slice(0, 10) : dateFormat.format(timeMs(t));
  const capture = new IntradayCapture(p.captureIntraday === true && p.mode === "tick", p.dayTimezone, p.maxIntradayMarks, p.captureAfterDays);
  const trades = [];
  const days = [];
  const position = { current: null };
  let balance = p.initialEquity, equity = balance, pending = null;
  let day = null;
  const commission = p.costPips * p.pipSize / 2, halfSpread = p.spreadPips * p.pipSize / 2, slip = p.slippagePips * p.pipSize;
  const marketPrice = (b, side, entry, open = false) => {
    if (p.mode === "tick") {
      const tick = open ? b.ticks[0] : b.ticks[b.ticks.length - 1];
      return (side > 0 ? entry ? tick.ask : tick.bid : entry ? tick.bid : tick.ask) + (entry ? 1 : -1) * side * slip;
    }
    return (open ? b.open : b.close) + (entry ? 1 : -1) * side * (halfSpread + slip);
  };
  const mark = (price) => position.current ? balance + (price - position.current.entry) * position.current.side * position.current.units : balance;
  const enter = (side, a, i, atOpen, entryTick) => {
    const b = bars[i], price = entryTick ? (side > 0 ? entryTick.ask : entryTick.bid) + side * slip : marketPrice(b, side, true, atOpen), risk = equity * p.riskPct / 100, units = risk / (p.stopS * a);
    if (!(a > 0 && units > 0)) return;
    position.current = { side, entry: price, stop: price - side * p.stopS * a, target: price + side * p.targetTP * a, units, risk, atr: a, entryIndex: i, entryDate: new Date(timeMs(entryTick?.time ?? (p.mode === "tick" ? b.ticks[0].time : b.time))).toISOString(), entryCommission: commission * units };
    balance -= position.current.entryCommission;
    day.traded = true;
  };
  const exit = (price, i, reason, tickTime) => {
    if (!position.current) return;
    const entry = position.current;
    const pnl = (price - entry.entry) * entry.side * entry.units - (entry.entryCommission + commission * entry.units);
    balance += (price - entry.entry) * entry.side * entry.units - commission * entry.units;
    trades.push({ entryDate: entry.entryDate, exitDate: new Date(timeMs(tickTime ?? bars[i].time)).toISOString(), entryPrice: entry.entry, exitPrice: price, side: entry.side > 0 ? "long" : "short", R: pnl / entry.risk, pnl, reason, entryIndex: entry.entryIndex, exitIndex: i, riskAmount: entry.risk });
    position.current = null;
    equity = balance;
    day.minEquity = Math.min(day.minEquity, equity);
  };
  for (let i = start; i < bars.length; i++) {
    const b = bars[i], date = dayKey(b.time);
    if (!day || day.date !== date) {
      day = { date, startEquity: equity, startBalance: balance, minEquity: equity, endEquity: equity, endBalance: balance, traded: false, flat: !position.current, complete: p.mode !== "close" && p.dayTimezone === "Europe/Prague" };
      days.push(day);
      capture.begin(date, timeMs(b.time), equity, balance);
    }
    const endTime = p.mode === "tick" ? b.ticks[b.ticks.length - 1].time : timeMs(b.time) + interval - 1;
    if (p.mode !== "close" && dayKey(endTime) !== date) day.complete = false;
    if (pending && !position.current && i < bars.length) {
      enter(pending.side, pending.atr, i, true);
      pending = null;
    }
    if (p.mode === "tick") {
      const news = tickEntries.get(i) || [];
      for (let ti = 0; ti < b.ticks.length; ti++) {
        const tick = b.ticks[ti];
        if (!position.current && i < bars.length - 1) {
          const entry = news.find((e) => e.tickIndex === ti);
          if (entry) enter(entry.side, entry.atr, i, true, tick);
        }
        if (!position.current) {
          capture.record(date, timeMs(tick.time), balance, balance, true);
          continue;
        }
        const px = (position.current.side > 0 ? tick.bid : tick.ask) - position.current.side * slip;
        day.minEquity = Math.min(day.minEquity, mark(px));
        if ((px - position.current.stop) * position.current.side <= 0) exit(px, i, "stop", tick.time);
        else if ((px - position.current.target) * position.current.side >= 0) exit(position.current.target - position.current.side * slip, i, "target", tick.time);
        capture.record(date, timeMs(tick.time), position.current ? mark(px) : balance, balance, !position.current);
      }
    } else if (position.current && p.mode === "ohlc") {
      const side = position.current.side, open = b.open - side * halfSpread, low = b.low - side * halfSpread, high = b.high - side * halfSpread;
      const stopHit = side > 0 ? low <= position.current.stop : high >= position.current.stop, targetHit = side > 0 ? high >= position.current.target : low <= position.current.target;
      if (stopHit) {
        const gap = side > 0 ? Math.min(open, position.current.stop) : Math.max(open, position.current.stop);
        exit(gap - side * slip, i, "stop");
      } else {
        const adverse = side > 0 ? low : high;
        day.minEquity = Math.min(day.minEquity, mark(adverse - side * slip));
        if (targetHit) exit(position.current.target - side * slip, i, "target");
      }
    } else if (position.current && p.mode === "close") {
      const px = marketPrice(b, position.current.side, false);
      day.minEquity = Math.min(day.minEquity, mark(px));
      if ((px - position.current.stop) * position.current.side <= 0) exit(px, i, "stop");
      else if ((px - position.current.target) * position.current.side >= 0) exit(px, i, "target");
    }
    if (position.current && (i - position.current.entryIndex + (p.mode === "close" ? 0 : 1) >= p.maxHold || i === bars.length - 1)) exit(marketPrice(b, position.current.side, false), i, i === bars.length - 1 ? "last" : "time", p.mode === "tick" ? b.ticks[b.ticks.length - 1].time : void 0);
    equity = position.current ? mark(marketPrice(b, position.current.side, false)) : balance;
    day.minEquity = Math.min(day.minEquity, equity);
    const justExited = trades.length && trades[trades.length - 1].exitIndex === i;
    if (!position.current && !pending && !justExited && i < bars.length - 1 && equity > 0) {
      const side = p.strategy === "news" ? p.mode === "tick" ? 0 : events.get(i) || 0 : p.strategy === "mean-reversion" ? meanReversionSignal(bars, i, p) : breakoutSignal(bars, i, atr[i], p);
      if (side) {
        if (p.mode === "close") {
          enter(side, atr[i], i, false);
          equity = position.current ? mark(marketPrice(b, side, false)) : balance;
        } else pending = { side, atr: atr[i] };
      }
    }
    if (!Number.isFinite(equity) || equity < 0) {
      equity = 0;
      balance = 0;
      position.current = null;
      pending = null;
    }
    day.endEquity = equity;
    day.endBalance = balance;
    day.flat = !position.current;
    day.minEquity = Math.min(day.minEquity, equity);
    if (p.mode === "tick") {
      capture.record(date, timeMs(b.ticks[b.ticks.length - 1].time), equity, balance, !position.current);
      capture.cover(date, timeMs(b.time) + interval, day.complete);
    }
  }
  const dailyReturns = days.map((d) => ({ date: d.date, return: d.startEquity > 0 ? d.endEquity / d.startEquity - 1 : 0, traded: d.traded, flat: d.flat, intradayMin: d.startEquity > 0 ? Math.max(-1, d.minEquity / d.startEquity - 1) : 0, intradayComplete: d.complete && (!capture.enabled || capture.path(d.date)?.complete === true), intraday: capture.path(d.date), dayTimezone: p.dayTimezone, startBalanceRatio: d.startEquity > 0 ? d.startBalance / d.startEquity : 1, endBalanceRatio: d.endEquity > 0 ? d.endBalance / d.endEquity : 1 }));
  const notes = [
    p.mode === "close" ? "Close-only fills at observed closes; gaps beyond stops are filled at the close. Intraday excursions are unknown." : "Signals use a completed bar and enter at the following bar open; ambiguous OHLC stop/target bars take the stop first.",
    "Fixed units are sized from equity at entry. Equity includes open P&L every day; per-trade R includes round-trip costs.",
    p.mode === "tick" ? "Recorded bid/ask ticks supply the spread. Configured slippage and round-trip fees are additional." : "Spread and slippage are user-supplied assumptions, not observed historical execution costs.",
    `Daily buckets use ${p.dayTimezone}. FTMO midnight boundaries are Europe/Prague; buckets or bars crossing that boundary retain the daily-data buffer.`
  ];
  if (capture.enabled) notes.push(capture.exceeded ? "Intraday timestamp capture reached its bounded mark budget; incomplete paths retain the FTMO buffer." : "Actual tick equity/balance timestamp paths are available for synchronized portfolio research.");
  if (p.strategy === "news") notes.push(p.mode === "close" ? "Daily news proxy uses the event day close-to-close move. It does not measure the immediate release response." : p.mode === "tick" ? "News observations use the first recorded quotes at release and release + X minutes; signals enter on that quote with prior completed-bar ATR." : "News observations use candle closing timestamps, rounded up by at most one bar; signals enter at the following open.");
  return { equity: days.map((d) => ({ date: d.date, equity: d.endEquity })), dailyReturns, trades, stats: statistics(dailyReturns, trades, p.initialEquity), params: p, notes };
}

// lib/edge/regime.ts
var known = (value, asOf) => ({ value, reason: null, ...asOf ? { asOf } : {} });
var missing = (reason) => ({ value: null, reason });
var DAY = 864e5;
function completedDailyBars(bars, asOf) {
  const cutoff = timeMs(asOf);
  let last = -Infinity;
  return bars.filter((b) => {
    const t = timeMs(b.time);
    if (t <= last) throw new Error("Daily bars must be unique and increasing.");
    last = t;
    if (!(Number.isFinite(b.close) && b.close > 0)) throw new Error("Daily close is invalid.");
    return t + DAY <= cutoff;
  });
}
function efficiencyRatio(closes, period = 20, index = closes.length - 1) {
  if (index < period) return null;
  let path = 0;
  for (let i = index - period + 1; i <= index; i++) path += Math.abs(closes[i] - closes[i - 1]);
  return path === 0 ? 0 : Math.abs(closes[index] - closes[index - period]) / path;
}
function adxSeries(bars, period = 14) {
  const out = Array(bars.length).fill(null);
  let trSum = 0, plus = 0, minus = 0, dxSum = 0, adx = 0, dxCount = 0;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], prev = bars[i - 1];
    if ([b.high, b.low, prev.high, prev.low].some((v) => !Number.isFinite(v))) return out;
    const up = b.high - prev.high, down = prev.low - b.low, pd = up > down && up > 0 ? up : 0, md = down > up && down > 0 ? down : 0;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close));
    if (i <= period) {
      trSum += tr;
      plus += pd;
      minus += md;
    } else {
      trSum = trSum - trSum / period + tr;
      plus = plus - plus / period + pd;
      minus = minus - minus / period + md;
    }
    if (i < period) continue;
    const pdi = trSum > 0 ? 100 * plus / trSum : 0, mdi = trSum > 0 ? 100 * minus / trSum : 0, dx = pdi + mdi > 0 ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0;
    if (dxCount < period) {
      dxSum += dx;
      dxCount++;
      if (dxCount === period) out[i] = adx = dxSum / period;
    } else out[i] = adx = (adx * (period - 1) + dx) / period;
  }
  return out;
}
function percentileRank(value, history) {
  if (history.length < 2 || !Number.isFinite(value)) return null;
  return Math.min(100, 100 * history.filter((v) => v < value).length / (history.length - 1));
}
function classifyRegime(er, adx, volatilityPercentile) {
  if (er >= EDGE_CONFIG.regimes.strong.er && adx >= EDGE_CONFIG.regimes.strong.adx) return "Strong trend";
  if (er >= EDGE_CONFIG.regimes.trend.er && adx >= EDGE_CONFIG.regimes.trend.adx) return "Trend";
  if (er >= EDGE_CONFIG.regimes.weakER) return "Weak trend";
  return volatilityPercentile < EDGE_CONFIG.regimes.rangeVolatility ? "Range" : "Choppy";
}
function volatilityBucket(percentile) {
  return percentile < EDGE_CONFIG.volatilityBuckets.low ? "low" : percentile > EDGE_CONFIG.volatilityBuckets.high ? "high" : "mid";
}
function stateSeries(bars) {
  const closes = bars.map((b) => b.close), hasOHLC = bars.every((b) => [b.open, b.high, b.low].every((v) => typeof v === "number" && Number.isFinite(v)) && b.high >= Math.max(b.open, b.close) && b.low <= Math.min(b.open, b.close));
  const atr = hasOHLC ? wilderATR(bars, EDGE_CONFIG.atrPeriod) : Array(bars.length).fill(NaN), adx = hasOHLC ? adxSeries(bars, EDGE_CONFIG.adxPeriod) : Array(bars.length).fill(null), normalized = atr.map((a, i) => a / bars[i].close);
  return bars.map((b, i) => {
    const date = new Date(timeMs(b.time)).toISOString().slice(0, 10), availableAt = new Date(timeMs(b.time) + DAY).toISOString(), er = efficiencyRatio(closes, EDGE_CONFIG.erPeriod, i), volHistory = normalized.slice(Math.max(0, i - EDGE_CONFIG.volatilityWindow + 1), i + 1).filter(Number.isFinite);
    const vol = volHistory.length === EDGE_CONFIG.volatilityWindow ? percentileRank(normalized[i], volHistory) : null, regime = er !== null && adx[i] !== null && vol !== null ? classifyRegime(er, adx[i], vol) : null;
    const directional = er === null ? null : er * Math.sign(b.close - closes[i - EDGE_CONFIG.erPeriod]);
    const range = bars.slice(Math.max(0, i - EDGE_CONFIG.erPeriod + 1), i + 1);
    return { date, availableAt, regime: regime ? known(regime, availableAt) : missing(!hasOHLC ? "Daily OHLC is required for ADX and true ATR." : "At least 252 valid ATR observations are required to classify regime and volatility."), efficiencyRatio: er === null ? missing("Twenty prior completed daily closes are required.") : known(er, availableAt), trendStrength: directional === null ? missing("Twenty prior completed daily closes are required.") : known(directional, availableAt), adx: adx[i] === null ? missing(!hasOHLC ? "Daily OHLC is unavailable." : "ADX needs 28 daily bars.") : known(adx[i], availableAt), atr: Number.isFinite(atr[i]) ? known(atr[i], availableAt) : missing("Fourteen daily OHLC bars are required."), volatilityPercentile: vol === null ? missing("A full 252-observation history of ATR/close is required.") : known(vol, availableAt), volatilityBucket: vol === null ? missing("Volatility percentile is unavailable.") : known(volatilityBucket(vol), availableAt), high20: range.length === EDGE_CONFIG.erPeriod && hasOHLC ? known(Math.max(...range.map((x) => x.high)), availableAt) : missing("Twenty completed daily OHLC bars are required."), low20: range.length === EDGE_CONFIG.erPeriod && hasOHLC ? known(Math.min(...range.map((x) => x.low)), availableAt) : missing("Twenty completed daily OHLC bars are required."), close: known(b.close, availableAt) };
  });
}
function emptyState(reason = "No completed daily bars are available.") {
  return { date: null, availableAt: null, regime: missing(reason), efficiencyRatio: missing(reason), trendStrength: missing(reason), adx: missing(reason), atr: missing(reason), volatilityPercentile: missing(reason), volatilityBucket: missing(reason), high20: missing(reason), low20: missing(reason), close: missing(reason) };
}
function computeRegime(bars, asOf) {
  const completed = completedDailyBars(bars, asOf);
  return stateSeries(completed).at(-1) || emptyState();
}
function weeklyRegimes(states, asOf) {
  const end = new Date(asOf);
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - (end.getUTCDay() + 6) % 7);
  return Array.from({ length: 52 }, (_, i) => {
    const monday = end.getTime() - (51 - i) * 7 * DAY, cutoff = Math.min(timeMs(asOf), monday + 7 * DAY);
    let selected;
    for (const state of states) {
      if (timeMs(state.availableAt) <= cutoff) selected = state;
      else break;
    }
    return { week: new Date(monday).toISOString().slice(0, 10), regime: selected?.regime.value ?? null };
  });
}

// lib/edge/positioning.ts
function netPosition(long, short) {
  if (!Number.isFinite(long) || !Number.isFinite(short) || long < 0 || short < 0 || long + short === 0) return null;
  return (long - short) / (long + short);
}
function positioning(symbol2, records, asOf) {
  const legs = COT_MARKETS[symbol2], cutoff = timeMs(asOf), empty = (reason) => ({ net: missing(reason), crowded: missing(reason), percentile85: missing(reason), reportDate: null, availableAt: null, history: [], legs: [], basis: "CFTC futures positioning; not spot-account flows." });
  if (!legs) return empty("No verified CFTC contract mapping is configured for this market.");
  if (!records?.length) return empty("CFTC positioning history is unavailable.");
  const permitted = records.filter((r) => r.report === (r.market === "XAU" || r.market === "XAG" ? "DISAGGREGATED" : "TFF") && Number.isFinite(timeMs(r.availableAt)) && timeMs(r.availableAt) <= cutoff && timeMs(r.reportDate) <= cutoff && netPosition(r.long, r.short) !== null);
  const selected = legs.map((leg) => {
    const byDate = /* @__PURE__ */ new Map();
    for (const row of permitted) {
      if (row.market !== leg.market) continue;
      const previous = byDate.get(row.reportDate);
      if (!previous || previous.availableAt < row.availableAt) byDate.set(row.reportDate, row);
    }
    const history2 = [...byDate.values()].sort((a, b) => a.reportDate.localeCompare(b.reportDate));
    return { leg, history: history2, byDate, current: history2.at(-1) };
  });
  if (selected.some((x) => !x.current)) return empty("No CFTC row version for every required futures leg was available at this time.");
  const current = selected.map((x) => ({ market: x.leg.market, direction: x.leg.direction, net: netPosition(x.current.long, x.current.short), reportDate: x.current.reportDate, availableAt: x.current.availableAt }));
  const net = current.reduce((s, r) => s + r.direction * r.net, 0) / current.length, reportDate = current.map((r) => r.reportDate).sort()[0], availableAt = current.map((r) => r.availableAt).sort().at(-1);
  const dates = [...new Set(selected.flatMap((x) => x.history.map((r) => r.reportDate)))].filter((d) => timeMs(d) >= cutoff - EDGE_CONFIG.cotHistoryYears * 365.25 * DAY).sort();
  const history = [];
  for (const date of dates) {
    const rows = selected.map((x) => x.byDate.get(date));
    if (rows.some((r) => !r)) continue;
    history.push({ date, net: rows.reduce((s, r, i) => s + selected[i].leg.direction * netPosition(r.long, r.short), 0) / rows.length });
  }
  const sufficient = history.length >= EDGE_CONFIG.cotMinimumReports, threshold = sufficient ? quantile(history.map((r) => Math.abs(r.net)).sort((a, b) => a - b), EDGE_CONFIG.crowdingQuantile) : null;
  const stale = cutoff - timeMs(reportDate) > 21 * DAY;
  return { net: stale ? missing("Latest available CFTC observation is more than 21 days old.") : known(net, availableAt), crowded: stale ? missing("CFTC observation is stale.") : threshold === null ? missing(`Crowding needs at least ${EDGE_CONFIG.cotMinimumReports} published reports in the trailing three years; ${history.length} are available.`) : known(Math.abs(net) > threshold, availableAt), percentile85: threshold === null ? missing("Insufficient published three-year positioning history.") : known(threshold, availableAt), reportDate, availableAt, history: history.slice(-156), legs: current, basis: legs.length > 1 ? "Average of signed currency-futures net ratios; a relative positioning measure, not a direct cross-pair contract." : "Signed net futures ratio. USD-base FX pairs reverse the quoted currency-futures direction." };
}

// lib/quant/analytics.ts
function eventStudy(bars, events, options = {}) {
  validateBars(bars);
  if (!Array.isArray(events) || !events.length) throw new Error("A recorded economic calendar is required for an event study.");
  const window = integer(options.windowMinutes ?? 15, "Observation minutes", 1, 1440), mode = options.mode || "daily";
  const selected = events.filter((e) => e.timing !== "estimated" && e.impact === "high" && (!options.currency || e.currency === options.currency) && (!options.currencies?.length || options.currencies.includes(e.currency)) && (!options.eventType || options.eventType === "all" || e.type === options.eventType || e.name === options.eventType));
  const byDay = /* @__PURE__ */ new Map();
  for (const e of selected) {
    const date = new Date(timeMs(e.time)).toISOString().slice(0, 10), type = e.type || e.name;
    if (!byDay.has(date)) byDay.set(date, /* @__PURE__ */ new Set());
    byDay.get(date).add(type);
  }
  const eventMoves2 = [], normalMoves = [], types = /* @__PURE__ */ new Map(), times = bars.map((b) => timeMs(b.time));
  const addEvent = (type, move) => {
    if (!types.has(type)) types.set(type, []);
    types.get(type).push(move);
  };
  if (mode === "daily") {
    for (let i = 1; i < bars.length; i++) {
      const date = new Date(times[i]).toISOString().slice(0, 10), move = Math.abs(bars[i].close / bars[i - 1].close - 1), dayTypes = byDay.get(date);
      if (dayTypes) {
        eventMoves2.push(move);
        for (const type of dayTypes) addEvent(type, move);
      } else normalMoves.push(move);
    }
  } else {
    const interval = barIntervalMs(bars), ends = times.map((t) => t + interval);
    if (interval > window * 6e4) throw new Error("Event studies need a bar timeframe at least as fine as the observation window.");
    const observedDays = [...new Set(times.map((t) => new Date(t).toISOString().slice(0, 10)))];
    const releaseTimes = /* @__PURE__ */ new Set();
    const observation = (release) => {
      let i = lowerBound(ends, release);
      if (i === ends.length || ends[i] > release) i--;
      const j = lowerBound(ends, release + window * 6e4);
      if (i < 0 || j >= bars.length || ends[j] - (release + window * 6e4) > interval || release - ends[i] > interval) return null;
      return Math.abs(bars[j].close / bars[i].close - 1);
    };
    for (const event of selected) {
      const release = timeMs(event.time), move = observation(release);
      releaseTimes.add((release % 864e5 + 864e5) % 864e5);
      if (move !== null) {
        eventMoves2.push(move);
        addEvent(event.type || event.name, move);
      }
    }
    for (const date of observedDays) if (!byDay.has(date)) {
      for (const offset of releaseTimes) {
        const move = observation(timeMs(date) + offset);
        if (move !== null) normalMoves.push(move);
      }
    }
  }
  return {
    eventDays: eventMoves2.length,
    normalDays: normalMoves.length,
    averageEventMove: eventMoves2.length ? mean(eventMoves2) : null,
    averageNormalMove: normalMoves.length ? mean(normalMoves) : null,
    byType: [...types].map(([type, moves]) => ({ type, count: moves.length, averageAbsoluteMove: mean(moves) })),
    mode,
    windowMinutes: window,
    notes: [mode === "daily" ? "Absolute close-to-close daily returns, matched to actual release dates. This is an association, not a causal estimate." : "Release windows use available completed closes. Controls match UTC release time and observation horizon on non-event days; missing windows are omitted."]
  };
}

// lib/edge/events.ts
var kind = (e) => e.type || e.name;
function eventMoves(symbol2, bars, intraday, events, asOf, releaseDays = []) {
  const cutoff = timeMs(asOf), history = (events || []).filter((e) => e.timing !== "estimated" && timeMs(e.time) + 36e5 <= cutoff), eligibleDays = releaseDays.filter((d) => timeMs(d.availableAt) <= cutoff && timeMs(d.date) + DAY <= cutoff), types = [.../* @__PURE__ */ new Set([...history.map(kind), ...eligibleDays.map((d) => d.type)])];
  const interval = intraday && intraday.length > 1 ? barIntervalMs(intraday) : null, intradayHistory = interval === null ? [] : (intraday || []).filter((b) => timeMs(b.time) + interval <= cutoff), closes = new Map(intradayHistory.map((b) => [timeMs(b.time) + interval, b.close]));
  return types.map((eventType) => {
    const selected = history.filter((e) => kind(e) === eventType).map((e) => ({ ...e, impact: "high" }));
    let sampleSize = 0, value = null, basis = "daily-close", reason = null;
    if (interval !== null && interval <= 36e5) {
      const observed = selected.map((event) => {
        const start = closes.get(timeMs(event.time)), end = closes.get(timeMs(event.time) + 36e5);
        return start !== void 0 && end !== void 0 ? Math.abs(end / start - 1) : null;
      }).filter((move) => move !== null);
      if (observed.length) {
        sampleSize = observed.length;
        value = observed.reduce((sum, move) => sum + move, 0) / observed.length;
        basis = "intraday-60m";
      }
    }
    if (value === null && bars.length >= 3) {
      const completed = selected.filter((e) => Math.floor(timeMs(e.time) / DAY) * DAY + DAY <= cutoff);
      for (const day of eligibleDays.filter((day2) => day2.type === eventType)) completed.push({ time: day.date, name: eventType, type: eventType, currency: day.currency, impact: "high" });
      if (completed.length) {
        const r = eventStudy(bars, completed, { mode: "daily", eventType });
        sampleSize = r.eventDays;
        value = r.averageEventMove;
      }
    }
    if (value === null) reason = "No completed price observations cover the recorded historical releases.";
    return { eventType, symbol: symbol2, horizonMinutes: 60, basis, averageAbsoluteMove: value, sampleSize, asOf, reason };
  });
}
function calendarFlag(events, asOf, available, calendarAsOf) {
  if (!available) return null;
  const cutoff = timeMs(asOf), window = (events || []).filter((e) => e.timing !== "estimated" && ["high", "medium"].includes(e.impact) && timeMs(e.time) >= cutoff && timeMs(e.time) < cutoff + DAY);
  const knownNow = calendarAsOf !== void 0 && timeMs(calendarAsOf) <= cutoff;
  const announced = window.filter((e) => {
    const knownAt = e.availableAt || e.knownAt;
    return knownAt ? timeMs(knownAt) <= cutoff : knownNow;
  });
  if (announced.length) return true;
  return knownNow ? false : null;
}
function computeEventRisk(events, currencies, asOf, moves, available, calendarAsOf) {
  const cutoff = timeMs(asOf), calendarKnown = calendarAsOf !== void 0 && timeMs(calendarAsOf) <= cutoff, relevant = (events || []).filter((e) => currencies.includes(e.currency) && ["high", "medium"].includes(e.impact) && e.timing !== "estimated" && (e.availableAt || e.knownAt ? timeMs(e.availableAt || e.knownAt) <= cutoff : calendarKnown)).sort((a, b) => timeMs(a.time) - timeMs(b.time));
  const view = (event) => {
    const table = moves.find((m) => m.eventType === kind(event));
    return { ...event, typicalMove: table?.averageAbsoluteMove !== null && table?.averageAbsoluteMove !== void 0 ? known(table.averageAbsoluteMove, asOf) : missing("Historical price coverage for this release type is unavailable."), moveBasis: table?.basis || null, moveSampleSize: table?.sampleSize || 0 };
  };
  const next24h = relevant.filter((e) => timeMs(e.time) >= cutoff && timeMs(e.time) < cutoff + DAY).map(view), restOfWeek = relevant.filter((e) => timeMs(e.time) >= cutoff + DAY && timeMs(e.time) < cutoff + 7 * DAY).map(view);
  const flag = calendarFlag(relevant, asOf, available, calendarAsOf), unknown = next24h.some((e) => e.typicalMove.value === null), max = next24h.length ? Math.max(...next24h.map((e) => e.typicalMove.value ?? 0)) : 0;
  return { available: available && flag !== null, reason: !available ? "Economic-calendar provider is unavailable." : flag === null ? "No calendar snapshot known at this timestamp establishes the next-24-hour event flag." : null, eventIn24h: flag, next24h, restOfWeek, nextHighImpact: [...next24h, ...restOfWeek].find((e) => e.impact === "high") || null, maximumTypicalMove: !available || flag === null ? missing("Event-risk coverage is unavailable.") : unknown ? missing("At least one upcoming release lacks historical move coverage.") : known(max, asOf) };
}

// lib/edge/score.ts
function shrinkAverage(similar, overall, prior = EDGE_CONFIG.shrinkagePriorTrades) {
  if (!similar.length || !overall.length) return null;
  return (similar.length * mean(similar) + prior * mean(overall)) / (similar.length + prior);
}
function tradeStatistics(tags) {
  let streak = 0, worst = 0;
  const results = tags.map((t) => t.trade.R);
  for (const r of results) {
    if (r < 0) worst = Math.max(worst, ++streak);
    else streak = 0;
  }
  return { count: results.length, avgR: results.length ? mean(results) : null, winRate: results.length ? results.filter((r) => r > 0).length / results.length : null, worstLosingStreak: results.length ? worst : null, results };
}
var clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function relativePoints(tags, field, value, max) {
  if (value === null) return { points: null, reason: `Today's ${field} is unavailable.` };
  const groups = /* @__PURE__ */ new Map();
  for (const tag of tags) {
    const key = tag[field];
    if (key !== null) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(tag.trade.R);
    }
  }
  const current = groups.get(value) || [];
  if (current.length < EDGE_CONFIG.minimumBucketTrades) return { points: null, reason: `Fewer than ${EDGE_CONFIG.minimumBucketTrades} exited trades in this ${field} bucket.` };
  const averages = [...groups.values()].filter((r) => r.length >= EDGE_CONFIG.minimumBucketTrades).map(mean), best = Math.max(...averages), here = mean(current);
  return { points: best > 0 ? max * clamp(here / best, 0, 1) : 0, reason: best > 0 ? `${current.length} trades; average ${here.toFixed(3)}R versus best eligible bucket ${best.toFixed(3)}R.` : "No eligible historical bucket has positive average R; this component receives zero." };
}
function clipScoreParts(parts) {
  if (parts.some((p) => p.rawPoints === null)) return { score: null, parts: parts.map((p) => ({ ...p, points: p.rawPoints === null ? null : Math.round(p.rawPoints) })) };
  const displayed = parts.map((p) => ({ ...p, points: Math.round(p.rawPoints) }));
  const sum = displayed.reduce((s, p) => s + p.points, 0), target = clamp(sum, 0, 100);
  let change = target - sum;
  for (const part of [...displayed].reverse()) {
    if (change === 0) break;
    const adjustment = change > 0 ? Math.min(change, Math.max(0, -part.points)) : -Math.min(-change, Math.max(0, part.points));
    part.points += adjustment;
    change -= adjustment;
    if (adjustment) part.reason = (part.reason || "") + " Displayed contribution adjusted at the 0\u2013100 score boundary; raw points remain available.";
  }
  return { score: target, parts: displayed };
}
function scoreStrategy(input) {
  const { symbol: symbol2, strategy, state, positioning: positioning2, events } = input, cutoff = timeMs(input.asOf), tags = input.tags.filter((t) => timeMs(t.trade.exitDate) <= cutoff && t.trade.reason !== "last" && Number.isFinite(t.trade.R));
  const exact = (tag) => state.regime.value !== null && state.volatilityBucket.value !== null && events.eventIn24h !== null && positioning2.crowded.value !== null && tag.regime === state.regime.value && tag.volatilityBucket === state.volatilityBucket.value && tag.eventIn24h === events.eventIn24h && tag.crowded === positioning2.crowded.value;
  let similar = tags.filter(exact);
  const filtersRelaxed = [];
  if (similar.length < EDGE_CONFIG.similarDesired) {
    similar = tags.filter((t) => state.regime.value !== null && t.regime === state.regime.value && state.volatilityBucket.value !== null && t.volatilityBucket === state.volatilityBucket.value);
    filtersRelaxed.push("event and positioning flags");
  }
  if (similar.length < EDGE_CONFIG.similarDesired) {
    similar = tags.filter((t) => state.regime.value !== null && t.regime === state.regime.value);
    filtersRelaxed.push("volatility bucket");
  }
  const matches = new Set(similar), other = tags.filter((t) => !matches.has(t)), similarStats = tradeStatistics(similar), otherStats = tradeStatistics(other), allR = tags.map((t) => t.trade.R), shrunk = shrinkAverage(similarStats.results, allR);
  const regime = relativePoints(tags, "regime", state.regime.value, EDGE_CONFIG.weights.regime), vol = relativePoints(tags, "volatilityBucket", state.volatilityBucket.value, EDGE_CONFIG.weights.volatility);
  const part = (id, label2, points, min, max, reason) => ({ id, label: label2, points, rawPoints: points, min, max, reason });
  const record = shrunk === null ? null : EDGE_CONFIG.weights.record * clamp((shrunk - EDGE_CONFIG.recordMapping.zeroAtAvgR) / (EDGE_CONFIG.recordMapping.fullAtAvgR - EDGE_CONFIG.recordMapping.zeroAtAvgR), 0, 1);
  let positioningPoints = null, positioningReason = null;
  if (positioning2.net.value === null || positioning2.crowded.value === null) positioningReason = positioning2.net.reason || positioning2.crowded.reason;
  else if (!input.likelyDirection) positioningReason = "The strategy has no identifiable likely direction at this snapshot.";
  else {
    const alignment = positioning2.net.value * (input.likelyDirection === "long" ? 1 : -1);
    positioningPoints = !positioning2.crowded.value && alignment > 0 ? EDGE_CONFIG.weights.positioningPositive * alignment : positioning2.crowded.value && alignment < 0 ? EDGE_CONFIG.weights.positioningNegative * alignment : 0;
    positioningReason = `${positioning2.crowded.value ? "Crowded" : "Not crowded"} futures positioning; direction basis: ${input.directionBasis || "strategy settings"}.`;
  }
  let eventPoints = null, eventReason = null;
  if (!events.available || events.eventIn24h === null) eventReason = events.reason || "Event coverage is unknown.";
  else if (!events.eventIn24h) eventPoints = 0;
  else if (events.maximumTypicalMove.value === null || state.close.value === null || (input.stopDistance === void 0 ? state.atr.value === null : input.stopDistance === null)) eventReason = events.maximumTypicalMove.reason || "ATR/price is unavailable.";
  else {
    const stop = input.stopDistance ?? state.atr.value * (strategy.params.stopS ?? 2);
    eventPoints = stop > 0 ? -EDGE_CONFIG.weights.eventPenalty * clamp(events.maximumTypicalMove.value * state.close.value / stop, 0, 1) : null;
    eventReason = "Historical absolute release move, scaled to current price, divided by the strategy ATR stop distance.";
  }
  const clipped = clipScoreParts([part("regime", "Regime match", regime.points, 0, 40, regime.reason), part("volatility", "Volatility", vol.points, 0, 25, vol.reason), part("record", "Strategy record here", record, 0, 20, shrunk === null ? "No eligible exited trade history." : `Shrunk average ${shrunk.toFixed(3)}R; mapping ${EDGE_CONFIG.recordMapping.zeroAtAvgR}R\u21920, ${EDGE_CONFIG.recordMapping.fullAtAvgR}R\u219220.`), part("positioning", "Positioning", positioningPoints, -10, 15, positioningReason), part("events", "Event risk", eventPoints, -20, 0, eventReason)]);
  const insufficient = similar.length < EDGE_CONFIG.similarMinimum, score = insufficient ? null : clipped.score, label = insufficient ? "Not enough history" : score === null ? "Unavailable" : score >= EDGE_CONFIG.fitThreshold ? "fit" : score >= EDGE_CONFIG.maybeThreshold ? "maybe" : "avoid";
  const reasons = [...insufficient ? [`Only ${similar.length} matching exited trades; at least ${EDGE_CONFIG.similarMinimum} are required.`] : [], ...clipped.parts.filter((p) => p.points === null).map((p) => p.reason || `${p.label} is unavailable.`)];
  const why = similar.length ? `${similar.length} comparable exited trades averaged ${similarStats.avgR.toFixed(2)}R${other.length ? `, versus ${otherStats.avgR.toFixed(2)}R across ${other.length} other trades` : ""}. ${filtersRelaxed.length ? "Relaxed: " + filtersRelaxed.join("; ") + "." : "All four state filters matched."}` : "No matching exited trades are available for this state.";
  return { strategyId: strategy.id, strategyName: strategy.name, symbol: symbol2, score, label, parts: clipped.parts, sampleSize: similar.length, filtersRelaxed, similar: similarStats, other: otherStats, overallAvgR: allR.length ? mean(allR) : null, shrunkAvgR: shrunk, likelyDirection: input.likelyDirection, directionBasis: input.directionBasis || null, why, reasons, scoreChangeWeek: null };
}

// lib/edge/context.ts
function marketMood(markets, vix, asOf) {
  const byId = new Map(markets.map((m) => [m.symbol, m])), parts = [], cutoff = timeMs(asOf), riskIds = ["USDJPY", "USDCHF", "XAUUSD", "AUDUSD", "SPX500", "NAS100", "US30"], latestDay = markets.filter((m) => riskIds.includes(m.symbol)).map((m) => m.returns.at(-1)?.date).filter((d) => !!d).sort().at(-1);
  const component = (id, name, direction, inverse = false) => {
    const m = byId.get(id), r = m?.returns.at(-1)?.return, vol = m?.state.atr.value !== null && m?.state.close.value ? m.state.atr.value / m.state.close.value : null;
    const date = m?.returns.at(-1)?.date, fresh = date === latestDay && date !== void 0 && cutoff - timeMs(date) <= EDGE_CONFIG.dailyFreshnessMs && timeMs(date) + DAY <= cutoff;
    const value = fresh && r !== void 0 && vol !== null && vol > 0 ? Math.max(-1, Math.min(1, (inverse ? 1 / (1 + r) - 1 : r) * direction / vol)) : null;
    parts.push({ name, value, reason: value === null ? `${id} daily return/ATR is unavailable, stale, or does not share the latest risk-asset session.` : null });
  };
  component("USDJPY", "JPY strength", 1, true);
  component("USDCHF", "CHF strength", 1, true);
  component("XAUUSD", "Gold strength", 1);
  component("AUDUSD", "AUD weakness", -1);
  const index = ["SPX500", "NAS100", "US30"].find((id) => byId.has(id));
  if (index) component(index, "Equity weakness", -1);
  else parts.push({ name: "Equity weakness", value: null, reason: "An index history is unavailable." });
  const available = (vix || []).filter((v) => timeMs(v.availableAt) <= cutoff && timeMs(v.date) + DAY <= cutoff && v.close >= 0 && Number.isFinite(v.close)).sort((a, b) => a.date.localeCompare(b.date)), latest = available.at(-1);
  const vixValue = latest && cutoff - timeMs(latest.date) < 7 * DAY ? Math.max(-1, Math.min(1, (latest.close - 20) / 10)) : null;
  parts.push({ name: "VIX level", value: vixValue, reason: vixValue === null ? "A recent FRED VIX close known at this time is unavailable." : null });
  const enough = parts.slice(0, 5).filter((p) => p.value !== null).length >= EDGE_CONFIG.mood.minimumMoveParts && vixValue !== null;
  if (!enough) return { value: null, reason: "Mood requires at least four available risk-asset inputs and a recent VIX observation.", score: null, parts };
  const score = mean(parts.filter((p) => p.value !== null).map((p) => p.value));
  return { value: score > EDGE_CONFIG.mood.threshold ? "risk-off" : score < -EDGE_CONFIG.mood.threshold ? "risk-on" : "mixed", reason: null, score, parts };
}
function signedCorrelation(a, b, directionA, directionB) {
  const bm = new Map(b.map((p) => [p.date, p.return])), rows = a.filter((p) => bm.has(p.date)).slice(-EDGE_CONFIG.correlationWindow);
  if (rows.length < EDGE_CONFIG.correlationWindow) return { value: null, observations: rows.length };
  const av = rows.map((r) => r.return), bv = rows.map((r) => bm.get(r.date));
  if (av.every((v) => v === av[0]) || bv.every((v) => v === bv[0])) return { value: null, observations: rows.length };
  return { value: correlation(av, bv) * directionA * directionB, observations: rows.length };
}
function correlationRisk(positions, markets, candidates = []) {
  const pairCache = /* @__PURE__ */ new Map();
  const pair = (a, b) => {
    const key = [a.symbol, b.symbol].sort().join(":");
    let result = pairCache.get(key);
    if (!result) {
      const cached = a.correlations?.find((c) => c.symbol === b.symbol && c.observations === EDGE_CONFIG.correlationWindow && c.value !== null && Number.isFinite(c.value));
      result = cached ? { value: cached.value, observations: cached.observations } : signedCorrelation(a.returns, b.returns, 1, 1);
      pairCache.set(key, result);
    }
    return result;
  };
  const byId = new Map(markets.map((m) => [m.symbol, m])), exposures = [...positions.map((p) => ({ id: p.id, symbol: p.symbol, side: p.side === "buy" || p.side === "long" ? 1 : -1, risk: p.riskToStop, label: `Open ${p.symbol} ${p.side}` })), ...candidates.filter((c) => c.score !== null && c.score >= EDGE_CONFIG.fitThreshold && c.likelyDirection).map((c) => ({ id: `candidate:${c.symbol}:${c.strategyId}`, symbol: c.symbol, side: c.likelyDirection === "long" ? 1 : -1, risk: null, label: `${c.symbol} ${c.strategyName} candidate` }))], warnings = [];
  for (let i = 0; i < exposures.length; i++) for (let j = i + 1; j < exposures.length; j++) {
    const a = exposures[i], b = exposures[j], ma = byId.get(a.symbol), mb = byId.get(b.symbol);
    if (!ma || !mb || a.id === b.id) continue;
    const unsigned = pair(ma, mb), r = { ...unsigned, value: unsigned.value === null ? null : unsigned.value * a.side * b.side };
    if (r.value !== null && r.value > EDGE_CONFIG.correlationWarning) {
      const combined = a.risk !== null && b.risk !== null && Number.isFinite(a.risk) && Number.isFinite(b.risk) && a.risk >= 0 && b.risk >= 0 ? a.risk + b.risk : null;
      warnings.push({ first: a.label, second: b.label, firstSymbol: a.symbol, secondSymbol: b.symbol, signedCorrelation: r.value, combinedRisk: combined, observations: r.observations, reason: combined === null ? "Direction-adjusted historical correlation exceeds 0.8. Combined monetary risk needs stop-risk metadata for both exposures." : "Direction-adjusted historical correlation exceeds 0.8; both reported stop risks contribute to this exposure." });
    }
  }
  return warnings;
}
var fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
function dailyBrief(fits, next, timezone = "UTC") {
  const ranked = fits.filter((f) => f.score !== null).sort((a, b) => b.score - a.score), first = ranked[0], second = ranked.find((f) => f.symbol !== first?.symbol), sentences = [];
  if (first && second) sentences.push(fill(BRIEF_TEMPLATES.fits, { first: first.symbol, firstStrategy: first.strategyName, firstScore: first.score, second: second.symbol, secondStrategy: second.strategyName, secondScore: second.score }));
  else if (first) sentences.push(fill(BRIEF_TEMPLATES.oneFit, { first: first.symbol, firstStrategy: first.strategyName, firstScore: first.score }));
  else sentences.push(BRIEF_TEMPLATES.noFits);
  const weakest = [...ranked].reverse().find((f) => f.score < EDGE_CONFIG.maybeThreshold && f !== first);
  if (weakest) sentences.push(fill(BRIEF_TEMPLATES.avoid, { market: weakest.symbol, score: weakest.score, count: weakest.sampleSize }));
  if (next) {
    let time;
    try {
      time = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(next.time));
    } catch {
      time = new Date(next.time).toISOString();
    }
    sentences.push(fill(BRIEF_TEMPLATES.event, { event: next.name, currency: next.currency, time }));
  }
  return sentences.length <= 2 ? sentences.join(" ") : sentences[0] + " " + sentences.slice(1).map((s) => s.replace(/\.$/, "")).join("; ") + ".";
}

// lib/edge/trade-plan.ts
function strategyATR(bars, strategy) {
  const p = normalizeParams({ ...strategy.params, strategy: strategy.kind });
  if (p.mode !== "close" && bars.some((b) => !Number.isFinite(b.high) || !Number.isFinite(b.low))) return null;
  const series = p.mode === "close" ? closeATR(bars.map((b) => b.close), p.atrPeriod) : wilderATR(bars, p.atrPeriod), value = series.at(-1);
  return value !== void 0 && Number.isFinite(value) && value > 0 ? value : null;
}
function computeTradePlan(input) {
  const { state, strategy } = input, bars = completedDailyBars(input.bars, input.asOf), p = normalizeParams({ ...strategy.params, strategy: strategy.kind }), atr = strategyATR(bars, strategy);
  const out = { available: false, reason: null, model: "closed-candle-atr", signal: null, trigger: { long: null, short: null, description: "" }, entry: null, stop: null, target: null, stopDistance: atr === null ? null : atr * p.stopS, riskPct: p.riskPct, riskAmount: input.accountEquity !== null && Number.isFinite(input.accountEquity) && input.accountEquity > 0 ? input.accountEquity * p.riskPct / 100 : null, lots: null, brokerSymbol: input.broker?.brokerSymbol || null, brokerDigits: input.broker?.digits ?? null, accountCurrency: input.broker?.accountCurrency || null, basisAt: state.availableAt, notes: ["Trigger inputs use the last completed daily candle. Broker lot sizing requires fresh authenticated contract metadata and account equity."] };
  if (strategy.returns?.length) {
    Object.assign(out, { model: null, stopDistance: null, riskPct: null, riskAmount: null });
    out.reason = "Imported return-only strategies have no executable entry, stop or sizing rules. Save actual Quant strategy settings to create a trade plan.";
    return out;
  }
  if (strategy.timeframe && strategy.timeframe !== "D1") {
    out.reason = "This plan requires the exact saved timeframe candles and a matching broker feed; daily-state levels cannot substitute.";
    return out;
  }
  if (strategy.kind === "news") {
    out.reason = "A future news direction is unknown; a live release observation is required before an entry/stop/target can be planned.";
    return out;
  }
  if (bars.length && timeMs(input.asOf) - timeMs(bars.at(-1).time) - 864e5 > EDGE_CONFIG.dailyFreshnessMs) {
    out.reason = "Completed daily history is stale; a fresh broker quote cannot validate levels derived from old candles.";
    return out;
  }
  if (atr === null || !bars.length) {
    out.reason = "Completed daily OHLC and ATR are unavailable.";
    return out;
  }
  const index = bars.length - 1;
  if (strategy.kind === "breakout") {
    if (index < p.lookback) {
      out.reason = "Insufficient completed closes for the configured range.";
      return out;
    }
    const range = bars.slice(index - p.lookback, index).map((b2) => b2.close);
    out.trigger.long = Math.max(...range) + p.entryK * atr;
    out.trigger.short = Math.min(...range) - p.entryK * atr;
    out.trigger.description = `A completed close must exceed the previous ${p.lookback} closes by ${p.entryK} ATR. ${p.mode === "close" ? "The research model fills at the observed close; a live broker quote is a new execution estimate." : "Entry occurs on the following bar."}`;
    const sign = breakoutSignal(bars, index, atr, p);
    out.signal = sign > 0 ? "long" : sign < 0 ? "short" : null;
  } else {
    const n = p.meanLookback;
    if (index < n) {
      out.reason = "Insufficient completed closes for the mean-reversion baseline.";
      return out;
    }
    const range = bars.slice(index - n, index).map((b2) => b2.close), mean2 = range.reduce((s, v) => s + v, 0) / n, sd = Math.sqrt(range.reduce((s, v) => s + (v - mean2) ** 2, 0) / (n - 1));
    out.trigger.long = mean2 - p.meanEntryZ * sd;
    out.trigger.short = mean2 + p.meanEntryZ * sd;
    out.trigger.description = `Fade a completed close beyond ${p.meanEntryZ} standard deviations from the preceding ${n} closes.`;
    const sign = meanReversionSignal(bars, index, p);
    out.signal = sign > 0 ? "long" : sign < 0 ? "short" : null;
  }
  if (!out.signal) {
    out.reason = "No completed-candle entry trigger is active; executable entry, stop, target and lot size remain unavailable.";
    return out;
  }
  const b = input.broker;
  if (!b) {
    out.reason = "Connect a fresh EA heartbeat with broker contract metadata to calculate executable prices and lots.";
    return out;
  }
  const observed = typeof b.asOf === "number" ? b.asOf < 1e12 ? b.asOf * 1e3 : b.asOf : timeMs(b.asOf), age = timeMs(input.asOf) - observed;
  if (age < 0 || age > EDGE_CONFIG.brokerFreshnessMs) {
    out.reason = "Broker bid/ask and contract metadata are stale or dated after this snapshot.";
    return out;
  }
  if (b.symbol !== input.symbol || ![b.tickSize, b.tickValueLoss, b.volumeMin, b.volumeMax, b.volumeStep, b.bid, b.ask].every((v) => typeof v === "number" && Number.isFinite(v) && v > 0) || b.ask < b.bid || b.volumeMax < b.volumeMin || !Number.isInteger(b.digits) || b.digits < 0 || b.digits > 12 || !Number.isFinite(b.stopLevel) || b.stopLevel < 0 || !b.accountCurrency || !b.brokerSymbol) {
    out.reason = "Broker contract, bid/ask or account-currency tick-value metadata is incomplete.";
    return out;
  }
  if (out.riskAmount === null) {
    out.reason = "Fresh account equity is required for risk sizing.";
    return out;
  }
  const long = out.signal === "long", entry = long ? b.ask : b.bid, floor = (x) => Math.floor((x + 1e-10) / b.tickSize) * b.tickSize, ceil = (x) => Math.ceil((x - 1e-10) / b.tickSize) * b.tickSize;
  const stop = long ? floor(entry - atr * p.stopS) : ceil(entry + atr * p.stopS), target = long ? ceil(entry + atr * p.targetTP) : floor(entry - atr * p.targetTP), distance = Math.abs(entry - stop), minimumStop = b.stopLevel * Math.pow(10, -b.digits);
  if (stop <= 0 || target <= 0 || distance < minimumStop || Math.abs(target - entry) < minimumStop) {
    out.reason = "The tested stop/target violates the broker minimum stop distance. Parameters are not silently widened.";
    return out;
  }
  const rawLots = out.riskAmount / (distance / b.tickSize * b.tickValueLoss), lots = Math.floor((Math.min(rawLots, b.volumeMax) + 1e-10) / b.volumeStep) * b.volumeStep;
  if (lots < b.volumeMin) {
    out.reason = "The broker minimum lot would exceed the selected risk budget.";
    return out;
  }
  Object.assign(out, { available: true, reason: null, entry, stop, target, stopDistance: distance, lots: Number(lots.toFixed(8)), basisAt: new Date(observed).toISOString() });
  out.notes.push("Prices snap outward to the real broker tick size; volume rounds down to its step. Tick value is reported in the account currency; no currency conversion is guessed.");
  return out;
}

// lib/edge/snapshot.ts
var TF = { D1: DAY, H4: 144e5, H1: 36e5, M5: 3e5, M1: 6e4, TICK: 6e4 };
function runStrategyBacktest(symbol2, input, strategy, asOf) {
  if (strategy.returns?.length) return { result: null, reason: "Imported return-only strategies cannot be re-executed on a different market or tagged by original trade-entry state." };
  const timeframe = (strategy.timeframe || "D1").toUpperCase(), duration = TF[timeframe];
  if (!duration) return { result: null, reason: "The saved strategy timeframe is unsupported." };
  const source = timeframe === "D1" ? input.bars : input.strategyBars?.[timeframe];
  if (!source?.length) return { result: null, reason: `Exact ${timeframe} history is not loaded for this strategy; daily data is not substituted.` };
  const bars = source.filter((b) => timeMs(b.time) + duration <= timeMs(asOf));
  if (bars.length < 40) return { result: null, reason: "Insufficient completed price history to run this strategy." };
  if (strategy.kind === "news" && (!input.calendarAvailable || !input.events?.some((e) => e.timing !== "estimated" && e.impact === "high" && timeMs(e.time) < timeMs(asOf)))) return { result: null, reason: "News drift requires real confirmed historical release timestamps." };
  const market = SYMBOLS.find((s) => s.id === symbol2);
  if (!market) return { result: null, reason: "Unknown market configuration." };
  try {
    const result = backtest(bars, { ...strategy.params, strategy: strategy.kind, pipSize: market.pipSize, mode: timeframe === "TICK" ? "tick" : strategy.params.mode || "close", events: input.events?.filter((e) => market.currencies.includes(e.currency) && timeMs(e.time) <= timeMs(asOf)) });
    if (result.params.mode === "close") {
      result.trades = result.trades.map((t) => ({ ...t, entryDate: new Date(timeMs(t.entryDate) + duration).toISOString(), exitDate: new Date(timeMs(t.exitDate) + duration).toISOString() }));
      result.notes.push("For Edge tagging, daily/close-mode trade timestamps are normalized from candle labels to their completed-close availability time.");
    }
    return { result, reason: null };
  } catch (error) {
    return { result: null, reason: error instanceof Error ? error.message : "Strategy backtest could not be computed." };
  }
}
function tagTrades(symbol2, trades, states, input, asOf, positionCache = /* @__PURE__ */ new Map()) {
  const cutoff = timeMs(asOf), available = states.filter((s) => s.availableAt !== null).map((s) => timeMs(s.availableAt)), market = SYMBOLS.find((s) => s.id === symbol2);
  return trades.filter((t) => t.reason !== "last" && timeMs(t.exitDate) <= cutoff && timeMs(t.entryDate) <= timeMs(t.exitDate)).map((trade) => {
    const entry = timeMs(trade.entryDate);
    let lo = 0, hi = available.length;
    while (lo < hi) {
      const mid = lo + hi >>> 1;
      if (available[mid] <= entry) lo = mid + 1;
      else hi = mid;
    }
    const state = states[lo - 1] || emptyState();
    const entryAsOf = new Date(entry).toISOString(), cot = positionCache.get(entryAsOf) || positioning(symbol2, input.cot, entryAsOf), events = input.events?.filter((e) => market?.currencies.includes(e.currency));
    positionCache.set(entryAsOf, cot);
    const eventIn24h = calendarFlag(events, entryAsOf, input.calendarAvailable, input.calendarAsOf), reasons = [];
    if (state.regime.value === null) reasons.push(state.regime.reason);
    if (state.volatilityBucket.value === null) reasons.push(state.volatilityBucket.reason);
    if (eventIn24h === null) reasons.push("No event-calendar version known at entry.");
    if (cot.crowded.value === null) reasons.push(cot.crowded.reason);
    return { trade, regime: state.regime.value, volatilityBucket: state.volatilityBucket.value, eventIn24h, crowded: cot.crowded.value, stateAsOf: state.availableAt || entryAsOf, reasons };
  });
}
function likelyDirection(strategy, bars, state, tags, signalATR) {
  const p = normalizeParams({ ...strategy.params, strategy: strategy.kind });
  let signal = 0;
  if (bars.length && signalATR !== null) {
    signal = strategy.kind === "breakout" ? breakoutSignal(bars, bars.length - 1, signalATR, p) : strategy.kind === "mean-reversion" ? meanReversionSignal(bars, bars.length - 1, p) : 0;
  }
  if (signal) return { direction: signal > 0 ? "long" : "short", basis: "active completed-candle strategy trigger" };
  if (strategy.kind === "breakout" && state.trendStrength.value) return { direction: state.trendStrength.value > 0 ? "long" : "short", basis: "sign of the completed 20-day efficiency move" };
  if (strategy.kind === "mean-reversion" && bars.length > p.meanLookback) {
    const base = bars.slice(-p.meanLookback - 1, -1).map((b) => b.close), deviation = bars.at(-1).close - mean(base);
    if (deviation) return { direction: deviation < 0 ? "long" : "short", basis: "direction toward the preceding-closes mean; trigger may not yet be active" };
  }
  const matching = tags.filter((t) => t.regime === state.regime.value), balance = matching.reduce((s, t) => s + (t.trade.side === "long" ? 1 : -1), 0);
  return matching.length >= EDGE_CONFIG.similarMinimum && balance !== 0 ? { direction: balance > 0 ? "long" : "short", basis: "majority direction of exited trades in the matching regime; not a news-direction forecast" } : { direction: null, basis: null };
}
function computeMarket(symbol2, input, strategies = DEFAULT_STRATEGIES, asOf) {
  const info = SYMBOLS.find((s) => s.id === symbol2);
  if (!info) throw new Error(`Unknown Edge market ${symbol2}.`);
  const bars = completedDailyBars(input.bars || [], asOf), states = stateSeries(bars), state = states.at(-1) || emptyState(), cot = positioning(symbol2, input.cot, asOf);
  const relevantEvents2 = (input.events || []).filter((e) => info.currencies.includes(e.currency)), moves = eventMoves(symbol2, bars, input.intradayBars, relevantEvents2, asOf, input.releaseDays?.filter((day) => info.currencies.includes(day.currency))), events = computeEventRisk(relevantEvents2, info.currencies, asOf, moves, input.calendarAvailable, input.calendarAsOf);
  const positionCache = /* @__PURE__ */ new Map(), notes = [], fits = strategies.map((strategy) => {
    const cache = input.backtests?.[strategy.id], computed = cache ? { result: null, reason: null } : runStrategyBacktest(symbol2, input, strategy, asOf), trades = cache?.trades || computed.result?.trades || [];
    const timeframe = (strategy.timeframe || "D1").toUpperCase(), executionBars = (timeframe === "D1" ? bars : input.strategyBars?.[timeframe] || []).filter((b) => timeMs(b.time) + (TF[timeframe] || DAY) <= timeMs(asOf)), signalATR = strategyATR(executionBars, strategy), stopDistance = signalATR === null ? null : signalATR * (strategy.params.stopS ?? 2);
    const tags = tagTrades(symbol2, trades, states, input, asOf, positionCache), direction = likelyDirection(strategy, executionBars, state, tags, signalATR), fit = scoreStrategy({ symbol: symbol2, strategy, state, positioning: cot, events, tags, asOf, likelyDirection: direction.direction, directionBasis: direction.basis, stopDistance });
    if (computed.reason) {
      fit.score = null;
      fit.label = "Unavailable";
      fit.reasons.unshift(computed.reason);
      fit.why = computed.reason;
    }
    return fit;
  });
  const quoted = input.quote, validQuote = quoted && Number.isFinite(quoted.price) && quoted.price > 0 && timeMs(quoted.asOf) <= timeMs(asOf);
  let price = state.close.value !== null ? { ...state.close, reason: "Previous completed daily close; a current validated quote is unavailable." } : missing("No validated quote or completed close is available.");
  if (validQuote) price = { value: quoted.price, reason: timeMs(asOf) - timeMs(quoted.asOf) > EDGE_CONFIG.quoteFreshnessMs ? "Quote is delayed; inspect its as-of timestamp." : null, asOf: quoted.asOf };
  const change = validQuote && Number.isFinite(quoted.dayChangePct) ? known(quoted.dayChangePct, quoted.asOf) : bars.length >= 2 ? { value: (bars.at(-1).close / bars.at(-2).close - 1) * 100, reason: "Previous completed daily-session change.", asOf: state.availableAt } : missing("Two completed closes are required.");
  const returns = bars.slice(1).map((b, i) => ({ date: new Date(timeMs(b.time)).toISOString().slice(0, 10), return: b.close / bars[i].close - 1 })), tradePlans = Object.fromEntries(strategies.map((strategy) => [strategy.id, computeTradePlan({ symbol: symbol2, asOf, price: input.quote, state, bars, strategy, accountEquity: input.accountEquity ?? null, broker: input.broker })]));
  if (bars.length) notes.push(`Observed daily history: ${new Date(bars[0].time).toISOString().slice(0, 10)} to ${state.date}; ${bars.length} completed bars.`);
  if (bars.length < 2520) notes.push("Less than approximately ten trading years are available; sample sizes reflect the actual loaded history.");
  if (state.availableAt && timeMs(asOf) - timeMs(state.availableAt) > EDGE_CONFIG.dailyFreshnessMs) notes.push("Daily history is stale: the last completed observation is more than four days old. Regime and fit describe that observed state, not an updated current market.");
  notes.push("Daily bar timestamps are openings; state uses only bars closed by the snapshot. Trade tags use the completed state available before entry. Forced end-of-data exits are excluded from fit history.");
  return { symbol: symbol2, name: info.name, group: info.group, currencies: info.currencies, asOf, price, dayChangePct: change, state, regimeHistory: weeklyRegimes(states, asOf), positioning: cot, events, eventMoves: moves, fits, bestFit: [...fits].filter((f) => f.score !== null).sort((a, b) => b.score - a.score)[0] || null, tradePlans, returns, correlations: [], notes };
}
function buildSnapshot(input) {
  const asOf = new Date(timeMs(input.asOf)).toISOString(), strategies = input.strategies === void 0 ? DEFAULT_STRATEGIES : input.strategies, watchlist = [...new Set(input.watchlist)], markets = watchlist.map((symbol2) => computeMarket(symbol2, input.markets[symbol2] || { bars: [], calendarAvailable: false }, strategies, asOf));
  for (const market of markets) {
    market.correlations = markets.filter((m) => m.symbol !== market.symbol).map((m) => ({ symbol: m.symbol, ...signedCorrelation(market.returns, m.returns, 1, 1) }));
    for (const fit of market.fits) {
      const previous = input.previousScores?.[`${market.symbol}:${fit.strategyId}`];
      if (fit.score !== null && typeof previous === "number" && Number.isFinite(previous)) fit.scoreChangeWeek = fit.score - previous;
    }
  }
  const allFits = markets.flatMap((m) => m.fits), ranked = allFits.filter((f) => f.score !== null).sort((a, b) => b.score - a.score), nextEvents = markets.flatMap((m) => [...m.events.next24h, ...m.events.restOfWeek]).filter((e) => e.impact === "high").sort((a, b) => timeMs(a.time) - timeMs(b.time)), nextEvent = nextEvents[0] || null;
  const summaries = strategies.map((s) => {
    const scored = allFits.filter((f) => f.strategyId === s.id && f.score !== null).sort((a, b) => b.score - a.score), explanation = scored[0] || allFits.find((f) => f.strategyId === s.id);
    return { id: s.id, name: s.name, top: scored.slice(0, 2), worst: scored.at(-1) || null, bestScore: scored[0]?.score ?? null, why: explanation ? `${explanation.symbol}: ${explanation.why}` : "No market history is available for this strategy." };
  });
  const mood = marketMood(markets, input.vix, asOf), fx = markets.filter((m) => m.group === "Forex majors" && m.state.volatilityPercentile.value !== null), percentile = fx.length ? mean(fx.map((m) => m.state.volatilityPercentile.value)) : null;
  const changes = fx.map((m) => {
    const bars = completedDailyBars(input.markets[m.symbol].bars, asOf), past = stateSeries(bars.slice(0, -5)).at(-1)?.volatilityPercentile.value;
    return past === void 0 || past === null ? null : m.state.volatilityPercentile.value - past;
  }).filter((v) => v !== null);
  const delta = changes.length ? mean(changes) : null, volatility = { value: delta === null ? null : delta > 5 ? "rising" : delta < -5 ? "falling" : "steady", percentile, reason: delta === null ? "Five-session change in FX ATR percentiles is unavailable." : null };
  const mapLabels = ["Trend \xB7 high volatility", "Trend \xB7 low volatility", "Range \xB7 high volatility", "Range \xB7 low volatility"], regimeMap = mapLabels.map((label) => ({ label, symbols: markets.filter((m) => {
    const er = m.state.efficiencyRatio.value, vol = m.state.volatilityPercentile.value;
    if (er === null || vol === null) return false;
    return `${er >= EDGE_CONFIG.regimes.weakER ? "Trend" : "Range"} \xB7 ${vol >= 50 ? "high" : "low"} volatility` === label;
  }).map((m) => m.symbol) }));
  const heartbeatFresh = input.heartbeat?.receivedAt && timeMs(asOf) - timeMs(input.heartbeat.receivedAt) >= 0 && timeMs(asOf) - timeMs(input.heartbeat.receivedAt) <= EDGE_CONFIG.brokerFreshnessMs;
  const doubleRisk = correlationRisk(heartbeatFresh ? input.heartbeat.positions : [], markets, markets.map((m) => m.bestFit).filter((x) => x !== null));
  return { asOf, userTimezone: input.userTimezone || "UTC", markets, strategies: summaries, mood, volatility, nextEvent, bestFit: ranked[0] || null, regimeMap, doubleRisk, brief: dailyBrief(allFits, nextEvent, input.userTimezone || "UTC"), sources: [...new Set(Object.values(input.markets).filter((m) => m.bars.length).map((m) => m.source || "Dukascopy").concat(Object.values(input.markets).some((m) => m.cot?.length) ? ["CFTC public reporting"] : [], input.vix?.length ? ["FRED VIXCLS"] : [], Object.values(input.markets).some((m) => m.calendarAvailable) ? ["Configured economic calendar"] : []))], notes: ["Scores are estimates from past behavior, not trade signals. Educational research tool, not financial advice.", "Unavailable components remain null with reasons. Historical event/positioning filters may be relaxed when point-in-time source versions are absent."] };
}
var computeSnapshot = buildSnapshot;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BRIEF_TEMPLATES,
  COT_MARKETS,
  DAY,
  DEFAULT_STRATEGIES,
  EDGE_CONFIG,
  adxSeries,
  buildSnapshot,
  calendarFlag,
  classifyRegime,
  clipScoreParts,
  completedDailyBars,
  computeEventRisk,
  computeMarket,
  computeRegime,
  computeSnapshot,
  computeTradePlan,
  correlationRisk,
  dailyBrief,
  efficiencyRatio,
  emptyState,
  eventMoves,
  known,
  marketMood,
  missing,
  netPosition,
  percentileRank,
  positioning,
  runStrategyBacktest,
  scoreStrategy,
  shrinkAverage,
  signedCorrelation,
  stateSeries,
  strategyATR,
  tagTrades,
  tradeStatistics,
  volatilityBucket,
  weeklyRegimes
});
