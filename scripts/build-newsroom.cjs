const fs = require('node:fs');
const path = require('node:path');
const sections = require('../content/newsroom-sections.cjs');
const root = path.resolve(__dirname, '..');
const esc = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const nav = [['Home', '/home.html'], ['Journal', '/journal.html'], ['Calculator', '/calculator.html'], ['News', '/news.html'], ['Calendar', '/calendar.html'], ['Learn', '/learn.html'], ['Explore', '/explore.html'], ['Research', '/tools/research-desk.html'], ['Profile', '/profile.html']];
const external = item => `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(item.name)} <span aria-hidden="true">↗</span></strong><span>${esc(item.detail)}</span></a>`;
const contextImage = item => item ? `<figure class="newsroom-context-image" data-context-image><img src="${esc(item.url)}" alt="${esc(item.alt)}" width="${item.width}" height="${item.height}" loading="lazy" decoding="async" referrerpolicy="no-referrer"><figcaption><strong>Context: ${esc(item.subject)}. </strong><a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(item.credit)}</a> · <a href="${esc(item.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(item.license)}</a></figcaption></figure>` : '';
fs.mkdirSync(path.join(root, 'news'), { recursive: true });
for (const section of sections) {
  const url = `https://www.fynxfinanceworld.com/news/${section.id}.html`;
  const configuration = JSON.stringify({ id: section.id, category: section.category, title: section.title, contextImage: section.contextImage }).replace(/</g, '\\u003c');
  const structured = JSON.stringify({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${section.title} | FYNX Finance World`, description: section.description, url, isPartOf: { '@type': 'WebSite', name: 'FYNX Finance World', url: 'https://www.fynxfinanceworld.com/' } }).replace(/</g, '\\u003c');
  const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(section.title)} News &amp; Research | FYNX Finance World</title>
<meta name="description" content="${esc(section.description)}"><link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(section.title)} | FYNX Finance World"><meta property="og:description" content="${esc(section.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="https://www.fynxfinanceworld.com/assets/social/fynx-resources.png">
<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/favicon-32x32.png">
<script src="/assets/js/site-theme-init.js"></script>
<link rel="stylesheet" href="/assets/discovery.css?v=20261012">
<link rel="stylesheet" href="/assets/css/terminal-shell.css?v=20261028">
<link rel="stylesheet" href="/assets/css/terminal-header.css?v=20261030-r1">
<link rel="stylesheet" href="/assets/css/newsroom.css?v=20261030-r1">
<script src="/assets/js/newsroom-editions.js?v=20261030-r1" defer></script>
<script src="/assets/js/market-intelligence-data.js?v=20261030-r1" defer></script>
<script src="/assets/js/terminal-market-data.js?v=20261030-r1" defer></script>
<script src="/assets/js/journal-theme.js?v=20260922-routing" defer></script>
<script src="/assets/js/terminal-header.js?v=20261030-r1" defer></script>
<script src="/assets/js/terminal-market-ui.js?v=20261030-r1" defer></script>
<script src="/assets/js/newsroom-media.js?v=20261030-r1" defer></script>
<script src="/assets/js/newsroom-page.js?v=20261030-r1" defer></script>
<script type="application/ld+json">${structured}</script>
</head>
<body data-fynx-layout="standalone" data-fynx-terminal class="newsroom-page">
<a class="newsroom-skip" href="#newsroom-main">Skip to ${esc(section.title.toLowerCase())} coverage</a>
<header class="discovery-header"><a class="discovery-brand" href="/" aria-label="FYNX Finance World home">FYNX<span>FINANCE WORLD</span></a><nav aria-label="Account and appearance"><a href="/profile.html">Account</a><button type="button" data-theme-control data-journal-theme><span data-theme-label>Dark theme</span> ◐</button></nav></header>
<nav class="terminal-navigation" aria-label="Workspace navigation">${nav.map(([title, href]) => `<a href="${href}"${href === '/news.html' ? ' aria-current="page"' : ''}>${title}</a>`).join('')}</nav>
<main id="newsroom-main" class="newsroom-main" data-newsroom-page="${section.id}">
<nav class="newsroom-breadcrumb" aria-label="Breadcrumb"><a href="/news.html">News</a><span aria-hidden="true">/</span><span aria-current="page">${esc(section.title)}</span></nav>
<header class="newsroom-heading"><div><p class="newsroom-kicker">FYNX / ${esc(section.title.toUpperCase())}</p><h1>${esc(section.title)}</h1><p class="newsroom-deck">${esc(section.description)}</p></div><div class="newsroom-edition-context"><span data-newsroom-edition>Global edition</span><p>Source-attributed reporting.<br>Context for your own research.</p></div></header>
<div class="newsroom-focus" aria-label="Coverage focus"><span>In focus</span>${section.focus.map(topic => `<span>${esc(topic)}</span>`).join('')}</div>
<div class="newsroom-toolbar"><div><span class="newsroom-status-label" data-newsroom-status-label>Checking sources</span><p data-newsroom-status role="status" aria-live="polite">Loading current ${esc(section.title.toLowerCase())} reporting.</p></div><button type="button" data-newsroom-refresh>Refresh coverage <span aria-hidden="true">↻</span></button></div>
<div class="newsroom-layout">
<div class="newsroom-reporting" data-newsroom-stories aria-busy="true">
<section aria-label="Featured coverage" class="newsroom-featured"><div data-newsroom-lead>${contextImage(section.contextImage)}<div class="newsroom-feed-message"><h2>Checking the latest coverage.</h2><p>Publication dates and publishers appear with every report.</p></div></div><div class="newsroom-secondary" data-newsroom-secondary hidden></div></section>
<section class="newsroom-latest" data-newsroom-latest-section hidden><div class="newsroom-section-rule"><h2>Latest reporting</h2><span data-newsroom-count></span></div><div data-newsroom-latest></div><button type="button" class="newsroom-more" data-newsroom-more hidden>Show more reporting</button></section>
</div>
<aside class="newsroom-rail" aria-label="Sources and research tools"><section><div class="newsroom-section-rule"><h2>Go to the source</h2><span>Primary documents</span></div><p class="newsroom-rail-intro">Use the original record alongside the reporting.</p><div class="newsroom-source-list">${section.sources.map(external).join('')}</div></section><section class="newsroom-workbench"><p class="newsroom-kicker">YOUR RESEARCH WORKSPACE</p><h2>Take the next step.</h2><div>${section.tools.map(item => `<a href="${item.href}"><strong>${esc(item.title)} <span aria-hidden="true">→</span></strong><span>${esc(item.detail)}</span></a>`).join('')}</div></section></aside>
</div>
<section class="newsroom-guide" aria-labelledby="newsroom-guide-title"><div class="newsroom-guide-intro"><p class="newsroom-kicker">FYNX READING GUIDE</p><h2 id="newsroom-guide-title">${esc(section.guide.title)}</h2><p>${esc(section.guide.intro)}</p></div><div class="newsroom-guide-points">${section.guide.points.map((point, index) => `<article><span class="newsroom-guide-number">0${index + 1}</span><h3>${esc(point.title)}</h3><p>${esc(point.text)}</p></article>`).join('')}</div></section>
<section class="newsroom-related" aria-labelledby="newsroom-related-title"><div class="newsroom-section-rule"><h2 id="newsroom-related-title">Follow the connections</h2><a href="/news.html">All news →</a></div><div>${section.related.map(id => { const related = sections.find(item => item.id === id); return `<a href="/news/${id}.html"><span>${esc(related.focus[0])}</span><h3>${esc(related.title)} <span aria-hidden="true">↗</span></h3><p>${esc(related.description)}</p></a>`; }).join('')}</div></section>
<details class="newsroom-method"><summary>About this coverage</summary><p>Headlines and publication dates come from the named sources. Links open the publisher or its news-distribution page; the publisher controls access to the complete report. Coverage is refreshed every ten minutes while this page is visible and when you change edition. The selected edition guides the source query and may include international reporting.</p><p>Retrieval time and publication time are different. Saved or partly refreshed coverage is identified in the status above. FYNX reading guides are original educational context, separate from the publisher headlines. Story images appear only when the feed supplies explicit credit and licensing metadata. Otherwise, an image labeled “Context” illustrates the section and does not depict the reported event. Its caption links to the original image and its license.</p></details>
<noscript><p class="newsroom-feed-message">Enable JavaScript to load current reporting and switch editions. The original source links, FYNX reading guide and research tools on this page remain available.</p></noscript>
<script type="application/json" id="newsroom-config">${configuration}</script>
</main>
<footer class="newsroom-footer"><a href="/">FYNX <span>FINANCE WORLD</span></a><nav aria-label="Footer"><a href="/news.html">Newsroom</a><a href="/tools/research-desk.html">Research</a><a href="/contact.html">Contact</a><a href="/risk-disclosure.html">Risk disclosure</a></nav><p>Reporting, sources and tools for your own research.</p></footer>
</body></html>
`;
  fs.writeFileSync(path.join(root, 'news', section.id + '.html'), html);
}
console.log(`Built ${sections.length} FYNX newsroom section pages.`);
module.exports = { pages: sections.map(section => `news/${section.id}.html`) };
