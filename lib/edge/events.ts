import { barIntervalMs } from '../quant/backtest';
import { eventStudy } from '../quant/analytics';
import { timeMs } from '../quant/math';
import type { Bar } from '../quant/types';
import { DAY, known, missing } from './regime';
import type { EdgeEvent, EventMove, EventRisk, EventView, ReleaseDay } from './types';
const kind=(e:EdgeEvent)=>e.type||e.name;
export function eventMoves(symbol:string,bars:Bar[],intraday:Bar[]|undefined,events:EdgeEvent[]|undefined,asOf:string,releaseDays:ReleaseDay[]=[]):EventMove[]{
  const cutoff=timeMs(asOf),history=(events||[]).filter(e=>e.timing!=='estimated'&&timeMs(e.time)+3600000<=cutoff),eligibleDays=releaseDays.filter(d=>timeMs(d.availableAt)<=cutoff&&timeMs(d.date)+DAY<=cutoff),types=[...new Set([...history.map(kind),...eligibleDays.map(d=>d.type)])];
  const interval=intraday&&intraday.length>1?barIntervalMs(intraday):null,intradayHistory=interval===null?[]:(intraday||[]).filter(b=>timeMs(b.time)+interval<=cutoff),closes=new Map(intradayHistory.map(b=>[timeMs(b.time)+interval!,b.close]));
  return types.map(eventType=>{
    const selected=history.filter(e=>kind(e)===eventType).map(e=>({...e,impact:'high' as const}));let sampleSize=0,value:number|null=null,basis:'intraday-60m'|'daily-close'='daily-close',reason:string|null=null;
    if(interval!==null&&interval<=3600000){const observed=selected.map(event=>{const start=closes.get(timeMs(event.time)),end=closes.get(timeMs(event.time)+3600000);return start!==undefined&&end!==undefined?Math.abs(end/start-1):null;}).filter((move):move is number=>move!==null);if(observed.length){sampleSize=observed.length;value=observed.reduce((sum,move)=>sum+move,0)/observed.length;basis='intraday-60m';}}
    if(value===null&&bars.length>=3){const completed=selected.filter(e=>Math.floor(timeMs(e.time)/DAY)*DAY+DAY<=cutoff);
      // Official date-only observations are valid for the daily study only; never assign them an intraday release time.
      for(const day of eligibleDays.filter(day=>day.type===eventType)) completed.push({time:day.date,name:eventType,type:eventType,currency:day.currency,impact:'high'});
      if(completed.length){const r=eventStudy(bars,completed,{mode:'daily',eventType});sampleSize=r.eventDays;value=r.averageEventMove;}}
    if(value===null)reason='No completed price observations cover the recorded historical releases.';
    return {eventType,symbol,horizonMinutes:60,basis,averageAbsoluteMove:value,sampleSize,asOf,reason};
  });
}
export function calendarFlag(events:EdgeEvent[]|undefined,asOf:string,available:boolean,calendarAsOf?:string):boolean|null{
  if(!available)return null;const cutoff=timeMs(asOf),window=(events||[]).filter(e=>e.timing!=='estimated'&&['high','medium'].includes(e.impact)&&timeMs(e.time)>=cutoff&&timeMs(e.time)<cutoff+DAY);
  const knownNow=calendarAsOf!==undefined&&timeMs(calendarAsOf)<=cutoff;
  const announced=window.filter(e=>{const knownAt=e.availableAt||e.knownAt;return knownAt?timeMs(knownAt)<=cutoff:knownNow;});
  if(announced.length)return true;
  // Absence is meaningful only with a calendar snapshot already available then.
  return knownNow?false:null;
}
export function computeEventRisk(events:EdgeEvent[]|undefined,currencies:string[],asOf:string,moves:EventMove[],available:boolean,calendarAsOf?:string):EventRisk{
  const cutoff=timeMs(asOf),calendarKnown=calendarAsOf!==undefined&&timeMs(calendarAsOf)<=cutoff,relevant=(events||[]).filter(e=>currencies.includes(e.currency)&&['high','medium'].includes(e.impact)&&e.timing!=='estimated'&&((e.availableAt||e.knownAt)?timeMs((e.availableAt||e.knownAt)!)<=cutoff:calendarKnown)).sort((a,b)=>timeMs(a.time)-timeMs(b.time));
  const view=(event:EdgeEvent):EventView=>{const table=moves.find(m=>m.eventType===kind(event));return {...event,typicalMove:table?.averageAbsoluteMove!==null&&table?.averageAbsoluteMove!==undefined?known(table.averageAbsoluteMove,asOf):missing('Historical price coverage for this release type is unavailable.'),moveBasis:table?.basis||null,moveSampleSize:table?.sampleSize||0};};
  const next24h=relevant.filter(e=>timeMs(e.time)>=cutoff&&timeMs(e.time)<cutoff+DAY).map(view),restOfWeek=relevant.filter(e=>timeMs(e.time)>=cutoff+DAY&&timeMs(e.time)<cutoff+7*DAY).map(view);
  const flag=calendarFlag(relevant,asOf,available,calendarAsOf),unknown=next24h.some(e=>e.typicalMove.value===null),max=next24h.length?Math.max(...next24h.map(e=>e.typicalMove.value??0)):0;
  return {available:available&&flag!==null,reason:!available?'Economic-calendar provider is unavailable.':flag===null?'No calendar snapshot known at this timestamp establishes the next-24-hour event flag.':null,eventIn24h:flag,next24h,restOfWeek,nextHighImpact:[...next24h,...restOfWeek].find(e=>e.impact==='high')||null,maximumTypicalMove:!available||flag===null?missing('Event-risk coverage is unavailable.'):unknown?missing('At least one upcoming release lacks historical move coverage.'):known(max,asOf)};
}
