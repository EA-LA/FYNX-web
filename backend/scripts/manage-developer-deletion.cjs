'use strict';
const fs=require('node:fs'),admin=require('firebase-admin'),{getFirestore}=require('firebase-admin/firestore');
const lifecycle=require('../developer-data-lifecycle.cjs');
(async()=>{
 const [action,uid,file,confirmation,targetDatabase]=process.argv.slice(2);
 if(!['preview','apply','suppress-restore'].includes(action)||!uid||!file)throw Error('Usage: preview UID PRIVATE_MANIFEST | apply UID APPROVAL_JSON --apply-reviewed-deletion | suppress-restore UID PRIVATE_REPORT --apply-reviewed-deletion ISOLATED_DATABASE');
 if(!process.env.GOOGLE_CLOUD_PROJECT)throw Error('Explicit GOOGLE_CLOUD_PROJECT required.');
 if(action!=='apply'&&fs.existsSync(file))throw Error('Output exists; refusing overwrite.');
 admin.initializeApp({projectId:process.env.GOOGLE_CLOUD_PROJECT});const db=admin.firestore();
 let result;
 if(action==='preview')result=await lifecycle.inventory(db,uid);
 else{
  if(confirmation!=='--apply-reviewed-deletion')throw Error('Explicit reviewed-deletion flag required.');
  if(action==='apply')result=await lifecycle.deleteWorkspace({db,auth:admin.auth(),uid,approval:JSON.parse(fs.readFileSync(file,'utf8'))});
  else result=await lifecycle.suppressRestoredWorkspace({restoredDb:getFirestore(admin.app(),targetDatabase),sourceDb:db,auth:admin.auth(),uid,targetDatabase});
 }
 if(action!=='apply')fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(action==='preview'?'Private review inventory saved; nothing deleted.':JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
