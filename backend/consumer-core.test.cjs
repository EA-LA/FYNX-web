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
test('Pro process review accepts optional blank notes without weakening other validation',()=>{for(const notes of [undefined,'','   ']){const r=run('review',{notes,plan:true,risk:false});assert.equal(r.notes,'');assert.equal(r.score,20);assert.deepEqual(r.completed,['plan']);assert.deepEqual(r.missing,['risk','event','execution','review']);}assert.equal(run('review',{notes:'  Wait for confirmation  ',plan:true}).notes,'Wait for confirmation');assert.throws(()=>run('review',{notes:'X'.repeat(2001)}),/Trade Review notes must be 2,000 characters or fewer/);});
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

test('paid Journal Intelligence excludes coercion-only P/L but counts genuine break-even trades',()=>{
 const valid=[{pl:100},{pl:' -40.5 '},{pl:0},{pl:'0'},{pl:'1e1'}];
 const malformed=[{pl:null},{pl:''},{pl:'  '},{pl:false},{pl:true},{pl:[]},{pl:[50]},{pl:'0x10'},{pl:'0b10'},{pl:{}},{pl:Infinity},{pl:'NaN'},{},null];
 const r=run('analytics',{},[...valid.slice(0,1),...malformed,...valid.slice(1)]);
 const expected=run('analytics',{},valid);
 assert.deepEqual({...r,notice:expected.notice},expected);
 assert.equal(r.trades,5);
 assert.equal(r.netPL,69.5);
 assert.equal(r.winRate,40);
 assert.equal(r.expectancy,13.9);
 assert.equal(r.maxDrawdown,40.5);
 assert.deepEqual(r.curve,[100,59.5,59.5,59.5,69.5]);
 assert.match(r.notice,/invalid realized P\/L were omitted/);
 assert.doesNotMatch(expected.notice,/were omitted/);
});
test('paid Journal Intelligence does not fabricate trades from an entirely invalid history',()=>{
 const r=run('analytics',{},[{pl:null},{pl:' '},{pl:[]},{pl:false}]);
 assert.equal(r.trades,0);
 assert.equal(r.netPL,0);
 assert.equal(r.winRate,0);
 assert.equal(r.expectancy,0);
 assert.equal(r.profitFactor,null);
 assert.equal(r.maxDrawdown,0);
 assert.deepEqual(r.curve,[]);
 assert.match(r.notice,/invalid realized P\/L were omitted/);
});

test('paid Journal CSV uses the same decimal P/L rules as Journal Intelligence',()=>{
 const values=[100,' -40.5 ',0,'0','1e1','0x10','0b10',[50],false,true,null,'','  ','=2+2'];
 const trades=values.map(pl=>({pl}));
 const report=run('analytics',{},trades);
 const exported=run('export',{},trades);
 assert.equal(report.trades,5);
 assert.equal(report.netPL,69.5);
 assert.equal(exported.rows,values.length);
 const expected=['100','-40.5','0','0','10',"'0x10","'0b10","'50","'false","'true",'','','  ',"'=2+2"];
 assert.deepEqual(exported.csv.split('\r\n').slice(1),expected.map(pl=>'"","","","'+pl+'",""'));
});
test('paid Journal CSV preserves malformed P/L text escaping and formula defenses',()=>{
 const report=run('export',{},[{pl:' -2.5e0',symbol:'=2+2'},{pl:'  \uFEFF=2+2'},{pl:'bad,"value"'},{pl:'-invalid'},{pl:'0o10'}]);
 assert.ok(report.csv.includes('"\'=2+2","","-2.5"'));
 assert.ok(report.csv.includes('"\'  \uFEFF=2+2"'));
 assert.ok(report.csv.includes('"\'bad,""value"""'));
 assert.ok(report.csv.includes('"\'-invalid"'));
 assert.ok(report.csv.includes('"\'0o10"'));
});

test('Professional simulation uses the midpoint of the two central ending equities for an even path count',()=>{
 const input={balance:10000,riskPct:1,winRate:46.5,rewardRisk:2,trades:1};
 // This fixed seed produces exactly 250 wins and 250 losses for these assumptions.
 const result=run('simulation',input);
 assert.equal(result.paths,500);
 assert.equal(result.lossFrequency,50);
 assert.equal(result.endingEquityP10,9900);
 assert.equal(result.endingEquityP90,10200);
 assert.equal(result.endingEquityMedian,10050);
 assert.equal(result.drawdownP90,1);
 assert.deepEqual(result.curve,[10000,10200]);
});
test('Professional simulation median remains unchanged when both central outcomes coincide',()=>{
 const input={balance:10000,riskPct:1,rewardRisk:2,trades:1};
 for(const [winRate,expected] of [[0,9900],[100,10200]])assert.equal(run('simulation',{...input,winRate}).endingEquityMedian,expected);
});

test('paid Journal Intelligence calculates longest win and loss streaks in realized trade order',()=>{
 const result=run('analytics',{},['+3','2',0,4,-1,'-3',null,'-2',1,2,3,4,-1,0,-1,-1].map(pl=>({pl})));
 assert.equal(result.longestWinStreak,4);
 assert.equal(result.longestLossStreak,3);
 assert.equal(result.trades,15);
 assert.equal(result.netPL,10);
 assert.match(result.notice,/break-even trade ends a streak/);
 assert.match(result.notice,/invalid realized P\/L were omitted/);
});

test('streaks are zero for missing, invalid, or flat realized history',()=>{
 for(const trades of [[],[{pl:null}],[{pl:0},{pl:'-0'}]]){
  const result=run('analytics',{},trades);
  assert.equal(result.longestWinStreak,0);
  assert.equal(result.longestLossStreak,0);
 }
 for(const [pl,expected] of [[1,[1,0]],[-1,[0,1]]]){
  const r=run('analytics',{},[{pl}]);assert.deepEqual([r.longestWinStreak,r.longestLossStreak],expected);
 }
});

test('paid Risk Planner and Scenario Comparison show the break-even win rate before costs',()=>{
 const input={balance:10000,riskPct:1,entry:100,stop:98,target:104,multiplier:1,rate:1};
 const long=run('risk',input),short=run('risk',{...input,riskPct:2,stop:102,target:96,multiplier:2,rate:3});
 assert.equal(long.breakEvenWinRate,'33.333%');
 assert.equal(short.breakEvenWinRate,long.breakEvenWinRate);
 assert.match(long.notice,/before fees and slippage, not a forecast/);
 const comparison=run('scenarios',input);
 assert.equal(comparison.breakEvenWinRate,long.breakEvenWinRate);
 assert.equal(comparison.scenarios.length,4);
 assert.ok(comparison.scenarios.every(row=>row.rewardRisk===2&&!Object.hasOwn(row,'breakEvenWinRate')));
 assert.match(comparison.notice,/Changing position size does not change this threshold/);
 assert.equal(run('risk',{...input,target:102}).breakEvenWinRate,'50%');
 assert.equal(run('risk',{...input,target:101}).breakEvenWinRate,'66.667%');
});

test('extreme valid stop and target distances do not display an exact 0% or 100% threshold',()=>{
 const input={balance:10000,riskPct:1,entry:100,stop:99.999999,target:1000000,multiplier:1,rate:1};
 assert.equal(run('risk',input).breakEvenWinRate,'<0.001%');
 assert.equal(run('risk',{...input,entry:100000,stop:1,target:100000.000001}).breakEvenWinRate,'>99.999%');
});

test('paid scenario comparison explains only the requested multipliers that exceed the existing cap',()=>{
 const exact=run('scenarios',{...risk,riskPct:50});
 assert.equal(exact.scenarios.at(-1).riskBudget,10000);
 assert.doesNotMatch(exact.notice,/capped/);
 const single=run('scenarios',{...risk,riskPct:'60'});
 assert.deepEqual(single.scenarios.map(x=>x.riskBudget),[3000,6000,9000,10000]);
 assert.match(single.notice,/2× scenario was capped at 100% of account balance/);
 const two=run('scenarios',{...risk,riskPct:80});
 assert.deepEqual(two.scenarios.map(x=>x.riskBudget),[4000,8000,10000,10000]);
 assert.deepEqual(two.scenarios.map(x=>x.riskMultiplier),[0.5,1,1.5,2]);
 assert.match(two.notice,/1\.5× and 2× scenarios were capped at 100% of account balance/);
 assert.match(two.notice,/shows the requested multiplier/);
 assert.equal(two.breakEvenWinRate,exact.breakEvenWinRate);
});

test('Professional simulator counts paths that reach fixed drawdown thresholds',()=>{
 const initial={balance:1,riskPct:20,winRate:0,rewardRisk:2,trades:1};
 const result=input=>run('simulation',{...initial,...input});
 const thresholds=r=>[r.pathsReachingTenPercentDrawdown,r.pathsReachingTwentyPercentDrawdown];
 assert.deepEqual(thresholds(result({})),['100%','100%'],'an exact 20% first loss counts despite floating-point error');
 assert.deepEqual(thresholds(result({riskPct:10})),['100%','0%'],'an exact 10% first loss counts');
 assert.deepEqual(thresholds(result({riskPct:6,trades:2})),['100%','0%'],'cumulative losses cross 10%');
 assert.deepEqual(thresholds(result({winRate:100,trades:4})),['0%','0%']);
 const oneTradeMixed=result({winRate:50});
 assert.deepEqual(thresholds(oneTradeMixed),[oneTradeMixed.lossFrequency+'%',oneTradeMixed.lossFrequency+'%']);
 const mixed=result({winRate:50,trades:10});
 assert.ok(parseFloat(mixed.pathsReachingTwentyPercentDrawdown)>mixed.lossFrequency,'recovered paths still count');
 assert.match(mixed.notice,/even if they recovered/);
});

test('paid Trade Review explains the note limit without altering valid content or optional blanks',()=>{
 const notes='A'.repeat(1989)+'\n\nKeep tail';
 assert.equal(notes.length,2000);
 assert.equal(run('review',{notes,plan:true}).notes,notes);
 assert.throws(()=>run('review',{notes:notes+'!'}),/Shorten your note before running or saving/);
 assert.throws(()=>run('review',{notes:null}),/Trade Review notes must be text/);
 assert.equal(run('review',{notes:' '.repeat(2001)}).notes,'');
});

test('paid Journal Intelligence compares full history with the last 20 valid realized records',()=>{
 const old=Array(5).fill(100),recent=[...Array(10).fill(5),...Array(10).fill(-2)];
 const result=run('analytics',{},[...old,...recent.slice(0,10),null,...recent.slice(10),''].map(pl=>({pl})));
 assert.equal(result.trades,25);
 assert.equal(result.netPL,530);
 assert.equal(result.winRate,60);
 assert.equal(result.recentTrades,20);
 assert.equal(result.recentWinRate,'50%');
 assert.equal(result.recentNetPL,30);
 assert.match(result.notice,/last 20 dated trades with valid realized P\/L/);
});

test('recent Journal stats use the available sample and do not imply zero win rate with no valid trades',()=>{
 const sparse=run('analytics',{},['4',0,-1,null].map(pl=>({pl})));
 assert.deepEqual([sparse.recentTrades,sparse.recentWinRate,sparse.recentNetPL],[3,'33.3%',3]);
 const empty=run('analytics',{},[{pl:null}]);
 assert.deepEqual([empty.recentTrades,empty.recentWinRate,empty.recentNetPL],[0,null,null]);
});
