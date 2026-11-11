(() => {
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

  // lib/quant/analytics.ts
  function optimize(bars, params = {}, options = {}, onProgress) {
    if (params.strategy === "mean-reversion") throw new Error("Mean-reversion optimization requires a Z-score grid; the entry-ATR grid does not apply.");
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
      const date = new Date(timeMs(e.time)).toISOString().slice(0, 10), type = e.type || e.name;
      if (!byDay.has(date)) byDay.set(date, /* @__PURE__ */ new Set());
      byDay.get(date).add(type);
    }
    const eventMoves = [], normalMoves = [], types = /* @__PURE__ */ new Map(), times = bars.map((b) => timeMs(b.time));
    const addEvent = (type, move) => {
      if (!types.has(type)) types.set(type, []);
      types.get(type).push(move);
    };
    if (mode === "daily") {
      for (let i = 1; i < bars.length; i++) {
        const date = new Date(times[i]).toISOString().slice(0, 10), move = Math.abs(bars[i].close / bars[i - 1].close - 1), dayTypes = byDay.get(date);
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
      for (const date of observedDays) if (!byDay.has(date)) {
        for (const offset of releaseTimes) {
          const move = observation(timeMs(date) + offset);
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

  // lib/quant/worker.ts
  self.onmessage = ({ data }) => {
    const { id, action, payload = {} } = data;
    const progress = (value) => self.postMessage({ id, progress: value });
    try {
      let result;
      if (action === "backtest") result = backtest(payload.bars, payload.params);
      else if (action === "optimize") result = optimize(payload.bars, payload.params, payload.options, progress);
      else if (action === "portfolio") result = portfolio(payload.sleeves, payload.options);
      else if (action === "montecarlo") result = monteCarlo(payload.returns, payload.options, progress);
      else if (action === "ftmo") result = ftmo(payload.returns, payload.options, progress);
      else if (action === "eventstudy") result = eventStudy(payload.bars, payload.events, payload.options);
      else throw new Error("Unknown calculation");
      self.postMessage({ id, result });
    } catch (error) {
      self.postMessage({ id, error: error instanceof Error ? error.message : "Calculation failed" });
    }
  };
})();
