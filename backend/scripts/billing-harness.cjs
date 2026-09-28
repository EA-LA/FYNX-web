'use strict';
// Isolated adapter for exercising the actual billing module, never real credentials.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function harness(options={}){
 const records=new Map([['fynxDevelopers/qa',{name:'QA',plan:'free',...(options.profile||{})}]]),calls=[];
 const ref=key=>({key,get:async()=>({data:()=>records.get(key)}),set:async(value)=>records.set(key,{...records.get(key),...value}),collection:name=>({doc:(id='auto')=>ref(key+'/'+name+'/'+id)})});
 const db={collection:name=>({doc:id=>ref(name+'/'+id)}),runTransaction:async fn=>fn({get:r=>r.get(),set:(r,v)=>records.set(r.key,{...records.get(r.key),...v}),create:(r,v)=>{if(records.has(r.key))throw Error('duplicate audit');records.set(r.key,v);}})};
 const response={
  'subscriptions.list':{data:options.subscriptions||[]},'invoices.list':{data:options.invoices||[]},
  'customers.create':{id:'cus_qa'},'checkout.sessions.list':{data:options.sessions||[]},
  'checkout.sessions.create':{id:'cs_qa',url:'https://checkout.stripe.com/test'},
  'billingPortal.configurations.create':{id:'bpc_qa'},'billingPortal.sessions.create':{url:'https://billing.stripe.com/test'}
 };
 function Stripe(){const s={};for(const [key,value] of Object.entries(response)){const parts=key.split('.');let target=s;for(const part of parts.slice(0,-1))target=target[part]||= {};target[parts.at(-1)]=async(...args)=>{calls.push({method:key,args});if(options.stripeError)throw Error('Stripe unavailable');return value;};}return s;}
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const stubs={'stripe':Stripe,'firebase-admin':{firestore:()=>db,auth:()=>({getUser:async()=>({email:'qa@example.com',emailVerified:true,disabled:false,...options.user})})},'firebase-functions/v1':{https:{HttpsError},runWith:()=>({https:{onCall:fn=>fn}})},'firebase-functions/logger':{info:()=>{},error:()=>{}}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../developer-billing.cjs'),'utf8'),{module,exports:module.exports,require:name=>{if(!stubs[name])throw Error('Unexpected import '+name);return stubs[name];},process:{env:{FYNX_API_STRIPE_SECRET_KEY:options.live?'sk_live_UNIT_TEST_SENTINEL':'sk_test_UNIT_TEST_SENTINEL',FYNX_API_PAID_ACCESS_ENABLED:options.paidEnabled===false?'false':'true'}},Date});
 return {call:(action,context={auth:{uid:'qa'}})=>module.exports.developerBilling({action},context),refresh:()=>module.exports.refresh('qa'),calls,records};
}
module.exports={harness};
