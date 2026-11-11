'use strict';
const {createHash}=require('node:crypto');
const Reader=require('./news-reader.cjs');
const COLLECTION='fynxVerifiedNewsArticles',DAY=86400000,STORE_TIMEOUT_MS=1800,MAX_LOCAL_RECORDS=4096;
const persisted=new Map();let databaseOverride,lastCleanupAt=0;
function database() {
  if(databaseOverride!==undefined)return databaseOverride;
  // Plain local/unit runs stay local. Firebase runtimes and explicit emulators
  // use the existing project's default Admin app and database, never a new one.
  if(!process.env.K_SERVICE&&!process.env.FUNCTION_TARGET&&!process.env.FUNCTION_NAME&&!process.env.FIREBASE_CONFIG&&!process.env.FIRESTORE_EMULATOR_HOST)return null;
  const admin=require('firebase-admin');if(!admin.apps.length)admin.initializeApp();return admin.firestore();
}
function scopeOf(item) {return {edition:item.edition||'us',category:item.kind==='official-release'?'official':item.category||'all',symbol:item.symbol||''};}
function keyFor(id,scope) {return createHash('sha256').update(JSON.stringify([scope.edition,scope.category,scope.symbol||'',id])).digest('hex');}
function timestamp(value) {return value instanceof Date?value.getTime():typeof value?.toMillis==='function'?value.toMillis():NaN;}
async function deadline(operation,timeoutMs=STORE_TIMEOUT_MS) {let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Verified news storage is temporarily unavailable')),timeoutMs);})]);}finally{clearTimeout(timer);}}
function serialize(row,now=Date.now()) {
  const id=Reader.articleId(row.link),scope=scopeOf(row),brief=row.reader||Reader.createBrief(row,{now}),published=Date.parse(row.pubDate);
  if(!id||!Number.isFinite(published)||published>now+300000)throw new Error('Cannot persist an unverified article');
  const expiresAt=new Date(published+(scope.category==='official'?30:7)*DAY);
  if(expiresAt.getTime()<=now)throw new Error('Cannot persist an expired article');
  // Persist only evidence that was already exposed by the bounded reader.
  // Full RSS bodies, extracted HTML and hidden/subscriber text never enter DB.
  const description=brief.coverageLevel==='headline-only'?'':[brief.summary,...(brief.keyPoints||[]).map(point=>point.text)].filter(Boolean).join(' ').split(/\s+/).slice(0,78).join(' ');
  const item={title:Reader.plain(row.title,1200),link:Reader.safeURL(row.link),pubDate:new Date(published).toISOString(),source:Reader.plain(row.source,160),edition:scope.edition,category:scope.category==='official'?'all':scope.category,kind:scope.category==='official'?'official-release':row.kind||'headline',description,...(scope.symbol?{symbol:scope.symbol}:{}),...(row.image?{image:row.image}:{})};
  const publicBrief={...brief,related:[]};
  const content=JSON.parse(JSON.stringify({schemaVersion:1,articleId:id,scope,item,brief:publicBrief}));
  if(Buffer.byteLength(JSON.stringify(content))>18000)throw new Error('Verified article exceeds storage limit');
  const fingerprint=createHash('sha256').update(JSON.stringify({item,summary:brief.summary,keyPoints:brief.keyPoints,coverage:brief.coverageLevel,image:brief.image})).digest('hex');
  return {...content,verifiedAt:new Date(now),expiresAt,fingerprint};
}
async function cleanup(db,now) {
  if(now-lastCleanupAt<60000)return;lastCleanupAt=now;
  try{
    await deadline((async()=>{const expired=await db.collection(COLLECTION).where('expiresAt','<=',new Date(now)).limit(25).get();
    if(!expired.docs.length)return;const batch=db.batch();for(const doc of expired.docs)batch.delete(doc.ref);await batch.commit();})(),350);
  }catch{console.warn('FYNX verified news cleanup deferred',{stage:'cleanup'});/* Expiry checks still fail closed; retry in one minute. */}
}
async function persistRows(rows,now=Date.now()) {
  const db=database();if(!db||!rows.length)return;
  const records=rows.map(row=>serialize(row,now));
  const changed=records.filter(record=>{const old=persisted.get(keyFor(record.articleId,record.scope));return !old||old.fingerprint!==record.fingerprint||old.expiresAt<=now;});
  if(changed.length){
    const batch=db.batch();for(const record of changed)batch.set(db.collection(COLLECTION).doc(keyFor(record.articleId,record.scope)),record);
    try{await deadline(batch.commit());}catch{throw Object.assign(new Error('Verified news storage is temporarily unavailable'),{newsStoreStage:'write'});}
    for(const record of changed){const key=keyFor(record.articleId,record.scope);persisted.delete(key);persisted.set(key,{fingerprint:record.fingerprint,expiresAt:record.expiresAt.getTime()});}
    while(persisted.size>MAX_LOCAL_RECORDS)persisted.delete(persisted.keys().next().value);
  }
  // Cleanup is awaited so serverless freezing cannot silently abandon it. It
  // deletes at most 25 expired records and never changes unexpired news.
  await cleanup(db,now);
}
async function read(id,scope,now=Date.now()) {
  const db=database();if(!db)return null;
  const ref=db.collection(COLLECTION).doc(keyFor(id,scope));let snap;
  try{snap=await deadline(ref.get());}catch{throw Object.assign(new Error('Verified news storage is temporarily unavailable'),{newsStoreStage:'read'});}
  if(!snap.exists)return null;
  const record=snap.data();
  if(timestamp(record.expiresAt)<=now){try{await deadline(ref.delete());}catch{}return null;}
  const item=record.item,verifiedAt=timestamp(record.verifiedAt),expiry=timestamp(record.expiresAt),published=Date.parse(item?.pubDate);
  if(record.schemaVersion!==1||record.articleId!==id||Reader.articleId(item?.link)!==id||!record.scope||record.scope.edition!==scope.edition||record.scope.category!==scope.category||record.scope.symbol!==(scope.symbol||'')||JSON.stringify(scopeOf(item||{}))!==JSON.stringify({edition:scope.edition,category:scope.category,symbol:scope.symbol||''})||!Number.isFinite(verifiedAt)||verifiedAt>now+300000||!Number.isFinite(published)||published>now+300000||!Number.isFinite(expiry)||expiry>published+(scope.category==='official'?30:7)*DAY||record.brief?.id!==id||record.brief?.sourceUrl!==Reader.safeURL(item?.link))return null;
  const brief=record.brief,prepared=Date.parse(brief.preparedAt),updated=Date.parse(brief.updatedAt);
  const expectedTitle=Reader.createBrief({...item,description:''},{now:verifiedAt}).title;
  if(Buffer.byteLength(JSON.stringify({item,brief,scope:record.scope}))>18000||brief.edition!==scope.edition||brief.category!==scope.category||Date.parse(brief.publishedAt)!==published||brief.title!==expectedTitle||brief.source!==(Reader.plain(item.source,160)||'Publisher')||!['source-text','publisher-excerpt','headline-only'].includes(brief.coverageLevel)||!Number.isFinite(prepared)||prepared>now+300000||!Number.isFinite(updated)||updated>now+300000||typeof brief.summary!=='string'||brief.summary.length>2500||brief.method!=='source-backed-extractive')return null;
  if(!Array.isArray(brief.keyPoints)||brief.keyPoints.length>3||!Array.isArray(brief.numbers)||brief.numbers.length>4||!Array.isArray(brief.context)||brief.context.length>2||!Array.isArray(brief.terms)||brief.terms.length>5||!Array.isArray(brief.questions)||brief.questions.length>4||!Array.isArray(brief.sources)||brief.sources.length>1||!Array.isArray(brief.related)||brief.related.length)return null;
  if(brief.coverageLevel==='headline-only'&&(brief.keyPoints.length||brief.numbers.length))return null;
  return {item,brief,seenAt:verifiedAt,expiresAt:expiry};
}
function setDatabaseForTests(value) {databaseOverride=value;persisted.clear();lastCleanupAt=0;}
module.exports={persistRows,read,scopeOf,keyFor,COLLECTION,STORE_TIMEOUT_MS,_test:{serialize,setDatabaseForTests,persisted,timestamp}};
