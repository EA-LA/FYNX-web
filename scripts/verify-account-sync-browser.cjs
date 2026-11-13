'use strict';
// Called by the disposable-account orchestrator. Credentials stay in memory;
// never enable tracing/video or print Playwright errors that contain call arguments.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
module.exports=async function runBrowserQA({email,password,uid,runID,phase='before',baseURL='https://www.fynxfinanceworld.com',previewURL='http://127.0.0.1:8766'}){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});const steps=[];
 try{
  // Serve the reviewable local build under the registered production origin.
  // Firebase and reCAPTCHA requests still reach their real services unchanged.
  if(previewURL)await page.route(new URL(baseURL).origin+'/**',async route=>{const requested=new URL(route.request().url());const response=await page.request.get(new URL(requested.pathname+requested.search,previewURL).href);await route.fulfill({response});});
  await page.goto(baseURL+'/workspace.html',{waitUntil:'domcontentloaded'});
  await page.evaluate(async credentials=>{const [{auth},{signInWithEmailAndPassword}]=await Promise.all([import('/auth/firebase.js'),import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')]);await signInWithEmailAndPassword(auth,credentials.email,credentials.password);},{email,password});
  await page.waitForFunction(expected=>window.FynxAccountSync?.sync.uid===expected&&window.FynxAccountSync.sync.ready&&window.FynxAccountSync.sync.status==='synced',uid,{timeout:60000});steps.push('signed-in-actual-browser-client');
  // Fresh snapshots give visible UI targets; mutations below use only actual forms.
  await page.getByRole('button',{name:'Research notes',exact:true}).click();
  const note=page.locator('#workspace-list article').filter({has:page.getByRole('heading',{name:'Web QA note '+runID,exact:true})});await note.waitFor({state:'visible'});
  if(phase==='before'){
   await note.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Next check',{exact:true}).fill('Browser UI check '+runID);await page.getByRole('button',{name:'Save to my account',exact:true}).click();await page.locator('#workspace-editor').waitFor({state:'hidden'});await page.waitForFunction(({id,expected})=>window.FynxAccountSync.sync.record('researchNotes',id)?.data.nextCheck===expected&&window.FynxAccountSync.sync.status==='synced',{id:'web-note-'+runID,expected:'Browser UI check '+runID},{timeout:30000});steps.push('browser-ui-note-edit-acknowledged');
   const market=page.getByRole('region',{name:'Market Intelligence',exact:true});await page.waitForFunction(()=>document.querySelector('[data-intelligence-status]')?.textContent.includes('Market workspace up to date'),null,{timeout:45000});steps.push('native-market-service-loaded-in-browser');
   await market.getByRole('combobox',{name:'Add a market',exact:true}).selectOption('AAPL');await market.getByRole('button',{name:'Add market',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-intelligence-status]')?.textContent==='Your market workspace is saved across devices.',null,{timeout:30000});assert((await market.innerText()).includes('Apple · AAPL'));await market.getByRole('button',{name:'Remove',exact:true}).click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('#intelligence-workspace strong')).some(e=>e.textContent.includes('Apple · AAPL')),null,{timeout:30000});steps.push('native-market-watchlist-roundtrip-through-browser-ui');
  }else{
   assert((await note.innerText()).includes('native evidence '+runID));assert((await note.innerText()).includes('Browser UI check '+runID));steps.push('native-note-edit-visible-with-web-field-preserved');
   await page.getByRole('button',{name:'Portfolios',exact:true}).click();const portfolio=page.locator('#workspace-list article').filter({has:page.getByRole('heading',{name:'Web QA portfolio '+runID,exact:true})});assert((await portfolio.innerText()).includes('42'));steps.push('native-portfolio-edit-visible');
   const values=await page.evaluate(()=>({currency:window.FynxAccountSync.accountData('preferences')?.currency,profile:window.FynxAccountSync.accountData('profile')?.displayName,stories:window.FynxAccountSync.sync.records('readingRecords').map(r=>({title:r.data.title,saved:r.data.saved}))}));assert.equal(values.currency,'GBP');assert.equal(values.profile,'Native QA '+runID);assert(values.stories.some(r=>r.title==='Web QA story '+runID&&r.saved===false));steps.push('native-profile-preferences-and-bookmark-edits-visible');
  }
  // Sign-out must clear the private rendered content without a page reload.
  await page.evaluate(async()=>{const [{auth},{signOut}]=await Promise.all([import('/auth/firebase.js'),import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')]);await signOut(auth);});await page.waitForFunction(()=>window.FynxAccountSync?.sync.uid===null);assert(!(await page.locator('#workspace-list').innerText()).includes(runID));steps.push('sign-out-clears-private-ui');
  return {phase,passed:true,steps};
 }catch{throw Object.assign(new Error('Actual browser account-sync verification failed'),{code:'browser-sync-qa-failed'});}finally{await browser.close();}
};
