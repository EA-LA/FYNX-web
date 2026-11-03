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
function harness(t,{cached=null,load=async()=>article(),query='?id='+id+'&edition=us&category=finance'}={}){
 const dom=new JSDOM(html,{url:'https://www.fynxfinanceworld.com/news/article.html'+query,runScripts:'outside-only',virtualConsole:new VirtualConsole()});
 t.after(()=>dom.window.close());const w=dom.window;w.Date.now=()=>now;let edition='us';const calls=[],intervals=[];
 w.setInterval=(fn,ms)=>{intervals.push({fn,ms});return intervals.length;};w.clearInterval=()=>{};
 Object.defineProperty(w.document,'hidden',{get:()=>false,configurable:true});
 w.FynxEdition={get:()=>edition,editions:[{id:'us',label:'US'},{id:'uk',label:'UK'}]};
 w.FYNXNewsReaderData={getCachedArticle:()=>cached,loadArticle:async options=>{calls.push(options);return load(options);},href:row=>row.readerUrl||'/news/article.html?id='+row.articleId+'&edition=us&category=finance'};
 w.FYNXNewsroomMedia={createFigure:category=>{const figure=w.document.createElement('figure');figure.dataset.contextImage=category;figure.textContent='Context photograph: '+category;return figure;}};
 w.eval(script);return {w,doc:w.document,calls,intervals,setEdition:value=>{edition=value;},q:selector=>w.document.querySelector(selector)};
}

test('reader renders source facts, general context and original source in distinct sections',async t=>{
 const h=harness(t);await tick();assert.equal(h.q('[data-reader-title]').textContent,article().title);
 assert.match(h.q('[data-reader-access]').textContent,/Source text reviewed/);
 assert.match(h.q('[data-reader-summary]').textContent,/quarterly revenue/);
 assert.match(h.q('[data-reader-context-section]').textContent,/separate from the source/);
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
 const h=harness(t,{load:async()=>article({summary:'<img src=x onerror=alert(1)>',related:[{articleId:'b'.repeat(64),title:'Fixture follow-up',source:'Second Publisher',publishedAt:iso(-1000)},{articleId:'c'.repeat(64),title:'External redirect',source:'Other',publishedAt:iso(-1000),readerUrl:'https://attacker.example/news/article.html?id='+('c'.repeat(64))},{articleId:'d'.repeat(64),title:'Old story',source:'Other',publishedAt:iso(-3*86400000)}]})});await tick();
 assert.equal(h.q('[data-reader-summary] img'),null);assert.match(h.q('[data-reader-summary]').textContent,/<img/);assert.equal(h.q('[data-reader-related]').children.length,1);assert.equal(h.q('[data-reader-related] a').target,'');assert.match(h.q('[data-reader-related] a').href,/www.fynxfinanceworld.com\/news\/article.html/);
});

test('source image requires explicit reusable license and falls back to labeled context',async t=>{
 const valid={url:'https://images.example/report.jpg',credit:'Fixture photographer',sourceUrl:'https://publisher.example/news/quarterly-results',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',alt:'Source image fixture'};
 const h=harness(t,{load:async()=>article({image:valid})});await tick();assert.equal(h.q('[data-reader-image] img').alt,valid.alt);assert.match(h.q('[data-reader-image] figcaption').textContent,/Source image/);
 h.q('[data-reader-image] img').dispatchEvent(new h.w.Event('error'));assert.match(h.q('[data-reader-image]').textContent,/Context photograph/);
 const bad=harness(t,{load:async()=>article({image:{...valid,license:'All rights reserved'}})});await tick();assert.equal(bad.q('[data-reader-image] img'),null);assert.match(bad.q('[data-reader-image]').textContent,/Context photograph/);
});

test('a cache fallback never counts as a successful source refresh, including after returning to the tab',async t=>{
 const h=harness(t,{load:async()=>article({refreshUnavailable:true})});await tick();
 assert.equal(h.q('[data-reader-title]').textContent,article().title);
 assert.match(h.q('[data-reader-status]').textContent,/could not be refreshed/);
 assert.doesNotMatch(h.q('[data-reader-status]').textContent,/Last brief check/);
 h.doc.dispatchEvent(new h.w.Event('visibilitychange'));
 assert.match(h.q('[data-reader-status]').textContent,/could not be refreshed/);
});

test('broad-desk context images follow the reported subject while keeping the context label',async t=>{
 const cases=[
  ['Stock market after midterm elections: What S&P 500 history shows','markets'],
  ['Company earnings improve as quarterly revenue rises','finance'],
  ['New semiconductor technology enters production','technology'],
  ['Inflation slows in the latest consumer price release','economics'],
  ['Oil prices move after OPEC production decision','energy'],
  ['Manufacturing factories expand their assembly lines','industries'],
  ['Congress holds a vote on new legislation','politics'],
  ['A new report examines the changing outlook','world']
 ];
 for(const [title,expected] of cases){
  const h=harness(t,{load:async()=>article({category:'all',title,summary:title,keyPoints:[]}),query:'?id='+id+'&edition=us&category=all'});await tick();
  assert.equal(h.q('[data-reader-image] figure').dataset.contextImage,expected,title);
  assert.match(h.q('[data-reader-image]').textContent,/Context photograph/);
 }
});

test('broad-desk image inference uses source details but never generic FYNX context as evidence',async t=>{
 const source=harness(t,{load:async()=>article({category:'all',title:'What the new announcement means',summary:'The company announced a new semiconductor manufacturing process.',keyPoints:[]})});await tick();
 assert.equal(source.q('[data-reader-image] figure').dataset.contextImage,'technology');
 const unreported=harness(t,{load:async()=>article({category:'all',title:'A new announcement draws attention',summary:'Only the headline is available.',keyPoints:[],context:[{title:'Technology',text:'Artificial intelligence, software and semiconductor markets are general topics.'}]})});await tick();
 assert.equal(unreported.q('[data-reader-image] figure').dataset.contextImage,'world');
});
