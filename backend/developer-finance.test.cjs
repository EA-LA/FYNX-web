const {test}=require('node:test');const assert=require('node:assert/strict');
const {finance,FINANCE}=require('./developer-finance.cjs');
const {InputError}=require('./developer-engine.cjs');
const bad=(name,input,re)=>assert.throws(()=>finance(name,input),e=>e instanceof InputError&&re.test(e.message),`${name} ${JSON.stringify(input)}`);

test('compound growth matches the closed form, with and without contributions',()=>{
 // 10,000 at 7% compounded monthly for 10 years: 10000 * (1 + 0.07/12)^120 = 20,096.61
 const a=finance('compound-growth',{principal:'10000',annual_rate_percent:'7',years:10});
 assert.equal(a.future_value,'20096.61');assert.equal(a.total_contributed,'10000.00');assert.equal(a.schedule.length,10);assert.equal(a.schedule[9].balance,a.future_value);
 assert.equal(a.effective_annual_rate_percent,'7.2290');
 // 200 per month at the end of each month, 7%/12 for 120 months: 200 * ((1+i)^120 - 1) / i = 34,616.97
 const b=finance('compound-growth',{principal:'0',annual_rate_percent:'7',years:10,contribution_per_period:'200',include_schedule:false});
 assert.equal(b.future_value,'34616.96');assert.equal(b.total_contributed,'24000.00');assert.equal(b.schedule,undefined);
 const start=finance('compound-growth',{principal:'0',annual_rate_percent:'7',years:10,contribution_per_period:'200',contribution_timing:'start'});
 assert.ok(Number(start.future_value)>Number(b.future_value));
 assert.equal(finance('compound-growth',{principal:'1000',annual_rate_percent:'0',years:5,contribution_per_period:'10'}).future_value,'1600.00');
 bad('compound-growth',{principal:'1000',annual_rate_percent:'5',years:5,compounds_per_year:3},/compounds_per_year/);
 bad('compound-growth',{principal:'0',annual_rate_percent:'5',years:5},/positive principal/);
 bad('compound-growth',{principal:'1000',annual_rate_percent:'-100',years:5},/at least/);
 bad('compound-growth',{principal:'1000',annual_rate_percent:'5',years:101},/years/);
});

test('loan payment matches the standard amortisation formula and balances to zero',()=>{
 const a=finance('loan-payment',{principal:'25000',annual_rate_percent:'6.5',term_months:60,include_schedule:true});
 assert.equal(a.monthly_payment,'489.15');assert.equal(a.months_to_payoff,60);assert.equal(a.schedule.length,60);
 assert.equal(a.schedule[59].balance,'0.00');
 const principalSum=a.schedule.reduce((s,r)=>s+Math.round(Number(r.principal)*100),0);assert.equal(principalSum,2500000);
 assert.equal(Math.round(Number(a.total_paid)*100),Math.round((25000+Number(a.total_interest))*100));
 assert.equal(finance('loan-payment',{principal:'1200',annual_rate_percent:'0',term_months:12}).monthly_payment,'100.00');
 const extra=finance('loan-payment',{principal:'25000',annual_rate_percent:'6.5',term_months:60,extra_payment:'100'});
 assert.ok(extra.months_to_payoff<60);assert.equal(extra.months_saved,60-extra.months_to_payoff);assert.ok(Number(extra.total_interest)<Number(a.total_interest));
 bad('loan-payment',{principal:'1000',annual_rate_percent:'5',term_months:0},/term_months/);
 bad('loan-payment',{principal:'-1',annual_rate_percent:'5',term_months:10},/positive/);
});

test('CAGR, Kelly, drawdown recovery and real return use the textbook formulas',()=>{
 assert.equal(finance('cagr',{start_value:'10000',end_value:'18500',years:'5'}).cagr_percent,'13.09');
 assert.equal(finance('cagr',{start_value:'100',end_value:'50',years:'1'}).cagr_percent,'-50.00');
 const k=finance('kelly',{win_rate_percent:'45',payoff_ratio:'2',kelly_fraction:'0.5',account_balance:'10000'});
 assert.equal(k.full_kelly_percent,'17.50');assert.equal(k.applied_kelly_percent,'8.75');assert.equal(k.applied_risk_amount,'875.00');assert.equal(k.expectancy_r,'0.3500');
 const none=finance('kelly',{win_rate_percent:'30',payoff_ratio:'1'});
 assert.equal(none.applied_kelly_percent,'0.00');assert.deepEqual(none.warnings,['no_positive_edge']);
 bad('kelly',{win_rate_percent:'101',payoff_ratio:'1'},/at most 100/);bad('kelly',{win_rate_percent:'50',payoff_ratio:'1',kelly_fraction:'2'},/at most 1/);
 const d=finance('drawdown-recovery',{drawdown_percent:'20',peak_balance:'100000',monthly_return_percent:'2'});
 assert.deepEqual([d.required_gain_percent,d.current_balance,d.amount_to_recover,d.months_to_recover],['25.00','80000.00','20000.00',12]);
 assert.equal(finance('drawdown-recovery',{drawdown_percent:'50'}).required_gain_percent,'100.00');
 assert.equal(finance('drawdown-recovery',{drawdown_percent:'0',monthly_return_percent:'1'}).months_to_recover,0);
 bad('drawdown-recovery',{drawdown_percent:'100'},/below 100/);
 const r=finance('real-return',{nominal_return_percent:'8',inflation_percent:'3',amount:'10000'});
 assert.deepEqual([r.real_return_percent,r.approximate_real_return_percent,r.value_in_todays_money],['4.85','5.00','10485.44']);
});

test('trade P/L handles long, short, fees, FX conversion and R multiple',()=>{
 const a=finance('trade-pnl',{direction:'long',entry_price:'1.0850',exit_price:'1.0910',quantity:'1',contract_size:'100000',fees:'7',risk_amount:'300'});
 assert.deepEqual([a.gross_pnl,a.net_pnl,a.r_multiple,a.result],['600.00','593.00','1.98','win']);
 const s=finance('trade-pnl',{direction:'short',entry_price:'150.00',exit_price:'151.00',quantity:'1',contract_size:'100000',quote_to_account_rate:'0.0066225'});
 assert.equal(s.net_pnl,'-662.25');assert.equal(s.result,'loss');
 assert.equal(finance('trade-pnl',{direction:'long',entry_price:'200',exit_price:'200',quantity:'10'}).result,'breakeven');
 bad('trade-pnl',{direction:'up',entry_price:'1',exit_price:'2',quantity:'1'},/direction/);
 bad('trade-pnl',{direction:'long',entry_price:'1',exit_price:'2',quantity:'1',fees:'-1'},/negative/);
});

test('every finance route rejects junk input and unknown names fail closed',()=>{
 for(const n of FINANCE){bad(n,null,/JSON object/);bad(n,[],/JSON object/);}
 bad('unknown',{},/not found/);
 bad('cagr',{start_value:'1e5',end_value:'2',years:'1'},/decimal string/);
 bad('cagr',{start_value:Infinity,end_value:'2',years:'1'},/finite number/);
 bad('cagr',{start_value:'1',end_value:'2',years:'1',decimals:13},/decimals/);
 for(const n of FINANCE)assert.equal(typeof n,'string');
});

test('results never contain undefined values (Firestore rejects them in request history)',()=>{
 const walk=(v,p)=>{assert.notEqual(v,undefined,p);if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))walk(x,`${p}.${k}`);};
 walk(finance('compound-growth',{principal:'1',annual_rate_percent:'1',years:1,include_schedule:false}),'cg');
 walk(finance('loan-payment',{principal:'1000',annual_rate_percent:'5',term_months:12}),'loan');
 walk(finance('kelly',{win_rate_percent:'50',payoff_ratio:'1.5'}),'kelly');
 walk(finance('drawdown-recovery',{drawdown_percent:'10'}),'dd');
 walk(finance('trade-pnl',{direction:'long',entry_price:'1',exit_price:'2',quantity:'1'}),'pnl');
 walk(finance('real-return',{nominal_return_percent:'5',inflation_percent:'2'}),'real');
});
