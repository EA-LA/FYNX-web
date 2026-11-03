import { synchronizeIntraday } from './intraday';
import { backtest, barIntervalMs, lowerBound, normalizeParams, validateBars } from './backtest';
import { correlation, equityFromReturns, finite, integer, mean, statistics, timeMs, validateReturns } from './math';
import type { Bar, EconomicEvent, Progress, QuantParams, ReturnPoint, Sleeve, Stats } from './types';
export type OptimizeOptions={metric?:'sharpe'|'profitFactor'|'totalReturn'|'returnMaxDD';entryValues?:number[];stopValues?:number[];minTrades?:number;trainFraction?:number};
export function optimize(bars:Bar[],params:Partial<QuantParams>={},options:OptimizeOptions={},onProgress?:Progress){
  if(params.strategy==='mean-reversion')throw new Error('Mean-reversion optimization requires a Z-score grid; the entry-ATR grid does not apply.');
  const p=normalizeParams(params),metric=options.metric||'sharpe',minTrades=integer(options.minTrades??10,'Minimum trades',1,10000),fraction=finite(options.trainFraction??.7,'Train fraction',.5,.9);
  if(!['sharpe','profitFactor','totalReturn','returnMaxDD'].includes(metric))throw new Error('Unsupported optimization metric.');
  const entryValues=options.entryValues||Array.from({length:9},(_,i)=>i*.25),stopValues=options.stopValues||Array.from({length:8},(_,i)=>(i+1)*.5);
  if(!entryValues.length||!stopValues.length||entryValues.length*stopValues.length>2500)throw new Error('Optimization grids must have 1–2,500 cells.');
  if(bars.length*entryValues.length*stopValues.length>30000000)throw new Error('Reduce the history or grid to at most 30 million bar-cell evaluations.');
  entryValues.forEach(k=>finite(k,'Entry grid',0,10));stopValues.forEach(s=>finite(s,'Stop grid',.05,20));
  const split=Math.floor(bars.length*fraction),training=bars.slice(0,split),cells:{entryK:number;stopS:number;value:number|null;stats:Stats}[]=[];
  if(split<=p.lookback+p.atrPeriod+2||bars.length-split<20)throw new Error('More history is required for a meaningful 70/30 walk-forward split.');
  let best:{entryK:number;stopS:number;value:number}|null=null;
  for(const stopS of stopValues)for(const entryK of entryValues){const result=backtest(training,{...p,entryK,stopS,startIndex:0});const raw=result.stats[metric];const value=result.trades.length>=minTrades&&raw!==null&&Number.isFinite(raw)?raw:null;
    cells.push({entryK,stopS,value,stats:result.stats});if(value!==null&&(!best||value>best.value))best={entryK,stopS,value};onProgress?.(cells.length/(entryValues.length*stopValues.length));}
  const inSample=best?backtest(training,{...p,...best,startIndex:0}):null,outOfSample=best?backtest(bars,{...p,...best,startIndex:split}):null;
  const verdict=!best?'unavailable':outOfSample!.stats.sharpe>0?(outOfSample!.stats.sharpe>=.5*inSample!.stats.sharpe?'green':'amber'):'red';
  return {cells,best,inSample,outOfSample,verdict,metric,entryValues,stopValues,splitDate:new Date(bars[split].time).toISOString().slice(0,10),note:!best?'Too few qualifying trades to select a cell.':verdict==='green'?'The edge retained at least half its in-sample Sharpe on the held-out period.':verdict==='amber'?'The held-out result is positive but weaker.':'The in-sample peak did not survive the held-out period: likely curve-fit.'};
}
function covarianceMatrix(series:number[][]):number[][] {const averages=series.map(mean),n=series[0].length;return series.map((a,i)=>series.map((b,j)=>a.reduce((s,v,k)=>s+(v-averages[i])*(b[k]-averages[j]),0)/Math.max(1,n-1)));}
function allocation(series:number[][],method:string):number[]{
  const n=series.length;if(method==='equal-weight')return Array(n).fill(1/n);
  const cov=covarianceMatrix(series),vol=cov.map((r,i)=>Math.sqrt(Math.max(0,r[i]))),active=vol.map((v,i)=>v>1e-12?i:-1).filter(i=>i>=0);
  if(!active.length)return Array(n).fill(1/n);const weights=vol.map(v=>v>1e-12?1/v:0);let sum=weights.reduce((a,b)=>a+b,0);for(let i=0;i<n;i++)weights[i]/=sum;
  if(method==='inverse-volatility')return weights;
  // Equal risk contribution: positive cyclic coordinate descent on
  // .5 w'Cov w - sum(log(w))/n. Normalize to fully invested weights.
  const diagonalFloor=Math.max(...vol.map(v=>v*v))*1e-8;
  for(let pass=0;pass<300;pass++){let change=0;for(const i of active){const diag=Math.max(cov[i][i],diagonalFloor),off=active.reduce((s,j)=>j===i?s:s+cov[i][j]*weights[j],0);const next=(-off+Math.sqrt(off*off+4*diag/active.length))/(2*diag);change=Math.max(change,Math.abs(next-weights[i]));weights[i]=next;}if(change<1e-10)break;}
  sum=weights.reduce((a,b)=>a+b,0);return weights.map(w=>w/sum);
}
export function portfolio(input:Sleeve[],options:{method?:'equal-risk'|'equal-weight'|'inverse-volatility';lookback?:number;rebalanceEvery?:number;initialEquity?:number}={}){
  if(!Array.isArray(input)||!input.length||input.length>50)throw new Error('Select between 1 and 50 strategy sleeves.');const method=options.method||'equal-risk';if(!['equal-risk','equal-weight','inverse-volatility'].includes(method))throw new Error('Unknown portfolio weighting method.');
  const sleeves=input.map(s=>{if(typeof s.name!=='string'||!s.name.trim()||s.name.length>160)throw new Error('Each strategy needs a short name.');return {name:s.name,returns:validateReturns(s.returns)};});
  const maps=sleeves.map(s=>new Map(s.returns.map(r=>[r.date,r])));const dates=sleeves[0].returns.map(r=>r.date).filter(d=>maps.every(m=>m.has(d)));if(dates.length<20)throw new Error('The strategies need at least 20 overlapping daily observations.');
  const lookback=integer(options.lookback??60,'Risk calibration days',2,1000),rebalanceEvery=integer(options.rebalanceEvery??20,'Rebalance interval',1,252);if(method!=='equal-weight'&&dates.length<=lookback+1)throw new Error('Not enough overlapping dates after risk calibration.');
  const rows=maps.map(m=>dates.map(d=>m.get(d)!)),matrix=rows.map(rs=>rs.map(r=>r.return));let weights=Array(sleeves.length).fill(1/sleeves.length);const dailyReturns:ReturnPoint[]=[];const allocations:{date:string;weights:number[]}[]=[];
  const start=method==='equal-weight'?0:lookback;
  for(let i=start;i<dates.length;i++){if(method!=='equal-weight'&&(i-start)%rebalanceEvery===0){weights=allocation(matrix.map(row=>row.slice(i-lookback,i)),method);allocations.push({date:dates[i],weights:[...weights]});}
    const combined:ReturnPoint={date:dates[i],return:matrix.reduce((s,row,j)=>s+weights[j]*row[i],0),traded:rows.some((r,j)=>weights[j]>0&&(r[i].traded??r[i].return!==0)),flat:rows.every((r,j)=>weights[j]===0||r[i].flat!==false),intradayComplete:false};
    const synchronized=synchronizeIntraday(rows.map(row=>row[i].intraday),weights);
    if(synchronized){
      // A complete path must reconcile with independently computed daily P&L.
      const final=synchronized.path.marks[synchronized.path.marks.length-1];
      const reconciled=Math.abs(final.equity-(1+combined.return))<=1e-8;
      combined.intraday={...synchronized.path,complete:synchronized.path.complete&&reconciled};
      combined.intradayComplete=combined.intraday.complete;
      combined.intradayMin=Math.min(0,combined.return,synchronized.minimum);
      combined.dayTimezone='Europe/Prague';combined.startBalanceRatio=synchronized.startBalanceRatio;
      combined.endBalanceRatio=synchronized.endBalanceRatio;combined.flat=synchronized.flat;
    }
    dailyReturns.push(combined);
  }

  const initial=finite(options.initialEquity??10000,'Initial equity',1,1e12);const aligned=sleeves.map((s,i)=>({name:s.name,returns:rows[i].slice(start).map(({intraday,...r})=>({...r,intradayComplete:false})),equity:equityFromReturns(rows[i].slice(start),initial)}));
  return {dailyReturns,equity:equityFromReturns(dailyReturns,initial),stats:statistics(dailyReturns),weights:sleeves.map((s,i)=>({name:s.name,weight:weights[i]})),correlation:matrix.map(a=>matrix.map(b=>correlation(a.slice(start),b.slice(start)))),sleeves:aligned,allocations,method,notes:['Only shared observed dates are included. Missing returns are not silently filled with zero.',method==='equal-weight'?'Equal weights are fixed.':`Weights use only the preceding ${lookback} daily observations and rebalance every ${rebalanceEvery} days; displayed weights are the latest allocation.`, 'Complete captured tick paths are merged at actual timestamps using the last observed valuation of each sleeve. Independent sleeve minima are never summed. Missing/incomplete paths, unequal coverage, ambiguous same-timestamp ordering, and OHLC-only sleeves retain the FTMO buffer.']};
}
export function eventStudy(bars: Bar[], events: EconomicEvent[], options: {currency?: string; currencies?: string[]; eventType?: string; windowMinutes?: number; mode?: 'daily'|'intraday'} = {}) {
  validateBars(bars);
  if (!Array.isArray(events) || !events.length) throw new Error('A recorded economic calendar is required for an event study.');
  const window = integer(options.windowMinutes ?? 15, 'Observation minutes', 1, 1440), mode = options.mode || 'daily';
  const selected = events.filter(e => e.timing !== 'estimated' && e.impact === 'high' && (!options.currency || e.currency === options.currency) && (!options.currencies?.length || options.currencies.includes(e.currency)) && (!options.eventType || options.eventType === 'all' || e.type === options.eventType || e.name === options.eventType));
  const byDay = new Map<string, Set<string>>();
  for (const e of selected) {
    const date = new Date(timeMs(e.time)).toISOString().slice(0, 10), type = e.type || e.name;
    if (!byDay.has(date)) byDay.set(date, new Set());
    byDay.get(date)!.add(type);
  }
  const eventMoves: number[] = [], normalMoves: number[] = [], types = new Map<string, number[]>(), times = bars.map(b => timeMs(b.time));
  const addEvent = (type: string, move: number) => {
    if (!types.has(type)) types.set(type, []);
    types.get(type)!.push(move);
  };
  if (mode === 'daily') {
    for (let i = 1; i < bars.length; i++) {
      const date = new Date(times[i]).toISOString().slice(0, 10), move = Math.abs(bars[i].close / bars[i-1].close - 1), dayTypes = byDay.get(date);
      if (dayTypes) {
        eventMoves.push(move);
        for (const type of dayTypes) addEvent(type, move);
      } else normalMoves.push(move);
    }
  } else {
    const interval = barIntervalMs(bars), ends = times.map(t=>t+interval);
    if(interval>window*60000)throw new Error('Event studies need a bar timeframe at least as fine as the observation window.');
    const observedDays = [...new Set(times.map(t => new Date(t).toISOString().slice(0, 10)))];
    const releaseTimes = new Set<number>();
    const observation = (release: number) => {
      let i = lowerBound(ends, release); if(i===ends.length||ends[i]>release)i--;
      const j = lowerBound(ends, release + window * 60000);
      if (i < 0 || j >= bars.length || ends[j] - (release + window * 60000) > interval || release - ends[i] > interval) return null;
      return Math.abs(bars[j].close / bars[i].close - 1);
    };
    for (const event of selected) {
      const release = timeMs(event.time), move = observation(release);
      releaseTimes.add(((release % 86400000) + 86400000) % 86400000);
      if (move !== null) { eventMoves.push(move); addEvent(event.type || event.name, move); }
    }
    // Match the same UTC time-of-day and observation horizon on non-event days.
    for (const date of observedDays) if (!byDay.has(date)) {
      for (const offset of releaseTimes) {
        const move = observation(timeMs(date) + offset);
        if (move !== null) normalMoves.push(move);
      }
    }
  }
  return {eventDays: eventMoves.length, normalDays: normalMoves.length,
    averageEventMove: eventMoves.length ? mean(eventMoves) : null,
    averageNormalMove: normalMoves.length ? mean(normalMoves) : null,
    byType: [...types].map(([type,moves]) => ({type,count:moves.length,averageAbsoluteMove:mean(moves)})),
    mode,windowMinutes:window,notes:[mode === 'daily' ? 'Absolute close-to-close daily returns, matched to actual release dates. This is an association, not a causal estimate.' : 'Release windows use available completed closes. Controls match UTC release time and observation horizon on non-event days; missing windows are omitted.']};
}
