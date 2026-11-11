'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const {SCOPES}=require('../backend/developer-access.cjs');
const legacy=SCOPES.filter(scope=>scope!=='finance:calculate');
function workspace(extra={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'api/workspace.html'),'utf8'),{url:'https://www.fynxfinanceworld.com/api/workspace.html#keys',runScripts:'outside-only'});
 const w=dom.window;
 Object.assign(w,{app:{},auth:{currentUser:null},getFunctions:()=>({}),httpsCallable:()=>{throw Error('Unexpected network call');},onAuthStateChanged(){}});
 const source=fs.readFileSync(path.join(root,'api/workspace.js'),'utf8').replace(/^import .*;\n/gm,'').replace('await authPersistenceReady;','');
 w.eval(source+'\nwindow.testApi={setState:value=>{state=value;render();},render,chosenScopes};');
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
 assert(routes.every(route=>!route.startsWith('finance/')));
 assert.match(d.querySelector('#panel .notice').textContent,/awaiting activation/);
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
 assert.equal(d.querySelector('#panel .notice'),null);
 dom.window.close();
});
test('explicit old capabilities and malformed metadata never enable finance',()=>{
 for(const supported_scopes of [legacy,null,{},['risk:calculate','unknown:scope']]){
  const {dom,w,d}=workspace({supported_scopes});
  assert.equal(d.querySelector('[value="finance:calculate"]'),null);
  w.location.hash='playground';w.testApi.render();
  assert([...d.querySelectorAll('#run-form option')].every(n=>!n.value.startsWith('finance/')));
  dom.window.close();
 }
});
