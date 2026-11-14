/* Run after page generators so shared release assets and their module importers
 * use one cache identity. Only references to this explicit asset set are changed. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { publicSiteFiles } = require('./public-site-files.cjs');
const VERSION = '20261114-heatmaps-3';
const RESEARCH_VERSION = '20261113-shared-account-2';
const TOPIC_TRANSFER_VERSION = '20261113-topic-transfer-2';
const ASSET_VERSIONS = Object.freeze({'assets/js/shared-workspace.js':'20261113-notification-lead-1','assets/js/news-preferences.js':TOPIC_TRANSFER_VERSION,'assets/js/your-news.js':TOPIC_TRANSFER_VERSION,'assets/css/your-news.css':TOPIC_TRANSFER_VERSION});
const RESEARCH_ASSETS = new Set(['assets/js/research-service.js','assets/js/edge/app.js','assets/js/edge/render.js','assets/js/edge/profile.js','assets/js/edge/public-research.js','assets/js/quant/app.js','assets/js/quant/profile.js','assets/js/quant/engine.js','assets/js/quant/worker.js','assets/js/quant/public-history.js','assets/js/company-products-data.js']);
const ASSETS = Object.freeze([
  ...RESEARCH_ASSETS,
  'assets/js/account-sync.js','assets/js/account-sync-core.js','assets/js/account-sync-mapping.js','assets/js/shared-workspace.js','assets/css/shared-workspace.css',
  'assets/js/account-system.js','assets/js/intelligence-workspace.js','assets/js/intelligence-app-check.js','assets/js/intelligence.js','assets/js/research/store.js',
  'assets/css/company-products.css', 'assets/js/company-products.js', 'assets/js/company-products-data.js',
  'fynx-nav.js', 'demo-mode.js', 'auth/auth-form.js',
  'assets/js/macro-desk/model.js', 'assets/js/macro-desk/app.js', 'assets/css/macro-desk.css',
  'assets/js/edge/insights.js', 'assets/css/edge-insights.css',
  'assets/js/terminal/app.js', 'assets/js/terminal/pages.js', 'assets/js/terminal/geo.js', 'assets/js/terminal/world.js', 'assets/js/terminal/portfolio.js', 'assets/js/terminal/scanner.js', 'assets/js/terminal/heatmaps.js', 'assets/css/terminal-all.css',
  'assets/js/home-movers.js', 'assets/js/live-pulse.js', 'assets/js/cb-monitor.js',
  'assets/js/home-journal.js', 'assets/js/profile-sync.js', 'assets/js/session-manager.js',
  'assets/js/news-reader-links.js', 'assets/js/news-reader.js', 'assets/css/news-reader.css',
  'assets/js/news-preferences.js', 'assets/js/your-news.js', 'assets/css/your-news.css',
  'assets/js/landing-workspace.js', 'assets/landing-workspace.css',
  'api/workspace.js', 'assets/js/research/personal.js', 'assets/js/research/focus.js',
  'assets/css/news-intelligence.css', 'assets/js/holiday-calendar-export.js',
  'assets/js/market-intelligence-data.js', 'assets/js/news-intelligence.js',
  'assets/js/terminal-header.js', 'assets/js/terminal-home.js',
  'assets/js/terminal-market-data.js', 'assets/js/terminal-market-ui.js',
  'assets/js/terminal-landing-live.js', 'assets/js/newsroom-editions.js',
  'assets/js/newsroom-media.js', 'assets/js/newsroom-page.js',
  'assets/css/terminal-header.css', 'assets/css/terminal-home.css',
  'assets/css/terminal-news.css', 'assets/css/newsroom.css',
  'assets/css/terminal-landing.css', 'styles.css', 'assets/site-design.css'
]);
const ORIGIN = 'https://release-assets.invalid';
function filesIn(root) {
  return publicSiteFiles(root, {extensions:['.html', '.js'], exclude:['assets/vendor']});
}
function rewriteReferences(source, file, assets) {
  return source.replace(/(["'])([^"'\\\s<>]+)\1/g, (original, quote, value) => {
    if (!/\.(?:js|css)$/.test(value.split(/[?#]/, 1)[0]) || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return original;
    let url;
    try { url = new URL(value.replace(/&amp;/g, '&'), ORIGIN + '/' + file); } catch { return original; }
    if (url.origin !== ORIGIN || !assets.has(url.pathname.slice(1))) return original;
    const asset = url.pathname.slice(1);
    const version = ASSET_VERSIONS[asset] || (RESEARCH_ASSETS.has(asset) ? RESEARCH_VERSION : VERSION);
    const existing = url.searchParams.getAll('v');
    if (existing.length === 1 && existing[0] === version) return original;
    url.searchParams.set('v', version);
    const pathname = value.split(/[?#]/, 1)[0];
    const query = value.includes('&amp;') ? url.search.replace(/&/g, '&amp;') : url.search;
    return quote + pathname + query + url.hash + quote;
  });
}
function build(root = path.resolve(__dirname, '..')) {
  const files = filesIn(root), sources = new Map(files.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
  const assets = new Set(ASSETS);
  // Changing an import URL changes its containing module. Version that module's
  // callers too, even when it was already rewritten by an earlier build.
  let added;
  do {
    added = false;
    for (const [file, source] of sources) {
      if (!file.endsWith('.js') || assets.has(file)) continue;
      let referencesReleaseAsset = false;
      source.replace(/(["'])([^"'\\\s<>]+)\1/g, (original, quote, value) => {
        if (!/\.(?:js|css)$/.test(value.split(/[?#]/, 1)[0]) || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return original;
        try { if (assets.has(new URL(value.replace(/&amp;/g, '&'), ORIGIN + '/' + file).pathname.slice(1))) referencesReleaseAsset = true; } catch {}
        return original;
      });
      if (referencesReleaseAsset) { assets.add(file); added = true; }
    }
  } while (added);
  const changed = [];
  for (const [file, source] of sources) {
    const next = rewriteReferences(source, file, assets);
    if (next !== source) { fs.writeFileSync(path.join(root, file), next); changed.push(file); }
  }
  console.log(`Release asset versions verified: ${VERSION}; ${changed.length} files updated.`);
  return {version:VERSION, assets:[...assets], changed};
}
module.exports = {build, rewriteReferences, VERSION, TOPIC_TRANSFER_VERSION, ASSETS, ASSET_VERSIONS};
if (require.main === module) build();
