'use strict';
/* FYNX Intelligence HTML. Pages are static, crawlable and self-describing:
 * unique title, description, canonical URL and NewsArticle structured data. */
const SITE = 'https://www.fynxfinanceworld.com';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const when = iso => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC'}) + ' UTC' : ''; };
const day = iso => { const d = new Date(String(iso).length === 10 ? iso + 'T12:00:00Z' : iso); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC'}) : ''; };
const CLASS_LABEL = {stocks: 'Stocks', forex: 'Forex', crypto: 'Crypto', commodities: 'Commodities', indices: 'Indices', rates: 'Interest rates'};

function head({title, description, canonical, robots = 'index,follow', jsonld, assets}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="FYNX Finance World"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary"><meta name="theme-color" content="#000000">
<link rel="icon" href="/favicon-32x32.png">
${assets}
<link rel="stylesheet" href="/assets/css/intelligence.css?v=${esc(assets.match(/\?v=([\w-]+)/)?.[1] || '1')}">
<script src="/assets/js/intelligence.js?v=${esc(assets.match(/\?v=([\w-]+)/)?.[1] || '1')}" defer></script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>`;
}
function shell(body, nav = 'news') {
  return `<body data-fynx-layout="standalone" data-fynx-terminal class="fx-intel-page">
<a class="fx-skip" href="#fx-main">Skip to the analysis</a>
<header class="discovery-header"><a class="discovery-brand" href="/" aria-label="FYNX Finance World home">FYNX<span>FINANCE WORLD</span></a><nav aria-label="Account and appearance"><a href="/profile.html">Account</a></nav></header>
<nav class="terminal-navigation" aria-label="Workspace navigation"><a href="/home.html">Home</a><a href="/journal.html">Journal</a><a href="/calculator.html">Calculator</a><a href="/news.html"${nav === 'news' ? ' aria-current="page"' : ''}>News</a><a href="/intelligence/"${nav === 'hub' ? ' aria-current="page"' : ''}>Intelligence</a><a href="/calendar.html">Calendar</a><a href="/learn.html">Learn</a><a href="/explore.html">Explore</a><a href="/tools/research-desk.html">Research</a></nav>
${body}
<footer class="fx-footer"><a href="/">FYNX <span>FINANCE WORLD</span></a><nav aria-label="Footer"><a href="/intelligence/">Intelligence</a><a href="/news.html">Newsroom</a><a href="/intelligence/method.html">How Intelligence works</a><a href="/contact.html">Contact</a><a href="/risk-disclosure.html">Risk disclosure</a></nav><p>Analysis for education and research. Not investment advice. Publishers are credited and linked; FYNX is not affiliated with or endorsed by them.</p></footer>
</body>
</html>
`;
}

function marketChips(stats) {
  if (!stats.length) return '';
  return `<div class="fx-chips" aria-label="Linked markets">${stats.slice(0, 6).map(s => `<a class="fx-chip" href="/terminal.html?sym=${encodeURIComponent(s.symbol)}"><span>${esc(s.name)}</span><b>${esc(s.priceText)}</b><i class="${s.day > 0 ? 'up' : s.day < 0 ? 'down' : ''}">${esc(s.dayText)}</i></a>`).join('')}</div>
<p class="fx-fine">Delayed prices from FYNX's market snapshot at ${esc(when(stats[0].asOf))}. Source: ${esc(stats[0].source)}.</p>`;
}
function section(id, title, inner, tag) {
  return inner ? `<section class="fx-panel" id="${id}" aria-labelledby="${id}-h"><h2 id="${id}-h">${esc(title)}${tag ? ` <small class="fx-tag fx-tag-${tag === 'Verified data' ? 'data' : tag === 'Interpretation' ? 'view' : 'ai'}">${esc(tag)}</small>` : ''}</h2>${inner}</section>` : '';
}
const para = t => t ? `<p>${esc(t)}</p>` : '';
const list = rows => rows?.length ? `<ul>${rows.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : '';

function articlePage(rec, ctx) {
  const n = rec.narrative, ai = rec.method === 'ai';
  const url = `${SITE}/intelligence/${rec.slug}/`, primary = rec.sources[0];
  const description = (n?.overview || rec.summary).replace(/\s+/g, ' ').slice(0, 155).replace(/\s\S*$/, '') + '…';
  const jsonld = {'@context': 'https://schema.org', '@type': 'NewsArticle', headline: rec.headline.slice(0, 110), description, mainEntityOfPage: url, datePublished: rec.publishedAt, dateModified: rec.updatedAt,
    author: {'@type': 'Organization', name: 'FYNX Intelligence', url: SITE + '/intelligence/'}, publisher: {'@type': 'Organization', name: 'FYNX Finance World', logo: {'@type': 'ImageObject', url: SITE + '/favicon-32x32.png'}},
    isAccessibleForFree: true, isBasedOn: rec.sources.map(s => s.url), about: [...rec.companies.map(c => ({'@type': 'Corporation', name: c.name, ...(c.ticker ? {tickerSymbol: c.ticker} : {})})), ...rec.themes.map(t => ({'@type': 'Thing', name: t.label}))]};

  const overview = ai ? para(n.overview) : `<p>${esc(rec.summary)}</p>${rec.excerpt ? `<blockquote class="fx-quote"><p>“${esc(rec.excerpt.text)}”</p><cite>— ${esc(rec.excerpt.publisher)}, short excerpt</cite></blockquote>` : ''}`;
  const happened = ai ? list(n.whatHappened) : list(rec.facts);
  const why = ai ? para(n.whyItMatters) : para(rec.whyData);
  const classes = [...new Set(rec.stats.map(s => s.assetClass))];
  const impact = ai && n.marketImpact && Object.keys(n.marketImpact).length
    ? `<dl class="fx-impact">${Object.entries(n.marketImpact).filter(([k, v]) => CLASS_LABEL[k] && v).map(([k, v]) => `<dt>${CLASS_LABEL[k]}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
    : `<dl class="fx-impact">${classes.map(c => `<dt>${CLASS_LABEL[c] || c}</dt><dd>${rec.stats.filter(s => s.assetClass === c).map(s => `${esc(s.name)} ${esc(s.dayText)} (${esc(s.priceText)})`).join(' · ')}</dd>`).join('')}</dl>`;
  const table = rec.stats.length ? `<div class="fx-table-wrap"><table class="fx-table"><caption>Linked markets at FYNX's last snapshot</caption><thead><tr><th scope="col">Market</th><th scope="col">Last</th><th scope="col">Day</th><th scope="col">1 month</th><th scope="col">Year to date</th><th scope="col">From 12-mo high</th></tr></thead><tbody>${rec.stats.map(s => { const f = v => Number.isFinite(v) ? (v >= 0 ? '+' : '') + (s.unit === 'bp' ? v.toFixed(0) + ' bp' : v.toFixed(1) + '%') : '—'; return `<tr><th scope="row">${esc(s.name)}<small>${esc(s.symbol)}</small></th><td>${esc(s.priceText)}</td><td>${esc(s.dayText)}</td><td>${f(s.m1)}</td><td>${f(s.ytd)}</td><td>${f(s.fromHigh)}</td></tr>`; }).join('')}</tbody></table></div>` : '';
  const analysis = `${ai ? para(n.analysis) : ''}${rec.dataPoints.length ? `<h3>Verified market data</h3>${rec.dataPoints.map(p => para(p.text)).join('')}` : ''}${table}${rec.macro.length ? `<h3>Rates and policy context</h3>${rec.macro.map(m => `<p>${esc(m.text)} <span class="fx-src">${esc(m.source)}</span></p>`).join('')}` : ''}`;
  const scenarios = ai && (n.bull || n.bear) ? `<div class="fx-two"><div class="fx-card fx-bull"><h3>Bullish case</h3>${para(n.bull)}</div><div class="fx-card fx-bear"><h3>Bearish case</h3>${para(n.bear)}</div></div>${n.shortTerm || n.longTerm ? `<div class="fx-two"><div class="fx-card"><h3>Short term</h3>${para(n.shortTerm)}</div><div class="fx-card"><h3>Long term</h3>${para(n.longTerm)}</div></div>` : ''}${n.risks?.length ? `<h3>Risk factors</h3>${list(n.risks)}` : ''}${n.uncertainty ? `<h3>What is not yet known</h3>${para(n.uncertainty)}` : ''}` : '';
  const watch = rec.catalysts.length ? `<ol class="fx-watch">${rec.catalysts.map(c => `<li><time datetime="${esc(c.date)}">${esc(day(c.date))}</time><div><b>${esc(c.title)}</b>${c.detail ? `<span>${esc(c.detail)}</span>` : ''}<small>${esc(c.source)}</small></div></li>`).join('')}</ol>` : '';
  const related = (rec.related || []).map(slug => ctx.bySlug.get(slug)).filter(Boolean).slice(0, 5);
  const relatedHTML = related.length ? `<ul class="fx-related">${related.map(r => `<li><a href="/intelligence/${esc(r.slug)}/"><span>${esc(r.themes[0]?.label || r.companies[0]?.name || 'Markets')}</span><b>${esc(r.headline)}</b><time datetime="${esc(r.sources[0].publishedAt)}">${esc(r.sources[0].publisher)} · ${esc(when(r.sources[0].publishedAt))}</time></a></li>`).join('')}</ul>` : '';
  const sources = `<ul class="fx-sources">${rec.sources.map(s => `<li><b>${esc(s.publisher)}</b><span>${esc(s.title)}</span><time datetime="${esc(s.publishedAt)}">${esc(when(s.publishedAt))}</time><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">Read original source</a></li>`).join('')}</ul>`;
  const companies = rec.companies.length ? `<p class="fx-entities">${rec.companies.map(c => `<span>${esc(c.name)}${c.ticker ? ` <b>${esc(c.ticker)}</b>` : ''}${c.sector ? ` · ${esc(c.sector)}` : ''}</span>`).join('')}</p>` : '';
  const method = `<p><b>Verified data</b> — prices, moves, yields, policy rates, futures pricing and event dates are computed by FYNX from the dated public sources named beside them.</p>${ai ? `<p><b>AI-assisted analysis</b> — the overview, interpretation and scenarios were drafted with an AI model (${esc(rec.model)}) from those facts and the publishers' headlines and short excerpts only. An automatic check rejects any draft that adds a number, quotation or source not present in the facts. It has not been reviewed by a human editor.</p>` : `<p><b>No AI narrative</b> — this page shows the reported headlines and FYNX's own computed market data only.</p>`}<p><b>Original reporting</b> belongs to the publishers listed above. FYNX does not reproduce their articles; open the source for the full report.</p><p>Published ${esc(when(rec.publishedAt))} · analysed ${esc(when(rec.analyzedAt))} · updated ${esc(when(rec.updatedAt))}.</p>`;

  const body = `<main id="fx-main" class="fx-main">
<article class="fx-article" data-intel-id="${esc(rec.id)}" data-intel-url="${esc(url)}" data-intel-title="${esc(rec.headline)}">
<nav class="fx-crumbs" aria-label="Breadcrumb"><a href="/intelligence/">FYNX Intelligence</a><span aria-hidden="true">/</span><span>${esc(rec.themes[0]?.label || rec.companies[0]?.sector || 'Markets')}</span></nav>
<header class="fx-head">
<p class="fx-kicker"><span class="fx-dot" aria-hidden="true"></span>FYNX INTELLIGENCE${rec.sources.length > 1 ? ` · ${rec.sources.length} SOURCES` : ''}</p>
<h1>${esc(rec.headline)}</h1>
<p class="fx-byline"><b>${esc(primary.publisher)}</b> reported ${esc(when(primary.publishedAt))}${rec.sources.length > 1 ? ` · also ${esc(rec.sources.slice(1, 4).map(s => s.publisher).join(', '))}` : ''}<br><span>FYNX analysis updated <time datetime="${esc(rec.updatedAt)}">${esc(when(rec.updatedAt))}</time></span></p>
<div class="fx-actions"><button type="button" class="fx-btn" data-intel-bookmark aria-pressed="false">Bookmark</button><button type="button" class="fx-btn" data-intel-share>Share</button><a class="fx-btn fx-btn-primary" href="${esc(primary.url)}" target="_blank" rel="noopener noreferrer nofollow">Read original source</a></div>
<div class="fx-photo" data-story-photo="${esc(primary.url)}" data-story-title="${esc(primary.title)}"></div>
${companies}
${marketChips(rec.stats)}
</header>
${section('overview', 'News overview', overview, ai ? 'AI-assisted' : null)}
${section('what-happened', 'What happened', happened, ai ? 'AI-assisted' : 'Reported')}
${section('why', 'Why it matters', why, ai ? 'Interpretation' : 'Verified data')}
${section('impact', 'Market impact', impact, ai ? 'Interpretation' : 'Verified data')}
${section('analysis', 'FYNX Analysis', analysis)}
${section('scenarios', 'Scenarios and risks', scenarios, 'Interpretation')}
${section('watch', 'What to watch next', watch, 'Verified data')}
${section('related', 'Related intelligence', relatedHTML)}
${section('sources', 'Original sources', sources)}
${section('method', 'How this page was made', method)}
<p class="fx-disclaimer">For education and research only — not investment advice. Markets can move against any analysis.</p>
</article>
</main>`;
  return head({title: `${rec.headline} | FYNX Intelligence`, description, canonical: url, jsonld, assets: ctx.assets}) + '\n' + shell(body);
}

function hubPage(records, ctx) {
  const canonical = SITE + '/intelligence/';
  const items = records.map(r => `<li class="fx-item" data-intel-item data-classes="${esc([...new Set(r.stats.map(s => s.assetClass))].join(' '))}" data-search="${esc((r.headline + ' ' + r.sources.map(s => s.publisher).join(' ') + ' ' + r.companies.map(c => c.name + ' ' + (c.ticker || '')).join(' ') + ' ' + r.themes.map(t => t.label).join(' ')).toLowerCase())}"><a href="/intelligence/${esc(r.slug)}/"><span class="fx-item-kicker">${esc(r.themes[0]?.label || r.companies[0]?.sector || 'Markets')}${r.method === 'ai' ? ' · Analysis' : ' · Data brief'}</span><b>${esc(r.headline)}</b><span class="fx-item-meta">${esc(r.sources[0].publisher)}${r.sources.length > 1 ? ` + ${r.sources.length - 1}` : ''} · <time datetime="${esc(r.sources[0].publishedAt)}">${esc(when(r.sources[0].publishedAt))}</time></span>${r.stats[0] ? `<span class="fx-item-move"><span>${esc(r.stats[0].name)}</span> <i class="${r.stats[0].day > 0 ? 'up' : r.stats[0].day < 0 ? 'down' : ''}">${esc(r.stats[0].dayText)}</i></span>` : ''}</a></li>`).join('');
  const body = `<main id="fx-main" class="fx-main fx-hub">
<header class="fx-head"><p class="fx-kicker"><span class="fx-dot" aria-hidden="true"></span>FYNX INTELLIGENCE</p><h1>Understand the move, not just the headline.</h1><p class="fx-deck">Each story links the reported news to the markets it touches, with FYNX's own computed data, dated catalysts and credited original sources.</p></header>
<div class="fx-hub-tools"><label class="fx-search"><span class="fx-sr">Search Intelligence</span><input type="search" placeholder="Search companies, tickers, central banks…" data-intel-search autocomplete="off"></label>
<div class="fx-filters" role="group" aria-label="Filter by market">${['all', 'stocks', 'indices', 'forex', 'rates', 'commodities', 'crypto'].map((c, i) => `<button type="button" class="fx-filter" data-intel-filter="${c}" aria-pressed="${i === 0}">${c === 'all' ? 'All' : CLASS_LABEL[c]}</button>`).join('')}<button type="button" class="fx-filter" data-intel-filter="saved" aria-pressed="false">Saved</button></div></div>
<p class="fx-fine" data-intel-count>${records.length} stories · updated ${esc(when(ctx.generatedAt))}</p>
<ol class="fx-list">${items}</ol>
<p class="fx-empty" data-intel-empty hidden>No stories match. Try another company, ticker or market.</p>
<p class="fx-fine"><a href="/intelligence/method.html">How FYNX Intelligence is made</a> · Headlines and short excerpts are credited to their publishers.</p>
</main>`;
  return head({title: 'FYNX Intelligence — markets behind the news', description: 'Original FYNX analysis of today’s financial news: the markets each story moves, computed market data, upcoming catalysts and credited original sources.', canonical, assets: ctx.assets, jsonld: {'@context': 'https://schema.org', '@type': 'CollectionPage', name: 'FYNX Intelligence', url: canonical}}) + '\n' + shell(body, 'hub');
}

function methodPage(ctx) {
  const body = `<main id="fx-main" class="fx-main"><article class="fx-article"><header class="fx-head"><p class="fx-kicker"><span class="fx-dot" aria-hidden="true"></span>FYNX INTELLIGENCE · METHOD</p><h1>How FYNX Intelligence is made</h1></header>
${section('m1', 'What we collect', '<p>Headlines, publication times, links and short descriptions from publisher RSS feeds and news services that FYNX already uses, plus short source excerpts only where a publisher\'s site allows automated access. We never bypass paywalls and never store or republish full articles.</p>')}
${section('m2', 'How stories are chosen', '<p>Reports of the same event are grouped together. A story gets an Intelligence page only when it names a market FYNX can measure — a company with a listed share, an index, a currency, a commodity, a crypto asset or US rates — and has either several independent reports or a usable source excerpt. Stories about allegations, accidents or violence are held back for human review.</p>')}
${section('m3', 'Verified data', '<p>Prices and daily history come from FYNX\'s hourly market snapshot (Yahoo Finance, delayed). Treasury yields come from the U.S. Treasury; Fed funds pricing from CBOT futures and the New York Fed; policy rates from the Bank for International Settlements; the economic calendar from FYNX\'s weekly calendar snapshot; earnings dates from Nasdaq. Every figure on a page names its source and time.</p>')}
${section('m4', 'AI-assisted analysis', '<p>When enabled, an AI model drafts the overview, interpretation and scenarios from the collected facts only. An automatic check rejects any draft that contains a number, quotation or cited source that is not in those facts; rejected stories are not published. Pages say plainly whether AI was used. AI drafts are not reviewed by a human editor before publication.</p>')}
${section('m5', 'Updates and corrections', '<p>Developing stories are re-checked on every run for 36 hours: new reports are added as sources and market data is refreshed, with the update time shown on the page. Pages are kept for 21 days. To report an error, use the <a href="/contact.html">contact page</a>.</p>')}
${section('m6', 'Publishers', '<p>Original reporting belongs to its publishers. FYNX credits and links every source and is not affiliated with or endorsed by them.</p>')}
</article></main>`;
  return head({title: 'How FYNX Intelligence is made | FYNX Finance World', description: 'Sources, story selection, verified data, AI assistance, update and correction policy for FYNX Intelligence analysis pages.', canonical: SITE + '/intelligence/method.html', assets: ctx.assets}) + '\n' + shell(body, 'hub');
}

module.exports = {articlePage, hubPage, methodPage, esc, when, SITE};
