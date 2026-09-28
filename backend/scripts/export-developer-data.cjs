'use strict';
const fs=require('node:fs'),admin=require('firebase-admin');
const {exportWorkspace}=require('../developer-data-export.cjs');
(async()=>{
 const [uid,output]=process.argv.slice(2);
 if(!uid||!output)throw Error('Usage: node backend/scripts/export-developer-data.cjs FIREBASE_UID /secure/path/export.json');
 if(!process.env.GOOGLE_CLOUD_PROJECT)throw Error('Set GOOGLE_CLOUD_PROJECT to the explicitly authorized project.');
 if(fs.existsSync(output))throw Error('Output already exists; refusing to overwrite.');
 admin.initializeApp({projectId:process.env.GOOGLE_CLOUD_PROJECT});
 const result=await exportWorkspace(admin.firestore(),uid);
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('Export written securely: '+result.documents.length+' workspace documents. No database changes.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
