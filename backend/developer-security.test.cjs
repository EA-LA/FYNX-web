// Security and integration tests for the public gateway (checklist item 49): authentication, key scopes,
// tenant isolation, environment isolation, input limits, rate limits and quotas, run through the real
// developerGateway handler against an in-memory Firestore.
const {test}=require('node:test');const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=t=>createHash('sha256').update(t).digest('hex');
const KEY=(c,env='live')=>`fynx_${env}_${c.repeat(64)}`;
function world(clock=1767225600000){ // fixed clock so per-second rate tests are deterministic
 const docs=new Map(),users=new Map();
 const snap=p=>({exists:docs.has(p),id:p.split('/').pop(),data:()=>docs.get(p)});
 const ref=p=>({path:p,id:p.split('/').pop(),get:async()=>snap(p),set:async(v,o)=>docs.set(p,o?.merge?{...docs.get(p),...v}:v),update:async v=>docs.set(p,{...docs.get(p),...v}),collection:n=>col(p+'/'+n)});
 const col=p=>({doc:id=>ref(p+'/'+(id||Math.random().toString(36).slice(2))),limit:()=>({path:p,docs:[]}),orderBy:()=>col(p)});
 const db={collection:p=>col(p),runTransaction:async f=>{const w=[];const out=await f({get:async r=>r.docs?{size:0,docs:[]}:snap(r.path),set:(r,v,o)=>w.push(()=>docs.set(r.path,o?.merge?{...docs.get(r.path),...v}:v)),create:(r,v)=>{if(docs.has(r.path))throw Error('exists');w.push(()=>docs.set(r.path,v));},update:(r,v)=>w.push(()=>docs.set(r.path,{...docs.get(r.path),...v}))});w.forEach(x=>x());return out;}};
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const fn={https:{HttpsError,onCall:f=>f,onRequest:f=>f}};
 class FixedDate extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock;}}
 const stubs={'firebase-functions/v1':{...fn,runWith:()=>fn},'firebase-functions/logger':{info(){},error(){},warn(){}},
  'firebase-admin':{firestore:Object.assign(()=>db,{FieldPath:{documentId:()=>'__id__'}}),auth:()=>({getUser:async uid=>{const u=users.get(uid);if(!u)throw Error('no user');return u;}})},
  './developer-billing.cjs':{refresh:async()=>({}),flushMeter:async()=>({})}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'developer-api.cjs'),'utf8'),{module,exports:module.exports,require:n=>stubs[n]||require(n.startsWith('.')?path.join(__dirname,n):n),Date:FixedDate,Math,JSON,Buffer,console,process,setTimeout});
 const addUser=(uid,o={})=>{users.set(uid,{uid,emailVerified:true,disabled:false,...o});docs.set(`fynxDevelopers/${uid}`,{plan:'free'});};
 const addKey=(token,uid,env,extra={})=>docs.set(`fynxDeveloperKeys/${hash(token)}`,{uid,environment:env,revokedAt:null,...extra});
 async function call(method,p,{token,body={},type='application/json'}={}){
  const headers={},res={code:0,body:null,headers,set:(k,v)=>{headers[k]=v;},getHeader:k=>headers[k],on(){},status(c){this.code=c;return this;},json(o){this.body=o;return this;},end(){return this;}};
  const req={method,path:p,query:{},body,is:t=>t==='application/json'&&type==='application/json',get:h=>h==='Authorization'&&token?`Bearer ${token}`:undefined};
  await module.exports.developerGateway(req,res);return res;
 }
 return {docs,users,addUser,addKey,call,setClock:t=>{clock=t;}};
}
function seeded(){const w=world();w.addUser('alice');w.addUser('bob');
 w.addKey(KEY('a'),'alice','live');w.addKey(KEY('b','test'),'alice','test');w.addKey(KEY('c'),'bob','live');
 w.addKey(KEY('d'),'alice','live',{scopes:['markets:read']});w.addKey(KEY('e'),'alice','live',{revokedAt:1});
 w.docs.set('fynxDevelopers/bob/environments/live/accounts/acct_bob',{name:'Bob phase 1',balance:'100000'});
 w.docs.set('fynxDevelopers/alice/environments/live/accounts/acct_alice',{name:'Alice live',balance:'50000'});return w;}
test('valid key reaches the engine and gets a metered result',async()=>{
 const w=seeded(),r=await w.call('POST','/v1/markets/exchanges',{token:KEY('a')});
 assert.equal(r.code,200);assert.equal(r.body.result.exchanges.length,7);assert.equal(r.headers['X-RateLimit-Limit'],'1000');assert.equal(r.headers['X-RateLimit-Remaining'],'999');
});
test('authentication: missing, malformed, unknown and revoked keys are rejected with 401',async()=>{
 const w=seeded();
 for(const token of [undefined,'abc','fynx_live_'+'g'.repeat(64),'fynx_prod_'+'a'.repeat(64),KEY('f'),KEY('e')]){const r=await w.call('POST','/v1/markets/exchanges',{token});assert.equal(r.code,401,String(token));assert.equal(r.body.error.code,'unauthenticated');}
});
test('scopes: a key limited to markets:read cannot call other products',async()=>{
 const w=seeded();
 assert.equal((await w.call('POST','/v1/markets/sessions',{token:KEY('d')})).code,200);
 for(const p of ['/v1/indicators/sma','/v1/portfolio/performance','/v1/risk/margin','/v1/propfirm/rule-sets']){const r=await w.call('POST',p,{token:KEY('d'),body:{values:[1,2]}});assert.equal(r.code,403,p);assert.equal(r.body.error.code,'permission-denied');}
 assert.equal((await w.call('GET','/v1/propfirm/accounts/acct_alice/status',{token:KEY('d')})).code,403);
});
test('tenant isolation: one customer cannot read another customer’s account',async()=>{
 const w=seeded();
 const own=await w.call('GET','/v1/propfirm/accounts/acct_alice/status',{token:KEY('a')});assert.equal(own.code,200);assert.equal(own.body.result.name,'Alice live');
 const other=await w.call('GET','/v1/propfirm/accounts/acct_bob/status',{token:KEY('a')});assert.equal(other.code,404);assert(!JSON.stringify(other.body).includes('Bob'));
 const bob=await w.call('GET','/v1/propfirm/accounts/acct_alice/status',{token:KEY('c')});assert.equal(bob.code,404);
});
test('environment isolation: a test key cannot see live data',async()=>{
 const w=seeded();const r=await w.call('GET','/v1/propfirm/accounts/acct_alice/status',{token:KEY('b','test')});
 assert.equal(r.code,404);
});
test('a key record pointing at another owner or environment is refused',async()=>{
 const w=seeded();w.addKey(KEY('9'),'alice','live',{scopes:['risk:calculate','markets:read']});
 // Tampered key records are caught by the transaction check (uid/environment must match the key).
 w.docs.set(`fynxDeveloperKeys/${hash(KEY('9'))}`,{...w.docs.get(`fynxDeveloperKeys/${hash(KEY('9'))}`),environment:'staging'});
 const r=await w.call('POST','/v1/markets/exchanges',{token:KEY('9')});assert.equal(r.code,401);
 w.addKey(KEY('8'),'alice','test');assert.equal((await w.call('POST','/v1/markets/exchanges',{token:KEY('8')})).code,401,'a live-prefixed key recorded as test is refused');
});
test('owner eligibility: disabled or unverified accounts cannot use their keys',async()=>{
 const w=seeded();w.users.get('alice').disabled=true;assert.equal((await w.call('POST','/v1/markets/exchanges',{token:KEY('a')})).code,403);
 w.users.get('alice').disabled=false;w.users.get('alice').emailVerified=false;assert.equal((await w.call('POST','/v1/markets/exchanges',{token:KEY('a')})).code,403);
});
test('input limits: wrong method, non-JSON and oversized bodies are rejected before any work',async()=>{
 const w=seeded();
 assert.equal((await w.call('DELETE','/v1/markets/exchanges',{token:KEY('a')})).code,405);
 assert.equal((await w.call('POST','/v1/markets/exchanges',{token:KEY('a'),type:'text/plain'})).code,400);
 assert.equal((await w.call('POST','/v1/indicators/sma',{token:KEY('a'),body:{values:Array(12000).fill(1)}})).code,400);
 const bad=await w.call('POST','/v1/indicators/sma',{token:KEY('a'),body:{values:[1,'x']}});assert.equal(bad.code,422);assert.equal(bad.body.error.code,'invalid_input');
 assert.equal((await w.call('POST','/v1/nope/x',{token:KEY('a')})).code,403,'unknown routes fail closed at the scope check');
});
test('rate limit: the 11th request in one second on Free is throttled with Retry-After',async()=>{
 const w=seeded();let last;
 for(let i=0;i<11;i++)last=await w.call('POST','/v1/markets/exchanges',{token:KEY('a')});
 assert.equal(last.code,429);assert.equal(last.headers['Retry-After'],'60');
 w.setClock(1767225601000);assert.equal((await w.call('POST','/v1/markets/exchanges',{token:KEY('a')})).code,200,'next second is allowed again');
});
test('quota: the monthly allowance stops further calls and failed calls are not counted',async()=>{
 const w=seeded(),month=new Date(1767225600000).toISOString().slice(0,7);
 w.docs.set(`fynxDevelopers/alice/environments/live/usage/${month}`,{calls:999});
 assert.equal((await w.call('POST','/v1/indicators/sma',{token:KEY('a'),body:{values:[1,'x']}})).code,422);
 assert.equal(w.docs.get(`fynxDevelopers/alice/environments/live/usage/${month}`).calls,999,'validation failures are free');
 w.setClock(1767225602000);assert.equal((await w.call('POST','/v1/markets/exchanges',{token:KEY('a')})).code,200);
 w.setClock(1767225603000);const r=await w.call('POST','/v1/markets/exchanges',{token:KEY('a')});assert.equal(r.code,429);assert.match(r.body.error.message,/allowance/);
});
test('errors never leak keys or internals',async()=>{
 const w=seeded();const r=await w.call('POST','/v1/markets/exchanges',{token:KEY('f')});
 assert(!JSON.stringify(r.body).includes(KEY('f')));assert(!JSON.stringify(r.body).includes(hash(KEY('f'))));assert(!/at .*\.cjs/.test(JSON.stringify(r.body)));
});
test('retention: request records expire after 90 days',async()=>{
 const w=seeded();await w.call('POST','/v1/markets/exchanges',{token:KEY('a')});
 const recs=[...w.docs.entries()].filter(([k])=>k.startsWith('fynxDevelopers/alice/environments/live/requests/'));
 assert.equal(recs.length,1);const r=recs[0][1];assert.equal(r.expireAt.getTime()-r.at,90*86400000);
});
