'use strict';
// Server-owned plan lookup for My Accounts. The browser never decides a plan: the tier comes from the
// member's paid FYNX consumer subscription, verified against Stripe with the same rules the
// consumer workspace uses (active, live mode, matching price, paid latest invoice, owned by this uid).
const {planForSubscription}=require('../consumer-live-policy.cjs');

const TIERS=Object.freeze(['starter','plus','pro']);
const rank=tier=>TIERS.indexOf(tier);
// A tier meets a requirement when it is the same or higher (Professional covers everything).
function meetsPlan(tier,required){return !!required&&rank(tier)>=0&&rank(tier)>=rank(required);}

/**
 * createConsumerPlanResolver({stripe, profileOf, ttlMs, now}) -> async uid => 'starter'|'plus'|'pro'|null
 * - stripe: a Stripe client (only subscriptions.list is used)
 * - profileOf: async uid => {customer} (the existing fynxConsumerLive/{uid} document)
 * Results are cached briefly so the sync scheduler does not call Stripe on every pass. Failures
 * return null (no paid access) and are not cached, so a transient error never grants or keeps access
 * longer than the cache window.
 */
function createConsumerPlanResolver({stripe,profileOf,ttlMs=5*60*1000,now=()=>Date.now()}={}){
  if(!stripe||typeof profileOf!=='function')return async()=>null;
  const cache=new Map();
  async function resolve(uid){
    if(typeof uid!=='string'||!uid)return null;
    const hit=cache.get(uid);if(hit&&hit.expires>now())return hit.tier;
    let tier=null;
    try{
      const profile=await profileOf(uid)||{};
      if(typeof profile.customer==='string'&&profile.customer){
        const list=await stripe.subscriptions.list({customer:profile.customer,status:'all',limit:100,expand:['data.latest_invoice']});
        for(const sub of list?.data||[]){const t=planForSubscription(sub,uid,profile.customer);if(t&&rank(t)>rank(tier))tier=t;}
      }
    }catch{return null;}
    cache.set(uid,{tier,expires:now()+ttlMs});
    if(cache.size>5000)cache.delete(cache.keys().next().value);
    return tier;
  }
  resolve.forget=uid=>cache.delete(uid);
  return resolve;
}

/** Production wiring: Firestore profile + Stripe secret from the deployment's secret manager. */
function createProductionPlanResolver({env=process.env}={}){
  const key=env.FYNX_CONSUMER_STRIPE_SECRET_KEY;
  if(!key)return async()=>null;
  const Stripe=require('stripe'),admin=require('firebase-admin');
  const stripe=new Stripe(key);
  return createConsumerPlanResolver({stripe,profileOf:async uid=>(await admin.firestore().collection('fynxConsumerLive').doc(uid).get()).data()||{}});
}

module.exports={TIERS,meetsPlan,createConsumerPlanResolver,createProductionPlanResolver};
