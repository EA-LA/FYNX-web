'use strict';
const Reader=require('./news-reader.cjs');
const MAX_BYTES=2_000_000,TIMEOUT_MS=4000,CACHE_MS=300000;
const PUBLISHER_FEEDS=Object.freeze([
 {id:'cnbc-top',source:'CNBC',url:'https://www.cnbc.com/id/100003114/device/rss/rss.html',hosts:['www.cnbc.com','cnbc.com']},
 {id:'cnbc-markets',source:'CNBC',url:'https://www.cnbc.com/id/10000664/device/rss/rss.html',hosts:['www.cnbc.com','cnbc.com']},
 {id:'bbc-business',source:'BBC Business',url:'https://feeds.bbci.co.uk/news/business/rss.xml',hosts:['www.bbc.co.uk','bbc.co.uk','www.bbc.com','bbc.com']},
 {id:'marketwatch',source:'MarketWatch',url:'https://feeds.content.dowjones.io/public/rss/mw_topstories',hosts:['www.marketwatch.com','marketwatch.com']}
]);
function createResolver({feeds=PUBLISHER_FEEDS,officialFeeds=()=>require('./market-feed')._test.officialSources.map(f=>({...f,source:f.name,official:true})),parse=(xml,now,options)=>require('./market-feed')._test.parseFeed(xml,now,options),fetcher=url=>Reader.boundedFetch(url,{maxBytes:MAX_BYTES,timeoutMs:TIMEOUT_MS,accept:'application/rss+xml,application/xml,text/xml'}).then(r=>r.text),now=()=>Date.now()}={}){
 const cache=new Map(),pending=new Map(),failed=new Map();
 async function load(feed){
  const at=now(),old=cache.get(feed.id);if(old&&at>=old.at&&at-old.at<CACHE_MS)return old;
  if(failed.has(feed.id)&&at-failed.get(feed.id)<30000)throw Error('Publisher feed unavailable');
  if(pending.has(feed.id))return pending.get(feed.id);
  const task=(async()=>{try{
   const xml=await fetcher(feed.url),checked=now();
   const rows=parse(xml,checked,{source:feed.source,hosts:feed.hosts,official:feed.official===true,upgradeHTTP:feed.upgradeHTTP===true,readerRetention:true})
    .map(row=>({...row,edition:'global',category:'all',kind:feed.official?'official-release':'headline'}));
   const result={rows,at:checked};cache.set(feed.id,result);failed.delete(feed.id);return result;
  }catch(error){failed.set(feed.id,now());throw error;}finally{pending.delete(feed.id);}})();pending.set(feed.id,task);return task;
 }
 return async function resolve(id,{sourceURL}={}){
  if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Object.assign(Error('Invalid article identifier'),{status:400});
  let selected=feeds;
  if(sourceURL!==undefined){
   const safe=Reader.safeURL(sourceURL);if(!safe||Reader.articleId(safe)!==id)throw Object.assign(Error('Source identity mismatch'),{status:400});
   const host=new URL(safe).hostname;selected=[...feeds,...officialFeeds()].filter(f=>f.hosts.includes(host));
  }
  if(!selected.length)return null;
  // Only these fixed feed URLs are fetched. Input URLs select an exact hash
  // within publisher-returned records; they never become network targets.
  const results=await Promise.allSettled(selected.map(load)),at=now();
  const pool=results.flatMap(r=>r.status==='fulfilled'?r.value.rows:[]).filter(row=>{
   const published=Date.parse(row.pubDate);return Number.isFinite(published)&&published<=at+300000&&published>at-(row.kind==='official-release'?30:7)*86400000;
  });
  const matches=pool.filter(row=>Reader.articleId(row.link)===id).sort((a,b)=>Date.parse(b.pubDate)-Date.parse(a.pubDate));
  if(matches.length){const item=matches[0],checked=results.find(r=>r.status==='fulfilled'&&r.value.rows.includes(item))?.value.at||at;return{item,pool,fetchedAt:new Date(checked).toISOString(),expiresAt:Date.parse(item.pubDate)+(item.kind==='official-release'?30:7)*86400000};}
  if(results.some(r=>r.status==='rejected'))throw Error('Publisher feed unavailable');
  return null;
 };
}
module.exports={PUBLISHER_FEEDS,MAX_BYTES,TIMEOUT_MS,CACHE_MS,createResolver,resolve:createResolver()};
