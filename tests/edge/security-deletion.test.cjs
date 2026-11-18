'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {EdgeStore}=require('../../backend/edge/store.cjs');
const {EdgeService,timezone}=require('../../backend/edge/snapshot.cjs');
const {eraseEdgeCopies}=require('../../backend/accounts/lifecycle.cjs');
const {ownsPrivateKey}=require('../../backend/edge/ownership.cjs');
const AS_OF='2026-11-03T12:00:00.000Z';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('private-key ownership validates the entire principal rather than a custom UID prefix',()=>{
 for(const uid of ['alice','alice:suffix','alice:UTC'])for(const zone of ['UTC','Europe/Prague','+05:30']){
  for(const [table,key]of [['edge_snapshots',`user:${uid}:${zone}:latest`],['edge_snapshots',`user:${uid}:${zone}:market:EURUSD:2026-11-03`],['plan_inputs',`user:${uid}:${zone}:EURUSD`],['plan_inputs',`user:${uid}:${zone}:market:EURUSD:EURUSD`]]){
   assert.equal(ownsPrivateKey(table,key,uid),true);
   for(const other of ['alice','alice:suffix','alice:UTC'].filter(v=>v!==uid))assert.equal(ownsPrivateKey(table,key,other),false,key+' versus '+other);
  }
 }
 for(const key of ['user:alice:Bad/Zone:latest','user:alice:UTC:other:latest','user:alice:UTC:market:EURUSD:UTC:latest'])assert.equal(ownsPrivateKey('edge_snapshots',key,'alice'),false);
 assert.throws(()=>timezone('+05:30'),/IANA/,'new preferences require named timezones; deletion still recognizes legacy offsets');
});
async function fixture(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'edge-delete-')),store=new EdgeStore(dir),other=new EdgeStore(dir),now=()=>Date.parse(AS_OF);
 const market=symbol=>({symbol,asOf:AS_OF,state:{},regimeHistory:[],eventMoves:[],fits:[],tradePlans:{private:{available:true,entry:123,lots:4,basisAt:AS_OF,notes:[]}},events:{next24h:[],restOfWeek:[]}});
 const jobs={submit:()=>({status:'queued',jobId:'test-only'})},quant={store:{userRead:async()=>({items:[],updatedAt:null})},bars:async()=>({bars:[{time:'2026-11-02T00:00:00Z',open:1,high:2,low:1,close:2}],source:'Test-only fixture',status:'stored'}),quotes:async()=>({quotes:[],configured:false,status:'unavailable'})};
 const guard={connected:true,receivedAt:AS_OF,equity:10000,positions:[],instruments:[]};let notifications=0;
 const service=new EdgeService({store,jobs,quant,now,protection:{guardFor:async()=>guard,processSnapshot:async()=>{notifications++;}},compute:async({input})=>({asOf:AS_OF,markets:input.watchlist.map(market)})});
 service.cotHistory=async()=>({records:[],status:'available'});service.fredHistory=async()=>({observations:[],status:'available'});service.calendarHistory=async()=>({events:[],calendarAvailable:false});
 await store.put('user_preferences','a',{uid:'a',timezone:'UTC',watchlist:['EURUSD']});
 const erase=()=>eraseEdgeCopies.call({edgeStore:other,now},'a',null,{all:true});
 return{store,other,service,erase,market,guard,notifications:()=>notifications,close:()=>fs.rm(dir,{recursive:true,force:true})};
}
test('account deletion invalidates warm overview/detail caches and rejects legacy disk fallback without affecting another owner',async()=>{
 const f=await fixture();try{
  const snapshot=await f.service.refresh({uid:'a'});await f.service.refresh({uid:'a',watchlistOverride:['GBPUSD']});
  assert.equal((await f.service.today({uid:'a'})).httpStatus,200);assert.equal((await f.service.market({uid:'a',id:'GBPUSD'})).httpStatus,200);
  await f.store.put('edge_snapshots','user:b:UTC:latest',{...snapshot,owner:'b'});
  for(const uid of ['a:suffix','a:UTC']){const key='user:'+uid+':UTC';f.service.latest.set(key,{...snapshot,owner:uid});await f.store.put('edge_snapshots',key+':latest',{...snapshot,owner:uid});}
  await f.erase();
  assert.equal((await f.service.today({uid:'a'})).httpStatus,202);assert.equal((await f.service.market({uid:'a',id:'GBPUSD'})).httpStatus,202);
  assert.equal([...f.service.latest.keys()].filter(k=>ownsPrivateKey('edge_snapshots',k+':latest','a')).length,0);
  for(const uid of ['a:suffix','a:UTC']){assert.equal(f.service.latest.get('user:'+uid+':UTC').owner,uid);assert.equal((await f.store.get('edge_snapshots','user:'+uid+':UTC:latest')).owner,uid);}
  assert.equal((await f.store.get('edge_snapshots','user:b:UTC:latest')).owner,'b');
  const legacy={...snapshot};delete legacy.accountDeletionEpoch;await f.store.put('edge_snapshots','user:a:UTC:latest',legacy);await f.store.put('edge_snapshots','user:a:UTC:market:GBPUSD:latest',{...legacy,markets:[f.market('GBPUSD')]});
  assert.equal((await f.service.today({uid:'a'})).httpStatus,202);assert.equal((await f.service.market({uid:'a',id:'GBPUSD'})).httpStatus,202);
 }finally{await f.close();}
});
test('a refresh that captured private guard inputs before deletion cannot restore snapshots, plans or notifications',async()=>{
 const f=await fixture(),entered=deferred(),resume=deferred();try{
  f.service.compute=async({input})=>{assert.equal(input.heartbeat.equity,10000);entered.resolve();await resume.promise;return{asOf:AS_OF,markets:[f.market('EURUSD')]};};
  const work=f.service.refresh({uid:'a'}),rejected=assert.rejects(work,{code:'ACCOUNT_DATA_DELETED'});await entered.promise;await f.erase();resume.resolve();await rejected;
  assert.equal((await f.store.scan('edge_snapshots')).length,0);assert.equal((await f.store.scan('plan_inputs')).length,0);assert.equal(f.notifications(),0);assert.equal(f.service.latest.size,0);
 }finally{resume.resolve();await f.close();}
});
test('deletion and private snapshot writes share one cross-process lock, including the gap between compare and write',async()=>{
 const f=await fixture(),entered=deferred(),resume=deferred();try{
  const put=f.store.put.bind(f.store);let blocked=false;f.store.put=async(table,id,value)=>{if(table==='edge_snapshots'&&!blocked){blocked=true;entered.resolve();await resume.promise;}return put(table,id,value);};
  const refresh=f.service.refresh({uid:'a'});await entered.promise;
  const {hash}=require('../../backend/quant/common.cjs');
  assert.equal((await fs.stat(path.join(f.store.root,'.locks',hash(f.store.key('provider_status','accounts-deletion:a'))))).isDirectory(),true,'the shared epoch lock must still be held while the private write is paused');
  const deletion=f.erase();resume.resolve();await refresh;await deletion;
  assert.equal((await f.store.scan('edge_snapshots')).length,0);assert.equal((await f.store.scan('plan_inputs')).length,0);assert.equal((await f.service.today({uid:'a'})).httpStatus,202);
 }finally{resume.resolve();await f.close();}
});
test('overview and market reads cannot return captured private plans when deletion occurs during their guard lookup',async()=>{
 for(const route of ['today','market']){const f=await fixture(),entered=deferred(),resume=deferred();try{
  await f.service.refresh({uid:'a'});let calls=0;f.service.protection.guardFor=async()=>{calls++;if(calls===(route==='today'?1:2)){entered.resolve();await resume.promise;}return f.guard;};
  const read=route==='today'?f.service.today({uid:'a'}):f.service.market({uid:'a',id:'EURUSD'}),rejected=assert.rejects(read,{code:'ACCOUNT_DATA_DELETED'});await entered.promise;await f.erase();resume.resolve();await rejected;
 }finally{resume.resolve();await f.close();}}
});
