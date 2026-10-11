const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),base='https://www.fynxfinanceworld.com';
const inventory=JSON.parse(fs.readFileSync(path.join(root,'assets/resource-index.json'),'utf8'));
const sitemap=new Set([...fs.readFileSync(path.join(root,'sitemap.xml'),'utf8').matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]));
const library=new JSDOM(fs.readFileSync(path.join(root,'explore.html'),'utf8'),{url:base+'/explore.html'});
const directory=new JSDOM(fs.readFileSync(path.join(root,'directory.html'),'utf8'),{url:base+'/directory.html'});
assert.equal(new Set(inventory.map(e=>e.url)).size,inventory.length,'Duplicate resource URL');
assert.equal(directory.window.document.querySelectorAll('script').length,0,'Light directory must not require scripts');
const links=new Set([...library.window.document.querySelectorAll('a[href]')].map(a=>a.pathname));
const plainLinks=new Set([...directory.window.document.querySelectorAll('a[href]')].map(a=>a.pathname));
let lessons=0,tools=0;
for(const entry of inventory){
 assert(sitemap.has(base+entry.url),'Resource missing from sitemap: '+entry.url);
 assert(links.has(entry.url),'Resource missing from initial library HTML: '+entry.url);
 assert(plainLinks.has(entry.url),'Resource missing from lightweight directory: '+entry.url);
 assert(!/[?#]/.test(entry.url),'Query or fragment used as a resource identity');
 const file=entry.url.endsWith('/')?entry.url+'index.html':entry.url;
 const dom=new JSDOM(fs.readFileSync(path.join(root,file),'utf8'),{url:base+entry.url});const doc=dom.window.document;
 assert(doc.querySelector('a[href="/explore.html"]'),'Missing return path: '+entry.url);
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
