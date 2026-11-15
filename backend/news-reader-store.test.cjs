'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Store=require('./news-reader-store.cjs'),Reader=require('./news-reader.cjs'),api=require('./market-feed')._test;
function fakeDatabase(){
 const records=new Map(),stats={commits:0,reads:0,sets:0,deletes:0,cleanupLimits:[]};let rejectWrites=false;
 const ref=id=>({id,async get(){stats.reads++;return{exists:records.has(id),data:()=>records.get(id)};},async delete(){stats.deletes++;records.delete(id);}});
 const db={records,stats,set rejectWrites(v){rejectWrites=v;},collection(name){assert.equal(name,Store.COLLECTION);return {doc:ref,where(field,op,value){assert(['expiresAt','articleId'].includes(field));assert.equal(op,field==='expiresAt'?'<=':'==');return{limit(n){if(field==='expiresAt')stats.cleanupLimits.push(n);return{async get(){return{docs:[...records].filter(([,row])=>field==='expiresAt'?row.expiresAt<=value:row.articleId===value).slice(0,n).map(([id,row])=>({ref:ref(id),data:()=>row}))};}};}};}};},batch(){const ops=[];return{set(r,value){ops.push(['set',r,value]);},delete(r){ops.push(['delete',r]);},async commit(){stats.commits++;if(rejectWrites)throw Error('Firestore unavailable');for(const [type,r,v] of ops){if(type==='set'){stats.sets++;records.set(r.id,{...v,scope:{category:v.scope.category,symbol:v.scope.symbol,edition:v.scope.edition}});}else{stats.deletes++;records.delete(r.id);}}}};}};
 return db;
}
const makeItem=(extra={})=>({title:'Technology company reports higher earnings',source:'Publisher',link:'https://publisher.example/technology-report',pubDate:new Date(Date.now()-60000).toISOString(),edition:'us',category:'technology',kind:'headline',description:'The technology company reported that its quarterly earnings increased by 12 percent after revenue from cloud services expanded.',...extra});
const response=()=>({code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;}});
function reset(){Store._test.setDatabaseForTests(undefined);api.cache.clear();api.articleRecords.clear();Reader.articleCache.clear();}
test('durable verified IDs remain readable after an instance restart even when the provider no longer returns the story',async()=>{
 const db=fakeDatabase(),previous=global.fetch;Store._test.setDatabaseForTests(db);api.cache.clear();api.articleRecords.clear();let requests=0;
 try{const row=makeItem();global.fetch=async()=>{requests++;return{ok:true,text:async()=>'<rss><channel><item><title>'+row.title+'</title><link>'+row.link+'</link><pubDate>'+row.pubDate+'</pubDate><description>'+row.description+'</description></item></channel></rss>'};};
 const feed=await api.load('technology','us'),served=feed.items[0];assert(db.records.size>0);assert(db.stats.commits>0);const count=requests;
 api.cache.clear();api.articleRecords.clear();Reader.articleCache.clear();Store._test.persisted.clear();global.fetch=async()=>{throw Error('Provider no longer has this top story');};
 const result=await api.loadArticle(served.articleId,'us','technology');assert.equal(result.article.id,served.articleId);assert.equal(result.article.sourceUrl,row.link);assert.equal(result.article.coverageLevel,'publisher-excerpt');assert.equal(requests,count);
 }finally{global.fetch=previous;reset();}
});
test('durable records contain only the bounded public brief and skip unchanged writes',async()=>{
 const db=fakeDatabase();Store._test.setDatabaseForTests(db);
 try{const item=makeItem({description:('Technology company earnings rose 12 percent after cloud revenue growth. ').repeat(100)}),row=Reader.decorate(item);await Store.persistRows([row]);const sets=db.stats.sets;await Store.persistRows([row]);assert.equal(db.stats.sets,sets);
 const saved=[...db.records.values()][0];assert(saved.item.description.split(/\s+/).length<=78);assert(!JSON.stringify(saved).includes(item.description));assert.equal(saved.brief.related.length,0);assert(saved.expiresAt instanceof Date);assert.equal(saved.expiresAt.getTime(),Date.parse(item.pubDate)+7*86400000);
 }finally{reset();}
});
test('edition, category and symbol scopes cannot resolve another selection’s article record',async()=>{
 const db=fakeDatabase();Store._test.setDatabaseForTests(db);
 try{const item=makeItem({category:'stocks',symbol:'NVDA'}),row=Reader.decorate(item);await Store.persistRows([row]);const id=row.articleId;
 assert(await Store.read(id,{edition:'us',category:'stocks',symbol:'NVDA'}));
 for(const scope of [{edition:'uk',category:'stocks',symbol:'NVDA'},{edition:'us',category:'all',symbol:'NVDA'},{edition:'us',category:'stocks',symbol:'TSLA'},{edition:'us',category:'stocks'}])assert.equal(await Store.read(id,scope),null);
 }finally{reset();}
});
test('expired records are rejected and removed; forged canonical URLs and expiry extensions fail closed',async()=>{
 const db=fakeDatabase();Store._test.setDatabaseForTests(db);
 try{const row=Reader.decorate(makeItem()),scope={edition:'us',category:'technology',symbol:''};await Store.persistRows([row]);const key=Store.keyFor(row.articleId,scope),saved=db.records.get(key);
 db.records.set(key,{...saved,expiresAt:new Date(Date.now()-1)});assert.equal(await Store.read(row.articleId,scope),null);assert.equal(db.records.has(key),false);
 db.records.set(key,{...saved,item:{...saved.item,link:'https://attacker.example/other'}});assert.equal(await Store.read(row.articleId,scope),null);
 db.records.set(key,{...saved,expiresAt:new Date(Date.parse(row.pubDate)+8*86400000)});assert.equal(await Store.read(row.articleId,scope),null);
 db.records.set(key,{...saved,scope:{edition:'uk',category:'technology',symbol:''}});assert.equal(await Store.read(row.articleId,scope),null);
 }finally{reset();}
});
test('a failed durable write prevents the public feed from exposing unstable article links',async()=>{
 const db=fakeDatabase(),previous=global.fetch;db.rejectWrites=true;Store._test.setDatabaseForTests(db);api.cache.clear();
 try{const row=makeItem();global.fetch=async()=>({ok:true,text:async()=>'<rss><channel><item><title>'+row.title+'</title><link>'+row.link+'</link><pubDate>'+row.pubDate+'</pubDate></item></channel></rss>'});const res=response();await api.handler({method:'GET',query:{category:'technology'}},res);assert.equal(res.code,503);assert.equal(res.headers['Cache-Control'],'no-store');assert(!res.body.items);assert.equal(Store._test.persisted.size,0);
 }finally{global.fetch=previous;reset();}
});
test('cleanup is bounded to 25 expired records and preserves unexpired records',async()=>{
 const db=fakeDatabase();Store._test.setDatabaseForTests(db);const now=Date.now();
 try{for(let i=0;i<40;i++)db.records.set('expired-'+i,{expiresAt:new Date(now-1000)});db.records.set('unexpired',{expiresAt:new Date(now+1000000)});await Store.persistRows([Reader.decorate(makeItem())],now);assert.equal(db.stats.deletes,25);assert(db.records.has('unexpired'));assert.deepEqual(db.stats.cleanupLimits,[25]);
 }finally{reset();}
});
test('official records expire thirty days after the real release publication',()=>{
 const item=makeItem({kind:'official-release',category:'all'}),row=Reader.decorate(item);const stored=Store._test.serialize(row);assert.equal(stored.scope.category,'official');assert.equal(stored.expiresAt.getTime(),Date.parse(item.pubDate)+30*86400000);
});
test('stored brief metadata must agree with the verified article and selected scope',async()=>{
 const db=fakeDatabase();Store._test.setDatabaseForTests(db);
 try{const row=Reader.decorate(makeItem()),scope={edition:'us',category:'technology',symbol:''};await Store.persistRows([row]);const key=Store.keyFor(row.articleId,scope),saved=db.records.get(key);
 const changes=[{edition:'uk'},{category:'finance'},{source:'Impersonated publisher'},{title:'Unrelated fabricated title'},{publishedAt:new Date(Date.now()-86400000).toISOString()},{coverageLevel:'fully-verified'},{preparedAt:'invalid'},{updatedAt:new Date(Date.now()+86400000).toISOString()},{summary:'x'.repeat(20000)}];
 for(const change of changes){db.records.set(key,{...saved,brief:{...saved.brief,...change}});assert.equal(await Store.read(row.articleId,scope),null,JSON.stringify(Object.keys(change)));}
 }finally{reset();}
});
test('shared resolver finds an exact known story across editions without fetching a supplied URL',async()=>{
 const db=fakeDatabase(),previous=global.fetch;Store._test.setDatabaseForTests(db);let calls=0;global.fetch=async url=>{calls++;assert.equal(url,require('./published-intelligence.cjs').INDEX_URL);return{ok:true,text:async()=>JSON.stringify({version:1,generatedAt:new Date().toISOString(),articles:[]})};};
 try{
  const row=Reader.decorate(makeItem({edition:'uk',link:'https://publisher.example/exact?oc=5&utm_source=feed'}));await Store.persistRows([row]);
  const found=await api.resolveArticle({url:'https://publisher.example/exact?utm_source=app&oc=7'});assert.equal(found.article.id,row.articleId);assert.equal(found.article.edition,'uk');assert.equal(found.article.sourceUrl,'https://publisher.example/exact');assert(Number.isFinite(Date.parse(found.article.contentExpiresAt)));
  const byID=await api.resolveArticle({id:row.articleId});assert.equal(byID.article.id,row.articleId);
  await assert.rejects(api.resolveArticle({url:row.link,id:'b'.repeat(64)}),e=>e.status===400);
  assert.equal(calls,0,'Known stored records do not contact any publisher or index');
  await assert.rejects(api.resolveArticle({url:'https://publisher.example/another'}),e=>e.status===404);
  assert.equal(calls,1,'A miss fetches only the fixed published index');
 }finally{global.fetch=previous;reset();}
});
test('forged source evidence and citations fail closed while derived injected sections are rebuilt',async()=>{
 const db=fakeDatabase();Store._test.setDatabaseForTests(db);
 try{
  const row=Reader.decorate(makeItem()),scope=Store.scopeOf(row);await Store.persistRows([row]);const key=Store.keyFor(row.articleId,scope),saved=db.records.get(key);
  for(const patch of [{summary:'A forged report claims earnings fell 99 percent.'},{keyPoints:[{text:'A fabricated 99 percent decline was reported.'}]},{numbers:[{value:'999 billion',context:'invented'}]},{sources:[{name:'Publisher',url:'https://attacker.example/'}]}]){
   db.records.set(key,{...saved,brief:{...saved.brief,...patch}});assert.equal(await Store.resolve(row.articleId),null);
  }
  db.records.set(key,{...saved,brief:{...saved.brief,intelligence:{whyItMatters:[{text:'Invented analysis',sourceURL:row.link}]},context:[{title:'Generic',text:'Invented analysis'}]}});
  const result=await Store.resolve(row.articleId);assert(result);assert(!JSON.stringify(result.brief).includes('Invented analysis'));
 }finally{reset();}
});
test('resolver excludes expired and malformed scope records and recalculates currentness',async()=>{
 const db=fakeDatabase();Store._test.setDatabaseForTests(db);
 try{
  const row=Reader.decorate(makeItem({pubDate:new Date(Date.now()-2*86400000).toISOString()})),scope=Store.scopeOf(row);await Store.persistRows([row]);const key=Store.keyFor(row.articleId,scope),saved=db.records.get(key);
  assert.equal((await api.resolveArticle({id:row.articleId})).article.isCurrent,false);
  db.records.set(key,{...saved,expiresAt:new Date(Date.now()-1)});assert.equal(await Store.resolve(row.articleId),null);
  db.records.set(key,{...saved,scope:{edition:['uk'],category:'technology',symbol:''}});assert.equal(await Store.resolve(row.articleId),null);
  db.records.set(key,{...saved,item:{...saved.item,link:'https://publisher.example/different'}});assert.equal(await Store.resolve(row.articleId),null);
 }finally{reset();}
});
test('public resolve selector rejects array and non-HTTPS URLs before any outbound request',async()=>{
 const previous=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('unexpected fetch');};
 try{for(const query of [{url:['https://publisher.example/a']},{url:'http://publisher.example/a'},{url:'https://127.0.0.1/private'},{url:'https://user:password@publisher.example/private'},{id:['a'.repeat(64)]}]){const res=response();await api.handler({method:'GET',query:{kind:'resolve',...query}},res);assert.equal(res.code,400);}assert.equal(calls,0);}
 finally{global.fetch=previous;reset();}
});
test('cross-scope resolution has one overall storage deadline rather than one budget for every record',async()=>{
 const db=fakeDatabase();Store._test.setDatabaseForTests(db);
 try{
  const row=Reader.decorate(makeItem());await Store.persistRows([row]);
  const original=db.collection.bind(db),delay=()=>new Promise(resolve=>setTimeout(resolve,60));
  db.collection=name=>{const collection=original(name);return {...collection,
   where(...args){const query=collection.where(...args);return {limit(n){const limited=query.limit(n);return {async get(){await delay();return limited.get();}};}};},
   doc(id){const ref=collection.doc(id);return {...ref,async get(){await delay();return ref.get();}};}
  };};
  await assert.rejects(Store.resolve(row.articleId,Date.now(),{timeoutMs:100}),error=>error.newsStoreStage==='resolve');
 }finally{reset();}
});
test('database unavailability can recover only an exact current published headline; unknown remains unavailable',async()=>{
 const Published=require('./published-intelligence.cjs'),original=Published.resolve,db=fakeDatabase(),row=makeItem({link:'https://publisher.example/published-match'}),urls=[];
 const payload={version:1,generatedAt:new Date().toISOString(),articles:[{sources:[{url:row.link,title:row.title,publisher:row.source,publishedAt:row.pubDate}],stats:[]}]};
 const databaseFailure={collection(){return{where(){return{limit(){return{async get(){throw Error('Cold Firestore connection unavailable');}};}};}};}};
 const index=(value,fail=false)=>{Published.resolve=Published.createResolver({fetcher:async url=>{urls.push(url);if(fail)throw Error('Published index unavailable');return value;}});};
 try{
  Store._test.setDatabaseForTests(databaseFailure);index(payload);
  const exact=response();await api.handler({method:'GET',query:{kind:'resolve',url:row.link}},exact);
  assert.equal(exact.code,200);assert.equal(exact.body.article.sourceUrl,row.link);assert.equal(exact.body.article.coverageLevel,'headline-only');assert.equal(exact.body.article.summary,row.title);assert.deepEqual(exact.body.article.keyPoints,[]);
  index(payload);const unknown=response();await api.handler({method:'GET',query:{kind:'resolve',url:'https://publisher.example/not-published'}},unknown);assert.equal(unknown.code,503);assert(!unknown.body.article);
  index(payload,true);const unavailable=response();await api.handler({method:'GET',query:{kind:'resolve',url:row.link}},unavailable);assert.equal(unavailable.code,503);assert(!unavailable.body.article);
  Store._test.setDatabaseForTests(db);index(payload);const absent=response();await api.handler({method:'GET',query:{kind:'resolve',url:'https://publisher.example/not-published'}},absent);assert.equal(absent.code,404);
  assert.equal(urls.length,4);assert(urls.every(url=>url===Published.INDEX_URL),'Recovery fetches only the fixed FYNX index');
 }finally{Published.resolve=original;reset();}
});
