/* Behavior tests use labeled synthetic reports; no fixtures ship in the newsroom. */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const preferenceScript=read('assets/js/news-preferences.js'),pageScript=read('assets/js/your-news.js'),html=read('news/your-news.html');
const NOW=Date.parse('2026-11-03T17:00:00Z'),ID='a'.repeat(64);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const route=item=>'/news/article.html?'+new URLSearchParams({id:item.articleId||item.id,edition:item.edition||'us',category:item.category||'all'});
const item=(id=ID,extra={})=>({articleId:id,title:'Fixture company reports results',source:'Fixture publisher',publishedAt:new Date(NOW-3600000).toISOString(),edition:'us',category:'stocks',rank:1,...extra});
const result=(items,extra={})=>({items,status:'fresh',stale:false,fetchedAt:new Date(NOW).toISOString(),...extra});
function harness({stored,blocked=false,load,account}={}){
 const dom=new JSDOM(html,{url:'https://www.fynxfinanceworld.com/news/your-news.html',runScripts:'outside-only'}),w=dom.window;
 let now=NOW,edition='us',hidden=false;const timers=new Map(),calls=[];let timerID=0;
 w.Date.now=()=>now;Object.defineProperty(w.document,'hidden',{get:()=>hidden});
 if(stored)w.localStorage.setItem('fynx_your_news_v1',stored);
 if(blocked)Object.defineProperty(w,'localStorage',{get(){throw new Error('Storage blocked');}});
 w.setTimeout=(fn,ms)=>{timers.set(++timerID,{fn,ms});return timerID;};w.clearTimeout=id=>timers.delete(id);
 w.FynxEdition={get:()=>edition,editions:[{id:'us',label:'US'},{id:'uk',label:'UK'}]};
 w.FYNXNewsReaderData={href:route,prefetch:()=>{}};
 w.FYNXMarketIntelligenceData={loadHeadlines:(category,options)=>{calls.push({category,...options});return load?load(category,options):Promise.resolve(result([item(category[0].charCodeAt(0).toString(16).repeat(32),{category,edition:options.edition,title:'Fixture '+category+' report'})]));}};
 if(account){w.__account={sync:{uid:'A',ready:true,status:'synced',records:domain=>(account.records||[]).filter(r=>r.domain===domain)},accountData:()=>account.interests,subscribe:fn=>fn(w.__account.sync),offerImport:()=>{},save:async()=>{}};}
 w.eval(account?preferenceScript.replace(/import\('\/assets\/js\/account-sync\.js[^']*'\)/,'Promise.resolve(window.__account)'):preferenceScript);
 const fire=type=>w.document.dispatchEvent(new w.CustomEvent(type));
 return {w,dom,calls,timers,api:w.FYNXYourNews,start:()=>w.eval(pageScript),advance:ms=>{now+=ms;},edition:value=>{edition=value;fire('fynx:edition-change');},visible:value=>{hidden=!value;fire('visibilitychange');},fire,close:()=>dom.window.close()};
}

test('topic preferences persist only valid unique desks, allow an empty selection, and fall back when storage is blocked',()=>{
 const h=harness();assert.deepEqual([...h.api.getTopics()],['stocks','economics','technology']);h.api.setTopics(['technology','technology','bad','world']);assert.deepEqual([...h.api.getTopics()],['technology','world']);
 const stored=h.w.localStorage.getItem('fynx_your_news_v1'),again=harness({stored});assert.deepEqual([...again.api.getTopics()],['technology','world']);again.api.setTopics([]);assert.equal(again.api.getTopics().length,0);
 const blocked=harness({blocked:true});blocked.api.setTopics(['finance']);assert.deepEqual([...blocked.api.getTopics()],['finance']);assert.equal(blocked.api.isPersistent(),false);h.close();again.close();blocked.close();
});

test('history validates local reader destinations, deduplicates opened stories, expires and clears',()=>{
 const h=harness(),story=item();assert.equal(h.api.markOpened(story),true);assert.equal(h.api.isRead(ID),true);h.api.markOpened(story);assert.equal(h.api.getHistory().length,1);
 assert.equal(h.api.markOpened({...story,readerUrl:'https://attacker.example/news/article.html?id='+ID}),false);
 assert.equal(h.api.markOpened({...story,articleId:'wrong'}),false);
 assert.equal(h.api.markOpened({...story,publishedAt:new Date(NOW+600000).toISOString()}),false);
 h.advance(7*86400000);assert.equal(h.api.getHistory().length,0);h.api.clearHistory();assert.equal(h.api.isRead(ID),false);h.close();
});

test('malformed storage cannot inject routes or markup into reading history',()=>{
 const stored=JSON.stringify({version:1,topics:['stocks'],history:[{...item(),id:ID,readerUrl:'javascript:alert(1)',openedAt:NOW}]});const h=harness({stored});assert.equal(h.api.getHistory().length,0);
 h.api.markOpened({...item(),title:'<img src=x onerror=alert(1)> Test'});assert.equal(h.api.getHistory()[0].title,'Test');h.close();
});

test('current feeds deduplicate reports and reject stale, future and different-edition stories',async()=>{
 const h=harness({load:async category=>result([item(ID,{category}),item('b'.repeat(64),{category,publishedAt:new Date(NOW-25*3600000).toISOString()}),item('c'.repeat(64),{category,edition:'uk'}),item('d'.repeat(64),{category,publishedAt:new Date(NOW+600000).toISOString()})])});h.start();await tick();await tick();
 assert.equal(h.w.document.querySelectorAll('.your-news-story').length,1);assert.match(h.w.document.querySelector('.your-news-story a').href,/\/news\/article\.html\?id=/);assert.match(h.w.document.querySelector('[data-your-status]').textContent,/Past 24 hours/);h.close();
});

test('search, topic and unread controls act on real current records without requesting another feed',async()=>{
 const h=harness();h.start();await tick();await tick();const d=h.w.document;assert.equal(d.querySelectorAll('.your-news-story').length,3);
 d.querySelector('[data-your-search]').value='technology';d.querySelector('[data-your-search]').dispatchEvent(new h.w.Event('input'));assert.equal(d.querySelectorAll('.your-news-story').length,1);
 d.querySelector('[data-your-reset-filters]').click();assert.equal(d.querySelectorAll('.your-news-story').length,3);
 h.api.markOpened(item('73'.repeat(32),{category:'stocks'}));d.querySelector('[data-your-unread]').checked=true;d.querySelector('[data-your-unread]').dispatchEvent(new h.w.Event('change'));assert.equal(d.querySelectorAll('.your-news-story').length,2);
 assert.equal(d.querySelectorAll('.your-news-history-item').length,1);d.querySelector('[data-your-clear-history]').click();assert.equal(d.querySelectorAll('.your-news-history-item').length,0);assert.equal(d.querySelectorAll('.your-news-story').length,3);assert.equal(h.calls.length,3);h.close();
});

test('requests are bounded to three, and rapid edition changes discard old responses and queued work',async()=>{
 const pending=[];let active=0,max=0;
 const h=harness({load:(category,options)=>{active++;max=Math.max(max,active);return new Promise(resolve=>pending.push({category,edition:options.edition,resolve:()=>{active--;resolve(result([item(category[0].charCodeAt(0).toString(16).repeat(32),{category,edition:options.edition,title:options.edition+' fixture report'})]));}}));}});
 h.api.setTopics(h.api.topics.map(x=>x.id));h.start();await tick();assert.equal(h.calls.length,3);h.edition('uk');await tick();assert.equal(h.calls.length,3);
 for(let pass=0;pass<5;pass++){for(const request of pending.splice(0))request.resolve();await tick();await tick();}
 assert.equal(max,3);assert.ok(h.calls.slice(3).every(call=>call.edition==='uk'));assert.doesNotMatch(h.w.document.querySelector('[data-your-stories]').textContent,/us fixture/);assert.match(h.w.document.querySelector('[data-your-stories]').textContent,/uk fixture/);h.close();
});

test('five-minute refresh pauses while hidden and catches up on return, re-pruning stale items',async()=>{
 const h=harness();h.start();await tick();await tick();assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].ms,300000);
 h.visible(false);assert.equal(h.timers.size,0);h.advance(300001);h.visible(true);await tick();await tick();assert.equal(h.calls.length,6);assert.equal(h.timers.size,1);
 h.visible(false);h.advance(25*3600000);h.visible(true);await tick();await tick();assert.equal(h.w.document.querySelectorAll('.your-news-story').length,0);assert.match(h.w.document.querySelector('[data-your-empty-title]').textContent,/No current/);h.close();
});

test('manual refresh asks the existing feed for a refresh and unavailable topics remain honest',async()=>{
 const h=harness({load:async()=>result([],{status:'unavailable',stale:true,fetchedAt:null})});h.start();await tick();await tick();assert.equal(h.w.document.querySelector('[data-your-status-title]').textContent,'Sources unavailable');
 h.w.document.querySelector('[data-your-refresh]').click();await tick();await tick();assert.ok(h.calls.slice(3).every(x=>x.force===true));assert.equal(h.w.document.querySelectorAll('.your-news-story').length,0);h.close();
});

test('turning off all topics makes no new requests and keeps filters usable',async()=>{
 const h=harness();h.start();await tick();await tick();h.api.setTopics([]);await tick();assert.equal(h.calls.length,3);assert.equal(h.w.document.querySelector('[data-your-status-title]').textContent,'Choose your topics');assert.equal(h.w.document.querySelectorAll('.your-news-story').length,0);h.close();
});

test('changing a followed topic preserves keyboard focus on that topic',async()=>{
 const h=harness();h.start();await tick();await tick();const button=h.w.document.querySelector('[data-topic="technology"]');button.focus();button.click();await tick();await tick();assert.equal(h.w.document.activeElement.dataset.topic,'technology');assert.equal(h.w.document.activeElement.getAttribute('aria-pressed'),'false');h.close();
});

test('shared stories remain findable under each followed topic without duplicates',async()=>{
 const h=harness({load:async category=>result([item(ID,{category})])});h.start();await tick();await tick();const d=h.w.document;assert.equal(d.querySelectorAll('.your-news-story').length,1);
 for(const topic of ['stocks','economics','technology']){d.querySelector('[data-your-topic-filter]').value=topic;d.querySelector('[data-your-topic-filter]').dispatchEvent(new h.w.Event('change'));assert.equal(d.querySelectorAll('.your-news-story').length,1);}
 assert.match(d.querySelector('.your-news-story-meta').textContent,/Markets.*Economics.*Technology/);h.close();
});

test('partial flags and malformed feed responses never claim complete coverage',async()=>{
 const partial=harness({load:async category=>result([item(ID,{category})],{partial:true})});partial.start();await tick();await tick();assert.equal(partial.w.document.querySelector('[data-your-status-title]').textContent,'Partly refreshed');partial.close();
 for(const payload of [null,{}, {items:'bad',status:'fresh'}]){const h=harness({load:async()=>payload});h.start();await tick();await tick();assert.equal(h.w.document.querySelector('[data-your-status-title]').textContent,'Sources unavailable');assert.equal(h.w.document.querySelectorAll('.your-news-story').length,0);h.close();}
});

test('partial fresh coverage distinguishes unavailable sources from saved reports',async()=>{
 const fresh=harness({load:async category=>result([item(ID,{category})],{partial:true})});fresh.start();await tick();await tick();const text=fresh.w.document.querySelector('[data-your-status]').textContent;assert.match(text,/Some sources are temporarily unavailable/);assert.doesNotMatch(text,/saved coverage/);fresh.close();
 const cached=harness({load:async category=>result([item(ID,{category})],{partial:true,status:'cached'})});cached.start();await tick();await tick();assert.match(cached.w.document.querySelector('[data-your-status]').textContent,/dated saved coverage/);cached.close();
});

test('automatic refresh keeps current reporting until its replacement is ready and switches editions cleanly',async()=>{
 let wait=false;const pending=[];
 const h=harness({load:(category,options)=>wait?new Promise(resolve=>pending.push(()=>resolve(result([item(ID,{category,edition:options.edition,title:'Replacement fixture report'})])))):Promise.resolve(result([item(ID,{category,edition:options.edition,title:'Current fixture report'})]))});
 h.start();await tick();await tick();wait=true;h.advance(300000);const timer=[...h.timers.values()][0];timer.fn();await tick();
 assert.match(h.w.document.querySelector('[data-your-stories]').textContent,/Current fixture report/);assert.equal(h.w.document.querySelector('[data-your-empty]').hidden,true);
 for(const done of pending.splice(0))done();await tick();await tick();assert.match(h.w.document.querySelector('[data-your-stories]').textContent,/Replacement fixture report/);assert.doesNotMatch(h.w.document.querySelector('[data-your-stories]').textContent,/Current fixture report/);
 h.edition('uk');assert.equal(h.w.document.querySelectorAll('.your-news-story').length,0);await tick();for(const done of pending.splice(0))done();await tick();await tick();assert.match(h.w.document.querySelector('[data-your-edition]').textContent,/UK/);h.close();
});

test('published FYNX Intelligence reports stay visible in Your News and link to their internal analysis',async()=>{
 const h=harness();
 h.w.FYNXNewsReaderData.href=()=>'/intelligence/market-context-12abc3/';
 h.start();await tick();await tick();
 const stories=h.w.document.querySelectorAll('.your-news-story');
 assert.equal(stories.length,3,'mapped analysis must not disappear from a valid feed');
 for(const story of stories){
   const links=story.querySelectorAll('a[href]');
   assert.ok(links.length>=2);
   for(const link of links)assert.equal(link.getAttribute('href'),'/intelligence/market-context-12abc3/');
 }
 h.close();
});

test('Your News rejects unapproved, external and malformed destinations without rendering links',async()=>{
 const rejected=[
   'https://attacker.example/steal',
   '//attacker.example/steal',
   'javascript:alert(1)',
   '/profile.html',
   '/intelligence/../../auth/login/',
   '/intelligence/valid-report/?next=https://attacker.example',
   '/intelligence/valid-report/#fragment',
   '/intelligence/%2e%2e/',
   '/news/article.html?id=bad',
   '/news/article.html?id='+ID+'&edition=us&category=stocks&redirect=https://attacker.example',
   '/news/article.html?id='+ID+'&edition=us&category=stocks&id='+ID
 ];
 for(const href of rejected){
   const h=harness({load:async()=>result([item(ID)])});
   h.api.setTopics(['stocks']);
   h.w.FYNXNewsReaderData.href=()=>href;
   h.start();await tick();await tick();
   assert.equal(h.w.document.querySelectorAll('.your-news-story').length,0,'rejected route: '+href);
   h.close();
 }
});


test('native detailed follows are editable and filter reports with phrase boundaries',async()=>{
 const h=harness({account:{interests:{topics:['artificial-intelligence'],regions:['india'],companies:['AAPL']}},load:async(category,options)=>result([item(ID,{category,edition:options.edition,title:'Apple expands artificial intelligence services in India'}),item('b'.repeat(64),{category,edition:options.edition,title:'Retail spending report'})])});await tick();h.start();await tick();await tick();
 assert(h.api.getTopics().includes('artificial-intelligence'));assert.equal(h.w.document.querySelector('[data-topic="artificial-intelligence"]').getAttribute('aria-pressed'),'true');assert(h.calls.some(c=>c.category==='technology'));assert(h.calls.some(c=>c.category==='world'&&c.edition==='india'));assert.match(h.w.document.querySelector('[data-your-stories]').textContent,/Apple/);assert.doesNotMatch(h.w.document.querySelector('[data-your-stories]').textContent,/Retail spending/);h.close();
});
test('native recent history and older bookmarks show without web reader metadata',async()=>{
 const oldDate=new Date(NOW-100*86400000).toISOString(),record={domain:'readingRecords',id:ID,data:{id:ID,title:'Saved on iPhone',source:'Native publisher',url:'https://publisher.example/old-story',publishedAt:oldDate,openedAt:new Date(NOW-60000).toISOString(),saved:true}};
 const h=harness({account:{interests:{topics:[]},records:[record]}});await tick();h.start();await tick();assert.equal(h.api.getHistory().length,1);assert.equal(h.api.getSaved().length,1);assert.equal(h.w.document.querySelector('[data-your-history] a').href,'https://publisher.example/old-story');assert.equal(h.w.document.querySelector('[data-your-saved] a').href,'https://publisher.example/old-story');h.close();
});

test('native saved stories with unknown publication dates remain visible',async()=>{const h=harness({account:{interests:{topics:[]},records:[{domain:'readingRecords',id:ID,data:{title:'Undated saved link',url:'https://publisher.example/story',saved:true}}]}});await tick();h.start();await tick();assert.equal(h.api.getSaved().length,1);assert.equal(h.api.getSaved()[0].publishedAt,null);assert.match(h.w.document.querySelector('[data-your-saved]').textContent,/Undated saved link/);h.close();});
