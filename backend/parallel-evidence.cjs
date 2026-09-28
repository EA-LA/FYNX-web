'use strict';
// Offline qualification of retained live-run evidence; never authorizes launch.
const {canonical}=require('./developer-core.cjs');
const {createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(canonical(x)).digest('hex');
const stamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,19)===x.slice(0,19);
function assess(input,now=Date.now()){
 const blockers=[],runs=input?.runs,accounts=new Set(),events=new Set();
 if(!Array.isArray(runs)||runs.length<2)return {qualifies_for_review:false,authorizes_launch:false,elapsed_days:0,complete_accounts:0,accepted_events:0,blockers:['At least two retained live-run checkpoints are required; real collection has not been established.']};
 const ordered=[...runs].sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at)),ids=new Set();let previous=null;
 for(const r of ordered){
  if(!r.id||ids.has(r.id))blockers.push('Missing or duplicate run identity');ids.add(r.id);
  if(!stamp(r.captured_at)||Date.parse(r.captured_at)>now){blockers.push('Invalid or future server capture time');continue;}
  const at=Date.parse(r.captured_at);if(previous!==null&&(at<=previous||at-previous>86400000))blockers.push('Live checkpoints must increase with no gap longer than 24 hours');previous=at;
  if(r.mode!=='live_parallel'||r.synthetic!==false||r.truncated!==false||r.coverage_reviewed!==true||!r.source_reference||!r.review_reference||!/^[a-f0-9]{64}$/.test(r.source_sha256||''))blockers.push('Live source, completeness and reviewer evidence required');
  if(!Array.isArray(r.unexplained_differences)||r.unexplained_differences.length)blockers.push('Unexplained differences remain or were not reported');
  if(!Array.isArray(r.accounts)){blockers.push('Account results missing');continue;}
  const runAccounts=new Set();
  for(const a of r.accounts){
   if(!a.account_reference||runAccounts.has(a.account_reference)){blockers.push('Missing or duplicate account in a run');continue;}runAccounts.add(a.account_reference);
   if(a.complete!==true||a.reconciled!==true||!Array.isArray(a.accepted_events)){blockers.push('Incomplete or unreconciled account');continue;}
   if(a.accepted_events.length)accounts.add(a.account_reference);
   const local=new Set();for(const e of a.accepted_events){
    if(!e.source_event_id||local.has(e.source_event_id)||!stamp(e.observed_at)||Date.parse(e.observed_at)>at||Date.parse(e.observed_at)<Date.parse(ordered[0].captured_at)){blockers.push('Missing/duplicate event identity or event not observed during live window');continue;}local.add(e.source_event_id);
    events.add(JSON.stringify([a.account_reference,e.source_event_id]));
   }
  }
 }
 const elapsed=(Date.parse(ordered.at(-1).captured_at)-Date.parse(ordered[0].captured_at))/86400000;
 if(!Number.isFinite(elapsed)||elapsed<7)blockers.push('Fewer than seven actual elapsed days');
 if(accounts.size<5)blockers.push('Fewer than five complete accounts');
 if(events.size<100)blockers.push('Fewer than 100 distinct accepted events');
 return {schema_version:1,input_sha256:hash(input),qualifies_for_review:blockers.length===0,authorizes_launch:false,elapsed_days:Number.isFinite(elapsed)?elapsed:0,complete_accounts:accounts.size,accepted_events:events.size,blockers:[...new Set(blockers)],limitations:['Server capture times and source/reviewer references require verification against retained live-run records.','Historical trade timestamps and repeated cumulative events do not add collection time or event count.','Passing this checker requires final human evidence review; it does not enable progression or paid access.']};
}
module.exports={assess};
