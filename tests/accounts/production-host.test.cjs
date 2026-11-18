'use strict';
// accounts.fynxfinanceworld.com host: health check, exact-origin CORS for the www site, refusal of other
// origins, private data directory, and the proxy-aware client IP used for rate limits.
const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const port=18000+Math.floor(Math.random()*1000);
test('production accounts host',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fynx-acc-')),db=path.join(dir,'data','accounts.sqlite');
  const child=spawn(process.execPath,[path.join(__dirname,'../../scripts/accounts-server.cjs')],{env:{...process.env,NODE_ENV:'production',ACCOUNTS_PORT:String(port),ACCOUNTS_DB_PATH:db,ACCOUNTS_FIREBASE_PROJECT_ID:'fynx-test',ACCOUNTS_KMS_KEY_NAME:'projects/p/locations/us-central1/keyRings/r/cryptoKeys/k',ACCOUNTS_ALLOWED_ORIGINS:'https://www.fynxfinanceworld.com,https://fynxfinanceworld.com',ACCOUNTS_CORS:'true'},stdio:['ignore','pipe','pipe']});
  t.after(()=>{child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});});
  await new Promise((ok,bad)=>{const timer=setTimeout(()=>bad(new Error('server did not start')),10000);child.stdout.on('data',d=>{if(String(d).includes('accounts service')){clearTimeout(timer);ok();}});child.on('exit',c=>bad(new Error('exited '+c)));});
  const base=`http://127.0.0.1:${port}`;
  assert.equal(await (await fetch(base+'/healthz')).text(),'ok');
  const pre=await fetch(base+'/api/accounts/session',{method:'OPTIONS',headers:{Origin:'https://www.fynxfinanceworld.com','Access-Control-Request-Method':'POST'}});
  assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),'https://www.fynxfinanceworld.com');assert.equal(pre.headers.get('access-control-allow-credentials'),'true');
  assert.match(pre.headers.get('access-control-allow-headers'),/X-CSRF-Token/);
  const evil=await fetch(base+'/api/accounts/session',{headers:{Origin:'https://evil.example'}});
  assert.equal(evil.status,403);assert.equal(evil.headers.get('access-control-allow-origin'),null);
  const anon=await fetch(base+'/api/accounts/session',{headers:{Origin:'https://www.fynxfinanceworld.com','Sec-Fetch-Site':'same-site'}});
  assert.equal(anon.status,401);assert.equal((await anon.json()).error.code,'SIGN_IN_REQUIRED');
  assert.equal((await fetch(base+'/anything-else')).status,404);
  assert.equal(fs.statSync(path.dirname(db)).mode&0o777,0o700);
});
test('client IP: X-Forwarded-For only trusted from the local proxy when enabled',()=>{
  const {peer}=require('../../backend/accounts/auth.cjs');
  const req=(remote,xff)=>({socket:{remoteAddress:remote},headers:{'x-forwarded-for':xff}});
  const prev=process.env.ACCOUNTS_TRUST_LOCAL_PROXY;
  try{
    delete process.env.ACCOUNTS_TRUST_LOCAL_PROXY;assert.equal(peer(req('127.0.0.1','203.0.113.9')).ip,'127.0.0.1');
    process.env.ACCOUNTS_TRUST_LOCAL_PROXY='true';
    assert.equal(peer(req('127.0.0.1','10.0.0.1, 203.0.113.9')).ip,'203.0.113.9');
    assert.equal(peer(req('198.51.100.7','203.0.113.9')).ip,'198.51.100.7','remote callers cannot spoof');
    assert.equal(peer(req('127.0.0.1','<script>')).ip,'127.0.0.1');
  }finally{if(prev===undefined)delete process.env.ACCOUNTS_TRUST_LOCAL_PROXY;else process.env.ACCOUNTS_TRUST_LOCAL_PROXY=prev;}
});
