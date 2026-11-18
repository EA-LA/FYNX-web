'use strict';
const {hash,fail}=require('./account-sync-core.cjs');
const {randomUUID}=require('node:crypto');
async function deleteAccount({auth,db,uid,expectedUid,authTime,now=Date.now()}){
 if(!uid||expectedUid!==uid)fail('failed-precondition','Your account changed. Sign in again before deleting it.');
 if(!Number.isSafeInteger(authTime)||authTime>Math.floor(now/1000)+60||now-authTime*1000>5*60*1000)fail('failed-precondition','Sign in again before deleting your account.',{reason:'recent-login-required'});
 const marker=db.collection('fynxAccountSyncDeleted').doc(hash(uid));
 // Block sync immediately; existing cleanup functions run from Auth deletion.
 const requestId=randomUUID();await marker.set({requestedAt:now,requestId},{merge:true});
 try{await auth.deleteUser(uid);}catch(error){if(error.code!=='auth/user-not-found'){
  // Roll back only after independently confirming this identity still exists.
  // Uncertain state stays blocked; an Auth deletion trigger or explicit retry
  // completes it. Never remove another attempt's marker or a cleanup tombstone.
  let existing=false;try{existing=(await auth.getUser(uid)).uid===uid;}catch{}
  if(existing)await db.runTransaction(async tx=>{const latest=(await tx.get(marker)).data();if(latest?.requestId===requestId&&!latest.deletionObservedAt&&!latest.completedAt)tx.delete(marker);});
  throw error;
 }}
 return {deleted:true,dataCleanup:'scheduled'};
}
async function cleanupAccount({db,bucket,uid,now=Date.now()}){
 if(typeof uid!=='string'||!uid||uid.includes('/'))fail('invalid-argument','Invalid account identity.');
 const marker=db.collection('fynxAccountSyncDeleted').doc(hash(uid));await marker.set({deletionObservedAt:now},{merge:true});
 // Keep Stripe customer/purchase ownership references for verified billing and
 // refund records. Remove personal saved work, not the provider ledger.
 for(const ref of [db.collection('fynxAccountSyncUsers').doc(uid),db.collection('users').doc(uid),db.collection('fynxWebUsers').doc(uid),db.collection('fynxConsumerLive').doc(uid).collection('saved'),db.collection('fynxConsumerTest').doc(uid).collection('saved')])await db.recursiveDelete(ref);
 await db.collection('fynxAccountMemberships').doc(uid).delete();
 // Email reminders carry ownership at their top-level queue record.
 for(;;){const reminders=await db.collection('fynxWebReminders').where('uid','==',uid).limit(100).get();if(!reminders.docs.length)break;for(const doc of reminders.docs)await doc.ref.delete();}
 if(bucket){await bucket.deleteFiles({prefix:'users/'+uid+'/',force:true});await bucket.file('user_avatars/'+uid+'.jpg').delete({ignoreNotFound:true});}
 await marker.set({completedAt:now},{merge:true});return {deleted:true};
}
module.exports={deleteAccount,cleanupAccount};
