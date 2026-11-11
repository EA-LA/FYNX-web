'use strict';
const functions=require('firebase-functions/v1'),admin=require('firebase-admin'),Stripe=require('stripe');
const {PLANS,run,planForSubscription}=require('./consumer-core.cjs');
const SITE='https://www.fynxfinanceworld.com/pro.html';
const fail=(code,message)=>{throw new functions.https.HttpsError(code,message);};
function stripe(){const key=process.env.STRIPE_SECRET_KEY||'';if(!key.startsWith('sk_test_'))fail('failed-precondition','Test checkout is not configured. Real payments are disabled.');return new Stripe(key,{maxNetworkRetries:2,timeout:12000});}
const root=uid=>admin.firestore().collection('fynxConsumerTest').doc(uid);
async function rateLimit(uid){const ref=root(uid).collection('internal').doc('rate');await admin.firestore().runTransaction(async tx=>{const d=(await tx.get(ref)).data()||{},minute=Math.floor(Date.now()/60000),count=d.minute===minute?(d.count||0)+1:1;if(count>30)fail('resource-exhausted','Please wait a minute before trying again.');tx.set(ref,{minute,count});});}
async function entitlement(uid,s){const profile=(await root(uid).get()).data()||{};if(!profile.customer)return {tier:null};const list=await s.subscriptions.list({customer:profile.customer,status:'all',limit:100});const sub=list.data.find(x=>planForSubscription(x,uid));return {tier:sub?planForSubscription(sub,uid):null,subscription:sub?{status:sub.status,cancelAtPeriodEnd:sub.cancel_at_period_end,currentPeriodEnd:sub.items.data[0]?.current_period_end||sub.current_period_end||null}:null};}
async function trades(uid){const snap=await admin.firestore().collection('users').doc(uid).collection('trades').orderBy('dateTs','asc').limit(1001).get();if(snap.size>1000)fail('resource-exhausted','This preview supports up to 1,000 dated trades.');return snap.docs.map(d=>d.data()).filter(t=>Number.isFinite(Number(t.pl)));}
async function handler(data,ctx){
 if(!ctx.auth)fail('unauthenticated','Sign in to use your optional Pro workspace.');const uid=ctx.auth.uid;await rateLimit(uid);
 const s=stripe(),ref=root(uid),state=await entitlement(uid,s);
 if(data?.action==='status')return {mode:'test',...state,plans:PLANS};
 if(data?.action==='checkout'){
  await admin.firestore().runTransaction(async tx=>{const d=(await tx.get(ref)).data()||{};if(d.checkoutLockUntil>Date.now())fail('aborted','Checkout is already opening. Please retry shortly.');tx.set(ref,{checkoutLockUntil:Date.now()+120000},{merge:true});});
  try {
  const tier=data.tier,plan=Object.hasOwn(PLANS,tier)?PLANS[tier]:null;if(!plan)fail('invalid-argument','Choose a valid monthly plan.');
  if(state.tier)fail('already-exists','A test subscription is already active. Manage it before starting another.');
  const user=await admin.auth().getUser(uid);if(user.disabled||!user.email)fail('failed-precondition','An active account with an email is required.');
  let customer=(await ref.get()).data()?.customer;
  if(!customer){const c=await s.customers.create({email:user.email,metadata:{product:'fynx_consumer_test',fynx_uid:uid}},{idempotencyKey:'fynx-consumer-test-customer-'+uid});customer=c.id;await ref.set({customer},{merge:true});}
  const subs=await s.subscriptions.list({customer,status:'all',limit:100});if(subs.data.some(x=>x.metadata?.product==='fynx_consumer_test'&&['active','trialing','past_due','unpaid','incomplete','paused'].includes(x.status)))fail('already-exists','Manage your existing subscription before opening a new one.');
  const open=await s.checkout.sessions.list({customer,status:'open',limit:100});for(const session of open.data){if(session.metadata?.product!=='fynx_consumer_test')continue;if(session.metadata.tier===tier)return {url:session.url,mode:'test'};await s.checkout.sessions.expire(session.id);}
  const meta={product:'fynx_consumer_test',fynx_uid:uid,tier};
  const session=await s.checkout.sessions.create({mode:'subscription',customer,client_reference_id:uid,success_url:SITE+'?checkout=complete',cancel_url:SITE+'?checkout=cancelled',metadata:meta,subscription_data:{metadata:meta},line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:plan.cents,recurring:{interval:'month'},product_data:{name:'FYNX '+plan.name+' — TEST',description:plan.products.length+' advanced tools; '+plan.saved+' saved workspaces. Test subscription only.'}}}]},{idempotencyKey:'fynx-consumer-test-checkout-'+uid+'-'+tier+'-'+require('crypto').randomUUID()});
  return {url:session.url,mode:'test'};
  } finally { await ref.set({checkoutLockUntil:0},{merge:true}); }
 }
 if(data?.action==='portal'){
  const customer=(await ref.get()).data()?.customer;if(!customer)fail('failed-precondition','No test billing account yet.');
  const config=await s.billingPortal.configurations.create({business_profile:{headline:'FYNX test subscriptions — no real charges'},features:{invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'}}},{idempotencyKey:'fynx-consumer-test-portal-v1'});
  return {url:(await s.billingPortal.sessions.create({customer,configuration:config.id,return_url:SITE})).url,mode:'test'};
 }
 const plan=PLANS[state.tier];if(!plan)fail('permission-denied','Choose a test plan to unlock these advanced tools. The public website remains free.');
 const saved=ref.collection('saved');
 if(data?.action==='list'){const snap=await saved.orderBy('createdAt','desc').get();return {items:snap.docs.map(d=>({id:d.id,...d.data()})),limit:plan.saved};}
 if(data?.action==='delete'){if(typeof data.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(data.id))fail('invalid-argument','Invalid saved item.');await admin.firestore().runTransaction(async tx=>{const item=saved.doc(data.id),snap=await tx.get(item),counter=(await tx.get(ref)).data()?.savedCount||0;if(snap.exists){tx.delete(item);tx.set(ref,{savedCount:Math.max(0,counter-1)},{merge:true});}});return {deleted:true};}
 const product=data?.product;if(!plan.products.includes(product))fail('permission-denied','This tool requires a higher test plan.');
 if(!['run','save'].includes(data?.action))fail('invalid-argument','Unknown action.');
 const input=data.input||{};if(JSON.stringify(input).length>15000)fail('invalid-argument','Input is too large.');
 let result;try{result=run(product,input,['analytics','export'].includes(product)?await trades(uid):[]);}catch(e){if(e instanceof functions.https.HttpsError)throw e;fail('invalid-argument',e.message);}
 if(data.action==='save'){
  const name=String(data.name||'').trim();if(!name||name.length>100)fail('invalid-argument','Use a name of 1–100 characters.');if(product==='export')fail('invalid-argument','Download the export instead of saving it.');
  const item=saved.doc();await admin.firestore().runTransaction(async tx=>{const d=(await tx.get(ref)).data()||{},count=d.savedCount||0;if(count>=plan.saved)fail('resource-exhausted','Saved workspace limit reached. Delete an item before adding another.');tx.create(item,{name,product,input,result,createdAt:Date.now()});tx.set(ref,{savedCount:count+1},{merge:true});});return {saved:true,id:item.id,result};
 }
 return {result,mode:'test'};
}
exports.consumerWorkspace=functions.runWith({secrets:['STRIPE_SECRET_KEY'],timeoutSeconds:60,memory:'256MB',maxInstances:3}).https.onCall(handler);
exports._test={handler};
