'use strict';
const fs=require('node:fs');
const {validate}=require('../broker-catalog.cjs');
try{
 const file=process.argv[2];if(!file)throw Error('Usage: node backend/scripts/validate-broker-catalog.cjs /path/to/catalog.json');
 const result=validate(JSON.parse(fs.readFileSync(file,'utf8')));console.log(JSON.stringify(result,null,2));if(!result.valid)process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
