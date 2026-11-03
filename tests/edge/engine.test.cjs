'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const bundle=path.join(os.tmpdir(),`fynx-edge-engine-${process.pid}.cjs`),quantBundle=path.join(os.tmpdir(),`fynx-edge-quant-${process.pid}.cjs`);
for(const [entry,outfile] of [['../../lib/edge/index.ts',bundle],['../../lib/quant/index.ts',quantBundle]])require('esbuild').buildSync({entryPoints:[path.resolve(__dirname,entry)],bundle:true,platform:'node',format:'cjs',outfile});
const e=require(bundle),q=require(quantBundle);fs.unlinkSync(bundle);fs.unlinkSync(quantBundle);
const DAY=86400000,origin=Date.UTC(2020,0,1),iso=n=>new Date(origin+n*DAY).toISOString(),near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
// Explicitly synthetic test bars; these never enter production provider stores.
const bars=(n=700)=>Array.from({length:n},(_,i)=>{const c=100+i*.025+3*Math.sin(i*.13)+.8*Math.sin(i*.61);return {time:iso(i),open:c-.1,high:c+.7,low:c-.7,close:c};});
const value=x=>({value:x,reason:null}),state={...e.emptyState(),date:'2020-12-30',availableAt:iso(365),regime:value('Trend'),volatilityBucket:value('low'),atr:value(2),close:value(100),trendStrength:value(.4)};
const pos={net:value(.5),crowded:value(false),percentile85:value(.8),reportDate:'2020-12-29',availableAt:iso(365),history:[],legs:[],basis:'Synthetic unit fixture'};
const events={available:true,reason:null,eventIn24h:false,next24h:[],restOfWeek:[],nextHighImpact:null,maximumTypicalMove:value(0)};
const strategy={...e.DEFAULT_STRATEGIES[0],params:{...e.DEFAULT_STRATEGIES[0].params,costPips:0}};
const trade=(i,R=.4)=>({entryDate:iso(270+i),exitDate:iso(271+i),entryPrice:100,exitPrice:101,side:'long',R,pnl:R*100,reason:'target',entryIndex:270+i,exitIndex:271+i,riskAmount:100});
const tag=(i,R=.4,overrides={})=>({trade:trade(i,R),regime:'Trend',volatilityBucket:'low',eventIn24h:false,crowded:false,stateAsOf:iso(270+i),reasons:[],...overrides});
const score=(tags,extra={})=>e.scoreStrategy({symbol:'EURUSD',strategy,state,positioning:pos,events,tags,asOf:iso(700),likelyDirection:'long',directionBasis:'test',...extra});
function cotRows(market='EUR',current=.6){const last=Date.UTC(2023,9,31);return Array.from({length:156},(_,i)=>{const day=last-(155-i)*7*DAY,net=i===155?current:.2*Math.sin(i);return {market,reportDate:new Date(day).toISOString().slice(0,10),availableAt:new Date(day+3*DAY+19.5*3600000).toISOString(),long:1000*(1+net),short:1000*(1-net),report:'TFF',availabilityBasis:'fixture-recorded-publication'};});}

test('ER measures path efficiency, signed state uses direction, and flat series is zero',()=>{
  near(e.efficiencyRatio([1,2,3,4,5],4),1);near(e.efficiencyRatio([1,2,1,2,1],4),0);near(e.efficiencyRatio([5,5,5],2),0);assert.equal(e.efficiencyRatio([1,2],3),null);
  const down=Array.from({length:300},(_,i)=>({time:iso(i),open:500-i,high:501-i,low:499-i,close:500-i}));const s=e.computeRegime(down,iso(300));near(s.trendStrength.value,-1);assert.equal(s.regime.value,'Strong trend');
});
test('Wilder ADX initializes after fourteen DX observations, monotonic=100, flat=0',()=>{
  const increasing=Array.from({length:50},(_,i)=>({time:iso(i),open:100+i,high:101+i,low:99+i,close:100+i})),a=e.adxSeries(increasing);
  assert.equal(a[26],null);near(a[27],100);near(a[49],100);const flat=increasing.map(b=>({...b,open:100,high:101,low:99,close:100}));near(e.adxSeries(flat)[49],0);
});
test('percentiles use a full 252 ATR/close window with bounded lower tie ranks',()=>{
  near(e.percentileRank(3,[1,2,3]),100);near(e.percentileRank(2,[1,2,2]),50);near(e.percentileRank(8,[1,2,3]),100);
  assert.equal(e.computeRegime(bars(264),iso(264)).volatilityPercentile.value,null);assert.notEqual(e.computeRegime(bars(265),iso(265)).volatilityPercentile.value,null);
});
test('regime boundary rules match the disclosed thresholds',()=>{
  assert.equal(e.classifyRegime(.45,30,60),'Strong trend');assert.equal(e.classifyRegime(.30,22,60),'Trend');assert.equal(e.classifyRegime(.20,10,60),'Weak trend');assert.equal(e.classifyRegime(.199,50,49.99),'Range');assert.equal(e.classifyRegime(.199,50,50),'Choppy');
  assert.equal(e.volatilityBucket(32.99),'low');assert.equal(e.volatilityBucket(33),'mid');assert.equal(e.volatilityBucket(66),'mid');assert.equal(e.volatilityBucket(66.01),'high');
});
test('unclosed daily bars and future changed prices do not alter historical state',()=>{
  const original=bars(),asOf=iso(500),mutated=original.map((b,i)=>i<500?b:{...b,open:b.open*2,high:b.high*2,low:b.low*2,close:b.close*2});assert.deepEqual(e.computeRegime(original,asOf),e.computeRegime(mutated,asOf));assert.equal(e.computeRegime(original,asOf).date,iso(499).slice(0,10));
});
test('close-only history never fabricates OHLC highs, ADX, ATR or volatility',()=>{
  const s=e.computeRegime(bars().map(({time,close})=>({time,close})),iso(700));assert.equal(s.high20.value,null);assert.equal(s.low20.value,null);assert.equal(s.adx.value,null);assert.equal(s.regime.value,null);assert.ok(s.efficiencyRatio.value!==null);
});
test('COT ratios, USD-base inversion and cross legs preserve actual publication availability',()=>{
  near(e.netPosition(800,200),.6);assert.equal(e.netPosition(0,0),null);const rows=cotRows('JPY'),before=e.positioning('USDJPY',rows,'2023-11-03T19:29:59Z'),after=e.positioning('USDJPY',rows,'2023-11-03T19:30:01Z');
  assert.equal(before.reportDate,'2023-10-24');near(after.net.value,-.6);assert.equal(after.crowded.value,true);assert.equal(after.availableAt,'2023-11-03T19:30:00.000Z');
  const cross=e.positioning('EURJPY',[...cotRows('EUR',.2),...rows],'2023-11-03T20:00:00Z');near(cross.net.value,-.2);
});
test('COT revised row values cannot leak before their recorded row-version availability',()=>{
  const rows=cotRows(),asOf='2023-11-03T19:29:00Z',changed=rows.map((r,i)=>i===155?{...r,long:100000,short:0}:r);assert.deepEqual(e.positioning('EURUSD',rows,asOf),e.positioning('EURUSD',changed,asOf));
  const loadedLate=rows.map(r=>({...r,availableAt:'2024-01-01T00:00:00Z'}));assert.equal(e.positioning('EURUSD',loadedLate,asOf).net.value,null);assert.equal(e.positioning('EURUSD',rows.slice(-5),'2023-11-03T20:00:00Z').crowded.value,null);
});
test('entry tags use the last daily candle closed at entry and exclude unfinished exits',()=>{
  const source=bars(),states=e.stateSeries(source),at=iso(400),t={...trade(130),entryDate:at,exitDate:iso(402)},tags=e.tagTrades('EURUSD',[t,{...t,exitDate:iso(501)},{...t,reason:'last'}],states,{bars:source,calendarAvailable:false},iso(500));
  assert.equal(tags.length,1);assert.equal(tags[0].stateAsOf,at);assert.equal(tags[0].regime,states[399].regime.value);assert.equal(tags[0].eventIn24h,null);assert.equal(tags[0].crowded,null);
});
test('shrinkage, relaxation order, distinct other trades and displayed integer parts are exact',()=>{
  near(e.shrinkAverage([1,1],[-1,1],30),.0625);
  const tags=[...Array.from({length:15},(_,i)=>tag(i,.4)),...Array.from({length:15},(_,i)=>tag(15+i,-.2,{volatilityBucket:'mid'})),...Array.from({length:30},(_,i)=>tag(30+i,.6,{regime:'Choppy',volatilityBucket:'high'}))],r=score(tags);
  assert.deepEqual(r.filtersRelaxed,['event and positioning flags','volatility bucket']);assert.equal(r.sampleSize,30);assert.equal(r.other.count,30);near(r.shrunkAvgR,.225);assert.deepEqual(r.parts.map(p=>p.points),[7,17,13,8,0]);assert.equal(r.score,45);assert.equal(r.label,'maybe');
});
test('complete exact match gives score 93; future trades and terminal forced exits cannot affect it',()=>{
  const tags=Array.from({length:35},(_,i)=>tag(i,.5)),result=score(tags),future={...tag(100,.9),trade:{...trade(100,999),exitDate:iso(701)}};assert.equal(result.score,93);assert.deepEqual(result.filtersRelaxed,[]);assert.equal(result.parts.reduce((s,p)=>s+p.points,0),result.score);assert.deepEqual(score([...tags,future,{...tag(102,999),trade:{...trade(102,999),reason:'last'}}]),result);
});
test('unknown current components remain null and fewer than fifteen matches has no score',()=>{
  const r=score(Array.from({length:35},(_,i)=>tag(i)),{positioning:{...pos,crowded:{value:null,reason:'No point-in-time COT history'}}});assert.equal(r.score,null);assert.equal(r.parts.find(p=>p.id==='positioning').points,null);assert.match(r.reasons.join(' '),/COT/);
  assert.equal(score(Array.from({length:14},(_,i)=>tag(i))).label,'Not enough history');
});
test('lower clipping keeps displayed contributions summing to zero while preserving raw penalties',()=>{
  const r=score(Array.from({length:35},(_,i)=>tag(i,-.5)),{positioning:{...pos,net:value(-.8),crowded:value(true)},events:{...events,eventIn24h:true,maximumTypicalMove:value(.2)}});assert.equal(r.score,0);assert.equal(r.parts.reduce((s,p)=>s+p.points,0),0);assert.equal(r.parts.find(p=>p.id==='events').rawPoints,-20);assert.equal(r.parts.find(p=>p.id==='positioning').rawPoints,-8);
});
test('losing streaks exclude break-even trades',()=>{const stats=e.tradeStatistics([-1,-1,0,-1,1].map((r,i)=>tag(i,r)));assert.equal(stats.worstLosingStreak,2);});
test('unannounced future events do not leak into historical flags or event lists',()=>{
  const asOf=iso(500),release={time:iso(500.5),name:'CPI',type:'CPI',currency:'USD',impact:'high',availableAt:iso(500.25)};
  const r=e.computeEventRisk([release],['USD'],asOf,[],true,asOf);assert.equal(r.eventIn24h,false);assert.equal(r.next24h.length,0);assert.equal(r.nextHighImpact,null);assert.equal(e.calendarFlag([],asOf,true,iso(501)),null);
  release.availableAt=iso(499);const visible=e.computeEventRisk([release],['USD'],asOf,[],true,asOf);assert.equal(visible.next24h.length,1);assert.equal(visible.maximumTypicalMove.value,null);
});
test('historical event move is actual sixty-minute fractional return, with explicit daily fallback',()=>{
  const start=Date.UTC(2020,0,1,12),intra=Array.from({length:100},(_,i)=>({time:start+i*60000,open:100+i*.01,high:101+i*.01,low:99+i*.01,close:100+i*.01})),release={time:start+10*60000,name:'CPI',type:'CPI',currency:'USD',impact:'high'};
  const moves=e.eventMoves('EURUSD',bars(20),intra,[release],new Date(start+101*60000).toISOString());assert.equal(moves[0].basis,'intraday-60m');assert.equal(moves[0].sampleSize,1);near(moves[0].averageAbsoluteMove,(100.69/100.09-1));
  const daily=e.eventMoves('EURUSD',bars(20),undefined,[{...release,time:iso(10.5)}],iso(20));assert.equal(daily[0].basis,'daily-close');assert.equal(daily[0].sampleSize,1);
});
test('direction-adjusted 20-session correlations warn only on aligned exposure and actual known risk',()=>{
  const a=Array.from({length:20},(_,i)=>({date:iso(i).slice(0,10),return:Math.sin(i)*.01})),b=a.map(r=>({...r,return:-r.return}));near(e.signedCorrelation(a,b,1,-1).value,1);near(e.signedCorrelation(a,b,1,1).value,-1);assert.equal(e.signedCorrelation(a.slice(1),b,1,-1).value,null);
  const markets=[{symbol:'EURUSD',returns:a},{symbol:'USDCHF',returns:b}],positions=[{id:'a',symbol:'EURUSD',side:'buy',riskToStop:100},{id:'b',symbol:'USDCHF',side:'sell',riskToStop:150}],warnings=e.correlationRisk(positions,markets);assert.equal(warnings.length,1);assert.equal(warnings[0].combinedRisk,250);positions[1].riskToStop=null;assert.equal(e.correlationRisk(positions,markets)[0].combinedRisk,null);
});
test('mood requires real as-of VIX and explains missing parts',()=>{
  const assets=['USDJPY','USDCHF','XAUUSD','AUDUSD','SPX500'].map((symbol,i)=>({symbol,state:{atr:value(1),close:value(100)},returns:[{date:'2020-01-02',return:[-.01,-.01,.01,-.01,-.01][i]}]}));assert.equal(e.marketMood(assets,[],iso(3)).value,null);
  const vix=[{date:iso(1),close:30,availableAt:iso(2)}];assert.equal(e.marketMood(assets,vix,iso(3)).value,'risk-off');assert.equal(e.marketMood(assets,[{...vix[0],availableAt:iso(4)}],iso(3)).value,null);
});
test('mean reversion uses prior-window sample deviation and enters only on the next execution bar',()=>{
  const tiny=[99,100,101,103].map((close,i)=>({time:iso(i),close}));assert.equal(q.meanReversionSignal(tiny,3,{meanLookback:3,meanEntryZ:2}),-1);assert.equal(q.meanReversionSignal(tiny,3,{meanLookback:3,meanEntryZ:3}),0);
  const source=bars(400),p={strategy:'mean-reversion',meanLookback:5,meanEntryZ:1.2,lookback:2,atrPeriod:2,entryK:0,stopS:2,targetTP:2,maxHold:3,costPips:0,mode:'ohlc'},r=q.backtest(source,p);assert.ok(r.trades.length>0);for(const t of r.trades)assert.equal(q.meanReversionSignal(source,t.entryIndex-1,p),t.side==='long'?1:-1);
});
test('mean-reversion streaming tick execution matches array execution across partition boundaries',()=>{
  const source=bars(250).map((b,i)=>({...b,time:origin+i*60000,ticks:[{time:origin+i*60000,bid:b.close,ask:b.close+.01}]})),p={strategy:'mean-reversion',meanLookback:7,meanEntryZ:1.2,lookback:2,atrPeriod:3,stopS:2,targetTP:2,maxHold:4,costPips:0,mode:'tick'},a=q.backtest(source,p),s=q.createBacktestStream(p);for(let i=0;i<source.length;i+=13)s.push(source.slice(i,i+13));const b=s.finish();assert.deepEqual(b.trades,a.trades);assert.deepEqual(b.dailyReturns,a.dailyReturns);
});
test('Edge close execution timestamps represent close availability while Quant reference dates remain intact',()=>{
  const source=bars(),s={...strategy,params:{...strategy.params,mode:'close',entryK:0,lookback:3,atrPeriod:3,maxHold:2}},input={bars:source,calendarAvailable:false},a=q.backtest(source,{...s.params,strategy:s.kind,pipSize:.0001}),b=e.runStrategyBacktest('EURUSD',input,s,iso(700));assert.equal(b.reason,null);assert.equal(b.result.trades.length,a.trades.length);assert.equal(Date.parse(b.result.trades[0].entryDate),Date.parse(a.trades[0].entryDate)+DAY);near(b.result.trades[0].R,a.trades[0].R);
});
test('saved hourly strategies never silently execute on daily bars and news needs a real calendar',()=>{
  const input={bars:bars(),calendarAvailable:false};assert.match(e.runStrategyBacktest('EURUSD',input,{...strategy,timeframe:'H1'},iso(700)).reason,/Exact H1/);assert.match(e.runStrategyBacktest('EURUSD',input,e.DEFAULT_STRATEGIES[2],iso(700)).reason,/real confirmed/);
});
test('trade plan snaps to actual broker ticks and floors volume without guessed conversion',()=>{
  const source=bars(60);source[59]={time:iso(59),open:103,high:121,low:102,close:120};const asOf=iso(60),s={...strategy,params:{...strategy.params,lookback:5,atrPeriod:3,riskPct:1,stopS:2,targetTP:4}},broker={symbol:'EURUSD',brokerSymbol:'EURUSD.pro',tickSize:.25,tickValueLoss:2.5,volumeMin:.01,volumeMax:100,volumeStep:.01,digits:2,stopLevel:10,accountCurrency:'USD',asOf,bid:120,ask:120.1},input={symbol:'EURUSD',asOf,state:e.computeRegime(source,asOf),bars:source,strategy:s,accountEquity:10000,broker};
  const plan=e.computeTradePlan(input);assert.equal(plan.available,true);assert.equal(plan.signal,'long');near(plan.stop/.25,Math.round(plan.stop/.25));near(plan.target/.25,Math.round(plan.target/.25));near(plan.stopDistance,plan.entry-plan.stop);assert.ok(plan.lots*(plan.stopDistance/.25)*2.5<=100+1e-9);assert.ok((plan.lots+.01)*(plan.stopDistance/.25)*2.5>100);
  assert.equal(e.computeTradePlan({...input,broker:undefined}).lots,null);assert.equal(e.computeTradePlan({...input,broker:{...broker,asOf:iso(59)}}).available,false);assert.equal(e.computeTradePlan({...input,broker:{...broker,stopLevel:NaN}}).available,false);
  const closePlan=e.computeTradePlan({...input,strategy:{...s,params:{...s.params,mode:'close'}}});assert.equal(closePlan.available,true);assert.notEqual(closePlan.stopDistance,plan.stopDistance);
});
test('whole historical snapshot ignores future bars, future quotes and future COT changes',()=>{
  const source=bars(),asOf=iso(550),input={asOf,watchlist:['EURUSD'],markets:{EURUSD:{bars:source,calendarAvailable:false,source:'Synthetic test fixture'}},strategies:[strategy]},base=e.buildSnapshot(input),future=source.map((b,i)=>i<550?b:{...b,open:b.open*1.7,high:b.high*1.7,low:b.low*1.7,close:b.close*1.7});
  const changed=e.buildSnapshot({...input,markets:{EURUSD:{...input.markets.EURUSD,bars:future,quote:{price:9999,asOf:iso(551)}}}});assert.deepEqual(changed,base);assert.equal(base.mood.value,null);assert.equal(base.markets[0].fits[0].parts.find(p=>p.id==='positioning').points,null);
});
test('coarse hourly event data never turns a rounded two-hour move into a claimed sixty-minute observation',()=>{
  const start=Date.UTC(2020,0,10),intra=Array.from({length:72},(_,i)=>({time:start+i*3600000,close:100+i})),release={time:start+13.5*3600000,name:'CPI',type:'CPI',currency:'USD',impact:'high'},moves=e.eventMoves('EURUSD',bars(20),intra,[release],iso(20));assert.equal(moves[0].basis,'daily-close');
  const exact={...release,time:start+13*3600000},valid=e.eventMoves('EURUSD',bars(20),intra,[exact],iso(20));assert.equal(valid[0].basis,'intraday-60m');near(valid[0].averageAbsoluteMove,113/112-1);
});
test('mood excludes old sessions and trade plan cannot validate stale candles with a new quote',()=>{
  const assets=['USDJPY','USDCHF','XAUUSD','AUDUSD','SPX500'].map(symbol=>({symbol,state:{atr:value(1),close:value(100)},returns:[{date:iso(1).slice(0,10),return:.01}]}));assert.equal(e.marketMood(assets,[{date:iso(19),close:20,availableAt:iso(20)}],iso(21)).value,null);
  const source=bars(60),result=e.computeTradePlan({symbol:'EURUSD',asOf:iso(70),state:e.computeRegime(source,iso(70)),bars:source,strategy,accountEquity:10000});assert.match(result.reason,/stale/);
});
test('live correlation warnings reuse only matching 20-session cached coefficients and preserve direction',()=>{
  const returns=Array.from({length:20},(_,i)=>({date:iso(i).slice(0,10),return:Math.sin(i)*.01})),positions=[{id:'a',symbol:'EURUSD',side:'buy',riskToStop:100},{id:'b',symbol:'USDCHF',side:'sell',riskToStop:150}],a={symbol:'EURUSD',returns,correlations:[{symbol:'USDCHF',value:-.9,observations:20}]},b={symbol:'USDCHF',returns,correlations:[]};
  const cached=e.correlationRisk(positions,[a,b]);assert.equal(cached.length,1);near(cached[0].signedCorrelation,.9);assert.equal(cached[0].observations,20);
  assert.equal(e.correlationRisk(positions,[{...a,correlations:[{symbol:'USDCHF',value:-.9,observations:60}]},b]).length,0);
  const same=e.correlationRisk([{id:'a',symbol:'EURUSD',side:'buy',riskToStop:100},{id:'b',symbol:'EURUSD',side:'buy',riskToStop:100}],[a]);assert.equal(same.length,1);near(same[0].signedCorrelation,1);
  assert.equal(e.correlationRisk(positions.map(p=>({...p,symbol:'EURUSD',side:'buy'})),[{...a,returns:returns.map(r=>({...r,return:0}))}]).length,0);
});
test('imported return-only strategies never inherit a fictitious executable breakout plan',()=>{
  const source=bars(60),asOf=iso(60),plan=e.computeTradePlan({symbol:'EURUSD',asOf,state:e.computeRegime(source,asOf),bars:source,strategy:{id:'imported',name:'Imported returns',kind:'breakout',params:{},returns:[{date:iso(1),return:.01}]},accountEquity:10000});assert.equal(plan.available,false);assert.equal(plan.model,null);assert.equal(plan.riskPct,null);assert.equal(plan.riskAmount,null);assert.equal(plan.stopDistance,null);assert.equal(plan.entry,null);assert.match(plan.reason,/return-only/);
});
