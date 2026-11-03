'use strict';
const { Store } = require('./store.cjs');
const { partitionPlan } = require('./history-plan.cjs');
async function context(history) {
  if (!history || !/^[A-Z0-9]+$/.test(history.symbol)) throw new Error('Invalid stored history job.');
  const store = new Store(history.dataDir), manifest = await store.read(`history/${history.symbol}/TICK/manifest`);
  if (!manifest || manifest.updatedAt !== history.manifestRevision) throw new Error('Stored history changed while this job was queued. Resubmit against the updated data.');
  return { store, manifest, plan: partitionPlan(manifest, history.from, history.to), history };
}
/** One compressed partition plus one minute of ticks is resident; arbitrary file cuts preserve bars. */
async function* recordedBars(ctx, progress = () => {}) {
  let bar = null, batch = [];
  for (let index = 0; index < ctx.plan.length; index++) {
    const part = ctx.plan[index], data = await ctx.store.read(part.key); if (!data || !Array.isArray(data.rows)) throw new Error('A recorded history partition is missing. Resume the import before retrying.');
    for (const tick of data.rows) {
      if (tick.time < part.readFrom || tick.time >= part.readTo) continue;
      ctx.actualFrom ||= tick.time; ctx.actualTo = tick.time; const minute = Math.floor(Date.parse(tick.time) / 60000) * 60000;
      if (bar && Date.parse(bar.time) !== minute) { batch.push(bar); bar = null; if (batch.length >= 128) { yield batch; batch = []; } }
      if (!bar) bar = { time: new Date(minute).toISOString(), open: tick.bid, high: tick.bid, low: tick.bid, close: tick.bid, ticks: [] };
      bar.high = Math.max(bar.high, tick.bid); bar.low = Math.min(bar.low, tick.bid); bar.close = tick.bid; bar.ticks.push({ time: tick.time, bid: tick.bid, ask: tick.ask });
    }
    progress((index + 1) / ctx.plan.length);
  }
  if (bar) batch.push(bar); if (batch.length) yield batch;
}
function provenance(ctx, ticks) { return { source: ctx.manifest.source, symbol: ctx.history.symbol, requestedFrom: ctx.history.from, requestedTo: ctx.history.to, updatedAt: ctx.manifest.updatedAt, actualFrom: ctx.actualFrom || null, actualTo: ctx.actualTo || null, signalTimeframe: 'M1', execution: 'tick', ...(ticks !== undefined ? { recordedTicks: ticks } : {}), partitions: ctx.plan.length }; }
async function historyBacktest(engine, payload, progress) {
  if (!engine.createBacktestStream) throw new Error('Build the streaming Quant engine before submitting stored tick history.');
  const ctx = await context(payload.history), runner = engine.createBacktestStream({ ...payload.params, mode: 'tick' });
  for await (const bars of recordedBars(ctx, progress)) runner.push(bars);
  const result = runner.finish(), snapshot = runner.snapshot(); result.provenance = provenance(ctx, snapshot.ticksProcessed); return result;
}
async function historyOptimize(engine, payload, progress) {
  if (!engine.createBacktestStream) throw new Error('Build the streaming Quant engine before submitting stored tick history.');
  const ctx = await context(payload.history), params = engine.normalizeParams({ ...payload.params, mode: 'tick' }), options = payload.options || {};
  const metric = options.metric || 'sharpe', minTrades = options.minTrades ?? 10, fraction = options.trainFraction ?? .7;
  if (!['sharpe', 'profitFactor', 'totalReturn', 'returnMaxDD'].includes(metric)) throw new Error('Unsupported optimization metric.');
  if (!Number.isInteger(minTrades) || minTrades < 1 || minTrades > 10000 || !Number.isFinite(fraction) || fraction < .5 || fraction > .9) throw new Error('Invalid walk-forward settings.');
  const entryValues = options.entryValues || Array.from({ length: 9 }, (_, i) => i * .25), stopValues = options.stopValues || Array.from({ length: 8 }, (_, i) => (i + 1) * .5);
  if (!Array.isArray(entryValues) || !Array.isArray(stopValues) || !entryValues.length || !stopValues.length || entryValues.length * stopValues.length > 2500) throw new Error('Optimization grids must have 1–2,500 cells.');
  if (entryValues.some(v => !Number.isFinite(v) || v < 0 || v > 10) || stopValues.some(v => !Number.isFinite(v) || v < .05 || v > 20)) throw new Error('Invalid entry or stop grid.');
  let count = 0; const steps = entryValues.length * stopValues.length + 2;
  for await (const bars of recordedBars(ctx, p => progress(p / steps))) count += bars.length;
  const split = Math.floor(count * fraction); if (split <= params.lookback + params.atrPeriod + 2 || count - split < 20) throw new Error('More recorded history is required for a meaningful 70/30 walk-forward split.');
  let best = null, inSample = null, splitDate = null; const cells = [];
  for (const stopS of stopValues) for (const entryK of entryValues) {
    const runner = engine.createBacktestStream({ ...params, entryK, stopS, startIndex: 0 }); let seen = 0;
    for await (const bars of recordedBars(ctx)) { if (!splitDate && seen + bars.length > split) splitDate = bars[split - seen].time.slice(0, 10); const take = bars.slice(0, Math.max(0, split - seen)); if (take.length) runner.push(take); seen += take.length; progress((1 + cells.length + Math.min(1, seen / split)) / steps); if (seen >= split) break; }
    const result = runner.finish(), raw = result.stats[metric], value = result.trades.length >= minTrades && raw !== null && Number.isFinite(raw) ? raw : null;
    cells.push({ entryK, stopS, value, stats: result.stats }); if (value !== null && (!best || value > best.value)) { best = { entryK, stopS, value }; inSample = result; }
  }
  let outOfSample = null;
  if (best) {
    const runner = engine.createBacktestStream({ ...params, entryK: best.entryK, stopS: best.stopS, startIndex: split }); let seen = 0;
    for await (const bars of recordedBars(ctx, p => progress((steps - 1 + p) / steps))) { if (!splitDate && seen + bars.length > split) splitDate = bars[split - seen].time.slice(0, 10); runner.push(bars); seen += bars.length; }
    outOfSample = runner.finish();
  }
  const verdict = !best ? 'unavailable' : outOfSample.stats.sharpe > 0 ? (outOfSample.stats.sharpe >= .5 * inSample.stats.sharpe ? 'green' : 'amber') : 'red';
  return { cells, best, inSample, outOfSample, verdict, metric, entryValues, stopValues, splitDate, provenance: { ...provenance(ctx), bars: count, passes: steps, memoryModel: 'Sequential grid cells; only one cell plus the current best result is retained.' }, note: !best ? 'Too few qualifying trades to select a cell.' : verdict === 'green' ? 'The edge retained at least half its in-sample Sharpe on the held-out period.' : verdict === 'amber' ? 'The held-out result is positive but weaker.' : 'The in-sample peak did not survive the held-out period: likely curve-fit.' };
}
module.exports = { historyBacktest, historyOptimize, recordedBars };
