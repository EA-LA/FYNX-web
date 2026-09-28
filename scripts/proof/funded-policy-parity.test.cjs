'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./funded-scenarios.cjs'),policy=require('../../backend/funded-policy.cjs'),{context,cases}=require('./funded-policy-fixtures.cjs');
const Decimal=require('../../backend/node_modules/decimal.js');
const clientEngine=load('src/services/api-rule-engine.ts',{'decimal.js':Decimal}).api;
const serverEngine=load('functions/src/apiRuleEngine.ts',{'decimal.js':Decimal}).api;
const client=load('src/services/funded-policy.ts',{'./api-rule-engine':clientEngine}).api;
const server=load('functions/src/fundedPolicy.ts',{'./apiRuleEngine':serverEngine}).api;
for(const c of cases)test('Funded client/server/API parity: '+c.name,()=>{
 const ctx=context(c.events),expected=policy.evaluate(ctx,c.events);
 assert.equal(expected.state.status,c.status,c.name+': approved policy outcome');
 assert.equal(expected.state.metrics.trading_days,c.days,c.name+': approved trading-day count');
 assert.deepEqual(JSON.parse(JSON.stringify(client.evaluate(ctx,c.events))),expected);
 assert.deepEqual(JSON.parse(JSON.stringify(server.evaluate(ctx,c.events))),expected);
});
