const {test}=require('node:test');const assert=require('node:assert/strict');
const a=require('./developer-access.cjs');
test('each route needs its own scope',()=>{
 assert.equal(a.required('/v1/risk/margin'),'risk:calculate');
 assert.equal(a.required('GET /v1/propfirm/accounts/x/status'),'propfirm:read');
 assert.equal(a.required('/v1/propfirm/accounts'),'propfirm:write');
 assert.equal(a.required('/v1/indicators/rsi'),'indicators:calculate');
 assert.equal(a.required('/v1/markets/status'),'markets:read');
 assert.equal(a.required('/v1/portfolio/drawdown'),'portfolio:calculate');
 assert.equal(a.required('/v1/unknown/x'),null);
});
test('legacy keys keep full access, including new products',()=>{
 for(const r of ['/v1/risk/margin','/v1/indicators/sma','/v1/markets/sessions','/v1/portfolio/exposure','GET /v1/propfirm/accounts/a/status'])assert.equal(a.permits({},r),true,r);
});
test('explicit scopes are honored and do not silently gain new products',()=>{
 const old={scopes:['propfirm:read','propfirm:write','risk:calculate']};
 assert.equal(a.permits(old,'/v1/risk/margin'),true);assert.equal(a.permits(old,'/v1/indicators/sma'),false);assert.equal(a.permits(old,'/v1/markets/status'),false);
 assert.equal(a.permits({scopes:['markets:read']},'/v1/markets/status'),true);assert.equal(a.permits({scopes:['markets:read']},'/v1/risk/margin'),false);
});
test('new keys default to every scope; invalid scope lists are rejected',()=>{
 assert.deepEqual(a.scopes(undefined),[...a.SCOPES]);
 assert.deepEqual(a.scopes(['portfolio:calculate','indicators:calculate']),['indicators:calculate','portfolio:calculate']);
 for(const bad of [[],['admin'],'risk:calculate',['risk:calculate','risk:calculate']])assert.throws(()=>a.scopes(bad),/supported API key scopes/);
});
test('malformed or unknown fails closed',()=>{
 assert.equal(a.permits({scopes:null},'/v1/risk/margin'),false);assert.equal(a.permits({scopes:'risk:calculate'},'/v1/risk/margin'),false);
 assert.equal(a.permits({},'/v1/unknown/x'),false);assert.equal(a.permits({},'/v1/risk'),false);
});
