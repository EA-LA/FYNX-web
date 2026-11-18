'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const {SCOPES}=require('../backend/developer-access.cjs');
const PREVIEW=['finance:calculate','options:calculate'];
const legacy=SCOPES.filter(scope=>!PREVIEW.includes(scope));
function workspace(extra={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'api/workspace.html'),'utf8'),{url:'https://www.fynxfinanceworld.com/api/workspace.html#keys',runScripts:'outside-only'});
 const w=dom.window;
 Object.assign(w,{app:{},auth:{currentUser:null},getFunctions:()=>({}),httpsCallable:()=>{throw Error('Unexpected network call');},onAuthStateChanged(){}});
 const source=fs.readFileSync(path.join(root,'api/workspace.js'),'utf8').replace(/^import .*;\n/gm,'').replace('await authPersistenceReady;','');
 w.eval(source+'\nwindow.testApi={setState:value=>{state=value;render();},render,chosenScopes,showKey,firstCall};');
 w.testApi.setState({profile:{name:'Test'},limits:{plan:'Free'},keys:[],...extra});
 return {dom,w,d:w.document};
}
test('predeployment backend keeps six existing scopes and excludes finance from requests',()=>{
 const {dom,w,d}=workspace();
 const form=d.getElementById('key-form');
 assert.deepEqual([...form.querySelectorAll('[name=scope]')].map(n=>n.value).sort(),[...legacy].sort());
 assert.deepEqual([...w.testApi.chosenScopes(form)].sort(),[...legacy].sort());
 form.querySelector('[value="risk:calculate"]').checked=false;
 assert(!w.testApi.chosenScopes(form).includes('finance:calculate'));
 assert.equal(w.testApi.chosenScopes(form).length,5);
 w.location.hash='playground';w.testApi.render();
 const routes=[...d.querySelectorAll('#run-form option')].map(n=>n.value);
 assert(routes.some(route=>route.startsWith('risk/')));
 assert(routes.some(route=>route.startsWith('markets/')));
 assert(routes.every(route=>!route.startsWith('finance/')&&!route.startsWith('options/')));
 assert.match(d.querySelector('#panel .notice').textContent,/Finance Tools and Options are in preview/);
 dom.window.close();
});
test('finance-enabled backend reveals seven finance presets and preserves explicit selection',()=>{
 const {dom,w,d}=workspace({supported_scopes:[...SCOPES]});
 const form=d.getElementById('key-form');
 assert(form.querySelector('[value="finance:calculate"]'));
 assert.equal(w.testApi.chosenScopes(form),undefined,'all supported products retain the existing default');
 for(const input of form.querySelectorAll('[name=scope]'))input.checked=input.value==='finance:calculate';
 assert.deepEqual([...w.testApi.chosenScopes(form)],['finance:calculate']);
 w.location.hash='playground';w.testApi.render();
 assert.equal([...d.querySelectorAll('#run-form option')].filter(n=>n.value.startsWith('finance/')).length,7);
 assert.equal([...d.querySelectorAll('#run-form option')].filter(n=>n.value.startsWith('options/')).length,5);
 assert.equal(d.querySelector('#panel .notice'),null);
 dom.window.close();
});
test('explicit old capabilities and malformed metadata never enable preview products',()=>{
 for(const supported_scopes of [legacy,null,{},['risk:calculate','unknown:scope']]){
  const {dom,w,d}=workspace({supported_scopes});
  assert.equal(d.querySelector('[value="finance:calculate"]'),null);
  assert.equal(d.querySelector('[value="options:calculate"]'),null);
  w.location.hash='playground';w.testApi.render();
  assert([...d.querySelectorAll('#run-form option')].every(n=>!n.value.startsWith('finance/')&&!n.value.startsWith('options/')));
  dom.window.close();
 }
});
test('a backend that advertises finance but not options shows finance and keeps options in preview',()=>{
 const {dom,w,d}=workspace({supported_scopes:SCOPES.filter(s=>s!=='options:calculate')});
 assert(d.querySelector('[value="finance:calculate"]'));assert.equal(d.querySelector('[value="options:calculate"]'),null);
 assert.match(d.querySelector('#panel .notice').textContent,/^Options is in preview/);
 w.location.hash='playground';w.testApi.render();
 const routes=[...d.querySelectorAll('#run-form option')].map(n=>n.value);
 assert(routes.some(r=>r.startsWith('finance/')));assert(routes.every(r=>!r.startsWith('options/')));
 dom.window.close();
});
test('a new key comes with a ready-to-run first call for a product it can use',()=>{
 const {dom,w,d}=workspace({supported_scopes:[...SCOPES]});
 d.getElementById('key-dialog').showModal=function(){this.open=true;};d.getElementById('key-dialog').close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const key='fynx_test_'+'a'.repeat(64);
 w.testApi.showKey(key,['options:calculate']);
 const cmd=d.getElementById('first-call').textContent;
 assert.match(cmd,/^curl -sS -X POST 'https:\/\/us-central1-fynx-c7a28\.cloudfunctions\.net\/developerGateway\/v1\/options\/expected-move'/);
 assert(cmd.includes(`'Authorization: Bearer ${key}'`));assert(cmd.includes(`-d '{"spot":"100"`));
 assert.equal(d.getElementById('new-key').value,key);
 assert.match(w.testApi.firstCall(key,['propfirm:read']),/^curl -sS '[^']+\/v1\/propfirm\/accounts\/ACCOUNT_ID\/status' \\\n  -H 'Authorization/);
 assert.match(w.testApi.firstCall(key,undefined),/\/v1\/risk\/risk-reward/,'all-products keys start with Risk');
 d.getElementById('key-dialog').close();
 assert.equal(d.getElementById('new-key').value,'');assert.equal(d.getElementById('first-call').textContent,'','closing clears the secret everywhere');
 dom.window.close();
});
test('a preview product is never offered as the first call before activation',()=>{
 const {dom,w}=workspace();
 assert.match(w.testApi.firstCall('k',['options:calculate','markets:read']),/\/v1\/markets\/status/);
 dom.window.close();
});
