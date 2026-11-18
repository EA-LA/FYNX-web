// Real user-token authorization checks; admin credentials are used only for cleanup/index inventory.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const auth=require('/Users/h/.npm-global/lib/node_modules/firebase-tools/lib/auth');
const project='fynx-c7a28',bucket=project+'.firebasestorage.app',key='AIzaSyDGSYIB_YIpbWyUMJ1d-v00-xADnvaWckk';
(async()=>{
 const token=await auth.getAccessToken(auth.getGlobalDefaultAccount().tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
 const base=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`,users=[],docs=[],objects=[];
 async function admin(url,method='GET',body){const r=await fetch(url,{method,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert(r.ok||r.status===404,'Admin cleanup/inventory '+r.status);return r;}
 async function signup(){const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'fynx-rules-qa-'+crypto.randomUUID()+'@example.invalid',password:crypto.randomBytes(24).toString('hex'),returnSecureToken:true})});assert(r.ok);const u=await r.json();users.push(u);return u;}
 async function db(u,path,method='GET',fields){return fetch(base+'/'+path,{method,headers:{Authorization:'Bearer '+u.idToken,'Content-Type':'application/json'},body:fields?JSON.stringify({fields}):undefined});}
 const str=v=>({stringValue:v});
 async function upload(u,name,type='image/png'){const r=await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=`+encodeURIComponent(name),{method:'POST',headers:{Authorization:'Firebase '+u.idToken,'Content-Type':type},body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64')});if(r.ok)objects.push(name);return r;}
 try{
 const one=await signup(),two=await signup();
 for(const [path,fields] of [[`users/${one.localId}`,{displayName:str('QA')}],[`users/${one.localId}/account/profile`,{displayName:str('QA')}],[`users/${one.localId}/trades/rules-test`,{symbol:str('QA-EURUSD'),pl:{doubleValue:-50}}]]){
 docs.push(path);assert.equal((await db(one,path,'PATCH',fields)).status,200,'own write '+path);assert.equal((await db(one,path)).status,200,'own read');assert.equal((await db(two,path)).status,403,'cross-user read');assert.equal((await db(two,path,'PATCH',fields)).status,403,'cross-user write');assert.equal((await db(two,path,'DELETE')).status,403,'cross-user delete');assert.equal((await db(one,path,'DELETE')).status,path===`users/${one.localId}`?403:200,'own delete policy');
 }
 console.log('PASS deployed Firestore own profile/trade create/read/delete and cross-user read/write/delete denial');
 const bad=`users/${one.localId}/trades/invalid`;assert.equal((await db(one,bad,'PATCH',{symbol:str('QA'),pl:str('not-a-number')})).status,403);console.log('PASS malformed trade denied server-side');
 const wait='waitlist/qa-'+crypto.randomUUID();docs.push(wait);assert.equal((await db(one,wait,'PATCH',{email:str(one.email)})).status,403);console.log('PASS retired waitlist collection rejects writes; public signup replaces waitlist');
 const name=`users/${one.localId}/profile/qa.png`;assert.equal((await upload(one,name)).status,200,'own profile upload');
 const url=`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/`+encodeURIComponent(name);
 for(const [u,status]of [[one,200],[two,403]])assert.equal((await fetch(url+'?alt=media',{headers:{Authorization:'Firebase '+u.idToken}})).status,status,'profile media read');
 assert.equal((await upload(two,name)).status,403,'cross-user upload');assert.equal((await upload(one,`users/${one.localId}/profile/invalid.txt`,'text/plain')).status,403,'invalid type');assert.equal((await fetch(url,{method:'DELETE',headers:{Authorization:'Firebase '+two.idToken}})).status,403,'cross-user delete');assert.equal((await fetch(url,{method:'DELETE',headers:{Authorization:'Firebase '+one.idToken}})).status,204,'own delete');
 console.log('PASS active bucket '+bucket+': actual upload/read/delete, cross-user denial, invalid content-type denial');
 const indexes=await(await admin(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/-/indexes`)).json();const rows=(indexes.indexes||[]).map(i=>({collection:i.name.split('/collectionGroups/')[1].split('/')[0],state:i.state,fields:i.fields.map(f=>f.fieldPath)}));console.log('INDEX INVENTORY '+JSON.stringify(rows));assert(rows.every(i=>i.state==='READY'),'Index not ready');
 }finally{
 for(const name of new Set(objects))await admin(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/`+encodeURIComponent(name),'DELETE');
 for(const path of docs)await admin(base+'/'+path,'DELETE');
 for(const u of users)await admin(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:delete`,'POST',{localId:u.localId});
 console.log('Removed disposable test accounts and records');
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
