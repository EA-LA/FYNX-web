'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./funded-scenarios.cjs');
const purchase=require('../../backend/funded-purchase-agreement.cjs'),policy=require('../../backend/funded-policy.cjs');
function harness({missing=false,existing=false}={}){
 const agreement=purchase.build({uid:'owner',program:'2-phase',starting_balance:'10000',accepted_version:policy.VERSION,accepted:true});
 const records=new Map([['orders/session',{createdAt:123,...(!missing?{purchasedRules:agreement}:{})}]]),writes=[];
 if(existing)records.set('challenges/session',{status:'failed',breachRecorded:true,currentPhase:2});
 const ref=(collection,id)=>({id,key:collection+'/'+id});
 const db={collection:c=>({doc:id=>ref(c,id)}),runTransaction:async fn=>{const pending=[];const result=await fn({get:async r=>({exists:records.has(r.key),data:()=>records.get(r.key)}),set:(r,v)=>pending.push([r.key,{...records.get(r.key),...v}]),create:(r,v)=>{assert.equal(records.has(r.key),false);pending.push([r.key,v]);}});for(const [k,v]of pending){records.set(k,v);writes.push(k);}return result;}};
 const api=load('functions/src/stripe/webhook.ts',{'../purchasedAgreement':purchase,'firebase-functions/params':{defineSecret:()=>({value:()=>''})},'firebase-functions/v2/https':{onRequest:(_,fn)=>fn},'firebase-admin':{firestore:Object.assign(()=>db,{FieldValue:{serverTimestamp:()=>999}})},stripe:class{}},'\nexport {recordCompletedCheckout};').api;
 const session={id:'session',payment_status:'paid',metadata:{userId:'owner',accountSize:'10000',phase:'2',rule_policy_version:policy.VERSION,rule_document_sha256:agreement.document_sha256},currency:'usd',amount_total:10000};
 return {run:()=>api.recordCompletedCheckout(session,'event'),records,writes};
}
test('paid webhook binds recorded rules and preserves order creation time',async()=>{const h=harness();await h.run();assert.equal(h.records.get('orders/session').createdAt,123);const c=h.records.get('challenges/session');assert.equal(c.rulePolicyVersion,policy.VERSION);assert.equal(c.rulePolicy.coverage,null);assert.equal(c.progressionMode,'manual');});
test('webhook retry cannot reset a recorded breach or phase',async()=>{const h=harness({existing:true});await h.run();await h.run();assert.deepEqual(h.records.get('challenges/session'),{status:'failed',breachRecorded:true,currentPhase:2});assert.equal(h.writes.includes('challenges/session'),false);});
test('missing purchased snapshot fails atomically without creating challenge',async()=>{const h=harness({missing:true});await assert.rejects(h.run(),/recorded purchased rules/);assert.equal(h.writes.length,0);});
