'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname,'../assets/js/news-preferences.js'),'utf8');
const ui = fs.readFileSync(path.join(__dirname,'../assets/js/your-news.js'),'utf8');
const css = fs.readFileSync(path.join(__dirname,'../assets/css/your-news.css'),'utf8');
const key = 'fynx_your_news_v1';
const id = 'b'.repeat(64);
function mount({denyStorage=false}={}) {
  const data = new Map(), events = [];
  const localStorage = {
    getItem: name => data.get(name) || null,
    setItem: (name,value) => {
      if(denyStorage)throw Error('private browsing quota');
      data.set(name,String(value));
    }
  };
  const window = {localStorage, location:{origin:'https://www.fynxfinanceworld.com'},addEventListener(){}};
  const document = {dispatchEvent:e=>{events.push(e.type);}};
  class CustomEvent {constructor(type){this.type=type;}}
  vm.runInNewContext(script,{window,document,CustomEvent,URL,URLSearchParams,Date},{filename:'news-preferences.js'});
  return {api:window.FYNXYourNews,data,events};
}
const article = () => ({
  id,title:'Central bank preview',source:'Example source',
  publishedAt:new Date(Date.now()-60000).toISOString(),
  readerUrl:'/news/article.html?'+new URLSearchParams({id,edition:'us',category:'macro'})
});
const make = topics => JSON.stringify({format:'fynx-your-news-topics',version:1,topics});
const unpack = b => JSON.parse(b.api.exportTopicBackup());
test('topic-only backup has a named version and never exports private reading history',()=>{
  const b=mount();b.api.setTopics(['world','energy']);assert.equal(b.api.markOpened(article()),true);
  const backup=unpack(b);
  assert.equal(backup.format,'fynx-your-news-topics');assert.equal(backup.version,1);
  assert.deepEqual(Array.from(backup.topics),['world','energy']);
  assert.deepEqual(Object.keys(backup).sort(),['format','topics','version']);
  assert.ok(!b.api.exportTopicBackup().includes('Central bank preview'));
  assert.ok(!b.api.exportTopicBackup().includes(id));
});
test('backup restores followed topics to another browser without storing history',()=>{
  const from=mount(),to=mount();
  from.api.setTopics(['world','economics']);
  const result=to.api.importTopicBackup(from.api.exportTopicBackup());
  assert.equal(result.ok,true);assert.equal(result.count,2);assert.equal(result.saved,true);
  assert.deepEqual(Array.from(to.api.getTopics()),['world','economics']);
  assert.equal(to.api.getHistory().length,0);
  assert.deepEqual(JSON.parse(to.data.get(key)).topics,['world','economics']);
  assert.ok(to.events.includes('fynx:news-preferences-change'));
});
test('restore replaces topics but does not clear the destination reading history',()=>{
  const b=mount();b.api.markOpened(article());
  assert.equal(b.api.importTopicBackup(make(['finance'])).ok,true);
  assert.deepEqual(Array.from(b.api.getTopics()),['finance']);
  assert.equal(b.api.getHistory().length,1);
});
test('bad JSON and unsupported formats or versions are rejected with no state change',()=>{
  const b=mount();b.api.setTopics(['energy']);b.events.length=0;
  for(const raw of ['broken',make(['world']).replace('fynx-your-news-topics','other'),
    JSON.stringify({format:'fynx-your-news-topics',version:2,topics:['world']}),
    'null','[]']) {
    assert.equal(b.api.importTopicBackup(raw).ok,false);
  }
  assert.deepEqual(Array.from(b.api.getTopics()),['energy']);
  assert.equal(b.events.length,0);
});
test('unknown, duplicate, oversized and non-string IDs cannot silently rewrite topics',()=>{
  const b=mount();b.api.setTopics(['stocks']);b.events.length=0;
  for(const topicList of [
    ['stocks','not-a-topic'],['world','world'],[1],new Array(9).fill('world'),{},
    ['__proto__'],['<script>']
  ])assert.equal(b.api.importTopicBackup(make(topicList)).ok,false);
  assert.equal(b.api.importTopicBackup('x'.repeat(4100)).ok,false);
  assert.deepEqual(Array.from(b.api.getTopics()),['stocks']);
  assert.equal(b.events.length,0);
});
test('empty list is an intentional supported topic choice',()=>{
  const b=mount();assert.equal(b.api.importTopicBackup(make([])).ok,true);
  assert.deepEqual(Array.from(b.api.getTopics()),[]);
});
test('restoring in a restricted browser reports the lack of persistence',()=>{
  const b=mount({denyStorage:true}),result=b.api.importTopicBackup(make(['technology']));
  assert.equal(result.ok,true);assert.equal(result.saved,false);
  assert.deepEqual(Array.from(b.api.getTopics()),['technology']);
  assert.equal(b.data.size,0);
});
test('same topics do not create duplicate change events',()=>{
  const b=mount();b.api.setTopics(['world']);b.events.length=0;
  assert.equal(b.api.importTopicBackup(make(['world'])).ok,true);
  assert.deepEqual(b.events,[]);
});
test('page offers actual download/file restore, a status announcement and touch-safe controls',()=>{
  assert.match(ui,/setupTopicTransfer\(\)/);
  assert.match(ui,/preferences\.exportTopicBackup\(\)/);
  assert.match(ui,/preferences\.importTopicBackup\(await chosen\.text\(\)\)/);
  assert.match(ui,/chosen\.size>4096/);
  assert.match(ui,/aria-live','polite'/);
  assert.match(css,/\.your-news-transfer-actions button\s*\{[^}]*min-height: 44px/);
});

test('published page and release builder use the same targeted cache version',()=>{
  const {rewriteReferences,TOPIC_TRANSFER_VERSION,VERSION,ASSETS} = require('./build-release-assets.cjs');
  const html=fs.readFileSync(path.join(__dirname,'../news/your-news.html'),'utf8');
  for(const asset of ['assets/js/news-preferences.js','assets/js/your-news.js','assets/css/your-news.css']) {
    assert.ok(html.includes(asset+'?v='+TOPIC_TRANSFER_VERSION),asset+' is fresh on the published page');
  }
  const source='<script src="/assets/js/news-preferences.js?v=old"></script><script src="/fynx-nav.js?v=old"></script>';
  const rewritten=rewriteReferences(source,'news/your-news.html',new Set(ASSETS));
  assert.ok(rewritten.includes('news-preferences.js?v='+TOPIC_TRANSFER_VERSION));
  assert.ok(rewritten.includes('fynx-nav.js?v='+VERSION));
});
