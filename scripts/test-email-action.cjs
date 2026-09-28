const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('auth/action.js','utf8').replaceAll('import(', 'loadTestModule(').replace('location.replace(target.href)','captureRedirect(target.href)');
const finance='https://www.fynxfinanceworld.com/auth/login.html';
async function test(mode,continueUrl=finance,code='test-code',error){
 const query=new URLSearchParams({mode,oobCode:code,continueUrl,apiKey:'public-test-key'});
 const dom=new JSDOM(fs.readFileSync('auth/action.html','utf8'),{url:'https://www.fynxfinanceworld.com/auth/action.html?'+query,runScripts:'outside-only'});const w=dom.window;let redirect,applied=0,confirmed=0;
 w.captureRedirect=url=>redirect=url;w.loadTestModule=async url=>url==='./firebase.js'?{auth:{}}:{verifyPasswordResetCode:async()=>{if(error)throw {code:error};return 'test@example.com'},applyActionCode:async()=>{if(error)throw {code:error};applied++},confirmPasswordReset:async()=>{confirmed++}};w.eval(source);await new Promise(r=>setTimeout(r,10));return {dom,w,get redirect(){return redirect},get applied(){return applied},get confirmed(){return confirmed}};
}
(async()=>{
 const reset=await test('resetPassword');assert.equal(reset.w.document.getElementById('resetForm').hidden,false);assert.equal(reset.w.location.search,'');const f=reset.w.document.getElementById('resetForm');f.elements.password.value='ExamplePassword1!';f.elements.confirm.value='MismatchPassword1!';f.dispatchEvent(new reset.w.Event('submit',{cancelable:true}));assert.match(reset.w.document.getElementById('status').textContent,/don’t match/);assert.equal(reset.confirmed,0);f.elements.confirm.value=f.elements.password.value;f.dispatchEvent(new reset.w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,10));assert.equal(reset.confirmed,1);assert.equal(f.hidden,true);assert.match(reset.w.document.getElementById('heading').textContent,/updated/);reset.dom.window.close();
 for(const mode of ['verifyEmail','recoverEmail']){const r=await test(mode);assert.equal(r.applied,1);assert(!r.redirect);r.dom.window.close();}
 for(const state of ['','https://fynxfunded.com/reset-password']){const r=await test('resetPassword',state);const u=new URL(r.redirect);assert.equal(u.origin,'https://fynxfunded.com');assert.equal(u.searchParams.get('oobCode'),'test-code');r.dom.window.close();}
 const v=await test('verifyEmail','');assert.equal(new URL(v.redirect).origin,'https://fynx-c7a28.firebaseapp.com');v.dom.window.close();
 const evil=await test('resetPassword','https://attacker.example/');assert.equal(new URL(evil.redirect).origin,'https://fynx-c7a28.firebaseapp.com');assert(!evil.redirect.includes('attacker'));evil.dom.window.close();
 const missing=await test('resetPassword',finance,'');assert.match(missing.w.document.getElementById('status').textContent,/incomplete/);missing.dom.window.close();
 for(const error of ['auth/expired-action-code','auth/network-request-failed']){const r=await test('resetPassword',finance,'test-code',error);assert.equal(r.w.document.getElementById('resetForm').hidden,true);assert.equal(r.w.document.getElementById('status').dataset.error,'true');r.dom.window.close();}
 console.log('PASS Finance reset/verification/recovery, mismatch/retry, expired/network failure, code removal, Funded routing and untrusted-redirect rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
