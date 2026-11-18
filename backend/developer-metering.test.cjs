// Runs the real gateway request path (runOperation) against an in-memory Firestore to prove
// exactly when overage blocks are queued for Stripe, and that test keys and Free are never metered.
const {test}=require('node:test');const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness(profile){
 const docs=new Map(),flushes=[];
 const snap=p=>({exists:docs.has(p),id:p.split('/').pop(),data:()=>docs.get(p)});
 const ref=p=>({path:p,id:p.split('/').pop(),get:async()=>snap(p),set:async(v,o)=>docs.set(p,o?.merge?{...docs.get(p),...v}:v),collection:n=>col(p+'/'+n)});
 const col=p=>({doc:id=>ref(p+'/'+(id||Math.random().toString(36).slice(2))),limit:()=>({path:p}),orderBy:()=>col(p)});
 const db={collection:p=>col(p),runTransaction:async f=>{const writes=[];const out=await f({get:async r=>snap(r.path),set:(r,v,o)=>writes.push(()=>docs.set(r.path,o?.merge?{...docs.get(r.path),...v}:v)),create:(r,v)=>{if(docs.has(r.path))throw Error('exists '+r.path);writes.push(()=>docs.set(r.path,v));},update:(r,v)=>writes.push(()=>docs.set(r.path,{...docs.get(r.path),...v}))});writes.forEach(w=>w());return out;}};
 docs.set('fynxDevelopers/u',profile);
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const fn={https:{HttpsError,onCall:f=>f,onRequest:f=>f}};
 const stubs={'firebase-functions/v1':{...fn,runWith:()=>fn},'firebase-functions/logger':{info(){},error(){},warn(){}},'firebase-admin':{firestore:Object.assign(()=>db,{FieldPath:{documentId:()=>'__id__'}}),auth:()=>({})},
  './developer-billing.cjs':{flushMeter:async uid=>{flushes.push(uid);return {reported:1};},refresh:async()=>({})}};
 const dir=__dirname,module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(dir,'developer-api.cjs'),'utf8'),{module,exports:module.exports,require:n=>stubs[n]||require(n.startsWith('.')?path.join(dir,n):n),Date,Math,JSON,Buffer,console,process,setTimeout});
 const month=new Date().toISOString().slice(0,7);
 const usage=(env,calls,extra={})=>docs.set(`fynxDevelopers/u/environments/${env}/usage/${month}`,{calls,...extra});
 const run=(env='live')=>module.exports._test.runOperation('u',env,'/v1/markets/exchanges',{});
 const queue=env=>[...docs.keys()].filter(k=>k.startsWith(`fynxDevelopers/u/environments/${env}/meterQueue/`)).map(k=>({id:k.split('/').pop(),...docs.get(k)}));
 return {docs,flushes,usage,run,queue,month,reset:()=>{for(const k of [...docs.keys()])if(k.includes('/rate')||k.includes('/private/'))docs.delete(k);}};
}
const dev={plan:'developer',planCheckedUntil:Date.now()+3600000,stripeLiveCustomer:'cus_1',requestCap:27500,requestCapExplicit:true};
test('Developer: blocks queue at 25,001, 26,001 and 27,001 and each is flushed once',async()=>{
 const h=harness(dev);
 h.usage('live',24999);await h.run();assert.equal(h.queue('live').length,0,'call 25,000 is included');
 await h.run();let q=h.queue('live');assert.equal(q.length,1);assert.equal(q[0].id,`${h.month}-1`);assert.equal(q[0].customer,'cus_1');assert.equal(q[0].status,'pending');assert.equal(h.flushes.length,1);
 h.usage('live',25500,{overageBlocks:1});h.reset();await h.run();assert.equal(h.queue('live').length,1,'still inside block 1');assert.equal(h.flushes.length,1);
 h.usage('live',26000,{overageBlocks:1});h.reset();await h.run();assert.equal(h.queue('live').length,2);assert.equal(h.flushes.length,2);
 h.usage('live',27000,{overageBlocks:2});h.reset();await h.run();assert.equal(h.queue('live').length,3);
});
test('the saved cap stops calls; no block is queued past it',async()=>{
 const h=harness(dev);h.usage('live',27500,{overageBlocks:3});
 await assert.rejects(h.run(),/request cap/);assert.equal(h.queue('live').length,0);
});
test('without an explicit cap a paid plan stops at its included calls',async()=>{
 const h=harness({...dev,requestCap:null,requestCapExplicit:false});h.usage('live',25000);
 await assert.rejects(h.run(),/Raise your monthly request cap/);assert.equal(h.queue('live').length,0);
});
test('test environment and Free plan are never metered',async()=>{
 const h=harness(dev);h.usage('test',999);await h.run('test');assert.equal(h.queue('test').length,0);
 await assert.rejects((h.usage('test',1000),h.reset(),h.run('test')),/allowance/);
 const f=harness({plan:'free',stripeLiveCustomer:'cus_1'});f.usage('live',999);await f.run();await assert.rejects((f.reset(),f.run()),/allowance/);assert.equal(f.queue('live').length,0);
});
test('legacy API Pro is never metered and stops at 50,000',async()=>{
 const h=harness({plan:'pro',planCheckedUntil:Date.now()+3600000,stripeLiveCustomer:'cus_1',requestCap:90000,requestCapExplicit:true});
 h.usage('live',49999);await h.run();await assert.rejects((h.reset(),h.run()),/allowance/);assert.equal(h.queue('live').length,0);
});
test('flushMeter reports each pending block once with a stable identifier, handles duplicates, failures and stale blocks',async()=>{
 const plans=require('./developer-plans.cjs');plans._configure({meterEventName:'fynx_api_overage_blocks',developer:{base:'b',overage:'o'},business:{base:null,overage:null}});
 const now=Date.now(),docs=new Map([['q/2026-11-1',{customer:'cus_1',at:now,status:'pending'}],['q/2026-11-2',{customer:'cus_1',at:now,status:'pending'}],['q/2026-11-3',{customer:'cus_1',at:now,status:'pending'}],['q/2026-09-9',{customer:'cus_1',at:now-40*86400000,status:'pending'}]]);
 const sent=[];let mode={};
 const stripe={billing:{meterEvents:{create:async e=>{sent.push(e);if(mode[e.identifier]==='dup')throw Error('An event with identifier '+e.identifier+' already exists');if(mode[e.identifier]==='down')throw Error('Stripe unavailable');return {};}}}};
 const qref=k=>({ref:{set:async(v,o)=>docs.set(k,{...docs.get(k),...v})},data:()=>docs.get(k),id:k.split('/')[1]});
 const db={collection:()=>({doc:()=>({collection:()=>({doc:()=>({collection:()=>({where:()=>({limit:()=>({get:async()=>{const d=[...docs.keys()].filter(k=>docs.get(k).status==='pending').map(qref);return {empty:!d.length,docs:d};}})})})})})})})};
 class HttpsError extends Error{constructor(c,m){super(m);this.code=c;}}
 const stubs={'firebase-functions/v1':{https:{HttpsError},runWith:()=>({https:{onCall:f=>f}})},'firebase-functions/logger':{info(){},error(){}},'firebase-admin':{firestore:()=>db,auth:()=>({})},stripe:function(){return stripe;},'./developer-plans.cjs':plans};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'developer-billing.cjs'),'utf8'),{module,exports:module.exports,require:n=>stubs[n]||require(n.startsWith('.')?path.join(__dirname,n):n),Date,process:{env:{FYNX_API_STRIPE_SECRET_KEY:'sk_live_UNIT_TEST_ONLY'}}});
 mode={'fynx-u-2026-11-2':'dup','fynx-u-2026-11-3':'down'};
 const r=await module.exports.flushMeter('u');
 assert.equal(r.reported,2);assert.equal(r.failed,1);
 assert.equal(docs.get('q/2026-11-1').status,'reported');assert.equal(docs.get('q/2026-11-2').status,'reported','duplicate identifier means Stripe already has it');
 assert.equal(docs.get('q/2026-11-3').status,'pending');assert.equal(docs.get('q/2026-11-3').attempts,1);
 assert.equal(docs.get('q/2026-09-9').status,'needs_review','never sends events outside Stripe’s window');
 const e=sent.find(x=>x.identifier==='fynx-u-2026-11-1');assert.equal(e.event_name,'fynx_api_overage_blocks');assert.equal(e.payload.stripe_customer_id,'cus_1');assert.equal(e.payload.value,'1');
 mode={};sent.length=0;const r2=await module.exports.flushMeter('u');assert.equal(r2.reported,1);assert.deepEqual(sent.map(x=>x.identifier),['fynx-u-2026-11-3'],'only the failed block is retried, with the same identifier');
 plans._configure(null);
});
