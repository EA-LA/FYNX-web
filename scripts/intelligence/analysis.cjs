'use strict';
/* FYNX Intelligence analysis.
 * Every figure here is computed from a dated public data snapshot (quotes with daily
 * history, Treasury curve, Fed funds futures, BIS policy rates, economic calendar,
 * Nasdaq earnings calendar). Each figure carries its source and as-of time.
 * Narrative written by a language model is optional and is checked so that it cannot
 * introduce numbers, quotations or sources that are not in the supplied facts. */

const DAY = 86400000;
const RATE_SYMBOLS = /^\^(TNX|FVX|TYX|IRX)$/;
const round = (v, d = 2) => Number.isFinite(v) ? Number(v.toFixed(d)) : null;
const pct = (a, b) => Number.isFinite(a) && Number.isFinite(b) && b ? (a / b - 1) * 100 : null;
const fmtDate = iso => new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : '')).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'});

function priceText(symbol, value) {
  if (!Number.isFinite(value)) return '—';
  if (RATE_SYMBOLS.test(symbol)) return value.toFixed(3) + '%';
  const d = /=X$/.test(symbol) && !/JPY|INR|TRY|MXN|ZAR|BRL|CNY/.test(symbol) ? 4 : Math.abs(value) >= 1000 ? 2 : Math.abs(value) >= 1 ? 2 : 4;
  return value.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
}
function moveText(symbol, q) {
  if (RATE_SYMBOLS.test(symbol)) { const bp = (q.price - q.previousClose) * 100; return (bp >= 0 ? '+' : '') + bp.toFixed(1) + ' bp'; }
  return Number.isFinite(q.changePercent) ? (q.changePercent >= 0 ? '+' : '') + q.changePercent.toFixed(2) + '%' : '—';
}

/* Market statistics for one instrument from its own daily history. */
function instrumentStats(symbol, q) {
  if (!q || !Array.isArray(q.history) || q.history.length < 30 || !Number.isFinite(q.price)) return null;
  const h = q.history, last = h.length - 1, isRate = RATE_SYMBOLS.test(symbol);
  const back = n => h[Math.max(0, last - n)];
  const change = n => isRate ? round((q.price - back(n)[1]) * 100, 1) : round(pct(q.price, back(n)[1]), 2);
  const year = String(h[last][0]).slice(0, 4), ytdBase = h.find(r => String(r[0]).startsWith(year)) || h[0];
  let hi = h[0], lo = h[0]; for (const r of h.slice(-252)) { if (r[1] > hi[1]) hi = r; if (r[1] < lo[1]) lo = r; }
  const day = isRate ? (Number.isFinite(q.previousClose) ? (q.price - q.previousClose) * 100 : null) : q.changePercent;
  // Largest comparable one-day move: walk back to the last session with a move at least as large in the same direction.
  let since = null;
  if (Number.isFinite(day) && day !== 0) {
    for (let i = last - 1; i >= 1; i--) {
      const r = isRate ? (h[i][1] - h[i - 1][1]) * 100 : pct(h[i][1], h[i - 1][1]);
      if (Math.sign(r) === Math.sign(day) && Math.abs(r) >= Math.abs(day)) { since = h[i][0]; break; }
    }
    if (!since) since = 'window';
  }
  const sigma = Number.isFinite(q.vol20) && q.vol20 > 0 && !isRate ? q.vol20 : null;
  return {
    symbol, name: q.name, asOf: q.asOf, price: q.price, priceText: priceText(symbol, q.price), dayText: moveText(symbol, q), day: round(day, isRate ? 1 : 2), unit: isRate ? 'bp' : '%',
    m1: change(21), m3: change(63), ytd: isRate ? round((q.price - ytdBase[1]) * 100, 1) : round(pct(q.price, ytdBase[1]), 2), ytdFrom: ytdBase[0],
    high: {value: hi[1], date: hi[0], text: priceText(symbol, hi[1])}, low: {value: lo[1], date: lo[0], text: priceText(symbol, lo[1])},
    fromHigh: isRate ? round((q.price - hi[1]) * 100, 1) : round(pct(q.price, hi[1]), 2),
    sigma: round(sigma, 2), zscore: sigma && Number.isFinite(day) ? round(day / sigma, 1) : null,
    largestSince: since, historyStart: h[0][0], stale: !!q.stale, source: q.source || 'Yahoo Finance (delayed)'
  };
}

function sinceText(s) {
  if (!s.largestSince || !Number.isFinite(s.day) || Math.abs(s.day) < (s.unit === 'bp' ? 3 : 0.5)) return null;
  const dir = s.day > 0 ? (s.unit === 'bp' ? 'rise' : 'gain') : (s.unit === 'bp' ? 'drop' : 'decline');
  if (s.largestSince === 'window') return `the largest one-day ${dir} in the 12 months of data FYNX holds (since ${fmtDate(s.historyStart)})`;
  const days = Math.round((Date.parse(s.asOf) - Date.parse(s.largestSince + 'T12:00:00Z')) / DAY);
  return days >= 20 ? `the largest one-day ${dir} since ${fmtDate(s.largestSince)}` : null;
}

/* Interest-rate and policy context relevant to the linked markets. */
function macroContext(desk, themes, markets) {
  const out = [];
  if (!desk) return out;
  const usLinked = themes.some(t => /^US/.test(t.label)) || markets.some(m => /TNX|DX-Y|GSPC|ES=F/.test(m.symbol));
  const fed = desk.fed;
  if (usLinked && fed?.odds && fed.effr) {
    const o = fed.odds, lead = [['hike', o.hike], ['hold', o.hold], ['cut', o.cut]].sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];
    out.push({kind: 'fed', label: 'Fed funds futures', text: `Fed funds futures imply ${o.expectedChangeBp >= 0 ? '+' : ''}${round(o.expectedChangeBp, 1)} bp of change at the ${fmtDate(o.meeting)} FOMC meeting (implied rate ${round(o.impliedRateAfter, 3)}%; ${lead[0]} probability ${round(lead[1], 1)}%). The current target range is ${fed.effr.targetFrom}%–${fed.effr.targetTo}% and the effective rate was ${fed.effr.value}% on ${fmtDate(fed.effr.date)}.`, source: fed.source, sourceURL: fed.sourceURL, asOf: o.contracts?.[0]?.asOf || desk.generatedAt, meeting: o.meeting});
  }
  const us = desk.curves?.US, row = us?.history?.at(-1);
  if (usLinked && row?.values?.['2Y'] && row.values['10Y']) {
    const spread = round((row.values['10Y'] - row.values['2Y']) * 100, 0), prev = us.history.at(-22)?.values;
    const chg = prev ? round((row.values['10Y'] - prev['10Y']) * 100, 0) : null;
    out.push({kind: 'curve', label: 'Treasury curve', text: `On ${fmtDate(row.date)} the 2-year Treasury yielded ${row.values['2Y']}% and the 10-year ${row.values['10Y']}%, a 2s10s spread of ${spread} bp${Number.isFinite(chg) ? `; the 10-year has moved ${chg >= 0 ? '+' : ''}${chg} bp over about a month` : ''}.`, source: us.source, sourceURL: us.sourceURL, asOf: row.date});
  }
  const AREA = {'EURUSD=X': ['XM', 'euro area'], 'GBPUSD=X': ['GB', 'UK'], 'JPY=X': ['JP', 'Japan'], 'AUDUSD=X': ['AU', 'Australia'], 'CAD=X': ['CA', 'Canada'], 'CHF=X': ['CH', 'Switzerland'], 'NZDUSD=X': ['NZ', 'New Zealand'], 'INR=X': ['IN', 'India'], 'MXN=X': ['MX', 'Mexico'], 'BRL=X': ['BR', 'Brazil'], 'TRY=X': ['TR', 'Turkey'], 'ZAR=X': ['ZA', 'South Africa'], 'CNY=X': ['CN', 'China']};
  const rows = desk.rates?.rows || [];
  for (const m of markets) {
    const a = AREA[m.symbol]; if (!a) continue;
    const r = rows.find(x => x.area === a[0]), us = rows.find(x => x.area === 'US');
    if (r) out.push({kind: 'policy', label: 'Policy rates', text: `The ${a[1]} policy rate is ${r.value}% (observed ${fmtDate(r.observationDate)})${us ? `, against ${us.value}% in the US — a gap of ${round((us.value - r.value) * 100, 0)} bp` : ''}.`, source: desk.rates.source, sourceURL: desk.rates.sourceURL, asOf: r.observationDate});
  }
  return out;
}

/* Dated upcoming events tied to the story's companies, currencies and policy theme. */
function catalysts({companies, markets, themes}, {earnings, desk}, now) {
  const out = [], horizon = now + 21 * DAY;
  for (const c of companies) {
    if (!c.ticker) continue;
    const e = (earnings?.events || []).find(x => x.symbol === c.ticker && Date.parse(x.date + 'T23:59:59Z') >= now);
    if (e) out.push({date: e.date, title: `${e.name || c.name} reports ${e.fiscalQuarter || ''} results`.replace(/\s+/g, ' ').trim(), detail: [e.time, Number.isFinite(e.epsForecast) ? `EPS forecast ${e.epsForecast} (${e.estimates || '?'} estimates)` : '', Number.isFinite(e.lastYearEPS) ? `year-ago EPS ${e.lastYearEPS}` : ''].filter(Boolean).join(' · '), source: earnings.source || 'Nasdaq earnings calendar', sourceURL: earnings.sourceURL});
  }
  const cur = new Set();
  for (const m of markets) { const s = m.symbol; if (/EUR/.test(s) || s === '^STOXX50E') cur.add('EUR'); if (/GBP/.test(s) || s === '^FTSE') cur.add('GBP'); if (/JPY/.test(s) || s === '^N225') cur.add('JPY'); if (/AUD/.test(s)) cur.add('AUD'); if (/CAD/.test(s)) cur.add('CAD'); if (/CHF/.test(s)) cur.add('CHF'); if (/NZD/.test(s)) cur.add('NZD'); if (/CNY/.test(s)) cur.add('CNY'); if (/TNX|DX-Y|GSPC|ES=F|DJI|IXIC|GC=F|CL=F|BZ=F/.test(s)) cur.add('USD'); }
  if (themes.some(t => /^US/.test(t.label))) cur.add('USD');
  const events = (desk?.events?.events || []).filter(e => cur.has(e.currency) && Date.parse(e.time) > now && Date.parse(e.time) < horizon && e.impact !== 'low')
    .sort((a, b) => (a.impact === 'high' ? 0 : 1) - (b.impact === 'high' ? 0 : 1) || Date.parse(a.time) - Date.parse(b.time)).slice(0, 4);
  for (const e of events) out.push({date: e.time, title: `${e.currency}: ${e.title}`, detail: [e.impact === 'high' ? 'High impact' : 'Medium impact', e.forecast != null ? `forecast ${e.forecast}` : '', e.previous != null ? `previous ${e.previous}` : ''].filter(Boolean).join(' · '), source: desk.events.source, sourceURL: desk.events.sourceURL});
  const meeting = desk?.fed?.odds?.meeting;
  if (meeting && cur.has('USD') && Date.parse(meeting) > now) out.push({date: meeting, title: 'FOMC policy decision', detail: 'Federal Reserve rate decision', source: desk.fed.source, sourceURL: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'});
  return out.sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).filter((x, i, a) => a.findIndex(y => y.title === x.title) === i).slice(0, 6);
}

/* Deterministic, data-only analysis. Every sentence states a computed fact with its date. */
function dataAnalysis(stats, macro) {
  const points = [];
  for (const s of stats.slice(0, 4)) {
    const sentences = [], big = sinceText(s), u = s.unit;
    if (Number.isFinite(s.zscore) && Math.abs(s.zscore) >= 1.5) sentences.push(`${s.name} moved ${s.dayText}, about ${Math.abs(s.zscore).toFixed(1)}× its typical daily swing (20-day σ ${s.sigma}%)${big ? ` and ${big}` : ''}.`);
    else if (Number.isFinite(s.zscore)) sentences.push(`${s.name} moved ${s.dayText}, within one typical daily swing (20-day σ ${s.sigma}%)${big ? `, yet still ${big}` : ''}.`);
    else sentences.push(`${s.name} is at ${s.priceText} (${s.dayText} on the session)${big ? `, ${big}` : ''}.`);
    const atHigh = u === 'bp' ? Math.abs(s.fromHigh) < 0.5 : Math.abs(s.fromHigh) < 0.05;
    const where = atHigh ? 'at' : u === 'bp' ? `${Math.abs(s.fromHigh).toFixed(0)} bp below` : `${Math.abs(s.fromHigh).toFixed(1)}% below`;
    sentences.push(`Over about a month it has moved ${fmtSigned(s.m1, u)}, and ${fmtSigned(s.ytd, u)} since ${fmtDate(s.ytdFrom)}; it sits ${where} its 12-month high of ${s.high.text}${atHigh ? '' : ` (${fmtDate(s.high.date)})`}.`);
    points.push({symbol: s.symbol, text: sentences.join(' '), asOf: s.asOf, source: s.source});
  }
  return {points, macro};
}
const fmtSigned = (v, u) => Number.isFinite(v) ? (v >= 0 ? '+' : '') + (u === 'bp' ? v.toFixed(0) + ' bp' : v.toFixed(1) + '%') : 'n/a';

/* ---------- Optional language-model narrative with strict checks ---------- */
const numbersIn = text => (String(text).match(/-?\d[\d,]*\.?\d*/g) || []).map(n => n.replace(/,/g, '')).filter(n => n.replace(/[-.]/g, '').length && !/^(19|20)\d\d$/.test(n));
// Facts may be written rounded (1.3274 → 1.33, 28.9 → 29); the draft's own numbers are not rounded before checking.
function normalizeNum(n) { const v = Number(n); if (!Number.isFinite(v)) return [n]; const a = Math.abs(v); return [...new Set([v, a].flatMap(x => [String(x), String(Number(x.toFixed(0))), String(Number(x.toFixed(1))), String(Number(x.toFixed(2)))]))]; }
function validateNarrative(out, facts) {
  const problems = [], allowed = new Set();
  for (const n of numbersIn(JSON.stringify(facts))) normalizeNum(n).forEach(x => allowed.add(x));
  for (let d = 1; d <= 31; d++) allowed.add(String(d));
  const text = JSON.stringify(out);
  for (const n of numbersIn(text)) { const v = Number(n); if (!(allowed.has(String(v)) || allowed.has(String(Math.abs(v))) || allowed.has(n))) problems.push(`number ${n} is not in the facts`); }
  const strings = []; (function walk(v) { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); })(out);
  if (strings.some(v => /[“"‘]([^”"’]{20,})[”"’]/.test(v))) problems.push('contains a quotation');
  if (/\b(?:I|we) (?:believe|recommend)|you should (?:buy|sell)|guaranteed|will definitely/i.test(text)) problems.push('contains advice or certainty language');
  const sources = new Set((facts.sources || []).map(s => s.publisher.toLowerCase()));
  for (const m of text.matchAll(/[Aa]ccording to ([A-Z][\w&. ]{2,30}?)(?=[,.;])/g)) if (![...sources].some(s => m[1].toLowerCase().includes(s) || s.includes(m[1].toLowerCase()))) problems.push(`cites unlisted source ${m[1]}`);
  const required = ['headline', 'overview', 'whatHappened', 'whyItMatters', 'analysis'];
  for (const k of required) if (!out?.[k] || (typeof out[k] === 'string' && out[k].length < 20)) problems.push(`missing ${k}`);
  if (out?.headline && out.headline.length > 110) problems.push('headline too long');
  return [...new Set(problems)].slice(0, 8);
}
async function aiNarrative(facts, {apiKey, model = 'claude-haiku-5-5', fetchImpl = fetch} = {}) {
  if (!apiKey) return {status: 'not-configured'};
  const system = 'You are the FYNX Intelligence desk. Write original financial analysis in plain English from ONLY the JSON facts provided. Rules: never invent numbers, dates, names, quotes or sources; every number you write must appear in the facts; do not quote publishers; do not reproduce their sentences; separate what is reported from interpretation; state uncertainty plainly; no investment advice; omit an asset class when the facts show no real link. Return JSON only.';
  const schema = '{"headline":"<=100 chars, factual, not clickbait","overview":"2-3 sentences","whatHappened":["3-5 short factual bullets naming people, companies, figures from facts"],"whyItMatters":"2-4 sentences","marketImpact":{"stocks|forex|crypto|commodities|indices|rates":"1-2 sentences, only for classes in facts.markets"},"analysis":"3-5 sentences using facts.marketData and facts.macro","bull":"1-2 sentences","bear":"1-2 sentences","shortTerm":"1-2 sentences","longTerm":"1-2 sentences","risks":["2-4 specific risks"],"uncertainty":"1-2 sentences on what is not yet known"}';
  let messages = [{role: 'user', content: `Facts:\n${JSON.stringify(facts)}\n\nReturn exactly this JSON shape:\n${schema}`}];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {method: 'POST', headers: {'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'}, body: JSON.stringify({model, max_tokens: 1400, system, messages}), signal: AbortSignal.timeout(60000)});
    if (!res.ok) return {status: 'error', error: 'HTTP ' + res.status};
    const data = await res.json(), text = (data.content || []).map(c => c.text || '').join('');
    let out; try { out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { out = null; }
    const problems = out ? validateNarrative(out, facts) : ['response was not JSON'];
    if (!problems.length) return {status: 'ok', narrative: out, model};
    messages = [...messages, {role: 'assistant', content: text}, {role: 'user', content: 'Fix these problems and return the full JSON again: ' + problems.join('; ')}];
    if (attempt === 1) return {status: 'rejected', problems};
  }
  return {status: 'rejected'};
}

module.exports = {instrumentStats, macroContext, catalysts, dataAnalysis, aiNarrative, validateNarrative, priceText, fmtDate, sinceText, RATE_SYMBOLS};
