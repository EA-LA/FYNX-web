'use strict';
const {JSDOM}=require('jsdom'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('api/workspace.js','utf8').replace(/^import .*;\n/gm,'');
async function run(available){
 const dom=new JSDOM(fs.readFileSync('api/workspace.html','utf8'),{url:'https://example.com/api/workspace.html#billing',runScripts:'outside-only'}),w=dom.window,calls=[];
 const legal={available,version:'v1',bundle_sha256:'abc',documents:{terms:{url:'https://example.com/terms'}},refund_policy:'Refund policy',recurring_statement:'Monthly payment consent'};
 w.auth={currentUser:{uid:'test',email:'test@example.com'}};w.app={};w.authPersistenceReady=Promise.resolve();w.getFunctions=()=>({});w.onAuthStateChanged=()=>{};
 w.httpsCallable=(_,name)=>async data=>{calls.push({name,...data});return {data:data.action==='legalSummary'?legal:{accepted:true}};};
 await w.eval('(async()=>{'+source+'\nstate={limits:{plan:"free"},profile:{},billing_mode:"test"};render();})()');await new Promise(setImmediate);
 const form=w.document.querySelector('#legal-form');
 if(!available){assert.equal(form,null);assert.match(w.document.querySelector('#legal-acceptance').textContent,/waitlist/);}
 else{
  assert(form);for(const input of form.querySelectorAll('input'))assert.equal(input.checked,false);
  form.elements.terms.checked=true;form.elements.privacy.checked=true;
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(setImmediate);
  const saved=calls.find(c=>c.action==='acceptTerms');assert.equal(saved.terms_accepted,true);assert.equal(saved.recurring_consent,false);assert.equal(saved.bundle_sha256,'abc');assert.equal(calls.some(c=>c.action==='checkout'),false);
  assert.match(w.document.querySelector('#notice').textContent,/No subscription or payment/);
 }
 w.close();
}
(async()=>{await run(false);await run(true);console.log('Legal UI: unpublished release blocked; consent unchecked and explicit; saving does not purchase.');})().catch(e=>{console.error(e);process.exitCode=1;});
