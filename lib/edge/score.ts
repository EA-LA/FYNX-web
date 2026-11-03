import { mean, timeMs } from '../quant/math';
import { EDGE_CONFIG as C } from './config';
import type { EdgeStrategy, EventRisk, MarketState, Positioning, ScorePart, SimilarStats, StrategyFit, TradeTag } from './types';
export function shrinkAverage(similar:number[],overall:number[],prior=C.shrinkagePriorTrades):number|null{if(!similar.length||!overall.length)return null;return (similar.length*mean(similar)+prior*mean(overall))/(similar.length+prior);}
export function tradeStatistics(tags:TradeTag[]):SimilarStats{let streak=0,worst=0;const results=tags.map(t=>t.trade.R);for(const r of results){if(r<0)worst=Math.max(worst,++streak);else streak=0;}return {count:results.length,avgR:results.length?mean(results):null,winRate:results.length?results.filter(r=>r>0).length/results.length:null,worstLosingStreak:results.length?worst:null,results};}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
function relativePoints(tags:TradeTag[],field:'regime'|'volatilityBucket',value:string|null,max:number):{points:number|null;reason:string|null}{
  if(value===null)return {points:null,reason:`Today's ${field} is unavailable.`};const groups=new Map<string,number[]>();for(const tag of tags){const key=tag[field];if(key!==null){if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(tag.trade.R);}}
  const current=groups.get(value)||[];if(current.length<C.minimumBucketTrades)return {points:null,reason:`Fewer than ${C.minimumBucketTrades} exited trades in this ${field} bucket.`};
  const averages=[...groups.values()].filter(r=>r.length>=C.minimumBucketTrades).map(mean),best=Math.max(...averages),here=mean(current);
  return {points:best>0?max*clamp(here/best,0,1):0,reason:best>0?`${current.length} trades; average ${here.toFixed(3)}R versus best eligible bucket ${best.toFixed(3)}R.`:'No eligible historical bucket has positive average R; this component receives zero.'};
}
/** Integer contributions are adjusted at the clipping boundary, retaining raw points for disclosure. */
export function clipScoreParts(parts:ScorePart[]):{score:number|null;parts:ScorePart[]}{
  if(parts.some(p=>p.rawPoints===null))return {score:null,parts:parts.map(p=>({...p,points:p.rawPoints===null?null:Math.round(p.rawPoints)}))};
  const displayed=parts.map(p=>({...p,points:Math.round(p.rawPoints!)}));let sum=displayed.reduce((s,p)=>s+p.points!,0),target=clamp(sum,0,100),change=target-sum;
  for(const part of [...displayed].reverse()){if(change===0)break;const adjustment=change>0?Math.min(change,Math.max(0,-part.points!)):-Math.min(-change,Math.max(0,part.points!));part.points!+=adjustment;change-=adjustment;if(adjustment)part.reason=(part.reason||'')+' Displayed contribution adjusted at the 0–100 score boundary; raw points remain available.';}
  return {score:target,parts:displayed};
}
export function scoreStrategy(input:{symbol:string;strategy:EdgeStrategy;state:MarketState;positioning:Positioning;events:EventRisk;tags:TradeTag[];asOf:string;likelyDirection:'long'|'short'|null;directionBasis?:string|null;stopDistance?:number|null}):StrategyFit{
  const {symbol,strategy,state,positioning,events}=input,cutoff=timeMs(input.asOf),tags=input.tags.filter(t=>timeMs(t.trade.exitDate)<=cutoff&&t.trade.reason!=='last'&&Number.isFinite(t.trade.R));
  const exact=(tag:TradeTag)=>state.regime.value!==null&&state.volatilityBucket.value!==null&&events.eventIn24h!==null&&positioning.crowded.value!==null&&tag.regime===state.regime.value&&tag.volatilityBucket===state.volatilityBucket.value&&tag.eventIn24h===events.eventIn24h&&tag.crowded===positioning.crowded.value;
  let similar=tags.filter(exact);const filtersRelaxed:string[]=[];
  if(similar.length<C.similarDesired){similar=tags.filter(t=>state.regime.value!==null&&t.regime===state.regime.value&&state.volatilityBucket.value!==null&&t.volatilityBucket===state.volatilityBucket.value);filtersRelaxed.push('event and positioning flags');}
  if(similar.length<C.similarDesired){similar=tags.filter(t=>state.regime.value!==null&&t.regime===state.regime.value);filtersRelaxed.push('volatility bucket');}
  const matches=new Set(similar),other=tags.filter(t=>!matches.has(t)),similarStats=tradeStatistics(similar),otherStats=tradeStatistics(other),allR=tags.map(t=>t.trade.R),shrunk=shrinkAverage(similarStats.results,allR);
  const regime=relativePoints(tags,'regime',state.regime.value,C.weights.regime),vol=relativePoints(tags,'volatilityBucket',state.volatilityBucket.value,C.weights.volatility);
  const part=(id:ScorePart['id'],label:string,points:number|null,min:number,max:number,reason:string|null):ScorePart=>({id,label,points,rawPoints:points,min,max,reason});
  const record=shrunk===null?null:C.weights.record*clamp((shrunk-C.recordMapping.zeroAtAvgR)/(C.recordMapping.fullAtAvgR-C.recordMapping.zeroAtAvgR),0,1);
  let positioningPoints:number|null=null,positioningReason:string|null=null;
  if(positioning.net.value===null||positioning.crowded.value===null)positioningReason=positioning.net.reason||positioning.crowded.reason;
  else if(!input.likelyDirection)positioningReason='The strategy has no identifiable likely direction at this snapshot.';
  else{const alignment=positioning.net.value*(input.likelyDirection==='long'?1:-1);positioningPoints=!positioning.crowded.value&&alignment>0?C.weights.positioningPositive*alignment:positioning.crowded.value&&alignment<0?C.weights.positioningNegative*alignment:0;positioningReason=`${positioning.crowded.value?'Crowded':'Not crowded'} futures positioning; direction basis: ${input.directionBasis||'strategy settings'}.`;}
  let eventPoints:number|null=null,eventReason:string|null=null;
  if(!events.available||events.eventIn24h===null)eventReason=events.reason||'Event coverage is unknown.';
  else if(!events.eventIn24h)eventPoints=0;
  else if(events.maximumTypicalMove.value===null||state.close.value===null||(input.stopDistance===undefined?state.atr.value===null:input.stopDistance===null))eventReason=events.maximumTypicalMove.reason||'ATR/price is unavailable.';
  else {const stop=input.stopDistance??state.atr.value!*(strategy.params.stopS??2);eventPoints=stop>0?-C.weights.eventPenalty*clamp(events.maximumTypicalMove.value*state.close.value/stop,0,1):null;eventReason='Historical absolute release move, scaled to current price, divided by the strategy ATR stop distance.';}
  const clipped=clipScoreParts([part('regime','Regime match',regime.points,0,40,regime.reason),part('volatility','Volatility',vol.points,0,25,vol.reason),part('record','Strategy record here',record,0,20,shrunk===null?'No eligible exited trade history.':`Shrunk average ${shrunk.toFixed(3)}R; mapping ${C.recordMapping.zeroAtAvgR}R→0, ${C.recordMapping.fullAtAvgR}R→20.`),part('positioning','Positioning',positioningPoints,-10,15,positioningReason),part('events','Event risk',eventPoints,-20,0,eventReason)]);
  const insufficient=similar.length<C.similarMinimum,score=insufficient?null:clipped.score,label=insufficient?'Not enough history':score===null?'Unavailable':score>=C.fitThreshold?'fit':score>=C.maybeThreshold?'maybe':'avoid';
  const reasons=[...(insufficient?[`Only ${similar.length} matching exited trades; at least ${C.similarMinimum} are required.`]:[]),...clipped.parts.filter(p=>p.points===null).map(p=>p.reason||`${p.label} is unavailable.`)];
  const why=similar.length?`${similar.length} comparable exited trades averaged ${similarStats.avgR!.toFixed(2)}R${other.length?`, versus ${otherStats.avgR!.toFixed(2)}R across ${other.length} other trades`:''}. ${filtersRelaxed.length?'Relaxed: '+filtersRelaxed.join('; ')+'.':'All four state filters matched.'}`:'No matching exited trades are available for this state.';
  return {strategyId:strategy.id,strategyName:strategy.name,symbol,score,label,parts:clipped.parts,sampleSize:similar.length,filtersRelaxed,similar:similarStats,other:otherStats,overallAvgR:allR.length?mean(allR):null,shrunkAvgR:shrunk,likelyDirection:input.likelyDirection,directionBasis:input.directionBasis||null,why,reasons,scoreChangeWeek:null};
}
