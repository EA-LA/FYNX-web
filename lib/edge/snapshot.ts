import { backtest, breakoutSignal, meanReversionSignal, normalizeParams } from '../quant/backtest';
import { SYMBOLS } from '../quant/config';
import { timeMs, mean } from '../quant/math';
import type { BacktestResult, Bar, Trade } from '../quant/types';
import { DEFAULT_STRATEGIES, EDGE_CONFIG as C } from './config';
import { completedDailyBars, stateSeries, weeklyRegimes, emptyState, known, missing, DAY } from './regime';
import { positioning } from './positioning';
import { calendarFlag, computeEventRisk, eventMoves } from './events';
import { scoreStrategy } from './score';
import { computeTradePlan, strategyATR } from './trade-plan';
import { correlationRisk, dailyBrief, marketMood, signedCorrelation } from './context';
import type { EdgeSnapshot, EdgeStrategy, MarketInput, MarketResult, MarketState, SnapshotInput, TradeTag, Value } from './types';
const TF:Record<string,number>={D1:DAY,H4:14400000,H1:3600000,M5:300000,M1:60000,TICK:60000};
export function runStrategyBacktest(symbol:string,input:MarketInput,strategy:EdgeStrategy,asOf:string):{result:BacktestResult|null;reason:string|null}{
  if(strategy.returns?.length)return {result:null,reason:'Imported return-only strategies cannot be re-executed on a different market or tagged by original trade-entry state.'};
  const timeframe=(strategy.timeframe||'D1').toUpperCase(),duration=TF[timeframe];if(!duration)return {result:null,reason:'The saved strategy timeframe is unsupported.'};
  const source=timeframe==='D1'?input.bars:input.strategyBars?.[timeframe];if(!source?.length)return {result:null,reason:`Exact ${timeframe} history is not loaded for this strategy; daily data is not substituted.`};
  const bars=source.filter(b=>timeMs(b.time)+duration<=timeMs(asOf));if(bars.length<40)return {result:null,reason:'Insufficient completed price history to run this strategy.'};
  if(strategy.kind==='news'&&(!input.calendarAvailable||!input.events?.some(e=>e.timing!=='estimated'&&e.impact==='high'&&timeMs(e.time)<timeMs(asOf))))return {result:null,reason:'News drift requires real confirmed historical release timestamps.'};
  const market=SYMBOLS.find(s=>s.id===symbol);if(!market)return {result:null,reason:'Unknown market configuration.'};
  try{const result=backtest(bars,{...strategy.params,strategy:strategy.kind,pipSize:market.pipSize,mode:timeframe==='TICK'?'tick':strategy.params.mode||'close',events:input.events?.filter(e=>market.currencies.includes(e.currency)&&timeMs(e.time)<=timeMs(asOf))});
    // Quant close mode preserves date-labelled reference output. Edge needs actual information availability times.
    if(result.params.mode==='close'){result.trades=result.trades.map(t=>({...t,entryDate:new Date(timeMs(t.entryDate)+duration).toISOString(),exitDate:new Date(timeMs(t.exitDate)+duration).toISOString()}));result.notes.push('For Edge tagging, daily/close-mode trade timestamps are normalized from candle labels to their completed-close availability time.');}
    return {result,reason:null};}
  catch(error){return {result:null,reason:error instanceof Error?error.message:'Strategy backtest could not be computed.'};}
}
export function tagTrades(symbol:string,trades:Trade[],states:MarketState[],input:MarketInput,asOf:string,positionCache=new Map<string,ReturnType<typeof positioning>>()):TradeTag[]{
  const cutoff=timeMs(asOf),available=states.filter(s=>s.availableAt!==null).map(s=>timeMs(s.availableAt!)),market=SYMBOLS.find(s=>s.id===symbol);
  return trades.filter(t=>t.reason!=='last'&&timeMs(t.exitDate)<=cutoff&&timeMs(t.entryDate)<=timeMs(t.exitDate)).map(trade=>{
    const entry=timeMs(trade.entryDate);let lo=0,hi=available.length;while(lo<hi){const mid=(lo+hi)>>>1;if(available[mid]<=entry)lo=mid+1;else hi=mid;}const state=states[lo-1]||emptyState();
    const entryAsOf=new Date(entry).toISOString(),cot=positionCache.get(entryAsOf)||positioning(symbol,input.cot,entryAsOf),events=input.events?.filter(e=>market?.currencies.includes(e.currency));
    positionCache.set(entryAsOf,cot);const eventIn24h=calendarFlag(events,entryAsOf,input.calendarAvailable,input.calendarAsOf),reasons:string[]=[];
    if(state.regime.value===null)reasons.push(state.regime.reason!);if(state.volatilityBucket.value===null)reasons.push(state.volatilityBucket.reason!);if(eventIn24h===null)reasons.push('No event-calendar version known at entry.');if(cot.crowded.value===null)reasons.push(cot.crowded.reason!);
    return {trade,regime:state.regime.value,volatilityBucket:state.volatilityBucket.value,eventIn24h,crowded:cot.crowded.value,stateAsOf:state.availableAt||entryAsOf,reasons};
  });
}
function likelyDirection(strategy:EdgeStrategy,bars:Bar[],state:MarketState,tags:TradeTag[],signalATR:number|null):{direction:'long'|'short'|null;basis:string|null}{
  const p=normalizeParams({...strategy.params,strategy:strategy.kind});let signal=0;
  if(bars.length&&signalATR!==null){signal=strategy.kind==='breakout'?breakoutSignal(bars,bars.length-1,signalATR,p):strategy.kind==='mean-reversion'?meanReversionSignal(bars,bars.length-1,p):0;}
  if(signal)return {direction:signal>0?'long':'short',basis:'active completed-candle strategy trigger'};
  if(strategy.kind==='breakout'&&state.trendStrength.value)return {direction:state.trendStrength.value>0?'long':'short',basis:'sign of the completed 20-day efficiency move'};
  if(strategy.kind==='mean-reversion'&&bars.length>p.meanLookback!){const base=bars.slice(-p.meanLookback!-1,-1).map(b=>b.close),deviation=bars.at(-1)!.close-mean(base);if(deviation)return {direction:deviation<0?'long':'short',basis:'direction toward the preceding-closes mean; trigger may not yet be active'};}
  const matching=tags.filter(t=>t.regime===state.regime.value),balance=matching.reduce((s,t)=>s+(t.trade.side==='long'?1:-1),0);
  return matching.length>=C.similarMinimum&&balance!==0?{direction:balance>0?'long':'short',basis:'majority direction of exited trades in the matching regime; not a news-direction forecast'}:{direction:null,basis:null};
}
export function computeMarket(symbol:string,input:MarketInput,strategies:EdgeStrategy[]=DEFAULT_STRATEGIES,asOf:string):MarketResult{
  const info=SYMBOLS.find(s=>s.id===symbol);if(!info)throw new Error(`Unknown Edge market ${symbol}.`);const bars=completedDailyBars(input.bars||[],asOf),states=stateSeries(bars),state=states.at(-1)||emptyState(),cot=positioning(symbol,input.cot,asOf);
  const relevantEvents=(input.events||[]).filter(e=>info.currencies.includes(e.currency)),moves=eventMoves(symbol,bars,input.intradayBars,relevantEvents,asOf),events=computeEventRisk(relevantEvents,info.currencies,asOf,moves,input.calendarAvailable,input.calendarAsOf);
  const positionCache=new Map<string,ReturnType<typeof positioning>>(),notes:string[]=[],fits=strategies.map(strategy=>{
    const cache=input.backtests?.[strategy.id],computed=cache?{result:null,reason:null}:runStrategyBacktest(symbol,input,strategy,asOf),trades=cache?.trades||computed.result?.trades||[];
    const timeframe=(strategy.timeframe||'D1').toUpperCase(),executionBars=(timeframe==='D1'?bars:input.strategyBars?.[timeframe]||[]).filter(b=>timeMs(b.time)+(TF[timeframe]||DAY)<=timeMs(asOf)),signalATR=strategyATR(executionBars,strategy),stopDistance=signalATR===null?null:signalATR*(strategy.params.stopS??2);
    const tags=tagTrades(symbol,trades,states,input,asOf,positionCache),direction=likelyDirection(strategy,executionBars,state,tags,signalATR),fit=scoreStrategy({symbol,strategy,state,positioning:cot,events,tags,asOf,likelyDirection:direction.direction,directionBasis:direction.basis,stopDistance});
    if(computed.reason){fit.score=null;fit.label='Unavailable';fit.reasons.unshift(computed.reason);fit.why=computed.reason;}
    return fit;
  });
  const quoted=input.quote,validQuote=quoted&&Number.isFinite(quoted.price)&&quoted.price>0&&timeMs(quoted.asOf)<=timeMs(asOf);
  let price:Value<number>=state.close.value!==null?{...state.close,reason:'Previous completed daily close; a current validated quote is unavailable.'}:missing('No validated quote or completed close is available.');
  if(validQuote)price={value:quoted.price,reason:timeMs(asOf)-timeMs(quoted.asOf)>C.quoteFreshnessMs?'Quote is delayed; inspect its as-of timestamp.':null,asOf:quoted.asOf};
  const change=validQuote&&Number.isFinite(quoted.dayChangePct)?known(quoted.dayChangePct!,quoted.asOf):bars.length>=2?{value:(bars.at(-1)!.close/bars.at(-2)!.close-1)*100,reason:'Previous completed daily-session change.',asOf:state.availableAt!}:missing<number>('Two completed closes are required.');
  const returns=bars.slice(1).map((b,i)=>({date:new Date(timeMs(b.time)).toISOString().slice(0,10),return:b.close/bars[i].close-1})),tradePlans=Object.fromEntries(strategies.map(strategy=>[strategy.id,computeTradePlan({symbol,asOf,price:input.quote,state,bars,strategy,accountEquity:input.accountEquity??null,broker:input.broker})]));
  if(bars.length)notes.push(`Observed daily history: ${new Date(bars[0].time).toISOString().slice(0,10)} to ${state.date}; ${bars.length} completed bars.`);if(bars.length<2520)notes.push('Less than approximately ten trading years are available; sample sizes reflect the actual loaded history.');
  if(state.availableAt&&timeMs(asOf)-timeMs(state.availableAt)>C.dailyFreshnessMs)notes.push('Daily history is stale: the last completed observation is more than four days old. Regime and fit describe that observed state, not an updated current market.');
  notes.push('Daily bar timestamps are openings; state uses only bars closed by the snapshot. Trade tags use the completed state available before entry. Forced end-of-data exits are excluded from fit history.');
  return {symbol,name:info.name,group:info.group,currencies:info.currencies,asOf,price,dayChangePct:change,state,regimeHistory:weeklyRegimes(states,asOf),positioning:cot,events,eventMoves:moves,fits,bestFit:[...fits].filter(f=>f.score!==null).sort((a,b)=>b.score!-a.score!)[0]||null,tradePlans,returns,correlations:[],notes};
}
export function buildSnapshot(input:SnapshotInput):EdgeSnapshot{
  const asOf=new Date(timeMs(input.asOf)).toISOString(),strategies=input.strategies===undefined?DEFAULT_STRATEGIES:input.strategies,watchlist=[...new Set(input.watchlist)],markets=watchlist.map(symbol=>computeMarket(symbol,input.markets[symbol]||{bars:[],calendarAvailable:false},strategies,asOf));
  for(const market of markets){market.correlations=markets.filter(m=>m.symbol!==market.symbol).map(m=>({symbol:m.symbol,...signedCorrelation(market.returns,m.returns,1,1)}));for(const fit of market.fits){const previous=input.previousScores?.[`${market.symbol}:${fit.strategyId}`];if(fit.score!==null&&typeof previous==='number'&&Number.isFinite(previous))fit.scoreChangeWeek=fit.score-previous;}}
  const allFits=markets.flatMap(m=>m.fits),ranked=allFits.filter(f=>f.score!==null).sort((a,b)=>b.score!-a.score!),nextEvents=markets.flatMap(m=>[...m.events.next24h,...m.events.restOfWeek]).filter(e=>e.impact==='high').sort((a,b)=>timeMs(a.time)-timeMs(b.time)),nextEvent=nextEvents[0]||null;
  const summaries=strategies.map(s=>{const scored=allFits.filter(f=>f.strategyId===s.id&&f.score!==null).sort((a,b)=>b.score!-a.score!);return {id:s.id,name:s.name,top:scored.slice(0,2),worst:scored.at(-1)||null,bestScore:scored[0]?.score??null,why:scored[0]?.why||allFits.find(f=>f.strategyId===s.id)?.why||'No market history is available for this strategy.'};});
  const mood=marketMood(markets,input.vix,asOf),fx=markets.filter(m=>m.group==='Forex majors'&&m.state.volatilityPercentile.value!==null),percentile=fx.length?mean(fx.map(m=>m.state.volatilityPercentile.value!)):null;
  const changes=fx.map(m=>{const bars=completedDailyBars(input.markets[m.symbol].bars,asOf),past=stateSeries(bars.slice(0,-5)).at(-1)?.volatilityPercentile.value;return past===undefined||past===null?null:m.state.volatilityPercentile.value!-past;}).filter((v):v is number=>v!==null);
  const delta=changes.length?mean(changes):null,volatility={value:delta===null?null:delta>5?'rising' as const:delta< -5?'falling' as const:'steady' as const,percentile,reason:delta===null?'Five-session change in FX ATR percentiles is unavailable.':null};
  const mapLabels=['Trend · high volatility','Trend · low volatility','Range · high volatility','Range · low volatility'],regimeMap=mapLabels.map(label=>({label,symbols:markets.filter(m=>{const er=m.state.efficiencyRatio.value,vol=m.state.volatilityPercentile.value;if(er===null||vol===null)return false;return `${er>=C.regimes.weakER?'Trend':'Range'} · ${vol>=50?'high':'low'} volatility`===label;}).map(m=>m.symbol)}));
  const heartbeatFresh=input.heartbeat?.receivedAt&&timeMs(asOf)-timeMs(input.heartbeat.receivedAt)>=0&&timeMs(asOf)-timeMs(input.heartbeat.receivedAt)<=C.brokerFreshnessMs;
  const doubleRisk=correlationRisk(heartbeatFresh?input.heartbeat!.positions:[],markets,markets.map(m=>m.bestFit).filter((x):x is NonNullable<typeof x>=>x!==null));
  return {asOf,userTimezone:input.userTimezone||'UTC',markets,strategies:summaries,mood,volatility,nextEvent,bestFit:ranked[0]||null,regimeMap,doubleRisk,brief:dailyBrief(allFits,nextEvent,input.userTimezone||'UTC'),sources:[...new Set(Object.values(input.markets).filter(m=>m.bars.length).map(m=>m.source||'Dukascopy').concat(Object.values(input.markets).some(m=>m.cot?.length)?['CFTC public reporting']:[],input.vix?.length?['FRED VIXCLS']:[],Object.values(input.markets).some(m=>m.calendarAvailable)?['Configured economic calendar']:[]))],notes:['Scores are estimates from past behavior, not trade signals. Educational research tool, not financial advice.','Unavailable components remain null with reasons. Historical event/positioning filters may be relaxed when point-in-time source versions are absent.']};
}
export const computeSnapshot=buildSnapshot;
