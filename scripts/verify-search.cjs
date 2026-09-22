const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const urls = [...fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
const titles = new Set();
for (const url of urls) {
  const pathname = new URL(url).pathname;
  const file = path.join(root, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { url, runScripts: 'outside-only' });
  const doc = dom.window.document;
  if (titles.has(doc.title)) throw new Error(`${file}: duplicate public page title`);
  titles.add(doc.title);
  for (const script of doc.querySelectorAll("script:not([src])")) {
    if (!script.type || script.type === "text/javascript") new vm.Script(script.textContent, {filename: file});
  }
  for (const selector of ['title','meta[name="description"]','link[rel="canonical"]']) {
    if (doc.querySelectorAll(selector).length !== 1) throw new Error(`${file}: expected exactly one ${selector}`);
  }
  if (doc.querySelector('link[rel="canonical"]').href !== url) throw new Error(`${file}: incorrect canonical`);
  if (doc.querySelector('meta[name="robots"]')?.content.includes('noindex')) throw new Error(`${file}: private page in sitemap`);
  if (doc.body.dataset.learningTopic) {
    if (doc.querySelector('#contentRoot').textContent.trim().length < 200) throw new Error(`${file}: missing initial content`);
    const title = doc.querySelector('h1').textContent;
    for (const script of doc.querySelectorAll('script:not([src])')) if (!script.type) dom.window.eval(script.textContent);
    if (doc.querySelector('h1').textContent !== title) throw new Error(`${file}: topic changed after JavaScript ran`);
    if (!doc.querySelector('link[rel="canonical"]').href.includes(doc.body.dataset.learningTopic)) throw new Error(`${file}: topic canonical changed`);
  }
  dom.window.close();
}
console.log(`Search metadata and learning runtime checks passed for ${urls.length} public pages.`);
