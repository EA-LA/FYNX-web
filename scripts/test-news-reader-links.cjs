/* Shared reader routing and fetch tests. Publisher records are test fixtures only. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../assets/js/news-reader-links.js'),'utf8');
const NOW=Date.parse('2026-11-02T18:00:00Z'), ID='a'.repeat(64), SECOND='b'.repeat(64);
const iso=delta=>new Date(NOW+delta).toISOString();
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const baseOptions={id:ID,edition:'us',category:'all'};
function article(extra={}){return {id:ID,edition:'us',category:'all',title:'Fixture publisher reports quarterly results',source:'Fixture Publisher',sourceUrl:'https://publisher.example/report',publishedAt:iso(-3600000),preparedAt:iso(-60000),updatedAt:iso(-60000),coverageLevel:'publisher-excerpt',coverageNote:'The publisher excerpt is available.',summary:'The test company reported higher revenue.',keyPoints:[{text:'Revenue increased.',evidence:'Revenue grew.'}],numbers:[],context:[],questions:[],terms:[],related:[],sources:[],isCurrent:true,...extra};}
const response=value=>({ok:true,status:200,text:async()=>JSON.stringify({kind:'article',article:value})});
function harness({fetch,stored,hostname='www.fynxfinanceworld.com',intelMap,intelCacheAt=NOW,intelResponse,noAbort=false,manualTimers=false}={}){
 let now=NOW,hidden=false;const calls=[],listeners={},storage=new Map(stored?[['fynx_reader_cache_v1',stored]]:[]);
 if(intelMap!==undefined)storage.set('fynx_intel_map_v1',JSON.stringify({at:intelCacheAt,map:intelMap}));
 class Clock extends Date{static now(){return now;}}
 const origin=hostname==='127.0.0.1'?'http://127.0.0.1:8765':'https://'+hostname;
 const window={location:{hostname,origin,pathname:'/news/markets.html',href:origin+'/news/markets.html'},FynxEdition:{get:()=> 'us'},document:{get hidden(){return hidden;},addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);}},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}};
 window.fetch=(url,options)=>{if(String(url).includes('/intelligence/data/map.json'))return Promise.resolve(intelResponse===undefined?{ok:false,status:404,json:async()=>null}:{ok:true,status:200,json:async()=>intelResponse});calls.push({url,options});if(fetch)return fetch(url,options);const query=new URL(url,window.location.origin).searchParams;return Promise.resolve(response(article({id:query.get('id'),edition:query.get('edition'),category:query.get('category')})));};
 const timers=new Map();let nextTimer=0;
 const context=vm.createContext({window,URL,URLSearchParams,AbortController:noAbort?undefined:AbortController,Date:Clock,setTimeout:(fn,ms)=>{if(manualTimers){const id=++nextTimer;timers.set(id,{fn,ms});return id;}const timer=setTimeout(fn,ms);timer.unref();return timer;},clearTimeout:id=>manualTimers?timers.delete(id):clearTimeout(id),console});
 vm.runInContext(script,context);
 return {api:window.FYNXNewsReaderData,calls,storage,expire:()=>{for(const [id,{fn,ms}] of [...timers]){assert.equal(ms,14000);timers.delete(id);fn();}},timerCount:()=>timers.size,advance:ms=>{now+=ms;},hidden:value=>{hidden=value;},emit:(name,event={})=>{for(const fn of listeners[name]||[])fn(event);}};
}

test('a cached Intelligence map redirects dynamically rendered report links without an intermediate reader page',()=>{
 const h=harness({intelMap:{[ID.slice(0,16)]:'verified-research-story'}});
 const link={
   href:'/news/article.html?id='+ID+'&edition=us&category=all',
   getAttribute(name){assert.equal(name,'href');return this.href;},
   setAttribute(name,value){assert.equal(name,'href');this.href=value;}
 };
 h.emit('click',{target:{closest:()=>link}});
 assert.equal(link.href,'/intelligence/verified-research-story/');
});

test('internal reader URL keeps its edition, category and symbol through links, cache and requests',async()=>{
 const h=harness(),route='/news/article.html?id='+ID+'&edition=uk&category=technology&symbol=NVDA';
 const item={articleId:ID,edition:'us',category:'stocks',symbol:'MSFT',readerUrl:route,reader:article({edition:'uk',category:'technology'})};
 assert.equal(h.api.href(item),route);
 h.api.remember([item]);assert.equal(h.api.getCachedArticle({id:ID,edition:'uk',category:'technology',symbol:'NVDA'}).edition,'uk');
 assert.equal(h.api.getCachedArticle({...baseOptions,symbol:'MSFT'}),null);
 await h.api.loadArticle(item);const query=new URL(h.calls[0].url).searchParams;
 assert.equal(query.get('edition'),'uk');assert.equal(query.get('category'),'technology');assert.equal(query.get('symbol'),'NVDA');
});

test('invalid identity, context and external routes cannot become external article destinations',()=>{
 const h=harness();
 assert.equal(h.api.href({articleId:ID,readerUrl:'/news/article.html?id='+SECOND+'&edition=us&category=all'}),'/news/article.html');
 assert.equal(h.api.href({readerUrl:'https://attacker.example/news/article.html?id='+ID}),'/news/article.html');
 assert.equal(h.api.href({articleId:'not-an-id'}),'/news/article.html');
 assert.equal(h.api.href({...baseOptions,edition:'unsupported'}),'/news/article.html');
 assert.equal(h.api.href({...baseOptions,symbol:'<script>'}),'/news/article.html');
 assert.equal(h.api.href({readerUrl:'/news/article.html?id='+ID+'&id='+SECOND}),'/news/article.html');
 assert.equal(h.api.href({...baseOptions,readerUrl:'https://attacker.example/news/article.html?id='+ID}),'/news/article.html?id='+ID+'&edition=us&category=all');
 assert.equal(h.api.href({articleId:ID,kind:'official-release'}),'/news/article.html?id='+ID+'&edition=us&category=official');
});

test('local and canonical reader routes resolve internally and local requests use the proxy',async()=>{
 const h=harness({hostname:'127.0.0.1'}),url='https://fynxfinanceworld.com/news/article.html?id='+ID+'&edition=us&category=all&symbol=BRK.B';
 assert.equal(h.api.href({readerUrl:url}),'/news/article.html?id='+ID+'&edition=us&category=all&symbol=BRK.B');
 await h.api.loadArticle({readerUrl:url});assert.match(h.calls[0].url,/^\/api\/market-feed\?/);assert.equal(h.calls[0].options.credentials,'omit');
});

test('same-query requests coalesce, complete records cache, and force explicitly checks again',async()=>{
 let resolve;const h=harness({fetch:()=>new Promise(done=>{resolve=done;})});
 const a=h.api.loadArticle(baseOptions),b=h.api.loadArticle(baseOptions);await tick();assert.equal(h.calls.length,1);
 resolve(response(article()));await Promise.all([a,b]);await h.api.loadArticle(baseOptions);assert.equal(h.calls.length,1);
 const forced=h.api.loadArticle({...baseOptions,force:true});await tick();assert.equal(h.calls.length,2);resolve(response(article()));await forced;
});

test('cache expiration triggers a real request and invalid cached data cannot hydrate',async()=>{
 const h=harness();await h.api.loadArticle(baseOptions);h.advance(300001);assert.equal(h.api.getCachedArticle(baseOptions),null);await h.api.loadArticle(baseOptions);assert.equal(h.calls.length,2);
 const record=JSON.stringify([[ID+'|us|all|',{at:NOW,complete:true,article:article({sourceUrl:'javascript:alert(1)'})}]]);
 assert.equal(harness({stored:record}).api.getCachedArticle(baseOptions),null);
 const valid=JSON.stringify([[ID+'|us|all|',{at:NOW,complete:true,article:article()}]]);
 const restored=harness({stored:valid});await restored.api.loadArticle(baseOptions);assert.equal(restored.calls.length,0);
});

test('one corrupt stored brief does not erase other independently verified cached stories',async()=>{
 const third='c'.repeat(64),keyFor=id=>id+'|us|all|';
 const rows=[
  [keyFor(ID),{at:NOW,complete:true,article:article()}],
  [keyFor(SECOND),{at:NOW,complete:true,article:article({id:SECOND,sourceUrl:'javascript:alert(1)'})}],
  [keyFor(third),{at:NOW,complete:true,article:article({id:third})}]
 ];
 const h=harness({stored:JSON.stringify(rows)});
 assert.equal(h.api.getCachedArticle(baseOptions).id,ID);
 assert.equal(h.api.getCachedArticle({...baseOptions,id:SECOND}),null);
 assert.equal(h.api.getCachedArticle({...baseOptions,id:third}).id,third);
 await h.api.loadArticle(baseOptions);
 await h.api.loadArticle({...baseOptions,id:third});
 assert.equal(h.calls.length,0,'Both verified complete stories should reopen without a network request');
});

test('malformed cache rows and forged keys cannot hydrate unverified reports',()=>{
 const forged=SECOND+'|us|all|',valid=ID+'|us|all|';
 const rows=[
  null,
  {bad:'entry'},
  ['not-a-valid-id',{}],
  [valid,null],
  [valid,{at:NOW,complete:true,article:article({id:SECOND})}],
  [forged+'unexpected',{at:NOW,complete:true,article:article({id:SECOND})}],
  [forged,{at:NOW+60000,complete:true,article:article({id:SECOND})}],
  [valid,{at:NOW,complete:true,article:article()}]
 ];
 const restored=harness({stored:JSON.stringify(rows)});
 assert.equal(restored.api.getCachedArticle(baseOptions).id,ID);
 assert.equal(restored.api.getCachedArticle({...baseOptions,id:SECOND}),null);
 assert.equal(harness({stored:JSON.stringify({unexpected:'object'})}).api.getCachedArticle(baseOptions),null);
 assert.equal(harness({stored:'{broken'}).api.getCachedArticle(baseOptions),null);
});

test('source validation rejects mismatches, local URLs, missing dates and future publication',async()=>{
 for(const extra of [{id:SECOND},{edition:'uk'},{category:'stocks'},{sourceUrl:'http://publisher.example/report'},{sourceUrl:'https://127.0.0.1/report'},{sourceUrl:'https://secret.internal/report'},{publishedAt:'unknown'},{publishedAt:iso(3600000)},{preparedAt:iso(3600000)},{coverageLevel:'invented'}]){
  const h=harness({fetch:async()=>response(article(extra))});await assert.rejects(h.api.loadArticle(baseOptions),/verified|metadata/);assert.equal(h.api.getCachedArticle(baseOptions),null);
 }
});

test('payload normalization limits source content and preserves a related story route context',async()=>{
 const related={articleId:SECOND,title:'<b>Related fixture</b>',source:'Second fixture',edition:'us',category:'stocks',readerUrl:'/news/article.html?id='+SECOND+'&edition=canada&category=finance&symbol=SHOP',publishedAt:iso(-60000)};
 const h=harness({fetch:async()=>response(article({title:'<script>unsafe markup</script> source title',summary:'a'.repeat(4000),related:[related]}))});
 const result=await h.api.loadArticle(baseOptions);assert.doesNotMatch(result.title,/<script>/);assert.equal(result.summary.length,2400);
 assert.equal(result.related[0].readerUrl,'/news/article.html?id='+SECOND+'&edition=canada&category=finance&symbol=SHOP');
});

test('failed refresh returns an explicit recent cache fallback, and an expired cache cannot mask failure',async()=>{
 const h=harness({fetch:async()=>{throw new Error('offline');}});h.api.remember([{...baseOptions,reader:article()}]);
 const fallback=await h.api.loadArticle(baseOptions);assert.equal(fallback.refreshUnavailable,true);assert.equal(fallback.preparedAt,article().preparedAt);
 assert.equal(h.api.getCachedArticle(baseOptions).refreshUnavailable,undefined);h.advance(300001);await assert.rejects(h.api.loadArticle(baseOptions),/offline/);
});

test('synchronous request errors leave no stuck pending request and can recover',async()=>{
 let broken=true;const h=harness({fetch:()=>{if(broken)throw new Error('sync network failure');return response(article());}});
 await assert.rejects(h.api.loadArticle(baseOptions),/sync network/);broken=false;await h.api.loadArticle(baseOptions);assert.equal(h.calls.length,2);
});

test('oversized responses and non-article payloads never enter the cache',async()=>{
 for(const text of ['x'.repeat(500001),JSON.stringify({kind:'news',article:article()}),'invalid-json']){
  const h=harness({fetch:async()=>({ok:true,status:200,text:async()=>text})});await assert.rejects(h.api.loadArticle(baseOptions));assert.equal(h.api.getCachedArticle(baseOptions),null);
 }
});

test('prefetch is hidden-tab aware, deduplicates and caps concurrent requests at three',async()=>{
 const releases=[];let active=0,max=0;const h=harness({fetch:(url)=>{active++;max=Math.max(max,active);const q=new URL(url).searchParams;return new Promise(resolve=>releases.push(()=>{active--;resolve(response(article({id:q.get('id')})));}));}});
 const items=Array.from({length:8},(_,i)=>({id:i.toString(16).padStart(64,'0'),edition:'us',category:'all'}));
 h.hidden(true);h.api.prefetch(items);await tick();assert.equal(h.calls.length,0);
 h.hidden(false);h.emit('visibilitychange');await tick();assert.equal(h.calls.length,3);h.api.prefetch(items);await tick();assert.equal(h.calls.length,3);
 for(let cycle=0;cycle<5;cycle++){releases.splice(0).forEach(resolve=>resolve());await tick();}
 assert.equal(h.calls.length,8);assert.equal(max,3);assert.equal(active,0);
});

test('cache storage remains bounded to eighty validated article records',()=>{
 const h=harness();const rows=Array.from({length:90},(_,i)=>{const id=i.toString(16).padStart(64,'0');return {...baseOptions,id,reader:article({id})};});
 h.api.remember(rows.slice(0,60));h.api.remember(rows.slice(60));
 assert.equal(h.api.getCachedArticle({...baseOptions,id:rows[0].id}),null);
 assert.equal(h.api.getCachedArticle({...baseOptions,id:rows[89].id}).id,rows[89].id);
 assert.equal(JSON.parse(h.storage.get('fynx_reader_cache_v1')).length,80);
});

test('invalid Intelligence map destinations preserve the verified quick-reader route',()=>{
 const key=ID.slice(0,16), route='/news/article.html?id='+ID+'&edition=us&category=all';
 for(const slug of ['../profile','%2e%2e','story?other=1','story#fragment','foo/bar','',42,{},'a'.repeat(121)]){
  const h=harness({intelMap:{[key]:slug}});
  assert.equal(h.api.href(baseOptions),route);
  const link={href:route,getAttribute(){return this.href;},setAttribute(_,value){this.href=value;}};
  h.emit('click',{target:{closest:()=>link}});
  assert.equal(link.href,route);
 }
 const h=harness({intelMap:{[key]:'verified-story'}});
 const invalid='/news/article.html?id='+key+'&edition=us';
 const link={href:invalid,getAttribute(){return this.href;},setAttribute(_,value){this.href=value;}};
 h.emit('click',{target:{closest:()=>link}});
 assert.equal(link.href,invalid);
});

test('malformed or future-dated cached maps recover from the current downloaded map',async()=>{
 const key=ID.slice(0,16), response={map:{[key]:'fresh-story'}};
 for(const config of [{intelMap:null},{intelMap:[]},{intelMap:{[key]:'old-story'},intelCacheAt:NOW+1}]){
  const h=harness({...config,intelResponse:response});
  await tick();
  assert.equal(h.api.href(baseOptions),'/intelligence/fresh-story/');
 }
 for(const map of [null,[],'bad']){
  const h=harness({intelResponse:{map}});
  await tick();
  assert.equal(h.api.href(baseOptions),'/news/article.html?id='+ID+'&edition=us&category=all');
  assert.equal(h.storage.has('fynx_intel_map_v1'),false);
 }
});

test('reader without AbortController recovers from stalled headers and ignores late cache writes',async()=>{
 let finish;let attempts=0;
 const h=harness({noAbort:true,manualTimers:true,fetch:()=>++attempts===1?new Promise(resolve=>{finish=resolve;}):response(article({title:'Recovered report'}))});
 const first=h.api.loadArticle(baseOptions);await tick();assert.equal(h.calls[0].options.signal,undefined);
 const rejected=assert.rejects(first,/timed out/);h.expire();await rejected;
 assert.equal(h.timerCount(),0);assert.equal(h.api.getCachedArticle(baseOptions),null);
 await h.api.loadArticle(baseOptions);assert.equal(h.api.getCachedArticle(baseOptions).title,'Recovered report');
 finish(response(article({title:'Expired response'})));await tick();
 assert.equal(h.api.getCachedArticle(baseOptions).title,'Recovered report');
 assert.equal(h.timerCount(),0);
});
test('reader times out a stalled response body, marks cached fallback and releases pending request',async()=>{
 let finish;let attempts=0;
 const h=harness({manualTimers:true,fetch:()=>++attempts===1?{ok:true,text:()=>new Promise(resolve=>{finish=resolve;})}:response(article({title:'Refreshed report'}))});
 h.api.remember([{...baseOptions,reader:article()}]);
 const first=h.api.loadArticle(baseOptions);await tick();h.expire();
 assert.equal((await first).refreshUnavailable,true);assert.equal(h.calls[0].options.signal.aborted,true);
 await h.api.loadArticle(baseOptions);
 finish(JSON.stringify({kind:'article',article:article({title:'Expired body'})}));await tick();
 assert.equal(h.api.getCachedArticle(baseOptions).title,'Refreshed report');assert.equal(h.timerCount(),0);
});
test('shared story lookup without AbortController times out and retries without changing HTTP status errors',async()=>{
 let attempts=0;
 const h=harness({noAbort:true,manualTimers:true,fetch:()=>{attempts++;return attempts===1?{ok:true,text:()=>new Promise(()=>{})}:attempts===2?response(article()):{ok:false,status:410};}});
 const first=h.api.resolveArticle({id:ID});const rejected=assert.rejects(first,/timed out/);await tick();h.expire();await rejected;
 assert.equal((await h.api.resolveArticle({id:ID})).id,ID);
 await assert.rejects(h.api.resolveArticle({id:ID}),err=>err.status===410);
 assert.equal(h.timerCount(),0);
});

test('older feed previews cannot downgrade a fresh complete report or extend its cache lifetime',async()=>{
 const h=harness({fetch:async()=>response(article({title:'Complete report'}))});
 await h.api.loadArticle(baseOptions);
 h.advance(200000);
 h.api.remember([{...baseOptions,reader:article({title:'Older preview',updatedAt:iso(-120000)})}]);
 assert.equal(h.api.getCachedArticle(baseOptions).title,'Complete report');
 await h.api.loadArticle(baseOptions);assert.equal(h.calls.length,1);
 h.advance(100001);assert.equal(h.api.getCachedArticle(baseOptions),null);
});

test('older previews cannot replace newer previews, but new revisions can invalidate complete reports',async()=>{
 const h=harness();
 h.api.remember([{...baseOptions,reader:article({title:'New preview',updatedAt:iso(-10000)})}]);
 h.api.remember([{...baseOptions,reader:article({title:'Old preview',updatedAt:iso(-120000)})}]);
 assert.equal(h.api.getCachedArticle(baseOptions).title,'New preview');
 await h.api.loadArticle(baseOptions);
 h.api.remember([{...baseOptions,reader:article({title:'Same revision preview'})}]);
 assert.notEqual(h.api.getCachedArticle(baseOptions).title,'Same revision preview');
 h.api.remember([{...baseOptions,reader:article({title:'New revision preview',updatedAt:iso(-10000)})}]);
 assert.equal(h.api.getCachedArticle(baseOptions).title,'New revision preview');
 await h.api.loadArticle(baseOptions);assert.equal(h.calls.length,2);
});

test('feed previews without update timestamps compare their verified preparation times',async()=>{
 const h=harness({fetch:async()=>response(article({title:'Complete report',updatedAt:undefined}))});
 await h.api.loadArticle(baseOptions);
 h.api.remember([{...baseOptions,reader:article({title:'Older preview',updatedAt:undefined,preparedAt:iso(-120000)})}]);
 assert.equal(h.api.getCachedArticle(baseOptions).title,'Complete report');
 h.api.remember([{...baseOptions,reader:article({title:'Newer preview',updatedAt:undefined,preparedAt:iso(-10000)})}]);
 assert.equal(h.api.getCachedArticle(baseOptions).title,'Newer preview');
});
