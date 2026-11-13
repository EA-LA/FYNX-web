'use strict';
const {createHash}=require('node:crypto');
const DOMAINS=Object.freeze(['profile','preferences','journalTrades','journalArchive','readingRecords','newsInterests','newsWatchlists','portfolios','researchNotes','researchChats','notificationState','notificationPreferences','progress','challenges','calculatorPresets','checklists','toolWorkspaces']);
const LIMITS=Object.freeze({mutations:50,itemBytes:131072,requestBytes:524288,recordsPerDomain:2000,responseBytes:8388608,domains:DOMAINS.length});
class SyncError extends Error{constructor(code,message,details){super(message);this.code=code;this.details=details;}}
const fail=(code,message,details)=>{throw new SyncError(code,message,details);};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
function json(value,depth=0){
 if(depth>20)fail('invalid-argument','Saved data is too deeply nested.');
 if(value===null||typeof value==='boolean'||typeof value==='string')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value))return value.map(v=>json(v,depth+1));
 if(!plain(value))fail('invalid-argument','Saved data must contain JSON values.');
 const result={};for(const [key,v] of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key)||key.length>120)fail('invalid-argument','Invalid saved field.');Object.defineProperty(result,key,{value:json(v,depth+1),enumerable:true,writable:true,configurable:true});}return result;
}
function wire(value,depth=0){if(depth>24)fail('failed-precondition','An existing record is too deeply nested to synchronize. Its source data was preserved.');if(value&&typeof value.toMillis==='function')return value.toMillis();if(value instanceof Date)return value.getTime();if(Array.isArray(value))return value.map(v=>wire(v,depth+1));if(value&&typeof value==='object'){if(!plain(value))fail('failed-precondition','An existing record contains an unsupported data type. Its source data was preserved.');return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,wire(v,depth+1)]));}return value;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
const hash=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function merge(previous,patch){const result={...(previous||{})};for(const [key,value] of Object.entries(patch))result[key]=plain(value)?merge(plain(result[key])?result[key]:{},value):value;return result;}
function identity(domain,id){if(!DOMAINS.includes(domain)||typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/.test(id))fail('invalid-argument','Invalid saved record identity.');if(['profile','preferences','notificationPreferences'].includes(domain)&&id!=='default')fail('invalid-argument','This preference record uses the default identity.');}
function validateData(domain,value){
 const data=json(value);if(!plain(data)||Buffer.byteLength(JSON.stringify(data))>LIMITS.itemBytes)fail('invalid-argument','A saved record must be an object no larger than 128 KiB.');
 if(domain==='profile'){
  const allowed=['displayName','username','photoURL','bio','country','timezone','experienceLevel','preferredMarkets','riskProfile','nativeData'];
  if(Object.keys(data).some(k=>!allowed.includes(k)))fail('invalid-argument','Only editable profile fields can be changed.');
  for(const key of ['displayName','username','photoURL','bio','country','timezone','experienceLevel','riskProfile'])if(data[key]!==undefined&&(typeof data[key]!=='string'||data[key].length>(key==='bio'?4000:key==='photoURL'?4000:200)))fail('invalid-argument','Invalid profile field.');
  if(data.photoURL&&!/^https:\/\//.test(data.photoURL))fail('invalid-argument','Profile photos require a secure URL.');
 }
 if(domain==='journalTrades'&&((data.symbol!==undefined&&(typeof data.symbol!=='string'||data.symbol.length>80))||(data.pl!==undefined&&(typeof data.pl!=='number'||!Number.isFinite(data.pl)))||(data.dateTs!==undefined&&!Number.isFinite(typeof data.dateTs==='number'?data.dateTs:Date.parse(data.dateTs)))))fail('invalid-argument','Journal symbol, result or date is invalid.');
 if(domain==='toolWorkspaces'&&(Object.keys(data).length!==1||typeof data.name!=='string'||!data.name.trim()||data.name.length>100))fail('invalid-argument','Saved tool results can only be renamed here. Run the verified tool to change its calculation.');
 return data;
}
function request(input,uid){
 if(!plain(input)||Buffer.byteLength(JSON.stringify(input))>LIMITS.requestBytes)fail('invalid-argument','Sync request exceeds 512 KiB.');
 if(input.expectedUid!==uid)fail('failed-precondition','Your account changed. Sign in again before synchronizing.',{reason:'account-changed'});
 if(!['read','mutate','membership'].includes(input.action))fail('invalid-argument','Unknown synchronization action.');
 if(input.action==='membership')return {action:'membership'};
 if(input.action==='read'){const domains=input.domains===undefined?[...DOMAINS]:input.domains;if(!Array.isArray(domains)||!domains.length||domains.length>LIMITS.domains||domains.some(d=>!DOMAINS.includes(d))||new Set(domains).size!==domains.length)fail('invalid-argument','Choose valid synchronization domains.');return {action:'read',domains};}
 if(!Array.isArray(input.mutations)||!input.mutations.length||input.mutations.length>LIMITS.mutations)fail('invalid-argument','Send between 1 and 50 changes.');
 const ids=new Set(),items=new Set();const mutations=input.mutations.map(op=>{if(!plain(op))fail('invalid-argument','Invalid change.');identity(op.domain,op.id);if(!Number.isSafeInteger(op.expectedRevision)||op.expectedRevision<0)fail('invalid-argument','Refresh this record before editing.');if(typeof op.mutationId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(op.mutationId))fail('invalid-argument','A unique change ID is required.');if(ids.has(op.mutationId)||items.has(op.domain+'/'+op.id))fail('invalid-argument','Send each record and change ID once per batch.');ids.add(op.mutationId);items.add(op.domain+'/'+op.id);if(op.deleted!==undefined&&op.deleted!==true)fail('invalid-argument','Invalid deletion flag.');if(op.deleted===true&&op.data!==undefined)fail('invalid-argument','Deletion cannot include saved data.');return {domain:op.domain,id:op.id,expectedRevision:op.expectedRevision,mutationId:op.mutationId,...(op.deleted?{deleted:true}:{data:validateData(op.domain,op.data)})};});return {action:'mutate',mutations};
}
// Revision is an opaque safe integer equality token, never a timestamp/order.
// Canonical documents may be edited by an older client outside this service.
function record(domain,id,metadata,canonical,now){
 const exists=canonical!==undefined,data=exists?wire(canonical):null,fingerprint=hash(data);
 let revision=metadata?.revision||0;
 if(metadata&&metadata.fingerprint!==fingerprint)revision=parseInt(hash([revision,fingerprint]).slice(0,13),16)||1;
 else if(!metadata&&exists)revision=parseInt(hash([domain,id,fingerprint]).slice(0,13),16)||1;
 return {domain,id,revision,updatedAt:metadata?.fingerprint===fingerprint?metadata.updatedAt:now,deleted:!exists,data};
}
function nextRevision(current){return current>=Number.MAX_SAFE_INTEGER?1:current+1;}
module.exports={DOMAINS,LIMITS,SyncError,fail,plain,wire,hash,merge,identity,validateData,request,record,nextRevision};
