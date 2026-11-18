'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../assets/js/accounts/logout.js'),'utf8').replace('export async function','async function');
function helper(cookie,fetchImpl){return vm.runInNewContext(source+'\nendAccountsSession;', {document:{cookie},fetch:fetchImpl,AbortSignal,Error});}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const csrf='a'.repeat(43);
test('unrelated static/offline sign-out makes no Accounts requests without its presence marker',async()=>{
 let calls=0;for(const cookies of ['', 'fynx_theme=dark', 'fynx_accounts_present=0', 'other_fynx_accounts_present=1', 'fynx_accounts_present=10'])await helper(cookies,async()=>{calls++;throw new Error('offline');})();
 assert.equal(calls,0);
});
test('presence marker requires an authenticated CSRF-bound revocation confirmation',async()=>{
 const calls=[];await helper('theme=dark; fynx_accounts_present=1; other=value',async(url,options)=>{calls.push({url,options});return options.method==='DELETE'?json({revoked:true}):json({csrfToken:csrf});})();
 assert.equal(calls.length,2);assert.equal(calls[0].url,'/api/accounts/session');assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[1].options.method,'DELETE');assert.equal(calls[1].options.headers['X-CSRF-Token'],csrf);assert.equal(calls[1].options.body,'{}');
});
test('an expired Accounts session permits logout but a marked route outage does not masquerade as revocation',async()=>{
 await helper('fynx_accounts_present=1',async()=>json({error:'expired'},401))();
 await assert.rejects(helper('fynx_accounts_present=1',async()=>json({error:'missing'},404))(),/could not be checked/);
 await assert.rejects(helper('fynx_accounts_present=1',async()=>{throw new Error('private upstream CANARY');})(),e=>/could not confirm/.test(e.message)&&!e.message.includes('CANARY'));
});
test('HTML fallback, missing CSRF, failed delete and non-confirming success responses fail safely',async()=>{
 await assert.rejects(helper('fynx_accounts_present=1',async()=>new Response('<html>static fallback</html>'))(),/could not confirm/);
 for(const value of [{}, {csrfToken:'bad'}, {csrfToken:12}])await assert.rejects(helper('fynx_accounts_present=1',async()=>json(value))(),/Refresh/);
 for(const response of [()=>json({revoked:false}),()=>json({accepted:true}),()=>new Response('<html>fallback</html>'),()=>json({},503)]){
  let calls=0;await assert.rejects(helper('fynx_accounts_present=1',async()=>++calls===1?json({csrfToken:csrf}):response())());assert.equal(calls,2);
 }
});
