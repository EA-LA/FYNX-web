'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),Stripe=require('stripe');
function setup(options={}){
 const entries=new Map(),writes=[];let reconciles=0;
 const profile={customer:'cus_owner',...options.profile};
 const root=()=>({get:async()=>({data:()=>profile}),set:async value=>writes.push(value),collection:()=>({doc:id=>({get:async()=>({exists:entries.has(id)}),set:async value=>entries.set(id,value)})})});
 const s={customers:{retrieve:async()=>({id:'cus_owner',livemode:true,metadata:{product:'fynx_consumer_live',fynx_uid:'owner'},...options.customer})},webhooks:Stripe.webhooks};
 const modules={'firebase-functions/v1':{runWith:()=>({https:{onRequest:f=>f}})},'firebase-functions/logger':{info(){},error(){}},'./consumer-live-workspace.cjs':{stripe:()=>s,root,entitlement:async()=>{reconciles++;if(options.fail)throw Error('Stripe down');return {tier:options.tier||null};}}};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(__dirname+'/consumer-live-events.cjs','utf8'),{module,exports:module.exports,require:n=>modules[n],Date,process:{env:{FYNX_CONSUMER_STRIPE_WEBHOOK_SECRET:'whsec_UNIT_TEST_ONLY'}}});
 return {...module.exports._test,s,writes,get reconciles(){return reconciles;}};
}
const event=()=>({id:'evt_unit',created:123,livemode:true,type:'invoice.paid',data:{object:{customer:'cus_owner'}}});
test('verified event fetches current state, and duplicate delivery has no second effect',async()=>{const h=setup({tier:'plus'});assert.equal(await h.processEvent(event(),h.s),'processed');assert.equal(h.writes[0].billingTier,'plus');assert.equal(await h.processEvent(event(),h.s),'duplicate');assert.equal(h.reconciles,1);});
test('old paid event cannot restore canceled membership',async()=>{const h=setup();await h.processEvent(event(),h.s);assert.equal(h.writes[0].billingTier,null);});
test('test events and other products or customers cannot affect live membership',async()=>{let h=setup();assert.equal(await h.processEvent({...event(),livemode:false},h.s),'ignored');h=setup({customer:{metadata:{product:'fynx_api'}}});assert.equal(await h.processEvent(event(),h.s),'ignored');h=setup({profile:{customer:'cus_other'}});assert.equal(await h.processEvent(event(),h.s),'ignored');});
function response(){return {code:200,body:null,status(n){this.code=n;return this;},send(v){this.body=v;return this;},json(v){this.body=v;return this;}};}
test('actual Stripe signature validation rejects forged requests',async()=>{const h=setup(),res=response();await h.webhook({method:'POST',rawBody:Buffer.from(JSON.stringify(event())),get:()=> 't=1,v1=fake'},res);assert.equal(res.code,400);assert.equal(h.reconciles,0);});
test('valid signed payload is processed; dependency failure returns retryable 500',async()=>{const payload=JSON.stringify(event()),header=Stripe.webhooks.generateTestHeaderString({payload,secret:'whsec_UNIT_TEST_ONLY'}),req={method:'POST',rawBody:Buffer.from(payload),get:()=>header};let h=setup(),res=response();await h.webhook(req,res);assert.equal(res.code,200);assert.equal(h.reconciles,1);h=setup({fail:true});res=response();await h.webhook(req,res);assert.equal(res.code,500);});
