import { IntradayCapture } from './intraday';
import { DEFAULT_PARAMS } from './config';
import { finite, integer, statistics, timeMs } from './math';
import type { BacktestResult, Bar, EconomicEvent, QuantParams, ReturnPoint, Tick, Trade } from './types';

export function normalizeParams(input: Partial<QuantParams> = {}): QuantParams {
  const p={...DEFAULT_PARAMS,...input};
  p.dayTimezone=input.dayTimezone??(p.mode==='close'?'UTC':'Europe/Prague');
  if(!['UTC','Europe/Prague'].includes(p.dayTimezone))throw new Error('Choose UTC or Europe/Prague day boundaries.');
  integer(p.lookback,'Lookback',2,500); integer(p.atrPeriod,'ATR period',2,500);
  finite(p.entryK,'Entry multiplier',0,10);finite(p.stopS,'Stop multiplier',.05,20);finite(p.targetTP,'Target multiplier',.05,100);
  integer(p.maxHold,'Maximum hold',1,2000);finite(p.costPips,'Round-trip cost',0,10000);
  finite(p.riskPct,'Risk percent',.001,20);finite(p.pipSize,'Pip size',.00000001,10000);
  finite(p.spreadPips,'Spread',0,10000);finite(p.slippagePips,'Slippage',0,10000);
  integer(p.newsWindowMinutes,'News window',1,1440);finite(p.initialEquity,'Initial equity',1,1e12);
  if(!['close','ohlc','tick'].includes(p.mode))throw new Error('Choose close, ohlc or tick execution.');
  if(!['breakout','mean-reversion','news'].includes(p.strategy))throw new Error('Choose breakout, mean-reversion or news strategy.');
  p.meanLookback=integer(p.meanLookback??20,'Mean-reversion lookback',2,500);p.meanEntryZ=finite(p.meanEntryZ??1.5,'Mean-reversion entry Z',.1,10);
  if(p.captureIntraday!==undefined&&typeof p.captureIntraday!=='boolean')throw new Error('captureIntraday must be boolean.');
  if(p.maxIntradayMarks!==undefined)integer(p.maxIntradayMarks,'Intraday capture budget',100,50000);
  if(p.captureAfterDays!==undefined)integer(p.captureAfterDays,'Intraday capture warmup days',0,3660);
  if(p.startIndex!==undefined)integer(p.startIndex,'Evaluation start',0,100000000);
  return p;
}
export function validateBars(bars: Bar[], mode: QuantParams['mode']='close'): void {
  if(!Array.isArray(bars)||bars.length<3||bars.length>2000000)throw new Error('Between 3 and 2,000,000 price bars are required.');
  let prev=-Infinity;let tickCount=0;
  for(let bi=0;bi<bars.length;bi++){const bar=bars[bi],t=timeMs(bar.time);if(t<=prev)throw new Error('Price bars must have unique, increasing timestamps.');prev=t;finite(bar.close,'Close',Number.MIN_VALUE,1e12);
    if(mode!=='close'){for(const key of ['open','high','low'] as const)finite(bar[key],key,Number.MIN_VALUE,1e12);if(bar.high!<Math.max(bar.open!,bar.close)||bar.low!>Math.min(bar.open!,bar.close)||bar.low!>bar.high!)throw new Error('OHLC bars have inconsistent high/low prices.');}
    if(mode==='tick'){if(!Array.isArray(bar.ticks)||!bar.ticks.length)throw new Error('Tick execution requires recorded bid/ask ticks in every execution bar.');let last=-Infinity;
      for(const tick of bar.ticks){const tt=timeMs(tick.time);if(tt<last)throw new Error('Ticks must be chronological.');if(tt<t||(bi+1<bars.length&&tt>=timeMs(bars[bi+1].time)))throw new Error('Each tick must lie inside its execution bar.');last=tt;finite(tick.bid,'Tick bid',Number.MIN_VALUE,1e12);finite(tick.ask,'Tick ask',tick.bid,1e12);if(++tickCount>10000000)throw new Error('Split tick runs into chunks of at most 10,000,000 ticks.');}}
  }
}
/** Reference daily volatility: arithmetic rolling absolute close-to-close changes. */
export function closeATR(closes: number[], period=14): number[] {
  integer(period,'ATR period',1,500);const out=Array(closes.length).fill(NaN);let sum=0;
  for(let i=1;i<closes.length;i++){sum+=Math.abs(closes[i]-closes[i-1]);if(i>period)sum-=Math.abs(closes[i-period]-closes[i-period-1]);if(i>=period)out[i]=sum/period;}return out;
}
/** True range with Wilder recursive smoothing; first ATR averages period true ranges. */
export function wilderATR(bars: Bar[],period=14):number[]{
  integer(period,'ATR period',1,500);const out=Array(bars.length).fill(NaN);let sum=0,previous=0;
  for(let i=0;i<bars.length;i++){const b=bars[i],tr=i===0?b.high!-b.low!:Math.max(b.high!-b.low!,Math.abs(b.high!-bars[i-1].close),Math.abs(b.low!-bars[i-1].close));
    if(i<period)sum+=tr;if(i===period-1)out[i]=previous=sum/period;else if(i>=period)out[i]=previous=(previous*(period-1)+tr)/period;}return out;
}
export function breakoutSignal(bars:Bar[],i:number,atr:number,p:Pick<QuantParams,'lookback'|'entryK'>):number {
  if(i<p.lookback||!Number.isFinite(atr)||atr<=0)return 0;let high=-Infinity,low=Infinity;
  for(let j=i-p.lookback;j<i;j++){high=Math.max(high,bars[j].close);low=Math.min(low,bars[j].close);}
  return bars[i].close>high+p.entryK*atr?1:bars[i].close<low-p.entryK*atr?-1:0;
}
/** Fade deviation from the PRECEDING closes; current bar never enters its own baseline. */
export function meanReversionSignal(bars:Bar[],i:number,p:Pick<QuantParams,'meanLookback'|'meanEntryZ'>):number{
  const n=p.meanLookback??20,z=p.meanEntryZ??1.5;if(i<n)return 0;
  let sum=0;for(let j=i-n;j<i;j++)sum+=bars[j].close;const average=sum/n;
  let ss=0;for(let j=i-n;j<i;j++)ss+=(bars[j].close-average)**2;const sd=Math.sqrt(ss/(n-1));
  if(!(sd>0))return 0;return bars[i].close<average-z*sd?1:bars[i].close>average+z*sd?-1:0;
}
function relevantEvents(events:EconomicEvent[]|undefined,eventType?:string):EconomicEvent[]{
  if(!events?.length)throw new Error('News strategies require actual high-impact economic-calendar events. Configure a calendar provider first.');
  if(events.length>100000)throw new Error('Too many calendar events.');
  const confirmed=events.filter(e=>e.timing!=='estimated'&&e.impact==='high'&&(!eventType||eventType==='all'||e.type===eventType||e.name===eventType)).map(e=>{timeMs(e.time);return e;});
  if(!confirmed.length)throw new Error('No confirmed high-impact event times match this strategy.');return confirmed;
}
/** Provider candle timestamps denote opens; derive the regular interval, ignoring session gaps. */
export function barIntervalMs(bars: Bar[]): number {
  const samples: number[] = [];
  for (let i=1;i<Math.min(bars.length,513);i++) samples.push(timeMs(bars[i].time)-timeMs(bars[i-1].time));
  samples.sort((a,b)=>a-b);
  return samples[Math.floor(samples.length/2)] || 86400000;
}
/** Event signals become available only after the complete observation window. */
function newsSignals(bars:Bar[],atr:number[],p:QuantParams):Map<number,number>{
  const events=relevantEvents(p.events,p.eventType),result=new Map<number,number>(),interval=barIntervalMs(bars);
  const times=bars.map(b=>timeMs(b.time)),ends=times.map(t=>t+interval);
  if(p.mode!=='close'&&interval>p.newsWindowMinutes*60000)throw new Error('The news window needs a finer bar timeframe. Use M1/M5 bars or recorded ticks.');
  for(const event of events){const release=timeMs(event.time);
    if(p.mode==='close'){
      const date=new Date(release).toISOString().slice(0,10),i=lowerBound(times,timeMs(date));
      if(i<=0||i>=bars.length||new Date(times[i]).toISOString().slice(0,10)!==date)continue;
      const move=bars[i].close-bars[i-1].close;if(Math.abs(move)>p.entryK*atr[i])result.set(i,Math.sign(move));
    }else{
      let start=lowerBound(ends,release);if(start===ends.length||ends[start]>release)start--;
      const end=lowerBound(ends,release+p.newsWindowMinutes*60000);
      if(start<0||end>=bars.length||release-ends[start]>interval||ends[end]-(release+p.newsWindowMinutes*60000)>interval)continue;
      const move=bars[end].close-bars[start].close;if(Number.isFinite(atr[end])&&Math.abs(move)>p.entryK*atr[end])result.set(end,Math.sign(move));
    }
  }return result;
}
type TickNewsEntry={tickIndex:number;side:number;atr:number};
function tickNewsEntries(bars:Bar[],atr:number[],p:QuantParams):Map<number,TickNewsEntry[]>{
  const entries=new Map<number,TickNewsEntry[]>(),times=bars.map(b=>timeMs(b.time));
  const quoteAt=(timestamp:number)=>{
    let bi=lowerBound(times,timestamp);if(bi===times.length||times[bi]>timestamp)bi--;if(bi<0)return null;
    for(;bi<bars.length;bi++){
      const ticks=bars[bi].ticks!;let a=0,b=ticks.length;
      while(a<b){const m=(a+b)>>>1;if(timeMs(ticks[m].time)<timestamp)a=m+1;else b=m;}
      if(a<ticks.length){const tick=ticks[a];return timeMs(tick.time)-timestamp<=60000?{bi,ti:a,tick}:null;}
    }return null;
  };
  for(const event of relevantEvents(p.events,p.eventType)){
    const release=timeMs(event.time),begin=quoteAt(release),end=quoteAt(release+p.newsWindowMinutes*60000);
    if(!begin||!end||end.bi<1)continue;
    const a=atr[end.bi-1],move=(end.tick.bid+end.tick.ask-begin.tick.bid-begin.tick.ask)/2;
    if(!(a>0)||Math.abs(move)<=p.entryK*a)continue;
    if(!entries.has(end.bi))entries.set(end.bi,[]);
    entries.get(end.bi)!.push({tickIndex:end.ti,side:Math.sign(move),atr:a});
  }
  return entries;
}
export function lowerBound(values:number[],target:number):number{let a=0,b=values.length;while(a<b){const m=(a+b)>>>1;if(values[m]<target)a=m+1;else b=m;}return a;}
type Position={side:number;entry:number;stop:number;target:number;units:number;risk:number;atr:number;entryIndex:number;entryDate:string;entryCommission:number;};
type Day={date:string;startEquity:number;startBalance:number;minEquity:number;endEquity:number;endBalance:number;traded:boolean;flat:boolean;complete:boolean;};
export function backtest(bars:Bar[],input:Partial<QuantParams>={}):BacktestResult{
  const p=normalizeParams(input);validateBars(bars,p.mode);const start=Math.max(p.startIndex||0,Math.max(p.lookback,p.strategy==='mean-reversion'?p.meanLookback!:0)+p.atrPeriod+1);
  if(start>=bars.length-1)throw new Error(`Not enough history: at least ${start+2} bars are needed for these settings.`);
  const atr=p.mode==='close'?closeATR(bars.map(b=>b.close),p.atrPeriod):wilderATR(bars,p.atrPeriod);
  const events=p.strategy==='news'&&p.mode!=='tick'?newsSignals(bars,atr,p):new Map<number,number>();
  const tickEntries=p.strategy==='news'&&p.mode==='tick'?tickNewsEntries(bars,atr,p):new Map<number,TickNewsEntry[]>(),interval=barIntervalMs(bars);
  const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:p.dayTimezone,year:'numeric',month:'2-digit',day:'2-digit'});
  const dayKey=(t:string|number)=>p.dayTimezone==='UTC'?new Date(timeMs(t)).toISOString().slice(0,10):dateFormat.format(timeMs(t));
  const capture=new IntradayCapture(p.captureIntraday===true&&p.mode==='tick',p.dayTimezone!,p.maxIntradayMarks,p.captureAfterDays);
  const trades:Trade[]=[];const days:Day[]=[];const position:{current:Position|null}={current:null};let balance=p.initialEquity,equity=balance,pending:{side:number;atr:number}|null=null;let day:Day|null=null;
  const commission=p.costPips*p.pipSize/2,halfSpread=p.spreadPips*p.pipSize/2,slip=p.slippagePips*p.pipSize;
  const marketPrice=(b:Bar,side:number,entry:boolean,open=false):number=>{if(p.mode==='tick'){const tick=open?b.ticks![0]:b.ticks![b.ticks!.length-1];return (side>0?(entry?tick.ask:tick.bid):(entry?tick.bid:tick.ask))+(entry?1:-1)*side*slip;}
    return (open?b.open!:b.close)+(entry?1:-1)*side*(halfSpread+slip);};
  const mark=(price:number)=>position.current?balance+(price-position.current.entry)*position.current.side*position.current.units:balance;
  const enter=(side:number,a:number,i:number,atOpen:boolean,entryTick?:Tick)=>{const b=bars[i],price=entryTick?(side>0?entryTick.ask:entryTick.bid)+side*slip:marketPrice(b,side,true,atOpen),risk=equity*p.riskPct/100,units=risk/(p.stopS*a);if(!(a>0&&units>0))return;
    position.current={side,entry:price,stop:price-side*p.stopS*a,target:price+side*p.targetTP*a,units,risk,atr:a,entryIndex:i,entryDate:new Date(timeMs(entryTick?.time??(p.mode==='tick'?b.ticks![0].time:b.time))).toISOString(),entryCommission:commission*units};balance-=position.current.entryCommission;day!.traded=true;};
  const exit=(price:number,i:number,reason:Trade['reason'],tickTime?:string|number)=>{if(!position.current)return;const entry=position.current;const pnl=(price-entry.entry)*entry.side*entry.units-(entry.entryCommission+commission*entry.units);balance+=(price-entry.entry)*entry.side*entry.units-commission*entry.units;
    trades.push({entryDate:entry.entryDate,exitDate:new Date(timeMs(tickTime??bars[i].time)).toISOString(),entryPrice:entry.entry,exitPrice:price,side:entry.side>0?'long':'short',R:pnl/entry.risk,pnl,reason,entryIndex:entry.entryIndex,exitIndex:i,riskAmount:entry.risk});position.current=null;equity=balance;day!.minEquity=Math.min(day!.minEquity,equity);};
  for(let i=start;i<bars.length;i++){
    const b=bars[i],date=dayKey(b.time);
    if(!day||day.date!==date){day={date,startEquity:equity,startBalance:balance,minEquity:equity,endEquity:equity,endBalance:balance,traded:false,flat:!position.current,complete:p.mode!=='close'&&p.dayTimezone==='Europe/Prague'};days.push(day);capture.begin(date,timeMs(b.time),equity,balance);}
    // Bars spanning the evaluation midnight cannot establish the correct intraday floor.
    const endTime=p.mode==='tick'?b.ticks![b.ticks!.length-1].time:timeMs(b.time)+interval-1;
    if(p.mode!=='close'&&dayKey(endTime)!==date)day.complete=false;
    if(pending&&!position.current&&i<bars.length){enter(pending.side,pending.atr,i,true);pending=null;}
    if(p.mode==='tick'){
      const news=tickEntries.get(i)||[];
      for(let ti=0;ti<b.ticks!.length;ti++){
        const tick=b.ticks![ti];
        if(!position.current&&i<bars.length-1){
          const entry=news.find(e=>e.tickIndex===ti);
          if(entry)enter(entry.side,entry.atr,i,true,tick);
        }
        if(!position.current){capture.record(date,timeMs(tick.time),balance,balance,true);continue;}
        const px=(position.current.side>0?tick.bid:tick.ask)-position.current.side*slip;
        day.minEquity=Math.min(day.minEquity,mark(px));
        if((px-position.current.stop)*position.current.side<=0)exit(px,i,'stop',tick.time);
        else if((px-position.current.target)*position.current.side>=0)exit(position.current.target-position.current.side*slip,i,'target',tick.time);
        capture.record(date,timeMs(tick.time),position.current?mark(px):balance,balance,!position.current);
      }
    }else if(position.current&&p.mode==='ohlc'){
      const side=position.current.side,open=b.open!-side*halfSpread,low=b.low!-side*halfSpread,high=b.high!-side*halfSpread;
      const stopHit=side>0?low<=position.current.stop:high>=position.current.stop,targetHit=side>0?high>=position.current.target:low<=position.current.target;
      if(stopHit){const gap=side>0?Math.min(open,position.current.stop):Math.max(open,position.current.stop);exit(gap-side*slip,i,'stop');}
      else {const adverse=side>0?low:high;day.minEquity=Math.min(day.minEquity,mark(adverse-side*slip));if(targetHit)exit(position.current.target-side*slip,i,'target');}
    }else if(position.current&&p.mode==='close'){
      const px=marketPrice(b,position.current.side,false);day.minEquity=Math.min(day.minEquity,mark(px));
      if((px-position.current.stop)*position.current.side<=0)exit(px,i,'stop');else if((px-position.current.target)*position.current.side>=0)exit(px,i,'target');
    }
    if(position.current&&(i-position.current.entryIndex+(p.mode==='close'?0:1)>=p.maxHold||i===bars.length-1))exit(marketPrice(b,position.current.side,false),i,i===bars.length-1?'last':'time',p.mode==='tick'?b.ticks![b.ticks!.length-1].time:undefined);
    equity=position.current?mark(marketPrice(b,position.current.side,false)):balance;day.minEquity=Math.min(day.minEquity,equity);
    const justExited=trades.length&&trades[trades.length-1].exitIndex===i;
    if(!position.current&&!pending&&!justExited&&i<bars.length-1&&equity>0){const side=p.strategy==='news'?(p.mode==='tick'?0:(events.get(i)||0)):p.strategy==='mean-reversion'?meanReversionSignal(bars,i,p):breakoutSignal(bars,i,atr[i],p);if(side){if(p.mode==='close'){enter(side,atr[i],i,false);equity=position.current?mark(marketPrice(b,side,false)):balance;}else pending={side,atr:atr[i]};}}
    if(!Number.isFinite(equity)||equity<0){equity=0;balance=0;position.current=null;pending=null;}
    day.endEquity=equity;day.endBalance=balance;day.flat=!position.current;day.minEquity=Math.min(day.minEquity,equity);
    if(p.mode==='tick'){capture.record(date,timeMs(b.ticks![b.ticks!.length-1].time),equity,balance,!position.current);capture.cover(date,timeMs(b.time)+interval,day.complete);}
  }
  const dailyReturns:ReturnPoint[]=days.map(d=>({date:d.date,return:d.startEquity>0?d.endEquity/d.startEquity-1:0,traded:d.traded,flat:d.flat,intradayMin:d.startEquity>0?Math.max(-1,d.minEquity/d.startEquity-1):0,intradayComplete:d.complete&&(!capture.enabled||capture.path(d.date)?.complete===true),intraday:capture.path(d.date),dayTimezone:p.dayTimezone,startBalanceRatio:d.startEquity>0?d.startBalance/d.startEquity:1,endBalanceRatio:d.endEquity>0?d.endBalance/d.endEquity:1}));
  const notes=[p.mode==='close'?'Close-only fills at observed closes; gaps beyond stops are filled at the close. Intraday excursions are unknown.':'Signals use a completed bar and enter at the following bar open; ambiguous OHLC stop/target bars take the stop first.',
    'Fixed units are sized from equity at entry. Equity includes open P&L every day; per-trade R includes round-trip costs.',
    p.mode==='tick'?'Recorded bid/ask ticks supply the spread. Configured slippage and round-trip fees are additional.':'Spread and slippage are user-supplied assumptions, not observed historical execution costs.',
    `Daily buckets use ${p.dayTimezone}. FTMO midnight boundaries are Europe/Prague; buckets or bars crossing that boundary retain the daily-data buffer.`];
  if(capture.enabled)notes.push(capture.exceeded?'Intraday timestamp capture reached its bounded mark budget; incomplete paths retain the FTMO buffer.':'Actual tick equity/balance timestamp paths are available for synchronized portfolio research.');
  if(p.strategy==='news')notes.push(p.mode==='close'?'Daily news proxy uses the event day close-to-close move. It does not measure the immediate release response.':p.mode==='tick'?'News observations use the first recorded quotes at release and release + X minutes; signals enter on that quote with prior completed-bar ATR.':'News observations use candle closing timestamps, rounded up by at most one bar; signals enter at the following open.');
  return {equity:days.map(d=>({date:d.date,equity:d.endEquity})),dailyReturns,trades,stats:statistics(dailyReturns,trades,p.initialEquity),params:p,notes};
}
