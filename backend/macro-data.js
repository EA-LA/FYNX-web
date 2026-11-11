'use strict';
const functions=require('firebase-functions/v1');
const admin=require('firebase-admin');
const {XMLParser}=require('fast-xml-parser');
const AREAS=['US','XM','GB','JP','CH','CA','AU','NZ'];
const COUNTRIES=['USA','EMU','GBR','JPN','CHE','CAN','AUS','NZL'];
const INDICATORS=['NY.GDP.MKTP.KD.ZG','FP.CPI.TOTL.ZG','SL.UEM.TOTL.ZS'];
const SOURCES={rates:'https://stats.bis.org/api/v1/data/WS_CBPOL/D.US+GB+JP+CH+CA+AU+NZ+XM?lastNObservations=1',indicators:`https://api.worldbank.org/v2/country/${COUNTRIES.join(';')}/indicator/${INDICATORS.join(';')}?source=2&format=json&per_page=200&mrnev=1`};
const TTL=6*3600000;
function parseRates(xml){
 const parsed=new XMLParser({ignoreAttributes:false,removeNSPrefix:true}).parse(xml);
 const data=parsed.StructureSpecificData?.DataSet?.Series;
 const series=Array.isArray(data)?data:data?[data]:[];
 const rows=series.flatMap(s=>{
   const area=s['@_REF_AREA'];if(!AREAS.includes(area))return [];
   const obs=(Array.isArray(s.Obs)?s.Obs:[s.Obs]).filter(Boolean).filter(o=>o['@_OBS_VALUE']!==undefined&&o['@_OBS_VALUE']!==''&&Number.isFinite(Number(o['@_OBS_VALUE']))).sort((a,b)=>String(b['@_TIME_PERIOD']).localeCompare(String(a['@_TIME_PERIOD'])))[0];
   if(!obs||!/^\d{4}-\d{2}-\d{2}$/.test(obs['@_TIME_PERIOD']))return [];
   return [{area,value:Number(obs['@_OBS_VALUE']),observationDate:obs['@_TIME_PERIOD'],source:s['@_SOURCE_REF']||'BIS',definition:s['@_COMPILATION']||'',url:`https://data.bis.org/topics/CBPOL/BIS%2CWS_CBPOL%2C1.0/D.${area}`}];
 });
 if(!rows.length)throw new Error('BIS returned no valid observations');
 return {rows,source:'Bank for International Settlements',sourceUrl:'https://data.bis.org/topics/CBPOL',frequency:'Daily observations, published weekly'};
}
function parseIndicators(data){
 if(!Array.isArray(data)||!Array.isArray(data[1]))throw new Error('Invalid World Bank response');
 const rows=data[1].filter(r=>COUNTRIES.includes(r.countryiso3code)&&INDICATORS.includes(r.indicator?.id)&&typeof r.value==='number'&&Number.isFinite(r.value)&&/^\d{4}$/.test(r.date)).map(r=>({country:r.countryiso3code,indicator:r.indicator.id,value:r.value,year:r.date}));
 if(!rows.length)throw new Error('World Bank returned no valid observations');
 return {rows,source:'World Bank — World Development Indicators',sourceUrl:'https://data.worldbank.org/',sourceUpdatedAt:data[0]?.lastupdated||null,frequency:'Annual; latest available non-empty observation'};
}
async function fetchDataset(kind){
 const response=await fetch(SOURCES[kind],{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'FYNXFinanceWorld/1.0 (public economic data)'}});
 if(!response.ok)throw new Error(`Provider HTTP ${response.status}`);
 const result=kind==='rates'?parseRates(await response.text()):parseIndicators(await response.json());
 return {...result,fetchedAt:new Date().toISOString(),kind};
}
const pending=new Map();
async function dataset(kind){
 const ref=admin.firestore().collection('fynxPublicData').doc('macro-'+kind);
 const previous=(await ref.get()).data();
 if(previous&&Date.now()-Date.parse(previous.fetchedAt)<TTL)return {...previous,cacheStatus:'cached'};
 if(pending.has(kind))return pending.get(kind);
 const task=(async()=>{
   try{const fresh=await fetchDataset(kind);await ref.set(fresh);return {...fresh,cacheStatus:'refreshed'};}
   catch(error){console.warn('Economic data refresh failed',kind,error.message);if(previous)return {...previous,cacheStatus:'stale',warning:'The source could not be refreshed. Showing the last successful retrieval.'};throw error;}
   finally{pending.delete(kind);}
 })();pending.set(kind,task);return task;
}
exports.webMacroData=functions.runWith({timeoutSeconds:60,memory:'256MB',maxInstances:2}).https.onRequest(async(req,res)=>{
 res.set('Access-Control-Allow-Origin','*');
 if(req.method==='OPTIONS'){res.set('Access-Control-Allow-Methods','GET');return res.status(204).send('');}
 if(req.method!=='GET')return res.status(405).json({error:'Use GET'});
 const kind=req.query.kind;
 if(!Object.hasOwn(SOURCES,kind))return res.status(400).json({error:'Unknown dataset'});
 try{const data=await dataset(kind);res.set('Cache-Control',data.cacheStatus==='stale'?'no-store':'public, max-age=300');return res.json(data);}
 catch{res.set('Cache-Control','no-store');return res.status(503).json({error:'The data source is temporarily unavailable. Use the official source links and try again later.'});}
});
exports._test={parseRates,parseIndicators,fetchDataset};
