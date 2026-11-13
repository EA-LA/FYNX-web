'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||path.join(root,'.deploy-work','account-sync')),source=path.join(out,'functions');
fs.mkdirSync(source,{recursive:true});
for(const file of ['account-sync.js','account-sync-core.cjs','account-sync-service.cjs','account-sync-membership.cjs','account-sync-delete.cjs','consumer-live-policy.cjs','consumer-core.cjs'])fs.copyFileSync(path.join(root,'backend',file),path.join(source,file));
const dependencies=require('../backend/package.json').dependencies;
fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({name:'fynx-account-sync',private:true,main:'account-sync.js',engines:{node:'22'},dependencies:{'firebase-admin':dependencies['firebase-admin'],'firebase-functions':dependencies['firebase-functions'],stripe:dependencies.stripe}},null,2)+'\n');
fs.writeFileSync(path.join(out,'firebase.json'),JSON.stringify({functions:[{source:'functions',codebase:'fynx-account-sync',runtime:'nodejs22',ignore:['node_modules','.git','*.log']}]},null,2)+'\n');
console.log('Prepared isolated account-sync source: '+out+'. No deployment or Firestore rule replacement performed.');
