'use strict';
// Reproducible local worker benchmark, deliberately not a phone-performance claim.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Worker}=require('node:worker_threads');
const root=path.resolve(__dirname,'../..'),bundle=path.join(os.tmpdir(),`fynx-quant-perf-${process.pid}.cjs`);
require('esbuild').buildSync({entryPoints:[path.join(root,'lib/quant/index.ts')],bundle:true,platform:'node',format:'cjs',outfile:bundle});
const worker=new Worker(`
  const {parentPort,workerData}=require('node:worker_threads');
  const {performance}=require('node:perf_hooks');
  const q=require(workerData.bundle),d=require(workerData.fixture);
  const bars=d.dates.map((time,i)=>({time,close:d.close[i]}));
  const base=q.backtest(bars),returns=base.dailyReturns;
  const operations={backtest:()=>q.backtest(bars),optimize:()=>q.optimize(bars),montecarlo:()=>q.monteCarlo(returns,{paths:2000,horizon:252,seed:42}),ftmo:()=>q.ftmo(returns,{attempts:2000,horizon:120,seed:42,includeRiskScan:true})};
  const measurements={};
  for(const [name,fn] of Object.entries(operations)){fn();const times=[];for(let i=0;i<3;i++){const start=performance.now();fn();times.push(performance.now()-start);}times.sort((a,b)=>a-b);measurements[name]={medianMs:times[1],minMs:times[0],maxMs:times[2],repetitions:3};}
  parentPort.postMessage({measurements,fixture:{bars:bars.length,from:d.dates[0],to:d.dates.at(-1),source:d.source},golden:base.stats});
`,{eval:true,workerData:{bundle,fixture:path.join(__dirname,'fixtures/reference-eurusd.json')}});
worker.on('message',result=>{
  const files=fs.readdirSync(path.join(root,'lib/quant')).filter(f=>f.endsWith('.ts')).sort();const hash=crypto.createHash('sha256');for(const file of files)hash.update(file).update(fs.readFileSync(path.join(root,'lib/quant',file)));
  const evidence={generatedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model},execution:'Node worker_thread, one warmup + three measured repetitions per operation',engineSha256:hash.digest('hex'),...result,acceptance:{dailyBacktestUnder100ms:result.measurements.backtest.maxMs<100,heavyOperationsUnder3000ms:['optimize','montecarlo','ftmo'].every(k=>result.measurements[k].maxMs<3000),phoneWebWorkerVerified:false},limitations:['Desktop local measurements do not establish performance on a phone or browser Web Worker.','The FTMO measurement includes 2,000 attempts at the selected scale and 2,000 attempts at each of 20 risk-scan scales.','Golden statistics use real historical data extracted from the user-provided reference HTML; these are not live quotes.']};
  const out=path.join(root,'docs/evidence/quant-engine-performance.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));fs.unlinkSync(bundle);
});worker.on('error',err=>{try{fs.unlinkSync(bundle)}catch{}console.error(err);process.exitCode=1;});
