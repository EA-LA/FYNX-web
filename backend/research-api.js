'use strict';
const functions=require('firebase-functions/v1');
const {createResearchService}=require('./research-data.cjs');
const service=createResearchService();
exports.webResearchData=functions.runWith({timeoutSeconds:60,memory:'512MB',maxInstances:2}).https.onRequest(async(req,res)=>{
  res.set('Access-Control-Allow-Origin','*');res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');
  if(req.method==='OPTIONS'){res.set('Access-Control-Allow-Methods','GET');return res.status(204).end();}
  if(req.method!=='GET')return res.status(405).json({error:'Use GET.'});
  if(Object.values(req.query).some(v=>typeof v!=='string'||v.length>600))return res.status(400).json({error:'Invalid research request.'});
  try {const data=await service.query(req.query);res.set('Cache-Control','public, max-age=30');return res.json(data);}
  catch(error){return res.status(error.status===400?400:503).json({error:error.message||'Research data is unavailable. Please retry.'});}
});
