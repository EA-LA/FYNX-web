'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const {PLANS}=require('../backend/consumer-core.cjs');
async function load(options={}){
 const dom=new JSDOM(fs.readFileSync('pro.html','utf8'),{url:'https://www.fynxfinanceworld.com/pro.html'+(options.query||'')}),calls=[];let currentUrl=new URL(dom.window.location.href),ready,authChanged,statusCalls=0;
 const location={get href(){return currentUrl.href;},set href(value){currentUrl=new URL(value,currentUrl);},get search(){return currentUrl.search;},get searchParams(){return currentUrl.searchParams;},get hostname(){return currentUrl.hostname;}};
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 if(options.newsDraft)dom.window.sessionStorage.setItem('fynx.news.researchDraft.v1',JSON.stringify(options.newsDraft));
 if(options.rememberedTool)dom.window.sessionStorage.setItem('fynxProCheckoutTool',options.rememberedTool);
 const modules={
  '../../auth/firebase.js':{app:{},auth:{},authPersistenceReady:Promise.resolve()},
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js':{onAuthStateChanged:(_,fn)=>{authChanged=fn;ready=fn(options.user?{uid:'owner'}:null);}},
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js':{getFunctions:()=>({}),httpsCallable:(_,name)=>{assert.equal(name,'consumerLiveWorkspace');return async data=>{
   calls.push(data);if(options.handler){const result=await options.handler(data);if(result!==undefined)return {data:result};}
   if(data.action==='status')return {data:{mode:'live',tier:options.statusTier?options.statusTier(++statusCalls):options.tier||null,hasBillingAccount:!!options.billing,billingUnavailable:!!options.unavailable,plans:PLANS}};
   if(data.action==='list')return {data:{items:[],limit:25}};
   return {data:{url:options.destination||'https://checkout.stripe.com/c/pay/qa'}};
  };}}
 };
 const context={document:dom.window.document,window:dom.window,location,history:{replaceState:(_,__,url)=>{location.href=String(url);}},sessionStorage:dom.window.sessionStorage,URL,URLSearchParams,Blob,console,setTimeout:fn=>{queueMicrotask(fn);return 1;},matchMedia:()=>({matches:true}),loadModule:path=>Promise.resolve(modules[path])};
 vm.runInNewContext(fs.readFileSync('assets/js/pro-catalog.js','utf8'),context);
 const source=fs.readFileSync('assets/js/pro-workspace.js','utf8').replace(/\bimport\(/g,'loadModule(');
 await vm.runInNewContext('(async()=>{'+source+'})()',context);await ready;
 return {document:dom.window.document,location,calls,changeUser:authChanged,close:()=>dom.window.close()};
}
test('all three membership buttons send guests to sign-in with the selected tool',async()=>{const h=await load({query:'?tool=risk'});assert.equal(h.document.querySelectorAll('[data-plan]').length,3);assert.equal(h.document.querySelectorAll('#productCards button').length,8);assert.doesNotMatch(h.document.body.textContent,/test plan|test mode|TEST CHECKOUT|no real charges/i);await h.document.querySelector('[data-plan="starter"]').onclick();assert.match(h.location.href,/auth\/login/);assert.match(h.location.search,/tool%3Drisk/);assert.equal(h.calls.length,0);h.close();});
test('member subscription sends selected tier and tool to live backend',async()=>{const h=await load({user:true,query:'?tool=portfolio'});await h.document.querySelector('[data-plan="plus"]').onclick();const request=h.calls.find(c=>c.action==='checkout');assert.equal(request.tier,'plus');assert.equal(request.tool,'portfolio');assert.equal(h.location.hostname,'checkout.stripe.com');h.close();});
test('paid membership renders access and payment management',async()=>{const h=await load({user:true,tier:'plus',billing:true});assert.match(h.document.getElementById('membershipTitle').textContent,/Plus membership/);assert.equal(h.document.getElementById('manageBilling').hidden,false);assert.match(h.document.getElementById('accessMessage').textContent,/Included/);h.close();});
test('failed payment retains billing management',async()=>{const h=await load({user:true,billing:true});assert.equal(h.document.getElementById('manageBilling').hidden,false);assert.match(h.document.getElementById('accessMessage').textContent,/monthly membership/);h.close();});
test('cancelled checkout explains the outcome and restores the chosen tool',async()=>{const h=await load({user:true,query:'?checkout=cancelled',rememberedTool:'simulation'});assert.equal(h.location.searchParams.get('tool'),'simulation');assert.match(h.document.getElementById('status').textContent,/without completing/);assert.equal(h.calls.filter(c=>c.action==='checkout').length,0);h.close();});
test('checkout return alone never grants access and offers a membership refresh',async()=>{const h=await load({user:true,billing:true,query:'?checkout=complete',statusTier:n=>n>4?'plus':null});assert.match(h.document.getElementById('status').textContent,/has not been confirmed/);assert.equal(h.calls.filter(c=>c.action==='status').length,4);assert.doesNotMatch(h.document.getElementById('membershipTitle').textContent,/Plus/);await h.document.getElementById('loadSaved').onclick();assert.match(h.document.getElementById('status').textContent,/Payment confirmed/);assert.match(h.document.getElementById('membershipTitle').textContent,/Plus membership/);h.close();});
test('temporary verification outage keeps payment recovery available and access locked',async()=>{const h=await load({user:true,billing:true,unavailable:true});assert.match(h.document.getElementById('membershipTitle').textContent,/unavailable/);assert.match(h.document.getElementById('status').textContent,/Manage subscription/);assert.equal(h.document.getElementById('manageBilling').hidden,false);assert.doesNotMatch(h.document.getElementById('accessMessage').textContent,/Included/);await h.document.getElementById('manageBilling').onclick();assert.equal(h.calls.at(-1).action,'portal');h.close();});
test('untrusted payment redirect is rejected',async()=>{const h=await load({user:true,destination:'https://checkout.stripe.com.attacker.invalid/pay'});await h.document.querySelector('[data-plan="starter"]').onclick();assert.equal(h.location.hostname,'www.fynxfinanceworld.com');assert.match(h.document.getElementById('status').textContent,/Invalid checkout destination/);h.close();});
test('late membership response cannot repopulate an account after sign-out',async()=>{let deferred=false,resolveStatus;const h=await load({user:true,tier:'plus',billing:true,handler:data=>{if(deferred&&data.action==='status')return new Promise(resolve=>{resolveStatus=resolve;});}});deferred=true;const pending=h.changeUser({uid:'other'});await Promise.resolve();await h.changeUser(null);resolveStatus({tier:'pro',hasBillingAccount:true,plans:PLANS});await pending;assert.equal(h.document.getElementById('membershipTitle').textContent,'Free to explore');assert.equal(h.document.getElementById('manageBilling').hidden,true);assert.doesNotMatch(h.document.getElementById('savedItems').textContent,/saved$/);h.close();});


test('checkout workspace offers an account-bound return to a news research draft',async()=>{
 const draft={article:{title:'Research'},notes:'Private note',ownerUid:null,claimOnSignIn:true,createdAt:Date.now(),returnPath:'/news.html'};
 const h=await load({user:true,query:'?tool=watchlist&from=news',newsDraft:draft});
 assert.match(h.document.getElementById('newsDraftReturn').textContent,/Return to your research note/);
 assert.match(h.document.querySelector('#newsDraftReturn a').href,/news.html\?resumeResearch=1$/);
 assert.doesNotMatch(h.document.body.textContent,/Private note/);
 await h.changeUser({uid:'other'});assert.equal(h.document.getElementById('newsDraftReturn'),null);h.close();
});
test('expired and cross-account drafts never appear in the payment workspace',async()=>{
 for(const draft of [{ownerUid:'other',createdAt:Date.now(),returnPath:'/news.html'},{ownerUid:'owner',createdAt:Date.now()-8000000,returnPath:'/news.html'},{ownerUid:'owner',createdAt:Date.now(),returnPath:'https://evil.invalid'}]){
  const h=await load({user:true,newsDraft:draft});assert.equal(h.document.getElementById('newsDraftReturn'),null);h.close();
 }
});
