const {test}=require('node:test');const assert=require('node:assert/strict');
const a=require('./developer-analytics.cjs');

test('SMA and EMA warm-up and values',()=>{
 assert.deepEqual(a.indicator('sma',{values:[1,2,3,4,5],period:3,decimals:4}).values,[null,null,'2','3','4']);
 // EMA seeded with SMA(1,2,3)=2, k=0.5, so a linear series stays one behind.
 assert.deepEqual(a.indicator('ema',{values:['1','2','3','4','5','6'],period:3}).values,[null,null,'2','3','4','5']);
});
test('RSI matches the classic Wilder worked example',()=>{
 const v=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64];
 const r=a.indicator('rsi',{values:v,period:14,decimals:2});
 assert.equal(r.values[13],null);assert.equal(r.values[14],'70.46');assert.equal(r.latest.values,'57.92');assert.equal(r.method,'wilder');
 assert.equal(a.indicator('rsi',{values:[1,2,3,4,5],period:2}).latest.values,'100');
});
test('MACD equals fast EMA minus slow EMA, histogram equals line minus signal',()=>{
 const v=Array.from({length:60},(_,i)=>100+Math.sin(i/4)*5+i*0.1);
 const r=a.indicator('macd',{values:v,decimals:10});
 const f=a.indicator('ema',{values:v,period:12,decimals:10}).values,s=a.indicator('ema',{values:v,period:26,decimals:10}).values;
 assert.equal(r.macd[24],null);assert.ok(Math.abs(Number(r.macd[59])-(Number(f[59])-Number(s[59])))<1e-9);
 assert.equal(r.signal[32],null);assert.notEqual(r.signal[33],null);
 assert.ok(Math.abs(Number(r.histogram[59])-(Number(r.macd[59])-Number(r.signal[59])))<1e-9);
 assert.throws(()=>a.indicator('macd',{values:v,fast_period:26,slow_period:12}),/smaller/);
});
test('Bollinger bands use population deviation',()=>{
 const r=a.indicator('bollinger',{values:[2,4,4,4,5,5,7,9],period:8});
 assert.equal(r.latest.middle,'5');assert.equal(r.latest.upper,'9');assert.equal(r.latest.lower,'1');assert.equal(r.latest.bandwidth,'1.6');
});
test('ATR uses true range with previous close',()=>{
 const c=[{high:10,low:8,close:9},{high:12,low:9.5,close:11},{high:11.5,low:10,close:10.5},{high:13,low:10.4,close:12}];
 assert.deepEqual(a._math.trueRange(c.map(x=>({high:new (require('decimal.js'))(x.high),low:new (require('decimal.js'))(x.low),close:new (require('decimal.js'))(x.close)}))).map(String),['2','3','1.5','2.6']);
 const r=a.indicator('atr',{candles:c,period:2});assert.deepEqual(r.values,[null,'2.5','2','2.3']);
 assert.throws(()=>a.indicator('atr',{candles:[{high:1,low:2,close:1.5}]}),/high below low/);
});
test('Stochastic handles flat ranges and smoothing',()=>{
 const c=[{high:10,low:8,close:9},{high:11,low:9,close:11},{high:12,low:10,close:10},{high:12,low:12,close:12}];
 const r=a.indicator('stochastic',{candles:c,k_period:2,d_period:2});
 assert.deepEqual(r.k,[null,'100','33.33333333','100']);assert.equal(r.d[3],'66.66666667');
 assert.equal(a.indicator('stochastic',{candles:[{high:5,low:5,close:5}],k_period:1}).latest.k,'50');
});
test('VWAP is cumulative typical price times volume',()=>{
 const r=a.indicator('vwap',{candles:[{high:11,low:9,close:10,volume:100},{high:13,low:11,close:12,volume:300}]});
 assert.deepEqual(r.values,['10','11.5']);
 assert.throws(()=>a.indicator('vwap',{candles:[{high:1,low:1,close:1}]}),/volume/);
});
test('screen evaluates thresholds, crosses and any/all',()=>{
 const up=[10,10,10,10,10,9,8,7,6,12],down=[1,2,3,4,5,6,7,8,9,10];
 const r=a.indicator('screen',{series:[{symbol:'AAA',values:up},{symbol:'BBB',values:down}],conditions:[{left:{indicator:'close'},operator:'crosses_above',right:{indicator:'sma',period:3}}]});
 assert.deepEqual(r.matches,['AAA']);
 const rsi=a.indicator('screen',{series:[{symbol:'BBB',values:down}],conditions:[{left:{indicator:'rsi',period:3},operator:'>',value:'70'},{left:{indicator:'change_percent',lookback:1},operator:'<',value:0}],match:'any'});
 assert.deepEqual(rsi.matches,['BBB']);assert.equal(rsi.results[0].checks[1].passed,false);
 const short=a.indicator('screen',{series:[{symbol:'C',values:[1,2]}],conditions:[{left:{indicator:'sma',period:5},operator:'>',value:1}]});
 assert.equal(short.results[0].checks[0].reason,'insufficient_data');
 assert.throws(()=>a.indicator('screen',{series:[{symbol:'A',values:up},{symbol:'A',values:up}],conditions:[{left:{indicator:'close'},operator:'>',value:1}]}),/Duplicate/);
});
test('indicator input validation',()=>{
 assert.throws(()=>a.indicator('sma',{values:[1,'x'],period:2}),/values\[1\]/);
 assert.throws(()=>a.indicator('sma',{values:[1,2],period:0}),/period/);
 assert.throws(()=>a.indicator('sma',{values:Array(2001).fill(1)}),/2000/);
 assert.throws(()=>a.indicator('nope',{}),e=>e.code==='not_found');
 assert.deepEqual(a.indicator('sma',{values:[1],period:5}).warnings,['insufficient_data_for_period']);
});

test('performance summary from closed trades',()=>{
 const r=a.portfolio('performance',{trades:[{pnl:100,r_multiple:2},{pnl:-50,r_multiple:-1},{pnl:200},{pnl:-50},{pnl:0}],starting_balance:'10000'});
 assert.equal(r.win_rate_percent,'40');assert.equal(r.net_pnl,'200');assert.equal(r.profit_factor,'3');assert.equal(r.average_win,'150');assert.equal(r.average_loss,'50');
 assert.equal(r.payoff_ratio,'3');assert.equal(r.expectancy_per_trade,'40');assert.equal(r.largest_loss,'-50');assert.equal(r.max_consecutive_wins,1);assert.equal(r.average_r,'0.5');
 assert.equal(r.ending_balance,'10200');assert.equal(r.return_percent,'2');
 const allWin=a.portfolio('performance',{trades:[{pnl:5},{pnl:6}]});assert.equal(allWin.profit_factor,null);assert.equal(allWin.max_consecutive_wins,2);
});
test('drawdown statistics',()=>{
 const r=a.portfolio('drawdown',{equity:[100,120,90,130,110]});
 assert.equal(r.max_drawdown,'30');assert.equal(r.max_drawdown_percent,'25');assert.equal(r.max_drawdown_peak,1);assert.equal(r.max_drawdown_trough,2);assert.equal(r.max_drawdown_recovered_at,3);
 assert.equal(r.current_drawdown,'20');assert.equal(r.current_drawdown_percent,'15.38');assert.equal(r.longest_drawdown_periods,2);assert.equal(r.total_return_percent,'10');
 const t=a.portfolio('drawdown',{equity:[{timestamp:'2026-01-01',value:'100'},{timestamp:'2026-01-02',value:'90'}]});assert.equal(t.max_drawdown_trough,'2026-01-02');assert.equal(t.max_drawdown_recovered_at,null);
 const s=a.portfolio('drawdown',{equity:[100,110,99,108.9],periods_per_year:252,decimals:4});
 // returns: +10%, -10%, +10%; mean 3.3333%, sample sd 11.547%.
 assert.equal(s.mean_period_return_percent,'3.333333');assert.equal(s.annualized_volatility_percent,'183.303');assert.equal(s.sharpe_ratio,'4.5826');assert.ok(s.warnings.includes('fewer_than_30_returns'));
 assert.throws(()=>a.portfolio('drawdown',{equity:[100,-1]}),/positive/);
});
test('exposure, leverage and FX currency legs',()=>{
 const r=a.portfolio('exposure',{account_equity:'50000',account_currency:'USD',positions:[{symbol:'EURUSD',side:'long',quantity:'1',contract_size:'100000',price:'1.08',asset_class:'forex'},{symbol:'USDJPY',side:'short',quantity:'0.5',contract_size:'100000',price:'150',quote_to_account_rate:'0.0066666667',asset_class:'forex'},{symbol:'AAPL',side:'long',quantity:'100',price:'200',asset_class:'stock'}]});
 assert.equal(r.positions[0].notional,'108000');assert.equal(r.positions[2].percent_of_equity,'40');
 assert.equal(r.gross_exposure,'178000');assert.equal(r.net_exposure,'78000');assert.equal(r.gross_leverage,'3.56');
 assert.equal(r.currency_legs.EUR,'100000');assert.equal(r.currency_legs.USD,'-158000');assert.equal(r.currency_legs.JPY,'7500000');
 assert.equal(r.by_asset_class.stock.gross,'20000');assert.equal(r.largest_position.symbol,'EURUSD');
 assert.throws(()=>a.portfolio('exposure',{account_equity:'1',account_currency:'usd',positions:[]}),/account_currency/);
});
test('gateway resolves the new routes and leaves others alone',()=>{
 process.env.FUNCTIONS_EMULATOR=process.env.FUNCTIONS_EMULATOR||'';
 const {statelessRoute}=require('./developer-api.cjs')._test;
 assert.equal(statelessRoute('/v1/risk/margin'),null);assert.equal(statelessRoute('/v1/propfirm/accounts'),null);
 assert.equal(statelessRoute('/v1/indicators/rsi').run({values:[1,2,3],period:2}).indicator,'rsi');
 assert.equal(statelessRoute('/v1/portfolio/performance').run({trades:[{pnl:1}]}).trades,1);
 assert.equal(statelessRoute('/v1/markets/exchanges').run({}).exchanges.length,7);
});
