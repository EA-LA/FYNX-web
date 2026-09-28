'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PLANS}=require('./consumer-core.cjs');
const {PRODUCT,PRICES,priceMatches,planForSubscription}=require('./consumer-live-policy.cjs');
function subscription(tier='starter'){return {customer:'cus_owner',status:'active',livemode:true,metadata:{product:PRODUCT,fynx_uid:'owner',tier},items:{data:[{quantity:1,price:{id:PRICES[tier],active:true,type:'recurring',livemode:true,currency:'usd',unit_amount:PLANS[tier].cents,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}}}]},latest_invoice:{livemode:true,customer:'cus_owner',status:'paid',paid:true}};}
for(const tier of Object.keys(PRICES))test(tier+' grants the exact purchased live tier only after payment',()=>{assert.equal(planForSubscription(subscription(tier),'owner','cus_owner'),tier);});
const cases={
 'test subscription':s=>s.livemode=false,
 'different customer':s=>s.customer='cus_other',
 'different user':s=>s.metadata.fynx_uid='other',
 'different product':s=>s.metadata.product='fynx_api',
 'forged tier':s=>s.metadata.tier='pro',
 'prototype tier':s=>s.metadata.tier='toString',
 'wrong live price':s=>s.items.data[0].price.id='price_other',
 'test price':s=>s.items.data[0].price.livemode=false,
 'wrong amount':s=>s.items.data[0].price.unit_amount=1,
 'wrong currency':s=>s.items.data[0].price.currency='eur',
 'annual recurrence':s=>s.items.data[0].price.recurring.interval='year',
 'wrong interval count':s=>s.items.data[0].price.recurring.interval_count=2,
 'metered billing':s=>s.items.data[0].price.recurring.usage_type='metered',
 'wrong quantity':s=>s.items.data[0].quantity=2,
 'extra items':s=>s.items.data.push(s.items.data[0]),
 'unexpanded invoice':s=>s.latest_invoice='in_unverified',
 'unpaid invoice':s=>s.latest_invoice.paid=false,
 'open invoice':s=>s.latest_invoice.status='open',
 'test invoice':s=>s.latest_invoice.livemode=false,
 'invoice for another customer':s=>s.latest_invoice.customer='cus_other',
 'paused collection':s=>s.pause_collection={behavior:'void'},
};
for(const [name,mutate] of Object.entries(cases))test('denies '+name,()=>{const s=subscription();mutate(s);assert.equal(planForSubscription(s,'owner','cus_owner'),null);});
for(const status of ['incomplete','incomplete_expired','trialing','past_due','unpaid','canceled','paused'])test('denies '+status+' subscription',()=>{const s=subscription();s.status=status;assert.equal(planForSubscription(s,'owner','cus_owner'),null);});
test('scheduled cancellation preserves already-paid access',()=>{const s=subscription();s.cancel_at_period_end=true;assert.equal(planForSubscription(s,'owner','cus_owner'),'starter');});
test('missing subscription and invalid prices fail closed',()=>{assert.equal(planForSubscription(null,'owner','cus_owner'),null);assert.equal(priceMatches(null,'starter'),false);assert.equal(priceMatches({},'toString'),false);});
