const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const dom=new JSDOM('<main><div class="lesson-cards"><article class="lesson-card"><div class="lesson-body"></div></article></div></main>',{url:'https://example.com/learn/forex-howto.html',runScripts:'outside-only'}),w=dom.window;w.document.body.dataset.learningTopic='forex';
 let authChanged,fail=false,pendingA,reads=0;const saved=[],records=new Map([['learning-forex',{lessons:{'outline-1':{completed:true}},attempts:[]}]]);
 w.auth={currentUser:{uid:'A'}};w.sync={uid:'A',ready:true};w.onAuthStateChanged=(_,cb)=>authChanged=cb;w.subscribe=fn=>{};
 w.accountData=(domain,id)=>records.get(id);w.requireSync=async uid=>{if(++reads===1)return new Promise(resolve=>pendingA=resolve);assert.equal(uid,w.auth.currentUser.uid);};w.cloudCall=async()=>({lessons:{},attempts:[]});
 w.saveShared=async(domain,id,data)=>{if(fail)throw Error('offline');saved.push({domain,id,data});records.set(id,{...(records.get(id)||{}),...data});};
 w.eval(fs.readFileSync('assets/js/cloud-learning.js','utf8').replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g,''));
 authChanged({uid:'A'});w.auth.currentUser={uid:'B'};authChanged({uid:'B'});await tick();pendingA();await tick();assert(!w.document.getElementById('learningHistory').textContent.includes('99'));
 const button=w.document.querySelector('[data-lesson]');assert.equal(button.getAttribute('aria-pressed'),'true');fail=true;button.click();await tick();assert.match(w.document.getElementById('learningSyncStatus').textContent,/not confirmed/);fail=false;[...w.document.querySelectorAll('button')].find(x=>x.textContent==='Retry sync').click();await tick();await tick();assert.equal(saved[0].data.lessons['outline-1'].completed,false);
 w.dispatchEvent(new w.CustomEvent('fynx:quiz-started',{detail:{attempt:'quiz-1'}}));w.dispatchEvent(new w.CustomEvent('fynx:quiz-completed',{detail:{attempt:'quiz-1',topic:'stocks',correct:8,total:10}}));await tick();await tick();assert.equal(saved.at(-1).data.topic,'stocks');assert.match(w.document.getElementById('learningHistory').textContent,/8\/10/);
 w.auth.currentUser=null;authChanged(null);assert.equal(w.document.getElementById('learningHistory').textContent,'');assert.equal(button.disabled,true);dom.window.close();console.log('Learning UI: stale account reads ignored, failed save retry, subject-specific quiz history and signout cleanup passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
