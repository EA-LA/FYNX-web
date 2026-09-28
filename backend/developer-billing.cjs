'use strict';
const functions=require('firebase-functions/v1'),admin=require('firebase-admin'),Stripe=require('stripe'),logger=require('firebase-functions/logger');
const {PRICE,PRODUCT,validPrice,paidSubscription,defaultCap}=require('./developer-billing-policy.cjs');
const SITE='https://www.fynxfinanceworld.com/api/workspace.html';
const root=uid=>admin.firestore().collection('fynxDevelopers').doc(uid);
const fail=(code,message)=>{throw new functions.https.HttpsError(code,message);};
function stripe(){const key=(process.env.FYNX_API_STRIPE_SECRET_KEY||'').trim();if(!/^(sk|rk)_live_/.test(key))fail('failed-precondition','API billing is temporarily unavailable.');return new Stripe(key,{maxNetworkRetries:2,timeout:15000});}
async function invalidate(uid){const ref=root(uid);await admin.firestore().runTransaction(async tx=>{const p=(await tx.get(ref)).data();if(p)tx.set(ref,{planCheckedUntil:0,billingRevision:(p.billingRevision||0)+1},{merge:true});});}
async function refresh(uid,force=false,attempt=0){
 const ref=root(uid);if(force)await invalidate(uid);const p=(await ref.get()).data()||{};
 if(!p.stripeLiveCustomer){const state={plan:'free',subscription:null,planCheckedUntil:0,billingVersion:2};if(p.plan==='pro'||p.billingVersion!==2)await ref.set(state,{merge:true});return state;}
 if(p.billingVersion===2&&p.planCheckedUntil>Date.now())return {plan:p.plan||'free',subscription:p.subscription||null,planCheckedUntil:p.planCheckedUntil};
 const list=await stripe().subscriptions.list({customer:p.stripeLiveCustomer,status:'all',limit:100,expand:['data.latest_invoice']});
 const sub=list.data.find(s=>paidSubscription(s,uid,p.stripeLiveCustomer));
 const state={plan:sub?'pro':'free',subscription:sub?{id:sub.id,status:sub.status,cancel_at_period_end:sub.cancel_at_period_end,current_period_end:sub.items.data[0]?.current_period_end||sub.current_period_end||null}:null,planCheckedUntil:Date.now()+60000,billingVersion:2};
 const applied=await admin.firestore().runTransaction(async tx=>{const current=(await tx.get(ref)).data()||{};if(current.stripeLiveCustomer!==p.stripeLiveCustomer||(current.billingRevision||0)!==(p.billingRevision||0))return false;tx.set(ref,{...state,...(sub&&defaultCap(current)?{requestCap:null}:{})},{merge:true});return true;});
 if(!applied){if(attempt>=2)fail('unavailable','Billing is updating. Retry shortly.');return refresh(uid,false,attempt+1);}return state;
}
async function billing(data,context){
 if(!['summary','checkout','portal'].includes(data?.action))fail('invalid-argument','Unknown billing action.');
 if(!context.auth)fail('unauthenticated','Sign in first.');const uid=context.auth.uid,user=await admin.auth().getUser(uid);if(user.disabled||!user.emailVerified)fail('failed-precondition','Verify your email before managing billing.');
 const ref=root(uid),rate=ref.collection('private').doc('billingRate');
 await admin.firestore().runTransaction(async tx=>{const r=(await tx.get(rate)).data()||{},minute=Math.floor(Date.now()/60000),count=r.minute===minute?(r.count||0)+1:1;if(count>30)fail('resource-exhausted','Too many billing requests. Retry in a minute.');tx.set(rate,{minute,count});});
 const profile=(await ref.get()).data();if(!profile)fail('failed-precondition','Open your workspace first.');const s=stripe();
 if(data.action==='summary'){
  const state=await refresh(uid,true);
  const invoices=profile.stripeLiveCustomer?(await s.invoices.list({customer:profile.stripeLiveCustomer,limit:20})).data.map(i=>({id:i.id,number:i.number,status:i.status,amount_due:i.amount_due,currency:i.currency,created:i.created,url:i.hosted_invoice_url,pdf:i.invoice_pdf})):[];
  return {...state,invoices,billing_mode:'live',hasBillingAccount:!!profile.stripeLiveCustomer,pricing:{price:49,monthlyCalls:50000,rps:30,overage:'disabled',currency:'USD'},spend_limit:'$49 subscription base; no automatic usage overages'};
 }
 if(data.action==='portal'){
  if(!profile.stripeLiveCustomer)fail('failed-precondition','No paid billing account exists for this workspace yet.');
  const config=await s.billingPortal.configurations.create({business_profile:{headline:'FYNX API billing'},features:{customer_update:{enabled:true,allowed_updates:['email','address','tax_id']},invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'}}},{idempotencyKey:'fynx-api-live-portal-v2'});
  return {url:(await s.billingPortal.sessions.create({customer:profile.stripeLiveCustomer,configuration:config.id,return_url:SITE+'#billing'})).url};
 }
 await admin.firestore().runTransaction(async tx=>{const p=(await tx.get(ref)).data();if(p.checkoutLockUntil>Date.now())fail('aborted','Checkout is already opening. Retry shortly.');tx.set(ref,{checkoutLockUntil:Date.now()+120000},{merge:true});});
 try{
  const price=await s.prices.retrieve(PRICE);if(!validPrice(price)||!price.active)fail('failed-precondition','API Pro is temporarily unavailable. No payment was taken.');
  let customer=(await ref.get()).data().stripeLiveCustomer;
  if(!customer){const c=await s.customers.create({email:user.email,name:profile.name,metadata:{fynx_uid:uid,product:PRODUCT}},{idempotencyKey:'fynx-api-live-customer-'+uid});customer=c.id;await ref.set({stripeLiveCustomer:customer,planCheckedUntil:0},{merge:true});}
  const subscriptions=await s.subscriptions.list({customer,status:'all',limit:100});if(subscriptions.data.some(x=>x.metadata?.product===PRODUCT&&['active','trialing','past_due','incomplete','unpaid','paused'].includes(x.status)))fail('already-exists','You already have a subscription. Use Manage billing.');
  const sessions=await s.checkout.sessions.list({customer,status:'open',limit:100});const existing=sessions.data.find(x=>x.metadata?.product===PRODUCT&&x.metadata.fynx_uid===uid);if(existing)return {url:existing.url};
  let attempt=(await ref.get()).data().checkoutAttempt;
  if(attempt?.session&&(await s.checkout.sessions.retrieve(attempt.session)).status!=='open')attempt=null;
  if(!attempt||Date.now()-attempt.at>23*3600000){attempt={at:Date.now(),key:'fynx-api-live-checkout-'+require('node:crypto').randomUUID()};await ref.set({checkoutAttempt:attempt},{merge:true});}
  const meta={product:PRODUCT,fynx_uid:uid};
  const session=await s.checkout.sessions.create({mode:'subscription',customer,success_url:SITE+'?checkout=complete#billing',cancel_url:SITE+'?checkout=cancelled#billing',client_reference_id:uid,metadata:meta,subscription_data:{metadata:meta},payment_method_types:['card'],line_items:[{quantity:1,price:PRICE}]},{idempotencyKey:attempt.key});
  await ref.set({checkoutAttempt:{...attempt,session:session.id}},{merge:true});return {url:session.url};
 }finally{await ref.set({checkoutLockUntil:0},{merge:true});}
}
exports.refresh=refresh;exports.root=root;exports.stripe=stripe;
exports.developerBilling=functions.runWith({secrets:['FYNX_API_STRIPE_SECRET_KEY'],timeoutSeconds:60,memory:'256MB',maxInstances:5}).https.onCall(async(data,context)=>{const started=Date.now();try{const result=await billing(data,context);logger.info('FYNX API billing',{service:'fynx_api',kind:'billing',status:200,duration_ms:Date.now()-started});return result;}catch(e){const expected=['unauthenticated','failed-precondition','invalid-argument','already-exists','resource-exhausted','aborted'].includes(e.code);logger[expected?'info':'error']('FYNX API billing failed',{service:'fynx_api',kind:'billing',status:expected?400:500,duration_ms:Date.now()-started});throw e;}});
exports._test={billing};
