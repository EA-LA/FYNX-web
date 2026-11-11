'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Store=require('./news-reader-store.cjs'),Reader=require('./news-reader.cjs'),api=require('./market-feed')._test;
function fakeDatabase(){
 const records=new Map(),stats={commits:0,reads:0,sets:0,deletes:0,cleanupLimits:[]};let rejectWrites=false;
 const ref=id=>({id,async get(){stats.reads++;return{exists:records.has(id),data:()=>records.get(id)};},async delete(){stats.deletes++;records.delete(id);}});
 const db={records,stats,set rejectWrites(v){rejectWrites=v;},collection(name){assert.equal(name,Store.COLLECTION);return {doc:ref,where(field,op,date){assert.equal(field,'expiresAt');assert.equal(op,'<=');return{limit(n){stats.cleanupLimits.push(n);return{async get(){return{docs:[...records].filter(([,row])=>row.expiresAt<=date).slice(0,n).map(([id])=>({ref:ref(id)}))};}};}};}};},batch(){const ops=[];return{set(r,value){ops.push(['set',r,value]);},delete(r){ops.push(['delete',r]);},async commit(){stats.commits++;if(rejectWrites)throw Error('Firestore unavailable');for(const [type,r,v] of ops){if(type==='set'){stats.sets++;records.set(r.id,{...v,scope:{category:v.scope.category,symbol:v.scope.symbol,edition:v.scope.edition}});}else{stats.deletes++;records.delete(r.id);}}}};}};
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
