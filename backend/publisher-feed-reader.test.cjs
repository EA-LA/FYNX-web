'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('./publisher-feed-reader.cjs'),Reader=require('./news-reader.cjs'),api=require('./market-feed')._test;
const now=Date.parse('2026-11-15T18:00:00Z'),date=new Date(now-3600000).toUTCString();
const url='https://www.cnbc.com/investingclub/2026/11/15/3-big-things-were-watching-in-the-stock-market-in-the-week-ahead.html';
const title="3 big things we're watching in the stock market in the week ahead",description='Nvidia and Anthropic will share the spotlight in a pivotal week for the AI trade.';
const xml=(link=url,published=date,extra='')=>`<rss><channel><item><title>${title}</title><link>${link}</link><pubDate>${published}</pubDate><description>${description}</description>${extra}</item></channel></rss>`;
test('the exact current CNBC card resolves through fixed publisher feeds without fetching its restricted article',async()=>{
 const calls=[],resolve=P.createResolver({now:()=>now,officialFeeds:()=>[],fetcher:async target=>{calls.push(target);return xml();}});
 const result=await resolve(Reader.articleId(url),{sourceURL:url});assert.equal(result.item.title,title);assert.equal(result.item.description,description);assert.equal(result.item.link,url);
 assert(calls.every(target=>P.PUBLISHER_FEEDS.filter(f=>f.source==='CNBC').some(f=>f.url===target)));assert(!calls.includes(url));assert.equal(result.item.image,undefined);
 const brief=Reader.createBrief(result.item,{now});assert.equal(brief.coverageLevel,'publisher-excerpt');assert.equal(brief.summary,description);assert.equal(brief.keyPoints.length,0);
});
test('BBC and MarketWatch exact source records are matched with their own publisher identity',async()=>{
 for(const [source,link] of [['BBC Business','https://www.bbc.co.uk/news/articles/qa?at_medium=RSS'],['MarketWatch','https://www.marketwatch.com/story/qa?mod=mw_rss_topstories']]){
  const calls=[],resolve=P.createResolver({now:()=>now,officialFeeds:()=>[],fetcher:async target=>{calls.push(target);return xml(link);}}),result=await resolve(Reader.articleId(link),{sourceURL:link});
  assert.equal(result.item.source,source);assert.equal(result.item.link,link);assert.equal(calls.length,1);assert.equal(calls[0],P.PUBLISHER_FEEDS.find(f=>f.source===source).url);
 }
});
test('reader-only retention covers yesterday and the previous week without broadening headline feed freshness',async()=>{
 const old=new Date(now-48*3600000).toUTCString(),resolve=P.createResolver({now:()=>now,officialFeeds:()=>[],fetcher:async()=>xml(url,old)});
 assert.equal(api.parseFeed(xml(url,old),now).length,0);assert(await resolve(Reader.articleId(url),{sourceURL:url}));
 const expired=P.createResolver({now:()=>now,officialFeeds:()=>[],fetcher:async()=>xml(url,new Date(now-8*86400000).toUTCString())});assert.equal(await expired(Reader.articleId(url),{sourceURL:url}),null);
});
test('arbitrary input URLs cannot become fetch targets or masquerade as a different feed record',async()=>{
 const calls=[],resolve=P.createResolver({now:()=>now,officialFeeds:()=>[],fetcher:async target=>{calls.push(target);return xml();}});
 const foreign='https://www.cnbc.com.attacker.example/private';assert.equal(await resolve(Reader.articleId(foreign),{sourceURL:foreign}),null);assert.equal(calls.length,0);
 const absent='https://www.cnbc.com/not-issued-by-the-feed';assert.equal(await resolve(Reader.articleId(absent),{sourceURL:absent}),null);assert(calls.every(t=>P.PUBLISHER_FEEDS.some(f=>f.url===t)));
 await assert.rejects(resolve(Reader.articleId(url),{sourceURL:'https://www.cnbc.com/different'}),e=>e.status===400);
 const forged=P.createResolver({now:()=>now,officialFeeds:()=>[],fetcher:async()=>xml('https://attacker.example/unrelated')});assert.equal(await forged(Reader.articleId(url),{sourceURL:url}),null);
});
test('feed fetches coalesce, cache for five minutes and fail unavailable rather than falsely missing on an outage',async()=>{
 let clock=now,calls=0;const resolve=P.createResolver({now:()=>clock,officialFeeds:()=>[],fetcher:async()=>{calls++;await new Promise(r=>setTimeout(r,5));return xml();}});
 const first=await Promise.all([resolve(Reader.articleId(url),{sourceURL:url}),resolve(Reader.articleId(url),{sourceURL:url})]);assert.equal(calls,2);
 clock+=60000;const cached=await resolve(Reader.articleId(url),{sourceURL:url});assert.equal(calls,2);assert.equal(cached.fetchedAt,first[0].fetchedAt,'A cache hit must preserve the actual feed check time');clock+=P.CACHE_MS+1;await resolve(Reader.articleId(url),{sourceURL:url});assert.equal(calls,4);
 const failure=P.createResolver({officialFeeds:()=>[],fetcher:async()=>{throw Error('Offline');}});await assert.rejects(failure(Reader.articleId(url),{sourceURL:url}),/unavailable/);
});
test('licensed image contract binds the exact article and expiry; mismatched, expired and unlicensed images are omitted',()=>{
 const item={title,link:url,pubDate:new Date(now-3600000).toISOString(),source:'CNBC'},image={url:'https://images.example/report.jpg',sourceURL:url,credit:'Example photographer',licenseURL:'https://creativecommons.org/licenses/by/4.0/',width:1600,height:900};
 const valid=Reader.approvedImage(image,item,{now});assert.equal(valid.articleID,Reader.articleId(url));assert.equal(valid.sourceURL,url);assert.equal(valid.license,'CC BY 4.0');assert.equal(valid.width,1600);assert(Date.parse(valid.expiresAt)>now);
 for(const change of [{articleID:'a'.repeat(64)},{sourceURL:'https://www.cnbc.com/different'},{expiresAt:new Date(now-1).toISOString()},{licenseURL:'https://publisher.example/terms'},{credit:''}])assert.equal(Reader.approvedImage({...image,...change},item,{now}),null);
 const related=Reader.relatedRows({...item,title:'Nvidia leadership announcement',description:'Nvidia earnings are scheduled this week.'},[{...item,link:'https://www.cnbc.com/another',title:'Nvidia earnings preview',image:{...image,sourceURL:'https://www.cnbc.com/another'}}],now);
 assert.equal(related.length,1);assert.equal(related[0].sourceUrl,'https://www.cnbc.com/another');assert.equal(related[0].image.articleID,related[0].articleId);
});
test('slow optional enrichment still returns the saved exact feed brief within one overall optional budget',async()=>{
 const Store=require('./news-reader-store.cjs'),Published=require('./published-intelligence.cjs'),original={resolve:P.resolve,read:Store.resolve,persist:Store.persistRows,enhance:Reader.enhance,context:Published.contextFor};let saved=false;
 const item={title,link:url,pubDate:new Date().toISOString(),source:'CNBC',description,edition:'global',category:'all'};
 try{
  Reader.articleCache.clear();Store.resolve=async()=>null;P.resolve=async()=>({item,pool:[],fetchedAt:new Date().toISOString(),expiresAt:Date.now()+86400000});Store.persistRows=async(rows,at,options)=>{assert.equal(rows[0].reader.id,Reader.articleId(url));assert(options.timeoutMs<=900);saved=true;};
  Reader.enhance=()=>{assert(saved);return new Promise(()=>{});};Published.contextFor=()=>new Promise(()=>{});
  const began=Date.now(),result=await api.resolveArticle({url},{enrichmentTimeoutMs:20});assert(Date.now()-began<1000);assert.equal(result.article.title,title);assert.equal(result.article.summary,description);assert.deepEqual(result.article.marketContext,[]);
 }finally{P.resolve=original.resolve;Store.resolve=original.read;Store.persistRows=original.persist;Reader.enhance=original.enhance;Published.contextFor=original.context;Reader.articleCache.clear();}
});
test('the reviewed context photograph is explicit, historical, story-bound and never overrides an approved article photograph',()=>{
 const item={title,link:url,pubDate:new Date(now-3600000).toISOString(),source:'CNBC',description};
 const photo=Reader.createBrief(item,{now}).image;assert.equal(photo.kind,'context');assert.equal(photo.articleID,Reader.articleId(url));assert.equal(photo.sourceURL,url);assert.match(photo.caption,/photographed in 2018/);assert.equal(photo.sourcePage,'https://commons.wikimedia.org/wiki/File:NVIDIA_Headquarters.jpg');assert.equal(photo.licenseURL,'https://creativecommons.org/licenses/by-sa/4.0/');assert.match(photo.credit,/Coolcaesar/);assert.match(photo.credit,/Jacek Halicki/);
 for(const text of ['AI stocks rise this week','A report about Nvidian products','Anthropic earnings overview'])assert.equal(Reader.createBrief({...item,title:text,description:''},{now}).image,null);
 const original={url:'https://images.publisher.example/original.jpg',sourceURL:url,credit:'Publisher photographer',licenseURL:'https://creativecommons.org/licenses/by/4.0/'};
 assert.equal(Reader.createBrief({...item,image:original},{now}).image.url,original.url);
 const nextURL='https://www.cnbc.com/different-nvidia-story';const next=Reader.createBrief({...item,link:nextURL},{now}).image;assert.equal(next.articleID,Reader.articleId(nextURL));assert.equal(next.sourceURL,nextURL);assert.notEqual(next.articleID,photo.articleID);
});
test('a fresh ID-only share resolves the exact current CNBC record without seeded storage; an unknown ID is bounded and missing',async()=>{
 const Store=require('./news-reader-store.cjs'),Published=require('./published-intelligence.cjs'),original={resolve:P.resolve,read:Store.resolve,persist:Store.persistRows,enhance:Reader.enhance,context:Published.contextFor,published:Published.resolve},calls=[];
 const current=Date.now(),sourceDate=new Date(current-60000).toUTCString();
 try{
  Reader.articleCache.clear();Store.resolve=async()=>null;Store.persistRows=async()=>{};Reader.enhance=async(item,pool)=>Reader.createBrief(item,{related:pool});Published.contextFor=async()=>[];Published.resolve=async()=>null;
  P.resolve=P.createResolver({officialFeeds:()=>[],fetcher:async target=>{calls.push(target);assert(P.PUBLISHER_FEEDS.some(f=>f.url===target));return target.includes('cnbc.com')?xml(url,sourceDate):'<rss><channel></channel></rss>';}});
  const result=await api.resolveArticle({id:Reader.articleId(url)});assert.equal(result.article.title,title);assert.equal(result.article.sourceUrl,url);assert.equal(result.article.id,Reader.articleId(url));assert.equal(calls.length,4);assert(!calls.includes(url));
  const started=Date.now();await assert.rejects(api.resolveArticle({id:'a'.repeat(64)}),error=>error.status===404);assert(Date.now()-started<1000);assert.equal(calls.length,4,'Unknown IDs reuse the bounded fixed-feed cache');
 }finally{P.resolve=original.resolve;Store.resolve=original.read;Store.persistRows=original.persist;Reader.enhance=original.enhance;Published.contextFor=original.context;Published.resolve=original.published;Reader.articleCache.clear();}
});
