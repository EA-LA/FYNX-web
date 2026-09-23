const fs=require('fs');
for(const kind of ['firestore','storage']){
 const cases=[];
 function add(name,uid,method,path,data,allow,resource){cases.push({expectation:allow?'ALLOW':'DENY',request:{auth:uid?{uid,token:{admin:false,email_verified:false,email:'qa@example.invalid'}}:null,method,path,resource:{data,...data}},...(resource?{resource}:{}),pathEncoding:'PLAIN'});}
 if(kind==='firestore'){
  for(const part of ['account/profile','account/preferences','trades/qa','notifications/qa'])for(const uid of ['qa-owner','qa-other',null]){
   const path='/databases/(default)/documents/users/qa-owner/'+part;
   add(part,uid,'get',path,{},uid==='qa-owner');add(part,uid,'create',path,{symbol:'TEST',pl:12.5},uid==='qa-owner');
  }
  add('session','qa-owner','create','/databases/(default)/documents/users/qa-owner/sessions/session',{sessionId:'session',status:'active'},true);
  add('funded-deny','qa-owner','create','/databases/(default)/documents/orders/qa',{status:'paid'},false);
 }else{
  const path='/b/fynx-c7a28.firebasestorage.app/o/users/qa-owner/profile/test.png';
  for(const uid of ['qa-owner','qa-other',null]){add('upload',uid,'create',path,{size:100,contentType:'image/png'},uid==='qa-owner');add('read',uid,'get',path,{},uid==='qa-owner');}
  add('oversize','qa-owner','create',path,{size:6000000,contentType:'image/png'},false);
  add('html','qa-owner','create',path,{size:100,contentType:'text/html'},false);
 }
 fs.writeFileSync('/tmp/fynx-'+kind+'-tests.json',JSON.stringify({source:{files:[{name:kind+'.rules',content:fs.readFileSync('backend/rules/'+kind+'.rules','utf8')}]},testSuite:{testCases:cases}}));
}
