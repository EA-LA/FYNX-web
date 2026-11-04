'use strict';
const crypto=require('node:crypto');
class AccountsError extends Error{constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
const fail=(code,message,status)=>new AccountsError(code,message,status);
const notFound=()=>fail('NOT_FOUND','This account record was not found.',404);
const parse=value=>{try{return value?JSON.parse(value):null;}catch{throw fail('STORAGE_UNAVAILABLE','Saved account data is temporarily unavailable.',503);}};
const id=()=>crypto.randomUUID();
const iso=(now=Date.now())=>new Date(now).toISOString();
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
function safeError(error){return error instanceof AccountsError?{code:error.code,message:error.message,status:error.status}:{code:'SERVICE_UNAVAILABLE',message:'Account data is temporarily unavailable. Please retry.',status:503};}
module.exports={AccountsError,fail,notFound,parse,id,iso,hash,safeError};
