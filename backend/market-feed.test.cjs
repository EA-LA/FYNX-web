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
test('forex excludes Europe substring matches and old publisher dates remain stale',async()=>{
 const api=require('./market-feed')._test,old=global.fetch;api.cache.clear();
 const date=new Date(Date.now()-4*86400000).toUTCString();
 const xml='<rss><channel>'+['Europe imposes trade curbs','Euro falls against dollar'].map((title,i)=>`<item><title>${title}</title><link>https://example.com/${i}</link><pubDate>${date}</pubDate></item>`).join('')+'</channel></rss>';
 try{global.fetch=async url=>{if(url.includes('news.google'))throw Error('offline');return{ok:true,text:async()=>xml};};
 const data=await api.load('forex');assert.equal(data.items.length,1);assert.equal(data.items[0].title,'Euro falls against dollar');assert.equal(data.publishedAt,new Date(date).toISOString());assert.equal(data.stale,true);
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
test('official Atom releases preserve older publications and reject foreign source URLs',()=>{
 const {parseFeed}=require('./market-feed')._test;
 const xml='<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Policy update</title><link rel="alternate" href="https://www.ecb.europa.eu/a"/><updated>2025-01-01T10:00:00Z</updated></entry><entry><title>Injected</title><link href="https://attacker.example/a"/><published>2025-01-01</published></entry></feed>';
 const rows=parseFeed(xml,Date.now(),{official:true,hosts:['www.ecb.europa.eu'],source:'European Central Bank'});
 assert.equal(rows.length,1);assert.equal(rows[0].source,'European Central Bank');assert.equal(rows[0].pubDate,'2025-01-01T10:00:00.000Z');
});
test('nonempty entirely invalid official feeds fail instead of erasing a cache',()=>{
 const options={official:true,hosts:['www.bea.gov'],source:'BEA'};
 assert.throws(()=>parseFeed('<rss><channel><item><title>Bad</title><link>https://attacker.example/a</link><pubDate>2026-10-01</pubDate></item></channel></rss>',Date.now(),options));
 assert.deepEqual(parseFeed('<rss><channel/></rss>',Date.now(),options),[]);
});
test('provider request has a hard deadline even when a transport ignores AbortSignal',async()=>{
 const {fetchXML}=require('./market-feed')._test,old=global.fetch;let aborted=false;
 try{global.fetch=(_url,options)=>{options.signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});};const started=Date.now();await assert.rejects(fetchXML('https://example.com/feed',30),/timed out/);assert(Date.now()-started<500);assert.equal(aborted,true);}
 finally{global.fetch=old;}
});
test('oversized upstream content is rejected before body consumption',async()=>{
 const {fetchXML}=require('./market-feed')._test,old=global.fetch;
 try{global.fetch=async()=>({ok:true,headers:{get:()=>3000000},text:async()=>{throw Error('Must not consume');}});await assert.rejects(fetchXML('https://example.com/feed'),/too large/);}
 finally{global.fetch=old;}
});
test('official partial failures preserve only the failed source cache and label every source',async()=>{
 const api=require('./market-feed')._test,old=global.fetch;api.cache.clear();
 const savedAt=new Date(Date.now()-600000).toISOString(),pubDate=new Date(Date.now()-86400000).toISOString();
 api.cache.set('official-releases:bea',{fetchedAt:savedAt,items:[{title:'Saved GDP',link:'https://www.bea.gov/news/gdp',pubDate,source:'U.S. Bureau of Economic Analysis',sourceId:'bea'}]});
 try{global.fetch=async url=>{if(!url.includes('federalreserve'))throw Error('unavailable');return {ok:true,text:async()=>`<rss><channel><item><title>Policy decision</title><link>https://www.federalreserve.gov/newsevents/pressreleases/test.htm</link><pubDate>${pubDate}</pubDate></item></channel></rss>`};};
 const data=await api.loadOfficialReleases();assert.equal(data.kind,'official-releases');assert.equal(data.items.length,2);assert.deepEqual(data.sources.map(s=>s.status),['fresh','cached','unavailable']);assert.equal(data.sources[1].fetchedAt,savedAt);assert.equal(data.stale,true);}
 finally{global.fetch=old;api.cache.clear();}
});
test('official total outage returns truthful source states with no fabricated releases',async()=>{
 const api=require('./market-feed')._test,old=global.fetch;api.cache.clear();
 try{global.fetch=async()=>{throw Error('offline');};const data=await api.loadOfficialReleases();assert.deepEqual(data.items,[]);assert.equal(data.fetchedAt,null);assert(data.sources.every(source=>source.status==='unavailable'));}
 finally{global.fetch=old;api.cache.clear();}
});
test('concurrent official refreshes share only three upstream requests',async()=>{
 const api=require('./market-feed')._test,old=global.fetch;api.cache.clear();let calls=0;
 try{global.fetch=async()=>{calls++;return{ok:true,text:async()=>'<rss><channel/></rss>'};};await Promise.all([api.loadOfficialReleases(),api.loadOfficialReleases()]);assert.equal(calls,3);assert.equal(api.pending.size,0);}
 finally{global.fetch=old;api.cache.clear();}
});
test('category outage keeps cache timestamps and marks sources cached',async()=>{
 const api=require('./market-feed')._test,old=global.fetch;api.cache.clear();const fetchedAt=new Date(Date.now()-600000).toISOString();
 api.cache.set('all',{items:[],fetchedAt,publishedAt:null,stale:false,sources:[{id:'cnbc',name:'CNBC',fetchedAt,status:'fresh'}]});
 try{global.fetch=async()=>{throw Error('offline');};const data=await api.load('all');assert.equal(data.fetchedAt,fetchedAt);assert.equal(data.stale,true);assert.equal(data.sources[0].status,'cached');}
 finally{global.fetch=old;api.cache.clear();}
});
test('HTTP contract rejects unsupported methods and feed selectors without fetching',async()=>{
 const {handler}=require('./market-feed')._test;const response=()=>({code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;}});
 for(const [method,query,status] of [['POST',{},405],['GET',{kind:'arbitrary'},400],['GET',{category:'__proto__'},400],['OPTIONS',{},204]]){const res=response();await handler({method,query},res);assert.equal(res.code,status);}
});
