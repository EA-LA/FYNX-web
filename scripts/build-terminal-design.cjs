// Apply the Finance World presentation layer after generated pages are built.
// Keep the API, authentication, content, data loaders and product logic unchanged.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const researchPages = require('../content/research-pages.cjs');
const pages = [
  'index.html', 'home.html', 'journal.html', 'calculator.html', 'news.html',
  'calendar.html', 'learn.html', 'profile.html', 'pro.html', 'explore.html', 'quant-analyst.html',
  'tools/research-desk.html',
  'edge-radar/index.html', ...require('../backend/quant/engine.cjs').SYMBOLS.map(s=>`edge-radar/${s.id.toLowerCase()}/index.html`),
  ...researchPages.map(([, slug]) => `tools/${slug}.html`),
  'tools/economic-calendar.html', 'tools/market-holidays.html', 'tools/market-hours.html',
];
const navigation = [
  ['Home', '/home.html'], ['Journal', '/journal.html'], ['Calculator', '/calculator.html'],
  ['News', '/news.html'], ['Calendar', '/calendar.html'], ['Learn', '/learn.html'],
  ['Explore', '/explore.html'], ['Research', '/tools/research-desk.html'], ['Quant Analyst', '/quant-analyst.html'], ['Edge Radar', '/edge-radar/'], ['Profile', '/profile.html'],
];

for (const page of pages) {
  const file = path.join(root, page);
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/<!-- terminal-design:start -->[\s\S]*?<!-- terminal-design:end -->\s*/g, '');
  html = html.replace(/<!-- terminal-navigation:start -->[\s\S]*?<!-- terminal-navigation:end -->\s*/g, '');
  html = html.replace(/<body\b([^>]*)>/, (tag, attrs) =>
    /\bdata-fynx-terminal(?:[\s=>]|$)/.test(attrs) ? tag : `<body${attrs} data-fynx-terminal>`);
  const component = page === 'index.html' ? 'terminal-landing' : 'terminal-workspace';
  const hasHeader = !/data-fynx-section="TOOLS"/.test(html);
  const sourceData = /src=["'][^"']*market-intelligence-data\.js/.test(html) ? '' : '<script src="/assets/js/market-intelligence-data.js?v=20261030-r1" defer></script>\n';
  const readerClient=html.includes('src="/assets/js/news-reader-links.js')?'':'<script src="/assets/js/news-reader-links.js?v=20261102-r1" defer></script>\n';
  const foundation=readerClient+(html.includes('src="/assets/js/newsroom-editions.js')?'':'<script src="/assets/js/newsroom-editions.js?v=20261030-r1" defer></script>\n')+(html.includes('src="/assets/js/newsroom-media.js')?'':'<script src="/assets/js/newsroom-media.js?v=20261030-r1" defer></script>\n');
  const shared = hasHeader ? `${foundation}<link rel="stylesheet" href="/assets/css/terminal-header.css?v=20261030-r1">\n${sourceData}<script src="/assets/js/terminal-market-data.js?v=20261030-r1" defer></script>\n<script src="/assets/js/terminal-header.js?v=20261030-r1" defer></script>\n<script src="/assets/js/terminal-market-ui.js?v=20261030-r1" defer></script>\n` : '';
  const home = page === 'index.html' ? '<link rel="stylesheet" href="/assets/css/terminal-home.css?v=20261030-r1">\n<script src="/assets/js/terminal-landing-live.js?v=20261030-r1" defer></script>\n' : page === 'home.html' ? '<link rel="stylesheet" href="/assets/css/terminal-home.css?v=20261030-r1">\n<script src="/assets/js/terminal-home.js?v=20261030-r1" defer></script>\n' : '';
  const refinements = hasHeader && page !== 'home.html' ? '<link rel="stylesheet" href="/assets/css/terminal-pages.css?v=20261030-r1">\n<script src="/assets/js/terminal-pages.js?v=20261030-r1" defer></script>\n' : '';
  const news = page === 'news.html' ? '<link rel="stylesheet" href="/assets/css/terminal-news.css?v=20261030-r1">\n' : '';
  const assets = `<!-- terminal-design:start -->\n<link rel="stylesheet" href="/assets/css/terminal-shell.css?v=20261028">\n<link rel="stylesheet" href="/assets/css/${component}.css?v=20261028">\n${shared}${home}${refinements}${news}<!-- terminal-design:end -->\n`;
  html = html.replace('</head>', assets + (page.startsWith('edge-radar/') ? '<link rel="stylesheet" href="/assets/css/edge-radar.css">\n' : page === 'quant-analyst.html' ? '<link rel="stylesheet" href="/assets/css/quant-analyst.css">\n' : '') + '</head>');
  if (!/data-fynx-layout="workspace"/.test(html) && !/data-fynx-section="TOOLS"/.test(html)) {
    const active = page.startsWith('edge-radar/') ? '/edge-radar/' : page.startsWith('tools/') ? '/tools/research-desk.html' : `/${page}`;
    const links = navigation.map(([label, href]) => `<a href="${href}"${href === active ? ' aria-current="page"' : ''}>${label}${['Quant Analyst','Edge Radar'].includes(label) ? '<span class="quant-new-badge">NEW</span>' : ''}</a>`).join('');
    const nav = `\n<!-- terminal-navigation:start -->\n<nav class="terminal-navigation" aria-label="Workspace navigation">${links}</nav>${page.startsWith('edge-radar/')?'<div class="terminal-ticker-host" data-terminal-ticker role="region" aria-label="Market snapshot"><span class="edge-ticker-loading">Market quotes · loading attributed data…</span></div>':''}\n<!-- terminal-navigation:end -->\n`;
    html = html.replace('</header>', '</header>' + nav);
  }
  fs.writeFileSync(file, html);
}
console.log(`Terminal presentation applied to ${pages.length} Finance World pages.`);

module.exports = { pages };
