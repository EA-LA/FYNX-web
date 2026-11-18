'use strict';
// FYNX API 6 (technical indicators and screening) and API 8 (portfolio analytics).
// Both operate only on caller-supplied data, so no market-data license is involved.
const Decimal=require('decimal.js').clone({precision:40,rounding:4});
const {InputError}=require('./developer-engine.cjs');
const invalid=(m,c='invalid_input')=>{throw new InputError(m,c);};
const ZERO=new Decimal(0),ONE=new Decimal(1),HUNDRED=new Decimal(100);
const MAX_POINTS=2000,MAX_TRADES=1000,MAX_POSITIONS=500,MAX_SERIES=50,MAX_CONDITIONS=10;

function num(v,name,{positive=false,nonNegative=false}={}){
 let d;
 if(typeof v==='number'&&Number.isFinite(v))d=new Decimal(v);
 else if(typeof v==='string'&&/^[-+]?\d{1,18}(\.\d{1,12})?$/.test(v))d=new Decimal(v);
 else invalid(`${name} must be a finite number or decimal string.`);
 if(positive&&!d.gt(0))invalid(`${name} must be positive.`);
 if(nonNegative&&d.lt(0))invalid(`${name} cannot be negative.`);
 return d;
}
function int(v,name,min,max,fallback){
 if(v===undefined||v===null)return fallback;
 if(!Number.isInteger(v)||v<min||v>max)invalid(`${name} must be a whole number from ${min} to ${max}.`);
 return v;
}
function places(x){return int(x.decimals,'decimals',0,12,8);}
const fmt=(d,dp)=>d===null||d===undefined?null:d.toDecimalPlaces(dp).toFixed();
function series(x,name='values',min=1){
 const v=x[name];
 if(!Array.isArray(v)||v.length<min||v.length>MAX_POINTS)invalid(`${name} must be an array of ${min} to ${MAX_POINTS} numbers.`);
 return v.map((n,i)=>num(n,`${name}[${i}]`));
}
function candles(x,min=1){
 const v=x.candles;
 if(!Array.isArray(v)||v.length<min||v.length>MAX_POINTS)invalid(`candles must be an array of ${min} to ${MAX_POINTS} objects.`);
 return v.map((c,i)=>{
  if(!c||typeof c!=='object'||Array.isArray(c))invalid(`candles[${i}] must be an object.`);
  const high=num(c.high,`candles[${i}].high`),low=num(c.low,`candles[${i}].low`),close=num(c.close,`candles[${i}].close`);
  if(high.lt(low))invalid(`candles[${i}] has high below low.`);
  if(close.gt(high)||close.lt(low))invalid(`candles[${i}].close must be between low and high.`);
  const out={high,low,close};
  if(c.volume!==undefined)out.volume=num(c.volume,`candles[${i}].volume`,{nonNegative:true});
  return out;
 });
}

// ---- Core indicator math (Decimal arrays in, Decimal|null arrays out) ----
function sma(v,p){const out=Array(v.length).fill(null);let sum=ZERO;for(let i=0;i<v.length;i++){sum=sum.plus(v[i]);if(i>=p)sum=sum.minus(v[i-p]);if(i>=p-1)out[i]=sum.div(p);}return out;}
// EMA seeded with the SMA of the first `p` values (the common charting convention).
function ema(v,p,start=0){
 const out=Array(v.length).fill(null),k=new Decimal(2).div(p+1);
 if(v.length-start<p)return out;
 let prev=v.slice(start,start+p).reduce((a,b)=>a.plus(b),ZERO).div(p);out[start+p-1]=prev;
 for(let i=start+p;i<v.length;i++){prev=v[i].minus(prev).mul(k).plus(prev);out[i]=prev;}
 return out;
}
// Wilder's smoothing (RMA), seeded with a simple average.
function rma(v,p,start=0){
 const out=Array(v.length).fill(null);if(v.length-start<p)return out;
 let prev=v.slice(start,start+p).reduce((a,b)=>a.plus(b),ZERO).div(p);out[start+p-1]=prev;
 for(let i=start+p;i<v.length;i++){prev=prev.mul(p-1).plus(v[i]).div(p);out[i]=prev;}
 return out;
}
function rsi(v,p){
 const out=Array(v.length).fill(null);if(v.length<=p)return out;
 const gains=[ZERO],losses=[ZERO];
 for(let i=1;i<v.length;i++){const d=v[i].minus(v[i-1]);gains.push(d.gt(0)?d:ZERO);losses.push(d.lt(0)?d.neg():ZERO);}
 const g=rma(gains,p,1),l=rma(losses,p,1);
 for(let i=p;i<v.length;i++){if(l[i].isZero())out[i]=g[i].isZero()?new Decimal(50):HUNDRED;else out[i]=HUNDRED.minus(HUNDRED.div(ONE.plus(g[i].div(l[i]))));}
 return out;
}
function macd(v,fast,slow,signal){
 const f=ema(v,fast),s=ema(v,slow),line=v.map((_,i)=>f[i]&&s[i]?f[i].minus(s[i]):null);
 const first=line.findIndex(x=>x!==null),sig=first<0?Array(v.length).fill(null):ema(line.map(x=>x||ZERO),signal,first);
 return {macd:line,signal:sig,histogram:line.map((x,i)=>x&&sig[i]?x.minus(sig[i]):null)};
}
function stdev(v,i,p,mean){let s=ZERO;for(let j=i-p+1;j<=i;j++)s=s.plus(v[j].minus(mean).pow(2));return s.div(p).sqrt();}
function bollinger(v,p,k){
 const mid=sma(v,p),upper=Array(v.length).fill(null),lower=Array(v.length).fill(null),width=Array(v.length).fill(null);
 for(let i=p-1;i<v.length;i++){const sd=stdev(v,i,p,mid[i]);upper[i]=mid[i].plus(sd.mul(k));lower[i]=mid[i].minus(sd.mul(k));width[i]=mid[i].isZero()?null:upper[i].minus(lower[i]).div(mid[i]);}
 return {middle:mid,upper,lower,bandwidth:width};
}
function trueRange(c){return c.map((x,i)=>i===0?x.high.minus(x.low):Decimal.max(x.high.minus(x.low),x.high.minus(c[i-1].close).abs(),x.low.minus(c[i-1].close).abs()));}
function stochastic(c,kp,dp,smooth){
 const raw=Array(c.length).fill(null);
 for(let i=kp-1;i<c.length;i++){let hh=c[i].high,ll=c[i].low;for(let j=i-kp+1;j<i;j++){hh=Decimal.max(hh,c[j].high);ll=Decimal.min(ll,c[j].low);}raw[i]=hh.eq(ll)?new Decimal(50):c[i].close.minus(ll).div(hh.minus(ll)).mul(HUNDRED);}
 const smoothNulls=(v,p)=>{const out=Array(v.length).fill(null),first=v.findIndex(x=>x!==null);if(first<0)return out;const s=sma(v.slice(first),p);s.forEach((x,i)=>{out[first+i]=x;});return out;};
 const k=smooth>1?smoothNulls(raw,smooth):raw;
 return {k,d:smoothNulls(k,dp)};
}

const INDICATORS=['sma','ema','rsi','macd','bollinger','atr','stochastic','vwap','screen'];
function indicator(name,x){
 if(!x||typeof x!=='object')invalid('Send a JSON object.');
 const dp=places(x),pack=a=>a.map(d=>fmt(d,dp)),last=a=>{for(let i=a.length-1;i>=0;i--)if(a[i]!==null)return fmt(a[i],dp);return null;};
 const result=(extra,arrays)=>{const out={indicator:name,...extra,count:arrays[Object.keys(arrays)[0]].length,latest:{},data_basis:'caller_supplied'};for(const [k,a] of Object.entries(arrays)){out[k]=pack(a);out.latest[k]=last(a);}if(Object.values(out.latest).every(v=>v===null))out.warnings=['insufficient_data_for_period'];else out.warnings=[];return out;};
 if(name==='sma'||name==='ema'){const p=int(x.period,'period',1,500,20),v=series(x);return result({period:p},{values:name==='sma'?sma(v,p):ema(v,p)});}
 if(name==='rsi'){const p=int(x.period,'period',2,500,14),v=series(x);return result({period:p,method:'wilder'},{values:rsi(v,p)});}
 if(name==='macd'){const f=int(x.fast_period,'fast_period',1,500,12),s=int(x.slow_period,'slow_period',2,500,26),g=int(x.signal_period,'signal_period',1,500,9);if(f>=s)invalid('fast_period must be smaller than slow_period.');return result({fast_period:f,slow_period:s,signal_period:g},macd(series(x),f,s,g));}
 if(name==='bollinger'){const p=int(x.period,'period',2,500,20),k=x.std_dev===undefined?new Decimal(2):num(x.std_dev,'std_dev',{positive:true});return result({period:p,std_dev:k.toFixed(),deviation:'population'},bollinger(series(x),p,k));}
 if(name==='atr'){const p=int(x.period,'period',1,500,14),c=candles(x);return result({period:p,method:'wilder'},{values:rma(trueRange(c),p)});}
 if(name==='stochastic'){const kp=int(x.k_period,'k_period',1,500,14),d=int(x.d_period,'d_period',1,500,3),sm=int(x.smooth,'smooth',1,50,1);return result({k_period:kp,d_period:d,smooth:sm},stochastic(candles(x),kp,d,sm));}
 if(name==='vwap'){
  const c=candles(x);if(c.some(k=>!k.volume))invalid('vwap needs a volume on every candle.');
  let pv=ZERO,vol=ZERO;const out=c.map(k=>{pv=pv.plus(k.high.plus(k.low).plus(k.close).div(3).mul(k.volume));vol=vol.plus(k.volume);return vol.isZero()?null:pv.div(vol);});
  return result({price_basis:'typical_price',anchor:'first_candle'},{values:out});
 }
 if(name==='screen')return screen(x,dp);
 invalid('Indicator not found. Use one of: '+INDICATORS.join(', ')+'.','not_found');
}

// Screening: evaluate up to 10 conditions on the latest bar of up to 50 caller-supplied series.
const OPERATORS=['<','<=','>','>=','crosses_above','crosses_below'];
function operand(spec,v,name){
 if(!spec||typeof spec!=='object'||Array.isArray(spec))invalid(`${name} must be an object such as {"indicator":"rsi","period":14}.`);
 const kind=spec.indicator;
 if(kind==='close')return v;
 if(kind==='change_percent'){const n=int(spec.lookback,`${name}.lookback`,1,500,1);return v.map((x,i)=>i<n||v[i-n].isZero()?null:x.minus(v[i-n]).div(v[i-n]).mul(HUNDRED));}
 const p=int(spec.period,`${name}.period`,kind==='rsi'?2:1,500,kind==='rsi'?14:20);
 if(kind==='sma')return sma(v,p);if(kind==='ema')return ema(v,p);if(kind==='rsi')return rsi(v,p);
 invalid(`${name}.indicator must be close, change_percent, sma, ema or rsi.`);
}
function screen(x,dp){
 if(!Array.isArray(x.series)||x.series.length<1||x.series.length>MAX_SERIES)invalid(`series must be an array of 1 to ${MAX_SERIES} items.`);
 if(!Array.isArray(x.conditions)||x.conditions.length<1||x.conditions.length>MAX_CONDITIONS)invalid(`conditions must be an array of 1 to ${MAX_CONDITIONS} items.`);
 const mode=x.match===undefined?'all':x.match;if(!['all','any'].includes(mode))invalid('match must be all or any.');
 const seen=new Set();
 const results=x.series.map((s,si)=>{
  if(!s||typeof s.symbol!=='string'||!/^[A-Za-z0-9._:/-]{1,30}$/.test(s.symbol))invalid(`series[${si}].symbol is required.`);
  if(seen.has(s.symbol))invalid(`Duplicate symbol ${s.symbol}.`);seen.add(s.symbol);
  const v=series(s,'values',2);
  const checks=x.conditions.map((c,ci)=>{
   const name=`conditions[${ci}]`;if(!OPERATORS.includes(c?.operator))invalid(`${name}.operator must be one of ${OPERATORS.join(', ')}.`);
   const left=operand(c.left,v,`${name}.left`);
   const right=c.right!==undefined?operand(c.right,v,`${name}.right`):c.value!==undefined?v.map(()=>num(c.value,`${name}.value`)):invalid(`${name} needs right or value.`);
   const n=v.length-1,a=left[n],b=right[n];
   if(a===null||b===null)return {condition:ci,passed:false,left:fmt(a,dp),right:fmt(b,dp),reason:'insufficient_data'};
   let passed;
   if(c.operator.startsWith('crosses')){const pa=left[n-1],pb=right[n-1];if(pa===null||pb===null)return {condition:ci,passed:false,left:fmt(a,dp),right:fmt(b,dp),reason:'insufficient_data'};passed=c.operator==='crosses_above'?pa.lte(pb)&&a.gt(b):pa.gte(pb)&&a.lt(b);}
   else passed={'<':a.lt(b),'<=':a.lte(b),'>':a.gt(b),'>=':a.gte(b)}[c.operator];
   return {condition:ci,passed,left:fmt(a,dp),right:fmt(b,dp)};
  });
  return {symbol:s.symbol,matched:mode==='all'?checks.every(c=>c.passed):checks.some(c=>c.passed),last_close:fmt(v[v.length-1],dp),checks};
 });
 return {indicator:'screen',match:mode,matches:results.filter(r=>r.matched).map(r=>r.symbol),results,evaluated_bar:'latest',data_basis:'caller_supplied'};
}

// ---- API 8: portfolio analytics ----
const PORTFOLIO=['performance','drawdown','exposure'];
function portfolio(name,x){
 if(!x||typeof x!=='object')invalid('Send a JSON object.');
 const dp=int(x.decimals,'decimals',0,12,2);
 if(name==='performance')return performance(x,dp);
 if(name==='drawdown')return drawdown(x,dp);
 if(name==='exposure')return exposure(x,dp);
 invalid('Portfolio endpoint not found. Use one of: '+PORTFOLIO.join(', ')+'.','not_found');
}
function performance(x,dp){
 if(!Array.isArray(x.trades)||x.trades.length<1||x.trades.length>MAX_TRADES)invalid(`trades must be an array of 1 to ${MAX_TRADES} items.`);
 const t=x.trades.map((tr,i)=>{if(!tr||typeof tr!=='object')invalid(`trades[${i}] must be an object.`);return {pnl:num(tr.pnl,`trades[${i}].pnl`),r:tr.r_multiple===undefined?null:num(tr.r_multiple,`trades[${i}].r_multiple`)};});
 const wins=t.filter(z=>z.pnl.gt(0)),losses=t.filter(z=>z.pnl.lt(0)),sum=a=>a.reduce((s,z)=>s.plus(z.pnl),ZERO);
 const gp=sum(wins),gl=sum(losses).abs(),net=gp.minus(gl),n=t.length;
 let cw=0,cl=0,mw=0,ml=0;for(const z of t){if(z.pnl.gt(0)){cw++;cl=0;}else if(z.pnl.lt(0)){cl++;cw=0;}else{cw=0;cl=0;}mw=Math.max(mw,cw);ml=Math.max(ml,cl);}
 const avgWin=wins.length?gp.div(wins.length):null,avgLoss=losses.length?gl.div(losses.length):null;
 const rs=t.filter(z=>z.r!==null);
 const out={trades:n,wins:wins.length,losses:losses.length,breakeven:n-wins.length-losses.length,win_rate_percent:fmt(new Decimal(wins.length).div(n).mul(HUNDRED),dp),net_pnl:fmt(net,dp),gross_profit:fmt(gp,dp),gross_loss:fmt(gl,dp),profit_factor:gl.isZero()?null:fmt(gp.div(gl),dp),average_win:fmt(avgWin,dp),average_loss:fmt(avgLoss,dp),payoff_ratio:avgWin&&avgLoss?fmt(avgWin.div(avgLoss),dp):null,expectancy_per_trade:fmt(net.div(n),dp),largest_win:wins.length?fmt(Decimal.max(...wins.map(z=>z.pnl)),dp):null,largest_loss:losses.length?fmt(Decimal.min(...losses.map(z=>z.pnl)),dp):null,max_consecutive_wins:mw,max_consecutive_losses:ml,average_r:rs.length?fmt(rs.reduce((s,z)=>s.plus(z.r),ZERO).div(rs.length),dp):null,data_basis:'caller_supplied'};
 if(x.starting_balance!==undefined){const b=num(x.starting_balance,'starting_balance',{positive:true});out.ending_balance=fmt(b.plus(net),dp);out.return_percent=fmt(net.div(b).mul(HUNDRED),dp);}
 out.warnings=gl.isZero()?['profit_factor_undefined_without_losses']:[];
 return out;
}
function drawdown(x,dp){
 const raw=x.equity;
 if(!Array.isArray(raw)||raw.length<2||raw.length>MAX_POINTS)invalid(`equity must be an array of 2 to ${MAX_POINTS} points.`);
 const pts=raw.map((p,i)=>{const obj=p&&typeof p==='object'&&!Array.isArray(p);const v=num(obj?p.value:p,`equity[${i}]${obj?'.value':''}`,{positive:true});let ts=null;if(obj&&p.timestamp!==undefined){if(typeof p.timestamp!=='string'||!Number.isFinite(Date.parse(p.timestamp)))invalid(`equity[${i}].timestamp must be an ISO 8601 date.`);ts=p.timestamp;}return {v,ts};});
 const label=i=>pts[i].ts??i;
 let peak=0,maxDd=ZERO,maxPct=ZERO,mPeak=0,mTrough=0,longest=0,start=null;
 for(let i=1;i<pts.length;i++){
  if(pts[i].v.gte(pts[peak].v)){if(start!==null)longest=Math.max(longest,i-start);start=null;peak=i;continue;}
  if(start===null)start=peak;
  const dd=pts[peak].v.minus(pts[i].v),pct=dd.div(pts[peak].v).mul(HUNDRED);
  if(pct.gt(maxPct)){maxPct=pct;maxDd=dd;mPeak=peak;mTrough=i;}
 }
 const underwater=start!==null;if(underwater)longest=Math.max(longest,pts.length-1-start);
 let recovered=null;for(let i=mTrough+1;i<pts.length&&maxDd.gt(0);i++)if(pts[i].v.gte(pts[mPeak].v)){recovered=i;break;}
 const first=pts[0].v,lastV=pts[pts.length-1].v,cur=pts[peak].v.minus(lastV);
 const out={points:pts.length,start_value:fmt(first,dp),end_value:fmt(lastV,dp),total_return_percent:fmt(lastV.minus(first).div(first).mul(HUNDRED),dp),max_drawdown:fmt(maxDd,dp),max_drawdown_percent:fmt(maxPct,dp),max_drawdown_peak:maxDd.gt(0)?label(mPeak):null,max_drawdown_trough:maxDd.gt(0)?label(mTrough):null,max_drawdown_recovered_at:recovered===null?null:label(recovered),current_drawdown:fmt(cur,dp),current_drawdown_percent:fmt(cur.div(pts[peak].v).mul(HUNDRED),dp),longest_drawdown_periods:longest,return_to_max_drawdown:maxPct.isZero()?null:fmt(lastV.minus(first).div(first).mul(HUNDRED).div(maxPct),dp),data_basis:'caller_supplied',warnings:[]};
 if(x.periods_per_year!==undefined){
  const ppy=int(x.periods_per_year,'periods_per_year',1,525600),rf=x.risk_free_rate_percent===undefined?ZERO:num(x.risk_free_rate_percent,'risk_free_rate_percent').div(100).div(ppy);
  const r=pts.slice(1).map((p,i)=>p.v.div(pts[i].v).minus(1)),n=r.length,mean=r.reduce((a,b)=>a.plus(b),ZERO).div(n);
  const variance=n>1?r.reduce((a,b)=>a.plus(b.minus(mean).pow(2)),ZERO).div(n-1):ZERO,sd=variance.sqrt(),down=r.reduce((a,b)=>a.plus(Decimal.min(ZERO,b.minus(rf)).pow(2)),ZERO).div(n).sqrt(),ann=new Decimal(ppy).sqrt();
  Object.assign(out,{periods_per_year:ppy,mean_period_return_percent:fmt(mean.mul(HUNDRED),dp+2),annualized_volatility_percent:fmt(sd.mul(ann).mul(HUNDRED),dp),sharpe_ratio:sd.isZero()?null:fmt(mean.minus(rf).div(sd).mul(ann),dp),sortino_ratio:down.isZero()?null:fmt(mean.minus(rf).div(down).mul(ann),dp)});
  if(n<30)out.warnings.push('fewer_than_30_returns');
 }
 return out;
}
function exposure(x,dp){
 const equity=num(x.account_equity,'account_equity',{positive:true});
 if(typeof x.account_currency!=='string'||!/^[A-Z]{3}$/.test(x.account_currency))invalid('Use a three-letter account_currency.');
 if(!Array.isArray(x.positions)||x.positions.length<1||x.positions.length>MAX_POSITIONS)invalid(`positions must be an array of 1 to ${MAX_POSITIONS} items.`);
 const classes={},legs={};let gross=ZERO,net=ZERO,long=ZERO,short=ZERO;
 const rows=x.positions.map((p,i)=>{
  const n=`positions[${i}]`;if(!p||typeof p!=='object')invalid(`${n} must be an object.`);
  if(typeof p.symbol!=='string'||!/^[A-Za-z0-9._:/-]{1,30}$/.test(p.symbol))invalid(`${n}.symbol is required.`);
  if(!['long','short'].includes(p.side))invalid(`${n}.side must be long or short.`);
  const q=num(p.quantity,`${n}.quantity`,{positive:true}),price=num(p.price,`${n}.price`,{positive:true}),cs=p.contract_size===undefined?ONE:num(p.contract_size,`${n}.contract_size`,{positive:true}),rate=p.quote_to_account_rate===undefined?ONE:num(p.quote_to_account_rate,`${n}.quote_to_account_rate`,{positive:true});
  const cls=p.asset_class===undefined?'unclassified':String(p.asset_class).toLowerCase();if(!/^[a-z_]{1,30}$/.test(cls))invalid(`${n}.asset_class must be a short word such as forex, stock or crypto.`);
  const sign=p.side==='long'?1:-1,notional=q.mul(cs).mul(price).mul(rate),signed=notional.mul(sign);
  gross=gross.plus(notional);net=net.plus(signed);if(sign>0)long=long.plus(notional);else short=short.plus(notional);
  const c=classes[cls]||(classes[cls]={gross:ZERO,net:ZERO});c.gross=c.gross.plus(notional);c.net=c.net.plus(signed);
  const fx=cls==='forex'&&p.symbol.replace(/[^A-Za-z]/g,'').toUpperCase().match(/^([A-Z]{3})([A-Z]{3})$/);
  if(fx){const units=q.mul(cs);legs[fx[1]]=(legs[fx[1]]||ZERO).plus(units.mul(sign));legs[fx[2]]=(legs[fx[2]]||ZERO).minus(units.mul(price).mul(sign));}
  return {symbol:p.symbol,side:p.side,asset_class:cls,notional:fmt(notional,dp),percent_of_equity:fmt(notional.div(equity).mul(HUNDRED),dp)};
 });
 const largest=rows.reduce((a,b)=>new Decimal(b.notional).gt(a.notional)?b:a);
 const out={account_currency:x.account_currency,account_equity:fmt(equity,dp),positions:rows,gross_exposure:fmt(gross,dp),net_exposure:fmt(net,dp),long_exposure:fmt(long,dp),short_exposure:fmt(short,dp),gross_leverage:fmt(gross.div(equity),dp),net_leverage:fmt(net.div(equity),dp),largest_position:{symbol:largest.symbol,percent_of_gross:gross.isZero()?null:fmt(new Decimal(largest.notional).div(gross).mul(HUNDRED),dp)},by_asset_class:Object.fromEntries(Object.entries(classes).map(([k,v])=>[k,{gross:fmt(v.gross,dp),net:fmt(v.net,dp),percent_of_equity:fmt(v.gross.div(equity).mul(HUNDRED),dp)}])),currency_legs:Object.fromEntries(Object.entries(legs).map(([k,v])=>[k,fmt(v,dp)])),data_basis:'caller_supplied',warnings:[]};
 if(gross.div(equity).gt(10))out.warnings.push('gross_leverage_above_10x');
 if(Object.keys(legs).length)out.currency_legs_note='Native currency units: base currency bought or sold and quote currency paid or received. Not converted to the account currency.';
 return out;
}
module.exports={indicator,portfolio,INDICATORS,PORTFOLIO,_math:{sma,ema,rma,rsi,macd,bollinger,trueRange,stochastic}};
