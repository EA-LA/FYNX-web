#!/usr/bin/env node
'use strict';
/* FYNX equities publisher → equities.json (terminal-data branch), for the DASHBOARD desk, Market Overview,
 * the S&P 500 heat map and Industries.
 *  members — S&P 500 (Wikipedia constituents table: GICS sector and sub-industry), Nasdaq-100 (Nasdaq list API)
 *            and Dow 30 (Wikipedia components table). Refreshed once a day; the previous lists are kept on failure.
 *  closes  — for every member: last price, today's change, 22 daily and 53 weekly closes and the last close of
 *            the previous year (Yahoo Finance spark, 20 symbols per request). Refreshed every run.
 *  macro   — weekly S&P 500, US 10-year yield and US dollar index since 2011 (Rates & Dollar chart).
 * Market values are joined in the browser from scanner.json (Nasdaq screener), with Nasdaq's figure as fallback.
 * Nothing is estimated: a symbol without data is left out, never filled in.
 * Usage: node scripts/refresh-equities.cjs <output-dir> [previous-dir] */
const fs = require('node:fs/promises'), path = require('node:path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const NASDAQ = {Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/'};
const DAY = 86400000, MEMBERS_TTL = 20 * 3600000;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const sig = v => finite(v) ? Number(v.toPrecision(6)) : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Dow 30 as listed on Wikipedia's DJIA page on 2026-11-26. Used only if the page cannot be read.
const DOW_FALLBACK = 'AAPL AMGN AMZN AXP BA CAT CRM CSCO CVX DIS GOOGL GS HD HON IBM JNJ JPM KO MCD MMM MRK MSFT NKE NVDA PG SHW TRV UNH V WMT'.split(' ');
const wikiHref = cell => { const m = /href="(?:https:\/\/en\.wikipedia\.org)?\/wiki\/([^"#?]+)"/.exec(cell); return m ? decodeURIComponent(m[1]) : null; };

async function fetchText(url, headers = {}, timeout = 25000) {
  const r = await fetch(url, {headers: {'User-Agent': UA, ...headers}, signal: AbortSignal.timeout(timeout), redirect: 'follow'});
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return r.text();
}
const decode = s => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
// Yahoo uses dashes for share classes (BRK-B); Wikipedia and Nasdaq use dots or slashes.
const yahooSym = s => String(s).trim().toUpperCase().replace(/[./]/g, '-');
const validSym = s => /^[A-Z][A-Z0-9-]{0,7}$/.test(s);

/* Rows of the HTML tables on a page: [{headers, rows: [[cell text…]]}] (th and td cells both count). */
function tables(html) {
  return (html.match(/<table[\s\S]*?<\/table>/g) || []).map(t => {
    const trs = t.match(/<tr[\s\S]*?<\/tr>/g) || [];
    const raw = tr => tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g) || [], cells = tr => raw(tr).map(decode);
    const head = trs.find(tr => /<th/.test(tr) && !/<td/.test(tr));
    const body = trs.filter(tr => tr !== head);
    return {id: (/^<table[^>]*\bid="([^"]+)"/.exec(t) || [])[1] || '', headers: head ? cells(head) : [], rows: body.map(cells).filter(r => r.length), raw: body.map(raw).filter(r => r.length), html: t};
  });
}
function parseSP500(html) {
  const t = tables(html).find(x => x.id === 'constituents') || tables(html).find(x => x.headers.includes('Symbol') && x.headers.some(h => /GICS/.test(h)));
  if (!t) throw new Error('S&P 500 constituents table not found');
  const ix = name => t.headers.findIndex(h => h.replace(/\s+/g, ' ').includes(name));
  const [iS, iN, iSec, iInd] = [ix('Symbol'), ix('Security'), ix('GICS Sector'), ix('GICS Sub-Industry')];
  const out = t.rows.map((r, k) => ({symbol: yahooSym(r[iS]), name: r[iN], sector: r[iSec], industry: r[iInd], article: wikiHref(t.raw[k]?.[iN] || '')})).filter(m => validSym(m.symbol) && m.name && m.sector);
  if (out.length < 480 || out.length > 520) throw new Error(`S&P 500 table has ${out.length} rows`);
  return out;
}
/* The DJIA page lists its 30 members in a navigation box of company links. Every Dow member is also in the
 * S&P 500, so the box's article links are matched to S&P 500 rows (Class A when a company has two share classes). */
function parseDow(html, sp500) {
  const byArticle = new Map();
  for (const m of sp500 || []) { if (!m.article) continue; const prev = byArticle.get(m.article); if (!prev || /Class A/i.test(m.name)) byArticle.set(m.article, m); }
  for (const t of tables(html)) {
    const links = [...new Set([...t.html.matchAll(/href="(?:https:\/\/en\.wikipedia\.org)?\/wiki\/([^"#?]+)"/g)].map(x => decodeURIComponent(x[1])))];
    const hits = links.map(a => byArticle.get(a)).filter(Boolean);
    if (hits.length === 30 && links.length <= 45) return hits.map(m => ({symbol: m.symbol, name: m.name, industry: m.industry}));
  }
  throw new Error('Dow 30 member list not found');
}
function parseNdx(json) {
  const rows = json?.data?.data?.rows;
  if (!Array.isArray(rows)) throw new Error('Nasdaq-100 list missing');
  const out = rows.map(r => ({symbol: yahooSym(r.symbol), name: String(r.companyName || '').replace(/\s+(Common Stock|Class [A-Z] .*|Ordinary Shares.*|American Depositary.*)$/i, '').trim(), marketCap: Number(String(r.marketCap || '').replace(/,/g, '')) || null})).filter(m => validSym(m.symbol));
  if (out.length < 95 || out.length > 110) throw new Error(`Nasdaq-100 list has ${out.length} rows`);
  return out;
}
async function fetchMembers(previous, now) {
  if (previous?.indices && Date.parse(previous.membersAt) > now - MEMBERS_TTL) return {indices: previous.indices, info: previous.info, membersAt: previous.membersAt, sources: previous.sources};
  const spP = fetchText('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies').then(parseSP500);
  const [sp, ndx, dow] = await Promise.allSettled([spP,
    fetchText('https://api.nasdaq.com/api/quote/list-type/nasdaq100', NASDAQ).then(t => parseNdx(JSON.parse(t))),
    Promise.all([fetchText('https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average'), spP]).then(([h, list]) => parseDow(h, list))]);
  const prevIdx = previous?.indices || {}, info = {...(previous?.info || {})}, indices = {}, sources = {...(previous?.sources || {})};
  if (sp.status === 'fulfilled') { indices.sp500 = sp.value.map(m => m.symbol); sp.value.forEach(m => { info[m.symbol] = {n: m.name, sec: m.sector, ind: m.industry}; }); sources.sp500 = 'Wikipedia, List of S&P 500 companies (GICS sector and sub-industry)'; }
  else { console.warn('[equities] S&P 500:', sp.reason.message); if (prevIdx.sp500) indices.sp500 = prevIdx.sp500; }
  if (ndx.status === 'fulfilled') { indices.ndx = ndx.value.map(m => m.symbol); ndx.value.forEach(m => { info[m.symbol] = {...info[m.symbol], n: info[m.symbol]?.n || m.name, cap: m.marketCap}; }); sources.ndx = 'Nasdaq, Nasdaq-100 constituents'; }
  else { console.warn('[equities] Nasdaq-100:', ndx.reason.message); if (prevIdx.ndx) indices.ndx = prevIdx.ndx; }
  if (dow.status === 'fulfilled') { indices.dow = dow.value.map(m => m.symbol); dow.value.forEach(m => { info[m.symbol] = {...info[m.symbol], n: info[m.symbol]?.n || m.name}; }); sources.dow = 'Wikipedia, Dow Jones Industrial Average members'; }
  else { console.warn('[equities] Dow 30:', dow.reason.message); indices.dow = prevIdx.dow || DOW_FALLBACK; if (!prevIdx.dow) sources.dow = 'Wikipedia DJIA members as of 2026-11-26 (fallback list)'; }
  if (!indices.sp500 && !indices.ndx) throw new Error('No index membership available');
  return {indices, info, membersAt: new Date(now).toISOString(), sources};
}

/* Yahoo spark: up to 20 symbols per request, daily closes for a year. Accepts both response shapes Yahoo serves. */
function sparkSeries(entry) {
  const r = entry?.response?.[0] || entry, ts = r?.timestamp || [], close = r?.close || r?.indicators?.quote?.[0]?.close || [];
  const out = []; ts.forEach((t, i) => { if (finite(close[i]) && close[i] > 0) out.push([t * 1000, close[i]]); });
  return {points: out, previousClose: r?.chartPreviousClose ?? r?.meta?.chartPreviousClose ?? null};
}
function summarize(points, now) {
  if (points.length < 30) return null;
  const last = points.at(-1), dates = points.map(p => new Date(p[0]).toISOString().slice(0, 10));
  const daily = points.slice(-23).map(p => sig(p[1])); // 22 sessions back + today
  // Weekly: the last close of each ISO week (Monday-based), oldest first, the current week's latest included.
  const weekOf = t => { const d = new Date(t); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.getTime(); };
  const weeks = new Map(); for (const p of points) weeks.set(weekOf(p[0]), p[1]);
  const weekly = [...weeks.values()].slice(-53).map(sig);
  const year = new Date(now).getUTCFullYear(), prevYear = points.filter((p, i) => dates[i] < `${year}-01-01`).at(-1);
  const prev = points.at(-2);
  return {p: sig(last[1]), c: prev ? Math.round((last[1] / prev[1] - 1) * 1e5) / 1e3 : null, t: dates.at(-1), d: daily, w: weekly, y0: prevYear ? sig(prevYear[1]) : null};
}
async function spark(symbols, range = '1y', interval = '1d') {
  for (let attempt = 0; attempt < 3; attempt++) {
    const host = attempt % 2 ? 'query2' : 'query1';
    try { return JSON.parse(await fetchText(`https://${host}.finance.yahoo.com/v8/finance/spark?symbols=${symbols.map(encodeURIComponent).join(',')}&range=${range}&interval=${interval}`, {Accept: 'application/json'}, 30000)); }
    catch (e) { if (attempt === 2) throw e; await sleep(1500 * (attempt + 1)); }
  }
}
async function fetchCloses(symbols, previous, now) {
  const out = {}, prev = previous?.closes || {}, batches = [];
  for (let i = 0; i < symbols.length; i += 20) batches.push(symbols.slice(i, i + 20));
  let ok = 0;
  for (let i = 0; i < batches.length; i += 3) {
    const res = await Promise.allSettled(batches.slice(i, i + 3).map(b => spark(b)));
    res.forEach((r, k) => { const b = batches[i + k];
      if (r.status !== 'fulfilled') { console.warn('[equities] spark batch failed:', r.reason.message); b.forEach(s => { if (prev[s]) out[s] = {...prev[s], stale: true}; }); return; }
      for (const s of b) { const x = r.value?.[s] ? summarize(sparkSeries(r.value[s]).points, now) : null; if (x) { out[s] = x; ok++; } else if (prev[s]) out[s] = {...prev[s], stale: true}; }
    });
    await sleep(400);
  }
  if (!ok) throw new Error('No closes fetched');
  return {closes: out, fresh: ok};
}
async function fetchMacro(previous) {
  try {
    const d = await spark(['^GSPC', '^TNX', 'DX-Y.NYB'], '15y', '1wk');
    const series = ['^GSPC', '^TNX', 'DX-Y.NYB'].map(s => sparkSeries(d[s]).points);
    if (series.some(s => s.length < 200)) throw new Error('short macro history');
    const dates = [...new Set(series[0].map(p => new Date(p[0]).toISOString().slice(0, 10)))];
    const at = s => { const m = new Map(s.map(p => [new Date(p[0]).toISOString().slice(0, 10), p[1]])); let last = null; return dates.map(dt => sig(last = m.get(dt) ?? last)); };
    return {dates, spx: at(series[0]), tnx: at(series[1]), dxy: at(series[2]), source: 'Yahoo Finance weekly closes: S&P 500 (^GSPC), CBOE 10-year yield (^TNX), US Dollar Index (DX-Y.NYB)'};
  } catch (e) { console.warn('[equities] macro:', e.message); return previous?.macro || null; }
}
async function readJSON(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }

async function main() {
  const [outDir, prevDir] = process.argv.slice(2);
  if (!outDir) throw new Error('Usage: refresh-equities.cjs <output-dir> [previous-dir]');
  await fs.mkdir(outDir, {recursive: true});
  const now = Date.now(), previous = prevDir ? await readJSON(path.join(prevDir, 'equities.json')) : null;
  try {
    const members = await fetchMembers(previous, now);
    const symbols = [...new Set(Object.values(members.indices).flat())];
    const [{closes, fresh}, macro] = await Promise.all([fetchCloses(symbols, previous, now), fetchMacro(previous)]);
    const doc = {version: 1, generatedAt: new Date(now).toISOString(), ...members, closesSource: 'Yahoo Finance daily closes (delayed)', fresh, total: symbols.length, closes, macro};
    await fs.writeFile(path.join(outDir, 'equities.json'), JSON.stringify(doc) + '\n');
    console.log(`[equities] ${fresh}/${symbols.length} symbols · S&P ${members.indices.sp500?.length || 0} · NDX ${members.indices.ndx?.length || 0} · Dow ${members.indices.dow?.length || 0} · macro ${macro?.dates?.length || 0} weeks`);
  } catch (e) {
    console.warn('[equities] failed:', e.message);
    if (previous) await fs.writeFile(path.join(outDir, 'equities.json'), JSON.stringify({...previous, stale: true}) + '\n');
    else throw e;
  }
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = {tables, parseSP500, parseDow, parseNdx, sparkSeries, summarize, yahooSym, DOW_FALLBACK};
