'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {PRODUCT,PRICES}=require('./consumer-live-policy.cjs');
const {PLANS}=require('./consumer-core.cjs');
function harness(options={}){
 const data=new Map(),calls=[];let serial=0;
 const snapshot=path=>({exists:data.has(path),data:()=>data.get(path)});
 function ref(path){return {path,get:async()=>snapshot(path),set:async(v,o)=>data.set(path,o?.merge?{...data.get(path),...v}:v),collection:name=>collection(path+'/'+name)};}
 function collection(path){return {doc:id=>ref(path+'/'+(id||'auto'+(++serial))),orderBy(){return this;},limit(){return this;},get:async()=>({docs:[...data].filter(([k])=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')).map(([k,v])=>({id:k.split('/').pop(),data:()=>v})),size:0})};}
 const db={collection,runTransaction:async fn=>fn({get:async r=>snapshot(r.path),set:(r,v,o)=>r.set(v,o),create:(r,v)=>r.set(v),delete:r=>data.delete(r.path)})};
 function sub(tier='starter'){return {id:'sub_paid',customer:'cus_owner',livemode:true,status:'active',metadata:{product:PRODUCT,fynx_uid:'owner',tier},items:{data:[{quantity:1,price:{id:PRICES[tier],livemode:true,type:'recurring',unit_amount:PLANS[tier].cents,currency:'usd',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}}}]},latest_invoice:{customer:'cus_owner',livemode:true,status:'paid',paid:true}};}
 const state={subscriptions:options.paid?[sub(options.tier)]:[],sessions:[],failCreate:false};
 const stripe={subscriptions:{list:async()=>{if(options.stripeDown)throw Error('Stripe unavailable');return {data:state.subscriptions};}},prices:{retrieve:async id=>{const tier=Object.keys(PRICES).find(t=>PRICES[t]===id);return {...sub(tier).items.data[0].price,active:true,...options.price};}},customers:{create:async(...args)=>{calls.push(['customer',...args]);return {id:'cus_owner'};}},checkout:{sessions:{list:async()=>({data:state.sessions}),retrieve:async()=>({status:'expired'}),expire:async id=>calls.push(['expire',id]),create:async(...args)=>{calls.push(['checkout',...args]);if(state.failCreate)throw Error('Timeout');return {id:'cs_new',url:'https://checkout.stripe.com/c/pay/cs_new'};}}},billingPortal:{configurations:{create:async()=>({id:'bpc_owner'})},sessions:{create:async args=>{calls.push(['portal',args]);return {url:'https://billing.stripe.com/session/live'};}}}};
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const module={exports:{}};const stubs={'firebase-functions/v1':{https:{HttpsError},runWith:()=>({https:{onCall:f=>f}})},'firebase-admin':{firestore:()=>db,auth:()=>({getUser:async()=>({email:'owner@example.invalid',disabled:false,...options.user})})},stripe:function(){return stripe;}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/consumer-live-workspace.cjs','utf8'),{module,exports:module.exports,process:{env:{FYNX_CONSUMER_STRIPE_SECRET_KEY:options.key||'sk_live_UNIT_TEST_ONLY'}},require:n=>stubs[n]||require(n),Date,URL});
 if(options.customer||options.paid)data.set('fynxConsumerLive/owner',{customer:'cus_owner'});
 return {call:(d,uid='owner')=>module.exports._test.handler(d,uid?{auth:{uid,token:{auth_time:Math.floor(Date.now()/1000),...options.token}}}:{}),data,calls,state,sub};
}
test('requires authentication and enabled account',async()=>{await assert.rejects(harness().call({action:'status'},null),{code:'unauthenticated'});await assert.rejects(harness({user:{disabled:true}}).call({action:'status'}),{code:'permission-denied'});});
test('rejects sandbox keys and unknown actions',async()=>{await assert.rejects(harness({key:'sk_test_SAMPLE'}).call({action:'status'}),{code:'failed-precondition'});await assert.rejects(harness().call({action:'invent'}),{code:'invalid-argument'});});
for(const tier of Object.keys(PRICES))test('checkout uses fixed '+tier+' price and owner identity',async()=>{const h=harness();await h.call({action:'checkout',tier,price:'price_attacker',uid:'other'});const [,args,opts]=h.calls.find(c=>c[0]==='checkout');assert.equal(args.line_items[0].price,PRICES[tier]);assert.equal(args.client_reference_id,'owner');assert.equal(args.subscription_data.metadata.fynx_uid,'owner');assert.equal(args.metadata.product,PRODUCT);assert.equal(args.mode,'subscription');assert.match(opts.idempotencyKey,/fynx-consumer-live-checkout-/);assert.equal(h.data.get('fynxConsumerLive/owner').checkoutLockUntil,0);});
test('wrong price configuration prevents checkout',async()=>{const h=harness({price:{unit_amount:1}});await assert.rejects(h.call({action:'checkout',tier:'starter'}),{code:'failed-precondition'});assert.equal(h.calls.length,0);});
test('ambiguous Stripe failure reuses saved idempotency key',async()=>{const h=harness();h.state.failCreate=true;await assert.rejects(h.call({action:'checkout',tier:'starter'}));h.state.failCreate=false;await h.call({action:'checkout',tier:'starter'});const calls=h.calls.filter(c=>c[0]==='checkout');assert.equal(calls[0][2].idempotencyKey,calls[1][2].idempotencyKey);});
test('open same-tier checkout is reused',async()=>{const h=harness({customer:true});h.state.sessions=[{url:'https://checkout.stripe.com/existing',metadata:{product:PRODUCT,tier:'starter'}}];assert.equal((await h.call({action:'checkout',tier:'starter'})).url,'https://checkout.stripe.com/existing');assert.equal(h.calls.length,0);});
test('existing unpaid subscription blocks duplicate payment and still permits billing portal',async()=>{const h=harness({paid:true});h.state.subscriptions[0].status='past_due';await assert.rejects(h.call({action:'checkout',tier:'starter'}),{code:'already-exists'});assert.equal((await h.call({action:'status'})).hasBillingAccount,true);assert.match((await h.call({action:'portal'})).url,/billing.stripe.com/);});
test('revocation is checked on the next tool request',async()=>{const h=harness({paid:true});assert.equal((await h.call({action:'status'})).tier,'starter');h.state.subscriptions[0].status='canceled';await assert.rejects(h.call({action:'run',product:'watchlist',input:{symbols:['AAPL']}}),{code:'permission-denied'});});
test('payment API outage never grants tools',async()=>{await assert.rejects(harness({customer:true,stripeDown:true}).call({action:'run',product:'watchlist',input:{symbols:['AAPL']}}),/Stripe unavailable/);});
test('higher-tier tools are denied and saved work is owner-scoped',async()=>{const h=harness({paid:true});await assert.rejects(h.call({action:'run',product:'portfolio',input:{}}),{code:'permission-denied'});await h.call({action:'save',product:'watchlist',name:'Research',input:{symbols:['AAPL']}});assert.equal((await h.call({action:'list'})).items.length,1);await assert.rejects(h.call({action:'list'},'other'),{code:'permission-denied'});});
test('paid workspace quota is enforced transactionally',async()=>{const h=harness({paid:true});h.data.set('fynxConsumerLive/owner',{customer:'cus_owner',savedCount:25});await assert.rejects(h.call({action:'save',product:'watchlist',name:'Extra',input:{symbols:['AAPL']}}),{code:'resource-exhausted'});});

test('every action rejects a revoked session before provider calls or writes',async()=>{
 for(const action of ['status','checkout','portal','list','delete','run','save']){
  const h=harness({customer:true,user:{tokensValidAfterTime:new Date(Date.now()+60000).toISOString()}});
  await assert.rejects(h.call({action,tier:'starter'}),{code:'unauthenticated'});
  assert.equal(h.calls.length,0);assert.equal(h.data.size,1);
 }
 for(const auth_time of [undefined,0,-1,'1',Math.floor(Date.now()/1000)+120])await assert.rejects(harness({token:{auth_time}}).call({action:'status'}),{code:'unauthenticated'});
});
test('fresh sign-in after revocation can open the billing portal',async()=>{
 const h=harness({customer:true,user:{tokensValidAfterTime:new Date(Date.now()-120000).toISOString()}});
 assert.match((await h.call({action:'portal'})).url,/billing.stripe.com/);
});
test('subscription lookup outage preserves billing management without granting access',async()=>{
 const h=harness({customer:true,stripeDown:true});
 const status=await h.call({action:'status'});assert.equal(status.tier,null);assert.equal(status.billingUnavailable,true);assert.equal(status.hasBillingAccount,true);
 assert.match((await h.call({action:'portal',tool:'risk'})).url,/billing.stripe.com/);
 assert.equal(new URL(h.calls.find(c=>c[0]==='portal')[1].return_url).searchParams.get('tool'),'risk');
 await assert.rejects(h.call({action:'run',product:'watchlist',input:{symbols:['AAPL']}}),/Stripe unavailable/);
});
test('checkout return paths preserve only known tools on the fixed FYNX origin',async()=>{
 for(const [tool,expected] of [['risk','risk'],['https://attacker.invalid','analytics'],['__proto__','analytics']]){
  const h=harness();await h.call({action:'checkout',tier:'plus',tool});const args=h.calls.find(c=>c[0]==='checkout')[1];
  for(const field of ['success_url','cancel_url']){const url=new URL(args[field]);assert.equal(url.origin,'https://www.fynxfinanceworld.com');assert.equal(url.pathname,'/pro.html');assert.equal(url.searchParams.get('tool'),expected);}
  assert.equal(new URL(args.success_url).searchParams.get('checkout'),'complete');assert.equal(new URL(args.cancel_url).searchParams.get('checkout'),'cancelled');
 }
});

test('ambiguous retries retain their original return URLs even after choosing another tool',async()=>{
 const h=harness();h.state.failCreate=true;await assert.rejects(h.call({action:'checkout',tier:'starter',tool:'risk'}));h.state.failCreate=false;
 await h.call({action:'checkout',tier:'starter',tool:'watchlist'});const attempts=h.calls.filter(c=>c[0]==='checkout');
 assert.equal(attempts[0][2].idempotencyKey,attempts[1][2].idempotencyKey);assert.deepEqual(attempts[0][1],attempts[1][1]);
});
test('legacy ambiguous checkout retains the exact pre-upgrade request URLs',async()=>{
 const h=harness({customer:true});h.data.set('fynxConsumerLive/owner',{customer:'cus_owner',checkoutAttempt:{tier:'starter',at:Date.now(),key:'legacy-attempt'}});
 await h.call({action:'checkout',tier:'starter',tool:'risk'});const attempt=h.calls.find(c=>c[0]==='checkout');
 assert.equal(attempt[2].idempotencyKey,'legacy-attempt');assert.equal(attempt[1].success_url,'https://www.fynxfinanceworld.com/pro.html?checkout=complete');assert.equal(attempt[1].cancel_url,'https://www.fynxfinanceworld.com/pro.html?checkout=cancelled');
});


test('news saves bind to the initiating account before account writes',async()=>{
 const h=harness({paid:true});await assert.rejects(h.call({action:'save',accountUid:'other',product:'watchlist',name:'Note',input:{symbols:['AAPL']}}),{code:'unauthenticated'});
 assert.equal(h.calls.length,0);assert.equal(h.data.size,1);
});
test('replayed research save is idempotent at the saved quota boundary',async()=>{
 const h=harness({paid:true});h.data.set('fynxConsumerLive/owner',{customer:'cus_owner',savedCount:24});
 const request={action:'save',accountUid:'owner',requestId:'12345678-1234-4234-8234-123456789abc',product:'watchlist',name:'Source note',input:{symbols:['AAPL'],notes:'https://www.cnbc.com/'}};
 const first=await h.call(request),second=await h.call(request);assert.equal(first.id,second.id);assert.equal(h.data.get('fynxConsumerLive/owner').savedCount,25);
 assert.equal((await h.call({action:'list'})).items.length,1);
 await assert.rejects(h.call({...request,name:'Different note'}),{code:'already-exists'});
});
test('replayed analytics save returns the original snapshot when recorded trades change',async()=>{
 const h=harness({paid:true});h.data.set('users/owner/trades/first',{pl:100,dateTs:1});
 const request={action:'save',accountUid:'owner',requestId:'12345678-1234-4234-8234-123456789abd',product:'analytics',name:'Weekly snapshot',input:{}};
 const first=await h.call(request);assert.equal(first.result.netPL,100);assert.equal(first.result.trades,1);
 h.data.set('users/owner/trades/second',{pl:-40,dateTs:2});
 assert.equal((await h.call({action:'run',product:'analytics',input:{}})).result.netPL,60);
 const retry=await h.call(request),stored=(await h.call({action:'list'})).items;
 assert.equal(retry.id,first.id);assert.deepEqual(retry.result,first.result);assert.deepEqual(stored[0].result,first.result);
 assert.equal(stored.length,1);assert.equal(h.data.get('fynxConsumerLive/owner').savedCount,1);
});
test('invalid save request IDs and expired paid access cannot bypass server policy',async()=>{
 const h=harness({paid:true});const request={action:'save',product:'watchlist',name:'Note',input:{symbols:['AAPL']},requestId:'../bad'};
 await assert.rejects(h.call(request),{code:'invalid-argument'});h.state.subscriptions[0].status='canceled';
 await assert.rejects(h.call({...request,requestId:'12345678-1234-4234-8234-123456789abc'}),{code:'permission-denied'});
});


test('verified status declares the account-bound idempotent research-save capability',async()=>{
 const status=await harness({paid:true}).call({action:'status',accountUid:'owner'});assert.equal(status.features.researchNotesVersion,1);
});
