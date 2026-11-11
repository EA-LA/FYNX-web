'use strict';
const {EdgeService,DEFAULT_WATCHLIST}=require('../backend/edge/snapshot.cjs');
async function seed({service=new EdgeService(),asOf=new Date().toISOString(),symbols=DEFAULT_WATCHLIST,progress=()=>{}}={}){
 const end=new Date(Math.floor(Date.parse(asOf)/86400000)*86400000),start=new Date(end);start.setUTCFullYear(start.getUTCFullYear()-10);const from=start.toISOString().slice(0,10),to=end.toISOString().slice(0,10),results=[];
 const cot=await service.cotHistory({asOf});progress({provider:'CFTC',status:cot.status,records:cot.records.length,latestReportDate:cot.latestReportDate,reason:cot.warning||null});
 for(const symbol of symbols){try{const data=await service.quant.bars({symbol,tf:'D1',from,to});const item={symbol,records:data.bars.length,from:data.from,to:data.to,requestedFrom:from,requestedTo:to,status:data.status,source:data.source,updatedAt:data.updatedAt};results.push(item);progress(item);}catch(e){const item={symbol,status:'unavailable',reason:e.code?e.message:'Price seed failed.'};results.push(item);progress(item);}}
 return {asOf,from,to,cot:{status:cot.status,records:cot.records.length,latestReportDate:cot.latestReportDate},markets:results};
}
if(require.main===module){const service=new EdgeService();seed({service,symbols:process.argv.includes('--all')?require('../backend/quant/common.cjs').symbols().map(s=>s.id):DEFAULT_WATCHLIST,progress:item=>console.log(JSON.stringify(item))}).then(receipt=>service.store.put('provider_status','seed-receipt',receipt)).catch(e=>{console.error(e.code?e.message:'Edge seed failed.');process.exitCode=1;}).finally(()=>service.jobs.close());}
module.exports={seed};
