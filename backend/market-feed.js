'use strict';
const functions = require('firebase-functions/v1');
const {XMLParser} = require('fast-xml-parser');
const queries = {all:'financial markets stocks forex economy',forex:'forex currency central bank',crypto:'bitcoin ethereum crypto',stocks:'stock market earnings',macro:'inflation central bank economy',commodities:'gold oil commodities',world:'global economy markets'};
const cache = new Map(), pending = new Map();
function parseFeed(xml, now=Date.now()) {
  const parsed = new XMLParser({ignoreAttributes:false}).parse(xml);
  const entries = parsed.rss?.channel?.item;
  const items = (Array.isArray(entries)?entries:entries?[entries]:[]).flatMap(item=>{
    const date=Date.parse(item.pubDate), link=String(item.link||'');
    if(!item.title || !/^https:\/\//.test(link) || !Number.isFinite(date) || date>now+300000 || now-date>7*86400000) return [];
    return [{title:String(item.title),link,pubDate:new Date(date).toISOString(),source:String(item.source?.['#text']||item.source||'Market news'),description:''}];
  }).sort((a,b)=>Date.parse(b.pubDate)-Date.parse(a.pubDate));
  return [...new Map(items.map(item=>[item.link,item])).values()].slice(0,30);
}
async function load(category){
  const old=cache.get(category);
  if(old && Date.now()-Date.parse(old.fetchedAt)<300000)return old;
  if(pending.has(category))return pending.get(category);
  const task=(async()=>{
    try{
      const url='https://news.google.com/rss/search?'+new URLSearchParams({q:queries[category]+' when:2d',hl:'en-US',gl:'US',ceid:'US:en'});
      const urls=[url,'https://www.cnbc.com/id/10000664/device/rss/rss.html'];
      if(['forex','commodities','macro'].includes(category))urls.push('https://www.fxstreet.com/rss/news');
      const items=await Promise.any(urls.map(async source=>{
        const response=await fetch(source,{signal:AbortSignal.timeout(9000),headers:{'User-Agent':'FYNX-News/1.0','Accept':'application/rss+xml, application/xml, text/xml'}});
        if(!response.ok)throw new Error('Publisher HTTP '+response.status);
        let rows=parseFeed(await response.text());
        rows=rows.map(item=>({...item,source:source.includes('cnbc.com')?'CNBC':source.includes('fxstreet.com')?'FXStreet':item.source}));
        if(!source.includes('news.google.com') && !['all','stocks'].includes(category)) {
          const words={forex:/currency|forex|dollar|yen|euro|sterling|usd|eur|gbp|jpy|aud|cad/i,crypto:/crypto|bitcoin|ethereum|token/i,macro:/inflation|fed|rate|econom|jobs/i,commodities:/gold|oil|commodit|silver|energy/i,world:/global|world|china|europe|asia|trade/i};
          rows=rows.filter(item=>words[category].test(item.title));
        }
        if(!rows.length)throw new Error('No recent stories');
        return rows;
      }));
      const data={items,fetchedAt:new Date().toISOString(),stale:false};cache.set(category,data);return data;
    }catch(error){console.warn('Market feed unavailable',category,error.errors?.map(e=>e.message)||error.message);if(old && Date.now()-Date.parse(old.fetchedAt)<3600000)return {...old,stale:true};throw error;}
    finally{pending.delete(category);}
  })();pending.set(category,task);return task;
}
exports.webMarketFeed=functions.runWith({timeoutSeconds:30,memory:'256MB',maxInstances:2}).https.onRequest(async(req,res)=>{
  res.set('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS'){res.set('Access-Control-Allow-Methods','GET');return res.status(204).send('');}
  if(req.method!=='GET')return res.status(405).json({error:'Use GET'});
  const category=req.query.category||'all';
  if(!Object.hasOwn(queries,category))return res.status(400).json({error:'Unknown category'});
  try{const data=await load(category);res.set('Cache-Control',data.stale?'no-store':'public,max-age=120');return res.json(data);}
  catch{res.set('Cache-Control','no-store');return res.status(503).json({error:'News is temporarily unavailable. Please try again.'});}
});
exports._test={parseFeed};
