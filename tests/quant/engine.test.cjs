'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const buildPath=path.join(os.tmpdir(),`fynx-quant-engine-test-${process.pid}.cjs`);
require('esbuild').buildSync({entryPoints:[path.resolve(__dirname,'../../lib/quant/index.ts')],bundle:true,platform:'node',format:'cjs',outfile:buildPath});
const q=require(buildPath);fs.unlinkSync(buildPath);
const fixture=require('./fixtures/reference-eurusd.json');
const realBars=fixture.dates.map((time,i)=>({time,close:fixture.close[i]}));
const date=i=>new Date(Date.UTC(2020,0,1+i)).toISOString();
const rows=values=>values.map((r,i)=>({date:date(i).slice(0,10),return:r,traded:r!==0,flat:true}));
const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} differs from ${expected}`);
const params={lookback:2,atrPeriod:2,entryK:0,stopS:1,targetTP:2,maxHold:4,costPips:0,riskPct:1,pipSize:.01};
function ohlc(){return [100,101,100,101,100,104,104,104,104,104,104,104].map((c,i)=>({time:date(i),open:c,high:c+.5,low:c-.5,close:c}));}

test('absolute daily ATR uses only trailing close changes',()=>{
  const a=q.closeATR([1,2,4,3,7],2);assert.ok(Number.isNaN(a[0]));assert.ok(Number.isNaN(a[1]));assert.deepEqual(a.slice(2),[1.5,1.5,2.5]);
});
test('Wilder true ATR includes gap range and recursive smoothing',()=>{
  const bars=[{time:date(0),open:10,high:11,low:9,close:10},{time:date(1),open:12,high:13,low:11,close:12},{time:date(2),open:12,high:14,low:11,close:13}];
  const a=q.wilderATR(bars,2);close(a[1],2.5);close(a[2],2.75);
});
test('breakout excludes signal bar from prior range',()=>{
  const b=[1,2,3].map((c,i)=>({time:date(i),close:c}));assert.equal(q.breakoutSignal(b,2,1,{lookback:2,entryK:.25}),1);assert.equal(q.breakoutSignal(b,2,1,{lookback:2,entryK:1}),0);
});
test('no lookahead: changing every future price cannot alter earlier returns or closed trades',()=>{
  const cutoff=1000,changed=realBars.map((b,i)=>i<cutoff?b:{...b,close:b.close*(i%2?1.5:.6)}),a=q.backtest(realBars),b=q.backtest(changed);
  assert.deepEqual(a.trades.filter(t=>t.exitIndex<cutoff),b.trades.filter(t=>t.exitIndex<cutoff));
  const boundary=realBars[cutoff].time;assert.deepEqual(a.dailyReturns.filter(r=>r.date<boundary),b.dailyReturns.filter(r=>r.date<boundary));
});
test('OHLC enters after completed signal and assumes stop first when target and stop touch',()=>{
  const bars=ohlc();bars[6]={...bars[6],high:120,low:80};const r=q.backtest(bars,{...params,mode:'ohlc'}),t=r.trades[0];
  assert.equal(t.entryIndex,6);assert.equal(t.exitIndex,6);assert.equal(t.reason,'stop');close(t.R,-1);close(t.pnl,-100);
});
test('stop gaps fill at the worse opening price, never at an unavailable stop',()=>{
  const bars=ohlc();bars[7]={...bars[7],open:90,high:91,low:89,close:90};const r=q.backtest(bars,{...params,mode:'ohlc'}),t=r.trades[0];
  assert.equal(t.reason,'stop');assert.equal(t.exitPrice,90);assert.ok(t.R<-1);
});
test('tick fills use real bid/ask and chronological stop checks',()=>{
  const bars=ohlc().map((b,i)=>({...b,ticks:[{time:date(i),bid:b.close,ask:b.close+.2}]}));
  bars[6]={...bars[6],high:120,low:90,ticks:[{time:date(6),bid:104,ask:104.2},{time:Date.parse(date(6))+1000,bid:90,ask:90.2},{time:Date.parse(date(6))+2000,bid:120,ask:120.2}]};
  const t=q.backtest(bars,{...params,mode:'tick'}).trades[0];assert.equal(t.entryPrice,104.2);assert.equal(t.exitPrice,90);assert.equal(t.reason,'stop');
});
test('costs and spread lower realized P&L and R',()=>{
  const bare=q.backtest(realBars,{costPips:0}),cost=q.backtest(realBars,{costPips:3,spreadPips:1,slippagePips:.5});
  assert.ok(cost.stats.totalReturn<bare.stats.totalReturn);assert.ok(cost.trades[0].R<bare.trades[0].R);
});
test('fixed-position daily mark-to-market reconciles exactly with realized trade P&L',()=>{
  const r=q.backtest(realBars);close(r.equity.at(-1).equity,r.params.initialEquity+r.trades.reduce((s,t)=>s+t.pnl,0),1e-7);
  const compound=r.dailyReturns.reduce((e,p)=>e*(1+p.return),r.params.initialEquity);close(compound,r.equity.at(-1).equity,1e-7);
});
test('statistics: sample daily Sharpe, drawdown from initial balance, and profit factor',()=>{
  const a=q.statistics([.1,-.1],[]);close(a.totalReturn,-.01);close(a.maxDrawdown,.1);close(a.sharpe,0);
  const t=[{pnl:200,R:2},{pnl:-100,R:-1},{pnl:0,R:0}];const s=q.statistics([-.1,.2],t);close(s.profitFactor,2);close(s.winRate,1/3);close(s.averageR,1/3);close(s.maxDrawdown,.1);
});
test('profit factor with no realized losses is unavailable rather than a fabricated finite ratio',()=>{
  assert.equal(q.statistics([.01,.02],[{pnl:2,R:1}]).profitFactor,null);
});
test('golden: supplied daily EUR/USD reference exactly reproduces 162 / −4.3% / −0.11 / 13.9%',()=>{
  const s=q.referenceBacktest(realBars).stats;assert.equal(s.trades,162);assert.equal((s.totalReturn*100).toFixed(1),'-4.3');assert.equal(s.sharpe.toFixed(2),'-0.11');assert.equal((s.maxDrawdown*100).toFixed(1),'13.9');close(s.totalReturn,-.04341590629960501);close(s.sharpe,-.1078318657038895);
});
test('fixed-position production defaults also meet requested golden rounding',()=>{
  const s=q.backtest(realBars).stats;assert.equal(s.trades,162);assert.equal((s.totalReturn*100).toFixed(1),'-4.3');assert.equal(s.sharpe.toFixed(2),'-0.11');assert.equal((s.maxDrawdown*100).toFixed(1),'13.9');
});
test('optimization has 72 cells and does not use held-out prices to choose parameters',()=>{
  const split=Math.floor(realBars.length*.7),a=q.optimize(realBars),changed=realBars.map((b,i)=>i<split?b:{...b,close:b.close*(i%2?2:.5)}),b=q.optimize(changed);
  assert.equal(a.cells.length,72);assert.deepEqual(a.best,b.best);assert.deepEqual(a.cells,b.cells);assert.ok(a.outOfSample.trades.every(t=>t.entryIndex>=split));
});
test('grids with too few trades return unavailable without an invented best setting',()=>{
  const result=q.optimize(realBars,{}, {minTrades:10000});assert.equal(result.best,null);assert.equal(result.verdict,'unavailable');
});
test('portfolio weights normalize and use only preceding observations',()=>{
  const source=realBars.slice(0,150).map((b,i)=>({date:b.time,return:i?b.close/realBars[i-1].close-1:0,traded:true,flat:true}));
  const a={name:'A',returns:source},b={name:'B',returns:source.map(p=>({...p,return:p.return*2}))};
  for(const method of ['equal-weight','inverse-volatility','equal-risk']){const p=q.portfolio([a,b],{method,lookback:30});close(p.weights.reduce((s,w)=>s+w.weight,0),1);if(method!=='equal-weight')close(p.weights[0].weight,2/3,1e-6);}
  const p=q.portfolio([a,b],{lookback:30}),future={...b,returns:b.returns.map((r,i)=>i<100?r:{...r,return:.2})},changed=q.portfolio([a,future],{lookback:30});
  assert.deepEqual(p.dailyReturns.filter(r=>r.date<source[100].date),changed.dailyReturns.filter(r=>r.date<source[100].date));
});
test('portfolio does not fill absent observations with fictitious zero returns',()=>{
  const a={name:'A',returns:rows(Array(40).fill(.001))},b={name:'B',returns:rows(Array(40).fill(.002)).slice(10)};const p=q.portfolio([a,b],{method:'equal-weight'});assert.equal(p.dailyReturns.length,30);assert.equal(p.dailyReturns[0].date,b.returns[0].date);
});
test('Mulberry32 and stationary bootstrap are reproducible',()=>{
  const a=q.mulberry32(42),b=q.mulberry32(42);assert.deepEqual(Array.from({length:10},a),Array.from({length:10},b));
  assert.deepEqual(q.stationaryIndices(100,40,10,q.mulberry32(42)),q.stationaryIndices(100,40,10,q.mulberry32(42)));
});
test('Monte Carlo seeds reproduce fan bands, sample paths and tail statistics',()=>{
  const r=q.backtest(realBars).dailyReturns,a=q.monteCarlo(r,{paths:100,horizon:50,seed:42}),b=q.monteCarlo(r,{paths:100,horizon:50,seed:42}),c=q.monteCarlo(r,{paths:100,horizon:50,seed:43});assert.deepEqual(a,b);assert.notDeepEqual(a.stats,c.stats);assert.equal(a.samples.length,40);assert.ok(a.fan.every(p=>p.p05<=p.p25&&p.p25<=p.median&&p.median<=p.p75&&p.p75<=p.p95));
});
test('FTMO daily-loss limit is a fixed amount of initial balance',()=>{
  const r=q.evaluatePhase(rows([.08,-.04]),q.FTMO_RULES['2-step'],.5,{intradayBufferPct:0});assert.equal(r.status,'timeout');
  const fail=q.evaluatePhase(rows([.08,-.05]),q.FTMO_RULES['2-step'],.5,{intradayBufferPct:0});assert.equal(fail.status,'daily-loss');
});
test('FTMO maximum-loss breach takes precedence when both limits breach',()=>{
  const r=q.evaluatePhase(rows([-.11]),q.FTMO_RULES['2-step'],.1,{intradayBufferPct:0});assert.equal(r.status,'max-loss');
});
test('four trading days count actual openings, not just a profitable open position',()=>{
  const a=rows([.04,.04,.04,.04]);a[1].traded=false;a[2].traded=false;assert.equal(q.evaluatePhase(a,q.FTMO_RULES['2-step'],.1,{intradayBufferPct:0}).status,'timeout');assert.equal(q.evaluatePhase(rows([.03,.03,.03,.03]),q.FTMO_RULES['2-step'],.1,{intradayBufferPct:0}).status,'pass');
});
test('FTMO cannot pass while the target is only open P&L',()=>{
  const a=rows([.03,.03,.03,.03]).map(p=>({...p,flat:false}));assert.equal(q.evaluatePhase(a,q.FTMO_RULES['2-step'],.1,{intradayBufferPct:0}).status,'timeout');
});
test('phase 2 resets account equity and trading-day counters',()=>{
  const r=q.ftmo(rows(Array(30).fill(.03)),{attempts:10,horizon:4,includeRiskScan:false,intradayBufferPct:0});assert.equal(r.stats.bothPassRate,1);assert.equal(r.stats.medianDaysPhase1,4);assert.equal(r.stats.medianDaysPhase2,4);
});
test('one-step trailing loss uses prior end-of-day high balance',()=>{
  const path=rows([.15,-.04,-.04,-.04]);const rules={...q.FTMO_RULES['1-step'],dailyLoss:.2,bestDayLimit:null};assert.equal(q.evaluatePhase(path,rules,1,{intradayBufferPct:0}).status,'max-loss');
});
test('current consistency and legacy best-day denominators differ',()=>{
  const path=rows([.06,-.02,.04,.02]);const current=q.evaluatePhase(path,q.FTMO_RULES['1-step'],.1,{intradayBufferPct:0}),legacy=q.evaluatePhase(path,q.FTMO_RULES['1-step-legacy'],.1,{intradayBufferPct:0});assert.equal(current.status,'timeout');assert.equal(legacy.status,'pass');
});
test('recorded intraday dips trigger losses even when closing profit is positive',()=>{
  const path=[{date:'2020-01-01',return:.02,traded:true,flat:true,intradayMin:-.06,intradayComplete:true,dayTimezone:'Europe/Prague'}];assert.equal(q.evaluatePhase(path,q.FTMO_RULES['2-step'],.1,{intradayBufferPct:0}).status,'daily-loss');
});
test('daily buffer tightens the limit; observed intraday minima drop the buffer',()=>{
  const path=rows([-.045]);assert.equal(q.evaluatePhase(path,q.FTMO_RULES['2-step'],.1).status,'daily-loss');const intraday=path.map(p=>({...p,intradayMin:-.045,intradayComplete:true,dayTimezone:'Europe/Prague'}));assert.equal(q.evaluatePhase(intraday,q.FTMO_RULES['2-step'],.1).status,'timeout');
});
test('news uses actual events and refuses calendar-free first-Friday approximation',()=>{
  assert.throws(()=>q.backtest(realBars,{strategy:'news'}),/calendar/);const b=realBars.slice(0,100),event={time:b[50].time+'T13:30:00Z',name:'CPI',type:'CPI',currency:'USD',impact:'high'},r=q.eventStudy(b,[event]);assert.equal(r.eventDays,1);assert.equal(r.byType[0].type,'CPI');
});
test('engine rejects invalid bars, duplicate dates, impossible costs and oversized simulations',()=>{
  assert.throws(()=>q.backtest([{time:'bad',close:1},{time:'bad',close:1},{time:'bad',close:1}]),/timestamp/);assert.throws(()=>q.backtest(realBars,{riskPct:NaN}),/finite/);assert.throws(()=>q.monteCarlo(rows(Array(20).fill(.01)),{paths:10001}),/Paths/);assert.throws(()=>q.validateReturns([{date:'2020-01-01',return:.01},{date:'2020-01-01',return:.02}]),/unique/);
});

test('news observes completed candle CLOSE time, excluding the next unfinished candle',()=>{
  const start=Date.UTC(2020,0,1,12),bars=Array.from({length:60},(_,i)=>({time:start+i*60000,open:100,high:100.5,low:99.5,close:100}));
  bars[25]={...bars[25],high:121,close:120};
  const event={time:start+10*60000,name:'CPI',type:'CPI',currency:'USD',impact:'high'};
  const result=q.backtest(bars,{...params,mode:'ohlc',strategy:'news',events:[event],newsWindowMinutes:15});
  assert.equal(result.trades.length,0);
  const study=q.eventStudy(bars,[event],{mode:'intraday',windowMinutes:15});assert.equal(study.eventDays,1);assert.equal(study.averageEventMove,0);
  bars[24]={...bars[24],high:106,close:105};bars[25]={...bars[25],open:105,low:104,high:121};
  const traded=q.backtest(bars,{...params,mode:'ohlc',strategy:'news',events:[event],newsWindowMinutes:15});assert.equal(traded.trades[0].entryIndex,25);
});
test('news rejects bars coarser than the requested release window instead of inventing 15-minute prices',()=>{
  const b=ohlc();assert.throws(()=>q.backtest(b,{...params,mode:'ohlc',strategy:'news',events:[{time:date(6),name:'CPI',currency:'USD',impact:'high'}],newsWindowMinutes:15}),/finer bar timeframe/);
});
test('tick news enters at release plus X minutes inside the bar using prior completed-bar ATR',()=>{
  const start=Date.UTC(2020,0,1,0),bars=Array.from({length:12},(_,i)=>({time:start+i*3600000,open:100,high:101,low:99,close:100,ticks:[{time:start+i*3600000,bid:100,ask:100.2}]}));
  const release=start+6*3600000+5*60000,end=release+15*60000;
  bars[6]={...bars[6],high:106,close:105,ticks:[{time:bars[6].time,bid:100,ask:100.2},{time:release,bid:100,ask:100.2},{time:end,bid:105,ask:105.2}]};
  const result=q.backtest(bars,{...params,mode:'tick',strategy:'news',events:[{time:release,name:'CPI',currency:'USD',impact:'high'}],newsWindowMinutes:15});
  assert.equal(result.trades[0].entryDate,new Date(end).toISOString());assert.equal(result.trades[0].entryIndex,6);assert.equal(result.trades[0].entryPrice,105.2);
});
test('intraday return buckets reset at Prague midnight, including winter offset',()=>{
  const start=Date.UTC(2020,0,1,12),bars=Array.from({length:36},(_,i)=>({time:start+i*3600000,open:100,high:101,low:99,close:100}));
  const result=q.backtest(bars,{...params,mode:'ohlc'});assert.equal(result.dailyReturns[0].dayTimezone,'Europe/Prague');assert.deepEqual(result.dailyReturns.map(r=>r.date),['2020-01-01','2020-01-02','2020-01-03']);assert.ok(result.dailyReturns.every(r=>r.intradayComplete));
});
test('daily OHLC bars crossing Prague midnight cannot disable the FTMO buffer',()=>{
  const result=q.backtest(ohlc(),{...params,mode:'ohlc'});assert.ok(result.dailyReturns.every(r=>!r.intradayComplete));
  const path=[{date:'2020-01-01',return:-.045,traded:true,flat:true,intradayMin:-.045,intradayComplete:true,dayTimezone:'UTC'}];assert.equal(q.evaluatePhase(path,q.FTMO_RULES['2-step'],.1).status,'daily-loss');
});
test('equal risk contribution differs from inverse volatility for asymmetric correlations',()=>{
  const a=rows(Array.from({length:120},(_,i)=>Math.sin(i*.7)*.01));
  const b=a.map((p,i)=>({...p,return:p.return*.8+Math.cos(i*.9)*.002}));
  const c=a.map((p,i)=>({...p,return:Math.cos(i*.3)*.01}));
  const input=[{name:'A',returns:a},{name:'B',returns:b},{name:'C',returns:c}];
  const erc=q.portfolio(input,{method:'equal-risk'}),iv=q.portfolio(input,{method:'inverse-volatility'});
  assert.ok(Math.abs(erc.weights[2].weight-iv.weights[2].weight)>.02);
});
function tickMinutes(n=2000){
  const start=Date.UTC(2020,0,1,12);let previous=100;
  return Array.from({length:n},(_,i)=>{const c=100+Math.sin(i*.07)*4+i*.002,open=previous;previous=c;const high=Math.max(open,c)+.05,low=Math.min(open,c)-.05,time=start+i*60000;
    return {time,open,high,low,close:c,ticks:[{time,bid:open,ask:open+.02},{time:time+10000,bid:low,ask:low+.02},{time:time+30000,bid:high,ask:high+.02},{time:time+59000,bid:c,ask:c+.02}]};});
}
test('streaming tick backtest matches in-memory trades and daily MTM across arbitrary archive partitions',()=>{
  const bars=tickMinutes(),p={mode:'tick',pipSize:.01,costPips:1.5,slippagePips:.1};const expected=q.backtest(bars,p),stream=q.createBacktestStream(p);
  for(let i=0;i<bars.length;i+=137){stream.push(bars.slice(i,i+137));assert.ok(stream.snapshot().retainedBars<=21);}
  const actual=stream.finish();assert.deepEqual(actual.trades,expected.trades);assert.deepEqual(actual.dailyReturns,expected.dailyReturns);assert.deepEqual(actual.stats,expected.stats);assert.equal(stream.finish(),actual);assert.throws(()=>stream.push([]),/finished/);
});
test('streaming news maintains observation windows and positions across partition boundaries',()=>{
  const bars=tickMinutes(300),events=[30,70,130,200].map(i=>({time:bars[i].time,name:'CPI',type:'CPI',currency:'USD',impact:'high'})),p={mode:'tick',strategy:'news',events,newsWindowMinutes:15,pipSize:.01,entryK:.25};
  const expected=q.backtest(bars,p),stream=q.createBacktestStream(p);for(let i=0;i<bars.length;i+=17)stream.push(bars.slice(i,i+17));const actual=stream.finish();assert.ok(actual.trades.length>0);assert.deepEqual(actual.trades,expected.trades);assert.deepEqual(actual.dailyReturns,expected.dailyReturns);
});
test('streaming rejects out-of-order or invented tick data',()=>{
  const bars=tickMinutes(40),stream=q.createBacktestStream();stream.push(bars.slice(0,2));assert.throws(()=>stream.push([bars[0]]),/increasing/);const bad={...bars[2],ticks:[]};assert.throws(()=>stream.push([bad]),/real bid\/ask/);
});
test('streamed out-of-sample evaluation preserves ATR history without opening training trades',()=>{
  const bars=tickMinutes(),p={mode:'tick',startIndex:1400};const expected=q.backtest(bars,p),stream=q.createBacktestStream(p);for(let i=0;i<bars.length;i+=200)stream.push(bars.slice(i,i+200));const actual=stream.finish();assert.deepEqual(actual.trades,expected.trades);assert.deepEqual(actual.dailyReturns,expected.dailyReturns);assert.ok(actual.trades.every(t=>t.entryIndex>=1400));
});
test('tick final/time exits and entries record the actual quote timestamp',()=>{
  const bars=tickMinutes(100);for(const b of bars)b.ticks[0].time+=200;const p={mode:'tick',maxHold:1,targetTP:100,stopS:20};const r=q.backtest(bars,p);assert.ok(r.trades.length>0);for(const t of r.trades){assert.equal(Date.parse(t.entryDate),bars[t.entryIndex].ticks[0].time);if(t.reason==='time'||t.reason==='last')assert.equal(Date.parse(t.exitDate),bars[t.exitIndex].ticks.at(-1).time);}
});
test('intraday maximum hold counts the entry bar, while close entry begins after that bar',()=>{
  const bars=tickMinutes(100);const r=q.backtest(bars,{mode:'tick',maxHold:1,targetTP:100,stopS:20});assert.ok(r.trades.length>0);assert.ok(r.trades.filter(t=>t.reason==='time').every(t=>t.exitIndex===t.entryIndex));
});
test('appending future portfolio dates does not change historical default risk allocations',()=>{
  const values=Array.from({length:150},(_,i)=>Math.sin(i*.3)*.01);const a={name:'A',returns:rows(values)},b={name:'B',returns:rows(values.map((v,i)=>v*.5+Math.cos(i*.7)*.005))};
  const long=q.portfolio([a,b]),short=q.portfolio([{...a,returns:a.returns.slice(0,100)},{...b,returns:b.returns.slice(0,100)}]);assert.deepEqual(long.dailyReturns.slice(0,short.dailyReturns.length),short.dailyReturns);assert.deepEqual(long.allocations.slice(0,short.allocations.length),short.allocations);
});
test('estimated provider release times cannot silently become backtest signals',()=>{
  const bars=tickMinutes(100),event={time:bars[40].time,name:'CPI',type:'CPI',currency:'USD',impact:'high',timing:'estimated'};assert.throws(()=>q.backtest(bars,{mode:'tick',strategy:'news',events:[event]}),/confirmed/);assert.throws(()=>q.createBacktestStream({strategy:'news',events:[event]}),/actual high-impact/);assert.equal(q.eventStudy(bars,[event]).eventDays,0);
});
function capturedSleeve(name, pattern){
  const returns=Array.from({length:20},(_,i)=>{
    const from=Date.UTC(2020,0,1+i),to=from+10000;
    const marks=pattern.map(([seconds,equity])=>({time:from+seconds*1000,equity,balance:equity,flat:true}));
    return {date:new Date(from).toISOString().slice(0,10),return:0,traded:true,flat:true,intradayMin:-.1,intradayComplete:true,dayTimezone:'Europe/Prague',intraday:{timezone:'Europe/Prague',from,to,openingEquity:100,openingBalance:100,complete:true,model:'recorded-ticks',marks}};
  });
  return {name,returns};
}
test('portfolio merges actual tick timestamps instead of summing non-synchronous sleeve minima',()=>{
  const a=capturedSleeve('A',[[1,90],[2,100],[3,100],[4,95.5]]),b=capturedSleeve('B',[[1,100],[2,90],[3,100],[4,95.5]]);
  for(const sleeve of [a,b])for(const row of sleeve.returns)row.return=-.045;
  const result=q.portfolio([a,b],{method:'equal-weight'});assert.ok(result.dailyReturns.every(r=>r.intradayComplete));
  close(result.dailyReturns[0].intradayMin,-.05);assert.equal(result.dailyReturns[0].intraday.model,'synchronized-ticks');
  assert.equal(q.evaluatePhase(result.dailyReturns.slice(0,1),q.FTMO_RULES['2-step'],.1).status,'timeout');
  assert.equal(q.evaluatePhase(result.dailyReturns.slice(0,1).map(r=>({...r,intradayComplete:false})),q.FTMO_RULES['2-step'],.1).status,'daily-loss');
});
test('intraday portfolio carries the last observed sleeve quote between asynchronous updates',()=>{
  const a=capturedSleeve('A',[[1,90],[4,100]]),b=capturedSleeve('B',[[2,90],[3,100],[4,100]]);
  const result=q.portfolio([a,b],{method:'equal-weight'});close(result.dailyReturns[0].intradayMin,-.1);assert.equal(result.dailyReturns[0].intradayComplete,true);
});
test('missing, unequal, or ambiguous intraday paths preserve the portfolio FTMO buffer',()=>{
  const a=capturedSleeve('A',[[1,90],[2,100],[3,100]]),b=capturedSleeve('B',[[1,100],[2,90],[3,100]]);
  const missing={...b,returns:b.returns.map(({intraday,...r})=>r)};assert.ok(q.portfolio([a,missing],{method:'equal-weight'}).dailyReturns.every(r=>!r.intradayComplete));
  const unequal={...b,returns:b.returns.map(r=>({...r,intraday:{...r.intraday,to:r.intraday.to+1000}}))};assert.ok(q.portfolio([a,unequal],{method:'equal-weight'}).dailyReturns.every(r=>!r.intradayComplete));
  const ambiguous=capturedSleeve('C',[[1,90],[1,100],[3,100]]);assert.ok(q.portfolio([a,ambiguous],{method:'equal-weight'}).dailyReturns.every(r=>!r.intradayComplete));
});
test('intraday capture is opt-in, bounded, and does not change the underlying backtest',()=>{
  const bars=tickMinutes(1000),plain=q.backtest(bars,{mode:'tick'}),full=q.backtest(bars,{mode:'tick',captureIntraday:true}),limited=q.backtest(bars,{mode:'tick',captureIntraday:true,maxIntradayMarks:100});
  assert.ok(plain.dailyReturns.every(r=>r.intraday===undefined));assert.ok(full.dailyReturns.every(r=>r.intraday?.complete));
  assert.ok(limited.dailyReturns.every(r=>r.intraday?.complete===false));assert.equal(limited.dailyReturns.reduce((n,r)=>n+(r.intraday?.marks.length||0),0),100);assert.deepEqual(full.stats,plain.stats);assert.deepEqual(limited.stats,plain.stats);
});
test('captured tick paths remain identical through streaming partition boundaries',()=>{
  const bars=tickMinutes(2000),params={mode:'tick',captureIntraday:true,maxIntradayMarks:20000},expected=q.backtest(bars,params),stream=q.createBacktestStream(params);for(let i=0;i<bars.length;i+=137)stream.push(bars.slice(i,i+137));assert.deepEqual(stream.finish().dailyReturns,expected.dailyReturns);
});
test('capture can skip portfolio calibration days without consuming its mark budget',()=>{
  const bars=tickMinutes(3000),result=q.backtest(bars,{mode:'tick',captureIntraday:true,maxIntradayMarks:100,captureAfterDays:1});
  assert.equal(result.dailyReturns[0].intraday,undefined);assert.equal(result.dailyReturns[0].intradayComplete,false);assert.ok(result.dailyReturns[1].intraday);assert.equal(result.dailyReturns.reduce((n,r)=>n+(r.intraday?.marks.length||0),0),100);
});
