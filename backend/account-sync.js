'use strict';
const functions=require('firebase-functions/v1'),admin=require('firebase-admin');
const {createService}=require('./account-sync-service.cjs');
const {createMembership}=require('./account-sync-membership.cjs');
const {deleteAccount,cleanupAccount}=require('./account-sync-delete.cjs');
const {SyncError}=require('./account-sync-core.cjs');
if(!admin.apps.length)admin.initializeApp();
const db=admin.firestore();
const stripe=()=>{const key=process.env.FYNX_CONSUMER_STRIPE_SECRET_KEY||'';if(!/^(sk|rk)_live_/.test(key))throw Error('Membership verification unavailable');return new(require('stripe'))(key,{maxNetworkRetries:1,timeout:10000});};
const membership=createMembership({db,stripe,bridgeEnabled:()=>process.env.FYNX_ACCOUNT_MEMBERSHIP_BRIDGE==='pro-equivalent'});
const service=createService({db,toTimestamp:ms=>admin.firestore.Timestamp.fromMillis(ms),membership});
async function verified(ctx){if(!ctx.auth?.uid||ctx.auth.token?.firebase?.sign_in_provider==='anonymous')throw new functions.https.HttpsError('unauthenticated','Sign in to continue.');const user=await admin.auth().getUser(ctx.auth.uid),signedIn=ctx.auth.token.auth_time;if(user.disabled||!Number.isSafeInteger(signedIn)||Date.parse(user.tokensValidAfterTime)>signedIn*1000)throw new functions.https.HttpsError('unauthenticated','Your session expired. Sign in again.');return user;}
async function handle(fn){try{return await fn();}catch(error){if(error instanceof functions.https.HttpsError)throw error;if(error instanceof SyncError)throw new functions.https.HttpsError(error.code,error.message,error.details);functions.logger.error('account_sync_failed',{code:String(error.code||'internal')});throw new functions.https.HttpsError('unavailable','Your account could not synchronize. Your local changes remain available.');}}
exports.fynxAccountSync=functions.region('us-central1').runWith({secrets:['FYNX_CONSUMER_STRIPE_SECRET_KEY'],timeoutSeconds:120,memory:'512MB',maxInstances:5}).https.onCall((data,ctx)=>handle(async()=>{await verified(ctx);return service.handle(data,ctx);}));
exports.fynxAccountDelete=functions.region('us-central1').runWith({timeoutSeconds:60,memory:'256MB',maxInstances:3}).https.onCall((data,ctx)=>handle(async()=>{await verified(ctx);return deleteAccount({auth:admin.auth(),db,uid:ctx.auth.uid,expectedUid:data?.expectedUid,authTime:ctx.auth.token.auth_time});}));
exports.fynxAccountSyncAccountDeleted=functions.region('us-central1').runWith({timeoutSeconds:540,memory:'512MB',maxInstances:2,failurePolicy:true}).auth.user().onDelete(user=>cleanupAccount({db,bucket:admin.storage().bucket(),uid:user.uid}));
