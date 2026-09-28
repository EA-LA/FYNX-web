'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {reconcile}=require('./developer-reconcile.cjs');
const fixture=()=>({accounts:[{id:'synthetic',source:{kind:'broker_export',reference:'TEST FIXTURE ONLY',complete:true},rules_approval_reference:'TEST ONLY',start_timestamp:'2026-09-01T00:00:00Z',rules:{name:'test',starting_balance:'10000',daily_loss_percent:'5',max_loss_percent:'10',profit_target_percent:'8',max_loss_type:'static',consistency_percent:'40',min_trading_days:5,reset_hour_utc:22,breach_on_touch:false},events:[{sequence:1,source_event_id:'a',event_type:'closed_trade',timestamp:'2026-09-01T12:00:00Z',realized_pnl:'100',unrealized_pnl_after:'0',open_position_count:0,expected:{balance:'10100',equity:'10100',trading_days:1,status:'active',breach:null}}]}]});
test('complete independent expected states reconcile without authorizing launch',()=>{const r=reconcile(fixture());assert.equal(r.complete,true);assert.equal(r.matched_accounts,1);assert.equal(r.authorizes_launch,false);});
test('balance equity days and breach mismatches are separately reported',()=>{const x=fixture();Object.assign(x.accounts[0].events[0].expected,{balance:'10000',equity:'9999',trading_days:0,status:'breached',breach:'daily'});const r=reconcile(x);assert.equal(r.complete,false);assert.equal(r.accounts[0].differences.length,5);});
test('missing evidence, duplicates, empty history and missing provenance block reconciliation',()=>{
 for(const change of [a=>a.events=[],a=>delete a.source,a=>delete a.rules_approval_reference,a=>delete a.events[0].expected,a=>a.events.push({...a.events[0],sequence:2})]){const x=fixture();change(x.accounts[0]);assert.equal(reconcile(x).accounts[0].status,'blocked');}
 const x=fixture();delete x.accounts[0].events[0].expected.equity;assert.equal(reconcile(x).complete,false);
});
test('floating equity and reset coverage cannot be silently discarded',()=>{const x=fixture();Object.assign(x.accounts[0].events[0],{unrealized_pnl_after:'-700',open_position_count:1});const r=reconcile(x);assert.equal(r.accounts[0].final_state.status,'breached');assert.equal(r.complete,false);});
