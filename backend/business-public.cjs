'use strict';
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const {createHash} = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const idPattern = /^FYNX-[A-F0-9]{8}$/;
const origins = new Set(['https://www.fynxfinanceworld.com','https://fynxfinanceworld.com','https://site.fynxfinanceworld.com','https://ea-la.github.io']);
const runtime = functions.runWith({timeoutSeconds:20,memory:'256MB',maxInstances:2});
function fail(code,message) { throw new functions.https.HttpsError(code,message); }
function waitlistInput(data) {
  if (!data || typeof data.email !== 'string' || typeof data.name !== 'string') fail('invalid-argument','Enter your name and email.');
  const email=data.email.trim().toLowerCase(),name=data.name.trim();
  if (email.length>160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length<2 || name.length>80 || /[\x00-\x1f]/.test(name)) fail('invalid-argument','Enter a valid name and email.');
  if (data.consent!==true) fail('invalid-argument','Confirm that you want early-access updates.');
  return {email,name,source:['money-management','financeworld','android'].includes(data.source)?data.source:'financeworld'};
}
async function joinWaitlist(data,ip,{db=admin.firestore(),now=Date.now()}={}) {
  const input=waitlistInput(data);
  // Neither existing addresses nor registration counts are returned to the public.
  const ref=db.collection('waitlist').doc('v2_'+hash(input.email));
  const rate=db.collection('fynxPublicRateLimits').doc('waitlist_'+hash(new Date(now).toISOString().slice(0,10)+':'+ip));
  await db.runTransaction(async tx=>{
    const [limit,saved]=await Promise.all([tx.get(rate),tx.get(ref)]);
    const old=limit.data()||{},fresh=now-(old.start||0)>=3600000,count=fresh?0:(old.count||0);
    if(count>=5)fail('resource-exhausted','Please wait before trying again.');
    tx.set(rate,{start:fresh?now:old.start,count:count+1,expiresAt:admin.firestore.Timestamp.fromMillis(now+86400000)});
    if(!saved.exists)tx.create(ref,{email:input.email,fullName:input.name,source:input.source,status:'early_access_waitlist',consent:true,consentVersion:'early-access-v1',createdAt:admin.firestore.Timestamp.fromMillis(now)});
  });
  return {accepted:true};
}
function publicProfile(data,id) {
  if(!idPattern.test(id)||!data||data.publicEnabled!==true)return null;
  return {id,username:typeof data.username==='string'?data.username.slice(0,80):'Trader',notice:'Shared by this account. No verified performance statistics are published.'};
}
async function sharing(data,context,{db=admin.firestore(),now=Date.now()}={}) {
  if(!context.auth)fail('unauthenticated','Sign in to manage profile sharing.');
  const uid=context.auth.uid;
  if(!['status','set'].includes(data?.action))fail('invalid-argument','Unknown sharing action.');
  if(data.action==='set'&&typeof data.enabled!=='boolean')fail('invalid-argument','Choose whether to publish your profile.');
  if(data.action==='set'&&data.enabled&&context.auth.token.email_verified!==true)fail('failed-precondition','Verify your email before publishing your profile.');
  return db.runTransaction(async tx=>{
    const userRef=db.collection('users').doc(uid),user=await tx.get(userRef),record=user.data()||{};
    const id=idPattern.test(record.fynxId||'')?record.fynxId:'FYNX-'+hash(uid).slice(0,8).toUpperCase();
    const ref=db.collection('fynxSharedProfiles').doc(id),snap=await tx.get(ref),old=snap.data();
    if(old&&old.uid!==uid)fail('failed-precondition','This profile ID needs support review.');
    if(data.action==='status')return {id,enabled:old?.publicEnabled===true};
    // Only the account's display name and ID are published, never its private user document.
    tx.set(ref,{uid,username:typeof record.username==='string'?record.username.slice(0,80):'Trader',publicEnabled:data.enabled,updatedAt:admin.firestore.Timestamp.fromMillis(now)});
    if(record.fynxId!==id)tx.set(userRef,{fynxId:id},{merge:true});
    return {id,enabled:data.enabled};
  });
}
function cors(req,res) {
  const origin=req.get('origin');res.set('Cache-Control','no-store');res.set('Vary','Origin');
  if(origin&&!origins.has(origin)) {res.status(403).json({error:'Origin not allowed'});return false;}
  if(origin)res.set('Access-Control-Allow-Origin',origin);
  if(req.method==='OPTIONS'){res.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.set('Access-Control-Allow-Headers','Content-Type');res.status(204).end();return false;}
  return true;
}
exports.webWaitlist=runtime.https.onRequest(async(req,res)=>{
  if(!cors(req,res))return;
  if(req.method!=='POST')return res.status(405).json({error:'Use POST'});
  if(!req.is('application/json')||Number(req.get('content-length')||0)>2048)return res.status(400).json({error:'Invalid request'});
  try{return res.json(await joinWaitlist(req.body,req.ip||'unknown'));}
  catch(e){const code=e.code==='resource-exhausted'?429:e.code==='invalid-argument'?400:503;return res.status(code).json({error:code===503?'The waitlist is temporarily unavailable. Please try again.':e.message});}
});
exports.webProfileSharing=runtime.https.onCall((data,context)=>sharing(data,context));
exports.webSharedProfile=runtime.https.onRequest(async(req,res)=>{
  if(!cors(req,res))return;
  if(req.method!=='GET')return res.status(405).json({error:'Use GET'});
  const id=typeof req.query.id==='string'?req.query.id:'';
  if(!idPattern.test(id))return res.status(400).json({error:'Use a valid shared FYNX ID.'});
  try{const snap=await admin.firestore().collection('fynxSharedProfiles').doc(id).get();const profile=publicProfile(snap.data(),id);return profile?res.json(profile):res.status(404).json({error:'This profile is private or has not been published.'});}
  catch{return res.status(503).json({error:'Profile unavailable. Please try again.'});}
});
exports._test={waitlistInput,joinWaitlist,publicProfile,sharing};
