'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),policy=require('./funded-policy.cjs');
const {context,events,cases}=require('../scripts/proof/funded-policy-fixtures.cjs');
for(const c of cases)test('versioned policy: '+c.name,()=>{const r=policy.evaluate(context(c.events),c.events);assert.equal(r.state.status,c.status);assert.equal(r.state.metrics.trading_days,c.days);assert.equal(r.authorizes_phase_transition,false);});
test('all programs/phases share the exact configured targets and loss limits',()=>{
 for(const [program,targets,daily,max,days] of [['1-phase',[10],4,8,3],['2-phase',[8,5],5,10,5],['3-phase',[6,5,4],5,12,5]])for(const [i,target] of targets.entries()){
 const e=events(Array.from({length:days},()=>target*100/days)),c=context(e,{program,phase:i+1}),r=policy.ruleSnapshot(c);assert.equal(r.profit_target_percent,String(target));assert.equal(r.daily_loss_percent,String(daily));assert.equal(r.max_loss_percent,String(max));assert.equal(r.min_trading_days,days);
 }
});
test('missing, changed or unsupported purchased agreements cannot opt in',()=>{
 const e=events([100]);for(const change of [c=>delete c.agreement,c=>c.agreement.verified=false,c=>c.agreement.rule_snapshot.reset_hour_utc=0,c=>c.agreement.rule_snapshot.max_loss_type='trailing',c=>c.policy_version='unknown',c=>c.agreement.document_sha256='invalid',c=>c.currency='EUR',c=>c.phase=9,c=>c.agreement.accepted_at='2026-09-02T00:00:00Z']){const c=context(e);change(c);assert.throws(()=>policy.evaluate(c,e));}
});
test('incomplete coverage, empty history and duplicate sources are rejected',()=>{
 const e=events([100,100]);for(const change of [c=>delete c.coverage,c=>c.coverage.complete=false,c=>c.coverage.through=e[0].timestamp]){const c=context(e);change(c);assert.throws(()=>policy.evaluate(c,e));}
 assert.throws(()=>policy.evaluate(context([]),[]));const duplicate=e.map(x=>({...x,source_event_id:'same'}));assert.throws(()=>policy.evaluate(context(duplicate),duplicate));
});
test('floating marks breach, flat exposure is required, equality allowed and recorded breach persists',()=>{
 const loss=events([-500]);assert.equal(policy.evaluate(context(loss),loss).state.status,'active');loss[0].realized_pnl='-500.01';assert.equal(policy.evaluate(context(loss),loss).state.status,'breached');
 const marks=[{sequence:1,source_event_id:'mark',event_type:'equity_mark',timestamp:'2026-09-01T16:00:00Z',unrealized_pnl_after:'-501',open_position_count:1}];assert.equal(policy.evaluate(context(marks),marks).state.status,'breached');
 const e=events([200,200,200,200,200]);e.at(-1).open_position_count=1;assert.equal(policy.evaluate(context(e),e).state.status,'active');
 const c=context(e);c.recorded_breach={reasons:['daily_loss'],timestamp:e[0].timestamp};assert.equal(policy.evaluate(c,e).state.status,'breached');
});
