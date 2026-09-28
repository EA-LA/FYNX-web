'use strict';
// Runs the real Funded TypeScript in a VM with an in-memory Firestore adapter.
// These are behavior/guard tests, not evidence that customer policies are correct.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load,run}=require('./funded-scenarios.cjs');
function harness({challenge={phase:'2-phase',accountSize:10000,currentPhase:1,brokerAccountId:'broker'},trades=[],exists=true,commitError=false,concurrentChallenge=null}={}){
 const writes=[],queries=[];let commits=0,reads=0;
 const ref={get:async()=>({exists,data:()=>++reads>1&&concurrentChallenge?{...challenge,...concurrentChallenge}:challenge}),set:async value=>writes.push({collection:'challenges',value})};
 const db={collection:name=>({doc:id=>name==='challenges'?ref:{collection:name,id},where:(field,op,value)=>({get:async()=>{queries.push({field,value});return {empty:!trades.length,docs:trades.map((data,i)=>({id:String(i),data:()=>data}))};}})}),batch:()=>({set:(r,value)=>writes.push({collection:r===ref?'challenges':r.collection,value}),commit:async()=>{if(commitError)throw Error('storage unavailable');commits++;}})};
 db.runTransaction=async fn=>{const pending=[];const result=await fn({get:r=>r.get(),set:(r,value)=>pending.push({collection:r===ref?'challenges':r.collection,value})});if(commitError)throw Error('storage unavailable');writes.push(...pending);commits++;return result;};
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const source=load('functions/src/challengeProgression.ts',{'firebase-admin':{firestore:Object.assign(()=>db,{Timestamp:class{},FieldValue:{serverTimestamp:()=>123}})},'firebase-functions/v2/firestore':{onDocumentWritten:(_path,fn)=>fn},'firebase-functions/v2/https':{onCall:fn=>fn,HttpsError}},'\nexport { evaluateChallenge };');
 return {...source.api,writes,queries,commits:()=>commits};
}
const trades=(pnl=200,n=5)=>Array.from({length:n},(_,i)=>({closeTime:`2026-09-${String(i+1).padStart(2,'0')}T16:00:00Z`,pnl}));
test('nine scenarios pin client, server and proposed API outcomes, including all five known differences',async()=>{const report=await run();assert.equal(report.rows.length,9);assert.equal(report.rows.filter(r=>!r.match).length,5);});
test('all six phase targets and configured minimum days are enforced',async()=>{
 for(const [phase,targets,days] of [['1-phase',[10],3],['2-phase',[8,5],5],['3-phase',[6,5,4],5]])for(const [index,target] of targets.entries()){
  const challenge={phase,accountSize:10000,currentPhase:index+1};const ps=trades(0,days);ps[0].pnl=target*100;
  const h=harness({challenge,trades:ps});const r=await h.evaluateChallenge('qa','test');assert.equal(r.status,'passed');assert.equal(r.metrics.targetPct,target);assert.equal(r.metrics.tradingDays,days);
  ps[0].pnl-=0.01;assert.equal((await harness({challenge,trades:ps}).evaluateChallenge('qa','test')).status,'active');
 }
});
test('daily limits: exact boundary allowed, one cent beyond fails for each program',async()=>{
 for(const [phase,limit] of [['1-phase',400],['2-phase',500],['3-phase',500]])for(const [loss,status] of [[limit,'active'],[limit+0.01,'failed']]){
  const h=harness({challenge:{phase,accountSize:10000},trades:trades(-loss,1)});assert.equal((await h.evaluateChallenge('qa','test')).status,status);
 }
});
test('maximum loss: distributed losses exercise the maximum independently of daily loss',async()=>{
 for(const [phase,max,n] of [['1-phase',800,3],['2-phase',1000,4],['3-phase',1200,4]])for(const [extra,status] of [[0,'active'],[0.01,'failed']]){
  const ps=trades(-max/n,n);ps[n-1].pnl-=extra;const h=harness({challenge:{phase,accountSize:10000},trades:ps});assert.equal((await h.evaluateChallenge('qa','test')).status,status);
 }
});
test('missing or invalid history cannot be manually evaluated or write a decision',async()=>{
 for(const ps of [[],[{closeTime:'invalid',pnl:1000}]]){const h=harness({trades:ps});await assert.rejects(h.evaluateChallenge('qa','test'),{code:'failed-precondition'});assert.equal(h.writes.length,0);}
});
test('missing challenge and invalid configuration fail before writes',async()=>{
 for(const options of [{exists:false},{challenge:{phase:'unknown',accountSize:10000}},{challenge:{phase:'2-phase',accountSize:0}}]){const h=harness(options);await assert.rejects(h.evaluateChallenge('qa','test'));assert.equal(h.writes.length,0);}
});
test('unordered close times produce the same ordered metrics',async()=>{
 const ps=trades();ps[2].pnl=-100;const a=await harness({trades:ps}).evaluateChallenge('qa','test');const b=await harness({trades:ps.slice().reverse()}).evaluateChallenge('qa','test');assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
});
test('successful evaluation atomically includes challenge, evaluation and audit records',async()=>{
 const h=harness({trades:trades()});const result=await h.evaluateChallenge('qa','test');assert.equal(h.commits(),1);assert.deepEqual(h.writes.map(w=>w.collection),['challenges','rule_evaluations','audit_logs']);for(const w of h.writes){assert.equal(w.value.status||w.value.result,result.status);assert.equal(w.value.source||w.value.lastRuleEvaluationSource,'test');}
});
test('storage failure is propagated instead of returning a successful decision',async()=>{const h=harness({trades:trades(),commitError:true});await assert.rejects(h.evaluateChallenge('qa','test'),/storage unavailable/);assert.equal(h.commits(),0);});
test('non-owner admin cannot trigger manual progression or writes',async()=>{const h=harness();await assert.rejects(h.adminChallengeProgression({auth:{uid:'qa',token:{email:'qa@example.com'}},data:{challengeId:'qa',action:'pass'}}),{code:'permission-denied'});assert.equal(h.writes.length,0);});
test('manual challenges ignore automatic trade triggers',async()=>{const h=harness({challenge:{phase:'2-phase',accountSize:10000,progressionMode:'manual'}});await h.evaluateAutomaticProgressionOnTrade({data:{after:{exists:true,data:()=>({challengeId:'qa'})}}});assert.equal(h.writes.length,0);});

test('mixed invalid history, absent P&L, open-time fallback and duplicate identity fail without writes',async()=>{
 for(const extra of [{closeTime:'bad',pnl:10},{closeTime:'2026-09-02T16:00:00Z'}, {openTime:'2026-09-02T16:00:00Z',pnl:10}, {closeTime:'2026-02-30T16:00:00Z',pnl:10},{closeTime:'2026-09-02T16:00:00',pnl:10},{closeTime:'2026-09-02T16:00:00Z',pnl:''},{closeTime:'2026-09-02T16:00:00Z',pnl:10,commission:-2}]){
  const h=harness({trades:[...trades(),extra]});await assert.rejects(h.evaluateChallenge('qa','test'),{code:'failed-precondition'});assert.equal(h.writes.length,0);
 }
 const h=harness({trades:trades().map(t=>({...t,tradeId:'duplicate'}))});await assert.rejects(h.evaluateChallenge('qa','test'));assert.equal(h.writes.length,0);
});
test('net costs are never deducted twice and signed gross costs are applied',async()=>{
 for(const [extra,total] of [[{pnl:100,commission:-2,pnlBasis:'net'},100],[{pnl:100,commission:-2,swap:-1,fees:-3,pnlBasis:'gross_signed_costs'},94],[{pnl:100,netProfit:98,commission:-2},98]]){
  const h=harness({trades:[{closeTime:'2026-09-01T16:00:00Z',...extra}]});assert.equal((await h.evaluateChallenge('qa','test')).metrics.totalPnl,total);
 }
});
test('recorded failure persists after profitable history recovery',async()=>{
 for(const saved of [{status:'failed'},{ruleStatus:'failed'},{breachRecorded:true}]){
 const h=harness({challenge:{phase:'2-phase',accountSize:10000,...saved},trades:trades()});assert.equal((await h.evaluateChallenge('qa','test')).status,'failed');assert.equal(h.writes[0].value.breachRecorded,true);
 }
});
test('automatic enablement never writes mode or decisions before approved equity integration',async()=>{
 for(const ps of [[],trades(),[{closeTime:'bad',pnl:100}]]){
 const h=harness({trades:ps});await assert.rejects(h.adminChallengeProgression({auth:{uid:'owner',token:{email:'fynxteam5@gmail.com'}},data:{challengeId:'qa',action:'set_automatic'}}),{code:'failed-precondition'});assert.equal(h.writes.length,0);
 }
});
test('automatic triggers with empty or recovered history never overwrite decisions',async()=>{
 for(const ps of [[],trades()]){const h=harness({challenge:{phase:'2-phase',accountSize:10000,progressionMode:'automatic',status:'failed'},trades:ps});await assert.rejects(h.evaluateAutomaticProgressionOnTrade({data:{after:{exists:true,data:()=>({challengeId:'qa'})}}}),{code:'failed-precondition'});assert.equal(h.writes.length,0);}
});

test('transaction observes a failure recorded after initial history read',async()=>{
 const h=harness({trades:trades(),concurrentChallenge:{breachRecorded:true}});assert.equal((await h.evaluateChallenge('qa','test')).status,'failed');
});
test('phase configuration changed during evaluation aborts without writes',async()=>{
 const h=harness({trades:trades(),concurrentChallenge:{currentPhase:2}});await assert.rejects(h.evaluateChallenge('qa','test'),{code:'aborted'});assert.equal(h.writes.length,0);
});
