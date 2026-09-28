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
test('coverage rejects pagination gaps, missing equity attestation and altered source scope',()=>{
 for(const change of [c=>c.coverage.pagination_complete=false,c=>c.coverage.equity_complete=false,c=>c.coverage.event_count++,c=>c.coverage.source_sequence_end++,c=>c.coverage.phase_reference='other',c=>c.coverage.source_sha256='bad',c=>delete c.coverage.adapter_version]){const e=events([100,100]),c=context(e);change(c);assert.throws(()=>policy.evaluate(c,e));}
});
test('mixed account/phase events, source gaps and unspecified cost basis fail closed',()=>{
 for(const change of [e=>e[1].account_id='other',e=>e[1].phase_reference='other',e=>e[1].source_sequence=3,e=>delete e[1].pnl_basis,e=>e[1].pnl_basis='gross']){const e=events([100,100]),c=context(e);change(e);assert.throws(()=>policy.evaluate(c,e));}
});
test('independent broker balances and floating equity must reconcile exactly',()=>{
 for(const change of [e=>e[0].broker_balance='10101',e=>e[0].broker_equity='9999',e=>delete e[0].broker_equity]){const e=events([100]),c=context(e);change(e);assert.throws(()=>policy.evaluate(c,e));}
 const e=events([100]),c=context(e);e[0].broker_balance='+0010100.00';e[0].broker_equity='10100.000';assert.equal(policy.evaluate(c,e).state.balance,'10100');
});
test('overnight exposure requires exact boundary marks and cannot erase a boundary loss',()=>{
 const opening={sequence:1,source_event_id:'open',event_type:'equity_mark',timestamp:'2026-09-01T21:00:00Z',unrealized_pnl_after:'0',open_position_count:1};
 const closing={sequence:3,source_event_id:'close',event_type:'closed_trade',timestamp:'2026-09-02T10:00:00Z',realized_pnl:'100',unrealized_pnl_after:'0',open_position_count:0};
 const missing=[{...opening},{...closing,sequence:2}];assert.throws(()=>policy.evaluate(context(missing),missing),/boundary_snapshot/);
 const boundary={sequence:2,source_event_id:'boundary',event_type:'boundary_snapshot',timestamp:'2026-09-01T22:00:00Z',unrealized_pnl_after:'-501',open_position_count:1};
 const complete=[{...opening},boundary,{...closing}];assert.equal(policy.evaluate(context(complete),complete).state.status,'breached');
 const wrong=complete.map(e=>({...e}));wrong[1].timestamp='2026-09-01T22:00:01Z';assert.throws(()=>policy.evaluate(context(wrong),wrong),/reset instant/);
});
