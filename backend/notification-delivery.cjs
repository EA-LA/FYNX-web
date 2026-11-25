'use strict';
const functions=require('firebase-functions/v1'),admin=require('firebase-admin'),webpush=require('web-push');
const {createHash}=require('node:crypto');
const db=()=>admin.firestore(), queue=()=>db().collection('fynxWebNotificationDelivery');
const preferences=uid=>db().doc(`users/${uid}/account/notificationPreferences`);
const subscriptions=()=>db().collection('fynxWebPushSubscriptions');
const fail=(code,message)=>{throw new functions.https.HttpsError(code,message);};
const hash=value=>createHash('sha256').update(value).digest('hex');
const origin='https://www.fynxfinanceworld.com';
function validateSubscription(value){
 if(!value || typeof value.endpoint!=='string' || value.endpoint.length>2048)fail('invalid-argument','Invalid push subscription.');
 let url;try{url=new URL(value.endpoint);}catch{fail('invalid-argument','Invalid push endpoint.');}
 const host=url.hostname;
 if(url.protocol!=='https:' || url.username || url.password || url.port || !(host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host==='web.push.apple.com'||host.endsWith('.notify.windows.com')))fail('invalid-argument','Unsupported push service.');
 const keys=value.keys;
 if(!keys || !/^[A-Za-z0-9_-]{87}=?$/.test(keys.p256dh||'') || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(keys.auth||''))fail('invalid-argument','Invalid subscription keys.');
 return {endpoint:url.href,keys:{p256dh:keys.p256dh,auth:keys.auth}};
}
function categoryEnabled(prefs,category){
 const key={market_news:'breakingNews',breaking_news:'breakingNews',economic_calendar:'highImpactEconomic',account_security:'accountSecurity',platform_updates:'platformUpdates',billing_challenges:'billingChallenges'}[category];
 return Boolean(key) && prefs[key]!==false && (category!=='economic_calendar'||prefs.calendarReminders!==false);
}
function channelsFor(notification,prefs){
 if(!categoryEnabled(prefs,notification.category))return [];
 const allowed=Array.isArray(notification.deliveryChannels)?notification.deliveryChannels:[];
 return ['email','push'].filter(channel=>allowed.includes(channel)&&prefs[channel+'Enabled']===true);
}
function quiet(prefs,now=Date.now()){
 const q=prefs.quietHours;if(!q?.enabled)return false;
 if(!/^\d{2}:\d{2}$/.test(q.start||'')||!/^\d{2}:\d{2}$/.test(q.end||''))return false;
 try{const time=new Intl.DateTimeFormat('en-GB',{timeZone:q.timezone||'UTC',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);return q.start<q.end?time>=q.start&&time<q.end:q.start!==q.end&&(time>=q.start||time<q.end);}catch{return false;}
}
function articlePath(notification){
 const raw=String(notification.sourceUrl||notification.link||'');
 if(raw.startsWith('/news/article.html'))return raw;
 if(/^https:\/\//.test(raw)&&!raw.includes('@'))return '/news/article.html?url='+encodeURIComponent(raw);
 return '/notifications.html';
}
function payloadFor(notification,id){return {title:String(notification.title||'FYNX notification').slice(0,120),body:String(notification.message||notification.body||'You have a new notification.').slice(0,600),url:origin+articlePath(notification),tag:'fynx-'+id};}
async function sendEmail(user,payload,{testMode=false,fetcher=fetch}={}){
 const body=new URLSearchParams({from:'FYNX Finance World <notifications@mail.fynxfunded.com>',to:user.email,subject:payload.title.replace(/[\r\n]/g,' '),text:payload.body+'\n\nView and manage your notifications: '+origin+'/notifications.html\n\nYou enabled email alerts in FYNX. Turn them off in Notification Preferences.','o:tag':'fynx-web-notification'});
 if(testMode)body.set('o:testmode','yes');
 const response=await fetcher('https://api.mailgun.net/v3/mail.fynxfunded.com/messages',{method:'POST',headers:{Authorization:'Basic '+Buffer.from('api:'+process.env.MAILGUN_API_KEY).toString('base64')},body,signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Email provider HTTP '+response.status);
 return (await response.json()).id||'accepted';
}
function vapid(){const config=JSON.parse(process.env.WEB_PUSH_VAPID||'{}');if(!config.publicKey||!config.privateKey)fail('unavailable','Push delivery is not configured.');return config;}
const runtime=functions.runWith({timeoutSeconds:30,memory:'256MB',maxInstances:4,secrets:['WEB_PUSH_VAPID']});
exports.webNotificationSettings=runtime.https.onCall(async(data,context)=>{
 const uid=context.auth?.uid;if(!uid)fail('unauthenticated','Sign in to manage notifications.');
 const action=data?.action;
 if(action==='status'){
  const recent=await db().doc(`fynxWebUsers/${uid}/internal/notificationDelivery`).get();
  let subscribed=false;
  if(data.subscription){const sub=validateSubscription(data.subscription),device=await subscriptions().doc(hash(sub.endpoint)).get();subscribed=device.exists&&device.data().uid===uid;}
  return {publicKey:vapid().publicKey,subscribed,deliveries:recent.exists?[recent.data()]:[]};
 }
 if(action==='email'){
  if(typeof data.enabled!=='boolean')fail('invalid-argument','Choose an email preference.');
  const user=await admin.auth().getUser(uid);
  if(data.enabled&&(!user.emailVerified||!user.email||user.disabled))fail('failed-precondition','Verify your account email before enabling email alerts.');
  await preferences(uid).set({emailEnabled:data.enabled,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});return {enabled:data.enabled};
 }
 if(action==='subscribe'||action==='unsubscribe'){
  const subscription=validateSubscription(data.subscription),ref=subscriptions().doc(hash(subscription.endpoint));
  await db().runTransaction(async tx=>{
   const old=await tx.get(ref);
   if(action==='unsubscribe'){if(old.exists&&old.data().uid===uid)tx.delete(ref);return;}
   const own=await tx.get(subscriptions().where('uid','==',uid));
   if(!old.exists&&own.size>=10)fail('resource-exhausted','Remove an old browser before adding another.');
   // The same browser endpoint is reassigned on explicit opt-in by a new account.
   tx.set(ref,{uid,subscription,updatedAt:Date.now()});
   tx.set(preferences(uid),{pushEnabled:true,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  });
  return {enabled:action==='subscribe'};
 }
 fail('invalid-argument','Unknown notification action.');
});
exports.webNotificationEnqueue=functions.runWith({timeoutSeconds:30,memory:'256MB',maxInstances:4}).firestore.document('users/{uid}/notifications/{notificationId}').onCreate(async(snap,context)=>{
 const {uid,notificationId}=context.params,notification=snap.data();
 if(notification.userId!==uid)return;
 const prefs=(await preferences(uid).get()).data()||{},channels=channelsFor(notification,prefs);if(!channels.length)return;
 const ref=queue().doc(hash(uid+'/'+notificationId));
 const rate=db().doc(`fynxWebUsers/${uid}/internal/notificationRate`),now=Date.now();
 await db().runTransaction(async tx=>{
  const [existing,limit]=await Promise.all([tx.get(ref),tx.get(rate)]);if(existing.exists)return;
  const old=limit.data()||{},count=now-(old.start||0)<3600000?(old.count||0):0;
  if(count>=20){tx.create(ref,{uid,notificationId,status:'rate_limited',createdAt:now,results:{}});return;}
  tx.set(rate,{start:count?old.start:now,count:count+1});
  tx.create(ref,{uid,notificationId,channels,status:'pending',pendingAt:now,createdAt:now,results:{}});
 });
});
async function deliverJob(snap){
 const now=Date.now();
 const job=await db().runTransaction(async tx=>{
  const fresh=await tx.get(snap.ref),d=fresh.data();if(!d||d.pendingAt>now)return null;
  if(d.status==='sending'){tx.update(snap.ref,{status:'delivery_unconfirmed',pendingAt:admin.firestore.FieldValue.delete()});return null;}
  if(d.status!=='pending')return null;
  tx.update(snap.ref,{status:'sending',pendingAt:now+300000});return d;
 });if(!job)return;
 const results={};
 try{
  const [user,pref,notification]=await Promise.all([admin.auth().getUser(job.uid),preferences(job.uid).get(),db().doc(`users/${job.uid}/notifications/${job.notificationId}`).get()]);
  const prefs=pref.data()||{},item=notification.data();
  if(user.disabled||!item||item.archived||now-job.createdAt>86400000){await snap.ref.update({status:'skipped',pendingAt:admin.firestore.FieldValue.delete()});return;}
  if(quiet(prefs,now)){await snap.ref.update({status:'pending',pendingAt:now+60000});return;}
  const channels=channelsFor(item,prefs).filter(c=>job.channels.includes(c)),payload={...payloadFor(item,job.notificationId),uid:job.uid};
  for(const channel of job.channels){
   if(!channels.includes(channel)){results[channel]='disabled';continue;}
   if(channel==='email'){
    if(!user.emailVerified||!user.email){results.email='email_unverified';continue;}
    try{await sendEmail(user,payload);results.email='accepted';}catch{results.email='delivery_unconfirmed';}
   }else{
    const devices=await subscriptions().where('uid','==',job.uid).get();let accepted=0,failed=0;
    const config=vapid();
    await Promise.all(devices.docs.map(async device=>{
     // Recheck ownership immediately before sending; a shared browser may have switched accounts.
     const fresh=await device.ref.get();if(!fresh.exists||fresh.data().uid!==job.uid)return;
     try{await webpush.sendNotification(validateSubscription(fresh.data().subscription),JSON.stringify(payload),{vapidDetails:{subject:origin,publicKey:config.publicKey,privateKey:config.privateKey},TTL:3600,timeout:15000});accepted++;}
     catch(error){failed++;if([404,410].includes(error.statusCode))await db().runTransaction(async tx=>{const current=await tx.get(device.ref);if(current.exists&&current.data().uid===job.uid)tx.delete(device.ref);});}
    }));
    results.push=accepted?(failed?'partially_accepted':'accepted'):(failed?'failed':'no_subscribed_browser');
   }
   // Persist channel result before another provider call. Interrupted jobs are never blindly resent.
   await snap.ref.update({results});
  }
  await snap.ref.update({status:'processed',results,finishedAt:Date.now(),pendingAt:admin.firestore.FieldValue.delete()});
  await db().doc(`fynxWebUsers/${job.uid}/internal/notificationDelivery`).set({id:job.notificationId,createdAt:job.createdAt,channels:results,status:'processed'});
 }catch(error){console.warn('Notification delivery incomplete',error.code||'unknown');await snap.ref.update({status:'delivery_unconfirmed',results,pendingAt:admin.firestore.FieldValue.delete()});}
}
exports.webNotificationDelivery=functions.runWith({timeoutSeconds:120,memory:'256MB',maxInstances:1,secrets:['MAILGUN_API_KEY','WEB_PUSH_VAPID']}).pubsub.schedule('every 1 minutes').onRun(async()=>{
 const jobs=await queue().where('pendingAt','<=',Date.now()).limit(10).get();await Promise.all(jobs.docs.map(deliverJob));
});
exports._test={validateSubscription,categoryEnabled,channelsFor,quiet,payloadFor,articlePath,sendEmail,deliverJob};
