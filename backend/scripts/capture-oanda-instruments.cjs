'use strict';
const fs=require('node:fs');
const {capture}=require('../oanda-instruments.cjs');
(async()=>{
 const output=process.argv[2];if(!output)throw Error('Usage: node backend/scripts/capture-oanda-instruments.cjs /secure/path/new-snapshot.json');
 const result=await capture({token:process.env.FYNX_OANDA_PRACTICE_TOKEN,accountId:process.env.FYNX_OANDA_PRACTICE_ACCOUNT_ID});
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('Practice instrument evidence saved privately. Production catalog approval remains pending.');
})().catch(e=>{console.error(e.message.startsWith('OANDA')||e.message.startsWith('Configure')||e.message.startsWith('Usage:')?e.message:'Instrument capture failed; no production catalog was approved.');process.exitCode=1;});
