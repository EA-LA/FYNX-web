const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const catalog=require('../assets/js/pro-catalog.js'),core=require('../backend/consumer-core.cjs');
const source=fs.readFileSync('assets/js/pro-workspace.js','utf8').replaceAll('import(', 'loadTestModule(');
async function setup(key,{tier=null,signedIn=false,blocked=false}={}){
 const dom=new JSDOM(fs.readFileSync('pro.html','utf8'),{url:'https://www.fynxfinanceworld.com/pro.html?tool='+key+'#workbench',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.FynxProCatalog=catalog;w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.loadTestModule=async url=>{
  if(blocked)throw Error('SDK unavailable');
  if(url.includes('firebase-auth'))return {onAuthStateChanged:(_,fn)=>fn(signedIn?{uid:'test-owner'}:null)};
  if(url.includes('firebase-functions'))return {getFunctions:()=>({}),httpsCallable:()=>async request=>{calls.push(request);if(request.action==='status')return {data:{tier,plans:core.PLANS}};if(request.action==='list')return {data:{items:[],limit:25}};if(request.action==='run')return {data:{result:core.run(request.product,request.input)}};throw Error('Unexpected action');}};
  return {app:{},auth:{},authPersistenceReady:Promise.resolve()};
 };
 await w.eval('(async()=>{'+source+'})()');await new Promise(r=>setTimeout(r,10));return {dom,w,calls,doc:w.document};
}
(async()=>{
 for(const [key,[name,,,url]] of Object.entries(catalog)){
  const {dom,doc,calls}=await setup(key,{blocked:true});
  assert.equal(doc.getElementById('toolTitle').textContent,name);
  assert.equal(doc.getElementById('toolGuide').getAttribute('href'),url);
  const target=new URL(doc.getElementById('signIn').href).searchParams.get('returnTo');assert.equal(target,'/pro.html?tool='+key+'#workbench');
  assert.match(doc.getElementById('status').textContent,/unavailable/);assert.equal(calls.length,0);
  assert.equal(doc.querySelectorAll('#productCards button[aria-pressed=true]').length,1);dom.window.close();
 }
 let context=await setup('__proto__');assert.equal(context.doc.getElementById('toolTitle').textContent,catalog.analytics[0]);context.dom.window.close();
 context=await setup('portfolio',{signedIn:true,tier:'starter'});context.doc.getElementById('toolForm').dispatchEvent(new context.w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,10));assert(!context.calls.some(x=>x.action==='run'),'Unentitled run must remain blocked');context.dom.window.close();
 context=await setup('risk',{signedIn:true,tier:'starter'});context.doc.getElementById('toolForm').dispatchEvent(new context.w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,10));assert.equal(context.calls.find(x=>x.action==='run').product,'risk');assert.match(context.doc.getElementById('result').textContent,/100/);
 context.doc.querySelector('[data-key=watchlist]').click();assert.equal(new URL(context.w.location.href).searchParams.get('tool'),'watchlist');assert.equal(new URL(context.doc.getElementById('toolGuide').href).pathname,catalog.watchlist[3]);context.dom.window.close();
 console.log('Pro routing: eight deep links, sign-in return paths, invalid key fallback, unavailable SDK and existing entitlement checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
