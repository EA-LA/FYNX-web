'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./scripts/billing-harness.cjs');
const subscription=(status='active',product='fynx_api')=>({id:'sub_qa',status,metadata:{product},cancel_at_period_end:false,items:{data:[{current_period_end:2000000000}]}});
test('billing requires authenticated verified enabled user and valid action',async()=>{
 await assert.rejects(harness().call('checkout',{}),{code:'unauthenticated'});
 for(const user of [{emailVerified:false},{disabled:true}])await assert.rejects(harness({user}).call('checkout'),{code:'failed-precondition'});
 await assert.rejects(harness().call('invalid'),{code:'invalid-argument'});
});
test('test checkout persists one waitlist audit, never opens checkout or grants Pro',async()=>{const h=harness();assert.equal((await h.call('checkout')).waitlist,true);const joined=h.records.get('fynxDevelopers/qa').proWaitlistJoinedAt;await h.call('checkout');assert.equal(h.records.size,3);assert.equal(h.records.get('fynxDevelopers/qa').proWaitlistJoinedAt,joined);assert.equal(h.calls.length,0);assert.equal((await h.refresh()).plan,'free');});
test('test mode removes stale paid entitlement and denies portal',async()=>{const h=harness({profile:{plan:'pro',stripeCustomer:'cus_qa'}});assert.equal((await h.refresh()).plan,'free');assert.equal(h.records.get('fynxDevelopers/qa').plan,'free');await assert.rejects(h.call('portal'),{code:'failed-precondition'});assert.equal(h.calls.length,0);});
test('summary exposes fixed pricing and no automatic overages',async()=>{const result=await harness().call('summary');assert.equal(result.billing_mode,'test');assert.equal(result.pricing.price,49);assert.equal(result.pricing.monthlyCalls,50000);assert.equal(result.pricing.overage,'disabled');assert.equal(result.invoices.length,0);});
test('only active FYNX API subscriptions grant Pro',async()=>{for(const status of ['active','trialing','past_due','incomplete','unpaid','paused','canceled']){const h=harness({live:true,profile:{stripeCustomer:'cus_qa'},subscriptions:[subscription(status)]});assert.equal((await h.refresh()).plan,status==='active'?'pro':'free');}assert.equal((await harness({live:true,profile:{stripeCustomer:'cus_qa'},subscriptions:[subscription('active','other')]}).refresh()).plan,'free');});
test('existing unsettled subscriptions prevent duplicate checkout',async()=>{for(const status of ['active','trialing','past_due','incomplete','unpaid','paused']){const h=harness({live:true,profile:{stripeCustomer:'cus_qa'},subscriptions:[subscription(status)]});await assert.rejects(h.call('checkout'),{code:'already-exists'});assert(!h.calls.some(c=>c.method==='checkout.sessions.create'));}});
test('open checkout from an older or unrecorded terms version is rejected',async()=>{const h=harness({live:true,profile:{stripeCustomer:'cus_qa'},sessions:[{metadata:{product:'fynx_api'},url:'existing'}]});await assert.rejects(h.call('checkout'),{code:'failed-precondition'});assert(!h.calls.some(c=>c.method==='checkout.sessions.create'));});
test('new checkout uses fixed monthly USD price, product attribution and idempotency',async()=>{const h=harness({live:true});await h.call('checkout');const [p,o]=h.calls.find(c=>c.method==='checkout.sessions.create').args;assert.equal(p.mode,'subscription');assert.equal(p.line_items[0].price_data.unit_amount,4900);assert.equal(p.line_items[0].price_data.currency,'usd');assert.equal(p.line_items[0].price_data.recurring.interval,'month');assert.equal(p.subscription_data.metadata.product,'fynx_api');assert.equal(p.subscription_data.metadata.fynx_uid,'qa');assert.match(o.idempotencyKey,/^fynx-api-checkout-qa-/);assert.match(p.success_url,/^https:\/\/www.fynxfinanceworld.com\/api\/workspace.html#billing$/);});
test('billing portal offers period-end cancellation and invoices',async()=>{const h=harness({live:true,profile:{stripeCustomer:'cus_qa'}});await h.call('portal');const p=h.calls.find(c=>c.method==='billingPortal.configurations.create').args[0];assert.equal(p.features.subscription_cancel.mode,'at_period_end');assert.equal(p.features.invoice_history.enabled,true);});
test('billing throttle rejects request 31',async()=>{const h=harness();for(let i=0;i<30;i++)await h.call('checkout');await assert.rejects(h.call('checkout'),{code:'resource-exhausted'});});
test('Stripe failures propagate without granting entitlement',async()=>{const h=harness({live:true,profile:{stripeCustomer:'cus_qa'},stripeError:true});await assert.rejects(h.refresh(),/Stripe unavailable/);assert.equal(h.records.get('fynxDevelopers/qa').plan,'free');});

test('live credential alone cannot activate checkout; existing subscribers retain portal access',async()=>{
 const h=harness({live:true,paidEnabled:false,profile:{stripeCustomer:'cus_qa'},subscriptions:[subscription()]});
 assert.equal((await h.call('checkout')).waitlist,true);
 assert(!h.calls.some(c=>c.method==='checkout.sessions.create'));
 assert.equal((await h.refresh()).plan,'pro');
 await h.call('portal');
 assert(h.calls.some(c=>c.method==='billingPortal.sessions.create'));
});

test('paid checkout fails closed for unapproved legal release or missing acceptance',async()=>{
 for(const opts of [{legalRelease:require('./legal-release.json')},{accepted:false},{recurring:false}]){const h=harness({live:true,...opts});await assert.rejects(h.call('checkout'),{code:'failed-precondition'});assert(!h.calls.some(c=>c.method==='checkout.sessions.create'||c.method==='customers.create'));}
});
test('checkout requires Stripe terms confirmation, tax configuration and version metadata',async()=>{
 const h=harness({live:true});await h.call('checkout');const p=h.calls.find(c=>c.method==='checkout.sessions.create').args[0];assert.equal(p.consent_collection.terms_of_service,'required');assert.equal(p.automatic_tax.enabled,true);assert.equal(p.billing_address_collection,'required');assert.equal(p.line_items[0].price_data.tax_behavior,'exclusive');assert.equal(p.metadata.legal_release_hash,h.legal.describe().bundle_sha256);assert.equal(p.subscription_data.metadata.legal_version,'test-v1');
});
test('matching open checkout is reused',async()=>{
 const sessions=[{metadata:{product:'fynx_api'},url:'existing'}],h=harness({live:true,profile:{stripeCustomer:'cus_qa'},sessions});sessions[0].metadata.legal_release_hash=h.legal.describe().bundle_sha256;assert.equal((await h.call('checkout')).url,'existing');
});
test('cancellation remains accessible when legal release is blocked',async()=>{const h=harness({live:true,profile:{stripeCustomer:'cus_qa'},legalRelease:require('./legal-release.json')});await h.call('portal');assert(h.calls.some(c=>c.method==='billingPortal.sessions.create'));});
