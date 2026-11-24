'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('intelligence/story.html','utf8');
const script=fs.readFileSync('assets/js/shared-story.js','utf8').replace(/import\('\.\/account-sync\.js[^']*'\)/,"Promise.resolve(window.accountStub)");
const id='a'.repeat(64),now=Date.now(),iso=ms=>new Date(now+ms).toISOString();
const story=extra=>({id,kind:'story',title:'Local QA: source-bound story',summary:'This is a local interface test statement.',whatHappened:'This is a local interface test statement.',publishedAt:iso(-60000),updatedAt:iso(-30000),contentExpiresAt:iso(600000),expiresAt:iso(600000),facts:[{text:'Only this test fact is supported.',sourceURL:'https://www.federalreserve.gov/qa.htm'}],sources:[{name:'Official test source',url:'https://www.federalreserve.gov/qa.htm'}],analysis:[],whyItMatters:'',verification:'confirmed',...extra});
const tick=()=>new Promise(r=>setImmediate(r));
function harness(t,response,options={}){
 const dom=new JSDOM(html,{url:'https://www.fynxfinanceworld.com/intelligence/story.html?id='+id,runScripts:'outside-only',virtualConsole:new VirtualConsole()});t.after(()=>dom.window.close());
 const w=dom.window,intervals=[],saved=[];w.Date.now=()=>now;w.setInterval=fn=>{intervals.push(fn);return 1;};
 const rows=new Map(options.rows||[]);w.accountStub={sync:{uid:'qa-user',rows},storyID:async()=> 'source-hash',accountData:(_,key)=>rows.get(key)?.data,subscribe:fn=>fn(),save:async(domain,key,data)=>saved.push({domain,key,data})};
 w.fetch=async()=>({ok:true,text:async()=>JSON.stringify(response)});w.eval(script);
 return {w,q:id=>w.document.getElementById(id),intervals,saved};
}
test('public story renders attributed facts and preserves exact internal links',async t=>{
 const h=harness(t,{story:story(),related:[{id:'b'.repeat(64),title:'Related local QA'}]});await tick();await tick();
 assert.equal(h.q('story').hidden,false);assert.equal(h.q('headline').textContent,story().title);assert.equal(h.q('sources').querySelector('a').href,story().sources[0].url);
 assert.equal(h.q('related').querySelector('a').getAttribute('href'),'/intelligence/story.html?id='+'b'.repeat(64));
 assert.equal(h.q('app-link').getAttribute('href'),'fynx://intelligence/'+id);
});
test('private briefs, wrong IDs, expired content and unattributed facts fail closed',async t=>{
 for(const change of [{publishedAt:'1960-01-01'},{updatedAt:iso(3600000)},{updatedAt:iso(-90000)},{title:'a'.repeat(601)},{kind:'brief'},{id:'c'.repeat(64)},{contentExpiresAt:iso(-1)},{facts:[{text:'Unattributed',sourceURL:'https://wrong.example/report'}]},{sources:[{name:'Unsafe',url:'http://localhost/private'}]}]){
  const h=harness(t,{story:story(change)});await tick();assert.equal(h.q('story').hidden,true);assert.match(h.q('status').textContent,/could not be verified/);
 }
});
test('publisher text is rendered as text and expiry removes previously visible content',async t=>{
 const h=harness(t,{story:story({title:'<img src=x onerror=alert(1)>'})});await tick();assert.equal(h.q('headline').querySelector('img'),null);
 h.w.Date.now=()=>now+700000;h.intervals[0]();assert.equal(h.q('story').hidden,true);assert.equal(h.q('content').children.length,0);
});
test('saving a story follows its existing bookmark after sources reorder',async t=>{
 const existing={domain:'readingRecords',id:'existing-source-hash',data:{intelligenceStoryID:id,saved:false,url:'https://www.federalreserve.gov/original.htm',source:'First source'}};
 const h=harness(t,{story:story()},{rows:[['readingRecords:existing',existing]]});await tick();await tick();h.q('save').click();await tick();
 assert.equal(h.saved.length,1);assert.equal(h.saved[0].key,existing.id);assert.equal(h.saved[0].data.url,existing.data.url);assert.equal(h.saved[0].data.intelligenceStoryID,id);assert.equal(h.saved[0].data.saved,true);
});

test('malformed optional related data does not hide a verified public story',async t=>{
 for(const related of [{items:[]},42,'unavailable',[null,false,{}]]){
  const h=harness(t,{story:story(),related});await tick();await tick();
  assert.equal(h.q('story').hidden,false);assert.equal(h.q('retry').hidden,true);
  assert.equal(h.q('related-section').hidden,true);assert.match(h.q('status').textContent,/Source-confirmed reporting/);
 }
});
test('a malformed related item cannot prevent a valid related link from rendering',async t=>{
 const relatedID='b'.repeat(64);
 const h=harness(t,{story:story(),related:[null,{id:relatedID,title:'Valid related report'},{id:relatedID,title:'Duplicate'},{id,title:'Current story'}]});
 await tick();await tick();
 assert.equal(h.q('story').hidden,false);assert.equal(h.q('related-section').hidden,false);
 assert.equal(h.q('related').children.length,1);
 assert.equal(h.q('related').querySelector('a').getAttribute('href'),'/intelligence/story.html?id='+relatedID);
});
