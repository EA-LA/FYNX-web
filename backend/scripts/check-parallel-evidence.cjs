'use strict';
const fs=require('node:fs'),{assess}=require('../parallel-evidence.cjs');
try{if(!process.argv[2])throw Error('Usage: node backend/scripts/check-parallel-evidence.cjs /path/to/live-runs.json');const r=assess(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));console.log(JSON.stringify(r,null,2));if(!r.qualifies_for_review)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}
