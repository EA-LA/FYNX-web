'use strict';
const c=require('./account-sync-core.cjs');
function paths(db,uid,domain,id){
 const root=db.collection('fynxAccountSyncUsers').doc(uid),items=root.collection('domains').doc(domain).collection('items'),meta=items.doc(id);
 let canonical=null,sourceCollection=null;if(['profile','preferences','notificationPreferences'].includes(domain))canonical=db.collection('users').doc(uid).collection('account').doc(domain);else if(domain==='journalTrades')sourceCollection=db.collection('users').doc(uid).collection('trades');else if(domain==='toolWorkspaces')sourceCollection=db.collection('fynxConsumerLive').doc(uid).collection('saved');if(sourceCollection)canonical=sourceCollection.doc(id);
 return {root,items,meta,canonical,sourceCollection,deleted:db.collection('fynxAccountSyncDeleted').doc(c.hash(uid))};
}
function current(domain,id,meta,source,now){return c.record(domain,id,meta,source?source.exists?source.data():undefined:meta&&!meta.deleted?meta.data:undefined,now);}
function metadata(record){return {...record,fingerprint:c.hash(record.data)};}
function restoreTimestamps(value,previous,toTimestamp){
 if(previous&&typeof previous.toMillis==='function'&&typeof value==='number'&&Number.isFinite(value))return toTimestamp(value);
 if(Array.isArray(value))return value.map((item,i)=>restoreTimestamps(item,Array.isArray(previous)?previous[i]:undefined,toTimestamp));
 if(c.plain(value))return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,restoreTimestamps(item,previous?.[key],toTimestamp)]));
 return value;
}
function consumeReadBudget(budget,value){budget.remaining-=Buffer.byteLength(JSON.stringify(c.wire(value)));if(budget.remaining<0)c.fail('resource-exhausted','The complete snapshot is too large. Request fewer domains; no partial snapshot was returned.');}
async function boundedCollection(collection,budget){
 const docs=[];let cursor=null;
 for(;;){let query=collection.orderBy('__name__').limit(32);if(cursor)query=query.startAfter(cursor);const page=await query.get();for(const doc of page.docs){if(docs.length>=c.LIMITS.recordsPerDomain)c.fail('resource-exhausted','This saved collection exceeds the complete-sync limit. No partial snapshot was returned.',{limit:c.LIMITS.recordsPerDomain});consumeReadBudget(budget,doc.data());docs.push(doc);}if(page.docs.length<32)break;cursor=page.docs.at(-1);}
 return {docs,size:docs.length};
}
function createService({db,now=Date.now,toTimestamp=v=>v,membership=async()=>({status:'unavailable',capabilities:{accountSync:true}})}){
 async function alive(uid,tx){const ref=paths(db,uid,'profile','default').deleted;if((await(tx?tx.get(ref):ref.get())).exists)c.fail('unauthenticated','This account was deleted.');}
 async function rate(uid,changes=0){const root=paths(db,uid,'profile','default').root;await db.runTransaction(async tx=>{await alive(uid,tx);const old=(await tx.get(root)).data()||{},minute=Math.floor(now()/60000),day=Math.floor(now()/86400000),count=old.minute===minute?(old.requests||0)+1:1,mutations=(old.day===day?old.mutations||0:0)+changes;if(count>120||mutations>10000)c.fail('resource-exhausted','Your synchronization rate limit has been reached. Keep your local changes and retry later.');tx.set(root,{minute,requests:count,day,mutations,updatedAt:now()},{merge:true});});}
 async function readDomain(uid,domain,budget={remaining:c.LIMITS.responseBytes}){
  const p=paths(db,uid,domain,'default'),metaSnap=await boundedCollection(p.items,budget);let sourceSnap=null;
  if(p.sourceCollection)sourceSnap=await boundedCollection(p.sourceCollection,budget);else if(p.canonical){sourceSnap=await p.canonical.get();if(sourceSnap.exists)consumeReadBudget(budget,sourceSnap.data());}
  const metas=new Map(metaSnap.docs.map(s=>[s.id,s.data()])),sources=new Map();
  if(sourceSnap?.docs)for(const s of sourceSnap.docs)sources.set(s.id,s);else if(sourceSnap?.exists)sources.set('default',sourceSnap);
  const ids=[...new Set([...metas.keys(),...sources.keys()])];if(ids.length>c.LIMITS.recordsPerDomain)c.fail('resource-exhausted','This saved collection exceeds the complete-sync limit. Export or contact support; no partial snapshot was returned.',{domain,limit:c.LIMITS.recordsPerDomain});
  // Remember canonical records on first observation. That lets a later legacy
  // direct delete return a tombstone, rather than disappearing from snapshots.
  const missing=[...sources.keys()].filter(id=>!metas.has(id));
  for(let at=0;at<missing.length;at+=16){const chunk=missing.slice(at,at+16);const observed=await db.runTransaction(async tx=>{
   await alive(uid,tx);const rows=await Promise.all(chunk.map(async id=>{const refs=paths(db,uid,domain,id),[m,s]=await Promise.all([tx.get(refs.meta),tx.get(refs.canonical)]);return {id,refs,m,s};}));
   const out=[];for(const row of rows){const value=row.m.data();if(!row.m.exists&&row.s.exists){const rec=current(domain,row.id,null,row.s,now()),meta=metadata(rec);delete meta.data;tx.set(row.refs.meta,meta);out.push([row.id,meta,row.s]);}else out.push([row.id,value,row.s]);}return out;
  });for(const [id,meta,source] of observed){if(meta)metas.set(id,meta);sources.set(id,source);}}
  return ids.map(id=>current(domain,id,metas.get(id),p.canonical?sources.get(id)||{exists:false}:null,now())).filter(r=>r.revision!==0);
 }
 async function mutate(uid,operations){return db.runTransaction(async tx=>{
  await alive(uid,tx);
  const domains=[...new Set(operations.map(o=>o.domain))],known=new Map(await Promise.all(domains.map(async domain=>{const p=paths(db,uid,domain,'default'),[metas,legacy]=await Promise.all([tx.get(p.items.select().limit(c.LIMITS.recordsPerDomain+1)),p.sourceCollection?tx.get(p.sourceCollection.select().limit(c.LIMITS.recordsPerDomain+1)):Promise.resolve(null)]);return [domain,new Set([...metas.docs.map(s=>s.id),...(legacy?.docs||[]).map(s=>s.id)])];}))),counts=new Map([...known].map(([domain,ids])=>[domain,ids.size]));
  const paidRoot=db.collection('fynxConsumerLive').doc(uid),paid=operations.some(op=>op.domain==='toolWorkspaces'&&op.deleted)?(await tx.get(paidRoot)).data():null;
  const legacyProfile=db.collection('users').doc(uid),legacyProfileSnapshot=operations.some(op=>op.domain==='profile')?await tx.get(legacyProfile):null;
  const rows=await Promise.all(operations.map(async op=>{const p=paths(db,uid,op.domain,op.id),receipt=p.root.collection('mutations').doc(op.mutationId);const [m,s,r]=await Promise.all([tx.get(p.meta),p.canonical?tx.get(p.canonical):Promise.resolve(null),tx.get(receipt)]);return {op,p,receipt,m,s,r,current:current(op.domain,op.id,m.data(),s,now()),requestHash:c.hash(op)};}));
  const conflicts=[];for(const row of rows){if(row.r.exists){if(row.r.data().requestHash!==row.requestHash)c.fail('already-exists','This change ID was already used for different data.');continue;}if(row.op.expectedRevision!==row.current.revision)conflicts.push({domain:row.op.domain,id:row.op.id,current:row.current});}
  if(conflicts.length)c.fail('aborted','Some records changed on another device. Review the latest version before retrying.',{conflicts});
  const prepared=[];for(const row of rows){if(row.r.exists){prepared.push({...row,replay:true,result:row.current});continue;}
   if(row.op.domain==='toolWorkspaces'&&((!row.s?.exists&&!row.m.exists)||(!row.op.deleted&&row.current.deleted)))c.fail('not-found','This saved result no longer exists. New results must be created by the verified tool.');
   if(!known.get(row.op.domain).has(row.op.id)){const count=(counts.get(row.op.domain)||0)+1;counts.set(row.op.domain,count);if(count>c.LIMITS.recordsPerDomain)c.fail('resource-exhausted','This saved collection has reached its record limit.',{domain:row.op.domain,limit:c.LIMITS.recordsPerDomain});}
   let data=row.op.deleted?null:c.merge(row.current.deleted?{}:row.current.data,row.op.data);
   if(data&&Buffer.byteLength(JSON.stringify(data))>c.LIMITS.itemBytes)c.fail('resource-exhausted','The combined record exceeds 128 KiB. Keep the local draft and shorten it before retrying.');
   if(row.op.domain==='journalTrades'&&data){if(typeof data.symbol!=='string'||typeof data.pl!=='number')c.fail('invalid-argument','Journal entries require symbol and numeric pl.');if(data.dateTs!==undefined)data.dateTs=typeof data.dateTs==='number'?data.dateTs:Date.parse(data.dateTs);}
   const result={domain:row.op.domain,id:row.op.id,revision:c.nextRevision(row.current.revision),updatedAt:now(),deleted:!!row.op.deleted,data};prepared.push({...row,result});
  }
  // Every read/check happens before the first write. A conflict rolls back the
  // entire batch, including idempotency receipts and quota changes.
  for(const row of prepared){if(row.replay)continue;const meta=metadata(row.result);if(row.p.canonical){delete meta.data;if(row.result.deleted)tx.delete(row.p.canonical);else{const data=restoreTimestamps({...row.result.data},row.s?.data(),toTimestamp);if(row.op.domain==='journalTrades'&&typeof data.dateTs==='number')data.dateTs=toTimestamp(data.dateTs);tx.set(row.p.canonical,data);}}tx.set(row.p.meta,meta);tx.set(row.receipt,{requestHash:row.requestHash,domain:row.op.domain,id:row.op.id,revision:row.result.revision,createdAt:now()});}
  const profile=prepared.find(row=>row.op.domain==='profile'&&!row.replay);
  if(profile){
   // Legacy native identity cards read these display fields from the root.
   // Keep private fields, sharing choices, ranks and entitlements untouched.
   const legacy={...(legacyProfileSnapshot?.data()||{})};
   for(const key of ['username','displayName','photoURL']){
    if(profile.result.deleted)delete legacy[key];
    else if(Object.hasOwn(profile.result.data,key))legacy[key]=profile.result.data[key];
   }
   if(legacyProfileSnapshot?.exists||Object.keys(legacy).length)tx.set(legacyProfile,legacy);
  }
  const deletedWorkspaces=prepared.filter(row=>!row.replay&&row.op.domain==='toolWorkspaces'&&row.result.deleted&&row.s?.exists).length;if(deletedWorkspaces)tx.set(paidRoot,{savedCount:Math.max(0,(Number.isSafeInteger(paid?.savedCount)?paid.savedCount:0)-deletedWorkspaces)},{merge:true});
  return {schemaVersion:1,records:prepared.map(r=>r.result),applied:operations.map(o=>o.mutationId),serverTime:now()};
 });}
 async function handle(input,context){const uid=context?.auth?.uid;if(typeof uid!=='string'||!uid||uid.includes('/')||context.auth.token?.firebase?.sign_in_provider==='anonymous')c.fail('unauthenticated','Sign in to synchronize your account.');const req=c.request(input,uid);await rate(uid,req.mutations?.length||0);if(req.action==='membership')return {schemaVersion:1,membership:await membership(uid),serverTime:now()};if(req.action==='mutate')return mutate(uid,req.mutations);const records=[],budget={remaining:c.LIMITS.responseBytes};for(const domain of req.domains)records.push(...await readDomain(uid,domain,budget));if(Buffer.byteLength(JSON.stringify(records))>c.LIMITS.responseBytes)c.fail('resource-exhausted','The complete snapshot is too large. Request fewer domains; no partial snapshot was returned.');return {schemaVersion:1,records,serverTime:now()};}
 return {handle,readDomain,mutate};
}
module.exports={paths,current,metadata,restoreTimestamps,boundedCollection,createService};
