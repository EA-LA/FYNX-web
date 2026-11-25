const test=require('node:test'),assert=require('node:assert/strict');
const {run,PLANS,planForSubscription}=require('./consumer-core.cjs');
const risk={balance:10000,riskPct:1,entry:100,stop:98,target:104,multiplier:1,rate:1};
test('three monthly USD tiers unlock six, seven, eight products',()=>{assert.deepEqual(Object.values(PLANS).map(p=>[p.cents,p.products.length,p.saved]),[[599,6,25],[1099,7,100],[3099,8,500]]);});
test('actual journal metrics and drawdown',()=>{const r=run('analytics',{},[{pl:100},{pl:-40},{pl:20}]);assert.equal(r.netPL,80);assert.equal(r.maxDrawdown,40);assert.equal(r.profitFactor,3);assert.deepEqual(r.curve,[100,60,80]);});
test('risk sizing and scenario budgets',()=>{const r=run('risk',risk);assert.equal(r.units,50);assert.equal(r.lossAtStop,100);assert.equal(r.profitAtTarget,200);assert.deepEqual(run('scenarios',risk).scenarios.map(x=>x.riskBudget),[50,100,150,200]);assert.throws(()=>run('risk',{...risk,stop:101}));});
test('paid risk scenarios support the minimum valid base risk without clamping the half-risk case',()=>{
 const input={...risk,riskPct:0.01};
 const result=run('scenarios',input);
 assert.equal(result.base.riskBudget,1);
 assert.deepEqual(result.scenarios.map(x=>x.riskBudget),[0.5,1,1.5,2]);
 assert.deepEqual(result.scenarios.map(x=>x.units),[0.25,0.5,0.75,1]);
 assert.throws(()=>run('risk',{...input,riskPct:0.005}),/Risk percent/);
 assert.throws(()=>run('scenarios',{...input,riskPct:0.005}),/Risk percent/);
});
test('paid scenario risk preserves the existing maximum risk cap',()=>{
 const result=run('scenarios',{...risk,riskPct:80});
 assert.deepEqual(result.scenarios.map(x=>x.riskBudget),[4000,8000,10000,10000]);
 assert.throws(()=>run('scenarios',{...risk,riskPct:101}),/Risk percent/);
});
test('process review and watchlist persist meaningful inputs',()=>{assert.equal(run('review',{notes:'Wait for confirmation',plan:true,risk:true}).score,40);assert.deepEqual(run('watchlist',{symbols:['aapl','AAPL','BTCUSD']}).symbols,['AAPL','BTCUSD']);});
test('paid research watchlists preserve full notes and reject over-limit notes instead of truncating',()=>{
 const symbols=['aapl'];
 for(const notes of ['', '  preserve spacing\n', 'x'.repeat(2000)])assert.equal(run('watchlist',{symbols,notes}).notes,notes);
 assert.equal(run('watchlist',{symbols}).notes,'');
 assert.throws(()=>run('watchlist',{symbols,notes:'x'.repeat(2001)}),/2,000 characters/);
 assert.throws(()=>run('watchlist',{symbols,notes:'a'.repeat(1999)+'😀'}),/2,000 characters/);
});
test('Pro process review accepts optional blank notes without weakening other validation',()=>{for(const notes of [undefined,'','   ']){const r=run('review',{notes,plan:true,risk:false});assert.equal(r.notes,'');assert.equal(r.score,20);assert.deepEqual(r.completed,['plan']);assert.deepEqual(r.missing,['risk','event','execution','review']);}assert.equal(run('review',{notes:'  Wait for confirmation  ',plan:true}).notes,'Wait for confirmation');assert.throws(()=>run('review',{notes:'X'.repeat(2001)}),/valid name/);});
test('CSV quotes and blocks spreadsheet formulas',()=>{const r=run('export',{},[{symbol:'=IMPORTXML("x")',pl:-5,notes:'a,b\nline'}]);assert.match(r.csv,/"'=IMPORTXML/);assert.match(r.csv,/"a,b\nline"/);});
test('Pro journal CSV exports signed realized P/L as spreadsheet numbers',()=>{
 const trades=[{date:'2026-11-22',symbol:'EURUSD',session:'NY',pl:-5.25,notes:'Loss'},{date:'2026-11-22',symbol:'XAUUSD',session:'NY',pl:'-2.5',notes:'Loss'},{date:'2026-11-22',symbol:'SPY',session:'NY',pl:4.5,notes:'Win'}];
 const r=run('export',{},trades);
 assert.match(r.csv,/"-5\.25"/);
 assert.match(r.csv,/"-2\.5"/);
 assert.match(r.csv,/"4\.5"/);
 assert.doesNotMatch(r.csv,/"'-5\.25"/);
 assert.equal(r.rows,3);
});
test('Pro journal CSV neutralizes formula prefixes behind invisible characters',()=>{
 const trades=[
  {date:'2026-11-22',symbol:' \uFEFF=IMPORTXML("x")',session:'\t+1+2',pl:-5,notes:'\u0000-1+2'},
  {date:'2026-11-22',symbol:'EURUSD',session:'NY',pl:'=2+2',notes:'\u200b@HYPERLINK("x")'}
 ];
 const r=run('export',{},trades);
 assert.ok(r.csv.includes('"\' \uFEFF=IMPORTXML(""x"")"'));
 assert.ok(r.csv.includes('"\'\t+1+2"'));
 assert.ok(r.csv.includes('"\'\u0000-1+2"'));
 assert.ok(r.csv.includes('"\'=2+2"'));
 assert.ok(r.csv.includes('"\'\u200b@HYPERLINK(""x"")"'));
 assert.ok(r.csv.includes('"-5"'));
});
test('portfolio long/short stress preserves signs',()=>{const r=run('portfolio',{balance:10000,shock:-5,positions:[{symbol:'A',value:6000},{symbol:'B',value:-2000}]});assert.equal(r.scenarioPL,-200);assert.equal(r.grossExposure,8000);assert.equal(r.scenarioEquity,9800);});
test('simulation endpoints and bounds',()=>{const d={balance:10000,riskPct:1,winRate:0,rewardRisk:2,trades:10};assert.equal(run('simulation',d).lossFrequency,100);assert.equal(run('simulation',{...d,winRate:100}).lossFrequency,0);assert.deepEqual(run('simulation',d),run('simulation',d));assert.throws(()=>run('simulation',{...d,trades:501}));assert.throws(()=>run('simulation',{...d,balance:1e9,riskPct:20,rewardRisk:20,winRate:100,trades:500}));});
const subscription=()=>({status:'active',livemode:false,metadata:{product:'fynx_consumer_test',fynx_uid:'u',tier:'starter'},items:{data:[{quantity:1,price:{currency:'usd',unit_amount:599,recurring:{interval:'month',interval_count:1}}}]}});
test('entitlement requires matching user, amount, interval, mode and status',()=>{assert.equal(planForSubscription(subscription(),'u'),'starter');for(const mutate of [s=>s.status='canceled',s=>s.livemode=true,s=>s.metadata.fynx_uid='other',s=>s.items.data[0].price.unit_amount=1,s=>s.items.data[0].price.recurring.interval='year',s=>s.metadata.tier='toString']){const s=subscription();mutate(s);assert.equal(planForSubscription(s,'u'),null);}});

test('Professional drawdown simulation rejects fractional trade counts instead of truncating them',()=>{
 const input={balance:10000,riskPct:1,winRate:45,rewardRisk:2};
 for(const trades of [1,10,500,'10'])assert.equal(run('simulation',{...input,trades}).curve.length,Number(trades)+1);
 for(const trades of [1.5,10.5,'499.9'])assert.throws(()=>run('simulation',{...input,trades}),/whole number/);
 for(const trades of [0,501])assert.throws(()=>run('simulation',{...input,trades}),/Trades/);
});

test('paid financial tools reject values coerced to numbers instead of valid decimal inputs',()=>{
 const portfolio={balance:10000,shock:-5,positions:[{symbol:'A',value:6000}]};
 const simulation={balance:10000,riskPct:1,winRate:45,rewardRisk:2,trades:10};
 for(const value of [' ','\t',false,true,[],[0],[1],{},'0x10','0b10',null,undefined]){
  assert.throws(()=>run('portfolio',{...portfolio,shock:value}),/Shock percent/);
  assert.throws(()=>run('portfolio',{...portfolio,positions:[{symbol:'A',value}]}),/Signed position value/);
  assert.throws(()=>run('simulation',{...simulation,winRate:value}),/Win rate/);
 }
 assert.throws(()=>run('risk',{...risk,riskPct:true}),/Risk percent/);
 assert.throws(()=>run('scenarios',{...risk,riskPct:[1]}),/Risk percent/);
});
test('paid financial inputs preserve decimal strings, scientific notation, signed values and explicit zero',()=>{
 const portfolio={balance:10000,shock:-5,positions:[{symbol:'A',value:6000},{symbol:'B',value:-2000}]};
 const expected=run('portfolio',portfolio);
 for(const shock of [' -5.0 ','-5e0','-05.','-0.5e1'])assert.deepEqual(run('portfolio',{...portfolio,shock}),expected);
 assert.deepEqual(run('portfolio',{...portfolio,shock:'0'}),run('portfolio',{...portfolio,shock:0}));
 assert.deepEqual(run('risk',{...risk,riskPct:'1e0'}),run('risk',risk));
 assert.deepEqual(run('simulation',{balance:'10000',riskPct:'1',winRate:'0',rewardRisk:'2',trades:'10'}),run('simulation',{balance:10000,riskPct:1,winRate:0,rewardRisk:2,trades:10}));
});
