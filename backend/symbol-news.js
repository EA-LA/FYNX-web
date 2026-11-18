'use strict';
const functions = require('firebase-functions/v1');
const {XMLParser,XMLValidator} = require('fast-xml-parser');
const aliases = require('./symbol-news-aliases.json');
const Reader = require('./news-reader.cjs');
const cache = new Map(),pending = new Map();
const DAY = 86400000,FRESH_MS = 300000,MAX_BYTES = 2000000;
function queryFor(raw) {
  const input = typeof raw === 'string' ? raw.trim() : '';
  if (!input || input.length > 80 || /^[a-z][a-z\d+.-]*:\/\//i.test(input) || /^\/\//.test(input) || !/^[\p{L}\p{N} .&/^:_-]+$/u.test(input)) throw new Error('Enter a symbol or company name (up to 80 characters).');
  const key = input.toUpperCase().replace(/^[A-Z]+:/,'').replace(/[/^]/g,'');
  return {input,query:aliases[key] || input};
}
function parse(xml,now = Date.now()) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Invalid publisher response');
  const data = new XMLParser({ignoreAttributes:false}).parse(xml);
  if (!data.rss || !Object.hasOwn(data.rss,'channel')) throw new Error('Invalid publisher response');
  const raw = data.rss.channel?.item,seen = new Set();
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap(item => {
    const link = Reader.safeURL(item.link),title = Reader.plain(item.title,500);
    // Use the shared strict publication parser without importing its function
    // until runtime, after market-feed has completed module initialisation.
    const date = require('./market-feed')._test.publicationTime(item.pubDate);
    if (!title || !link || !Number.isFinite(date) || date > now + 300000 || now - date > DAY || seen.has(link)) return [];
    seen.add(link);
    const source = Reader.plain(item.source?.['#text'] || item.source || 'Publisher',160);
    return [{title,link,pubDate:new Date(date).toISOString(),author:source,source,description:'',via:'Google News'}];
  }).sort((a,b) => Date.parse(b.pubDate)-Date.parse(a.pubDate)).slice(0,100);
}
async function search(raw) {
  const {input,query} = queryFor(raw),old = cache.get(query),now = Date.now();
  if (old && now-Date.parse(old.fetchedAt) < FRESH_MS) return {...old,query:input,items:old.items.filter(item => now-Date.parse(item.pubDate) <= DAY)};
  if (pending.has(query)) return {...await pending.get(query),query:input};
  const task = (async () => {
    try {
      const url = 'https://news.google.com/rss/search?' + new URLSearchParams({q:query+' when:1d',hl:'en-US',gl:'US',ceid:'US:en'});
      const response = await Reader.boundedFetch(url,{timeoutMs:4200,maxBytes:MAX_BYTES,accept:'application/rss+xml,application/xml'});
      const items = parse(response.text).filter(item => query.split(/\s+OR\s+/).some(term => term.toLowerCase().replace(/"/g,'').split(/\s+/).filter(word=>word!=='stock').every(word => item.title.toLowerCase().includes(word))));
      const result = {query:input,items,fetchedAt:new Date().toISOString(),source:'Google News RSS',freshForMs:FRESH_MS,retentionHours:24};
      cache.delete(query);cache.set(query,result);while (cache.size>64) cache.delete(cache.keys().next().value);return result;
    } finally {pending.delete(query);}
  })();pending.set(query,task);return {...await task,query:input};
}
exports.webSymbolNews = functions.runWith({timeoutSeconds:20,memory:'256MB',maxInstances:3}).https.onRequest(async (req,res) => {
  res.set('Access-Control-Allow-Origin','*');res.set('X-Content-Type-Options','nosniff');
  if (req.method==='OPTIONS') {res.set('Access-Control-Allow-Methods','GET');return res.status(204).send('');}
  if (req.method!=='GET') return res.status(405).json({error:'Use GET'});
  try {queryFor(req.query.q);} catch(error) {return res.status(400).json({error:error.message});}
  try {
    const result=await search(req.query.q),remaining=Math.max(0,Math.floor((FRESH_MS-(Date.now()-Date.parse(result.fetchedAt)))/1000));
    res.set('Cache-Control',remaining ? 'public,max-age='+Math.min(60,remaining) : 'no-store');return res.json(result);
  } catch {res.set('Cache-Control','no-store');return res.status(503).json({error:'Publisher news is temporarily unavailable. Please retry.'});}
});
exports._test = {queryFor,parse,search,cache,pending};
