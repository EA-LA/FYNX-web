const {test}=require('node:test'),assert=require('node:assert/strict');
const {queryFor,parse}=require('./symbol-news')._test;
const {parseVix}=require('./vix-data.cjs');
test('symbol aliases accept chart notation and reject oversized or URL queries',()=>{
 assert.match(queryFor('XAU/USD').query,/gold/);assert.match(queryFor('NASDAQ:NVDA').query,/NVIDIA/);
 assert.throws(()=>queryFor('https://example.com?a=b'));assert.throws(()=>queryFor('x'.repeat(81)));
});
test('publisher parser excludes unsafe links, future and old dates',()=>{
 const item=(title,link,date)=>`<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate></item>`;
 const result=parse('<rss><channel>'+item('Valid','https://example.com',new Date().toUTCString())+item('Unsafe','javascript:alert(1)',new Date().toUTCString())+item('Old','https://example.com','1 Jan 2000')+'</channel></rss>');assert.equal(result.length,1);assert.equal(result[0].title,'Valid');
});
test('VIX parser retains official observation dates and ignores invalid prices',()=>{
 const result=parseVix('DATE,OPEN,HIGH,LOW,CLOSE\n09/21/2026,1,1,1,16.4\n09/22/2026,1,1,1,14.21\n09/23/2026,1,1,1,NaN');
 assert.equal(result.observationDate,'2026-09-22');assert.equal(result.rows.at(-1).close,14.21);assert.throws(()=>parseVix('DATE,OPEN,HIGH,LOW,CLOSE'));
});
