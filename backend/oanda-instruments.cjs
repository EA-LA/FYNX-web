'use strict';
const {createHash}=require('node:crypto');
const sha=s=>createHash('sha256').update(s).digest('hex');
// Read-only practice intake. Raw units stay in broker units; no guessed lot conversion.
async function capture({token,accountId,fetchImpl=fetch,now=()=>new Date().toISOString()}){
 if(typeof token!=='string'||!token.trim()||typeof accountId!=='string'||!/^\d+-\d+-\d+-\d+$/.test(accountId))throw Error('Configure FYNX_OANDA_PRACTICE_TOKEN and FYNX_OANDA_PRACTICE_ACCOUNT_ID securely.');
 const url='https://api-fxpractice.oanda.com/v3/accounts/'+accountId+'/instruments';
 const response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('OANDA practice instrument request failed (HTTP '+response.status+').');
 const raw=await response.text();if(Buffer.byteLength(raw)>5*1024*1024)throw Error('Instrument response exceeds intake limit.');
 let data;try{data=JSON.parse(raw);}catch{throw Error('OANDA returned invalid instrument JSON.');}
 if(!Array.isArray(data.instruments)||!data.instruments.length)throw Error('No account instruments returned.');
 const names=new Set();for(const s of data.instruments){if(typeof s?.name!=='string'||!s.name||names.has(s.name))throw Error('Invalid or duplicate instrument identity.');names.add(s.name);}
 return {schema_version:1,provider:'OANDA',environment:'practice',retrieved_at:now(),account_reference_sha256:sha(accountId),endpoint:'/v3/accounts/{accountID}/instruments',source_sha256:sha(raw),raw_response:raw,production_verified:false,missing_review:['Account pricing, contract-unit/lot conversion and execution restrictions','Applicable session/holiday/DST schedules','Effective interval and approved source evidence','Permission for FYNX commercial/Funded use'],instrument_count:data.instruments.length};
}
module.exports={capture};
