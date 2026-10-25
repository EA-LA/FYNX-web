'use strict';
const functions=require('firebase-functions/v1'),admin=require('firebase-admin'),Stripe=require('stripe');
const {PLANS,run}=require('./consumer-core.cjs');
const {PRODUCT,PRICES,priceMatches,planForSubscription}=require('./consumer-live-policy.cjs');
const SITE='https://www.fynxfinanceworld.com/pro.html';
const TOOLS=new Set(Object.values(PLANS).flatMap(plan=>plan.products));
function returnUrl(tool,outcome){const url=new URL(SITE);url.searchParams.set('tool',TOOLS.has(tool)?tool:'analytics');if(outcome)url.searchParams.set('checkout',outcome);return url.href;}
const fail=(code,message)=>{throw new functions.https.HttpsError(code,message);};
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
function stripe(){const key=(process.env.FYNX_CONSUMER_STRIPE_SECRET_KEY||'').trim();if(!/^(sk|rk)_live_/.test(key))fail('failed-precondition','Live checkout is not configured. Please contact support.');return new Stripe(key,{maxNetworkRetries:2,timeout:12000});}
const root=uid=>admin.firestore().collection('fynxConsumerLive').doc(uid);
async function rateLimit(uid){const ref=root(uid).collection('internal').doc('rate');await admin.firestore().runTransaction(async tx=>{const d=(await tx.get(ref)).data()||{},minute=Math.floor(Date.now()/60000),count=d.minute===minute?(d.count||0)+1:1;if(count>30)fail('resource-exhausted','Please wait a minute before trying again.');tx.set(ref,{minute,count});});}
async function entitlement(uid,s){const profile=(await root(uid).get()).data()||{};if(!profile.customer)return {tier:null};const list=await s.subscriptions.list({customer:profile.customer,status:'all',limit:100,expand:['data.latest_invoice']});const sub=list.data.find(x=>planForSubscription(x,uid,profile.customer));return {tier:sub?planForSubscription(sub,uid,profile.customer):null,hasBillingAccount:true,subscription:sub?{status:sub.status,cancelAtPeriodEnd:sub.cancel_at_period_end,currentPeriodEnd:sub.items.data[0]?.current_period_end||sub.current_period_end||null}:null};}
async function trades(uid){const snap=await admin.firestore().collection('users').doc(uid).collection('trades').orderBy('dateTs','asc').limit(1001).get();if(snap.size>1000)fail('resource-exhausted','This preview supports up to 1,000 dated trades.');return snap.docs.map(d=>d.data()).filter(t=>Number.isFinite(Number(t.pl)));}
async function handler(data,ctx){
 if(!ctx.auth)fail('unauthenticated','Sign in to use your optional Pro workspace.');const uid=ctx.auth.uid;
 if(data?.accountUid!==undefined&&data.accountUid!==uid)fail('unauthenticated','Your account changed. Reopen this research note before saving.');
 const user=await admin.auth().getUser(uid);if(user.disabled)fail('permission-denied','This account is disabled.');
 const signedIn=ctx.auth.token?.auth_time;
 if(!Number.isSafeInteger(signedIn)||signedIn<=0||signedIn>Math.floor(Date.now()/1000)+60||Date.parse(user.tokensValidAfterTime)>signedIn*1000)fail('unauthenticated','Session expired. Sign in again.');
 if(!['status','checkout','portal','list','delete','run','save'].includes(data?.action))fail('invalid-argument','Unknown action.');
 await rateLimit(uid);
 const s=stripe(),ref=root(uid);
 // Payment-method updates and cancellation must not depend on entitlement reads.
 if(data?.action==='portal'){
  const customer=(await ref.get()).data()?.customer;if(!customer)fail('failed-precondition','No billing account yet.');
  const config=await s.billingPortal.configurations.create({business_profile:{headline:'FYNX membership billing'},features:{invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'}}},{idempotencyKey:'fynx-consumer-live-portal-v1'});
  return {url:(await s.billingPortal.sessions.create({customer,configuration:config.id,return_url:returnUrl(data.tool)})).url,mode:'live'};
 }
 let state;
 try{state=await entitlement(uid,s);}catch(error){
  if(data.action!=='status')throw error;
  state={tier:null,hasBillingAccount:!!(await ref.get()).data()?.customer,billingUnavailable:true};
 }
 if(data?.action==='status')return {mode:'live',...state,plans:PLANS,features:{researchNotesVersion:1}};
 if(data?.action==='checkout'){
  await admin.firestore().runTransaction(async tx=>{const d=(await tx.get(ref)).data()||{};if(d.checkoutLockUntil>Date.now())fail('aborted','Checkout is already opening. Please retry shortly.');tx.set(ref,{checkoutLockUntil:Date.now()+120000},{merge:true});});
  try {
  const tier=data.tier,plan=Object.hasOwn(PLANS,tier)?PLANS[tier]:null;if(!plan)fail('invalid-argument','Choose a valid monthly plan.');
  if(state.tier)fail('already-exists','A subscription is already active. Manage it before starting another.');
  const price=await s.prices.retrieve(PRICES[tier]);if(!priceMatches(price,tier)||!price.active)fail('failed-precondition','This plan is temporarily unavailable. No payment was taken.');
  if(!user.email)fail('failed-precondition','An active account with an email is required.');
  let customer=(await ref.get()).data()?.customer;
  if(!customer){const c=await s.customers.create({email:user.email,metadata:{product:PRODUCT,fynx_uid:uid}},{idempotencyKey:'fynx-consumer-live-customer-'+uid});customer=c.id;await ref.set({customer},{merge:true});}
  const subs=await s.subscriptions.list({customer,status:'all',limit:100});if(subs.data.some(x=>x.metadata?.product===PRODUCT&&['active','trialing','past_due','unpaid','incomplete','paused'].includes(x.status)))fail('already-exists','Manage your existing subscription before opening a new one.');
  const open=await s.checkout.sessions.list({customer,status:'open',limit:100});for(const session of open.data){if(session.metadata?.product!==PRODUCT)continue;if(session.metadata.tier===tier)return {url:session.url,mode:'live'};await s.checkout.sessions.expire(session.id);}
  const tool=TOOLS.has(data.tool)?data.tool:'analytics';
  let attempt=(await ref.get()).data()?.checkoutAttempt;
  if(attempt?.session){const previous=await s.checkout.sessions.retrieve(attempt.session);if(previous.status!=='open')attempt=null;}
  if(!attempt||attempt.tier!==tier||Date.now()-attempt.at>23*60*60*1000){attempt={tier,tool,at:Date.now(),key:'fynx-consumer-live-checkout-'+require('crypto').randomUUID()};await ref.set({checkoutAttempt:attempt},{merge:true});}
  // Keep retry payloads identical, including attempts created before tool returns existed.
  const outcomeUrl=outcome=>Object.hasOwn(attempt,'tool')?returnUrl(attempt.tool,outcome):SITE+'?checkout='+outcome;
  const meta={product:PRODUCT,fynx_uid:uid,tier};
  const session=await s.checkout.sessions.create({mode:'subscription',customer,client_reference_id:uid,success_url:outcomeUrl('complete'),cancel_url:outcomeUrl('cancelled'),metadata:meta,subscription_data:{metadata:meta},payment_method_types:['card'],line_items:[{quantity:1,price:PRICES[tier]}]},{idempotencyKey:attempt.key});
  await ref.set({checkoutAttempt:{...attempt,session:session.id}},{merge:true});
  return {url:session.url,mode:'live'};
  } finally { await ref.set({checkoutLockUntil:0},{merge:true}); }
 }
 const plan=PLANS[state.tier];if(!plan)fail('permission-denied','Choose a plan to unlock these advanced tools. The public website remains free.');
 const saved=ref.collection('saved');
 if(data?.action==='list'){const snap=await saved.orderBy('createdAt','desc').get();return {items:snap.docs.map(d=>({id:d.id,...d.data()})),limit:plan.saved};}
 if(data?.action==='delete'){if(typeof data.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(data.id))fail('invalid-argument','Invalid saved item.');await admin.firestore().runTransaction(async tx=>{const item=saved.doc(data.id),snap=await tx.get(item),counter=(await tx.get(ref)).data()?.savedCount||0;if(snap.exists){tx.delete(item);tx.set(ref,{savedCount:Math.max(0,counter-1)},{merge:true});}});return {deleted:true};}
 const product=data?.product;if(!plan.products.includes(product))fail('permission-denied','This tool requires a higher plan.');
 if(!['run','save'].includes(data?.action))fail('invalid-argument','Unknown action.');
 const input=data.input||{};if(JSON.stringify(input).length>15000)fail('invalid-argument','Input is too large.');
 let result;try{result=run(product,input,['analytics','export'].includes(product)?await trades(uid):[]);}catch(e){if(e instanceof functions.https.HttpsError)throw e;fail('invalid-argument',e.message);}
 if(data.action==='save'){
  const name=String(data.name||'').trim();if(!name||name.length>100)fail('invalid-argument','Use a name of 1–100 characters.');if(product==='export')fail('invalid-argument','Download the export instead of saving it.');
  const requestId=data.requestId;
  if(requestId!==undefined&&(typeof requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)))fail('invalid-argument','Invalid save request. Reopen this research note.');
  const fingerprint=require('crypto').createHash('sha256').update(JSON.stringify(stable({name,product,input}))).digest('hex');
  const item=requestId?saved.doc('request-'+requestId.toLowerCase()):saved.doc();const savedResult=await admin.firestore().runTransaction(async tx=>{
   const existing=requestId?(await tx.get(item)).data():null;
   if(existing){if(existing.requestFingerprint!==fingerprint)fail('already-exists','This save request was already used for another note. Reopen the note before changing it.');return existing.result;}
   const d=(await tx.get(ref)).data()||{},count=d.savedCount||0;if(count>=plan.saved)fail('resource-exhausted','Saved workspace limit reached. Delete an item before adding another.');
   tx.create(item,{name,product,input,result,createdAt:Date.now(),...(requestId?{requestFingerprint:fingerprint}:{})});tx.set(ref,{savedCount:count+1},{merge:true});
   return result;
  });return {saved:true,id:item.id,result:savedResult};
 }
 return {result,mode:'live'};
}
exports.consumerLiveWorkspace=functions.runWith({secrets:['FYNX_CONSUMER_STRIPE_SECRET_KEY'],timeoutSeconds:60,memory:'256MB',maxInstances:3}).https.onCall(handler);
exports._test={handler};
exports.entitlement=entitlement;
exports.stripe=stripe;
exports.root=root;
