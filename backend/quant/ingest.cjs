'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { Store } = require('./store.cjs');
const { DukascopyProvider, TradingEconomicsCalendar, aggregate } = require('./providers.cjs');
const { symbol, timeframe, range, hash, fail, TF } = require('./common.cjs');
async function ingest({ symbol: id = 'XAUUSD', tf = 'TICK', from, to, maxBytes = 2 * 1024 ** 3, maxChunks = 100000, store = new Store(), provider = new DukascopyProvider(), progress = () => {}, calendar = false } = {}) {
  const market = calendar ? null : symbol(id); const frame = calendar ? 'CALENDAR' : timeframe(tf); const dates = range(from, to, { now: Date.now() + (calendar ? 31 : 0) * 86400000, maxDays: 40000 });
  const base = calendar ? 'calendar' : `history/${market.id}/${frame}`; const stepMs = calendar ? 30 * 86400000 : frame === 'TICK' ? 3600000 : frame === 'M1' || frame === 'M5' ? 86400000 : 30 * 86400000;
  const manifestKey = base + '/manifest'; await fs.mkdir(store.root, { recursive: true, mode: 0o700 }); const lockPath = path.join(store.root, `${hash(base)}.lock`); let lock;
  try { lock = await fs.open(lockPath, 'wx', 0o600); await lock.writeFile(String(process.pid)); } catch (e) { if (e.code === 'EEXIST') throw fail('An importer for this symbol/timeframe is already running. Remove its lock only after confirming that process has stopped.', 409, 'IMPORT_LOCKED'); throw e; }
  const receipt = { symbol: market?.id || null, timeframe: frame, requestedFrom: dates.from, requestedTo: dates.to, source: calendar ? 'Trading Economics' : 'Dukascopy', startedAt: new Date().toISOString(), chunksDownloaded: 0, chunksReused: 0, recordsDownloaded: 0, compressedBytes: 0, stoppedReason: null, complete: false };
  try {
    const known = await store.read(manifestKey); const existing = new Map((known?.chunks || []).map(c => [c.key, c]));
    for (let cursor = Date.parse(dates.from); cursor < Date.parse(dates.to); cursor += stepMs) {
      const start = new Date(cursor).toISOString(), end = new Date(Math.min(cursor + stepMs, Date.parse(dates.to))).toISOString(); const key = base + '/chunks/' + hash([start, end]);
      if (existing.has(key) && await store.read(key)) { receipt.chunksReused++; receipt.coveredThrough = end; continue; }
      if (receipt.compressedBytes >= maxBytes || receipt.chunksDownloaded >= maxChunks) { receipt.stoppedReason = 'Configured download budget reached; rerun the identical command to resume.'; break; }
      try { await store.diskGuard(); } catch (e) { if (e.code !== 'DISK_RESERVE') throw e; receipt.stoppedReason = e.message; break; }
      const rows = calendar ? await provider.calendar({ from: start, to: end }) : await provider.history({ symbol: market, timeframe: frame, from: start, to: end });
      const updatedAt = new Date().toISOString(); const data = { source: receipt.source, from: start, to: end, updatedAt, ...(calendar ? { events: rows } : { rows }) }; const bytes = await store.write(key, data);
      const chunk = { key, from: start, to: end, rows: rows.length, bytes, updatedAt }; existing.set(key, chunk);
      await store.update(manifestKey, old => ({ schemaVersion: 1, source: receipt.source, symbol: market?.id || null, timeframe: frame, updatedAt, chunks: [...new Map([...(old?.chunks || []).map(c => [c.key, c]), [key, chunk]]).values()].sort((a, b) => a.from.localeCompare(b.from)) }));
      // Every imported M1 partition also produces coarser bid OHLC bars. These are real aggregates, not synthetic market prices.
      if (!calendar && frame === 'M1') for (const target of ['M5', 'H1', 'H4', 'D1']) { const derivedFrom = new Date(Math.ceil(cursor / TF[target]) * TF[target]).toISOString(), derivedTo = new Date(Math.floor(Date.parse(end) / TF[target]) * TF[target]).toISOString(); if (derivedFrom >= derivedTo) continue; const aggregateRows = aggregate(rows, target).filter(b => Date.parse(b.time) >= cursor && Date.parse(b.time) + TF[target] <= Date.parse(end)); const derivedKey = `history/${market.id}/${target}/chunks/${hash([derivedFrom, derivedTo])}`; const derivedBytes = await store.write(derivedKey, { source: receipt.source, from: derivedFrom, to: derivedTo, updatedAt, rows: aggregateRows, derivedFrom: 'M1' }); const derivedChunk = { key: derivedKey, from: derivedFrom, to: derivedTo, rows: aggregateRows.length, bytes: derivedBytes, updatedAt, derivedFrom: 'M1' }; await store.update(`history/${market.id}/${target}/manifest`, old => ({ schemaVersion: 1, source: receipt.source, symbol: market.id, timeframe: target, updatedAt, chunks: [...new Map([...(old?.chunks || []).map(c => [c.key, c]), [derivedKey, derivedChunk]]).values()].sort((a, b) => a.from.localeCompare(b.from)) })); receipt.compressedBytes += derivedBytes; }
      receipt.chunksDownloaded++; receipt.recordsDownloaded += rows.length; receipt.compressedBytes += bytes; receipt.coveredThrough = end; progress({ ...receipt, currentFrom: start, currentTo: end });
    }
    receipt.complete = !receipt.stoppedReason;
  } catch (error) { receipt.stoppedReason = error.code ? error.message : 'Import failed; completed partitions remain resumable.'; receipt.errorCode = error.code || 'IMPORT_FAILED'; }
  finally { receipt.finishedAt = new Date().toISOString(); await store.write(base + '/last-receipt', receipt); await lock.close(); await fs.unlink(lockPath); }
  return receipt;
}
module.exports = { ingest };
