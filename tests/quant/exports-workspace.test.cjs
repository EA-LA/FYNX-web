'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..'),Q=require(path.join(root,'backend/quant/engine.cjs'));
const source=fs.readFileSync(path.join(root,'assets/js/quant/app.js'),'utf8')
 .replace("import('/auth/firebase.js')","window.__identityModule()")
 .replace("import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')","Promise.resolve({onAuthStateChanged:window.__listenAuth})");
const fragment=fs.readFileSync(path.join(root,'content/quant-analyst.fragment'),'utf8');
const guestKey='fynx.quant.workspace.v1.guest',userKey=uid=>'fynx.quant.workspace.v1.user.'+uid;
const sampleReturns=Array.from({length:25},(_,i)=>({date:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),return:i%2?.002:-.001,traded:true}));
const strategy=(name='Saved')=>({id:'one',name,symbol:'EURUSD',timeframe:'D1',returns:sampleReturns});
function fixture({user=null,local={},cloud={},deferPost=false,identityDelay=0,priceBars=null,firstPriceDelay=0,workerHold=false,calendarEvents=[],headlines=[],quotePayload={quotes:[]},serverBacktestResult=null,url='http://localhost/quant-analyst.html'}={}) {
 const dom=new JSDOM('<!doctype html><html><body>'+fragment+'</body></html>',{url,runScripts:'outside-only'}),w=dom.window;
 const requests=[],downloads=[],plots=[],workers=[];let listener,resolvePost,priceRequests=0;const auth={currentUser:user?{uid:user,getIdToken:async()=>user+'token'}:null,authStateReady:async()=>{}};
 w.FynxQuant=Q;w.matchMedia=()=>({matches:false});w.requestAnimationFrame=fn=>w.setTimeout(fn,0);w.AbortSignal=AbortSignal;w.AbortController=AbortController;
 w.__identityModule=async()=>{if(identityDelay)await new Promise(r=>setTimeout(r,identityDelay));return {auth};};w.__listenAuth=(_auth,callback)=>{listener=callback;return()=>{};};
 Object.defineProperty(w.crypto,'randomUUID',{value:require('node:crypto').randomUUID});
 w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 w.Plotly={newPlot:async(el,traces,layout)=>{plots.push({id:el.id,visible:!el.closest('[role=tabpanel]').hidden,layout});el.classList.add('js-plotly-plot');el.textContent='Rendered chart';layout.xaxis._mutatedForTest=true;},purge:el=>el.classList.remove('js-plotly-plot'),Plots:{resize:()=>{}}};
 w.Worker=class {constructor(){workers.push(this);}terminate(){this.terminated=true;}postMessage({id,action,payload}){this.message={id,action,payload};if(workerHold)return;setTimeout(()=>{if(this.terminated)return;try{const result=action==='portfolio'?Q.portfolio(payload.sleeves,payload.options):action==='backtest'?Q.backtest(payload.bars,payload.params):action==='optimize'?Q.optimize(payload.bars,payload.params,payload.options):action==='montecarlo'?Q.monteCarlo(payload.returns,payload.options):action==='ftmo'?Q.ftmo(payload.returns,payload.options):null;this.onmessage?.({data:{id,result}});}catch(error){this.onmessage?.({data:{id,error:error.message}});}},0);}};
 w.fetch=async(url,options={})=>{
   const route=String(url).split('?')[0],method=options.method||'GET';requests.push({url:String(url),route,method,body:options.body,headers:options.headers});
   if(deferPost&&method==='POST')await new Promise(resolve=>{resolvePost=resolve;});
   let data={};if(route.endsWith('/bars')){if(++priceRequests===1&&firstPriceDelay)await new Promise(r=>setTimeout(r,firstPriceDelay));data={bars:priceBars||[],source:'Test-only history adapter',updatedAt:'2025-02-01T00:00:00Z'};}
   else if(route.endsWith('/strategies'))data=method==='GET'?{strategies:cloud[auth.currentUser?.uid]?.strategies||[]}:{item:JSON.parse(options.body)};
   else if(route.endsWith('/portfolios'))data=method==='GET'?{portfolios:cloud[auth.currentUser?.uid]?.portfolios||[]}:{item:JSON.parse(options.body)};
   else if(route.endsWith('/calendar'))data={events:calendarEvents};else if(route.endsWith('/headlines'))data={headlines};else if(route.endsWith('/quotes'))data=quotePayload;else if(route.endsWith('/backtest')&&serverBacktestResult)data={result:serverBacktestResult};
   return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>data};
 };
 for(const [key,value]of Object.entries(local))w.localStorage.setItem(key,JSON.stringify(value));
 w.eval(source);
 return {dom,w,requests,downloads,plots,workers,auth,change:async uid=>{auth.currentUser=uid?{uid,getIdToken:async()=>uid+'token'}:null;listener?.(auth.currentUser);await settle();},finishPost:()=>resolvePost?.()};
}
async function settle(){await new Promise(resolve=>setTimeout(resolve,25));}
async function upload(f,id,text,name='test.json') {const input=f.w.document.getElementById(id);Object.defineProperty(input,'files',{configurable:true,value:[{name,size:Buffer.byteLength(text),text:async()=>text}]});await input.onchange();await settle();}
const workspace=(strategies=[],portfolios=[])=>({version:1,strategies,portfolios});

test('guest CSV records include server-compatible metadata and round-trip through workspace JSON',async()=>{
 const f=fixture();try{await settle();await upload(f,'csv','date,return_pct\n2025-01-01,1\n2025-01-02,-.5','sample.csv');
 const saved=JSON.parse(f.w.localStorage.getItem(guestKey));assert.equal(saved.strategies.length,1);assert.equal(saved.strategies[0].symbol,'EURUSD');assert.equal(saved.strategies[0].timeframe,'D1');assert.equal(saved.strategies[0].provenance.source,'csv-daily-returns');
 await upload(f,'importWorkspace',JSON.stringify(saved));const copy=JSON.parse(f.w.localStorage.getItem(guestKey));assert.equal(copy.strategies.length,2);assert.notEqual(copy.strategies[0].id,copy.strategies[1].id);assert.deepEqual(copy.strategies[0].returns,copy.strategies[1].returns);
 assert.equal(f.requests.filter(r=>r.method==='POST').length,0);
 }finally{f.dom.window.close();}
});
test('sign-in and sign-out never merge guest records into the private account',async()=>{
 const f=fixture({local:{[guestKey]:workspace([strategy('Guest strategy')]),[userKey('alice')]:workspace([strategy('Alice strategy')])}});
 try{await settle();await f.w.document.getElementById('loadSaved').onclick();assert.match(f.w.document.getElementById('sleeves').textContent,/Guest strategy/);
 await f.change('alice');await f.w.document.getElementById('loadSaved').onclick();const content=f.w.document.getElementById('sleeves').textContent;assert.match(content,/Alice strategy/);assert.doesNotMatch(content,/Guest strategy/);
 await f.change(null);await f.w.document.getElementById('loadSaved').onclick();assert.match(f.w.document.getElementById('sleeves').textContent,/Guest strategy/);assert.doesNotMatch(f.w.document.getElementById('sleeves').textContent,/Alice strategy/);
 assert.equal(f.requests.filter(r=>r.method==='POST').length,0);
 }finally{f.dom.window.close();}
});
test('workspace import retains saved portfolios and restores only their selected return sleeves',async()=>{
 const portfolio={id:'p1',name:'Research portfolio',method:'equal-weight',sleeves:[{name:'Imported A',returns:sampleReturns}]};
 const f=fixture();try{await settle();await upload(f,'importWorkspace',JSON.stringify(workspace([],[portfolio])));
 const saved=JSON.parse(f.w.localStorage.getItem(guestKey));assert.equal(saved.portfolios.length,1);const select=f.w.document.getElementById('savedPortfolio');assert.match(select.textContent,/Research portfolio/);select.value=saved.portfolios[0].id;
 await f.w.document.getElementById('loadPortfolio').onclick();await settle();const checked=[...f.w.document.querySelectorAll('#sleeves input:checked')];assert.equal(checked.length,1);assert.equal(checked[0].value,'custom-0');assert.equal(f.w.document.getElementById('weighting').value,'equal-weight');
 assert.match(f.w.document.getElementById('log').textContent,/Restored Research portfolio/);
 }finally{f.dom.window.close();}
});
test('signed-in CSV is cloud-saved to its resolved user, and a late response cannot leak to another account',async()=>{
 const f=fixture({user:'alice',deferPost:true});try{await settle();
 const pending=upload(f,'csv','date,return_pct\n2025-01-01,1','private.csv');await settle();const post=f.requests.find(r=>r.method==='POST');assert(post);assert.equal(post.headers.Authorization,'Bearer alicetoken');assert.equal(JSON.parse(post.body).symbol,'EURUSD');
 await f.change('bob');f.finishPost();await pending;
 const bob=JSON.parse(f.w.localStorage.getItem(userKey('bob'))||'{"strategies":[]}');assert.equal(bob.strategies.length,0);assert.doesNotMatch(f.w.document.getElementById('sleeves').textContent,/private/);
 const alice=JSON.parse(f.w.localStorage.getItem(userKey('alice')));assert.equal(alice.strategies.length,1);
 }finally{f.dom.window.close();}
});
test('invalid portfolio JSON is rejected before any local or cloud mutation',async()=>{
 const f=fixture({user:'alice'});try{await settle();const before=f.w.localStorage.getItem(userKey('alice'));
 await upload(f,'importWorkspace',JSON.stringify(workspace([strategy()], [{name:'Bad',sleeves:[{name:'Bad',returns:[{date:'2025-02-30',return:.1}]}]}])));
 assert.equal(f.w.localStorage.getItem(userKey('alice')),before);assert.equal(f.requests.filter(r=>r.method==='POST').length,0);assert.match(f.w.document.getElementById('log').textContent,/valid ISO date/);
 }finally{f.dom.window.close();}
});
test('Profile entry is a keyboard-accessible link and mounts once',()=>{
 const dom=new JSDOM('<div class="settings-list"></div>',{url:'http://localhost/profile.html',runScripts:'outside-only'});try{const code=fs.readFileSync(path.join(root,'assets/js/quant/profile.js'),'utf8');dom.window.eval(code);dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));dom.window.eval(code);dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));const links=dom.window.document.querySelectorAll('#quantProfileEntry');assert.equal(links.length,1);assert.equal(links[0].tagName,'A');assert.equal(links[0].getAttribute('href'),'/quant-analyst.html#saved-strategies');}finally{dom.window.close();}
});
const priceFixture=Array.from({length:100},(_,i)=>({time:new Date(Date.UTC(2025,0,i+1)).toISOString(),close:1+i*.001+Math.sin(i/2)*.005}));
test('keyboard tabs keep one selected tab and one visible panel, including Home/End',async()=>{
 const f=fixture();try{await settle();const d=f.w.document,first=d.getElementById('tab-bt');first.focus();first.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(d.activeElement.id,'tab-opt');assert.equal(d.getElementById('p-opt').hidden,false);
 d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(d.activeElement.id,'tab-dep');d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(d.activeElement.id,'tab-bt');
 assert.equal(d.querySelectorAll('[role=tab][aria-selected=true]').length,1);assert.equal(d.querySelectorAll('[role=tabpanel]:not([hidden])').length,1);
 }finally{f.dom.window.close();}
});
test('portfolio charts render only on visible tabs and receive separate layouts despite Plotly mutation',async()=>{
 const f=fixture();try{await settle();const p={name:'P',method:'equal-weight',sleeves:[{name:'A',returns:sampleReturns}]};await upload(f,'importWorkspace',JSON.stringify(workspace([],[p])));const d=f.w.document;d.getElementById('savedPortfolio').selectedIndex=1;await d.getElementById('loadPortfolio').onclick();
 const plots=f.plots.filter(x=>['portEq','corr'].includes(x.id));assert.equal(plots.length,2);assert(plots.every(p=>p.visible));assert.notEqual(plots[0].layout,plots[1].layout);assert.notEqual(plots[0].layout.xaxis,plots[1].layout.xaxis);assert.equal(plots[1].layout.yaxis._mutatedForTest,undefined);
 assert.equal(d.getElementById('p-port').hidden,false);
 }finally{f.dom.window.close();}
});
test('editing each configuration clears its dependent results and does not leave an old downloadable EA',async()=>{
 const f=fixture();try{await settle();const d=f.w.document,mark=ids=>ids.forEach(id=>d.getElementById(id).textContent='OLD RESULT'),edit=id=>d.getElementById(id).dispatchEvent(new f.w.Event('input',{bubbles:true}));
 mark(['btStats','surf','portStats','mcStats','ftmoStats','ea']);d.getElementById('downloadEa').disabled=false;edit('K');for(const id of ['btStats','surf','portStats','mcStats','ftmoStats','ea'])assert.equal(d.getElementById(id).textContent,'',id);assert.equal(d.getElementById('downloadEa').disabled,true);
 mark(['btStats','surf']);edit('entryValues');assert.equal(d.getElementById('surf').textContent,'');assert.equal(d.getElementById('btStats').textContent,'OLD RESULT');
 mark(['portStats','mcStats','ftmoStats']);d.getElementById('weighting').dispatchEvent(new f.w.Event('change'));for(const id of ['portStats','mcStats','ftmoStats'])assert.equal(d.getElementById(id).textContent,'');
 mark(['mcStats','ftmoStats']);edit('paths');assert.equal(d.getElementById('mcStats').textContent,'');assert.equal(d.getElementById('ftmoStats').textContent,'OLD RESULT');edit('seed');assert.equal(d.getElementById('ftmoStats').textContent,'');
 }finally{f.dom.window.close();}
});
test('explicit numeric constraints still reject invalid parameters while work disables form fields',async()=>{
 const f=fixture({priceBars:priceFixture});try{await settle();const d=f.w.document;assert.equal(d.getElementById('fScale').checkValidity(),true);d.getElementById('N').value='3';await d.getElementById('runBt').onclick();assert.match(d.getElementById('log').textContent,/Check Breakout lookback/);assert.equal(f.workers.length,0);assert.equal(d.getElementById('runBt').disabled,false);
 }finally{f.dom.window.close();}
});
test('Cancel stays enabled during a worker run, terminates it and restores usable controls',async()=>{
 const f=fixture({priceBars:priceFixture,workerHold:true});try{await settle();const d=f.w.document;const pending=d.getElementById('runBt').onclick();await settle();assert.equal(d.getElementById('cancelJob').disabled,false);assert.equal(d.getElementById('runBt').disabled,true);assert.equal(d.getElementById('quant-main').getAttribute('aria-busy'),'true');d.getElementById('cancelJob').click();await pending;
 assert.equal(f.workers[0].terminated,true);assert.equal(d.getElementById('runBt').disabled,false);assert.equal(d.getElementById('jobProgress').hidden,true);assert.equal(d.getElementById('quant-main').getAttribute('aria-busy'),'false');assert.match(d.getElementById('log').textContent,/cancelled/i);assert.equal(d.getElementById('btStats').textContent,'');
 }finally{f.dom.window.close();}
});
test('Cancel aborts a pending data request rather than leaving controls locked until timeout',async()=>{
 const f=fixture();try{await settle();const d=f.w.document;let aborted=false;f.w.fetch=async(url,options)=>new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));},{once:true});});const pending=d.getElementById('loadData').onclick();await settle();d.getElementById('cancelJob').click();await pending;assert(aborted);assert.equal(d.getElementById('loadData').disabled,false);assert.equal(d.getElementById('jobProgress').hidden,true);
 }finally{f.dom.window.close();}
});
test('initial asynchronous identity resolution does not cancel the public history load',async()=>{
 const f=fixture({user:'alice',priceBars:priceFixture,identityDelay:10,firstPriceDelay:50});try{await new Promise(r=>setTimeout(r,90));const d=f.w.document;assert.doesNotMatch(d.getElementById('dataPill').textContent,/unavailable|cancel/i);assert.match(d.getElementById('dataNote').textContent,/100/);assert.equal(d.getElementById('jobProgress').hidden,true);
 }finally{f.dom.window.close();}
});
test('shared navigation places Research, Quant, Edge and Profile in order and activates both route spellings',()=>{
 for(const route of ['/quant-analyst','/quant-analyst.html']){const dom=new JSDOM('<div class="nav-panel"></div><div class="top-bar"><h1 class="page-title">Quant Analyst</h1></div>',{url:'http://localhost'+route,runScripts:'outside-only'});try{dom.window.eval(fs.readFileSync(path.join(root,'fynx-nav.js'),'utf8'));dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));const links=[...dom.window.document.querySelectorAll('.nav-menu a')];const index=links.findIndex(a=>a.dataset.view==='quant');assert(index>0);assert.equal(links[index-1].dataset.view,'research');assert.equal(links[index+1].dataset.view,'edge');assert.equal(links[index+2].dataset.view,'profile');assert.equal(links[index].getAttribute('aria-current'),'page');assert.equal(links[index].querySelector('.quant-new-badge').textContent,'NEW');}finally{dom.window.close();}}
});
test('saved news strategy reloads confirmed release history for its own market before backtesting',async()=>{
 const events=[{time:'2025-02-03T13:30:00Z',name:'Japan CPI',type:'CPI',currency:'JPY',impact:'high',timing:'confirmed'},{time:'2025-02-04T13:30:00Z',name:'Euro CPI',type:'CPI',currency:'EUR',impact:'high',timing:'confirmed'},{time:'2025-02-05T13:30:00Z',name:'Japan estimate',type:'CPI',currency:'JPY',impact:'high',timing:'estimated'}];
 const f=fixture({priceBars:priceFixture,calendarEvents:events});try{await settle();const record={id:'news-gbpjpy',name:'JPY release strategy',symbol:'GBPJPY',timeframe:'D1',params:{strategy:'news',mode:'close',eventType:'CPI'}};await upload(f,'importWorkspace',JSON.stringify(workspace([record])));const d=f.w.document;d.querySelectorAll('#sleeves input').forEach(x=>x.checked=x.value==='custom-0');d.getElementById('weighting').value='equal-weight';await d.getElementById('runPort').onclick();
 const run=f.workers.find(w=>w.message?.action==='backtest');assert(run);assert.deepEqual(run.message.payload.params.events.map(e=>e.currency),['JPY']);assert(f.requests.some(r=>r.url.includes('/news/calendar?')&&r.url.includes('symbol=GBPJPY')));assert.match(d.getElementById('log').textContent,/Portfolio complete/);
 }finally{f.dom.window.close();}
});
test('default market portfolio adds news only after confirmed coverage and reports an unavailable news sleeve',async()=>{
 for(const available of [false,true]){const events=available?[{time:'2025-02-03T13:30:00Z',name:'US CPI',type:'CPI',currency:'USD',impact:'high',timing:'confirmed'}]:[];
 const f=fixture({priceBars:priceFixture,calendarEvents:events});try{await settle();const d=f.w.document;d.getElementById('weighting').value='equal-weight';await d.getElementById('runPort').onclick();const runs=f.workers.filter(w=>w.message?.action==='backtest');assert.equal(runs.length,available?2:1);assert.equal(d.querySelector('#sleeves input[value="news"]').checked,available);assert.match(d.getElementById('newsSleeveStatus').textContent,available?/included/:/omitted/);assert.match(d.getElementById('log').textContent,/Portfolio complete/);
 }finally{f.dom.window.close();}}
});
test('headline metadata shows attributed publication time and preserves the internal reader route',async()=>{
 const f=fixture({headlines:[{title:'Test source release',source:'Fixture publisher',pubDate:'2025-01-02T13:30:00Z',readerUrl:'/news/article.html?id=fixture'}]});try{await settle();const a=f.w.document.querySelector('#headlines a');assert.match(a.querySelector('small').textContent,/Fixture publisher/);assert.equal(a.querySelector('time').dateTime,'2025-01-02T13:30:00.000Z');assert.equal(a.getAttribute('href'),'/news/article.html?id=fixture');}finally{f.dom.window.close();}
});
test('EA export uses selected account capital and account changes clear the previous source',async()=>{
 const f=fixture({priceBars:priceFixture});try{await settle();const d=f.w.document;await d.getElementById('runBt').onclick();d.getElementById('accountSize').value='100000';d.getElementById('accountSize').dispatchEvent(new f.w.Event('change'));await d.getElementById('genEa').onclick();assert.match(d.getElementById('ea').textContent,/InpInitBal = 100000/);assert.equal(d.getElementById('downloadEa').disabled,false);d.getElementById('accountSize').value='200000';d.getElementById('accountSize').dispatchEvent(new f.w.Event('change'));assert.equal(d.getElementById('ea').textContent,'');assert.equal(d.getElementById('downloadEa').disabled,true);
 }finally{f.dom.window.close();}
});
test('market-list quote refresh is one bulk request, preserves stale timestamps, and does not refetch on selection',async()=>{
 const quote={symbol:'EURUSD',price:1.23456,source:'Fixture quote provider',asOf:'2025-01-02T12:30:00Z',fetchedAt:'2025-01-02T12:31:00Z',status:'stale'};
 const f=fixture({priceBars:priceFixture,quotePayload:{configured:true,quotes:[quote],errors:{GBPUSD:{code:'QUOTE_BUDGET'}}}});try{await settle();const d=f.w.document,requests=()=>f.requests.filter(r=>r.route.endsWith('/quotes'));assert.equal(requests().length,1);assert.equal(new URL(requests()[0].url,'http://localhost').searchParams.get('symbols').split(',').length,Q.SYMBOLS.length);const cell=d.querySelector('[data-market-quote="EURUSD"]');assert.match(cell.textContent,/1\.23456/);assert.match(cell.textContent,/Fixture quote provider.*stale/);assert.equal(cell.querySelector('time').dateTime,'2025-01-02T12:30:00.000Z');assert.match(d.querySelector('[data-market-quote="GBPUSD"]').textContent,/provider budget/);
 d.querySelector('[data-market="GBPUSD"]').click();await settle();assert.equal(requests().length,1);assert.match(d.querySelector('[data-market-quote="EURUSD"]').textContent,/stale/);
 }finally{f.dom.window.close();}
});
test('unconfigured market quotes stay unavailable and do not start repeated provider polls',async()=>{
 const errors=Object.fromEntries(Q.SYMBOLS.map(s=>[s.id,{code:'QUOTES_NOT_CONFIGURED'}]));const f=fixture({quotePayload:{configured:false,quotes:[],errors}});try{await settle();const d=f.w.document;assert([...d.querySelectorAll('[data-market-quote]')].every(el=>el.textContent==='Quote unavailable'));assert.equal(d.querySelectorAll('[data-market-quote] b').length,0);const now=f.w.Date.now();f.w.Date.now=()=>now+120000;d.dispatchEvent(new f.w.Event('visibilitychange'));await settle();assert.equal(f.requests.filter(r=>r.route.endsWith('/quotes')).length,1);assert.match(d.getElementById('quoteStatus').textContent,/unavailable/);
 }finally{f.dom.window.close();}
});
test('rate decision selector uses the provider and engine event type identifier',async()=>{
 const f=fixture();try{await settle();const d=f.w.document;assert(d.querySelector('#eventType option[value="RATES"]'));assert.equal(d.querySelector('#eventType option[value="RATE"]'),null);}finally{f.dom.window.close();}
});
test('saved tick portfolio requests bounded raw paths and skips risk-weight calibration days',async()=>{
 const f=fixture({serverBacktestResult:{dailyReturns:sampleReturns}});try{await settle();const records=['EURUSD','GBPUSD'].map(symbol=>({id:symbol,name:symbol+' tick',symbol,timeframe:'tick',params:{mode:'tick',strategy:'breakout'}}));await upload(f,'importWorkspace',JSON.stringify(workspace(records)));const d=f.w.document;d.querySelectorAll('#sleeves input').forEach(x=>x.checked=x.value.startsWith('custom-'));await d.getElementById('runPort').onclick();
 const runs=f.requests.filter(r=>r.route.endsWith('/backtest')).map(r=>JSON.parse(r.body));assert.equal(runs.length,2);for(const run of runs){assert.equal(run.tf,'tick');assert.equal(run.params.captureIntraday,true);assert.equal(run.params.maxIntradayMarks,30000);assert.equal(run.params.captureAfterDays,60);}assert.equal(f.requests.some(r=>r.url.includes('/bars?')&&r.url.includes('tf=tick')),false);
 }finally{f.dom.window.close();}
});
test('Edge deep link preloads the shared mean-reversion settings and requested market before history loads',async()=>{
 const f=fixture({url:'http://localhost/quant-analyst.html?symbol=USDJPY&strategy=builtin-mean-reversion',priceBars:priceFixture});try{await settle();const d=f.w.document;assert.equal(d.querySelector('[data-market="USDJPY"]').getAttribute('aria-pressed'),'true');assert.equal(d.getElementById('strategyModel').value,'mean-reversion');assert.equal(d.getElementById('meanEntryZ').value,'1.5');assert.equal(d.getElementById('TP').value,'2');assert.equal(d.getElementById('H').value,'10');const first=f.requests.find(r=>r.route.endsWith('/bars'));assert(first.url.includes('symbol=USDJPY'));await d.getElementById('runBt').onclick();const run=f.workers.find(w=>w.message?.action==='backtest');assert.equal(run.message.payload.params.strategy,'mean-reversion');assert.equal(run.message.payload.params.meanEntryZ,1.5);assert.match(d.getElementById('btTitle').textContent,/Mean reversion/);
 }finally{f.dom.window.close();}
});
test('Edge saved-strategy deep links use only the resolved account and preserve execution mode',async()=>{
 const item={id:'private',name:'Private settings',symbol:'EURUSD',timeframe:'H1',params:{strategy:'breakout',mode:'close',lookback:35,entryK:.5,stopS:3}};for(const signedIn of [false,true]){const f=fixture({user:signedIn?'alice':null,local:{[userKey('alice')]:workspace([item])},url:'http://localhost/quant-analyst.html?symbol=XAUUSD&strategy=private',priceBars:priceFixture});try{await settle();const d=f.w.document;if(signedIn){assert.equal(d.getElementById('N').value,'35');assert.equal(d.getElementById('timeframe').value,'H1');assert.equal(d.getElementById('executionMode').value,'close');assert(f.requests.find(r=>r.route.endsWith('/bars')).url.includes('symbol=XAUUSD'));}else{assert.match(d.getElementById('log').textContent,/not in this account/);assert.equal(f.requests.filter(r=>r.route.endsWith('/bars')).length,0);}}finally{f.dom.window.close();}}
});
test('mean-reversion UI rejects the unrelated entry-ATR optimizer without starting worker or server jobs',async()=>{
 const f=fixture({url:'http://localhost/quant-analyst.html?symbol=USDJPY&strategy=builtin-mean-reversion',priceBars:priceFixture});try{await settle();await f.w.document.getElementById('runOpt').onclick();assert.match(f.w.document.getElementById('log').textContent,/Z-score grid/);assert.equal(f.workers.length,0);assert.equal(f.requests.filter(r=>r.route.endsWith('/optimize')).length,0);}finally{f.dom.window.close();}
});
