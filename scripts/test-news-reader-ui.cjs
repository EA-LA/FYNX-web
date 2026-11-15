/* Reader rendering and interaction tests. All articles here are test fixtures. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'news/article.html'),'utf8');
const script=fs.readFileSync(path.join(root,'assets/js/news-reader.js'),'utf8');
const id='a'.repeat(64), now=Date.parse('2026-11-02T18:00:00Z');
const iso=offset=>new Date(now+offset).toISOString();
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const article=(extra={})=>({id,title:'Fixture company reports quarterly results',source:'Fixture Publisher',sourceUrl:'https://publisher.example/news/quarterly-results',publishedAt:iso(-3600000),edition:'us',category:'finance',coverageLevel:'source-text',coverageNote:'Available public source text was reviewed.',preparedAt:iso(-60000),updatedAt:iso(-60000),summary:'The fixture company reported higher quarterly revenue and left its annual outlook unchanged.',keyPoints:[{text:'Revenue rose in the reported quarter.',evidence:'Quarterly revenue increased from the previous year.'}],numbers:[{value:'12%',context:'The company’s reported year-over-year revenue increase.'}],context:[{title:'Revenue and profit measure different things.',text:'Revenue measures sales before costs. Profit also reflects expenses, so revenue growth alone does not establish an increase in profit.'}],questions:['Did the original report change the annual outlook?'],terms:[{term:'Outlook',definition:'A company’s expectations for a future period, rather than a completed result.'}],related:[],sources:[],method:'source-backed-extractive',isCurrent:true,...extra});
function harness(t,{cached=null,load=async()=>article(),query='?id='+id+'&edition=us&category=finance',setup=()=>{}}={}){
 const dom=new JSDOM(html,{url:'https://www.fynxfinanceworld.com/news/article.html'+query,runScripts:'outside-only',virtualConsole:new VirtualConsole()});
 t.after(()=>dom.window.close());const w=dom.window;w.Date.now=()=>now;let edition='us';const calls=[],intervals=[];
 w.setInterval=(fn,ms)=>{intervals.push({fn,ms});return intervals.length;};w.clearInterval=()=>{};
 Object.defineProperty(w.document,'hidden',{get:()=>false,configurable:true});
 w.FynxEdition={get:()=>edition,editions:[{id:'us',label:'US'},{id:'uk',label:'UK'}]};
 w.FYNXNewsReaderData={getCachedArticle:()=>cached,loadArticle:async options=>{calls.push(options);return load(options);},href:row=>row.readerUrl||'/news/article.html?id='+row.articleId+'&edition=us&category=finance'};
 w.FYNXNewsroomMedia={createFigure:category=>{const figure=w.document.createElement('figure');figure.dataset.contextImage=category;figure.textContent='Context photograph: '+category;return figure;}};
 setup(w);w.eval(script);return {w,doc:w.document,calls,intervals,setEdition:value=>{edition=value;},q:selector=>w.document.querySelector(selector)};
}

test('reader preserves source facts and omits generic topic context',async t=>{
 const h=harness(t);await tick();assert.equal(h.q('[data-reader-title]').textContent,article().title);
 assert.match(h.q('[data-reader-access]').textContent,/Source text reviewed/);
 assert.match(h.q('[data-reader-summary]').textContent,/quarterly revenue/);
 assert.equal(h.q('[data-reader-context-section]').hidden,true);
 assert.doesNotMatch(h.q('[data-reader-context]').textContent,/Revenue measures sales/);
 assert.equal(h.q('[data-reader-numbers] strong').textContent,'12%');
 assert.equal(h.q('[data-reader-sources] a').href,article().sourceUrl);
 assert.equal(h.q('[data-reader-loaded]').hidden,false);
 assert.equal(h.q('[data-news-reader]').querySelector('meta[name="robots"]'),null); // Metadata lives outside the main reader.
 assert.equal(h.doc.querySelector('meta[name="robots"]').content,'noindex,follow');
 assert.equal(h.calls[0].id,id);assert.equal(h.intervals[0].ms,300000);
});

test('headline-only coverage never claims the complete article was reviewed',async t=>{
 const h=harness(t,{load:async()=>article({coverageLevel:'headline-only',coverageNote:'Only the headline was available.',summary:'Only the publisher headline is available.',keyPoints:[],numbers:[],context:[],questions:[],terms:[]})});await tick();
 assert.match(h.q('[data-reader-deck]').textContent,/not obtained enough source text/);
 assert.match(h.q('[data-reader-check-note]').textContent,/does not imply that FYNX read the complete article/);
 assert.equal(h.q('[data-reader-points-section]').hidden,true);assert.equal(h.q('[data-reader-context-section]').hidden,true);assert.equal(h.q('[data-reader-numbers-section]').hidden,true);
 assert.equal(h.q('[data-reader-sources] a').textContent.includes('Fixture Publisher'),true);
});

test('cached article opens immediately and a changed brief waits for explicit application',async t=>{
 let resolve;const h=harness(t,{cached:article(),load:()=>new Promise(done=>{resolve=done;})});await tick();
 const oldSummary=h.q('[data-reader-summary]').textContent,focus=h.q('[data-reader-points] summary');focus.focus();
 resolve(article({summary:'A verified correction is now available in the source excerpt.',updatedAt:iso(0)}));await tick();
 assert.equal(h.q('[data-reader-summary]').textContent,oldSummary);assert.equal(h.doc.activeElement,focus);
 assert.match(h.q('[data-reader-refresh]').textContent,/Read updated brief/);
 h.q('[data-reader-refresh]').click();assert.match(h.q('[data-reader-summary]').textContent,/verified correction/);
});

test('unchanged checks do not replace the active reading DOM',async t=>{
 const h=harness(t);await tick();const old=h.q('[data-reader-points] summary');old.focus();
 await h.intervals[0].fn();await tick();assert.equal(h.q('[data-reader-points] summary'),old);assert.equal(h.doc.activeElement,old);
});

test('bad identities, unsafe destinations and future timestamps are rejected',async t=>{
 for(const extra of [{id:'b'.repeat(64)},{sourceUrl:'javascript:alert(1)'},{sourceUrl:'https://127.0.0.1/private'},{publishedAt:iso(3600000)}]){
  const h=harness(t,{load:async()=>article(extra)});await tick();assert.equal(h.q('[data-reader-content]').hidden,true);assert.equal(h.q('[data-reader-error]').hidden,false);assert.equal(h.q('[data-reader-sources]').children.length,0);
 }
});

test('edition preference changes preserve the current report and its shareable identity',async t=>{
 const h=harness(t);await tick();const old=h.q('[data-reader-title]');h.setEdition('uk');h.w.history.replaceState(null,'','?id='+id+'&edition=uk&category=finance');h.doc.dispatchEvent(new h.w.CustomEvent('fynx:edition-change',{detail:{edition:'uk',previous:'us'}}));
 assert.equal(h.q('[data-reader-title]'),old);assert.match(h.q('[data-reader-back]').href,/edition=uk/);assert.equal(new URL(h.w.location.href).searchParams.get('edition'),'us');
 h.q('[data-reader-refresh]').click();await tick();assert.equal(h.calls.at(-1).edition,'us');
});

test('no verified story id means no article request or invented content',async t=>{
 const h=harness(t,{query:'?title=Unverified'});await tick();assert.equal(h.calls.length,0);assert.equal(h.q('[data-reader-content]').hidden,true);assert.match(h.q('[data-reader-error]').textContent,/does not identify a verified story/);
});

test('unavailable refresh preserves dated content and does not claim a fresh check',async t=>{
 const h=harness(t,{cached:article(),load:async()=>{throw new Error('Source unavailable');}});await tick();assert.equal(h.q('[data-reader-content]').hidden,false);assert.match(h.q('[data-reader-status]').textContent,/could not be refreshed/);assert.equal(h.q('[data-reader-title]').textContent,article().title);
});

test('older direct-reader coverage is visibly historical, never labeled current',async t=>{
 const h=harness(t,{load:async()=>article({publishedAt:iso(-3*86400000),isCurrent:false})});await tick();assert.match(h.q('[data-reader-meta]').textContent,/Past coverage/);assert.match(h.q('[data-reader-status]').textContent,/outside the current news window/);
});

test('article content remains plain text and related stories must remain on verified internal routes',async t=>{
 const h=harness(t,{load:async()=>article({summary:'<img src=x onerror=alert(1)>',related:[{articleId:'b'.repeat(64),title:'Fixture follow-up',source:'Second Publisher',publishedAt:iso(-1000)},{articleId:'c'.repeat(64),title:'External redirect',source:'Other',publishedAt:iso(-1000),readerUrl:'https://attacker.example/news/article.html?id='+('c'.repeat(64))},{articleId:'d'.repeat(64),title:'Old story',source:'Other',publishedAt:iso(-8*86400000)}]})});await tick();
 assert.equal(h.q('[data-reader-summary] img'),null);assert.match(h.q('[data-reader-summary]').textContent,/<img/);assert.equal(h.q('[data-reader-related]').children.length,1);assert.equal(h.q('[data-reader-related] a').target,'');assert.match(h.q('[data-reader-related] a').href,/www.fynxfinanceworld.com\/news\/article.html/);
});

test('shared-service related reporting uses the exact internal source resolver without edition redirection',async t=>{
 const row={articleId:'b'.repeat(64),title:'Anthropic follow-up fixture',source:'CNBC',sourceUrl:'https://www.cnbc.com/2026/11/12/anthropic-fixture.html?x=1&y=2',publishedAt:iso(-3*86400000),readerUrl:'/news/article.html?id='+('b'.repeat(64))+'&edition=uk&category=technology'};
 const h=harness(t,{load:async()=>article({related:[row]}),setup:w=>{w.FYNXNewsReaderData.href=()=>{throw Error('Exact shared sources must not use edition-based or Intelligence-map lookup');};}});await tick();
 const link=h.q('[data-reader-related] h3 a'),target=new URL(link.href);
 assert.equal(target.origin,h.w.location.origin);assert.equal(target.pathname,'/news/article.html');assert.equal(target.searchParams.get('url'),row.sourceUrl);
 assert.deepEqual([...target.searchParams.keys()],['url']);assert.equal(link.target,'');assert.equal(h.q('[data-reader-related-section]').hidden,false);
});
test('unsafe source URLs and expired related reporting are skipped without discarding legacy internal links',async t=>{
 const row=(letter,extra={})=>({articleId:letter.repeat(64),title:'Related fixture '+letter,source:'Fixture',publishedAt:iso(-1000),...extra});
 const h=harness(t,{load:async()=>article({related:[row('b',{sourceUrl:'javascript:alert(1)'}),row('c',{sourceUrl:'https://127.0.0.1/private'}),row('d',{sourceUrl:'http://publisher.example/story'}),row('e',{sourceUrl:'https://publisher.example/old',publishedAt:iso(-8*86400000)}),row('f')]})});await tick();
 const links=h.doc.querySelectorAll('[data-reader-related] h3 a');assert.equal(links.length,1);assert.equal(new URL(links[0].href).searchParams.get('id'),'f'.repeat(64));
 assert.equal(h.q('[data-reader-content]').hidden,false);assert.match(h.q('[data-reader-summary]').textContent,/quarterly revenue/);
});
test('related reporting keeps published FYNX Intelligence destinations and rejects other paths',async t=>{
 const makeRow=(letter,title,readerUrl)=>({articleId:letter.repeat(64),title,source:'Related Fixture Publisher',publishedAt:iso(-1000),readerUrl});
 const h=harness(t,{load:async()=>article({related:[
  makeRow('b','Source-backed Intelligence analysis','/intelligence/fixture-market-analysis-abc123/'),
  makeRow('c','Standard source brief','/news/article.html?id='+('c'.repeat(64))+'&edition=us&category=finance'),
  makeRow('d','Owner page is not a story','/owner.html'),
  makeRow('e','Intelligence URL with tracking query','/intelligence/fixture-market-analysis-abc123/?next=/owner.html'),
  makeRow('f','External Intelligence URL','https://attacker.example/intelligence/fixture-market-analysis-abc123/')
 ]})});
 await tick();
 const links=Array.from(h.doc.querySelectorAll('[data-reader-related] a'));
 assert.equal(links.length,2,'Show both supported routes, not unverified destinations');
 assert.equal(links[0].getAttribute('href'),'/intelligence/fixture-market-analysis-abc123/');
 assert.equal(links[1].getAttribute('href'),'/news/article.html?id='+('c'.repeat(64))+'&edition=us&category=finance');
 assert.equal(h.q('[data-reader-related-section]').hidden,false);
});

const licensedImage=(extra={})=>({url:'https://images.example/report.jpg',articleID:id,credit:'Fixture photographer',sourceURL:article().sourceUrl,license:'CC BY 4.0',licenseURL:'https://creativecommons.org/licenses/by/4.0/',expiresAt:iso(3600000),alt:'Source image fixture',...extra});
test('source image requires approved rights bound to the exact article',async t=>{
 const valid=licensedImage(),h=harness(t,{load:async()=>article({image:valid})});await tick();
 assert.equal(h.q('[data-reader-image] img').alt,valid.alt);assert.equal(h.q('[data-reader-image] img').src,valid.url);
 const credit=h.q('[data-reader-image] figcaption');assert.match(credit.textContent,/Fixture photographer/);assert.match(credit.textContent,/CC BY 4.0/);
 assert.equal(credit.querySelectorAll('a')[0].href,article().sourceUrl);assert.equal(credit.querySelectorAll('a')[1].href,valid.licenseURL);
 h.q('[data-reader-image] img').dispatchEvent(new h.w.Event('error'));
 assert.equal(h.q('[data-reader-image] img'),null);assert.equal(h.q('[data-reader-content]').hidden,false);assert.match(h.q('[data-reader-summary]').textContent,/quarterly revenue/);
});
const contextImage=(extra={})=>licensedImage({kind:'context',caption:'NVIDIA headquarters in Santa Clara, California, photographed in 2018. Context image, not a photograph of this reported event.',sourcePage:'https://commons.wikimedia.org/wiki/File:NVIDIA_Headquarters.jpg',credit:'Coolcaesar; edited by Jacek Halicki',license:'CC BY-SA 4.0',licenseURL:'https://creativecommons.org/licenses/by-sa/4.0/',alt:undefined,...extra});
test('approved context photograph preserves historical caption author original source and uncropped display',async t=>{
 const image=contextImage(),h=harness(t,{load:async()=>article({image})});await tick();
 const figure=h.q('[data-reader-image] figure'),img=figure.querySelector('img'),caption=figure.querySelector('figcaption');
 assert.equal(figure.dataset.readerImageKind,'context');assert.equal(img.style.objectFit,'contain');assert.match(img.alt,/Context photograph:.*2018/);
 assert.match(caption.textContent,/Context photograph: NVIDIA headquarters/);assert.match(caption.textContent,/2018.*not a photograph of this reported event/);
 assert.match(caption.textContent,/Coolcaesar; edited by Jacek Halicki/);assert.match(caption.textContent,/CC BY-SA 4.0/);
 const links=caption.querySelectorAll('a');assert.equal(links[0].textContent,'Original image source');assert.equal(links[0].href,image.sourcePage);assert.equal(links[1].href,image.licenseURL);
 assert.equal(h.q('[data-reader-content]').hidden,false);
});
test('context permission does not bypass caption provenance identity or license requirements',async t=>{
 for(const invalid of [{caption:''},{caption:'x'.repeat(601)},{caption:null},{sourcePage:undefined},{sourcePage:'http://commons.wikimedia.org/wiki/File:Example.jpg'},{sourcePage:'https://127.0.0.1/private'},{license:'All rights reserved'},{licenseURL:'https://unlicensed.example/terms'},{articleID:'b'.repeat(64)}]){
  const h=harness(t,{load:async()=>article({image:contextImage(invalid)})});await tick();
  assert.equal(h.q('[data-reader-image] img'),null,JSON.stringify(invalid));assert.equal(h.q('[data-reader-content]').hidden,false);assert.match(h.q('[data-reader-summary]').textContent,/quarterly revenue/);
 }
});
test('approved related context photo is also uncropped and clearly labeled',async t=>{
 const row={articleId:'b'.repeat(64),title:'NVIDIA follow-up fixture',source:'Fixture Publisher',sourceUrl:'https://publisher.example/follow-up',publishedAt:iso(-1000)};
 row.image=contextImage({articleID:row.articleId,sourceURL:row.sourceUrl});
 const h=harness(t,{load:async()=>article({related:[row]})});await tick();
 assert.equal(h.q('[data-reader-related] img').style.objectFit,'contain');assert.match(h.q('[data-reader-related] figcaption').textContent,/Context photograph:.*2018/);
 assert.equal(new URL(h.q('[data-reader-related] h3 a').href).searchParams.get('url'),row.sourceUrl);
});
test('mismatched expired and malformed optional images cannot degrade verified article text',async t=>{
 const rejected=[
  {articleID:'b'.repeat(64)},{articleID:undefined},{sourceURL:'https://publisher.example/other-story'},
  {expiresAt:undefined},{expiresAt:iso(-1)},{expiresAt:'not-a-date'},{expiresAt:iso(8*86400000)},
  {license:'All rights reserved'},{licenseURL:'https://unverified.example/license'},
  {license:'CC0'}, {credit:'   '},{width:-1},{height:10001},{width:1.5},
  {url:'http://images.example/report.jpg'},{sourceURL:'javascript:alert(1)'}
 ];
 for(const bad of rejected){
  let previews=0;
  const h=harness(t,{load:async()=>article({image:licensedImage(bad)}),setup:w=>{w.FYNXNewsroomMedia.createFigure=()=>{previews++;throw Error('Unlicensed preview must not be requested');};}});await tick();
  assert.equal(h.q('[data-reader-image] img'),null,JSON.stringify(bad));assert.equal(previews,0);
  assert.equal(h.q('[data-reader-title]').textContent,article().title);assert.equal(h.q('[data-reader-content]').hidden,false);assert.match(h.q('[data-reader-summary]').textContent,/quarterly revenue/);
 }
 const pastContent=harness(t,{load:async()=>article({contentExpiresAt:iso(1000),image:licensedImage({expiresAt:iso(2000)})})});await tick();
 assert.equal(pastContent.q('[data-reader-image] img'),null,'Image rights may not exceed article content retention');
 assert.equal(pastContent.q('[data-reader-content]').hidden,false);
});
test('legacy string and partially malformed related artwork preserve all verified story text',async t=>{
 const rows=['b','c','d','e','f'].map((letter,index)=>({articleId:letter.repeat(64),title:'Verified related story '+index,source:'Second Publisher',sourceUrl:'https://publisher.example/story-'+index,publishedAt:iso(-1000),image:[null,'https://images.example/unlicensed.jpg',[],{url:'https://images.example/incomplete.jpg'},licensedImage({articleID:letter.repeat(64),sourceURL:'https://publisher.example/story-'+index})][index]}));
 const h=harness(t,{load:async()=>article({image:'https://images.example/legacy-unlicensed.jpg',related:rows})});await tick();
 assert.equal(h.q('[data-reader-image] img'),null);assert.equal(h.q('[data-reader-content]').hidden,false);
 assert.equal(h.doc.querySelectorAll('[data-reader-related] h3 a').length,5,'Malformed optional artwork does not discard related metadata');
 assert.equal(h.doc.querySelectorAll('[data-reader-related] img').length,1,'Only the independently approved image is displayed');
 assert.match(h.q('[data-reader-summary]').textContent,/quarterly revenue/);
});
test('image permission expiry removes imagery while preserving reading position and source text',async t=>{
 const h=harness(t,{load:async()=>article({contentExpiresAt:iso(3600000),image:licensedImage({expiresAt:iso(1000)})})});await tick();
 const summary=h.q('[data-reader-summary]'),detail=h.q('[data-reader-points] summary');detail.focus();assert.ok(h.q('[data-reader-image] img'));
 h.w.Date.now=()=>now+2000;h.doc.dispatchEvent(new h.w.Event('visibilitychange'));
 assert.equal(h.q('[data-reader-image] img'),null);assert.equal(h.q('[data-reader-summary]'),summary);assert.equal(h.doc.activeElement,detail);assert.equal(h.q('[data-reader-content]').hidden,false);
});
test('related images are bound to their own story and disappear independently of links',async t=>{
 const rows=['b','c','d'].map((letter,index)=>({articleId:letter.repeat(64),title:'Verified follow-up '+index,source:'Second Publisher',sourceUrl:'https://publisher.example/follow-up-'+index,publishedAt:iso(-1000)}));
 rows[0].image=licensedImage({articleID:rows[0].articleId,sourceURL:rows[0].sourceUrl,expiresAt:iso(1000)});
 rows[1].image=licensedImage({articleID:rows[0].articleId,sourceURL:rows[0].sourceUrl});
 rows[2].image=licensedImage({articleID:rows[2].articleId,sourceURL:rows[2].sourceUrl,expiresAt:iso(7200000)});
 const h=harness(t,{load:async()=>article({related:rows,contentExpiresAt:iso(3600000)})});await tick();
 assert.equal(h.q('[data-reader-related]').children.length,3);assert.equal(h.doc.querySelectorAll('[data-reader-related] img').length,1);
 assert.match(h.q('[data-reader-related] figcaption').textContent,/Fixture photographer/);
 h.w.Date.now=()=>now+2000;h.doc.dispatchEvent(new h.w.Event('visibilitychange'));
 assert.equal(h.doc.querySelectorAll('[data-reader-related] img').length,0);assert.equal(h.doc.querySelectorAll('[data-reader-related] h3 a').length,3);assert.equal(h.q('[data-reader-content]').hidden,false);
});

test('a cache fallback never counts as a successful source refresh, including after returning to the tab',async t=>{
 const h=harness(t,{load:async()=>article({refreshUnavailable:true})});await tick();
 assert.equal(h.q('[data-reader-title]').textContent,article().title);
 assert.match(h.q('[data-reader-status]').textContent,/could not be refreshed/);
 assert.doesNotMatch(h.q('[data-reader-status]').textContent,/Last brief check/);
 h.doc.dispatchEvent(new h.w.Event('visibilitychange'));
 assert.match(h.q('[data-reader-status]').textContent,/could not be refreshed/);
});

test('missing authorized artwork never invokes the publisher Open Graph preview fallback',async t=>{
 for(const title of ['Stock markets and S&P 500','Company quarterly earnings','Semiconductor production','Inflation release','Oil production','Manufacturing factories','Congress votes','A changing outlook']){
  let previews=0;const h=harness(t,{load:async()=>article({title,category:'all'}),setup:w=>{w.FYNXNewsroomMedia.createFigure=()=>{previews++;return w.document.createElement('figure');};}});await tick();
  assert.equal(previews,0);assert.equal(h.q('[data-reader-image]').childElementCount,0);assert.equal(h.q('[data-reader-title]').textContent,title);assert.equal(h.q('[data-reader-content]').hidden,false);
 }
});

test('reading size and focus preferences persist and focus can be exited with Escape',async t=>{
 const h=harness(t,{setup:w=>w.localStorage.setItem('fynx:reader-preferences:v1',JSON.stringify({size:'large',focus:true}))});await tick();
 assert.equal(h.q('[data-news-reader]').dataset.readerSize,'large');assert.equal(h.doc.body.classList.contains('reader-focus-view'),true);
 assert.equal(h.q('[data-reader-focus]').getAttribute('aria-pressed'),'true');
 assert.equal(h.q('[data-reader-sources] a').href,article().sourceUrl);
 const select=h.q('[data-reader-text-size]');select.value='larger';select.dispatchEvent(new h.w.Event('change'));
 assert.equal(JSON.parse(h.w.localStorage.getItem('fynx:reader-preferences:v1')).size,'larger');
 h.doc.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape'}));
 assert.equal(h.doc.body.classList.contains('reader-focus-view'),false);assert.equal(h.doc.activeElement,h.q('[data-reader-focus]'));
 assert.equal(JSON.parse(h.w.localStorage.getItem('fynx:reader-preferences:v1')).focus,false);
});

test('invalid preferences and unavailable browser storage do not break the reader',async t=>{
 const invalid=harness(t,{setup:w=>w.localStorage.setItem('fynx:reader-preferences:v1',JSON.stringify({size:'injected',focus:'true'}))});await tick();
 assert.equal(invalid.q('[data-news-reader]').dataset.readerSize,'standard');assert.equal(invalid.doc.body.classList.contains('reader-focus-view'),false);
 const blocked=harness(t,{setup:w=>Object.defineProperty(w,'localStorage',{get(){throw new Error('blocked');}})});await tick();
 blocked.q('[data-reader-focus]').click();assert.equal(blocked.doc.body.classList.contains('reader-focus-view'),true);
 assert.match(blocked.q('[data-reader-preferences-note]').textContent,/storage is unavailable/);assert.equal(blocked.q('[data-reader-title]').textContent,article().title);
});

test('sharing keeps the verified internal route and excludes unrelated query strings',async t=>{
 const shared=[],h=harness(t,{query:'?id='+id+'&edition=us&category=finance&tracking=private#reader-brief',setup:w=>{w.navigator.share=async data=>shared.push(data);}});await tick();
 h.q('[data-reader-share]').click();await tick();
 assert.equal(shared.length,1);assert.equal(shared[0].title,article().title);
 assert.equal(shared[0].url,'https://www.fynxfinanceworld.com/news/article.html?id='+id+'&edition=us&category=finance');
 assert.match(h.q('[data-reader-action-status]').textContent,/Story shared/);assert.equal(h.q('[data-reader-share]').disabled,false);
});

test('share cancellation does not copy without user intent, and clipboard failure exposes a selectable link',async t=>{
 let copies=0;const h=harness(t,{setup:w=>{w.navigator.share=async()=>{const error=new Error('cancelled');error.name='AbortError';throw error;};w.navigator.clipboard={writeText:async()=>{copies++;throw new Error('blocked');}};}});await tick();
 h.q('[data-reader-share]').click();await tick();assert.equal(copies,0);assert.match(h.q('[data-reader-action-status]').textContent,/cancelled/);
 h.q('[data-reader-copy]').click();await tick();assert.equal(copies,1);assert.equal(h.q('[data-reader-share-fallback]').hidden,false);
 assert.equal(h.doc.activeElement,h.q('[data-reader-share-url]'));assert.match(h.q('[data-reader-share-url]').value,/news\/article\.html\?id=/);
 h.q('[data-reader-share-close]').click();assert.equal(h.q('[data-reader-share-fallback]').hidden,true);assert.equal(h.doc.activeElement,h.q('[data-reader-copy]'));
});

test('share falls back to clipboard and success preserves source freshness status',async t=>{
 const copied=[],h=harness(t,{setup:w=>{w.navigator.clipboard={writeText:async value=>copied.push(value)};}});await tick();
 const before=h.q('[data-reader-status]').textContent;h.q('[data-reader-share]').click();await tick();
 assert.equal(copied.length,1);assert.match(h.q('[data-reader-action-status]').textContent,/link copied/);assert.equal(h.q('[data-reader-status]').textContent,before);
});

test('only verified displayed stories enter local opening history, once per reader visit',async t=>{
 const opened=[],h=harness(t,{setup:w=>{w.FYNXYourNews={markOpened:value=>opened.push(value)};}});await tick();
 assert.equal(opened.length,1);assert.equal(opened[0].id,id);assert.equal(opened[0].sourceUrl,article().sourceUrl);
 await h.intervals[0].fn();await tick();assert.equal(opened.length,1);
 const rejected=[];const bad=harness(t,{load:async()=>article({id:'b'.repeat(64)}),setup:w=>{w.FYNXYourNews={markOpened:value=>rejected.push(value)};}});await tick();
 assert.equal(rejected.length,0);assert.equal(bad.q('[data-reader-share]').disabled,true);assert.equal(bad.q('[data-reader-copy]').disabled,true);
 assert.equal(h.q('.reader-your-news').getAttribute('href'),'/news/your-news.html');
});

test('story-specific sections require exact supporting source evidence',async t=>{
 const source=article().sourceUrl,summary='The new rule may affect borrowing costs for eligible households.';
 const h=harness(t,{load:async()=>article({summary,intelligence:{version:1,whyItMatters:[{text:summary,sourceURL:source,kind:'potential'},{text:'Unsupported benefit claim',sourceURL:source,kind:'source-reported'}],marketImpact:[{text:summary,sourceURL:'https://wrong.example/report',kind:'reported-movement'}],context:[],nextEvents:[]}})});await tick();
 assert.equal(h.q('[data-reader-context-section]').hidden,false);assert.match(h.q('[data-reader-context]').textContent,/eligible households/);assert.doesNotMatch(h.q('[data-reader-context]').textContent,/Unsupported benefit|Source-reported movement/);
});
test('source URL links resolve to the authoritative web story identity',async t=>{
 const h=harness(t,{query:'?url='+encodeURIComponent(article().sourceUrl),setup:w=>{w.FYNXNewsReaderData.resolveArticle=async request=>{assert.equal(request.url,article().sourceUrl);return article();};}});await tick();
 assert.equal(h.q('[data-reader-title]').textContent,article().title);assert.equal(h.q('[data-reader-loaded]').hidden,false);
});


test('dated market context preserves units and rejects stale or unsupported snapshots',async t=>{
 const snapshot={symbol:'US10Y',name:'Treasury yield',price:4.1,changeValue:2,changeUnit:'bp',asOf:iso(-60000),source:'Fixture market provider',sourceURL:'https://provider.example/quote'};
 const h=harness(t,{load:async()=>article({marketContext:[snapshot,{...snapshot,symbol:'BTC-USD',asOf:iso(-7200000)},{...snapshot,name:'Unsafe',sourceURL:'javascript:alert(1)'},{...snapshot,name:'Expired',asOf:iso(-5*86400000)}]})});await tick();
 const content=h.q('[data-reader-context]').textContent;assert.match(content,/do not establish a reaction/);assert.match(content,/\+2.00bp/);assert.doesNotMatch(content,/BTC-USD|Unsafe|Expired/);assert.equal(h.q('[data-reader-context] a').href,snapshot.sourceURL);
});

test('a changed market snapshot offers an update without replacing active reading',async t=>{
 const first=article({marketContext:[{symbol:'TEST',name:'Fixture',price:100,asOf:iso(-60000),source:'Fixture',sourceURL:'https://provider.example/quote'}]});
 const h=harness(t,{cached:first,load:async()=>({...first,marketContext:[{...first.marketContext[0],price:101}]})});await tick();
 assert.match(h.q('[data-reader-context]').textContent,/100/);assert.match(h.q('[data-reader-refresh]').textContent,/Read updated brief/);h.q('[data-reader-refresh]').click();assert.match(h.q('[data-reader-context]').textContent,/101/);
});


test('resolved stories share their exact id without changing to a scoped feed lookup',async t=>{
 const shared=[],h=harness(t,{query:'?url='+encodeURIComponent(article().sourceUrl),setup:w=>{w.FYNXNewsReaderData.resolveArticle=async()=>article();w.navigator.share=async value=>shared.push(value);}});await tick();h.q('[data-reader-share]').click();await tick();
 assert.equal(shared[0].url,'https://www.fynxfinanceworld.com/news/article.html?id='+id);
 h.setEdition('uk');h.doc.dispatchEvent(new h.w.CustomEvent('fynx:edition-change'));assert.equal(new URL(h.w.location.href).searchParams.has('edition'),false);
});
test('source expiry clears an open reader and prevents expired updates from being applied',async t=>{
 const h=harness(t,{load:async()=>article({contentExpiresAt:iso(1000)})});await tick();assert.equal(h.q('[data-reader-content]').hidden,false);
 h.w.Date.now=()=>now+2000;h.intervals.find(x=>x.ms===20000).fn();assert.equal(h.q('[data-reader-content]').hidden,true);assert.equal(h.q('[data-reader-summary]').children.length,0);assert.equal(h.q('[data-reader-share]').disabled,true);
});
test('a definitive removed shared story clears a previously visible brief',async t=>{
 let removed=false;const h=harness(t,{query:'?id='+id,setup:w=>{w.FYNXNewsReaderData.resolveArticle=async()=>{if(removed){const error=Error('Removed');error.status=404;throw error;}return article();};}});await tick();removed=true;await h.intervals[0].fn();await tick();assert.equal(h.q('[data-reader-content]').hidden,true);assert.equal(h.q('[data-reader-share]').disabled,true);
});
