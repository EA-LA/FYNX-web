'use strict';
const functions = require('firebase-functions/v1');
const {XMLParser, XMLValidator} = require('fast-xml-parser');
const HOUR_MS = 3600000;
const FRESH_MS = 10 * 60000, HEADLINE_CACHE_MS = 24 * HOUR_MS, RELEASE_CACHE_MS = 7 * 24 * HOUR_MS;
const MAX_XML_BYTES = 2000000, PROVIDER_TIMEOUT_MS = 4200, MAX_CACHE_ENTRIES = 256;
const cache = new Map(), pending = new Map();
const queries = Object.freeze({
  all: 'markets OR stocks OR economy', forex: 'forex OR currencies OR EURUSD OR USDJPY OR sterling',
  crypto: 'bitcoin OR ethereum OR crypto', stocks: 'stocks OR equities OR earnings OR stock exchange',
  macro: 'inflation OR central bank OR economy', commodities: 'gold price OR crude oil OR silver price OR copper futures OR natural gas',
  world: 'global economy OR world trade OR international markets', finance: 'finance OR banking OR bonds OR investing',
  economics: 'economy OR inflation OR GDP OR employment OR economic growth',
  technology: 'technology OR artificial intelligence OR semiconductor OR software',
  politics: 'politics OR government OR election OR parliament OR fiscal policy',
  industries: 'industry OR manufacturing OR aviation OR automotive OR pharmaceuticals OR retail',
  energy: 'energy OR crude oil OR natural gas OR electricity OR renewables',
  analysis: 'financial analysis OR economic analysis OR market outlook OR market explainer'
});
// Google locale and regional query are separate: English reporting about Japan or
// Latin America must not silently become the default US finance feed. Google
// has no JP:en, AE:en or MX:en locale; use a supported English locale with the
// explicit country/region query instead of following its US-default redirect.
const editions = Object.freeze({
  global: {hl:'en-US', gl:'US', ceid:'US:en', query:'global OR international OR world'},
  us: {hl:'en-US', gl:'US', ceid:'US:en', query:'"United States" OR "US economy" OR "Federal Reserve" OR "Wall Street"'},
  uk: {hl:'en-GB', gl:'GB', ceid:'GB:en', query:'"United Kingdom" OR Britain OR British OR "Bank of England" OR UK'},
  canada: {hl:'en-CA', gl:'CA', ceid:'CA:en', query:'Canada OR Canadian OR "Bank of Canada" OR Toronto'},
  europe: {hl:'en-GB', gl:'GB', ceid:'GB:en', query:'Europe OR European OR eurozone OR ECB OR Germany OR France OR Italy OR Spain'},
  asia: {hl:'en-SG', gl:'SG', ceid:'SG:en', query:'Asia OR Asian OR China OR Japan OR India OR Singapore OR Korea OR Indonesia'},
  india: {hl:'en-IN', gl:'IN', ceid:'IN:en', query:'India OR Indian OR RBI OR Mumbai OR "New Delhi"'},
  'middle-east': {hl:'en-GB', gl:'GB', ceid:'GB:en', query:'"Middle East" OR "Saudi Arabia" OR UAE OR Dubai OR Qatar OR Israel OR Iran'},
  africa: {hl:'en-ZA', gl:'ZA', ceid:'ZA:en', query:'Africa OR African OR Nigeria OR Kenya OR Egypt OR "South Africa"'},
  'latin-america': {hl:'en-US', gl:'US', ceid:'US:en', query:'"Latin America" OR Brazil OR Mexico OR Argentina OR Chile OR Colombia OR Peru'},
  japan: {hl:'en-SG', gl:'SG', ceid:'SG:en', query:'Japan OR Japanese OR Tokyo OR Nikkei OR "Bank of Japan"'},
  australia: {hl:'en-AU', gl:'AU', ceid:'AU:en', query:'Australia OR Australian OR Sydney OR ASX OR "Reserve Bank of Australia"'}
});
// Feed URLs verified against the publishers' own RSS directories. Only headings,
// links and dates are used; full articles and HTML images are never scraped.
const officialSources = [
  {id:'fed',name:'Federal Reserve',url:'https://www.federalreserve.gov/feeds/press_monetary.xml',website:'https://www.federalreserve.gov/newsevents/pressreleases.htm',hosts:['www.federalreserve.gov','federalreserve.gov'],editions:['us']},
  {id:'bea',name:'U.S. Bureau of Economic Analysis',url:'https://apps.bea.gov/rss/rss.xml',website:'https://www.bea.gov/news',hosts:['www.bea.gov','bea.gov','apps.bea.gov'],editions:['us']},
  {id:'ecb',name:'European Central Bank',url:'https://www.ecb.europa.eu/rss/press.html',website:'https://www.ecb.europa.eu/press/html/index.en.html',hosts:['www.ecb.europa.eu','ecb.europa.eu'],editions:['europe']},
  {id:'boe',name:'Bank of England',url:'https://www.bankofengland.co.uk/rss/news',website:'https://www.bankofengland.co.uk/news',hosts:['www.bankofengland.co.uk','bankofengland.co.uk'],editions:['uk']},
  {id:'boc',name:'Bank of Canada',url:'https://www.bankofcanada.ca/content_type/press-releases/feed/',website:'https://www.bankofcanada.ca/press/',hosts:['www.bankofcanada.ca','bankofcanada.ca'],editions:['canada']},
  {id:'boj',name:'Bank of Japan',url:'https://www.boj.or.jp/en/rss/whatsnew.xml',website:'https://www.boj.or.jp/en/',hosts:['www.boj.or.jp','boj.or.jp'],editions:['japan','asia'],upgradeHTTP:true},
  {id:'rba',name:'Reserve Bank of Australia',url:'https://www.rba.gov.au/rss/rss-cb-media-releases.xml',website:'https://www.rba.gov.au/media-releases/',hosts:['www.rba.gov.au','rba.gov.au'],editions:['australia']}
];
const directSources = Object.freeze({
  cnbc:{id:'cnbc',name:'CNBC',url:'https://www.cnbc.com/id/10000664/device/rss/rss.html'},
  coindesk:{id:'coindesk',name:'CoinDesk',url:'https://www.coindesk.com/arc/outboundfeeds/rss/'},
  energy:{id:'cnbc-energy',name:'CNBC',url:'https://www.cnbc.com/id/19836768/device/rss/rss.html'},
  fxstreet:{id:'fxstreet',name:'FXStreet',url:'https://www.fxstreet.com/rss/news'}
});
function safeURL(value, hosts) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.href.length > 2048) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || host.endsWith('.') || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || (hosts && !hosts.includes(host))) return null;
    url.hash = ''; return url.href;
  } catch { return null; }
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

function publicationTime(value) {
  if (typeof value !== 'string' || value.length > 100) return NaN;
  const input = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2}))?$/i.exec(input);
  const rfc = /^(?:[A-Za-z]{3},?\s+)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+\d{2}:\d{2}(?::\d{2})?\s+(?:GMT|UTC|EST|EDT|CST|CDT|MST|MDT|PST|PDT|[+-]\d{4})$/i.exec(input);
  if (!iso && !rfc) return NaN;
  const year = Number(iso ? iso[1] : rfc[3]), month = iso ? Number(iso[2]) : ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(rfc[2].toLowerCase()) + 1;
  const day = Number(iso ? iso[3] : rfc[1]), check = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || month < 1 || month > 12 || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return NaN;
  return Date.parse(input);
}
function retentionHours(category, official = false) { return official ? 720 : category === 'analysis' ? 168 : 48; }
function validDate(pubDate, now, hours) {
  const date = publicationTime(pubDate);
  return Number.isFinite(date) && date <= now + 300000 && date >= now - hours * HOUR_MS;
}
function validateSelectors(category, edition) {
  if (typeof category !== 'string' || !Object.hasOwn(queries, category)) throw new Error('Unknown category');
  if (typeof edition !== 'string' || !Object.hasOwn(editions, edition)) throw new Error('Unknown edition');
}
const asArray = value => Array.isArray(value) ? value : value ? [value] : [];
// A thumbnail in RSS is not automatically licensed. Require a media-level reuse
// license and attribution. In particular, BBC and syndicated agency pictures do
// not become reusable merely because their URLs are public. No HTML extraction.
const reusableImageLicenses = new Set([
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-sa/4.0/',
  'https://creativecommons.org/publicdomain/zero/1.0/'
]);
function feedImage(item, article) {
  const groups = [item, ...asArray(item['media:group'])];
  for (const group of groups) {
    for (const origin of ['media:thumbnail','media:content','enclosure']) {
      for (const node of asArray(group[origin])) {
        if (!node || typeof node !== 'object') continue;
        const url = safeURL(node['@_url']);
        const mime = String(node['@_type'] || '').toLowerCase();
        if (!url || (mime && !/^image\/(jpeg|png|gif|webp|avif)$/.test(mime))) continue;
        if (origin !== 'media:thumbnail' && !mime && node['@_medium'] !== 'image') continue;
        if (!mime && !/\.(jpe?g|png|gif|webp|avif)$/i.test(new URL(url).pathname)) continue;
        const license = node['media:license'] || node['cc:license'];
        const licenseURL = safeURL(typeof license === 'object' ? license['@_href'] || license['@_url'] || license['@_rdf:resource'] || license['#text'] : license);
        if (!reusableImageLicenses.has(licenseURL)) continue;
        const credit = text(node['media:credit'] || node['media:copyright']);
        if (!credit && !licenseURL.includes('/zero/')) continue;
        const dimension = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 10000 ? Number(value) : null;
        return {url,source:article.source,sourceURL:article.link,credit:credit || article.source,origin,width:dimension(node['@_width']),height:dimension(node['@_height']),licenseURL};
      }
    }
  }
  return null;
}
function parseFeed(xml, now = Date.now(), options = {}) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml, 'utf8') > MAX_XML_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsafe or oversized XML');
  if (XMLValidator.validate(xml) !== true) throw new Error('Malformed XML');
  const parsed = new XMLParser({ignoreAttributes:false,trimValues:true}).parse(xml);
  const rdf = parsed['rdf:RDF'];
  if (!Object.hasOwn(parsed.rss || {}, 'channel') && !Object.hasOwn(parsed, 'feed') && !Object.hasOwn(rdf || {}, 'channel')) throw new Error('Not a supported feed');
  const rows = asArray(parsed.rss?.channel?.item ?? parsed.feed?.entry ?? rdf?.item);
  let validRows = 0;
  const hours = retentionHours(options.category, options.official);
  const items = rows.flatMap(item => {
    const rawLink = Array.isArray(item.link) ? item.link.find(link => !link['@_rel'] || link['@_rel'] === 'alternate') : item.link;
    let href = typeof rawLink === 'object' ? rawLink?.['@_href'] ?? rawLink?.['#text'] : rawLink;
    // BoJ's verified English feed still publishes HTTP article links. Upgrade
    // only this configured official publisher, never arbitrary user/feed hosts.
    if (options.upgradeHTTP && typeof href === 'string' && href.startsWith('http://')) href = href.replace(/^http:/, 'https:');
    const link = safeURL(href, options.hosts), title = text(item.title);
    const date = publicationTime(item.pubDate ?? item.published ?? item.updated ?? item['dc:date']);
    if (!title || !link || !Number.isFinite(date) || date > now + 300000) return [];
    validRows++;
    if (date < now - hours * HOUR_MS) return [];
    const article = {title,link,pubDate:new Date(date).toISOString(),source:options.source || text(item.source) || 'Market news',description:''};
    const image = feedImage(item, article);
    if (image) article.image = image;
    return [article];
  });
  // Expired but structurally valid releases are a successful empty feed. Only
  // malformed records are failures eligible for the bounded saved-feed path.
  if (options.official && rows.length && !validRows) throw new Error('No valid official releases');
  return mergeFeeds([items], options.official ? 50 : 300);
}
function mergeFeeds(feeds, limit = 30) {
  const result = new Map();
  for (const item of feeds.flat().sort((a,b) => Date.parse(b.pubDate) - Date.parse(a.pubDate))) if (!result.has(item.link)) result.set(item.link, item);
  return [...result.values()].slice(0, limit);
}
function newsSources(category, edition = 'us') {
  validateSelectors(category, edition);
  const locale = editions[edition];
  const q = '(' + queries[category] + ') (' + locale.query + ') when:' + (category === 'analysis' ? '7d' : '2d');
  const sources = [{id:'google',name:'Google News aggregation',url:'https://news.google.com/rss/search?' + new URLSearchParams({q,hl:locale.hl,gl:locale.gl,ceid:locale.ceid}),via:'Google News'}];
  // Preserve established US fallback feeds. These broad publishers cannot stand
  // in for another country's selected edition, nor an unrelated category.
  if (edition === 'us' && category !== 'analysis') {
    sources.push(directSources.cnbc);
    if (category === 'crypto') sources.push(directSources.coindesk);
    if (['commodities','energy'].includes(category)) sources.push(directSources.energy);
    if (['forex','commodities','macro'].includes(category)) sources.push(directSources.fxstreet);
  }
  return sources;
}
const allowedFeedURLs = new Set([
  ...officialSources.map(source => source.url), ...Object.values(directSources).map(source => source.url),
  ...Object.keys(editions).flatMap(edition => Object.keys(queries).flatMap(category => newsSources(category, edition).map(source => source.url)))
]);
async function fetchXML(url, timeoutMs = PROVIDER_TIMEOUT_MS) {
  if (!allowedFeedURLs.has(url)) throw new Error('Unconfigured publisher URL');
  const controller = new AbortController(); let timer;
  const timeout = new Promise((_,reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Publisher timed out')); }, timeoutMs); });
  try { return await Promise.race([(async () => {
    // Never follow an upstream redirect into an arbitrary/internal destination.
    const response = await fetch(url,{redirect:'error',signal:controller.signal,headers:{'User-Agent':'FYNX-News/1.2','Accept':'application/rss+xml, application/atom+xml, application/xml, text/xml'}});
    if (!response.ok) throw new Error('Publisher HTTP ' + response.status);
    const length = Number(response.headers?.get?.('content-length') || 0); if (length > MAX_XML_BYTES) throw new Error('Feed too large');
    if (!response.body?.getReader) { const xml = await response.text(); if (Buffer.byteLength(xml) > MAX_XML_BYTES) throw new Error('Feed too large'); return xml; }
    const reader = response.body.getReader(), chunks = []; let total = 0;
    try { while (true) { const {done,value} = await reader.read(); if (done) break; total += value.byteLength; if (total > MAX_XML_BYTES) { await reader.cancel(); throw new Error('Feed too large'); } chunks.push(Buffer.from(value)); } }
    finally { reader.releaseLock(); }
    return Buffer.concat(chunks).toString('utf8');
  })(),timeout]); } finally { clearTimeout(timer); }
}
const categoryWords = {
  forex:/\b(currency|currencies|forex|dollars?|yen|euros?|sterling|usd|eur|gbp|jpy|aud|cad|eurusd|usdjpy|gbpusd|audusd|usdcad)\b/i,
  crypto:/\b(crypto\w*|bitcoin|ethereum|tokens?)\b/i,
  stocks:/\b(stocks?|shares?|equities|earnings|nasdaq|S&P|Dow|IPO|FTSE|DAX|CAC|STOXX|Nikkei|TOPIX|Hang Seng|Sensex|Nifty|ASX|TSX|Ibovespa)\b/i,
  macro:/\b(inflation|fed|rates?|econom\w*|jobs|central bank|GDP)\b/i,
  commodities:/\b(gold|oil|commodit\w*|silver|energy|copper|natural gas|crude|bullion|wheat|metals?)\b/i,
  world:/\b(global|world|china|europe|asia|trade|international)\b/i,
  finance:/\b(financ\w*|banks?|banking|bonds?|invest\w*|funds?|credit|loans?|capital|markets?|profits?|revenue|debt|lending|mortgages?|funding|valuation)\b/i,
  economics:/\b(econom\w*|inflation|GDP|jobs|employment|unemployment|growth|recession)\b/i,
  technology:/\b(tech|technolog\w*|AI|artificial intelligence|machine learning|semiconductor\w*|software|hardware|chips?|internet|cyber\w*|digital|data cent(?:er|re)s?|cloud computing|computers?|computing|robotics|robots?|quantum|5G|6G)\b/i,
  politics:/\b(politic\w*|government|election\w*|parliament|president|minister|congress|senate|fiscal|tariffs?)\b/i,
  industries:/\b(indust\w*|manufactur\w*|aviation|aerospace|automotive|pharmaceutical\w*|retail|airlines?|factories|factory|logistics|shipping|construction|automakers?)\b/i,
  energy:/\b(energy|oil|gas|electric\w*|renewables?|solar|wind|power|crude|OPEC)\b/i,
  analysis:/\b(analysis|explainer|outlook|opinion)\b/i
};
// Search can match a passing mention in article bodies. Require a regional
// signal in non-US headlines so a generic US/global story cannot fill an edition.
const editionWords = {
  // London alone is ambiguous (for example London, Ontario); require a UK signal.
  uk:/\b(UK|U\.K\.|United Kingdom|Britain|British|England|English|Scotland|Scottish|Wales|Welsh|FTSE|sterling|Bank of England)\b/i,
  canada:/\b(Canada|Canadian|Toronto|Ottawa|Vancouver|Quebec|Alberta|TSX|loonie|Carney|Bank of Canada)\b/i,
  europe:/\b(Europe|European|eurozone|ECB|EU|Germany|German|France|French|Italy|Italian|Spain|Spanish|Euro|DAX|CAC|STOXX|Brussels|Frankfurt|Paris)\b/i,
  asia:/\b(Asia|Asian|China|Chinese|Japan|Japanese|India|Indian|Singapore|Korea|Korean|Taiwan|Taiwanese|Indonesia|Indonesian|Malaysia|Malaysian|Thailand|Thai|Vietnam|Vietnamese|Philippines|Hong Kong|Nikkei|Hang Seng|Shanghai|Tokyo|Seoul)\b/i,
  india:/\b(India|Indian|RBI|Mumbai|Delhi|Bengaluru|Bangalore|Sensex|Nifty|rupee|Modi)\b/i,
  'middle-east':/\b(Middle East|Saudi|UAE|Emirati|Dubai|Abu Dhabi|Qatar|Qatari|Israel|Israeli|Iran|Iranian|Iraq|Iraqi|Kuwait|Kuwaiti|Bahrain|Bahraini|Oman|Omani|Jordan|Jordanian|Lebanon|Lebanese|OPEC|Hormuz|Riyadh|Tehran)\b/i,
  africa:/\b(Africa|African|Nigeria|Nigerian|Kenya|Kenyan|Egypt|Egyptian|Ghana|Ghanaian|Morocco|Moroccan|Ethiopia|Ethiopian|Tunisia|Tunisian|Angola|Angolan|Johannesburg|Nairobi|Lagos|Cairo|JSE)\b/i,
  'latin-america':/\b(Latin America|Latin American|Latam|Brazil|Brazilian|Mexico|Mexican|Argentina|Argentine|Argentinian|Chile|Chilean|Colombia|Colombian|Peru|Peruvian|Uruguay|Uruguayan|Venezuela|Venezuelan|Ecuador|Ecuadorian|Bolivia|Bolivian|Panama|Panamanian|Costa Rica|Bovespa|Sao Paulo|São Paulo|Buenos Aires)\b/i,
  japan:/\b(Japan|Japanese|Tokyo|Nikkei|TOPIX|yen|BoJ|Bank of Japan)\b/i,
  australia:/\b(Australia|Australian|Sydney|Melbourne|Canberra|ASX|RBA|Reserve Bank of Australia)\b/i
};
function matchesEdition(item, edition) { return !editionWords[edition] || editionWords[edition].test(item.title); }
function matchesCategory(item, category) {
  if (category === 'all') return true;
  // Aggregators can match navigation text or passing body mentions. Every
  // source must provide a headline signal for the selected desk; fewer relevant
  // records are preferable to filling a technology desk with unrelated news.
  return !!categoryWords[category]?.test(item.title);
}
function trimItems(items, now, hours) { return (items || []).filter(item => validDate(item.pubDate, now, hours)); }
function setCache(key, value) {
  cache.delete(key); cache.set(key, value);
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}
function envelope(kind, edition, category, data, now = Date.now()) {
  const hours = retentionHours(category, kind === 'official-releases');
  const items = trimItems(data.items, now, hours);
  return {...data,kind,edition,category,language:'en',freshForMs:FRESH_MS,retentionHours:hours,cutoffAt:new Date(now - hours * HOUR_MS).toISOString(),items,publishedAt:items[0]?.pubDate || null};
}
async function load(category = 'all', edition = 'us') {
  validateSelectors(category, edition);
  const key = 'headlines:' + edition + ':' + category, old = cache.get(key), now = Date.now();
  if (old && now - Date.parse(old.fetchedAt) < FRESH_MS) return envelope('headlines', edition, category, old, now);
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    try {
      const sources = newsSources(category, edition);
      const results = await Promise.allSettled(sources.map(async source => {
        const rows = parseFeed(await fetchXML(source.url), Date.now(), {category,source:source.via ? undefined : source.name});
        return rows.filter(item => matchesCategory(item, category) && matchesEdition(item, edition)).map(item => ({...item,sourceId:source.id,via:source.via || null,edition,category,kind:category === 'analysis' ? 'analysis' : 'headline'}));
      }));
      if (!results.some(result => result.status === 'fulfilled')) throw new Error('All publishers unavailable');
      const items = mergeFeeds(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
      const fetchedAt = new Date().toISOString();
      const data = envelope('headlines', edition, category, {items,fetchedAt,stale:false,sources:sources.map((source,i) => ({id:source.id,name:source.name,website:source.url,status:results[i].status === 'fulfilled' ? 'fresh' : 'unavailable',fetchedAt:results[i].status === 'fulfilled' ? fetchedAt : null,message:results[i].status === 'fulfilled' ? 'Updated from source' : 'Source could not be refreshed'}))});
      setCache(key, data); return data;
    } catch (error) {
      if (old && Date.now() - Date.parse(old.fetchedAt) < HEADLINE_CACHE_MS) return envelope('headlines', edition, category, {...old,stale:true,sources:(old.sources || []).map(source => source.fetchedAt ? {...source,status:'cached',message:'Refresh unavailable; showing a saved feed'} : source)});
      throw error;
    } finally { pending.delete(key); }
  })(); pending.set(key, task); return task;
}
async function loadOfficialReleases(edition = 'us', category = 'all') {
  validateSelectors(category, edition);
  const key = 'official-releases:' + edition + ':' + category;
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    try {
      const selected = officialSources.filter(source => edition === 'global' || source.editions.includes(edition));
      const results = await Promise.all(selected.map(async source => {
        const sourceKey = key + ':' + source.id, old = cache.get(sourceKey), now = Date.now();
        const meta = {id:source.id,name:source.name,website:source.website};
        if (old && now - Date.parse(old.fetchedAt) < FRESH_MS) return {...meta,items:trimItems(old.items,now,720),status:'fresh',fetchedAt:old.fetchedAt,message:'Updated from the official source'};
        try {
          const items = parseFeed(await fetchXML(source.url), Date.now(), {...source,official:true,source:source.name}).filter(item => matchesCategory(item, category)).map(item => ({...item,sourceId:source.id,via:null,edition,category,kind:'official-release'}));
          const fetchedAt = new Date().toISOString(); setCache(sourceKey,{items,fetchedAt});
          return {...meta,items,status:'fresh',fetchedAt,message:'Updated from the official source'};
        } catch {
          if (old && now - Date.parse(old.fetchedAt) < RELEASE_CACHE_MS) return {...meta,items:trimItems(old.items,now,720),status:'cached',fetchedAt:old.fetchedAt,message:'Refresh unavailable; showing saved releases'};
          return {...meta,items:[],status:'unavailable',fetchedAt:null,message:'Feed unavailable; the official source remains linked'};
        }
      }));
      const items = mergeFeeds(results.map(result => result.items),150), available = results.filter(result => result.status !== 'unavailable');
      return envelope('official-releases', edition, category, {items,fetchedAt:available.length ? new Date(Math.min(...available.map(source => Date.parse(source.fetchedAt)))).toISOString() : null,stale:!results.length || results.some(source => source.status !== 'fresh'),sources:results.map(({items,...source}) => source),...(!selected.length ? {message:'No configured official-release feed for this edition'} : {})});
    } finally { pending.delete(key); }
  })(); pending.set(key, task); return task;
}
async function handler(req, res) {
  res.set('Access-Control-Allow-Origin','*'); res.set('X-Content-Type-Options','nosniff');
  if (req.method === 'OPTIONS') { res.set('Access-Control-Allow-Methods','GET'); return res.status(204).send(''); }
  if (req.method !== 'GET') return res.status(405).json({error:'Use GET'});
  const query = req.query || {}, kind = query.kind === undefined ? 'headlines' : query.kind;
  const category = query.category === undefined ? 'all' : query.category, edition = query.edition === undefined ? 'us' : query.edition;
  try { if (typeof kind !== 'string' || !['headlines','releases'].includes(kind)) throw new Error('Unknown kind'); validateSelectors(category,edition); }
  catch { return res.status(400).json({error:'Unknown feed selector'}); }
  try {
    const data = kind === 'releases' ? await loadOfficialReleases(edition,category) : await load(category,edition);
    // Instance cache and HTTP cache together never extend freshness past 10 min.
    const age = Date.now() - Date.parse(data.fetchedAt), remaining = Number.isFinite(age) ? Math.max(0,Math.floor((FRESH_MS - age) / 1000)) : 0;
    res.set('Cache-Control',data.stale || !remaining ? 'no-store' : 'public,max-age=' + Math.min(120,remaining)); return res.json(data);
  } catch { res.set('Cache-Control','no-store'); return res.status(503).json({error:'News is temporarily unavailable. Please try again.',edition,category,language:'en'}); }
}
exports.webMarketFeed = functions.runWith({timeoutSeconds:15,memory:'256MB',maxInstances:4}).https.onRequest(handler);
exports._test = {parseFeed,mergeFeeds,load,loadOfficialReleases,cache,pending,safeURL,fetchXML,officialSources,handler,newsSources,editions,queries,publicationTime,feedImage,retentionHours,PROVIDER_TIMEOUT_MS,FRESH_MS,MAX_CACHE_ENTRIES};
