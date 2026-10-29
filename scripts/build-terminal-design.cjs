// Apply the Finance World presentation layer after generated pages are built.
// Keep the API, authentication, content, data loaders and product logic unchanged.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const researchPages = require('../content/research-pages.cjs');
const pages = [
  'index.html', 'home.html', 'journal.html', 'calculator.html', 'news.html',
  'calendar.html', 'learn.html', 'profile.html', 'pro.html', 'explore.html',
  'tools/research-desk.html',
  ...researchPages.map(([, slug]) => `tools/${slug}.html`),
  'tools/economic-calendar.html', 'tools/market-holidays.html', 'tools/market-hours.html',
];
const navigation = [
  ['Home', '/home.html'], ['Journal', '/journal.html'], ['Calculator', '/calculator.html'],
  ['News', '/news.html'], ['Calendar', '/calendar.html'], ['Learn', '/learn.html'],
  ['Explore', '/explore.html'], ['Research', '/tools/research-desk.html'], ['Profile', '/profile.html'],
];

for (const page of pages) {
  const file = path.join(root, page);
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/<!-- terminal-design:start -->[\s\S]*?<!-- terminal-design:end -->\s*/g, '');
  html = html.replace(/<!-- terminal-navigation:start -->[\s\S]*?<!-- terminal-navigation:end -->\s*/g, '');
  html = html.replace(/<body\b([^>]*)>/, (tag, attrs) =>
    /\bdata-fynx-terminal(?:[\s=>]|$)/.test(attrs) ? tag : `<body${attrs} data-fynx-terminal>`);
  const component = page === 'index.html' ? 'terminal-landing' : 'terminal-workspace';
  const assets = `<!-- terminal-design:start -->\n<link rel="stylesheet" href="/assets/css/terminal-shell.css?v=20261028">\n<link rel="stylesheet" href="/assets/css/${component}.css?v=20261028">\n<!-- terminal-design:end -->\n`;
  html = html.replace('</head>', assets + '</head>');
  if (!/data-fynx-layout="workspace"/.test(html) && !/data-fynx-section="TOOLS"/.test(html)) {
    const active = page.startsWith('tools/') ? '/tools/research-desk.html' : `/${page}`;
    const links = navigation.map(([label, href]) => `<a href="${href}"${href === active ? ' aria-current="page"' : ''}>${label}</a>`).join('');
    const nav = `\n<!-- terminal-navigation:start -->\n<nav class="terminal-navigation" aria-label="Workspace navigation">${links}</nav>\n<!-- terminal-navigation:end -->\n`;
    html = html.replace('</header>', '</header>' + nav);
  }
  fs.writeFileSync(file, html);
}
console.log(`Terminal presentation applied to ${pages.length} Finance World pages.`);

module.exports = { pages };
