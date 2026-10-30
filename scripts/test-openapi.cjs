'use strict';
// Keeps api/openapi.json, the backend routes, key scopes and the workspace scope picker in sync,
// and proves every documented example is accepted by the real engine.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
execFileSync(process.execPath,[path.join(__dirname,'build-openapi.cjs'),'--check'],{stdio:'inherit'});
const {R,PROP,spec}=require('./build-openapi.cjs');
const be=f=>require(path.join(root,'backend',f));
const analytics=be('developer-analytics.cjs'),markets=be('developer-markets.cjs'),engine=be('developer-engine.cjs'),access=be('developer-access.cjs');
// 1. Every engine route is documented, and nothing undocumented is claimed.
const documented=new Set(R.map(([g,n])=>`${g}/${n}`));
const expected=[...analytics.INDICATORS.map(n=>`indicators/${n}`),...analytics.PORTFOLIO.map(n=>`portfolio/${n}`),...markets.MARKETS.map(n=>`markets/${n}`),...['position-size','risk-reward','pip-value','margin','break-even','atr-stop'].map(n=>`risk/${n}`)];
assert.deepEqual([...documented].sort(),expected.sort(),'OpenAPI routes must match the engine');
// 2. Every documented scope is the scope the gateway enforces.
for(const [p,item] of Object.entries(spec.paths))for(const [m,o] of Object.entries(item)){const route=(m==='get'?'GET ':'')+p.replace('{account_id}','x');assert.equal(o['x-fynx-scope'],access.required(route),`${m} ${p} scope`);}
// 3. Every documented example is accepted by the engine.
for(const [g,n,,,,ex] of R){const run=g==='risk'?()=>engine.risk(n,ex):g==='markets'?()=>markets.markets(n,ex):g==='portfolio'?()=>analytics.portfolio(n,ex):()=>analytics.indicator(n,ex);assert.doesNotThrow(run,`${g}/${n} example`);}
assert.doesNotThrow(()=>engine.rules(PROP[0][5]),'rule-set example');
// 4. The workspace scope picker offers exactly the backend scopes.
const ws=fs.readFileSync(path.join(root,'api/workspace.js'),'utf8'),picker=[...ws.match(/const SCOPES=\[(.*?)\];/)[1].matchAll(/\['([a-z]+:[a-z]+)'/g)].map(m=>m[1]);
assert.deepEqual(picker.sort(),[...access.SCOPES].sort(),'workspace scopes must match backend scopes');
// 4b. The workspace plan cards match the backend plan catalog.
const plans=be('developer-plans.cjs'),cards=eval(ws.match(/const PLANS=(\[.*?\]);/)[1]);
for(const [k,,price,calls,rps,over] of cards){const p=plans.PLANS[k];assert.deepEqual([price,calls,rps,over],[p.monthlyPrice,p.monthlyCalls,p.rps,p.overageBlockCents===null?null:p.overageBlockCents/100],`workspace plan ${k}`);}
const page=fs.readFileSync(path.join(root,'api/pricing.html'),'utf8');for(const k of ['free','developer','business'])assert(page.includes(`$${plans.PLANS[k].monthlyPrice}<`)&&page.includes(plans.PLANS[k].monthlyCalls.toLocaleString('en-US')),`pricing page plan ${k}`);
// 5. SDKs cover every route group.
for(const f of ['api/sdk/fynx.mjs','api/sdk/fynx.py']){const t=fs.readFileSync(path.join(root,f),'utf8');for(const g of ['risk','indicators','markets','portfolio','propfirm'])assert(t.includes(g),`${f} missing ${g}`);}
console.log(`OpenAPI: ${Object.keys(spec.paths).length} paths in sync with engine, scopes, examples, workspace picker and SDKs.`);
