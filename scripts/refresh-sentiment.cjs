#!/usr/bin/env node
'use strict';
/* FYNX Fear & Greed publisher → sentiment.json (terminal-data branch), for the Market sentiment page and panel.
 *
 * Seven indicators in the spirit of the classic fear & greed gauges, each computed from public data with history:
 *  momentum   S&P 500 versus its 125-day average (%)                                  high = greed
 *  strength   Net new 52-week highs across S&P 500 members (% of members, 10-day avg)  high = greed
 *  breadth    S&P 500 members above their 50-day average (%)                          high = greed
 *  volatility VIX versus its 50-day average (%)                                       high = fear
 *  term       VIX ÷ 3-month VIX (above 1 = near-term stress priced higher)            high = fear
 *  haven      20-day return of stocks (SPY) minus Treasuries (IEF), points            high = greed
 *  junk       20-day return of high-yield bonds (HYG) minus investment grade (LQD)    high = greed
 * Each indicator is scored 0–100 by where today's value ranks in its own past year (percentile), inverted when a
 * high value means fear; the index is the average of the scores available that day. 0–25 extreme fear, 25–45
 * fear, 45–55 neutral, 55–75 greed, 75–100 extreme greed. Also: University of Michigan consumer sentiment (its own CSV).
 * Prices: Yahoo Finance daily closes; the index uses only market prices, so it updates every trading day. Nothing is estimated: a day without enough data has no score.
 * Usage: node scripts/refresh-sentiment.cjs <output-dir> [previous-dir] */
const fs = require('node:fs/promises'), path = require('node:path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const finite = v => typeof v === 'number' && Number.isFinite(v);
const r4 = v => finite(v) ? Math.round(v * 1e4) / 1e4 : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TTL = 25 * 60000;

async function fetchText(url, headers = {}, timeout = 30000) {
  const r = await fetch(url, {headers: {'User-Agent': UA, ...headers}, signal: AbortSignal.timeout(timeout)});
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return r.text();
}
async function spark(symbols, range = '5y') {
  for (let a = 0; a < 3; a++) {
    try { return JSON.parse(await fetchText(`https://${a % 2 ? 'query2' : 'query1'}.finance.yahoo.com/v8/finance/spark?symbols=${symbols.map(encodeURIComponent).join(',')}&range=${range}&interval=1d`, {Accept: 'application/json'}, 40000)); }
    catch (e) { if (a === 2) throw e; await sleep(1500 * (a + 1)); }
  }
}
// Yahoo spark entry → Map(date → close)
function closes(entry) {
  const r = entry?.response?.[0] || entry, ts = r?.timestamp || [], c = r?.close || r?.indicators?.quote?.[0]?.close || [], m = new Map();
  ts.forEach((t, i) => { if (finite(c[i]) && c[i] > 0) m.set(new Date(t * 1000).toISOString().slice(0, 10), c[i]); });
  return m;
}
// FRED CSV (DATE,VALUE; "." = missing) → Map(date → value)
function parseFred(text) {
  const m = new Map();
  for (const line of String(text).trim().split(/\r?\n/).slice(1)) { const [d, v] = line.split(','); const n = Number(v); if (/^\d{4}-\d\d-\d\d$/.test(d) && v !== '.' && finite(n)) m.set(d, n); }
  return m;
}
// University of Michigan Surveys of Consumers, index of consumer sentiment (monthly): Month,YYYY,ICS_ALL rows.
function parseMichigan(text) {
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'], out = [];
  for (const line of String(text).split(/\r?\n/)) { const c = line.split(',').map(x => x.trim().replace(/"/g, '')); const m = MONTHS.indexOf((c[0] || '').toLowerCase()), y = Number(c[1]), v = Number(c[2]); if (m >= 0 && y > 1950 && finite(v) && v > 0) out.push([`${y}-${String(m + 1).padStart(2, '0')}-01`, v]); }
  return out.sort((a, b) => a[0] < b[0] ? -1 : 1);
}
async function michigan() {
  try { const rows = parseMichigan(await fetchText('https://www.sca.isr.umich.edu/files/tbmics.csv', {Accept: 'text/csv'}, 30000)); if (rows.length > 100) return {rows, source: 'University of Michigan Surveys of Consumers (tbmics.csv)'}; } catch (e) { console.warn('[sentiment] Michigan (umich):', e.message); }
  try { const m = parseFred(await fetchText('https://fred.stlouisfed.org/graph/fredgraph.csv?id=UMCSENT', {Accept: 'text/csv'}, 60000)); if (m.size > 100) return {rows: [...m], source: 'University of Michigan consumer sentiment via FRED (UMCSENT)'}; } catch (e) { console.warn('[sentiment] Michigan (FRED):', e.message); }
  return null;
}

/* ---------- indicator maths (pure, tested) ---------- */
function sma(vals, n) { const out = new Array(vals.length).fill(null); let s = 0, k = 0; for (let i = 0; i < vals.length; i++) { const v = vals[i]; if (finite(v)) { s += v; k++; } if (i >= n) { const o = vals[i - n]; if (finite(o)) { s -= o; k--; } } if (i >= n - 1 && k === n) out[i] = s / n; } return out; }
// Percentile rank (0–100) of each value within its trailing window (inclusive); needs ≥ minN values.
function rollingPercentile(vals, win = 252, minN = 120) {
  return vals.map((v, i) => { if (!finite(v)) return null; const w = vals.slice(Math.max(0, i - win + 1), i + 1).filter(finite); if (w.length < minN) return null; let below = 0, eq = 0; for (const x of w) { if (x < v) below++; else if (x === v) eq++; } return (below + (eq - 1) / 2) / (w.length - 1) * 100; });
}
const label = s => !finite(s) ? null : s < 25 ? 'Extreme fear' : s < 45 ? 'Fear' : s <= 55 ? 'Neutral' : s <= 75 ? 'Greed' : 'Extreme greed';
// Constituent breadth: per day, net new 52-week highs (% of members, 10-day average) and % above the 50-day average.
function breadth(dates, memberSeries) {
  const highs = new Array(dates.length).fill(0), lows = new Array(dates.length).fill(0), above = new Array(dates.length).fill(0), nHL = new Array(dates.length).fill(0), nMA = new Array(dates.length).fill(0);
  for (const m of memberSeries) {
    const v = dates.map(d => m.get(d) ?? null), ma = sma(fillForward(v), 50), f = fillForward(v);
    for (let i = 0; i < dates.length; i++) {
      if (!finite(v[i])) continue;
      if (i >= 251) { const w = f.slice(i - 251, i + 1).filter(finite); if (w.length >= 240) { nHL[i]++; const hi = Math.max(...w), lo = Math.min(...w); if (v[i] >= hi) highs[i]++; else if (v[i] <= lo) lows[i]++; } }
      if (finite(ma[i])) { nMA[i]++; if (v[i] > ma[i]) above[i]++; }
    }
  }
  const net = dates.map((_, i) => nHL[i] >= 50 ? (highs[i] - lows[i]) / nHL[i] * 100 : null);
  return {strength: sma(net, 10).map(r4), breadth: dates.map((_, i) => nMA[i] >= 50 ? r4(above[i] / nMA[i] * 100) : null), members: Math.max(...nMA)};
}
function fillForward(v) { let last = null; return v.map(x => finite(x) ? (last = x) : last); }
const INDICATORS = [
  {key: 'momentum', name: 'Market momentum', unit: '%', invert: false, desc: 'S&P 500 versus its 125-day average. Far above it is greed; below it is fear.'},
  {key: 'strength', name: 'Stock price strength', unit: '%', invert: false, desc: 'S&P 500 members at 52-week highs minus those at 52-week lows, as a share of the index (10-day average).'},
  {key: 'breadth', name: 'Stock price breadth', unit: '%', invert: false, desc: 'Share of S&P 500 members trading above their own 50-day average.'},
  {key: 'volatility', name: 'Market volatility', unit: '%', invert: true, desc: 'VIX versus its 50-day average. A VIX spike above its average is fear.'},
  {key: 'term', name: 'Volatility term structure', unit: '×', invert: true, desc: 'VIX divided by the 3-month VIX. Above 1 means traders pay more for near-term protection: stress.'},
  {key: 'haven', name: 'Safe haven demand', unit: 'pts', invert: false, desc: '20-day return of stocks (SPY) minus Treasuries (IEF). Bonds beating stocks is fear.'},
  {key: 'junk', name: 'Junk bond demand', unit: 'pts', invert: false, desc: '20-day return of high-yield bonds (HYG) minus investment-grade bonds (LQD). Junk lagging is fear.'}];
function compute({dates, spx, vix, vix3m, spy, ief, hyg, lqd, members}) {
  const at = (m, ff = true) => { const v = dates.map(d => m?.get(d) ?? null); return ff ? fillForward(v) : v; };
  const S = at(spx), V = at(vix), V3 = at(vix3m), SP = at(spy), IE = at(ief), HY = at(hyg), LQ = at(lqd);
  // 20-day return of a minus 20-day return of b, in percentage points.
  const rel = (a, b) => a.map((v, i) => i >= 20 && finite(v) && finite(a[i - 20]) && finite(b[i]) && finite(b[i - 20]) ? r4(((v / a[i - 20]) - (b[i] / b[i - 20])) * 100) : null);
  const spxMA = sma(S, 125), vixMA = sma(V, 50), b = members?.length ? breadth(dates, members) : {strength: [], breadth: [], members: 0};
  const raw = {
    momentum: S.map((v, i) => finite(spxMA[i]) ? r4((v / spxMA[i] - 1) * 100) : null),
    strength: b.strength.length ? b.strength : dates.map(() => null),
    breadth: b.breadth.length ? b.breadth : dates.map(() => null),
    volatility: V.map((v, i) => finite(vixMA[i]) ? r4((v / vixMA[i] - 1) * 100) : null),
    term: V.map((v, i) => finite(v) && finite(V3[i]) && V3[i] > 0 ? r4(v / V3[i]) : null),
    haven: rel(SP, IE), junk: rel(HY, LQ)};
  const scores = {};
  for (const ind of INDICATORS) { const p = rollingPercentile(raw[ind.key]); scores[ind.key] = p.map(x => finite(x) ? Math.round((ind.invert ? 100 - x : x) * 10) / 10 : null); }
  const index = dates.map((_, i) => { const s = INDICATORS.map(ind => scores[ind.key][i]).filter(finite); return s.length >= 5 ? Math.round(s.reduce((a, x) => a + x, 0) / s.length * 10) / 10 : null; });
  return {raw, scores, index, members: b.members};
}
function summarize(dates, out, keep = 520) {
  const last = (() => { for (let i = dates.length - 1; i >= 0; i--) if (finite(out.index[i])) return i; return -1; })();
  if (last < 0) throw new Error('No index value available');
  const from = Math.max(0, last - keep + 1), back = n => { const i = last - n; return i >= 0 && finite(out.index[i]) ? {date: dates[i], score: out.index[i], label: label(out.index[i])} : null; };
  const history = []; for (let i = from; i <= last; i++) if (finite(out.index[i])) history.push([dates[i], out.index[i]]);
  return {asOf: dates[last], score: out.index[last], label: label(out.index[last]), prev: back(1), week: back(5), month: back(21), year: back(252), history,
    indicators: INDICATORS.map(ind => { const raw = out.raw[ind.key], sc = out.scores[ind.key]; const series = []; for (let i = from; i <= last; i++) if (finite(raw[i])) series.push([dates[i], raw[i]]);
      return {...ind, value: raw[last], score: sc[last], label: label(sc[last]), series}; })};
}

async function main() {
  const [outDir, prevDir] = process.argv.slice(2);
  if (!outDir) throw new Error('Usage: refresh-sentiment.cjs <output-dir> [previous-dir]');
  await fs.mkdir(outDir, {recursive: true});
  const read = async f => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return null; } };
  const previous = prevDir ? await read(path.join(prevDir, 'sentiment.json')) : null, now = Date.now();
  if (previous && Date.parse(previous.generatedAt) > now - TTL) { await fs.writeFile(path.join(outDir, 'sentiment.json'), JSON.stringify(previous) + '\n'); console.log('[sentiment] fresh enough, kept'); return; }
  try {
    const [core, mich] = await Promise.all([spark(['^GSPC', '^VIX', '^VIX3M', 'SPY', 'IEF', 'HYG', 'LQD'], '5y'), michigan()]);
    const eq = await read(path.join(outDir, 'equities.json')) || (prevDir ? await read(path.join(prevDir, 'equities.json')) : null);
    const syms = eq?.indices?.sp500 || [], members = [];
    for (let i = 0; i < syms.length; i += 60) {
      const batch = []; for (let k = i; k < Math.min(i + 60, syms.length); k += 20) batch.push(syms.slice(k, k + 20));
      const res = await Promise.allSettled(batch.map(b => spark(b, '3y')));
      res.forEach((r, k) => { if (r.status === 'fulfilled') for (const s of batch[k]) { const m = closes(r.value?.[s]); if (m.size > 300) members.push(m); } else console.warn('[sentiment] members batch:', r.reason.message); });
      await sleep(300);
    }
    const spx = closes(core['^GSPC']), dates = [...spx.keys()].sort();
    const out = compute({dates, spx, vix: closes(core['^VIX']), vix3m: closes(core['^VIX3M']), spy: closes(core.SPY), ief: closes(core.IEF), hyg: closes(core.HYG), lqd: closes(core.LQD), members});
    const s = summarize(dates, out);
    const michiganRows = mich ? mich.rows.filter(([d]) => d >= `${new Date(now).getUTCFullYear() - 10}-01-01`) : previous?.michigan || null;
    const doc = {version: 1, generatedAt: new Date(now).toISOString(), method: 'FYNX Fear & Greed: seven indicators, each scored by its percentile within its own trailing year (inverted where high means fear), averaged.', ...s, membersUsed: out.members, michigan: michiganRows,
      sources: {prices: 'Yahoo Finance daily closes (^GSPC, ^VIX, ^VIX3M, SPY, IEF, HYG, LQD and S&P 500 members)', michigan: mich?.source || previous?.sources?.michigan || null}};
    await fs.writeFile(path.join(outDir, 'sentiment.json'), JSON.stringify(doc) + '\n');
    console.log(`[sentiment] ${s.asOf} score ${s.score} (${s.label}) · prev ${s.prev?.score} · members ${out.members} · indicators ${s.indicators.filter(i => finite(i.score)).length}/7 · history ${s.history.length}`);
  } catch (e) {
    console.warn('[sentiment] failed:', e.message);
    if (previous) await fs.writeFile(path.join(outDir, 'sentiment.json'), JSON.stringify({...previous, stale: true}) + '\n'); else throw e;
  }
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = {sma, rollingPercentile, label, breadth, compute, summarize, parseFred, parseMichigan, closes, INDICATORS};
