'use strict';
// Opt-in TEST Stripe integration. No Firestore changes or customer entitlement writes.
// Uses the actual billing module's captured request parameters through the isolated adapter.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const Stripe=require('stripe'),{GoogleAuth}=require('google-auth-library'),{harness}=require('./billing-harness.cjs');
if(!process.argv.includes('--run-test-mode')){console.error('Pass --run-test-mode; requires authorized ADC access to the existing Stripe TEST secret.');process.exit(1);}
const runId='fynx-api-qa-'+randomUUID(),report={checked_at:new Date().toISOString(),mode:'test',qa_run:runId,checks:[],cleanup:[],limitations:['Hosted checkout UI and subscription renewal timing are not exercised.','Production paid upgrades remain on the waitlist.','No real payments or paid entitlement changes.']};
let stripe,customer,product,price,checkout,sub,config;
function safeMessage(e){return String(e.message||'').replace(/(?:sk|rk)_(?:test|live)_[^\s'"]+/g,'[redacted Stripe key]');}
function check(name,value){assert(value,name);report.checks.push(name);}
function testObject(obj){assert.equal(obj.livemode,false,'Refusing non-test Stripe object');return obj;}
(async()=>{
 try{
  const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
  const client=await auth.getClient();const response=await client.request({url:'https://secretmanager.googleapis.com/v1/projects/fynx-c7a28/secrets/FYNX_API_STRIPE_SECRET_KEY/versions/latest:access'});
  const secret=Buffer.from(response.data.payload.data,'base64').toString('utf8');assert(secret.startsWith('sk_test_'),'Refusing any key other than sk_test_');
  stripe=new Stripe(secret,{maxNetworkRetries:2,timeout:20000});
  customer=testObject(await stripe.customers.create({name:'FYNX API automated TEST only',metadata:{qa_run:runId,product:'fynx_api_test'}}));
  const h=harness({live:true,profile:{stripeCustomer:customer.id}});await h.call('checkout');await h.call('portal');
  const params=JSON.parse(JSON.stringify(h.calls.find(c=>c.method==='checkout.sessions.create').args[0]));params.customer=customer.id;params.client_reference_id=runId;params.subscription_data.metadata.fynx_uid=runId;
  checkout=testObject(await stripe.checkout.sessions.create(params,{idempotencyKey:runId+'-checkout'}));
  const duplicate=testObject(await stripe.checkout.sessions.create(params,{idempotencyKey:runId+'-checkout'}));
  check('Actual billing checkout parameters accepted in Stripe TEST mode',checkout.status==='open'&&checkout.mode==='subscription');
  check('Checkout idempotency reuses session',checkout.id===duplicate.id);
  const line=(await stripe.checkout.sessions.listLineItems(checkout.id)).data[0];
  check('Checkout price is USD 49.00 monthly',line.amount_total===4900&&line.currency==='usd'&&line.price.recurring.interval==='month');
  // Inline Checkout prices are not reusable; create a dedicated test catalog item for lifecycle checks.
  product=testObject(await stripe.products.create({name:'FYNX API Pro TEST only',metadata:{qa_run:runId}}));
  price=testObject(await stripe.prices.create({product:product.id,currency:'usd',unit_amount:4900,recurring:{interval:'month'}}));
  const pm=testObject(await stripe.paymentMethods.create({type:'card',card:{token:'tok_visa'}}));await stripe.paymentMethods.attach(pm.id,{customer:customer.id});
  sub=testObject(await stripe.subscriptions.create({customer:customer.id,items:[{price:price.id}],default_payment_method:pm.id,metadata:{product:'fynx_api',fynx_uid:runId},payment_behavior:'error_if_incomplete'}));
  check('Test Visa subscription activates',sub.status==='active');
  const invoice=testObject(await stripe.invoices.retrieve(typeof sub.latest_invoice==='string'?sub.latest_invoice:sub.latest_invoice.id));
  check('Test subscription invoice is paid for USD 49.00',invoice.status==='paid'&&invoice.amount_paid===4900&&invoice.currency==='usd');
  const invoices=await stripe.invoices.list({customer:customer.id,limit:20});check('Invoice history includes test payment',invoices.data.some(i=>i.id===invoice.id));
  const entitlement=harness({live:true,profile:{stripeCustomer:customer.id},subscriptions:[sub]});check('Actual billing entitlement logic recognizes active subscription shape',(await entitlement.refresh()).plan==='pro');
  const cp=JSON.parse(JSON.stringify(h.calls.find(c=>c.method==='billingPortal.configurations.create').args[0]));
  config=testObject(await stripe.billingPortal.configurations.create(cp));
  const portal=testObject(await stripe.billingPortal.sessions.create({customer:customer.id,configuration:config.id,return_url:params.success_url}));check('Test billing portal session created',Boolean(portal.url));
  const cancel=testObject(await stripe.subscriptions.update(sub.id,{cancel_at_period_end:true}));check('Period-end cancellation retains active service until period end',cancel.cancel_at_period_end&&cancel.status==='active');
  const ended=testObject(await stripe.subscriptions.cancel(sub.id));check('Immediate test cancellation succeeds',ended.status==='canceled');sub=null;
  check('Actual billing logic removes canceled entitlement',(await harness({live:true,profile:{stripeCustomer:customer.id},subscriptions:[ended]}).refresh()).plan==='free');
  let declined=false;try{await stripe.paymentIntents.create({amount:4900,currency:'usd',customer:customer.id,payment_method:'pm_card_chargeDeclined',payment_method_types:['card'],confirm:true});}catch(e){if(e.code==='card_declined')declined=true;else throw e;}
  check('Declined TEST card is rejected',declined);
  const held=harness({profile:{stripeCustomer:customer.id,plan:'pro'}});check('TEST mode never grants paid entitlement',(await held.refresh()).plan==='free');check('TEST checkout remains waitlist-only',(await held.call('checkout')).waitlist===true);
 }finally{
  const cleanup=async(name,fn)=>{try{await fn();report.cleanup.push({name,ok:true});}catch(e){report.cleanup.push({name,ok:false,code:e.code||e.type||'error',message:safeMessage(e)});process.exitCode=1;}};
  if(sub)await cleanup('cancel own test subscription',()=>stripe.subscriptions.cancel(sub.id));
  if(checkout)await cleanup('expire own test checkout',()=>stripe.checkout.sessions.expire(checkout.id));
  if(config)await cleanup('deactivate own test portal configuration',()=>stripe.billingPortal.configurations.update(config.id,{active:false}));
  if(price)await cleanup('deactivate own test price',()=>stripe.prices.update(price.id,{active:false}));
  if(product)await cleanup('deactivate own test product',()=>stripe.products.update(product.id,{active:false}));
  if(customer)await cleanup('delete own test customer',()=>stripe.customers.del(customer.id));
  report.complete=report.checks.length===14&&report.cleanup.every(x=>x.ok);
  if(!report.complete)process.exitCode=1;
  const destination=path.resolve(__dirname,'../../docs/release-review/stripe-test-evidence.json');fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
 }
})().catch(e=>{console.error('TEST verification failed:',e.code||e.type||e.name,safeMessage(e));process.exitCode=1;});
