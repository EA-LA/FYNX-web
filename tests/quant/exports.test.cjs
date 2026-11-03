'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {buildSync}=require('esbuild');
const root=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'fynx-quant-exports-'));
function mod(name){const out=path.join(dir,name+'.cjs');buildSync({entryPoints:[path.join(root,'lib/quant',name+'.ts')],outfile:out,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});return require(out);}
const {parseAsk,createCommandParser}=mod('commands'), {importReturnsCSV,importStrategiesJSON,exportStrategiesJSON}=mod('imports'),{generateEA}=mod('ea');
process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));

test('complex Ask request preserves real requested gold/tick history and ordered workflow',()=>{
 const q=parseAsk('Backtest ATR candle breakout in gold, 10 years tick data. Optimize stop and entry; show the surface. Put it in a portfolio with my other 8 strategies. Run 2,000 Monte Carlo paths. Would it pass an FTMO 10k 2-step challenge?');
 assert.equal(q.symbol,'XAUUSD');assert.equal(q.timeframe,'tick');assert.equal(q.dataType,'tick');assert.equal(q.years,10);assert.equal(q.paths,2000);
 assert.deepEqual(q.steps,['backtest','optimize','portfolio','montecarlo','ftmo']);
});
test('Ask tolerates common typos and never executes text as code',()=>{
 const q=parseAsk('backrest EUR/USD 1h for 3 years then chllange and EA');
 assert.equal(q.symbol,'EURUSD');assert.equal(q.timeframe,'H1');assert.equal(q.years,3);assert.deepEqual(q.steps,['backtest','ftmo','deploy']);
 assert.deepEqual(parseAsk('please test silver daily').steps,['backtest']);
});
test('Ask supports registry aliases, portfolio references and consistent order',()=>{
 assert.equal(parseAsk('dow jones backtest').symbol,'US30');
 assert.equal(parseAsk('S&P 500 surface').symbol,'SPX500');
 assert.equal(parseAsk('nasdaq 100 daily').symbol,'NAS100');
 const q=parseAsk('MT5 and optimize bitcoin EURUSD');assert.equal(q.symbol,'BTCUSD');assert(q.warnings.length);assert.deepEqual(q.steps,['optimize','deploy']);
});
test('Ask rejects invalid history and limits path count',()=>{
 assert.throws(()=>parseAsk(''),/Enter/);assert.throws(()=>parseAsk('backtest 0 years'),/History/);
 assert.throws(()=>parseAsk('backtest 51 years'),/History/);assert.equal(parseAsk('Run 2.000 Monte Carlo paths').paths,2000);assert.throws(()=>parseAsk('Run 2.5 paths'),/whole number/);assert.equal(parseAsk('Run 20,000 paths').paths,10000);
});
test('LLM parser is off by default and requires server adapter plus configured key',async()=>{
 assert.equal((await createCommandParser().parse('backtest gold')).symbol,'XAUUSD');
 assert.throws(()=>createCommandParser({enabled:true}),/server key/);
 let called=false;const adapter={parse:async()=>{called=true;return parseAsk('gold');}};
 await createCommandParser({enabled:true,apiKeyConfigured:true,serverParser:adapter}).parse('test');assert(called);
});
test('CSV return percentages become fractions, sorted without fabricated observations',()=>{
 const q=importReturnsCSV('\uFEFFdate,return_pct\r\n"2025-01-03","-2.5"\r\n2025-01-02,1\r\n');
 assert.deepEqual(q.returns,[{date:'2025-01-02',return:.01,traded:true},{date:'2025-01-03',return:-.025,traded:true}]);
 assert.equal(q.source,'csv-daily-returns');
});
test('CSV trade conversion requires starting equity and sums exits without counting exits as entries',()=>{
 const csv='entry_date,exit_date,pnl\n2025-01-01,2025-01-03,100\n2025-01-02,2025-01-03,-20';
 assert.throws(()=>importReturnsCSV(csv),/Initial equity/);
 const q=importReturnsCSV(csv,{initialEquity:1000});
 assert.equal(q.returns.length,3);assert.equal(q.returns[2].return,.08);assert.equal(q.returns[2].traded,false);assert.equal(q.returns[0].traded,true);assert.equal(q.returns[1].traded,true);assert.match(q.warnings[0],/mark-to-market/);
});
test('CSV rejects malformed dates, rows, duplicate days, infinity and impossible losses',()=>{
 for(const csv of ['date,return_pct\n2025-02-30,1','date,return_pct\n2025-01-01,1,2','date,return_pct\n2025-01-01,NaN','date,return_pct\n2025-01-01,-101','date,return_pct\n2025-01-01,1\n2025-01-01,2','date,return_pct\n"2025-01-01,1'])assert.throws(()=>importReturnsCSV(csv));
 assert.throws(()=>importReturnsCSV('entry_date,exit_date,pnl\n2025-01-02,2025-01-01,1',{initialEquity:1000}),/before/);
 assert.throws(()=>importReturnsCSV('entry_date,exit_date,pnl\n2025-01-01,2025-01-02,-1001',{initialEquity:1000}),/exceeds/);
});
test('strategy JSON is versioned and rejects unknown parameters/prototype payloads',()=>{
 const rows=[{name:'Test',symbol:'EURUSD',timeframe:'D1',params:{lookback:20,mode:'close'},returns:[{date:'2025-01-01',return:.01,traded:true}]}];
 assert.deepEqual(importStrategiesJSON(exportStrategiesJSON(rows)),rows);
 assert.throws(()=>importStrategiesJSON('{bad'),/Invalid/);
 assert.throws(()=>importStrategiesJSON('{"version":2,"strategies":[]}'),/version 1/);
 assert.throws(()=>importStrategiesJSON('[{"name":"bad","symbol":"EURUSD","timeframe":"D1","params":{"__proto__":{}}}]'),/Unsupported/);
});
const settings={symbol:'XAUUSD',timeframe:'H1',params:{lookback:32,atrPeriod:14,entryK:.75,stopS:2.5,targetTP:4,maxHold:20,riskPct:.25,mode:'ohlc',strategy:'breakout'}};
for(const platform of ['mt5','mt4','ctrader'])test(`${platform} export contains tested settings and closed-candle signal guards`,()=>{
 const result=generateEA({...settings,platform});assert.match(result.filename,/XAUUSD_H1/);assert(result.source.includes('32'));assert(result.source.includes('0.75'));assert(result.source.includes('0.25'));assert(result.source.includes('2.5'));assert(result.source.includes('PragueDay'));
 assert(result.notes.some(x=>/native compilation/.test(x)));assert(!/WebRequest|HttpClient|password/i.test(result.source));
 if(platform==='ctrader'){
  assert.match(result.source,/int last=Bars.Count-2/);assert.match(result.source,/i<last/);assert.match(result.source,/RoundingMode.Down/);assert.match(result.source,/volume<Symbol.VolumeInUnitsMin\)return/);assert.match(result.source,/LocalStorage.Flush/);assert.match(result.source,/Bars.TimeFrame!=TimeFrame.Hour/);
 }else{
  assert.match(result.source,/iClose\(_Symbol,InpTimeframe,1\)/);assert.match(result.source,/for\(int i=2;i<InpLookback\+2/);assert.match(result.source,/if\(lots<minimum\)return 0/);assert.match(result.source,/GlobalVariableGet\(guardKey\+"max"\)/);assert.match(result.source,/PERIOD_H1/);assert.match(result.source,/tickSize=SymbolInfoDouble\(_Symbol,SYMBOL_TRADE_TICK_SIZE\)/);assert.doesNotMatch(result.source,/MODE_TICKSIZE\)\*Point/);
 }
});
test('EA generator rejects unimplemented tick/news semantics and source injection',()=>{
 assert.throws(()=>generateEA({...settings,platform:'mt5',timeframe:'tick'}),/tested.*candle/);
 assert.throws(()=>generateEA({...settings,platform:'mt4',params:{...settings.params,strategy:'news'}}),/News strategies/);
 assert.throws(()=>generateEA({...settings,platform:'mt5',symbol:'XAUUSD";alert(1)'}),/symbol/);
 assert.throws(()=>generateEA({...settings,platform:'ctrader',params:{...settings.params,lookback:'20;'}}),/lookback/);
 assert.throws(()=>generateEA({...settings,platform:'mt5',params:{...settings.params,riskPct:NaN}}),/risk/);
});
