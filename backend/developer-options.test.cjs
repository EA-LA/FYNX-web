const {test}=require('node:test');const assert=require('node:assert/strict');
const {options,OPTIONS,_cdf}=require('./developer-options.cjs');
const {InputError}=require('./developer-engine.cjs');
const bad=(name,input,re,code)=>assert.throws(()=>options(name,input),e=>e instanceof InputError&&re.test(e.message)&&(!code||e.code===code),`${name} ${JSON.stringify(input)}`);
const near=(a,b,tol,msg)=>assert.ok(Math.abs(Number(a)-b)<=tol,`${msg}: ${a} vs ${b}`);
const hull={spot:'42',strike:'40',days_to_expiry:'182.5',volatility_percent:'20',risk_free_rate_percent:'10'};

test('normal CDF is accurate from the centre to the far tails',()=>{
 for(const [x,v] of [[0,0.5],[0.5,0.6914624612740131],[1.96,0.9750021048517795],[-3,0.0013498980316301],[-6,9.865876450377e-10],[-10,7.61985302416047e-24]])
  assert.ok(Math.abs(_cdf(x)-v)/v<1e-13,`cdf(${x})`);
 for(let x=-7;x<=7;x+=0.37)assert.ok(Math.abs(_cdf(x)+_cdf(-x)-1)<1e-15,'symmetry');
});

test('price matches the Hull textbook example and put-call parity',()=>{
 // Hull, Options Futures and Other Derivatives: S=42, K=40, r=10%, sigma=20%, T=0.5 -> call 4.76, put 0.81.
 const c=options('price',{...hull,option_type:'call'}),p=options('price',{...hull,option_type:'put'});
 assert.equal(c.price,'4.7594');assert.equal(p.price,'0.8086');
 assert.equal(c.moneyness,'in_the_money');assert.equal(p.moneyness,'out_of_the_money');
 assert.equal(c.intrinsic_value,'2.0000');assert.equal(c.time_value,'2.7594');
 // C - P = S - K e^{-rT}
 near(Number(c.price)-Number(p.price),42-40*Math.exp(-0.05),2e-4,'parity');
 near(c.greeks.delta,0.779131,1e-6,'call delta');near(Number(c.greeks.delta)-Number(p.greeks.delta),1,1e-6,'delta parity');
 assert.equal(c.greeks.gamma,p.greeks.gamma);assert.equal(c.greeks.vega_per_vol_point,p.greeks.vega_per_vol_point);
 assert.ok(Number(c.greeks.theta_per_day)<0);
 assert.equal(c.probability_in_the_money_percent,'73.49');
});

test('greeks agree with finite differences of the price',()=>{
 const base={option_type:'put',spot:'100',strike:'105',days_to_expiry:'60',volatility_percent:'30',risk_free_rate_percent:'4',dividend_yield_percent:'1',decimals:10};
 const P=o=>Number(options('price',{...base,...o}).price),g=options('price',base).greeks,h=0.01;
 near(g.delta,(P({spot:String(100+h)})-P({spot:String(100-h)}))/(2*h),1e-5,'delta');
 near(g.gamma,(P({spot:String(100+h)})-2*P({})+P({spot:String(100-h)}))/(h*h),1e-3,'gamma');
 near(g.vega_per_vol_point,(P({volatility_percent:'30.01'})-P({volatility_percent:'29.99'}))/0.02,1e-5,'vega');
 near(g.rho_per_rate_point,(P({risk_free_rate_percent:'4.01'})-P({risk_free_rate_percent:'3.99'}))/0.02,1e-5,'rho');
 near(g.theta_per_day,(P({days_to_expiry:'59.99'})-P({days_to_expiry:'60.01'}))/0.02,1e-5,'theta');
});

test('position totals scale by contracts and multiplier',()=>{
 const r=options('price',{...hull,option_type:'call',contracts:3});
 assert.equal(r.position.premium,(4.759422*300).toFixed(2));assert.equal(r.position.contract_multiplier,'100.0000');
 assert.equal(options('price',{...hull,option_type:'call',contracts:1,contract_multiplier:10}).position.premium,'47.59');
 assert.deepEqual(options('price',{...hull,option_type:'call',days_to_expiry:'0.5'}).warnings,['under_one_day_to_expiry']);
});

test('implied volatility recovers the input volatility and rejects impossible prices',()=>{
 for(const [type,vol] of [['call',20],['put',20],['call',85],['put',5]]){
  const price=options('price',{...hull,option_type:type,volatility_percent:String(vol),decimals:10}).price;
  const iv=options('implied-volatility',{...hull,option_type:type,option_price:price,volatility_percent:undefined});
  near(iv.implied_volatility_percent,vol,1e-4,`${type} ${vol}`);
 }
 bad('implied-volatility',{...hull,option_type:'call',option_price:'1'},/no-arbitrage minimum/,'no_solution');
 bad('implied-volatility',{...hull,option_type:'call',option_price:'43'},/no-arbitrage maximum/,'no_solution');
 bad('implied-volatility',{...hull,option_type:'call'},/option_price/);
});

test('payoff handles spreads, straddles, covered calls and unlimited risk',()=>{
 const bull=options('payoff',{legs:[{type:'call',side:'long',strike:100,premium:5},{type:'call',side:'short',strike:110,premium:2}]});
 assert.equal(bull.net_premium,'-300.00');assert.equal(bull.premium_direction,'debit');
 assert.equal(bull.max_profit,'700.00');assert.equal(bull.max_loss,'-300.00');assert.deepEqual(bull.break_even_prices,['103.0000']);
 const strangle=options('payoff',{legs:[{type:'put',side:'short',strike:95,premium:1.5},{type:'call',side:'short',strike:105,premium:1.2}]});
 assert.equal(strangle.max_profit,'270.00');assert.equal(strangle.max_loss,null);assert.equal(strangle.max_loss_unlimited,true);
 assert.deepEqual(strangle.break_even_prices,['92.3000','107.7000']);
 const longCall=options('payoff',{legs:[{type:'call',side:'long',strike:50,premium:2.5,quantity:2}],contract_multiplier:100});
 assert.equal(longCall.max_profit_unlimited,true);assert.equal(longCall.max_loss,'-500.00');assert.deepEqual(longCall.break_even_prices,['52.5000']);
 const covered=options('payoff',{legs:[{type:'stock',side:'long',entry_price:100,quantity:100},{type:'call',side:'short',strike:110,premium:2}]});
 assert.equal(covered.max_profit,'1200.00');assert.equal(covered.max_loss,'-9800.00');assert.deepEqual(covered.break_even_prices,['98.0000']);
 const t=options('payoff',{legs:[{type:'put',side:'long',strike:100,premium:4}],price_from:80,price_to:120,points:5}).payoff_table;
 assert.deepEqual(t.map(r=>[r.underlying_price,r.profit]),[['80.0000','1600.00'],['90.0000','600.00'],['100.0000','-400.00'],['110.0000','-400.00'],['120.0000','-400.00']]);
 bad('payoff',{legs:[]},/legs/);bad('payoff',{legs:Array(9).fill({type:'call',side:'long',strike:1,premium:0})},/legs/);
 bad('payoff',{legs:[{type:'future',side:'long',strike:1,premium:1}]},/legs\[0\]\.type/);
 bad('payoff',{legs:[{type:'call',side:'long',strike:100,premium:1}],price_from:10,price_to:5},/price_to/);
});

test('probabilities: above + below = 100, touch exceeds finishing beyond, and matches the reflection formula',()=>{
 const r=options('probability',{spot:100,days_to_expiry:30,volatility_percent:25,target_prices:[110,90,100]}).results;
 for(const x of r)near(Number(x.probability_above_percent)+Number(x.probability_below_percent),100,0.011,'sum');
 assert.ok(Number(r[0].probability_of_touch_percent)>Number(r[0].probability_above_percent));
 assert.ok(Number(r[1].probability_of_touch_percent)>Number(r[1].probability_below_percent));
 assert.equal(r[2].probability_of_touch_percent,'100.00');
 // Zero drift (r = sigma^2/2): touch = 2 N(-b / sigma sqrt T)
 const sig=0.4,T=0.5,b=Math.log(1.2);
 const z=options('probability',{spot:50,target_price:60,days_to_expiry:182.5,volatility_percent:40,risk_free_rate_percent:'8'}).results[0];
 near(z.probability_of_touch_percent,200*_cdf(-b/(sig*Math.sqrt(T))),0.006,'zero-drift touch');
 bad('probability',{spot:100,days_to_expiry:30,volatility_percent:25},/target_price/);
 bad('probability',{spot:100,days_to_expiry:30,volatility_percent:25,target_prices:Array(21).fill(1)},/1 to 20/);
});

test('expected move gives the 1 and 2 standard deviation ranges',()=>{
 const m=options('expected-move',{spot:'100',days_to_expiry:'30',volatility_percent:'25'});
 assert.equal(m.expected_move,'7.1673');assert.equal(m.one_standard_deviation.probability_inside_percent,'68.27');
 assert.equal(m.two_standard_deviations.probability_inside_percent,'95.45');
 assert.ok(Number(m.one_standard_deviation.lower)<100&&Number(m.one_standard_deviation.upper)>100);
});

test('validation fails closed with clear messages',()=>{
 assert.deepEqual(OPTIONS,['price','implied-volatility','payoff','probability','expected-move']);
 bad('nope',{},/Options endpoint not found/,'not_found');
 bad('price',[],/JSON object/);
 bad('price',{...hull,option_type:'binary'},/option_type/);
 bad('price',{...hull,option_type:'call',spot:'0'},/spot must be positive/);
 bad('price',{...hull,option_type:'call',days_to_expiry:'4000'},/days_to_expiry must be at most/);
 bad('price',{...hull,option_type:'call',volatility_percent:'abc'},/volatility_percent must be a finite number/);
 bad('price',{...hull,option_type:'call',decimals:11},/decimals/);
 bad('price',{...hull,option_type:'call',spot:'1e5'},/spot must be a finite number/);
 assert.equal(options('price',{...hull,option_type:'call',decimals:2}).price,'4.76');
});
