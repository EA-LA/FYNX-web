'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs');
const path=require('node:path');
const {hash}=require('../quant/common.cjs');
const {EdgeStore}=require('./store.cjs');
(async()=>{try{const engine=require('./engine.cjs'),input=workerData.input,store=new EdgeStore(workerData.storeRoot),engineHash=hash(fs.readFileSync(path.join(__dirname,'engine.cjs')));
  for(const[symbol,market]of Object.entries(input.markets)){market.backtests={};for(const strategy of input.strategies||[]){const key=hash({symbol,strategy,cutoff:input.asOf.slice(0,10),bars:market.bars,strategyBars:market.strategyBars,events:market.events?.filter(e=>Date.parse(e.time)<=Date.parse(input.asOf)),calendarAvailable:market.calendarAvailable,engineHash});let cached=await store.get('strategy_trade_tags',key);if(!cached){const value=engine.runStrategyBacktest(symbol,market,strategy,input.asOf);cached={symbol,strategyId:strategy.id,asOf:input.asOf,engineHash,result:value.result,reason:value.reason};await store.put('strategy_trade_tags',key,cached);}if(cached.result)market.backtests[strategy.id]={trades:cached.result.trades,params:cached.result.params};}}
  const result=engine.buildSnapshot(input);parentPort.postMessage({result});
}catch(e){parentPort.postMessage({error:e.code==='MODULE_NOT_FOUND'?'Build the Edge engine before computing snapshots.':String(e.message||'Edge computation failed.').slice(0,500)});}})();
