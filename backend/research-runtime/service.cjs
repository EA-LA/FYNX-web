'use strict';
const {JobQueue}=require('../quant/jobs.cjs');
const {createQuantAPI}=require('../quant/api.cjs');
const {createEdgeAPI}=require('../edge/api.cjs');
const {createProtectionService,verifyEdgeUser}=require('../edge/identity.cjs');
const {verifyUser}=require('../quant/auth.cjs');
const {fail}=require('../quant/common.cjs');
const {ResearchData}=require('./market-data.cjs');
const {PublishedEdge}=require('./edge.cjs');
const {ResearchEdgeStore,ResearchQuantStore}=require('./records.cjs');
// A cloud instance can stop immediately after sending the HTTP response.
// Finish a request's worker before responding; never hand out an in-memory job
// id that a subsequent request on another instance could not retrieve.
class RequestJobs {
 async submit(op,payload){const queue=new JobQueue({concurrency:1,timeout:85000});try{let job=queue.submit(op,payload);const end=Date.now()+90000;while(job.status==='queued'||job.status==='running'){if(Date.now()>end)throw fail('Narrow the research range and try again.',408,'COMPUTATION_TIMEOUT');await new Promise(r=>setTimeout(r,70));job=queue.get(job.jobId);}if(job.status==='failed')throw fail(job.error||'Research calculation failed.',422,'COMPUTATION_FAILED');return job;}finally{await queue.close();}}
 get(){throw fail('This request has ended; run the calculation again.',404);}
 cancel(){return {status:'cancelled'};}
 close(){}
}
function handlers(records){
 const data=new ResearchData({store:new ResearchQuantStore(records)}),store=new ResearchEdgeStore(records);
 function identify(fn){return async req=>{const user=await fn(req);records.identify(user.uid);return user;};}
 const protection=createProtectionService({store,verifyIdentity:identify(verifyEdgeUser),eventResolver:async()=>{try{return (await data.file('factors.json')).events;}catch{return []}}});
 const edge=createEdgeAPI({service:new PublishedEdge({store,quant:data}),protection,authenticate:identify(verifyUser)});
 const quant=createQuantAPI({data,jobs:new RequestJobs(),authenticate:identify(verifyUser)});
 return async(req,res)=>records.run(()=>data.withTemporaryHistory(async()=>{
  try{if(await edge(req,res)||await quant(req,res))return;res.status(404).json({error:'Unknown research endpoint.'});}
  catch{if(!res.headersSent)res.status(503).json({error:'Research request could not be completed.'});}
 }));
}
module.exports={handlers,RequestJobs};
