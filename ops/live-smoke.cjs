'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const auth=require('/Users/h/.npm-global/lib/node_modules/firebase-tools/lib/auth'),Stripe=require('../backend/node_modules/stripe');
(async()=>{
 const a=auth.getGlobalDefaultAccount(),t=await auth.getAccessToken(a.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
 const googleHeaders={Authorization:'Bearer '+t.access_token,'Content-Type':'application/json'};
 async function google(url,options={}){const r=await fetch(url,{...options,headers:googleHeaders,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Google '+r.status);return r.status===204?{}:r.json();}
 async function secret(name){const b=await google('https://secretmanager.googleapis.com/v1/projects/fynx-c7a28/secrets/'+name+'/versions/latest:access');return Buffer.from(b.payload.data,'base64').toString().trim();}
 const stripe=new Stripe(await secret('FYNX_CONSUMER_STRIPE_SECRET_KEY'),{timeout:15000,maxNetworkRetries:2});
 const apiKey=fs.readFileSync('auth/firebase.js','utf8').match(/apiKey:\s*"([^"]+)"/)[1];
 const identity=async(action,body)=>{const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:'+action+'?key='+apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const b=await r.json();if(!r.ok)throw Error('Auth '+r.status+' '+b.error?.message);return b;};
 const account=await identity('signUp',{email:'fynx-payment-qa-'+Date.now()+'@example.invalid',password:crypto.randomBytes(24).toString('hex'),returnSecureToken:true});
 const uid=account.localId,token=account.idToken,base='https://firestore.googleapis.com/v1/projects/fynx-c7a28/databases/(default)/documents/fynxConsumerLive/'+uid;
 let customer;const sessions=[];
 const call=async(data,authenticated=true)=>{const r=await fetch('https://us-central1-fynx-c7a28.cloudfunctions.net/consumerLiveWorkspace',{method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data}),signal:AbortSignal.timeout(60000)});return {status:r.status,...await r.json()};};
 try{
  assert.equal((await call({action:'status'},false)).error?.status,'UNAUTHENTICATED');console.log('PASS unauthenticated requests denied');
  const status=await call({action:'status'});assert.equal(status.result.mode,'live');assert.equal(status.result.tier,null);console.log('PASS authenticated live status starts without paid access');
  assert.equal((await call({action:'run',product:'watchlist',input:{symbols:['AAPL']}})).error?.status,'PERMISSION_DENIED');console.log('PASS unpaid product access denied');
  const expected={starter:'price_1UKRLQKF1DV2t1wM2UGmB0Y6',plus:'price_1UKRMFKF1DV2t1wMgCkO7SlM',pro:'price_1UKRN0KF1DV2t1wM1yPmZJ6L'};
  for(const [tier,price] of Object.entries(expected)){
   const result=await call({action:'checkout',tier});if(!result.result?.url)throw Error('Checkout failed: '+JSON.stringify(result));
   const p=await google(base);customer=p.fields.customer.stringValue;
   const open=(await stripe.checkout.sessions.list({customer,status:'open',limit:10})).data;assert.equal(open.length,1);const session=open[0];sessions.push(session.id);assert.equal(session.livemode,true);assert.equal(session.client_reference_id,uid);const items=await stripe.checkout.sessions.listLineItems(session.id);assert.equal(items.data[0].price.id,price);assert.equal(session.payment_status,'unpaid');
   const again=await call({action:'checkout',tier});assert.equal(again.result.url,result.result.url);console.log('PASS '+tier+' creates correct live checkout and reuses repeat clicks');
   await stripe.checkout.sessions.expire(session.id);
  }
  assert.match((await call({action:'portal'})).result.url,/https:\/\/billing\.stripe\.com\//);console.log('PASS billing portal opens for the correct customer');
  const write=await fetch(base,{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({fields:{customer:{stringValue:'cus_attacker'},billingTier:{stringValue:'pro'}}}),signal:AbortSignal.timeout(30000)});assert.equal(write.status,403);console.log('PASS client cannot forge live billing records');
  const webhook='https://us-central1-fynx-c7a28.cloudfunctions.net/consumerLiveWebhook';
  assert.equal((await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
  const payload=JSON.stringify({id:'evt_fynx_qa_'+Date.now(),type:'invoice.paid',created:Math.floor(Date.now()/1000),livemode:true,data:{object:{customer}}});
  const signature=Stripe.webhooks.generateTestHeaderString({payload,secret:await secret('FYNX_CONSUMER_STRIPE_WEBHOOK_SECRET')});
  for(let i=0;i<2;i++)assert.equal((await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signature},body:payload,signal:AbortSignal.timeout(60000)})).status,200);
  assert.equal((await call({action:'status'})).result.tier,null);console.log('PASS signed webhook probe and replay work; an unpaid customer remains locked');
  console.log('No payment made. Hosted card submission and real bank payout were not tested.');
 }finally{
  if(!customer){try{customer=(await google(base)).fields.customer?.stringValue;}catch{}}
  if(customer){for(const s of (await stripe.checkout.sessions.list({customer,status:'open',limit:100})).data)await stripe.checkout.sessions.expire(s.id);await stripe.customers.del(customer);}
  for(const collection of ['internal','billingEvents']){try{const list=await google(base+'/'+collection);for(const d of list.documents||[])await google('https://firestore.googleapis.com/v1/'+d.name,{method:'DELETE'});}catch{}}
  await google(base,{method:'DELETE'});await identity('delete',{idToken:token});console.log('Removed disposable QA account, Stripe customer and billing records');
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
