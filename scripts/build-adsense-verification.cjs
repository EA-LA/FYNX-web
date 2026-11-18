// Site ownership verification only. Ad serving remains explicitly paused.
const fs = require('node:fs');
const path = require('node:path');
const origin = 'https://www.fynxfinanceworld.com';
const source = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8416444551809049';
const marker = /<!-- FYNX ADSENSE VERIFICATION START -->[\s\S]*?<!-- FYNX ADSENSE VERIFICATION END -->\n?/g;
const block = `<!-- FYNX ADSENSE VERIFICATION START -->
<script>(window.adsbygoogle = window.adsbygoogle || []).pauseAdRequests = 1;</script>
<script async src="${source}"
     crossorigin="anonymous"></script>
<!-- FYNX ADSENSE VERIFICATION END -->
`;

function publicPages(root) {
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  return [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => {
    const url = new URL(loc);
    if (url.origin !== origin || url.search || url.hash) throw Error(`Unexpected public URL: ${loc}`);
    const file = url.pathname.slice(1) + (url.pathname.endsWith('/') ? 'index.html' : '');
    if (!file.endsWith('.html') || file.includes('..') || file.includes('%')) throw Error(`Invalid page: ${loc}`);
    return file;
  }))];
}

function build(root = path.resolve(__dirname, '..')) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config/advertising.json'), 'utf8'));
  if (config.enabled !== false) throw Error('Verification-only release requires advertising.enabled=false');
  const pages = publicPages(root);
  if (!pages.includes('index.html')) throw Error('Public sitemap must include the homepage');
  // Validate the entire batch before writing any files.
  const output = pages.map(file => {
    const html = fs.readFileSync(path.join(root, file), 'utf8').replace(marker, '');
    if (!/<head\b[^>]*>[\s\S]*<\/head>/i.test(html)) throw Error(`Missing head: ${file}`);
    if (/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)) throw Error(`Private page in sitemap: ${file}`);
    if (/adsbygoogle|data-ad-slot|FYNX AD START/.test(html)) throw Error(`Unexpected existing ad integration: ${file}`);
    return [file, html.replace(/<\/head>/i, block + '</head>')];
  });
  for (const [file, html] of output) fs.writeFileSync(path.join(root, file), html);
  console.log(`AdSense verification added to ${pages.length} public page heads; all ad requests remain paused.`);
  return pages;
}

module.exports = { build, publicPages, source, block, marker };
if (require.main === module) build();
