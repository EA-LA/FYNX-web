import { IntradayCapture } from './intraday';
import { normalizeParams } from './backtest';
import { finite, statistics, timeMs } from './math';
import type { BacktestResult, Bar, EconomicEvent, QuantParams, ReturnPoint, Tick, Trade } from './types';

/**
 * Bounded-memory tick execution. The caller streams complete, ordered M1 bars,
 * including their observed bid/ask ticks. push() holds one pending bar so that
 * only finish() forces the true final exit. Hourly archive boundaries do not
 * close positions, reset ATR, or reset the warmup.
 */
export function createBacktestStream(input: Partial<QuantParams> = {}) {
  const p=normalizeParams({...input,mode:'tick'});
  if(input.mode&&input.mode!=='tick')throw new Error('Streaming execution requires tick-backed M1 bars.');
  const start=Math.max(p.startIndex||0,Math.max(p.lookback,p.strategy==='mean-reversion'?p.meanLookback!:0)+p.atrPeriod+1),commission=p.costPips*p.pipSize/2,slip=p.slippagePips*p.pipSize;
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:p.dayTimezone,year:'numeric',month:'2-digit',day:'2-digit'});
  const dayKey=(t:string|number)=>p.dayTimezone==='UTC'?new Date(timeMs(t)).toISOString().slice(0,10):formatter.format(timeMs(t));
  let pendingBar:Bar|null=null,previousTime=-Infinity,previousClose=NaN,index=-1,atr=NaN,atrSum=0;
  let balance=p.initialEquity,equity=balance,ticksProcessed=0,finished=false,result:BacktestResult|null=null;
  const capture=new IntradayCapture(p.captureIntraday===true,p.dayTimezone!,p.maxIntradayMarks,p.captureAfterDays);
  const history:number[]=[],trades:Trade[]=[];
  type Position={side:number;entry:number;stop:number;target:number;units:number;risk:number;entryIndex:number;entryDate:string;entryCommission:number};
  const state:{position:Position|null;pending:{side:number;atr:number}|null}={position:null,pending:null};
  type Day={date:string;startEquity:number;startBalance:number;minEquity:number;endEquity:number;endBalance:number;traded:boolean;flat:boolean;complete:boolean};
  const days:Day[]=[];let day:Day|null=null;
  const events:EconomicEvent[]=(p.events||[]).filter(e=>e.timing!=='estimated'&&e.impact==='high'&&(!p.eventType||p.eventType==='all'||e.type===p.eventType||e.name===p.eventType)).sort((a,b)=>timeMs(a.time)-timeMs(b.time));
  if(p.strategy==='news'&&!events.length)throw new Error('News strategies require actual high-impact economic-calendar events.');
  let eventCursor=0;const observations:{release:number;end:number;mid:number}[]=[];
  const mark=(price:number)=>state.position?balance+(price-state.position.entry)*state.position.side*state.position.units:balance;
  const enter=(side:number,vol:number,bar:Bar,tick:Tick,news=false)=>{
    if(!(vol>0&&equity>0))return;
    const entry=(side>0?tick.ask:tick.bid)+side*slip,risk=equity*p.riskPct/100,units=risk/(p.stopS*vol);
    state.position={side,entry,stop:entry-side*p.stopS*vol,target:entry+side*p.targetTP*vol,units,risk,entryIndex:index,entryDate:new Date(timeMs(tick.time)).toISOString(),entryCommission:commission*units};
    balance-=commission*units;day!.traded=true;
  };
  const exit=(price:number,reason:Trade['reason'],time:string|number)=>{
    const pos=state.position;if(!pos)return;
    const pnl=(price-pos.entry)*pos.side*pos.units-(pos.entryCommission+commission*pos.units);
    balance+=(price-pos.entry)*pos.side*pos.units-commission*pos.units;
    trades.push({entryDate:pos.entryDate,exitDate:new Date(timeMs(time)).toISOString(),entryPrice:pos.entry,exitPrice:price,side:pos.side>0?'long':'short',R:pnl/pos.risk,pnl,reason,entryIndex:pos.entryIndex,exitIndex:index,riskAmount:pos.risk});
    state.position=null;equity=balance;day!.minEquity=Math.min(day!.minEquity,equity);
  };
  const validate=(bar:Bar)=>{
    const t=timeMs(bar.time);if(t<=previousTime)throw new Error('Streamed M1 bars must have unique, increasing timestamps.');
    for(const key of ['open','high','low','close'] as const)finite(bar[key],key,Number.MIN_VALUE,1e12);
    if(bar.high!<Math.max(bar.open!,bar.close)||bar.low!>Math.min(bar.open!,bar.close)||bar.low!>bar.high!)throw new Error('Invalid OHLC range in streamed bar.');
    if(!Array.isArray(bar.ticks)||!bar.ticks.length)throw new Error('Every streamed bar requires real bid/ask ticks.');
    let last=-Infinity;
    for(const tick of bar.ticks){const tt=timeMs(tick.time);if(tt<last||tt<t||tt>=t+60000)throw new Error('Tick timestamps must be ordered and inside their M1 bar.');last=tt;finite(tick.bid,'Bid',Number.MIN_VALUE,1e12);finite(tick.ask,'Ask',tick.bid,1e12);}
    previousTime=t;
  };
  const observeNews=(tick:Tick,bar:Bar,previousATR:number,allowEntry:boolean)=>{
    if(p.strategy!=='news')return;const tt=timeMs(tick.time);
    while(eventCursor<events.length&&timeMs(events[eventCursor].time)<=tt){const release=timeMs(events[eventCursor++].time);if(tt-release<=60000)observations.push({release,end:release+p.newsWindowMinutes*60000,mid:(tick.bid+tick.ask)/2});}
    for(let oi=observations.length-1;oi>=0;oi--){const observation=observations[oi];if(tt<observation.end)continue;observations.splice(oi,1);const move=(tick.bid+tick.ask)/2-observation.mid;
      if(allowEntry&&!state.position&&tt-observation.end<=60000&&previousATR>0&&Math.abs(move)>p.entryK*previousATR)enter(Math.sign(move),previousATR,bar,tick,true);
    }
  };
  const process=(bar:Bar,last:boolean)=>{
    index++;const previousATR=atr,tr=index===0?bar.high!-bar.low!:Math.max(bar.high!-bar.low!,Math.abs(bar.high!-previousClose),Math.abs(bar.low!-previousClose));
    if(index<p.atrPeriod)atrSum+=tr;
    if(index===p.atrPeriod-1)atr=atrSum/p.atrPeriod;
    else if(index>=p.atrPeriod)atr=(atr*(p.atrPeriod-1)+tr)/p.atrPeriod;
    previousClose=bar.close;
    if(index>=start){
      const date=dayKey(bar.time);
      if(!day||day.date!==date){day={date,startEquity:equity,startBalance:balance,minEquity:equity,endEquity:equity,endBalance:balance,traded:false,flat:!state.position,complete:p.dayTimezone==='Europe/Prague'};days.push(day);capture.begin(date,timeMs(bar.time),equity,balance);}
      if(dayKey(bar.ticks![bar.ticks!.length-1].time)!==date)day.complete=false;
      if(state.pending&&!state.position){enter(state.pending.side,state.pending.atr,bar,bar.ticks![0]);state.pending=null;}
      for(const tick of bar.ticks!){
        ticksProcessed++;const tt=timeMs(tick.time);
        observeNews(tick,bar,previousATR,!last);
        if(!state.position){capture.record(date,tt,balance,balance,true);continue;}
        const px=(state.position.side>0?tick.bid:tick.ask)-state.position.side*slip;
        day.minEquity=Math.min(day.minEquity,mark(px));
        if((px-state.position.stop)*state.position.side<=0)exit(px,'stop',tick.time);
        else if((px-state.position.target)*state.position.side>=0)exit(state.position.target-state.position.side*slip,'target',tick.time);
        capture.record(date,tt,state.position?mark(px):balance,balance,!state.position);
      }
      const lastTick=bar.ticks![bar.ticks!.length-1];
      const closingPrice=()=>state.position?(state.position.side>0?lastTick.bid:lastTick.ask)-state.position.side*slip:bar.close;
      if(state.position&&(index-state.position.entryIndex+1>=p.maxHold||last))exit(closingPrice(),last?'last':'time',lastTick.time);
      equity=state.position?mark(closingPrice()):balance;day.minEquity=Math.min(day.minEquity,equity);
      const justExited=trades.length&&trades[trades.length-1].exitIndex===index;
      if(p.strategy!=='news'&&!last&&!state.position&&!state.pending&&!justExited&&equity>0&&atr>0&&history.length>=p.lookback){
        const range=history.slice(-(p.strategy==='mean-reversion'?p.meanLookback!:p.lookback)),high=Math.max(...range),low=Math.min(...range);
        const average=range.reduce((s,v)=>s+v,0)/range.length,sd=Math.sqrt(range.reduce((s,v)=>s+(v-average)**2,0)/Math.max(1,range.length-1));
        const side=p.strategy==='mean-reversion'?(sd>0?(bar.close<average-p.meanEntryZ!*sd?1:bar.close>average+p.meanEntryZ!*sd?-1:0):0):(bar.close>high+p.entryK*atr?1:bar.close<low-p.entryK*atr?-1:0);
        if(side)state.pending={side,atr};
      }
      if(!Number.isFinite(equity)||equity<0){equity=0;balance=0;state.position=null;state.pending=null;}
      day.endEquity=equity;day.endBalance=balance;day.flat=!state.position;day.minEquity=Math.min(day.minEquity,equity);
      capture.record(date,timeMs(lastTick.time),equity,balance,!state.position);capture.cover(date,timeMs(bar.time)+60000,day.complete);
    }else {for(const tick of bar.ticks!){ticksProcessed++;observeNews(tick,bar,previousATR,false);}}
    history.push(bar.close);if(history.length>Math.max(p.lookback,p.meanLookback!))history.shift();
  };
  return {
    push(bars:Bar[]){
      if(finished)throw new Error('The stream is already finished.');
      if(!Array.isArray(bars)||bars.length>100000)throw new Error('Push at most 100,000 M1 bars per streaming batch.');
      for(const bar of bars){validate(bar);if(pendingBar)process(pendingBar,false);pendingBar=bar;}
    },
    snapshot(){return {barsProcessed:index+1,ticksProcessed,lastTime:pendingBar?new Date(timeMs(pendingBar.time)).toISOString():null,openPosition:!!state.position,retainedBars:history.length+(pendingBar?1:0)};},
    finish():BacktestResult{
      if(result)return result;if(finished)throw new Error('The stream failed before completion.');finished=true;
      if(pendingBar){process(pendingBar,true);pendingBar=null;}
      if(index<start+1)throw new Error(`Not enough streamed bars; at least ${start+2} are needed.`);
      const dailyReturns:ReturnPoint[]=days.map(d=>({date:d.date,return:d.startEquity>0?d.endEquity/d.startEquity-1:0,traded:d.traded,flat:d.flat,intradayMin:d.startEquity>0?Math.max(-1,d.minEquity/d.startEquity-1):0,intradayComplete:d.complete&&(!capture.enabled||capture.path(d.date)?.complete===true),intraday:capture.path(d.date),dayTimezone:p.dayTimezone,startBalanceRatio:d.startEquity>0?d.startBalance/d.startEquity:1,endBalanceRatio:d.endEquity>0?d.endBalance/d.endEquity:1}));
      result={equity:days.map(d=>({date:d.date,equity:d.endEquity})),dailyReturns,trades,stats:statistics(dailyReturns,trades,p.initialEquity),params:p,notes:['Streamed M1 bars with original bid/ask ticks. Positions and Wilder ATR continue across archive partitions; only the final bar forces an exit.','Signals use completed M1 closes and enter on the next bar; news entries use the first recorded quote after the release observation window.','Fixed units are sized from entry equity; reported R and equity include configured fees and slippage.',`Daily equity and observed minima use ${p.dayTimezone} boundaries. Missing archive intervals must be disclosed by the data service.`,capture.enabled?(capture.exceeded?'Intraday timestamp capture reached its bounded budget; incomplete paths retain the FTMO buffer.':'Actual tick equity/balance timestamps are captured for synchronized portfolio research.'):'Timestamp capture is off to keep decade archive execution bounded; daily minima remain available.']};return result;
    }
  };
}
export async function backtestStreaming(source: AsyncIterable<Bar[]>,params: Partial<QuantParams>={}):Promise<BacktestResult>{const stream=createBacktestStream(params);for await(const batch of source)stream.push(batch);return stream.finish();}
