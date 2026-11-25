'use strict';
// [site-qa] run 94: the shared account script must sit before the page's real closing </body>,
// never inside a script string that happens to contain "</body>" (news/heatmap.html srcdoc).
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { publicSiteFiles } = require('./public-site-files.cjs');
const { build } = require('./build-account-sync.cjs');
const root = path.resolve(__dirname, '..');
let checked = 0;
for (const file of publicSiteFiles(root, { extensions: ['.html'] })) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const at = html.indexOf('src="/assets/js/account-sync.js');
  if (at === -1) continue;
  assert.equal(html.indexOf('</body>', at), html.lastIndexOf('</body>'), file + ': account-sync script must come after every other </body>');
  checked++;
}
assert.ok(checked > 100, 'expected the shared account script on the public pages');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fynx-sync-'));
try {
  fs.writeFileSync(path.join(tmp, 'page.html'), "<html><body><script>x.srcdoc='<body></body></html>';</script></body></html>");
  const directoryPath = path.join(tmp, 'directory.html');
  const directory = '<!DOCTYPE html><html><body><a href="/tools/margin.html">Margin calculator</a></body></html>';
  fs.writeFileSync(directoryPath, directory);
  fs.writeFileSync(path.join(tmp, 'pro.html'), '<html><body><main>Pro workspace</main></body></html>');
  build(tmp);
  build(tmp);
  assert.equal(fs.readFileSync(directoryPath, 'utf8'), directory, 'root lightweight directory stays byte-identical');
  assert.equal((fs.readFileSync(path.join(tmp, 'pro.html'), 'utf8').match(/account-sync\.js/g) || []).length, 1,
    'the Pro route keeps exactly one account script after repeated builds');
  const out = fs.readFileSync(path.join(tmp, 'page.html'), 'utf8');
  assert.match(out, /'<body><\/body><\/html>';<\/script><script type="module" src="\/assets\/js\/account-sync\.js[^"]*"><\/script>\n<\/body><\/html>$/);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log('account-sync placement OK on ' + checked + ' pages');
