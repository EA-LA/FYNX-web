'use strict';
// One versioned Funded policy evaluated by the API's canonical event engine.
// This is opt-in: never infer the purchased contract from today's public page.
const engine=require('./developer-engine.cjs');
const VERSION='fynx-funded-v1';
const PROGRAMS=Object.freeze({'1-phase':{targets:[10],daily:4,max:8,days:3},'2-phase':{targets:[8,5],daily:5,max:10,days:5},'3-phase':{targets:[6,5,4],daily:5,max:12,days:5}});
const canonical=x=>JSON.stringify(x===null||typeof x!=='object'?x:Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])));
function fail(message){throw new engine.InputError(message,'policy_review_required');}
function timestamp(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===value.slice(0,10);}
function ruleSnapshot({program,phase,starting_balance,currency}){
 const p=PROGRAMS[program];
 if(!p||!Number.isInteger(phase)||phase<1||phase>p.targets.length||currency!=='USD')fail('Verified USD program and phase are required.');
 if(!['5000','10000','25000','50000','100000','200000'].includes(starting_balance))fail('Unsupported Funded starting balance.');
 return engine.rules({name:VERSION+':'+program+':'+phase,starting_balance,daily_loss_percent:String(p.daily),max_loss_percent:String(p.max),profit_target_percent:String(p.targets[phase-1]),max_loss_type:'static',consistency_percent:'40',min_trading_days:p.days,reset_hour_utc:22,breach_on_touch:false});
}
function validateBinding(context){
 if(!context||context.policy_version!==VERSION)fail('An explicit supported policy version is required; legacy agreements are not migrated automatically.');
 const rule=ruleSnapshot(context),a=context.agreement;
 if(!a||a.verified!==true||typeof a.reference!=='string'||!a.reference.trim()||!/^([a-f0-9]{64})$/.test(a.document_sha256||'')||!timestamp(a.accepted_at)||!timestamp(a.reviewed_at)||typeof a.reviewed_by!=='string'||!a.reviewed_by.trim())fail('Reviewed purchased-agreement evidence is required.');
 if(Date.parse(a.reviewed_at)>Date.now())fail('Agreement review cannot be in the future.');
 if(Date.parse(a.reviewed_at)<Date.parse(a.accepted_at))fail('Agreement review cannot predate acceptance.');
 if(a.policy_version!==VERSION||canonical(a.rule_snapshot)!==canonical(rule))fail('Purchased rule snapshot does not match this policy; preserve the original agreement and review separately.');
 if(!timestamp(context.start_timestamp)||Date.parse(context.start_timestamp)<Date.parse(a.accepted_at))fail('Phase start must be timezone-qualified and not precede acceptance.');
 return rule;
}
function evaluate(context,events){
 const rule=validateBinding(context);
 if(!Array.isArray(events)||!events.length)fail('Complete ordered equity-event history is required.');
 const coverage=context.coverage;
 if(!coverage||coverage.complete!==true||!coverage.source_reference||coverage.from!==context.start_timestamp||coverage.through!==events.at(-1)?.timestamp)fail('Phase-scoped broker completeness evidence must cover the entire submitted interval.');
 const identities=new Set();let state=engine.account(rule,context.start_timestamp);
 for(const e of events){
  if(typeof e.source_event_id!=='string'||!e.source_event_id.trim()||identities.has(e.source_event_id))fail('Each broker event must have a unique source identity.');
  if(!timestamp(e.timestamp))fail('Invalid event calendar date or timezone.');
  identities.add(e.source_event_id);state=engine.event(state,rule,e);
 }
 if(context.recorded_breach){
  if(!Array.isArray(context.recorded_breach.reasons)||!context.recorded_breach.reasons.length||!timestamp(context.recorded_breach.timestamp))fail('Invalid persisted breach evidence.');
  state.breach=context.recorded_breach;state.eligible=false;state.status='breached';
 }
 return {policy_version:VERSION,rule,state,requires_human_review:true,authorizes_phase_transition:false,agreement_reference:context.agreement.reference};
}
module.exports={VERSION,ruleSnapshot,validateBinding,evaluate};
