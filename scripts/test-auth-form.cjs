const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'auth/auth-form.js'), 'utf8').replaceAll('import(', 'loadTestModule(');
const settle = () => new Promise(resolve => setTimeout(resolve, 10));
async function setup(kind, api = {}, failLoad = false) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, `auth/${kind}.html`), 'utf8'), {url:`https://example.com/auth/${kind}.html`,runScripts:'outside-only'});
  const w = dom.window;
  w.alert = () => assert.fail('Authentication must not show a native alert');
  w.loadTestModule = async url => {
    if (failLoad) throw new Error('SDK blocked');
    if (url.includes('firebase-auth')) return api;
    if (url.includes('firebase.js')) return {auth:{},authPersistenceReady:Promise.resolve()};
    if (url.includes('mfa')) return {withMfa:operation=>operation()};
    return {safeReturnTo:()=>'/home.html'};
  };
  w.eval(script); await settle();
  w.document.querySelector('#email').value = 'test@example.com';
  for(const id of ['password','confirm']) if(w.document.getElementById(id)) w.document.getElementById(id).value='StrongPassword1!';
  if(w.document.getElementById('name')) w.document.getElementById('name').value='Test';
  return {w,close:()=>w.close(),submit:()=>w.document.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true})),status:()=>w.document.querySelector('#authStatus').textContent};
}
(async()=>{
  for(const [code,expected] of [['auth/invalid-credential',/incorrect/],['auth/network-request-failed',/connection/],['auth/too-many-requests',/Too many attempts/]]) {
    const ui=await setup('login',{signInWithEmailAndPassword:async()=>{throw {code};}});
    ui.submit();await settle();assert.match(ui.status(),expected);assert.equal(ui.w.document.querySelector('[type=submit]').disabled,false);ui.close();
  }
  const signup=await setup('signup',{createUserWithEmailAndPassword:async()=>{throw {code:'auth/email-already-in-use'};}});
  signup.submit();await settle();assert.match(signup.status(),/already uses/);signup.w.document.querySelector('#confirm').value='different';signup.submit();assert.match(signup.status(),/don’t match/);signup.close();
  const reset=await setup('forgot',{sendPasswordResetEmail:async()=>{}});reset.submit();await settle();assert.match(reset.status(),/If an account exists/);reset.close();
  const blocked=await setup('login',{},true);assert.match(blocked.status(),/couldn’t load/);blocked.submit();await settle();assert.equal(blocked.w.document.querySelector('[type=submit]').disabled,false);blocked.close();
  let calls=0,reject;
  const pending=await setup('login',{signInWithEmailAndPassword:()=>{calls++;return new Promise((_,r)=>reject=r);}});
  pending.submit();pending.submit();await settle();assert.equal(calls,1);assert.equal(pending.w.document.querySelector('[type=submit]').disabled,true);reject({code:'auth/invalid-credential'});await settle();assert.equal(pending.w.document.querySelector('[type=submit]').disabled,false);pending.close();
  console.log('Authentication validation, duplicate-account, reset, SDK failure and repeated-submit checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
