'use strict';
const { ingest } = require('../backend/quant/ingest.cjs');
const { symbols } = require('../backend/quant/common.cjs');
const { Store } = require('../backend/quant/store.cjs');
const { TradingEconomicsCalendar } = require('../backend/quant/providers.cjs');
async function main() {
  const store = new Store(); const today = new Date().toISOString().slice(0, 10), results = [];
  const selected = String(process.env.QUANT_NIGHTLY_SYMBOLS || 'EURUSD,XAUUSD').split(','); const frames = String(process.env.QUANT_NIGHTLY_TIMEFRAMES || 'D1,M1').split(',');
  for (const id of selected) { if (!symbols().some(s => s.id === id)) throw new Error('Nightly symbol is not configured.'); for (const tf of frames) { const manifest = await store.read(`history/${id}/${tf.toUpperCase()}/manifest`); const last = manifest?.chunks?.at(-1)?.to; const from = last ? new Date(Math.min(Date.parse(last), Date.parse(today) - 86400000)).toISOString() : new Date(Date.parse(today) - 7 * 86400000).toISOString(); results.push(await ingest({ symbol: id, tf, from, to: today, maxBytes: Number(process.env.QUANT_NIGHTLY_MAX_BYTES || 512 * 1024 ** 2), maxChunks: 200 })); } }
  if (process.env.QUANT_CALENDAR_API_KEY) results.push(await ingest({ calendar: true, provider: new TradingEconomicsCalendar(), from: new Date(Date.parse(today) - 7 * 86400000).toISOString(), to: new Date(Date.parse(today) + 14 * 86400000).toISOString(), maxChunks: 2 }));
  console.log(JSON.stringify({ finishedAt: new Date().toISOString(), results }, null, 2)); if (results.some(r => !r.complete)) process.exitCode = 2;
}
main().catch(error => { console.error(error.code ? error.message : 'Nightly refresh could not complete.'); process.exitCode = 1; });
