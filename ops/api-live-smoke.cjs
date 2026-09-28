'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const auth=require('/Users/h/.npm-global/lib/node_modules/firebase-tools/lib/auth'),admin=require('../backend/node_modules/firebase-admin'),Stripe=require('../backend/node_modules/stripe');
(async()=>{
 const a=auth.getGlobalDefaultAccount(),t=await auth.getAccessToken(a.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
 admin.initializeApp({projectId:'fynx-c7a28',credential:{getAccessToken:async()=>({access_token:t.access_token,expires_in:3600})}});
 const headers={Authorization:'Bearer '+t.access_token,'Content-Type':'application/json'};
 async function google(url,method='GET',body){const r=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const b=await r.json();if(!r.ok)throw Error('Google '+r.status);return b;}
 async function secret(name){const b=await google('https://secretmanager.googleapis.com/v1/projects/fynx-c7a28/secrets/'+name+'/versions/latest:access');return Buffer.from(b.payload.data,'base64').toString().trim();}
 const stripe=new Stripe(await secret('FYNX_API_STRIPE_SECRET_KEY'),{timeout:15000,maxNetworkRetries:2});
 const apiKey=fs.readFileSync('auth/firebase.js','utf8').match(/apiKey:\s*"([^"]+)"/)[1];
 const email='fynx-api-live-qa-'+Date.now()+'@example.invalid',password=crypto.randomBytes(24).toString('hex');
 const user=await admin.auth().createUser({email,password,emailVerified:true});
 const base='https://firestore.googleapis.com/v1/projects/fynx-c7a28/databases/(default)/documents',doc=base+'/fynxDevelopers/'+user.uid,functions='https://us-central1-fynx-c7a28.cloudfunctions.net/';
 let customer;const keys=[];
 async function removeTree(url){const cols=await google(url+':listCollectionIds','POST',{pageSize:100});for(const c of cols.collectionIds||[]){let next;do{const result=await google(url+'/'+c+'?pageSize=100'+(next?'&pageToken='+encodeURIComponent(next):''));for(const d of result.documents||[])await removeTree('https://firestore.googleapis.com/v1/'+d.name);next=result.nextPageToken;}while(next);}await google(url,'DELETE');}
 try{
  const login=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});const account=await login.json();assert(account.idToken,'QA login failed');
  const call=async(name,action,extra={})=>{const r=await fetch(functions+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+account.idToken},body:JSON.stringify({data:{action,environment:'live',...extra}}),signal:AbortSignal.timeout(60000)});const b=await r.json();if(b.error)throw Error(b.error.status+': '+b.error.message);return b.result;};
  const initial=await call('developerWorkspace','bootstrap');assert.equal(initial.billing_mode,'live');assert.equal(initial.limits.monthlyCalls,1000);assert.equal(initial.profile.requestCap,null);console.log('PASS free developer bootstrap and default plan allowance');
  const key=await call('developerWorkspace','createKey',{label:'Disposable live QA key'});keys.push(key.key);
  async function gateway(route,body){const r=await fetch(functions+'developerGateway'+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key.key},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});return {status:r.status,body:await r.json()};}
  const input={instrument_type:'forex',symbol:'EURUSD',account_currency:'USD',contract_size:'100000',quote_to_account_rate:'1',lot_step:'0.01',minimum_lot:'0.01',account_balance:'10000',risk_percent:'1',entry_price:'1.0850',stop_loss_price:'1.0820',direction:'long'};
  const risk=await gateway('/v1/risk/position-size',input);assert.equal(risk.status,200);assert.equal(risk.body.result.position_size,'0.33');console.log('PASS live API key executes the Risk API');
  const rule=await gateway('/v1/propfirm/rule-sets',{name:'Disposable QA rules',starting_balance:'100000',daily_loss_percent:'5',max_loss_percent:'10',profit_target_percent:'8',consistency_percent:'40',min_trading_days:5,reset_hour_utc:22,max_loss_type:'static'});assert.equal(rule.status,200);
  const acct=await gateway('/v1/propfirm/accounts',{name:'Disposable QA account',rule_set_id:rule.body.result.rule_set_id});assert.equal(acct.status,200);
  const event={idempotency_key:'qa-1',source_event_id:'qa-source',sequence:1,event_type:'closed_trade',timestamp:new Date().toISOString(),realized_pnl:'-150',unrealized_pnl_after:'0',open_position_count:0};const route='/v1/propfirm/accounts/'+acct.body.result.account_id+'/events';
  assert.equal((await gateway(route,event)).body.result.balance,'99850');assert.equal((await gateway(route,event)).body.duplicate,true);console.log('PASS Prop Firm Rules API and duplicate event protection');
  const checkout=await call('developerBilling','checkout');customer=(await google(doc)).fields.stripeLiveCustomer.stringValue;const sessions=(await stripe.checkout.sessions.list({customer,status:'open',limit:10})).data;assert.equal(sessions.length,1);const session=sessions[0];assert.equal(session.livemode,true);assert.equal(session.client_reference_id,user.uid);assert.equal((await stripe.checkout.sessions.listLineItems(session.id)).data[0].price.id,'price_1UKSHKKF1DV2t1wM2GFMJvnp');assert.equal((await call('developerBilling','checkout')).url,checkout.url);await stripe.checkout.sessions.expire(session.id);console.log('PASS exact live $49 API checkout, buyer binding and repeat-click reuse');
  const summary=await call('developerBilling','summary');assert.equal(summary.plan,'free');assert.equal(summary.invoices.length,0);assert.match((await call('developerBilling','portal')).url,/billing.stripe.com/);console.log('PASS unpaid checkout does not grant Pro; billing portal works');
  const webhook=functions+'developerBillingWebhook',payload=JSON.stringify({id:'evt_api_qa_'+Date.now(),type:'invoice.paid',created:Math.floor(Date.now()/1000),livemode:true,data:{object:{customer}}}),sig=Stripe.webhooks.generateTestHeaderString({payload,secret:await secret('FYNX_API_STRIPE_WEBHOOK_SECRET')});
  assert.equal((await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
  for(let i=0;i<2;i++)assert.equal((await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':sig},body:payload,signal:AbortSignal.timeout(60000)})).status,200);
  assert.equal((await call('developerWorkspace','bootstrap')).limits.plan,'free');console.log('PASS signed webhook/replay and forged-signature rejection; unpaid API stays free');
  const write=await fetch(doc,{method:'PATCH',headers:{Authorization:'Bearer '+account.idToken,'Content-Type':'application/json'},body:JSON.stringify({fields:{plan:{stringValue:'pro'}}})});assert.equal(write.status,403);console.log('PASS direct client plan forgery blocked');
  const count=(await call('developerWorkspace','bootstrap')).usage.calls;await call('developerWorkspace','settings',{name:'QA custom cap',requestCap:count+1});
  const results=await Promise.all([gateway('/v1/risk/position-size',input),gateway('/v1/risk/position-size',input)]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===429).length,1);console.log('PASS concurrent requests respect the saved cap without overage charging');
  await call('developerWorkspace','revokeKey',{id:key.id});assert.equal((await gateway('/v1/risk/position-size',input)).status,401);console.log('PASS revoked live API keys are denied');
  console.log('No charge made. Paid upgrade is covered by isolated tests; first real paid invoice remains to be verified.');
 }finally{
  if(!customer){try{customer=(await google(doc)).fields.stripeLiveCustomer?.stringValue;}catch{}}
  if(customer){for(const s of (await stripe.checkout.sessions.list({customer,status:'open',limit:100})).data)await stripe.checkout.sessions.expire(s.id);await stripe.customers.del(customer);}
  for(const key of keys)await google(base+'/fynxDeveloperKeys/'+crypto.createHash('sha256').update(key).digest('hex'),'DELETE');
  await removeTree(doc);await admin.auth().deleteUser(user.uid);console.log('Removed disposable API user, keys, Stripe customer and all QA developer records');
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
