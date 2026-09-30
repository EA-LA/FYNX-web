const {test}=require('node:test');const assert=require('node:assert/strict');const {parseFeed}=require('./market-feed')._test;
test('RSS removes stale, invalid and duplicate stories and sorts by publication',()=>{
 const now=Date.parse('2026-09-22T16:00:00Z');
 const item=(title,date,url)=>`<item><title>${title}</title><link>${url}</link><pubDate>${date}</pubDate><source>Publisher</source></item>`;
 const xml='<rss><channel>'+item('Recent','2026-09-22T15:00:00Z','https://example.com/a')+item('Old','2025-01-01','https://example.com/old')+item('Bad','invalid','javascript:alert(1)')+item('Recent','2026-09-22T15:00:00Z','https://example.com/a')+'</channel></rss>';
 const result=parseFeed(xml,now);assert.equal(result.length,1);assert.equal(result[0].source,'Publisher');assert.equal(result[0].title,'Recent');
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
