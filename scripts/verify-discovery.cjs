const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {isPublicSitePath}=require('./public-site-files.cjs');
const root=path.resolve(__dirname,'..'),base='https://www.fynxfinanceworld.com';
const inventory=JSON.parse(fs.readFileSync(path.join(root,'assets/resource-index.json'),'utf8'));
const sitemap=new Set([...fs.readFileSync(path.join(root,'sitemap.xml'),'utf8').matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]));
for(const url of sitemap){const pathname=new URL(url).pathname;assert(isPublicSitePath(pathname.slice(1)+(pathname.endsWith('/')?'index.html':'')),'Non-public source or fixture in sitemap: '+pathname);}
const library=new JSDOM(fs.readFileSync(path.join(root,'explore.html'),'utf8'),{url:base+'/explore.html'});
const directory=new JSDOM(fs.readFileSync(path.join(root,'directory.html'),'utf8'),{url:base+'/directory.html'});
assert.equal(new Set(inventory.map(e=>e.url)).size,inventory.length,'Duplicate resource URL');
assert.equal(directory.window.document.querySelectorAll('script').length,0,'Light directory must not require scripts');
// The not-found page can render for a deep URL, so recovery uses root-relative links.
{
 const notFound=new JSDOM(fs.readFileSync(path.join(root,'404.html'),'utf8'),{url:base+'/retired/path/'});
 const doc=notFound.window.document;
 const recovery=doc.querySelector('main nav[aria-label="Find your way"]');
 assert(recovery,'The not-found page must have recovery navigation');
 for(const target of ['/explore.html','/directory.html','/','/home.html','/calculator.html','/learn.html']){
  const link=recovery.querySelector(`a[href="${target}"]`);
  assert(link&&link.href===base+target,'Missing root-relative recovery link: '+target);
 }
 notFound.window.close();
}

const links=new Set([...library.window.document.querySelectorAll('a[href]')].map(a=>a.pathname));
const plainLinks=new Set([...directory.window.document.querySelectorAll('a[href]')].map(a=>a.pathname));
// The no-script directory must outlive the rolling article inventory.
assert.deepEqual([...plainLinks].filter(url=>url.startsWith('/intelligence/')).sort(),[
 '/intelligence/','/intelligence/method.html'
], 'Lightweight directory must link to the current Intelligence hub, not article snapshots');
assert.match(directory.window.document.querySelector('main a[href="/intelligence/"]').textContent,/browse all current stories/i);

let lessons=0,tools=0;
for(const entry of inventory){
 assert(sitemap.has(base+entry.url),'Resource missing from sitemap: '+entry.url);
 assert(links.has(entry.url),'Resource missing from initial library HTML: '+entry.url);
 if(!/^\/intelligence\/[^/]+\/(?:index\.html)?$/.test(entry.url)){
  const directoryURL=entry.url==='/intelligence/index.html'?'/intelligence/':entry.url;
  assert(plainLinks.has(directoryURL),'Resource missing from lightweight directory: '+directoryURL);
 }
 assert(!/[?#]/.test(entry.url),'Query or fragment used as a resource identity');
 const file=entry.url.endsWith('/')?entry.url+'index.html':entry.url;
 const dom=new JSDOM(fs.readFileSync(path.join(root,file),'utf8'),{url:base+entry.url});const doc=dom.window.document;
 assert(doc.querySelector('a[href="/explore.html"]'),'Missing return path: '+entry.url);
 if(['/risk-management.html','/trading-psychology.html'].includes(entry.url)){
  const backLink=doc.querySelector('.footer-cta a[href="#top"]');
  assert(backLink && !backLink.hasAttribute('onclick'),'Back to Top must use native fragment navigation: '+entry.url);
  const top=doc.getElementById('top');
  assert(top?.matches('header.site-resource-header[tabindex="-1"]'),'Back to Top must target a focusable header: '+entry.url);
 }
 if(entry.url.startsWith('/learn/lessons/')){
  lessons++;assert(doc.querySelector('.lesson-article').textContent.split(/\s+/).length>=170,'Incomplete lesson: '+entry.url);
  for(const selector of ['#section-1','#section-2','#example','#practice','.lesson-source a','.lesson-sequence a'])assert(doc.querySelector(selector),'Missing lesson section: '+entry.url+' '+selector);
 }
 if(entry.url.startsWith('/tools/')){tools++;assert(doc.querySelector('.tool-explainer'),'Missing tool guide: '+entry.url);}
 for(const script of doc.querySelectorAll('script[type="application/ld+json"]'))JSON.parse(script.textContent);
 dom.window.close();
}
const template=fs.readFileSync(path.join(root,'learn/forex-howto.html'),'utf8');
const topicPage=new JSDOM(template,{url:base+'/learn/forex-howto.html?topic=stocks&section=quizzes',runScripts:'outside-only'});
topicPage.window.FynxPreferences={getItem:()=>null,setItem:()=>{}};
for(const s of topicPage.window.document.querySelectorAll('script:not([src])'))if(!s.type)topicPage.window.eval(s.textContent);
assert.match(topicPage.window.document.querySelector('h1').textContent,/Forex/);
assert(topicPage.window.document.querySelector('a[href*="/learn/lessons/forex/"]'),'Lesson links removed after JS');
assert(!sitemap.has(base+'/home.html'));assert(!sitemap.has(base+'/learn/topic.html'));assert(!sitemap.has(base+'/tools/profit-loss.html'));
topicPage.window.close();library.window.close();directory.window.close();
console.log(`Discovery verified: ${inventory.length} linked resources, ${lessons} substantive lessons, ${tools} explained tools; static content, structured data, canonical topic identity and private-page exclusion passed.`);
