'use strict';
const functions=require('firebase-functions/v1');
const {XMLParser}=require('fast-xml-parser');
const aliases=require('./symbol-news-aliases.json');
const cache=new Map();
function queryFor(raw){
 const input=String(raw||'').trim();
 if(!input || input.length>80 || !/^[\p{L}\p{N} .&/^:_-]+$/u.test(input))throw new Error('Enter a symbol or company name (up to 80 characters).');
 const key=input.toUpperCase().replace(/^[A-Z]+:/,'').replace(/[/^]/g,'');
 return {input,query:aliases[key]||input};
}
function parse(xml){
 const data=new XMLParser({ignoreAttributes:false}).parse(xml), raw=data.rss?.channel?.item;
 return (Array.isArray(raw)?raw:raw?[raw]:[]).flatMap(i=>{
 const link=String(i.link||''),date=Date.parse(i.pubDate);
 if(!i.title || !/^https:\/\//.test(link) || !Number.isFinite(date) || date>Date.now()+300000 || Date.now()-date>7*86400000)return [];
 return [{title:String(i.title),link,pubDate:new Date(date).toISOString(),author:String(i.source?.['#text']||i.source||'Publisher')}];
 }).slice(0,30);
}
async function search(raw){
 const {input,query}=queryFor(raw),old=cache.get(query);
 if(old && Date.now()-Date.parse(old.fetchedAt)<300000)return {...old,query:input};
 const response=await fetch('https://news.google.com/rss/search?'+new URLSearchParams({q:query+' when:7d',hl:'en-US',gl:'US',ceid:'US:en'}),{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'FYNX-News/1.0','Accept':'application/rss+xml'}});
 if(!response.ok)throw new Error('Publisher unavailable');
 const xml=await response.text();if(!xml.includes('<rss'))throw new Error('Invalid publisher response');
 const result={query:input,items:parse(xml).filter(item=>query.split(/\s+OR\s+/).some(term=>term.toLowerCase().split(/\s+/).every(word=>item.title.toLowerCase().includes(word)))),fetchedAt:new Date().toISOString(),source:'Google News RSS'};
 if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(query,result);return result;
}
exports.webSymbolNews=functions.runWith({timeoutSeconds:20,memory:'256MB',maxInstances:3}).https.onRequest(async(req,res)=>{
 res.set('Access-Control-Allow-Origin','*');
 if(req.method==='OPTIONS'){res.set('Access-Control-Allow-Methods','GET');return res.status(204).send('');}
 if(req.method!=='GET')return res.status(405).json({error:'Use GET'});
 try{queryFor(req.query.q);}catch(e){return res.status(400).json({error:e.message});}
 try{const result=await search(req.query.q);res.set('Cache-Control','public,max-age=120');return res.json(result);}
 catch{res.set('Cache-Control','no-store');return res.status(503).json({error:'Publisher news is temporarily unavailable. Please retry.'});}
});
exports._test={queryFor,parse,search};
