'use strict';
const auth=require('/Users/h/.npm-global/lib/node_modules/firebase-tools/lib/auth');
const PROJECT='fynx-c7a28',secretName='FYNX_API_STRIPE_WEBHOOK_SECRET';
const endpoint='https://us-central1-fynx-c7a28.cloudfunctions.net/developerBillingWebhook';
(async()=>{
 const account=auth.getGlobalDefaultAccount(),token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
 async function google(path,method='GET',body){const r=await fetch('https://secretmanager.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const b=await r.json();if(!r.ok){const e=Error('Secret Manager status '+r.status);e.status=r.status;throw e;}return b;}
 const apiSecret=await google(`projects/${PROJECT}/secrets/FYNX_CONSUMER_STRIPE_SECRET_KEY/versions/latest:access`);
 const key=Buffer.from(apiSecret.payload.data,'base64').toString().trim();if(!/^(sk|rk)_live_/.test(key))throw Error('Live key required');
 const Stripe=require('../backend/node_modules/stripe'),s=new Stripe(key,{timeout:15000,maxNetworkRetries:2});
 const a=await s.accounts.retrieve();if(a.id!=='acct_1T4pG3KF1DV2t1wM'||!a.charges_enabled||!a.payouts_enabled)throw Error('Account not ready or incorrect account');
 const {validPrice,PRICE}=require('../backend/developer-billing-policy.cjs');const price=await s.prices.retrieve(PRICE);if(!validPrice(price)||!price.active)throw Error('Live API price does not match');
 let apiKeyExists=false;try{await google(`projects/${PROJECT}/secrets/FYNX_API_STRIPE_SECRET_KEY/versions/latest`);apiKeyExists=true;}catch(e){if(e.status!==404)throw e;}
 if(!apiKeyExists){try{await google(`projects/${PROJECT}/secrets?secretId=FYNX_API_STRIPE_SECRET_KEY`,'POST',{replication:{automatic:{}}});}catch(e){if(e.status!==409)throw e;}await google(`projects/${PROJECT}/secrets/FYNX_API_STRIPE_SECRET_KEY:addVersion`,'POST',{payload:{data:Buffer.from(key).toString('base64')}});console.log('Stored API-specific credential binding securely');}
 const existing=(await s.webhookEndpoints.list({limit:100})).data.find(e=>e.url===endpoint);
 let secretExists=false;try{await google(`projects/${PROJECT}/secrets/${secretName}/versions/latest`);secretExists=true;}catch(e){if(e.status!==404)throw e;}
 if(existing&&!secretExists)throw Error('Endpoint exists without its saved signing secret; inspect before proceeding');
 if(!existing){
  const e=await s.webhookEndpoints.create({url:endpoint,description:'FYNX API Pro live subscriptions',api_version:Stripe.API_VERSION,enabled_events:['checkout.session.completed','invoice.paid','invoice.payment_failed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted']},{idempotencyKey:'fynx-api-live-webhook-v1'});
  if(!e.livemode||!e.secret)throw Error('Live webhook secret missing');
  try{await google(`projects/${PROJECT}/secrets?secretId=${secretName}`,'POST',{replication:{automatic:{}}});}catch(err){if(err.status!==409)throw err;}
  await google(`projects/${PROJECT}/secrets/${secretName}:addVersion`,'POST',{payload:{data:Buffer.from(e.secret).toString('base64')}});
  console.log('Created live payment webhook and securely stored its signing secret',e.id);
 }else console.log('Live webhook and stored secret already exist',existing.id);
 for(const name of ['FYNX_API_STRIPE_SECRET_KEY',secretName]){
  const path=`projects/${PROJECT}/secrets/${name}`,policy=await google(path+':getIamPolicy');
  const member=`serviceAccount:${PROJECT}@appspot.gserviceaccount.com`;
  const binding=(policy.bindings||[]).find(b=>b.role==='roles/secretmanager.secretAccessor'&&!b.condition);
  if(binding?.members?.includes(member))continue;
  if(binding)binding.members.push(member);else(policy.bindings||=[]).push({role:'roles/secretmanager.secretAccessor',members:[member]});
  await google(path+':setIamPolicy','POST',{policy});console.log('Granted membership runtime access to',name);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
