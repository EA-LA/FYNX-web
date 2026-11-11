'use strict';
// FYNX API 11: finance tools. Deterministic money math on caller-supplied numbers only:
// compound growth, loan payments, CAGR, Kelly sizing, drawdown recovery, trade P/L and real return.
// No market data is fetched, so no data licence is involved. Results are planning arithmetic, not advice.
const Decimal=require('decimal.js').clone({precision:40,rounding:4});
const {InputError}=require('./developer-engine.cjs');
const invalid=(m,c='invalid_input')=>{throw new InputError(m,c);};
const ZERO=new Decimal(0),ONE=new Decimal(1),HUNDRED=new Decimal(100);
const FINANCE=['compound-growth','loan-payment','cagr','kelly','drawdown-recovery','trade-pnl','real-return'];
const COMPOUNDING=[1,2,4,12,52,365];

function num(v,name,{positive=false,nonNegative=false,min,max}={}){
 let d;
 if(typeof v==='number'&&Number.isFinite(v))d=new Decimal(v);
 else if(typeof v==='string'&&/^[-+]?\d{1,18}(\.\d{1,12})?$/.test(v))d=new Decimal(v);
 else invalid(`${name} must be a finite number or decimal string.`);
 if(d.abs().gte('1e18')||d.decimalPlaces()>12)invalid(`${name} supports at most 18 integer digits and 12 fractional digits.`);
 if(positive&&!d.gt(0))invalid(`${name} must be positive.`);
 if(nonNegative&&d.lt(0))invalid(`${name} cannot be negative.`);
 if(min!==undefined&&d.lt(min))invalid(`${name} must be at least ${min}.`);
 if(max!==undefined&&d.gt(max))invalid(`${name} must be at most ${max}.`);
 return d;
}
const opt=(x,k,fallback,o)=>x[k]===undefined?new Decimal(fallback):num(x[k],k,o);
function int(v,name,min,max,fallback){
 if(v===undefined||v===null){if(fallback===undefined)invalid(`${name} is required.`);return fallback;}
 if(!Number.isInteger(v)||v<min||v>max)invalid(`${name} must be a whole number from ${min} to ${max}.`);
 return v;
}
function fmt(d,dp){
 if(d===null||d===undefined)return null;
 // Reject overflow before toFixed can allocate an unbounded decimal string.
 if(!d.isFinite()||d.e>1000)invalid('The result exceeds the supported calculation range.');
 return d.toFixed(dp);
}
const pct=(d,dp)=>fmt(d.mul(HUNDRED),dp);

function finance(name,x){
 if(!x||typeof x!=='object'||Array.isArray(x))invalid('Send a JSON object.');
 const dp=int(x.decimals,'decimals',0,12,2);
 if(!FINANCE.includes(name))invalid('Finance endpoint not found. Use one of: '+FINANCE.join(', ')+'.','not_found');
 const run={'compound-growth':compoundGrowth,'loan-payment':loanPayment,cagr,kelly,'drawdown-recovery':drawdownRecovery,'trade-pnl':tradePnl,'real-return':realReturn}[name];
 return {...run(x,dp),data_basis:'caller_supplied'};
}

// Future value with optional regular contributions. Closed form, so 100 years of daily compounding is cheap.
function compoundGrowth(x,dp){
 const principal=num(x.principal,'principal',{nonNegative:true}),rate=num(x.annual_rate_percent,'annual_rate_percent',{min:-99.99,max:1000});
 const years=int(x.years,'years',1,100),m=int(x.compounds_per_year,'compounds_per_year',1,365,12);
 if(!COMPOUNDING.includes(m))invalid(`compounds_per_year must be one of ${COMPOUNDING.join(', ')}.`);
 const contribution=opt(x,'contribution_per_period',0,{nonNegative:true}),timing=x.contribution_timing??'end';
 if(!['start','end'].includes(timing))invalid('contribution_timing must be start or end.');
 if(principal.isZero()&&contribution.isZero())invalid('Provide a positive principal or contribution_per_period.');
 const i=rate.div(HUNDRED).div(m),g=ONE.plus(i);
 const at=periods=>{
  const growth=g.pow(periods),base=principal.mul(growth);
  if(contribution.isZero())return base;
  const annuity=i.isZero()?contribution.mul(periods):contribution.mul(growth.minus(1)).div(i);
  return base.plus(timing==='start'?annuity.mul(g):annuity);
 };
 const schedule=[];
 for(let y=1;y<=years;y++){const v=at(y*m),paid=principal.plus(contribution.mul(y*m));schedule.push({year:y,balance:fmt(v,dp),contributed:fmt(paid,dp),growth:fmt(v.minus(paid),dp)});}
 const fv=at(years*m),contributed=principal.plus(contribution.mul(years*m)),ear=g.pow(m).minus(1);
 const out={future_value:fmt(fv,dp),total_contributed:fmt(contributed,dp),total_growth:fmt(fv.minus(contributed),dp),effective_annual_rate_percent:pct(ear,4),periods:years*m,contribution_timing:timing,warnings:rate.lt(0)?['negative_rate']:[]};
 if(x.include_schedule!==false)out.schedule=schedule;
 return out;
}

// Fixed-rate amortising loan with monthly payments. The schedule's last payment absorbs cent rounding.
function loanPayment(x,dp){
 const principal=num(x.principal,'principal',{positive:true}),rate=num(x.annual_rate_percent,'annual_rate_percent',{nonNegative:true,max:100});
 const n=int(x.term_months,'term_months',1,600),extra=opt(x,'extra_payment',0,{nonNegative:true});
 if(principal.decimalPlaces()>2||extra.decimalPlaces()>2)invalid('principal and extra_payment must use whole cents (at most two decimal places).');
 const r=rate.div(HUNDRED).div(12);
 const exact=r.isZero()?principal.div(n):principal.mul(r).div(ONE.minus(ONE.plus(r).pow(-n)));
 const payment=exact.toDecimalPlaces(2,Decimal.ROUND_HALF_UP);
 const rows=[];let balance=principal,interestTotal=ZERO,paidTotal=ZERO,month=0;
 while(balance.gt(0)&&month<n){
  month++;
  const interest=balance.mul(r).toDecimalPlaces(2,Decimal.ROUND_HALF_UP);
  let pay=payment.plus(extra);if(pay.gt(balance.plus(interest)))pay=balance.plus(interest);
  const toPrincipal=pay.minus(interest);balance=balance.minus(toPrincipal);
  interestTotal=interestTotal.plus(interest);paidTotal=paidTotal.plus(pay);
  rows.push({month,payment:fmt(pay,2),principal:fmt(toPrincipal,2),interest:fmt(interest,2),balance:fmt(Decimal.max(balance,ZERO),2)});
 }
 if(balance.gt(0)){ // cent rounding left a remainder: fold it into the final payment
  const last=rows[rows.length-1],fix=balance;last.payment=fmt(new Decimal(last.payment).plus(fix),2);last.principal=fmt(new Decimal(last.principal).plus(fix),2);last.balance='0.00';paidTotal=paidTotal.plus(fix);
 }
 const out={monthly_payment:fmt(payment,2),months_to_payoff:rows.length,total_paid:fmt(paidTotal,2),total_interest:fmt(interestTotal,2),principal:fmt(principal,dp)};
 if(extra.gt(0)){out.extra_payment=fmt(extra,2);out.months_saved=n-rows.length;}
 if(x.include_schedule===true)out.schedule=rows;
 return out;
}

function cagr(x,dp){
 const start=num(x.start_value,'start_value',{positive:true}),end=num(x.end_value,'end_value',{positive:true}),years=num(x.years,'years',{positive:true,max:200});
 const growth=end.div(start);
 return {cagr_percent:pct(growth.pow(ONE.div(years)).minus(1),dp),total_return_percent:pct(growth.minus(1),dp),growth_multiple:fmt(growth,4),years:years.toFixed()};
}

// Kelly fraction for a binary win/loss bet: f* = W - (1-W)/R. Capped at zero when there is no edge.
function kelly(x,dp){
 const w=num(x.win_rate_percent,'win_rate_percent',{min:0,max:100}).div(HUNDRED),R=num(x.payoff_ratio,'payoff_ratio',{positive:true});
 const fraction=opt(x,'kelly_fraction','1',{positive:true,max:1});
 const full=w.minus(ONE.minus(w).div(R)),edge=w.mul(R).minus(ONE.minus(w));
 const warnings=[];if(full.lte(0))warnings.push('no_positive_edge');if(full.gt(0.25))warnings.push('full_kelly_above_25_percent');
 const applied=Decimal.max(ZERO,full).mul(fraction);
 const out={full_kelly_percent:pct(full,dp),applied_kelly_percent:pct(applied,dp),kelly_fraction:fraction.toFixed(),expectancy_r:fmt(edge,4),breakeven_win_rate_percent:pct(ONE.div(ONE.plus(R)),dp),warnings,note:'Kelly assumes accurate, stable win rate and payoff estimates. Most traders use a fraction of it or a fixed small risk per trade.'};
 if(x.account_balance!==undefined){const b=num(x.account_balance,'account_balance',{positive:true});out.applied_risk_amount=fmt(b.mul(applied),2);}
 return out;
}

function drawdownRecovery(x,dp){
 const d=num(x.drawdown_percent,'drawdown_percent',{nonNegative:true});
 if(!d.lt(100))invalid('drawdown_percent must be below 100.');
 const left=HUNDRED.minus(d),need=d.div(left);
 const out={drawdown_percent:fmt(d,dp),required_gain_percent:pct(need,dp)};
 if(x.peak_balance!==undefined){const p=num(x.peak_balance,'peak_balance',{positive:true}),now=p.mul(left).div(HUNDRED);out.current_balance=fmt(now,2);out.amount_to_recover=fmt(p.minus(now),2);}
 if(x.monthly_return_percent!==undefined){
  const r=num(x.monthly_return_percent,'monthly_return_percent',{positive:true,max:100}).div(HUNDRED);
  const months=d.isZero()?0:Math.max(1,Math.ceil(Decimal.ln(ONE.plus(need)).div(Decimal.ln(ONE.plus(r))).toNumber()-1e-9));
  if(!Number.isSafeInteger(months))invalid('The recovery period exceeds the supported calculation range.');
  out.months_to_recover=months;
 }
 return out;
}

// Profit or loss of one closed position in any asset, given caller-supplied contract size and FX conversion.
function tradePnl(x,dp){
 if(!['long','short'].includes(x.direction))invalid('direction must be long or short.');
 const sign=x.direction==='long'?1:-1,entry=num(x.entry_price,'entry_price',{positive:true}),exit=num(x.exit_price,'exit_price',{positive:true});
 const qty=num(x.quantity,'quantity',{positive:true}),cs=opt(x,'contract_size',1,{positive:true}),rate=opt(x,'quote_to_account_rate',1,{positive:true}),fees=opt(x,'fees',0,{nonNegative:true});
 const units=qty.mul(cs),gross=exit.minus(entry).mul(units).mul(rate).mul(sign),net=gross.minus(fees),notional=entry.mul(units).mul(rate);
 const out={direction:x.direction,gross_pnl:fmt(gross,dp),fees:fmt(fees,dp),net_pnl:fmt(net,dp),entry_notional:fmt(notional,dp),price_change_percent:pct(exit.minus(entry).div(entry),4),return_on_notional_percent:pct(net.div(notional),4),result:net.gt(0)?'win':net.lt(0)?'loss':'breakeven'};
 if(x.risk_amount!==undefined)out.r_multiple=fmt(net.div(num(x.risk_amount,'risk_amount',{positive:true})),2);
 if(x.account_balance!==undefined)out.return_on_account_percent=pct(net.div(num(x.account_balance,'account_balance',{positive:true})),4);
 return out;
}

// Fisher relation: (1 + nominal) / (1 + inflation) - 1.
function realReturn(x,dp){
 const n=num(x.nominal_return_percent,'nominal_return_percent',{min:-99.99,max:10000}).div(HUNDRED),inf=num(x.inflation_percent,'inflation_percent',{min:-99.99,max:10000}).div(HUNDRED);
 const real=ONE.plus(n).div(ONE.plus(inf)).minus(1);
 const out={real_return_percent:pct(real,dp),approximate_real_return_percent:pct(n.minus(inf),dp)};
 if(x.amount!==undefined){const a=num(x.amount,'amount',{positive:true});out.nominal_value=fmt(a.mul(ONE.plus(n)),2);out.value_in_todays_money=fmt(a.mul(ONE.plus(real)),2);}
 return out;
}

module.exports={finance,FINANCE};
