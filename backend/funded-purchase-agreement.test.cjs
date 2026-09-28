'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{build,bind}=require('./funded-purchase-agreement.cjs'),{VERSION}=require('./funded-policy.cjs');
const input={uid:'qa',program:'2-phase',starting_balance:'10000',accepted_version:VERSION,accepted:true,now:'2026-09-01T00:00:00Z'};
const args=p=>({uid:'qa',order_id:'test-order',program:'2-phase',starting_balance:'10000',start_timestamp:'2026-09-01T01:00:00Z',expected_hash:p.document_sha256});
test('checkout preserves exact per-phase rules and authenticated acceptance',()=>{const p=build(input),c=bind(p,args(p));assert.equal(p.document.phases.length,2);assert.equal(p.document.phases[1].profit_target_percent,'5');assert.equal(c.agreement.reference,'order:test-order');assert.equal(c.coverage,null);});
test('no prior acceptance is fabricated from an order or payment alone',()=>{assert.throws(()=>build({...input,accepted:false}));assert.throws(()=>build({...input,accepted_version:'old'}));assert.throws(()=>bind(null,args(build(input))));});
test('changed terms, other customers and wrong program cannot bind to a purchase',()=>{const p=build(input);for(const extra of [{uid:'other'},{program:'1-phase'},{expected_hash:'bad'},{starting_balance:'50000'}])assert.throws(()=>bind(p,{...args(p),...extra}));p.document.phases[0].reset_hour_utc=0;assert.throws(()=>bind(p,args(p)));});
