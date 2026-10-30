/* Run after page generators so shared release assets and their module importers
 * use one cache identity. Only references to this explicit asset set are changed. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const VERSION = '20261030-r1';
const ASSETS = Object.freeze([
  'fynx-nav.js', 'demo-mode.js', 'auth/auth-form.js',
  'assets/js/home-journal.js', 'assets/js/profile-sync.js', 'assets/js/session-manager.js',
  'assets/js/market-intelligence-data.js', 'assets/js/news-intelligence.js',
  'assets/js/terminal-header.js', 'assets/js/terminal-home.js',
  'assets/js/terminal-market-data.js', 'assets/js/terminal-market-ui.js',
  'assets/js/terminal-landing-live.js', 'assets/js/newsroom-editions.js',
  'assets/js/newsroom-media.js', 'assets/js/newsroom-page.js',
  'assets/css/terminal-header.css', 'assets/css/terminal-home.css',
  'assets/css/terminal-news.css', 'assets/css/newsroom.css'
]);
const SKIP = new Set(['node_modules', 'output', 'dist', 'scripts', 'backend', 'docs', 'ops', 'functions']);
const ORIGIN = 'https://release-assets.invalid';
function filesIn(root, directory = '') {
  return fs.readdirSync(path.join(root, directory), {withFileTypes:true}).flatMap(entry => {
    const relative = path.posix.join(directory, entry.name);
    if (entry.name.startsWith('.') || SKIP.has(entry.name) || relative === 'assets/vendor') return [];
    if (entry.isDirectory()) return filesIn(root, relative);
    return entry.isFile() && /\.(html|js)$/.test(entry.name) ? [relative] : [];
  });
}
function rewriteReferences(source, file, assets) {
  return source.replace(/(["'])([^"'\\\s<>]+)\1/g, (original, quote, value) => {
    if (!/\.(?:js|css)$/.test(value.split(/[?#]/, 1)[0]) || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return original;
    let url;
    try { url = new URL(value.replace(/&amp;/g, '&'), ORIGIN + '/' + file); } catch { return original; }
    if (url.origin !== ORIGIN || !assets.has(url.pathname.slice(1))) return original;
    const existing = url.searchParams.getAll('v');
    if (existing.length === 1 && existing[0] === VERSION) return original;
    url.searchParams.set('v', VERSION);
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
module.exports = {build, rewriteReferences, VERSION, ASSETS};
if (require.main === module) build();
