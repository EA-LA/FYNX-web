'use strict';
const {createHash}=require('node:crypto');
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
const payloadHash=value=>createHash('sha256').update(canonical(value)).digest('hex');
function validateInput(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Buffer.byteLength(JSON.stringify(value),'utf8')<=20000;}
function entitlement(profile,env,now=Date.now()){
 const pro=env==='live'&&profile.plan==='pro'&&profile.planCheckedUntil>now;
 return {plan:pro?'pro':'free',monthlyCalls:pro?50000:1000,rps:pro?30:10,overage:false,monthlyPrice:pro?49:0};
}
function effectiveCap(profile,limits){return Math.min(Number.isSafeInteger(profile.requestCap)&&profile.requestCap>0?profile.requestCap:limits.monthlyCalls,limits.monthlyCalls);}
module.exports={canonical,payloadHash,validateInput,entitlement,effectiveCap};
