'use strict';
// FYNX API 12: options tools. Deterministic European option math on caller-supplied numbers only:
// Black-Scholes-Merton price and greeks, implied volatility, multi-leg payoff at expiry,
// lognormal price probabilities and expected move. No market data is fetched, so no data licence is involved.
// Conventions: time is calendar days / 365; rates, yields and volatility are annual percentages,
// continuously compounded. Results are models, not advice.
const {InputError}=require('./developer-engine.cjs');
const invalid=(m,c='invalid_input')=>{throw new InputError(m,c);};
const OPTIONS=['price','implied-volatility','payoff','probability','expected-move'];
const MAX_DAYS=3650,MAX_LEGS=8,MAX_POINTS=101;

function num(v,name,{positive=false,nonNegative=false,min,max}={}){
 let n;
 if(typeof v==='number'&&Number.isFinite(v))n=v;
 else if(typeof v==='string'&&/^[-+]?\d{1,15}(\.\d{1,10})?$/.test(v))n=Number(v);
 else invalid(`${name} must be a finite number or decimal string.`);
 if(Math.abs(n)>=1e15)invalid(`${name} must be smaller than 1e15.`);
 if(positive&&!(n>0))invalid(`${name} must be positive.`);
 if(nonNegative&&n<0)invalid(`${name} cannot be negative.`);
 if(min!==undefined&&n<min)invalid(`${name} must be at least ${min}.`);
 if(max!==undefined&&n>max)invalid(`${name} must be at most ${max}.`);
 return n;
}
const opt=(x,k,fallback,o)=>x[k]===undefined?fallback:num(x[k],k,o);
function int(v,name,min,max,fallback){
 if(v===undefined||v===null){if(fallback===undefined)invalid(`${name} is required.`);return fallback;}
 if(!Number.isInteger(v)||v<min||v>max)invalid(`${name} must be a whole number from ${min} to ${max}.`);
 return v;
}
function oneOf(v,name,list,fallback){
 if(v===undefined&&fallback!==undefined)return fallback;
 if(!list.includes(v))invalid(`${name} must be one of: ${list.join(', ')}.`);
 return v;
}
// Fixed-decimal string; -0 becomes 0 so clients never see "-0.0000".
function fmt(n,dp){
 if(n===null||n===undefined)return null;
 if(!Number.isFinite(n))invalid('The result exceeds the supported calculation range.');
 const s=n.toFixed(dp);return /^-0(\.0+)?$/.test(s)?s.slice(1):s;
}

// Standard normal density and CDF. The CDF uses W. J. Cody's rational approximations
// (relative error below 1e-14), so greeks stay accurate deep in the tails.
const SQRT2PI=Math.sqrt(2*Math.PI);
const pdf=x=>Math.exp(-0.5*x*x)/SQRT2PI;
function cdf(x){
 const ax=Math.abs(x);let r;
 if(ax<0.66291){
  const a=[3.1611237438705656,113.864154151050156,377.485237685302021,3209.37758913846947,0.185777706184603153];
  const b=[23.6012909523441209,244.024637934444173,1282.61652607737228,2844.23683343917062];
  const y=x/Math.SQRT2,ysq=y*y;let xn=a[4]*ysq,xd=ysq;
  for(let i=0;i<3;i++){xn=(xn+a[i])*ysq;xd=(xd+b[i])*ysq;}
  return 0.5*(1+y*(xn+a[3])/(xd+b[3]));
 }
 if(ax<=5.656854){
  const c=[0.564188496988670089,8.88314979438837594,66.1191906371416295,298.635138197400131,881.95222124176909,1712.04761263407058,2051.07837782607147,1230.33935479799725,2.15311535474403846e-8];
  const d=[15.7449261107098347,117.693950891312499,537.181101862009858,1621.38957456669019,3290.79923573345963,4362.61909014324716,3439.36767414372164,1230.33935480374942];
  const y=ax/Math.SQRT2;let xn=c[8]*y,xd=y;
  for(let i=0;i<7;i++){xn=(xn+c[i])*y;xd=(xd+d[i])*y;}
  r=(xn+c[7])/(xd+d[7]);
  const z=Math.trunc(y*16)/16,del=(y-z)*(y+z);
  r*=Math.exp(-z*z)*Math.exp(-del)/2;
 }else{
  const p=[0.305326634961232344,0.360344899949804439,0.125781726111229246,0.0160837851487422766,6.58749161529837803e-4,0.0163153871373020978];
  const q=[2.56852019228982242,1.87295284992346725,0.527905102951428412,0.0605183413124413191,0.00233520497626869185];
  const y=ax/Math.SQRT2,z=1/(y*y);let xn=p[5]*z,xd=z;
  for(let i=0;i<4;i++){xn=(xn+p[i])*z;xd=(xd+q[i])*z;}
  r=z*(xn+p[4])/(xd+q[4]);r=(1/Math.sqrt(Math.PI)-r)/y;
  const zz=Math.trunc(y*16)/16,del=(y-zz)*(y+zz);
  r*=Math.exp(-zz*zz)*Math.exp(-del)/2;
 }
 return x>0?1-r:r;
}

function market(x,{needVol=true}={}){
 const S=num(x.spot,'spot',{positive:true}),K=num(x.strike,'strike',{positive:true});
 const days=num(x.days_to_expiry,'days_to_expiry',{positive:true,max:MAX_DAYS});
 const r=opt(x,'risk_free_rate_percent',0,{min:-20,max:100})/100,q=opt(x,'dividend_yield_percent',0,{min:-20,max:100})/100;
 const sigma=needVol?num(x.volatility_percent,'volatility_percent',{min:0.01,max:1000})/100:null;
 const type=oneOf(x.option_type,'option_type',['call','put']);
 return {S,K,T:days/365,days,r,q,sigma,type};
}
// Black-Scholes-Merton with continuous dividend yield. Greeks are per one unit of underlying.
function bsm({S,K,T,r,q,sigma,type}){
 const sT=sigma*Math.sqrt(T),d1=(Math.log(S/K)+(r-q+sigma*sigma/2)*T)/sT,d2=d1-sT;
 const dq=Math.exp(-q*T),dr=Math.exp(-r*T),call=type==='call';
 const price=call?S*dq*cdf(d1)-K*dr*cdf(d2):K*dr*cdf(-d2)-S*dq*cdf(-d1);
 const delta=call?dq*cdf(d1):-dq*cdf(-d1);
 const gamma=dq*pdf(d1)/(S*sT);
 const vega=S*dq*pdf(d1)*Math.sqrt(T);
 const thetaYear=call
  ?-S*dq*pdf(d1)*sigma/(2*Math.sqrt(T))-r*K*dr*cdf(d2)+q*S*dq*cdf(d1)
  :-S*dq*pdf(d1)*sigma/(2*Math.sqrt(T))+r*K*dr*cdf(-d2)-q*S*dq*cdf(-d1);
 const rho=call?K*T*dr*cdf(d2):-K*T*dr*cdf(-d2);
 return {price,delta,gamma,vega,thetaYear,rho,d1,d2,itm:call?cdf(d2):cdf(-d2)};
}
// Arbitrage bounds of a European option price.
function bounds({S,K,T,r,q,type}){
 const fS=S*Math.exp(-q*T),pK=K*Math.exp(-r*T);
 return type==='call'?[Math.max(0,fS-pK),fS]:[Math.max(0,pK-fS),pK];
}
function multiplier(x){return opt(x,'contract_multiplier',100,{positive:true,max:1e6});}

function price(x,dp){
 const m=market(x),g=bsm(m),intrinsic=Math.max(0,m.type==='call'?m.S-m.K:m.K-m.S);
 const out={
  option_type:m.type,price:fmt(g.price,dp),intrinsic_value:fmt(intrinsic,dp),time_value:fmt(Math.max(0,g.price-intrinsic),dp),
  moneyness:Math.abs(m.S-m.K)<=m.K*1e-9?'at_the_money':(intrinsic>0?'in_the_money':'out_of_the_money'),
  greeks:{delta:fmt(g.delta,6),gamma:fmt(g.gamma,6),theta_per_day:fmt(g.thetaYear/365,6),vega_per_vol_point:fmt(g.vega/100,6),rho_per_rate_point:fmt(g.rho/100,6)},
  probability_in_the_money_percent:fmt(g.itm*100,2),d1:fmt(g.d1,6),d2:fmt(g.d2,6),years_to_expiry:fmt(m.T,6),
  model:'black_scholes_merton',warnings:[]
 };
 if(m.T<1/365)out.warnings.push('under_one_day_to_expiry');
 if(x.contracts!==undefined){
  const n=num(x.contracts,'contracts',{positive:true,max:1e6}),mult=multiplier(x);
  out.position={contracts:fmt(n,4),contract_multiplier:fmt(mult,4),premium:fmt(g.price*n*mult,2),delta_shares:fmt(g.delta*n*mult,2),theta_per_day:fmt(g.thetaYear/365*n*mult,2),vega_per_vol_point:fmt(g.vega/100*n*mult,2)};
 }
 return out;
}

function impliedVolatility(x,dp){
 const m=market(x,{needVol:false}),target=num(x.option_price,'option_price',{positive:true});
 const [lo,hi]=bounds(m),tol=Math.max(1e-10,target*1e-10);
 if(target<=lo+tol)invalid(`option_price must be above the no-arbitrage minimum of ${fmt(lo,6)} for these inputs.`,'no_solution');
 if(target>=hi-tol)invalid(`option_price must be below the no-arbitrage maximum of ${fmt(hi,6)} for these inputs.`,'no_solution');
 // Bracketed Newton: price is increasing in volatility, so bisection keeps every step safe.
 let a=1e-4,b=10,s=0.3,iterations=0;
 const f=v=>bsm({...m,sigma:v}).price-target;
 if(f(b)<0)invalid('No volatility up to 1000% reproduces option_price.','no_solution');
 if(f(a)>0)invalid('option_price implies a volatility below 0.01%.','no_solution');
 for(;iterations<200;iterations++){
  const g=bsm({...m,sigma:s}),diff=g.price-target;
  if(Math.abs(diff)<=tol)break;
  if(diff>0)b=s;else a=s;
  const next=g.vega>1e-12?s-diff/g.vega:NaN;
  s=next>a&&next<b?next:(a+b)/2;
  if(b-a<1e-12)break;
 }
 const g=bsm({...m,sigma:s});
 return {option_type:m.type,implied_volatility_percent:fmt(s*100,Math.max(dp,2)),model_price:fmt(g.price,6),iterations:iterations+1,
  greeks:{delta:fmt(g.delta,6),gamma:fmt(g.gamma,6),theta_per_day:fmt(g.thetaYear/365,6),vega_per_vol_point:fmt(g.vega/100,6),rho_per_rate_point:fmt(g.rho/100,6)},model:'black_scholes_merton'};
}

// Payoff at expiry of up to 8 legs. Profit is exact: it is piecewise linear with kinks only at strikes,
// so max profit/loss and break-evens come from the kinks and the slope beyond the highest strike.
function payoff(x,dp){
 if(!Array.isArray(x.legs)||!x.legs.length||x.legs.length>MAX_LEGS)invalid(`legs must be a list of 1 to ${MAX_LEGS} legs.`);
 const mult=multiplier(x);
 const legs=x.legs.map((l,i)=>{
  if(!l||typeof l!=='object'||Array.isArray(l))invalid(`legs[${i}] must be an object.`);
  const type=oneOf(l.type,`legs[${i}].type`,['call','put','stock']),side=oneOf(l.side,`legs[${i}].side`,['long','short']);
  const quantity=num(l.quantity??1,`legs[${i}].quantity`,{positive:true,max:1e6}),sign=side==='long'?1:-1;
  if(type==='stock'){const entry=num(l.entry_price,`legs[${i}].entry_price`,{positive:true});return {type,side,quantity,sign,entry,strike:null,premium:0,units:quantity};}
  return {type,side,quantity,sign,strike:num(l.strike,`legs[${i}].strike`,{positive:true}),premium:num(l.premium,`legs[${i}].premium`,{nonNegative:true}),units:quantity*mult};
 });
 const pnl=P=>legs.reduce((sum,l)=>{
  const value=l.type==='stock'?P-l.entry:l.type==='call'?Math.max(0,P-l.strike)-l.premium:Math.max(0,l.strike-P)-l.premium;
  return sum+l.sign*l.units*value;
 },0);
 const kinks=[...new Set(legs.filter(l=>l.strike!==null).map(l=>l.strike))].sort((a,b)=>a-b);
 const top=Math.max(...legs.map(l=>l.strike??l.entry));
 const slopeUp=legs.reduce((s,l)=>s+l.sign*l.units*(l.type==='put'?0:1),0);
 const nodes=[0,...kinks,top*2];
 const values=nodes.map(pnl),eps=1e-9*Math.max(1,...values.map(Math.abs));
 const near0=v=>Math.abs(v)<=eps;
 const maxProfit=slopeUp>eps?null:Math.max(...values),maxLoss=slopeUp<-eps?null:Math.min(...values);
 const breakEvens=[];
 for(let i=0;i<nodes.length-1;i++){
  const [a,b]=[nodes[i],nodes[i+1]],[va,vb]=[values[i],values[i+1]];
  if(near0(va))breakEvens.push(a);
  else if(va*vb<0)breakEvens.push(a+(b-a)*(-va)/(vb-va));
 }
 const last=nodes[nodes.length-1],vLast=values[values.length-1];
 if(near0(vLast))breakEvens.push(last);
 else if(Math.abs(slopeUp)>eps){const root=last-vLast/slopeUp;if(root>last)breakEvens.push(root);}
 const uniq=[...new Set(breakEvens.filter(v=>v>0).map(v=>fmt(v,dp)))];
 const premium=legs.reduce((s,l)=>s-l.sign*l.units*l.premium,0);
 const lowIn=x.price_from===undefined?0:num(x.price_from,'price_from',{nonNegative:true});
 const highIn=x.price_to===undefined?top*1.5:num(x.price_to,'price_to',{positive:true});
 if(highIn<=lowIn)invalid('price_to must be greater than price_from.');
 const points=int(x.points,'points',2,MAX_POINTS,21),step=(highIn-lowIn)/(points-1);
 const table=Array.from({length:points},(_,i)=>{const P=i===points-1?highIn:lowIn+step*i;return {underlying_price:fmt(P,dp),profit:fmt(pnl(P),2)};});
 return {net_premium:fmt(premium,2),premium_direction:premium>0?'credit':premium<0?'debit':'none',
  max_profit:maxProfit===null?null:fmt(maxProfit,2),max_profit_unlimited:maxProfit===null,
  max_loss:maxLoss===null?null:fmt(maxLoss,2),max_loss_unlimited:maxLoss===null,
  break_even_prices:uniq,contract_multiplier:fmt(mult,4),legs:legs.length,payoff_table:table};
}

// Lognormal (risk-neutral) probabilities at expiry, and the probability of touching a level before expiry
// (first passage of drifted Brownian motion in log-price, monitored continuously).
function probability(x,dp){
 const S=num(x.spot,'spot',{positive:true}),days=num(x.days_to_expiry,'days_to_expiry',{positive:true,max:MAX_DAYS});
 const sigma=num(x.volatility_percent,'volatility_percent',{min:0.01,max:1000})/100;
 const r=opt(x,'risk_free_rate_percent',0,{min:-20,max:100})/100,q=opt(x,'dividend_yield_percent',0,{min:-20,max:100})/100;
 const raw=Array.isArray(x.target_prices)?x.target_prices:x.target_price!==undefined?[x.target_price]:invalid('Send target_price or target_prices (up to 20).');
 if(!raw.length||raw.length>20)invalid('target_prices must contain 1 to 20 prices.');
 const T=days/365,sT=sigma*Math.sqrt(T),nu=r-q-sigma*sigma/2;
 const results=raw.map((v,i)=>{
  const H=num(v,raw.length>1?`target_prices[${i}]`:'target_price',{positive:true});
  const z=(Math.log(H/S)-nu*T)/sT,above=1-cdf(z);
  let touch;
  if(H===S)touch=1;
  else{
   const b=Math.abs(Math.log(H/S)),drift=H>S?nu:-nu;
   touch=cdf((-b+drift*T)/sT)+Math.exp(2*drift*b/(sigma*sigma))*cdf((-b-drift*T)/sT);
   touch=Math.min(1,Math.max(0,touch));
  }
  return {target_price:fmt(H,dp),probability_above_percent:fmt(above*100,2),probability_below_percent:fmt((1-above)*100,2),probability_of_touch_percent:fmt(touch*100,2)};
 });
 return {spot:fmt(S,dp),days_to_expiry:fmt(days,4),model:'lognormal_risk_neutral',results};
}

function expectedMove(x,dp){
 const S=num(x.spot,'spot',{positive:true}),days=num(x.days_to_expiry,'days_to_expiry',{positive:true,max:MAX_DAYS});
 const sigma=num(x.volatility_percent,'volatility_percent',{min:0.01,max:1000})/100,T=days/365;
 const move=S*sigma*Math.sqrt(T);
 const range=k=>{const lower=S*Math.exp(-k*sigma*Math.sqrt(T)),upper=S*Math.exp(k*sigma*Math.sqrt(T));return {lower:fmt(lower,dp),upper:fmt(upper,dp),probability_inside_percent:fmt((cdf(k)-cdf(-k))*100,2)};};
 return {spot:fmt(S,dp),days_to_expiry:fmt(days,4),expected_move:fmt(move,dp),expected_move_percent:fmt(sigma*Math.sqrt(T)*100,2),
  one_standard_deviation:range(1),two_standard_deviations:range(2),note:'Ranges are lognormal and ignore drift; the expected move is spot × volatility × √(days/365).'};
}

function options(name,x){
 if(!x||typeof x!=='object'||Array.isArray(x))invalid('Send a JSON object.');
 if(!OPTIONS.includes(name))invalid('Options endpoint not found. Use one of: '+OPTIONS.join(', ')+'.','not_found');
 const dp=int(x.decimals,'decimals',0,10,4);
 const run={price,'implied-volatility':impliedVolatility,payoff,probability,'expected-move':expectedMove}[name];
 return run(x,dp);
}

module.exports={options,OPTIONS,_cdf:cdf};
