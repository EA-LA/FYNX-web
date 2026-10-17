'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {waitlistInput,joinWaitlist,publicProfile,sharing}=require('./business-public.cjs')._test;
function database(seed={}) {
 const rows=new Map(Object.entries(seed));let pending=Promise.resolve();
 const ref=path=>({path,collection:name=>ref(path+'/'+name),doc:id=>ref(path+'/'+id)});
 const db={collection:ref,rows,runTransaction:fn=>{const result=pending.then(async()=>{const writes=[];let writing=false;const result=await fn({get:async r=>{assert.equal(writing,false,'reads precede writes');return {exists:rows.has(r.path),data:()=>rows.get(r.path)};},set:(r,data,options)=>{writing=true;writes.push(()=>rows.set(r.path,options?.merge?{...rows.get(r.path),...data}:data));},create:(r,data)=>{writing=true;writes.push(()=>{assert(!rows.has(r.path));rows.set(r.path,data)});}});writes.forEach(f=>f());return result;});pending=result.catch(()=>{});return result;}};return db;
}
const data={name:'Example Trader',email:'test@example.invalid',source:'money-management',consent:true};
const context={auth:{uid:'owner-one',token:{email_verified:true}}};
test('waitlist validates consent and bounded inputs',()=>{
 assert.equal(waitlistInput({...data,email:' TEST@EXAMPLE.INVALID '}).email,data.email);
 for(const extra of [{consent:false},{email:'x'},{name:''},{name:'x'.repeat(81)},{email:'x'.repeat(161)},{name:'A\nB'}])assert.throws(()=>waitlistInput({...data,...extra}));
});
test('anonymous retries do not reveal membership or overwrite original signup',async()=>{
 const db=database(),options={db,now:1800000000000};
 assert.deepEqual(await joinWaitlist(data,'127.0.0.1',options),{accepted:true});
 assert.deepEqual(await joinWaitlist({...data,name:'Replacement'},'127.0.0.1',options),{accepted:true});
 const saved=[...db.rows].filter(([k])=>k.startsWith('waitlist/'));
 assert.equal(saved.length,1);assert.equal(saved[0][1].fullName,data.name);assert(!saved[0][0].includes('@'));
});
test('transaction limits concurrent requests and resets after the hour',async()=>{
 const db=database(),now=1800000000000;
 const results=await Promise.allSettled(Array.from({length:8},()=>joinWaitlist(data,'127.0.0.1',{db,now})));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,5);
 await joinWaitlist(data,'127.0.0.1',{db,now:now+3600001});
});
test('profile is private unless explicitly published; private fields cannot escape',()=>{
 for(const publicEnabled of [undefined,false,'true',1])assert.equal(publicProfile({publicEnabled},'FYNX-1234ABCD'),null);
 assert.deepEqual(publicProfile({publicEnabled:true,uid:'private-uid',username:'Trader',email:'private@example.invalid',winRate:99},'FYNX-1234ABCD'),{id:'FYNX-1234ABCD',username:'Trader',notice:'Shared by this account. No verified performance statistics are published.'});
 assert.equal(publicProfile({publicEnabled:true},'../users'),null);
});
test('sharing requires auth and verified email to publish, but permits unpublishing',async()=>{
 const db=database();await assert.rejects(sharing({action:'status'},{},{db}),/Sign in/);
 await assert.rejects(sharing({action:'set',enabled:true},{auth:{uid:'owner-one',token:{email_verified:false}}},{db}),/Verify/);
 await assert.rejects(sharing({action:'set',enabled:'true'},context,{db}),/Choose/);
 const initial=await sharing({action:'status'},context,{db});assert.equal(initial.enabled,false);assert.equal(db.rows.size,0);
 await sharing({action:'set',enabled:true},context,{db});
 const hidden=await sharing({action:'set',enabled:false},{auth:{uid:'owner-one',token:{email_verified:false}}},{db});assert.equal(hidden.enabled,false);
 assert.equal(publicProfile(db.rows.get('fynxSharedProfiles/'+hidden.id),hidden.id),null);
});
test('only own account fields are used; an existing different owner cannot be replaced',async()=>{
 const db=database({'users/owner-one':{fynxId:'FYNX-1234ABCD',username:'Real Name',email:'private@example.invalid'}});
 const result=await sharing({action:'set',enabled:true,username:'Injected',uid:'other',winRate:100},context,{db});
 assert.deepEqual(result,{id:'FYNX-1234ABCD',enabled:true});
 const published=db.rows.get('fynxSharedProfiles/FYNX-1234ABCD');assert.equal(published.username,'Real Name');assert.equal(published.email,undefined);assert.equal(published.winRate,undefined);
 db.rows.set('users/other',{fynxId:'FYNX-1234ABCD'});
 await assert.rejects(sharing({action:'set',enabled:false},{auth:{uid:'other',token:{email_verified:true}}},{db}),/support review/);
 assert.equal(db.rows.get('fynxSharedProfiles/FYNX-1234ABCD').publicEnabled,true);
});
