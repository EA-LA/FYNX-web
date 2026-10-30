/* Public information is independent of account state and FYNX membership.
 * Official destinations retain their own access terms; no stream or episode is invented. */
(function(root){
  'use strict';
  const ENDPOINT=/^(localhost|127\.0\.0\.1)$/.test(root.location?.hostname||'')?'/api/market-feed':'https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketFeed';
  const FRESH_MS=600000, MAX_WAIT_MS=6500, HEADLINE_CACHE_MS=86400000, RELEASE_CACHE_MS=7*86400000;
  const categories=['all','forex','crypto','stocks','macro','commodities','world','finance','economics','technology','politics','industries','energy','analysis'];
  const editionCodes=['global','us','uk','canada','europe','asia','india','middle-east','africa','latin-america','japan','australia'];
  function editionID(value){const id=value||root.FynxEdition?.get()||'us';if(!editionCodes.includes(id))throw new Error('Unknown edition');return id;}
  const retention=category=>category==='analysis'?168:48;
  const topics=['All topics','Markets','Economy','Business','Global affairs'];
  const pending=new Map();
  const publisher=(id,name,summary,topicList,links)=>({id,name,summary,topics:topicList,destinations:links.map(([category,url,access])=>({id:id+'.'+category,publisherID:id,publisher:name,category,url,access,categoryLabel:category==='live'?'Broadcast destination':category==='podcasts'?'Podcast directory':'Video directory'}))});
  const publishers=[
    publisher('cnbc','CNBC','Business reporting, market interviews and financial programming.',['Markets','Economy','Business'],[
      ['videos','https://www.cnbc.com/latest-video/','Some content requires a CNBC subscription.'],
      ['live','https://www.cnbc.com/live-tv/','CNBC may require a participating TV provider, CNBC Pro or CNBC+ subscription.'],
      ['podcasts','https://www.cnbc.com/podcast/','Listening availability is set by CNBC and the podcast platform.']]),
    publisher('bloomberg','Bloomberg','Global business, economic reporting and market conversations.',['Markets','Economy','Global affairs'],[
      ['videos','https://www.bloomberg.com/videos','Publisher access rules and regional availability apply.'],
      ['live','https://www.bloomberg.com/live','Open Bloomberg’s broadcast page for current availability and access terms.'],
      ['podcasts','https://www.bloomberg.com/podcasts','Some publisher content may require a subscription.']]),
    publisher('ft','Financial Times','Analysis and conversations about business and the global economy.',['Markets','Economy','Business','Global affairs'],[
      ['videos','https://www.ft.com/video','Some Financial Times content requires its own subscription.'],
      ['podcasts','https://www.ft.com/podcasts','Some shows or episodes may require a publisher subscription.']]),
    publisher('wsj','The Wall Street Journal','Business reporting, market coverage and audio programs.',['Markets','Economy','Business'],[
      ['videos','https://www.wsj.com/video','Some Wall Street Journal content requires its own subscription.'],
      ['podcasts','https://www.wsj.com/audio/podcasts','Availability and any subscription requirements are set by the publisher.']]),
    publisher('bbc','BBC','Business explainers and reporting from around the world.',['Business','Economy','Global affairs'],[
      ['videos','https://www.bbc.com/video','BBC access rules and regional availability apply.']]),
    publisher('reuters','Reuters','Global news and conversations from Reuters journalists.',['Business','Global affairs'],[
      ['podcasts','https://podcasts.apple.com/us/podcast/reuters-world-news/id1665219519','Opens Reuters World News on Apple Podcasts. Platform availability applies.']]),
    publisher('yahoo','Yahoo Finance','Market interviews, business videos and financial news coverage.',['Markets','Business'],[
      ['videos','https://finance.yahoo.com/videos/','Publisher access rules and regional availability apply.']])
  ];
  const officialSources=[
    {id:'fed',name:'Federal Reserve',website:'https://www.federalreserve.gov/newsevents/pressreleases.htm',hosts:['www.federalreserve.gov','federalreserve.gov'],editions:['us']},
    {id:'bea',name:'U.S. Bureau of Economic Analysis',website:'https://www.bea.gov/news',hosts:['www.bea.gov','bea.gov','apps.bea.gov'],editions:['us']},
    {id:'ecb',name:'European Central Bank',website:'https://www.ecb.europa.eu/press/html/index.en.html',hosts:['www.ecb.europa.eu','ecb.europa.eu'],editions:['europe']},
    {id:'boe',name:'Bank of England',website:'https://www.bankofengland.co.uk/news',hosts:['www.bankofengland.co.uk','bankofengland.co.uk'],editions:['uk']},
    {id:'boc',name:'Bank of Canada',website:'https://www.bankofcanada.ca/press/',hosts:['www.bankofcanada.ca','bankofcanada.ca'],editions:['canada']},
    {id:'boj',name:'Bank of Japan',website:'https://www.boj.or.jp/en/',hosts:['www.boj.or.jp','boj.or.jp'],editions:['japan','asia']},
    {id:'rba',name:'Reserve Bank of Australia',website:'https://www.rba.gov.au/media-releases/',hosts:['www.rba.gov.au','rba.gov.au'],editions:['australia']}
  ];
  const sourcesFor=edition=>officialSources.filter(source=>edition==='global'||source.editions.includes(edition));
  const institutions=[
    {id:'fed',name:'Federal Reserve',region:'United States',location:'Washington, DC · approximate city location',latitude:38.9072,longitude:-77.0369,url:'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',summary:'Policy meetings, official announcements and Federal Reserve events.'},
    {id:'ecb',name:'European Central Bank',region:'Europe',location:'Frankfurt · approximate city location',latitude:50.1109,longitude:8.6821,url:'https://www.ecb.europa.eu/press/html/index.en.html',summary:'Monetary policy decisions and euro area announcements.'},
    {id:'bea',name:'U.S. Bureau of Economic Analysis',region:'United States',location:'Suitland, Maryland · source campus',latitude:38.8481024,longitude:-76.93288925,url:'https://www.bea.gov/news/schedule',summary:'Official GDP, personal income and other U.S. economic release schedules.'},
    {id:'boe',name:'Bank of England',region:'Europe',location:'London · approximate city location',latitude:51.5074,longitude:-0.1278,url:'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates',summary:'Monetary Policy Committee dates and official UK policy announcements.'},
    {id:'boj',name:'Bank of Japan',region:'Japan',location:'Tokyo · approximate city location',latitude:35.6762,longitude:139.6503,url:'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm',summary:'Monetary policy meeting schedules, decisions and minutes.'},
    {id:'bls',name:'U.S. Bureau of Labor Statistics',region:'United States',location:'Suitland, Maryland · source campus',latitude:38.848977,longitude:-76.936245,url:'https://www.bls.gov/schedule/news_release/',summary:'Official employment, inflation and labor market release schedules.'}
  ];
  function deepFreeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}
  [publishers,institutions,officialSources,topics,categories].forEach(deepFreeze);
  function safeURL(value,hosts){
    try{const url=new URL(String(value||''));if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))return null;
      const host=url.hostname.toLowerCase();if(!host.includes('.')||host==='localhost'||host.endsWith('.local')||host.endsWith('.localhost')||/^\d{1,3}(\.\d{1,3}){3}$/.test(host)||host.includes(':')||(hosts&&!hosts.includes(host)))return null;
      url.hash='';return url.href;
    }catch{return null;}
  }
  const textEntities=Object.freeze({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ensp:' ',emsp:' ',thinsp:' ',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',hellip:'…',bull:'•',copy:'©',reg:'®',trade:'™',euro:'€',pound:'£',yen:'¥',cent:'¢'});
  function clean(value){
    if(typeof value!=='string')return '';
    let result=value;
    // Keep old browser caches readable using the same plain-text decoding as the feed.
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
  function validTime(value,now=Date.now()){const date=Date.parse(value);return Number.isFinite(date)&&date<=now+300000?new Date(date).toISOString():null;}
  function normalizeImage(image){
    if(!image||typeof image!=='object')return null;
    const url=safeURL(image.url),sourceURL=safeURL(image.sourceURL),rawLicenseURL=safeURL(image.licenseURL),credit=clean(image.credit);
    const approved=rawLicenseURL?.match(/^https:\/\/(?:www\.)?creativecommons\.org\/(?:licenses\/(by|by-sa)\/4\.0|publicdomain\/zero\/1\.0)\/?$/);
    if(!url||!sourceURL||!credit||!approved)return null;
    // The feed supplies a license URL, not a display label. Derive the label
    // from that exact approved license so every renderer receives one contract.
    const license=approved[1]==='by'?'CC BY 4.0':approved[1]==='by-sa'?'CC BY-SA 4.0':'CC0';
    const licenseURL=rawLicenseURL.replace('https://www.creativecommons.org/','https://creativecommons.org/').replace(/\/?$/,'/');
    return {url,sourceURL,licenseURL,credit,license,source:clean(image.source),alt:clean(image.alt)||'Source-provided image'};
  }
  function article(row,official,category,now,edition){
    if(!row||typeof row!=='object')return null;
    const feed=official?officialSources.find(source=>source.id===row.sourceId):null;
    if(official&&(!feed||!sourcesFor(edition).includes(feed)))return null;
    if(row.edition&&row.edition!==edition)return null;
    const title=clean(row.title),url=safeURL(row.link||row.url,feed?.hosts),time=Date.parse(row.pubDate||row.publishedAt);
    if(!title||!url||!Number.isFinite(time)||time>now+300000||now-time>(official?720:retention(category))*3600000)return null;
    const publishedAt=new Date(time).toISOString(),source=feed?.name||clean(row.source)||'Market news';
    return {id:(feed?.id||'headline')+'|'+url,title,url,link:url,publishedAt,pubDate:publishedAt,source,sourceId:feed?.id||clean(row.sourceId),edition,category:official?'official':category,kind:official?'official-release':category==='analysis'?'analysis':'headline',image:normalizeImage(row.image),via:row.via==='Google News'||new URL(url).hostname==='news.google.com'?'Google News':null,description:''};
  }
  function normalize(data,official,category,now=Date.now(),edition=editionID()){
    if(!data||typeof data!=='object'||!Array.isArray(data.items)||data.items.length>500)throw new Error('Invalid feed response');
    if((data.edition&&data.edition!==edition)||(!data.edition&&edition!=='us')||(data.category&&data.category!==(official?'all':category)))throw new Error('Feed edition or category mismatch');
    if(official&&data.kind!=='official-releases')throw new Error('Official release service unavailable');
    const fetchedAt=validTime(data.fetchedAt,now);
    if((!official||data.items.length)&&!fetchedAt)throw new Error('Missing retrieval date');
    const maxAge=official?RELEASE_CACHE_MS:HEADLINE_CACHE_MS;
    if(fetchedAt&&now-Date.parse(fetchedAt)>maxAge)throw new Error('Feed cache expired');
    const seen=new Set(),items=data.items.flatMap(row=>{const item=article(row,official,category,now,edition);if(!item||seen.has(item.id))return [];seen.add(item.id);return [item];}).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,official?150:60);
    if(data.items.length&&!items.length)throw new Error('No valid feed records');
    const rawSources=Array.isArray(data.sources)?data.sources:[];
    const sourceState=(raw,id,name)=>({id,name,status:['fresh','cached','unavailable'].includes(raw?.status)?raw.status:'unavailable',fetchedAt:validTime(raw?.fetchedAt,now)&&now-Date.parse(raw.fetchedAt)<=maxAge?validTime(raw.fetchedAt,now):null,message:clean(raw?.message)});
    const sources=official?sourcesFor(edition).map(feed=>sourceState(rawSources.find(source=>source.id===feed.id),feed.id,feed.name)):rawSources.slice(0,12).map(source=>sourceState(source,clean(source.id),clean(source.name)));
    if(official&&items.some(item=>!sources.some(source=>source.id===item.sourceId&&source.status!=='unavailable'&&source.fetchedAt)))throw new Error('Official source retrieval state missing');
    const available=official?sources.some(source=>source.status!=='unavailable'&&source.fetchedAt):true;
    const stale=data.stale===true||sources.some(source=>source.status!=='fresh');
    return {edition,category:official?'all':category,retentionHours:official?720:retention(category),kind:official?'official-releases':'headlines',items,fetchedAt,publishedAt:items[0]?.publishedAt||null,status:available?'fresh':'unavailable',stale,sources,message:available?(stale?'Some sources could not be refreshed; publication dates and saved states are shown.':'Updated from the sources below.'):'Official feeds are unavailable. Open their source websites below.'};
  }
  function mergeOfficialCache(value,cached){
    if(!cached)return value;
    const states=value.sources.map(source=>{
      const saved=cached.sources.find(old=>old.id===source.id);
      return source.status==='unavailable'&&saved?.fetchedAt&&Date.now()-Date.parse(saved.fetchedAt)<RELEASE_CACHE_MS
        ?{...saved,status:'cached',message:'Refresh unavailable; showing dated saved releases'}:source;
    });
    const retained=new Set(states.filter(source=>source.status==='cached').map(source=>source.id));
    const items=[...value.items,...cached.items.filter(item=>retained.has(item.sourceId)&&!value.items.some(row=>row.id===item.id))].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
    const available=states.filter(source=>source.status!=='unavailable'&&source.fetchedAt);
    return {...value,items,sources:states,status:available.length?(states.every(source=>source.status!=='fresh')?'cached':'fresh'):'unavailable',stale:states.some(source=>source.status!=='fresh'),fetchedAt:available.length?new Date(Math.min(...available.map(source=>Date.parse(source.fetchedAt)))).toISOString():null,publishedAt:items[0]?.publishedAt||null,message:states.some(source=>source.status==='cached')?'Some official sources could not be refreshed. Dated saved releases remain available.':value.message};
  }
  const cacheKey=(official,category,edition)=>'fynx_market_intelligence_v2_'+edition+'_'+(official?'official':category);
  function readCache(official,category,edition=editionID()){
    try{
      const raw=root.localStorage.getItem(cacheKey(official,category,edition));
      if(!raw||raw.length>1500000)return null;
      const value=normalize(JSON.parse(raw),official,category,Date.now(),edition),age=Date.now()-Date.parse(value.fetchedAt);
      if(!Number.isFinite(age)||age>(official?RELEASE_CACHE_MS:HEADLINE_CACHE_MS))return null;
      if(age<FRESH_MS&&!value.stale)return value;
      return {...value,status:'cached',stale:true,message:'Showing dated saved coverage while sources refresh.',sources:value.sources.map(source=>({...source,status:source.status==='unavailable'?'unavailable':'cached'}))};
    }catch{return null;}
  }
  function saveCache(value,official,category,edition){
    try{root.localStorage.setItem(cacheKey(official,category,edition),JSON.stringify(value));}catch{}
    if(!official&&category==='all')try{root.dispatchEvent(new root.CustomEvent('fynx:news-updated',{detail:value}));}catch{}
  }
  async function request(url,timeoutMs){
    const controller=new AbortController();let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Feed timed out'));},timeoutMs);});
    try{return await Promise.race([(async()=>{
      const response=await root.fetch(url,{signal:controller.signal,credentials:'omit',headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('Feed temporarily unavailable');
      const raw=await response.text();if(raw.length>1500000)throw new Error('Feed too large');return JSON.parse(raw);
    })(),timeout]);}finally{clearTimeout(timer);}
  }
  async function load(official,category,options={}){
    if(!categories.includes(category))throw new Error('Unknown news category');
    const edition=editionID(options.edition),key=cacheKey(official,category,edition),cached=readCache(official,category,edition);
    if(!options.force&&cached&&Date.now()-Date.parse(cached.fetchedAt)<FRESH_MS)return cached;
    if(pending.has(key))return pending.get(key);
    const timeoutMs=Number.isFinite(options.timeoutMs)?Math.max(100,Math.min(MAX_WAIT_MS,options.timeoutMs)):MAX_WAIT_MS;
    const task=(async()=>{
      try{const url=ENDPOINT+'?'+new URLSearchParams({edition,category:official?'all':category,...(official?{kind:'releases'}:{})});let value=normalize(await request(url,timeoutMs),official,category,Date.now(),edition);
        if(official)value=mergeOfficialCache(value,cached);
        if(official&&value.status==='unavailable'&&cached)return {...cached,message:'Official feeds could not be refreshed. Showing dated saved releases.'};
        if(value.fetchedAt)saveCache(value,official,category,edition);return value;
      }catch{
        if(cached)return {...cached,status:'cached',stale:true,sources:cached.sources.map(source=>({...source,status:source.status==='unavailable'?'unavailable':'cached'})),message:'Refresh unavailable. Showing dated saved '+(official?'releases':'headlines')+'.'};
        return {edition,category:official?'all':category,kind:official?'official-releases':'headlines',items:[],fetchedAt:null,publishedAt:null,status:'unavailable',stale:true,message:official?'Official feeds are temporarily unavailable. Their original websites remain available below.':'Headlines could not be refreshed. Try again or open an official publisher below.',sources:official?sourcesFor(edition).map(source=>({id:source.id,name:source.name,status:'unavailable',fetchedAt:null,message:'Open the official source'})):[]};
      }finally{pending.delete(key);}
    })();pending.set(key,task);return task;
  }
  root.FYNXMarketIntelligenceData=Object.freeze({publishers,institutions,officialSources,topics,categories,
    getCachedHeadlines:(category='all',options={})=>categories.includes(category)?readCache(false,category,editionID(options.edition)):null,
    getCachedOfficialReleases:(options={})=>readCache(true,'all',editionID(options.edition)),
    sourcesForEdition:(edition)=>sourcesFor(editionID(edition)),
    loadHeadlines:(category='all',options)=>load(false,category,options),
    loadOfficialReleases:options=>load(true,'all',options),
    safeURL
  });
})(typeof window==='undefined'?globalThis:window);
