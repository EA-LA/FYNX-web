'use strict';
const functions=require('firebase-functions/v1');
const {parseVix}=require('./vix-data.cjs');
const {correlation,liquidity}=require('./analytics-core.cjs');
const {recordFailure}=require('./operations');
const cache=new Map(),pending=new Map();
async function request(url){const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':'FYNX-Analytics/1.0'}});if(!response.ok)throw Error('Provider unavailable');return response.json();}
async function load(kind,window,product){
 const key=kind==='vix'?'vix':kind==='correlation'?`fx-${window}`:product,old=cache.get(key),ttl=kind==='liquidity'?10000:21600000;
 if(old&&Date.now()-Date.parse(old.fetchedAt)<ttl)return old;
 if(pending.has(key))return pending.get(key);
 const task=(async()=>{try{
 let result;
 if(kind==='vix'){
 const response=await fetch('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv',{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Cboe unavailable');result=parseVix(await response.text());
 }else if(kind==='correlation'){
 const from=new Date(Date.now()-190*86400000).toISOString().slice(0,10);
 result=correlation(await request(`https://api.frankfurter.dev/v2/rates?from=${from}&base=EUR&quotes=USD,GBP,JPY,CHF,CAD,AUD&providers=ECB`),window);
 }else result=liquidity(await request(`https://api.exchange.coinbase.com/products/${product}/book?level=1`),product);
 const data={...result,fetchedAt:new Date().toISOString(),stale:kind!=='liquidity'&&Date.now()-Date.parse(result.observationDate)>7*86400000};cache.set(key,data);return data;
 }catch(error){recordFailure({category:'feed',operation:'feed-load',code:'unavailable',page:'/'});if(old&&Date.now()-Date.parse(kind!=='liquidity'?old.fetchedAt:old.observationTime)<(kind!=='liquidity'?86400000:60000))return {...old,stale:true};throw error;}finally{pending.delete(key);}})();
 pending.set(key,task);return task;
}
exports.webMarketAnalytics=functions.runWith({timeoutSeconds:30,memory:'256MB',maxInstances:2}).https.onRequest(async(req,res)=>{
 res.set('Access-Control-Allow-Origin','*');res.set('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.set('Access-Control-Allow-Methods','GET');return res.status(204).end();}
 if(req.method!=='GET')return res.status(405).json({error:'Use GET'});
 const kind=req.query.kind,window=Number(req.query.window||60),product=req.query.product||'BTC-USD';
 if(!['correlation','liquidity','vix'].includes(kind)||![30,60,90].includes(window)||!['BTC-USD','ETH-USD'].includes(product))return res.status(400).json({error:'Unsupported analysis'});
 try{const data=await load(kind,window,product);if(!data.stale)res.set('Cache-Control',kind!=='liquidity'?'public,max-age=300':'public,max-age=5');return res.json(data);}catch{return res.status(503).json({error:'Source data is unavailable. Retry shortly.'});}
});
