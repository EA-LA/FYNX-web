'use strict';
// Advanced industry analytics for FYNX Pro members (consumerLiveWorkspace action 'industries').
// Computed on the server so only entitled accounts receive the results. Inputs are FYNX's published snapshots
// (equities.json: S&P 500 members, GICS sectors and sub-industries, daily and weekly closes; scanner.json: market values
// from the Nasdaq screener). Nothing is estimated: a metric without enough data is null.
const DATA = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/terminal-data/';
const CACHE_MS = 10 * 60 * 1000;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const r2 = v => finite(v) ? Math.round(v * 100) / 100 : null;

// Return (%) of one member over a period from its stored closes. price is the latest price.
function periodReturn(c, price, period) {
  if (!c || !finite(price) || price <= 0) return null;
  const base = period === '1W' ? c.d?.at(-6) : period === '1M' ? c.d?.[0] : period === '3M' ? c.w?.at(-14) : period === '6M' ? c.w?.at(-27) : period === '1Y' ? c.w?.[0] : null;
  return finite(base) && base > 0 ? (price / base - 1) * 100 : null;
}
const weighted = (list, f) => { let s = 0, w = 0; for (const x of list) { const v = f(x); if (finite(v) && finite(x.cap) && x.cap > 0) { s += v * x.cap; w += x.cap; } } return w ? s / w : null; };
function stdev(vals) { const v = vals.filter(finite); if (v.length < 3) return null; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); }
// Relative-rotation quadrant from 3-month relative strength (trend) and its recent change (momentum).
function quadrant(rs3, mom) { if (!finite(rs3) || !finite(mom)) return null; return rs3 >= 0 ? (mom >= 0 ? 'Leading' : 'Weakening') : (mom >= 0 ? 'Improving' : 'Lagging'); }

// members: [{sym, name, sector, industry, cap, price, c:{d,w}}] → {benchmark, groups, sectors}
function compute(members, {group = 'industry', minMembers = 1} = {}) {
  const rows = members.filter(m => m && finite(m.price) && m.price > 0 && m.c);
  for (const m of rows) { m.r1w = periodReturn(m.c, m.price, '1W'); m.r1m = periodReturn(m.c, m.price, '1M'); m.r3m = periodReturn(m.c, m.price, '3M'); m.r6m = periodReturn(m.c, m.price, '6M'); m.r1y = periodReturn(m.c, m.price, '1Y');
    const w = (m.c.w || []).filter(finite); m.ma10w = w.length >= 10 ? w.slice(-10).reduce((a, b) => a + b, 0) / 10 : null; m.hi52 = w.length >= 40 ? Math.max(...w, m.price) : null; }
  const bench = {r1m: weighted(rows, m => m.r1m), r3m: weighted(rows, m => m.r3m), r6m: weighted(rows, m => m.r6m), r1y: weighted(rows, m => m.r1y)};
  const by = new Map(); for (const m of rows) { const k = m[group] || 'Other'; if (!by.has(k)) by.set(k, []); by.get(k).push(m); }
  const out = [];
  for (const [name, list] of by) {
    if (list.length < minMembers) continue;
    const r1m = weighted(list, m => m.r1m), r3m = weighted(list, m => m.r3m), r6m = weighted(list, m => m.r6m), r1y = weighted(list, m => m.r1y);
    const rs1m = finite(r1m) && finite(bench.r1m) ? r1m - bench.r1m : null, rs3m = finite(r3m) && finite(bench.r3m) ? r3m - bench.r3m : null, rs6m = finite(r6m) && finite(bench.r6m) ? r6m - bench.r6m : null;
    // Momentum: is the last month's relative pace better than the 3-month average monthly pace?
    const mom = finite(rs1m) && finite(rs3m) ? rs1m - rs3m / 3 : null;
    const ma = list.filter(m => finite(m.ma10w)), hi = list.filter(m => finite(m.hi52));
    const leaders = list.filter(m => finite(m.r3m)).sort((a, b) => b.r3m - a.r3m);
    out.push({name, sector: list[0].sector, n: list.length, cap: list.reduce((t, m) => t + (finite(m.cap) ? m.cap : 0), 0),
      r1m: r2(r1m), r3m: r2(r3m), r6m: r2(r6m), r1y: r2(r1y), rs1m: r2(rs1m), rs3m: r2(rs3m), rs6m: r2(rs6m), momentum: r2(mom), quadrant: quadrant(rs3m, mom),
      aboveMa: ma.length ? r2(ma.filter(m => m.price > m.ma10w).length / ma.length * 100) : null,
      nearHigh: hi.length ? r2(hi.filter(m => m.price >= m.hi52 * 0.95).length / hi.length * 100) : null,
      dispersion: r2(stdev(list.map(m => m.r1m))),
      leaders: leaders.slice(0, 3).map(m => ({sym: m.sym, r3m: r2(m.r3m)})), laggards: leaders.slice(-3).reverse().filter(m => !leaders.slice(0, 3).includes(m)).map(m => ({sym: m.sym, r3m: r2(m.r3m)}))});
  }
  // Composite strength score 0–100: percentile of 3M and 1M relative strength, breadth above the 10-week average.
  const pct = (key) => { const vals = out.map(g => g[key]).filter(finite).sort((a, b) => a - b); return v => !finite(v) || vals.length < 2 ? null : vals.filter(x => x < v).length / (vals.length - 1) * 100; };
  const p3 = pct('rs3m'), p1 = pct('rs1m'), pb = pct('aboveMa');
  for (const g of out) { const parts = [p3(g.rs3m), p1(g.rs1m), pb(g.aboveMa)].filter(finite); g.score = parts.length === 3 ? Math.round((parts[0] * 0.45 + parts[1] * 0.35 + parts[2] * 0.2)) : null; }
  out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return {benchmark: {r1m: r2(bench.r1m), r3m: r2(bench.r3m), r6m: r2(bench.r6m), r1y: r2(bench.r1y), members: rows.length}, groups: out};
}

// Join the two published snapshots into member rows (S&P 500 only).
function membersFrom(eq, scan) {
  const syms = eq?.indices?.sp500 || [], info = eq?.info || {}, closes = eq?.closes || {}, caps = new Map();
  const f = scan?.stocks?.fields ? Object.fromEntries(scan.stocks.fields.map((k, i) => [k, i])) : null;
  if (f) for (const r of scan.stocks.rows || []) caps.set(String(r[f.symbol]).replace(/[./]/g, '-'), {cap: r[f.marketCap], price: r[f.price]});
  return syms.map(sym => { const c = closes[sym], s = caps.get(sym), inf = info[sym] || {}; if (!c) return null;
    const price = finite(s?.price) && s.price > 0 ? s.price : c.p; return {sym, name: inf.n || sym, sector: inf.sec || 'Other', industry: inf.ind || 'Other', cap: finite(s?.cap) ? s.cap : finite(inf.cap) ? inf.cap : null, price, c}; }).filter(Boolean);
}

let cache = null;
async function load(fetchImpl = fetch, now = Date.now()) {
  if (cache && now - cache.at < CACHE_MS) return cache;
  const get = async name => { const r = await fetchImpl(DATA + name, {signal: AbortSignal.timeout(20000)}); if (!r.ok) throw new Error(`${name} HTTP ${r.status}`); return r.json(); };
  const [eq, scan] = await Promise.all([get('equities.json'), get('scanner.json').catch(() => null)]);
  if (eq?.version !== 1 || !eq.indices?.sp500?.length) throw new Error('Index data is unavailable.');
  const members = membersFrom(eq, scan);
  cache = {at: now, asOf: eq.generatedAt, industry: compute(members.map(m => ({...m})), {group: 'industry'}), sector: compute(members.map(m => ({...m})), {group: 'sector'})};
  return cache;
}
async function analyticsFor(data, deps = {}) {
  const level = data?.level === 'sector' ? 'sector' : 'industry';
  const c = await load(deps.fetch || fetch, deps.now || Date.now());
  const res = c[level];
  return {level, asOf: c.asOf, generatedAt: new Date(c.at).toISOString(), benchmark: res.benchmark, groups: res.groups,
    method: 'Market-value-weighted returns of S&P 500 members by GICS group. Relative strength = group return minus the S&P 500 members\' market-value-weighted return. Momentum = 1-month relative strength minus one third of 3-month relative strength. Quadrant: Leading (RS and momentum up), Weakening (RS up, momentum down), Lagging (both down), Improving (RS down, momentum up). Breadth = members above their 10-week average; near high = within 5% of the 52-week high (weekly closes). Dispersion = standard deviation of members\' 1-month returns. Score = 45% 3-month RS rank + 35% 1-month RS rank + 20% breadth rank.',
    sources: 'FYNX snapshots: S&P 500 members and GICS groups (Wikipedia list), closes (Yahoo Finance), market values (Nasdaq screener)'};
}
module.exports = {compute, membersFrom, periodReturn, quadrant, analyticsFor, _reset: () => { cache = null; }};
