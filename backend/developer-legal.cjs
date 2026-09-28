'use strict';
const {createHash}=require('node:crypto');
const {canonical}=require('./developer-core.cjs');
const defaultRelease=require('./legal-release.json');
const digest=x=>createHash('sha256').update(typeof x==='string'?x:canonical(x)).digest('hex');
const fail=message=>{const e=new Error(message);e.code='failed-precondition';throw e;};
function contentHash(r){return digest({version:r.version,identity:r.identity,billing:r.billing,documents:r.documents});}
function blockers(r,requirePublished=true){
 const missing=[];
 if(!/^[a-z0-9-]{1,64}$/.test(r.version||''))missing.push('version');
 for(const k of ['legal_name','address','jurisdiction','support_email','privacy_email'])if(typeof r.identity?.[k]!=='string'||!r.identity[k].trim())missing.push('identity.'+k);
 if(r.billing?.amount_cents!==4900||r.billing?.currency!=='USD'||r.billing?.interval!=='month'||r.billing?.cancel_at!=='period_end'||r.billing?.overages!==false)missing.push('billing contract mismatch');
 if(!['exclusive','inclusive'].includes(r.billing?.tax_behavior)||r.billing?.tax_configuration_verified!==true)missing.push('verified tax configuration');
 if(!r.billing?.refund_policy||!r.billing?.recurring_statement)missing.push('refund/recurring disclosure');
 for(const name of ['terms','privacy','billing']){
  const doc=r.documents?.[name];
  if(!doc?.body||doc.sha256!==digest(doc.body)||/\[[^\]\n]*(?:insert|confirm|legal entity|review|date|address|jurisdiction)[^\]\n]*\]/i.test(doc.body))missing.push(name+' final content/hash');
 }
 const hash=contentHash(r);
 if(r.approval?.bundle_sha256!==hash||!r.approval?.owner_reference||!r.approval?.legal_review_reference||!r.approval?.reviewed_by||!Number.isFinite(Date.parse(r.approval?.reviewed_at)))missing.push('owner and legal review of exact document bundle');
 if(requirePublished&&(r.publication?.bundle_sha256!==hash||!Number.isFinite(Date.parse(r.publication?.verified_at))))missing.push('verified publication');
 return missing;
}
function service(release=defaultRelease){
 // Snapshot configuration so runtime callers cannot mutate the accepted release.
 const r=JSON.parse(JSON.stringify(release)),hash=contentHash(r),id=r.version+'-'+hash;
 const describe=()=>({available:blockers(r).length===0,version:r.version,bundle_sha256:hash,documents:Object.fromEntries(['terms','privacy','billing'].map(name=>[name,{url:'https://www.fynxfinanceworld.com/api/legal/'+r.version+'/'+name+'.html',sha256:r.documents?.[name]?.sha256||null}])),recurring_statement:r.billing?.recurring_statement||'',refund_policy:r.billing?.refund_policy||''});
 const ref=(db,uid)=>db.collection('fynxDevelopers').doc(uid).collection('legalAcceptances').doc(id);
 const requireReady=()=>{if(blockers(r).length)fail('Approved published API terms and billing policies are not ready. Paid checkout remains unavailable.');};
 function record(uid,input,at=Date.now()){
  requireReady();
  if(!uid||input?.version!==r.version||input?.bundle_sha256!==hash||input?.terms_accepted!==true||input?.privacy_acknowledged!==true)fail('Review the current terms and privacy notice and explicitly accept.');
  return {uid,version:r.version,bundle_sha256:hash,accepted_at:at,terms_accepted:true,privacy_acknowledged:true,recurring_consent:input.recurring_consent===true,recurring_statement:r.billing.recurring_statement,documents:describe().documents,source:'authenticated_workspace'};
 }
 async function accept(db,uid,input){
  const value=record(uid,input),target=ref(db,uid);
  return db.runTransaction(async tx=>{
   const old=await tx.get(target);
   if(old.exists){const previous=old.data();if(previous.uid!==uid||previous.bundle_sha256!==hash||previous.version!==r.version)fail('Stored acceptance does not match this account and release.');if(value.recurring_consent&&!previous.recurring_consent){
    // Separate immutable billing consent; do not rewrite the original terms acceptance.
    const recurring=target.collection('consents').doc('recurring'),exists=await tx.get(recurring);if(!exists.exists)tx.create(recurring,value);
   }}else tx.create(target,value);
   return {accepted:true,version:r.version,bundle_sha256:hash};
  });
 }
 async function requireAccepted(db,uid,recurring=false){
  requireReady();const target=ref(db,uid),snap=await target.get(),a=snap.data();
  if(!snap.exists||a.uid!==uid||a.bundle_sha256!==hash||a.terms_accepted!==true||a.privacy_acknowledged!==true)fail('Accept the current API terms in Billing before continuing.');
  if(recurring&&!a.recurring_consent){const s=await target.collection('consents').doc('recurring').get();if(!s.exists||s.data().uid!==uid||s.data().bundle_sha256!==hash||s.data().recurring_consent!==true)fail('Explicit monthly recurring-payment consent is required.');}
  return {version:r.version,bundle_sha256:hash,acceptance_id:id};
 }
 return {describe,accept,requireAccepted,record,acceptanceId:id,checkoutOptions:()=>{requireReady();return {consent_collection:{terms_of_service:'required'},billing_address_collection:'required',customer_update:{address:'auto'},automatic_tax:{enabled:true}};},taxBehavior:()=>r.billing.tax_behavior};
}
module.exports={service,contentHash,blockers,digest,...service()};
