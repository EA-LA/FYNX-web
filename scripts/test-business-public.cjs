const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 for(const [id,reply,code,text] of [['bad',{},200,'invalid'],['FYNX-1234ABCD',{error:'This profile is private or has not been published.'},404,'private'],['FYNX-1234ABCD',{id:'FYNX-1234ABCD',username:'<img src=x onerror=alert(1)>',notice:'No published statistics'},200,'chosen']]){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'shared-profile.html'),'utf8'),{url:'https://www.fynxfinanceworld.com/shared-profile.html?id='+id,runScripts:'outside-only'});let requests=0;
  dom.window.fetch=async()=>{requests++;return {ok:code===200,status:code,json:async()=>reply}};dom.window.AbortController=AbortController;
  dom.window.eval(fs.readFileSync(path.join(root,'assets/js/shared-profile.js'),'utf8'));await tick();
  assert.match(dom.window.document.getElementById('profile-status').textContent,new RegExp(text));
  assert.equal(requests,id==='bad'?0:1);assert.equal(dom.window.document.getElementById('open-profile').hidden,code!==200||id==='bad');
  assert.equal(dom.window.document.querySelectorAll('img').length,0,'untrusted names are plain text');dom.window.close();
 }
 for(const outcome of ['accepted','denied','network']){
  const html='<div id="formView"><form id="waitlistForm"><input name="fullName" value="Example Trader"><input name="email" value="test@example.invalid"><input name="consent" type="checkbox" checked><button id="submitBtn">Join</button><div id="message"></div></form></div><div id="successView" hidden></div>';
  const dom=new JSDOM(html,{url:'https://ea-la.github.io/fynx-finance-world/waitlist.html',runScripts:'outside-only'});dom.window.AbortController=AbortController;let sent;
  dom.window.fetch=async(_,options)=>{sent=JSON.parse(options.body);if(outcome==='network')throw Error('Connection failed');return {ok:outcome==='accepted',json:async()=>outcome==='accepted'?{accepted:true}:{error:'Please wait before trying again.'}};};
  dom.window.eval(fs.readFileSync(path.join(root,'assets/js/public-waitlist.js'),'utf8'));dom.window.document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await tick();
  assert.equal(sent.email,'test@example.invalid');assert.equal(sent.consent,true);
  assert.equal(dom.window.document.getElementById('successView').hidden,outcome!=='accepted');assert.equal(dom.window.document.getElementById('submitBtn').disabled,false);
  if(outcome!=='accepted')assert(dom.window.document.getElementById('message').textContent.length>0);dom.window.close();
 }
 console.log('PASS: invalid/private/published profile, safe names, signup success, retryable failure, network failure');
})().catch(e=>{console.error(e);process.exitCode=1});
