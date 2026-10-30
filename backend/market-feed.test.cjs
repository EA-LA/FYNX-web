const {test}=require('node:test');const assert=require('node:assert/strict');const {parseFeed}=require('./market-feed')._test;
test('RSS removes stale, invalid and duplicate stories and sorts by publication',()=>{
 const now=Date.parse('2026-09-22T16:00:00Z');
 const item=(title,date,url)=>`<item><title>${title}</title><link>${url}</link><pubDate>${date}</pubDate><source>Publisher</source></item>`;
 const xml='<rss><channel>'+item('Recent','2026-09-22T15:00:00Z','https://example.com/a')+item('Old','2025-01-01','https://example.com/old')+item('Bad','invalid','javascript:alert(1)')+item('Recent','2026-09-22T15:00:00Z','https://example.com/a')+'</channel></rss>';
 const result=parseFeed(xml,now);assert.equal(result.length,1);assert.equal(result[0].source,'Publisher');assert.equal(result[0].title,'Recent');
});
test('official CDATA titles decode numeric and common entities before plain-text normalization',()=>{
 const xml='<rss><channel><item><title><![CDATA[Board&#39;s &quot;policy&quot; &amp; outlook&nbsp;&mdash; euro &#x20AC;]]></title><link>https://www.federalreserve.gov/newsevents/test.htm</link><pubDate>2026-10-20T10:00:00Z</pubDate></item></channel></rss>';
 const rows=parseFeed(xml,Date.parse('2026-10-25'),{official:true,hosts:['www.federalreserve.gov'],source:'Federal Reserve'});
 assert.equal(rows[0].title,'Board\'s "policy" & outlook — euro €');
});
test('encoded and nested unsafe HTML is stripped after decoding CDATA titles',()=>{
 const title='Board&amp;#39;s &amp;lt;img src=x onerror=&amp;quot;alert(1)&amp;quot;&amp;gt; &lt;script&gt;alert(2)&lt;/script&gt; &lt;b&gt;decision&lt;/b&gt;';
 const xml=`<rss><channel><item><title><![CDATA[${title}]]></title><link>https://example.com/policy</link><pubDate>2026-10-20T10:00:00Z</pubDate></item></channel></rss>`;
 const rows=parseFeed(xml,Date.parse('2026-10-20T12:00:00Z'));
 assert.equal(rows[0].title,"Board's decision");assert.doesNotMatch(rows[0].title,/<|>|onerror|alert/);
});
test('invalid numeric entities never produce control characters or throw on large code points',()=>{
 const xml='<rss><channel><item><title><![CDATA[Outlook &#0; &#xD800; &#x110000; &#999999999999999999999; &unknown; &#x1F4C8;]]></title><link>https://example.com/outlook</link><pubDate>2026-10-20T10:00:00Z</pubDate></item></channel></rss>';
 assert.equal(parseFeed(xml,Date.parse('2026-10-20T12:00:00Z'))[0].title,'Outlook � � � � &unknown; 📈');
});
test('commodity articles beyond the first thirty feed entries remain available for filtering',()=>{
 const now=Date.now(),date=new Date(now).toUTCString();const xml='<rss><channel>'+Array.from({length:45},(_,i)=>`<item><title>${i===40?'Gold price rises':'Stock update '+i}</title><link>https://example.com/${i}</link><pubDate>${date}</pubDate></item>`).join('')+'</channel></rss>';
 assert(parseFeed(xml,now).some(item=>item.title==='Gold price rises'));
});
test('publisher failure does not hide another publisher, and empty successful feeds are not outages',async()=>{
 const api=require('./market-feed')._test,old=global.fetch;api.cache.clear();
 try{
  global.fetch=async url=>{if(url.includes('news.google'))throw Error('offline');return{ok:true,text:async()=>'<rss><channel></channel></rss>'};};
  const empty=await api.load('commodities');assert.deepEqual(empty.items,[]);assert.equal(empty.stale,false);
  api.cache.clear();global.fetch=async()=>{throw Error('offline');};await assert.rejects(api.load('commodities'));
 }finally{global.fetch=old;api.cache.clear();}
});
test('dedicated energy feed supplies commodities when search is unavailable and broad news is unrelated',async()=>{
 const api=require('./market-feed')._test,old=global.fetch;api.cache.clear();
 const item=(title,link)=>`<rss><channel><item><title>${title}</title><link>${link}</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
 try{
  global.fetch=async url=>{if(!url.includes('cnbc.com'))throw Error('provider unavailable');return{ok:true,text:async()=>url.includes('19836768')?item('Crude oil exports recover','https://www.cnbc.com/energy-story'):item('Goldman Sachs names executive','https://www.cnbc.com/bank-story')};};
  const data=await api.load('commodities');assert.equal(data.items.length,1);assert.equal(data.items[0].source,'CNBC');assert.equal(data.items[0].title,'Crude oil exports recover');assert.equal(data.stale,false);
 }finally{global.fetch=old;api.cache.clear();}
});
test('forex excludes Europe substring matches without discarding fresh currency coverage',async()=>{
 const api=require('./market-feed')._test,old=global.fetch;api.cache.clear();
 const date=new Date(Date.now()-86400000).toUTCString();
 const xml='<rss><channel>'+['Europe imposes trade curbs','Euro falls against dollar'].map((title,i)=>`<item><title>${title}</title><link>https://example.com/${i}</link><pubDate>${date}</pubDate></item>`).join('')+'</channel></rss>';
 try{global.fetch=async url=>{if(url.includes('news.google'))throw Error('offline');return{ok:true,text:async()=>xml};};
 const data=await api.load('forex');assert.equal(data.items.length,1);assert.equal(data.items[0].title,'Euro falls against dollar');assert.equal(data.publishedAt,new Date(date).toISOString());assert.equal(data.stale,false);
 }finally{global.fetch=old;api.cache.clear();}
});
test('dedicated crypto publisher survives unavailable search and empty broad feeds',async()=>{
 const api=require('./market-feed')._test,old=global.fetch;api.cache.clear();
 try{global.fetch=async url=>{if(url.includes('news.google'))throw Error('offline');return{ok:true,text:async()=>url.includes('coindesk')?`<rss><channel><item><title>Bitcoin market update</title><link>https://www.coindesk.com/test</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`:'<rss><channel/></rss>'};};
 const data=await api.load('crypto');assert.equal(data.items.length,1);assert.equal(data.items[0].source,'CoinDesk');assert.equal(data.stale,false);
 }finally{global.fetch=old;api.cache.clear();}
});

test('XML parser rejects unsafe entities, unsupported documents, malformed XML and excessive bodies',()=>{
 for(const xml of ['<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///etc/passwd">]><rss><channel/></rss>','<html><body>Unavailable</body></html>','<rss><channel>','x'.repeat(2000001)])assert.throws(()=>parseFeed(xml));
 assert.deepEqual(parseFeed('<rss><channel/></rss>'),[]);
});
test('article URLs reject active protocols, credentials, private hosts and alternate ports',()=>{
 const {safeURL}=require('./market-feed')._test;
 for(const url of ['javascript:alert(1)','http://example.com','https://user:pass@example.com/','https://localhost/a','https://127.0.0.1/a','https://[::1]/a','https://foo.local/a','https://example.com:8080/a'])assert.equal(safeURL(url),null,url);
 assert.equal(safeURL('https://www.ecb.europa.eu/a#x',['www.ecb.europa.eu']),'https://www.ecb.europa.eu/a');
 assert.equal(safeURL('https://www.ecb.europa.eu.attacker.example/a',['www.ecb.europa.eu']),null);
});
test('official Atom releases preserve publications within thirty days and reject foreign source URLs',()=>{
 const {parseFeed}=require('./market-feed')._test;
 const xml='<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Policy update</title><link rel="alternate" href="https://www.ecb.europa.eu/a"/><updated>2025-01-01T10:00:00Z</updated></entry><entry><title>Injected</title><link href="https://attacker.example/a"/><published>2025-01-01</published></entry></feed>';
 const rows=parseFeed(xml,Date.parse('2025-01-20'),{official:true,hosts:['www.ecb.europa.eu'],source:'European Central Bank'});
 assert.equal(rows.length,1);assert.equal(rows[0].source,'European Central Bank');assert.equal(rows[0].pubDate,'2025-01-01T10:00:00.000Z');
});
test('nonempty entirely invalid official feeds fail instead of erasing a cache',()=>{
 const options={official:true,hosts:['www.bea.gov'],source:'BEA'};
 assert.throws(()=>parseFeed('<rss><channel><item><title>Bad</title><link>https://attacker.example/a</link><pubDate>2026-10-01</pubDate></item></channel></rss>',Date.now(),options));
 assert.deepEqual(parseFeed('<rss><channel/></rss>',Date.now(),options),[]);
});
test('provider request has a hard deadline even when a transport ignores AbortSignal',async()=>{
 const {fetchXML}=require('./market-feed')._test,old=global.fetch;let aborted=false;
 try{global.fetch=(_url,options)=>{options.signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});};const started=Date.now();await assert.rejects(fetchXML('https://www.federalreserve.gov/feeds/press_monetary.xml',30),/timed out/);assert(Date.now()-started<500);assert.equal(aborted,true);}
 finally{global.fetch=old;}
});
test('oversized upstream content is rejected before body consumption',async()=>{
 const {fetchXML}=require('./market-feed')._test,old=global.fetch;
 try{global.fetch=async()=>({ok:true,headers:{get:()=>3000000},text:async()=>{throw Error('Must not consume');}});await assert.rejects(fetchXML('https://www.federalreserve.gov/feeds/press_monetary.xml'),/too large/);}
 finally{global.fetch=old;}
});
test('official partial failures preserve only the failed source cache and label every source',async()=>{
 const api=require('./market-feed')._test,old=global.fetch;api.cache.clear();
 const savedAt=new Date(Date.now()-600000).toISOString(),pubDate=new Date(Date.now()-86400000).toISOString();
 api.cache.set('official-releases:global:all:bea',{fetchedAt:savedAt,items:[{title:'Saved GDP',link:'https://www.bea.gov/news/gdp',pubDate,source:'U.S. Bureau of Economic Analysis',sourceId:'bea'}]});
 try{global.fetch=async url=>{if(!url.includes('federalreserve'))throw Error('unavailable');return {ok:true,text:async()=>`<rss><channel><item><title>Policy decision</title><link>https://www.federalreserve.gov/newsevents/pressreleases/test.htm</link><pubDate>${pubDate}</pubDate></item></channel></rss>`};};
 const data=await api.loadOfficialReleases('global');assert.equal(data.kind,'official-releases');assert.equal(data.items.length,2);assert.deepEqual(data.sources.map(s=>s.status),['fresh','cached','unavailable','unavailable','unavailable','unavailable','unavailable']);assert.equal(data.sources[1].fetchedAt,savedAt);assert.equal(data.stale,true);}
 finally{global.fetch=old;api.cache.clear();}
});
test('official total outage returns truthful source states with no fabricated releases',async()=>{
 const api=require('./market-feed')._test,old=global.fetch;api.cache.clear();
 try{global.fetch=async()=>{throw Error('offline');};const data=await api.loadOfficialReleases();assert.deepEqual(data.items,[]);assert.equal(data.fetchedAt,null);assert(data.sources.every(source=>source.status==='unavailable'));}
 finally{global.fetch=old;api.cache.clear();}
});
test('concurrent US official refreshes share only two upstream requests',async()=>{
 const api=require('./market-feed')._test,old=global.fetch;api.cache.clear();let calls=0;
 try{global.fetch=async()=>{calls++;return{ok:true,text:async()=>'<rss><channel/></rss>'};};await Promise.all([api.loadOfficialReleases(),api.loadOfficialReleases()]);assert.equal(calls,2);assert.equal(api.pending.size,0);}
 finally{global.fetch=old;api.cache.clear();}
});
test('category outage keeps cache timestamps and marks sources cached',async()=>{
 const api=require('./market-feed')._test,old=global.fetch;api.cache.clear();const fetchedAt=new Date(Date.now()-600000).toISOString();
 api.cache.set('headlines:us:all',{items:[],fetchedAt,publishedAt:null,stale:false,sources:[{id:'cnbc',name:'CNBC',fetchedAt,status:'fresh'}]});
 try{global.fetch=async()=>{throw Error('offline');};const data=await api.load('all');assert.equal(data.fetchedAt,fetchedAt);assert.equal(data.stale,true);assert.equal(data.sources[0].status,'cached');}
 finally{global.fetch=old;api.cache.clear();}
});
test('HTTP contract rejects unsupported methods and feed selectors without fetching',async()=>{
 const {handler}=require('./market-feed')._test;const response=()=>({code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;}});
 for(const [method,query,status] of [['POST',{},405],['GET',{kind:'arbitrary'},400],['GET',{category:'__proto__'},400],['OPTIONS',{},204]]){const res=response();await handler({method,query},res);assert.equal(res.code,status);}
});

const api=require('./market-feed')._test;
const HOUR=3600000;
const rssItem=(title,link,date,extra='')=>`<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate><source>Publisher</source>${extra}</item>`;
const rss=(...items)=>'<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:cc="http://creativecommons.org/ns#"><channel>'+items.join('')+'</channel></rss>';
const okXML=xml=>({ok:true,text:async()=>xml});
const response=()=>({code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;}});

test('every configured edition has English locale and a distinct regional search, without US publisher substitution',()=>{
 assert.deepEqual(Object.keys(api.editions),['global','us','uk','canada','europe','asia','india','middle-east','africa','latin-america','japan','australia']);
 for(const edition of Object.keys(api.editions)){
  for(const category of Object.keys(api.queries)){
   const sources=api.newsSources(category,edition),url=new URL(sources[0].url),locale=api.editions[edition];
   assert.equal(url.searchParams.get('hl'),locale.hl);assert.match(url.searchParams.get('hl'),/^en/);
   assert.equal(url.searchParams.get('gl'),locale.gl);assert.equal(url.searchParams.get('ceid'),locale.ceid);
   assert(url.searchParams.get('q').includes('('+locale.query+')'));assert(url.searchParams.get('q').includes('('+api.queries[category]+')'));
   assert.match(url.searchParams.get('q'),category==='analysis'?/when:7d$/:/when:2d$/);
   if(edition!=='us')assert.equal(sources.length,1,edition+':'+category);
  }
 }
});

test('edition and category validation rejects empty, repeated, prototype and arbitrary URL selectors before I/O',async()=>{
 const old=global.fetch;let calls=0;
 try{
  global.fetch=async()=>{calls++;throw Error('must not fetch');};
  for(const query of [{edition:''},{edition:'__proto__'},{edition:'US'},{edition:'https://example.com/feed'},{edition:['us','uk']},{edition:{}},{category:['all','finance']},{category:''},{category:'constructor'},{kind:['releases']}]){
   const res=response();await api.handler({method:'GET',query},res);assert.equal(res.code,400,JSON.stringify(query));
  }
  assert.equal(calls,0);
 }finally{global.fetch=old;}
});

test('parallel editions and categories keep requests, pending work, metadata and warm cache isolated',async()=>{
 const old=global.fetch;api.cache.clear();const calls=[];
 try{
  global.fetch=async url=>{
   const params=new URL(url).searchParams;calls.push(url);
   await new Promise(resolve=>setTimeout(resolve,8));
   const q=params.get('q');
   return okXML(rss(rssItem((q.includes('Britain')?'UK ': 'Japan ')+(q.includes('technology')?'Technology update':'Market update'),'https://publisher.example/'+encodeURIComponent(q),new Date().toUTCString())));
  };
  const [uk,ukAgain,japan,japanTech]=await Promise.all([api.load('all','uk'),api.load('all','uk'),api.load('all','japan'),api.load('technology','japan')]);
  assert.equal(calls.length,3);assert.deepEqual(uk,ukAgain);
  for(const [data,edition,category] of [[uk,'uk','all'],[japan,'japan','all'],[japanTech,'japan','technology']]){
   assert.equal(data.edition,edition);assert.equal(data.category,category);assert.equal(data.language,'en');assert.equal(data.freshForMs,600000);
   assert(data.items.every(item=>item.edition===edition&&item.category===category&&item.kind==='headline'));
  }
  assert.notEqual(uk.items[0].link,japan.items[0].link);assert.notEqual(japan.items[0].link,japanTech.items[0].link);
  await api.load('all','uk');assert.equal(calls.length,3);assert.equal(api.pending.size,0);
 }finally{global.fetch=old;api.cache.clear();}
});

test('no-param HTTP requests preserve the US all-headlines default and cache control remains within freshness budget',async()=>{
 const old=global.fetch;api.cache.clear();
 try{
  global.fetch=async()=>okXML(rss(rssItem('Stocks rise','https://publisher.example/us',new Date().toUTCString())));
  const res=response();await api.handler({method:'GET',query:{}},res);
  assert.equal(res.code,200);assert.equal(res.body.edition,'us');assert.equal(res.body.category,'all');assert.equal(res.body.kind,'headlines');
  assert.equal(res.body.retentionHours,48);assert.equal(res.headers['Cache-Control'],'public,max-age=120');
  const saved=api.cache.get('headlines:us:all');saved.fetchedAt=new Date(Date.now()-590000).toISOString();
  const again=response();await api.handler({method:'GET',query:{}},again);assert.match(again.headers['Cache-Control'],/^public,max-age=(?:[0-9]|10)$/);
 }finally{global.fetch=old;api.cache.clear();}
});

test('48-hour headline, seven-day analysis and thirty-day official retention reject expired publications',()=>{
 const now=Date.parse('2026-10-30T12:00:00Z'),at=hours=>new Date(now-hours*HOUR).toISOString();
 const xml=rss(...[1,47,49,167,169,719,721].map(hours=>rssItem('Analysis '+hours,'https://publisher.example/'+hours,at(hours))));
 assert.deepEqual(api.parseFeed(xml,now).map(item=>item.title),['Analysis 1','Analysis 47']);
 assert.deepEqual(api.parseFeed(xml,now,{category:'analysis'}).map(item=>item.title),['Analysis 1','Analysis 47','Analysis 49','Analysis 167']);
 assert.deepEqual(api.parseFeed(xml,now,{official:true}).map(item=>item.title),['Analysis 1','Analysis 47','Analysis 49','Analysis 167','Analysis 169','Analysis 719']);
 assert.deepEqual(api.parseFeed(rss(rssItem('Expired release','https://publisher.example/old',at(721))),now,{official:true}),[]);
});

test('publication dates reject missing, ambiguous, rolled-calendar and future timestamps',()=>{
 const now=Date.parse('2026-10-30T12:00:00Z');
 for(const date of ['', '0', 'Oct 30 2026', '2026-02-30T10:00:00Z','2026-13-01T10:00:00Z','2026-10-30T10:00:00','2026-10-30T99:00:00Z','Fri, 30 Feb 2026 10:00:00 GMT','2026-10-30T12:06:00Z']){
  assert.deepEqual(api.parseFeed(rss(rssItem('Invalid','https://publisher.example/date',date)),now),[],date);
 }
 assert.equal(api.parseFeed(rss(rssItem('Known date','https://publisher.example/date','Fri, 30 Oct 2026 12:00 GMT')),now).length,1);
 assert.equal(api.parseFeed(rss(rssItem('BEA date','https://www.bea.gov/news/date','Thu, 29 Oct 2026 08:30:00 EDT')),now)[0].pubDate,'2026-10-29T12:30:00.000Z');
 assert.equal(api.parseFeed(rss(rssItem('Known date','https://publisher.example/date','2026-10-30T19:00:00+09:00')),now).length,1);
});

test('RDF official feeds preserve source dates and BoJ HTTP upgrades are restricted to configured official hosts',()=>{
 const xml='<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel/><item><title>Canada policy</title><link>https://www.bankofcanada.ca/policy</link><dc:date>2026-10-28T09:47:20+00:00</dc:date></item></rdf:RDF>';
 const row=api.parseFeed(xml,Date.parse('2026-10-30'),{official:true,hosts:['www.bankofcanada.ca']})[0];assert.equal(row.pubDate,'2026-10-28T09:47:20.000Z');
 const boj=rss(rssItem('BoJ policy','http://www.boj.or.jp/en/policy','2026-10-28'));
 assert.equal(api.parseFeed(boj,Date.parse('2026-10-30'),{official:true,hosts:['www.boj.or.jp'],upgradeHTTP:true})[0].link,'https://www.boj.or.jp/en/policy');
 assert.throws(()=>api.parseFeed(boj,Date.parse('2026-10-30'),{official:true,hosts:['www.ecb.europa.eu'],upgradeHTTP:true}));
});

test('fresh and outage cached responses both evict publications crossing their retention cutoff without changing retrieval date',async()=>{
 const old=global.fetch,originalNow=Date.now;api.cache.clear();const now=Date.parse('2026-10-30T12:00:00Z');
 const expired={title:'Expired',link:'https://publisher.example/old',pubDate:new Date(now-49*HOUR).toISOString()};
 const recent={title:'Recent',link:'https://publisher.example/new',pubDate:new Date(now-HOUR).toISOString()};
 try{
  Date.now=()=>now;global.fetch=async()=>{throw Error('offline');};
  for(const age of [1000,700000]){
   const fetchedAt=new Date(now-age).toISOString();api.cache.set('headlines:uk:all',{items:[recent,expired],fetchedAt,sources:[{id:'google',name:'Google News',fetchedAt,status:'fresh'}]});
   const data=await api.load('all','uk');assert.deepEqual(data.items,[recent]);assert.equal(data.fetchedAt,fetchedAt);assert.equal(data.stale,age>600000?true:undefined);assert.equal(data.publishedAt,recent.pubDate);
  }
  const fetchedAt=new Date(now-700000).toISOString();api.cache.set('official-releases:uk:all:boe',{items:[{...expired,pubDate:new Date(now-721*HOUR).toISOString()}],fetchedAt});
  const official=await api.loadOfficialReleases('uk');assert.deepEqual(official.items,[]);assert.equal(official.fetchedAt,fetchedAt);assert.equal(official.sources[0].status,'cached');
 }finally{Date.now=originalNow;global.fetch=old;api.cache.clear();}
});

test('cached headlines expire after one day and official saved-source responses after seven days',async()=>{
 const old=global.fetch;api.cache.clear();const fetchedAt=new Date(Date.now()-8*24*HOUR).toISOString();
 try{
  global.fetch=async()=>{throw Error('offline');};api.cache.set('headlines:japan:all',{items:[],fetchedAt});
  await assert.rejects(api.load('all','japan'));
  api.cache.set('official-releases:japan:all:boj',{items:[],fetchedAt});const official=await api.loadOfficialReleases('japan');assert.equal(official.fetchedAt,null);assert.equal(official.sources[0].status,'unavailable');
 }finally{global.fetch=old;api.cache.clear();}
});

test('official sources match the requested edition and category; unsupported editions never get US substitutes',async()=>{
 const old=global.fetch;api.cache.clear();const calls=[];
 try{
  global.fetch=async url=>{calls.push(url);const host=new URL(url).hostname;return okXML(rss(rssItem('Inflation and economic growth','https://'+host+'/policy',new Date().toUTCString())));};
  const [uk,canada,europe]=await Promise.all([api.loadOfficialReleases('uk','economics'),api.loadOfficialReleases('canada'),api.loadOfficialReleases('europe')]);
  assert.deepEqual(uk.sources.map(source=>source.id),['boe']);assert.equal(uk.category,'economics');assert.equal(uk.items[0].category,'economics');assert.equal(uk.items[0].kind,'official-release');
  assert.deepEqual(canada.sources.map(source=>source.id),['boc']);assert.deepEqual(europe.sources.map(source=>source.id),['ecb']);assert.equal(calls.length,3);
  const africa=await api.loadOfficialReleases('africa');assert.equal(africa.edition,'africa');assert.deepEqual(africa.items,[]);assert.deepEqual(africa.sources,[]);assert.equal(africa.stale,true);assert.match(africa.message,/No configured/);assert.equal(calls.length,3);
 }finally{global.fetch=old;api.cache.clear();}
});

test('analysis is a distinct bounded category and does not relabel a plain breaking headline',async()=>{
 const old=global.fetch;api.cache.clear();
 try{
  const date=new Date(Date.now()-6*24*HOUR).toUTCString();global.fetch=async()=>okXML(rss(rssItem('Markets fall','https://publisher.example/breaking',date),rssItem('UK economic analysis: inflation','https://publisher.example/analysis',date)));
  const data=await api.load('analysis','uk');assert.equal(data.items.length,1);assert.equal(data.items[0].kind,'analysis');assert.equal(data.retentionHours,168);
 }finally{global.fetch=old;api.cache.clear();}
});

test('only explicitly reusable, credited RSS media metadata supplies an image with provenance',()=>{
 const now=Date.parse('2026-10-30'),license='<media:license href="https://creativecommons.org/licenses/by/4.0/"/>';
 const extra='<media:content url="https://images.publisher.example/report.jpg" type="image/jpeg" width="1200" height="800">'+license+'<media:credit>Publisher photographer</media:credit></media:content>';
 const data=api.parseFeed(rss(rssItem('Report','https://publisher.example/report','2026-10-29',extra)),now)[0];
 assert.deepEqual(data.image,{url:'https://images.publisher.example/report.jpg',source:'Publisher',sourceURL:'https://publisher.example/report',credit:'Publisher photographer',origin:'media:content',width:1200,height:800,licenseURL:'https://creativecommons.org/licenses/by/4.0/'});
 assert.equal(data.description,'');
});

test('unlicensed, noncommercial, unsafe, uncredited, HTML-only and non-image media are omitted',()=>{
 const now=Date.parse('2026-10-30'),license='<media:license href="https://creativecommons.org/licenses/by/4.0/"/>',credit='<media:credit>Photographer</media:credit>';
 const cases=[
  '<media:thumbnail url="https://publisher.example/a.jpg"/>',
  '<description><![CDATA[<img src="https://publisher.example/a.jpg">]]></description>',
  '<media:content type="image/jpeg" url="https://publisher.example/a.jpg">'+license+'</media:content>',
  '<media:content type="image/jpeg" url="https://publisher.example/a.jpg"><media:license href="https://creativecommons.org/licenses/by-nc/4.0/"/>'+credit+'</media:content>',
  ...['http://publisher.example/a.jpg','https://127.0.0.1/a.jpg','https://x.local/a.jpg','https://metadata.google.internal/a.jpg','javascript:alert(1)','data:image/jpeg;base64,AAAA'].map(url=>'<media:content type="image/jpeg" url="'+url+'">'+license+credit+'</media:content>'),
  '<media:content type="image/svg+xml" url="https://publisher.example/a.svg">'+license+credit+'</media:content>',
  '<enclosure type="video/mp4" url="https://publisher.example/a.mp4">'+license+credit+'</enclosure>'
 ];
 for(const extra of cases)assert.equal(api.parseFeed(rss(rssItem('Report','https://publisher.example/report','2026-10-29',extra)),now)[0].image,undefined,extra);
});

test('publisher fetches reject arbitrary URLs and request redirect rejection with bounded transport',async()=>{
 const old=global.fetch;let calls=0;
 try{
  global.fetch=async(_url,options)=>{calls++;assert.equal(options.redirect,'error');return okXML('<rss><channel/></rss>');};
  for(const url of ['https://127.0.0.1/feed','https://example.com/feed','https://www.cnbc.com/attacker','https://news.google.com/rss/search?q=arbitrary','https://news.google.com.attacker.example/rss/search'])await assert.rejects(api.fetchXML(url),/Unconfigured/);
  assert.equal(calls,0);await api.fetchXML(api.newsSources('all','uk')[0].url);assert.equal(calls,1);
 }finally{global.fetch=old;}
});

test('regional editions reject generic US/global search matches even when the provider returns them',async()=>{
 const old=global.fetch;api.cache.clear();
 try{
  const date=new Date().toUTCString();global.fetch=async()=>okXML(rss(
   rssItem('Wall Street stocks rally','https://publisher.example/us',date),
   rssItem('ZERO Markets joins Seoul Money Show','https://publisher.example/korea',date),
   rssItem('Brazil economy grows','https://publisher.example/brazil',date),
   rssItem('Mexico central bank cuts rates','https://publisher.example/mexico',date)
  ));
  const data=await api.load('all','latin-america');assert.deepEqual(data.items.map(item=>item.link),['https://publisher.example/brazil','https://publisher.example/mexico']);assert(data.sources.every(source=>source.id==='google'));
 }finally{global.fetch=old;api.cache.clear();}
});

test('UK excludes ambiguous London headlines while country word boundaries exclude Indianapolis from India',async()=>{
 const old=global.fetch;api.cache.clear();
 try{
  const query=new URL(api.newsSources('technology','uk')[0].url).searchParams.get('q');
  assert(!/\bLondon\b/.test(query));assert(query.includes('"United Kingdom"'));assert(query.includes(' OR UK)'));
  const date=new Date().toUTCString();global.fetch=async()=>okXML(rss(
   rssItem('London study explores how AI could help close health care gaps for people experiencing homelessness - CTV News','https://publisher.example/london-ontario',date),
   rssItem('British AI research team based in London announces new technology','https://publisher.example/london-uk',date),
   rssItem('UK technology investment grows','https://publisher.example/uk',date),
   rssItem('Indianapolis technology companies add jobs','https://publisher.example/indianapolis',date),
   rssItem('Indian semiconductor investment expands','https://publisher.example/india',date)
  ));
  const uk=await api.load('technology','uk');
  assert.deepEqual(uk.items.map(item=>item.link),['https://publisher.example/london-uk','https://publisher.example/uk']);
  const india=await api.load('technology','india');
  assert.deepEqual(india.items.map(item=>item.link),['https://publisher.example/india']);
 }finally{global.fetch=old;api.cache.clear();}
});

test('Google technology results require topic evidence and never fill the UK desk with zoo, charity or budget headlines',async()=>{
 const old=global.fetch;api.cache.clear();
 try{
  const date=new Date().toUTCString();global.fetch=async()=>okXML(rss(
   rssItem('UK London Zoo prepares Halloween events','https://publisher.example/zoo',date),
   rssItem('Royal British Legion fundraises for annual appeal','https://publisher.example/charity',date),
   rssItem('UK budget announcements arrive this week','https://publisher.example/budget',date),
   rssItem('UK AI research programme advances machine learning','https://publisher.example/ai',date),
   rssItem('British data centres expand capacity','https://publisher.example/centres',date),
   rssItem('UK data center operator opens new site','https://publisher.example/center',date),
   rssItem('British robotics company unveils new robot','https://publisher.example/robotics',date)
  ));
  const data=await api.load('technology','uk');
  assert.deepEqual(data.items.map(item=>item.link),['https://publisher.example/ai','https://publisher.example/centres','https://publisher.example/center','https://publisher.example/robotics']);
  assert(data.sources.every(source=>source.id==='google'));
 }finally{global.fetch=old;api.cache.clear();}
});

test('every selected category applies the same topic checks to Google results while retaining legitimate company and market reporting',async()=>{
 const old=global.fetch;api.cache.clear();
 const examples={forex:'UK sterling rises',crypto:'UK bitcoin trading expands',stocks:'UK FTSE advances',macro:'UK inflation slows',commodities:'UK gold demand rises',world:'UK international trade grows',finance:'UK bank reports higher quarterly profit',economics:'UK economy grows',technology:'UK semiconductor research advances',politics:'UK parliament debates policy',industries:'UK logistics company expands shipping network',energy:'UK solar capacity increases',analysis:'UK economic analysis: the growth outlook'};
 try{
  const date=new Date().toUTCString();
  for(const [category,title] of Object.entries(examples)){
   global.fetch=async()=>okXML(rss(rssItem('UK London Zoo holds Halloween party','https://publisher.example/unrelated',date),rssItem(title,'https://publisher.example/'+category,date)));
   const data=await api.load(category,'uk');assert.equal(data.items.length,1,category);assert.equal(data.items[0].title,title,category);
  }
 }finally{global.fetch=old;api.cache.clear();}
});
