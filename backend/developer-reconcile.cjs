'use strict';
// Offline broker-import validator. Never writes accounts or authorizes progression.
const {createHash}=require('node:crypto');
const Decimal=require('decimal.js');
const engine=require('./developer-engine.cjs');
const {canonical}=require('./developer-core.cjs');
function reconcile(input){
 if(!input||!Array.isArray(input.accounts)||!input.accounts.length)throw Error('Supply at least one account.');
 const ids=new Set();
 const accounts=input.accounts.map(a=>{
  if(typeof a.id!=='string'||!a.id||ids.has(a.id))throw Error('Account IDs must be present and unique.');ids.add(a.id);
  const differences=[];let accepted=0,state;
  try{
   if(!a.source?.reference||a.source.complete!==true||a.source.kind!=='broker_export')throw Error('Complete broker export provenance is required.');
   if(!a.rules_approval_reference)throw Error('Purchased/approved rule version reference is required.');
   if(typeof a.start_timestamp!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(a.start_timestamp)||!Number.isFinite(Date.parse(a.start_timestamp)))throw Error('Timezone-qualified account start required.');
   if(!Array.isArray(a.events)||!a.events.length)throw Error('Empty history cannot be reconciled.');
   const rules=engine.rules(a.rules);state=engine.account(rules,a.start_timestamp);const seen=new Set();
   for(const event of a.events){
    if(typeof event.source_event_id!=='string'||!event.source_event_id||seen.has(event.source_event_id))throw Error('Missing or duplicate source event identity.');seen.add(event.source_event_id);
    if(!event.expected)throw Error('Every event needs independent broker balance, equity, trading_days, status and breach evidence.');
    state=engine.event(state,rules,event);accepted++;
    for(const field of ['balance','equity','trading_days','status','breach']){
     const actual=field==='trading_days'?state.metrics.trading_days:state[field];
     const expected=event.expected[field];let match=false;
     if(expected!==undefined){
      if(['balance','equity'].includes(field)){try{match=typeof expected==='string'&&new Decimal(expected).isFinite()&&new Decimal(expected).eq(actual);}catch{}}
      else match=canonical(expected)===canonical(actual);
     }
     if(!match)differences.push({sequence:event.sequence,field,expected:expected===undefined?'MISSING':expected,actual});
    }
   }
   return {id:a.id,status:differences.length?'discrepancy':'matched',accepted_events:accepted,differences,final_state:state};
  }catch(e){return {id:a.id,status:'blocked',accepted_events:accepted,differences,error:e.message};}
 });
 return {schema_version:1,input_sha256:createHash('sha256').update(canonical(input)).digest('hex'),mode:'offline_reconciliation',accounts,matched_accounts:accounts.filter(a=>a.status==='matched').length,accepted_events:accounts.reduce((n,a)=>n+a.accepted_events,0),complete:accounts.every(a=>a.status==='matched'),authorizes_launch:false,limitations:['Source completeness and approved-rule references require human verification.','Historical event timestamps do not establish seven days of parallel operation.','No account, entitlement or phase transition was changed.']};
}
module.exports={reconcile};
