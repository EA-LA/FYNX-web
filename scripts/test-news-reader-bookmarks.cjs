'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const {JSDOM,VirtualConsole}=require('jsdom');
const {canonicalStoryURL}=require('../assets/js/account-sync-mapping.js');
const html=fs.readFileSync('news/article.html','utf8');
const script=fs.readFileSync('assets/js/news-reader.js','utf8').replace(/import\('\/assets\/js\/account-sync\.js[^']*'\)/,'Promise.resolve(window.accountStub)');
const id='a'.repeat(64),source='https://publisher.example/report',hash=url=>createHash('sha256').update(canonicalStoryURL(url)).digest('hex');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(t,initial=[],articleFields={}){
 const dom=new JSDOM(html,{url:'https://www.fynxfinanceworld.com/news/article.html?id='+id,runScripts:'outside-only',virtualConsole:new VirtualConsole()});t.after(()=>dom.window.close());
 const w=dom.window,rows=new Map(initial.map(row=>['readingRecords:'+row.id,row])),writes=[],listeners=[];
 const now=Date.now(),article={id,title:'Bookmark identity fixture',source:'Fixture Publisher',sourceUrl:source,publishedAt:new Date(now-60000).toISOString(),preparedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),contentExpiresAt:new Date(now+600000).toISOString(),edition:'us',category:'all',coverageLevel:'headline-only',coverageNote:'Headline metadata only.',summary:'Bookmark identity fixture',keyPoints:[],numbers:[],context:[],questions:[],terms:[],related:[],sources:[],isCurrent:true,...articleFields};
 w.setInterval=()=>1;w.clearInterval=()=>{};
 w.FynxEdition={get:()=> 'us'};
 w.FynxAccountSyncMapping={canonicalStoryURL};
 w.FYNXNewsReaderData={loadArticle:async()=>article,resolveArticle:async()=>article,getCachedArticle:()=>null};
 const api=w.accountStub={sync:{uid:'first-user',rows},storyID:async url=>hash(url),accountData:(domain,key)=>rows.get(domain+':'+key)?.data,subscribe:fn=>{listeners.push(fn);fn();},save:async(domain,key,data)=>{writes.push({domain,key,data,uid:api.sync.uid});const old=rows.get(domain+':'+key);rows.set(domain+':'+key,{domain,id:key,data:{...old?.data,...data}});}};
 w.eval(script);
 return {w,api,rows,writes,notify:()=>listeners.forEach(fn=>fn()),button:()=>w.document.querySelector('[data-reader-share]').previousElementSibling};
}
const record=(url,extra={})=>({id:hash(url),domain:'readingRecords',data:{id:hash(url),url,title:'Existing bookmark',source:'Fixture Publisher',saved:true,...extra}});

test('web reader unsaves the existing native bookmark by explicit web ID and retains its original URL',async t=>{
 const original=source+'?oc=5',row=record(original,{webArticleId:id,intelligenceStoryID:'b'.repeat(64)}),h=harness(t,[row]);await tick();await tick();
 assert.equal(h.button().textContent,'Saved story');h.button().click();await tick();
 assert.equal(h.writes.length,1);assert.equal(h.writes[0].key,row.id);assert.equal(h.writes[0].data.url,original);assert.equal(h.writes[0].data.saved,false);assert.equal(h.writes[0].data.webArticleId,id);
 assert.equal(h.rows.size,1);assert.equal(h.rows.get('readingRecords:'+row.id).data.intelligenceStoryID,'b'.repeat(64));
});
test('legacy native bookmark without webArticleId remains the same record after oc normalization',async t=>{
 const original=source+'?oc=5&utm_source=native',row=record(original),h=harness(t,[row]);await tick();await tick();
 assert.equal(h.button().getAttribute('aria-pressed'),'true');h.button().click();await tick();
 assert.equal(h.writes[0].key,row.id);assert.equal(h.writes[0].data.url,original);assert.equal(h.rows.size,1);
});
test('different meaningful source queries cannot claim another bookmark',async t=>{
 const row=record(source+'?article=other'),h=harness(t,[row]);await tick();await tick();
 assert.equal(h.button().textContent,'Save story');h.button().click();await tick();
 assert.equal(h.writes[0].key,hash(source));assert.notEqual(h.writes[0].key,row.id);assert.equal(h.rows.get('readingRecords:'+row.id).data.saved,true);
});
test('literal plus and encoded space remain different source identities',async t=>{
 const row=record(source+'?q=one+two'),target=source+'?q=one%20two',h=harness(t,[row],{sourceUrl:target});await tick();await tick();h.button().click();await tick();
 assert.equal(h.writes[0].key,hash(target));assert.notEqual(h.writes[0].key,row.id);
});
test('new bookmarks keep URL hash separate from backend article ID',async t=>{
 const h=harness(t);await tick();await tick();h.button().click();await tick();
 assert.equal(h.writes[0].key,hash(source));assert.notEqual(h.writes[0].key,id);assert.equal(h.writes[0].data.webArticleId,id);assert.equal(h.writes[0].data.id,hash(source));
});
test('deleted aliases do not replace the active bookmark identity',async t=>{
 const row={...record(source+'?oc=5',{webArticleId:id}),deleted:true},h=harness(t,[row]);await tick();await tick();h.button().click();await tick();
 assert.equal(h.writes[0].key,hash(source));assert.equal(h.rows.get('readingRecords:'+row.id).deleted,true);
});
test('account changes during bookmark hashing cannot save the prior action to another user',async t=>{
 const h=harness(t);await tick();await tick();let release;h.api.storyID=()=>new Promise(resolve=>{release=resolve;});h.button().click();await tick();
 h.api.sync.uid='second-user';h.rows.clear();h.api.storyID=async url=>hash(url);release(hash(source));await tick();
 assert.equal(h.writes.length,0);assert.match(h.w.document.querySelector('[data-reader-action-status]').textContent,/account changed/i);
});
