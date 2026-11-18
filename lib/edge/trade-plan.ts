import { breakoutSignal, closeATR, meanReversionSignal, normalizeParams, wilderATR } from '../quant/backtest';
import { timeMs } from '../quant/math';
import type { Bar } from '../quant/types';
import { completedDailyBars } from './regime';
import { EDGE_CONFIG as C } from './config';
import type { BrokerMetadata, EdgeStrategy, MarketState, Quote, TradePlan } from './types';
export function strategyATR(bars:Bar[],strategy:EdgeStrategy):number|null {const p=normalizeParams({...strategy.params,strategy:strategy.kind});if(p.mode!=='close'&&bars.some(b=>!Number.isFinite(b.high)||!Number.isFinite(b.low)))return null;const series=p.mode==='close'?closeATR(bars.map(b=>b.close),p.atrPeriod):wilderATR(bars,p.atrPeriod),value=series.at(-1);return value!==undefined&&Number.isFinite(value)&&value>0?value:null;}
export function computeTradePlan(input:{symbol:string;asOf:string;price?:Quote;state:MarketState;bars:Bar[];strategy:EdgeStrategy;accountEquity:number|null;broker?:BrokerMetadata}):TradePlan{
  const {state,strategy}=input,bars=completedDailyBars(input.bars,input.asOf),p=normalizeParams({...strategy.params,strategy:strategy.kind}),atr=strategyATR(bars,strategy);
  const out:TradePlan={available:false,reason:null,model:'closed-candle-atr',signal:null,trigger:{long:null,short:null,description:''},entry:null,stop:null,target:null,stopDistance:atr===null?null:atr*p.stopS,riskPct:p.riskPct,riskAmount:input.accountEquity!==null&&Number.isFinite(input.accountEquity)&&input.accountEquity>0?input.accountEquity*p.riskPct/100:null,lots:null,brokerSymbol:input.broker?.brokerSymbol||null,brokerDigits:input.broker?.digits??null,accountCurrency:input.broker?.accountCurrency||null,basisAt:state.availableAt,notes:['Trigger inputs use the last completed daily candle. Broker lot sizing requires fresh authenticated contract metadata and account equity.']};
  if(strategy.returns?.length){Object.assign(out,{model:null,stopDistance:null,riskPct:null,riskAmount:null});out.reason='Imported return-only strategies have no executable entry, stop or sizing rules. Save actual Quant strategy settings to create a trade plan.';return out;}
  if(strategy.timeframe&&strategy.timeframe!=='D1'){out.reason='This plan requires the exact saved timeframe candles and a matching broker feed; daily-state levels cannot substitute.';return out;}
  if(strategy.kind==='news'){out.reason='A future news direction is unknown; a live release observation is required before an entry/stop/target can be planned.';return out;}
  if(bars.length&&timeMs(input.asOf)-timeMs(bars.at(-1)!.time)-86400000>C.dailyFreshnessMs){out.reason='Completed daily history is stale; a fresh broker quote cannot validate levels derived from old candles.';return out;}
  if(atr===null||!bars.length){out.reason='Completed daily OHLC and ATR are unavailable.';return out;}
  const index=bars.length-1;
  if(strategy.kind==='breakout'){
    if(index<p.lookback){out.reason='Insufficient completed closes for the configured range.';return out;}
    const range=bars.slice(index-p.lookback,index).map(b=>b.close);out.trigger.long=Math.max(...range)+p.entryK*atr;out.trigger.short=Math.min(...range)-p.entryK*atr;out.trigger.description=`A completed close must exceed the previous ${p.lookback} closes by ${p.entryK} ATR. ${p.mode==='close'?'The research model fills at the observed close; a live broker quote is a new execution estimate.':'Entry occurs on the following bar.'}`;
    const sign=breakoutSignal(bars,index,atr,p);out.signal=sign>0?'long':sign<0?'short':null;
  }else{
    const n=p.meanLookback!;if(index<n){out.reason='Insufficient completed closes for the mean-reversion baseline.';return out;}const range=bars.slice(index-n,index).map(b=>b.close),mean=range.reduce((s,v)=>s+v,0)/n,sd=Math.sqrt(range.reduce((s,v)=>s+(v-mean)**2,0)/(n-1));out.trigger.long=mean-p.meanEntryZ!*sd;out.trigger.short=mean+p.meanEntryZ!*sd;out.trigger.description=`Fade a completed close beyond ${p.meanEntryZ} standard deviations from the preceding ${n} closes.`;const sign=meanReversionSignal(bars,index,p);out.signal=sign>0?'long':sign<0?'short':null;
  }
  if(!out.signal){out.reason='No completed-candle entry trigger is active; executable entry, stop, target and lot size remain unavailable.';return out;}
  const b=input.broker;if(!b){out.reason='Connect a fresh EA heartbeat with broker contract metadata to calculate executable prices and lots.';return out;}
  const observed=typeof b.asOf==='number'?(b.asOf<1e12?b.asOf*1000:b.asOf):timeMs(b.asOf),age=timeMs(input.asOf)-observed;
  if(age<0||age>C.brokerFreshnessMs){out.reason='Broker bid/ask and contract metadata are stale or dated after this snapshot.';return out;}
  if(b.symbol!==input.symbol||![b.tickSize,b.tickValueLoss,b.volumeMin,b.volumeMax,b.volumeStep,b.bid,b.ask].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)||b.ask!<b.bid!||b.volumeMax<b.volumeMin||!Number.isInteger(b.digits)||b.digits<0||b.digits>12||!Number.isFinite(b.stopLevel)||b.stopLevel<0||!b.accountCurrency||!b.brokerSymbol){out.reason='Broker contract, bid/ask or account-currency tick-value metadata is incomplete.';return out;}
  if(out.riskAmount===null){out.reason='Fresh account equity is required for risk sizing.';return out;}
  const long=out.signal==='long',entry=long?b.ask!:b.bid!,floor=(x:number)=>Math.floor((x+1e-10)/b.tickSize)*b.tickSize,ceil=(x:number)=>Math.ceil((x-1e-10)/b.tickSize)*b.tickSize;
  const stop=long?floor(entry-atr*p.stopS):ceil(entry+atr*p.stopS),target=long?ceil(entry+atr*p.targetTP):floor(entry-atr*p.targetTP),distance=Math.abs(entry-stop),minimumStop=b.stopLevel*Math.pow(10,-b.digits);
  if(stop<=0||target<=0||distance<minimumStop||Math.abs(target-entry)<minimumStop){out.reason='The tested stop/target violates the broker minimum stop distance. Parameters are not silently widened.';return out;}
  const rawLots=out.riskAmount/(distance/b.tickSize*b.tickValueLoss),lots=Math.floor((Math.min(rawLots,b.volumeMax)+1e-10)/b.volumeStep)*b.volumeStep;
  if(lots<b.volumeMin){out.reason='The broker minimum lot would exceed the selected risk budget.';return out;}
  Object.assign(out,{available:true,reason:null,entry,stop,target,stopDistance:distance,lots:Number(lots.toFixed(8)),basisAt:new Date(observed).toISOString()});out.notes.push('Prices snap outward to the real broker tick size; volume rounds down to its step. Tick value is reported in the account currency; no currency conversion is guessed.');return out;
}
