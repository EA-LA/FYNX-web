const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const strip=source=>source.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g,'').replace(/export /g,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const helpers=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('assets/js/safe-content.js','utf8')).toString('base64'));
 const url=value=>helpers.safeNotificationUrl(value,'https://example.com/notifications.html');
 for(const bad of ['javascript:alert(1)','data:text/html,test','vbscript:test'])assert.equal(url(bad),'');
 assert.equal(url('profile.html'),'https://example.com/profile.html');
 for(const bad of ['http://publisher.example.com/report','http://127.0.0.1:4000/admin','https://alice:secret@publisher.example.com/report','//alice:secret@publisher.example.com/report'])assert.equal(url(bad),'');
 assert.equal(url('https://publisher.example.com/report'),'https://publisher.example.com/report');
 assert.equal(url('/news/article.html?id=example'),'https://example.com/news/article.html?id=example');
 assert.equal(helpers.safeNotificationUrl('notifications.html','http://localhost:5173/home.html'),'http://localhost:5173/notifications.html');
 assert.equal(helpers.safeNotificationUrl('http://publisher.example.com/report','http://localhost:5173/home.html'),'');
 const hostile='<img src=x onerror="window.injected=true">';
 const item={id:'quote"id',title:hostile,message:hostile,source:hostile,category:'market_news',sourceUrl:'javascript:alert(1)',timestamp:Date.now(),read:false};
 const bell=new JSDOM('<div class="top-bar"><div class="top-bar-right"><button class="icon-btn" title="Notifications"></button></div></div>',{url:'https://example.com/home.html',runScripts:'outside-only'}),w=bell.window;
 let onAuth, failRead=false;
 Object.assign(w,{safeNotificationUrl:url,auth:{currentUser:{uid:'A'}},bootstrapAccount:async()=>{if(failRead)throw Error('offline');},listenNotifications:(_,callback)=>{callback([item]);return()=>{};},countUnread:rows=>rows.filter(r=>!r.read).length,markNotificationRead:async()=>{throw Error('offline');},onAuthStateChanged:(_,callback)=>onAuth=callback});
 w.eval(strip(fs.readFileSync('assets/js/account-ui.js','utf8')));await w.mountNotificationBell();await onAuth({uid:'A'});
 assert.equal(w.document.querySelectorAll('#bellList img').length,0);assert.equal(w.document.querySelector('#bellList strong').textContent,hostile);assert.equal(w.document.querySelector('.bell-item').dataset.link,'https://example.com/notifications.html');
 const trigger=w.document.querySelector('.top-bar-right .icon-btn[title="Notifications"]');
 assert.equal(trigger.getAttribute('aria-expanded'),'false');
 trigger.click();
 const dropdown=w.document.getElementById('fynx-notification-dropdown');
 assert(dropdown.classList.contains('open'));
 assert.equal(trigger.getAttribute('aria-controls'),dropdown.id);
 assert.equal(trigger.getAttribute('aria-expanded'),'true');
 const alertRow=w.document.querySelector('.bell-item[data-id]');
 assert.equal(alertRow.getAttribute('role'),'button');
 assert.equal(alertRow.tabIndex,0);
 assert.match(alertRow.getAttribute('aria-label'),/Unread notification:/);
 assert.equal(w.document.activeElement,alertRow);
 alertRow.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 await tick();assert.match(alertRow.querySelector('small').textContent,/Could not update/);
 alertRow.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
 await tick();assert.match(alertRow.querySelector('small').textContent,/Could not update/);
 w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(dropdown.classList.contains('open'),false);
 assert.equal(trigger.getAttribute('aria-expanded'),'false');
 assert.equal(w.document.activeElement,trigger);
 trigger.click();assert.equal(trigger.getAttribute('aria-expanded'),'true');
 w.document.body.click();
 assert.equal(trigger.getAttribute('aria-expanded'),'false');
 assert.equal(dropdown.classList.contains('open'),false);
 failRead=true;await onAuth({uid:'A'});assert(w.document.querySelector('#bellList'));await onAuth(null);assert.match(w.document.querySelector('#bellList').textContent,/No alerts/);w.close();
 const {createNotificationPreferenceController}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('assets/js/notifications/preference-save.mjs','utf8')).toString('base64'));
 const dom=new JSDOM(fs.readFileSync('notifications.html','utf8'),{url:'https://example.com/notifications.html',runScripts:'outside-only'}),n=dom.window;
 let notificationAuthChanged,failPreferenceWrite=false;const preferenceWrites=[];
 Object.assign(n,{
   safeNotificationUrl:url,
   auth:{currentUser:{uid:'A'}},
   mountNotificationBell(){},
   onAuthStateChanged:(_,callback)=>notificationAuthChanged=callback,
   countUnread:rows=>rows.filter(r=>!r.read).length,
   bootstrapAccount:async()=>({notificationPreferences:{inAppEnabled:true,browserEnabled:false}}),
   listenNotifications:()=>()=>{},
   saveNotificationPreferences:async(uid,payload)=>{preferenceWrites.push([uid,payload]);if(failPreferenceWrite)throw Error('offline');},
   requestBrowserNotificationPermission:async()=>({permission:'granted',supported:true}),
   createNotificationPreferenceController
 });
 const source=[...fs.readFileSync('notifications.html','utf8').matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].at(-1)[1];
 n.eval(strip(source));n.renderFeed([item]);assert.equal(n.document.querySelectorAll('#feed img').length,0);assert.equal(n.document.querySelector('.feed-title').textContent,hostile);assert.equal(n.document.querySelector('.feed-item').dataset.link,'');assert.equal(n.document.querySelector('.js-open'),null);
 const switches=[...n.document.querySelectorAll('button.switch[data-pref]')];
 assert.equal(switches.length,10,'Every notification preference uses an accessible switch');
 for(const sw of switches){
   assert.equal(sw.getAttribute('role'),'switch');
   assert(sw.getAttribute('aria-label'),'A switch must have a screen-reader label');
   assert.equal(sw.getAttribute('aria-checked'),'false');
   assert.equal(sw.disabled,true,'Settings are unavailable until account bootstrap completes');
 }
 await notificationAuthChanged({uid:'A'});
 const inAppSwitch=n.document.querySelector('[data-pref="inAppEnabled"]');
 assert.equal(inAppSwitch.getAttribute('aria-checked'),'true');
 assert(inAppSwitch.classList.contains('on'));
 inAppSwitch.click();
 assert.equal(inAppSwitch.getAttribute('aria-checked'),'true','Do not display unconfirmed change');
 await tick();
 assert.equal(inAppSwitch.getAttribute('aria-checked'),'false');
 assert(!inAppSwitch.classList.contains('on'));
 n.document.getElementById('requestPermissionBtn').click();
 await tick();
 const browserSwitch=n.document.querySelector('[data-pref="browserEnabled"]');
 assert.equal(browserSwitch.getAttribute('aria-checked'),'true');
 assert(browserSwitch.classList.contains('on'));
 assert(preferenceWrites.some(([uid,payload])=>uid==='A' && payload.browserEnabled===true));
 failPreferenceWrite=true;
 inAppSwitch.click();
 await tick();
 assert.equal(inAppSwitch.getAttribute('aria-checked'),'false','Failed save keeps confirmed assistive-tech state');
 assert(!inAppSwitch.classList.contains('on'),'Failed save keeps confirmed visual state');
 assert.match(n.document.querySelector('p[role="status"]').textContent,/previous setting is unchanged/);
 n.close();
 let authChanged,callbacks=[],stops=0;const identity={window:{dispatchEvent(){}},CustomEvent:class{},auth:{},app:{},onAuthStateChanged:(_,callback)=>authChanged=callback,getFirestore:()=>({}),doc:(_,__,uid)=>uid,onSnapshot:(_,callback)=>{callbacks.push(callback);return()=>stops++;}};
 vm.runInNewContext(strip(fs.readFileSync('assets/js/account-identity.js','utf8')),identity);
 authChanged({uid:'A',displayName:'Alice'});callbacks[0]({data:()=>({displayName:'Alice Saved'})});assert.equal(identity.window.FynxIdentity.displayName,'Alice Saved');authChanged({uid:'B',displayName:'Bob'});callbacks[0]({data:()=>({displayName:'Stale Alice'})});assert.equal(identity.window.FynxIdentity.displayName,'Bob');authChanged(null);assert.equal(identity.window.FynxIdentity.uid,null);assert.equal(identity.window.FynxIdentity.displayName,'');assert.equal(stops,2);
 const home=new JSDOM('<p id="homeStatsStatus"></p><b id="homePnl"></b><b id="homeTrades"></b><b id="homeWinRate"></b>',{url:'https://example.com/home.html'});let homeAuth,homeSnapshot;
 vm.runInNewContext(strip(fs.readFileSync('assets/js/home-journal.js','utf8')),{document:home.window.document,localStorage:home.window.localStorage,auth:{},app:{},onAuthStateChanged:(_,callback)=>homeAuth=callback,getFirestore:()=>({}),collection:()=>({}),onSnapshot:(_,callback)=>{homeSnapshot=callback;return()=>{};}});homeAuth({uid:'A'});homeSnapshot({docs:[{data:()=>({pl:500})}],empty:false});assert.equal(home.window.document.getElementById('homeTrades').textContent,'1');homeAuth(null);assert.equal(home.window.document.getElementById('homeTrades').textContent,'0');assert.equal(home.window.document.getElementById('homePnl').textContent,'—');home.window.close();
 console.log('Safe notification content/links, recovery after failed reads, account-switch isolation and cleared signed-out statistics passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
