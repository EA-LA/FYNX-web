const {test}=require('node:test');const assert=require('node:assert/strict');const {parseFeed}=require('./market-feed')._test;
test('RSS removes stale, invalid and duplicate stories and sorts by publication',()=>{
 const now=Date.parse('2026-09-22T16:00:00Z');
 const item=(title,date,url)=>`<item><title>${title}</title><link>${url}</link><pubDate>${date}</pubDate><source>Publisher</source></item>`;
 const xml='<rss><channel>'+item('Recent','2026-09-22T15:00:00Z','https://example.com/a')+item('Old','2025-01-01','https://example.com/old')+item('Bad','invalid','javascript:alert(1)')+item('Recent','2026-09-22T15:00:00Z','https://example.com/a')+'</channel></rss>';
 const result=parseFeed(xml,now);assert.equal(result.length,1);assert.equal(result[0].source,'Publisher');assert.equal(result[0].title,'Recent');
});
