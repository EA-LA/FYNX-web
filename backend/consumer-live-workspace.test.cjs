'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {PRODUCT,PRICES}=require('./consumer-live-policy.cjs');
const {PLANS}=require('./consumer-core.cjs');
function harness(options={}){
 const data=new Map(),calls=[];let serial=0;
 const snapshot=path=>({exists:data.has(path),data:()=>data.get(path)});
 // Firestore merge:true preserves omitted nested map fields; mergeFields can replace a whole map.
 const mapLike=v=>v&&typeof v==='object'&&!Array.isArray(v);
 function mergeMaps(previous,patch){const result={...previous};for(const [key,value] of Object.entries(patch)){result[key]=mapLike(value)&&Object.keys(value).length?mergeMaps(mapLike(result[key])?result[key]:{},value):value;}return result;}
 function ref(path){return {path,id:path.split('/').pop(),get:async()=>snapshot(path),set:async(v,o)=>{const previous=data.get(path);if(o?.mergeFields){const next={...previous};for(const field of o.mergeFields)next[field]=v[field];return data.set(path,next);}return data.set(path,o?.merge?mergeMaps(previous,v):v);},collection:name=>collection(path+'/'+name)};}
 function collection(path){return {doc:id=>ref(path+'/'+(id||'auto'+(++serial))),orderBy(){return this;},limit(){return this;},get:async()=>{if(path.endsWith('/trades')&&state.failTrades)throw Error('Journal temporarily unavailable');return {docs:[...data].filter(([k])=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')).map(([k,v])=>({id:k.split('/').pop(),data:()=>v})),size:0};}};}
 const db={collection,runTransaction:async fn=>fn({get:async r=>snapshot(r.path),set:(r,v,o)=>r.set(v,o),create:(r,v)=>r.set(v),delete:r=>data.delete(r.path)})};
 function sub(tier='starter'){return {id:'sub_paid',customer:'cus_owner',livemode:true,status:'active',metadata:{product:PRODUCT,fynx_uid:'owner',tier},items:{data:[{quantity:1,price:{id:PRICES[tier],livemode:true,type:'recurring',unit_amount:PLANS[tier].cents,currency:'usd',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}}}]},latest_invoice:{customer:'cus_owner',livemode:true,status:'paid',paid:true}};}
 const state={subscriptions:options.paid?[sub(options.tier)]:[],sessions:[],failCreate:false};
 const stripe={subscriptions:{list:async params=>{if(options.stripeDown||state.failSubscriptionPage&&params.starting_after)throw Error('Stripe unavailable');if(!options.paginated)return {data:state.subscriptions};calls.push(['subscription-list',{...params}]);const start=params.starting_after?state.subscriptions.findIndex(s=>s.id===params.starting_after)+1:0;return {data:state.subscriptions.slice(start,start+params.limit),has_more:state.subscriptions.length>start+params.limit};}},prices:{retrieve:async id=>{const tier=Object.keys(PRICES).find(t=>PRICES[t]===id);return {...sub(tier).items.data[0].price,active:true,...options.price};}},customers:{create:async(...args)=>{calls.push(['customer',...args]);return {id:'cus_owner'};}},checkout:{sessions:{list:async params=>{if(state.failCheckoutPage&&params.starting_after)throw Error('Checkout list unavailable');if(!options.paginatedCheckout)return {data:state.sessions,has_more:false};calls.push(['checkout-list',{...params}]);const start=params.starting_after?state.sessions.findIndex(s=>s.id===params.starting_after)+1:0;return {data:state.sessions.slice(start,start+params.limit),has_more:state.sessions.length>start+params.limit};},retrieve:async()=>({status:'expired'}),expire:async id=>{calls.push(['expire',id]);if(state.failExpire)throw Error('Checkout expiration unavailable');},create:async(...args)=>{calls.push(['checkout',...args]);if(state.failCreate)throw Error('Timeout');return {id:'cs_new',url:'https://checkout.stripe.com/c/pay/cs_new'};}}},billingPortal:{configurations:{create:async()=>({id:'bpc_owner'})},sessions:{create:async args=>{calls.push(['portal',args]);return {url:'https://billing.stripe.com/session/live'};}}}};
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const module={exports:{}};const stubs={'firebase-functions/v1':{https:{HttpsError},runWith:()=>({https:{onCall:f=>f}})},'firebase-admin':{firestore:()=>db,auth:()=>({getUser:async()=>({email:'owner@example.invalid',disabled:false,...options.user})})},stripe:function(){return stripe;}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/consumer-live-workspace.cjs','utf8'),{module,exports:module.exports,process:{env:{FYNX_CONSUMER_STRIPE_SECRET_KEY:options.key||'sk_live_UNIT_TEST_ONLY',FYNX_ACCOUNT_MEMBERSHIP_BRIDGE:options.bridge?'pro-equivalent':''}},require:n=>stubs[n]||require(n),Date,URL});
 if(options.customer||options.paid)data.set('fynxConsumerLive/owner',{customer:'cus_owner'});
 return {call:(d,uid='owner')=>module.exports._test.handler(d,uid?{auth:{uid,token:{auth_time:Math.floor(Date.now()/1000),...options.token}}}:{}),data,calls,state,sub};
}
test('requires authentication and enabled account',async()=>{await assert.rejects(harness().call({action:'status'},null),{code:'unauthenticated'});await assert.rejects(harness({user:{disabled:true}}).call({action:'status'}),{code:'permission-denied'});});
test('rejects sandbox keys and unknown actions',async()=>{await assert.rejects(harness({key:'sk_test_SAMPLE'}).call({action:'status'}),{code:'failed-precondition'});await assert.rejects(harness().call({action:'invent'}),{code:'invalid-argument'});});
for(const tier of Object.keys(PRICES))test('checkout uses fixed '+tier+' price and owner identity',async()=>{const h=harness();await h.call({action:'checkout',tier,price:'price_attacker',uid:'other'});const [,args,opts]=h.calls.find(c=>c[0]==='checkout');assert.equal(args.line_items[0].price,PRICES[tier]);assert.equal(args.client_reference_id,'owner');assert.equal(args.subscription_data.metadata.fynx_uid,'owner');assert.equal(args.metadata.product,PRODUCT);assert.equal(args.mode,'subscription');assert.match(opts.idempotencyKey,/fynx-consumer-live-checkout-/);assert.equal(h.data.get('fynxConsumerLive/owner').checkoutLockUntil,0);});
test('wrong price configuration prevents checkout',async()=>{const h=harness({price:{unit_amount:1}});await assert.rejects(h.call({action:'checkout',tier:'starter'}),{code:'failed-precondition'});assert.equal(h.calls.length,0);});
test('ambiguous Stripe failure reuses saved idempotency key',async()=>{const h=harness();h.state.failCreate=true;await assert.rejects(h.call({action:'checkout',tier:'starter'}));h.state.failCreate=false;await h.call({action:'checkout',tier:'starter'});const calls=h.calls.filter(c=>c[0]==='checkout');assert.equal(calls[0][2].idempotencyKey,calls[1][2].idempotencyKey);});
test('open same-tier checkout is reused',async()=>{const h=harness({customer:true});h.state.sessions=[{id:'cs_existing',url:'https://checkout.stripe.com/existing',metadata:{product:PRODUCT,tier:'starter'}}];assert.equal((await h.call({action:'checkout',tier:'starter'})).url,'https://checkout.stripe.com/existing');assert.equal(h.calls.length,0);});
test('existing unpaid subscription blocks duplicate payment and still permits billing portal',async()=>{const h=harness({paid:true});h.state.subscriptions[0].status='past_due';await assert.rejects(h.call({action:'checkout',tier:'starter'}),{code:'already-exists'});assert.equal((await h.call({action:'status'})).hasBillingAccount,true);assert.match((await h.call({action:'portal'})).url,/billing.stripe.com/);});
test('revocation is checked on the next tool request',async()=>{const h=harness({paid:true});assert.equal((await h.call({action:'status'})).tier,'starter');h.state.subscriptions[0].status='canceled';await assert.rejects(h.call({action:'run',product:'watchlist',input:{symbols:['AAPL']}}),{code:'permission-denied'});});
test('payment API outage never grants tools',async()=>{await assert.rejects(harness({customer:true,stripeDown:true}).call({action:'run',product:'watchlist',input:{symbols:['AAPL']}}),/Stripe unavailable/);});
test('higher-tier tools are denied and saved work is owner-scoped',async()=>{const h=harness({paid:true});await assert.rejects(h.call({action:'run',product:'portfolio',input:{}}),{code:'permission-denied'});await h.call({action:'save',product:'watchlist',name:'Research',input:{symbols:['AAPL']}});assert.equal((await h.call({action:'list'})).items.length,1);await assert.rejects(h.call({action:'list'},'other'),{code:'permission-denied'});});
test('downgrade masks higher-tier saved inputs and results without deleting the record',async()=>{
 const h=harness({paid:true,tier:'pro'}),path='fynxConsumerLive/owner/saved/stress-1';
 h.data.set(path,{name:'Original stress analysis',product:'portfolio',createdAt:1234,input:{balance:'9000'},result:{grossExposure:987654}});
 const before=(await h.call({action:'list'})).items[0];
 assert.equal(before.result.grossExposure,987654);
 h.state.subscriptions=[h.sub('starter')];
 const restricted=(await h.call({action:'list'})).items;
 assert.equal(restricted.length,1,'saved records remain visible');
 assert.equal(restricted[0].name,'Original stress analysis');
 assert.equal(restricted[0].locked,true);
 assert.equal(Object.hasOwn(restricted[0],'input'),false,'paid inputs must not be sent to a lower tier');
 assert.equal(Object.hasOwn(restricted[0],'result'),false,'paid results must not be sent to a lower tier');
 assert.ok(h.data.has(path),'downgrade cannot destroy stored work');
 h.state.subscriptions=[h.sub('pro')];
 const restored=(await h.call({action:'list'})).items[0];
 assert.equal(restored.result.grossExposure,987654,'restoring the eligible plan unlocks the original result');
 h.state.subscriptions=[h.sub('starter')];
 await h.call({action:'delete',id:'stress-1'});
 assert.equal(h.data.has(path),false,'customers can delete locked workspaces');
});

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
test('approved fresh Apple membership grants equivalent website tools and blocks duplicate checkout',async()=>{const h=harness({bridge:true});h.data.set('intelligenceEntitlements/owner',{source:'app-store-server',productId:'com.fynx.financeworld.monthly',environment:'Production',expiresAt:Date.now()+600000,verifiedAt:Date.now()-1000});assert.equal((await h.call({action:'status'})).tier,'pro');assert.equal((await h.call({action:'run',product:'watchlist',input:{symbols:['AAPL']}})).mode,'live');await assert.rejects(h.call({action:'checkout',tier:'pro'}),{code:'already-exists'});});
test('Apple equivalence is disabled by default and revoked or stale proof never grants access',async()=>{for(const options of [{},{bridge:true,revoked:true},{bridge:true,stale:true}]){const h=harness(options);h.data.set('intelligenceEntitlements/owner',{source:'app-store-server',productId:'com.fynx.financeworld.monthly',environment:'Production',expiresAt:Date.now()+600000,verifiedAt:Date.now()-(options.stale?86400001:1000),revoked:options.revoked===true});assert.equal((await h.call({action:'status'})).tier,null);}});

// Daily allowances on the server (audit Phase 5)
test('free daily analyses are counted on the server: 5 allowed, the 6th refused, repeats free',async()=>{
 const h=harness({customer:true});
 for(let i=1;i<=5;i++){const r=await h.call({action:'usage',cat:'analysis',key:'k'+i});assert.equal(r.allowed,true);assert.equal(r.used,i);assert.equal(r.tier,'free');assert.equal(r.limit,5);}
 assert.equal((await h.call({action:'usage',cat:'analysis',key:'k6'})).allowed,false);
 assert.equal((await h.call({action:'usage',cat:'analysis',key:'k3'})).repeat,true,'same analysis again is not charged');
 const read=await h.call({action:'usage',op:'read',cat:'all'});
 assert.equal(JSON.stringify(read.counts),JSON.stringify({analysis:5,ai:0,backtest:0}));assert.equal(read.limits.ai,2);assert.ok(read.resetAt>Date.now()&&read.resetAt-Date.now()<=86400000);
});
test('server day ignores anything the client sends about time, and usage is per account',async()=>{
 const h=harness({customer:true});
 await h.call({action:'usage',cat:'ai'});await h.call({action:'usage',cat:'ai',day:'1999-01-01',now:0});
 assert.equal((await h.call({action:'usage',cat:'ai'})).allowed,false,'free AI allowance is 2 per server day');
 const day=new Date().toISOString().slice(0,10);
 assert.equal(h.data.get('fynxConsumerLive/owner/usage/'+day).counts.ai,2);
 assert.ok(![...h.data.keys()].some(k=>k.includes('1999')),'client-supplied dates are not used');
 assert.equal((await h.call({action:'usage',cat:'ai'},'other')).allowed,true,'another account has its own allowance');
});
test('paid tiers use their own limits; Professional is unlimited and not written',async()=>{
 const h=harness({paid:true,tier:'plus'});
 const r=await h.call({action:'usage',cat:'backtest'});assert.equal(r.tier,'plus');assert.equal(r.limit,50);assert.equal(r.used,1);
 const p=harness({paid:true,tier:'pro'});
 for(let i=0;i<20;i++)assert.equal((await p.call({action:'usage',cat:'ai'})).allowed,true);
 assert.ok(![...p.data.keys()].some(k=>k.includes('/usage/')),'unlimited usage is not stored');
});
test('usage requests are validated',async()=>{
 const h=harness({customer:true});
 await assert.rejects(h.call({action:'usage',cat:'mining'}),{code:'invalid-argument'});
 await assert.rejects(h.call({action:'usage',cat:'ai',op:'reset'}),{code:'invalid-argument'});
 await assert.rejects(h.call({action:'usage',cat:'ai',key:'x'.repeat(301)}),{code:'invalid-argument'});
 await assert.rejects(harness().call({action:'usage',cat:'ai'},null),{code:'unauthenticated'});
});
test('server limits match the limits the website advertises',()=>{
 const src=fs.readFileSync(__dirname+'/../assets/js/fynx-plan.js','utf8'),block=/const LIMITS = (\{[\s\S]*?\n  \});/.exec(src)[1];
 const client=vm.runInNewContext('('+block+')',{Infinity});
 const server=(()=>{const m={exports:{}};vm.runInNewContext(fs.readFileSync(__dirname+'/consumer-live-workspace.cjs','utf8'),{module:m,exports:m.exports,require:n=>({'firebase-functions/v1':{https:{HttpsError:Error},runWith:()=>({https:{onCall:f=>f}})},'firebase-admin':{},'stripe':function(){}}[n]||require(n)),process:{env:{}},console});return m.exports._test.USAGE_LIMITS;})();
 for(const cat of Object.keys(client))for(const tier of ['free','starter','plus','pro'])assert.equal(server[cat][tier],Number.isFinite(client[cat][tier])?client[cat][tier]:null,cat+' '+tier);
});

test('paid Journal CSV retains dated records whose realized P/L cannot be used in analytics',async()=>{
 const h=harness({paid:true});
 const rows=[
  ['LOSS','-4.25','recorded loss'],
  ['ZERO',0,'recorded zero'],
  ['INVALID','not recorded','preserve note'],
  ['MISSING',undefined,'no realized outcome'],
  ['HEX','0x10','not decimal'],
 ];
 for(const [symbol,pl,notes] of rows)h.data.set('users/owner/trades/'+symbol,{date:'2026-11-01',dateTs:1,session:'NY',symbol,notes,...(pl===undefined?{}:{pl})});
 const {result:csv}=await h.call({action:'run',product:'export'});
 assert.equal(csv.rows,5);
 assert.match(csv.csv,/"LOSS","NY","-4\.25","recorded loss"/);
 assert.match(csv.csv,/"ZERO","NY","0","recorded zero"/);
 assert.match(csv.csv,/"INVALID","NY","'not recorded","preserve note"/);
 assert.match(csv.csv,/"MISSING","NY","","no realized outcome"/);
 assert.match(csv.csv,/"HEX","NY","'0x10","not decimal"/);
 // A value dropped before the core used to hide the omission notice.
 h.data.delete('users/owner/trades/HEX');
 const {result:analytics}=await h.call({action:'run',product:'analytics'});
 assert.equal(analytics.trades,2);
 assert.equal(analytics.netPL,-4.25);
 assert.match(analytics.notice,/Records with invalid realized P\/L were omitted/);
});

test('committed paid Journal saves replay even when the current Journal is unavailable',async()=>{
 const h=harness({paid:true});h.data.set('users/owner/trades/first',{pl:100,dateTs:1});
 const request={action:'save',accountUid:'owner',requestId:'12345678-1234-4234-8234-123456789abe',product:'analytics',name:'Saved snapshot',input:{}};
 const first=await h.call(request);
 assert.equal(first.id,'request-'+request.requestId);
 h.state.failTrades=true;
 await assert.rejects(h.call({action:'run',product:'analytics'}),/Journal temporarily unavailable/);
 await assert.rejects(h.call({...request,requestId:'12345678-1234-4234-8234-123456789abf'}),/Journal temporarily unavailable/);
 const retry=await h.call(request);
 assert.equal(retry.id,first.id);assert.deepEqual(retry.result,first.result);
 assert.equal(h.data.get('fynxConsumerLive/owner').savedCount,1);
 assert.equal((await h.call({action:'list'})).items.length,1);
 await assert.rejects(h.call({...request,name:'Changed name'}),{code:'already-exists'});
 h.state.subscriptions[0].status='canceled';
 await assert.rejects(h.call(request),{code:'permission-denied'});
});

test('paid workspace honors the highest verified tier regardless of subscription list order',async()=>{
 const h=harness({paid:true}),essential=h.sub('starter'),plus=h.sub('plus'),professional=h.sub('pro');
 professional.cancel_at_period_end=true;
 professional.items.data[0].current_period_end=2000000000;
 for(const subscriptions of [[essential,plus,professional],[professional,essential,plus]]){
  h.state.subscriptions=subscriptions;
  const status=await h.call({action:'status'});
  assert.equal(status.tier,'pro');
  assert.equal(status.subscription.cancelAtPeriodEnd,true);
  assert.equal(status.subscription.currentPeriodEnd,2000000000);
  assert.equal((await h.call({action:'run',product:'simulation',input:{balance:10000,riskPct:1,winRate:50,rewardRisk:2,trades:1}})).result.paths,500);
  assert.equal((await h.call({action:'list'})).limit,500);
  assert.equal((await h.call({action:'usage',cat:'analysis',op:'read'})).limit,null);
 }
});
test('paid workspace ignores unverified higher tiers and falls back after revocation',async()=>{
 const h=harness({paid:true}),essential=h.sub('starter'),plus=h.sub('plus'),professional=h.sub('pro');
 professional.latest_invoice.status='open';
 h.state.subscriptions=[professional,essential,plus];
 assert.equal((await h.call({action:'status'})).tier,'plus');
 assert.equal((await h.call({action:'list'})).limit,100);
 await assert.rejects(h.call({action:'run',product:'simulation',input:{}}),{code:'permission-denied'});
 plus.status='canceled';
 professional.latest_invoice.status='paid';
 professional.metadata.fynx_uid='another-user';
 assert.equal((await h.call({action:'status'})).tier,'starter');
 assert.equal((await h.call({action:'list'})).limit,25);
 await assert.rejects(h.call({action:'run',product:'portfolio',input:{}}),{code:'permission-denied'});
 essential.status='canceled';
 assert.equal((await h.call({action:'status'})).tier,null);
 await assert.rejects(h.call({action:'list'}),{code:'permission-denied'});
});

test('paid membership verifies the highest tier across Stripe subscription pages',async()=>{
 const h=harness({paid:true,paginated:true}),starter={...h.sub('starter'),id:'starter'},pro={...h.sub('pro'),id:'professional'};
 h.state.subscriptions=[...Array.from({length:99},(_,i)=>({...h.sub(),id:'old-'+i,status:'canceled'})),starter,pro];
 const status=await h.call({action:'status'});
 assert.equal(status.tier,'pro');
 const reads=h.calls.filter(c=>c[0]==='subscription-list');
 assert.equal(reads.length,2);
 assert.equal(reads[1][1].starting_after,'starter');
 assert.equal(reads[1][1].expand[0],'data.latest_invoice');
 assert.equal((await h.call({action:'list'})).limit,500);
});
test('later-page delinquent subscriptions prevent duplicate checkout',async()=>{
 const h=harness({customer:true,paginated:true});
 h.state.subscriptions=[...Array.from({length:100},(_,i)=>({...h.sub(),id:'old-'+i,status:'canceled'})),{...h.sub(),id:'delinquent',status:'past_due'}];
 await assert.rejects(h.call({action:'checkout',tier:'starter'}),{code:'already-exists'});
 assert.equal(h.calls.some(c=>c[0]==='checkout'),false);
 assert.equal(h.data.get('fynxConsumerLive/owner').checkoutLockUntil,0);
});
test('partial subscription history cannot grant access or start checkout and leaves portal available',async()=>{
 const h=harness({paid:true,paginated:true});
 h.state.subscriptions=[...Array.from({length:100},(_,i)=>({...h.sub(),id:'old-'+i,status:'canceled'})),{...h.sub(),id:'paid'}];
 h.state.subscriptions[0].status='active';
 h.state.failSubscriptionPage=true;
 const status=await h.call({action:'status'});
 assert.equal(status.tier,null);
 assert.equal(status.billingUnavailable,true);
 assert.equal(status.hasBillingAccount,true);
 await assert.rejects(h.call({action:'run',product:'watchlist',input:{symbols:['AAPL']}}),/Stripe unavailable/);
 await assert.rejects(h.call({action:'checkout',tier:'starter'}),/Stripe unavailable/);
 assert.equal(h.calls.some(c=>c[0]==='checkout'),false);
 assert.match((await h.call({action:'portal'})).url,/billing.stripe.com/);
});
test('overlong subscription history fails closed at the bounded page limit',async()=>{
 const h=harness({customer:true,paginated:true});
 h.state.subscriptions=Array.from({length:1001},(_,i)=>({...h.sub(),id:'old-'+i,status:'canceled'}));
 const status=await h.call({action:'status'});
 assert.equal(status.billingUnavailable,true);
 assert.equal(status.tier,null);
 assert.equal(h.calls.filter(c=>c[0]==='subscription-list').length,10);
 await assert.rejects(h.call({action:'checkout',tier:'starter'}),{code:'unavailable'});
 assert.equal(h.calls.some(c=>c[0]==='checkout'),false);
});

test('paid Journal Intelligence groups valid realized trades by their recorded session',async()=>{
 const h=harness({paid:true});
 const history=[['Asia',5],[' london ',12],['London',0],['New York','10'],['NY',-5],['Other',4],['',-2],['unrecognized',1],['Asia',null],['London','']];
 history.forEach(([session,pl],i)=>h.data.set('users/owner/trades/session-'+i,{session,pl,dateTs:i+1}));
 const {result}=await h.call({action:'run',product:'analytics'});
 assert.deepEqual(JSON.parse(JSON.stringify(result.rows)),[
  {session:'Asia',trades:1,winRatePercent:100,netPL:5},
  {session:'London',trades:2,winRatePercent:50,netPL:12},
  {session:'New York',trades:2,winRatePercent:50,netPL:5},
  {session:'Other',trades:1,winRatePercent:100,netPL:4},
  {session:'Unclassified',trades:2,winRatePercent:50,netPL:-1}
 ]);
 assert.equal(result.rows.reduce((n,row)=>n+row.trades,0),result.trades);
 assert.equal(result.rows.reduce((n,row)=>n+row.netPL,0),result.netPL);
 assert.match(result.notice,/use recorded Journal labels, not trade times/);
 assert.match(result.notice,/Records with invalid realized P\/L were omitted/);
 const request={action:'save',accountUid:'owner',requestId:'12345678-1234-4234-8234-123456789abc',product:'analytics',name:'Session breakdown',input:{}};
 const saved=await h.call(request);
 h.data.set('users/owner/trades/later',{dateTs:30,session:'London',pl:50});
 assert.equal(JSON.stringify((await h.call(request)).result.rows),JSON.stringify(saved.result.rows));
 assert.equal((await h.call({action:'run',product:'analytics'})).result.rows[1].netPL,62);
});

test('paid Journal Intelligence does not create a session table from invalid history',async()=>{
 const h=harness({paid:true});
 h.data.set('users/owner/trades/invalid',{session:'London',pl:null,dateTs:1});
 const {result}=await h.call({action:'run',product:'analytics'});
 assert.equal(result.trades,0);
 assert.equal(Object.hasOwn(result,'rows'),false);
});

const openCheckout=(id,tier,product=PRODUCT)=>({id,url:'https://checkout.stripe.com/'+id,metadata:{product,tier}});
test('same-tier reuse first expires all competing FYNX open sessions and preserves unrelated products',async()=>{
 const h=harness({customer:true});
 h.state.sessions=[openCheckout('cs_keep','starter'),openCheckout('cs_other','plus'),openCheckout('cs_duplicate','starter'),openCheckout('cs_unrelated','pro','other-product')];
 assert.equal((await h.call({action:'checkout',tier:'starter'})).url,'https://checkout.stripe.com/cs_keep');
 assert.deepEqual(h.calls.filter(c=>c[0]==='expire').map(c=>c[1]),['cs_other','cs_duplicate']);
 assert.equal(h.calls.some(c=>c[0]==='checkout'),false);
});
test('checkout reconciles later pages before reusing a session',async()=>{
 const h=harness({customer:true,paginatedCheckout:true});
 h.state.sessions=[openCheckout('cs_keep','starter'),...Array.from({length:99},(_,i)=>openCheckout('cs_unrelated_'+i,'plus','other-product')),openCheckout('cs_later','pro')];
 assert.equal((await h.call({action:'checkout',tier:'starter'})).url,'https://checkout.stripe.com/cs_keep');
 const lists=h.calls.filter(c=>c[0]==='checkout-list');
 assert.equal(lists.length,2);assert.equal(lists[1][1].starting_after,'cs_unrelated_98');
 assert.deepEqual(h.calls.filter(c=>c[0]==='expire').map(c=>c[1]),['cs_later']);
 assert.ok(h.calls.findIndex(c=>c[0]==='expire')>h.calls.lastIndexOf(lists[1]));
});
test('incomplete checkout history never expires sessions or creates a replacement',async()=>{
 const h=harness({customer:true,paginatedCheckout:true});
 h.state.sessions=Array.from({length:101},(_,i)=>openCheckout('cs_'+i,'plus'));
 h.state.failCheckoutPage=true;
 await assert.rejects(h.call({action:'checkout',tier:'starter'}),/Checkout list unavailable/);
 assert.equal(h.calls.some(c=>['expire','checkout'].includes(c[0])),false);
 assert.equal(h.data.get('fynxConsumerLive/owner').checkoutLockUntil,0);
});
test('failed expiration prevents checkout reuse or creation',async()=>{
 const h=harness({customer:true});
 h.state.sessions=[openCheckout('cs_keep','starter'),openCheckout('cs_other','plus')];
 h.state.failExpire=true;
 await assert.rejects(h.call({action:'checkout',tier:'starter'}),/Checkout expiration unavailable/);
 assert.equal(h.calls.some(c=>c[0]==='checkout'),false);
 assert.equal(h.data.get('fynxConsumerLive/owner').checkoutLockUntil,0);
});
test('checkout creates a new session only after expiring competing tiers',async()=>{
 const h=harness({customer:true});
 h.state.sessions=[openCheckout('cs_old','plus')];
 assert.match((await h.call({action:'checkout',tier:'starter'})).url,/cs_new/);
 assert.deepEqual(h.calls.map(c=>c[0]),['expire','checkout']);
});

test('bounded open checkout pagination fails closed instead of processing partial history',async()=>{
 const h=harness({customer:true,paginatedCheckout:true});
 h.state.sessions=Array.from({length:1001},(_,i)=>openCheckout('cs_'+i,'plus'));
 await assert.rejects(h.call({action:'checkout',tier:'starter'}),{code:'unavailable'});
 assert.equal(h.calls.filter(c=>c[0]==='checkout-list').length,10);
 assert.equal(h.calls.some(c=>['expire','checkout'].includes(c[0])),false);
 assert.equal(h.data.get('fynxConsumerLive/owner').checkoutLockUntil,0);
});

test('verified Apple website access survives Stripe subscription lookup failure',async()=>{
 const h=harness({bridge:true,customer:true,stripeDown:true});
 h.data.set('intelligenceEntitlements/owner',{source:'app-store-server',productId:'com.fynx.financeworld.monthly',environment:'Production',expiresAt:Date.now()+600000,verifiedAt:Date.now()-1000});
 const status=await h.call({action:'status'});
 assert.equal(status.tier,'pro');assert.equal(status.accessProvider,'apple');
 assert.equal(status.billingUnavailable,undefined);assert.equal(status.stripeBillingUnavailable,true);
 assert.equal(status.hasBillingAccount,true);
 assert.equal((await h.call({action:'run',product:'watchlist',input:{symbols:['AAPL']}})).mode,'live');
 assert.equal((await h.call({action:'list'})).limit,PLANS.pro.saved);
 await assert.rejects(h.call({action:'checkout',tier:'pro'}),{code:'already-exists'});
 assert.match((await h.call({action:'portal'})).url,/billing.stripe.com/);
 assert.equal(h.calls.some(c=>c[0]==='checkout'),false);
});

test('verified Apple website access survives missing live Stripe configuration without enabling checkout',async()=>{
 const h=harness({bridge:true,customer:true,key:'sk_test_SAMPLE'});
 const proof={source:'app-store-server',productId:'com.fynx.financeworld.monthly',environment:'Production',expiresAt:Date.now()+600000,verifiedAt:Date.now()-1000};
 h.data.set('intelligenceEntitlements/owner',proof);
 const status=await h.call({action:'status'});
 assert.equal(status.tier,'pro');assert.equal(status.accessProvider,'apple');
 assert.equal(status.billingUnavailable,undefined);assert.equal(status.stripeBillingUnavailable,true);
 assert.equal((await h.call({action:'run',product:'watchlist',input:{symbols:['AAPL']}})).mode,'live');
 await assert.rejects(h.call({action:'checkout',tier:'pro'}),{code:'already-exists'});
 await assert.rejects(h.call({action:'portal'}),{code:'failed-precondition'});
 h.data.set('intelligenceEntitlements/owner',{...proof,revoked:true});
 await assert.rejects(h.call({action:'status'}),{code:'failed-precondition'});
 await assert.rejects(h.call({action:'run',product:'watchlist',input:{symbols:['AAPL']}}),{code:'failed-precondition'});
 assert.equal(h.calls.some(c=>c[0]==='checkout'),false);
});

for(const tier of ['starter','plus'])test('replacement checkout preserves retry identity after an expired session ('+tier+')',async()=>{
 const h=harness({customer:true}),path='fynxConsumerLive/owner';
 h.data.set(path,{customer:'cus_owner',savedCount:7,checkoutAttempt:{tier:'starter',tool:'analytics',at:Date.now()-1000,key:'old-attempt',session:'cs_expired'}});
 h.state.failCreate=true;
 await assert.rejects(h.call({action:'checkout',tier,tool:'risk'}),/Timeout/);
 const pending=h.data.get(path).checkoutAttempt;
 assert.equal(Object.hasOwn(pending,'session'),false,'a new attempt must not inherit the old session');
 assert.notEqual(pending.key,'old-attempt');
 assert.equal(pending.tier,tier);
 assert.equal(h.data.get(path).checkoutLockUntil,0);
 h.state.failCreate=false;
 await h.call({action:'checkout',tier,tool:'watchlist'});
 const attempts=h.calls.filter(c=>c[0]==='checkout');
 assert.equal(attempts.length,2);
 assert.equal(attempts[0][2].idempotencyKey,attempts[1][2].idempotencyKey);
 assert.deepEqual(attempts[0][1],attempts[1][1]);
 assert.equal(h.data.get(path).checkoutAttempt.session,'cs_new');
 assert.equal(h.data.get(path).savedCount,7);
 assert.equal(h.data.get(path).customer,'cus_owner');
 assert.equal(h.data.get(path).checkoutLockUntil,0);
});
