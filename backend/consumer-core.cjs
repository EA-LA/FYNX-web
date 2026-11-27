'use strict';
const PRODUCTS=['analytics','risk','scenarios','review','export','watchlist','portfolio','simulation'];
const PLANS={starter:{name:'Essential',cents:599,products:PRODUCTS.slice(0,6),saved:25},plus:{name:'Plus',cents:1099,products:PRODUCTS.slice(0,7),saved:100},pro:{name:'Professional',cents:3099,products:PRODUCTS,saved:500}};
// Accept actual decimal financial inputs, never JavaScript coercions of blanks, booleans or arrays.
function decimalValue(v){const decimal=typeof v==='number'||(typeof v==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v.trim()));return decimal?Number(v):NaN;}
function number(v,name,min=0,max=1e9){const n=decimalValue(v);if(!Number.isFinite(n)||n<min||n>max)throw Error(`${name} must be between ${min} and ${max}.`);return n;}
function label(v,max=120){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Enter a valid name.');return v.trim();}
function analytics(trades){
 const values=trades.map(t=>decimalValue(t?.pl)).filter(Number.isFinite);
 let equity=0,peak=0,drawdown=0,winStreak=0,lossStreak=0,longestWinStreak=0,longestLossStreak=0;
 const curve=values.map(pl=>{
  equity+=pl;peak=Math.max(peak,equity);drawdown=Math.max(drawdown,peak-equity);
  winStreak=pl>0?winStreak+1:0;lossStreak=pl<0?lossStreak+1:0;
  longestWinStreak=Math.max(longestWinStreak,winStreak);longestLossStreak=Math.max(longestLossStreak,lossStreak);
  return equity;
 });
 const wins=values.filter(x=>x>0),losses=values.filter(x=>x<0),grossWin=wins.reduce((a,b)=>a+b,0),grossLoss=-losses.reduce((a,b)=>a+b,0);
 const averageWin=wins.length&&Number.isFinite(grossWin)?grossWin/wins.length:null;
 const averageLoss=losses.length&&Number.isFinite(grossLoss)?-grossLoss/losses.length:null;
 const payoffRatio=averageWin!==null&&averageLoss<0?averageWin/-averageLoss:null;
 // The callable supplies dated history oldest-first; exclude invalid P/L before taking the recent sample.
 const recent=values.slice(-20),recentTrades=recent.length;
 const recentWinRate=recentTrades?Number((recent.filter(pl=>pl>0).length*100/recentTrades).toFixed(1))+'%':null;
 const recentNetPL=recentTrades?recent.reduce((sum,pl)=>sum+pl,0):null;
 return {trades:values.length,netPL:equity,winRate:values.length?wins.length/values.length*100:0,expectancy:values.length?equity/values.length:0,profitFactor:grossLoss?grossWin/grossLoss:null,averageWin,averageLoss,payoffRatio:Number.isFinite(payoffRatio)?payoffRatio:null,maxDrawdown:drawdown,longestWinStreak,longestLossStreak,recentTrades,recentWinRate,recentNetPL,curve,notice:'Based on recorded realized P/L, in account currency. No starting balance or deposits are assumed. A break-even trade ends a streak. Recent metrics cover up to the last 20 dated trades with valid realized P/L. Payoff ratio is the average win divided by the size of the average loss and requires at least one of each.'+(values.length<trades.length?' Records with invalid realized P/L were omitted.':'')};
}
const MAX_RISK_PCT=100;
// Validate the customer's base risk before applying an internal scenario multiplier.
function risk(d,scenarioFactor=1){const balance=number(d.balance,'Balance',1),riskPct=Math.min(MAX_RISK_PCT,number(d.riskPct,'Risk percent',0.01,MAX_RISK_PCT)*scenarioFactor),entry=number(d.entry,'Entry',0.000001),stop=number(d.stop,'Stop',0.000001),target=number(d.target,'Target',0.000001),multiplier=number(d.multiplier??1,'Contract multiplier',0.000001),rate=number(d.rate??1,'Quote-to-account rate',0.000001);if(entry===stop||(entry-stop)*(target-entry)<=0)throw Error('Stop and target must lie on opposite sides of entry.');const budget=balance*riskPct/100,perUnit=Math.abs(entry-stop)*multiplier*rate,units=Math.floor(budget/perUnit*1e6)/1e6;return {riskBudget:budget,units,lossAtStop:units*perUnit,profitAtTarget:units*Math.abs(target-entry)*multiplier*rate,rewardRisk:Math.abs(target-entry)/Math.abs(entry-stop),notice:'Model only. Units use your contract multiplier and conversion rate. Fees, slippage and broker lot increments are excluded.'+(units===0?' No position can be modeled at the tool’s six-decimal unit precision. The calculated risk budget is unused.':'')};}
// With constant modeled wins and losses, L/(L+W) is the zero-expectancy win rate.
function breakEvenWinRate(rewardRisk){
 const pct=Number((100/(1+rewardRisk)).toFixed(3));
 if(pct===0)return '<0.001%';
 if(pct===100)return '>99.999%';
 return pct+'%';
}
const breakEvenNotice='Break-even win rate is a modeled threshold before fees and slippage, not a forecast.';
function csv(trades){
 const safe=(value,isRealizedPL=false)=>{
  const text=String(value??'');
  // Use the same decimal validation as Journal Intelligence, including signed losses.
  const numericPL=isRealizedPL?decimalValue(value):NaN;
  if(Number.isFinite(numericPL))return '"'+String(numericPL)+'"';
  // Preserve malformed nonblank P/L as text rather than exporting a fabricated number.
  // Quoting alone does not neutralize formulas hidden behind whitespace, BOM or controls.
  const neutralized=(isRealizedPL&&text.trim()!==''||/^[\s\u0000-\u001f\u007f\u200b\u2060\ufeff]*[=+\-@]/u.test(text))?"'"+text:text;
  return '"'+neutralized.replace(/"/g,'""')+'"';
 };
 return {csv:'Date,Symbol,Session,Realized P/L,Notes\r\n'+trades.map(t=>[t.date,t.symbol,t.session,t.pl,t.notes].map((v,i)=>safe(v,i===3)).join(',')).join('\r\n'),rows:trades.length};
}
function run(product,d={},trades=[]){
 if(product==='analytics')return analytics(trades);
 if(product==='export')return csv(trades);
 if(product==='risk'){const result=risk(d);return {...result,breakEvenWinRate:breakEvenWinRate(result.rewardRisk),notice:result.notice+' '+breakEvenNotice};}
 if(product==='scenarios'){
  const base=risk(d),multipliers=[0.5,1,1.5,2];
  // base validates the decimal input before checking which requested multipliers exceed the cap.
  const capped=multipliers.filter(f=>Number(d.riskPct)*f>MAX_RISK_PCT).map(f=>f+'×');
  const scope=capped.length===1?'scenario was':'scenarios were';
  const capNotice=capped.length?' The '+capped.join(' and ')+' '+scope+' capped at '+MAX_RISK_PCT+'% of account balance. Risk Multiplier shows the requested multiplier.':'';
  const scenarios=multipliers.map(f=>({riskMultiplier:f,...risk(d,f)}));
  const zeroUnits=scenarios.filter(row=>row.units===0).map(row=>row.riskMultiplier+'×');
  const zeroNotice=zeroUnits.length?' At the tool’s six-decimal unit precision, the '+zeroUnits.join(', ')+(zeroUnits.length===1?' scenario has zero units; its calculated risk budget is unused.':' scenarios have zero units; their calculated risk budgets are unused.'):'';
  return {base,scenarios,breakEvenWinRate:breakEvenWinRate(base.rewardRisk),notice:breakEvenNotice+' Changing position size does not change this threshold.'+capNotice+zeroNotice};
 }
 if(product==='review'){
  const value=d.notes;
  if(value!==undefined&&typeof value!=='string')throw Error('Trade Review notes must be text.');
  const notes=value?.trim()||'';
  if(notes&&value.length>2000)throw Error('Trade Review notes must be 2,000 characters or fewer. Shorten your note before running or saving.');
  const preparation=['plan','risk','event'],followThrough=['execution','review'];
  const checks=[...preparation,...followThrough];
  const completed=checks.filter(k=>d[k]===true),missing=checks.filter(k=>d[k]!==true);
  const phase=keys=>keys.filter(k=>d[k]===true).length+' of '+keys.length+' complete';
  const nextItem={plan:'Define the entry plan',risk:'Check the risk budget',event:'Check scheduled events',execution:'Review whether execution followed the plan',review:'Record the outcome and lesson'};
  return {notes,completed,missing,score:completed.length*20,preTradePreparation:phase(preparation),tradeFollowThrough:phase(followThrough),nextUncheckedItem:missing.length?nextItem[missing[0]]:'All checklist items complete',notice:'Self-assessment of your trading process, not a performance rating.'};
 }
 if(product==='watchlist'){if(!Array.isArray(d.symbols)||d.symbols.length<1||d.symbols.length>30)throw Error('Add 1–30 symbols.');const notes=typeof d.notes==='string'?d.notes:'';if(notes.length>2000)throw Error('Research notes must be 2,000 characters or fewer.');return {symbols:[...new Set(d.symbols.map(s=>label(s,30).toUpperCase()))],notes,notice:'A saved research list. Prices are not supplied by this tool.'};}
 if(product==='portfolio'){const balance=number(d.balance,'Balance',1),shock=number(d.shock,'Shock percent',-100,100);if(!Array.isArray(d.positions)||!d.positions.length||d.positions.length>30)throw Error('Enter 1–30 positions.');const rows=d.positions.map(p=>{const value=number(p.value,'Signed position value',-1e9,1e9);return {symbol:label(p.symbol,30),value,scenarioPL:value*shock/100};});const grossExposure=rows.reduce((a,p)=>a+Math.abs(p.value),0),netExposure=rows.reduce((a,p)=>a+p.value,0),scenarioPL=rows.reduce((a,p)=>a+p.scenarioPL,0);return {rows,grossExposure,netExposure,scenarioPL,scenarioEquity:balance+scenarioPL,grossLeverage:grossExposure/balance,notice:'Parallel price-shock model. Enter signed notionals in one account currency. Not VaR; ignores correlations, options nonlinearity, fees and liquidation.'};}
 if(product==='simulation'){const balance=number(d.balance,'Balance',1),riskPct=number(d.riskPct,'Risk percent',0.01,20),winRate=number(d.winRate,'Win rate',0,100)/100,rewardRisk=number(d.rewardRisk,'Reward/risk',0.01,20),count=number(d.trades,'Trades',1,500);if(!Number.isInteger(count))throw Error('Trades per path must be a whole number between 1 and 500.');let seed=123456789;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const end=[],drawdowns=[];let representative=[];for(let p=0;p<500;p++){let eq=balance,peak=balance,dd=0;const curve=[eq];for(let i=0;i<count;i++){eq*=1+(random()<winRate?rewardRisk:-1)*riskPct/100;if(!Number.isFinite(eq))throw Error('These assumptions exceed the simulation range. Reduce the trade count, risk or payoff.');peak=Math.max(peak,eq);dd=Math.max(dd,(peak-eq)/peak*100);curve.push(eq);}end.push(eq);drawdowns.push(dd);if(p===0)representative=curve;}end.sort((a,b)=>a-b);drawdowns.sort((a,b)=>a-b);
  // Allow a tiny floating-point tolerance at an exact threshold.
  const reached=threshold=>(100*drawdowns.filter(dd=>dd>=threshold-1e-9).length/drawdowns.length)+'%';
  return {paths:500,endingEquityP10:end[49],endingEquityMedian:end[249]+(end[250]-end[249])/2,endingEquityP90:end[449],drawdownP90:drawdowns[449],lossFrequency:end.filter(v=>v<balance).length/5,pathsReachingTenPercentDrawdown:reached(10),pathsReachingTwentyPercentDrawdown:reached(20),curve:representative,notice:'Hypothetical fixed-fractional simulation with independent trades and your assumed win rate/payoff. No fees or slippage; not a forecast. Fixed seed makes comparisons repeatable. Drawdown thresholds count paths that reached or exceeded the stated peak-to-trough loss at any point, even if they recovered.'};
 }
 throw Error('Unknown product.');
}
function planForSubscription(sub,uid){if(!sub||sub.status!=='active'||sub.livemode!==false||sub.metadata?.product!=='fynx_consumer_test'||sub.metadata?.fynx_uid!==uid)return null;const tier=sub.metadata.tier,p=Object.hasOwn(PLANS,tier)?PLANS[tier]:null,item=sub.items?.data?.[0];return p&&sub.items.data.length===1&&item.quantity===1&&item.price?.currency==='usd'&&item.price.unit_amount===p.cents&&item.price.recurring?.interval==='month'&&item.price.recurring?.interval_count===1?tier:null;}
module.exports={PLANS,PRODUCTS,run,planForSubscription};
