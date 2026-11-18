'use strict';
const { fail } = require('./common.cjs');
/** Greedy coverage plan skips overlapping partitions without duplicating execution ticks. */
function partitionPlan(manifest, from, to) {
  const start = Date.parse(from), end = Date.parse(to); const chunks = (manifest?.chunks || []).filter(c => Date.parse(c.to) > start && Date.parse(c.from) < end).sort((a, b) => a.from.localeCompare(b.from));
  let cursor = start, index = 0; const plan = [];
  while (cursor < end) { let best = null; while (index < chunks.length && Date.parse(chunks[index].from) <= cursor) { const c = chunks[index++]; if (Date.parse(c.to) > cursor && (!best || c.to > best.to)) best = c; } if (!best) throw fail('Requested history has not been fully imported. Run the resumable history importer; no missing ticks are synthesized.', 409, 'HISTORY_NOT_INGESTED'); const next = Math.min(end, Date.parse(best.to)); plan.push({ ...best, readFrom: new Date(cursor).toISOString(), readTo: new Date(next).toISOString() }); cursor = next; }
  return plan;
}
module.exports = { partitionPlan };
