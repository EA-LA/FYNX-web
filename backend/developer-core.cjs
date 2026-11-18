'use strict';
const {createHash}=require('node:crypto');
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
const payloadHash=value=>createHash('sha256').update(canonical(value)).digest('hex');
function validateInput(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Buffer.byteLength(JSON.stringify(value),'utf8')<=20000;}
const plans=require('./developer-plans.cjs');
// Paid plans apply only in the live environment and only while the billing check is fresh (fail closed to Free).
function entitlement(profile,env,now=Date.now()){
 const paid=env==='live'&&plans.isPlan(profile.plan)&&profile.plan!=='free'&&profile.planCheckedUntil>now;
 return plans.limitsFor(paid?profile.plan:'free');
}
// Monthly request ceiling. Without an explicit customer-saved cap it is the included allowance, so nobody is billed
// for overage they did not opt into. An explicit cap may exceed the allowance only on plans that sell overage.
function effectiveCap(profile,limits){
 const saved=Number.isSafeInteger(profile.requestCap)&&profile.requestCap>0?profile.requestCap:null;
 if(saved===null)return limits.monthlyCalls;
 return Math.min(saved,profile.requestCapExplicit&&limits.overage?plans.capCeiling(limits):limits.monthlyCalls);
}
module.exports={canonical,payloadHash,validateInput,entitlement,effectiveCap};
