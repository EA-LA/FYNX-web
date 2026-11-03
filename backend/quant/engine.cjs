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

// lib/quant/index.ts
var index_exports = {};
__export(index_exports, {
  DEFAULT_PARAMS: () => DEFAULT_PARAMS,
  FTMO_ACCOUNT_SIZES: () => FTMO_ACCOUNT_SIZES,
  FTMO_RULES: () => FTMO_RULES,
  QUANT_STEPS: () => QUANT_STEPS,
  SYMBOLS: () => SYMBOLS,
  backtest: () => backtest,
  backtestStreaming: () => backtestStreaming,
  barIntervalMs: () => barIntervalMs,
  breakoutSignal: () => breakoutSignal,
  closeATR: () => closeATR,
  correlation: () => correlation,
  createBacktestStream: () => createBacktestStream,
  createCommandParser: () => createCommandParser,
  equityFromReturns: () => equityFromReturns,
  evaluatePhase: () => evaluatePhase,
  eventStudy: () => eventStudy,
  exportStrategiesJSON: () => exportStrategiesJSON,
  finite: () => finite,
  ftmo: () => ftmo,
  generateEA: () => generateEA,
  importReturnsCSV: () => importReturnsCSV,
  importStrategiesJSON: () => importStrategiesJSON,
  integer: () => integer,
  keywordParser: () => keywordParser,
  lowerBound: () => lowerBound,
  mean: () => mean,
  monteCarlo: () => monteCarlo,
  mulberry32: () => mulberry32,
  normalizeParams: () => normalizeParams,
  optimize: () => optimize,
  parseAsk: () => parseAsk,
  portfolio: () => portfolio,
  quantile: () => quantile,
  referenceBacktest: () => referenceBacktest,
  simulateFTMO: () => simulateFTMO,
  stationaryIndices: () => stationaryIndices,
  statistics: () => statistics,
  timeMs: () => timeMs,
  validateBars: () => validateBars,
  validateReturns: () => validateReturns,
  validateStrategy: () => validateStrategy,
  variance: () => variance,
  wilderATR: () => wilderATR
});
module.exports = __toCommonJS(index_exports);

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
var FTMO_ACCOUNT_SIZES = [1e4, 25e3, 5e4, 1e5, 2e5];
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
function validateReturns(input, minLength = 2) {
  if (!Array.isArray(input) || input.length < minLength || input.length > 25e4) throw new Error(`At least ${minLength} returns (maximum 250,000) are required.`);
  let previous = "";
  return input.map((p, i) => {
    const row = typeof p === "number" ? { date: new Date(Date.UTC(2e3, 0, 1 + i)).toISOString().slice(0, 10), return: p } : { ...p };
    finite(row.return, "Return", -1, 100);
    if (typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || new Date(row.date).toISOString().slice(0, 10) !== row.date || row.date <= previous) throw new Error("Return dates must be unique and increasing ISO calendar dates.");
    previous = row.date;
    if (row.intradayMin !== void 0) {
      finite(row.intradayMin, "Intraday minimum", -1, 100);
      if (row.intradayMin > Math.min(0, row.return) + 1e-9) throw new Error("Intraday minimum cannot exceed the opening or closing equity.");
    }
    if (row.startBalanceRatio !== void 0) finite(row.startBalanceRatio, "Opening balance ratio", 0, 100);
    if (row.endBalanceRatio !== void 0) finite(row.endBalanceRatio, "Closing balance ratio", 0, 100);
    return row;
  });
}
function equityFromReturns(returns, initial = 1e4) {
  let e = initial;
  return returns.map((p) => {
    e *= 1 + p.return;
    return { date: p.date, equity: e };
  });
}
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
  begin(date2, from, equity, balance) {
    if (!this.enabled || ++this.days <= this.skipDays) return;
    this.paths.set(date2, { timezone: this.timezone, from, to: from, openingEquity: equity, openingBalance: balance, marks: [], complete: !this.exceeded, model: "recorded-ticks" });
  }
  record(date2, time, equity, balance, flat) {
    if (!this.enabled) return;
    const path = this.paths.get(date2);
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
  cover(date2, to, complete) {
    const path = this.paths.get(date2);
    if (!path) return;
    path.to = to;
    path.complete &&= complete && !this.exceeded;
  }
  path(date2) {
    return this.paths.get(date2);
  }
};
function synchronizeIntraday(paths, weights) {
  const active = paths.map((p, i) => ({ p, w: weights[i] })).filter((x) => x.w > 0);
  if (!active.length || active.some((x) => !x.p?.complete || x.p.timezone !== "Europe/Prague" || !(x.p.openingEquity > 0) || !x.p.marks.length)) return null;
  const valid = active, from = valid[0].p.from, to = valid[0].p.to;
  if (valid.some((x) => x.p.from !== from || x.p.to !== to) || to <= from) return null;
  if (valid.reduce((n, x) => n + x.p.marks.length, 0) > 1e5) return null;
  const events = [], equities = valid.map((x) => x.p.openingEquity), balances = valid.map((x) => x.p.openingBalance), flat = valid.map(() => true);
  for (let leg = 0; leg < valid.length; leg++) {
    let previous = -Infinity;
    for (const mark of valid[leg].p.marks) {
      if (!Number.isFinite(mark.time) || mark.time < from || mark.time >= to || mark.time < previous || !Number.isFinite(mark.equity) || mark.equity < 0 || !Number.isFinite(mark.balance) || mark.balance < 0) return null;
      previous = mark.time;
      events.push({ time: mark.time, leg, mark });
    }
  }
  if (events.length > 1e5) return null;
  events.sort((a, b) => a.time - b.time || a.leg - b.leg);
  const aggregate = (values) => values.reduce((s, v, i) => s + valid[i].w * v / valid[i].p.openingEquity, 0);
  const openingBalance = aggregate(balances), marks = [];
  let minimum = 1, complete = true;
  for (let i = 0; i < events.length; ) {
    const time = events[i].time;
    let end = i + 1;
    while (end < events.length && events[end].time === time) end++;
    const counts = /* @__PURE__ */ new Map();
    for (let j = i; j < end; j++) counts.set(events[j].leg, (counts.get(events[j].leg) || 0) + 1);
    const orderedSingleLeg = counts.size === 1;
    if (counts.size > 1 && [...counts.values()].some((n) => n > 1)) complete = false;
    for (let j = i; j < end; j++) {
      const { leg, mark } = events[j];
      equities[leg] = mark.equity;
      balances[leg] = mark.balance;
      flat[leg] = mark.flat;
      if (orderedSingleLeg) {
        const equity = aggregate(equities);
        minimum = Math.min(minimum, equity);
        marks.push({ time, equity, balance: aggregate(balances), flat: flat.every(Boolean) });
      }
    }
    if (!orderedSingleLeg) {
      const equity = aggregate(equities);
      minimum = Math.min(minimum, equity);
      marks.push({ time, equity, balance: aggregate(balances), flat: flat.every(Boolean) });
    }
    i = end;
  }
  const finalEquity = aggregate(equities), finalBalance = aggregate(balances);
  return { path: { timezone: "Europe/Prague", from, to, openingEquity: 1, openingBalance, marks, complete, model: "synchronized-ticks" }, minimum: minimum - 1, startBalanceRatio: openingBalance, endBalanceRatio: finalEquity > 0 ? finalBalance / finalEquity : 1, flat: flat.every(Boolean) };
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
  if (!["breakout", "news"].includes(p.strategy)) throw new Error("Choose breakout or news strategy.");
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
      const date2 = new Date(release).toISOString().slice(0, 10), i = lowerBound(times, timeMs(date2));
      if (i <= 0 || i >= bars.length || new Date(times[i]).toISOString().slice(0, 10) !== date2) continue;
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
  const start = Math.max(p.startIndex || 0, p.lookback + p.atrPeriod + 1);
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
    const b = bars[i], date2 = dayKey(b.time);
    if (!day || day.date !== date2) {
      day = { date: date2, startEquity: equity, startBalance: balance, minEquity: equity, endEquity: equity, endBalance: balance, traded: false, flat: !position.current, complete: p.mode !== "close" && p.dayTimezone === "Europe/Prague" };
      days.push(day);
      capture.begin(date2, timeMs(b.time), equity, balance);
    }
    const endTime = p.mode === "tick" ? b.ticks[b.ticks.length - 1].time : timeMs(b.time) + interval - 1;
    if (p.mode !== "close" && dayKey(endTime) !== date2) day.complete = false;
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
          capture.record(date2, timeMs(tick.time), balance, balance, true);
          continue;
        }
        const px = (position.current.side > 0 ? tick.bid : tick.ask) - position.current.side * slip;
        day.minEquity = Math.min(day.minEquity, mark(px));
        if ((px - position.current.stop) * position.current.side <= 0) exit(px, i, "stop", tick.time);
        else if ((px - position.current.target) * position.current.side >= 0) exit(position.current.target - position.current.side * slip, i, "target", tick.time);
        capture.record(date2, timeMs(tick.time), position.current ? mark(px) : balance, balance, !position.current);
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
      const side = p.strategy === "news" ? p.mode === "tick" ? 0 : events.get(i) || 0 : breakoutSignal(bars, i, atr[i], p);
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
      capture.record(date2, timeMs(b.ticks[b.ticks.length - 1].time), equity, balance, !position.current);
      capture.cover(date2, timeMs(b.time) + interval, day.complete);
    }
  }
  const dailyReturns = days.map((d) => ({ date: d.date, return: d.startEquity > 0 ? d.endEquity / d.startEquity - 1 : 0, traded: d.traded, flat: d.flat, intradayMin: d.startEquity > 0 ? Math.max(-1, d.minEquity / d.startEquity - 1) : 0, intradayComplete: d.complete && (!capture.enabled || capture.path(d.date)?.complete === true), intraday: capture.path(d.date), dayTimezone: p.dayTimezone, startBalanceRatio: d.startEquity > 0 ? d.startBalance / d.startEquity : 1, endBalanceRatio: d.endEquity > 0 ? d.endBalance / d.endEquity : 1 }));
  const notes2 = [
    p.mode === "close" ? "Close-only fills at observed closes; gaps beyond stops are filled at the close. Intraday excursions are unknown." : "Signals use a completed bar and enter at the following bar open; ambiguous OHLC stop/target bars take the stop first.",
    "Fixed units are sized from equity at entry. Equity includes open P&L every day; per-trade R includes round-trip costs.",
    p.mode === "tick" ? "Recorded bid/ask ticks supply the spread. Configured slippage and round-trip fees are additional." : "Spread and slippage are user-supplied assumptions, not observed historical execution costs.",
    `Daily buckets use ${p.dayTimezone}. FTMO midnight boundaries are Europe/Prague; buckets or bars crossing that boundary retain the daily-data buffer.`
  ];
  if (capture.enabled) notes2.push(capture.exceeded ? "Intraday timestamp capture reached its bounded mark budget; incomplete paths retain the FTMO buffer." : "Actual tick equity/balance timestamp paths are available for synchronized portfolio research.");
  if (p.strategy === "news") notes2.push(p.mode === "close" ? "Daily news proxy uses the event day close-to-close move. It does not measure the immediate release response." : p.mode === "tick" ? "News observations use the first recorded quotes at release and release + X minutes; signals enter on that quote with prior completed-bar ATR." : "News observations use candle closing timestamps, rounded up by at most one bar; signals enter at the following open.");
  return { equity: days.map((d) => ({ date: d.date, equity: d.endEquity })), dailyReturns, trades, stats: statistics(dailyReturns, trades, p.initialEquity), params: p, notes: notes2 };
}

// lib/quant/reference.ts
function referenceBacktest(bars, input = {}) {
  const p = normalizeParams({ ...input, mode: "close" });
  validateBars(bars);
  if (p.strategy !== "breakout") throw new Error("Reference compatibility excludes the preview approximate NFP calendar.");
  const start = Math.max(p.startIndex || 0, p.lookback + p.atrPeriod + 1), atr = closeATR(bars.map((b) => b.close), p.atrPeriod);
  if (start >= bars.length - 1) throw new Error("Not enough daily data for the reference model.");
  const cost = p.costPips * p.pipSize, risk = p.riskPct / 100;
  let pos = null, eq = p.initialEquity, peak = eq, maxDrawdown = 0;
  const dailyReturns = [], trades = [], equity = [];
  for (let i = start; i < bars.length; i++) {
    let r = 0, traded = false, exited = false;
    if (pos) {
      r += (bars[i].close - bars[i - 1].close) * pos.dir / pos.stop * risk;
      pos.held++;
      const move = (bars[i].close - pos.entry) * pos.dir;
      if (move <= -pos.stop || move >= pos.target || pos.held >= p.maxHold || i === bars.length - 1) {
        r -= cost / pos.stop * risk;
        const R = (move - cost) / pos.stop;
        trades.push({ entryDate: new Date(bars[pos.i].time).toISOString(), exitDate: new Date(bars[i].time).toISOString(), entryPrice: pos.entry, exitPrice: bars[i].close, side: pos.dir > 0 ? "long" : "short", R, pnl: R * pos.equity * risk, reason: move <= -pos.stop ? "stop" : move >= pos.target ? "target" : i === bars.length - 1 ? "last" : "time", entryIndex: pos.i, exitIndex: i, riskAmount: pos.equity * risk });
        pos = null;
        exited = true;
      }
    }
    if (!pos && !exited && i < bars.length - 1 && Number.isFinite(atr[i]) && atr[i] > 0) {
      const dir = breakoutSignal(bars, i, atr[i], p);
      if (dir) {
        pos = { dir, entry: bars[i].close, stop: p.stopS * atr[i], target: p.targetTP * atr[i], held: 0, i, equity: eq };
        traded = true;
      }
    }
    eq *= 1 + r;
    peak = Math.max(peak, eq);
    maxDrawdown = Math.max(maxDrawdown, 1 - eq / peak);
    const date2 = new Date(bars[i].time).toISOString().slice(0, 10);
    dailyReturns.push({ date: date2, return: r, traded, flat: !pos });
    equity.push({ date: date2, equity: eq });
  }
  const vals = dailyReturns.map((p2) => p2.return), n = vals.length, mu = vals.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(Math.max(vals.reduce((a, b) => a + b * b, 0) / n - mu * mu, 1e-18)), gain = trades.reduce((s, t) => s + Math.max(0, t.R), 0), loss = -trades.reduce((s, t) => s + Math.min(0, t.R), 0), ret = eq / p.initialEquity - 1;
  return { equity, dailyReturns, trades, params: p, stats: { totalReturn: ret, cagr: Math.pow(eq / p.initialEquity, 1 / Math.max(n / 252, 0.01)) - 1, sharpe: mu / sd * Math.sqrt(252), maxDrawdown, trades: trades.length, winRate: trades.length ? trades.filter((t) => t.R > 0).length / trades.length : 0, profitFactor: loss > 0 ? gain / loss : gain > 0 ? 9.99 : 0, averageR: trades.length ? trades.reduce((s, t) => s + t.R, 0) / trades.length : 0, returnMaxDD: maxDrawdown > 0 ? ret / maxDrawdown : 0 }, notes: ["Reference compatibility: reproduces the supplied daily-close model, including daily rebalanced risk exposure and population Sharpe deviation.", "This model is for reference verification; deployable backtest() maintains fixed position units and includes explicit execution costs."] };
}

// lib/quant/analytics.ts
function optimize(bars, params = {}, options = {}, onProgress) {
  const p = normalizeParams(params), metric = options.metric || "sharpe", minTrades = integer(options.minTrades ?? 10, "Minimum trades", 1, 1e4), fraction = finite(options.trainFraction ?? 0.7, "Train fraction", 0.5, 0.9);
  if (!["sharpe", "profitFactor", "totalReturn", "returnMaxDD"].includes(metric)) throw new Error("Unsupported optimization metric.");
  const entryValues = options.entryValues || Array.from({ length: 9 }, (_, i) => i * 0.25), stopValues = options.stopValues || Array.from({ length: 8 }, (_, i) => (i + 1) * 0.5);
  if (!entryValues.length || !stopValues.length || entryValues.length * stopValues.length > 2500) throw new Error("Optimization grids must have 1\u20132,500 cells.");
  if (bars.length * entryValues.length * stopValues.length > 3e7) throw new Error("Reduce the history or grid to at most 30 million bar-cell evaluations.");
  entryValues.forEach((k) => finite(k, "Entry grid", 0, 10));
  stopValues.forEach((s) => finite(s, "Stop grid", 0.05, 20));
  const split = Math.floor(bars.length * fraction), training = bars.slice(0, split), cells = [];
  if (split <= p.lookback + p.atrPeriod + 2 || bars.length - split < 20) throw new Error("More history is required for a meaningful 70/30 walk-forward split.");
  let best = null;
  for (const stopS of stopValues) for (const entryK of entryValues) {
    const result = backtest(training, { ...p, entryK, stopS, startIndex: 0 });
    const raw = result.stats[metric];
    const value = result.trades.length >= minTrades && raw !== null && Number.isFinite(raw) ? raw : null;
    cells.push({ entryK, stopS, value, stats: result.stats });
    if (value !== null && (!best || value > best.value)) best = { entryK, stopS, value };
    onProgress?.(cells.length / (entryValues.length * stopValues.length));
  }
  const inSample = best ? backtest(training, { ...p, ...best, startIndex: 0 }) : null, outOfSample = best ? backtest(bars, { ...p, ...best, startIndex: split }) : null;
  const verdict = !best ? "unavailable" : outOfSample.stats.sharpe > 0 ? outOfSample.stats.sharpe >= 0.5 * inSample.stats.sharpe ? "green" : "amber" : "red";
  return { cells, best, inSample, outOfSample, verdict, metric, entryValues, stopValues, splitDate: new Date(bars[split].time).toISOString().slice(0, 10), note: !best ? "Too few qualifying trades to select a cell." : verdict === "green" ? "The edge retained at least half its in-sample Sharpe on the held-out period." : verdict === "amber" ? "The held-out result is positive but weaker." : "The in-sample peak did not survive the held-out period: likely curve-fit." };
}
function covarianceMatrix(series) {
  const averages = series.map(mean), n = series[0].length;
  return series.map((a, i) => series.map((b, j) => a.reduce((s, v, k) => s + (v - averages[i]) * (b[k] - averages[j]), 0) / Math.max(1, n - 1)));
}
function allocation(series, method) {
  const n = series.length;
  if (method === "equal-weight") return Array(n).fill(1 / n);
  const cov = covarianceMatrix(series), vol = cov.map((r, i) => Math.sqrt(Math.max(0, r[i]))), active = vol.map((v, i) => v > 1e-12 ? i : -1).filter((i) => i >= 0);
  if (!active.length) return Array(n).fill(1 / n);
  const weights = vol.map((v) => v > 1e-12 ? 1 / v : 0);
  let sum = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) weights[i] /= sum;
  if (method === "inverse-volatility") return weights;
  const diagonalFloor = Math.max(...vol.map((v) => v * v)) * 1e-8;
  for (let pass = 0; pass < 300; pass++) {
    let change = 0;
    for (const i of active) {
      const diag = Math.max(cov[i][i], diagonalFloor), off = active.reduce((s, j) => j === i ? s : s + cov[i][j] * weights[j], 0);
      const next = (-off + Math.sqrt(off * off + 4 * diag / active.length)) / (2 * diag);
      change = Math.max(change, Math.abs(next - weights[i]));
      weights[i] = next;
    }
    if (change < 1e-10) break;
  }
  sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / sum);
}
function portfolio(input, options = {}) {
  if (!Array.isArray(input) || !input.length || input.length > 50) throw new Error("Select between 1 and 50 strategy sleeves.");
  const method = options.method || "equal-risk";
  if (!["equal-risk", "equal-weight", "inverse-volatility"].includes(method)) throw new Error("Unknown portfolio weighting method.");
  const sleeves = input.map((s) => {
    if (typeof s.name !== "string" || !s.name.trim() || s.name.length > 160) throw new Error("Each strategy needs a short name.");
    return { name: s.name, returns: validateReturns(s.returns) };
  });
  const maps = sleeves.map((s) => new Map(s.returns.map((r) => [r.date, r])));
  const dates = sleeves[0].returns.map((r) => r.date).filter((d) => maps.every((m) => m.has(d)));
  if (dates.length < 20) throw new Error("The strategies need at least 20 overlapping daily observations.");
  const lookback = integer(options.lookback ?? 60, "Risk calibration days", 2, 1e3), rebalanceEvery = integer(options.rebalanceEvery ?? 20, "Rebalance interval", 1, 252);
  if (method !== "equal-weight" && dates.length <= lookback + 1) throw new Error("Not enough overlapping dates after risk calibration.");
  const rows = maps.map((m) => dates.map((d) => m.get(d))), matrix = rows.map((rs) => rs.map((r) => r.return));
  let weights = Array(sleeves.length).fill(1 / sleeves.length);
  const dailyReturns = [];
  const allocations = [];
  const start = method === "equal-weight" ? 0 : lookback;
  for (let i = start; i < dates.length; i++) {
    if (method !== "equal-weight" && (i - start) % rebalanceEvery === 0) {
      weights = allocation(matrix.map((row) => row.slice(i - lookback, i)), method);
      allocations.push({ date: dates[i], weights: [...weights] });
    }
    const combined = { date: dates[i], return: matrix.reduce((s, row, j) => s + weights[j] * row[i], 0), traded: rows.some((r, j) => weights[j] > 0 && (r[i].traded ?? r[i].return !== 0)), flat: rows.every((r, j) => weights[j] === 0 || r[i].flat !== false), intradayComplete: false };
    const synchronized = synchronizeIntraday(rows.map((row) => row[i].intraday), weights);
    if (synchronized) {
      const final = synchronized.path.marks[synchronized.path.marks.length - 1];
      const reconciled = Math.abs(final.equity - (1 + combined.return)) <= 1e-8;
      combined.intraday = { ...synchronized.path, complete: synchronized.path.complete && reconciled };
      combined.intradayComplete = combined.intraday.complete;
      combined.intradayMin = Math.min(0, combined.return, synchronized.minimum);
      combined.dayTimezone = "Europe/Prague";
      combined.startBalanceRatio = synchronized.startBalanceRatio;
      combined.endBalanceRatio = synchronized.endBalanceRatio;
      combined.flat = synchronized.flat;
    }
    dailyReturns.push(combined);
  }
  const initial = finite(options.initialEquity ?? 1e4, "Initial equity", 1, 1e12);
  const aligned = sleeves.map((s, i) => ({ name: s.name, returns: rows[i].slice(start).map(({ intraday, ...r }) => ({ ...r, intradayComplete: false })), equity: equityFromReturns(rows[i].slice(start), initial) }));
  return { dailyReturns, equity: equityFromReturns(dailyReturns, initial), stats: statistics(dailyReturns), weights: sleeves.map((s, i) => ({ name: s.name, weight: weights[i] })), correlation: matrix.map((a) => matrix.map((b) => correlation(a.slice(start), b.slice(start)))), sleeves: aligned, allocations, method, notes: ["Only shared observed dates are included. Missing returns are not silently filled with zero.", method === "equal-weight" ? "Equal weights are fixed." : `Weights use only the preceding ${lookback} daily observations and rebalance every ${rebalanceEvery} days; displayed weights are the latest allocation.`, "Complete captured tick paths are merged at actual timestamps using the last observed valuation of each sleeve. Independent sleeve minima are never summed. Missing/incomplete paths, unequal coverage, ambiguous same-timestamp ordering, and OHLC-only sleeves retain the FTMO buffer."] };
}
function eventStudy(bars, events, options = {}) {
  validateBars(bars);
  if (!Array.isArray(events) || !events.length) throw new Error("A recorded economic calendar is required for an event study.");
  const window = integer(options.windowMinutes ?? 15, "Observation minutes", 1, 1440), mode = options.mode || "daily";
  const selected = events.filter((e) => e.timing !== "estimated" && e.impact === "high" && (!options.currency || e.currency === options.currency) && (!options.currencies?.length || options.currencies.includes(e.currency)) && (!options.eventType || options.eventType === "all" || e.type === options.eventType || e.name === options.eventType));
  const byDay = /* @__PURE__ */ new Map();
  for (const e of selected) {
    const date2 = new Date(timeMs(e.time)).toISOString().slice(0, 10), type = e.type || e.name;
    if (!byDay.has(date2)) byDay.set(date2, /* @__PURE__ */ new Set());
    byDay.get(date2).add(type);
  }
  const eventMoves = [], normalMoves = [], types = /* @__PURE__ */ new Map(), times = bars.map((b) => timeMs(b.time));
  const addEvent = (type, move) => {
    if (!types.has(type)) types.set(type, []);
    types.get(type).push(move);
  };
  if (mode === "daily") {
    for (let i = 1; i < bars.length; i++) {
      const date2 = new Date(times[i]).toISOString().slice(0, 10), move = Math.abs(bars[i].close / bars[i - 1].close - 1), dayTypes = byDay.get(date2);
      if (dayTypes) {
        eventMoves.push(move);
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
        eventMoves.push(move);
        addEvent(event.type || event.name, move);
      }
    }
    for (const date2 of observedDays) if (!byDay.has(date2)) {
      for (const offset of releaseTimes) {
        const move = observation(timeMs(date2) + offset);
        if (move !== null) normalMoves.push(move);
      }
    }
  }
  return {
    eventDays: eventMoves.length,
    normalDays: normalMoves.length,
    averageEventMove: eventMoves.length ? mean(eventMoves) : null,
    averageNormalMove: normalMoves.length ? mean(normalMoves) : null,
    byType: [...types].map(([type, moves]) => ({ type, count: moves.length, averageAbsoluteMove: mean(moves) })),
    mode,
    windowMinutes: window,
    notes: [mode === "daily" ? "Absolute close-to-close daily returns, matched to actual release dates. This is an association, not a causal estimate." : "Release windows use available completed closes. Controls match UTC release time and observation horizon on non-event days; missing windows are omitted."]
  };
}

// lib/quant/bootstrap.ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    let t = a = a + 1831565813 >>> 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function stationaryIndices(length, horizon, blockSize, rng) {
  integer(length, "Source length", 1, 25e4);
  integer(horizon, "Bootstrap horizon", 1, 1e4);
  finite(blockSize, "Block size", 1, 25e4);
  const out = [];
  let index = Math.floor(rng() * length);
  for (let i = 0; i < horizon; i++) {
    if (i && rng() < 1 / blockSize) index = Math.floor(rng() * length);
    out.push(index);
    index = (index + 1) % length;
  }
  return out;
}
function monteCarlo(input, options = {}, onProgress) {
  const source = validateReturns(input, 20), paths = integer(options.paths ?? 2e3, "Paths", 1, 1e4), horizon = integer(options.horizon ?? 252, "Horizon", 1, 2520), blockSize = finite(options.blockSize ?? 10, "Block size", 1, source.length), seed = integer(options.seed ?? 42, "Seed", 0, 4294967295);
  if (paths * horizon > 5e6) throw new Error("Reduce paths or horizon to at most 5,000,000 simulated daily observations.");
  const rng = mulberry32(seed), initial = finite(options.initialEquity ?? 1, "Initial equity", Number.MIN_VALUE, 1e12);
  const columns = Array.from({ length: horizon + 1 }, () => new Float64Array(paths)), drawdowns = [], finalReturns = [], samples = [];
  for (let p = 0; p < paths; p++) {
    const sample = p < 40 ? [initial] : null;
    let value = 1, peak = 1, dd = 0, index = Math.floor(rng() * source.length);
    columns[0][p] = initial;
    for (let day = 1; day <= horizon; day++) {
      if (day > 1 && rng() < 1 / blockSize) index = Math.floor(rng() * source.length);
      value *= Math.max(0, 1 + source[index].return);
      index = (index + 1) % source.length;
      peak = Math.max(peak, value);
      dd = Math.max(dd, 1 - value / peak);
      columns[day][p] = value * initial;
      sample?.push(value * initial);
    }
    if (sample) samples.push(sample);
    drawdowns.push(dd);
    finalReturns.push(value - 1);
    if ((p + 1) % 50 === 0 || p === paths - 1) onProgress?.((p + 1) / paths);
  }
  const fan = columns.map((column, day) => {
    column.sort();
    const values = Array.from(column);
    return { day, p05: quantile(values, 0.05), p25: quantile(values, 0.25), median: quantile(values, 0.5), p75: quantile(values, 0.75), p95: quantile(values, 0.95) };
  });
  const sortedReturns = [...finalReturns].sort((a, b) => a - b), sortedDD = [...drawdowns].sort((a, b) => a - b);
  return { fan, samples, drawdowns, stats: { medianReturn: quantile(sortedReturns, 0.5), p05Return: quantile(sortedReturns, 0.05), p95Return: quantile(sortedReturns, 0.95), lossProbability: finalReturns.filter((v) => v < 0).length / paths, medianDrawdown: quantile(sortedDD, 0.5), p95Drawdown: quantile(sortedDD, 0.95), drawdownOver10Probability: drawdowns.filter((v) => v > 0.1).length / paths }, seed, paths, horizon, blockSize, notes: ["Stationary block bootstrap of observed daily returns; it does not model unseen regimes or liquidity shocks."] };
}

// lib/quant/ftmo.ts
function evaluatePhase(path, rules, target, options = {}) {
  const initial = options.accountSize ?? 1e4, scale = options.riskScale ?? 1, buffer = (options.intradayBufferPct ?? 1) / 100;
  let equity = initial, balance = initial, highBalance = initial, tradingDays = 0, bestDay = 0, positiveProfit = 0;
  for (let i = 0; i < path.length; i++) {
    const row = path[i], startEquity = equity;
    const hasIntraday = row.intradayComplete === true && row.intradayMin !== void 0 && row.dayTimezone === "Europe/Prague";
    const effectiveDailyLoss = Math.max(0, rules.dailyLoss - (hasIntraday ? 0 : buffer));
    const openingBalance = startEquity * (1 + scale * ((row.startBalanceRatio ?? 1) - 1));
    const closingRatio = (1 + row.return) * (row.endBalanceRatio ?? 1);
    equity = startEquity * Math.max(0, 1 + row.return * scale);
    balance = startEquity * Math.max(0, 1 + (closingRatio - 1) * scale);
    const minimum = startEquity * Math.max(0, 1 + scale * (hasIntraday ? row.intradayMin : Math.min(0, row.return)));
    if (row.traded ?? row.return !== 0) tradingDays++;
    const pnl = balance - openingBalance;
    bestDay = Math.max(bestDay, pnl);
    positiveProfit += Math.max(0, pnl);
    const result = (status) => ({ status, days: i + 1, tradingDays, equity, balance, bestDay, positiveProfit });
    const dailyFloor = openingBalance - effectiveDailyLoss * initial, maxFloor = (rules.trailing ? highBalance : initial) - rules.maxLoss * initial;
    if (minimum < maxFloor - 1e-8) return result("max-loss");
    if (minimum < dailyFloor - 1e-8) return result("daily-loss");
    highBalance = Math.max(highBalance, balance);
    const denominator = rules.bestDayBasis === "positive-days" ? positiveProfit : balance - initial;
    const consistent = rules.bestDayLimit === null || denominator > 0 && bestDay <= denominator * rules.bestDayLimit + 1e-8;
    if (balance >= initial * (1 + target) - 1e-8 && row.flat !== false && tradingDays >= rules.minTradingDays && consistent) return result("pass");
  }
  return { status: "timeout", days: path.length, tradingDays, equity, balance, bestDay, positiveProfit };
}
function attemptsAtScale(source, options, scale, onProgress) {
  const rng = mulberry32(options.seed), rules = options.rules;
  let phase1 = 0, both = 0, daily = 0, max = 0, timeout = 0;
  const days1 = [], days2 = [];
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    let passed = true;
    for (let phase = 0; phase < rules.phaseTargets.length; phase++) {
      const path = [];
      let index = Math.floor(rng() * source.length);
      for (let day = 0; day < options.horizon; day++) {
        if (day && rng() < 1 / options.blockSize) index = Math.floor(rng() * source.length);
        path.push(source[index]);
        index = (index + 1) % source.length;
      }
      const outcome = evaluatePhase(path, rules, rules.phaseTargets[phase], { accountSize: options.accountSize, riskScale: scale, intradayBufferPct: options.intradayBufferPct });
      if (outcome.status === "pass") {
        if (phase === 0) {
          phase1++;
          days1.push(outcome.days);
        } else days2.push(outcome.days);
      } else {
        passed = false;
        if (outcome.status === "daily-loss") daily++;
        else if (outcome.status === "max-loss") max++;
        else timeout++;
        break;
      }
    }
    if (passed) both++;
    if ((attempt + 1) % 100 === 0 || attempt === options.attempts - 1) onProgress?.((attempt + 1) / options.attempts);
  }
  days1.sort((a, b) => a - b);
  days2.sort((a, b) => a - b);
  return { phase1PassRate: phase1 / options.attempts, bothPassRate: both / options.attempts, dailyLossRate: daily / options.attempts, maxLossRate: max / options.attempts, timeoutRate: timeout / options.attempts, medianDaysPhase1: days1.length ? quantile(days1, 0.5) : null, medianDaysPhase2: days2.length ? quantile(days2, 0.5) : null };
}
function ftmo(input, requested = {}, onProgress) {
  const source = validateReturns(input, 20), ruleId = requested.ruleId || "2-step", rules = FTMO_RULES[ruleId];
  if (!rules) throw new Error("Choose a configured FTMO rule version.");
  const options = { attempts: integer(requested.attempts ?? 2e3, "Attempts", 1, 1e4), horizon: integer(requested.horizon ?? 120, "Phase horizon", 4, 1e3), riskScale: finite(requested.riskScale ?? 1, "Risk scale", 0.05, 10), intradayBufferPct: finite(requested.intradayBufferPct ?? 1, "Intraday buffer percent", 0, rules.dailyLoss * 100 - 0.01), accountSize: finite(requested.accountSize ?? 1e4, "Account size", 1e4, 2e5), ruleId, seed: integer(requested.seed ?? 42, "Seed", 0, 4294967295), blockSize: finite(requested.blockSize ?? 10, "Block size", 1, source.length), includeRiskScan: requested.includeRiskScan !== false, rules };
  if (!FTMO_ACCOUNT_SIZES.includes(options.accountSize)) throw new Error("Choose a configured FTMO account size.");
  const riskScales = requested.riskScales || Array.from({ length: 20 }, (_, i) => (i + 1) * 0.25);
  if (riskScales.length > 30) throw new Error("Use at most 30 risk scales.");
  riskScales.forEach((s) => finite(s, "Risk scan scale", 0.05, 10));
  if (options.attempts * options.horizon * (options.includeRiskScan ? riskScales.length + 1 : 1) > 6e7) throw new Error("Reduce attempts, horizon or risk-scan points to fit the simulation budget.");
  const work = options.includeRiskScan ? riskScales.length + 1 : 1, stats = attemptsAtScale(source, options, options.riskScale, (p) => onProgress?.(p / work));
  const riskScan = options.includeRiskScan ? riskScales.map((riskScale, i) => {
    const s = attemptsAtScale(source, options, riskScale);
    onProgress?.((i + 2) / work);
    return { riskScale, passRate: s.bothPassRate, breachRate: s.dailyLossRate + s.maxLossRate, timeoutRate: s.timeoutRate };
  }) : [];
  const verdict = stats.bothPassRate >= 0.7 ? "Most simulated attempts passed at this risk scale; historical resampling cannot establish future reliability." : stats.bothPassRate >= 0.3 ? "Results are mixed. Loss-limit breaches and timeouts remain material." : "Most simulated attempts did not pass. Review losses and timeouts before increasing risk.";
  return { stats, riskScan, verdict, rules, seed: options.seed, attempts: options.attempts, horizon: options.horizon, accountSize: options.accountSize, riskScale: options.riskScale, intradayBufferPct: options.intradayBufferPct, notes: ["Simulated from past returns. An estimate, not a promise. Confirm current rules on ftmo.com.", "Minimum days count days with positions opened, when that metadata is available. Imported return-only series infer a trading day from a nonzero return.", "Each phase starts with the original account balance. The horizon is a simulation cap, not an FTMO time limit.", source.every((r) => r.intradayComplete && r.intradayMin !== void 0 && r.dayTimezone === "Europe/Prague") ? "Recorded intraday equity minima are checked and no daily buffer is applied. Validate that day boundaries match Europe/Prague." : `Daily-only paths use a ${options.intradayBufferPct}% initial-balance buffer; daily-close returns cannot prove intraday compliance.`, "Bootstrap transitions may splice different open-position states; pass rates are statistical estimates rather than broker-rule certification."] };
}
var simulateFTMO = ftmo;

// lib/quant/commands.ts
var QUANT_STEPS = ["backtest", "optimize", "portfolio", "montecarlo", "ftmo", "deploy"];
function parseAsk(text, defaults = {}) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Enter a research request first.");
  if (text.length > 4e3) throw new Error("Keep the request below 4,000 characters.");
  const value = text.toLowerCase().replace(/backrest|backtes\b/g, "backtest").replace(/chllange|challange|chalenge/g, "challenge").replace(/optimise/g, "optimize");
  const compact = value.replace(/([a-z]{3})\s*[/_-]\s*([a-z]{3})/g, "$1$2");
  const matches = SYMBOLS.map((s) => ({ symbol: s.id, at: Math.min(...[s.id, s.symbol, ...s.aliases || []].map((alias) => {
    const key = alias.toLowerCase().replace(/[/_-]/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
    const exp = new RegExp("\\b" + key + "\\b");
    const m = exp.exec(compact);
    return m ? m.index : Infinity;
  })) })).filter((s) => Number.isFinite(s.at)).sort((a, b) => a.at - b.at);
  const warnings = [];
  if (matches.length > 1) warnings.push("Several markets were mentioned. The first market is selected; add the others in Portfolio.");
  let timeframe = defaults.timeframe || "D1";
  if (/\bticks?\b/.test(value)) timeframe = "tick";
  else if (/\b(1m|m1|1[- ]?min(?:ute)?s?)\b/.test(value)) timeframe = "M1";
  else if (/\b(5m|m5|5[- ]?min(?:ute)?s?)\b/.test(value)) timeframe = "M5";
  else if (/\b(1h|h1|hourly|1[- ]?hours?)\b/.test(value)) timeframe = "H1";
  else if (/\b(4h|h4|4[- ]?hours?)\b/.test(value)) timeframe = "H4";
  else if (/\b(daily|d1|1d|day[- ]?bars?)\b/.test(value)) timeframe = "D1";
  const history = /\b(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/.exec(value);
  const years = history ? Number(history[1]) : defaults.years ?? 10;
  if (!Number.isFinite(years) || years <= 0 || years > 50) throw new Error("History must be greater than 0 and no more than 50 years.");
  const pathMatch = /\b([\d,.]+)\s*(?:monte\s*carlo\s*)?(?:paths?|attempts?|simulations?)\b/.exec(value);
  if (pathMatch && /[,.]/.test(pathMatch[1]) && !/^\d{1,3}(?:[,.]\d{3})+$/.test(pathMatch[1])) throw new Error("Use a whole number of paths; thousands may be separated by commas or dots.");
  let paths = pathMatch ? Number(pathMatch[1].replace(/[,.]/g, "")) : defaults.paths ?? 2e3;
  if (!Number.isInteger(paths) || paths < 1) throw new Error("Simulation paths must be a positive whole number.");
  if (paths > 1e4) {
    paths = 1e4;
    warnings.push("Simulation count capped at 10,000 paths.");
  }
  const tests = {
    backtest: /\b(backtest|breakout|atr|strategy test)\b/,
    optimize: /\b(optimiz\w*|surface|heatmap|parameter grid)\b/,
    portfolio: /\b(portfolio|sleeves?|strategies|combine)\b/,
    montecarlo: /\b(monte\s*carlo|paths?|bootstrap)\b/,
    ftmo: /\b(ftmo|challenge|pass)\b/,
    deploy: /\b(deploy|ea|mt5|mt4|ctrader|cbot|expert advisor)\b/
  };
  const steps = QUANT_STEPS.filter((step) => tests[step].test(value));
  if (!steps.length) {
    steps.push("backtest");
    warnings.push("No workflow step was recognized; running a backtest.");
  }
  return {
    symbol: matches[0]?.symbol || defaults.symbol || "EURUSD",
    timeframe,
    dataType: timeframe === "tick" ? "tick" : defaults.dataType === "close" && timeframe === "D1" ? "close" : "ohlc",
    years,
    steps,
    paths,
    warnings
  };
}
var keywordParser = { parse: async (text, defaults) => parseAsk(text, defaults) };
function createCommandParser(options = {}) {
  if (!options.enabled) return keywordParser;
  if (!options.apiKeyConfigured || !options.serverParser) throw new Error("The optional LLM parser needs a server key and a configured parser adapter.");
  return options.serverParser;
}

// lib/quant/imports.ts
var MAX_ROWS = 1e5;
function finite2(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}
function date(value, line) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value.trim());
  const day = match?.[1];
  if (!day || !Number.isFinite(Date.parse(value)) || (/* @__PURE__ */ new Date(day + "T00:00:00Z")).toISOString().slice(0, 10) !== day) throw new Error(`Row ${line}: use a valid ISO date (YYYY-MM-DD).`);
  return day;
}
function numeric(value, line, key) {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) throw new Error(`Row ${line}: ${key} must be a number without currency signs or percent symbols.`);
  return finite2(Number(value), `Row ${line}: ${key}`);
}
function parseCSV(csv) {
  if (typeof csv !== "string" || !csv.trim()) throw new Error("The CSV is empty.");
  if (csv.length > 10 * 1024 * 1024) throw new Error("CSV files must be no larger than 10 MB.");
  const rows = [];
  let row = [], value = "", quoted = false, closed = false;
  const pushCell = () => {
    row.push(value.trim());
    value = "";
    closed = false;
  };
  const pushRow = () => {
    pushCell();
    if (row.some(Boolean)) rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 1) throw new Error("CSV exceeds 100,000 rows.");
  };
  csv = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') {
        value += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else value += c;
    } else if (c === '"') {
      if (value || closed) throw new Error("Malformed CSV quoting.");
      quoted = true;
    } else if (c === ",") pushCell();
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      pushRow();
    } else if (closed && c.trim()) throw new Error("Unexpected text after a quoted CSV field.");
    else if (!closed) value += c;
  }
  if (quoted) throw new Error("Unclosed quote in CSV.");
  if (value || row.length || closed) pushRow();
  return rows;
}
function importReturnsCSV(csv, options = {}) {
  const rows = parseCSV(csv), headers = rows.shift()?.map((x) => x.toLowerCase());
  if (!headers || !rows.length) throw new Error("CSV needs a header and at least one data row.");
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate column names.");
  const daily = ["date", "return_pct"].every((h) => headers.includes(h));
  const trades = ["entry_date", "exit_date", "pnl"].every((h) => headers.includes(h));
  if (daily === trades) throw new Error("Use either date,return_pct or entry_date,exit_date,pnl columns.");
  const points = [];
  const seen = /* @__PURE__ */ new Set();
  const cash = /* @__PURE__ */ new Map(), entryDays = /* @__PURE__ */ new Set();
  let earliest = "", latest = "";
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], line = i + 2;
    if (row.length !== headers.length) throw new Error(`Row ${line}: expected ${headers.length} columns, received ${row.length}.`);
    const get = (key) => row[headers.indexOf(key)];
    if (daily) {
      const d = date(get("date"), line), r = numeric(get("return_pct"), line, "return_pct") / 100;
      if (r < -1) throw new Error(`Row ${line}: a return cannot be below -100%.`);
      if (seen.has(d)) throw new Error(`Row ${line}: duplicate daily return for ${d}.`);
      seen.add(d);
      points.push({ date: d, return: r, traded: r !== 0 });
    } else {
      const entry = date(get("entry_date"), line), exit = date(get("exit_date"), line), pnl = numeric(get("pnl"), line, "pnl");
      if (exit < entry) throw new Error(`Row ${line}: exit date is before entry date.`);
      cash.set(exit, (cash.get(exit) || 0) + pnl);
      entryDays.add(entry);
      earliest = !earliest || entry < earliest ? entry : earliest;
      latest = !latest || exit > latest ? exit : latest;
    }
  }
  if (trades) {
    let balance = finite2(options.initialEquity, "Initial equity");
    if (balance <= 0) throw new Error("Enter positive initial equity to convert cash P&L into returns.");
    const count = (Date.parse(latest) - Date.parse(earliest)) / 864e5 + 1;
    if (count > MAX_ROWS) throw new Error("Trade dates span more than 100,000 days.");
    for (let t = Date.parse(earliest); t <= Date.parse(latest); t += 864e5) {
      const d = new Date(t).toISOString().slice(0, 10), pnl = cash.get(d) || 0;
      if (balance <= 0) throw new Error("The imported trade account becomes insolvent before the last date.");
      const r = pnl / balance;
      if (r < -1) throw new Error(`Loss on ${d} exceeds the remaining equity.`);
      points.push({ date: d, return: r, traded: entryDays.has(d) });
      balance += pnl;
    }
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  return { name: (options.name || "Imported strategy").slice(0, 120), returns: points, source: daily ? "csv-daily-returns" : "csv-realized-trades", warnings: trades ? ["Trade-list returns use calendar days and recognize P&L on exit dates only; trading-day flags use entry dates. Open-position mark-to-market and intraday drawdowns are unavailable; challenge estimates cannot certify compliance."] : ["Returns are user supplied. Nonzero-return days are used as a trading-day proxy unless a verified trade history is available."] };
}
function validateStrategy(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Each strategy must be an object.");
  const x = input;
  if (typeof x.name !== "string" || !x.name.trim() || x.name.length > 120) throw new Error("A strategy needs a name of 1\u2013120 characters.");
  if (typeof x.symbol !== "string" || !/^([A-Z0-9]{3,12}|[A-Z]{3}\/[A-Z]{3})$/.test(x.symbol)) throw new Error("Invalid strategy symbol.");
  if (typeof x.timeframe !== "string" || !["M1", "M5", "H1", "H4", "D1", "tick"].includes(x.timeframe)) throw new Error("Invalid strategy timeframe.");
  const out = { name: x.name.trim(), symbol: x.symbol, timeframe: x.timeframe };
  if (typeof x.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(x.id)) out.id = x.id;
  if (x.params !== void 0) {
    if (!x.params || typeof x.params !== "object" || Array.isArray(x.params)) throw new Error("Strategy parameters must be an object.");
    const allowed = ["lookback", "atrPeriod", "entryK", "stopS", "targetTP", "maxHold", "costPips", "riskPct", "pipSize", "spreadPips", "slippagePips", "mode", "strategy", "newsWindowMinutes", "initialEquity", "eventType"];
    out.params = {};
    for (const [key, v] of Object.entries(x.params)) {
      if (!allowed.includes(key)) throw new Error(`Unsupported strategy parameter: ${key}`);
      if (typeof v === "number") out.params[key] = finite2(v, key);
      else if (key === "eventType" && typeof v === "string" && /^[A-Za-z0-9 _-]{0,80}$/.test(v)) out.params[key] = v;
      else if (key === "mode" && ["close", "ohlc", "tick"].includes(String(v)) || key === "strategy" && ["breakout", "news"].includes(String(v))) out.params[key] = String(v);
      else throw new Error(`Invalid strategy parameter: ${key}`);
    }
  }
  if (x.returns !== void 0) {
    if (!Array.isArray(x.returns) || !x.returns.length || x.returns.length > MAX_ROWS) throw new Error("Imported strategy returns need 1\u2013100,000 rows.");
    const seen = /* @__PURE__ */ new Set();
    out.returns = x.returns.map((p, i) => {
      if (!p || typeof p !== "object") throw new Error("Invalid return row.");
      const d = date(String(p.date), i + 1), r = finite2(p.return, `Return ${i + 1}`);
      if (r < -1 || seen.has(d)) throw new Error("Duplicate date or return below -100%.");
      seen.add(d);
      if (p.traded !== void 0 && typeof p.traded !== "boolean") throw new Error("Trading-day flags must be boolean.");
      return { date: d, return: r, traded: p.traded ?? r !== 0 };
    }).sort((a, b) => a.date.localeCompare(b.date));
  }
  if (!out.params && !out.returns) throw new Error("A strategy needs parameters or an imported return series.");
  return out;
}
function importStrategiesJSON(json) {
  if (typeof json !== "string" || json.length > 10 * 1024 * 1024) throw new Error("Strategy JSON must be below 10 MB.");
  let value;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("Invalid strategy JSON.");
  }
  const rows = Array.isArray(value) ? value : value?.version === 1 ? value.strategies : null;
  if (!Array.isArray(rows) || rows.length > 100) throw new Error("Expected up to 100 strategies in a version 1 export.");
  return rows.map(validateStrategy);
}
function exportStrategiesJSON(strategies) {
  return JSON.stringify({ version: 1, strategies: strategies.map(validateStrategy) }, null, 2);
}

// lib/quant/ea.ts
function bounded(v, fallback, min, max, label, integer2 = false) {
  const n = v === void 0 ? fallback : Number(v);
  if (!Number.isFinite(n) || n < min || n > max || integer2 && !Number.isInteger(n)) throw new Error(`Invalid ${label}.`);
  return n;
}
function normalize(input) {
  if (!input || !["mt5", "mt4", "ctrader"].includes(input.platform)) throw new Error("Choose MT5, MT4 or cTrader.");
  const symbol2 = String(input.symbol || "").toUpperCase().replace("/", "");
  if (!/^[A-Z0-9]{3,12}$/.test(symbol2)) throw new Error("Invalid export symbol.");
  if (!["M1", "M5", "H1", "H4", "D1"].includes(input.timeframe)) throw new Error("EA exports need a tested M1, M5, H1, H4 or D1 candle timeframe. Tick-only settings cannot be silently converted.");
  const p = input.params || {};
  if (p.strategy && p.strategy !== "breakout") throw new Error("News strategies need an execution-time calendar integration; only tested ATR breakout settings can be exported.");
  if (p.mode && !["close", "ohlc"].includes(p.mode)) throw new Error("Tick-mode strategy export is unavailable. Backtest a candle timeframe first.");
  return {
    platform: input.platform,
    symbol: symbol2,
    tf: input.timeframe,
    n: bounded(p.lookback, 20, 2, 500, "lookback", true),
    a: bounded(p.atrPeriod, 14, 2, 500, "ATR period", true),
    k: bounded(p.entryK, 0.25, 0, 10, "entry ATR"),
    s: bounded(p.stopS, 2, 0.05, 20, "stop ATR"),
    tp: bounded(p.targetTP, 4, 0.05, 40, "target ATR"),
    h: bounded(p.maxHold, 20, 1, 1e4, "max hold", true),
    risk: bounded(p.riskPct, 0.5, 1e-3, 10, "risk percentage"),
    close: p.mode === void 0 || p.mode === "close",
    daily: bounded(input.dailyLossPct, 4, 0.1, 20, "daily guard"),
    max: bounded(input.maxLossPct, 9, 0.1, 50, "maximum guard"),
    balance: bounded(input.initialBalance, 1e4, 1, 1e8, "initial balance")
  };
}
var notes = [
  "Generated source requires compilation and Strategy Tester/demo validation in the target platform; native compilation is not verified by this website.",
  "The signal uses the last completed candle and orders execute on the first tick of the next candle. Historical close-only fills and fixed research costs do not reproduce broker spreads, commissions, slippage or gaps.",
  "Set the exact broker symbol, tested timeframe and initial account balance. At first attachment, supply the verified start-of-day equity or the bot waits for the next Prague trading day.",
  "Guards measure total account equity and close positions owned by this bot only. Other trading can breach the account limits. Daily and maximum breaches latch; restart does not intentionally reset them.",
  "Use desktop execution for persistent guards. Confirm time, costs, volume limits and rules on the broker/demo account before any challenge."
];
function generateEA(input) {
  const p = normalize(input), ext = p.platform === "mt5" ? "mq5" : p.platform === "mt4" ? "mq4" : "cs";
  return { filename: `FynxQuant_${p.symbol}_${p.tf}.${ext}`, mime: "text/plain;charset=utf-8", source: p.platform === "ctrader" ? csharp(p) : mql(p), notes: [...notes] };
}
function mql(p) {
  const five = p.platform === "mt5";
  return `// FYNX Quant Analyst - ATR breakout, ${p.symbol} ${p.tf}
// Adapted from the approved reference genEa() with strict completed-bar signals,
// risk rounded DOWN, persistent equity guards and explicit chart validation.
// Educational research source. Compile and test on a demo first.
// Costs are broker actuals; the web backtest's fixed cost is not an execution promise.
#property strict
${five ? "#include <Trade/Trade.mqh>\nCTrade trade;" : ""}
input string InpSymbol = "${p.symbol}"; // Change only for your broker's equivalent symbol suffix.
input ENUM_TIMEFRAMES InpTimeframe = PERIOD_${p.tf};
input int InpLookback = ${p.n};
input int InpAtrPeriod = ${p.a};
input double InpEntryAtr = ${p.k};
input double InpStopAtr = ${p.s};
input double InpTargetAtr = ${p.tp};
input int InpMaxHold = ${p.h};
input double InpRiskPct = ${p.risk};
input bool InpCloseAtr = ${p.close};
input double InpInitBal = ${p.balance};
input double InpDailyStop = ${p.daily};
input double InpMaxStop = ${p.max};
input double InpFirstDayEquity = 0; // Actual equity at Prague midnight; 0 waits until next day.
input int InpSlippagePoints = 20; // Broker points; set and retest for this instrument.
input int InpMagic = 770101;
// Strategy Tester must set its simulated server offset correctly for Prague guards.
input int InpTesterServerUtcOffset = 0;
datetime lastBar=0; string guardKey=""; double dayStartEq=0; int dayId=0;
bool dailyLocked=false, maxLocked=false, waitingForDay=false;
double Equity(){return ${five ? "AccountInfoDouble(ACCOUNT_EQUITY)" : "AccountEquity()"};}
double Balance(){return ${five ? "AccountInfoDouble(ACCOUNT_BALANCE)" : "AccountBalance()"};}
int PragueDay(){
  datetime utc=${five ? "MQLInfoInteger(MQL_TESTER)" : "IsTesting()"} ? TimeCurrent()-InpTesterServerUtcOffset*3600 : TimeGMT();
  MqlDateTime d; TimeToStruct(utc,d);
  MqlDateTime end; ZeroMemory(end); end.year=d.year; end.mon=3; end.day=31; end.hour=1;
  datetime march=StructToTime(end); TimeToStruct(march,end); march-=end.day_of_week*86400;
  ZeroMemory(end); end.year=d.year; end.mon=10; end.day=31; end.hour=1;
  datetime october=StructToTime(end); TimeToStruct(october,end); october-=end.day_of_week*86400;
  TimeToStruct(utc+((utc>=march && utc<october)?7200:3600),d);
  return d.year*10000+d.mon*100+d.day;
}
void SaveGuards(){
  // A stale chart shutdown must never clear another instance's maximum breach.
  if(maxLocked)GlobalVariableSet(guardKey+"max",1);
  else if(!GlobalVariableCheck(guardKey+"max"))GlobalVariableSet(guardKey+"max",0);
  if(GlobalVariableGet(guardKey+"max")>0)maxLocked=true;
  int storedDay=GlobalVariableCheck(guardKey+"day")?(int)GlobalVariableGet(guardKey+"day"):0;
  if(storedDay>dayId){GlobalVariablesFlush();return;}
  if(storedDay==dayId&&GlobalVariableGet(guardKey+"daily")>0)dailyLocked=true;
  GlobalVariableSet(guardKey+"day",dayId); GlobalVariableSet(guardKey+"eq",dayStartEq);
  GlobalVariableSet(guardKey+"daily",dailyLocked?1:0);
  GlobalVariableSet(guardKey+"wait",waitingForDay?1:0); GlobalVariablesFlush();
}
void CloseOwned(){
${five ? `  for(int i=PositionsTotal()-1;i>=0;i--){
    ulong ticket=PositionGetTicket(i); if(ticket==0 || PositionGetInteger(POSITION_MAGIC)!=InpMagic)continue;
    if(!trade.PositionClose(ticket))Print("Guard close failed: ",trade.ResultRetcodeDescription());
  }` : `  for(int i=OrdersTotal()-1;i>=0;i--){
    if(!OrderSelect(i,SELECT_BY_POS,MODE_TRADES)||OrderMagicNumber()!=InpMagic)continue;
    int type=OrderType(); if(type!=OP_BUY&&type!=OP_SELL)continue;
    double price=MarketInfo(OrderSymbol(),type==OP_BUY?MODE_BID:MODE_ASK);
    if(!OrderClose(OrderTicket(),OrderLots(),price,InpSlippagePoints,clrNONE))Print("Guard close failed: ",GetLastError());
  }`}
}
bool Guard(){
  int today=PragueDay();
  if(GlobalVariableCheck(guardKey+"max")&&GlobalVariableGet(guardKey+"max")>0)maxLocked=true;
  if(today!=dayId){
    dayId=today;
    if(GlobalVariableCheck(guardKey+"day")&&(int)GlobalVariableGet(guardKey+"day")==today){dayStartEq=GlobalVariableGet(guardKey+"eq");dailyLocked=GlobalVariableGet(guardKey+"daily")>0;waitingForDay=GlobalVariableGet(guardKey+"wait")>0;}
    else{dayStartEq=MathMax(Balance(),Equity());dailyLocked=false;waitingForDay=false;SaveGuards();}
  }
  // Persisted locks are shared by this magic number on the account.
  if(GlobalVariableCheck(guardKey+"max")&&GlobalVariableGet(guardKey+"max")>0)maxLocked=true;
  if(GlobalVariableCheck(guardKey+"daily")&&GlobalVariableGet(guardKey+"daily")>0)dailyLocked=true;
  double equity=Equity();
  if(equity<=InpInitBal*(1-InpMaxStop/100.0)){maxLocked=true;SaveGuards();}
  if(!waitingForDay && dayStartEq-equity>=InpInitBal*InpDailyStop/100.0){dailyLocked=true;SaveGuards();}
  if(maxLocked||dailyLocked){CloseOwned();return false;}
  return !waitingForDay;
}
double Atr(){
  int count=iBars(_Symbol,InpTimeframe); if(count<InpAtrPeriod+2)return 0;
  if(InpCloseAtr){double sum=0;for(int i=1;i<=InpAtrPeriod;i++)sum+=MathAbs(iClose(_Symbol,InpTimeframe,i)-iClose(_Symbol,InpTimeframe,i+1));return sum/InpAtrPeriod;}
  // Wilder seed followed by recursive true-range smoothing, using completed bars only.
  double atr=0;int observations=0;
  for(int i=count-2;i>=1;i--){double prev=iClose(_Symbol,InpTimeframe,i+1),hi=iHigh(_Symbol,InpTimeframe,i),lo=iLow(_Symbol,InpTimeframe,i);
    double tr=MathMax(hi-lo,MathMax(MathAbs(hi-prev),MathAbs(lo-prev)));
    if(observations<InpAtrPeriod){atr+=tr;observations++;if(observations==InpAtrPeriod)atr/=InpAtrPeriod;}
    else atr=(atr*(InpAtrPeriod-1)+tr)/InpAtrPeriod;
  }return observations>=InpAtrPeriod?atr:0;
}
bool HasSymbolPosition(){
${five ? `  for(int i=PositionsTotal()-1;i>=0;i--){ulong ticket=PositionGetTicket(i);if(ticket>0&&PositionGetString(POSITION_SYMBOL)==_Symbol)return true;}` : `  for(int i=OrdersTotal()-1;i>=0;i--)if(OrderSelect(i,SELECT_BY_POS,MODE_TRADES)&&OrderSymbol()==_Symbol&&(OrderType()==OP_BUY||OrderType()==OP_SELL))return true;`}
  return false; // Do not merge with another EA/manual position on this symbol.
}
bool ManageHold(){bool owned=false;
${five ? `  for(int i=PositionsTotal()-1;i>=0;i--){ulong ticket=PositionGetTicket(i);
    if(ticket==0||PositionGetString(POSITION_SYMBOL)!=_Symbol||PositionGetInteger(POSITION_MAGIC)!=InpMagic)continue;
    owned=true;int held=iBarShift(_Symbol,InpTimeframe,(datetime)PositionGetInteger(POSITION_TIME),false);
    if(held>=InpMaxHold&&!trade.PositionClose(ticket))Print("Time exit failed: ",trade.ResultRetcodeDescription());
  }` : `  for(int i=OrdersTotal()-1;i>=0;i--){
    if(!OrderSelect(i,SELECT_BY_POS,MODE_TRADES)||OrderSymbol()!=_Symbol||OrderMagicNumber()!=InpMagic||(OrderType()!=OP_BUY&&OrderType()!=OP_SELL))continue;
    owned=true;int held=iBarShift(_Symbol,InpTimeframe,OrderOpenTime(),false);
    if(held>=InpMaxHold){RefreshRates();if(!OrderClose(OrderTicket(),OrderLots(),OrderType()==OP_BUY?Bid:Ask,InpSlippagePoints,clrNONE))Print("Time exit failed: ",GetLastError());}
  }`}
  return owned;
}
double LotsFor(double stopDistance){
  double tickSize=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
  double tickValue=${five ? "SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE_LOSS)" : "MarketInfo(_Symbol,MODE_TICKVALUE)"};
  double step=${five ? "SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP)" : "MarketInfo(_Symbol,MODE_LOTSTEP)"};
  double minimum=${five ? "SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN)" : "MarketInfo(_Symbol,MODE_MINLOT)"};
  double maximum=${five ? "SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX)" : "MarketInfo(_Symbol,MODE_MAXLOT)"};
  if(tickSize<=0||tickValue<=0||step<=0||stopDistance<=0)return 0;
  double lots=MathFloor((Equity()*InpRiskPct/100.0)/(stopDistance/tickSize*tickValue)/step)*step;
  // Never round UP to minimum volume; that could exceed the tested risk budget.
  if(lots<minimum)return 0;
  return NormalizeDouble(MathMin(lots,maximum),8);
}
int OnInit(){
  if(_Symbol!=InpSymbol||Period()!=InpTimeframe){Print("Attach to the exact tested broker symbol and timeframe.");return INIT_PARAMETERS_INCORRECT;}
  if(InpLookback<2||InpAtrPeriod<2||InpStopAtr<=0||InpTargetAtr<=0||InpRiskPct<=0||InpRiskPct>10||InpInitBal<=0||InpDailyStop<=0||InpMaxStop<=0||InpMaxHold<1)return INIT_PARAMETERS_INCORRECT;
${five ? "  trade.SetExpertMagicNumber(InpMagic);trade.SetDeviationInPoints(InpSlippagePoints);trade.SetTypeFillingBySymbol(_Symbol);" : ""}
  guardKey="FQ"+IntegerToString(${five ? "AccountInfoInteger(ACCOUNT_LOGIN)" : "AccountNumber()"})+"_"+IntegerToString(InpMagic)+"_";
  dayId=PragueDay();maxLocked=GlobalVariableCheck(guardKey+"max")&&GlobalVariableGet(guardKey+"max")>0;
  if(GlobalVariableCheck(guardKey+"day")&&(int)GlobalVariableGet(guardKey+"day")==dayId){
    dayStartEq=GlobalVariableGet(guardKey+"eq");dailyLocked=GlobalVariableGet(guardKey+"daily")>0;waitingForDay=GlobalVariableGet(guardKey+"wait")>0;
  }else{dayStartEq=InpFirstDayEquity;waitingForDay=InpFirstDayEquity<=0;dailyLocked=false;}
  SaveGuards();lastBar=iTime(_Symbol,InpTimeframe,0);EventSetTimer(1);
  if(waitingForDay)Print("Waiting for next Prague trading day: first-day starting equity was not supplied.");
  return INIT_SUCCEEDED;
}
void OnDeinit(const int reason){SaveGuards();EventKillTimer();}
void OnTimer(){Guard();}
void OnTick(){
  if(!Guard())return;
  datetime bar=iTime(_Symbol,InpTimeframe,0);if(bar<=0||bar==lastBar)return;lastBar=bar;
  if(ManageHold()||HasSymbolPosition())return;
  if(iBars(_Symbol,InpTimeframe)<MathMax(InpLookback,InpAtrPeriod)+3)return;
  double atr=Atr(),close=iClose(_Symbol,InpTimeframe,1);if(atr<=0||close<=0)return;
  double high=-DBL_MAX,low=DBL_MAX;
  for(int i=2;i<InpLookback+2;i++){double c=iClose(_Symbol,InpTimeframe,i);high=MathMax(high,c);low=MathMin(low,c);}
  int direction=close>high+InpEntryAtr*atr?1:(close<low-InpEntryAtr*atr?-1:0);if(direction==0)return;
  double stop=InpStopAtr*atr,target=InpTargetAtr*atr,lots=LotsFor(stop);if(lots<=0)return;
  double minStop=${five ? "(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*_Point" : "MarketInfo(_Symbol,MODE_STOPLEVEL)*Point"};
  if(stop<minStop||target<minStop){Print("Broker stop-distance restriction: skipped.");return;}
${five ? `  MqlTick quote;if(!SymbolInfoTick(_Symbol,quote))return;
  double price=direction>0?quote.ask:quote.bid;
  double sl=NormalizeDouble(price-direction*stop,_Digits),tp=NormalizeDouble(price+direction*target,_Digits);
  bool ok=direction>0?trade.Buy(lots,_Symbol,0,sl,tp,"FynxQuant"):trade.Sell(lots,_Symbol,0,sl,tp,"FynxQuant");
  if(!ok)Print("Entry failed: ",trade.ResultRetcodeDescription());` : `  RefreshRates();double price=direction>0?Ask:Bid;
  double sl=NormalizeDouble(price-direction*stop,Digits),tp=NormalizeDouble(price+direction*target,Digits);
  int type=direction>0?OP_BUY:OP_SELL;
  if(AccountFreeMarginCheck(_Symbol,type,lots)<=0){Print("Insufficient free margin: skipped.");return;}
  int ticket=OrderSend(_Symbol,type,lots,price,InpSlippagePoints,sl,tp,"FynxQuant",InpMagic,0,clrNONE);
  if(ticket<0)Print("Entry failed: ",GetLastError());`}
}
`;
}
function csharp(p) {
  const tf = { M1: "Minute", M5: "Minute5", H1: "Hour", H4: "Hour4", D1: "Daily" }[p.tf];
  return `// FYNX Quant Analyst - ${p.symbol} ${p.tf} ATR breakout.
// Completed-candle signals; next-bar market execution. Actual broker costs apply.
// Compile in cTrader Algo, backtest, then demo before using a challenge.
// Persistent guard state is intended for desktop, not cTrader Cloud memory-only storage.
using System;
using System.Globalization;
using System.Linq;
using cAlgo.API;
using cAlgo.API.Internals;
namespace cAlgo.Robots
{
  [Robot(TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
  public class FynxQuantATR : Robot
  {
    [Parameter("Tested symbol", DefaultValue = "${p.symbol}")] public string TestedSymbol { get; set; }
    [Parameter("Lookback", DefaultValue = ${p.n}, MinValue = 2)] public int Lookback { get; set; }
    [Parameter("ATR period", DefaultValue = ${p.a}, MinValue = 2)] public int AtrPeriod { get; set; }
    [Parameter("Entry ATR", DefaultValue = ${p.k}, MinValue = 0)] public double EntryAtr { get; set; }
    [Parameter("Stop ATR", DefaultValue = ${p.s}, MinValue = 0.05)] public double StopAtr { get; set; }
    [Parameter("Target ATR", DefaultValue = ${p.tp}, MinValue = 0.05)] public double TargetAtr { get; set; }
    [Parameter("Max hold bars", DefaultValue = ${p.h}, MinValue = 1)] public int MaxHold { get; set; }
    [Parameter("Risk %", DefaultValue = ${p.risk}, MinValue = 0.001, MaxValue = 10)] public double RiskPct { get; set; }
    [Parameter("Close-only ATR", DefaultValue = ${p.close})] public bool CloseAtr { get; set; }
    [Parameter("Initial balance", DefaultValue = ${p.balance}, MinValue = 1)] public double InitialBalance { get; set; }
    [Parameter("Daily loss guard %", DefaultValue = ${p.daily}, MinValue = 0.1)] public double DailyLossPct { get; set; }
    [Parameter("Max loss guard %", DefaultValue = ${p.max}, MinValue = 0.1)] public double MaxLossPct { get; set; }
    [Parameter("First-day midnight equity (0 waits)", DefaultValue = 0)] public double FirstDayEquity { get; set; }
    [Parameter("Strategy label", DefaultValue = "FynxQuant770101")] public string Label { get; set; }
    private int _day; private double _dayStart; private bool _dailyLocked, _maxLocked, _waiting; private string _key;
    private int PragueDay()
    {
      var utc=Server.Time; var march=new DateTime(utc.Year,3,31,1,0,0,DateTimeKind.Utc);
      march=march.AddDays(-(int)march.DayOfWeek); var october=new DateTime(utc.Year,10,31,1,0,0,DateTimeKind.Utc);
      october=october.AddDays(-(int)october.DayOfWeek);var local=utc.AddHours(utc>=march&&utc<october?2:1);
      return local.Year*10000+local.Month*100+local.Day;
    }
    private void Save()
    {
      LocalStorage.SetString(_key, string.Join("|", _day.ToString(), _dayStart.ToString("R",CultureInfo.InvariantCulture),_dailyLocked?"1":"0",_maxLocked?"1":"0",_waiting?"1":"0"),LocalStorageScope.Instance);
      LocalStorage.Flush(LocalStorageScope.Instance);
    }
    protected override void OnStart()
    {
      if(SymbolName!=TestedSymbol||Bars.TimeFrame!=TimeFrame.${tf}){Print("Attach to the tested symbol and ${p.tf} timeframe.");Stop();return;}
      _key="FynxGuard "+Account.Number.ToString();_day=PragueDay();_dayStart=FirstDayEquity;_waiting=FirstDayEquity<=0;
      var saved=LocalStorage.GetString(_key,LocalStorageScope.Instance);
      if(!string.IsNullOrEmpty(saved))
      {
        var v=saved.Split('|');int savedDay;double savedEquity;
        if(v.Length!=5||!int.TryParse(v[0],out savedDay)||!double.TryParse(v[1],NumberStyles.Float,CultureInfo.InvariantCulture,out savedEquity)){Print("Invalid persisted guard state; stopping.");Stop();return;}
        _maxLocked=v[3]=="1";
        if(savedDay==_day){_dayStart=savedEquity;_dailyLocked=v[2]=="1";_waiting=v[4]=="1";}
      }
      Save();Timer.Start(TimeSpan.FromSeconds(1));
      if(_waiting)Print("Waiting for next Prague day; enter verified start-of-day equity to start today.");
    }
    private bool Guard()
    {
      int today=PragueDay();if(today!=_day){_day=today;_dayStart=Math.Max(Account.Balance,Account.Equity);_dailyLocked=false;_waiting=false;Save();}
      if(Account.Equity<=InitialBalance*(1-MaxLossPct/100)){_maxLocked=true;Save();}
      if(!_waiting&&_dayStart-Account.Equity>=InitialBalance*DailyLossPct/100){_dailyLocked=true;Save();}
      if(_maxLocked||_dailyLocked)
      {
        foreach(var position in Positions.Where(x=>x.Label==Label).ToArray()){var result=ClosePosition(position);if(!result.IsSuccessful)Print("Guard close failed: {0}",result.Error);}
        return false;
      }
      return !_waiting;
    }
    protected override void OnTimer(){Guard();}
    protected override void OnTick(){Guard();}
    protected override void OnStop(){if(!string.IsNullOrEmpty(_key))Save();}
    private double Atr(int last)
    {
      if(CloseAtr){double sum=0;for(int i=last-AtrPeriod+1;i<=last;i++)sum+=Math.Abs(Bars.ClosePrices[i]-Bars.ClosePrices[i-1]);return sum/AtrPeriod;}
      double atr=0;int observations=0;
      for(int i=1;i<=last;i++)
      {
        double prev=Bars.ClosePrices[i-1];double tr=Math.Max(Bars.HighPrices[i]-Bars.LowPrices[i],Math.Max(Math.Abs(Bars.HighPrices[i]-prev),Math.Abs(Bars.LowPrices[i]-prev)));
        if(observations<AtrPeriod){atr+=tr;observations++;if(observations==AtrPeriod)atr/=AtrPeriod;}
        else atr=(atr*(AtrPeriod-1)+tr)/AtrPeriod;
      }
      return observations>=AtrPeriod?atr:0;
    }
    protected override void OnBar()
    {
      if(!Guard())return;
      bool owned=false;
      foreach(var position in Positions.FindAll(Label,SymbolName))
      {
        owned=true;int entry=Bars.OpenTimes.GetIndexByTime(position.EntryTime);
        if(entry>=0&&Bars.Count-1-entry>=MaxHold){var result=ClosePosition(position);if(!result.IsSuccessful)Print("Time exit failed: {0}",result.Error);}
      }
      if(owned||Positions.Any(x=>x.SymbolName==SymbolName))return;
      int last=Bars.Count-2;if(last<Math.Max(Lookback,AtrPeriod)+1)return;
      double atr=Atr(last);if(atr<=0)return;
      double high=double.MinValue,low=double.MaxValue;
      for(int i=last-Lookback;i<last;i++){high=Math.Max(high,Bars.ClosePrices[i]);low=Math.Min(low,Bars.ClosePrices[i]);}
      double close=Bars.ClosePrices[last];int direction=close>high+EntryAtr*atr?1:(close<low-EntryAtr*atr?-1:0);if(direction==0)return;
      double stopPips=StopAtr*atr/Symbol.PipSize,targetPips=TargetAtr*atr/Symbol.PipSize;
      double volume=Symbol.VolumeForFixedRisk(Account.Equity*RiskPct/100,stopPips,RoundingMode.Down);
      volume=Symbol.NormalizeVolumeInUnits(Math.Min(volume,Symbol.VolumeInUnitsMax),RoundingMode.Down);
      if(volume<Symbol.VolumeInUnitsMin)return;
      var resultEntry=ExecuteMarketOrder(direction>0?TradeType.Buy:TradeType.Sell,SymbolName,volume,Label,stopPips,targetPips);
      if(!resultEntry.IsSuccessful)Print("Entry failed: {0}",resultEntry.Error);
    }
  }
}
`;
}

// lib/quant/stream.ts
function createBacktestStream(input = {}) {
  const p = normalizeParams({ ...input, mode: "tick" });
  if (input.mode && input.mode !== "tick") throw new Error("Streaming execution requires tick-backed M1 bars.");
  const start = Math.max(p.startIndex || 0, p.lookback + p.atrPeriod + 1), commission = p.costPips * p.pipSize / 2, slip = p.slippagePips * p.pipSize;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: p.dayTimezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dayKey = (t) => p.dayTimezone === "UTC" ? new Date(timeMs(t)).toISOString().slice(0, 10) : formatter.format(timeMs(t));
  let pendingBar = null, previousTime = -Infinity, previousClose = NaN, index = -1, atr = NaN, atrSum = 0;
  let balance = p.initialEquity, equity = balance, ticksProcessed = 0, finished = false, result = null;
  const capture = new IntradayCapture(p.captureIntraday === true, p.dayTimezone, p.maxIntradayMarks, p.captureAfterDays);
  const history = [], trades = [];
  const state = { position: null, pending: null };
  const days = [];
  let day = null;
  const events = (p.events || []).filter((e) => e.timing !== "estimated" && e.impact === "high" && (!p.eventType || p.eventType === "all" || e.type === p.eventType || e.name === p.eventType)).sort((a, b) => timeMs(a.time) - timeMs(b.time));
  if (p.strategy === "news" && !events.length) throw new Error("News strategies require actual high-impact economic-calendar events.");
  let eventCursor = 0;
  const observations = [];
  const mark = (price) => state.position ? balance + (price - state.position.entry) * state.position.side * state.position.units : balance;
  const enter = (side, vol, bar, tick, news = false) => {
    if (!(vol > 0 && equity > 0)) return;
    const entry = (side > 0 ? tick.ask : tick.bid) + side * slip, risk = equity * p.riskPct / 100, units = risk / (p.stopS * vol);
    state.position = { side, entry, stop: entry - side * p.stopS * vol, target: entry + side * p.targetTP * vol, units, risk, entryIndex: index, entryDate: new Date(timeMs(tick.time)).toISOString(), entryCommission: commission * units };
    balance -= commission * units;
    day.traded = true;
  };
  const exit = (price, reason, time) => {
    const pos = state.position;
    if (!pos) return;
    const pnl = (price - pos.entry) * pos.side * pos.units - (pos.entryCommission + commission * pos.units);
    balance += (price - pos.entry) * pos.side * pos.units - commission * pos.units;
    trades.push({ entryDate: pos.entryDate, exitDate: new Date(timeMs(time)).toISOString(), entryPrice: pos.entry, exitPrice: price, side: pos.side > 0 ? "long" : "short", R: pnl / pos.risk, pnl, reason, entryIndex: pos.entryIndex, exitIndex: index, riskAmount: pos.risk });
    state.position = null;
    equity = balance;
    day.minEquity = Math.min(day.minEquity, equity);
  };
  const validate = (bar) => {
    const t = timeMs(bar.time);
    if (t <= previousTime) throw new Error("Streamed M1 bars must have unique, increasing timestamps.");
    for (const key of ["open", "high", "low", "close"]) finite(bar[key], key, Number.MIN_VALUE, 1e12);
    if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close) || bar.low > bar.high) throw new Error("Invalid OHLC range in streamed bar.");
    if (!Array.isArray(bar.ticks) || !bar.ticks.length) throw new Error("Every streamed bar requires real bid/ask ticks.");
    let last = -Infinity;
    for (const tick of bar.ticks) {
      const tt = timeMs(tick.time);
      if (tt < last || tt < t || tt >= t + 6e4) throw new Error("Tick timestamps must be ordered and inside their M1 bar.");
      last = tt;
      finite(tick.bid, "Bid", Number.MIN_VALUE, 1e12);
      finite(tick.ask, "Ask", tick.bid, 1e12);
    }
    previousTime = t;
  };
  const observeNews = (tick, bar, previousATR, allowEntry) => {
    if (p.strategy !== "news") return;
    const tt = timeMs(tick.time);
    while (eventCursor < events.length && timeMs(events[eventCursor].time) <= tt) {
      const release = timeMs(events[eventCursor++].time);
      if (tt - release <= 6e4) observations.push({ release, end: release + p.newsWindowMinutes * 6e4, mid: (tick.bid + tick.ask) / 2 });
    }
    for (let oi = observations.length - 1; oi >= 0; oi--) {
      const observation = observations[oi];
      if (tt < observation.end) continue;
      observations.splice(oi, 1);
      const move = (tick.bid + tick.ask) / 2 - observation.mid;
      if (allowEntry && !state.position && tt - observation.end <= 6e4 && previousATR > 0 && Math.abs(move) > p.entryK * previousATR) enter(Math.sign(move), previousATR, bar, tick, true);
    }
  };
  const process = (bar, last) => {
    index++;
    const previousATR = atr, tr = index === 0 ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
    if (index < p.atrPeriod) atrSum += tr;
    if (index === p.atrPeriod - 1) atr = atrSum / p.atrPeriod;
    else if (index >= p.atrPeriod) atr = (atr * (p.atrPeriod - 1) + tr) / p.atrPeriod;
    previousClose = bar.close;
    if (index >= start) {
      const date2 = dayKey(bar.time);
      if (!day || day.date !== date2) {
        day = { date: date2, startEquity: equity, startBalance: balance, minEquity: equity, endEquity: equity, endBalance: balance, traded: false, flat: !state.position, complete: p.dayTimezone === "Europe/Prague" };
        days.push(day);
        capture.begin(date2, timeMs(bar.time), equity, balance);
      }
      if (dayKey(bar.ticks[bar.ticks.length - 1].time) !== date2) day.complete = false;
      if (state.pending && !state.position) {
        enter(state.pending.side, state.pending.atr, bar, bar.ticks[0]);
        state.pending = null;
      }
      for (const tick of bar.ticks) {
        ticksProcessed++;
        const tt = timeMs(tick.time);
        observeNews(tick, bar, previousATR, !last);
        if (!state.position) {
          capture.record(date2, tt, balance, balance, true);
          continue;
        }
        const px = (state.position.side > 0 ? tick.bid : tick.ask) - state.position.side * slip;
        day.minEquity = Math.min(day.minEquity, mark(px));
        if ((px - state.position.stop) * state.position.side <= 0) exit(px, "stop", tick.time);
        else if ((px - state.position.target) * state.position.side >= 0) exit(state.position.target - state.position.side * slip, "target", tick.time);
        capture.record(date2, tt, state.position ? mark(px) : balance, balance, !state.position);
      }
      const lastTick = bar.ticks[bar.ticks.length - 1];
      const closingPrice = () => state.position ? (state.position.side > 0 ? lastTick.bid : lastTick.ask) - state.position.side * slip : bar.close;
      if (state.position && (index - state.position.entryIndex + 1 >= p.maxHold || last)) exit(closingPrice(), last ? "last" : "time", lastTick.time);
      equity = state.position ? mark(closingPrice()) : balance;
      day.minEquity = Math.min(day.minEquity, equity);
      const justExited = trades.length && trades[trades.length - 1].exitIndex === index;
      if (p.strategy === "breakout" && !last && !state.position && !state.pending && !justExited && equity > 0 && atr > 0 && history.length >= p.lookback) {
        const range = history.slice(-p.lookback), high = Math.max(...range), low = Math.min(...range), side = bar.close > high + p.entryK * atr ? 1 : bar.close < low - p.entryK * atr ? -1 : 0;
        if (side) state.pending = { side, atr };
      }
      if (!Number.isFinite(equity) || equity < 0) {
        equity = 0;
        balance = 0;
        state.position = null;
        state.pending = null;
      }
      day.endEquity = equity;
      day.endBalance = balance;
      day.flat = !state.position;
      day.minEquity = Math.min(day.minEquity, equity);
      capture.record(date2, timeMs(lastTick.time), equity, balance, !state.position);
      capture.cover(date2, timeMs(bar.time) + 6e4, day.complete);
    } else {
      for (const tick of bar.ticks) {
        ticksProcessed++;
        observeNews(tick, bar, previousATR, false);
      }
    }
    history.push(bar.close);
    if (history.length > p.lookback) history.shift();
  };
  return {
    push(bars) {
      if (finished) throw new Error("The stream is already finished.");
      if (!Array.isArray(bars) || bars.length > 1e5) throw new Error("Push at most 100,000 M1 bars per streaming batch.");
      for (const bar of bars) {
        validate(bar);
        if (pendingBar) process(pendingBar, false);
        pendingBar = bar;
      }
    },
    snapshot() {
      return { barsProcessed: index + 1, ticksProcessed, lastTime: pendingBar ? new Date(timeMs(pendingBar.time)).toISOString() : null, openPosition: !!state.position, retainedBars: history.length + (pendingBar ? 1 : 0) };
    },
    finish() {
      if (result) return result;
      if (finished) throw new Error("The stream failed before completion.");
      finished = true;
      if (pendingBar) {
        process(pendingBar, true);
        pendingBar = null;
      }
      if (index < start + 1) throw new Error(`Not enough streamed bars; at least ${start + 2} are needed.`);
      const dailyReturns = days.map((d) => ({ date: d.date, return: d.startEquity > 0 ? d.endEquity / d.startEquity - 1 : 0, traded: d.traded, flat: d.flat, intradayMin: d.startEquity > 0 ? Math.max(-1, d.minEquity / d.startEquity - 1) : 0, intradayComplete: d.complete && (!capture.enabled || capture.path(d.date)?.complete === true), intraday: capture.path(d.date), dayTimezone: p.dayTimezone, startBalanceRatio: d.startEquity > 0 ? d.startBalance / d.startEquity : 1, endBalanceRatio: d.endEquity > 0 ? d.endBalance / d.endEquity : 1 }));
      result = { equity: days.map((d) => ({ date: d.date, equity: d.endEquity })), dailyReturns, trades, stats: statistics(dailyReturns, trades, p.initialEquity), params: p, notes: ["Streamed M1 bars with original bid/ask ticks. Positions and Wilder ATR continue across archive partitions; only the final bar forces an exit.", "Signals use completed M1 closes and enter on the next bar; news entries use the first recorded quote after the release observation window.", "Fixed units are sized from entry equity; reported R and equity include configured fees and slippage.", `Daily equity and observed minima use ${p.dayTimezone} boundaries. Missing archive intervals must be disclosed by the data service.`, capture.enabled ? capture.exceeded ? "Intraday timestamp capture reached its bounded budget; incomplete paths retain the FTMO buffer." : "Actual tick equity/balance timestamps are captured for synchronized portfolio research." : "Timestamp capture is off to keep decade archive execution bounded; daily minima remain available."] };
      return result;
    }
  };
}
async function backtestStreaming(source, params = {}) {
  const stream = createBacktestStream(params);
  for await (const batch of source) stream.push(batch);
  return stream.finish();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_PARAMS,
  FTMO_ACCOUNT_SIZES,
  FTMO_RULES,
  QUANT_STEPS,
  SYMBOLS,
  backtest,
  backtestStreaming,
  barIntervalMs,
  breakoutSignal,
  closeATR,
  correlation,
  createBacktestStream,
  createCommandParser,
  equityFromReturns,
  evaluatePhase,
  eventStudy,
  exportStrategiesJSON,
  finite,
  ftmo,
  generateEA,
  importReturnsCSV,
  importStrategiesJSON,
  integer,
  keywordParser,
  lowerBound,
  mean,
  monteCarlo,
  mulberry32,
  normalizeParams,
  optimize,
  parseAsk,
  portfolio,
  quantile,
  referenceBacktest,
  simulateFTMO,
  stationaryIndices,
  statistics,
  timeMs,
  validateBars,
  validateReturns,
  validateStrategy,
  variance,
  wilderATR
});
