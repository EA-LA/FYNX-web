'use strict';
const {EdgeService,watchlist,timezone,edgeEngine}=require('../edge/snapshot.cjs');
const {symbol,fail}=require('../quant/common.cjs');
// Published research is entirely anonymous. Account responses are recomputed
// using only strategies belonging to the verified UID, never guest model fits.
class PublishedEdge extends EdgeService {
 async setWatchlist(uid,input){const ids=watchlist(input.symbols),zone=input.timeZone||input.timezone;if(zone)timezone(zone);const prefs=await this.store.mutate('user_preferences',uid,p=>({...p,uid,watchlist:ids,timezone:zone||p?.timezone||'UTC'}));return {preferences:{watchlist:prefs.watchlist,timezone:prefs.timezone}};}
 async snapshot(uid,zone,only){
  const pub=await this.quant.file('edge.json');const delayed=Date.now()-Date.parse(pub.generatedAt||pub.asOf)>30*3600000;
  if(!uid)return {...pub,...(delayed?{status:'delayed'}:{}),httpStatus:200};
  const prefs=await this.preferences(uid,zone),ids=only?[only]:prefs.watchlist;
  const {strategies,total}=await this.strategyData(uid);
  const factors=await this.quant.file('factors.json'),now=Date.now(),asOf=new Date(now).toISOString();const events=factors.events||[];
  const freshEvents=factors.calendarAvailable&&now-Date.parse(factors.calendarAsOf||factors.asOf)<36*3600000&&(!factors.calendarCoverageTo||Date.parse(factors.calendarCoverageTo)>now);
  const guard=await this.protection.guardFor(uid,events);
  const markets=Object.fromEntries(await Promise.all(ids.map(async id=>{
    const data=await this.quant.file('bars/'+symbol(id).id+'-D1.json'),m=symbol(id);
    const input={releaseDays:factors.releaseDays||[],bars:data.bars,source:data.source,calendarAvailable:freshEvents,calendarAsOf:factors.calendarAsOf,cot:factors.cot.filter(c=>(edgeEngine().COT_MARKETS[id]||[]).some(leg=>leg.market===c.market)),events:events.filter(e=>m.currencies.includes(e.currency)&&e.time>=factors.calendarAsOf)};
    if(guard.connected){input.broker=guard.instruments?.find(i=>i.symbol===id);input.accountEquity=guard.equity;}
    return [id,input];
  })));
  const result=edgeEngine().buildSnapshot({asOf,watchlist:ids,userTimezone:prefs.timezone,strategies,markets,vix:factors.vix,heartbeat:guard.connected?{receivedAt:guard.receivedAt,positions:guard.positions,equity:guard.equity}:undefined});
  const snapshot={...result,sources:pub.sources,guest:false,guard,status:delayed?'delayed':pub.status||'partial',httpStatus:200,generatedAt:asOf,providerStatus:pub.providerStatus,providerIssues:pub.providerIssues||[],notes:[...result.notes,'Published market observations: '+pub.asOf+'. Account fits use saved strategy parameters; missing exact timeframe history is identified per strategy.',...(total>30?['Showing the first 30 saved strategies.']:[])]};
  if(!only)await this.protection.processSnapshot(uid,snapshot);return snapshot;
 }
 today({uid=null,zone}){return this.snapshot(uid,zone);}
 async market({uid=null,zone,id}){const key=symbol(id).id,s=await this.snapshot(uid,zone,key),market=s.markets.find(m=>m.symbol===key);if(!market)throw fail('No observations for this market.',404);return {market,asOf:s.asOf,generatedAt:s.generatedAt,status:s.status,userTimezone:s.userTimezone,providerStatus:s.providerStatus,providerIssues:s.providerIssues,guest:!uid,guard:s.guard||{connected:false},httpStatus:200};}
}
module.exports={PublishedEdge};
