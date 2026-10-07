'use strict';
// Opt-in isolated Stripe TEST-clock exercise. Never changes a deployed plan or live object.
const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const Stripe=require('stripe'),{GoogleAuth}=require('google-auth-library');
const args=process.argv.slice(2),secretName=args[args.indexOf('--secret')+1],output=args[args.indexOf('--output')+1];
if(!args.includes('--run-test-mode')||!args.includes('--secret')||!args.includes('--output')||!['STRIPE_SECRET_KEY','FYNX_API_STRIPE_TEST_SECRET_KEY'].includes(secretName)||!output){console.error('Usage: --run-test-mode --secret STRIPE_SECRET_KEY|FYNX_API_STRIPE_TEST_SECRET_KEY --output PRIVATE_REPORT');process.exit(1);}
if(fs.existsSync(output)){console.error('Refusing to overwrite evidence.');process.exit(1);}
const report={checked_at:new Date().toISOString(),qa_run:'fynx-renewal-'+randomUUID(),mode:'test',checks:[],cleanup:[],limitations:['Hosted checkout and portal UI are not exercised.','No production webhook or customer entitlement writes are exercised.']};
let stripe,clock,product,price;
const check=(name,value)=>{assert(value,name);report.checks.push(name);console.log('PASS: '+name);};
const testObject=obj=>{assert.equal(obj.livemode,false,'Refusing non-test object');return obj;};
async function advance(timestamp){await stripe.testHelpers.testClocks.advance(clock.id,{frozen_time:timestamp});for(let i=0;i<60;i++){const c=await stripe.testHelpers.testClocks.retrieve(clock.id);if(c.status==='ready')return;if(c.status==='internal_failure')throw Error('Test clock internal failure');await new Promise(r=>setTimeout(r,2000));}throw Error('Test clock timed out');}
async function current(id){return testObject(await stripe.subscriptions.retrieve(id,{expand:['latest_invoice']}));}
(async()=>{try{
 const client=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();
 const {data}=await client.request({url:'https://secretmanager.googleapis.com/v1/projects/fynx-c7a28/secrets/'+secretName+'/versions/latest:access'});
 const key=Buffer.from(data.payload.data,'base64').toString('utf8');assert(key.startsWith('sk_test_'),'Refusing non-test credential');stripe=new Stripe(key,{maxNetworkRetries:2,timeout:20000});
 clock=testObject(await stripe.testHelpers.testClocks.create({frozen_time:Math.floor(Date.now()/1000),name:report.qa_run}));
 product=testObject(await stripe.products.create({name:'FYNX API renewal QA TEST only',metadata:{qa_run:report.qa_run}}));price=testObject(await stripe.prices.create({product:product.id,currency:'usd',unit_amount:4900,recurring:{interval:'month'}}));
 const customer=testObject(await stripe.customers.create({name:'Disposable FYNX TEST-clock customer',test_clock:clock.id,metadata:{qa_run:report.qa_run}}));
 const good=testObject(await stripe.paymentMethods.create({type:'card',card:{token:'tok_visa'}}));await stripe.paymentMethods.attach(good.id,{customer:customer.id});
 let sub=testObject(await stripe.subscriptions.create({customer:customer.id,items:[{price:price.id}],default_payment_method:good.id,payment_behavior:'error_if_incomplete',expand:['latest_invoice']}));
 check('Initial simulated subscription paid USD 49',sub.status==='active'&&sub.latest_invoice.status==='paid'&&sub.latest_invoice.amount_paid===4900);
 const initialInvoice=sub.latest_invoice.id;
 await advance(sub.items.data[0].current_period_end+7200);sub=await current(sub.id);
 // Stripe can create a draft at the renewal boundary; advance another two hours for scheduled collection.
 if(sub.latest_invoice.status==='draft'){const c=await stripe.testHelpers.testClocks.retrieve(clock.id);await advance(c.frozen_time+7200);sub=await current(sub.id);}
 check('Clock-driven monthly renewal creates and pays a new invoice',sub.latest_invoice.id!==initialInvoice&&sub.latest_invoice.status==='paid'&&sub.latest_invoice.amount_paid===4900);
 const bad=testObject(await stripe.paymentMethods.create({type:'card',card:{token:'tok_chargeCustomerFail'}}));await stripe.paymentMethods.attach(bad.id,{customer:customer.id});
 await stripe.subscriptions.update(sub.id,{default_payment_method:bad.id});
 await advance(sub.items.data[0].current_period_end+7200);sub=await current(sub.id);
 if(sub.latest_invoice.status==='draft'){const c=await stripe.testHelpers.testClocks.retrieve(clock.id);await advance(c.frozen_time+7200);sub=await current(sub.id);}
 check('Failed renewal leaves invoice unpaid and subscription past due',sub.status==='past_due'&&sub.latest_invoice.status==='open'&&sub.latest_invoice.amount_remaining===4900);
 await stripe.subscriptions.update(sub.id,{default_payment_method:good.id});
 const recovered=testObject(await stripe.invoices.pay(sub.latest_invoice.id,{payment_method:good.id}));sub=await current(sub.id);
 check('Valid replacement method recovers the unpaid renewal',recovered.status==='paid'&&sub.status==='active');
 sub=testObject(await stripe.subscriptions.update(sub.id,{cancel_at_period_end:true}));check('Cancellation retains active access through paid period',sub.cancel_at_period_end&&sub.status==='active');
 await advance(sub.items.data[0].current_period_end+7200);sub=await current(sub.id);check('Subscription cancels at the scheduled period end',sub.status==='canceled');
 }catch(e){report.error={code:e.code||e.type||e.name,message:String(e.message||'').replace(/(?:sk|rk)_(?:test|live)_[^\s'"]+/g,'[redacted]')};process.exitCode=1;}
 finally{
  for(const [name,object,fn] of [['delete test clock and associated customers/subscriptions',clock,()=>stripe.testHelpers.testClocks.del(clock.id)],['deactivate test price',price,()=>stripe.prices.update(price.id,{active:false})],['deactivate test product',product,()=>stripe.products.update(product.id,{active:false})]]){if(!object)continue;try{await fn();report.cleanup.push({name,ok:true});}catch(e){report.cleanup.push({name,ok:false,code:e.code||e.type});process.exitCode=1;}}
  report.complete=report.checks.length===6&&!report.error&&report.cleanup.every(x=>x.ok);if(!report.complete)process.exitCode=1;fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(report,null,2));
 }
})();
