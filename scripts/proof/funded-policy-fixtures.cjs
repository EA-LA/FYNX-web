'use strict';
const {createHash}=require('node:crypto');
const policy=require('../../backend/funded-policy.cjs');
function context(events,overrides={}){
 const c={policy_version:policy.VERSION,program:'2-phase',phase:1,starting_balance:'10000',currency:'USD',start_timestamp:'2026-09-01T00:00:00Z',...overrides};
 c.agreement={verified:true,reference:'SYNTHETIC TEST ONLY',document_sha256:createHash('sha256').update('synthetic-test').digest('hex'),accepted_at:'2026-08-31T00:00:00Z',reviewed_at:'2026-08-31T01:00:00Z',reviewed_by:'test-fixture',policy_version:policy.VERSION,rule_snapshot:policy.ruleSnapshot(c)};
 c.coverage={complete:true,pagination_complete:true,equity_complete:true,source_reference:'SYNTHETIC TEST ONLY',source_sha256:'a'.repeat(64),adapter_version:'SYNTHETIC TEST ONLY',reviewed_by:'TEST ONLY',reviewed_at:'2026-09-10T00:00:00Z',account_id:'broker',phase_reference:c.agreement.reference+':phase:'+c.phase,from:c.start_timestamp,through:events.at(-1)?.timestamp,event_count:events.length,source_sequence_start:1,source_sequence_end:events.length};
 const Decimal=require('../../backend/node_modules/decimal.js');let balance=new Decimal(c.starting_balance);
 for(const [i,e] of events.entries()){if(e.event_type==='closed_trade')balance=balance.plus(e.realized_pnl);Object.assign(e,{account_id:'broker',phase_reference:c.coverage.phase_reference,source_sequence:i+1,pnl_basis:'net_after_all_costs',broker_balance:balance.toFixed(),broker_equity:balance.plus(e.unrealized_pnl_after).toFixed()});}return c;
}
const events=pnls=>pnls.map((p,i)=>({sequence:i+1,source_event_id:'test-'+i,event_type:'closed_trade',timestamp:`2026-09-${String(i+1).padStart(2,'0')}T16:00:00Z`,realized_pnl:String(p),unrealized_pnl_after:'0',open_position_count:0}));
const cases=[
 {name:'static maximum loss',events:events([400,400,400,400,400,-400,-400,-400]),status:'active',days:8},
 {name:'40 percent consistency',events:events([700,25,25,25,25]),status:'active',days:5},
 {name:'intraday recovery preserves breach',events:events([-501,701,200,200,200,200]).map((e,i)=>({...e,timestamp:i===0?'2026-09-01T12:00:00Z':i===1?'2026-09-01T16:00:00Z':`2026-09-0${i}T16:00:00Z`})),status:'breached',days:5},
 {name:'daily reference is boundary balance',events:events([400,400,400,400,400,-550]),status:'eligible',days:6},
 {name:'22 UTC reset separates trading days',events:events([100,100]).map((e,i)=>({...e,timestamp:`2026-09-01T${i===0?'21':'22'}:30:00Z`})),status:'active',days:2}
];
module.exports={context,events,cases};
