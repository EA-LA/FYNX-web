'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('./published-intelligence.cjs'),R=require('./news-reader.cjs');
const now=Date.parse('2026-11-15T12:00:00Z'),url='https://publisher.example/exact-story',id=R.articleId(url);
const stat=(extra={})=>({symbol:'^GSPC',name:'S&P 500',price:6000,day:1.2,unit:'%',asOf:new Date(now-2*86400000).toISOString(),source:'Yahoo Finance (delayed)',assetClass:'indices',...extra});
const fixture=()=>({version:1,generatedAt:new Date(now-10000).toISOString(),articles:[{headline:'Another source’s cluster headline',summary:'DO NOT REUSE',narrative:'DO NOT REUSE',whyData:'DO NOT REUSE',sources:[{url,publisher:'Exact Publisher',title:'The exact original source headline',publishedAt:new Date(now-60000).toISOString()}],stats:[stat()]}]});
test('exact source identity selects its own title and date, with separate dated numeric context',()=>{
 const value=P.normalize(fixture(),id,now);assert.equal(value.article.id,id);assert.equal(value.article.title,'The exact original source headline');assert.equal(value.article.source,'Exact Publisher');assert.equal(value.article.publishedAt,new Date(now-60000).toISOString());assert.equal(value.article.coverageLevel,'headline-only');assert.equal(value.article.summary,value.article.title);assert(!JSON.stringify(value).includes('DO NOT REUSE'));assert(value.article.intelligence.marketImpact.length===0);
 assert.equal(value.article.marketContext[0].asOf,stat().asOf);assert.equal(value.article.marketContext[0].changePercent,1.2);assert.equal(value.article.marketContext[0].currency,undefined);assert.equal(value.article.marketContext[0].sourceURL,'https://finance.yahoo.com/quote/%5EGSPC/');
});
test('an absent or ambiguous source URL is unavailable rather than matched by title or similarity',()=>{
 const p=fixture();assert.equal(P.normalize(p,R.articleId('https://publisher.example/other'),now),null);p.articles.push({...p.articles[0],headline:'Other event'});assert.equal(P.normalize(p,id,now),null);
});
test('expired index/source dates and future provider times cannot provide a fallback brief',()=>{
 for(const patch of [{generatedAt:new Date(now-86400001).toISOString()},{generatedAt:new Date(now+600000).toISOString()}])assert.equal(P.normalize({...fixture(),...patch},id,now),null);
 const p=fixture();p.articles[0].sources[0].publishedAt=new Date(now-8*86400000).toISOString();assert.equal(P.normalize(p,id,now),null);
 const q=fixture();q.articles[0].stats=[stat({asOf:new Date(now+600000).toISOString()})];assert.deepEqual(P.normalize(q,id,now).article.marketContext,[]);
});
test('quote limits reject old crypto, stale cash prices, invalid numbers and unknown providers; basis points are never percent',()=>{
 const p=fixture();p.articles[0].stats=[stat({symbol:'BTC-USD',assetClass:'crypto',asOf:new Date(now-3600001).toISOString()}),stat({symbol:'OLD',asOf:new Date(now-5*86400000).toISOString()}),stat({symbol:'NAN',price:NaN}),stat({symbol:'FAKE',source:'Unverified provider'}),stat({symbol:'^TNX',unit:'bp',day:4,assetClass:'rates'})];
 const rows=P.normalize(p,id,now).article.marketContext;assert.equal(rows.length,1);assert.equal(rows[0].symbol,'^TNX');assert.equal(rows[0].changePercent,null);assert.equal(rows[0].changeValue,4);assert.equal(rows[0].changeUnit,'bp');
});
test('the fallback fetches one fixed URL, coalesces requests, revalidates cache ages and never fetches a supplied source URL',async()=>{
 let calls=0,clock=now;const resolver=P.createResolver({now:()=>clock,fetcher:async target=>{calls++;assert.equal(target,P.INDEX_URL);await new Promise(r=>setTimeout(r,10));return fixture();}});
 const values=await Promise.all([resolver(id),resolver(id)]);assert.equal(calls,1);assert.equal(values[0].article.id,id);assert.equal(values[1].article.id,id);await resolver(id);assert.equal(calls,1);
 await assert.rejects(resolver('https://127.0.0.1/private'),e=>e.status===400);assert.equal(calls,1);
 clock=now+86400001;await assert.rejects(resolver(id),/unavailable/);assert.equal(calls,2);
});
test('a provider outage is unavailable, not a false definitive missing-story result',async()=>{
 let calls=0;const resolver=P.createResolver({now:()=>now,fetcher:async()=>{calls++;throw Error('offline');}});await assert.rejects(resolver(id));await assert.rejects(resolver(id));assert.equal(calls,1);
});
test('independent snapshots require an explicit publisher-evidence company name and reject ambiguous, conflicting or stale data',()=>{
 const p=fixture();p.articles[0].companies=[{name:'Nvidia',ticker:'NVDA'},{name:'Apple',ticker:'AAPL'}];p.articles[0].stats=[stat({symbol:'NVDA',name:'Nvidia'}),stat({symbol:'AAPL',name:'Apple'})];
 const item={title:'The week ahead',description:'Nvidia and Anthropic will share the spotlight in the AI trade.'};
 const values=P.namedMarketContext(p,item,now);assert.equal(values.length,1);assert.equal(values[0].symbol,'NVDA');assert.equal(values[0].asOf,stat().asOf);assert(!JSON.stringify(values).includes('reaction'));
 assert.deepEqual(P.namedMarketContext(p,{title:'Apple harvest expands',description:''},now),[]);assert.deepEqual(P.namedMarketContext(p,{title:'Unrelated central bank report'},now),[]);
 p.articles.push({companies:[],stats:[stat({symbol:'NVDA',name:'Nvidia',price:9999})]});assert.deepEqual(P.namedMarketContext(p,item,now),[]);
 assert.deepEqual(P.namedMarketContext({...fixture(),generatedAt:new Date(now-2*86400000).toISOString()},item,now),[]);
});
test('only complete exact-source-bound published excerpts and licensed images survive the common reader',()=>{
 const p=fixture(),source=p.articles[0].sources[0],text='The company reported that its earnings rose by 12 percent compared with the previous quarter.';
 const excerpt={articleID:id,sourceURL:url,publisher:source.publisher,text,expiresAt:new Date(now+3600000).toISOString()};p.articles[0].excerpt=excerpt;
 let result=P.normalize(p,id,now);assert.equal(result.article.coverageLevel,'publisher-excerpt');assert.equal(result.article.summary,text);assert.equal(result.article.contentExpiresAt,excerpt.expiresAt);
 for(const patch of [{sourceURL:'https://publisher.example/another'},{articleID:'b'.repeat(64)},{text:text+'…'},{expiresAt:new Date(now-1).toISOString()}]){p.articles[0].excerpt={...excerpt,...patch};assert.equal(P.normalize(p,id,now).article.coverageLevel,'headline-only');}
 p.articles[0].excerpt=excerpt;source.image={url:'https://images.example/a.jpg',sourceURL:url,articleID:id,licenseURL:'https://creativecommons.org/licenses/by/4.0/',credit:'Publisher photographer',expiresAt:new Date(now+7200000).toISOString()};result=P.normalize(p,id,now);assert.equal(result.article.image.expiresAt,excerpt.expiresAt);assert.equal(result.article.image.articleID,id);
 source.image.sourceURL='https://publisher.example/other';assert.equal(P.normalize(p,id,now).article.image,null);
});
test('the publishing pipeline retains complete evidence and exact provenance, and retries old null or clipped excerpts',()=>{
 const Pipeline=require('../scripts/build-intelligence.cjs'),item={source:'Publisher',title:'Company reports earnings increase',url,publishedAt:new Date(now-60000).toISOString()},description='The company reported earnings increased by 12 percent compared with the previous quarter. The company scheduled its next earnings release for November 20, 2026.';
 const article=R.createBrief({source:item.source,title:item.title,link:url,pubDate:item.publishedAt,description},{now});article.contentExpiresAt=new Date(now+3600000).toISOString();
 const excerpt=Pipeline.excerptFromArticle(article,item,now);assert(excerpt);assert.equal(excerpt.articleID,id);assert.equal(excerpt.sourceURL,url);assert(!excerpt.text.includes('…'));assert(excerpt.text.includes('November 20, 2026.'));assert(Pipeline.reusableExcerpt(excerpt,item,now));
 assert.equal(Pipeline.reusableExcerpt(null,item,now),false);assert.equal(Pipeline.reusableExcerpt({...excerpt,text:excerpt.text+'…'},item,now),false);assert.equal(Pipeline.excerptFromArticle({...article,sourceUrl:'https://publisher.example/wrong'},item,now),null);
});
