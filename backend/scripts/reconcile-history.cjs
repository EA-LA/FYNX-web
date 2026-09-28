'use strict';
const fs=require('node:fs');
const {reconcile}=require('../developer-reconcile.cjs');
try{
 const file=process.argv[2];if(!file)throw Error('Usage: node backend/scripts/reconcile-history.cjs /path/to/broker-history.json');
 const report=reconcile(JSON.parse(fs.readFileSync(file,'utf8')));console.log(JSON.stringify(report,null,2));if(!report.complete)process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
