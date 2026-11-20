'use strict';
/* Earnings research from public sources, as pure functions so they can be tested without the network.
 * - Earnings releases: 8-K filings that report SEC Item 2.02 (Results of Operations and Financial Condition), with the
 *   SEC acceptance time (Eastern) so the market reaction can be placed on the right trading day.
 * - Release tone: counts of positive, negative and uncertain finance words in the Exhibit 99.1 press release, and
 *   whether the guidance language reads raised, lowered or maintained. FYNX's own word lists; only counts are
 *   returned, never the company's text.
 * - Quarterly diluted EPS from XBRL company facts (three-month periods), matched to each release with the
 *   year-earlier quarter.
 * - Consensus surprises from Nasdaq's earnings-surprise table when that source answers. */

const DAY = 86400000;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const isoDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;

function earningsReleases(sub, n = 8) {
  const r = sub?.filings?.recent; if (!r || !Array.isArray(r.form)) return [];
  const out = [];
  for (let i = 0; i < r.form.length && out.length < n; i++) {
    if (r.form[i] !== '8-K' || !String(r.items?.[i] || '').split(',').map(s => s.trim()).includes('2.02')) continue;
    const filed = isoDay(r.filingDate?.[i]), accession = String(r.accessionNumber?.[i] || '');
    if (!filed || !/^\d{10}-\d{2}-\d{6}$/.test(accession)) continue;
    // SEC acceptance times are Eastern even though the string ends in Z
    const acc = String(r.acceptanceDateTime?.[i] || ''), m = acc.match(/T(\d{2}):(\d{2})/), minutes = m ? +m[1] * 60 + +m[2] : null;
    out.push({accession, filed, reportDate: isoDay(r.reportDate?.[i]), acceptedET: m ? `${m[1]}:${m[2]}` : null, session: minutes === null ? 'unknown' : minutes >= 960 ? 'after close' : minutes < 570 ? 'before open' : 'during market', primary: String(r.primaryDocument?.[i] || '')});
  }
  return out;
}

// Choose the press-release exhibit from a filing's index.json listing.
function pickExhibit(index, primary) {
  const items = (index?.directory?.item || []).filter(x => x && typeof x.name === 'string' && /\.(?:htm|html|txt)$/i.test(x.name) && !/index|^R\d+\.htm$|\.xml$|FilingSummary/i.test(x.name));
  const ex = items.filter(x => /ex[-_]?99(?:[-_.]?0?1)?(?!\d)|ex991|exhibit[-_]?99|dex99/i.test(x.name) && x.name !== primary);
  const size = x => Number(x.size) || 0;
  if (ex.length) return ex.sort((a, b) => (/99[-_.]?0?1/.test(b.name) - /99[-_.]?0?1/.test(a.name)) || size(b) - size(a))[0].name;
  const others = items.filter(x => x.name !== primary).sort((a, b) => size(b) - size(a));
  return others[0]?.name || primary || null;
}

const ENT = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…'};
function htmlToText(html, limit = 400000) {
  return String(html || '').slice(0, limit * 3)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '. ').replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Math.min(+n, 0xffff))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(Math.min(parseInt(h, 16), 0xffff))).replace(/&([a-z]+);/gi, (m, e) => ENT[e.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ').replace(/\.(?:\s*\.)+/g, '.').trim().slice(0, limit);
}

const POS = new Set('achieve achieved accelerate accelerated accelerating beat beats best better boost boosted breakthrough confident delivered delivering double-digit efficient enhance enhanced exceed exceeded exceeding excellent expand expanded expanding expansion favorable gain gains grew growing growth high-quality improve improved improvement improving increase increased increasing innovation innovative leadership momentum opportunities opportunity outperform outperformed pleased positive profitable profitability progress raise raised raising rebound record recovery robust solid strength strengthen strengthened strong stronger strongest success successful surpassed tailwind tailwinds upside'.split(' '));
const NEG = new Set('adverse adversely challenge challenged challenges challenging closure closures constrained cut cuts decline declined declines declining decrease decreased decreasing deficit delay delayed delays deteriorate deteriorated deterioration difficult disappointing disruption disruptions downturn drop dropped failure fell headwind headwinds impairment impairments inflationary investigation layoffs litigation loss losses lower lowered lowering negative negatively penalties pressure pressures recall restructuring shortfall slow slowdown slowed slower soft softer softness termination unfavorable volatile volatility weak weaker weakness worse writedown write-down'.split(' '));
const UNC = new Set('anticipate anticipated anticipates approximately assume assumption assumptions believe believes could depend depends estimate estimated estimates expect expected expects fluctuate fluctuations may might pending possible possibly predict probable risk risks roughly uncertain uncertainties uncertainty unknown unpredictable variable'.split(' '));
const NEGATE = new Set(['not', 'no', 'never', 'without', 'neither', 'nor']);
function releaseTone(text) {
  const words = String(text || '').toLowerCase().match(/[a-z][a-z'-]*/g) || [];
  let pos = 0, neg = 0, unc = 0;
  words.forEach((w, i) => { const flip = NEGATE.has(words[i - 1]) || NEGATE.has(words[i - 2]); if (POS.has(w)) flip ? neg++ : pos++; else if (NEG.has(w)) flip ? pos++ : neg++; if (UNC.has(w)) unc++; });
  // guidance: sentences that talk about the outlook, read for direction
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).filter(s => /\b(?:guidance|outlook|full[- ]year|fiscal (?:year )?20\d\d|next quarter)\b/i.test(s) && /\b(?:expects?|now sees|anticipates?|forecasts?|guidance|outlook|projects?)\b/i.test(s));
  let up = 0, down = 0, keep = 0;
  for (const s of sentences) { if (/\b(?:rais(?:e|es|ed|ing)|increas(?:e|es|ed|ing) (?:its |our |the )?(?:guidance|outlook)|above (?:the )?(?:high end|previous)|higher than (?:previous|prior))\b/i.test(s)) up++; else if (/\b(?:lower(?:s|ed|ing)? (?:its |our |the )?(?:guidance|outlook|forecast)|reduc(?:e|es|ed|ing) (?:its |our |the )?(?:guidance|outlook)|cut(?:s|ting)? (?:its |our |the )?(?:guidance|outlook)|withdr(?:aw|ew|awn|awing)|below (?:the )?(?:low end|previous))\b/i.test(s)) down++; else if (/\b(?:reaffirm(?:s|ed|ing)?|reiterat(?:e|es|ed|ing)|maintain(?:s|ed|ing)?|confirm(?:s|ed|ing)?)\b/i.test(s)) keep++; }
  const guidance = up > down ? 'raised' : down > up ? 'lowered' : keep ? 'maintained' : sentences.length ? 'given' : 'none';
  const n = words.length || 1;
  return {words: words.length, pos, neg, unc, tone: pos + neg ? (pos - neg) / (pos + neg) : 0, posPer1k: 1000 * pos / n, negPer1k: 1000 * neg / n, uncPer1k: 1000 * unc / n, guidance, guidanceSentences: sentences.length};
}

// Three-month diluted EPS facts (basic as fallback), newest filing wins for each period.
function quarterlyEPS(facts) {
  const g = facts?.facts?.['us-gaap'] || {}, pick = g.EarningsPerShareDiluted || g.EarningsPerShareBasic;
  const rows = pick?.units?.['USD/shares'] || []; const by = new Map();
  for (const f of rows) {
    const s = isoDay(f.start), e = isoDay(f.end); if (!s || !e || !finite(f.val)) continue;
    const days = (Date.parse(e) - Date.parse(s)) / DAY; if (days < 80 || days > 100) continue;
    const old = by.get(e); if (!old || String(f.filed) > String(old.filed)) by.set(e, {end: e, start: s, eps: f.val, filed: isoDay(f.filed), form: f.form});
  }
  return [...by.values()].sort((a, b) => a.end.localeCompare(b.end));
}
// EPS for the quarter a release reports: the latest quarter ending 0–120 days before the release; YoY quarter ~1 year earlier.
function matchEPS(eps, filed) {
  const t = Date.parse(filed); const q = eps.filter(x => { const d = (t - Date.parse(x.end)) / DAY; return d >= 0 && d <= 120; }).pop(); if (!q) return null;
  const target = Date.parse(q.end) - 365 * DAY, prev = eps.filter(x => Math.abs(Date.parse(x.end) - target) <= 20 * DAY).pop();
  return {quarterEnd: q.end, eps: q.eps, prevEPS: prev ? prev.eps : null, yoy: prev && prev.eps ? (q.eps - prev.eps) / Math.abs(prev.eps) : null};
}

const num = v => { if (finite(v)) return v; const s = String(v ?? '').replace(/[$,\s]/g, ''); if (!s || /^(?:n\/?a|--?)$/i.test(s)) return null; const neg = /^\(.*\)$/.test(s), x = Number(s.replace(/[()]/g, '')); return Number.isFinite(x) ? (neg ? -x : x) : null; };
function parseSurprises(payload) {
  const rows = payload?.data?.earningsSurpriseTable?.rows; if (!Array.isArray(rows)) return [];
  return rows.map(r => { const m = String(r.dateReported || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return {fiscal: String(r.fiscalQtrEnd || '').slice(0, 20), date: m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null, eps: num(r.eps), consensus: num(r.consensusForecast), surprisePct: num(r.percentageSurprise)}; })
    .filter(r => r.date && finite(r.eps)).slice(0, 12);
}

module.exports = {earningsReleases, pickExhibit, htmlToText, releaseTone, quarterlyEPS, matchEPS, parseSurprises};
