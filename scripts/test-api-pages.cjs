const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(path.join(root, 'api')).filter(f => f.endsWith('.html'));
for (const file of files) {
 const doc = new JSDOM(fs.readFileSync(path.join(root, 'api', file), 'utf8')).window.document;
 assert.equal(doc.querySelectorAll('h1').length, 1, file);
 assert(doc.querySelector('meta[name="description"]')?.content, file);
 assert(doc.querySelector('main'), file);
 for (const node of doc.querySelectorAll('[href], script[src]')) {
  const href = node.getAttribute('href') || node.getAttribute('src');
  if (!href.startsWith('/') && !href.startsWith('#')) continue;
  const url = new URL(href, 'https://example.com/api/' + file);
  const target = path.join(root, decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
  assert(fs.existsSync(target), `${file}: missing ${href}`);
  if (url.hash && target.endsWith('.html')) {
   const targetDoc = new JSDOM(fs.readFileSync(target, 'utf8')).window.document;
   assert(targetDoc.getElementById(url.hash.slice(1)), `${file}: missing fragment ${href}`);
  }
 }
}
(async () => {
 const dom = new JSDOM(fs.readFileSync(path.join(root,'api/docs.html'),'utf8'), {runScripts:'outside-only',url:'https://example.com/api/docs.html'});
 const { window:w } = dom;
 let copied;
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text => {copied=text;}}});
 w.eval(fs.readFileSync(path.join(root,'api/api.js'),'utf8'));
 const d=w.document;
 d.querySelector('.menu-toggle').click();
 assert.equal(d.querySelector('.menu-toggle').getAttribute('aria-expanded'),'true');
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));
 assert.equal(d.querySelector('.menu-toggle').getAttribute('aria-expanded'),'false');
 for(const lang of ['python','javascript','curl']) {
  d.querySelector(`[data-lang="${lang}"]`).click();
  assert.equal(d.querySelector(`[data-example="${lang}"]`).hidden,false);
  assert.equal([...d.querySelectorAll('[data-example]')].filter(p=>!p.hidden).length,1);
 }
 d.querySelector('[data-example="curl"] [data-copy]').click();
 await new Promise(resolve => setImmediate(resolve));
 assert(copied.includes('curl -X POST'));
 assert(d.getElementById('copy-status').textContent.includes('copied'));
 const example= d.querySelector('[data-example="javascript"] code').textContent;
 new Function('return (async()=>{'+example+'})');
 w.close();
 console.log(`${files.length} API pages: local links, fragments, metadata, mobile-menu state, language switching, copy control and JS example passed.`);
})();
