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

test('Pro analysis clears an old paid result when a numeric input changes',async()=>{
 const h=await load({user:true,tier:'starter',query:'?tool=risk',handler:data=>data.action==='run'?{result:{positionUnits:321}}:undefined});
 h.document.getElementById('toolForm').onsubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.document.getElementById('result').textContent,/321/);
 const field=h.document.getElementById('tool-balance');
 field.value='25000';
 field.dispatchEvent(new h.document.defaultView.Event('input',{bubbles:true}));
 assert.match(h.document.getElementById('result').textContent,/Inputs changed/);
 assert.doesNotMatch(h.document.getElementById('result').textContent,/321/);
 assert.match(h.document.getElementById('status').textContent,/Run analysis again/);
 h.close();
});
test('Pro analysis rejects a late result when a field changes during a request',async()=>{
 let finish;
 const h=await load({user:true,tier:'starter',query:'?tool=risk',handler:data=>data.action==='run'?new Promise(resolve=>{finish=resolve;}):undefined});
 h.document.getElementById('toolForm').onsubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(typeof finish,'function');
 const field=h.document.getElementById('tool-riskPct');
 field.value='2';
 field.dispatchEvent(new h.document.defaultView.Event('input',{bubbles:true}));
 finish({result:{positionUnits:999}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.doesNotMatch(h.document.getElementById('result').textContent,/999/);
 assert.match(h.document.getElementById('status').textContent,/changed while the analysis ran/);
 h.close();
});
test('Pro analysis invalidates old output when a checklist answer changes',async()=>{
 const h=await load({user:true,tier:'starter',query:'?tool=review',handler:data=>data.action==='run'?{result:{completed:['Entry plan defined']}}:undefined});
 h.document.getElementById('toolForm').onsubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.document.getElementById('result').textContent,/Entry plan defined/);
 const checkbox=h.document.getElementById('tool-plan');
 checkbox.checked=true;
 checkbox.dispatchEvent(new h.document.defaultView.Event('change',{bubbles:true}));
 assert.match(h.document.getElementById('result').textContent,/Inputs changed/);
 assert.doesNotMatch(h.document.getElementById('result').textContent,/Entry plan defined/);
 h.close();
});

test('paid saved workspaces can be searched by name or product without backend requests',async()=>{
 const items=[
  {id:'s1',name:'London EURUSD setup',product:'risk',input:{},result:{}},
  {id:'s2',name:'Bitcoin review',product:'review',input:{},result:{}},
  {id:'s3',name:'Weekly scan',product:'watchlist',input:{},result:{}}
 ];
 const h=await load({user:true,tier:'pro',handler:data=>data.action==='list'?{items,limit:500}:undefined});
 const search=h.document.getElementById('savedSearch');
 const entries=()=>[...h.document.querySelectorAll('#savedItems article')];
 const type=query=>{search.value=query;search.dispatchEvent(new h.document.defaultView.Event('input',{bubbles:true}));};
 assert.equal(h.document.getElementById('savedSearchControls').hidden,false);
 assert.equal(entries().length,3);
 type(' eurusd ');
 assert.deepEqual(entries().map(entry=>entry.hidden),[false,true,true]);
 assert.match(h.document.getElementById('savedSearchCount').textContent,/1 of 3/);
 type('RESEARCH WATCHLISTS');
 assert.deepEqual(entries().map(entry=>entry.hidden),[true,true,false],'product titles are searchable');
 type('not in any record');
 assert.ok(entries().every(entry=>entry.hidden));
 assert.match(h.document.getElementById('savedSearchCount').textContent,/0 of 3/);
 type('');
 assert.ok(entries().every(entry=>!entry.hidden));
 assert.equal(h.calls.filter(call=>call.action==='list').length,1,'filtering must stay client side');
 assert.equal(h.calls.filter(call=>call.action==='run'||call.action==='save').length,0);
 h.close();
});

test('Pro saved search survives deletion refresh but clears on account sign-out',async()=>{
 let items=[
  {id:'s1',name:'Portfolio review',product:'portfolio',input:{},result:{}},
  {id:'s2',name:'Risk review',product:'risk',input:{},result:{}}
 ];
 const h=await load({user:true,tier:'pro',handler:data=>{
  if(data.action==='list')return {items,limit:500};
  if(data.action==='delete'){items=items.filter(item=>item.id!==data.id);return {deleted:true};}
 }});
 const search=h.document.getElementById('savedSearch');
 search.value='portfolio';search.dispatchEvent(new h.document.defaultView.Event('input',{bubbles:true}));
 const portfolio=[...h.document.querySelectorAll('#savedItems article')].find(row=>!row.hidden);
 const [,remove,confirmDelete]=portfolio.querySelectorAll('button');
 remove.onclick();await confirmDelete.onclick();
 assert.equal(search.value,'portfolio','refresh should preserve the active filter for the same account');
 assert.equal(h.document.querySelectorAll('#savedItems article').length,1);
 assert.equal(h.document.querySelector('#savedItems article').hidden,true);
 assert.match(h.document.getElementById('savedSearchCount').textContent,/0 of 1/);
 await h.changeUser(null);
 assert.equal(h.document.getElementById('savedSearchControls').hidden,true);
 assert.equal(search.value,'','account-specific search must clear when a user signs out');
 assert.equal(h.document.querySelectorAll('#savedItems article').length,0);
 h.close();
});

test('saved Pro workspaces require explicit deletion confirmation',async()=>{
 let deleted=false;
 const item={id:'risk-saved-1',name:'Risk review',product:'risk',input:{balance:'10000'},result:{positionUnits:25}};
 const h=await load({user:true,tier:'starter',handler:data=>{
  if(data.action==='list')return {items:deleted?[]:[item],limit:25};
  if(data.action==='delete'){deleted=true;return {deleted:true};}
 }});
 const entry=h.document.querySelector('#savedItems article');
 const buttons=entry.querySelectorAll('button');
 assert.equal(buttons.length,4);
 const [,remove,confirmDelete,cancelDelete]=buttons;
 assert.equal(confirmDelete.hidden,true);
 remove.onclick();
 assert.equal(h.calls.filter(c=>c.action==='delete').length,0,'initial click must never delete');
 assert.equal(remove.disabled,true);
 assert.equal(confirmDelete.hidden,false);
 assert.equal(cancelDelete.hidden,false);
 assert.match(h.document.getElementById('status').textContent,/cannot be undone/);
 cancelDelete.onclick();
 assert.equal(remove.disabled,false);
 assert.equal(confirmDelete.hidden,true);
 assert.equal(cancelDelete.hidden,true);
 assert.equal(h.calls.filter(c=>c.action==='delete').length,0,'cancel must preserve data');
 remove.onclick();
 await confirmDelete.onclick();
 assert.equal(h.calls.filter(c=>c.action==='delete').length,1,'only explicit confirmation deletes');
 assert.match(h.document.getElementById('savedItems').textContent,/0 \/ 25 saved/);
 h.close();
});
test('a failed confirmed delete keeps the saved workspace visible',async()=>{
 const item={id:'risk-saved-2',name:'Saved analysis',product:'risk',input:{balance:'10000'},result:{positionUnits:30}};
 const h=await load({user:true,tier:'starter',handler:data=>{
  if(data.action==='list')return {items:[item],limit:25};
  if(data.action==='delete')throw Error('Deletion failed on server');
 }});
 const [,remove,confirmDelete]=h.document.querySelector('#savedItems article').querySelectorAll('button');
 remove.onclick();
 await confirmDelete.onclick();
 assert.match(h.document.getElementById('status').textContent,/Deletion failed on server/);
 assert.match(h.document.getElementById('savedItems').textContent,/Saved analysis/);
 assert.equal(h.calls.filter(c=>c.action==='delete').length,1);
 h.close();
});

test('pending Pro deletion remains protected and keyboard-operable after a failed request',async()=>{
 const item={id:'risk-saved-confirm-3',name:'Risk strategy',product:'risk',input:{balance:'10000'},result:{positionUnits:30}};
 const h=await load({user:true,tier:'starter',handler:data=>{
  if(data.action==='list')return {items:[item],limit:25};
  if(data.action==='delete')throw Error('Temporary delete outage');
 }});
 const [,remove,confirmDelete,cancelDelete]=h.document.querySelector('#savedItems article').querySelectorAll('button');
 remove.focus();
 remove.onclick();
 assert.equal(h.document.activeElement,confirmDelete,'focus should move off the disabled Delete button');
 await confirmDelete.onclick();
 assert.match(h.document.getElementById('status').textContent,/Temporary delete outage/);
 assert.equal(remove.disabled,true,'a failed request must not re-enable Delete while confirmation is visible');
 assert.equal(confirmDelete.hidden,false);
 assert.equal(cancelDelete.hidden,false);
 assert.match(h.document.getElementById('savedItems').textContent,/Risk strategy/);
 cancelDelete.onclick();
 assert.equal(remove.disabled,false);
 assert.equal(h.document.activeElement,remove,'Cancel should restore focus to Delete');
 assert.equal(h.calls.filter(c=>c.action==='delete').length,1);
 h.close();
});

test('Pro journal CSV URL is released when the customer switches tools',async()=>{
 const {resolveObjectURL}=require('node:buffer');
 const h=await load({user:true,tier:'starter',query:'?tool=export',handler:data=>data.action==='run'?{result:{csv:'date,pnl\\n2026-11-20,42',rows:1}}:undefined});
 h.document.getElementById('toolForm').onsubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 const link=h.document.querySelector('#result a[download="fynx-journal.csv"]');
 assert.ok(link,'export should provide the existing download link');
 const download=link.href;
 assert.ok(resolveObjectURL(download),'temporary CSV should exist before changing tools');
 h.document.querySelector('#productCards button[data-key="risk"]').onclick();
 assert.equal(resolveObjectURL(download),undefined,'changing tools should release the previous export');
 assert.doesNotMatch(h.document.getElementById('result').textContent,/Download/);
 h.close();
});

test('Pro journal CSV URL is released when a member signs out',async()=>{
 const {resolveObjectURL}=require('node:buffer');
 const h=await load({user:true,tier:'starter',query:'?tool=export',handler:data=>data.action==='run'?{result:{csv:'date,pnl\\n2026-11-20,10',rows:1}}:undefined});
 h.document.getElementById('toolForm').onsubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 const download=h.document.querySelector('#result a[download]').href;
 assert.ok(resolveObjectURL(download));
 await h.changeUser(null);
 assert.equal(resolveObjectURL(download),undefined,'sign-out should release the account CSV');
 assert.equal(h.document.querySelector('#result a[download]'),null);
 h.close();
});

test('Pro journal CSV URL is released when a new export replaces it or the page closes',async()=>{
 const {resolveObjectURL}=require('node:buffer');
 let count=0;
 const h=await load({user:true,tier:'starter',query:'?tool=export',handler:data=>data.action==='run'?{result:{csv:'record,pnl\\n'+(++count)+',20',rows:1}}:undefined});
 const run=async()=>{h.document.getElementById('toolForm').onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));return h.document.querySelector('#result a[download]').href;};
 const first=await run();
 assert.ok(resolveObjectURL(first));
 const second=await run();
 assert.notEqual(first,second);
 assert.equal(resolveObjectURL(first),undefined,'superseded export should be released');
 assert.ok(resolveObjectURL(second),'latest download remains available');
 h.document.defaultView.dispatchEvent(new h.document.defaultView.Event('pagehide'));
 assert.equal(resolveObjectURL(second),undefined,'leaving the page should release the latest CSV');
 h.close();
});


test('unsaved Pro notes, checklist answers and risk inputs survive switching tools',async()=>{
 const h=await load({user:true,tier:'starter',query:'?tool=review'});
 const notes=h.document.getElementById('tool-notes'),check=h.document.getElementById('tool-plan');
 notes.value='Review the downside before entry';notes.dispatchEvent(new h.document.defaultView.Event('input',{bubbles:true}));
 check.checked=true;check.dispatchEvent(new h.document.defaultView.Event('change',{bubbles:true}));
 h.document.querySelector('#productCards button[data-key="risk"]').onclick();
 const balance=h.document.getElementById('tool-balance');balance.value='27500';balance.dispatchEvent(new h.document.defaultView.Event('input',{bubbles:true}));
 h.document.querySelector('#productCards button[data-key="review"]').onclick();
 assert.equal(h.document.getElementById('tool-notes').value,'Review the downside before entry');
 assert.equal(h.document.getElementById('tool-plan').checked,true);
 h.document.querySelector('#productCards button[data-key="risk"]').onclick();
 assert.equal(h.document.getElementById('tool-balance').value,'27500');
 assert.equal(h.calls.filter(c=>c.action==='save'||c.action==='run').length,0,'switching tools must not submit or persist drafts');
 h.close();
});

test('unsaved Pro drafts are cleared on account change',async()=>{
 const h=await load({user:true,tier:'starter',query:'?tool=review'});
 h.document.getElementById('tool-notes').value='Private trading note';
 h.document.querySelector('#productCards button[data-key="risk"]').onclick();
 await h.changeUser(null);
 await h.changeUser({uid:'different-account'});
 h.document.querySelector('#productCards button[data-key="review"]').onclick();
 assert.equal(h.document.getElementById('tool-notes').value,'','previous account drafts must not appear for a new account');
 h.close();
});

test('paid scenario results expose a caption, column headers, and body rows for assistive technology',async()=>{
 const h=await load({user:true,tier:'starter',query:'?tool=scenarios',handler:data=>data.action==='run'?{result:{scenarios:[{case:'Downside',pnl:-200},{case:'Upside',pnl:400}]}}:undefined});
 h.document.getElementById('toolForm').onsubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 const table=h.document.querySelector('#result table');
 assert.ok(table,'scenario calculation should produce a results table');
 assert.equal(table.querySelector('caption')?.textContent,'Scenario comparison results');
 assert.deepEqual([...table.querySelectorAll('thead th')].map(th=>th.scope),['col','col']);
 assert.equal(table.querySelectorAll('tbody tr').length,2);
 assert.match(table.querySelector('tbody').textContent,/Downside/);
 h.close();
});

test('paid journal analytics rows are presented as a labelled data table',async()=>{
 const h=await load({user:true,tier:'starter',query:'?tool=analytics',handler:data=>data.action==='run'?{result:{rows:[{date:'2026-11-20',pnl:100}]}}:undefined});
 h.document.getElementById('toolForm').onsubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 const table=h.document.querySelector('#result table');
 assert.ok(table,'journal analytics should render its returned rows');
 assert.equal(table.querySelector('caption')?.textContent,'Journal analysis results');
 assert.equal(table.querySelector('thead th')?.getAttribute('scope'),'col');
 assert.equal(table.querySelector('tbody tr td')?.textContent,'2026-11-20');
 h.close();
});

test('saved results from higher tiers remain listed but cannot be opened on a lower plan',async()=>{
 const old={id:'saved-plus',name:'Private stress test',product:'portfolio',input:{balance:'10000'},result:{grossExposure:987654}};
 let tier='pro';
 const h=await load({user:true,query:'?tool=risk',handler:data=>{
  if(data.action==='status')return {tier,plans:PLANS,hasBillingAccount:true};
  if(data.action==='list')return {items:[old],limit:PLANS[tier].saved};
 }});
 const first=h.document.querySelector('#savedItems article button');
 assert.equal(first.disabled,false,'Professional members can open a saved Plus analysis');
 tier='starter';
 await h.document.getElementById('loadSaved').onclick();
 const entry=h.document.querySelector('#savedItems article'),[open,remove]=entry.querySelectorAll('button');
 assert.equal(open.disabled,true,'downgraded members cannot open a higher-tier result');
 assert.match(entry.textContent,/Plus membership required/);
 assert.equal(remove.disabled,false,'downgraded customers may still delete their own record');
 open.onclick();
 assert.equal(h.document.getElementById('toolTitle').textContent,'Position risk planner');
 assert.doesNotMatch(h.document.getElementById('result').textContent,/987,654|987654/);
 assert.match(h.document.getElementById('status').textContent,/Upgrade to Plus/);
 assert.equal(h.calls.filter(c=>c.action==='run'||c.action==='save'||c.action==='delete').length,0);
 h.close();
});

test('legacy saved Pro tools cannot replace the active analysis',async()=>{
 const legacy={id:'old-1',name:'Archived model',product:'retired-product',input:{},result:{positionUnits:999}};
 const h=await load({user:true,tier:'pro',query:'?tool=risk',handler:data=>data.action==='list'?{items:[legacy],limit:500}:undefined});
 const entry=h.document.querySelector('#savedItems article');
 const [open,remove]=entry.querySelectorAll('button');
 assert.equal(open.disabled,true,'unsupported saved tool must not be opened');
 assert.match(entry.textContent,/no longer available/);
 assert.equal(remove.disabled,false,'legacy records must remain deletable');
 open.onclick();
 assert.equal(h.document.getElementById('toolTitle').textContent,'Position risk planner');
 assert.doesNotMatch(h.document.getElementById('result').textContent,/999/);
 assert.equal(h.calls.filter(c=>c.action==='delete'||c.action==='run').length,0);
 h.close();
});


test('membership refresh removes previously rendered paid results after access is revoked',async()=>{
 let tier='starter';
 const h=await load({user:true,query:'?tool=risk',handler:data=>{
  if(data.action==='status')return {tier,plans:PLANS,hasBillingAccount:true};
  if(data.action==='run')return {result:{positionUnits:987654}};
 }});
 h.document.getElementById('toolForm').onsubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.document.getElementById('result').textContent,/987,654|987654/);
 tier=null;
 await h.document.getElementById('loadSaved').onclick();
 assert.doesNotMatch(h.document.getElementById('result').textContent,/987,654|987654/);
 assert.match(h.document.getElementById('result').textContent,/Membership access changed/);
 assert.doesNotMatch(h.document.getElementById('accessMessage').textContent,/Included in your membership/);
 h.close();
});
