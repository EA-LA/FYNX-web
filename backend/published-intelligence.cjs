'use strict';
const Reader=require('./news-reader.cjs');
const INDEX_URL='https://www.fynxfinanceworld.com/intelligence/data/articles.json',INDEX_TIMEOUT_MS=4000,DAY=86400000;
const OFFICIAL_HOSTS=new Set(['www.federalreserve.gov','federalreserve.gov','www.bea.gov','bea.gov','apps.bea.gov','www.ecb.europa.eu','ecb.europa.eu','www.bankofengland.co.uk','bankofengland.co.uk','www.bankofcanada.ca','bankofcanada.ca','www.boj.or.jp','boj.or.jp','www.rba.gov.au','rba.gov.au']);
const validTime=(value,now,maxAge)=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)>0&&Date.parse(value)<=now+300000&&now-Date.parse(value)<=maxAge;
function marketValue(stat,generated,now){
  if(!stat||typeof stat.symbol!=='string'||!/^[A-Za-z0-9^=._-]{1,40}$/.test(stat.symbol)||typeof stat.name!=='string'||!stat.name.trim()||stat.name.length>160||!Number.isFinite(stat.price)||stat.price<=0||!validTime(stat.asOf,now,stat.assetClass==='crypto'?3600000:4*DAY)||Date.parse(stat.asOf)>generated+300000||stat.source!=='Yahoo Finance (delayed)')return null;
  const changeUnit=['%','bp'].includes(stat.unit)?stat.unit:null,changeValue=Number.isFinite(stat.day)&&changeUnit?stat.day:null;
  const value={symbol:stat.symbol,name:Reader.plain(stat.name,160),price:stat.price,changePercent:changeUnit==='%'?changeValue:null,asOf:new Date(Date.parse(stat.asOf)).toISOString(),source:stat.source,sourceURL:`https://finance.yahoo.com/quote/${encodeURIComponent(stat.symbol)}/`,changeValue,changeUnit};
  if(typeof stat.currency==='string'&&/^(?:[A-Z]{3}|GBp|ZAc)$/.test(stat.currency))value.currency=stat.currency;
  return value;
}
function namedMarketContext(payload,item,now=Date.now()){
  if(payload?.version!==1||!validTime(payload.generatedAt,now,DAY)||!Array.isArray(payload.articles)||payload.articles.length>2000)return [];
  // Only explicit names in the trusted publisher record establish relevance.
  // These are independent observations, never evidence of a story reaction.
  const evidence=Reader.plain((item.title||'')+' '+(item.description||'')),symbols=new Set(),escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const ambiguous=new Set(['apple','meta','target','shell','block','visa','gap','ford','next']);
  for(const row of payload.articles)for(const company of (Array.isArray(row.companies)?row.companies:[]).slice(0,20)){
    if(typeof company.name!=='string'||company.name.length<4||company.name.length>100||typeof company.ticker!=='string'||!/^[A-Z][A-Z0-9.-]{1,9}$/.test(company.ticker))continue;
    if(new RegExp('\\b'+escape(company.ticker)+'\\b').test(evidence)||(!ambiguous.has(company.name.toLowerCase())&&new RegExp('\\b'+escape(company.name)+'\\b','i').test(evidence)))symbols.add(company.ticker);
  }
  const values=new Map(),conflicts=new Set(),generated=Date.parse(payload.generatedAt);
  for(const row of payload.articles)for(const stat of (Array.isArray(row.stats)?row.stats:[]).slice(0,40)){
    if(!symbols.has(stat?.symbol))continue;const value=marketValue(stat,generated,now);if(!value)continue;const old=values.get(value.symbol);
    if(old&&old.asOf===value.asOf&&(old.price!==value.price||old.changeValue!==value.changeValue||old.changeUnit!==value.changeUnit)){conflicts.add(value.symbol);continue;}
    if(!old||value.asOf>old.asOf)values.set(value.symbol,value);
  }
  return [...values.values()].filter(v=>!conflicts.has(v.symbol)).slice(0,6);
}
function boundExcerpt(excerpt,source,id,now){
  return excerpt&&excerpt.articleID===id&&Reader.safeURL(excerpt.sourceURL)===Reader.safeURL(source.url)&&excerpt.publisher===source.publisher&&typeof excerpt.text==='string'&&excerpt.text.length<=3000&&excerpt.text.split(/\s+/).length<=78&&/[.!]["”’')]*$/.test(excerpt.text)&&!/[\u2026]|\.\.\./.test(excerpt.text)&&Number.isFinite(Date.parse(excerpt.expiresAt))&&Date.parse(excerpt.expiresAt)>now?excerpt:null;
}
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
  const excerpt=boundExcerpt(row.excerpt,source,id,now),expiry=Math.min(Date.parse(source.publishedAt)+(official?30:7)*DAY,generated+DAY,excerpt?Date.parse(excerpt.expiresAt):Infinity);
  const item={title:source.title,source:source.publisher,link:sourceUrl,pubDate:source.publishedAt,edition:'global',category:'all',kind:official?'official-release':'headline',description:excerpt?.text||'',image:source.image||excerpt?.image};
  const article=Reader.createBrief(item,{now:generated});
  article.image=Reader.articleImage(item,{now,expiresAt:expiry});
  if(!excerpt)article.coverageNote='FYNX matched this exact source in its published Intelligence index. Only headline metadata is available here. Any dated market snapshots below are separate context, not evidence of a reaction to this story.';
  article.contentExpiresAt=new Date(expiry).toISOString();
  const pool=payload.articles.flatMap(r=>(Array.isArray(r.sources)?r.sources:[]).slice(0,20)).filter(s=>s&&typeof s.title==='string'&&typeof s.publisher==='string'&&Reader.safeURL(s.url)&&validTime(s.publishedAt,now,7*DAY)).map(s=>({title:s.title,source:s.publisher,link:s.url,pubDate:s.publishedAt,image:s.image,edition:'global',category:'all'}));
  article.related=Reader.relatedRows(item,pool,now);
  article.isCurrent=now-Date.parse(source.publishedAt)<=DAY;
  article.marketContext=[];
  const seen=new Set();
  for(const stat of (Array.isArray(row.stats)?row.stats:[]).slice(0,40)){
    const value=marketValue(stat,generated,now);if(!value||seen.has(value.symbol))continue;
    article.marketContext.push(value);seen.add(stat.symbol);if(article.marketContext.length===6)break;
  }
  article.publishedMarketContext=INDEX_URL;
  return {kind:'article',article,fetchedAt:payload.generatedAt,freshForMs:300000};
}
function createResolver({fetcher=async url=>JSON.parse((await Reader.boundedFetch(url,{maxBytes:2_000_000,timeoutMs:INDEX_TIMEOUT_MS,accept:'application/json'})).text),now=()=>Date.now()}={}) {
  let cached,pending,failedAt;
  async function load(){
    const at=now();
    if(cached&&at>=cached.at&&at-cached.at<300000&&validTime(cached.payload.generatedAt,at,DAY))return cached.payload;
    if(failedAt!==undefined&&at-failedAt>=0&&at-failedAt<30000)throw new Error('Published Intelligence is temporarily unavailable');
    if(!pending)pending=(async()=>{
      try{const payload=await fetcher(INDEX_URL);if(payload?.version!==1||!validTime(payload.generatedAt,now(),DAY)||!Array.isArray(payload.articles)||payload.articles.length>2000)throw new Error('Published Intelligence index is unavailable');cached={payload,at:now()};failedAt=undefined;return payload;}
      catch(error){failedAt=now();throw error;}
      finally{pending=null;}
    })();
    return pending;
  }
  const resolve=async id=>{if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Object.assign(new Error('Invalid article identifier'),{status:400});return normalize(await load(),id,now());};
  resolve.contextFor=async item=>namedMarketContext(await load(),item,now());
  return resolve;
}
const resolve=createResolver();
module.exports={INDEX_URL,INDEX_TIMEOUT_MS,normalize,namedMarketContext,createResolver,resolve,contextFor:resolve.contextFor};
