'use strict';
const {EdgeService}=require('./snapshot.cjs');
const {createProtectionService}=require('./identity.cjs');
const {verifyUser}=require('../quant/auth.cjs');
const {RateLimiter,readBody}=require('../quant/api.cjs');
const {symbol,fetchJSON,fail}=require('../quant/common.cjs');
function headlineTone(title){const good=/\b(gains?|rall(?:y|ies)|surges?|rises?|rebound|growth|optimism)\b/i.test(title),bad=/\b(falls?|drops?|slumps?|loss(?:es)?|declines?|recession|sell-off)\b/i.test(title);return {label:good&&bad?'Mixed':good?'Positive':bad?'Negative':'Unclassified',basis:'Rule-based headline wording only; not a full-article assessment or market-direction prediction.'};}
function createEdgeAPI({service=new EdgeService(),authenticate=verifyUser,protection,limiter=new RateLimiter({limit:180}),fetcher=fetch}={}){
  const account=protection||createProtectionService({store:service.store,eventResolver:async uid=>{const prefs=await service.preferences(uid),snapshot=await service.store.get('edge_snapshots',service.principal(uid,prefs.timezone)+':latest');return (snapshot?.markets||[]).flatMap(m=>[...(m.events?.next24h||[]),...(m.events?.restOfWeek||[])]);}});service.protection=account;
  const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
  const respond=(res,value)=>{const {httpStatus=200,...body}=value;json(res,httpStatus,body);};
  const api=async(req,res)=>{const url=new URL(req.url,'http://edge.local');if(!url.pathname.startsWith('/api/edge/'))return false;res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    try{const origin=req.headers.origin;if(origin){const allowed=new Set(String(process.env.QUANT_ALLOWED_ORIGINS||'https://fynxfinanceworld.com,https://www.fynxfinanceworld.com,http://127.0.0.1:4174,http://localhost:4174').split(','));if(!allowed.has(origin))throw fail('This origin is not allowed.',403,'ORIGIN_FORBIDDEN');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
      if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.writeHead(204);res.end();return true;}limiter.take(req.socket?.remoteAddress||'unknown');
      if(await account.handle(req,res))return true;
      const query=Object.fromEntries(url.searchParams);if(Object.keys(query).length>10||Object.values(query).some(v=>v.length>500))throw fail('Query is too large.');const route=url.pathname.slice('/api/edge/'.length),user=req.headers.authorization?await authenticate(req):null,uid=user?.uid||null,zone=query.timezone||query.timeZone;
      if(req.method==='GET'&&route==='today')respond(res,await service.today({uid,zone}));
      else if(req.method==='GET'&&/^market\/[A-Za-z0-9]{3,12}$/.test(route))respond(res,await service.market({uid,zone,id:route.slice(7)}));
      else if(req.method==='GET'&&/^strategy\/[A-Za-z0-9_-]{1,80}(?:\/fit)?$/.test(route)){const snapshot=await service.today({uid,zone});if(snapshot.httpStatus===202)respond(res,snapshot);else{const id=route.split('/')[1],strategy=snapshot.strategies.find(s=>s.id===id);if(!strategy)throw fail('Strategy is not present in this account snapshot.',404,'STRATEGY_NOT_FOUND');json(res,200,{strategy,fits:snapshot.markets.flatMap(m=>m.fits.filter(f=>f.strategyId===id)),asOf:snapshot.asOf,generatedAt:snapshot.generatedAt,status:snapshot.status});}}
      else if(req.method==='GET'&&route==='watchlist'){const prefs=await service.preferences(uid,zone);json(res,200,{symbols:prefs.watchlist,timeZone:prefs.timezone,guest:!uid});}
      else if(req.method==='POST'&&route==='watchlist'){if(!uid)throw fail('Sign in to save your watchlist.',401,'SIGN_IN_REQUIRED');const body=await readBody(req,5000);if(Object.keys(body).some(k=>!['symbols','timeZone','timezone'].includes(k)))throw fail('Unknown watchlist fields.');json(res,200,await service.setWatchlist(uid,body));}
      else if(req.method==='GET'&&/^jobs\/[A-Za-z0-9_-]{32}$/.test(route))json(res,200,service.jobs.get(route.slice(5),uid?'user:'+uid:'guest'));
      else if(req.method==='GET'&&route==='headlines'){const market=symbol(query.symbol),endpoint=new URL('https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketFeed');endpoint.searchParams.set('kind','symbol');endpoint.searchParams.set('q',market.symbol);const news=await service.quant.cached('edge-news:'+market.id,300000,()=>fetchJSON(endpoint,{fetcher,provider:'FYNX News'}));json(res,200,{...news,symbol:market.id,items:(news.items||[]).map(item=>({...item,tone:headlineTone(String(item.title||''))}))});}
      else throw fail('Edge endpoint not found.',404,'NOT_FOUND');
    }catch(e){json(res,e.status||500,{error:e.code||e.status?e.message:'Edge data is temporarily unavailable.',code:e.code||'EDGE_SERVICE_ERROR'});}return true;};
  api.service=service;api.protection=account;api.close=()=>service.jobs.close();return api;
}
module.exports={createEdgeAPI,headlineTone};
