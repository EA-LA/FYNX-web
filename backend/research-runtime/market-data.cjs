'use strict';
const {QuantData}=require('../quant/data.cjs');
const {symbol,symbols,range,timeframe,fetchJSON,fail}=require('../quant/common.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Store}=require('../quant/store.cjs');
const {AsyncLocalStorage}=require('node:async_hooks');
const DAY=86400000;
const ORIGINS=['https://raw.githubusercontent.com/EA-LA/FYNX-web/research-data/assets/data/research/','https://www.fynxfinanceworld.com/assets/data/research/'];
const QUOTES={EURUSD:'EURUSD=X',GBPUSD:'GBPUSD=X',USDJPY:'JPY=X',USDCHF:'CHF=X',USDCAD:'CAD=X',AUDUSD:'AUDUSD=X',BTCUSD:'BTC-USD',ETHUSD:'ETH-USD'};
class ResearchData extends QuantData {
 constructor(options){super(options);this.published=new Map();this.pendingFiles=new Map();this.tickScope=new AsyncLocalStorage();}
 async file(name){
  const key=name==='edge.json'||name==='factors.json'||/^bars\/[A-Z0-9]{3,12}-D1\.json$/.test(name);if(!key)throw fail('Unknown research dataset.');
  const old=this.published.get(name);if(old&&Date.now()-old.at<120000)return old.data;
  if(this.pendingFiles.has(name))return this.pendingFiles.get(name);
  const task=(async()=>{for(const origin of ORIGINS){try{const data=await fetchJSON(origin+name,{provider:'FYNX published research',limit:16000000,timeout:7000});
    if(name==='edge.json'&&!(data.publicResearch===true&&data.guest===true&&data.markets?.length))continue;
    if(name==='factors.json'&&!(Array.isArray(data.cot)&&Array.isArray(data.events)&&Array.isArray(data.vix)&&Number.isFinite(Date.parse(data.asOf))))continue;
    if(name.startsWith('bars/')&&!(name==='bars/'+data.symbol+'-D1.json'&&data.timeframe==='D1'&&data.bars?.length))continue;
    this.published.set(name,{at:Date.now(),data});return data;
   }catch{/* Try the independently deployed copy. */}}
   if(old)return old.data;
   try{return JSON.parse(await fs.readFile(path.join(__dirname,'../../observations',name),'utf8'));}catch{}
   throw fail('Published market research could not be retrieved.',503,'RESEARCH_UNAVAILABLE');})();
  this.pendingFiles.set(name,task);try{return await task;}finally{this.pendingFiles.delete(name);}
 }
 async bars(q){if(timeframe(q.tf||q.timeframe)==='D1'){const id=symbol(q.symbol).id,dates=range(q.from,q.to,{maxDays:3660});try{const source=await this.file('bars/'+id+'-D1.json');const start=Date.parse(dates.from),end=Date.parse(dates.to);if(start>=Date.parse(source.requestedFrom)&&end<=Date.parse(source.requestedTo)+DAY){const rows=source.bars.filter(b=>Date.parse(b.time)>=start&&Date.parse(b.time)+DAY<=end);return {...source,requestedFrom:dates.from,requestedTo:dates.to,bars:rows,from:rows[0]?.time||null,to:rows.at(-1)?.time||null,status:rows.length?'stored':'no-data'};}}catch{/* Try the original Dukascopy provider. */}}
  return super.bars(q);}
 async withTemporaryHistory(run){const dirs=[];try{return await this.tickScope.run(dirs,run);}finally{await Promise.all(dirs.map(root=>fs.rm(root,{recursive:true,force:true})));}}
 async streamingHistory(q){
  const tf=timeframe(q.tf||q.timeframe),id=symbol(q.symbol),d=range(q.from,q.to);
  if(tf!=='TICK'||d.days>1)throw fail('Choose up to one completed UTC day for recorded tick research, or use D1 for longer history.',409,'TICK_RANGE');
  if(Date.parse(d.to)>Date.now()||[d.from,d.to].some(date=>Date.parse(date)%60000))throw fail('Choose completed UTC minutes for recorded ticks.');
  const scope=this.tickScope.getStore();if(!scope)throw fail('Tick request context is unavailable.',503);
  const rows=await this.historyProvider.history({symbol:id,timeframe:'TICK',...d});
  if(!rows.length)throw fail('Dukascopy returned no recorded quotes for this interval. Choose an active trading day.',422,'TICK_NO_DATA');
  if(rows.length>300000)throw fail('This recorded tick interval is too large. Choose fewer hours.',413);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fynx-quant-ticks-'));scope.push(root);
  const store=new Store(root),base='history/'+id.id+'/TICK',key=base+'/chunks/observed',updatedAt=new Date().toISOString();
  await store.write(key,{rows,source:'Dukascopy',from:d.from,to:d.to,updatedAt});
  await store.write(base+'/manifest',{updatedAt,chunks:[{key,from:d.from,to:d.to,rows:rows.length,updatedAt}]});
  return new QuantData({store}).streamingHistory(q);
 }
 async markets(){return {symbols:symbols()};}
 async quotes(ids){const input=[...new Set(String(ids||'EURUSD').split(','))];if(input.length>20)throw fail('Request at most 20 quotes.');const markets=input.map(v=>symbol(v).id),known=Object.values(QUOTES).sort(),errors={},quotes=[];let data;
  try{data=await this.cached('fynx-public-quotes',60000,()=>fetchJSON('https://us-central1-fynx-c7a28.cloudfunctions.net/webResearchData?action=quotes&symbols='+encodeURIComponent(known.join(',')),{provider:'FYNX market quotes'}));}catch{}
  for(const id of markets){const row=data?.quotes?.[QUOTES[id]],ms=Date.parse(row?.asOf);if(!Number.isFinite(row?.price)||row.price<=0||!Number.isFinite(ms)||ms>Date.now()+60000||ms<Date.now()-4*DAY){errors[id]={code:'QUOTE_UNAVAILABLE',message:'No recent indicative quote; use dated historical closes.'};continue;}quotes.push({symbol:id,price:row.price,changePct:Number.isFinite(row.changePercent)?row.changePercent:null,changeBasis:row.basis,asOf:row.asOf,fetchedAt:row.fetchedAt,source:row.source,sourceURL:row.sourceURL,status:row.delayed||Date.now()-ms>900000?'delayed':'indicative',currency:row.currency});}
  return {quotes,errors,configured:true,status:quotes.length?(Object.keys(errors).length?'partial':'available'):'unavailable',updatedAt:data?.fetchedAt||null};}
 async calendar(q){if(q.impact&&!['high','medium-high'].includes(q.impact))throw fail('Choose high or medium-high calendar impact.');const d=range(q.from,q.to,{now:Date.now()+31*DAY,maxDays:3660});const m=q.symbol?symbol(q.symbol):null;
  // A current weekly schedule cannot supply past release times or revise earlier research.
  if(Date.parse(d.to)<=Date.now()||Date.parse(d.from)<Date.now()-7*DAY||d.days>31)return super.calendar(q);
  const f=await this.file('factors.json');if(!f.calendarAvailable||Date.now()-Date.parse(f.calendarAsOf||f.asOf)>2*DAY)throw fail('A current verified market calendar is unavailable.',503,'SCHEDULE_UNAVAILABLE');
  const coverageTo=f.calendarCoverageTo,from=new Date(Math.max(Date.parse(d.from),Date.parse(f.calendarAsOf))).toISOString(),to=new Date(Math.min(Date.parse(d.to),Date.parse(coverageTo))).toISOString();if(from>=to)throw fail('This interval is outside the published economic schedule.',409,'SCHEDULE_COVERAGE');return {coverageLimited:from!==d.from||to!==d.to,events:f.events.filter(e=>e.time>=from&&e.time<to&&(!m||m.currencies.includes(e.currency))&&(q.impact==='medium-high'||e.impact==='high')),source:'Published economic calendar',scheduled:true,from,to,updatedAt:f.calendarAsOf||f.asOf,status:'scheduled',timingNote:'Prospective schedule only. Historical release-time tests require actual archived events.'};}
}
module.exports={ResearchData};
