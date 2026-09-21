'use strict';
const functions=require('firebase-functions/v1');
const admin=require('firebase-admin');
const Stripe=require('stripe');
const SITE='https://www.fynxfinanceworld.com/api/workspace.html';
const liveMode=()=>String(process.env.FYNX_API_STRIPE_SECRET_KEY||process.env.STRIPE_SECRET_KEY||'').startsWith('sk_live_');
const stripe=()=>new Stripe(process.env.FYNX_API_STRIPE_SECRET_KEY||process.env.STRIPE_SECRET_KEY,{maxNetworkRetries:2,timeout:15000});
const root=uid=>admin.firestore().collection('fynxDevelopers').doc(uid);
const fail=(c,m)=>{throw new functions.https.HttpsError(c,m);};
async function refresh(uid){
 const ref=root(uid),snap=await ref.get(),p=snap.data()||{};
 if(!p.stripeCustomer)return {plan:'free',subscription:null};
 if(p.planCheckedUntil>Date.now())return {plan:p.plan||'free',subscription:p.subscription||null};
 const list=await stripe().subscriptions.list({customer:p.stripeCustomer,status:'all',limit:100});
 const sub=liveMode()&&list.data.find(s=>s.metadata.product==='fynx_api'&&s.status==='active');
 const state={plan:sub?'pro':'free',subscription:sub?{id:sub.id,status:sub.status,cancel_at_period_end:sub.cancel_at_period_end,current_period_end:sub.items.data[0]?.current_period_end||sub.current_period_end||null}:null,planCheckedUntil:Date.now()+60000};
 await ref.set(state,{merge:true});return state;
}
exports.refresh=refresh;
exports.developerBilling=functions.runWith({secrets:['STRIPE_SECRET_KEY'],timeoutSeconds:60,memory:'256MB',maxInstances:5}).https.onCall(async(data,context)=>{
 if(!context.auth)fail('unauthenticated','Sign in first.');const uid=context.auth.uid,user=await admin.auth().getUser(uid);if(user.disabled||!user.emailVerified)fail('failed-precondition','Verify your email before managing billing.');
 const ref=root(uid),profile=(await ref.get()).data();if(!profile)fail('failed-precondition','Open your workspace first.');const s=stripe();
 if(data?.action==='summary'){
  await ref.set({planCheckedUntil:0},{merge:true});const state=await refresh(uid);
  const invoices=profile.stripeCustomer?(await s.invoices.list({customer:profile.stripeCustomer,limit:20})).data.map(i=>({id:i.id,number:i.number,status:i.status,amount_due:i.amount_due,currency:i.currency,created:i.created,url:i.hosted_invoice_url,pdf:i.invoice_pdf})):[];
  return {...state,invoices,billing_mode:liveMode()?'live':'test',pricing:{price:49,monthlyCalls:50000,rps:30,overage:'disabled',currency:'USD'},spend_limit:'$49 subscription base; no automatic usage overages'};
 }
 if(data?.action==='checkout'&&!liveMode()){await ref.set({proWaitlist:true,proWaitlistJoinedAt:profile.proWaitlistJoinedAt||Date.now()},{merge:true});return {waitlist:true,message:'You are on the Pro waitlist. No payment was taken. Paid plans will open when live billing is enabled.'};}
 let customer=profile.stripeCustomer;
 if(!customer){const c=await s.customers.create({email:user.email,name:profile.name,metadata:{fynx_uid:uid,product:'fynx_api'}},{idempotencyKey:'fynx-api-customer-'+uid});customer=c.id;await ref.set({stripeCustomer:customer},{merge:true});}
 if(data?.action==='checkout'){
  const active=await s.subscriptions.list({customer,status:'all',limit:100});if(active.data.some(x=>x.metadata.product==='fynx_api'&&['active','trialing','past_due','incomplete','unpaid','paused'].includes(x.status)))fail('already-exists','You already have a subscription. Use Manage billing.');
  const sessions=await s.checkout.sessions.list({customer,status:'open',limit:10});const existing=sessions.data.find(x=>x.metadata?.product==='fynx_api');if(existing)return {url:existing.url};
  const session=await s.checkout.sessions.create({mode:'subscription',customer,success_url:SITE+'#billing',cancel_url:SITE+'#billing',client_reference_id:uid,metadata:{product:'fynx_api'},subscription_data:{metadata:{product:'fynx_api',fynx_uid:uid}},line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:4900,recurring:{interval:'month'},product_data:{name:'FYNX API Pro',description:'50,000 live calls per UTC calendar month. 30 requests/second. No automatic overages.'}}}]},{idempotencyKey:'fynx-api-checkout-'+uid+'-'+Math.floor(Date.now()/1800000)});
  return {url:session.url};
 }
 if(data?.action==='portal'){
  const config=await s.billingPortal.configurations.create({business_profile:{headline:'FYNX API billing'},features:{customer_update:{enabled:true,allowed_updates:['email','address','tax_id']},invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'}}},{idempotencyKey:'fynx-api-portal-config-v1'});
  const session=await s.billingPortal.sessions.create({customer,configuration:config.id,return_url:SITE+'#billing'});return {url:session.url};
 }
 fail('invalid-argument','Unknown billing action.');
});
