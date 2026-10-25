'use strict';
const functions = require('firebase-functions/v1');
const {XMLParser, XMLValidator} = require('fast-xml-parser');
const queries = {all:'markets OR stocks OR economy',forex:'forex OR EURUSD OR USDJPY OR sterling',crypto:'bitcoin OR ethereum OR crypto',stocks:'stocks OR earnings OR Nasdaq',macro:'inflation OR central bank OR economy',commodities:'gold price OR crude oil OR silver price OR copper futures OR natural gas',world:'global economy OR world trade OR international markets'};
const cache = new Map(), pending = new Map();
const FRESH_MS=300000, HEADLINE_CACHE_MS=86400000, RELEASE_CACHE_MS=7*86400000, MAX_XML_BYTES=2000000, PROVIDER_TIMEOUT_MS=4200;
const officialSources = [
  {id:'fed',name:'Federal Reserve',url:'https://www.federalreserve.gov/feeds/press_monetary.xml',website:'https://www.federalreserve.gov/newsevents/pressreleases.htm',hosts:['www.federalreserve.gov','federalreserve.gov']},
  {id:'bea',name:'U.S. Bureau of Economic Analysis',url:'https://apps.bea.gov/rss/rss.xml',website:'https://www.bea.gov/news',hosts:['www.bea.gov','bea.gov','apps.bea.gov']},
  {id:'ecb',name:'European Central Bank',url:'https://www.ecb.europa.eu/rss/press.html',website:'https://www.ecb.europa.eu/press/html/index.en.html',hosts:['www.ecb.europa.eu','ecb.europa.eu']}
];
function safeURL(value,hosts){
  try{const url=new URL(String(value||''));if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))return null;
    const host=url.hostname.toLowerCase();if(!host.includes('.')||host==='localhost'||host.endsWith('.local')||host.endsWith('.localhost')||/^\d{1,3}(\.\d{1,3}){3}$/.test(host)||host.includes(':')||(hosts&&!hosts.includes(host)))return null;
    url.hash='';return url.href;
  }catch{return null;}
}
const textEntities=Object.freeze({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ensp:' ',emsp:' ',thinsp:' ',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',hellip:'…',bull:'•',copy:'©',reg:'®',trade:'™',euro:'€',pound:'£',yen:'¥',cent:'¢'});
function text(value){
  let result=String(value?.['#text']??value??'');
  // XML leaves entities inside CDATA untouched; cached payloads may add another layer.
  for(let pass=0;pass<4;pass++){
    const decoded=result.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi,(match,entity)=>{
      if(entity[0]!=='#'){const name=entity.toLowerCase();return Object.hasOwn(textEntities,name)?textEntities[name]:match;}
      const code=entity[1].toLowerCase()==='x'?Number.parseInt(entity.slice(2),16):Number.parseInt(entity.slice(1),10);
      return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)&&!(code<32&&![9,10,13].includes(code))&&!(code>=127&&code<=159)?String.fromCodePoint(code):'�';
    });
    if(decoded===result)break;result=decoded;
  }
  return result.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,1200);
}
function parseFeed(xml, now=Date.now(), options={}) {
  if(typeof xml!=='string'||Buffer.byteLength(xml,'utf8')>MAX_XML_BYTES||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Unsafe or oversized XML');
  if(XMLValidator.validate(xml)!==true)throw new Error('Malformed XML');
  const parsed = new XMLParser({ignoreAttributes:false,trimValues:true}).parse(xml);
  if(!Object.hasOwn(parsed.rss||{},'channel')&&!Object.hasOwn(parsed,'feed'))throw new Error('Not a supported feed');
  const entries=parsed.rss?.channel?.item??parsed.feed?.entry;
  const rows=Array.isArray(entries)?entries:entries?[entries]:[];
  const items=rows.flatMap(item=>{
    const rawLink=Array.isArray(item.link)?item.link.find(link=>!link['@_rel']||link['@_rel']==='alternate'):item.link;
    const link=safeURL(typeof rawLink==='object'?rawLink?.['@_href']??rawLink?.['#text']:rawLink,options.hosts);
    const date=Date.parse(item.pubDate??item.published??item.updated), title=text(item.title);
    const future=options.official?86400000:300000,maxAge=options.official?Infinity:7*86400000;
    if(!title||!link||!Number.isFinite(date)||date>now+future||now-date>maxAge)return [];
    return [{title,link,pubDate:new Date(date).toISOString(),source:options.source||text(item.source)||'Market news',description:''}];
  }).sort((a,b)=>Date.parse(b.pubDate)-Date.parse(a.pubDate));
  // For official feeds a nonempty, entirely invalid document is a source failure,
  // so it cannot silently replace a useful saved release list with an empty one.
  if(options.official&&rows.length&&!items.length)throw new Error('No valid official releases');
  return [...new Map(items.map(item=>[item.link,item])).values()].slice(0,options.official?50:300);
}
function mergeFeeds(feeds,limit=30){return [...new Map(feeds.flat().sort((a,b)=>Date.parse(b.pubDate)-Date.parse(a.pubDate)).map(item=>[item.link,item])).values()].slice(0,limit);}
async function fetchXML(url,timeoutMs=PROVIDER_TIMEOUT_MS){
  const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Publisher timed out'));},timeoutMs);});
  try{return await Promise.race([(async()=>{
    const response=await fetch(url,{signal:controller.signal,headers:{'User-Agent':'FYNX-News/1.1','Accept':'application/rss+xml, application/atom+xml, application/xml, text/xml'}});
    if(!response.ok)throw new Error('Publisher HTTP '+response.status);
    const length=Number(response.headers?.get?.('content-length')||0);if(length>MAX_XML_BYTES)throw new Error('Feed too large');
    if(!response.body?.getReader){const xml=await response.text();if(Buffer.byteLength(xml)>MAX_XML_BYTES)throw new Error('Feed too large');return xml;}
    const reader=response.body.getReader(),chunks=[];let total=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_XML_BYTES){await reader.cancel();throw new Error('Feed too large');}chunks.push(Buffer.from(value));}}
    finally{reader.releaseLock();}
    return Buffer.concat(chunks).toString('utf8');
  })(),timeout]);}finally{clearTimeout(timer);}
}
function newsSources(category){
  const sources=[{id:'google',name:'Google News aggregation',url:'https://news.google.com/rss/search?'+new URLSearchParams({q:queries[category]+' when:2d',hl:'en-US',gl:'US',ceid:'US:en'}),via:'Google News'}, {id:'cnbc',name:'CNBC',url:'https://www.cnbc.com/id/10000664/device/rss/rss.html'}];
  if(category==='crypto')sources.push({id:'coindesk',name:'CoinDesk',url:'https://www.coindesk.com/arc/outboundfeeds/rss/'});
  if(category==='commodities')sources.push({id:'cnbc-energy',name:'CNBC',url:'https://www.cnbc.com/id/19836768/device/rss/rss.html'});
  if(['forex','commodities','macro'].includes(category))sources.push({id:'fxstreet',name:'FXStreet',url:'https://www.fxstreet.com/rss/news'});
  return sources;
}
const categoryWords={forex:/\b(currency|currencies|forex|dollars?|yen|euros?|sterling|usd|eur|gbp|jpy|aud|cad|eurusd|usdjpy|gbpusd|audusd|usdcad)\b/i,crypto:/crypto|bitcoin|ethereum|token/i,macro:/inflation|\bfed\b|rate|econom|jobs/i,commodities:/\b(gold|oil|commodit\w*|silver|energy|copper|natural gas|crude|bullion|wheat|metals?)\b/i,world:/global|world|china|europe|asia|trade/i};
async function load(category){
  if(!Object.hasOwn(queries,category))throw new Error('Unknown category');
  const old=cache.get(category),now=Date.now();
  if(old&&now-Date.parse(old.fetchedAt)<FRESH_MS)return old;
  if(pending.has(category))return pending.get(category);
  const task=(async()=>{
    try{
      const sources=newsSources(category);
      const results=await Promise.allSettled(sources.map(async source=>{
        let rows=parseFeed(await fetchXML(source.url));
        rows=rows.map(item=>({...item,source:source.via?item.source:source.name,sourceId:source.id,via:source.via||null,category}));
        if((source.id!=='google'||category==='commodities')&&!['all','stocks'].includes(category))rows=rows.filter(item=>categoryWords[category].test(item.title));
        return rows;
      }));
      if(!results.some(result=>result.status==='fulfilled'))throw new Error('All publishers unavailable');
      const items=mergeFeeds(results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]));
      const fetchedAt=new Date().toISOString(),publishedAt=items[0]?.pubDate||null;
      const data={kind:'headlines',items,publishedAt,fetchedAt,stale:!!publishedAt&&Date.now()-Date.parse(publishedAt)>72*3600000,sources:sources.map((source,i)=>({id:source.id,name:source.name,status:results[i].status==='fulfilled'?'fresh':'unavailable',fetchedAt:results[i].status==='fulfilled'?fetchedAt:null,message:results[i].status==='fulfilled'?'Updated from source':'Source could not be refreshed'}))};
      cache.set(category,data);return data;
    }catch(error){
      if(old&&Date.now()-Date.parse(old.fetchedAt)<HEADLINE_CACHE_MS)return {...old,stale:true,sources:(old.sources||[]).map(source=>({...source,status:'cached',message:'Refresh unavailable; showing a saved feed'}))};
      throw error;
    }finally{pending.delete(category);}
  })();pending.set(category,task);return task;
}
async function loadOfficialReleases(){
  const key='official-releases';if(pending.has(key))return pending.get(key);
  const task=(async()=>{
    try{
      const results=await Promise.all(officialSources.map(async source=>{
        const old=cache.get(key+':'+source.id),now=Date.now();
        if(old&&now-Date.parse(old.fetchedAt)<FRESH_MS)return {items:old.items,id:source.id,name:source.name,status:'fresh',fetchedAt:old.fetchedAt,message:'Updated from the official source'};
        try{const items=parseFeed(await fetchXML(source.url),Date.now(),{official:true,hosts:source.hosts,source:source.name}).map(item=>({...item,sourceId:source.id,via:null}));
          const fetchedAt=new Date().toISOString();cache.set(key+':'+source.id,{items,fetchedAt});return {items,id:source.id,name:source.name,status:'fresh',fetchedAt,message:'Updated from the official source'};
        }catch{
          if(old&&now-Date.parse(old.fetchedAt)<RELEASE_CACHE_MS)return {items:old.items,id:source.id,name:source.name,status:'cached',fetchedAt:old.fetchedAt,message:'Refresh unavailable; showing saved releases'};
          return {items:[],id:source.id,name:source.name,status:'unavailable',fetchedAt:null,message:'Feed unavailable; the official source remains linked'};
        }
      }));
      const items=mergeFeeds(results.map(result=>result.items),150),available=results.filter(result=>result.status!=='unavailable');
      return {kind:'official-releases',items,publishedAt:items[0]?.pubDate||null,fetchedAt:available.length?new Date(Math.min(...available.map(source=>Date.parse(source.fetchedAt)))).toISOString():null,stale:results.some(source=>source.status!=='fresh'),sources:results.map(({items,...source})=>source)};
    }finally{pending.delete(key);}
  })();pending.set(key,task);return task;
}
async function handler(req,res){
  res.set('Access-Control-Allow-Origin','*');res.set('X-Content-Type-Options','nosniff');
  if(req.method==='OPTIONS'){res.set('Access-Control-Allow-Methods','GET');return res.status(204).send('');}
  if(req.method!=='GET')return res.status(405).json({error:'Use GET'});
  const kind=req.query.kind||'headlines',category=req.query.category||'all';
  if(!['headlines','releases'].includes(kind)||!Object.hasOwn(queries,category))return res.status(400).json({error:'Unknown feed'});
  try{const data=kind==='releases'?await loadOfficialReleases():await load(category);res.set('Cache-Control',data.stale?'no-store':'public,max-age=120');return res.json(data);}
  catch{res.set('Cache-Control','no-store');return res.status(503).json({error:'News is temporarily unavailable. Please try again.'});}
}
exports.webMarketFeed=functions.runWith({timeoutSeconds:15,memory:'256MB',maxInstances:4}).https.onRequest(handler);
exports._test={parseFeed,mergeFeeds,load,loadOfficialReleases,cache,pending,safeURL,fetchXML,officialSources,handler,PROVIDER_TIMEOUT_MS};
