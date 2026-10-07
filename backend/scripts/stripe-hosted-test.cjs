'use strict';
// Manual-browser TEST checkout/portal companion. Owns only the resources in its private fixture.
const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),Stripe=require('stripe'),{GoogleAuth}=require('google-auth-library');
const [action,file]=process.argv.slice(2);if(!['prepare','verify-checkout','verify-cancellation','cleanup'].includes(action)||!file){console.error('Usage: prepare|verify-checkout|verify-cancellation|cleanup PRIVATE_FIXTURE_JSON');process.exit(1);}
const testObject=x=>{assert.equal(x.livemode,false,'Non-test Stripe object rejected');return x;};
(async()=>{
 const client=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();const {data}=await client.request({url:'https://secretmanager.googleapis.com/v1/projects/fynx-c7a28/secrets/STRIPE_SECRET_KEY/versions/latest:access'});const secret=Buffer.from(data.payload.data,'base64').toString('utf8');assert(secret.startsWith('sk_test_'),'This exercise requires the existing TEST key');const stripe=new Stripe(secret,{timeout:20000,maxNetworkRetries:2});
 let f;if(action==='prepare'){assert(!fs.existsSync(file),'Fixture exists');f={run:'fynx-hosted-'+randomUUID(),checks:[]};}else f=JSON.parse(fs.readFileSync(file));
 const save=()=>fs.writeFileSync(file,JSON.stringify(f,null,2)+'\n',{mode:0o600});
 const owned=async()=>{const c=testObject(await stripe.customers.retrieve(f.customer));assert.equal(c.metadata.qa_run,f.run,'Fixture customer ownership mismatch');};
 if(action==='prepare'){
  save();const customer=testObject(await stripe.customers.create({name:'FYNX disposable hosted-checkout QA',metadata:{qa_run:f.run,product:'fynx_api_test'}}));f.customer=customer.id;save();
  const product=testObject(await stripe.products.create({name:'FYNX API Pro — TEST ONLY',metadata:{qa_run:f.run}}));f.product=product.id;save();
  const price=testObject(await stripe.prices.create({product:product.id,currency:'usd',unit_amount:4900,recurring:{interval:'month'}}));f.price=price.id;save();
  const session=testObject(await stripe.checkout.sessions.create({mode:'subscription',customer:f.customer,success_url:'https://www.fynxfinanceworld.com/api/workspace.html?qa_test_checkout=complete',cancel_url:'https://www.fynxfinanceworld.com/api/workspace.html?qa_test_checkout=cancelled',client_reference_id:f.run,metadata:{product:'fynx_api_test',qa_run:f.run},subscription_data:{metadata:{product:'fynx_api_test',qa_run:f.run}},payment_method_types:['card'],line_items:[{price:f.price,quantity:1}]}));f.checkout=session.id;save();console.log(JSON.stringify({test_checkout_url:session.url}));return;
 }
 await owned();
 if(action==='verify-checkout'){
  const c=testObject(await stripe.checkout.sessions.retrieve(f.checkout));assert.equal(c.status,'complete');assert.equal(c.payment_status,'paid');f.subscription=c.subscription;const s=testObject(await stripe.subscriptions.retrieve(f.subscription));assert.equal(s.status,'active');f.checks.push('Hosted TEST checkout completed and paid; subscription active');save();
  const config=f.portal_config?testObject(await stripe.billingPortal.configurations.retrieve(f.portal_config)):testObject(await stripe.billingPortal.configurations.create({business_profile:{headline:'FYNX API TEST billing'},features:{invoice_history:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'}}}));f.portal_config=config.id;save();const portal=testObject(await stripe.billingPortal.sessions.create({customer:f.customer,configuration:config.id,return_url:'https://www.fynxfinanceworld.com/api/workspace.html'}));console.log(JSON.stringify({test_portal_url:portal.url}));return;
 }
 if(action==='verify-cancellation'){const s=testObject(await stripe.subscriptions.retrieve(f.subscription));assert(s.cancel_at_period_end||s.status==='canceled');f.checks.push('Hosted TEST portal cancellation verified by Stripe');save();console.log(JSON.stringify({checks:f.checks}));return;}
 if(action==='cleanup'){
  // Discover this own customer's subscription even if UI completion preceded verify-checkout.
  const list=await stripe.subscriptions.list({customer:f.customer,status:'all'});for(const sub of list.data){testObject(sub);assert.equal(sub.metadata.qa_run,f.run);if(sub.status!=='canceled')await stripe.subscriptions.cancel(sub.id);}
  if(f.checkout){const c=testObject(await stripe.checkout.sessions.retrieve(f.checkout));if(c.status==='open')await stripe.checkout.sessions.expire(c.id);}
  if(f.portal_config)await stripe.billingPortal.configurations.update(f.portal_config,{active:false});if(f.price)await stripe.prices.update(f.price,{active:false});if(f.product)await stripe.products.update(f.product,{active:false});await stripe.customers.del(f.customer);f.cleaned_up_at=new Date().toISOString();save();console.log('All own hosted TEST resources canceled, deleted or deactivated.');
 }
})().catch(e=>{console.error(e.code||e.name,String(e.message||'').replace(/(?:sk|rk)_(?:test|live)_[^\s'"]+/g,'[redacted]'));process.exitCode=1;});
