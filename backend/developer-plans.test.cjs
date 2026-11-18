const {test}=require('node:test');const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const plans=require('./developer-plans.cjs'),{entitlement,effectiveCap}=require('./developer-core.cjs');
const IDS={meterEventName:'fynx_api_overage_blocks',developer:{base:'price_dev_base',overage:'price_dev_over'},business:{base:'price_biz_base',overage:'price_biz_over'}};
const later=Date.now()+60000;
test('approved plan catalog',()=>{
 const c=plans.catalog().plans;
 assert.deepEqual([c.free.monthly_price,c.free.monthly_calls,c.free.overage_per_1000],[0,1000,null]);
 assert.deepEqual([c.developer.monthly_price,c.developer.monthly_calls,c.developer.overage_per_1000],[19,25000,0.5]);
 assert.deepEqual([c.business.monthly_price,c.business.monthly_calls,c.business.overage_per_1000],[99,250000,0.3]);
 assert.equal(c.enterprise.custom,true);assert.deepEqual([c.pro.monthly_price,c.pro.monthly_calls,c.pro.legacy],[49,50000,true]);
});
test('entitlement: live only, fresh billing check only, unknown plans fail closed',()=>{
 assert.equal(entitlement({plan:'developer',planCheckedUntil:later},'live').monthlyCalls,25000);
 assert.equal(entitlement({plan:'business',planCheckedUntil:later},'live').rps,50);
 assert.equal(entitlement({plan:'business',planCheckedUntil:later},'test').plan,'free');
 assert.equal(entitlement({plan:'business',planCheckedUntil:1},'live').plan,'free');
 for(const plan of ['enterprise','toString','__proto__','admin'])assert.equal(entitlement({plan,planCheckedUntil:later},'live').plan,'free',plan);
 assert.equal(entitlement({plan:'pro',planCheckedUntil:later},'live').overage,false);
});
test('caps: overage only with an explicit cap, never above 10x, never on Free or legacy Pro',()=>{
 const dev=entitlement({plan:'developer',planCheckedUntil:later},'live'),pro=entitlement({plan:'pro',planCheckedUntil:later},'live'),free=entitlement({},'live');
 assert.equal(effectiveCap({},dev),25000);
 assert.equal(effectiveCap({requestCap:100000},dev),25000,'implicit cap cannot exceed the allowance');
 assert.equal(effectiveCap({requestCap:100000,requestCapExplicit:true},dev),100000);
 assert.equal(effectiveCap({requestCap:10**7,requestCapExplicit:true},dev),250000);
 assert.equal(effectiveCap({requestCap:500,requestCapExplicit:true},dev),500);
 assert.equal(effectiveCap({requestCap:100000,requestCapExplicit:true},pro),50000);
 assert.equal(effectiveCap({requestCap:5000,requestCapExplicit:true},free),1000);
 assert.equal(plans.capCeiling(dev),250000);assert.equal(plans.capCeiling(free),1000);
});
test('overage blocks start at each 1,000 extra calls',()=>{
 assert.deepEqual([25000,25001,26000,26001,27000,27001].map(n=>plans.overageBlock(n,25000)),[0,1,1,2,2,3]);
});
test('new tiers are not sold until their Stripe IDs are configured',()=>{
 plans._configure(null);assert.deepEqual(plans.purchasable(),['pro']);
 plans._configure({...IDS,business:{base:null,overage:null}});assert.deepEqual(plans.purchasable(),['developer']);
 plans._configure(IDS);assert.deepEqual(plans.purchasable(),['developer','business']);plans._configure(null);
});
const base=(tier,p={})=>({id:IDS[tier].base,livemode:true,active:true,type:'recurring',currency:'usd',unit_amount:tier==='developer'?1900:9900,recurring:{interval:'month',interval_count:1,usage_type:'licensed'},...p});
const over=(tier,p={})=>({id:IDS[tier].overage,livemode:true,active:true,type:'recurring',currency:'usd',billing_scheme:'per_unit',unit_amount:tier==='developer'?50:30,recurring:{interval:'month',interval_count:1,usage_type:'metered',meter:'mtr_1'},...p});
const sub=(tier='developer')=>({customer:'cus_owner',livemode:true,status:'active',metadata:{product:'fynx_api',fynx_uid:'owner',tier},items:{data:[{quantity:1,price:base(tier)},{price:over(tier)}]},latest_invoice:{customer:'cus_owner',livemode:true,status:'paid',paid:true}});
test('only an exact paid Developer or Business subscription qualifies',()=>{
 plans._configure(IDS);
 assert.equal(plans.tierSubscription(sub(),'owner','cus_owner','fynx_api'),'developer');
 assert.equal(plans.tierSubscription(sub('business'),'owner','cus_owner','fynx_api'),'business');
 const bad=[s=>s.status='past_due',s=>s.livemode=false,s=>s.metadata.fynx_uid='x',s=>s.metadata.tier='business',s=>s.metadata.tier='enterprise',s=>s.items.data[0].quantity=2,s=>s.items.data[0].price.unit_amount=100,s=>s.items.data[1].price.unit_amount=1,s=>s.items.data[1].price.recurring.usage_type='licensed',s=>s.items.data.pop(),s=>s.latest_invoice.paid=false,s=>s.customer='cus_other',s=>s.items.data[0].price.currency='eur'];
 for(const m of bad){const s=sub();m(s);assert.equal(plans.tierSubscription(s,'owner','cus_owner','fynx_api'),null,String(m));}
 plans._configure(null);assert.equal(plans.tierSubscription(sub(),'owner','cus_owner','fynx_api'),null,'unconfigured tiers never confer a plan');
});
// Billing module harness (same stub approach as developer-billing-live.test.cjs).
function billing(options={}){
 const records=new Map([['fynxDevelopers/owner',{name:'QA',plan:'free',requestCap:1000,stripeLiveCustomer:'cus_owner'}]]),calls=[];
 const snap=p=>({exists:records.has(p),data:()=>records.get(p)});
 const ref=p=>({path:p,get:async()=>snap(p),set:async(v,o)=>records.set(p,o?.merge?{...records.get(p),...v}:v),collection:n=>({doc:id=>ref(p+'/'+n+'/'+id),where:()=>({limit:()=>({get:async()=>({empty:true,docs:[]})})})})});
 const db={collection:p=>({doc:id=>ref(p+'/'+id)}),runTransaction:async f=>f({get:async r=>snap(r.path),set:(r,v,o)=>r.set(v,o),create:(r,v)=>r.set(v)})};
 const prices={[IDS.developer.base]:base('developer'),[IDS.developer.overage]:over('developer'),[IDS.business.base]:base('business'),[IDS.business.overage]:over('business'),...options.prices};
 const stripe={subscriptions:{list:async()=>({data:options.subs||[]})},prices:{retrieve:async id=>prices[id]},customers:{create:async()=>({id:'cus_owner'})},invoices:{list:async()=>({data:[]})},checkout:{sessions:{list:async()=>({data:[]}),retrieve:async()=>({status:'expired'}),create:async(args,o)=>{calls.push([args,o]);return {id:'cs',url:'https://checkout.stripe.com/x'};}}}};
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const stubs={'firebase-functions/v1':{https:{HttpsError},runWith:()=>({https:{onCall:f=>f}})},'firebase-functions/logger':{info(){},error(){}},'firebase-admin':{firestore:()=>db,auth:()=>({getUser:async()=>({email:'o@example.invalid',emailVerified:true})})},stripe:function(){return stripe;}};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(__dirname+'/developer-billing.cjs','utf8'),{module,exports:module.exports,require:n=>stubs[n]||require(n),Date,process:{env:{FYNX_API_STRIPE_SECRET_KEY:'sk_live_UNIT_TEST_ONLY'}}});
 return {records,calls,refresh:()=>module.exports.refresh('owner',true),call:data=>module.exports._test.billing(data,{auth:{uid:'owner'}})};
}
test('checkout sells the configured tier with base and metered prices, tagged with the tier',async()=>{
 plans._configure(IDS);const h=billing();
 const r=await h.call({action:'checkout',plan:'business'});assert.equal(r.url,'https://checkout.stripe.com/x');
 const [args]=h.calls[0];assert.equal(JSON.stringify(args.line_items),JSON.stringify([{quantity:1,price:'price_biz_base'},{price:'price_biz_over'}]));assert.equal(args.metadata.tier,'business');assert.equal(args.subscription_data.metadata.tier,'business');
 await assert.rejects(h.call({action:'checkout',plan:'pro'}),/not available/,'legacy Pro is not sold once new tiers are live');
 await assert.rejects(h.call({action:'checkout',plan:'enterprise'}),/not available/);
 plans._configure(null);
});
test('checkout refuses a tampered Stripe price and takes no payment',async()=>{
 plans._configure(IDS);const h=billing({prices:{price_dev_over:over('developer',{unit_amount:5000})}});
 await assert.rejects(h.call({action:'checkout',plan:'developer'}),/temporarily unavailable/);assert.equal(h.calls.length,0);plans._configure(null);
});
test('refresh recognizes a paid Developer subscription and grants its limits',async()=>{
 plans._configure(IDS);const h=billing({subs:[sub('developer')]});
 assert.equal((await h.refresh()).plan,'developer');const p=h.records.get('fynxDevelopers/owner');
 assert.equal(entitlement(p,'live').monthlyCalls,25000);assert.equal(effectiveCap(p,entitlement(p,'live')),25000);
 plans._configure(null);assert.equal((await h.refresh()).plan,'free','unconfigured tier fails closed');
});
