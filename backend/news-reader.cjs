'use strict';
const {createHash} = require('node:crypto');
const DAY = 86400000, FRESH_MS = 300000;
const MAX_HTML_BYTES = 900000, FETCH_TIMEOUT_MS = 2000;
const articleCache = new Map(), articlePending = new Map(), robotsCache = new Map();
const MAX_ARTICLES = 768;
// Only previously configured publishers and official sources can be scanned.
// User query strings never provide a fetch target. Redirects and paywalls are
// not followed. Google News aggregation URLs are not decoded or scraped.
const PAGE_HOSTS = new Set(['www.cnbc.com','cnbc.com','www.coindesk.com','coindesk.com','www.fxstreet.com','fxstreet.com','www.federalreserve.gov','federalreserve.gov','www.bea.gov','bea.gov','apps.bea.gov','www.ecb.europa.eu','ecb.europa.eu','www.bankofengland.co.uk','bankofengland.co.uk','www.bankofcanada.ca','bankofcanada.ca','www.boj.or.jp','boj.or.jp','www.rba.gov.au','rba.gov.au']);
const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',hellip:'…',pound:'£',euro:'€'};
function plain(value, max=14000) {
  let s=typeof value==='string'?value:'';
  for(let i=0;i<3;i++) s=s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(all,k)=>{
    if(k[0]!=='#')return entities[k.toLowerCase()]??all;
    const n=k[1].toLowerCase()==='x'?parseInt(k.slice(2),16):parseInt(k.slice(1),10);
    return n>=32&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' ';
  });
  return s.replace(/<(script|style|noscript|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function safeURL(value) {
  try {
    const u=new URL(value); if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||u.href.length>2048)return null;
    if(!u.hostname.includes('.')||u.hostname.endsWith('.')||/\.(local|localhost|internal)$/i.test(u.hostname)||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(':'))return null;
    u.hash='';
    for(const key of [...u.searchParams.keys()]) if(/^utm_|^(fbclid|gclid|oc)$/i.test(key))u.searchParams.delete(key);
    return u.href;
  }catch{return null;}
}
function articleId(url) { const valid=safeURL(url);return valid?createHash('sha256').update(valid).digest('hex'):null; }
function readerUrl(item) {
  const query=new URLSearchParams({id:articleId(item.link||item.url),edition:item.edition||'us',category:item.kind==='official-release'?'official':item.category||'all'});
  if(item.symbol)query.set('symbol',item.symbol);
  return '/news/article.html?'+query;
}
function words(value) { return String(value||'').split(/\s+/).filter(Boolean); }
function bounded(value,maxWords) { const w=words(value);return w.length<=maxWords?value:w.slice(0,maxWords).join(' ').replace(/[,;:]$/,'')+'…'; }
function titleWithoutPublisher(item) {
  const title=plain(item.title,500),source=plain(item.source,100);
  return source&&title.toLowerCase().endsWith(' - '+source.toLowerCase())?title.slice(0,-source.length-3).trim():title;
}
const STOP=new Set('this that with from have into about after before when where will would could should their there these those more than over under says said news market markets stock stocks updates latest report reports business world company shares finance financial'.split(' '));
function tokens(text) { return [...new Set(plain(text).toLowerCase().match(/[a-z][a-z\d-]{3,}/g)||[])].filter(t=>!STOP.has(t)); }
const SOURCE_TIERS=[[/^(Reuters|Associated Press|AP News|Bloomberg(?:\.com)?|Financial Times|Wall Street Journal|WSJ|CNBC|BBC(?: News)?|The Economist|Nikkei Asia|Nikkei|CNA|CNN|The Guardian|The New York Times|New York Times|The Washington Post|Washington Post)$/i,3],[/^(Yahoo Finance|MarketWatch|The Straits Times|Al Jazeera|ABC News|ABC|CBC|CTV News|Sky News|The Business Times|Financial Post|BNN Bloomberg|The Globe and Mail|The Economic Times|The Hindu|Business Standard|South China Morning Post|SCMP|France 24|DW|RTE|RTÉ|FXStreet|CoinDesk|Cointelegraph|Investing.com|Fortune|Forbes|Barron's|Business Insider)$/i,2]];
function editorialTier(item) {
  if(item.kind==='official-release')return 3;
  return SOURCE_TIERS.find(([re])=>re.test(plain(item.source,120)))?.[1]||1;
}
function isNewsworthy(item) {
  return !/\b(tvguide|tv guide|programme listings|press release distribution)\b/i.test(item.source||'')&&!/\b(stocks? to (?:buy|watch)|best stocks? to|insider[- ]owned stocks?|stocks? with high insider|top \d+ (?:stocks|picks)|stocks? (?:are )?buys|Jim Cramer says|raised (?:our|its) price target|sponsored content|paid partner|coupon code|horoscope)\b/i.test(item.title||'');
}
function rankHeadlines(items,now=Date.now()) {
  const rows=items.filter(isNewsworthy).map(item=>{
    const age=Math.max(0,(now-Date.parse(item.pubDate))/3600000),terms=tokens(item.title);
    const corroborating=new Set(items.filter(other=>other!==item&&other.source!==item.source&&tokens(other.title).filter(t=>terms.includes(t)).length>=3).map(other=>other.source)).size;
    const priorityScore=Math.round((24-age)*2+editorialTier(item)*7+(item.description?.length>55?5:0)+Math.min(3,corroborating)*4+(/\b(central bank|interest rate|inflation|GDP|earnings|election|tariff|oil|jobs|merger|acquisition)\b/i.test(item.title)?4:0));
    return {...item,priorityScore};
  }).sort((a,b)=>b.priorityScore-a.priorityScore||Date.parse(b.pubDate)-Date.parse(a.pubDate));
  const accepted=[];
  for(const row of rows){const title=titleWithoutPublisher(row).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');if(accepted.some(x=>x._key===title))continue;accepted.push({...row,_key:title});}
  return accepted.slice(0,30).map(({_key,...item},i)=>({...item,rank:i+1}));
}
const EXPLAINERS = [
  {test:/\b(inflation|CPI|consumer prices|PCE)\b/i,topic:'inflation',title:'Read the rate and the comparison',text:'Inflation measures how quickly prices change, not whether prices are high or low. Check whether the report compares one month or one year, and whether food and energy are included. A slower inflation rate still means prices are rising when the rate remains positive.',terms:[['Inflation','The rate at which a basket of prices changes over time.'],['Core inflation','An inflation measure that excludes selected volatile categories, usually food and energy.']],questions:['Does the release compare month over month or year over year?','Was the previous period revised, and what was the forecast before the release?']},
  {test:/\b(rate|rates|Federal Reserve|central bank|Bank of England|ECB|BoJ)\b/i,topic:'rates',title:'Follow the policy decision into financing costs',text:'Central-bank decisions can affect borrowing costs, bond yields and currencies. The decision itself, the guidance about future decisions and the market reaction are different pieces of evidence. Compare the official statement with the previous meeting before assuming policy has changed direction.',terms:[['Policy rate','A central bank’s benchmark interest rate, used to influence financial conditions.'],['Basis point','One hundredth of a percentage point; 25 basis points equals 0.25 percentage points.']],questions:['What changed in the decision or the official guidance?','Is the reported move an actual decision, a forecast or market pricing?']},
  {test:/\b(earnings|profit|revenue|results|guidance|sales)\b/i,topic:'earnings',title:'Separate reported performance from expectations',text:'Revenue is the amount a business earns from sales before expenses; profit is what remains after the relevant costs. Reported results describe a completed period, while guidance describes management’s expectations. A share-price move alone does not establish whether the underlying business improved.',terms:[['Revenue','Sales earned during a reporting period before expenses.'],['Guidance','Management’s forward-looking expectations, which can change.'],['Earnings per share','Profit allocated to each eligible share, using the accounting definition provided.']],questions:['Which reporting period and accounting basis do the numbers cover?','Are comparisons against last year, the prior quarter or analyst expectations?']},
  {test:/\b(GDP|economic growth|economy|recession|employment|jobs|payroll|unemployment)\b/i,topic:'economy',title:'Keep the economic measure and its time period together',text:'Economic releases describe a particular period and are often revised as more information arrives. Growth, employment and prices measure different parts of the economy. A first estimate should be read alongside its definitions and revisions, rather than treated as a complete picture.',terms:[['GDP','Gross domestic product: a measure of production within an economy over a period.'],['Revision','An update to an earlier estimate when more or better information becomes available.']],questions:['Is this an initial estimate, revised release or survey?','Which period, geographic area and units are being compared?']},
  {test:/\b(oil|energy|gas|OPEC|electricity|renewable|solar|wind)\b/i,topic:'energy',title:'Connect supply, demand and the pricing window',text:'Energy reporting can describe production, inventories, transport capacity, contracts or prices. These measures are related but are not interchangeable. A supply announcement does not guarantee the same change in delivered supply, and a quoted price needs its benchmark and observation time.',terms:[['Benchmark','A reference price or standard used to compare a market.'],['Inventory','Stock held in storage at a specified observation date.']],questions:['Does the report describe announced capacity or actual production?','Which benchmark, contract and observation time apply to a quoted price?']},
  {test:/\b(AI|artificial intelligence|chips?|semiconductor|software|cyber|technology|data cent(?:er|re))\b/i,topic:'technology',title:'Distinguish an announcement from an operating result',text:'Technology stories may report a product launch, investment commitment, research result or security incident. Check which of those occurred and what evidence is available. Spending commitments, technical benchmarks and customer revenue answer different questions about business performance.',terms:[['Capital expenditure','Spending on long-lived assets such as buildings, equipment or data centres.'],['Benchmark test','A measured test whose conditions and comparison method affect what it demonstrates.']],questions:['What has been demonstrated, deployed or independently confirmed?','Are the financial figures committed spending, completed spending or reported revenue?']},
  {test:/\b(election|midterm|ballot)\b/i,topic:'elections',title:'Separate historical patterns from a forecast',text:'Election reporting can cover voting, policy choices, market expectations or historical returns. A pattern observed after past elections does not predict what will happen after the next one. Check the sample period, how returns were measured and whether the comparison accounts for other economic conditions.',terms:[['Historical return','A measured past investment result over a specified period; it does not guarantee a future result.']],questions:['Is this a confirmed election result, a forecast, market pricing or a historical comparison?','What time period and sample size support a reported pattern?']},
  {test:/\b(tariff|government|president|parliament|congress|minister|regulation|policy)\b/i,topic:'policy',title:'Locate the decision in the policy process',text:'A proposal, announcement, vote and implemented rule are different stages. The economic effect depends on the final scope, exemptions and effective date. Read the original text where it is available, and separate reported positions from measures that have taken legal effect.',terms:[['Tariff','A tax applied to specified imported goods.'],['Effective date','The date a measure begins to apply, which can differ from its announcement date.']],questions:['Is the measure proposed, approved or already in force?','Who is covered, which exceptions apply and when does implementation begin?']},
  {test:/\b(bitcoin|crypto|ethereum|token|blockchain)\b/i,topic:'crypto',title:'Separate the asset, venue and reported event',text:'Crypto stories can concern a token, exchange, network or regulatory decision. A price move is different from a change to the underlying network or an exchange’s operations. Confirm the named asset, the venue and the evidence behind any security or reserve claim.',terms:[['Token','A digital unit recorded using a blockchain or similar ledger.'],['Liquidity','How readily an asset can be traded without materially changing its price.']],questions:['Which asset, trading venue or network is directly affected?','Are reported holdings or losses independently verified?']},
  {test:/\b(bond|yield|debt|credit|loan|bank|banking|finance)\b/i,topic:'finance',title:'Distinguish price, yield and credit exposure',text:'A financing story may concern the price of borrowing, the amount raised or the ability to repay. Bond prices and yields can move in opposite directions, but the instrument’s maturity and terms matter. Read the financing terms before comparing two headline numbers.',terms:[['Yield','A return measure calculated under stated assumptions; it is not always a guaranteed realised return.'],['Credit risk','The risk that a borrower does not meet its payment obligations.']],questions:['Is the figure a borrowing rate, bond yield, transaction value or outstanding balance?','Which maturity, currency and repayment terms apply?']}
];
function termMentioned(term, text) {
  const patterns={'Basis point':/\bbasis points?\b|\bbps\b/i,'Earnings per share':/\bearnings per share\b|\bEPS\b/i,'GDP':/\bGDP\b|gross domestic product/i,'Historical return':/historical|history|past returns?|historically/i,'Capital expenditure':/capital expenditure|\bcapex\b/i};
  return patterns[term] ? patterns[term].test(text) : new RegExp('\\b'+term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'s?\\b','i').test(text);
}
function explain(title,sourceText,category) {
  const matched=EXPLAINERS.filter(x=>x.test.test(title+' '+sourceText.slice(0,1000))).slice(0,2);
  if(!matched.length)return {context:[{title:'Read the event in its own terms',text:'Compare the reported event with the earlier position, identify the people or organisations directly involved, and check the publication time. Treat forecasts and allegations as such. Related reporting can add context without independently confirming every claim.'}],terms:[],questions:['What is confirmed in the source, and what remains a forecast or allegation?','What earlier event or published record provides the comparison?']};
  return {context:matched.map(x=>({title:x.title,text:x.text})),terms:[...new Map(matched.flatMap(x=>x.terms).filter(([term])=>termMentioned(term,title+' '+sourceText)).map(([term,definition])=>[term,{term,definition}])).values()].slice(0,5),questions:[...new Set(matched.flatMap(x=>x.questions))].slice(0,4)};
}
function sentenceList(value) {
  return plain(value).split(/(?<=[.!?])\s+(?=[A-Z“"'\d])/).map(s=>s.trim()).filter(s=>s.length>24&&!/^(?:what|how|why|when|where|who|here['’]s|here is what|read|watch|listen|see|find out|learn)\b/i.test(s)&&!s.endsWith('?')&&!/\b(subscribe|sign up|click here|read more|all rights reserved|cookie|javascript|advertisement|continue reading)\b/i.test(s));
}
function sourceEvidence(item,sourceText,coverageLevel) {
  const title=titleWithoutPublisher(item),terms=tokens(title);
  const candidates=sentenceList(sourceText).map((text,index)=>({text,index,score:tokens(text).filter(t=>terms.includes(t)).length+( /(?:\d|%|\$|£|€)/.test(text)?1:0)})).filter(x=>x.score>0||coverageLevel==='publisher-excerpt');
  const sorted=candidates.sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,3).sort((a,b)=>a.index-b.index);
  // Never publish full extracted article text. At most 90 source-derived words
  // across summary, key evidence and repeated number values; source paragraphs stay at source.
  const excerpts=[];let remaining=78;
  for(const row of sorted){if(remaining<12)break;const excerpt=bounded(row.text,Math.min(remaining,35));remaining-=words(excerpt).length;if(!excerpts.includes(excerpt))excerpts.push(excerpt);}
  if(!excerpts.length)return {summary:title,keyPoints:[],numbers:[]};
  const numbers=[];
  for(const sentence of excerpts)for(const match of sentence.matchAll(/(?:\b\d[\d,.]*%?\s?[-–]\s?\d[\d,.]*\s?(?:percent|%)|[$£€¥]\s?\d[\d,.]*(?:\s?(?:billion|million|trillion))?|\b\d[\d,.]*\s?(?:percentage points|basis points|percent|billion|million|trillion|bps|%))(?=$|[\s.,;:)])/gi)){
    const value=match[0];if(/^\d{4}$/.test(value)||value.length<2||numbers.some(n=>n.value===value))continue;
    // A context excerpt preserves the actual qualifier; no arithmetic, inferred
    // forecast, price target or change direction is fabricated.
    numbers.push({value,context:sentence===excerpts[0]?'Reported in the source brief above.':'Reported in the key evidence above.'});if(numbers.length>=4)break;
  }
  return {summary:excerpts[0],keyPoints:excerpts.slice(1).map(text=>({text})),numbers:numbers.slice(0,4)};
}
function relatedRows(item,pool) {
  const wanted=tokens(item.title),seen=new Set([item.source]),out=[];
  for(const other of pool){if(articleId(other.link||other.url)===articleId(item.link||item.url)||seen.has(other.source))continue;const overlap=tokens(other.title).filter(t=>wanted.includes(t));if(overlap.length<2)continue;seen.add(other.source);out.push({articleId:articleId(other.link||other.url),title:titleWithoutPublisher(other),source:other.source,readerUrl:readerUrl(other),publishedAt:other.pubDate});if(out.length===5)break;}
  return out;
}
function createBrief(item,options={}) {
  const now=options.now??Date.now(),sourceUrl=safeURL(item.link||item.url),id=articleId(sourceUrl),title=titleWithoutPublisher(item);
  const sourceText=plain(options.sourceText??item.description??'',14000);
  const titleTerms=tokens(title),metadataTerms=new Set([...titleTerms,...tokens(item.source)]),sourceTerms=tokens(sourceText);
  const useful=sourceText.length>55&&sourceTerms.filter(t=>!metadataTerms.has(t)).length>=2&&sourceText!==title;
  const coverageLevel=useful?(options.coverageLevel==='source-text'?'source-text':'publisher-excerpt'):'headline-only';
  const findings=useful?sourceEvidence(item,sourceText,coverageLevel):{summary:title,keyPoints:[],numbers:[]};
  const analysis=explain(title,useful?sourceText:'',item.category);
  return {id,title,source:plain(item.source,160)||'Publisher',sourceUrl,publishedAt:item.pubDate||item.publishedAt,edition:item.edition||'us',category:item.kind==='official-release'?'official':item.category||'all',image:item.image||null,
    coverageLevel,coverageNote:coverageLevel==='source-text'?'FYNX reviewed publicly accessible source text. The brief uses short source excerpts; explanations below are general reading context, not independent confirmation.':coverageLevel==='publisher-excerpt'?(options.sourceAccess==='public-key-points'?'FYNX reviewed the publisher’s public Key Points summary. The complete article, including any restricted text, has not been reviewed.':'FYNX reviewed the publisher’s supplied excerpt. Details absent from that excerpt are not filled in.'):'Only the headline and source metadata are available to FYNX. The complete article has not been reviewed; the context below does not add unverified story facts.',
    preparedAt:new Date(now).toISOString(),updatedAt:new Date(options.accessedAt||now).toISOString(),...findings,...analysis,
    related:relatedRows(item,options.related||[]),sources:[{name:plain(item.source,160)||'Publisher',url:sourceUrl,accessedAt:new Date(options.accessedAt||now).toISOString()}],method:'source-backed-extractive',isCurrent:now-Date.parse(item.pubDate||item.publishedAt)<=DAY,
    sourceAccess:options.sourceAccess|| (coverageLevel==='headline-only'?'metadata-only':'publisher-feed'),sourceWordLimit:90};
}
function approvedPageURL(item) { const href=safeURL(item.link||item.url);return href&&PAGE_HOSTS.has(new URL(href).hostname)?href:null; }
async function boundedFetch(url,options={}) {
  const controller=new AbortController(),timeoutMs=options.timeoutMs||FETCH_TIMEOUT_MS;let timer;
  try{return await Promise.race([(async()=>{
    const response=await fetch(url,{redirect:'error',signal:controller.signal,headers:{'User-Agent':'FYNX-NewsReader/1.0 (+https://www.fynxfinanceworld.com/news.html)','Accept':options.accept||'text/html,text/plain;q=0.9'}});
    if(!response.ok)throw Error('Source unavailable');
    const length=Number(response.headers?.get?.('content-length')||0);if(length>(options.maxBytes||MAX_HTML_BYTES))throw Error('Source exceeds limit');
    if(response.body?.getReader){const reader=response.body.getReader();let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>(options.maxBytes||MAX_HTML_BYTES)){await reader.cancel();throw Error('Source exceeds limit');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}return {text:Buffer.concat(chunks).toString('utf8'),type:response.headers?.get?.('content-type')||''};}
    const text=await response.text();if(Buffer.byteLength(text)>(options.maxBytes||MAX_HTML_BYTES))throw Error('Source exceeds limit');return {text,type:response.headers?.get?.('content-type')||''};
  })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Source timed out'));},timeoutMs);})]);}finally{clearTimeout(timer);}
}
function robotsAllows(text,url) {
  const groups=[];let current=null,hasRules=false;
  for(const raw of text.split(/\r?\n/)){const line=raw.replace(/#.*$/,'').trim(),match=/^(user-agent|disallow|allow):\s*(.*)$/i.exec(line);if(!match)continue;
    const key=match[1].toLowerCase(),value=match[2].trim();
    if(key==='user-agent'){if(!current||hasRules){current={agents:[],rules:[]};groups.push(current);hasRules=false;}current.agents.push(value.toLowerCase());}
    else if(current){hasRules=true;if(value)current.rules.push({allow:key==='allow',path:value});}
  }
  const named=groups.filter(g=>g.agents.some(a=>a!=='*'&&'fynx-newsreader'.includes(a))),applicable=named.length?named:groups.filter(g=>g.agents.includes('*'));
  const path=new URL(url).pathname+new URL(url).search;
  const rules=applicable.flatMap(g=>g.rules).filter(rule=>{const re='^'+rule.path.split('*').map(s=>s.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*').replace(/\\\$$/,'$');try{return new RegExp(re).test(path);}catch{return true;}}).sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));
  return !rules.length||rules[0].allow;
}
async function allowedByRobots(url) {
  const origin=new URL(url).origin,old=robotsCache.get(origin);
  if(old&&Date.now()-old.at<3600000)return robotsAllows(old.text,url);
  try{const {text}=await boundedFetch(origin+'/robots.txt',{maxBytes:160000,timeoutMs:1500,accept:'text/plain'});if(robotsCache.size>=32)robotsCache.delete(robotsCache.keys().next().value);robotsCache.set(origin,{text,at:Date.now()});return robotsAllows(text,url);}catch{return false;}
}
function elementByToken(html,tag,attribute,token) {
  const escaped=token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const start=new RegExp('<'+tag+'\\b[^>]*\\b'+attribute+'=["\'][^"\']*\\b'+escaped+'\\b[^"\']*["\'][^>]*>','i').exec(html);
  if(!start)return null;
  const contentStart=start.index+start[0].length, tags=new RegExp('</?'+tag+'\\b[^>]*>','gi');tags.lastIndex=contentStart;let depth=1,match;
  while((match=tags.exec(html))){depth+=match[0][1]==='/'?-1:1;if(depth===0)return html.slice(contentStart,match.index);}
  return null;
}
function extractPage(html,item) {
  if(typeof html!=='string'||Buffer.byteLength(html)>MAX_HTML_BYTES)return null;
  // Explicit access restrictions remain restrictions even if some article text
  // is embedded in HTML. Never use subscriber-only JSON-LD as a workaround.
  const isCNBC=/^(?:www\.)?cnbc\.com$/.test(new URL(item.link||item.url).hostname);
  // CNBC's public Key Points sit outside its clipped metered preview. Use
  // that publisher-authored summary only; never recover hidden preview text.
  let publicPoints=null;
  if(isCNBC){const block=elementByToken(html,'div','class','RenderKeyPoints-keyPoints');if(block&&!/aria-hidden=["']true|display\s*:\s*none|visibility\s*:\s*hidden/i.test(block)){const points=[...block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>plain(m[1])).filter(x=>x.length>24);if(points.length)publicPoints={text:points.join(' '),coverageLevel:'publisher-excerpt',sourceAccess:'public-key-points'};}}
  if(/"isAccessibleForFree"\s*:\s*(?:false|"false")|"isPartOf"[\s\S]{0,150}"Product"|class=["'][^"']*paywall|id=["'][^"']*paywall/i.test(html))return publicPoints;
  const chunks=publicPoints?[publicPoints]:[];
  for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    let data;try{data=JSON.parse(match[1]);}catch{continue;}
    const queue=Array.isArray(data)?[...data]:[data];let visited=0;
    while(queue.length&&visited++<100){const row=queue.shift();if(!row||typeof row!=='object')continue;if(Array.isArray(row['@graph']))queue.push(...row['@graph']);
      const types=Array.isArray(row['@type'])?row['@type']:[row['@type']];if(!types.some(t=>/^(NewsArticle|Article|ReportageNewsArticle|AnalysisNewsArticle|BlogPosting)$/.test(t||'')))continue;
      if(row.isAccessibleForFree===false||row.isAccessibleForFree==='false')return null;
      const headline=plain(row.headline||row.name||''),overlap=tokens(headline).filter(t=>tokens(item.title).includes(t)).length;
      if(headline&&overlap<2)continue;
      if(typeof row.articleBody==='string'&&row.articleBody.length>150)chunks.push({text:plain(row.articleBody),coverageLevel:'source-text'});
      else if(typeof row.description==='string')chunks.push({text:plain(row.description),coverageLevel:'publisher-excerpt'});
    }
  }
  if(!chunks.some(c=>c.coverageLevel==='source-text')){
    const section=/<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1]||(isCNBC?elementByToken(html,'div','class','ArticleBody-articleBody'):null)||(/^(?:www\.)?federalreserve\.gov$/.test(new URL(item.link||item.url).hostname)?elementByToken(html,'div','id','article'):null);
    if(section){const paragraphs=[...section.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>plain(m[1])).filter(p=>p.length>55&&!/subscribe|newsletter|cookie|advertisement/i.test(p));const text=paragraphs.join(' ').slice(0,14000);if(text.length>150)chunks.push({text,coverageLevel:'source-text'});}
  }
  if(!chunks.length)for(const match of html.matchAll(/<meta\b[^>]*>/gi)){const tag=match[0],name=/(?:name|property)=["']([^"']+)["']/i.exec(tag)?.[1];if(!/^(description|og:description)$/i.test(name||''))continue;const value=/content=["']([^"']+)["']/i.exec(tag)?.[1];if(value)chunks.push({text:plain(value),coverageLevel:'publisher-excerpt'});}
  const terms=tokens(item.title);
  return chunks.filter(c=>c.text.length>55&&tokens(c.text).filter(t=>terms.includes(t)).length>=2).sort((a,b)=>(b.coverageLevel==='source-text')-(a.coverageLevel==='source-text')||b.text.length-a.text.length)[0]||null;
}
function cacheArticle(id,data) { articleCache.delete(id);articleCache.set(id,data);while(articleCache.size>MAX_ARTICLES)articleCache.delete(articleCache.keys().next().value); }
function prime(item,related=[],now=Date.now()) {
  const id=articleId(item.link||item.url);if(!id)return null;
  const prior=articleCache.get(id),fingerprint=createHash('sha256').update([item.title,item.description,item.pubDate].join('|')).digest('hex');
  if(prior&&prior.fingerprint===fingerprint&&now-prior.at<FRESH_MS)return {...prior.brief,edition:item.edition||'us',category:item.kind==='official-release'?'official':item.category||'all',related:relatedRows(item,related),isCurrent:now-Date.parse(item.pubDate)<=DAY};
  const brief=createBrief(item,{related,now});cacheArticle(id,{item,brief,at:now,fingerprint,scannedAt:0});return brief;
}
async function enhance(item,related=[]) {
  const id=articleId(item.link||item.url),base=prime(item,related),old=articleCache.get(id),url=approvedPageURL(item);
  if(!url)return base;
  if(old.scannedAt&&Date.now()-old.scannedAt<FRESH_MS)return {...old.brief,edition:item.edition||'us',category:item.kind==='official-release'?'official':item.category||'all',related:relatedRows(item,related)};
  if(articlePending.has(id)){const brief=await articlePending.get(id);return {...brief,edition:item.edition||'us',category:item.kind==='official-release'?'official':item.category||'all',related:relatedRows(item,related)};}
  const task=(async()=>{
    let brief=base;
    try{if(!await allowedByRobots(url))brief={...base,sourceAccess:'publisher-access-restricted'};
      else {const response=await boundedFetch(url),content=extractPage(response.text,item);
      if(content)brief=createBrief(item,{sourceText:content.text,coverageLevel:content.coverageLevel,sourceAccess:content.sourceAccess||'public-source',related,accessedAt:Date.now()});
      else brief={...base,sourceAccess:'source-text-unavailable'};}
    }catch{brief={...base,sourceAccess:'source-unavailable'};}
    finally{articlePending.delete(id);}
    const record=articleCache.get(id);if(record)cacheArticle(id,{...record,brief,scannedAt:Date.now()});return brief;
  })();articlePending.set(id,task);return task;
}
function decorate(item,pool=[],now=Date.now()) { return {...item,articleId:articleId(item.link||item.url),readerUrl:readerUrl(item),reader:prime(item,pool,now)}; }
module.exports={articleId,readerUrl,plain,safeURL,rankHeadlines,editorialTier,isNewsworthy,createBrief,decorate,enhance,prime,articleCache,articlePending,approvedPageURL,extractPage,robotsAllows,boundedFetch,relatedRows,MAX_HTML_BYTES,FETCH_TIMEOUT_MS,FRESH_MS};
