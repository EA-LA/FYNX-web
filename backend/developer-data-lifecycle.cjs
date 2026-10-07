'use strict';
// Operator-only workspace deletion. Never disables/deletes a shared Auth user or touches Stripe.
const {createHash}=require('node:crypto');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function validateUid(uid){if(typeof uid!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(uid))throw Error('Invalid Firebase UID.');}
const ledgerId=uid=>{validateUid(uid);return createHash('sha256').update('fynx-api-deletion-v1:'+uid).digest('hex');};
async function inventory(db,uid,{maxDocuments=10000}={}){
 validateUid(uid);if(!Number.isSafeInteger(maxDocuments)||maxDocuments<1)throw Error('Invalid document bound.');
 const base='fynxDevelopers/'+uid,documents=[];let visited=0;
 async function walk(ref){
  if(++visited>maxDocuments)throw Error('Workspace exceeds bounded deletion limit.');
  if(ref.path!==base&&!ref.path.startsWith(base+'/'))throw Error('Workspace scope escape.');
  const snap=await ref.get();if(snap.exists)documents.push({path:ref.path,sha256:digest(snap.data())});
  for(const collection of await ref.listCollections())for(const child of await collection.listDocuments())await walk(child);
 }
 await walk(db.doc(base));
 const keyDocs=await db.collection('fynxDeveloperKeys').where('uid','==',uid).limit(maxDocuments+1).get();
 if(keyDocs.docs.length+visited>maxDocuments)throw Error('Workspace and keys exceed bounded deletion limit.');
 for(const key of keyDocs.docs){if(key.data().uid!==uid||!/^fynxDeveloperKeys\/[^/]+$/.test(key.ref.path))throw Error('Key scope mismatch.');documents.push({path:key.ref.path,sha256:digest(key.data())});}
 documents.sort((a,b)=>a.path.localeCompare(b.path));
 return {schema_version:1,uid,scope:'API workspace and owned API keys only',documents,sha256:digest(documents)};
}
function validateApproval(approval,plan,now){
 if(!approval||approval.uid!==plan.uid||approval.inventory_sha256!==plan.sha256)throw Error('Approval does not match the current inventory.');
 for(const field of ['request_reference','reviewer','retention_decision','billing_review_reference'])if(typeof approval[field]!=='string'||approval[field].trim().length<3)throw Error('Missing reviewed '+field+'.');
 if(approval.identity_verified!==true||approval.legal_holds_resolved!==true||approval.shared_identity_disable_approved!==true)throw Error('Identity, legal holds and shared-account impact must be reviewed.');
 const paused=Date.parse(approval.writes_quiesced_at),approved=Date.parse(approval.approved_at);
 if(!Number.isFinite(paused)||paused>now-90000||!Number.isFinite(approved)||approved>now||approved<now-86400000)throw Error('Require 90 seconds of write quiescence and approval from the last 24 hours.');
}
async function deleteWorkspace({db,auth,uid,approval,now=Date.now(),maxDocuments}){
 validateUid(uid);
 if(!(await auth.getUser(uid)).disabled)throw Error('Shared Auth identity must already be disabled under a separately reviewed request.');
 const plan=await inventory(db,uid,{maxDocuments});validateApproval(approval,plan,now);
 const ledger=db.collection('fynxApiDeletionLedger').doc(ledgerId(uid));
 await ledger.set({schema_version:1,state:'pending',inventory_sha256:plan.sha256,request_reference:approval.request_reference,reviewer:approval.reviewer,retention_decision:approval.retention_decision,started_at:now},{merge:true});
 const ordered=plan.documents.slice().sort((a,b)=>b.path.split('/').length-a.path.split('/').length||a.path.localeCompare(b.path));
 for(let start=0;start<ordered.length;start+=200){
  if(!(await auth.getUser(uid)).disabled)throw Error('Identity was re-enabled; deletion stopped.');
  await db.runTransaction(async tx=>{
   const chunk=ordered.slice(start,start+200),snaps=await Promise.all(chunk.map(item=>tx.get(db.doc(item.path))));
   for(let i=0;i<chunk.length;i++){if(!snaps[i].exists||digest(snaps[i].data())!==chunk[i].sha256)throw Error('Data changed after approval; stop and obtain a fresh inventory approval.');}
   chunk.forEach(item=>tx.delete(db.doc(item.path)));
  });
 }
 const remaining=await inventory(db,uid,{maxDocuments});if(remaining.documents.length)throw Error('Workspace was recreated or incomplete; deletion remains pending.');
 await ledger.set({state:'complete',completed_at:Date.now(),deleted_documents:ordered.length},{merge:true});
 return {state:'complete',deleted_documents:ordered.length,ledger_id:ledger.id||ledgerId(uid),shared_auth_deleted:false,stripe_changed:false,backup_copies_removed:false};
}
async function suppressRestoredWorkspace({restoredDb,sourceDb,auth,uid,targetDatabase,maxDocuments}){
 validateUid(uid);
 if(!targetDatabase||targetDatabase==='(default)'||!/^[-a-z0-9]+$/.test(targetDatabase))throw Error('Recovery suppression requires an explicit isolated database.');
 if(!(await auth.getUser(uid)).disabled)throw Error('Identity must remain disabled before restoring suppressed data.');
 const marker=await sourceDb.collection('fynxApiDeletionLedger').doc(ledgerId(uid)).get();
 if(!marker.exists||!['pending','complete'].includes(marker.data().state))throw Error('No authoritative deletion ledger entry; refusing suppression.');
 const plan=await inventory(restoredDb,uid,{maxDocuments});
 // Isolated restore only, before traffic is connected; never accept a ledger restored from backup as authority.
 for(let start=0;start<plan.documents.length;start+=200){const batch=restoredDb.batch();plan.documents.slice(start,start+200).forEach(d=>batch.delete(restoredDb.doc(d.path)));await batch.commit();}
 if((await inventory(restoredDb,uid,{maxDocuments})).documents.length)throw Error('Restored records remain; do not enable traffic.');
 return {state:'suppressed',documents:plan.documents.length,target_database:targetDatabase};
}
module.exports={inventory,validateApproval,deleteWorkspace,suppressRestoredWorkspace,ledgerId};
