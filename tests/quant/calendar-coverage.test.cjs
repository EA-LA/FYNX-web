'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '../..'), read = file => fs.readFileSync(path.join(root, file), 'utf8');
const Q = require(path.join(root, 'backend/quant/engine.cjs'));
const fragment = read('content/quant-analyst.fragment');
const app = read('assets/js/quant/app.js')
  .replace("import('/auth/firebase.js')", "Promise.resolve({auth:{currentUser:null,authStateReady:async()=>{}}})")
  .replace("import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')", "Promise.resolve({onAuthStateChanged(){}})");
const priceBars = Array.from({length:100}, (_,i) => ({time:new Date(Date.UTC(2026,7,20+i)).toISOString(),close:1+i*.001}));
function fixture({apiAvailable=true,calendarNow,archives={},calendarPayload={},pastCalendar=null}) {
 const dom = new JSDOM('<!doctype html><html><body>'+fragment+'</body></html>', {url:'http://localhost/quant-analyst.html?symbol=EURUSD', runScripts:'outside-only'}), w=dom.window;
 const requests=[], workers=[];
 let clock=Date.parse(calendarNow);
 const Date0=w.Date;w.Date=class extends Date0{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
 w.FynxQuant=Q;w.matchMedia=()=>({matches:false});
 w.requestAnimationFrame=fn=>w.setTimeout(fn,0);w.AbortController=AbortController;
 w.Worker=class {
   terminate(){}
   postMessage({id,action,payload}){
     workers.push({action,payload});
     const result=Q.eventStudy(payload.bars,payload.events,payload.options);
     queueMicrotask(()=>this.onmessage({data:{id,result}}));
   }
 };
 w.fetch=async(url,options={})=>{
   const request=new URL(String(url),w.location.href), route=request.pathname;
   requests.push({route,credentials:options.credentials,headers:options.headers});
   const archiveFile=route.split('/assets/data/research/')[1];
   let data={}, status=200;
   if(archiveFile){data=archives[archiveFile];if(!data)status=404;}
   else if(!apiAvailable){status=503;data={error:{message:'Fixture primary unavailable'}};}
   else if(route.endsWith('/calendar'))data=(pastCalendar&&request.searchParams.get('to')===new w.Date().toISOString().slice(0,10)?pastCalendar:calendarPayload);
   else if(route.endsWith('/bars'))data={source:'Synthetic price history',bars:priceBars};
   else if(route.endsWith('/quotes'))data={configured:false,quotes:[]};
   return {ok:status===200,status,headers:{get:()=> 'application/json'},json:async()=>data};
 };
 for(const script of ['assets/js/research-service.js','assets/js/quant/public-history.js'])w.eval(read(script));
 w.eval(app);
 const id=name=>w.document.getElementById(name);
 const ready=async()=>{
   for(let i=0;i<100;i++){
     if(id('quant-main').getAttribute('aria-busy')==='false')return;
     await new Promise(resolve=>setTimeout(resolve,5));
   }
   assert.fail('Quant work did not settle');
 };
 return {dom,w,requests,workers,ready,id,moveCalendarClock:value=>{clock=Date.parse(value);}};
}
const fixtureDate='2026-11-28T05:19:00Z';
const coveredUntil='2026-11-29T00:00:00.000Z';
const scheduledEvent=(time,name,currency='USD',impact='high')=>({time,name,currency,impact,timing:'estimated'});
function scheduleFixture(events=[],overrides={}) {
 return {source:'Published archive fixture',from:'2026-11-23T00:00:00Z',to:coveredUntil,updatedAt:'2026-11-23T15:00:00Z',events,...overrides};
}

test('Quant schedule archive clamps the forecast to its actual half-open UTC coverage',async()=>{
 const f=fixture({apiAvailable:false,calendarNow:fixtureDate,archives:{'calendar.json':scheduleFixture([
   scheduledEvent('2026-11-28T05:18:59Z','Already past'),
   scheduledEvent(fixtureDate,'At current coverage start'),
   scheduledEvent('2026-11-28T23:59:59Z','Last covered release'),
   scheduledEvent(coveredUntil,'At the excluded midnight cutoff'),
   scheduledEvent('2026-12-04T13:30:00Z','Later release outside coverage'),
   scheduledEvent('2026-11-28T14:30:00Z','Wrong currency','JPY'),
   scheduledEvent('2026-11-28T14:31:00Z','Below selected impact','USD','medium')
 ])}});try{
   await f.ready();
   const data=await f.w.FynxQuantArchive.upcoming(['EUR','USD'],'2026-11-28','2026-12-12');
   assert.equal(data.from,'2026-11-28T05:19:00.000Z');
   assert.equal(data.to,coveredUntil);
   assert.equal(data.coverageLimited,true);
   assert.deepEqual(Array.from(data.events,e=>e.name),['At current coverage start','Last covered release']);
   assert.match(f.w.document.getElementById('calendarStatus').textContent,/before 2026-11-29 00:00 UTC.*Later dates.*unavailable.*Updated 2026-11-23/);
   assert.doesNotMatch(f.w.document.getElementById('upcomingEvents').textContent,/cutoff|outside coverage|past|Wrong currency|Below selected/);
   await assert.rejects(f.w.FynxQuantArchive.upcoming(['EUR','USD'],'2026-11-30','2026-12-12'),/do not overlap/);
 }finally{f.dom.window.close();}
});

test('Quant archive is revalidated at its exact expiration even while its cache is fresh',async()=>{
 const f=fixture({apiAvailable:false,calendarNow:'2026-11-28T23:59:00Z',archives:{'calendar.json':scheduleFixture()}});try{
   await f.ready();
   const calendarReads=()=>f.requests.filter(r=>r.route.endsWith('/calendar.json')).length;
   const upcoming=()=>f.w.FynxQuantArchive.upcoming(['EUR','USD'],'2026-11-28','2026-12-12');
   assert.match(f.w.document.getElementById('upcomingEvents').textContent,/covered interval/i);
   f.moveCalendarClock('2026-11-28T23:59:59.999Z');
   assert.equal((await upcoming()).to,coveredUntil);
   assert.equal(calendarReads(),1);
   f.moveCalendarClock(coveredUntil);
   await assert.rejects(upcoming(),/archive could not be retrieved/);
   assert.equal(calendarReads(),2,'an expired cached entry must not be served');
   f.moveCalendarClock('2026-11-29T00:01:00Z');
   f.w.document.querySelector('[data-market="GBPUSD"]').click();
   await f.ready();
   assert.match(f.w.document.getElementById('calendarStatus').textContent,/requested dates could not be checked/i);
   assert.equal(f.w.document.getElementById('upcomingEvents').textContent,'');
 }finally{f.dom.window.close();}
});

test('Quant reports partial primary schedules but preserves the full-window empty state',async()=>{
 for(const full of [false,true]){
   const f=fixture({calendarNow:fixtureDate,calendarPayload:scheduleFixture([],{
     source:'Primary calendar fixture',scheduled:true,from:full?'2026-11-28T00:00:00Z':'2026-11-28T11:00:00Z',
     to:full?'2026-12-12T00:00:00Z':coveredUntil
   })});
   try{
     await f.ready();const d=f.w.document,status=d.getElementById('calendarStatus').textContent,events=d.getElementById('upcomingEvents').textContent;
     assert.match(status,/Primary calendar fixture/);
     if(full){assert.doesNotMatch(status,/unavailable/i);assert.match(events,/No upcoming high-impact events/);}
     else{assert.match(status,/from 2026-11-28 11:00 UTC.*Earlier requested dates.*Later dates/);assert.match(events,/covered interval/i);}
   }finally{f.dom.window.close();}
 }
});

test('Quant event study still requires confirmed past releases, never a fallback schedule',async()=>{
 const recorded={...scheduledEvent('2026-11-25T13:30:00Z','Recorded release'),timing:'confirmed',type:'CPI'};
 for(const scheduled of [true,false]){
   const f=fixture({calendarNow:fixtureDate,pastCalendar:{status:scheduled?'scheduled':'historical',events:[
     recorded,scheduledEvent('2026-11-26T13:30:00Z','Only estimated'),{...recorded,time:'2026-12-04T13:30:00Z'}
   ]}});
   try{
     await f.ready();
     await f.id('studyEvents').onclick();
     if(scheduled){assert.equal(f.workers.length,0);assert.match(f.id('log').textContent,/schedule cannot be used/i);}
     else{
       assert.equal(f.workers.length,1);
       assert.deepEqual(Array.from(f.workers[0].payload.events,e=>e.name),['Recorded release']);
       assert.match(f.id('log').textContent,/computed from verified release timestamps/i);
     }
     assert.equal(f.requests.some(r=>r.route.endsWith('/calendar.json')),false);
   }finally{f.dom.window.close();}
 }
});

test('Quant calendar modules have matching page and release-builder asset pins',()=>{
 const versions=require(path.join(root,'scripts/build-release-assets.cjs')).ASSET_VERSIONS;
 const html=read('quant-analyst.html');
 for(const name of ['public-history','app']){
   const asset='assets/js/quant/'+name+'.js', pin=versions[asset];
   assert.ok(pin,asset+' has a specific release pin');
   assert.ok(html.includes('src="/'+asset+'?v='+pin+'"'),asset+' page uses its release pin');
 }
 assert.equal(versions['assets/js/quant/public-history.js'],versions['assets/js/quant/app.js']);
});
