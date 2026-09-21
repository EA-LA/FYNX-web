'use strict';
const functions=require('firebase-functions/v1');
const admin=require('firebase-admin');
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const engine=require('./developer-engine.cjs');
const {payloadHash:canonicalHash,validateInput,entitlement,effectiveCap}=require('./developer-core.cjs');
const logger=require('firebase-functions/logger');
const db=()=>admin.firestore();
const runtime=functions.runWith({secrets:['STRIPE_SECRET_KEY'],timeoutSeconds:60,memory:'256MB',maxInstances:10});
const root=uid=>db().collection('fynxDevelopers').doc(uid);
const envRef=(uid,env)=>root(uid).collection('environments').doc(env);
const error=(code,message)=>{throw new functions.https.HttpsError(code,message);};
const ident=x=>{if(typeof x!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(x))error('invalid-argument','Invalid identifier.');return x;};
const environment=x=>{if(!['test','live'].includes(x))error('invalid-argument','Choose test or live.');return x;};
const hash=x=>createHash('sha256').update(x).digest('hex');
const month=()=>new Date().toISOString().slice(0,7);
const rows=s=>s.docs.map(d=>({id:d.id,...d.data()}));
const clean=s=>String(s||'').trim().slice(0,120);
async function actor(context){if(!context.auth)error('unauthenticated','Sign in to your developer account.');const user=await admin.auth().getUser(context.auth.uid);if(user.disabled)error('permission-denied','Account disabled.');return user;}
async function throttle(uid,limit=90,bucket='manageRate'){const ref=root(uid).collection('private').doc(bucket);await db().runTransaction(async tx=>{const s=(await tx.get(ref)).data()||{},now=Date.now(),count=now-(s.start||0)<60000?(s.count||0)+1:1;if(count>limit)error('resource-exhausted','Too many workspace actions. Retry in a minute.');tx.set(ref,{start:count===1?now:s.start,count});});}
async function reserveRate(uid,env){
 const ref=envRef(uid,env).collection('private').doc('rate');
 await db().runTransaction(async tx=>{const [p,s]=await Promise.all([tx.get(root(uid)),tx.get(ref)]),limits=entitlement(p.data()||{},env),rate=s.data()||{},window=Math.floor(Date.now()/1000),count=rate.window===window?(rate.count||0)+1:1;if(count>limits.rps)error('resource-exhausted','Per-second rate limit reached.');tx.set(ref,{window,count});});
}
function telemetry(kind,status,started,extra={}){const data={service:'fynx_api',kind,status,duration_ms:Date.now()-started,...extra};if(status>=500)logger.error('FYNX API request failed',data);else logger.info('FYNX API request',data);}
const errorStatus=e=>e instanceof engine.InputError?422:({'unauthenticated':401,'permission-denied':403,'not-found':404,'already-exists':409,'failed-precondition':409,'resource-exhausted':429,'invalid-argument':422}[e.code]||500);
async function recordFailure(uid,env,route,e,requestId=randomUUID()){
 const status=errorStatus(e);await envRef(uid,env).collection('requests').doc(requestId).set({route:String(route).slice(0,200),at:Date.now(),status,error:{code:status===500?'internal':e.code||'invalid_input',message:status===500?'Temporary service error. Retry with the same event identifier.':e.message}});return requestId;
}
async function runOperation(uid,env,route,input,keyHash=null){
 if(!validateInput(input))error('invalid-argument','Send a JSON object under 20KB.');
 await reserveRate(uid,env);
 const er=envRef(uid,env),reqId=randomUUID(),at=Date.now(),requestRef=er.collection('requests').doc(reqId),usageRef=er.collection('usage').doc(month());
 const parsed=route.match(/^\/v1\/risk\/([a-z-]+)$/);
 return db().runTransaction(async tx=>{
  const profileSnap=await tx.get(root(uid)),usageSnap=await tx.get(usageRef);
  if(keyHash){const key=await tx.get(db().collection('fynxDeveloperKeys').doc(keyHash));if(!key.exists||key.data().revokedAt)error('unauthenticated','Key was revoked.');}
  const profile=profileSnap.data()||{},usage=usageSnap.data()||{},limits=entitlement(profile,env);
  const cap=effectiveCap(profile,limits);
  let result,duplicate=false;
  if(route.startsWith('GET ')){const m=route.match(/^GET \/v1\/propfirm\/accounts\/([-a-zA-Z0-9_]+)\/(status|events)$/);if(!m)error('not-found','Read endpoint not found.');const ar=er.collection('accounts').doc(m[1]),a=await tx.get(ar);if(!a.exists)error('not-found','Account not found.');if(m[2]==='status')result={account_id:a.id,...a.data()};else{let q=ar.collection('events').orderBy('at','desc').orderBy(admin.firestore.FieldPath.documentId(),'desc');if(input.before){if(!Number.isSafeInteger(Number(input.before)))error('invalid-argument','Invalid cursor');q=q.startAfter(Number(input.before),ident(input.beforeId));}result={items:rows(await tx.get(q.limit(25)))};}}
  else if(parsed)result=engine.risk(parsed[1],input);
  else if(route==='/v1/propfirm/rule-sets'){
   const r=engine.rules(input),ref=er.collection('rules').doc();const existing=await tx.get(er.collection('rules').limit(101));if(existing.size>=100)error('resource-exhausted','Maximum 100 rule sets per environment.');tx.create(ref,{...r,createdAt:at});result={rule_set_id:ref.id,...r};
  }else if(route==='/v1/propfirm/accounts'){
   const ruleSnap=await tx.get(er.collection('rules').doc(ident(input.rule_set_id)));if(!ruleSnap.exists)error('not-found','Rule set not found in this environment.');const label=clean(input.name);if(!label)error('invalid-argument','Account name is required.');const existing=await tx.get(er.collection('accounts').limit(101));if(existing.size>=100)error('resource-exhausted','Maximum 100 accounts per environment.');const ref=er.collection('accounts').doc(),r=ruleSnap.data(),state=engine.account(r,new Date(at).toISOString());tx.create(ref,{name:label,rule_set_id:ruleSnap.id,rule:r,...state,createdAt:at});result={account_id:ref.id,...state};
  }else{
   const m=route.match(/^\/v1\/propfirm\/accounts\/([-a-zA-Z0-9_]+)\/events$/);if(!m)error('not-found','Endpoint not found.');
   const ar=er.collection('accounts').doc(m[1]),as=await tx.get(ar);if(!as.exists)error('not-found','Account not found in this environment.');
   const id=ident(input.idempotency_key),source=ident(input.source_event_id),ev=ar.collection('events').doc(id),old=await tx.get(ev),payloadHash=canonicalHash(input),sourceRef=ar.collection('sources').doc(source),sourceSnap=await tx.get(sourceRef);
   if(old.exists){if(old.data().payloadHash!==(old.data().hashVersion===2?payloadHash:hash(JSON.stringify(input))))error('already-exists','Idempotency key was used for a different payload.');result=old.data().result;duplicate=true;}
   else{if(sourceSnap.exists)error('already-exists','Source event already recorded.');const a=as.data(),next=engine.event(a,a.rule,input,at);delete next.last_event_hash;const previous_event_hash=a.last_event_hash||null,event_hash=canonicalHash({previous_event_hash,request:input,state:next});next.last_event_hash=event_hash;result={account_id:ar.id,...next};tx.update(ar,next);tx.create(ev,{at,payloadHash,hashVersion:2,engine_version:2,previous_event_hash,event_hash,source_event_id:source,request:input,result});tx.create(sourceRef,{event_id:id});}
  }
  if(!duplicate&&(usage.calls||0)>=Math.min(cap,limits.monthlyCalls))error('resource-exhausted','Monthly allowance or your saved request cap reached. No overage charges apply.');
  if(!duplicate){tx.set(usageRef,{calls:(usage.calls||0)+1,updatedAt:at});tx.create(requestRef,{route,at,status:200,duration_ms:Date.now()-at,result,source:keyHash?'api_key':'playground'});}
  return {request_id:reqId,status:200,result,duplicate,limit:cap,remaining:Math.max(0,cap-(usage.calls||0)-(duplicate?0:1))};
 });
}
async function workspace(data,context){
 const user=await actor(context),uid=user.uid;await throttle(uid);const env=environment(data?.environment||'test'),er=envRef(uid,env),action=data?.action;
 try{
 if(action==='bootstrap'){
  const ref=root(uid);await db().runTransaction(async tx=>{const s=await tx.get(ref);if(!s.exists)tx.create(ref,{name:clean(user.displayName||'My API workspace'),email:user.email||'',createdAt:Date.now(),plan:'free',requestCap:1000});});
  await require('./developer-billing.cjs').refresh(uid);
  const [p,u,k,r,a,q]=await Promise.all([ref.get(),er.collection('usage').doc(month()).get(),er.collection('keys').orderBy('createdAt','desc').limit(50).get(),er.collection('rules').limit(100).get(),er.collection('accounts').limit(100).get(),er.collection('requests').orderBy('at','desc').orderBy(admin.firestore.FieldPath.documentId(),'desc').limit(25).get()]);
  return {profile:p.data(),usage:u.data()||{calls:0},limits:entitlement(p.data(),env),keys:rows(k),rules:rows(r),accounts:rows(a),requests:rows(q),month:month(),billing_mode:String(process.env.FYNX_API_STRIPE_SECRET_KEY||process.env.STRIPE_SECRET_KEY||'').startsWith('sk_live_')?'live':'test',emailVerified:user.emailVerified,apiBase:'https://us-central1-fynx-c7a28.cloudfunctions.net/developerGateway'};
 }
 if(['createKey','rotateKey','revokeKey'].includes(action)){
  if(!user.emailVerified)error('failed-precondition','Verify your email before creating or changing API keys.');
  const token='fynx_'+env+'_'+randomBytes(32).toString('hex'),digest=hash(token),keyId=randomUUID(),label=clean(data.label)||'API key',newRef=db().collection('fynxDeveloperKeys').doc(digest),listing=er.collection('keys').doc(keyId);
  await db().runTransaction(async tx=>{
   const p=await tx.get(root(uid));if(!p.exists)error('failed-precondition','Open the workspace first.');
   const existing=await tx.get(er.collection('keys'));if(action!=='revokeKey'&&existing.docs.filter(s=>!s.data().revokedAt).length>=10&&action!=='rotateKey')error('resource-exhausted','Maximum 10 active keys per environment.');
   let oldRef,old;if(action!=='createKey'){oldRef=er.collection('keys').doc(ident(data.id));old=await tx.get(oldRef);if(!old.exists||old.data().revokedAt)error('not-found','Active key not found.');}
   if(old){tx.update(db().collection('fynxDeveloperKeys').doc(old.data().digest),{revokedAt:Date.now()});tx.update(oldRef,{revokedAt:Date.now()});}
   if(action!=='revokeKey'){tx.create(newRef,{uid,environment:env,keyId,createdAt:Date.now(),revokedAt:null});tx.create(listing,{label,prefix:token.slice(0,15)+'…'+token.slice(-4),digest,createdAt:Date.now(),revokedAt:null});}
   tx.create(er.collection('audit').doc(),{at:Date.now(),action,key_id:action==='revokeKey'?data.id:keyId,previous_key_id:action==='rotateKey'?data.id:null});
  });return action==='revokeKey'?{revoked:true}:{key:token,id:keyId,shown_once:true};
 }
 if(action==='run'){await require('./developer-billing.cjs').refresh(uid);try{return await runOperation(uid,env,String(data.route||''),data.input||{});}catch(e){const request_id=await recordFailure(uid,env,data.route,e);if(!(e instanceof engine.InputError))throw e;return {request_id,status:422,error:{code:e.code,message:e.message}};}}
 if(action==='history'){const limit=25;let q=data.audit?er.collection('audit'):data.accountId?er.collection('accounts').doc(ident(data.accountId)).collection('events'):er.collection('requests');q=q.orderBy('at','desc').orderBy(admin.firestore.FieldPath.documentId(),'desc');if(data.before!==undefined){if(!Number.isSafeInteger(data.before))error('invalid-argument','Invalid history cursor.');q=q.startAfter(data.before,ident(data.beforeId));}return {items:rows(await q.limit(limit).get())};}
 if(action==='settings'){const name=clean(data.name),cap=Number(data.requestCap);if(!name||!Number.isInteger(cap)||cap<1||cap>50000)error('invalid-argument','Name and request cap (1–50,000) are required.');const batch=db().batch();batch.set(root(uid),{name,requestCap:cap,updatedAt:Date.now()},{merge:true});batch.create(er.collection('audit').doc(),{at:Date.now(),action:'settings',name,requestCap:cap});await batch.commit();return {saved:true};}
 if(action==='support'){const subject=clean(data.subject),message=String(data.message||'').trim();if(!subject||message.length<10||message.length>4000)error('invalid-argument','Add a subject and a message between 10 and 4,000 characters.');const ref=root(uid).collection('support').doc();await ref.set({subject,message,createdAt:Date.now(),status:'open',email:user.email||''});return {ticket_id:ref.id};}
 error('invalid-argument','Unknown workspace action.');
 }catch(e){if(e instanceof engine.InputError)error(e.code==='event_order_conflict'?'failed-precondition':'invalid-argument',e.message);throw e;}
}
exports.developerWorkspace=runtime.https.onCall(async(data,context)=>{const started=Date.now();let status=200;try{const result=await workspace(data,context);status=result?.status||200;return result;}catch(e){status=errorStatus(e);throw e;}finally{telemetry('workspace',status,started,{action:['bootstrap','createKey','rotateKey','revokeKey','run','history','settings','support'].includes(data?.action)?data.action:'unknown'});}});
exports.developerGateway=runtime.https.onRequest(async(req,res)=>{
 const started=Date.now(),requestId=randomUUID();res.set('X-Request-Id',requestId);res.on('finish',()=>telemetry('gateway',res.statusCode,started,{request_id:res.getHeader('X-Request-Id')}));
 let owner=null,ownerEnv=null;res.set('Cache-Control','no-store');if(!['GET','POST'].includes(req.method))return res.status(405).json({error:{code:'method_not_allowed',message:'Use GET for reads or POST for writes.'}});
 try{
  if(req.method==='POST'&&(!req.is('application/json')||!validateInput(req.body)))return res.status(400).json({error:{code:'invalid_request',message:'Send a JSON body under 20KB.'}});
  const token=(req.get('Authorization')||'').replace(/^Bearer /,'');if(!/^fynx_(test|live)_[a-f0-9]{64}$/.test(token))error('unauthenticated','Invalid API key.');
  const digest=hash(token),key=await db().collection('fynxDeveloperKeys').doc(digest).get();if(!key.exists||key.data().revokedAt)error('unauthenticated','Invalid or revoked API key.');
  const {uid,environment:env}=key.data(),user=await admin.auth().getUser(uid);if(user.disabled||!user.emailVerified)error('permission-denied','Owner account is not eligible for API access.');
  owner=uid;ownerEnv=env;await throttle(uid,1800,'gatewayRate');
  await require('./developer-billing.cjs').refresh(uid);
  const route=(req.method==='GET'?'GET ':'')+req.path.replace(/\/$/,'');const output=await runOperation(uid,env,route,req.method==='GET'?req.query:req.body,digest);res.set('X-Request-Id',output.request_id);if(output.limit){res.set('X-RateLimit-Limit',String(output.limit));res.set('X-RateLimit-Remaining',String(output.remaining));}return res.status(output.status).json(output);
 }catch(e){const status=errorStatus(e);if(owner){await recordFailure(owner,ownerEnv,req.path,e,requestId).catch(()=>{});}if(status===429)res.set('Retry-After','60');return res.status(status).json({error:{code:e.code||'internal',message:status===500?'Temporary service error. Retry with the same event identifier.':e.message}});}
});
exports.developerHealth=functions.runWith({timeoutSeconds:15,memory:'256MB',maxInstances:2}).https.onRequest(async(req,res)=>{
 res.set('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).end();
 const started=Date.now();try{await db().collection('fynxDeveloperOperations').doc('health').get();const result=engine.risk('risk-reward',{entry_price:'100',stop_loss_price:'90',take_profit_price:'130',direction:'long'});if(result.rr_ratio!=='3')throw new Error('Calculation self-check failed');res.status(200).json({status:'ok',engine_version:2});}catch(e){telemetry('health',503,started);res.status(503).json({status:'unavailable'});}
});
exports._test={entitlement,hash};
