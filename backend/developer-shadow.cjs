'use strict';
const functions=require('firebase-functions/v1'),admin=require('firebase-admin'),logger=require('firebase-functions/logger');
const {createHash}=require('node:crypto'),engine=require('./developer-engine.cjs');
const PROGRAMS={'1-phase':{targets:[10],daily:4,max:8,days:3},'2-phase':{targets:[8,5],daily:5,max:10,days:5},'3-phase':{targets:[6,5,4],daily:5,max:12,days:5}};
const stamp=x=>x&&typeof x.toDate==='function'?x.toDate().toISOString():typeof x==='string'?x:null;
function compare(challenge,trades){
 if(!trades.length)return {status:'awaiting_history',events:0,eligibleForMigration:false};
 const p=PROGRAMS[challenge.phase],phase=Number(challenge.currentPhase||1),start=stamp(challenge.startDate);
 if(!p||!Number.isInteger(phase)||!p.targets[phase-1]||challenge.currency!=='USD'||!start||!Number.isFinite(Date.parse(start)))return {status:'blocked_account_metadata',events:trades.length,eligibleForMigration:false};
 // No guesses from net P&L alone: open exposure and reset marks must be supplied.
 const required=['sequence','event_type','timestamp','unrealized_pnl_after','open_position_count','source_event_id'];
 const missing=[...new Set(trades.flatMap(t=>required.filter(k=>t[k]===undefined)))];
 if(missing.length)return {status:'blocked_event_coverage',events:trades.length,missingFields:missing,eligibleForMigration:false};
 const sorted=[...trades].sort((a,b)=>a.sequence-b.sequence),sources=new Set();
 try{
  const rule=engine.rules({name:'FYNX Funded shadow baseline',starting_balance:String(challenge.accountSize),daily_loss_percent:String(p.daily),max_loss_percent:String(p.max),profit_target_percent:String(p.targets[phase-1]),min_trading_days:p.days,max_loss_type:'static',consistency_percent:'40',reset_hour_utc:22,breach_on_touch:false});
  let state=engine.account(rule,start);
  for(const t of sorted){if(sources.has(t.source_event_id))throw new engine.InputError('Duplicate source event','duplicate_source');sources.add(t.source_event_id);state=engine.event(state,rule,t);}
  const normalized={passed:'eligible',failed:'breached',active:'active'}[challenge.ruleStatus];
  const hasCurrentAutomaticEvaluation=challenge.progressionMode==='automatic'&&!!normalized&&challenge.lastRuleEvaluationSource==='broker_trade_trigger'&&challenge.ruleMetrics?.tradeCount===sorted.length&&Date.parse(stamp(challenge.lastRuleEvaluationAt))>=Date.parse(sorted.at(-1).timestamp);
  return {status:hasCurrentAutomaticEvaluation?(normalized===state.status?'candidate_match':'discrepancy'):'awaiting_current_evaluation',events:trades.length,apiStatus:state.status,currentStatus:normalized||null,sequence:state.sequence,ruleBaseline:'static-22UTC-consistency40-v1',eligibleForMigration:false,coverage:'submitted_events_not_broker_verified'};
 }catch(e){return {status:'blocked_replay',events:trades.length,errorCode:e.code||'invalid_metadata',eligibleForMigration:false};}
}
async function runShadow(){
 const db=admin.firestore(),challenges=await db.collection('challenges').limit(51).get(),now=Date.now(),results=[];
 for(const d of challenges.docs.slice(0,50)){
  const c=d.data();let trades=await db.collection('trades').where('challengeId','==',d.id).limit(1001).get();
  if(trades.empty&&(c.brokerAccountId||c.accountId))trades=await db.collection('trades').where('accountId','==',String(c.brokerAccountId||c.accountId)).limit(1001).get();
  const reference=createHash('sha256').update(d.id).digest('hex').slice(0,24),result=trades.size>1000?{status:'blocked_volume',events:trades.size,eligibleForMigration:false}:compare(c,trades.docs.map(t=>t.data()));
  results.push({reference,...result});
 }
 const report={checkedAt:now,mode:'read_only_shadow',challengeCount:challenges.size,truncated:challenges.size>50,results,eligibleForMigration:false};
 const batch=db.batch(),ref=db.collection('fynxDeveloperShadow');batch.set(ref.doc('latest'),report);batch.create(ref.doc('run-'+now),report);await batch.commit();
 logger.info('FYNX Funded shadow comparison',{service:'fynx_api',kind:'funded_shadow',status:200,challengeCount:challenges.size,ready:results.filter(r=>r.status==='candidate_match').length,blocked:results.filter(r=>r.status!=='candidate_match').length});return report;
}
exports.compare=compare;exports.runShadow=runShadow;
exports.developerFundedShadow=functions.runWith({timeoutSeconds:540,memory:'512MB',maxInstances:1}).pubsub.schedule('every 6 hours').timeZone('Etc/UTC').onRun(async()=>{try{return await runShadow();}catch(e){logger.error('FYNX Funded shadow failed',{service:'fynx_api',kind:'funded_shadow',status:500});throw e;}});
