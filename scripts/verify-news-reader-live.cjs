#!/usr/bin/env node
/* Read-only end-to-end smoke check. No credentials, accounts or private data are used.
 * node scripts/verify-news-reader-live.cjs --base http://127.0.0.1:8765 --output /tmp/news-reader-smoke.json
 * Public defaults: www.fynxfinanceworld.com + the deployed webMarketFeed function.
 * Overrides: FYNX_NEWS_BASE_URL, FYNX_NEWS_FEED_URL, --base URL, --api URL, --timeout MS.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const DAY = 86400000, FRESH = 300000, MAX_REQUESTS = 32, CONCURRENCY = 3;
const EDITIONS = ['global','us','uk','canada','europe','asia','india','middle-east','africa','latin-america','japan','australia'];
const DESKS = ['stocks','finance','economics','technology','politics','industries','energy','analysis'];
const CATEGORIES = new Set(['all','forex','crypto','stocks','macro','commodities','world','finance','economics','technology','politics','industries','energy','analysis','official']);
const COVERAGE = new Set(['headline-only','publisher-excerpt','source-text']);

function options(argv) {
  const out = {base:process.env.FYNX_NEWS_BASE_URL || 'https://www.fynxfinanceworld.com',api:process.env.FYNX_NEWS_FEED_URL,timeout:20000};
  for (let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if (arg==='--help' || arg==='-h') {out.help=true;continue;}
    if (['--base','--api','--output','--timeout'].includes(arg)) {if(!argv[i+1] || argv[i+1].startsWith('--'))throw Error('Missing value for '+arg);out[arg.slice(2)]=argv[++i];}
    else if (!arg.startsWith('-') && i===0) out.base=arg;
    else throw Error('Unknown argument: '+arg);
  }
  if(out.help)return out;
  out.base=new URL(out.base);
  if(!['http:','https:'].includes(out.base.protocol) || out.base.username || out.base.password || out.base.search || out.base.hash)throw Error('Base must be an HTTP(S) site URL without credentials, query or fragment');
  out.base=new URL('/',out.base);
  out.api=new URL(out.api || (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(out.base.hostname) ? '/api/market-feed' : 'https://us-central1-fynx-c7a28.cloudfunctions.net/webMarketFeed'),out.base);
  if(!['http:','https:'].includes(out.api.protocol) || out.api.username || out.api.password || out.api.search || out.api.hash)throw Error('API must be an HTTP(S) endpoint without credentials, query or fragment');
  out.timeout=Number(out.timeout);
  if(!Number.isInteger(out.timeout)||out.timeout<1000||out.timeout>30000)throw Error('Timeout must be 1000–30000 milliseconds');
  return out;
}
function requireValue(condition,message) {if(!condition)throw Error(message);}
function safeSource(value) {
  try {const url=new URL(value);return url.protocol==='https:' && !url.username && !url.password && (!url.port||url.port==='443') && url.hostname.includes('.') && !url.hostname.endsWith('.') && !/\.(local|localhost|internal)$/i.test(url.hostname) && !/^[\d.]+$/.test(url.hostname) && !url.hostname.includes(':') ? url : null;}catch{return null;}
}
function idFor(value) {
  const url=safeSource(value);if(!url)return null;url.hash='';
  for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid|oc)$/i.test(key))url.searchParams.delete(key);
  return createHash('sha256').update(url.href).digest('hex');
}
const plain=value=>typeof value==='string' && value.trim().length>0 && !/<\/?(?:script|iframe|img)\b/i.test(value);
function timestamp(value,label,maxAge) {
  const time=Date.parse(value),now=Date.now();
  requireValue(Number.isFinite(time) && time<=now+FRESH,label+' must be an actual, non-future timestamp');
  if(maxAge!==undefined)requireValue(now-time<=maxAge+2000,label+' exceeds the allowed age');
  return time;
}
function route(value,expected,base) {
  const url=new URL(value,base);
  requireValue(url.origin===base.origin && url.pathname==='/news/article.html','Article destination must stay on the FYNX reader');
  requireValue(/^[a-f0-9]{64}$/.test(url.searchParams.get('id')||''),'Reader destination is missing a verified article ID');
  requireValue(EDITIONS.includes(url.searchParams.get('edition')) && CATEGORIES.has(url.searchParams.get('category')),'Reader destination has invalid selectors');
  for(const [key,wanted] of Object.entries(expected))requireValue(url.searchParams.get(key)===wanted,'Reader destination '+key+' does not match its feed');
  return url;
}
function article(value,expected,base) {
  requireValue(value && value.id===expected.id && value.edition===expected.edition && value.category===expected.category,'Article identity or selectors do not match the requested feed');
  requireValue(plain(value.title)&&plain(value.source)&&plain(value.summary)&&plain(value.coverageNote),'Article must contain attributed title, summary and coverage disclosure');
  requireValue(safeSource(value.sourceUrl)&&idFor(value.sourceUrl)===value.id,'Article source URL is unsafe or does not match its ID');
  const published=timestamp(value.publishedAt,'Article publication',expected.category==='official'?30*DAY:DAY);
  timestamp(value.preparedAt,'Article preparation');timestamp(value.updatedAt,'Article update');
  requireValue(COVERAGE.has(value.coverageLevel),'Article has an unsupported coverage level');
  requireValue(value.method==='source-backed-extractive','Article method must identify its source-backed processing');
  requireValue(typeof value.isCurrent==='boolean','Article must disclose whether it is current');
  if(Date.now()-published>DAY+2000)requireValue(value.isCurrent===false,'Historical official coverage must not be marked current');
  if(Date.now()-published<DAY-2000)requireValue(value.isCurrent===true,'Current article incorrectly marked historical');
  for(const field of ['keyPoints','numbers','context','terms','questions','sources','related'])requireValue(Array.isArray(value[field]),'Article field '+field+' must be an array');
  requireValue(value.sources.length>0 && value.sources.every(source=>plain(source.name)&&safeSource(source.url)),'Article must retain safe original-source links');
  if(value.coverageLevel==='headline-only')requireValue(value.keyPoints.length===0&&value.numbers.length===0,'Headline-only coverage must not claim extracted facts or numbers');
  for(const related of value.related)route(related.readerUrl,{id:related.articleId},base);
  if(value.image){requireValue(safeSource(value.image.url)&&safeSource(value.image.sourceUrl||value.image.sourceURL)&&plain(value.image.credit),'Article image must retain safe source attribution');requireValue(plain(value.image.license),'Article image must declare reusable licensing');}
  return value.coverageLevel;
}
async function pool(tasks,run) {
  let next=0;const values=new Array(tasks.length);
  await Promise.all(Array.from({length:Math.min(CONCURRENCY,tasks.length)},async()=>{while(next<tasks.length){const index=next++;values[index]=await run(tasks[index]);}}));
  return values;
}
async function main(config) {
  const report={startedAt:new Date().toISOString(),base:config.base.href,api:config.api.href,limits:{requests:MAX_REQUESTS,concurrency:CONCURRENCY,timeoutMs:config.timeout},checks:[],feeds:[],readers:[],availability:{},requests:0};
  const coverage={'headline-only':0,'publisher-excerpt':0,'source-text':0};
  const log=(name,status,detail={})=>report.checks.push({name,status,...detail});
  async function request(url) {
    requireValue(++report.requests<=MAX_REQUESTS,'Smoke request budget exceeded');
    const response=await fetch(url,{signal:AbortSignal.timeout(config.timeout),redirect:'error',headers:{Accept:'application/json,text/html;q=0.8'},credentials:'omit'});
    const reader=response.body.getReader();let text='',bytes=0;const decoder=new TextDecoder();
    for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>2*1024*1024){await reader.cancel();throw Error('Response exceeded the two-megabyte smoke limit');}text+=decoder.decode(part.value,{stream:true});}
    text+=decoder.decode();return {status:response.status,text};
  }
  const apiURL=params=>{const url=new URL(config.api);url.search=new URLSearchParams(params).toString();return url;};
  async function feed(selection) {
    const {edition='us',category='all',kind='headlines',q}=selection;
    const name=[kind,edition,category,q].filter(Boolean).join('/'),summary={name,edition,category,kind,count:0};
    try {
      const result=await request(apiURL(selection));summary.httpStatus=result.status;
      if(result.status===503){log(name,'unavailable',{reason:'Provider unavailable (HTTP 503)'});report.feeds.push({...summary,available:false});return null;}
      requireValue(result.status===200,'Feed returned HTTP '+result.status);
      const value=JSON.parse(result.text),official=kind==='releases';
      requireValue(value.kind===(official?'official-releases':kind),'Feed kind mismatch');
      requireValue(value.edition===edition&&value.category===(kind==='symbol'?'stocks':category),'Feed selection mismatch');
      requireValue(value.freshForMs===FRESH&&value.retentionHours===(official?720:24),'Feed must declare five-minute refresh and correct publication retention');
      requireValue(Array.isArray(value.items),'Feed items missing');
      if(kind==='symbol')requireValue(value.query===q,'Symbol query changed in the response');
      if(value.fetchedAt)timestamp(value.fetchedAt,'Feed retrieval',official?7*DAY:DAY);
      else requireValue(value.items.length===0,'Populated feed is missing retrieval time');
      const identities=new Set();let previousRank=0;
      for(const row of value.items){
        requireValue(plain(row.title)&&plain(row.source)&&safeSource(row.link),'Feed article lacks safe source metadata');
        timestamp(row.pubDate,'Feed publication',official?30*DAY:DAY);
        requireValue(/^[a-f0-9]{64}$/.test(row.articleId||'')&&idFor(row.link)===row.articleId,'Feed article ID is invalid or does not match the source');
        requireValue(!identities.has(row.articleId),'Feed contains duplicate article IDs');identities.add(row.articleId);
        const expected={id:row.articleId,edition,category:official?'official':kind==='symbol'?'stocks':category,...(q?{symbol:q}:{})};
        route(row.readerUrl,expected,config.base);
        article(row.reader,expected,config.base);
        if(!official){requireValue(Number.isInteger(row.rank)&&row.rank>previousRank,'Feed ranking must be ordered and distinct');previousRank=row.rank;requireValue(Number.isFinite(row.priorityScore),'Feed priority score missing');}
      }
      summary.count=value.items.length;summary.stale=value.stale===true;summary.fetchedAt=value.fetchedAt||null;
      summary.oldestPublication=value.items.length?new Date(Math.min(...value.items.map(row=>Date.parse(row.pubDate)))).toISOString():null;
      report.feeds.push({...summary,available:true});log(name,'pass',{count:summary.count,stale:summary.stale});
      return {selection,value};
    } catch(error) {report.feeds.push({...summary,available:false});log(name,'fail',{reason:error.message});return null;}
  }
  const selections=[...EDITIONS.map(edition=>({edition,category:'all'})),...DESKS.map(category=>({edition:'us',category})),{kind:'symbol',q:'TSLA',edition:'us',category:'stocks'},{kind:'releases',edition:'us',category:'all'}];
  const feeds=await pool(selections,feed),valid=feeds.filter(Boolean);
  const news=valid.filter(entry=>entry.selection.kind!=='releases'&&entry.selection.kind!=='symbol');
  report.availability={feedsChecked:selections.length,populatedFeeds:report.feeds.filter(entry=>entry.count>0).length,emptyFeeds:report.feeds.filter(entry=>entry.available&&entry.count===0).length,unavailableFeeds:report.feeds.filter(entry=>!entry.available).length,currentArticleRows:news.reduce((sum,entry)=>sum+entry.value.items.length,0)};
  log('Current source coverage exists',report.availability.currentArticleRows>0?'pass':'fail',{count:report.availability.currentArticleRows});
  const candidates=[];
  function pick(entry){if(!entry?.value.items.length)return;const rows=entry.value.items;const row=entry.selection.kind==='releases'?rows.find(row=>Date.now()-Date.parse(row.pubDate)>DAY)||rows[0]:rows[0];if(!candidates.some(candidate=>candidate.row.readerUrl===row.readerUrl))candidates.push({row,entry});}
  pick(news.find(entry=>entry.selection.edition==='us'&&entry.selection.category==='all')||news.find(entry=>entry.value.items.length));
  pick(news.find(entry=>entry.selection.edition==='us'&&entry.selection.category==='technology')||news.find(entry=>entry.selection.edition!=='us'&&entry.value.items.length));
  pick(valid.find(entry=>entry.selection.kind==='symbol'));pick(valid.find(entry=>entry.selection.kind==='releases'));
  await pool(candidates,async({row,entry})=>{
    const expected=Object.fromEntries(new URL(row.readerUrl,config.base).searchParams),name='Reader/'+[expected.edition,expected.category,expected.symbol].filter(Boolean).join('/');
    try{const result=await request(apiURL({kind:'article',...expected}));requireValue(result.status===200,'Article endpoint returned HTTP '+result.status);const value=JSON.parse(result.text);requireValue(value.kind==='article'&&value.freshForMs===FRESH,'Article envelope missing five-minute freshness');const level=article(value.article,expected,config.base);coverage[level]++;report.readers.push({edition:expected.edition,category:expected.category,symbol:expected.symbol||null,coverageLevel:level,isCurrent:value.article.isCurrent,publishedAt:value.article.publishedAt});log(name,'pass',{coverageLevel:level});}
    catch(error){log(name,'fail',{reason:error.message});}
  });
  log('At least one real reader is verified',report.readers.length?'pass':'fail',{count:report.readers.length});
  await pool([
    {name:'Caller URL rejected as article ID',params:{kind:'article',id:'https://example.invalid/untrusted'},status:400},
    {name:'Unknown article cannot fetch caller source URL',params:{kind:'article',id:'0'.repeat(64),source:'https://example.invalid/untrusted'},status:404},
    {name:'URL rejected as symbol query',params:{kind:'symbol',q:'https://example.invalid/untrusted'},status:400}
  ],async test=>{try{const result=await request(apiURL(test.params));requireValue(result.status===test.status,'Expected HTTP '+test.status+', received '+result.status);requireValue(plain(JSON.parse(result.text).error),'Rejection must be an explicit error');log(test.name,'pass');}catch(error){log(test.name,'fail',{reason:error.message});}});
  await pool([
    {name:'Reader page published',url:new URL('/news/article.html',config.base),patterns:[/data-news-reader/,/\/assets\/js\/news-reader\.js/,/\/assets\/js\/news-reader-links\.js/]},
    {name:'Shared reader helper published',url:new URL('/assets/js/news-reader-links.js',config.base),patterns:[/FYNXNewsReaderData/,/300000/]}
  ],async test=>{try{const result=await request(test.url);requireValue(result.status===200,'Static asset returned HTTP '+result.status);requireValue(test.patterns.every(pattern=>pattern.test(result.text)),'Static asset does not contain the reader contract');log(test.name,'pass');}catch(error){log(test.name,'fail',{reason:error.message});}});
  report.completedAt=new Date().toISOString();report.coverageLevels=coverage;report.totals={passed:report.checks.filter(row=>row.status==='pass').length,failed:report.checks.filter(row=>row.status==='fail').length,unavailable:report.checks.filter(row=>row.status==='unavailable').length};
  report.ok=report.totals.failed===0;
  if(config.output){const output=path.resolve(config.output);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify(report,null,2));
  if(!report.ok)process.exitCode=1;
  return report;
}
if(require.main===module){
  try{const config=options(process.argv.slice(2));if(config.help)console.log('Usage: node scripts/verify-news-reader-live.cjs [--base SITE_URL] [--api FEED_URL] [--output JSON_FILE] [--timeout 1000..30000]\nRead-only checks: 12 editions, 8 US desks, symbol news, official history, up to 4 article readers, invalid selectors and published assets. At most 32 requests, concurrency 3. Empty feeds are reported; at least one current story and reader must be available.');else main(config).catch(error=>{console.error('News reader smoke failed: '+error.message);process.exitCode=1;});}
  catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={main,options,safeSource,route,article};
