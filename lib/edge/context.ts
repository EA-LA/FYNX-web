import { correlation, mean, timeMs } from '../quant/math';
import { EDGE_CONFIG as C, BRIEF_TEMPLATES as T } from './config';
import { DAY } from './regime';
import type { EventView, MarketResult, Mood, OpenPosition, RiskWarning, StrategyFit, VixObservation } from './types';
export function marketMood(markets:MarketResult[],vix:VixObservation[]|undefined,asOf:string):Mood{
  const byId=new Map(markets.map(m=>[m.symbol,m])),parts:Mood['parts']=[],cutoff=timeMs(asOf),riskIds=['USDJPY','USDCHF','XAUUSD','AUDUSD','SPX500','NAS100','US30'],latestDay=markets.filter(m=>riskIds.includes(m.symbol)).map(m=>m.returns.at(-1)?.date).filter((d):d is string=>!!d).sort().at(-1);
  const component=(id:string,name:string,direction:number,inverse=false)=>{const m=byId.get(id),r=m?.returns.at(-1)?.return,vol=m?.state.atr.value!==null&&m?.state.close.value?m.state.atr.value/m.state.close.value:null;
    const date=m?.returns.at(-1)?.date,fresh=date===latestDay&&date!==undefined&&cutoff-timeMs(date)<=C.dailyFreshnessMs&&timeMs(date)+DAY<=cutoff;const value=fresh&&r!==undefined&&vol!==null&&vol>0?Math.max(-1,Math.min(1,(inverse?(1/(1+r)-1):r)*direction/vol)):null;parts.push({name,value,reason:value===null?`${id} daily return/ATR is unavailable, stale, or does not share the latest risk-asset session.`:null});};
  component('USDJPY','JPY strength',1,true);component('USDCHF','CHF strength',1,true);component('XAUUSD','Gold strength',1);component('AUDUSD','AUD weakness',-1);
  const index=['SPX500','NAS100','US30'].find(id=>byId.has(id));if(index)component(index,'Equity weakness',-1);else parts.push({name:'Equity weakness',value:null,reason:'An index history is unavailable.'});
  const available=(vix||[]).filter(v=>timeMs(v.availableAt)<=cutoff&&timeMs(v.date)+DAY<=cutoff&&v.close>=0&&Number.isFinite(v.close)).sort((a,b)=>a.date.localeCompare(b.date)),latest=available.at(-1);
  const vixValue=latest&&cutoff-timeMs(latest.date)<7*DAY?Math.max(-1,Math.min(1,(latest.close-20)/10)):null;parts.push({name:'VIX level',value:vixValue,reason:vixValue===null?'A recent FRED VIX close known at this time is unavailable.':null});
  const enough=parts.slice(0,5).filter(p=>p.value!==null).length>=C.mood.minimumMoveParts&&vixValue!==null;
  if(!enough)return {value:null,reason:'Mood requires at least four available risk-asset inputs and a recent VIX observation.',score:null,parts};
  const score=mean(parts.filter(p=>p.value!==null).map(p=>p.value!));return {value:score>C.mood.threshold?'risk-off':score< -C.mood.threshold?'risk-on':'mixed',reason:null,score,parts};
}
export function signedCorrelation(a:{date:string;return:number}[],b:{date:string;return:number}[],directionA:number,directionB:number):{value:number|null;observations:number}{
  const bm=new Map(b.map(p=>[p.date,p.return])),rows=a.filter(p=>bm.has(p.date)).slice(-C.correlationWindow);if(rows.length<C.correlationWindow)return {value:null,observations:rows.length};
  const av=rows.map(r=>r.return),bv=rows.map(r=>bm.get(r.date)!);if(av.every(v=>v===av[0])||bv.every(v=>v===bv[0]))return {value:null,observations:rows.length};return {value:correlation(av,bv)*directionA*directionB,observations:rows.length};
}
export function correlationRisk(positions:OpenPosition[],markets:MarketResult[],candidates:StrategyFit[]=[]):RiskWarning[]{
  const byId=new Map(markets.map(m=>[m.symbol,m])),exposures=[...positions.map(p=>({id:p.id,symbol:p.symbol,side:p.side==='buy'||p.side==='long'?1:-1,risk:p.riskToStop,label:`Open ${p.symbol} ${p.side}`})),...candidates.filter(c=>c.score!==null&&c.score>=C.fitThreshold&&c.likelyDirection).map(c=>({id:`candidate:${c.symbol}:${c.strategyId}`,symbol:c.symbol,side:c.likelyDirection==='long'?1:-1,risk:null,label:`${c.symbol} ${c.strategyName} candidate`}))],warnings:RiskWarning[]=[];
  for(let i=0;i<exposures.length;i++)for(let j=i+1;j<exposures.length;j++){const a=exposures[i],b=exposures[j],ma=byId.get(a.symbol),mb=byId.get(b.symbol);if(!ma||!mb||a.id===b.id)continue;const r=signedCorrelation(ma.returns,mb.returns,a.side,b.side);if(r.value!==null&&r.value>C.correlationWarning){const combined=a.risk!==null&&b.risk!==null&&Number.isFinite(a.risk)&&Number.isFinite(b.risk)&&a.risk>=0&&b.risk>=0?a.risk+b.risk:null;warnings.push({first:a.label,second:b.label,firstSymbol:a.symbol,secondSymbol:b.symbol,signedCorrelation:r.value,combinedRisk:combined,observations:r.observations,reason:combined===null?'Direction-adjusted historical correlation exceeds 0.8. Combined monetary risk needs stop-risk metadata for both exposures.':'Direction-adjusted historical correlation exceeds 0.8; both reported stop risks contribute to this exposure.'});}}
  return warnings;
}
const fill=(template:string,values:Record<string,string|number>)=>template.replace(/\{(\w+)\}/g,(_,key)=>String(values[key]??''));
export function dailyBrief(fits:StrategyFit[],next:EventView|null,timezone='UTC'):string{
  const ranked=fits.filter(f=>f.score!==null).sort((a,b)=>b.score!-a.score!),first=ranked[0],second=ranked.find(f=>f.symbol!==first?.symbol),sentences:string[]=[];
  if(first&&second)sentences.push(fill(T.fits,{first:first.symbol,firstStrategy:first.strategyName,firstScore:first.score!,second:second.symbol,secondStrategy:second.strategyName,secondScore:second.score!}));
  else if(first)sentences.push(fill(T.oneFit,{first:first.symbol,firstStrategy:first.strategyName,firstScore:first.score!}));else sentences.push(T.noFits);
  const weakest=[...ranked].reverse().find(f=>f.score!<C.maybeThreshold&&f!==first);if(weakest)sentences.push(fill(T.avoid,{market:weakest.symbol,score:weakest.score!,count:weakest.sampleSize}));
  if(next){let time:string;try{time=new Intl.DateTimeFormat('en-US',{timeZone:timezone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(next.time));}catch{time=new Date(next.time).toISOString();}sentences.push(fill(T.event,{event:next.name,currency:next.currency,time}));}
  // At most two sentences: combine avoidance/event clauses into the second sentence.
  return sentences.length<=2?sentences.join(' '):sentences[0]+' '+sentences.slice(1).map(s=>s.replace(/\.$/,'')).join('; ')+'.';
}
