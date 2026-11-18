'use strict';
// Admin SDK only. The HTTPS handlers derive the owner from verified Firebase identity.
// Use one record per saved item, so concurrent writes do not replace another strategy.
const {AsyncLocalStorage}=require('node:async_hooks');
const {gzipSync,gunzipSync}=require('node:zlib');
const {hash,fail}=require('../quant/common.cjs');
const {Store}=require('../quant/store.cjs');
const COLLECTION='fynxResearchPrivateV1';
class Records {
 constructor(db){this.db=db;this.collection=db.collection(COLLECTION);this.session=new AsyncLocalStorage();this.transactions=new AsyncLocalStorage();}
 run(fn){return this.session.run({},fn);}
 identify(uid){if(this.session.getStore())this.session.getStore().owner=hash(uid);}
 ref(table,id){return this.collection.doc(hash([table,id]));}
 unpack(doc){return doc?.exists?JSON.parse(gunzipSync(doc.get('value')).toString('utf8')):null;}
 async get(table,id){const ref=this.ref(table,id),ctx=this.transactions.getStore();if(ctx?.writes.has(ref.path))return ctx.writes.get(ref.path).value;return this.unpack(ctx?await ctx.tx.get(ref):await ref.get());}
 async put(table,id,value,uid){const owner=uid?hash(uid):this.session.getStore()?.owner;if(!owner)throw fail('Verified record owner required.',403);const ref=this.ref(table,id),ctx=this.transactions.getStore(),v=value===null?null:{owner,table,value:gzipSync(JSON.stringify(value))};if(v?.value.length>930000)throw fail('Saved research is too large; reduce the history or export it to a file.',413);if(ctx)ctx.writes.set(ref.path,{ref,value,doc:v});else if(v)await ref.set(v);else await ref.delete();return value;}
 async atomic(fn){if(this.transactions.getStore())return fn();return this.db.runTransaction(tx=>this.transactions.run({tx,writes:new Map()},async()=>{const result=await fn();for(const {ref,doc} of this.transactions.getStore().writes.values())if(doc)tx.set(ref,doc);else tx.delete(ref);return result;}));}
 async scan(table,owner=this.session.getStore()?.owner){if(!owner)throw fail('Verified account required.',401);const query=this.collection.where('owner','==',owner).where('table','==',table),ctx=this.transactions.getStore();const docs=ctx?await ctx.tx.get(query):await query.get();const map=new Map(docs.docs.map(d=>[d.ref.path,this.unpack(d)]));if(ctx)for(const [path,w] of ctx.writes)if(!w.doc)map.delete(path);else if(w.doc.table===table&&w.doc.owner===owner)map.set(path,w.value);return [...map.values()];}
 async erase(uid){const query=this.collection.where('owner','==',hash(uid)).limit(300);for(;;){const batch=await query.get();if(batch.empty)return;const writes=this.db.batch();for(const doc of batch.docs)writes.delete(doc.ref);await writes.commit();}}
}
class ResearchEdgeStore {
 constructor(records){this.records=records;}
 get(t,id){return this.records.get(t,id);}
 put(t,id,v){
  // Edge Guard needs the latest verified report only; omit the per-minute
  // archive used by the separate, opt-in account-history service.
  if(t==='ea_heartbeats'&&v&&id===v.id)return v;
  return this.records.put(t,id,v,v?.uid);
 }
 delete(t,id){return this.records.put(t,id,null);}
 scan(t){return this.records.scan(t);}
 async mutate(t,id,change){return this.records.atomic(async()=>{const old=await this.get(t,id),value=await change(old);return this.records.put(t,id,value,value?.uid||old?.uid);});}
}
class ResearchQuantStore extends Store {
 constructor(records){super('/tmp/fynx-research-history-v1');this.records=records;}
 async read(key){return key.startsWith('requests/')?null:super.read(key);}
 async write(key,value){return key.startsWith('requests/')?0:super.write(key,value);}
 async userRead(uid,type){const items=await this.records.scan('quant-'+type,hash(uid));return {items,updatedAt:items.map(x=>x.updatedAt).sort().at(-1)||null};}
 async userSave(uid,type,item){return this.records.atomic(async()=>{const {items}=await this.userRead(uid,type);const rest=items.filter(v=>v.id!==item.id);if(rest.length>=100||Buffer.byteLength(JSON.stringify([...rest,item]))>6500000)throw fail('Account research limit reached. Export or remove older research.',409);return this.records.put('quant-'+type,JSON.stringify([uid,item.id]),item,uid);});}
 async userDelete(uid,type,id){await this.records.put('quant-'+type,JSON.stringify([uid,id]),null,uid);return this.userRead(uid,type);}
}
module.exports={Records,ResearchEdgeStore,ResearchQuantStore,COLLECTION};
