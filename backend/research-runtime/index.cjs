'use strict';
const functions=require('firebase-functions/v1');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {Records}=require('./records.cjs');
const {handlers}=require('./service.cjs');
let records,run;
function init(){if(!records){const app=getApps().find(a=>a.name==='[DEFAULT]')||initializeApp();records=new Records(getFirestore(app));}return records;}
process.env.QUANT_FIREBASE_PROJECT_ID=process.env.GCLOUD_PROJECT||'fynx-c7a28';
process.env.QUANT_ALLOWED_ORIGINS='https://www.fynxfinanceworld.com,https://fynxfinanceworld.com';
exports.webTradingResearch=functions.region('us-central1').runWith({memory:'1GB',timeoutSeconds:120,maxInstances:3,minInstances:0}).https.onRequest((req,res)=>{run||=handlers(init());return run(req,res);});
exports.webTradingResearchAccountDeleted=functions.region('us-central1').runWith({memory:'256MB',timeoutSeconds:120,maxInstances:1,failurePolicy:true}).auth.user().onDelete(user=>init().erase(user.uid));
