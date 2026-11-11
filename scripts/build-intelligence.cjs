#!/usr/bin/env node
'use strict';
/* FYNX Intelligence publisher.
 * 1. Reads headline metadata from the FYNX news service (publisher RSS feeds / news services).
 * 2. Groups reports of the same event.  3. Links each story to markets and companies it names.
 * 4. Computes market data, rates context and dated catalysts from FYNX's public data snapshots.
 * 5. Optionally drafts narrative with an AI model (ANTHROPIC_API_KEY) and rejects drafts that
 *    add unsupported numbers, quotations or sources.  6. Holds sensitive stories for review.
 * 7. Writes article records (intelligence/data), static pages and an Intelligence sitemap.
 * Usage: node scripts/build-intelligence.cjs [--offline <dir with feeds.json>] */
const fs = require('node:fs/promises'), path = require('node:path'), {createHash} = require('node:crypto');
const Reader = require('../backend/news-reader.cjs');
const E = require('./intelligence/entities.cjs'), A = require('./intelligence/analysis.cjs'), R = require('./intelligence/render.cjs');

const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'intelligence'), DATA = path.join(OUT, 'data');
const FEED = 'https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketFeed';
const RAW = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/';
const EDITIONS = ['us', 'global', 'uk', 'europe', 'asia'];
const CATEGORIES = ['all', 'stocks', 'forex', 'crypto', 'macro', 'commodities', 'finance', 'economics', 'technology', 'energy', 'industries'];
const DAY = 86400000, KEEP_DAYS = 21, RECHECK_HOURS = 36, MAX_NEW = Number(process.env.INTELLIGENCE_MAX_NEW || 30), MAX_RECORDS = 600;
// Not news events: quote pages, investor-conference notices and programme listings.
const NOT_NEWS = /\b(stock price, news, quote|quote and history|stock quote|share price (?:today|chart)|to (?:participate|present) (?:in|at)|fireside chat|conference call|webcast|announces? (?:date|timing) (?:of|for)|rewind|podcast|live updates?:|market brief \(|newsletter|price targets?|upside for|analysts? (?:like|love|hate|bullish|bearish)|should you buy|is it a buy|best crypto to buy|at close of trade|convert \d+|price in (?:[A-Z]|british|us|singapore)|^economic outlook$|stocks? to (?:buy|watch)|undervalued)\b/i;
const HOLD = /\b(killed|dead|death|dies|died|shooting|shot|murder|rape|sexual|abuse|assault|suicide|terror|bomb|massacre|accused|alleg(?:e|es|ed|ation|ations)|lawsuit|sued|indicted|charged with|arrested|fraud|scandal|investigat(?:ion|ed|ing) into)\b/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, timeout = 20000) {
  const res = await fetch(url, {headers: {'User-Agent': 'FYNX-Intelligence/1.0 (+https://www.fynxfinanceworld.com/intelligence/method.html)', Accept: 'application/json', Origin: 'https://www.fynxfinanceworld.com'}, signal: AbortSignal.timeout(timeout)});
  if (!res.ok) throw new Error(`HTTP ${res.status} ${new URL(url).pathname}`);
  return res.json();
}
async function pool(items, size, task) { const out = []; let i = 0; await Promise.all(Array.from({length: size}, async () => { while (i < items.length) { const k = i++; try { out[k] = await task(items[k]); } catch (e) { out[k] = {error: e.message}; } } })); return out; }
const readJSON = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
const tokens = t => [...new Set(Reader.plain(t).toLowerCase().match(/[a-z][a-z\d-]{3,}/g) || [])].filter(w => !STOP.has(w));
const STOP = new Set('this that with from have into about after before when where will would could should their there these those more than over under says said news market markets stock stocks updates latest report reports business world company shares finance amid what your here first year week today live price prices'.split(/\s+/));
const cleanTitle = item => Reader.plain(item.title, 300).replace(new RegExp('\\s[-–|]\\s' + Reader.plain(item.source, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '').trim();
const slugify = (t, id) => (t.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 72).replace(/-[^-]*$/, '') || 'story') + '-' + id.slice(0, 6);
const short = id => id.slice(0, 16);

async function loadFeeds(offline) {
  if (offline) return readJSON(path.join(offline, 'feeds.json'), []);
  const jobs = EDITIONS.flatMap(edition => CATEGORIES.map(category => ({edition, category})));
  const res = await pool(jobs, 4, async ({edition, category}) => (await getJSON(`${FEED}?${new URLSearchParams({edition, category})}`)).items.map(i => ({...i, edition, category: i.category || category})));
  const failures = res.filter(r => r?.error).length;
  console.log(`feeds: ${jobs.length - failures}/${jobs.length} ok`);
  return res.filter(Array.isArray).flat();
}
async function loadData(offline) {
  if (offline) return {markets: await readJSON(path.join(offline, 'markets.json')), desk: await readJSON(path.join(offline, 'desk.json')), earnings: await readJSON(path.join(offline, 'earnings.json')), symbols: await readJSON(path.join(offline, 'symbols.json'))};
  const [markets, earnings, desk, symbols] = await Promise.all([RAW + 'terminal-data/markets.json', RAW + 'terminal-data/earnings.json', RAW + 'macro-data/desk.json', RAW + 'world-data/symbols.json'].map(u => getJSON(u, 60000).catch(e => { console.warn('data', u, e.message); return null; })));
  return {markets, earnings, desk, symbols};
}

/* Yahoo daily history for companies that FYNX's snapshot does not already carry. */
async function extraQuotes(tickers, now) {
  const out = {};
  await pool(tickers.slice(0, 40), 3, async t => {
    const data = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=1y&interval=1d`, 15000);
    const r = data?.chart?.result?.[0], m = r?.meta; if (!m || !Number.isFinite(m.regularMarketPrice)) return;
    const gmt = m.gmtoffset || 0, closes = r.indicators?.quote?.[0]?.close || [], rows = [];
    (r.timestamp || []).forEach((ts, i) => { const c = closes[i]; if (Number.isFinite(c) && c > 0) { const d = new Date((ts + gmt) * 1000).toISOString().slice(0, 10); if (rows.at(-1)?.[0] === d) rows[rows.length - 1] = [d, c]; else rows.push([d, c]); } });
    const marketDate = new Date((m.regularMarketTime + gmt) * 1000).toISOString().slice(0, 10), prior = rows.filter(x => x[0] < marketDate), prev = prior.at(-1)?.[1];
    if (rows.at(-1)?.[0] !== marketDate) rows.push([marketDate, m.regularMarketPrice]); else rows[rows.length - 1][1] = m.regularMarketPrice;
    const rets = []; for (let i = Math.max(1, rows.length - 21); i < rows.length - 1; i++) rets.push(Math.log(rows[i][1] / rows[i - 1][1]) * 100);
    const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1), vol20 = rets.length > 5 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)) : null;
    out[t] = {symbol: t, name: m.longName || m.shortName || t, price: m.regularMarketPrice, previousClose: prev, changePercent: prev ? (m.regularMarketPrice / prev - 1) * 100 : null, vol20, asOf: new Date(m.regularMarketTime * 1000).toISOString(), stale: m.regularMarketTime * 1000 < now - 4 * DAY, history: rows.slice(-260)};
    await sleep(250);
  });
  return out;
}

/* Group reports of the same event: shared distinctive words across different publishers. */
function cluster(items, now) {
  const fresh = new Map();
  for (const it of items) {
    const url = Reader.safeURL(it.link || it.url), t = Date.parse(it.pubDate || it.publishedAt);
    if (NOT_NEWS.test(it.title || '') || cleanTitle(it).split(/\s+/).length < 4) continue;
    if (!url || !Number.isFinite(t) || now - t > 2 * DAY || t > now + 600000 || (Reader.isNewsworthy && !Reader.isNewsworthy(it))) continue;
    const id = Reader.articleId(url);
    if (!fresh.has(id)) fresh.set(id, {...it, url, id, title: cleanTitle(it), source: Reader.plain(it.source, 120) || new URL(url).hostname, publishedAt: new Date(t).toISOString(), terms: tokens(cleanTitle(it))});
  }
  const rows = [...fresh.values()].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  // Rare words carry the event ("Payward", "Goolsbee"); common ones ("Wall Street", "stock") do not.
  const df = new Map(); for (const r of rows) for (const w of r.terms) df.set(w, (df.get(w) || 0) + 1);
  const idf = w => Math.log((rows.length + 1) / (1 + (df.get(w) || 0)));
  const weight = terms => terms.reduce((s, w) => s + idf(w), 0);
  const similar = (a, b) => { const shared = a.terms.filter(w => b.terms.includes(w)); return (shared.length >= 3 || (shared.length === 2 && Math.min(a.terms.length, b.terms.length) <= 2)) && weight(shared) / Math.min(weight(a.terms), weight(b.terms)) >= 0.5; };
  const groups = [];
  for (const row of rows) {
    const g = groups.find(g => similar(g.items[0], row) && Math.abs(Date.parse(row.publishedAt) - Date.parse(g.items[0].publishedAt)) < 30 * 3600000);
    if (g) { if (!g.items.some(o => o.source === row.source)) g.items.push(row); } else groups.push({items: [row]});
  }
  return groups;
}

async function readerExcerpt(item) {
  try {
    const data = await getJSON(`${FEED}?${new URLSearchParams({kind: 'article', id: item.id, edition: item.edition || 'us', category: item.category || 'all'})}`, 12000);
    const a = data.article; if (!a || a.coverageLevel === 'headline-only' || !a.summary || a.summary === a.title) return null;
    const words = a.summary.split(/\s+/); if (words.length < 8) return null;
    return {text: words.slice(0, 30).join(' ').replace(/[,;:]$/, '') + (words.length > 30 ? '…' : ''), publisher: a.source, numbers: (a.numbers || []).map(n => n.value).slice(0, 4)};
  } catch { return null; }
}

function relatedFor(rec, all) {
  const syms = new Set(rec.stats.map(s => s.symbol)), cos = new Set(rec.companies.map(c => c.ticker || c.name)), themes = new Set(rec.themes.map(t => t.label)), words = tokens(rec.headline);
  return all.filter(o => o.slug !== rec.slug).map(o => ({o, score: o.companies.filter(c => cos.has(c.ticker || c.name)).length * 4 + o.stats.filter(s => syms.has(s.symbol)).length * 2 + o.themes.filter(t => themes.has(t.label)).length * 2 + tokens(o.headline).filter(w => words.includes(w)).length}))
    .filter(x => x.score >= 3).sort((a, b) => b.score - a.score || Date.parse(b.o.publishedAt) - Date.parse(a.o.publishedAt)).slice(0, 5).map(x => x.o.slug);
}

function summaryLine(rec) {
  const p = rec.sources[0], others = rec.sources.length - 1, lead = rec.stats[0];
  let text = `${p.publisher} reported this story on ${R.when(p.publishedAt)}${others ? `, and ${others} other outlet${others > 1 ? 's' : ''} (${rec.sources.slice(1, 4).map(s => s.publisher).join(', ')}) covered the same development` : ''}.`;
  if (lead) text += ` At FYNX's latest market snapshot, ${lead.name} was at ${lead.priceText}, ${lead.dayText} on the session.`;
  return text;
}
function whyLine(rec) {
  const big = rec.stats.filter(s => Number.isFinite(s.zscore) && Math.abs(s.zscore) >= 1.5), small = rec.stats.filter(s => Number.isFinite(s.zscore) && Math.abs(s.zscore) < 1);
  const parts = [`The story names ${[...rec.themes.map(t => t.label), ...rec.companies.map(c => c.name + (c.ticker ? ` (${c.ticker})` : ''))].slice(0, 4).join(', ')}.`];
  if (big.length) parts.push(`${big.map(s => `${s.name} (${s.dayText})`).join(' and ')} moved more than 1.5 times ${big.length > 1 ? 'their' : 'its'} typical daily range, so prices show a larger-than-usual reaction on the day.`);
  if (small.length) parts.push(`${small.map(s => `${s.name} (${s.dayText})`).join(', ')} stayed within a normal day's range.`);
  const fed = rec.macro.find(m => m.kind === 'fed'); if (fed) parts.push(fed.text);
  const next = rec.catalysts[0]; if (next) parts.push(`The next dated event tied to it is ${next.title} on ${R.when(next.date).replace(/,? \d+:\d+ [AP]M UTC$/, '') || next.date}.`);
  return parts.join(' ');
}

async function main() {
  const args = process.argv.slice(2), offline = args.includes('--offline') ? args[args.indexOf('--offline') + 1] : null;
  const now = Date.now(), nowISO = new Date(now).toISOString();
  const [items, data, db] = await Promise.all([loadFeeds(offline), loadData(offline), readJSON(path.join(DATA, 'articles.json'), {articles: []})]);
  if (!data.markets?.quotes) throw new Error('Market snapshot unavailable; nothing published.');
  if (process.env.INTELLIGENCE_DUMP) await fs.writeFile(process.env.INTELLIGENCE_DUMP, JSON.stringify(items));
  const quotes = {...data.markets.quotes}, listings = E.buildListingIndex(data.symbols?.rows || []);
  const records = new Map((db.articles || []).filter(r => now - Date.parse(r.publishedAt) < KEEP_DAYS * DAY).map(r => [r.id, r]));
  const owner = new Map(); for (const r of records.values()) for (const a of r.articleIds) owner.set(a, r.id);
  const groups = cluster(items, now);
  // Link every group, then fetch history for named companies the snapshot does not carry.
  // Headlines only: feed descriptions are often unrelated teaser text.
  for (const g of groups) { const text = g.items.map(i => i.title).join(' \n '); g.link = E.linkStory(text, {listings, quotes}); }
  const need = [...new Set(groups.flatMap(g => g.link.companies.map(c => c.ticker)).filter(t => t && !quotes[t]))];
  if (!offline && need.length) Object.assign(quotes, await extraQuotes(need, now));
  const review = [];
  let created = 0, updated = 0;
  // Larger, better-sourced, newer groups first.
  groups.sort((a, b) => b.items.length - a.items.length || Date.parse(b.items.at(-1).publishedAt) - Date.parse(a.items.at(-1).publishedAt));
  for (const g of groups) {
    const ownerId = g.items.map(i => owner.get(short(i.id))).find(Boolean), existing = ownerId && records.get(ownerId);
    if (existing && now - Date.parse(existing.publishedAt) > RECHECK_HOURS * 3600000) continue;
    // A company leads only when the main headline is about it; otherwise the macro market leads.
    const lead = [...g.items].sort((a, b) => (Reader.editorialTier?.(b) || 0) - (Reader.editorialTier?.(a) || 0) || Date.parse(a.publishedAt) - Date.parse(b.publishedAt))[0].title;
    const companyMarkets = g.link.companies.filter(c => c.ticker && quotes[c.ticker]).map(c => ({symbol: c.ticker, assetClass: 'stocks', theme: c.name, label: c.name, inLead: E.linkStory(lead, {quotes: {}}).companies.some(x => x.ticker === c.ticker)}));
    const linked = [...companyMarkets.filter(c => c.inLead), ...g.link.markets, ...companyMarkets.filter(c => !c.inLead)].filter((m, i, a) => a.findIndex(x => x.symbol === m.symbol) === i);
    const stats = linked.map(m => { const s = A.instrumentStats(m.symbol, quotes[m.symbol]); return s && !s.stale ? {...s, name: m.label || s.name, assetClass: m.assetClass} : null; }).filter(Boolean).slice(0, 6);
    const text = g.items.map(i => i.title).join(' ');
    if (!stats.length) continue;
    // Company-only stories need a business angle (results, deals, shares…), not just a brand mention.
    if (!g.link.themes.length && !/\b(shares?|stocks?|earnings|revenue|profit|loss|results|deal|acqui\w+|merger|IPO|valuation|sales|CEO|chief executive|layoffs?|jobs|buyback|guidance|forecast|billion|million|bn|investors?|market|downgrade|upgrade|rating|bond|debt|dividend|tariffs?)\b|[$€£%]/i.test(g.items.map(i => i.title).join(' '))) continue;
    if (HOLD.test(text)) { review.push({reason: 'sensitive subject', title: g.items[0].title, sources: g.items.map(i => i.source), at: nowISO}); continue; }
    if (!existing && created >= MAX_NEW) continue;
    const primary = [...g.items].sort((a, b) => (Reader.editorialTier?.(b) || 0) - (Reader.editorialTier?.(a) || 0) || Date.parse(a.publishedAt) - Date.parse(b.publishedAt))[0];
    const sources = [primary, ...g.items.filter(i => i !== primary)].slice(0, 8).map(i => ({publisher: i.source, title: i.title, url: i.url, publishedAt: i.publishedAt}));
    const newSources = !existing || sources.length > existing.sources.length;
    const excerpt = existing && !newSources ? existing.excerpt : offline ? null : await readerExcerpt(primary);
    if (sources.length < 2 && !excerpt) continue; // too little source material for a meaningful page
    const macro = A.macroContext(data.desk, g.link.themes, linked), catalysts = A.catalysts({companies: g.link.companies, markets: linked, themes: g.link.themes}, {earnings: data.earnings, desk: data.desk}, now);
    const dataPoints = A.dataAnalysis(stats, macro).points;
    const id = existing?.id || createHash('sha256').update(primary.id).digest('hex').slice(0, 12);
    const rec = {id, slug: existing?.slug || slugify(primary.title, id), articleIds: [...new Set([...(existing?.articleIds || []), ...g.items.map(i => short(i.id))])],
      headline: existing?.headline || primary.title, publishedAt: existing?.publishedAt || nowISO, updatedAt: nowISO, analyzedAt: newSources ? nowISO : existing.analyzedAt,
      sources, excerpt, markets: linked.map(m => m.symbol), stats, companies: g.link.companies, themes: g.link.themes, macro, catalysts, dataPoints,
      facts: [...sources.slice(0, 5).map(s => `${s.publisher} (${R.when(s.publishedAt)}): ${s.title}`), ...(excerpt?.numbers?.length ? [`Figures in the ${excerpt.publisher} brief: ${excerpt.numbers.join(', ')}`] : [])],
      method: existing?.method || 'data', narrative: existing?.narrative || null, model: existing?.model || null};
    rec.summary = summaryLine(rec); rec.whyData = whyLine(rec);
    if (process.env.ANTHROPIC_API_KEY && (newSources || !rec.narrative)) {
      const facts = {storyHeadlines: sources.map(s => ({publisher: s.publisher, publishedAt: s.publishedAt, headline: s.title})), sourceExcerpt: excerpt ? {publisher: excerpt.publisher, text: excerpt.text} : null, sources: sources.map(s => ({publisher: s.publisher})),
        companies: rec.companies, themes: rec.themes.map(t => t.label), markets: [...new Set(stats.map(s => s.assetClass))], marketData: stats.map(s => ({name: s.name, symbol: s.symbol, last: s.priceText, day: s.dayText, oneMonth: s.m1, yearToDate: s.ytd, fromHigh: s.fromHigh, high: s.high, typicalDailySwingPct: s.sigma, moveVsTypical: s.zscore, asOf: s.asOf})),
        macro: macro.map(m => m.text), upcoming: catalysts.map(c => ({date: c.date, event: c.title, detail: c.detail})), computedNotes: dataPoints.map(p => p.text)};
      const r = await A.aiNarrative(facts, {apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.INTELLIGENCE_MODEL || 'claude-haiku-5-5'}).catch(e => ({status: 'error', error: e.message}));
      if (r.status === 'ok') { rec.narrative = r.narrative; rec.method = 'ai'; rec.model = r.model; rec.headline = existing?.headline && existing.method === 'ai' ? existing.headline : r.narrative.headline; }
      else if (r.status === 'rejected') { review.push({reason: 'AI draft failed checks: ' + (r.problems || []).join('; '), title: primary.title, sources: sources.map(s => s.publisher), at: nowISO}); if (!existing) continue; }
      else console.warn('AI narrative', r.status, r.error || '');
    }
    records.set(id, rec); if (existing) updated++; else created++;
  }
  // Original-source links point at the publisher, not at a news aggregator's redirect.
  if (!offline) {
    const {resolveGoogle} = require('../fn/preview.js'), todo = [...records.values()].flatMap(r => r.sources).filter(s => /(^|\.)news\.google\.com$/.test(new URL(s.url).hostname));
    await pool(todo, 4, async s => { try { s.url = await resolveGoogle(s.url); } catch { /* keep the working redirect link */ } });
  }
  const latest = r => Math.max(...r.sources.map(x => Date.parse(x.publishedAt)));
  let list = [...records.values()].sort((a, b) => latest(b) - latest(a)).slice(0, MAX_RECORDS);
  for (const r of list) r.related = relatedFor(r, list);
  // Write pages: remove pages that aged out, then render.
  await fs.mkdir(DATA, {recursive: true});
  const keep = new Set(list.map(r => r.slug));
  for (const d of await fs.readdir(OUT, {withFileTypes: true})) if (d.isDirectory() && d.name !== 'data' && !keep.has(d.name)) await fs.rm(path.join(OUT, d.name), {recursive: true, force: true});
  const reader = await fs.readFile(path.join(ROOT, 'news/article.html'), 'utf8');
  const assets = reader.split('</head>')[0].split('\n').filter(l => /<(script|link)\b/.test(l) && !/news-reader\.(css|js)|rel="icon"/.test(l)).join('\n');
  const ctx = {assets, bySlug: new Map(list.map(r => [r.slug, r])), generatedAt: nowISO};
  for (const r of list) { await fs.mkdir(path.join(OUT, r.slug), {recursive: true}); await fs.writeFile(path.join(OUT, r.slug, 'index.html'), R.articlePage(r, ctx)); }
  await fs.writeFile(path.join(OUT, 'index.html'), R.hubPage(list, ctx));
  await fs.writeFile(path.join(OUT, 'method.html'), R.methodPage(ctx));
  const map = {}; for (const r of list) for (const a of r.articleIds) map[a] = r.slug;
  await fs.writeFile(path.join(DATA, 'map.json'), JSON.stringify({generatedAt: nowISO, map}) + '\n');
  await fs.writeFile(path.join(DATA, 'articles.json'), JSON.stringify({version: 1, generatedAt: nowISO, articles: list}) + '\n');
  const prevReview = (await readJSON(path.join(DATA, 'review.json'), {items: []})).items.filter(x => now - Date.parse(x.at) < 3 * DAY);
  await fs.writeFile(path.join(DATA, 'review.json'), JSON.stringify({generatedAt: nowISO, items: [...review, ...prevReview].slice(0, 200)}, null, 1) + '\n');
  const urls = [R.SITE + '/intelligence/', R.SITE + '/intelligence/method.html', ...list.map(r => `${R.SITE}/intelligence/${r.slug}/`)];
  await fs.writeFile(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u, i) => `<url><loc>${u}</loc><lastmod>${(i < 2 ? nowISO : list[i - 2].updatedAt).slice(0, 10)}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  console.log(`groups ${groups.length} · created ${created} · updated ${updated} · published ${list.length} · held for review ${review.length} · AI ${process.env.ANTHROPIC_API_KEY ? 'on' : 'off'}`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = {cluster, slugify, relatedFor, cleanTitle, NOT_NEWS};
