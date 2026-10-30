'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../assets/js/market-intelligence-data.js'),'utf8');
function harness(fetcher=async()=>{throw Error('offline');},seed={}){
  const cache=new Map(Object.entries(seed)),calls=[],events=[];
  const window={fetch:async(...args)=>{calls.push(args);return fetcher(...args);},localStorage:{getItem:key=>cache.get(key)||null,setItem:(key,value)=>cache.set(key,value)},dispatchEvent:event=>events.push(event),CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}}};
  vm.runInNewContext(source,{window,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Date,Map,Set,Object,Number,JSON});
  return {api:window.FYNXMarketIntelligenceData,calls,cache,events,window};
}
const json=value=>({ok:true,text:async()=>JSON.stringify(value)});
function headline(overrides={}){return {edition:'us',title:'Markets update',link:'https://www.cnbc.com/market-update',pubDate:new Date(Date.now()-60000).toISOString(),source:'CNBC',...overrides};}
function news(overrides={}){return {edition:'us',category:'all',kind:'headlines',items:[headline()],fetchedAt:new Date().toISOString(),stale:false,sources:[{id:'cnbc',name:'CNBC',status:'fresh',fetchedAt:new Date().toISOString()}],...overrides};}
function releases(overrides={}){return {edition:'us',category:'all',kind:'official-releases',items:[{...headline({link:'https://www.federalreserve.gov/newsevents/test.htm',source:'Federal Reserve'}),sourceId:'fed'}],fetchedAt:new Date().toISOString(),stale:false,sources:['fed','bea'].map(id=>({id,status:'fresh',fetchedAt:new Date().toISOString()})),...overrides};}

test('catalog is immediate, immutable and contains the iOS 7 brands / 13 destinations / 6 institutions',()=>{
 const {api,calls}=harness();assert.equal(calls.length,0);assert.equal(api.publishers.length,7);assert.equal(api.publishers.flatMap(p=>p.destinations).length,13);assert.equal(api.institutions.length,6);assert.equal(api.officialSources.length,7);assert.deepEqual(Array.from(api.sourcesForEdition('us'),s=>s.id),['fed','bea']);assert(Object.isFrozen(api.publishers[0]));
 const ids=api.publishers.flatMap(p=>p.destinations.map(d=>d.id));assert.equal(new Set(ids).size,13);assert(api.publishers.every(p=>p.destinations.every(d=>api.safeURL(d.url)&&['videos','live','podcasts'].includes(d.category))));
});
test('fresh titles decode entity apostrophes, punctuation and safe Unicode before display',async()=>{
 const h=harness(async()=>json(news({items:[headline({title:'Board&#39;s &quot;policy&quot; &amp; outlook&nbsp;&mdash; euro &#x20AC;',source:'Research &amp; Markets'})]})));
 const data=await h.api.loadHeadlines();assert.equal(data.items[0].title,'Board\'s "policy" & outlook — euro €');assert.equal(data.items[0].source,'Research & Markets');
});
test('existing headline and official caches decode entities and strip encoded unsafe HTML offline',()=>{
 const title='Board&amp;#39;s &amp;lt;img src=x onerror=&amp;quot;alert(1)&amp;quot;&amp;gt; &lt;script&gt;alert(2)&lt;/script&gt; &lt;b&gt;decision&lt;/b&gt;';
 const old=new Date(Date.now()-601000).toISOString();
 const official=releases({fetchedAt:old});official.items[0].title=title;
 const h=harness(undefined,{fynx_market_intelligence_v2_us_all:JSON.stringify(news({fetchedAt:old,items:[headline({title})]})),fynx_market_intelligence_v2_us_official:JSON.stringify(official)});
 for(const data of [h.api.getCachedHeadlines(),h.api.getCachedOfficialReleases()]){assert.equal(data.status,'cached');assert.equal(data.items[0].title,"Board's decision");assert.doesNotMatch(data.items[0].title,/<|>|onerror|alert/);}
 assert.equal(h.calls.length,0);
});
test('client entity normalization handles invalid numeric points without losing the valid article',async()=>{
 const h=harness(async()=>json(news({items:[headline({title:'Outlook &#0; &#xD800; &#x110000; &#999999999999999999999; &unknown; &#x1F4C8;'})]})));
 const data=await h.api.loadHeadlines();assert.equal(data.items[0].title,'Outlook � � � � &unknown; 📈');
});
test('one selected category makes one backend request and preserves source dates and aliases',async()=>{
 const h=harness(async()=>json(news({category:'forex'})));const data=await h.api.loadHeadlines('forex');assert.equal(h.calls.length,1);assert.equal(new URL(h.calls[0][0]).searchParams.get('category'),'forex');assert.equal(data.items[0].category,'forex');assert.equal(data.items[0].url,data.items[0].link);assert.equal(data.items[0].publishedAt,data.items[0].pubDate);assert.equal(data.status,'fresh');
});
test('concurrent refreshes share one request per category',async()=>{
 const h=harness(async()=>json(news()));await Promise.all([h.api.loadHeadlines(),h.api.loadHeadlines()]);assert.equal(h.calls.length,1);
});
test('headlines identify Google News aggregation explicitly',async()=>{
 const h=harness(async()=>json(news({items:[headline({link:'https://news.google.com/rss/articles/example',source:'Bloomberg'})]})));const data=await h.api.loadHeadlines();assert.equal(data.items[0].source,'Bloomberg');assert.equal(data.items[0].via,'Google News');
});
test('untrusted article URLs, future records and duplicate stories are rejected',async()=>{
 const h=harness(async()=>json(news({items:[headline(),headline(),headline({link:'javascript:alert(1)'}),headline({link:'https://user:pass@www.cnbc.com/b'}),headline({link:'https://127.0.0.1/a'}),headline({link:'https://www.cnbc.com/future',pubDate:new Date(Date.now()+86400000).toISOString()})]})));
 const data=await h.api.loadHeadlines();assert.equal(data.items.length,1);
});
test('a refresh failure preserves valid cache and its original retrieval date',async()=>{
 const old=new Date(Date.now()-600000).toISOString(),saved=news({fetchedAt:old});const h=harness(undefined,{fynx_market_intelligence_v2_us_all:JSON.stringify(saved)});const immediate=h.api.getCachedHeadlines();assert.equal(immediate.status,'cached');const data=await h.api.loadHeadlines('all',{force:true});assert.equal(data.status,'cached');assert.equal(data.fetchedAt,old);assert.equal(data.items.length,1);
});
test('unscoped legacy News caches remain untouched but cannot masquerade as an edition feed',async()=>{
 const raw=JSON.stringify(news()),seed={fynx_news_latest_payload:raw,fynx_market_intelligence_v1_all:raw};
 const h=harness(undefined,seed);const data=await h.api.loadHeadlines();
 assert.equal(data.status,'unavailable');assert.equal(data.items.length,0);assert.equal(h.calls.length,1);
 for(const [key,value] of Object.entries(seed))assert.equal(h.cache.get(key),value);
});
test('expired or malformed browser caches are ignored',()=>{
 for(const raw of ['not json',JSON.stringify(news({fetchedAt:new Date(Date.now()-2*86400000).toISOString()})),JSON.stringify(news({items:[headline({link:'https://user:password@example.com/a'})]}))]){const h=harness(undefined,{fynx_market_intelligence_v2_us_all:raw});assert.equal(h.api.getCachedHeadlines(),null);}
});
test('storage failure cannot prevent a successful public feed load',async()=>{
 const h=harness(async()=>json(news()));h.window.localStorage={getItem(){throw Error('storage denied');},setItem(){throw Error('storage denied');}};const data=await h.api.loadHeadlines('all',{force:true});assert.equal(data.items.length,1);
});
test('network timeout settles promptly even if transport ignores cancellation',async()=>{
 const h=harness(()=>new Promise(()=>{}));const start=Date.now();const data=await h.api.loadHeadlines('all',{timeoutMs:100});assert.equal(data.status,'unavailable');assert(Date.now()-start<600);assert.equal(h.calls[0][1].signal.aborted,true);
});
test('unavailable official endpoint cannot relabel a generic market feed as official releases',async()=>{
 const h=harness(async()=>json(news()));const data=await h.api.loadOfficialReleases();assert.equal(new URL(h.calls[0][0]).searchParams.get('kind'),'releases');assert.equal(data.status,'unavailable');assert.equal(data.items.length,0);assert.deepEqual(Array.from(data.sources,s=>s.id),['fed','bea']);
});
test('official response accepts only exact source hosts and uses canonical source attribution',async()=>{
 const h=harness(async()=>json(releases({items:[...releases().items,{...releases().items[0],link:'https://www.federalreserve.gov.attacker.example/a'}, {...releases().items[0],link:'https://www.federalreserve.gov/b',sourceId:'unknown'}]})));
 const data=await h.api.loadOfficialReleases();assert.equal(data.items.length,1);assert.equal(data.items[0].source,'Federal Reserve');assert.equal(data.items[0].sourceId,'fed');
});
test('official partial outage keeps the failed-source browser cache while refreshing other sources',async()=>{
 const old=new Date(Date.now()-600000).toISOString();
 const saved=releases({fetchedAt:old,items:[{...headline({title:'GDP release',link:'https://www.bea.gov/news/gdp'}),sourceId:'bea',source:'BEA'}],sources:[{id:'fed',status:'unavailable',fetchedAt:null},{id:'bea',status:'fresh',fetchedAt:old},{id:'ecb',status:'unavailable',fetchedAt:null}]});
 const current=releases({sources:[{id:'fed',status:'fresh',fetchedAt:new Date().toISOString()},{id:'bea',status:'unavailable',fetchedAt:null},{id:'ecb',status:'unavailable',fetchedAt:null}],stale:true});
 const h=harness(async()=>json(current),{fynx_market_intelligence_v2_us_official:JSON.stringify(saved)});const data=await h.api.loadOfficialReleases({force:true});assert.equal(data.items.length,2);assert.equal(data.sources.find(s=>s.id==='bea').status,'cached');assert.equal(data.sources.find(s=>s.id==='bea').fetchedAt,old);assert.equal(data.sources.find(s=>s.id==='fed').status,'fresh');
});
test('cache update events identify the edition and only fire for the all-headlines view',async()=>{
 const h=harness(async url=>{const params=new URL(url).searchParams,edition=params.get('edition');return json(news({edition,category:params.get('category'),items:[headline({edition})]}));});
 await h.api.loadHeadlines('crypto');assert.equal(h.events.length,0);
 await h.api.loadHeadlines('all',{edition:'uk'});assert.equal(h.events.length,1);assert.equal(h.events[0].type,'fynx:news-updated');assert.equal(h.events[0].detail.edition,'uk');
 assert(h.cache.has('fynx_market_intelligence_v2_uk_all'));assert(!h.cache.has('fynx_news_latest_payload'));
});
test('bad categories do not reach the public endpoint',async()=>{const h=harness();await assert.rejects(h.api.loadHeadlines('__proto__'),/Unknown/);assert.equal(h.calls.length,0);});

test('all twelve supported editions reach the backend explicitly and have isolated cache identities',async()=>{
 const editions=['global','us','uk','canada','europe','asia','india','middle-east','africa','latin-america','japan','australia'];
 const h=harness(async url=>{const params=new URL(url).searchParams,edition=params.get('edition');return json(news({edition,items:[headline({edition})]}));});
 for(const edition of editions){const data=await h.api.loadHeadlines('all',{edition});assert.equal(data.edition,edition);assert.equal(data.items[0].edition,edition);assert(h.cache.has('fynx_market_intelligence_v2_'+edition+'_all'));}
 assert.equal(h.calls.length,editions.length);
 await assert.rejects(h.api.loadHeadlines('all',{edition:'unknown'}),/Unknown edition/);
 assert.equal(h.calls.length,editions.length);
});

test('backend media license URLs produce canonical renderer labels without requiring a supplied label',async()=>{
 const base={url:'https://images.publisher.example/photo.jpg',sourceURL:'https://publisher.example/story',credit:'Publisher photographer'};
 for(const [licenseURL,expected] of [['https://creativecommons.org/licenses/by/4.0/','CC BY 4.0'],['https://www.creativecommons.org/licenses/by-sa/4.0','CC BY-SA 4.0'],['https://creativecommons.org/publicdomain/zero/1.0/','CC0']]){
  const h=harness(async()=>json(news({items:[headline({image:{...base,licenseURL}})]})));const value=await h.api.loadHeadlines();
  assert.equal(value.items[0].image.license,expected);assert.match(value.items[0].image.licenseURL,/^https:\/\/creativecommons\.org\/.+\/$/);
  const {JSDOM}=require('jsdom'),path=require('node:path'),root=path.join(__dirname,'..');
  const dom=new JSDOM(fs.readFileSync(path.join(root,'news/finance.html'),'utf8'),{url:'https://www.fynxfinanceworld.com/news/finance.html',runScripts:'outside-only'});
  try{
   await new Promise(resolve=>dom.window.addEventListener('load',resolve,{once:true}));
   dom.window.FynxEdition={get:()=> 'us',editions:[{id:'us',label:'US'}]};
   dom.window.FYNXMarketIntelligenceData={loadHeadlines:async()=>value};
   dom.window.eval(fs.readFileSync(path.join(root,'assets/js/newsroom-page.js'),'utf8'));
   await new Promise(resolve=>setImmediate(resolve));
   const rendered=dom.window.document.querySelector('.newsroom-story-image');
   assert(rendered,'normalized backend image must render on the actual section page');
   assert.equal(rendered.querySelector('img').getAttribute('src'),base.url);assert(rendered.querySelector('figcaption').textContent.includes(expected));
  }finally{dom.window.close();}
 }
});
test('media normalization rejects unsupported CC licenses even when supplied text falsely claims reusable terms',async()=>{
 const base={url:'https://images.publisher.example/photo.jpg',sourceURL:'https://publisher.example/story',credit:'Publisher photographer',license:'CC BY 4.0'};
 for(const licenseURL of ['https://creativecommons.org/licenses/by-nc/4.0/','https://creativecommons.org/licenses/by-nd/4.0/','https://creativecommons.org/about/','https://creativecommons.org/licenses/by/4.0/?redirect=unsafe','https://creativecommons.org.attacker.example/licenses/by/4.0/']){
  const h=harness(async()=>json(news({items:[headline({image:{...base,licenseURL}})]})));const value=await h.api.loadHeadlines();assert.equal(value.items[0].image,null,licenseURL);
 }
});
