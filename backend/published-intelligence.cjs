'use strict';
const Reader=require('./news-reader.cjs');
const INDEX_URL='https://www.fynxfinanceworld.com/intelligence/data/articles.json',INDEX_TIMEOUT_MS=4000,DAY=86400000;
const OFFICIAL_HOSTS=new Set(['www.federalreserve.gov','federalreserve.gov','www.bea.gov','bea.gov','apps.bea.gov','www.ecb.europa.eu','ecb.europa.eu','www.bankofengland.co.uk','bankofengland.co.uk','www.bankofcanada.ca','bankofcanada.ca','www.boj.or.jp','boj.or.jp','www.rba.gov.au','rba.gov.au']);
const validTime=(value,now,maxAge)=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)>0&&Date.parse(value)<=now+300000&&now-Date.parse(value)<=maxAge;
function normalize(payload,id,now=Date.now()) {
  if(payload?.version!==1||!validTime(payload.generatedAt,now,DAY)||!Array.isArray(payload.articles)||payload.articles.length>2000)return null;
  const matches=[];
  for(const row of payload.articles){
    if(!row||!Array.isArray(row.sources)||row.sources.length>20)continue;
    for(const source of row.sources)if(source&&Reader.articleId(source.url)===id)matches.push({row,source});
  }
  // A shared URL appearing in multiple clusters must not silently pick another
  // story's title or market associations. Keep an ambiguous match unavailable.
  if(matches.length!==1)return null;
  const {row,source}=matches[0],sourceUrl=Reader.safeURL(source.url),official=OFFICIAL_HOSTS.has(new URL(sourceUrl).hostname);
  if(!validTime(source.publishedAt,now,(official?30:7)*DAY)||Date.parse(source.publishedAt)>Date.parse(payload.generatedAt)+300000||typeof source.title!=='string'||!source.title.trim()||source.title.length>2000||typeof source.publisher!=='string'||!source.publisher.trim()||source.publisher.length>180)return null;
  const generated=Date.parse(payload.generatedAt);
  const article=Reader.createBrief({title:source.title,source:source.publisher,link:sourceUrl,pubDate:source.publishedAt,edition:'global',category:'all',kind:official?'official-release':'headline',description:''},{now:generated});
  article.coverageNote='FYNX matched this exact source in its published Intelligence index. Only headline metadata is available here. Any dated market snapshots below are separate context, not evidence of a reaction to this story.';
  article.contentExpiresAt=new Date(Math.min(Date.parse(source.publishedAt)+(official?30:7)*DAY,generated+DAY)).toISOString();
  article.isCurrent=now-Date.parse(source.publishedAt)<=DAY;
  article.marketContext=[];
  const seen=new Set();
  for(const stat of (Array.isArray(row.stats)?row.stats:[]).slice(0,40)){
    if(!stat||typeof stat.symbol!=='string'||!/^[A-Za-z0-9^=._-]{1,40}$/.test(stat.symbol)||seen.has(stat.symbol)||typeof stat.name!=='string'||!stat.name.trim()||stat.name.length>160||!Number.isFinite(stat.price)||stat.price<=0||!validTime(stat.asOf,now,stat.assetClass==='crypto'?3600000:4*DAY)||Date.parse(stat.asOf)>generated+300000)continue;
    // The existing index has one documented quote provider. Unknown source
    // labels or currency/units must not be invented into a verified snapshot.
    if(stat.source!=='Yahoo Finance (delayed)')continue;
    const sourceURL=`https://finance.yahoo.com/quote/${encodeURIComponent(stat.symbol)}/`;
    const changeUnit=['%','bp'].includes(stat.unit)?stat.unit:null,changeValue=Number.isFinite(stat.day)&&changeUnit?stat.day:null;
    const value={symbol:stat.symbol,name:Reader.plain(stat.name,160),price:stat.price,changePercent:changeUnit==='%'?changeValue:null,asOf:new Date(Date.parse(stat.asOf)).toISOString(),source:stat.source,sourceURL,changeValue,changeUnit};
    if(typeof stat.currency==='string'&&/^(?:[A-Z]{3}|GBp|ZAc)$/.test(stat.currency))value.currency=stat.currency;
    article.marketContext.push(value);seen.add(stat.symbol);if(article.marketContext.length===6)break;
  }
  article.publishedMarketContext=INDEX_URL;
  return {kind:'article',article,fetchedAt:payload.generatedAt,freshForMs:300000};
}
function createResolver({fetcher=async url=>JSON.parse((await Reader.boundedFetch(url,{maxBytes:2_000_000,timeoutMs:INDEX_TIMEOUT_MS,accept:'application/json'})).text),now=()=>Date.now()}={}) {
  let cached,pending,failedAt;
  return async function resolve(id){
    if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Object.assign(new Error('Invalid article identifier'),{status:400});
    const at=now();
    if(cached&&at>=cached.at&&at-cached.at<300000&&validTime(cached.payload.generatedAt,at,DAY))return normalize(cached.payload,id,at);
    if(failedAt!==undefined&&at-failedAt>=0&&at-failedAt<30000)throw new Error('Published Intelligence is temporarily unavailable');
    if(!pending)pending=(async()=>{
      try{const payload=await fetcher(INDEX_URL);if(payload?.version!==1||!validTime(payload.generatedAt,now(),DAY)||!Array.isArray(payload.articles)||payload.articles.length>2000)throw new Error('Published Intelligence index is unavailable');cached={payload,at:now()};failedAt=undefined;return payload;}
      catch(error){failedAt=now();throw error;}
      finally{pending=null;}
    })();
    return normalize(await pending,id,now());
  };
}
module.exports={INDEX_URL,INDEX_TIMEOUT_MS,normalize,createResolver,resolve:createResolver()};
