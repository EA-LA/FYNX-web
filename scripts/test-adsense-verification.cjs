const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { build, publicPages, source, block } = require('./build-adsense-verification.cjs');
const root = path.resolve(__dirname, '..');

for (const file of publicPages(root)) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const dom = new JSDOM(html), doc = dom.window.document;
  const scripts = [...doc.querySelectorAll('script')].filter(script => script.src === source);
  assert.equal(scripts.length, 1, `${file}: one exact publisher loader`);
  const loader = scripts[0];
  assert.equal(loader.parentElement.tagName, 'HEAD', `${file}: script belongs in head`);
  assert(loader.hasAttribute('async'));
  assert.equal(loader.getAttribute('crossorigin'), 'anonymous');
  const context = { window: {} };
  vm.runInNewContext(loader.previousElementSibling.textContent, context);
  assert.equal(context.window.adsbygoogle.pauseAdRequests, 1, `${file}: requests paused before loader`);
  assert.equal(doc.querySelectorAll('ins.adsbygoogle, [data-ad-slot]').length, 0, `${file}: no placements`);
  assert(!/adsbygoogle[^<]*\.push\(|pauseAdRequests\s*=\s*0/.test(html), `${file}: no ad requests or resume`);
  dom.window.close();
}
assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'config/advertising.json'))).enabled, false);
assert(!fs.existsSync(path.join(root, 'ads.txt')), 'No ads.txt change in verification-only release');
for (const file of ['journal.html', 'home.html', 'auth.html', 'directory.html']) {
  if (fs.existsSync(path.join(root, file))) assert(!fs.readFileSync(path.join(root, file), 'utf8').includes(source), `${file}: excluded`);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fynx-verification-'));
try {
  fs.mkdirSync(path.join(temp, 'config'));
  fs.writeFileSync(path.join(temp, 'config/advertising.json'), '{"enabled":false}');
  fs.writeFileSync(path.join(temp, 'sitemap.xml'), '<urlset><url><loc>https://www.fynxfinanceworld.com/</loc></url></urlset>');
  fs.writeFileSync(path.join(temp, 'index.html'), '<html><head><title>FYNX</title></head><body>Calculator</body></html>');
  build(temp);
  const first = fs.readFileSync(path.join(temp, 'index.html'), 'utf8');
  build(temp);
  assert.equal(fs.readFileSync(path.join(temp, 'index.html'), 'utf8'), first, 'Idempotent generation');
  assert(first.includes(block));
  fs.writeFileSync(path.join(temp, 'config/advertising.json'), '{"enabled":true}');
  assert.throws(() => build(temp), /enabled=false/);
  fs.writeFileSync(path.join(temp, 'config/advertising.json'), '{"enabled":false}');
  fs.writeFileSync(path.join(temp, 'sitemap.xml'), '<loc>https://www.fynxfunded.com/</loc>');
  assert.throws(() => build(temp), /Unexpected public URL/);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log('PASS exact verification code in public heads, paused requests, disabled placements, excluded private pages, idempotence and domain guard.');
