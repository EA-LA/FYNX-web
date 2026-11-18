'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../../assets/js/edge/profile.js'),'utf8')
  .replaceAll("import('/auth/firebase.js')","window.__authModule()")
  .replaceAll("import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')","Promise.resolve({onAuthStateChanged:window.__listenAuth})");
async function waitFor(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Profile state did not settle');}
function json(data,status=200){return {ok:status>=200&&status<300,status,headers:{get:()=> 'application/json'},json:async()=>data};}
function normal(url){if(url.endsWith('/preferences'))return json({timezone:'Europe/Prague',emailConfigured:false});if(url.endsWith('/tokens'))return json({tokens:[]});if(url.endsWith('/alerts'))return json({alerts:[]});return json({notifications:[]});}
function fixture(fetchResponse){
  const dom=new JSDOM('<div class="settings-list"><button id="existing-setting">Existing Profile setting</button></div><section id="other-section">Existing account section</section>',{url:'https://fynxfinanceworld.com/profile.html',runScripts:'outside-only'});
  const w=dom.window,requests=[];let change;
  w.AbortSignal=AbortSignal;w.__authModule=async()=>({auth:{authStateReady:async()=>{}}});
  w.__listenAuth=(_,fn)=>{change=fn;fn({uid:'alice',emailVerified:true,getIdToken:async()=> 'test-id'});};
  w.fetch=async(url,options)=>{requests.push({url,options});return fetchResponse(url,options);};
  w.eval(fs.readFileSync(path.join(__dirname,'../../assets/js/research-service.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'../../assets/js/quant/engine.js'),'utf8'));w.URL.createObjectURL=()=>'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};w.eval(source);
  return {dom,w,requests,change:uid=>change(uid?{uid,emailVerified:true,getIdToken:async()=> 'test-id'}:null)};
}
function assertUnavailable(f){const d=f.w.document;assert.equal(d.getElementById('edgePrivateControls').hidden,true);assert([...d.querySelectorAll('#edge-settings input,#edge-settings button')].every(c=>c.disabled));assert.equal(d.getElementById('edgeRawToken').value,'');assert.equal(d.getElementById('edgeTokenOnce').hidden,true);assert.equal(d.getElementById('existing-setting').disabled,false);assert.equal(d.getElementById('other-section').textContent,'Existing account section');}
for(const [name,response] of [
  ['missing route',()=>({ok:false,status:404,headers:{get:()=> 'text/html'},json:async()=>{throw new SyntaxError('Unexpected token <');}})],
  ['static HTML fallback',()=>({ok:true,status:200,headers:{get:()=> 'text/html'},json:async()=>{throw new SyntaxError('Unexpected token <');}})],
  ['invalid JSON',()=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>{throw new SyntaxError('Internal parse details');}})],
  ['wrong JSON envelope',()=>json({})],
])test(`Edge Profile handles ${name} without exposing active private forms`,async()=>{
  const f=fixture(response);try{
    await waitFor(()=>f.w.document.getElementById('edgeProfileStatus')?.textContent.includes('not enabled'));
    assertUnavailable(f);assert.doesNotMatch(f.w.document.getElementById('edgeProfileStatus').textContent,/Unexpected token|parse details/);
    const before=f.requests.length;f.w.document.getElementById('edgeCreateToken').dispatchEvent(new f.w.Event('submit',{cancelable:true}));f.w.document.getElementById('edgePreferences').dispatchEvent(new f.w.Event('submit',{cancelable:true}));
    await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.requests.length,before);
  }finally{f.dom.window.close();}
});
test('Edge Profile waits for all valid reads before enabling controls and hides them on sign-out',async()=>{
  let release;const pending=new Promise(resolve=>release=resolve);const f=fixture(async url=>{if(url.endsWith('/notifications'))await pending;return normal(url);});
  try{await waitFor(()=>f.requests.length===4);assertUnavailable(f);release();await waitFor(()=>!f.w.document.getElementById('edgePrivateControls').hidden);assert([...f.w.document.querySelectorAll('#edge-settings input,#edge-settings button')].every(c=>!c.disabled));await f.change(null);assertUnavailable(f);}finally{release();f.dom.window.close();}
});
test('a service outage during mutation clears a displayed token and disables private controls',async()=>{
  const f=fixture((url,options)=>{if(options.method==='POST'&&url.endsWith('/tokens'))return json({token:'test-only-one-time-token'},201);if(options.method==='POST')throw new TypeError('Network diagnostic must not be shown');return normal(url);});
  try{const d=f.w.document;await waitFor(()=>d.getElementById('edgePrivateControls')?.hidden===false);d.getElementById('edgeCreateToken').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await waitFor(()=>d.getElementById('edgeRawToken').value==='test-only-one-time-token');d.getElementById('edgePreferences').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await waitFor(()=>d.getElementById('edgeProfileStatus').textContent.includes('temporarily unavailable'));assertUnavailable(f);assert.doesNotMatch(d.getElementById('edgeProfileStatus').textContent,/Network diagnostic/);}finally{f.dom.window.close();}
});
